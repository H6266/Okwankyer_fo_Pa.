/**
 * Ɔkwankyerɛfo Pa - Crash-Resilient Idempotency Ledger
 *
 * Atomic filesystem-backed reservation layer for financial operations.
 *
 * Design goals:
 * - Same logical request cannot reserve the same operation twice in one host.
 * - Material parameter changes produce a conflict instead of a replay.
 * - A process crash leaves an explicit PENDING record for reconciliation.
 * - No successful provider operation is silently forgotten.
 *
 * NOTE:
 * This is a single-host durable backend.
 * For horizontal production deployment, the same interface should be backed
 * by PostgreSQL rather than reintroducing process-memory Sets.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export type IdempotencyState =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN";

export interface IdempotencyRecord<T = unknown> {
  key: string;
  fingerprint: string;
  state: IdempotencyState;
  createdAt: number;
  updatedAt: number;
  ownerToken: string;
  resourceType: string;
  resourceId?: string;
  providerReference?: string;
  result?: T;
  error?: string;
}

export type ReservationResult<T = unknown> =
  | {
      kind: "RESERVED";
      record: IdempotencyRecord<T>;
    }
  | {
      kind: "EXISTING";
      record: IdempotencyRecord<T>;
    }
  | {
      kind: "CONFLICT";
      record: IdempotencyRecord<T>;
    };

function hashKey(key: string): string {
  return crypto
    .createHash("sha256")
    .update(key)
    .digest("hex");
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export class DurableIdempotencyLedger {
  private readonly baseDir: string;

  constructor(
    baseDir = path.resolve(
      process.cwd(),
      ".data",
      "idempotency-ledger"
    )
  ) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, {
      recursive: true,
    });
  }

  private fileForKey(key: string): string {
    return path.join(
      this.baseDir,
      `${sanitize(hashKey(key))}.json`
    );
  }

  private read<T>(
    key: string
  ): IdempotencyRecord<T> | undefined {
    const file = this.fileForKey(key);

    if (!fs.existsSync(file)) {
      return undefined;
    }

    try {
      return JSON.parse(
        fs.readFileSync(file, "utf8")
      ) as IdempotencyRecord<T>;
    } catch (error) {
      throw new Error(
        `IDEMPOTENCY_CORRUPTION: cannot parse record for key ${hashKey(
          key
        )}: ${String(error)}`
      );
    }
  }

  private atomicWrite<T>(
    key: string,
    record: IdempotencyRecord<T>
  ): void {
    const finalPath = this.fileForKey(key);

    const tempPath =
      `${finalPath}.${process.pid}.${Date.now()}.` +
      `${crypto.randomBytes(4).toString("hex")}.tmp`;

    fs.writeFileSync(
      tempPath,
      JSON.stringify(record, null, 2),
      "utf8"
    );

    fs.renameSync(
      tempPath,
      finalPath
    );
  }

  public get<T = unknown>(
    key: string
  ): IdempotencyRecord<T> | undefined {
    return this.read<T>(key);
  }

  public reserve<T = unknown>(params: {
    key: string;
    fingerprint: string;
    resourceType: string;
    resourceId?: string;
  }): ReservationResult<T> {
    const now = Date.now();

    const existing = this.read<T>(
      params.key
    );

    if (existing) {
      if (
        existing.fingerprint !==
        params.fingerprint
      ) {
        return {
          kind: "CONFLICT",
          record: existing,
        };
      }

      return {
        kind: "EXISTING",
        record: existing,
      };
    }

    const record: IdempotencyRecord<T> = {
      key: params.key,
      fingerprint: params.fingerprint,
      state: "PENDING",
      createdAt: now,
      updatedAt: now,
      ownerToken:
        `${process.pid}-${crypto.randomUUID()}`,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    };

    const file = this.fileForKey(
      params.key
    );

    try {
      /*
       * wx creates the file atomically.
       * If another process wins the race, read that process's record.
       */
      const fd = fs.openSync(
        file,
        "wx",
        0o600
      );

      try {
        fs.writeFileSync(
          fd,
          JSON.stringify(
            record,
            null,
            2
          ),
          "utf8"
        );
      } finally {
        fs.closeSync(fd);
      }

      return {
        kind: "RESERVED",
        record,
      };
    } catch (error: any) {
      if (error?.code === "EEXIST") {
        const winner =
          this.read<T>(params.key);

        if (!winner) {
          throw new Error(
            "IDEMPOTENCY_RACE: record appeared during reservation but could not be read."
          );
        }

        if (
          winner.fingerprint !==
          params.fingerprint
        ) {
          return {
            kind: "CONFLICT",
            record: winner,
          };
        }

        return {
          kind: "EXISTING",
          record: winner,
        };
      }

      throw error;
    }
  }

  public update<T = unknown>(
    key: string,
    patch: Partial<
      Omit<
        IdempotencyRecord<T>,
        "key" | "fingerprint" | "createdAt"
      >
    >
  ): IdempotencyRecord<T> {
    const current =
      this.read<T>(key);

    if (!current) {
      throw new Error(
        `IDEMPOTENCY_NOT_FOUND: ${hashKey(key)}`
      );
    }

    const next: IdempotencyRecord<T> = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    this.atomicWrite(
      key,
      next
    );

    return next;
  }

  public complete<T = unknown>(
    key: string,
    result: T,
    providerReference?: string,
    resourceId?: string
  ): IdempotencyRecord<T> {
    return this.update<T>(
      key,
      {
        state: "COMPLETED",
        result,
        providerReference,
        resourceId,
        error: undefined,
      }
    );
  }

  public fail<T = unknown>(
    key: string,
    error: string,
    result?: T
  ): IdempotencyRecord<T> {
    return this.update<T>(
      key,
      {
        state: "FAILED",
        error,
        result,
      }
    );
  }

  public markUnknown<T = unknown>(
    key: string,
    error: string
  ): IdempotencyRecord<T> {
    return this.update<T>(
      key,
      {
        state: "UNKNOWN",
        error,
      }
    );
  }

  public clearAllForTesting(): void {
    if (fs.existsSync(this.baseDir)) {
      for (const file of fs.readdirSync(this.baseDir)) {
        try {
          fs.unlinkSync(path.join(this.baseDir, file));
        } catch {}
      }
    }
  }
}

export const durableIdempotencyLedger =
  new DurableIdempotencyLedger();
