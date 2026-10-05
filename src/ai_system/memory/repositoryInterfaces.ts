/**
 * Ɔkwankyerɛfo Pa - Durable Memory Repository Interfaces (repositoryInterfaces.ts)
 * Abstract repository contracts decoupling AI business logic from underlying storage.
 */

import {
  ConversationTurnRecord,
  EntitySlotMap,
  TaskState,
  TransactionalMemoryRecord,
  UserProfileData,
} from "../core/aiTypes";

export interface CachedSessionRecord {
  sessionId: string;
  userId?: string;
  phoneNumber?: string;
  language: string;
  currentScreen: string;
  currentStep: string;
  slots: EntitySlotMap;
  lastActiveTimestamp: number;
  interruptedTask?: TaskState;
  turnCount: number;
  encryptedPayload?: string;
}

export interface ISessionRepository {
  get(sessionId: string): Promise<CachedSessionRecord | null>;
  save(session: CachedSessionRecord): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listActive(maxAgeMs?: number): Promise<CachedSessionRecord[]>;
}

export interface IConversationRepository {
  append(sessionId: string, turn: ConversationTurnRecord): Promise<void>;
  getHistory(sessionId: string): Promise<ConversationTurnRecord[]>;
  clear(sessionId: string): Promise<void>;
}

export interface IPreferenceRepository {
  get(userId: string): Promise<UserProfileData | null>;
  save(userId: string, profile: UserProfileData): Promise<void>;
}

export interface ITransactionRepository {
  record(sessionId: string, record: TransactionalMemoryRecord): Promise<void>;
  get(referenceId: string): Promise<TransactionalMemoryRecord | null>;
  list(sessionId: string): Promise<TransactionalMemoryRecord[]>;
  clear(sessionId: string): Promise<void>;
}

export interface IPronunciationRepository {
  get(userId: string | undefined, word: string): Promise<string | null>;
  set(userId: string, word: string, phonetic: string): Promise<void>;
}

export interface VectorRecord {
  id: string;
  sessionId: string;
  turnIndex: number;
  text: string;
  embedding: number[];
  timestamp: number;
}

export interface ISemanticMemoryRepository {
  storeVector(record: VectorRecord): Promise<void>;
  searchSimilar(sessionId: string, queryEmbedding: number[], topK?: number): Promise<VectorRecord[]>;
  clear(sessionId: string): Promise<void>;
}

export interface ITaskStateRepository {
  get(sessionId: string): TaskState[];
  set(sessionId: string, tasks: TaskState[]): void;
  delete(sessionId: string): void;
}
