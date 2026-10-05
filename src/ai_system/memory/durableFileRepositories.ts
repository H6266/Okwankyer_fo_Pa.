/**
 * Ɔkwankyerɛfo Pa - Durable File Repository Adapters (durableFileRepositories.ts)
 * Persists sessions, conversations, preferences, and transactions durably to disk.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  CachedSessionRecord,
  IConversationRepository,
  IPreferenceRepository,
  IPronunciationRepository,
  ISemanticMemoryRepository,
  ISessionRepository,
  ITransactionRepository,
  ITaskStateRepository,
  VectorRecord,
} from "./repositoryInterfaces";
import { ConversationTurnRecord, TaskState, TransactionalMemoryRecord, UserProfileData } from "../core/aiTypes";
import { fieldEncryption } from "../security/fieldEncryption";

const DATA_DIR = path.join(process.cwd(), ".data");
const MAX_CONVERSATION_TURNS = 5000;
const MAX_SEMANTIC_RECORDS_PER_SESSION = 5000;

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function storageKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function atomicWrite(file: string, contents: string): void {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  const encrypted = `enc:v1:${fieldEncryption.encrypt(contents)}`;
  try {
    fs.writeFileSync(temporary, encrypted, { encoding: "utf-8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  const stored = fs.readFileSync(file, "utf-8");
  if (stored.startsWith("enc:v1:")) {
    return JSON.parse(fieldEncryption.decrypt(stored.slice("enc:v1:".length))) as T;
  }
  const parsed = JSON.parse(stored) as T;
  // Migrate legacy plaintext records the next time they are accessed.
  atomicWrite(file, JSON.stringify(parsed));
  return parsed;
}

export class DurableFileSessionRepository implements ISessionRepository {
  private baseDir = path.join(DATA_DIR, "sessions");

  constructor() {
    ensureDirectoryExists(this.baseDir);
  }

  public async get(sessionId: string): Promise<CachedSessionRecord | null> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (!fs.existsSync(file)) return null;
    return readJson<CachedSessionRecord | null>(file, null);
  }

  public async save(session: CachedSessionRecord): Promise<void> {
    const file = path.join(this.baseDir, `${storageKey(session.sessionId)}.json`);
    atomicWrite(file, JSON.stringify(session));
  }

  public async delete(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  public async listActive(maxAgeMs: number = 30 * 60 * 1000): Promise<CachedSessionRecord[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    const files = fs.readdirSync(this.baseDir);
    const results: CachedSessionRecord[] = [];
    const now = Date.now();

    for (const f of files) {
      if (f.endsWith(".json")) {
        const s = readJson<CachedSessionRecord | null>(path.join(this.baseDir, f), null);
        if (!s) continue;
        if (now - s.lastActiveTimestamp <= maxAgeMs) results.push(s);
      }
    }
    return results;
  }
}

export class DurableFileConversationRepository implements IConversationRepository {
  private baseDir = path.join(DATA_DIR, "conversations");

  constructor() {
    ensureDirectoryExists(this.baseDir);
  }

  public async append(sessionId: string, turn: ConversationTurnRecord): Promise<void> {
    const history = await this.getHistory(sessionId);
    history.push(turn);
    if (history.length > MAX_CONVERSATION_TURNS) history.splice(0, history.length - MAX_CONVERSATION_TURNS);
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    atomicWrite(file, JSON.stringify(history));
  }

  public async getHistory(sessionId: string): Promise<ConversationTurnRecord[]> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (!fs.existsSync(file)) return [];
    return readJson<ConversationTurnRecord[]>(file, []);
  }

  public async clear(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export class DurableFilePreferenceRepository implements IPreferenceRepository {
  private baseDir = path.join(DATA_DIR, "preferences");

  constructor() {
    ensureDirectoryExists(this.baseDir);
  }

  public async get(userId: string): Promise<UserProfileData | null> {
    const file = path.join(this.baseDir, `${storageKey(userId)}.json`);
    if (!fs.existsSync(file)) return null;
    return readJson<UserProfileData | null>(file, null);
  }

  public async save(userId: string, profile: UserProfileData): Promise<void> {
    const existing = (await this.get(userId)) || {};
    const file = path.join(this.baseDir, `${storageKey(userId)}.json`);
    atomicWrite(file, JSON.stringify({ ...existing, ...profile }));
  }
}

export class DurableFileTransactionRepository implements ITransactionRepository {
  private baseDir = path.join(DATA_DIR, "transactions");

  constructor() {
    ensureDirectoryExists(this.baseDir);
  }

  public async record(sessionId: string, record: TransactionalMemoryRecord): Promise<void> {
    const list = await this.list(sessionId);
    list.push(record);
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    atomicWrite(file, JSON.stringify(list));
  }

  public async get(referenceId: string): Promise<TransactionalMemoryRecord | null> {
    if (!fs.existsSync(this.baseDir)) return null;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const list = readJson<TransactionalMemoryRecord[]>(path.join(this.baseDir, f), []);
        const match = list.find(r => r.referenceId === referenceId);
        if (match) return match;
      }
    }
    return null;
  }

  public async list(sessionId: string): Promise<TransactionalMemoryRecord[]> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (!fs.existsSync(file)) return [];
    return readJson<TransactionalMemoryRecord[]>(file, []);
  }

  public async clear(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export class DurableFilePronunciationRepository implements IPronunciationRepository {
  private baseDir = path.join(DATA_DIR, "pronunciation");

  constructor() { ensureDirectoryExists(this.baseDir); }

  public async get(userId: string | undefined, word: string): Promise<string | null> {
    const records = await this.read(userId);
    return records[word.toLowerCase().trim()] || null;
  }

  public async set(userId: string, word: string, phonetic: string): Promise<void> {
    const records = await this.read(userId);
    records[word.toLowerCase().trim()] = phonetic.trim();
    atomicWrite(path.join(this.baseDir, `${storageKey(userId)}.json`), JSON.stringify(records));
  }

  private async read(userId: string | undefined): Promise<Record<string, string>> {
    if (!userId) return {};
    const file = path.join(this.baseDir, `${storageKey(userId)}.json`);
    if (!fs.existsSync(file)) return {};
    return readJson<Record<string, string>>(file, {});
  }
}

export class DurableFileSemanticMemoryRepository implements ISemanticMemoryRepository {
  private baseDir = path.join(DATA_DIR, "semantic-memory");

  constructor() { ensureDirectoryExists(this.baseDir); }

  public async storeVector(record: VectorRecord): Promise<void> {
    if (!record.embedding.length || record.embedding.length > 8192 || record.embedding.some((value) => !Number.isFinite(value))) {
      throw new Error("Invalid semantic embedding record.");
    }
    const records = await this.read(record.sessionId);
    const existingIndex = records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) records[existingIndex] = record;
    else records.push(record);
    if (records.length > MAX_SEMANTIC_RECORDS_PER_SESSION) records.splice(0, records.length - MAX_SEMANTIC_RECORDS_PER_SESSION);
    atomicWrite(path.join(this.baseDir, `${storageKey(record.sessionId)}.json`), JSON.stringify(records));
  }

  public async searchSimilar(sessionId: string, queryEmbedding: number[], topK: number = 3): Promise<VectorRecord[]> {
    if (!Number.isInteger(topK) || topK <= 0) return [];
    const records = await this.read(sessionId);
    return records
      .map((record) => ({ record, similarity: this.cosineSimilarity(queryEmbedding, record.embedding) }))
      .filter(({ similarity }) => similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(topK, 20))
      .map(({ record }) => record);
  }

  public async clear(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private async read(sessionId: string): Promise<VectorRecord[]> {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (!fs.existsSync(file)) return [];
    return readJson<VectorRecord[]>(file, []);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }
}

export class DurableFileTaskStateRepository implements ITaskStateRepository {
  private baseDir = path.join(DATA_DIR, "tasks");
  constructor() { ensureDirectoryExists(this.baseDir); }

  public get(sessionId: string): TaskState[] {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (!fs.existsSync(file)) return [];
    return readJson<TaskState[]>(file, []);
  }

  public set(sessionId: string, tasks: TaskState[]): void {
    atomicWrite(path.join(this.baseDir, `${storageKey(sessionId)}.json`), JSON.stringify(tasks));
  }

  public delete(sessionId: string): void {
    const file = path.join(this.baseDir, `${storageKey(sessionId)}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
