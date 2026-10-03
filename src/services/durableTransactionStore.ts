/**
 * Ɔkwankyerɛfo Pa - Durable Transaction & State Store
 * 
 * Provides crash-resilient, durable persistence for transaction state machine sessions,
 * idempotency records, and velocity limits across process restarts.
 */

import fs from "fs";
import path from "path";
import { TransactionSession } from "../domain/stateMachine";
import { TransactionResult } from "../modules/transactionOrchestrator";

export interface VelocityAttempt {
  timestamp: number;
  amount: number;
  recipientPhone: string;
}

export interface VelocityRecord {
  callerPhone: string;
  attempts: VelocityAttempt[];
}

export interface VelocityConfig {
  singleTransactionCap: number; // e.g. 5000 GHS
  maxHourlyAttemptsPerCaller: number; // e.g. 5
  dailyCapPerCaller: number; // e.g. 10000 GHS
  maxHourlyAttemptsPerRecipient: number; // e.g. 10
}

export const DEFAULT_VELOCITY_CONFIG: VelocityConfig = {
  singleTransactionCap: 5000,
  maxHourlyAttemptsPerCaller: 5,
  dailyCapPerCaller: 10000,
  maxHourlyAttemptsPerRecipient: 10,
};

export class DurableTransactionStore {
  private baseDir: string;
  private sessionsDir: string;
  private idempotencyDir: string;
  private velocityDir: string;

  private sessions = new Map<string, TransactionSession>();
  private idempotencyIndex = new Map<string, string>(); // idempotencyKey -> sessionId
  private processedTransactions = new Map<string, TransactionResult>(); // idempotencyKey -> result
  private velocityMap = new Map<string, VelocityAttempt[]>(); // callerPhone -> attempts

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(process.cwd(), ".data");
    this.sessionsDir = path.join(this.baseDir, "state_machine");
    this.idempotencyDir = path.join(this.baseDir, "idempotency");
    this.velocityDir = path.join(this.baseDir, "velocity");

    this.initDirectories();
    this.hydrateFromDisk();
  }

  private initDirectories(): void {
    for (const dir of [this.baseDir, this.sessionsDir, this.idempotencyDir, this.velocityDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private hydrateFromDisk(): void {
    try {
      // 1. Hydrate sessions
      if (fs.existsSync(this.sessionsDir)) {
        const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(this.sessionsDir, file), "utf-8");
            const session: TransactionSession = JSON.parse(raw);
            this.sessions.set(session.sessionId, session);
            if (session.idempotencyKey) {
              this.idempotencyIndex.set(session.idempotencyKey, session.sessionId);
            }
          } catch {
            // Ignore corrupted single session file
          }
        }
      }

      // 2. Hydrate processed idempotency results
      if (fs.existsSync(this.idempotencyDir)) {
        const files = fs.readdirSync(this.idempotencyDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(this.idempotencyDir, file), "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed.idempotencyKey && parsed.result) {
              this.processedTransactions.set(parsed.idempotencyKey, parsed.result);
            }
          } catch {}
        }
      }

      // 3. Hydrate velocity
      if (fs.existsSync(this.velocityDir)) {
        const files = fs.readdirSync(this.velocityDir).filter((f) => f.endsWith(".json"));
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(this.velocityDir, file), "utf-8");
            const record: VelocityRecord = JSON.parse(raw);
            const valid = record.attempts.filter((a) => a.timestamp >= cutoff);
            this.velocityMap.set(record.callerPhone, valid);
          } catch {}
        }
      }
    } catch (err) {
      console.warn("[DurableTransactionStore] Error hydrating store from disk:", err);
    }
  }

  private atomicWriteFileSync(filePath: string, data: string): void {
    const tmpPath = `${filePath}.${Date.now()}.${Math.floor(Math.random() * 10000)}.tmp`;
    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, filePath);
  }

  // ── Session Operations ────────────────────────────────────────────────
  public getSession(sessionId: string): TransactionSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionByIdempotencyKey(key: string): TransactionSession | undefined {
    const sessionId = this.idempotencyIndex.get(key);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  public getAllSessions(): TransactionSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public saveSession(session: TransactionSession): void {
    this.sessions.set(session.sessionId, session);
    if (session.idempotencyKey) {
      this.idempotencyIndex.set(session.idempotencyKey, session.sessionId);
    }

    try {
      const sanitizedId = session.sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filePath = path.join(this.sessionsDir, `${sanitizedId}.json`);
      this.atomicWriteFileSync(filePath, JSON.stringify(session, null, 2));
    } catch (err) {
      console.error(`[DurableTransactionStore] Failed to write session ${session.sessionId} to disk:`, err);
    }
  }

  public deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.idempotencyKey) {
      this.idempotencyIndex.delete(session.idempotencyKey);
    }
    this.sessions.delete(sessionId);
    try {
      const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filePath = path.join(this.sessionsDir, `${sanitizedId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  }

  // ── Idempotency Results Operations ────────────────────────────────────
  public getIdempotencyResult(key: string): TransactionResult | undefined {
    return this.processedTransactions.get(key);
  }

  public saveIdempotencyResult(key: string, result: TransactionResult): void {
    this.processedTransactions.set(key, result);
    try {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filePath = path.join(this.idempotencyDir, `${sanitizedKey}.json`);
      this.atomicWriteFileSync(
        filePath,
        JSON.stringify({ idempotencyKey: key, result, savedAt: Date.now() }, null, 2)
      );
    } catch (err) {
      console.error(`[DurableTransactionStore] Failed to write idempotency record ${key}:`, err);
    }
  }

  // ── Velocity & Limits Operations ──────────────────────────────────────
  public checkVelocityLimits(
    callerPhone: string,
    recipientPhone: string,
    amount: number,
    limits: VelocityConfig = DEFAULT_VELOCITY_CONFIG
  ): { allowed: boolean; reason?: string } {
    if (amount <= 0) {
      return { allowed: false, reason: "Amount must be greater than zero." };
    }
    if (amount > limits.singleTransactionCap) {
      return {
        allowed: false,
        reason: `Amount of GH₵${amount} exceeds the single transaction limit of GH₵${limits.singleTransactionCap}.`,
      };
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Caller velocity
    const callerAttempts = this.velocityMap.get(callerPhone) || [];
    const callerPastHour = callerAttempts.filter((a) => a.timestamp >= oneHourAgo);
    if (callerPastHour.length >= limits.maxHourlyAttemptsPerCaller) {
      return {
        allowed: false,
        reason: `Exceeded hourly attempt limit (${limits.maxHourlyAttemptsPerCaller} per hour). Please wait before trying again.`,
      };
    }

    const callerPastDay = callerAttempts.filter((a) => a.timestamp >= oneDayAgo);
    const dailyTotal = callerPastDay.reduce((sum, a) => sum + a.amount, 0);
    if (dailyTotal + amount > limits.dailyCapPerCaller) {
      return {
        allowed: false,
        reason: `Transaction would exceed your daily limit of GH₵${limits.dailyCapPerCaller} (Current: GH₵${dailyTotal.toFixed(2)}).`,
      };
    }

    // Recipient velocity (across all callers)
    let recipientPastHourCount = 0;
    for (const [, attempts] of this.velocityMap.entries()) {
      for (const a of attempts) {
        if (a.recipientPhone === recipientPhone && a.timestamp >= oneHourAgo) {
          recipientPastHourCount++;
        }
      }
    }

    if (recipientPastHourCount >= limits.maxHourlyAttemptsPerRecipient) {
      return {
        allowed: false,
        reason: `Recipient has received too many transaction attempts in the past hour. Please try again later.`,
      };
    }

    return { allowed: true };
  }

  public recordVelocityAttempt(callerPhone: string, recipientPhone: string, amount: number): void {
    const now = Date.now();
    const attempts = this.velocityMap.get(callerPhone) || [];
    attempts.push({
      timestamp: now,
      amount,
      recipientPhone,
    });

    const cutoff = now - 24 * 60 * 60 * 1000;
    const pruned = attempts.filter((a) => a.timestamp >= cutoff);
    this.velocityMap.set(callerPhone, pruned);

    try {
      const sanitizedPhone = callerPhone.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const filePath = path.join(this.velocityDir, `${sanitizedPhone}.json`);
      this.atomicWriteFileSync(
        filePath,
        JSON.stringify({ callerPhone, attempts: pruned, updatedAt: now }, null, 2)
      );
    } catch (err) {
      console.error(`[DurableTransactionStore] Failed to write velocity record:`, err);
    }
  }

  // ── Testing / Maintenance Utilities ───────────────────────────────────
  public clearAllForTesting(): void {
    this.sessions.clear();
    this.idempotencyIndex.clear();
    this.processedTransactions.clear();
    this.velocityMap.clear();

    const cleanDir = (d: string) => {
      if (fs.existsSync(d)) {
        for (const file of fs.readdirSync(d)) {
          try {
            fs.unlinkSync(path.join(d, file));
          } catch {}
        }
      }
    };

    cleanDir(this.sessionsDir);
    cleanDir(this.idempotencyDir);
    cleanDir(this.velocityDir);
  }
}

export const durableTransactionStore = new DurableTransactionStore();
