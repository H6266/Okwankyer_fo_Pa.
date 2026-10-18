/**
 * Ɔkwankyerɛfo Pa - Canonical Class-Based Checklist Pipeline & Concurrency Manager
 * 
 * Implements the system architecture required by the specification:
 * 1. 9-Stage Transaction Flow Checklist:
 *    • Language
 *    • Service
 *    • Networks
 *    • Recipient
 *    • Amount
 *    • Check for reference (Telco KYC lookup: reports registered subscriber name & amount)
 *    • Pin gate security (PIN buffer ending in #, zero-exposure)
 *    • Initiate transaction (Only when all checklist items pass)
 *    • Report back state (Transaction receipt & reference number)
 * 2. Sequential Resource Queue: Eliminates resource competition between audio, AI, network, and state.
 * 3. Keypad Buffer Manager: Buffers phone numbers and PINs until '#' is received; provides mismatch error prompts.
 * 4. Conversation Takeover Detector: Detects transition from keypad to conversational speech, handing control to AI.
 * 5. AI Handshake Pipeline: Wrapped in try/catch cascade (Gemini -> OpenAI -> Qwen -> Local Brain) for both reasoning and audio selection.
 * 6. Telco KYC Reference Service: Calls KYC API and formats bilingual verification readback.
 */

import { GhanaianNetwork, validateGhanaPhoneNumber, parseAndValidateAmount } from "./validation";
import { TransactionSession, transactionStateMachine } from "./stateMachine";
import { recipientResolver, RecipientResolutionResult } from "../providers/recipient/RecipientResolver";
import { UnifiedGeminiClient } from "../services/geminiClient";
import { openaiClient } from "../services/openai/openaiClient";
import { qwenClient } from "../services/qwen/qwenClient";
import { localLanguageBrain } from "../ai_system/providers/LocalLanguageBrain";
import { auditLogger } from "../services/auditLogger";

// ── 1. The 9 Canonical Checklist Stages ─────────────────────────────────────
export type ChecklistStageId =
  | "STAGE_1_LANGUAGE"
  | "STAGE_2_SERVICE"
  | "STAGE_3_NETWORKS"
  | "STAGE_4_RECIPIENT"
  | "STAGE_5_AMOUNT"
  | "STAGE_6_REFERENCE_KYC"
  | "STAGE_7_PIN_GATE"
  | "STAGE_8_INITIATE_TRANSACTION"
  | "STAGE_9_REPORT_STATE";

export interface StageStatus {
  id: ChecklistStageId;
  name: string;
  order: number;
  completed: boolean;
  valueDescription?: string;
}

export interface ChecklistVerification {
  isReadyForInitiation: boolean;
  currentStage: ChecklistStageId;
  stages: Record<ChecklistStageId, StageStatus>;
  missingStages: ChecklistStageId[];
  errorFeedback?: {
    en: string;
    twi: string;
  };
}

// ── 2. Sequential Resource Queue (Eliminates Resource Competition) ──────────
export class SequentialResourceQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing: boolean = false;
  private readonly queueName: string;

  constructor(queueName: string = "ResourceQueue") {
    this.queueName = queueName;
  }

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } catch (err: any) {
          console.warn(`[SequentialResourceQueue:${this.queueName}] Task error caught:`, err?.message || err);
        }
      }
    }

    this.isProcessing = false;
  }

  public size(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
  }
}

// Shared singleton queues for system resources
export const aiResourceQueue = new SequentialResourceQueue("AiEngine");
export const audioPlaybackQueue = new SequentialResourceQueue("AudioPlayback");
export const kycNetworkQueue = new SequentialResourceQueue("KycNetwork");
export const statePersistenceQueue = new SequentialResourceQueue("StatePersistence");

// ── 3. Keypad Buffer & Input Contract Manager ──────────────────────────────
export interface KeypadBufferResult {
  isComplete: boolean;
  bufferedValue: string;
  submittedValue?: string;
  isValidParameter: boolean;
  mismatchFeedback?: {
    en: string;
    twi: string;
  };
}

export class KeypadBufferManager {
  private static buffers = new Map<string, string>();

  /**
   * Appends a digit or processes '#' submission.
   * Number and PIN keys must NOT be processed until the user presses '#'.
   */
  public static appendDigit(
    sessionId: string,
    key: string,
    fieldType: "single_digit" | "phone_number" | "amount" | "pin",
    acceptedSingleDigits: string[] = ["1", "2", "9", "0"]
  ): KeypadBufferResult {
    const cleanKey = key.trim();
    const currentBuf = this.buffers.get(sessionId) || "";

    // 1. Single-digit choice (e.g. language, service, network, or confirmation menu)
    if (fieldType === "single_digit") {
      this.clearBuffer(sessionId);
      const isAccepted = acceptedSingleDigits.includes(cleanKey);
      if (!isAccepted) {
        return {
          isComplete: true,
          bufferedValue: cleanKey,
          submittedValue: cleanKey,
          isValidParameter: false,
          mismatchFeedback: {
            en: "The answer you gave doesn't tally, I will mention the audio again please choose the answer again.",
            twi: "Mmuaeɛ a wode maa no nnyɛ pɛpɛɛpɛ, mɛbɔ nne no bio mesrɛ wo paw mmuaeɛ no bio.",
          },
        };
      }
      return {
        isComplete: true,
        bufferedValue: cleanKey,
        submittedValue: cleanKey,
        isValidParameter: true,
      };
    }

    // 2. Multi-digit fields (phone number, amount, PIN): Buffer until '#'
    if (cleanKey === "#") {
      const finalValue = currentBuf.trim();
      this.clearBuffer(sessionId);
      return {
        isComplete: true,
        bufferedValue: "",
        submittedValue: finalValue,
        isValidParameter: Boolean(finalValue.length > 0),
      };
    }

    // Accumulate digits (support digits 0-9 and * for pesewas)
    if (/^[0-9*]$/.test(cleanKey)) {
      const updated = currentBuf + cleanKey;
      this.buffers.set(sessionId, updated);
      return {
        isComplete: false,
        bufferedValue: updated,
        isValidParameter: true,
      };
    }

    return {
      isComplete: false,
      bufferedValue: currentBuf,
      isValidParameter: false,
      mismatchFeedback: {
        en: "The answer you gave doesn't tally, I will mention the audio again please choose the answer again.",
        twi: "Mmuaeɛ a wode maa no nnyɛ pɛpɛɛpɛ, mɛbɔ nne no bio mesrɛ wo paw mmuaeɛ no bio.",
      },
    };
  }

  public static getBuffer(sessionId: string): string {
    return this.buffers.get(sessionId) || "";
  }

  public static clearBuffer(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}

// ── 4. Conversation Takeover Detector ──────────────────────────────────────
export class ConversationTakeoverDetector {
  /**
   * Detects when the user switches from keypad to natural conversational speech.
   * e.g., "I don't want this", "I have that", "send fifty cedis to Kwame".
   */
  public static isConversationalInput(input: string, currentStep: string): boolean {
    if (!input || typeof input !== "string") return false;
    const clean = input.trim();

    // Pure DTMF digits with optional '#' or '*' is NOT a conversational takeover
    if (/^[0-9*#\s]+$/.test(clean)) {
      return false;
    }

    // Single spoken digit or navigation words on a menu step remain guided IVR
    const isSingleDigitSpoken = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron)$/i.test(clean);
    if (isSingleDigitSpoken && ["language-selection", "voice-menu", "service-select", "provider-select"].includes(currentStep)) {
      return false;
    }

    // Spoken conversational indicators
    const conversationalPatterns = [
      /\b(i don'?t want|i want|send|transfer|please|no|yes|change|money|cedis|ghs)\b/i,
      /\b(mepɛ|memane|sika|dabi|aane|sesa|mesrɛ wo|ennyɛ|ɛnnyɛ)\b/i,
      /\b(kwame|kofi|ama|yaw|abena|akua|afia|kwasi|adwoa|mensah|boateng|osei)\b/i,
      /\b(instead|different|help|what|why|who|cancel this|stop this)\b/i,
    ];

    return conversationalPatterns.some((pattern) => pattern.test(clean)) || clean.split(/\s+/).length >= 2;
  }
}

// ── 5. Telco KYC Reference Service (Stage 6) ────────────────────────────────
export interface KycReferenceResult {
  verified: boolean;
  recipientName: string | null;
  recipientPhone: string;
  network: GhanaianNetwork | null;
  spokenReadback: {
    en: string;
    twi: string;
  };
}

export class TelcoKycReferenceService {
  /**
   * Calls specific telco KYC lookup and reports back registered subscriber name.
   */
  public static async verifyAndBuildReference(
    recipientPhone: string,
    amount: number,
    sessionNetwork?: GhanaianNetwork | null
  ): Promise<KycReferenceResult> {
    return kycNetworkQueue.enqueue(async () => {
      try {
        const val = validateGhanaPhoneNumber(recipientPhone);
        if (!val.valid || !val.normalized) {
          throw new Error(val.error || "Invalid phone number format.");
        }

        const lookup: RecipientResolutionResult = await recipientResolver.resolve(val.normalized);
        const name = lookup.name || null;
        const verified = Boolean(lookup.verified && name);
        const activeNet = lookup.network || sessionNetwork || "MTN";

        // Readback prompt: "You are about to send [Amount] Cedis to [Recipient Name] on [Phone Number]. The registered name on this account is [Recipient Name]. Press 1 to confirm, or 2 to change."
        const enReadback = `You are about to send ${amount} Cedis to ${name || "this recipient"} on ${val.normalized}. The registered name on this account is ${name || "Verified MoMo User"}. Press 1 to confirm, or 2 to change.`;
        const twiReadback = `Worebɛmane GHS ${amount} akɔma ${name || "recipient yi"} wɔ ${val.normalized}. Edin a ɛwɔ so ne ${name || "Verified MoMo User"}. Mia 1 sɛ wopene so, anaa 2 sɛ wopɛ sɛ wosakra.`;

        return {
          verified,
          recipientName: name,
          recipientPhone: val.normalized,
          network: activeNet,
          spokenReadback: {
            en: enReadback,
            twi: twiReadback,
          },
        };
      } catch (err: any) {
        console.warn("[TelcoKycReferenceService] KYC error:", err?.message || err);
        return {
          verified: false,
          recipientName: null,
          recipientPhone,
          network: sessionNetwork || null,
          spokenReadback: {
            en: `We could not verify the registered name for ${recipientPhone}. Press 2 to change the number, or 0 to exit.`,
            twi: `Yɛantumi anhu din a ɛwɔ ${recipientPhone} so. Mia 2 na sesa nɔmba no, anaa mia 0 na woapue.`,
          },
        };
      }
    });
  }
}

// ── 6. AI Handshake Pipeline (Gemini -> OpenAI -> Qwen -> Local Brain) ──────
export interface AiHandshakeResponse<T = any> {
  providerUsed: "gemini" | "openai" | "qwen" | "local_brain";
  success: boolean;
  data: T;
  fallbackOccurred: boolean;
  error?: string;
}

export class AiHandshakePipeline {
  /**
   * Executes AI reasoning with automatic try/catch cascade across models.
   */
  public static async executeWithCascade<T>(
    operationName: string,
    geminiFn: () => Promise<T>,
    openAiFn: () => Promise<T>,
    qwenFn: () => Promise<T>,
    localBrainFn: () => T | Promise<T>
  ): Promise<AiHandshakeResponse<T>> {
    return aiResourceQueue.enqueue(async () => {
      // 1. Try Gemini
      try {
        const geminiClient = UnifiedGeminiClient.getInstance("telephony");
        if (geminiClient.isAvailable()) {
          const res = await geminiFn();
          if (res !== undefined && res !== null) {
            return {
              providerUsed: "gemini",
              success: true,
              data: res,
              fallbackOccurred: false,
            };
          }
        }
      } catch (geminiErr: any) {
        console.warn(`[AiHandshake:${operationName}] Gemini failed, falling to OpenAI:`, geminiErr?.message || geminiErr);
        auditLogger.log("warn", "AI", `Gemini API quota/network error: ${geminiErr?.message || geminiErr}. Initiating OpenAI handshake.`);
      }

      // 2. Try OpenAI (gpt-4o-mini)
      try {
        if (openaiClient.isAvailable()) {
          const res = await openAiFn();
          if (res !== undefined && res !== null) {
            return {
              providerUsed: "openai",
              success: true,
              data: res,
              fallbackOccurred: true,
            };
          }
        }
      } catch (openAiErr: any) {
        console.warn(`[AiHandshake:${operationName}] OpenAI failed, falling to Qwen:`, openAiErr?.message || openAiErr);
        auditLogger.log("warn", "AI", `OpenAI API quota/network error: ${openAiErr?.message || openAiErr}. Initiating Qwen handshake.`);
      }

      // 3. Try Qwen (qwen-plus)
      try {
        if (qwenClient.isAvailable()) {
          const res = await qwenFn();
          if (res !== undefined && res !== null) {
            return {
              providerUsed: "qwen",
              success: true,
              data: res,
              fallbackOccurred: true,
            };
          }
        }
      } catch (qwenErr: any) {
        console.warn(`[AiHandshake:${operationName}] Qwen failed, falling to Local Brain:`, qwenErr?.message || qwenErr);
        auditLogger.log("warn", "AI", `Qwen API error: ${qwenErr?.message || qwenErr}. Initiating Local Ghanaian Brain.`);
      }

      // 4. Infallible Local Brain System
      try {
        const res = await localBrainFn();
        return {
          providerUsed: "local_brain",
          success: true,
          data: res,
          fallbackOccurred: true,
        };
      } catch (localErr: any) {
        console.error(`[AiHandshake:${operationName}] All AI systems including local failed:`, localErr);
        throw localErr;
      }
    });
  }
}

// ── 7. Checklist Stage Manager (Enforces 9-Stage Flow Gate) ─────────────────
export class ChecklistStageManager {
  /**
   * Evaluates the current state of a transaction against the 9 stages.
   * Until all prerequisites in stages 1 to 7 are satisfied, transactions are strictly blocked.
   */
  public static verifySession(session?: TransactionSession | null): ChecklistVerification {
    if (!session) {
      const emptyStages: Record<ChecklistStageId, StageStatus> = {
        STAGE_1_LANGUAGE: { id: "STAGE_1_LANGUAGE", name: "Language Selection", order: 1, completed: false },
        STAGE_2_SERVICE: { id: "STAGE_2_SERVICE", name: "Service Selection", order: 2, completed: false },
        STAGE_3_NETWORKS: { id: "STAGE_3_NETWORKS", name: "Network Selection", order: 3, completed: false },
        STAGE_4_RECIPIENT: { id: "STAGE_4_RECIPIENT", name: "Recipient Details", order: 4, completed: false },
        STAGE_5_AMOUNT: { id: "STAGE_5_AMOUNT", name: "Amount Entry", order: 5, completed: false },
        STAGE_6_REFERENCE_KYC: { id: "STAGE_6_REFERENCE_KYC", name: "Check for Reference (Telco KYC)", order: 6, completed: false },
        STAGE_7_PIN_GATE: { id: "STAGE_7_PIN_GATE", name: "PIN Gate Security", order: 7, completed: false },
        STAGE_8_INITIATE_TRANSACTION: { id: "STAGE_8_INITIATE_TRANSACTION", name: "Initiate Transaction", order: 8, completed: false },
        STAGE_9_REPORT_STATE: { id: "STAGE_9_REPORT_STATE", name: "Report Back State", order: 9, completed: false },
      };
      return {
        isReadyForInitiation: false,
        currentStage: "STAGE_1_LANGUAGE",
        stages: emptyStages,
        missingStages: Object.keys(emptyStages) as ChecklistStageId[],
        errorFeedback: {
          en: "No active transaction session. Please start over.",
          twi: "Dwumadie biara nni hɔ. Yɛsrɛ wo hyɛ aseɛ foforɔ.",
        },
      };
    }

    const s1Lang = session.language === "en" || session.language === "twi";
    const s2Service = Boolean(session.serviceSelected);
    const s3Network = session.network !== null && session.network !== undefined;
    const s4Recipient = Boolean(session.recipientPhone && session.recipientPhone.length === 10);
    const s5Amount = typeof session.amount === "number" && session.amount > 0;
    const s6ReferenceKyc = Boolean(session.isRecipientVerified && session.recipientName);
    const s7PinGate = Boolean(session.pinGatePassed);
    const s8Initiated = Boolean(session.transactionInitiated || session.state === "COMPLETED");
    const s9Reported = Boolean(session.stateReported || session.completedAt);

    const stages: Record<ChecklistStageId, StageStatus> = {
      STAGE_1_LANGUAGE: {
        id: "STAGE_1_LANGUAGE",
        name: "Language Selection",
        order: 1,
        completed: s1Lang,
        valueDescription: session.language ? (session.language === "twi" ? "Twi" : "English") : undefined,
      },
      STAGE_2_SERVICE: {
        id: "STAGE_2_SERVICE",
        name: "Service Selection",
        order: 2,
        completed: s2Service,
        valueDescription: s2Service ? "Mobile Money Transfer" : undefined,
      },
      STAGE_3_NETWORKS: {
        id: "STAGE_3_NETWORKS",
        name: "Network Selection",
        order: 3,
        completed: s3Network,
        valueDescription: session.network || undefined,
      },
      STAGE_4_RECIPIENT: {
        id: "STAGE_4_RECIPIENT",
        name: "Recipient Details",
        order: 4,
        completed: s4Recipient,
        valueDescription: session.recipientPhone || undefined,
      },
      STAGE_5_AMOUNT: {
        id: "STAGE_5_AMOUNT",
        name: "Amount Entry",
        order: 5,
        completed: s5Amount,
        valueDescription: session.amount ? `GHS ${session.amount}` : undefined,
      },
      STAGE_6_REFERENCE_KYC: {
        id: "STAGE_6_REFERENCE_KYC",
        name: "Check for Reference (Telco KYC)",
        order: 6,
        completed: s6ReferenceKyc,
        valueDescription: session.recipientName ? `${session.recipientName} (Verified)` : undefined,
      },
      STAGE_7_PIN_GATE: {
        id: "STAGE_7_PIN_GATE",
        name: "PIN Gate Security",
        order: 7,
        completed: s7PinGate,
        valueDescription: s7PinGate ? "Authorized via Handset PIN Gate" : undefined,
      },
      STAGE_8_INITIATE_TRANSACTION: {
        id: "STAGE_8_INITIATE_TRANSACTION",
        name: "Initiate Transaction",
        order: 8,
        completed: s8Initiated,
        valueDescription: session.momoReferenceId || undefined,
      },
      STAGE_9_REPORT_STATE: {
        id: "STAGE_9_REPORT_STATE",
        name: "Report Back State",
        order: 9,
        completed: s9Reported,
        valueDescription: session.state,
      },
    };

    // Calculate first uncompleted stage
    let currentStage: ChecklistStageId = "STAGE_9_REPORT_STATE";
    const missingStages: ChecklistStageId[] = [];

    const orderedKeys: ChecklistStageId[] = [
      "STAGE_1_LANGUAGE",
      "STAGE_2_SERVICE",
      "STAGE_3_NETWORKS",
      "STAGE_4_RECIPIENT",
      "STAGE_5_AMOUNT",
      "STAGE_6_REFERENCE_KYC",
      "STAGE_7_PIN_GATE",
      "STAGE_8_INITIATE_TRANSACTION",
      "STAGE_9_REPORT_STATE",
    ];

    let foundFirstIncomplete = false;
    for (const key of orderedKeys) {
      if (!stages[key].completed) {
        missingStages.push(key);
        if (!foundFirstIncomplete) {
          currentStage = key;
          foundFirstIncomplete = true;
        }
      }
    }

    const isReadyForInitiation = s1Lang && s2Service && s3Network && s4Recipient && s5Amount && s6ReferenceKyc && s7PinGate;

    return {
      isReadyForInitiation,
      currentStage,
      stages,
      missingStages,
      ...(isReadyForInitiation
        ? {}
        : {
            errorFeedback: {
              en: `Checklist incomplete. Missing requirement: ${stages[currentStage].name}.`,
              twi: `Nsɛm a ɛhia no nwiei. Deɛ ɛka ne: ${stages[currentStage].name}.`,
            },
          }),
    };
  }

  /**
   * Strict Gate: Throws or reports error feedback if initiation is attempted before stages 1-7 pass.
   */
  public static assertCanInitiate(session: TransactionSession): void {
    const check = this.verifySession(session);
    if (!check.isReadyForInitiation) {
      const missingName = check.stages[check.currentStage].name;
      throw new Error(`Cannot initiate transaction. Checklist Gate failed: ${missingName} (Stage ${check.stages[check.currentStage].order}) is incomplete.`);
    }
  }
}
