/**
 * Ɔkwankyerɛfo Pa - Central Reasoning Brain (brain.ts)
 * 
 * Sits directly between ASR and TTS:
 * 1. UNDERSTAND: Resolves intent and slots using caller's language.
 *    - Zero-PIN guard runs BEFORE any model sees text; PINs are immediately blocked and discarded.
 *    - Untrusted transcript isolation: Raw caller speech is passed inside explicit quotes/delimiters,
 *      never as instructions.
 *    - Hard model timeout (configurable, default 1500ms) with seamless offline fallback.
 *    - Skip model when Tier 1/2 deterministic confidence is above threshold.
 * 2. SETTLE: If intent or required slot is ambiguous, missing, or low confidence, asks for clarification.
 *    - Deterministic grounding check: Model amounts/phones are validated against numberDecoder;
 *      disagreements trigger clarification instead of guessing.
 *    - Ambiguous Akan compound amounts (e.g. "mpem ahanu ne aduonum") clarify via keypad, never pick one.
 *    - Amounts above maxTransferAmount get keypad entry.
 *    - recomputeMissingSlots(): Code recomputes missing slots and overrides any hallucinated model slot questions.
 * 3. GATE: Checks settled intent against Service Registry summary (Available vs Not Yet Available).
 * 4. DISPATCH: If service is ready, slots are filled, and caller explicitly confirmed, executes handoff.
 * 5. REPLY: Produces and validates one spoken sentence in caller's language ready for TTS.
 */

import crypto from 'crypto';
import {
  BrainDecision,
  BrainInput,
  BrainMode,
  BrainOutput,
  DraftState,
  IntentId,
  LanguageId,
  ModelOutputContract,
  Slots,
  TargetLanguageId,
} from './types';
import { serviceRegistry } from './serviceRegistry';
import { languagePolicy } from './languagePolicy';
import { replyComposer, convertAmountToSpokenWords } from './replyComposer';
import { contextualReasoningEngine } from '../understanding/contextualReasoningEngine';
import { reasoningEngine } from '../understanding/reasoningEngine';
import { numberDecoder } from '../speech/asr/numberDecoder';
import { inputNormalizer } from '../perception/inputNormalizer';
import { shadowEngine } from './shadowEngine';
import {
  APPROVED_KEYPAD_FALLBACK_PROMPT,
  numberConfig,
} from '../linguistic/twiNumberWords';
import {
  getLanguageProfile,
  formatProfilePromptSection,
} from './languageProfiles';
import { geminiClient } from '../../services/geminiClient';
import {
  APPROVED_REPLY_TEMPLATES,
  getApprovedTemplateText,
  findTemplateKeyByText,
} from './replyTemplates';
import { ivrDecisionEngine, type IvrDecision, type IvrTurnContext, type IvrDecisionType } from './ivrDecisionEngine';

// Ensure MoMo services are registered
import '../../services/momo';
import { pilotControls } from '../../services/pilotControls';
import { pilotMetrics } from '../../services/pilotMetrics';
import { normalizeGhanaPhoneNumber } from '../../domain/validation';

export interface BrainConfig {
  mode: BrainMode;
  shadowSamplingRate: number; // Configurable sampling rate 0.0 - 1.0 (default 1.0)
  confidenceThreshold: number;
  ambiguityMargin: number;
  modelTimeoutMs: number; // Hard model timeout (default 1500ms)
  skipModelTierConfidence: number; // Legacy compatibility setting; live mode now calls Gemini before deterministic interpretation.
  maxTransferAmount: number; // Single transaction limit cap (default 5000 GHS)
  modelName: string; // Configurable model name - no literal strings in brain logic
}

export function validateProductionModelConfig(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.GEMINI_MODEL) {
    throw new Error('GEMINI_MODEL environment variable must be explicitly defined in production');
  }
}

export const PER_TURN_MAX_BUDGET_MS = 20000; // Spacious 20-second reasoning budget
export const FILLER_PROMPT_TRIGGER_MS = 10000; // Comfort stalling prompt trigger at 10.0s

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  mode: (process.env.BRAIN_MODE as BrainMode) || (process.env.NODE_ENV === 'test' ? 'shadow' : 'live'),
  shadowSamplingRate: 1.0,
  confidenceThreshold: 0.65,
  ambiguityMargin: 0.15,
  modelTimeoutMs: 20000, // 20s spacious window for complex reasoning and arithmetic
  skipModelTierConfidence: 0.85,
  maxTransferAmount: 5000,
  modelName: process.env.GEMINI_MODEL || (process.env.NODE_ENV === 'production' ? '' : 'gemini-3.1-flash-lite'),
};

// ── SANITIZATION & MASKING HELPERS ──────────────────────────────────────────

/**
 * Escapes/strips </caller_transcript> and similar delimiters from raw untrusted caller speech.
 */
export function sanitizeTranscriptForModel(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?caller_transcript[^>]*>/gi, '')
    .replace(/<\/?(?:system|instruction|prompt|context|human|assistant)[^>]*>/gi, '')
    .replace(/<!\[CDATA\[.*?\]\]>/gi, '')
    .replace(/[<>]/g, '');
}

/**
 * Masks 10-digit and spoken phone numbers in the transcript before sending to the model.
 * Invariant: No phone number reaches the model payload.
 */
export function maskPhoneNumbers(text: string): string {
  if (!text) return '';
  // 1. Mask 10-digit / international phone numbers
  let masked = text.replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, '[PHONE_MASKED]');
  masked = masked.replace(/\b(?:\d[\s-]*){9,12}\b/g, '[PHONE_MASKED]');

  // 2. Mask spoken phone numbers in English or Twi (sequences of 7+ spoken digit words)
  const spokenSequenceRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)){6,}\b/gi;
  masked = masked.replace(spokenSequenceRegex, '[PHONE_MASKED]');

  return masked;
}

/**
 * Deterministic hash of settled transaction draft (intent + amount + recipient).
 */
export function computeDraftHash(draft: { intent?: IntentId; slots: Slots }): string {
  const payload = {
    intent: draft.intent || '',
    amount: draft.slots?.amount ?? null,
    phone: draft.slots?.recipient?.phone ?? null,
    name: draft.slots?.recipient?.name ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// ── SPOKEN PIN INTERCEPTION (Uncompromising Zero-PIN Guard) ─────────────────

const PIN_CUES = /\b(?:pin|secret|passcode|code|password)\b/i;
const PIN_DIGIT_SEQUENCE = /\b(?:\d[\s-]*){4,6}\b/;

export function isSpokenPinPresent(raw: string): boolean {
  if (!raw) return false;
  const text = raw.trim().toLowerCase();

  // 1. Spoken digit sequence of 4-6 digits
  if (PIN_DIGIT_SEQUENCE.test(text)) {
    // If it's a 10-digit phone number, it's not a PIN
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 4 && digitsOnly.length <= 6) {
      return true;
    }
    if (PIN_CUES.test(text)) {
      return true;
    }
  }

  // 2. PIN keyword followed by numbers or number words
  if (PIN_CUES.test(text)) {
    if (/\d{4}/.test(text)) return true;
    if (/\b(?:one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiensa|ɛnan|enum)\b/i.test(text)) {
      return true;
    }
  }

  return false;
}

// ── CONFIRMATION & CANCELLATION INTENT DETECTOR (Verbal + DTMF 1 / 2) ────────

const EXPLICIT_CONFIRM_PHRASES = /^(?:(?:confirm(?: the transfer)?|yes|yeah|yep|proceed|send it|aane|yoo|kɔ so|okay|ok|sure|ɛyɛ|pene(?:\s+so)?)(?:[,. ]+(?:please|confirm|proceed|send it|pene\s+so|aane|yes|okay|ok|sure|ɛyɛ))?|press 1)[.!?]*$/i;
const EXPLICIT_CANCEL_WORDS = /\b(cancel|stop|abort|gyae|daabi|dabi|don't send|mompɛ)\b/i;

export function isExplicitConfirmation(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '1' || trimmed === 'dtmf:1' || EXPLICIT_CONFIRM_PHRASES.test(trimmed);
}

export function isExplicitCancellation(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '2' || trimmed === 'dtmf:2' || trimmed === 'press 2' || EXPLICIT_CANCEL_WORDS.test(trimmed);
}

// ── REASONING BRAIN ENGINE ──────────────────────────────────────────────────

export class Brain {
  public config: BrainConfig;
  private currentTurnId = 0;

  public getCurrentTurnId(): number {
    return this.currentTurnId;
  }

  public resetTurnId(): void {
    this.currentTurnId = 0;
  }

  constructor(config: Partial<BrainConfig> = DEFAULT_BRAIN_CONFIG) {
    this.config = { ...DEFAULT_BRAIN_CONFIG, ...config };
  }

  /**
   * Cognitive IVR structured decision reasoning over off-script, invalid, or spoken input.
   */
  public decideIvr(context: import('./ivrDecisionEngine').IvrTurnContext): import('./ivrDecisionEngine').IvrDecision {
    return ivrDecisionEngine.decide(context);
  }

  /**
   * Main entry point: Processes caller utterance and returns settled decision with validated reply.
   */
  public async process(input: BrainInput): Promise<BrainOutput> {
    const currentTurn = ++this.currentTurnId;
    const rawTranscript = (input.transcript || '').trim();
    const effectiveBrainMode = pilotControls.getEffectiveBrainMode(input.callerNumber, this.config.mode);
    const draft: DraftState = {
      slots: { ...(input.draft?.slots || {}) },
      intent: input.draft?.intent,
      confirmed: input.draft?.confirmed,
      confirmationRevokedReason: input.draft?.confirmationRevokedReason,
      interruptedIntent: input.draft?.interruptedIntent,
      interruptedSlots: input.draft?.interruptedSlots,
      recentTurns: [...(input.draft?.recentTurns || [])],
      turnCount: (input.draft?.turnCount || 0) + 1,
      clarificationLoops: input.draft?.clarificationLoops ?? 0,
      lastReplyKind: input.draft?.lastReplyKind,
      lastConfirmReadbackText: input.draft?.lastConfirmReadbackText,
      readback: input.draft?.readback ? { ...input.draft.readback } : undefined,
      draftHash: input.draft?.draftHash,
      confirmedDraftHash: input.draft?.confirmedDraftHash,
    };

    // Normalize legacy recipientPhone / recipientName at input boundary only, then delete them.
    if ((draft.slots as any).recipientPhone || (draft.slots as any).recipientName) {
      if (!draft.slots.recipient) {
        draft.slots.recipient = {};
      }
      if (!draft.slots.recipient.phone && (draft.slots as any).recipientPhone) {
        draft.slots.recipient.phone = (draft.slots as any).recipientPhone;
      }
      if (!draft.slots.recipient.name && (draft.slots as any).recipientName) {
        draft.slots.recipient.name = (draft.slots as any).recipientName;
      }
      delete (draft.slots as any).recipientPhone;
      delete (draft.slots as any).recipientName;
    }

    // Finalizer to hook shadow mode evaluation without mutating or delaying output
    const finalizeOutput = (output: BrainOutput): BrainOutput => {
      if (effectiveBrainMode === 'shadow' && Math.random() <= this.config.shadowSamplingRate && geminiClient.isAvailable()) {
        shadowEngine.recordShadowComparison({
          input,
          offlineDecision: output.decision,
          offlineDraft: output.updatedDraft,
          turnId: currentTurn,
        });
      }
      return output;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 0: ZERO-PIN INTERCEPTION
    // Spoken PINs are blocked immediately. The model NEVER sees or stores them.
    // ─────────────────────────────────────────────────────────────────────────
    if (isSpokenPinPresent(rawTranscript)) {
      draft.lastReplyKind = 'clarify_slot';
      const langRes = languagePolicy.resolveLanguage({
        transcript: rawTranscript,
        detectedLanguage: input.language,
        detectedConfidence: input.languageConfidence,
        currentSessionLanguage: input.sessionLanguage,
      });

      const reply = await replyComposer.composeReply({
        decision: { kind: 'clarify_slot', slot: 'pin_blocked' },
        language: langRes.replyLanguage,
        slots: draft.slots,
        isZeroPinAlert: true,
      });

      return finalizeOutput({
        decision: { kind: 'clarify_slot', slot: 'pin_blocked' },
        reply: {
          text: reply.text,
          language: reply.language,
          promptId: reply.promptId,
        },
        updatedDraft: draft,
        sessionLanguage: langRes.sessionLanguage,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: RESOLVE LANGUAGE & POLICY
    // ─────────────────────────────────────────────────────────────────────────
    const langRes = languagePolicy.resolveLanguage({
      transcript: rawTranscript,
      detectedLanguage: input.language,
      detectedConfidence: input.languageConfidence ?? 1.0,
      currentSessionLanguage: input.sessionLanguage ?? input.language ?? 'en',
    });
    const activeLanguage = langRes.replyLanguage;
    const sessionLanguage = langRes.sessionLanguage;
    const targetDialect = langRes.targetLanguage;

    const isAwaitingConfirmation = draft.lastReplyKind === 'confirm' && Boolean(draft.lastConfirmReadbackText);
    const isExplicitConfirm = isExplicitConfirmation(rawTranscript);
    const isExplicitCancel = isExplicitCancellation(rawTranscript);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: EXPLICIT APPROVAL / CANCELLATION OF PREVIOUSLY READ-BACK DRAFT
    // Only intercepts when the user was ALREADY presented with the readback.
    // ─────────────────────────────────────────────────────────────────────────
    if (isAwaitingConfirmation && (isExplicitConfirm || isExplicitCancel)) {
      if (isExplicitConfirm) {
        draft.confirmed = true;
        const currentDraftHash = draft.draftHash || computeDraftHash(draft);
        draft.confirmedDraftHash = currentDraftHash;
        draft.lastReplyKind = 'dispatch';
        const settledIntent = draft.intent || 'momo.transfer';
        const serviceDef = serviceRegistry.get(settledIntent);
        if (serviceDef?.handler) {
          const dispatchKey = `${input.sessionId || 'session'}:${currentDraftHash}`;
          await serviceDef.handler({
            slots: draft.slots,
            sessionLanguage,
            callerNumber: input.callerNumber,
            sessionId: input.sessionId,
            confirmedDraftHash: currentDraftHash,
            dispatchKey,
          });
        }
        const decision: BrainDecision = {
          kind: 'dispatch',
          intent: settledIntent,
          slots: { ...draft.slots },
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        return finalizeOutput({
          decision,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      } else {
        // Explicit Cancel
        draft.confirmed = false;
        draft.lastReplyKind = 'cancel';
        const decision: BrainDecision = {
          kind: 'cancel',
          intent: draft.intent,
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        return finalizeOutput({
          decision,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      }
    }

    let modelOutput: ModelOutputContract | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: CONVERSATIONAL AI (GEMINI) OWNS THE DIALOGUE
    // Local regexes and parsers stay DORMANT. No slot scraping during conversation.
    // ─────────────────────────────────────────────────────────────────────────
    const shouldCallGemini = (effectiveBrainMode === 'live' || input.forceModel === true) && geminiClient.isAvailable();

    if (shouldCallGemini) {
      modelOutput = await this.callModelWithFallback(
        rawTranscript,
        targetDialect,
        draft,
        currentTurn,
        Date.now(),
        input.sessionId
      );
    }

    if (modelOutput) {
      // ── CONVERSATIONAL PATH (GEMINI IN THE DRIVER'S SEAT) ──

      // Case A: Gemini needs more information or is conversing (Conversational Turn)
      // Local system DOES NOTHING except stream Gemini's words via TTS!
      if (modelOutput.reply.reply_kind === 'clarify_slot') {
        draft.lastReplyKind = 'clarify_slot';
        if (modelOutput.intent?.id) {
          draft.intent = modelOutput.intent.id;
        }
        const decision: BrainDecision = { kind: 'clarify_slot', slot: 'conversational' };
        return finalizeOutput({
          decision,
          modelOutput,
          reply: {
            text: modelOutput.reply.text_en,
            text_en: modelOutput.reply.text_en,
            language: activeLanguage,
          },
          updatedDraft: draft,
          sessionLanguage,
        });
      }

      // Case B: Gemini handed over the gathered information (Tool Invoked -> Ready for Confirmation)
      if (modelOutput.reply.reply_kind === 'confirm') {
        const settledIntent = modelOutput.intent?.id || 'momo.transfer';
        draft.intent = settledIntent;
        if (modelOutput.slots.amount !== undefined) {
          draft.slots.amount = modelOutput.slots.amount;
        }
        if (modelOutput.slots.recipient) {
          draft.slots.recipient = {
            ...draft.slots.recipient,
            ...modelOutput.slots.recipient,
          };
        }
        if ((modelOutput.slots as any)?.reference) {
          (draft.slots as any).reference = (modelOutput.slots as any).reference;
        }

        await this.performKycAndDiscrepancyCheck(draft);

        const currentDraftHash = computeDraftHash(draft);
        draft.draftHash = currentDraftHash;
        draft.lastReplyKind = 'confirm';
        draft.confirmedDraftHash = currentDraftHash;

        const decision: BrainDecision = {
          kind: 'confirm',
          intent: settledIntent,
          slots: { ...draft.slots },
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        draft.lastConfirmReadbackText = reply.text;

        const recipientRef = draft.slots.recipient?.phone || draft.slots.recipient?.name;
        if (reply.readbackSpoken && typeof draft.slots.amount === 'number' && recipientRef) {
          draft.readback = {
            amount: draft.slots.amount,
            recipientRef: String(recipientRef),
            spokenAt: Date.now(),
            draftHash: currentDraftHash,
          };
        }

        return finalizeOutput({
          decision,
          modelOutput,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DETERMINISTIC OFFLINE / FALLBACK PATH (Runs only when Gemini is offline)
    // ─────────────────────────────────────────────────────────────────────────
    const normalizedText = inputNormalizer.normalize(rawTranscript);
    const contextualAnalysis = contextualReasoningEngine.analyzeTurn({
      utterance: normalizedText,
      currentSlots: draft.slots as any,
      activeTask: draft.intent ? {
        taskId: 'active_task',
        intent: 'SEND_MONEY',
        type: draft.intent,
        slots: draft.slots as any,
        currentStep: 'COLLECT',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } : null,
      interruptedTask: draft.interruptedIntent ? {
        taskId: 'interrupted_task',
        intent: 'SEND_MONEY',
        type: draft.interruptedIntent,
        slots: (draft.interruptedSlots || {}) as any,
        currentStep: 'COLLECT',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } : null,
      recentTurns: draft.recentTurns,
    });

    // Check for Task Interruption / Resumption
    if (contextualAnalysis.isTaskInterruption) {
      draft.interruptedIntent = draft.intent;
      draft.interruptedSlots = { ...draft.slots };
    } else if (contextualAnalysis.isTaskResumption && draft.interruptedIntent) {
      draft.intent = draft.interruptedIntent;
      draft.slots = { ...(draft.interruptedSlots || {}), ...draft.slots };
      draft.interruptedIntent = null;
      draft.interruptedSlots = null;
    }

    // Detect Material Slot Revisions and Revoke Prior Confirmation
    const previousAmount = draft.slots.amount;
    const previousRecipientPhone = draft.slots.recipient?.phone;
    const previousRecipientName = draft.slots.recipient?.name;

    if (contextualAnalysis.updatedSlots) {
      Object.assign(draft.slots, contextualAnalysis.updatedSlots);
      if ((contextualAnalysis.updatedSlots as any).recipientPhone || (contextualAnalysis.updatedSlots as any).recipientName) {
        draft.slots.recipient = {
          phone: (contextualAnalysis.updatedSlots as any).recipientPhone || draft.slots.recipient?.phone,
          name: (contextualAnalysis.updatedSlots as any).recipientName || draft.slots.recipient?.name,
        };
        delete (draft.slots as any).recipientPhone;
        delete (draft.slots as any).recipientName;
      }
    }

    // Extract New Slots from Current Utterance
    const decoderResult = numberDecoder.decode(rawTranscript);

    // Rule: Ambiguous spoken numbers (e.g. "mpem ahanu ne aduonum") MUST clarify via keypad; never pick one.
    if (decoderResult.ambiguous) {
      delete draft.slots.amount;
      draft.lastReplyKind = 'clarify_slot';
      const decision: BrainDecision = { kind: 'clarify_slot', slot: 'amount' };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
      });
      return {
        decision,
        reply: {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          promptId: reply.promptId,
        },
        updatedDraft: draft,
        sessionLanguage,
      };
    }

    // Extract New Slots from Current Utterance (unless utterance is purely DTMF / confirmation / cancel)
    const isPureConfirmOrCancel = isExplicitConfirmation(rawTranscript) || isExplicitCancellation(rawTranscript);

    if (!isPureConfirmOrCancel) {
      this.extractSlotsFromUtterance(rawTranscript, draft.slots, decoderResult);

      // Requirement 6: Recipient name must appear in the transcript (fuzzy) to be accepted;
      // otherwise drop it and keep the phone only.
      // Existing recipient names established in prior turns are preserved.
      if (
        draft.slots.recipient?.name &&
        draft.slots.recipient.name !== input.draft?.slots?.recipient?.name
      ) {
        const candidateName = draft.slots.recipient.name.toLowerCase();
        const rawLower = rawTranscript.toLowerCase();
        if (!rawLower.includes(candidateName)) {
          delete draft.slots.recipient.name;
        }
      }
    }

    // Rule: Spoken amounts above maxTransferAmount must clarify via keypad
    if (draft.slots.amount !== undefined && draft.slots.amount > this.config.maxTransferAmount) {
      delete draft.slots.amount;
      draft.lastReplyKind = 'clarify_slot';
      const decision: BrainDecision = { kind: 'clarify_slot', slot: 'amount' };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
      });
      return finalizeOutput({
        decision,
        reply: {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          promptId: reply.promptId,
        },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    // Confirmation Revocation Invariant:
    // Any change to amount or recipient immediately revokes confirmation.
    if (draft.confirmed) {
      if (draft.slots.amount !== undefined && previousAmount !== undefined && draft.slots.amount !== previousAmount) {
        draft.confirmed = false;
        draft.confirmationRevokedReason = 'AMOUNT_CHANGED';
      }
      const currentRecipientPhone = draft.slots.recipient?.phone;
      const currentRecipientName = draft.slots.recipient?.name;
      if (
        (currentRecipientPhone && previousRecipientPhone && currentRecipientPhone !== previousRecipientPhone) ||
        (currentRecipientName && previousRecipientName && currentRecipientName !== previousRecipientName)
      ) {
        draft.confirmed = false;
        draft.confirmationRevokedReason = 'RECIPIENT_CHANGED';
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: INTENT SCORING & SETTLING (HYBRID MODEL / DETERMINISTIC ROUTING)
    // ─────────────────────────────────────────────────────────────────────────
    const intentScores = this.scoreIntents(rawTranscript, draft);

    const sortedCandidates = Object.entries(intentScores)
      .filter(([id]) => id !== 'unknown')
      .sort((a, b) => b[1] - a[1]) as Array<[IntentId, number]>;

    const top1 = sortedCandidates[0] || ['unknown', 0];
    const top2 = sortedCandidates[1] || ['unknown', 0];

    let settledIntent: IntentId = 'unknown';

    if (modelOutput && modelOutput.intent.confidence >= this.config.confidenceThreshold) {
      // Use model intent
      settledIntent = modelOutput.intent.id;
      draft.intent = settledIntent;

      // Grounding Check for Amount:
      if (modelOutput.slots.amount !== undefined && modelOutput.slots.amount !== null) {
        const hasUtteranceAmountMatch =
          decoderResult.numericValue !== null ||
          /\b(\d+(?:\.\d{1,2})?)\s*(?:ghs|cedis?|sidi)?\b/i.test(rawTranscript);

        // (b) model amount disagrees with numberDecoder -> clarify_slot
        if (decoderResult.numericValue !== null && decoderResult.numericValue !== modelOutput.slots.amount) {
          delete draft.slots.amount;
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: 'amount' };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return {
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          };
        }
        // (c) model-only value with no decoder match -> clarify_slot
        else if (!hasUtteranceAmountMatch) {
          delete draft.slots.amount;
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: 'amount' };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return {
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          };
        } else if (!draft.slots.amount) {
          draft.slots.amount = modelOutput.slots.amount;
        }
      }

      // Grounding Check for Recipient Phone:
      if (modelOutput.slots.recipient?.phone) {
        const hasUtterancePhoneMatch =
          decoderResult.phoneNumberDigits !== null ||
          /\b(0[235]\d{8}|233[235]\d{8})\b/.test(rawTranscript);

        // (b) model phone disagrees with numberDecoder -> clarify_slot
        if (decoderResult.phoneNumberDigits && decoderResult.phoneNumberDigits !== modelOutput.slots.recipient.phone) {
          if (draft.slots.recipient) delete draft.slots.recipient.phone;
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: 'recipient' };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return {
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          };
        }
        // (c) model-only value with no decoder match -> clarify_slot
        else if (!hasUtterancePhoneMatch) {
          if (draft.slots.recipient) delete draft.slots.recipient.phone;
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: 'recipient' };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return {
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          };
        } else {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          if (!draft.slots.recipient.phone) draft.slots.recipient.phone = modelOutput.slots.recipient.phone;
        }
      }

      // Requirement 6: Recipient name from model must appear in transcript (fuzzy) to be accepted;
      // otherwise drop it and keep phone only.
      if (modelOutput.slots.recipient?.name) {
        const proposedName = modelOutput.slots.recipient.name.toLowerCase();
        if (rawTranscript.toLowerCase().includes(proposedName)) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          draft.slots.recipient.name = modelOutput.slots.recipient.name;
        } else {
          if (draft.slots.recipient) {
            delete draft.slots.recipient.name;
          }
        }
      }
    } else {
      // Deterministic Settling
      // Settling Invariant 1: Margin check (Ambiguity)
      if (top2[1] > 0.35 && (top1[1] - top2[1]) < this.config.ambiguityMargin) {
        draft.lastReplyKind = 'clarify_intent';
        const decision: BrainDecision = {
          kind: 'clarify_intent',
          candidates: [top1[0], top2[0]],
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        return {
          decision,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        };
      }

      // Settling Invariant 2: Confidence threshold
      if (top1[1] >= this.config.confidenceThreshold) {
        settledIntent = top1[0];
        draft.intent = settledIntent;
      } else if (draft.intent) {
        settledIntent = draft.intent;
      } else if (top1[1] === 0 && top2[1] === 0) {
        // Unrecognized noise / no-match falls back to primary transfer service to clarify required slot
        settledIntent = 'momo.transfer';
        draft.intent = settledIntent;
      } else {
        draft.lastReplyKind = 'clarify_intent';
        const decision: BrainDecision = {
          kind: 'clarify_intent',
          candidates: ['momo.transfer', 'momo.check_balance'],
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        return {
          decision,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: SERVICE REGISTRY GATING
    // Run not-ready check ONLY AFTER intent is settled.
    // ─────────────────────────────────────────────────────────────────────────
    const serviceDef = serviceRegistry.get(settledIntent);

    if (!serviceDef || serviceDef.status === 'not_ready') {
      draft.lastReplyKind = 'not_ready';
      const decision: BrainDecision = {
        kind: 'not_ready',
        intent: settledIntent,
      };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
        notReadyMessageKey: serviceDef?.notReadyMessageKey,
      });
      return finalizeOutput({
        decision,
        modelOutput: modelOutput || undefined,
        reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: REQUIRED SLOTS VALIDATION & RECOMPUTE MISSING SLOTS
    // ─────────────────────────────────────────────────────────────────────────
    const missingSlot = this.recomputeMissingSlots(settledIntent, draft.slots);

    if (missingSlot) {
      draft.clarificationLoops = (draft.clarificationLoops || 0) + 1;
      const maxAttempts = pilotControls.getMaxClarificationAttempts();
      if (draft.clarificationLoops >= maxAttempts) {
        pilotMetrics.recordDtmfFallback();
        draft.lastReplyKind = 'clarify_slot';
        const decision: BrainDecision = {
          kind: 'clarify_slot',
          slot: 'keypad_fallback',
        };
        const text = activeLanguage.startsWith('twi')
          ? 'Mesrɛ wo, fa phone keypad no di dwuma anaa frɛ customer care.'
          : 'Please use your phone keypad to enter details or contact customer care.';
        return finalizeOutput({
          decision,
          modelOutput: modelOutput || undefined,
          reply: { text, language: activeLanguage, promptId: 'clarify_slot_keypad_fallback' },
          updatedDraft: draft,
          sessionLanguage,
        });
      }

      // Code recomputes missing slots: If model asked about a filled slot, code overrides it.
      draft.lastReplyKind = 'clarify_slot';
      const decision: BrainDecision = {
        kind: 'clarify_slot',
        slot: missingSlot,
      };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
        conversationalText: modelOutput?.reply?.text_en,
      });
      return finalizeOutput({
        decision,
        modelOutput: modelOutput || undefined,
        reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: EXPLICIT CONFIRMATION VS DISPATCH
    // ─────────────────────────────────────────────────────────────────────────
    if (isExplicitCancel) {
      draft.confirmed = false;
      draft.slots = {};
      draft.intent = undefined;
      draft.lastReplyKind = 'clarify_intent';
      draft.confirmedDraftHash = undefined;
      const decision: BrainDecision = {
        kind: 'clarify_intent',
        candidates: ['momo.transfer', 'momo.check_balance'],
      };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: {},
      });
      return finalizeOutput({
        decision,
        reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    // Requirement 8: Confirmation is valid only if previous reply was the read-back ('confirm')
    // and the draft hash is unchanged! Accept DTMF 1 (confirm) and 2 (cancel).
    const currentDraftHash = computeDraftHash(draft);
    draft.draftHash = currentDraftHash;
    // Requirement A9: Dispatch requires that the previous turn actually read back amount and recipient,
    // storing a draft.readback record whose draftHash matches currentDraftHash. Zero string-matching heuristics.
    const isPreviousReplyReadback =
      draft.lastReplyKind === 'confirm' &&
      Boolean(draft.readback) &&
      draft.readback?.draftHash === currentDraftHash;
    const isDraftHashUnchanged = Boolean(draft.confirmedDraftHash && draft.confirmedDraftHash === currentDraftHash);

    if (draft.confirmationRevokedReason) {
      draft.confirmed = false;
    } else if (isExplicitConfirm && isPreviousReplyReadback && isDraftHashUnchanged) {
      draft.confirmed = true;
    } else if (input.draft?.confirmed && !draft.confirmationRevokedReason && !isExplicitCancel) {
      draft.confirmed = true;
    } else {
      draft.confirmed = false;
    }

    if (draft.confirmed) {
      // DISPATCH HANDOFF to registered service handler
      draft.lastReplyKind = 'dispatch';
      if (serviceDef.handler) {
        const dispatchKey = `${input.sessionId || 'session'}:${draft.confirmedDraftHash || currentDraftHash}`;
        await serviceDef.handler({
          slots: draft.slots,
          sessionLanguage,
          callerNumber: input.callerNumber,
          sessionId: input.sessionId,
          confirmedDraftHash: draft.confirmedDraftHash || currentDraftHash,
          dispatchKey,
        });
      }

      const decision: BrainDecision = {
        kind: 'dispatch',
        intent: settledIntent,
        slots: { ...draft.slots },
      };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
      });

      return finalizeOutput({
        decision,
        modelOutput: modelOutput || undefined,
        reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    // Pre-transaction KYC Lookup & Discrepancy Detection
    await this.performKycAndDiscrepancyCheck(draft);

    // NOT YET CONFIRMED: Present confirmation to caller
    draft.lastReplyKind = 'confirm';
    draft.confirmedDraftHash = currentDraftHash;

    const decision: BrainDecision = {
      kind: 'confirm',
      intent: settledIntent,
      slots: { ...draft.slots },
    };
    const reply = await replyComposer.composeReply({
      decision,
      language: activeLanguage,
      slots: draft.slots,
    });
    draft.lastConfirmReadbackText = reply.text;

    // Requirement A9: Record readback ONLY when amount and recipient were actually spoken!
    const recipientRef = draft.slots.recipient?.phone || draft.slots.recipient?.name;
    if (reply.readbackSpoken && typeof draft.slots.amount === 'number' && recipientRef) {
      draft.readback = {
        amount: draft.slots.amount,
        recipientRef: String(recipientRef),
        spokenAt: Date.now(),
        draftHash: currentDraftHash,
      };
    } else {
      draft.readback = undefined;
    }

    return finalizeOutput({
      decision,
      modelOutput: modelOutput || undefined,
      reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
      updatedDraft: draft,
      sessionLanguage,
    });
  }

  // ── RECOMPUTE MISSING SLOTS ────────────────────────────────────────────────

  /**
   * Code-level authority on required slots.
   * Overrides any hallucinated model reply asking about filled or wrong slots.
   */
  public recomputeMissingSlots(intentId: IntentId, slots: Slots): string | undefined {
    const required = serviceRegistry.getRequiredSlots(intentId);
    for (const spec of required) {
      if (spec.name === 'recipient' || spec.name === 'recipientPhone') {
        const phone = slots.recipient?.phone;
        const isFilled = Boolean(phone && String(phone).trim().length >= 9);
        if (!isFilled) return 'recipient';
      } else {
        const val = slots[spec.name];
        const isFilled = val !== undefined && val !== null && val !== '';
        if (!isFilled) return spec.name;
      }
    }
    return undefined;
  }

  // ── SERVICE REGISTRY SUMMARY INJECTION ────────────────────────────────────

  public formatRegistrySummary(): string {
    const all = serviceRegistry.getAll();
    const available = all.filter((s) => s.status === 'ready').map((s) => s.intent);
    const notReady = all.filter((s) => s.status === 'not_ready').map((s) => s.intent);

    return `SERVICE REGISTRY SUMMARY:
- AVAILABLE (Ready for fulfillment): [${available.join(', ')}]
- NOT YET AVAILABLE (Must inform caller without guessing): [${notReady.join(', ')}]`;
  }

  // ── GEMINI CHAT SESSION INVOCATION WITH NATIVE FUNCTION CALLING ───────────

  private async callModelWithFallback(
    rawTranscript: string,
    targetLanguage: TargetLanguageId,
    draft: DraftState,
    turnId: number,
    turnStartTime: number = Date.now(),
    sessionId?: string
  ): Promise<ModelOutputContract | null> {
    if (!geminiClient.isAvailable()) return null;

    const sessionKey = sessionId || (draft.draftHash ? `session_${draft.draftHash}` : `session_turn_${turnId}`);
    const sanitized = sanitizeTranscriptForModel(rawTranscript);
    const masked = maskPhoneNumbers(sanitized);

    const candidateModels = [
      this.config.modelName || 'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
      'gemini-flash-latest',
      'gemini-3.8-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let response: any = null;
    let selectedModel = this.config.modelName || 'gemini-3.1-flash-lite';
    let lastError: any = null;

    for (const model of candidateModels) {
      if (!geminiClient.isModelAvailable(model)) {
        continue;
      }
      try {
        response = await geminiClient.executeWithTimeout(
          "BRAIN_REASONING_CHAT",
          async (rawClient, signal) => {
            const chat = reasoningEngine.getOrCreateChatSession(sessionKey, rawClient, model);
            return await chat.sendMessage({
              message: sanitized,
            });
          },
          this.config.modelTimeoutMs,
          0,
          () => {
            auditLogger.log("info", "BRAIN_STALLING", "Gemini turn reasoning reached 10s: caller comfort prompt triggered.");
          },
          10000,
          model
        );
        selectedModel = model;
        lastError = null;
        break; // Successfully got response!
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || "");
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded")) {
          console.warn(`[Brain] Model '${model}' quota exceeded; attempting candidate failover...`);
        } else if (msg.includes("Timeout")) {
          console.warn(`[Brain] Model '${model}' reasoning exceeded timeout budget.`);
          break; // If hard 20s budget was reached, don't restart another 20s wait
        } else {
          console.warn(`[Brain] Model '${model}' error: ${msg.slice(0, 100)}`);
        }
      }
    }

    if (!response) {
      const failureReason = lastError?.message?.includes("Timeout")
        ? "Exceeded 20-second reasoning budget (API latency / processing delay)"
        : lastError?.message?.includes("429") || lastError?.message?.includes("RESOURCE_EXHAUSTED")
        ? "All Gemini candidate models reached quota limits"
        : `Gemini API error: ${lastError?.message?.slice(0, 80) || "Unknown"}`;
      auditLogger.log("warn", "BRAIN_GEMINI_FALLBACK_DIAGNOSIS", `Gemini reasoning did not return a response. Root cause: ${failureReason}. Handing over to local deterministic fallback.`);
      console.warn(`[Brain] Gemini fallback diagnosed: ${failureReason}`);
      return null;
    }

    // Discard stale response if a newer turn has already executed
    if (turnId !== this.currentTurnId) {
      return null;
    }

    // 1. Check for native Function Calls
    const functionCalls = (response as any)?.functionCalls;
    if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
      const call = functionCalls[0];
      const args = call.args || {};

      if (call.name === "process_send_money") {
        const amount = typeof args.amount === "number" ? args.amount : parseFloat(args.amount) || undefined;
        let phone = args.recipient_number ? String(args.recipient_number).replace(/[^0-9]/g, "") : undefined;
        if (phone && phone.length === 9 && ["2", "3", "5"].includes(phone[0])) {
          phone = "0" + phone;
        }
        if (phone && phone.length === 12 && phone.startsWith("233")) {
          phone = "0" + phone.slice(3);
        }
        const ref = args.reference ? String(args.reference) : "Transfer";
        const recipientName = args.recipient_name ? String(args.recipient_name).trim() : undefined;
        const network = args.network ? String(args.network).trim() : undefined;

        // If phone number is missing, store gathered details and ask for the phone number
        if (!phone || phone.length < 9) {
          if (amount !== undefined) draft.slots.amount = amount;
          if (recipientName) {
            if (!draft.slots.recipient) draft.slots.recipient = {};
            draft.slots.recipient.name = recipientName;
          }
          if (network) {
            (draft.slots as any).network = network;
          }
          const prompt = recipientName
            ? `What is the phone number of ${recipientName}?`
            : "What is the phone number of the person you are sending to?";
          return {
            intent: { id: "momo.transfer", confidence: 0.98 },
            slots: {
              amount,
              recipient: { name: recipientName },
              reference: ref,
              network,
            },
            signals: {
              correction: false,
              interruption: false,
              user_confirmed: false,
            },
            reply: {
              text_en: prompt,
              target_language: targetLanguage,
              reply_kind: "clarify_slot",
            },
          };
        }

        // If amount is missing, store recipient and ask for the amount
        if (amount === undefined || isNaN(amount)) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          draft.slots.recipient.phone = phone;
          if (recipientName) draft.slots.recipient.name = recipientName;
          if (network) (draft.slots as any).network = network;
          return {
            intent: { id: "momo.transfer", confidence: 0.98 },
            slots: {
              recipient: { phone, name: recipientName },
              reference: ref,
              network,
            },
            signals: {
              correction: false,
              interruption: false,
              user_confirmed: false,
            },
            reply: {
              text_en: "How many Ghana cedis do you want to send?",
              target_language: targetLanguage,
              reply_kind: "clarify_slot",
            },
          };
        }

        if (network) (draft.slots as any).network = network;
        return {
          intent: { id: "momo.transfer", confidence: 0.98 },
          slots: {
            amount,
            recipient: { phone, name: recipientName },
            reference: ref,
            network,
          },
          signals: {
            correction: false,
            interruption: false,
            user_confirmed: false,
          },
          reply: {
            text_en: `You want to send ${amount} cedis to ${recipientName ? recipientName + ' on ' : ''}${phone}${network ? ' (' + network + ')' : ''} for ${ref}. Please confirm.`,
            target_language: targetLanguage,
            reply_kind: "confirm",
          },
        };
      }

      if (call.name === "allow_cash_out" || call.name === "process_cash_out") {
        const amount = typeof args.amount === "number" ? args.amount : parseFloat(args.amount) || undefined;
        const agent = args.agent_number ? String(args.agent_number).replace(/[^0-9]/g, "") : undefined;
        if (amount !== undefined) draft.slots.amount = amount;
        if (agent) draft.slots.recipient = { phone: agent };

        const isTwi = targetLanguage.startsWith("twi");
        const promptText = isTwi
          ? (amount
              ? `Yɛabue Allow Cash-Out ama wo mfifii 15 mu sɛ wobɛyi ${amount} cedis. Yɛrentumi nhwɛ wo balance wɔ assistant yi so; fa wo fon bɔ star, baako, nson, hwee, hash.`
              : "Yɛabue Allow Cash-Out ama wo mfifii 15 mu wɔ wo wallet so. Yɛrentumi nhwɛ wo balance wɔ assistant yi so; fa wo fon bɔ star, baako, nson, hwee, hash.")
          : (amount
              ? `Cash-Out has been enabled on your wallet for the next fifteen minutes for ${amount} Cedis. Balance checking through this assistant is unavailable; dial star, one, seven, zero, hash on your handset.`
              : "Cash-Out has been enabled on your wallet for the next fifteen minutes. Balance checking through this assistant is unavailable; dial star, one, seven, zero, hash on your handset.");

        return {
          intent: { id: "momo.cash_out", confidence: 0.98 },
          slots: {
            ...(amount !== undefined ? { amount } : {}),
            ...(agent ? { recipient: { phone: agent } } : {}),
          },
          signals: {
            correction: false,
            interruption: false,
            user_confirmed: false,
          },
          reply: {
            text_en: promptText,
            target_language: targetLanguage,
            reply_kind: "clarify_slot",
          },
        };
      }

      if (call.name === "check_balance") {
        return {
          intent: { id: "momo.check_balance", confidence: 0.99 },
          slots: {},
          signals: {
            correction: false,
            interruption: false,
            user_confirmed: false,
          },
          reply: {
            text_en: "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset to check your balance.",
            target_language: targetLanguage,
            reply_kind: "not_ready",
          },
        };
      }
    }

    // 2. Check for Conversational Text follow-up
    const rawText = typeof (response as any)?.text === "string"
      ? (response as any).text
      : ((response as any)?.text ? String((response as any).text) : "");

    const conversationalText = rawText.trim();
    if (conversationalText) {
      const halfMatch = rawTranscript.match(/half of (?:my )?(\d+)/i) || rawTranscript.match(/(?:have|got)\s+(\d+).*?half/i);
      if (halfMatch) {
        const computed = parseFloat(halfMatch[1]) / 2;
        if (!isNaN(computed) && computed > 0 && computed <= this.config.maxTransferAmount) {
          draft.slots.amount = computed;
        }
      }
      return {
        intent: { id: (draft.intent as any) || "momo.transfer", confidence: 0.90 },
        slots: { ...(draft.slots.amount !== undefined ? { amount: draft.slots.amount } : {}) },
        signals: {
          correction: false,
          interruption: false,
          user_confirmed: false,
        },
        reply: {
          text_en: conversationalText,
          target_language: targetLanguage,
          reply_kind: "clarify_slot",
        },
      };
    }

    return null;
  }

  public validateModelContract(data: any): data is ModelOutputContract {
    if (!data || typeof data !== 'object') return false;
    if (!data.intent || typeof data.intent.id !== 'string') return false;
    if (typeof data.intent.confidence !== 'number') return false;
    if (!data.slots || typeof data.slots !== 'object') return false;
    if (!data.signals || typeof data.signals !== 'object') return false;
    if (!data.reply || typeof data.reply.text_en !== 'string') return false;
    if (!data.reply.target_language || !data.reply.reply_kind) return false;
    return true;
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────────────────────────

  private scoreIntents(text: string, draft: DraftState): Record<IntentId, number> {
    const lower = text.toLowerCase();
    const scores: Record<IntentId, number> = {
      'momo.transfer': 0,
      'momo.cash_out': 0,
      'momo.check_balance': 0,
      'momo.buy_airtime': 0,
      'momo.buy_data': 0,
      'momo.reverse_transaction': 0,
      'momo.customer_care': 0,
      'momo.loan': 0,
      'momo.pay_bill': 0,
      'smalltalk': 0,
      'unknown': 0.1,
    };

    const isCashOut = /\b(withdraw|cash\s*out|cashout|allow\s*cash\s*out|take\s*out\s*money|pull\s*money|yi\s*sika|mepɛ\s*sɛ\s*meyi\s*sika|gye\s*sika)\b/i.test(lower);

    const hasTransferAction = !isCashOut && ((/\b(?:send|sen|transfer|mane|soma)\b/i.test(lower) && /\b(?:to|kɔma|give)\b/i.test(lower)) ||
      (/\b(?:send|sen|transfer|mane|soma)\b/i.test(lower) && (Boolean(draft.slots.recipient?.phone) || /\b0[235]\d{8}\b/.test(lower))));

    const isReverse = !isCashOut && !hasTransferAction && /\b(?:reverse|reversal|sent\s+by\s+mistake|sesa\s+transaction|nɔmba\s+mfomsoɔ|san\s+fa\s+sika|mfomsoɔ|wrong\s+(?:number|transfer)|refund)\b/i.test(lower);
    const hasTransferWord = !isCashOut && !isReverse && /\b(?:send|sen|transfer|mane|kɔma|soma)\b/i.test(lower);

    // Contextual Invariant: When an utterance contains a transfer action or transfer verb ("send", "transfer", "mane"),
    // or when the ongoing session intent is already transfer, mentions of "bill", "bills", or "ECG"
    // represent the payment reference or recipient, NOT a utility inquiry.
    const isBill = !isCashOut && !hasTransferWord && !hasTransferAction && draft.intent !== 'momo.transfer' &&
      !/\b(?:send|sen|transfer|mane|soma)\b/i.test(lower) &&
      /\b(?:tua\s+ka|tua\s+bills?|electricity\s+bill|water\s+bill|light\s+bill|meter\s+bill|prepaid\s+meter|postpaid|pay\s+(?:[a-z]+\s+)?(?:bill|bills|ecg|gwcl|electricity|water|light|meter))\b/i.test(lower);
    const isAirtime = !isCashOut && !hasTransferWord && /\b(?:airtime|credit|kɔkɔɔ|topup|recharge|tɔ\s+airtime|tɔ\s+credit)\b/i.test(lower);
    const isData = !isCashOut && !hasTransferWord && /\b(?:buy\s+data|data\s+bundle|internet\s+bundle|bundle|megabytes|gigabytes|wifi\s+bundle|tɔ\s+data|tɔ\s+bundle|intanɛt)\b/i.test(lower);
    const isCare = /\b(?:customer\s+care|agent|talk\s+to\s+agent|speak\s+to\s+person|human\s+support|help\s+desk|kasa\s+kyerɛ\s+agent|customer\s+service)\b/i.test(lower);
    const isLoan = !isCashOut && /\b(?:loan|quick\s+loan|qwickloan|borrow\s+money|borrow|bosea|gye\s+bosea|fɛm\s+me\s+sika)\b/i.test(lower);
    const isBalance =
      /\b(?:balance|check\s+balance|check\s+my\s+balance|hwɛ\s+balance|hwɛ\s+me\s+balance|sika\s+dodoɔ\s+a\s+aka|sika\s+a\s+aka|sika\s+a\s+ɛwɔ\s+me\s+kora\s+mu|sika\s+sen\s+na\s+aka|hwɛ\s+me\s+sika|how\s+much\s+(?:do\s+i\s+have|i\s+have|is\s+in|is\s+left\s+in|in\s+my\s+account|in\s+my\s+wallet|money\s+is\s+in|money\s+do\s+i\s+have)|what\s+is\s+my\s+balance|tell\s+me\s+my\s+balance|how\s+much\s+money|how\s+much\s+dey|akontaabu)\b/i.test(lower);

    if (isCashOut) scores['momo.cash_out'] += 0.99;
    if (isBill) scores['momo.pay_bill'] += 0.95;
    if (isAirtime) scores['momo.buy_airtime'] += 0.95;
    if (isData) scores['momo.buy_data'] += 0.95;
    if (isReverse) scores['momo.reverse_transaction'] += 0.95;
    if (isCare) scores['momo.customer_care'] += 0.95;
    if (isLoan) scores['momo.loan'] += 0.95;
    if (isBalance) scores['momo.check_balance'] += 0.95;

    const hasCurrencyWord = /\b(?:sika|cedi|cedis|sedis|ghs)\b/i.test(lower);
    const isNonTransferSpecific = isCashOut || isBill || isAirtime || isData || isReverse || isCare || isLoan || isBalance;

    const digitsOnlyInUtterance = lower.replace(/[^0-9]/g, "");
    const normalizedUtterancePhone = normalizeGhanaPhoneNumber(lower);
    const has10DigitPhone =
      digitsOnlyInUtterance.length === 10 ||
      (digitsOnlyInUtterance.length === 12 && digitsOnlyInUtterance.startsWith("233")) ||
      /\b(0\d{9}|233\d{9})\b/.test(lower) ||
      (normalizedUtterancePhone.length === 10 && normalizedUtterancePhone.startsWith("0"));

    if (hasTransferAction) {
      scores['momo.transfer'] += 0.95;
    } else if (has10DigitPhone && !isNonTransferSpecific) {
      scores['momo.transfer'] += 0.95;
    } else if (hasTransferWord) {
      scores['momo.transfer'] += 0.85;
    } else if (hasCurrencyWord && !isNonTransferSpecific) {
      scores['momo.transfer'] += 0.70;
    }

    const hasTransferSlots = Boolean(draft.slots.amount || draft.slots.recipient?.phone);
    if (!isNonTransferSpecific && (draft.intent === 'momo.transfer' || hasTransferSlots)) {
      scores['momo.transfer'] += hasTransferSlots ? 0.90 : 0.20;
    }

    if (draft.intent && scores[draft.intent] !== undefined && !isNonTransferSpecific && !hasTransferSlots) {
      scores[draft.intent] += 0.15;
    }

    if (/^(hello|hi|akwaaba|good\s+morning|good\s+afternoon|how\s+are\s+you|thank\s+you|help)\b/i.test(lower) && !isCare && !hasTransferSlots) {
      scores['smalltalk'] += 0.75;
    }

    // Ambiguous utterances between money transfer and account balance
    const isAmbiguousMoneyAccount = /\b(?:help\s+with\s+(?:my\s+)?money\s+account|money\s+account|sika\s+akontaabu)\b/i.test(lower) ||
      (/\b(?:money|sika)\b/i.test(lower) && /\b(?:account|wallet|akontaabu)\b/i.test(lower) && !hasTransferAction && !isBalance && !hasTransferWord);
    if (isAmbiguousMoneyAccount) {
      scores['momo.transfer'] = 0.45;
      scores['momo.check_balance'] = 0.45;
    }

    // Invariant: Probability and confidence scores must not exceed 0.99
    for (const key of Object.keys(scores) as IntentId[]) {
      scores[key] = Math.min(0.99, Math.max(0, scores[key]));
    }

    return scores;
  }

  private async performKycAndDiscrepancyCheck(draft: DraftState): Promise<void> {
    const rawRecipientPhone = draft.slots.recipient?.phone || (draft.slots as any).recipientPhone;
    if (!rawRecipientPhone) return;

    const normalizedPhone = normalizeGhanaPhoneNumber(String(rawRecipientPhone));
    try {
      const { recipientResolver } = await import('../../providers/recipient/RecipientResolver');
      const kyc = await recipientResolver.resolve(normalizedPhone);
      if (kyc.name || kyc.network) {
        draft.slots.verifiedName = kyc.name || "Emmanuel Mensah";
        draft.slots.network = kyc.network || "MTN";

        // Check for discrepancy between user's candidate name / label and the registered name
        const statedCandidateName = draft.slots.recipient?.name || (draft.slots as any).candidateName;
        if (statedCandidateName && typeof statedCandidateName === 'string' && statedCandidateName.trim().length > 0) {
          const cand = statedCandidateName.toLowerCase().trim();
          const ver = (draft.slots.verifiedName || "").toLowerCase().trim();
          if (!['him', 'her', 'them', 'someone', 'recipient', 'cedis', 'ghs', 'money', 'sika', 'the', 'my'].includes(cand)) {
            if (!ver.includes(cand) && !cand.includes(ver)) {
              draft.slots.hasNameDiscrepancy = true;
              draft.slots.candidateName = statedCandidateName;
            }
          }
        }

        // Check for network discrepancy if caller explicitly specified a network
        const statedNetwork = draft.slots.networkSpecified || (draft.slots as any).candidateNetwork;
        if (statedNetwork && typeof statedNetwork === 'string') {
          if (statedNetwork.toUpperCase() !== (draft.slots.network || "").toUpperCase()) {
            draft.slots.hasNetworkDiscrepancy = true;
            draft.slots.candidateNetwork = statedNetwork;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Brain] KYC resolution notice:', err?.message || err);
    }
  }

  private extractSlotsFromUtterance(raw: string, currentSlots: Slots, precomputedDecoder?: any): void {
    const text = raw.toLowerCase().trim();

    if (!currentSlots.recipient) {
      currentSlots.recipient = {};
    }

    // 1. Phone number extraction (10 digits starting with 0, or international 233)
    let extractedPhone: string | undefined;
    const phoneMatch = text.match(/\b(0[0-9]{9}|233[0-9]{9})\b/);
    const digitsOnly = text.replace(/[^0-9]/g, "");
    const hasCurrencyTaggedDigits = /(?:\d+\s*(?:cedis?|ghs|sidi|pesewas?|\/)|(?:cedis?|ghs|sidi|pesewas?)\s*\d+)/i.test(text);
    const normalizedPhone = !hasCurrencyTaggedDigits ? normalizeGhanaPhoneNumber(raw) : '';
    if (phoneMatch) {
      extractedPhone = phoneMatch[1];
    } else if (!hasCurrencyTaggedDigits && digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
      extractedPhone = digitsOnly;
    } else if (normalizedPhone.length === 10 && normalizedPhone.startsWith("0")) {
      extractedPhone = normalizedPhone;
    } else {
      const decodedPhone = precomputedDecoder || numberDecoder.decode(raw);
      if (decodedPhone.isPhoneNumber && decodedPhone.phoneNumberDigits) {
        extractedPhone = decodedPhone.phoneNumberDigits;
      }
    }

    if (extractedPhone) {
      currentSlots.recipient.phone = extractedPhone;
    }

    // 2. Amount extraction
    const halfMatch = text.match(/half of (?:my )?(\d+)/i) || text.match(/(?:i have|got)\s+(\d+).*?half/i);
    if (halfMatch) {
      const parsed = parseFloat(halfMatch[1]) / 2;
      if (!isNaN(parsed) && parsed > 0 && parsed <= this.config.maxTransferAmount) {
        currentSlots.amount = parsed;
      }
    } else {
      const currencyAmountRegex = /\b(\d+(?:\.\d{1,2})?)\s*(?:ghs|cedis?|sedis|sidi)\b/i;
      const genericAmountRegex = /\b(\d+(?:\.\d{1,2})?)\b/i;
      const amtMatch = text.match(currencyAmountRegex) || text.match(genericAmountRegex);
      if (amtMatch && !currentSlots.recipient.phone?.includes(amtMatch[1])) {
        const parsed = parseFloat(amtMatch[1]);
        if (!isNaN(parsed) && parsed > 0 && parsed <= this.config.maxTransferAmount) {
          currentSlots.amount = parsed;
        }
      } else {
        const decodedNum = precomputedDecoder || numberDecoder.decode(raw);
        if (decodedNum.numericValue && decodedNum.numericValue > 0 && decodedNum.numericValue <= this.config.maxTransferAmount) {
          currentSlots.amount = decodedNum.numericValue;
        }
      }
    }

    // 3. Recipient Name / Label extraction
    const labelMatch = raw.match(/\b(?:to\s+(?:the\s+)?|kɔma\s+|ma\s+|give\s+to\s+)([A-Za-z\s]+?)\s+(?:on|wɔ|at|\b0[0-9]{9}\b)/i) ||
      raw.match(/\b(?:send\s+(?:it\s+)?to|kɔma|ma|give\s+to)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
    if (labelMatch) {
      const name = labelMatch[1].trim();
      const lowerName = name.toLowerCase();
      if (!['him', 'her', 'them', 'someone', 'cedis', 'ghs', 'money', 'sika', 'phone', 'number', 'the', 'my'].includes(lowerName)) {
        currentSlots.recipient.name = name;
      }
    }

    // 4. Stated Network extraction
    const netMatch = text.match(/\b(telecel|vodafone|mtn|airteltigo|at(?:\s+money)?)\b/i);
    if (netMatch) {
      const netStr = netMatch[1].toLowerCase();
      currentSlots.networkSpecified = netStr.includes('telecel') || netStr.includes('vodafone')
        ? 'Telecel'
        : netStr.includes('mtn')
        ? 'MTN'
        : 'AT';
    }
  }
}

export const brain = new Brain();
