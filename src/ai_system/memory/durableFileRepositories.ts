/**
 * Ɔkwankyerɛfo Pa - Durable File Repository Adapters (durableFileRepositories.ts)
 * Persists sessions, conversations, preferences, and transactions durably to disk.
 */

import fs from "fs";
import path from "path";
import {
  CachedSessionRecord,
  IConversationRepository,
  IPreferenceRepository,
  ISessionRepository,
  ITransactionRepository,
} from "./repositoryInterfaces";
import { ConversationTurnRecord, TransactionalMemoryRecord, UserProfileData } from "../core/aiTypes";

const DATA_DIR = path.join(process.cwd(), ".data");

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export class DurableFileSessionRepository implements ISessionRepository {
  private baseDir = path.join(DATA_DIR, "sessions");

  constructor() {
    ensureDirectoryExists(this.baseDir);
  }

  public async get(sessionId: string): Promise<CachedSessionRecord | null> {
    const file = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) as CachedSessionRecord;
    } catch {
      return null;
    }
  }

  public async save(session: CachedSessionRecord): Promise<void> {
    const file = path.join(this.baseDir, `${session.sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf-8");
  }

  public async delete(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${sessionId}.json`);
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
        try {
          const content = fs.readFileSync(path.join(this.baseDir, f), "utf-8");
          const s = JSON.parse(content) as CachedSessionRecord;
          if (now - s.lastActiveTimestamp <= maxAgeMs) {
            results.push(s);
          }
        } catch {
          // ignore corrupted
        }
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
    const file = path.join(this.baseDir, `${sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify(history, null, 2), "utf-8");
  }

  public async getHistory(sessionId: string): Promise<ConversationTurnRecord[]> {
    const file = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(file)) return [];
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) as ConversationTurnRecord[];
    } catch {
      return [];
    }
  }

  public async clear(sessionId: string): Promise<void> {
    const file = path.join(this.baseDir, `${sessionId}.json`);
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
    const file = path.join(this.baseDir, `${userId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) as UserProfileData;
    } catch {
      return null;
    }
  }

  public async save(userId: string, profile: UserProfileData): Promise<void> {
    const existing = (await this.get(userId)) || {};
    const file = path.join(this.baseDir, `${userId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...existing, ...profile }, null, 2), "utf-8");
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
    const file = path.join(this.baseDir, `${sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf-8");
  }

  public async get(referenceId: string): Promise<TransactionalMemoryRecord | null> {
    if (!fs.existsSync(this.baseDir)) return null;
    const files = fs.readdirSync(this.baseDir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        try {
          const content = fs.readFileSync(path.join(this.baseDir, f), "utf-8");
          const list = JSON.parse(content) as TransactionalMemoryRecord[];
          const match = list.find(r => r.referenceId === referenceId);
          if (match) return match;
        } catch {}
      }
    }
    return null;
  }

  public async list(sessionId: string): Promise<TransactionalMemoryRecord[]> {
    const file = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(file)) return [];
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content) as TransactionalMemoryRecord[];
    } catch {
      return [];
    }
  }
}
