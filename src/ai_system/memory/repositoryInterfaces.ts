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

export type UserMemoryStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export interface GoalProgressRecord {
  id: string;
  summary: string;
  source: "USER_EXPLICIT" | "USER_CONFIRMED";
  createdAt: number;
}

interface UserMemoryBase {
  id: string;
  userId: string;
  source: "USER_EXPLICIT" | "USER_CONFIRMED";
  confidence: number;
  status: UserMemoryStatus;
  priority: number;
  deadline?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  embedding?: number[];
  embeddingSource?: "GEMINI_EMBEDDING" | "LEXICAL_FALLBACK";
  embeddingUpdatedAt?: number;
}

export interface UserGoalRecord extends UserMemoryBase {
  type: "USER_GOAL";
  goal: string;
  progress: GoalProgressRecord[];
}

export interface UserNeedRecord extends UserMemoryBase {
  type: "USER_NEED";
  need: string;
  relatedGoalId?: string;
}

export type UserMemoryRecord = UserGoalRecord | UserNeedRecord;

export interface IUserMemoryRepository {
  list(userId: string): Promise<UserMemoryRecord[]>;
  save(userId: string, records: UserMemoryRecord[]): Promise<void>;
  clear(userId: string): Promise<void>;
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
