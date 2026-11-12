import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DurableFilePreferenceRepository,
  DurableFileSemanticMemoryRepository,
  DurableFileSessionRepository,
  DurableFileTaskStateRepository,
  DurableFileUserMemoryRepository,
} from "../src/ai_system/memory/durableFileRepositories";
import { PreferenceMemory } from "../src/ai_system/memory/preferenceMemory";
import { UserGoalsMemory } from "../src/ai_system/memory/userGoalsMemory";
import { UserGoalRecord, IUserMemoryRepository } from "../src/ai_system/memory/repositoryInterfaces";
import { FieldEncryptionService } from "../src/ai_system/security/fieldEncryption";
import { embeddingProvider } from "../src/ai_system/memory/embeddingProvider";

const sessionId = "../../memory-path-escape-test";
const temporaryDirectories: string[] = [];

function makeUserMemory(): { directory: string; memory: UserGoalsMemory; repository: DurableFileUserMemoryRepository } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okwankyer-user-memory-"));
  temporaryDirectories.push(directory);
  const repository = new DurableFileUserMemoryRepository(directory);
  return { directory, repository, memory: new UserGoalsMemory(repository) };
}

afterEach(async () => {
  await new DurableFileSessionRepository().delete(sessionId);
  await new DurableFileSemanticMemoryRepository().clear(sessionId);
  new DurableFileTaskStateRepository().delete(sessionId);
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("durable memory repositories", () => {
  it("round-trips session identifiers without using them as filesystem paths", async () => {
    const repository = new DurableFileSessionRepository();
    const session = {
      sessionId,
      language: "en",
      currentScreen: "HOME",
      currentStep: "welcome",
      slots: {},
      lastActiveTimestamp: Date.now(),
      turnCount: 0,
    };

    await repository.save(session);
    await expect(repository.get(sessionId)).resolves.toEqual(session);
  });

  it("persists semantic records across repository instances and bounds retrieval", async () => {
    const first = new DurableFileSemanticMemoryRepository();
    await first.storeVector({
      id: "turn-1",
      sessionId,
      turnIndex: 0,
      text: "sanitized utterance",
      embedding: [1, 0],
      timestamp: Date.now(),
    });

    const second = new DurableFileSemanticMemoryRepository();
    await expect(second.searchSimilar(sessionId, [1, 0], 100)).resolves.toHaveLength(1);
    await expect(second.searchSimilar(sessionId, [1], 2)).resolves.toHaveLength(0);
  });

  it("recovers active task and confirmation draft after constructing a new repository instance", () => {
    const first = new DurableFileTaskStateRepository();
    first.set(sessionId, [{
      taskId: "task-persisted",
      intent: "SEND_MONEY",
      slots: { amount: 30, recipientPhone: "0551234567", network: "MTN" },
      currentStep: "confirm",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      draft: {
        draftId: "draft-persisted",
        version: 1,
        sessionId,
        operation: "TRANSFER",
        amount: 30,
        recipientPhone: "0551234567",
        network: "MTN",
        currency: "GHS",
        confirmationState: "CONFIRMATION_REQUESTED",
        createdAt: Date.now(),
        expiresAt: Date.now() + 30_000,
      },
    }]);

    const recovered = new DurableFileTaskStateRepository().get(sessionId);
    expect(recovered[0]?.draft?.confirmationState).toBe("CONFIRMATION_REQUESTED");
    expect(recovered[0]?.draft?.amount).toBe(30);
  });

  it("persists an explicit preference across repository instances", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okwankyer-preferences-"));
    temporaryDirectories.push(directory);
    const first = new PreferenceMemory(new DurableFilePreferenceRepository(directory));
    await expect(first.setPreference("restart-user", "preferredLanguage", "tw", "USER_EXPLICIT")).resolves.toBe(true);

    const second = new PreferenceMemory(new DurableFilePreferenceRepository(directory));
    await expect(second.getPreference("restart-user", "preferredLanguage")).resolves.toBe("tw");
  });

  it("keeps session-only preferences out of durable storage", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okwankyer-session-preference-"));
    temporaryDirectories.push(directory);
    const repository = new DurableFilePreferenceRepository(directory);
    const preferenceMemory = new PreferenceMemory(repository);

    await expect(preferenceMemory.setPreference("session-user", "preferredLanguage", "tw", "SESSION_ONLY", null, "session-a")).resolves.toBe(true);
    await expect(preferenceMemory.getPreference("session-user", "preferredLanguage", "session-a")).resolves.toBe("tw");
    await expect(new PreferenceMemory(repository).getPreference("session-user", "preferredLanguage", "session-a")).resolves.toBeUndefined();
    await expect(repository.get("session-user")).resolves.toBeNull();
  });

  it("excludes expired preferences from retrieval", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okwankyer-expiring-preference-"));
    temporaryDirectories.push(directory);
    vi.useFakeTimers();
    const preferenceMemory = new PreferenceMemory(new DurableFilePreferenceRepository(directory));

    await preferenceMemory.setPreference("expiring-user", "preferredLanguage", "tw", "USER_EXPLICIT", 1000);
    vi.advanceTimersByTime(1001);

    await expect(preferenceMemory.getPreference("expiring-user", "preferredLanguage")).resolves.toBeUndefined();
  });

  it("tracks an explicit business goal and related needs across repository instances", async () => {
    const firstSession = makeUserMemory();
    await firstSession.memory.setEnabled("business-user", true);
    const initial = await firstSession.memory.ingest(
      "business-user",
      "I want to start a small business, but I don't know where to get funding."
    );
    expect(initial.map((decision) => decision.action)).toEqual(["SAVE", "SAVE"]);

    const laterSession = new UserGoalsMemory(new DurableFileUserMemoryRepository(firstSession.directory));
    const context = await laterSession.retrieve("business-user", "What should I do next?");
    expect(context.method).toBe("CONTINUATION_RULE");
    expect(context.items.map((item) => item.record.type)).toContain("USER_GOAL");
    expect(context.items.map((item) => item.record.type)).toContain("USER_NEED");
    expect(context.context).toContain("Find business funding");

    await laterSession.ingest("business-user", "I have registered the business. Now I need suppliers.");
    let records = await laterSession.inspect("business-user");
    const goal = records.find((record) => record.type === "USER_GOAL");
    const suppliers = records.find((record) => record.type === "USER_NEED" && record.need === "Find suppliers");
    expect(goal?.type === "USER_GOAL" && goal.progress.map((item) => item.summary)).toContain("Business registered");
    expect(suppliers?.type === "USER_NEED" && suppliers.relatedGoalId).toBe(goal?.id);

    await laterSession.ingest("business-user", "I have found suppliers. I now need customers.");
    records = await laterSession.inspect("business-user");
    expect(records.find((record) => record.type === "USER_NEED" && record.need === "Find suppliers")?.status).toBe("COMPLETED");
    expect(records.find((record) => record.type === "USER_NEED" && record.need === "Find customers")?.status).toBe("ACTIVE");
    const updatedGoal = records.find((record) => record.type === "USER_GOAL");
    expect(updatedGoal?.type === "USER_GOAL" && updatedGoal.progress.map((item) => item.summary)).toContain("Suppliers found");
  });

  it("ignores ambiguous statements, rejects credentials, and avoids duplicate goals", async () => {
    const { memory } = makeUserMemory();
    await memory.setEnabled("evidence-user", true);
    expect((await memory.ingest("evidence-user", "I am tired today."))[0].action).toBe("IGNORE");
    expect((await memory.ingest("evidence-user", "My PIN is 1234."))[0].action).toBe("REJECT");
    expect((await memory.ingest("evidence-user", "I want to start a small business."))[0].action).toBe("SAVE");
    expect((await memory.ingest("evidence-user", "I want to start a small business."))[0].reason).toContain("duplicate");
    expect(await memory.inspect("evidence-user")).toHaveLength(1);
  });

  it("handles an explicit Twi goal and does not retrieve another user's records", async () => {
    const { memory } = makeUserMemory();
    await memory.setEnabled("twi-user", true);
    await memory.ingest("twi-user", "Me pɛ sɛ mehyɛ adwuma ase.");

    expect((await memory.retrieve("twi-user", "What should I do next?")).items).toHaveLength(1);
    expect((await memory.retrieve("other-user", "What should I do next?")).items).toHaveLength(0);
    expect((await memory.retrieve("twi-user", "What is the weather tomorrow?")).items).toHaveLength(0);
  });

  it("uses matching genuine embedding providers for multilingual paraphrase retrieval", async () => {
    const { memory } = makeUserMemory();
    await memory.setEnabled("embedding-user", true);
    vi.spyOn(embeddingProvider, "embed").mockResolvedValue({
      vector: [1, 0],
      source: "GEMINI_EMBEDDING",
      dimension: 2,
    });
    await memory.ingest("embedding-user", "I want to start a small business and I need suppliers.");

    const result = await memory.retrieve("embedding-user", "Where can I source vendors?");
    expect(result.method).toBe("GEMINI_EMBEDDING");
    expect(result.items.map((item) => item.record.type)).toContain("USER_NEED");
  });

  it("excludes deleted and completed memories and respects the context budget", async () => {
    const { memory } = makeUserMemory();
    await memory.setEnabled("lifecycle-user", true);
    const [saved] = await memory.ingest("lifecycle-user", "I want to start a small business.");
    const inspected = await memory.inspect("lifecycle-user");
    expect(await memory.setStatus("lifecycle-user", saved.memoryId!, "COMPLETED")).toBe(true);
    expect((await memory.retrieve("lifecycle-user", "What should I do next?")).items).toHaveLength(0);

    expect(await memory.setStatus("lifecycle-user", inspected[0].id, "ACTIVE")).toBe(true);
    expect((await memory.retrieve("lifecycle-user", "What should I do next?", { tokenBudget: 1 })).items).toHaveLength(0);
    expect(await memory.forget("lifecycle-user", inspected[0].id)).toBe(true);
    expect((await memory.retrieve("lifecycle-user", "What should I do next?")).items).toHaveLength(0);
  });

  it("handles memory inspection, completion, opt-out, and current-statement suppression", async () => {
    const { memory } = makeUserMemory();
    await memory.setEnabled("control-user", true);
    await memory.ingest("control-user", "I want to start a small business.");

    expect(await memory.handleCommand("control-user", "What do you remember about me?")).toContain("Start a small business");
    expect(await memory.handleCommand("control-user", "I have completed that goal.")).toContain("marked the goal");
    expect((await memory.retrieve("control-user", "What should I do next?")).items).toHaveLength(0);
    expect(await memory.handleCommand("control-user", "Don't remember this.")).toContain("will not add");
    expect(await memory.handleCommand("control-user", "Don't remember anything about me.")).toContain("turned off");
    expect(await memory.isEnabled("control-user")).toBe(false);
    expect((await memory.ingest("control-user", "I want to start a small business."))[0].action).toBe("IGNORE");
  });

  it("persists only explicit durable preferences and supersedes them with later explicit corrections", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "okwankyer-explicit-preference-"));
    temporaryDirectories.push(directory);
    const repository = new DurableFilePreferenceRepository(directory);
    const preferences = new PreferenceMemory(repository);

    await expect(preferences.extractExplicitPreference("preference-user", "session-a", "Speak Twi.")).resolves.toBe(false);
    await expect(preferences.extractExplicitPreference("preference-user", "session-a", "Speak Twi for this conversation.")).resolves.toBe(true);
    await expect(preferences.getPreference("preference-user", "preferredLanguage", "session-a")).resolves.toBe("tw");
    await expect(new PreferenceMemory(new DurableFilePreferenceRepository(directory))
      .getPreference("preference-user", "preferredLanguage")).resolves.toBeUndefined();

    await expect(preferences.extractExplicitPreference("preference-user", "session-a", "From now on, always speak Twi with me.")).resolves.toBe(true);
    await expect(preferences.extractExplicitPreference("preference-user", "session-a", "I prefer English from now on.")).resolves.toBe(true);
    const recovered = await new PreferenceMemory(new DurableFilePreferenceRepository(directory))
      .getPreference("preference-user", "preferredLanguage");
    expect(recovered).toBe("en");
  });

  it("excludes expired user memories and reports repository failures instead of fake success", async () => {
    const { memory, repository } = makeUserMemory();
    const now = Date.now();
    const expired: UserGoalRecord = {
      id: "expired-goal",
      userId: "expiry-user",
      type: "USER_GOAL",
      goal: "Start a small business",
      source: "USER_EXPLICIT",
      confidence: 1,
      status: "ACTIVE",
      priority: 2,
      createdAt: now - 1000,
      updatedAt: now - 1000,
      expiresAt: now - 1,
      progress: [],
    };
    await repository.save("expiry-user", [expired]);
    await memory.setEnabled("expiry-user", true);
    expect((await memory.retrieve("expiry-user", "What should I do next?")).items).toHaveLength(0);

    const failingRepository: IUserMemoryRepository = {
      list: async () => [],
      save: async () => { throw new Error("disk unavailable"); },
      clear: async () => { throw new Error("disk unavailable"); },
    };
    const enabledPreferences = {
      get: async () => ({ memoryConsent: { enabled: true, updatedAt: now } }),
      save: async () => undefined,
    };
    await expect(new UserGoalsMemory(failingRepository, enabledPreferences).ingest("failure-user", "I want to start a small business."))
      .rejects.toThrow("disk unavailable");
  });

  it("asks for consent before storing a new goal and persists it only after confirmation", async () => {
    const { memory } = makeUserMemory();
    const prompt = await memory.handleCommand(
      "consent-user",
      "I want to start a small business, but I don't know where to get funding.",
      "consent-session"
    );
    expect(prompt).toContain("Would you like me to remember");
    expect(await memory.inspect("consent-user")).toHaveLength(0);

    const confirmation = await memory.handleCommand("consent-user", "Yes, remember that.", "consent-session");
    expect(confirmation).toContain("I saved");
    expect(await memory.isEnabled("consent-user")).toBe(true);
    expect(await memory.inspect("consent-user")).toHaveLength(2);
  });

  it("fails closed when production encryption has no configured key", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEncryptionKey = process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.ENCRYPTION_KEY;
    try {
      expect(() => new FieldEncryptionService()).toThrow("ENCRYPTION_KEY must contain at least 32 bytes");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = previousEncryptionKey;
    }
  });
});
