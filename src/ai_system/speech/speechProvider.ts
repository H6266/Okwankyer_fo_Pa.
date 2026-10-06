/**
 * Ɔkwankyerɛfo Pa - Pluggable Speech Provider Architecture (speechProvider.ts)
 * 
 * Implements a unified interface for speech synthesis & recognition:
 * - Prototype Phase II: Free open-source local stack (Vosk ASR + Piper TTS).
 * - Final Hackathon Phase: University of Ghana HCI Lab API (Akan Twi & Ghanaian English).
 * 
 * Switching is controlled via a single configuration setting:
 *   SPEECH_PROVIDER="free"     -> Vosk + Piper (local prototype)
 *   SPEECH_PROVIDER="hci_lab"  -> University of Ghana HCI Lab API (final hackathon submission)
 */

import { FreeOpenSourceAsrProvider, FreeSpeechResult, freeOpenSourceAsrProvider } from "./asr/freeOpenSourceProvider";

export type SpeechProviderMode = "free" | "hci_lab" | "hybrid";

export interface SpeechTranscriptionResult {
  text: string;
  confidence: number;
  language: "en" | "tw";
  provider: string;
}

export interface SpeechSynthesisResult {
  audioBuffer: Buffer;
  audioBase64: string;
  audioMime: string;
  provider: string;
}

export interface PluggableAsrProvider {
  name: string;
  checkHealth(): Promise<{ ready: boolean; provider: string; languages?: string[] }>;
  transcribe(audio: Buffer | string, languageHint?: "en" | "tw" | "auto"): Promise<SpeechTranscriptionResult>;
}

export interface PluggableTtsProvider {
  name: string;
  checkHealth(): Promise<{ ready: boolean; provider: string; languages?: string[] }>;
  synthesize(text: string, language?: "en" | "tw", voice?: string): Promise<SpeechSynthesisResult>;
}

// ── 1. University of Ghana HCI Lab ASR Provider ───────────────────────────
export class UniversityHciLabAsrProvider implements PluggableAsrProvider {
  public name = "ug-hci-lab-asr";
  private baseUrl = (process.env.UG_HCI_LAB_URL || "https://api.hci.ug.edu.gh").replace(/\/$/, "");
  private apiKey = process.env.UG_HCI_LAB_API_KEY || "";

  public async checkHealth(): Promise<{ ready: boolean; provider: string; languages: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: AbortSignal.timeout(2000),
      });
      return {
        ready: res.ok,
        provider: "University of Ghana HCI Lab ASR",
        languages: ["en", "tw"],
      };
    } catch {
      return {
        ready: false,
        provider: "University of Ghana HCI Lab ASR (offline/unconfigured)",
        languages: ["en", "tw"],
      };
    }
  }

  public async transcribe(
    audio: Buffer | string,
    languageHint: "en" | "tw" | "auto" = "auto"
  ): Promise<SpeechTranscriptionResult> {
    const payload = Buffer.isBuffer(audio)
      ? audio
      : Buffer.from(audio.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64");

    const res = await fetch(`${this.baseUrl}/api/v1/asr/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        "X-Language": languageHint === "auto" ? "tw" : languageHint,
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: payload,
    });

    if (!res.ok) {
      throw new Error(`UG HCI Lab ASR failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    return {
      text: data.transcript || data.text || "",
      confidence: typeof data.confidence === "number" ? data.confidence : 0.92,
      language: data.language === "tw" ? "tw" : "en",
      provider: "ug-hci-lab-asr",
    };
  }
}

// ── 2. Free Open-Source Piper TTS Provider ────────────────────────────────
export class FreeOpenSourceTtsProvider implements PluggableTtsProvider {
  public name = "piper-offline-tts";
  private baseUrl = process.env.PIPER_TTS_URL || "http://127.0.0.1:8766";

  public async checkHealth(): Promise<{ ready: boolean; provider: string; languages: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = (await res.json()) as any;
        return {
          ready: Boolean(data.ready),
          provider: data.provider || "piper-offline-tts",
          languages: data.languages || ["en"],
        };
      }
    } catch {}
    return { ready: false, provider: "piper-offline-tts", languages: ["en"] };
  }

  public async synthesize(
    text: string,
    language: "en" | "tw" = "en",
    voice?: string
  ): Promise<SpeechSynthesisResult> {
    const res = await fetch(`${this.baseUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language: language === "tw" ? "tw" : "en",
        voice: voice || "en_US-lessac-medium",
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Piper TTS failed: HTTP ${res.status} ${err}`);
    }

    const data = (await res.json()) as any;
    let audioBuffer: Buffer;
    if (data.audio_base64) {
      audioBuffer = Buffer.from(data.audio_base64, "base64");
    } else if (data.audio_hex) {
      audioBuffer = Buffer.from(data.audio_hex, "hex");
    } else {
      throw new Error("Piper TTS response missing audio payload");
    }

    return {
      audioBuffer,
      audioBase64: audioBuffer.toString("base64"),
      audioMime: data.audio_mime || "audio/wav",
      provider: "piper-offline-tts",
    };
  }
}

// ── 3. University of Ghana HCI Lab TTS Provider ───────────────────────────
export class UniversityHciLabTtsProvider implements PluggableTtsProvider {
  public name = "ug-hci-lab-tts";
  private baseUrl = (process.env.UG_HCI_LAB_URL || "https://api.hci.ug.edu.gh").replace(/\/$/, "");
  private apiKey = process.env.UG_HCI_LAB_API_KEY || "";

  public async checkHealth(): Promise<{ ready: boolean; provider: string; languages: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        signal: AbortSignal.timeout(2000),
      });
      return {
        ready: res.ok,
        provider: "University of Ghana HCI Lab TTS",
        languages: ["tw", "en"],
      };
    } catch {
      return {
        ready: false,
        provider: "University of Ghana HCI Lab TTS (offline/unconfigured)",
        languages: ["tw", "en"],
      };
    }
  }

  public async synthesize(
    text: string,
    language: "en" | "tw" = "tw",
    voice?: string
  ): Promise<SpeechSynthesisResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/tts/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        text,
        language: language === "tw" ? "tw" : "en",
        dialect: "asante-twi",
        voice: voice || "ghanaian-warm",
      }),
    });

    if (!res.ok) {
      throw new Error(`UG HCI Lab TTS failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const b64 = data.audio_base64 || data.audioBase64 || "";
    const buf = Buffer.from(b64, "base64");

    return {
      audioBuffer: buf,
      audioBase64: b64,
      audioMime: data.audio_mime || data.mimeType || "audio/wav",
      provider: "ug-hci-lab-tts",
    };
  }
}

// ── 4. Pluggable Registry & Provider Switcher ─────────────────────────────
export const freeAsrProvider = freeOpenSourceAsrProvider;
export const ugHciLabAsrProvider = new UniversityHciLabAsrProvider();

export const freeTtsProvider = new FreeOpenSourceTtsProvider();
export const ugHciLabTtsProvider = new UniversityHciLabTtsProvider();

export function getSpeechProviderMode(): SpeechProviderMode {
  const mode = (process.env.SPEECH_PROVIDER || "free").toLowerCase().trim();
  if (mode === "hci_lab" || mode === "ug_hci_lab") return "hci_lab";
  if (mode === "hybrid") return "hybrid";
  return "free";
}

export function getActiveAsrProvider(languageHint?: "en" | "tw" | "auto"): PluggableAsrProvider {
  const mode = getSpeechProviderMode();
  if (mode === "hci_lab") {
    return ugHciLabAsrProvider;
  }
  if (mode === "hybrid" && languageHint === "tw") {
    return ugHciLabAsrProvider;
  }
  return {
    name: "vosk-offline-asr",
    checkHealth: () => freeAsrProvider.checkHealth(),
    transcribe: (audio, lang) => freeAsrProvider.transcribe(audio, lang === "tw" ? "tw" : "en"),
  };
}

export function getActiveTtsProvider(languageHint?: "en" | "tw"): PluggableTtsProvider {
  const mode = getSpeechProviderMode();
  if (mode === "hci_lab") {
    return ugHciLabTtsProvider;
  }
  if (mode === "hybrid" && languageHint === "tw") {
    return ugHciLabTtsProvider;
  }
  return freeTtsProvider;
}
