/**
 * Ɔkwankyerɛfo Pa - Shadow Mode Engine (shadowEngine.ts)
 * 
 * Implements Phase 3c Shadow Evaluation Architecture:
 * 1. Runs the Gemini reasoning model in background alongside the offline deterministic engine.
 * 2. Compares decisions and extracted slot presences without ever blocking or mutating the live call.
 * 3. Logs disagreements with STRICT ZERO-PII invariants (no raw phones, names, amounts, or PII).
 * 4. Provides clean observability to audit model alignment against deterministic ground truth.
 */

import fs from 'fs';
import path from 'path';
import { BrainDecision, BrainInput, DraftState, IntentId, LanguageId, ModelOutputContract } from './types';
import { geminiClient } from '../../services/geminiClient';
import { getLanguageProfile, formatProfilePromptSection } from './languageProfiles';
import { sanitizeTranscriptForModel, maskPhoneNumbers } from './brain';

export interface ShadowDisagreementLog {
  id: string;
  timestamp: string;
  language: LanguageId;
  turnId?: number;
  offlineDecision: {
    intent?: string;
    kind: string;
    hasAmount: boolean;
    hasRecipientPhone: boolean;
  };
  modelDecision: {
    intent?: string;
    confidence?: number;
    kind?: string;
    hasAmount: boolean;
    hasRecipientPhone: boolean;
  };
  disagreementType: 'INTENT_MISMATCH' | 'DECISION_KIND_MISMATCH' | 'SLOT_PRESENCE_MISMATCH';
}

export class ShadowEngine {
  private disagreements: ShadowDisagreementLog[] = [];
  private totalEvaluations = 0;
  private maxLogs = 200;
  private enabled = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public clear(): void {
    this.disagreements = [];
    this.totalEvaluations = 0;
  }

  public getTotalEvaluations(): number {
    return this.totalEvaluations;
  }

  public getDisagreements(): ShadowDisagreementLog[] {
    return [...this.disagreements];
  }

  /**
   * Evaluates turn in shadow mode.
   * Runs model asynchronously in background; never throws or mutates the live call.
   */
  public recordShadowComparison(params: {
    input: BrainInput;
    offlineDecision: BrainDecision;
    offlineDraft: DraftState;
    turnId?: number;
  }): void {
    if (!this.enabled || !geminiClient.isAvailable()) {
      return;
    }

    this.totalEvaluations++;

    // Run detached in background so live caller path is never delayed or affected
    Promise.resolve()
      .then(async () => {
        const modelOutput = await this.executeShadowModel(params.input, params.offlineDraft);
        if (!modelOutput) return;

        this.compareAndLog({
          offlineDecision: params.offlineDecision,
          offlineDraft: params.offlineDraft,
          modelOutput,
          language: params.input.language,
          turnId: params.turnId,
        });
      })
      .catch(() => {
        // Shadow mode failures are completely silent and never affect call
      });
  }

  public compareAndLog(params: {
    offlineDecision: BrainDecision;
    offlineDraft: DraftState;
    modelOutput: ModelOutputContract;
    language: LanguageId;
    turnId?: number;
  }): ShadowDisagreementLog | null {
    const offlineIntent = ('intent' in params.offlineDecision ? params.offlineDecision.intent : undefined) || params.offlineDraft.intent;
    const modelIntent = params.modelOutput.intent.id;

    const offlineKind = params.offlineDecision.kind;
    const modelKind = params.modelOutput.reply.reply_kind;

    const offlineHasAmount = Boolean(params.offlineDraft.slots.amount !== undefined && params.offlineDraft.slots.amount !== null);
    const modelHasAmount = Boolean(params.modelOutput.slots.amount !== undefined && params.modelOutput.slots.amount !== null);

    const offlineHasRecipientPhone = Boolean(params.offlineDraft.slots.recipient?.phone);
    const modelHasRecipientPhone = Boolean(params.modelOutput.slots.recipient?.phone);

    let disagreementType: ShadowDisagreementLog['disagreementType'] | null = null;

    if (offlineIntent && modelIntent && offlineIntent !== modelIntent) {
      disagreementType = 'INTENT_MISMATCH';
    } else if (offlineKind && modelKind && offlineKind !== modelKind) {
      disagreementType = 'DECISION_KIND_MISMATCH';
    } else if (offlineHasAmount !== modelHasAmount || offlineHasRecipientPhone !== modelHasRecipientPhone) {
      disagreementType = 'SLOT_PRESENCE_MISMATCH';
    }

    if (!disagreementType) {
      return null;
    }

    // Create STRICT ZERO-PII entry
    const entry: ShadowDisagreementLog = {
      id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      language: params.language,
      turnId: params.turnId,
      offlineDecision: {
        intent: offlineIntent,
        kind: offlineKind,
        hasAmount: offlineHasAmount,
        hasRecipientPhone: offlineHasRecipientPhone,
      },
      modelDecision: {
        intent: modelIntent,
        confidence: params.modelOutput.intent.confidence,
        kind: modelKind,
        hasAmount: modelHasAmount,
        hasRecipientPhone: modelHasRecipientPhone,
      },
      disagreementType,
    };

    this.disagreements.unshift(entry);
    if (this.disagreements.length > this.maxLogs) {
      this.disagreements.pop();
    }

    // Persist to disk (ZERO PII)
    this.persistLog(entry);

    return entry;
  }

  private persistLog(entry: ShadowDisagreementLog): void {
    try {
      const filePath = path.resolve(process.cwd(), 'data/shadow_disagreements.json');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      let existing: ShadowDisagreementLog[] = [];
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.trim()) {
          existing = JSON.parse(raw);
        }
      }
      existing.push(entry);
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[ShadowEngine] Could not persist shadow disagreement log:', err);
    }
  }

  private async executeShadowModel(
    input: BrainInput,
    draft: DraftState
  ): Promise<ModelOutputContract | null> {
    const rawClient = geminiClient.getRawClient();
    if (!rawClient) return null;

    const sanitized = sanitizeTranscriptForModel(input.transcript);
    const masked = maskPhoneNumbers(sanitized);

    const targetDialect = input.language === 'twi-akuapem' ? 'twi-akuapem' : 'twi-asante';
    const profile = getLanguageProfile(targetDialect);
    const profileSection = formatProfilePromptSection(profile);

    const prompt = `SHADOW MODE EVALUATION.
Analyze caller speech and return JSON with keys: intent, slots, signals, reply.
${profileSection}
<caller_transcript>
"${masked.replace(/"/g, '\\"')}"
</caller_transcript>
Current draft: ${JSON.stringify(draft.slots)}`;

    const shadowModel = process.env.GEMINI_MODEL || (process.env.NODE_ENV === 'production' ? '' : 'gemini-2.5-flash');
    if (!shadowModel) return null;

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 1200);

    try {
      const response: any = await rawClient.models.generateContent({
        model: shadowModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          abortSignal: abortController.signal,
        },
      });
      clearTimeout(timer);

      const text = response?.text?.();
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
}

export const shadowEngine = new ShadowEngine();
