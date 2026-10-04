import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MoMo API response parsing", () => {
  it("returns JSON from the MoMo status endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api.getMomoStatus()).resolves.toEqual({ success: true });
  });

  it("reports an HTML response as an API routing error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><head></head></html>", {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );

    await expect(api.getMomoStatus()).rejects.toThrow(
      "Expected JSON from /api/momo/status, received text/html (HTTP 200). Check that the request is routed to the backend API.",
    );
  });
});
