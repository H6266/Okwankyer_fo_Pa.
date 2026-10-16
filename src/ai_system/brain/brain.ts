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
import { reasoningEngine, MOMO_SYSTEM_INSTRUCTION } from '../understanding/reasoningEngine';
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
import { auditLogger } from '../../services/auditLogger';
import {
  APPROVED_REPLY_TEMPLATES,
  getApprovedTemplateText,
  findTemplateKeyByText,
} from './replyTemplates';
import { ivrDecisionEngine, type IvrDecision, type IvrTurnContext, type IvrDecisionType } from './ivrDecisionEngine';
import { AI_CONFIG } from '../core/aiConfig';

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
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL.trim() === '') {
      throw new Error('GEMINI_MODEL environment variable must be explicitly defined in production');
    }
  } else if (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL.trim() === '') {
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  }
}

export const PER_TURN_MAX_BUDGET_MS = 20000; // Spacious 20-second reasoning budget
export const FILLER_PROMPT_TRIGGER_MS = 10000; // Comfort stalling prompt trigger at 10.0s

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
  mode: (process.env.BRAIN_MODE as BrainMode) || (process.env.NODE_ENV === 'test' ? 'shadow' : 'live'),
  shadowSamplingRate: 1.0,
  confidenceThreshold: 0.65,
  ambiguityMargin: 0.15,
  modelTimeoutMs: 5000,
  skipModelTierConfidence: 0.85,
  maxTransferAmount: 5000,
  modelName: process.env.GEMINI_MODEL || (process.env.NODE_ENV === 'production' ? '' : 'gemini-3.8-flash'),
};

// ── SANITIZATION & MASKING HELPERS (Imported & re-exported from dedicated security module) ──
import {
  sessionTokenVault,
  clearSessionVault,
  sanitizeTranscriptForModel,
  maskPhoneNumbers,
  tokenizeAndMaskPii,
  computeDraftHash,
  isSpokenPinPresent,
} from '../security/piiVault';

export {
  sessionTokenVault,
  clearSessionVault,
  sanitizeTranscriptForModel,
  maskPhoneNumbers,
  tokenizeAndMaskPii,
  computeDraftHash,
  isSpokenPinPresent,
};



// ── CONFIRMATION & CANCELLATION INTENT DETECTOR (Verbal + DTMF 1 / 2) ────────

const EXPLICIT_CONFIRM_PHRASES = /^(?:(?:confirm(?: the transfer)?|yes|yeah|yep|proceed|send it|aane|yoo|kɔ so|okay|ok|sure|ɛyɛ|pene(?:\s+so)?)(?:[,. ]+(?:please|confirm|proceed|send it|pene\s+so|aane|yes|okay|ok|sure|ɛyɛ|continue))*|press 1)[.!?]*$/i;
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
      const currentDraftHash = draft.draftHash || computeDraftHash(draft);
      const isPreviousReplyReadback =
        Boolean(draft.readback) &&
        draft.readback?.draftHash === currentDraftHash &&
        (draft.readback?.amount === undefined || draft.readback?.amount === draft.slots?.amount);

      if (isExplicitConfirm && isPreviousReplyReadback) {
        draft.confirmed = true;
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
      } else if (isExplicitConfirm && !isPreviousReplyReadback) {
        draft.confirmed = false;
        const decision: BrainDecision = {
          kind: 'confirm',
          intent: draft.intent || 'momo.transfer',
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
        delete draft.slots.amount;
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
    // Hybrid Fast-Path Router: Single DTMF keypad digits or exact control commands bypass Gemini
    const isDtmf = /^[0-9#*]$/.test(rawTranscript.trim());
    const isFastNavCommand = /^(?:cancel|stop|exit|restart|repeat|san|tie|back|menu)$/i.test(rawTranscript.trim());
    const isFastPath = (isDtmf || isFastNavCommand) && !input.forceModel;
    const shouldCallGemini = (effectiveBrainMode === 'live' || input.forceModel === true) && !isFastPath;

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
      return finalizeOutput({
        decision,
        modelOutput: modelOutput || undefined,
        reply: {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          promptId: reply.promptId,
        },
        updatedDraft: draft,
        sessionLanguage,
      });
    }

    if (modelOutput) {
      // ── CONVERSATIONAL PATH (GEMINI IN THE DRIVER'S SEAT) ──
      // Gating for balance checks
      if (modelOutput.intent?.id === 'momo.check_balance' || modelOutput.reply?.reply_kind === 'not_ready') {
        const settledIntent = 'momo.check_balance';
        draft.intent = settledIntent;
        draft.lastReplyKind = 'not_ready';
        const decision: BrainDecision = {
          kind: 'not_ready',
          intent: settledIntent,
        };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
          notReadyMessageKey: 'dial_170_check_balance',
        });
        return finalizeOutput({
          decision,
          modelOutput,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      }

      // Grounding Check for Amount:
      const hasUtteranceAmountMatch =
        decoderResult.numericValue !== null ||
        /\b(\d+(?:\.\d{1,2})?)\s*(?:ghs|cedis?|sidi)?\b/i.test(rawTranscript) ||
        /(?:half|quarter|tenth|part)\s+of/i.test(rawTranscript);

      // (b) model amount disagrees with numberDecoder -> clarify_slot
      if (
        modelOutput.slots?.amount !== undefined &&
        decoderResult.numericValue !== null &&
        decoderResult.numericValue !== modelOutput.slots.amount
      ) {
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
          modelOutput,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      }

      // (c) model-only hallucinated amount with no match in utterance -> clarify_slot
      const isExistingDraftAmount = draft.slots?.amount !== undefined && draft.slots.amount === modelOutput.slots?.amount;
      if (modelOutput.slots?.amount !== undefined && !hasUtteranceAmountMatch && !isExistingDraftAmount) {
        delete draft.slots.amount;
        delete modelOutput.slots.amount;
        draft.lastReplyKind = 'clarify_slot';
        const decision: BrainDecision = { kind: 'clarify_slot', slot: 'amount' };
        const reply = await replyComposer.composeReply({
          decision,
          language: activeLanguage,
          slots: draft.slots,
        });
        return finalizeOutput({
          decision,
          modelOutput,
          reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
          updatedDraft: draft,
          sessionLanguage,
        });
      }

      // Grounding Check for Recipient Phone:
      if (modelOutput.slots?.recipient?.phone) {
        let phoneCandidate = modelOutput.slots.recipient.phone;
        if (input.sessionId && sessionTokenVault.has(input.sessionId) && sessionTokenVault.get(input.sessionId)!.has(phoneCandidate)) {
          phoneCandidate = sessionTokenVault.get(input.sessionId)!.get(phoneCandidate)!;
        } else if (decoderResult.phoneNumberDigits && (phoneCandidate.startsWith('[RECIPIENT_TOKEN_') || phoneCandidate === '[PHONE_MASKED]')) {
          phoneCandidate = decoderResult.phoneNumberDigits;
        }
        modelOutput.slots.recipient.phone = phoneCandidate;

        if (
          decoderResult.phoneNumberDigits !== null &&
          decoderResult.phoneNumberDigits !== modelOutput.slots.recipient.phone
        ) {
          if (draft.slots.recipient) delete draft.slots.recipient.phone;
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: 'recipient' };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return finalizeOutput({
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          });
        }
      }

      // Grounding Check for Recipient Name:
      if (modelOutput.slots?.recipient?.name) {
        const proposedName = modelOutput.slots.recipient.name.toLowerCase();
        if (rawTranscript.toLowerCase().includes(proposedName)) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          draft.slots.recipient.name = modelOutput.slots.recipient.name;
        } else {
          if (draft.slots.recipient) {
            delete draft.slots.recipient.name;
          }
          delete modelOutput.slots.recipient.name;
        }
      }

      // Case A: Gemini needs more information or is conversing (Conversational Turn)
      if (modelOutput.reply.reply_kind === 'clarify_slot') {
        draft.lastReplyKind = 'clarify_slot';
        if (modelOutput.intent?.id) {
          draft.intent = modelOutput.intent.id;
        }
        if (modelOutput.slots?.recipient?.phone) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          let phoneVal = modelOutput.slots.recipient.phone;
          if (input.sessionId && sessionTokenVault.has(input.sessionId) && sessionTokenVault.get(input.sessionId)!.has(phoneVal)) {
            phoneVal = sessionTokenVault.get(input.sessionId)!.get(phoneVal)!;
          } else if (decoderResult.phoneNumberDigits && (phoneVal.startsWith('[RECIPIENT_TOKEN_') || phoneVal === '[PHONE_MASKED]')) {
            phoneVal = decoderResult.phoneNumberDigits;
          }
          draft.slots.recipient.phone = phoneVal;
        } else if (decoderResult.phoneNumberDigits) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          draft.slots.recipient.phone = decoderResult.phoneNumberDigits;
        }
        if (modelOutput.slots?.amount !== undefined) {
          draft.slots.amount = modelOutput.slots.amount;
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

        const prevAmount = draft.slots.amount;
        const prevRecipientPhone = draft.slots.recipient?.phone;
        const prevRecipientName = draft.slots.recipient?.name;

        if (modelOutput.slots.amount !== undefined) {
          draft.slots.amount = modelOutput.slots.amount;
        }
        if (modelOutput.slots.recipient) {
          draft.slots.recipient = {
            ...draft.slots.recipient,
            ...modelOutput.slots.recipient,
          };
        }

        // Retain protected phone digits extracted by application-side numberDecoder
        if (
          decoderResult.phoneNumberDigits &&
          (!draft.slots.recipient?.phone ||
            draft.slots.recipient.phone === '[PHONE_MASKED]' ||
            draft.slots.recipient.phone.startsWith('[RECIPIENT_TOKEN_'))
        ) {
          if (!draft.slots.recipient) draft.slots.recipient = {};
          draft.slots.recipient.phone = decoderResult.phoneNumberDigits;
        }

        // Resolve token from session vault if present
        if (input.sessionId && draft.slots.recipient?.phone && sessionTokenVault.has(input.sessionId)) {
          const vault = sessionTokenVault.get(input.sessionId)!;
          if (vault.has(draft.slots.recipient.phone)) {
            draft.slots.recipient.phone = vault.get(draft.slots.recipient.phone);
          }
        }

        // Confirmation Revocation Invariant:
        // If draft was previously confirmed and ANY critical detail mutated, revoke confirmation!
        if (draft.confirmed) {
          const newAmount = draft.slots.amount;
          const newRecipientPhone = draft.slots.recipient?.phone;
          const newRecipientName = draft.slots.recipient?.name;
          if (
            (prevAmount !== undefined && newAmount !== undefined && prevAmount !== newAmount) ||
            (prevRecipientPhone && newRecipientPhone && prevRecipientPhone !== newRecipientPhone) ||
            (prevRecipientName && newRecipientName && prevRecipientName !== newRecipientName)
          ) {
            draft.confirmed = false;
            delete draft.confirmedDraftHash;
            draft.readback = undefined;
            draft.confirmationRevokedReason = 'SLOT_MUTATED_AFTER_CONFIRMATION';
          }
        }


        if ((modelOutput.slots as any)?.reference) {
          (draft.slots as any).reference = (modelOutput.slots as any).reference;
        }

        // Spoken amounts above maxTransferAmount must clarify via keypad
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

        const missingSlot = this.recomputeMissingSlots(settledIntent, draft.slots);
        if (missingSlot) {
          draft.lastReplyKind = 'clarify_slot';
          const decision: BrainDecision = { kind: 'clarify_slot', slot: missingSlot };
          const reply = await replyComposer.composeReply({
            decision,
            language: activeLanguage,
            slots: draft.slots,
          });
          return finalizeOutput({
            decision,
            modelOutput,
            reply: { text: reply.text, language: reply.language, promptId: reply.promptId },
            updatedDraft: draft,
            sessionLanguage,
          });
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
        else if (!hasUtteranceAmountMatch && (draft.slots.amount === undefined || draft.slots.amount !== modelOutput.slots.amount)) {
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
        else if (!hasUtterancePhoneMatch && (!draft.slots.recipient?.phone || draft.slots.recipient.phone !== modelOutput.slots.recipient.phone)) {
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

    if (!serviceDef || serviceDef.status === 'not_ready' || settledIntent === 'momo.check_balance') {
      draft.lastReplyKind = 'not_ready';
      const decision: BrainDecision = {
        kind: 'not_ready',
        intent: settledIntent,
      };
      const reply = await replyComposer.composeReply({
        decision,
        language: activeLanguage,
        slots: draft.slots,
        notReadyMessageKey: serviceDef?.notReadyMessageKey || (settledIntent === 'momo.check_balance' ? 'dial_170_check_balance' : undefined),
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
    const { maskedText } = tokenizeAndMaskPii(sanitized, sessionId);
    const masked = maskPhoneNumbers(maskedText);

    // Build structured turn prompt including the conversational snapshot
    const missingSlot = draft.intent ? this.recomputeMissingSlots(draft.intent, draft.slots) : undefined;
    const conversationSnapshot = {
      sessionLanguage: targetLanguage,
      turnId,
      currentDraft: {
        intent: draft.intent || null,
        amount: draft.slots?.amount ?? null,
        recipientName: draft.slots?.recipient?.name ?? null,
        recipientPhoneProvided: Boolean(draft.slots?.recipient?.phone),
        network: (draft.slots as any)?.network ?? null,
      },
      lastReplyKind: draft.lastReplyKind || null,
      isAwaitingConfirmation: draft.lastReplyKind === 'confirm',
      outstandingMissingSlot: missingSlot || null,
    };

    const structuredTurnPrompt = `Context Snapshot: ${JSON.stringify(conversationSnapshot)}
Caller Utterance: <caller_transcript>${masked}</caller_transcript>
Notice: Any recipient phone numbers in the transcript have been tokenized as [RECIPIENT_TOKEN_<id>] or [PHONE_MASKED]. You must not invent, hallucinate, or output raw phone digits. If a phone number or token is present in the utterance, acknowledge that the recipient number was provided and use process_send_money or clarify accordingly.`;

    const candidateModels = [
      this.config.modelName || AI_CONFIG.model || 'gemini-3.8-flash',
      AI_CONFIG.fallbackModel || 'gemini-flash-latest',
      'gemini-3.8-flash',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let response: any = null;
    let selectedModel = this.config.modelName || AI_CONFIG.model || 'gemini-3.8-flash';
    let lastError: any = null;

    for (const model of candidateModels) {
      if (!geminiClient.isModelAvailable(model)) {
        continue;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await geminiClient.executeWithTimeout(
            "BRAIN_REASONING_CHAT",
            async (rawClient, signal) => {
              if (rawClient.chats?.create) {
                const chat = reasoningEngine.getOrCreateChatSession(sessionKey, rawClient, model);
                return await chat.sendMessage({
                  message: structuredTurnPrompt,
                });
              } else if (rawClient.models?.generateContent) {
                return await rawClient.models.generateContent({
                  model,
                  contents: structuredTurnPrompt,
                  config: {
                    systemInstruction: MOMO_SYSTEM_INSTRUCTION,
                    temperature: 0.2,
                  },
                });
              }
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

          let text = "";
          if (typeof (response as any)?.text === "function") {
            try { text = (response as any).text(); } catch {}
          } else if (typeof (response as any)?.text === "string") {
            text = (response as any).text;
          }

          if (text && (text.trim().startsWith("{") || text.includes("{"))) {
            try {
              const match = text.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                if (this.validateModelContract(parsed)) {
                  return parsed;
                }
              }
              if (attempt === 0) continue;
              return null;
            } catch {
              if (attempt === 0) continue;
              return null;
            }
          }
          break; // Successfully got response
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || "");
          if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded")) {
            console.warn(`[Brain] Model '${model}' quota exceeded; attempting candidate failover...`);
            break;
          } else if (msg.includes("Timeout")) {
            console.warn(`[Brain] Model '${model}' reasoning exceeded timeout budget.`);
            return null;
          } else {
            console.warn(`[Brain] Model '${model}' error: ${msg.slice(0, 100)}`);
            break;
          }
        }
      }
      if (response) break;
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

    // Check if response text was JSON and valid contract
    let responseText = "";
    if (typeof (response as any)?.text === "function") {
      try { responseText = (response as any).text(); } catch {}
    } else if (typeof (response as any)?.text === "string") {
      responseText = (response as any).text;
    }
    if (responseText && (responseText.trim().startsWith("{") || responseText.includes("{"))) {
      try {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (this.validateModelContract(parsed)) {
            return parsed;
          }
        }
      } catch {}
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

    // Safety Invariant: confirm and clarify_slot must never contain raw digits
    if (data.reply.reply_kind === 'confirm' || data.reply.reply_kind === 'clarify_slot') {
      if (/\d/.test(data.reply.text_en)) return false;
      if (data.reply.template_key && !APPROVED_REPLY_TEMPLATES[data.reply.template_key]) {
        return false;
      }
    }
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

    const isCashOut = /\b(withdraw|cash\s*out|cashout|allow\s*cash\s*out|take\s*out\s*money|pull\s*money|yi\s*sika|mepɛ\s*sɛ\s*meyi\s*sika|meyi\s*sika|gye\s*sika)\b/i.test(lower);

    const isReverse = !isCashOut && /\b(?:reverse|reversal|sent\s+by\s+mistake|made\s+a\s+mistake|sesa\s+transaction|nɔmba\s+mfomsoɔ|san\s+fa\s+sika|mfomsoɔ|wrong\s+(?:number|transfer)|refund)\b/i.test(lower);

    const isAirtime = !isCashOut && /\b(?:airtime|credit|kɔkɔɔ|topup|recharge|tɔ\s+airtime|tɔ\s+credit)\b/i.test(lower);

    const isTransferDirected = !isCashOut && !isReverse && !isAirtime && ((/\b(?:send|sen|transfer|mane|soma)\b/i.test(lower) && /\b(?:to|kɔma|give)\b/i.test(lower)) ||
      (/\b(?:send|sen|transfer|mane|soma)\b/i.test(lower) && (Boolean(draft.slots.recipient?.phone) || /\b0[235]\d{8}\b/.test(lower))));

    const hasTransferAction = isTransferDirected;

    const hasTransferWord = !isCashOut && !isReverse && !isAirtime && /\b(?:send|sen|transfer|mane|kɔma|soma)\b/i.test(lower);

    // Contextual Invariant: When an utterance contains an ambiguous choice between bill and transfer
    const isAmbiguousBillOrTransfer = /\b(?:bill\s+or\s+transfer|transfer\s+or\s+bill|pay\s+(?:money\s+for\s+)?bill\s+or\s+transfer)\b/i.test(lower);

    // Contextual Invariant: When an utterance contains a transfer action or transfer verb ("send", "transfer", "mane"),
    // or when the ongoing session intent is already transfer, mentions of "bill", "bills", or "ECG"
    // represent the payment reference or recipient, NOT a utility inquiry.
    const isBill = (!isCashOut && !hasTransferAction && draft.intent !== 'momo.transfer' &&
      (!hasTransferWord || isAmbiguousBillOrTransfer) &&
      /\b(?:tua\s+(?:[a-z]+\s+)*(?:ka|bills?|ecg|kanea|nsuo|gwcl)|tua\s+ka|tua\s+bills?|kanea\s+gya|electricity\s+bill|water\s+bill|light\s+bill|meter\s+bill|prepaid\s+meter|postpaid|pay\s+(?:[a-z]+\s+)?(?:bill|bills|ecg|gwcl|electricity|water|light|meter))\b/i.test(lower)) || isAmbiguousBillOrTransfer;
    const isData = !isCashOut && !hasTransferWord && /\b(?:buy\s+(?:\w+\s+)*data|data\s+bundle|internet\s+bundle|bundle|megabytes|gigabytes|wifi\s+bundle|tɔ\s+(?:\w+\s+)*data|tɔ\s+bundle|intanɛt|data)\b/i.test(lower);
    const isCare = /\b(?:customer\s+(?:care|service)|talk\s+to\s+(?:an?\s+)?agent|speak\s+to\s+(?:an?\s+)?(?:agent|person)|human\s+support|help\s+desk|kasa\s+kyerɛ\s+agent)\b/i.test(lower) && !/\b(?:momo\s+agent|cash\s*out|withdraw|yi\s*sika|agent\s+hɔ)\b/i.test(lower);
    const isLoan = !isCashOut && /\b(?:loan|quick\s+loan|qwickloan|borrow\s+money|borrow|bosea|gye\s+bosea|fɛm\s+me\s+sika)\b/i.test(lower);
    const isBalance =
      /\b(?:balance|check\s+balance|check\s+my\s+balance|hwɛ\s+balance|hwɛ\s+me\s+balance|sika\s+dodoɔ\s+a\s+(?:aka|ɛwɔ)|akawnti\s+no\s+mu|me\s+akawnti|sika\s+a\s+aka|sika\s+a\s+ɛwɔ\s+me\s+kora\s+mu|sika\s+sen\s+na\s+aka|hwɛ\s+me\s+sika|how\s+much\s+(?:do\s+i\s+have|i\s+have|is\s+in|is\s+left\s+in|in\s+my\s+account|in\s+my\s+wallet|money\s+is\s+in|money\s+do\s+i\s+have)|what\s+is\s+my\s+balance|tell\s+me\s+my\s+balance|how\s+much\s+money|how\s+much\s+dey|akontaabu)\b/i.test(lower);

    if (isCashOut) scores['momo.cash_out'] += 0.99;
    if (isBill) scores['momo.pay_bill'] += (isAmbiguousBillOrTransfer ? 0.75 : 0.95);
    if (isAirtime) scores['momo.buy_airtime'] += 0.95;
    if (isData) scores['momo.buy_data'] += 0.95;
    if (isReverse) scores['momo.reverse_transaction'] += 0.95;
    if (isCare) scores['momo.customer_care'] += 0.95;
    if (isLoan) scores['momo.loan'] += 0.95;
    if (isBalance) scores['momo.check_balance'] += 0.95;

    const hasCurrencyWord = /\b(?:sika|cedi|cedis|sedis|ghs)\b/i.test(lower);
    const isNonTransferSpecific = isCashOut || (isBill && !isAmbiguousBillOrTransfer) || isAirtime || isData || isReverse || isCare || isLoan || isBalance;

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
      scores['momo.transfer'] += (isAmbiguousBillOrTransfer ? 0.70 : 0.85);
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

    // 4. Stated Network extraction (exclude standalone preposition 'at')
    const netMatch = text.match(/\b(telecel|vodafone|mtn|airteltigo|airtel|tigo|at\s+(?:money|network|sim))\b/i);
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
