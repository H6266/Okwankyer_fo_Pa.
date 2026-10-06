/**
 * Ɔkwankyerɛfo Pa - Free Open-Source ASR Provider (Vosk Offline Engine)
 * 
 * Communicates with the local Vosk ASR FastAPI server (default http://127.0.0.1:8765).
 * Pluggable for hackathon prototype, swappable with University of Ghana HCI Lab ASR.
 */

export interface FreeSpeechResult {
  text: string;
  confidence: number;
  language: "en" | "tw";
  provider: string;
}

export class FreeOpenSourceAsrProvider {
  private baseUrl = process.env.VOSK_ASR_URL || "http://127.0.0.1:8765";

  public async checkHealth(): Promise<{ ready: boolean; provider: string; languages: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json() as any;
        return {
          ready: Boolean(data.ready),
          provider: data.provider || "vosk-offline-asr",
          languages: data.languages || ["en"],
        };
      }
    } catch {
      // offline
    }
    return { ready: false, provider: "vosk-offline-asr", languages: ["en"] };
  }

  public async transcribe(
    audioBuffer: Buffer | string,
    languageHint: "en" | "tw" = "en"
  ): Promise<FreeSpeechResult> {
    const payload = Buffer.isBuffer(audioBuffer)
      ? audioBuffer
      : Buffer.from(audioBuffer.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64");

    const res = await fetch(`${this.baseUrl}/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/wav",
        "X-Language-Hint": languageHint,
      },
      body: payload,
    });

    if (!res.ok) {
      throw new Error(`ASR failed: ${res.status}`);
    }

    const data = await res.json() as any;
    return {
      text: data.text || "",
      confidence: typeof data.confidence === "number" ? data.confidence : (data.text ? 0.85 : 0.0),
      language: data.language === "tw" ? "tw" : "en",
      provider: "vosk-offline-asr",
    };
  }
}

export const freeOpenSourceAsrProvider = new FreeOpenSourceAsrProvider();
