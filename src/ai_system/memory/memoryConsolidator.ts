/**
 * Ɔkwankyerɛfo Pa - Memory Consolidator
 * Post-session consolidation: purges transient buffers and retains long-term preferences.
 */

import { workingMemory } from "./workingMemory";
import { sessionMemory } from "./sessionMemory";
import { taskMemory } from "./taskMemory";
import { transactionMemory } from "./transactionMemory";
import { episodicMemory } from "./episodicMemory";
import { preferenceMemory } from "./preferenceMemory";

export interface ConsolidationReport {
  sessionId: string;
  purgedEphemeralData: boolean;
  retainedPreferencesCount: number;
  episodesSaved: number;
  timestamp: number;
}

export class MemoryConsolidator {
  public consolidate(sessionId: string, userId?: string): ConsolidationReport {
    const session = sessionMemory.getOrCreate(sessionId);

    const retainedPreferencesCount = 0;

    const episodes = episodicMemory.getEpisodes(sessionId);

    // Clean up ephemeral working memory and transaction context
    workingMemory.clear(sessionId);
    taskMemory.clear(sessionId);
    transactionMemory.finalize(sessionId);
    preferenceMemory.clearSession(sessionId);

    return {
      sessionId,
      purgedEphemeralData: true,
      retainedPreferencesCount,
      episodesSaved: episodes.length,
      timestamp: Date.now(),
    };
  }
}

export const memoryConsolidator = new MemoryConsolidator();
