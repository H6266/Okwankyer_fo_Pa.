/**
 * Ɔkwankyerɛfo Pa - Central Memory Manager
 * Unified coordinator across all cognitive memory subsystems.
 */

export * from "./memoryPolicy";
export * from "./workingMemory";
export * from "./sessionMemory";
export * from "./conversationMemory";
export * from "./taskMemory";
export * from "./episodicMemory";
export * from "./semanticMemory";
export * from "./preferenceMemory";
export * from "./pronunciationMemory";
export * from "./transactionMemory";
export * from "./memoryRetriever";
export * from "./memoryConsolidator";

import { workingMemory } from "./workingMemory";
import { sessionMemory } from "./sessionMemory";
import { conversationMemory } from "./conversationMemory";
import { taskMemory } from "./taskMemory";
import { episodicMemory } from "./episodicMemory";
import { semanticMemory } from "./semanticMemory";
import { preferenceMemory } from "./preferenceMemory";
import { pronunciationMemory } from "./pronunciationMemory";
import { transactionMemory } from "./transactionMemory";
import { memoryRetriever } from "./memoryRetriever";
import { memoryConsolidator } from "./memoryConsolidator";
import { memoryPolicy } from "./memoryPolicy";

export class MemoryManager {
  public readonly working = workingMemory;
  public readonly session = sessionMemory;
  public readonly conversation = conversationMemory;
  public readonly task = taskMemory;
  public readonly episodic = episodicMemory;
  public readonly semantic = semanticMemory;
  public readonly preference = preferenceMemory;
  public readonly pronunciation = pronunciationMemory;
  public readonly transaction = transactionMemory;
  public readonly retriever = memoryRetriever;
  public readonly consolidator = memoryConsolidator;
  public readonly policy = memoryPolicy;
}

export const memoryManager = new MemoryManager();
