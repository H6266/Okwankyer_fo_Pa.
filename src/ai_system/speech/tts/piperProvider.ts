import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";

export interface PiperHealth {
  ready: boolean;
  provider: string;
  model: string;
  languages: string[];
  details: string;
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().split(/[-_]/)[0];
  if (["tw", "ak", "akan"].includes(normalized)) return "twi";
  return normalized;
}

export class PiperTtsProvider implements TTSProvider {
  private getBaseUrl(): string {
    return (process.env.PIPER_TTS_URL || "http://127.0.0.1:8766").replace(/\/$/, "");
  }

  private getModel(): string {
    return process.env.PIPER_MODEL || "en_US-lessac-medium";
  }

  private getAuthHeaders(): Record<string, string> {
    const token = process.env.PIPER_TTS_TOKEN;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  public async checkHealth(language = "en"): Promise<PiperHealth> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${this.getBaseUrl()}/health`, {
        headers: this.getAuthHeaders(),
        signal: controller.signal,
      });
      const data = await response.json() as Partial<PiperHealth>;
      const requestedLanguage = normalizeLanguage(language);
      const languages = Array.isArray(data.languages) ? data.languages : [];
      const ready = response.ok
        && data.ready === true
        && data.model === this.getModel()
        && languages.some((item) => normalizeLanguage(item) === requestedLanguage);
      return {
        ready,
        provider: typeof data.provider === "string" ? data.provider : "piper-cli",
        model: typeof data.model === "string" ? data.model : "",
        languages,
        details: ready
          ? data.details || "Piper voice is available."
          : data.details || `Piper voice is unavailable for ${language}.`,
      };
    } catch (error) {
      return {
        ready: false,
        provider: "piper-cli",
        model: this.getModel(),
        languages: [],
        details: error instanceof Error ? error.message : "Piper health check failed.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const requestedLanguage = normalizeLanguage(String(request.language || ""));
    const health = await this.checkHealth(requestedLanguage);
    if (!health.ready) {
      throw new Error(`PIPER_UNAVAILABLE: ${health.details}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PIPER_TTS_TIMEOUT_MS || 20_000));
    try {
      const response = await fetch(`${this.getBaseUrl()}/synthesize`, {
        method: "POST",
        headers: {
          ...this.getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: request.text,
          language: requestedLanguage,
          model: health.model,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`PIPER_SYNTHESIS_FAILED: worker returned HTTP ${response.status}.`);
      }

      const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const returnedModel = response.headers.get("x-piper-model");
      const returnedLanguage = normalizeLanguage(response.headers.get("x-piper-language") || "");
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const validWav = audioBuffer.length >= 44
        && audioBuffer.toString("ascii", 0, 4) === "RIFF"
        && audioBuffer.toString("ascii", 8, 12) === "WAVE"
        && audioBuffer.readUInt32LE(4) + 8 <= audioBuffer.length;
      if (mimeType !== "audio/wav" || !validWav || returnedModel !== health.model || returnedLanguage !== requestedLanguage) {
        throw new Error("PIPER_INVALID_RESPONSE: model, language, MIME type, or WAV container did not match the request.");
      }

      return {
        audioBuffer,
        audioBase64: audioBuffer.toString("base64"),
        audioMimeType: mimeType,
        mimeType,
        durationEstimateSec: Math.max(1, Math.round(audioBuffer.length / 32000)),
        providerUsed: `piper-cli:${health.model}`,
        language: requestedLanguage,
        model: health.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const piperTtsProvider = new PiperTtsProvider();
export const piperProvider = piperTtsProvider;
