import { randomUUID } from "crypto";
import { UserGoalRecord, UserMemoryRecord, UserMemoryStatus, UserNeedRecord, IUserMemoryRepository, IPreferenceRepository } from "./repositoryInterfaces";
import { unifiedMemory } from "./unifiedMemory";
import { embeddingProvider } from "./embeddingProvider";

export type UserMemoryDecisionAction = "SAVE" | "UPDATE" | "CONFIRM" | "SESSION_ONLY" | "IGNORE" | "REJECT";

export interface UserMemoryDecision {
  action: UserMemoryDecisionAction;
  memoryId?: string;
  reason: string;
}

export interface RetrievedUserMemory {
  record: UserMemoryRecord;
  score: number;
  reason: string;
  method: "GEMINI_EMBEDDING" | "LEXICAL_FALLBACK" | "CONTINUATION_RULE";
}

export interface UserMemoryRetrieval {
  items: RetrievedUserMemory[];
  context: string;
  estimatedTokens: number;
  method: "GEMINI_EMBEDDING" | "LEXICAL_FALLBACK" | "CONTINUATION_RULE" | "NONE";
}

const CREDENTIAL_OR_SENSITIVE_INPUT = /\b(?:pin|otp|one[- ]time (?:password|code)|password|passcode|secret|cvv|card (?:number|security|security code)|security code|verification code|access token|refresh token|auth(?:entication)? token)\b/i;
const CONTINUATION_QUERY = /\b(?:what should i do next|what do i do next|what next|next step|where were we|continue|yɛnnyɛ dɛn bio)\b/i;

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function words(value: string): Set<string> {
  return new Set(normalized(value).split(" ").filter((word) => word.length > 2));
}

function overlap(query: Set<string>, text: string): number {
  if (!query.size) return 0;
  const memoryWords = words(text);
  let matches = 0;
  for (const word of query) if (memoryWords.has(word)) matches++;
  return matches / query.size;
}

function isExpired(record: UserMemoryRecord, now: number): boolean {
  return record.expiresAt !== null && record.expiresAt <= now;
}

function getNeed(text: string): string | undefined {
  const candidates: Array<[RegExp, string]> = [
    [/(?:(?:i|we)\s+(?:do not|don't|dont)\s+know\s+(?:where|how)\s+to\s+get|(?:i|we)\s+need|(?:i am|i'm)\s+looking\s+for)\s+(?:appropriate\s+)?(?:business\s+)?funding\b/i, "Find business funding"],
    [/(?:(?:i|we)\s+(?:now\s+)?need|(?:i am|i'm)\s+looking\s+for|now\s+(?:i|we)\s+need)\s+(?:reliable\s+)?suppliers\b/i, "Find suppliers"],
    [/(?:(?:i|we)\s+(?:now\s+)?need|(?:i am|i'm)\s+looking\s+for|now\s+(?:i|we)\s+need)\s+(?:more\s+)?customers\b/i, "Find customers"],
    [/(?:(?:i|we)\s+(?:do not|don't|dont)\s+know\s+how\s+to|(?:i|we)\s+need\s+help\s+to)\s+register\s+(?:the\s+)?business\b/i, "Understand business registration"],
    [/(?:(?:i|we)\s+need|(?:i am|i'm)\s+looking\s+for)\s+business\s+registration\s+help\b/i, "Understand business registration"],
  ];
  return candidates.find(([pattern]) => pattern.test(text))?.[1];
}

function hasBusinessGoal(text: string): boolean {
  return /\b(?:i want to|i would like to|i'd like to|i plan to|my goal is to)\s+(?:start|build|launch|grow)\s+(?:a\s+)?(?:small\s+)?business\b/i.test(text) ||
    /\bme\s+pɛ\s+sɛ\s+mehyɛ\s+(?:adwuma|business)\s+ase\b/i.test(text);
}

function isBusinessRegistrationProgress(text: string): boolean {
  return /\b(?:i|we)\s+(?:have|ve|'ve)\s+registered\s+(?:the\s+)?business\b/i.test(text) ||
    /\b(?:business|adwuma)\s+(?:no\s+)?registered\b/i.test(text);
}

function completedNeedFor(text: string): string | undefined {
  if (isBusinessRegistrationProgress(text)) return "registration";
  if (/\b(?:i|we)\s+(?:have\s+)?(?:found|secured|got)\s+funding\b/i.test(text)) return "funding";
  if (/\b(?:i|we)\s+(?:have\s+)?found\s+suppliers\b/i.test(text)) return "suppliers";
  if (/\b(?:i|we)\s+(?:have\s+)?(?:found|gained)\s+customers\b/i.test(text)) return "customers";
  return undefined;
}

export class UserGoalsMemory {
  private pendingConsentCandidates = new Map<string, string>();

  constructor(
    private readonly repository: IUserMemoryRepository = unifiedMemory.userMemoryRepo,
    private readonly preferenceRepository: IPreferenceRepository = unifiedMemory.preferenceRepo
  ) {}

  public async isEnabled(userId: string): Promise<boolean> {
    const profile = await this.preferenceRepository.get(userId);
    return profile?.memoryConsent?.enabled === true;
  }

  public async setEnabled(userId: string, enabled: boolean): Promise<void> {
    const profile = (await this.preferenceRepository.get(userId)) || { userId };
    profile.memoryConsent = { enabled, updatedAt: Date.now() };
    await this.preferenceRepository.save(userId, profile);
  }

  public async handleCommand(userId: string | undefined, text: string, sessionId?: string): Promise<string | null> {
    const clean = normalized(text);
    const pendingKey = userId ? `${userId}:${sessionId || ""}` : "";
    const pending = pendingKey ? this.pendingConsentCandidates.get(pendingKey) : undefined;
    if (pending && /^(?:yes|yeah|yep|aane|yes remember(?: this| that)?|remember(?: this| that))$/.test(clean)) {
      await this.setEnabled(userId as string, true);
      this.pendingConsentCandidates.delete(pendingKey);
      const decisions = await this.ingest(userId, pending);
      const saved = decisions.some((decision) => decision.action === "SAVE" || decision.action === "UPDATE");
      return saved ? "I saved the goal and need you asked me to remember." : "Long-term memory is enabled, but I did not find a new supported goal or need to save.";
    }
    if (pending && /^(?:no|nope|dabi|no do not|no don t|no dont)$/.test(clean)) {
      this.pendingConsentCandidates.delete(pendingKey);
      return "Understood. I discarded the pending statement and will not save it.";
    }
    if (/\b(?:do not|don t|dont) remember this\b|\bforget that\b/.test(clean)) {
      if (pendingKey) this.pendingConsentCandidates.delete(pendingKey);
      return "Understood. I will not add this statement to long-term memory.";
    }
    if (/\b(?:what do you remember about me|what have you remembered about me)\b/.test(clean)) {
      if (!userId) return "I cannot inspect saved user memory without an authenticated user profile.";
      const records = await this.inspect(userId);
      if (!records.length) return "I do not have any saved goals or needs for you.";
      return `I have saved: ${records.map((record) => record.type === "USER_GOAL" ? `goal: ${record.goal}` : `need: ${record.need}`).join("; ")}.`;
    }
    if (/\b(?:do not|don t|dont) remember anything about me\b|\bforget all (?:my )?(?:memories|goals and needs)\b|\bdelete all my saved goals and needs\b/.test(clean)) {
      if (!userId) return "I cannot change saved user memory without an authenticated user profile.";
      await this.forget(userId);
      await this.setEnabled(userId, false);
      return "I deleted your saved goals and needs and turned off future goal and need memory.";
    }
    if (/\b(?:i have|i've|i have) completed that goal\b/.test(clean)) {
      if (!userId) return "I cannot update a saved goal without an authenticated user profile.";
      const goal = (await this.inspect(userId)).filter((record): record is UserGoalRecord => record.type === "USER_GOAL" && record.status === "ACTIVE")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!goal) return "I do not have an active saved goal to complete.";
      await this.setStatus(userId, goal.id, "COMPLETED");
      return `I marked the goal “${goal.goal}” as complete.`;
    }
    if (/\b(?:that is not correct|that's not correct|that is wrong|i no longer prefer that)\b/.test(clean)) {
      return "Which saved goal, need, or preference should I correct, and what should it say instead?";
    }
    if (/\bremember (?:this|my goals and needs)\b/.test(clean) && userId) {
      await this.setEnabled(userId, true);
      return "Long-term goal and need memory is now enabled.";
    }
    if (/\b(?:forget|delete) my (?:saved )?(?:goals|needs|goal|need)\b/.test(clean)) {
      if (!userId) return "I cannot delete saved user memory without an authenticated user profile.";
      const records = await this.inspect(userId);
      if (!records.length) return "There are no saved goals or needs to delete.";
      await this.forget(userId);
      return "I deleted your saved goals and needs.";
    }
    if (userId && !await this.isEnabled(userId) &&
        (hasBusinessGoal(text) || Boolean(getNeed(text))) &&
        !CREDENTIAL_OR_SENSITIVE_INPUT.test(text)) {
      this.pendingConsentCandidates.set(pendingKey, text);
      return "Would you like me to remember this goal and related need across conversations? Say yes, remember it, or no.";
    }
    return null;
  }

  public async ingest(userId: string | undefined, text: string): Promise<UserMemoryDecision[]> {
    if (!userId) return [{ action: "IGNORE", reason: "No authenticated user identity was provided." }];
    if (!await this.isEnabled(userId)) return [{ action: "IGNORE", reason: "Long-term goal and need memory is disabled for this user." }];
    const cleanText = text.trim();
    if (!cleanText) return [];
    if (CREDENTIAL_OR_SENSITIVE_INPUT.test(cleanText)) {
      return [{ action: "REJECT", reason: "Credential or sensitive authentication content is not eligible for memory." }];
    }

    const now = Date.now();
    const records = (await this.repository.list(userId)).filter((record) => !isExpired(record, now));
    const decisions: UserMemoryDecision[] = [];

    if (hasBusinessGoal(cleanText)) {
      const goalText = "Start a small business";
      const existing = records.find((record): record is UserGoalRecord =>
        record.type === "USER_GOAL" && normalized(record.goal) === normalized(goalText) && record.status === "ACTIVE");
      if (existing) {
        decisions.push({ action: "IGNORE", memoryId: existing.id, reason: "An active duplicate goal already exists." });
      } else {
        const goal: UserGoalRecord = {
          id: randomUUID(),
          userId,
          type: "USER_GOAL",
          goal: goalText,
          source: "USER_EXPLICIT",
          confidence: 1,
          status: "ACTIVE",
          priority: 2,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
          progress: [],
        };
        records.push(goal);
        decisions.push({ action: "SAVE", memoryId: goal.id, reason: "The user explicitly stated an enduring business goal." });
      }
    }

    if (isBusinessRegistrationProgress(cleanText)) {
      const goal = records.find((record): record is UserGoalRecord => record.type === "USER_GOAL" &&
        record.status === "ACTIVE" && /business/i.test(record.goal));
      if (goal && !goal.progress.some((progress) => normalized(progress.summary) === "business registered")) {
        goal.progress.push({
          id: randomUUID(),
          summary: "Business registered",
          source: "USER_EXPLICIT",
          createdAt: now,
        });
        goal.updatedAt = now;
        decisions.push({ action: "UPDATE", memoryId: goal.id, reason: "Registration was recorded as progress on the active business goal." });
      }
    }

    const resolvedNeed = completedNeedFor(cleanText);
    if (resolvedNeed) {
      for (const need of records.filter((record): record is UserNeedRecord => record.type === "USER_NEED" && record.status === "ACTIVE")) {
        if (normalized(need.need).includes(resolvedNeed)) {
          need.status = "COMPLETED";
          need.updatedAt = now;
          decisions.push({ action: "UPDATE", memoryId: need.id, reason: `The user explicitly reported completing the ${resolvedNeed} need.` });
          const relatedGoal = records.find((record): record is UserGoalRecord =>
            record.type === "USER_GOAL" && record.id === need.relatedGoalId && record.status === "ACTIVE");
          const progressSummary = resolvedNeed === "funding"
            ? "Business funding secured"
            : resolvedNeed === "suppliers"
            ? "Suppliers found"
            : resolvedNeed === "customers"
            ? "Customers found"
            : "Business registered";
          if (relatedGoal && !relatedGoal.progress.some((progress) => normalized(progress.summary) === normalized(progressSummary))) {
            relatedGoal.progress.push({
              id: randomUUID(),
              summary: progressSummary,
              source: "USER_EXPLICIT",
              createdAt: now,
            });
            relatedGoal.updatedAt = now;
          }
        }
      }
    }

    const foundNeed = getNeed(cleanText);
    if (foundNeed) {
      const goal = records.find((record): record is UserGoalRecord => record.type === "USER_GOAL" &&
        record.status === "ACTIVE" && /business/i.test(record.goal));
      const previous = records.find((record): record is UserNeedRecord => record.type === "USER_NEED" &&
        normalized(record.need) === normalized(foundNeed));
      if (previous?.status === "ACTIVE") {
        decisions.push({ action: "IGNORE", memoryId: previous.id, reason: "An active duplicate need already exists." });
      } else if (previous) {
        previous.status = "ACTIVE";
        previous.updatedAt = now;
        previous.expiresAt = null;
        previous.relatedGoalId = goal?.id;
        decisions.push({ action: "UPDATE", memoryId: previous.id, reason: "A previously completed need was explicitly raised again." });
      } else {
        const need: UserNeedRecord = {
          id: randomUUID(),
          userId,
          type: "USER_NEED",
          need: foundNeed,
          relatedGoalId: goal?.id,
          source: "USER_EXPLICIT",
          confidence: 1,
          status: "ACTIVE",
          priority: 2,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
        };
        records.push(need);
        decisions.push({ action: "SAVE", memoryId: need.id, reason: "The user explicitly stated a continuing assistance need." });
      }
    }

    if (decisions.some((decision) => decision.action === "SAVE" || decision.action === "UPDATE")) {
      for (const record of records) {
        if (record.embedding && record.embeddingUpdatedAt === record.updatedAt) continue;
        const content = record.type === "USER_GOAL"
          ? `${record.goal} ${record.progress.map((progress) => progress.summary).join(" ")}`
          : record.need;
        const embedded = await embeddingProvider.embed(content);
        record.embedding = embedded.vector;
        record.embeddingSource = embedded.source;
        record.embeddingUpdatedAt = record.updatedAt;
      }
      await this.repository.save(userId, records);
    }
    if (!decisions.length) decisions.push({ action: "IGNORE", reason: "No supported explicit goal, need, or progress statement was found." });
    return decisions;
  }

  public async retrieve(userId: string, query: string, options: { limit?: number; tokenBudget?: number } = {}): Promise<UserMemoryRetrieval> {
    if (!await this.isEnabled(userId)) return { items: [], context: "", estimatedTokens: 0, method: "NONE" };
    const now = Date.now();
    const queryTerms = words(query);
    const continuation = CONTINUATION_QUERY.test(query);
    const records = (await this.repository.list(userId)).filter((record) =>
      record.status === "ACTIVE" && !isExpired(record, now));
    let queryEmbedding: Awaited<ReturnType<typeof embeddingProvider.embed>> | undefined;
    if (!continuation && records.length) {
      try {
        queryEmbedding = await embeddingProvider.embed(query);
      } catch {
        queryEmbedding = undefined;
      }
    }
    const scored = records.map((record): RetrievedUserMemory => {
      const body = record.type === "USER_GOAL"
        ? `${record.goal} ${record.progress.map((item) => item.summary).join(" ")}`
        : record.need;
      const lexical = overlap(queryTerms, body);
      const vectorSimilarity = queryEmbedding && record.embedding &&
        queryEmbedding.source === "GEMINI_EMBEDDING" &&
        queryEmbedding.source === record.embeddingSource && queryEmbedding.vector.length === record.embedding.length
        ? embeddingProvider.cosineSimilarity(queryEmbedding.vector, record.embedding)
        : 0;
      const relatedGoal = record.type === "USER_NEED" && record.relatedGoalId !== undefined;
      const continuationRelevance = continuation && (relatedGoal || record.type === "USER_GOAL")
        ? 1 / Math.sqrt(Math.max(1, words(body).size))
        : 0;
      const relevance = Math.max(lexical, vectorSimilarity, continuationRelevance);
      const ageDays = Math.max(0, (now - record.updatedAt) / 86_400_000);
      const recency = 1 / (1 + ageDays / 90);
      const priority = Math.max(0, Math.min(5, record.priority)) / 5;
      const score = relevance * record.confidence * recency * priority;
      const method = continuationRelevance > Math.max(lexical, vectorSimilarity)
        ? "CONTINUATION_RULE"
        : vectorSimilarity > lexical && queryEmbedding?.source === "GEMINI_EMBEDDING"
        ? "GEMINI_EMBEDDING"
        : "LEXICAL_FALLBACK";
      const reason = method === "CONTINUATION_RULE"
        ? "Active goal/need matched a continuation request."
        : method === "GEMINI_EMBEDDING"
        ? `Semantic embedding similarity ${vectorSimilarity.toFixed(2)}.`
        : lexical > 0
        ? `Matched ${Math.round(lexical * 100)}% of query terms.`
        : "No topical overlap with the request.";
      return { record, score, reason, method };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, options.limit ?? 5));

    const tokenBudget = Math.max(0, options.tokenBudget ?? 120);
    const items: RetrievedUserMemory[] = [];
    const lines: string[] = [];
    let estimatedTokens = 0;
    for (const item of scored) {
      const record = item.record;
      const line = record.type === "USER_GOAL"
        ? `Active goal: ${record.goal}${record.progress.length ? `; progress: ${record.progress.map((progress) => progress.summary).join(", ")}` : ""}. [${record.source}; confidence ${record.confidence.toFixed(2)}]`
        : `Outstanding need: ${record.need}${record.relatedGoalId ? " (related to an active goal)" : ""}. [${record.source}; confidence ${record.confidence.toFixed(2)}]`;
      const lineTokens = Math.ceil(line.length / 4);
      if (estimatedTokens + lineTokens > tokenBudget) continue;
      items.push(item);
      lines.push(line);
      estimatedTokens += lineTokens;
    }

    return {
      items,
      context: lines.length
        ? `USER MEMORY CONTEXT (user-stated evidence; use only when relevant, and treat as potentially outdated):\n${lines.join("\n")}`
        : "",
      estimatedTokens,
      method: !items.length
        ? "NONE"
        : items.some((item) => item.method === "GEMINI_EMBEDDING")
        ? "GEMINI_EMBEDDING"
        : items.some((item) => item.method === "CONTINUATION_RULE")
        ? "CONTINUATION_RULE"
        : "LEXICAL_FALLBACK",
    };
  }

  public async setStatus(userId: string, memoryId: string, status: UserMemoryStatus): Promise<boolean> {
    const records = await this.repository.list(userId);
    const record = records.find((item) => item.id === memoryId && item.userId === userId);
    if (!record) return false;
    record.status = status;
    record.updatedAt = Date.now();
    await this.repository.save(userId, records);
    return true;
  }

  public async forget(userId: string, memoryId?: string): Promise<boolean> {
    if (!memoryId) {
      await this.repository.clear(userId);
      return true;
    }
    const records = await this.repository.list(userId);
    const remaining = records.filter((record) => record.id !== memoryId && record.userId === userId);
    if (remaining.length === records.length) return false;
    await this.repository.save(userId, remaining);
    return true;
  }

  public async inspect(userId: string): Promise<UserMemoryRecord[]> {
    return (await this.repository.list(userId)).filter((record) => !isExpired(record, Date.now()));
  }
}

export const userGoalsMemory = new UserGoalsMemory();