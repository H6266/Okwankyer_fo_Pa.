import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryConsolidator } from "../src/ai_system/memory/memoryConsolidator";
import { preferenceMemory } from "../src/ai_system/memory/preferenceMemory";
import { sessionMemory } from "../src/ai_system/memory/sessionMemory";

describe("memory consolidation", () => {
  afterEach(() => {
    sessionMemory.clear("session-language-only");
    vi.restoreAllMocks();
  });

  it("does not persist the session language as an explicit user preference", () => {
    sessionMemory.getOrCreate("session-language-only", "tw");
    const setPreference = vi.spyOn(preferenceMemory, "setPreference");

    new MemoryConsolidator().consolidate("session-language-only", "user-language-only");

    expect(setPreference).not.toHaveBeenCalled();
  });
});