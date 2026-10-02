/**
 * Ɔkwankyerɛfo Pa - Episodic Memory
 * Selectively records key interaction milestones: cancellations, corrections, repeated prompts.
 */

export type EpisodeType =
  | "TRANSACTION_CANCELLED"
  | "RECIPIENT_CORRECTED"
  | "AMOUNT_CORRECTED"
  | "LANGUAGE_CHANGED"
  | "PROMPT_REPEATED"
  | "REPEATED_MISUNDERSTANDING"
  | "TRANSACTION_COMPLETED"
  | "ZERO_PIN_BLOCKED";

export interface EpisodeEvent {
  episodeId: string;
  type: EpisodeType;
  details: string;
  step: string;
  timestamp: number;
}

export class EpisodicMemory {
  private episodes = new Map<string, EpisodeEvent[]>();

  public record(sessionId: string, type: EpisodeType, details: string, step: string): EpisodeEvent {
    const list = this.episodes.get(sessionId) || [];
    const event: EpisodeEvent = {
      episodeId: `ep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      details,
      step,
      timestamp: Date.now(),
    };
    list.push(event);
    this.episodes.set(sessionId, list);
    return event;
  }

  public getEpisodes(sessionId: string): EpisodeEvent[] {
    return this.episodes.get(sessionId) || [];
  }

  public countRepeatedMisunderstandings(sessionId: string): number {
    const list = this.episodes.get(sessionId) || [];
    return list.filter((e) => e.type === "REPEATED_MISUNDERSTANDING" || e.type === "PROMPT_REPEATED").length;
  }

  public clear(sessionId: string): void {
    this.episodes.delete(sessionId);
  }
}

export const episodicMemory = new EpisodicMemory();
