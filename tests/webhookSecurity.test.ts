import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  checkCallerRateLimit,
  createCallbackCapability,
  resetCallbackCapabilities,
  resetCallerRateLimits,
  safeCompare,
  validateWebhookSecurityConfig,
  verifyAtWebhook,
} from "../src/providers/telephony/webhookGuard";

const webhookSecret = "test-telephony-webhook-secret-with-sufficient-length";

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    body: { sessionId: "AT-SESSION-001" },
    query: {},
    headers: {},
    path: "/voice-menu",
    ip: "127.0.0.1",
    ...overrides,
  } as unknown as Request;
}

function runGuard(req: Request) {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  verifyAtWebhook(req, res, next);
  return { res, next };
}

describe("Africa's Talking webhook security", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AT_WEBHOOK_SECRET", webhookSecret);
    resetCallbackCapabilities();
    resetCallerRateLimits();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses constant-time secret comparison", () => {
    expect(safeCompare("secret-token-123", "secret-token-123")).toBe(true);
    expect(safeCompare("secret-token-123", "secret-token-999")).toBe(false);
    expect(safeCompare("short", "longer-secret-token")).toBe(false);
  });

  it("requires a non-default secret of at least 32 characters in production", () => {
    vi.stubEnv("AT_WEBHOOK_SECRET", "");
    expect(() => validateWebhookSecurityConfig()).toThrow("AT_WEBHOOK_SECRET");
    vi.stubEnv("AT_WEBHOOK_SECRET", "too-short");
    expect(() => validateWebhookSecurityConfig()).toThrow("AT_WEBHOOK_SECRET");
    vi.stubEnv("AT_WEBHOOK_SECRET", "okwankyer_telephony_webhook_secret_default_prod_key_32b");
    expect(() => validateWebhookSecurityConfig()).toThrow("AT_WEBHOOK_SECRET");
    vi.stubEnv("AT_WEBHOOK_SECRET", webhookSecret);
    expect(() => validateWebhookSecurityConfig()).not.toThrow();
  });

  it("rejects provider-shaped callback data without authentication", () => {
    const req = makeRequest({ body: { sessionId: "AT-SESSION-001", callerNumber: "+233200000000" } });
    const { res, next } = runGuard(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("does not accept the shared secret from a query parameter", () => {
    const req = makeRequest({ query: { sessionId: "AT-SESSION-001", secret: webhookSecret } });
    const { res, next } = runGuard(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts a correct shared secret supplied in an authentication header", () => {
    const req = makeRequest({ headers: { "x-at-webhook-secret": webhookSecret } });
    const { next } = runGuard(req);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a repeated initial callback for the same session", () => {
    const req = makeRequest({ headers: { "x-at-webhook-secret": webhookSecret } });
    expect(runGuard(req).next).toHaveBeenCalledOnce();

    const replay = runGuard(req);
    expect(replay.next).not.toHaveBeenCalled();
    expect(replay.res.status).toHaveBeenCalledWith(401);
  });

  it("does not allow the shared header to bypass follow-up capabilities", () => {
    const req = makeRequest({
      path: "/language-selection",
      headers: { "x-at-webhook-secret": webhookSecret },
    });
    const { res, next } = runGuard(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts short-lived capabilities bound to one session and callback path, once", () => {
    const callbackPath = "/language-selection";
    const capability = createCallbackCapability("AT-SESSION-001", callbackPath);
    const req = makeRequest({
      path: callbackPath,
      query: { sessionId: "AT-SESSION-001", callbackCapability: capability },
    });

    const first = runGuard(req);
    expect(first.next).toHaveBeenCalledOnce();

    const replay = runGuard(req);
    expect(replay.next).not.toHaveBeenCalled();
    expect(replay.res.status).toHaveBeenCalledWith(401);
  });

  it("rejects callback capabilities used on another session or route", () => {
    const callbackPath = "/language-selection";
    const capability = createCallbackCapability("AT-SESSION-001", callbackPath);
    const wrongSession = runGuard(makeRequest({
      body: {},
      path: callbackPath,
      query: { sessionId: "AT-SESSION-002", callbackCapability: capability },
    }));
    expect(wrongSession.next).not.toHaveBeenCalled();

    const wrongPath = runGuard(makeRequest({
      body: {},
      path: "/safe-outcome",
      query: { sessionId: "AT-SESSION-001", callbackCapability: capability },
    }));
    expect(wrongPath.next).not.toHaveBeenCalled();
  });

  it("expires callback capabilities after five minutes", () => {
    vi.useFakeTimers();
    try {
      const callbackPath = "/language-selection";
      const capability = createCallbackCapability("AT-SESSION-001", callbackPath);
      vi.advanceTimersByTime(5 * 60 * 1000);
      const expired = runGuard(makeRequest({
        path: callbackPath,
        query: { sessionId: "AT-SESSION-001", callbackCapability: capability },
      }));

      expect(expired.next).not.toHaveBeenCalled();
      expect(expired.res.status).toHaveBeenCalledWith(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows callers within the per-caller rate limit and rejects excess calls", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkCallerRateLimit("0553838464", 5).allowed).toBe(true);
    }
    expect(checkCallerRateLimit("0553838464", 5).allowed).toBe(false);
  });
});
