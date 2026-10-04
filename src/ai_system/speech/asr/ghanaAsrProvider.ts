/**
 * Ɔkwankyerɛfo Pa - Ghanaian Neural ASR Adapter (ghanaAsrProvider.ts)
 * 
 * Provides an interface for local neural ASR models
 * (e.g. faster-whisper CTranslate2 runtime on localhost:8765).
 * Connects directly to neuralAsrProvider.
 */

import { AsrTranscriptionResult } from "./offlineAsrEngine";
import { neuralAsrProvider, NeuralAsrHealth } from "./neuralAsrProvider";

export class GhanaAsrProvider {
  public async checkHealth(): Promise<NeuralAsrHealth> {
    return neuralAsrProvider.checkHealth();
  }

  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    languageHint: "auto" | "en" | "tw" = "auto"
  ): Promise<AsrTranscriptionResult> {
    return neuralAsrProvider.transcribe(audioPayload, mimeType, languageHint);
  }
}

export const ghanaAsrProvider = new GhanaAsrProvider();
