import { afterEach, describe, expect, it } from "vitest";
import {
  DurableFileSemanticMemoryRepository,
  DurableFileSessionRepository,
  DurableFileTaskStateRepository,
} from "../src/ai_system/memory/durableFileRepositories";

const sessionId = "../../memory-path-escape-test";

afterEach(async () => {
  await new DurableFileSessionRepository().delete(sessionId);
  await new DurableFileSemanticMemoryRepository().clear(sessionId);
  new DurableFileTaskStateRepository().delete(sessionId);
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
});
