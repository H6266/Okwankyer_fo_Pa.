/**
 * Ɔkwankyerɛfo Pa - In-Memory Repository Adapters (inMemoryRepositories.ts)
 * Fast, thread-safe in-memory implementations for unit tests and local dev.
 */

import {
  CachedSessionRecord,
  IConversationRepository,
  IPreferenceRepository,
  IPronunciationRepository,
  ISemanticMemoryRepository,
  ISessionRepository,
  ITransactionRepository,
  VectorRecord,
} from "./repositoryInterfaces";
import { ConversationTurnRecord, TransactionalMemoryRecord, UserProfileData } from "../core/aiTypes";

export class InMemorySessionRepository implements ISessionRepository {
  private store = new Map<string, CachedSessionRecord>();

  public async get(sessionId: string): Promise<CachedSessionRecord | null> {
    return this.store.get(sessionId) || null;
  }

  public async save(session: CachedSessionRecord): Promise<void> {
    this.store.set(session.sessionId, { ...session });
  }

  public async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  public async listActive(maxAgeMs: number = 30 * 60 * 1000): Promise<CachedSessionRecord[]> {
    const now = Date.now();
    return Array.from(this.store.values()).filter(s => (now - s.lastActiveTimestamp) <= maxAgeMs);
  }
}

export class InMemoryConversationRepository implements IConversationRepository {
  private store = new Map<string, ConversationTurnRecord[]>();

  public async append(sessionId: string, turn: ConversationTurnRecord): Promise<void> {
    let list = this.store.get(sessionId);
    if (!list) {
      list = [];
      this.store.set(sessionId, list);
    }
    list.push(turn);
  }

  public async getHistory(sessionId: string): Promise<ConversationTurnRecord[]> {
    return [...(this.store.get(sessionId) || [])];
  }

  public async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}

export class InMemoryPreferenceRepository implements IPreferenceRepository {
  private store = new Map<string, UserProfileData>();

  public async get(userId: string): Promise<UserProfileData | null> {
    return this.store.get(userId) || null;
  }

  public async save(userId: string, profile: UserProfileData): Promise<void> {
    const existing = this.store.get(userId) || {};
    this.store.set(userId, { ...existing, ...profile });
  }
}

export class InMemoryTransactionRepository implements ITransactionRepository {
  private ledger = new Map<string, TransactionalMemoryRecord[]>();

  public async record(sessionId: string, record: TransactionalMemoryRecord): Promise<void> {
    let list = this.ledger.get(sessionId);
    if (!list) {
      list = [];
      this.ledger.set(sessionId, list);
    }
    list.push(record);
  }

  public async get(referenceId: string): Promise<TransactionalMemoryRecord | null> {
    for (const list of this.ledger.values()) {
      const match = list.find(r => r.referenceId === referenceId);
      if (match) return match;
    }
    return null;
  }

  public async list(sessionId: string): Promise<TransactionalMemoryRecord[]> {
    return [...(this.ledger.get(sessionId) || [])];
  }
}

export class InMemoryPronunciationRepository implements IPronunciationRepository {
  private userStore = new Map<string, Map<string, string>>();
  private globalStore = new Map<string, string>();

  constructor() {
    this.globalStore.set("kwame", "Kwah-meh");
    this.globalStore.set("kofi", "Koh-fee");
    this.globalStore.set("ama", "Ah-mah");
    this.globalStore.set("yaw", "Yow");
    this.globalStore.set("nyamebere", "Nyah-meh-beh-reh");
    this.globalStore.set("anidasoɔ", "Ah-nee-dah-soo-aw");
    this.globalStore.set("ɔkwankyerɛfo", "Aw-kwan-cheh-reh-foh");
  }

  public async get(userId: string | undefined, word: string): Promise<string | null> {
    const lower = word.toLowerCase().trim();
    if (userId && this.userStore.has(userId)) {
      const userVal = this.userStore.get(userId)?.get(lower);
      if (userVal) return userVal;
    }
    return this.globalStore.get(lower) || null;
  }

  public async set(userId: string, word: string, phonetic: string): Promise<void> {
    let dict = this.userStore.get(userId);
    if (!dict) {
      dict = new Map<string, string>();
      this.userStore.set(userId, dict);
    }
    dict.set(word.toLowerCase().trim(), phonetic.trim());
  }
}

export class InMemorySemanticMemoryRepository implements ISemanticMemoryRepository {
  private vectors = new Map<string, VectorRecord[]>();

  public async storeVector(record: VectorRecord): Promise<void> {
    let list = this.vectors.get(record.sessionId);
    if (!list) {
      list = [];
      this.vectors.set(record.sessionId, list);
    }
    list.push(record);
  }

  public async searchSimilar(sessionId: string, queryEmbedding: number[], topK: number = 3): Promise<VectorRecord[]> {
    const list = this.vectors.get(sessionId) || [];
    if (list.length === 0 || queryEmbedding.length === 0) return [];

    const scored = list.map(rec => ({
      record: rec,
      similarity: this.cosineSimilarity(queryEmbedding, rec.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).map(s => s.record);
  }

  public async clear(sessionId: string): Promise<void> {
    this.vectors.delete(sessionId);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
