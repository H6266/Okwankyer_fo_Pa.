/**
 * Ɔkwankyerɛfo Pa - Phase 6d Tests: Telephony Webhook Security
 * (tests/webhookSecurity.test.ts)
 * 
 * Verifies:
 * 1. Request Authenticity: Secret comparison with timing-attack defense.
 * 2. Replay Attack Rejection: Duplicate nonces and stale timestamps rejected.
 * 3. Per-Caller Rate Limiting: Throttles caller requests exceeding rate threshold.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkReplayGuard,
  checkCallerRateLimit,
  resetReplayCache,
  resetCallerRateLimits,
  safeCompare,
} from "../src/providers/telephony/webhookGuard";

describe("Phase 6d: Africa's Talking Webhook Security", () => {
  beforeEach(() => {
    resetReplayCache();
    resetCallerRateLimits();
  });

  describe("1. Request Authenticity", () => {
    it("safely compares secrets with constant-time equality", () => {
      expect(safeCompare("secret-token-123", "secret-token-123")).toBe(true);
      expect(safeCompare("secret-token-123", "secret-token-999")).toBe(false);
      expect(safeCompare("short", "longer-secret-token")).toBe(false);
    });
  });

  describe("2. Replay Protection", () => {
    it("accepts a unique fresh nonce", () => {
      const req = {
        body: { sessionId: "sess-001", nonce: "nonce-abc-1" },
        headers: {},
        query: {},
      } as any;

      const result = checkReplayGuard(req);
      expect(result.valid).toBe(true);
    });

    it("rejects duplicate nonce within replay window", () => {
      const req1 = {
        body: { sessionId: "sess-001", nonce: "nonce-duplicate-99" },
        headers: {},
        query: {},
      } as any;
      const res1 = checkReplayGuard(req1);
      expect(res1.valid).toBe(true);

      // Replayed identical request
      const req2 = {
        body: { sessionId: "sess-001", nonce: "nonce-duplicate-99" },
        headers: {},
        query: {},
      } as any;
      const res2 = checkReplayGuard(req2);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toBe("DUPLICATE_NONCE_REPLAY");
    });

    it("rejects requests with stale timestamps older than 5 minutes", () => {
      const staleTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const req = {
        body: { sessionId: "sess-002", timestamp: String(staleTime) },
        headers: {},
        query: {},
      } as any;

      const result = checkReplayGuard(req);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("STALE_TIMESTAMP_REPLAY");
    });
  });

  describe("3. Per-Caller Rate Limiting", () => {
    it("allows caller requests within rate limit", () => {
      const caller = "0553838464";
      for (let i = 0; i < 5; i++) {
        const check = checkCallerRateLimit(caller, 10);
        expect(check.allowed).toBe(true);
      }
    });

    it("throttles caller when requests exceed threshold per minute", () => {
      const caller = "0241112233";
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        const check = checkCallerRateLimit(caller, limit);
        expect(check.allowed).toBe(true);
      }

      // 6th request exceeds limit
      const exceeded = checkCallerRateLimit(caller, limit);
      expect(exceeded.allowed).toBe(false);
      expect(exceeded.remaining).toBe(0);
    });
  });
});
