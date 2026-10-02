/**
 * Ɔkwankyerɛfo Pa - Interruption & Voice Activity Control
 * Handles instant caller barge-in, aborts active TTS playback, and triggers re-processing.
 */

export interface InterruptionEvent {
  sessionId: string;
  interruptedAtMs: number;
  promptAbortedText: string;
  newSpokenInput: string;
}

export class InterruptionEngine {
  private activeStreams = new Map<string, { abortController: AbortController; promptText: string }>();

  public registerSpeechPlayback(sessionId: string, promptText: string): AbortController {
    const controller = new AbortController();
    this.activeStreams.set(sessionId, { abortController: controller, promptText });
    return controller;
  }

  public handleBargeIn(sessionId: string, newSpokenInput: string): InterruptionEvent | null {
    const active = this.activeStreams.get(sessionId);
    if (active) {
      active.abortController.abort();
      this.activeStreams.delete(sessionId);

      return {
        sessionId,
        interruptedAtMs: Date.now(),
        promptAbortedText: active.promptText,
        newSpokenInput,
      };
    }
    return null;
  }

  public completePlayback(sessionId: string): void {
    this.activeStreams.delete(sessionId);
  }
}

export const interruptionEngine = new InterruptionEngine();
