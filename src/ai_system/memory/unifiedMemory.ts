/**
 * Ɔkwankyerɛfo Pa - Canonical Unified Memory System (unifiedMemory.ts)
 *
 * Single authoritative implementation uniting:
 * 1. Working Memory (active slots & turn state)
 * 2. Session Memory (durable session bridge)
 * 3. Task Memory (interruptible task stack & drafts)
 * 4. Episodic Memory (turn-by-turn history)
 * 5. Semantic Memory (vector embedding & cosine similarity retrieval)
 * 6. User Preferences (cross-session persistence)
 * 7. Pronunciation Memory (custom Ghanaian phonetics)
 * 8. Transaction Memory (audit ledger)
 *
 * Strictly enforces INVARIANT_002: PIN never reaches persistent memory.
 */

import {
  ConversationTurnRecord,
  CorrectionRecord,
  EntitySlotMap,
  IntentName,
  MobileNetwork,
  TaskState,
  TransactionDraft,
  TransactionalMemoryRecord,
  UserProfileData,
} from "../core/aiTypes";
import {
  CachedSessionRecord,
  IConversationRepository,
  IPreferenceRepository,
  IPronunciationRepository,
  ISemanticMemoryRepository,
  ISessionRepository,
  ITaskStateRepository,
  ITransactionRepository,
} from "./repositoryInterfaces";
import {
  InMemoryConversationRepository,
  InMemoryPreferenceRepository,
  InMemoryPronunciationRepository,
  InMemorySemanticMemoryRepository,
  InMemorySessionRepository,
  InMemoryTransactionRepository,
  InMemoryTaskStateRepository,
} from "./inMemoryRepositories";
import {
  DurableFileConversationRepository,
  DurableFilePreferenceRepository,
  DurableFilePronunciationRepository,
  DurableFileSemanticMemoryRepository,
  DurableFileSessionRepository,
  DurableFileTransactionRepository,
  DurableFileTaskStateRepository,
} from "./durableFileRepositories";
import { AI_CONFIG } from "../core/aiConfig";
import { fieldEncryption } from "../security/fieldEncryption";
import { embeddingProvider } from "./embeddingProvider";

export class UnifiedMemory {
  // Working memory (transient during active session)
  private workingSlots = new Map<string, EntitySlotMap>();

  private taskRepo: ITaskStateRepository;

  // Correction ledger: sessionId -> CorrectionRecord[]
  private correctionLedger = new Map<string, CorrectionRecord[]>();

  // Repositories (Pluggable: File in prod/durable, In-Memory in test)
  public sessionRepo: ISessionRepository;
  public conversationRepo: IConversationRepository;
  public preferenceRepo: IPreferenceRepository;
  public transactionRepo: ITransactionRepository;
  public pronunciationRepo: IPronunciationRepository;
  public semanticRepo: ISemanticMemoryRepository;

  constructor(isDurable: boolean = process.env.NODE_ENV === "production") {
    if (isDurable) {
      this.sessionRepo = new DurableFileSessionRepository();
      this.conversationRepo = new DurableFileConversationRepository();
      this.preferenceRepo = new DurableFilePreferenceRepository();
      this.transactionRepo = new DurableFileTransactionRepository();
      this.taskRepo = new DurableFileTaskStateRepository();
      this.pronunciationRepo = new DurableFilePronunciationRepository();
      this.semanticRepo = new DurableFileSemanticMemoryRepository();
    } else {
      this.sessionRepo = new InMemorySessionRepository();
      this.conversationRepo = new InMemoryConversationRepository();
      this.preferenceRepo = new InMemoryPreferenceRepository();
      this.transactionRepo = new InMemoryTransactionRepository();
      this.taskRepo = new InMemoryTaskStateRepository();
      this.pronunciationRepo = new InMemoryPronunciationRepository();
      this.semanticRepo = new InMemorySemanticMemoryRepository();
    }
  }

  // =========================================================================
  // 1. WORKING & SESSION MEMORY
  // =========================================================================

  public async getSession(sessionId: string): Promise<CachedSessionRecord | null> {
    return this.sessionRepo.get(sessionId);
  }

  public async saveSession(session: CachedSessionRecord): Promise<void> {
    // Assert INVARIANT_002: no PIN in slots
    this.sanitizeSlotsBeforeStorage(session.slots);
    await this.sessionRepo.save(session);
  }

  public getWorkingSlots(sessionId: string): EntitySlotMap {
    return { ...(this.workingSlots.get(sessionId) || {}) };
  }

  public updateWorkingSlots(sessionId: string, slots: Partial<EntitySlotMap>): void {
    this.sanitizeSlotsBeforeStorage(slots);
    const existing = this.workingSlots.get(sessionId) || {};
    this.workingSlots.set(sessionId, { ...existing, ...slots });
  }

  // =========================================================================
  // 2. EPISODIC & SEMANTIC TURN RECORDING
  // =========================================================================

  public async recordTurn(sessionId: string, turn: Omit<ConversationTurnRecord, "turnId" | "timestamp">): Promise<ConversationTurnRecord> {
    this.sanitizeSlotsBeforeStorage(turn.slots);

    const history = await this.conversationRepo.getHistory(sessionId);
    const turnRecord: ConversationTurnRecord = {
      ...turn,
      turnId: `turn_${Date.now()}_${history.length + 1}`,
      timestamp: Date.now(),
    };

    await this.conversationRepo.append(sessionId, turnRecord);

    // Generate embedding via EmbeddingProvider (or use supplied vector)
    const embeddingRes = turn.embeddingVector
      ? { vector: turn.embeddingVector, source: "GEMINI_EMBEDDING" as const }
      : await embeddingProvider.embed(turn.sanitizedInput);

    await this.semanticRepo.storeVector({
      id: turnRecord.turnId,
      sessionId,
      turnIndex: history.length,
      text: turn.sanitizedInput,
      embedding: embeddingRes.vector,
      timestamp: turnRecord.timestamp,
    });

    return turnRecord;
  }

  public async getConversationHistory(sessionId: string): Promise<ConversationTurnRecord[]> {
    return this.conversationRepo.getHistory(sessionId);
  }

  // =========================================================================
  // 3. SEMANTIC MEMORY RETRIEVAL (Vector Cosine Similarity)
  // =========================================================================

  public async searchSemanticMemory(sessionId: string, query: string, topK: number = 3): Promise<ConversationTurnRecord[]> {
    const queryEmbedding = await embeddingProvider.embed(query);
    const matches = await this.semanticRepo.searchSimilar(sessionId, queryEmbedding.vector, topK);
    const history = await this.conversationRepo.getHistory(sessionId);

    return matches.map(m => history[m.turnIndex]).filter(Boolean);
  }

  // =========================================================================
  // 4. TASK MEMORY & DRAFT MANAGEMENT
  // =========================================================================

  public setPrimaryTask(sessionId: string, intent: IntentName, initialSlots: EntitySlotMap, step: string): TaskState {
    this.sanitizeSlotsBeforeStorage(initialSlots);
    const task: TaskState = {
      taskId: `task_${Date.now()}`,
      intent,
      slots: { ...initialSlots },
      currentStep: step,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.taskRepo.set(sessionId, [task]);
    return task;
  }

  public interruptWithTask(sessionId: string, newIntent: IntentName): TaskState {
    const stack = this.taskRepo.get(sessionId);
    const current = stack[stack.length - 1];

    if (current) {
      current.interruptedBy = newIntent;
      current.resumptionStep = current.currentStep;

      const recipient = current.slots.recipientName || current.slots.recipientPhone || "your contact";
      const amtStr = current.slots.amount ? `GHS ${current.slots.amount}` : "the transfer";

      current.resumptionPrompt = {
        en: `Now that we checked your balance, would you like to continue sending ${amtStr} to ${recipient}?`,
        twi: `Afei a yɛahwɛ wo balance awie yi, wobɛpɛ sɛ yɛtoaso mane sika ${amtStr} no kɔma ${recipient}?`,
      };
    }

    const subTask: TaskState = {
      taskId: `subtask_${Date.now()}`,
      intent: newIntent,
      slots: {},
      currentStep: "initial",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    stack.push(subTask);
    this.taskRepo.set(sessionId, stack);
    return subTask;
  }

  public completeAndResume(sessionId: string): TaskState | null {
    const stack = this.taskRepo.get(sessionId);
    if (stack.length <= 1) return stack[0] || null;

    stack.pop(); // Pop finished sub-task
    const resumed = stack[stack.length - 1];
    if (resumed) resumed.updatedAt = Date.now();
    this.taskRepo.set(sessionId, stack);
    return resumed || null;
  }

  public getActiveTask(sessionId: string): TaskState | null {
    const stack = this.taskRepo.get(sessionId);
    return stack.length > 0 ? stack[stack.length - 1] : null;
  }

  public getInterruptedTask(sessionId: string): TaskState | null {
    const stack = this.taskRepo.get(sessionId);
    return stack.length > 1 ? stack[stack.length - 2] : null;
  }

  public createTransactionDraft(sessionId: string, operation: "TRANSFER" | "AIRTIME" | "BILL_PAYMENT" | "CASH_OUT", slots: EntitySlotMap): TransactionDraft {
    const active = this.getActiveTask(sessionId);
    const draft: TransactionDraft = {
      draftId: `draft_${Date.now()}`,
      version: 1,
      sessionId,
      operation,
      recipientName: slots.recipientName || undefined,
      recipientPhone: slots.recipientPhone || undefined,
      amount: slots.amount ? Number(slots.amount) : undefined,
      network: slots.network || undefined,
      currency: "GHS",
      confirmationState: "UNCONFIRMED",
      createdAt: Date.now(),
      expiresAt: Date.now() + AI_CONFIG.confirmationTtlMs,
    };

    if (active) {
      active.draft = draft;
      const stack = this.taskRepo.get(sessionId);
      this.taskRepo.set(sessionId, stack);
    }
    return draft;
  }

  public saveDraft(sessionId: string, draft: TransactionDraft): void {
    const stack = this.taskRepo.get(sessionId);
    const active = stack[stack.length - 1];
    if (!active) return;
    active.draft = draft;
    this.taskRepo.set(sessionId, stack);
  }

  public updateDraftWithCorrection(sessionId: string, field: string, newValue: any): TransactionDraft | null {
    const active = this.getActiveTask(sessionId);
    if (!active?.draft) return null;

    // INVARIANT_006: Amount or recipient change increments version and invalidates existing confirmation
    active.draft.version = (active.draft.version || 1) + 1;
    (active.draft as any)[field] = newValue;
    active.draft.confirmationState = "UNCONFIRMED"; // requires fresh confirmation
    active.draft.expiresAt = Date.now() + AI_CONFIG.confirmationTtlMs;
    const stack = this.taskRepo.get(sessionId);
    this.taskRepo.set(sessionId, stack);

    return active.draft;
  }

  // =========================================================================
  // 5. CORRECTION TRACKING
  // =========================================================================

  public recordCorrection(sessionId: string, field: string, oldValue: any, newValue: any, reason: string): CorrectionRecord {
    let corrections = this.correctionLedger.get(sessionId);
    if (!corrections) {
      corrections = [];
      this.correctionLedger.set(sessionId, corrections);
    }

    const record: CorrectionRecord = {
      timestamp: Date.now(),
      field,
      oldValue,
      newValue,
      reason,
      turnIndex: (this.workingSlots.get(sessionId)?.turnCount as any) || 0,
    };
    corrections.push(record);

    // Update active working slots & draft
    const working = this.workingSlots.get(sessionId) || {};
    working[field] = newValue;
    working.correctionField = field;
    working.previousValue = oldValue;
    working.correctionReason = reason;
    this.workingSlots.set(sessionId, working);

    this.updateDraftWithCorrection(sessionId, field, newValue);
    return record;
  }

  public getCorrections(sessionId: string): CorrectionRecord[] {
    return this.correctionLedger.get(sessionId) || [];
  }

  // =========================================================================
  // 6. TRANSACTION AUDIT LEDGER
  // =========================================================================

  public async recordTransaction(sessionId: string, transaction: {
    referenceId: string;
    type: string;
    amount: number;
    recipientPhone: string;
    recipientName: string;
    network: MobileNetwork;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "BLOCKED" | "FAILED";
    source: "real_provider" | "mock_sandbox" | "demo_simulator";
  }): Promise<TransactionalMemoryRecord> {
    const maskedPhone = transaction.recipientPhone.length >= 7
      ? `${transaction.recipientPhone.substring(0, 3)}****${transaction.recipientPhone.substring(transaction.recipientPhone.length - 3)}`
      : transaction.recipientPhone;

    const record: TransactionalMemoryRecord = {
      referenceId: transaction.referenceId,
      timestamp: Date.now(),
      type: transaction.type,
      amount: transaction.amount,
      currency: "GHS",
      recipientPhoneMasked: maskedPhone,
      recipientName: transaction.recipientName,
      network: transaction.network,
      status: transaction.status,
      source: transaction.source,
      encryptedSlotData: fieldEncryption.encryptSensitiveJson({ ref: transaction.referenceId, amt: transaction.amount, ph: maskedPhone }),
    };

    await this.transactionRepo.record(sessionId, record);
    return record;
  }

  // =========================================================================
  // 7. USER PREFERENCES & PRONUNCIATIONS
  // =========================================================================

  public async getPreferences(userId: string): Promise<UserProfileData | null> {
    return this.preferenceRepo.get(userId);
  }

  public async savePreferences(userId: string, prefs: UserProfileData): Promise<void> {
    await this.preferenceRepo.save(userId, prefs);
  }

  public async getPronunciation(userId: string | undefined, word: string): Promise<string | null> {
    return this.pronunciationRepo.get(userId, word);
  }

  public async setPronunciation(userId: string, word: string, phonetic: string): Promise<void> {
    await this.pronunciationRepo.set(userId, word, phonetic);
  }

  // =========================================================================
  // 8. SECURITY: INVARIANT_002 ENFORCEMENT
  // =========================================================================

  private sanitizeSlotsBeforeStorage(slots: Partial<EntitySlotMap>): void {
    const forbiddenKeys = ["pin", "momo_pin", "password", "secret", "otp", "auth_token"];
    for (const key of Object.keys(slots)) {
      const lower = key.toLowerCase();
      for (const forbidden of forbiddenKeys) {
        if (lower.includes(forbidden)) {
          delete (slots as any)[key];
          throw new Error(`SECURITY_INVARIANT_VIOLATION: INVARIANT_002 - PIN or credential '${key}' cannot be stored in persistent memory.`);
        }
      }
    }
  }

  public async clearSession(sessionId: string): Promise<void> {
    this.workingSlots.delete(sessionId);
    this.taskRepo.delete(sessionId);
    this.correctionLedger.delete(sessionId);
    await Promise.all([
      this.sessionRepo.delete(sessionId),
      this.conversationRepo.clear(sessionId),
      this.transactionRepo.clear(sessionId),
      this.semanticRepo.clear(sessionId),
    ]);
  }
}

export const unifiedMemory = new UnifiedMemory();
