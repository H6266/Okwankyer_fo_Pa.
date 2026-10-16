/**
 * Ɔkwankyerɛfo Pa - Offline vs Live Evaluation Script
 * (scripts/run_eval_transcripts.ts)
 * 
 * Runs the live model (if configured) and offline deterministic engine against
 * data/evalTranscripts.json (30 noisy ASR-style transcripts across English, Twi,
 * and Code-Switched scenarios).
 * 
 * Reports:
 * - Intent accuracy per scenario and overall
 * - Slot accuracy (amount, recipientPhone) per scenario and overall
 * 
 * NOT IN CI. Executable via: `npx tsx scripts/run_eval_transcripts.ts`
 */

import fs from 'fs';
import path from 'path';
import { Brain } from '../src/ai_system/brain/brain';
import { geminiClient } from '../src/services/geminiClient';
import { BrainInput, IntentId, LanguageId } from '../src/ai_system/brain/types';

interface EvalItem {
  id: string;
  scenario: 'en' | 'twi' | 'code-switched';
  transcript: string;
  expectedIntent: IntentId;
  expectedSlots: {
    amount?: number;
    recipientPhone?: string;
    recipientName?: string;
  };
}

interface EvaluationResult {
  total: number;
  offlineIntentCorrect: number;
  offlineSlotCorrect: number;
  liveIntentCorrect: number;
  liveSlotCorrect: number;
  liveModelCalls: number;
  liveFallbacks: number;
  offlineFailedTranscripts: Array<{ id: string; transcript: string; reason: string }>;
  liveFailedTranscripts: Array<{ id: string; transcript: string; reason: string }>;
  byScenario: Record<string, {
    total: number;
    offlineIntentCorrect: number;
    offlineSlotCorrect: number;
    liveIntentCorrect: number;
    liveSlotCorrect: number;
  }>;
}

export async function runEvaluation(datasetPath?: string): Promise<EvaluationResult> {
  const filePath = datasetPath || path.resolve(process.cwd(), 'data/evalTranscripts.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Evaluation dataset file not found at: ${filePath}`);
  }

  const dataset: EvalItem[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const offlineBrain = new Brain({ mode: 'offline_only' });
  const liveBrain = new Brain({ mode: 'live' });
  const liveAvailable = geminiClient.isAvailable();

  const result: EvaluationResult = {
    total: dataset.length,
    offlineIntentCorrect: 0,
    offlineSlotCorrect: 0,
    liveIntentCorrect: 0,
    liveSlotCorrect: 0,
    liveModelCalls: 0,
    liveFallbacks: 0,
    offlineFailedTranscripts: [],
    liveFailedTranscripts: [],
    byScenario: {
      en: { total: 0, offlineIntentCorrect: 0, offlineSlotCorrect: 0, liveIntentCorrect: 0, liveSlotCorrect: 0 },
      twi: { total: 0, offlineIntentCorrect: 0, offlineSlotCorrect: 0, liveIntentCorrect: 0, liveSlotCorrect: 0 },
      'code-switched': { total: 0, offlineIntentCorrect: 0, offlineSlotCorrect: 0, liveIntentCorrect: 0, liveSlotCorrect: 0 },
    },
  };

  for (const item of dataset) {
    const scenarioStats = result.byScenario[item.scenario];
    scenarioStats.total++;

    const sessionLang: LanguageId =
      item.scenario === 'twi' ? 'twi-asante' : item.scenario === 'code-switched' ? 'mixed-twi-en' : 'en';

    const input: BrainInput = {
      transcript: item.transcript,
      language: sessionLang,
      languageConfidence: 0.9,
      sessionLanguage: sessionLang,
      draft: { slots: {} },
    };

    // 1. Evaluate Offline Engine
    const offlineOut = await offlineBrain.process(input);
    const offlineIntentMatch =
      ('intent' in offlineOut.decision && offlineOut.decision.intent === item.expectedIntent) ||
      offlineOut.updatedDraft.intent === item.expectedIntent;

    let offlineSlotsMatch = true;
    if (item.expectedSlots.amount !== undefined) {
      if (offlineOut.updatedDraft.slots.amount !== item.expectedSlots.amount) {
        offlineSlotsMatch = false;
      }
    }
    if (item.expectedSlots.recipientPhone !== undefined) {
      if (offlineOut.updatedDraft.slots.recipient?.phone !== item.expectedSlots.recipientPhone) {
        offlineSlotsMatch = false;
      }
    }

    if (offlineIntentMatch) {
      result.offlineIntentCorrect++;
      scenarioStats.offlineIntentCorrect++;
    }
    if (offlineSlotsMatch) {
      result.offlineSlotCorrect++;
      scenarioStats.offlineSlotCorrect++;
    }
    if (!offlineIntentMatch || !offlineSlotsMatch) {
      result.offlineFailedTranscripts.push({
        id: item.id,
        transcript: item.transcript,
        reason: !offlineIntentMatch ? `Intent mismatch: expected ${item.expectedIntent}` : `Slot mismatch`,
      });
    }

    // 2. Evaluate Live Model (or mirror offline when API unconfigured)
    let liveIntentMatch = false;
    let liveSlotsMatch = false;

    if (liveAvailable) {
      try {
        result.liveModelCalls++;
        const liveOut = await liveBrain.process(input);
        liveIntentMatch =
          ('intent' in liveOut.decision && liveOut.decision.intent === item.expectedIntent) ||
          liveOut.updatedDraft.intent === item.expectedIntent;

        liveSlotsMatch = true;
        if (item.expectedSlots.amount !== undefined) {
          if (liveOut.updatedDraft.slots.amount !== item.expectedSlots.amount) {
            liveSlotsMatch = false;
          }
        }
        if (item.expectedSlots.recipientPhone !== undefined) {
          if (liveOut.updatedDraft.slots.recipient?.phone !== item.expectedSlots.recipientPhone) {
            liveSlotsMatch = false;
          }
        }
      } catch {
        result.liveFallbacks++;
        liveIntentMatch = offlineIntentMatch;
        liveSlotsMatch = offlineSlotsMatch;
      }
    } else {
      result.liveFallbacks++;
      liveIntentMatch = offlineIntentMatch;
      liveSlotsMatch = offlineSlotsMatch;
    }

    if (liveIntentMatch) {
      result.liveIntentCorrect++;
      scenarioStats.liveIntentCorrect++;
    }
    if (liveSlotsMatch) {
      result.liveSlotCorrect++;
      scenarioStats.liveSlotCorrect++;
    }
    if (!liveIntentMatch || !liveSlotsMatch) {
      result.liveFailedTranscripts.push({
        id: item.id,
        transcript: item.transcript,
        reason: !liveIntentMatch ? `Intent mismatch: expected ${item.expectedIntent}` : `Slot mismatch`,
      });
    }
  }

  return result;
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  runEvaluation()
    .then((res) => {
      console.log('========================================================================');
      console.log('Ɔkwankyerɛfo Pa - Intent & Slot Accuracy Benchmark Report');
      console.log('========================================================================');
      console.log(`Total Evaluated Transcripts: ${res.total}`);
      console.log(`Offline Overall Intent Accuracy : ${((res.offlineIntentCorrect / res.total) * 100).toFixed(1)}%`);
      console.log(`Offline Overall Slot Accuracy   : ${((res.offlineSlotCorrect / res.total) * 100).toFixed(1)}%`);
      console.log(`Live Model Intent Accuracy      : ${((res.liveIntentCorrect / res.total) * 100).toFixed(1)}%`);
      console.log(`Live Model Slot Accuracy        : ${((res.liveSlotCorrect / res.total) * 100).toFixed(1)}%`);
      console.log(`Live Model Calls Executed       : ${res.liveModelCalls}`);
      console.log(`Live Model Fallback Count       : ${res.liveFallbacks}\n`);

      console.log('--- Breakdown by Scenario ---');
      for (const [scenario, stats] of Object.entries(res.byScenario)) {
        const pctIntent = ((stats.offlineIntentCorrect / stats.total) * 100).toFixed(1);
        const pctSlot = ((stats.offlineSlotCorrect / stats.total) * 100).toFixed(1);
        console.log(`[${scenario.toUpperCase().padEnd(14)}] Count: ${stats.total} | Intent: ${pctIntent}% | Slot: ${pctSlot}%`);
      }

      console.log('\n--- Failed Transcripts (Offline) ---');
      res.offlineFailedTranscripts.forEach((f) => {
        console.log(`  • [${f.id}] "${f.transcript}" -> ${f.reason}`);
      });

      console.log('\n--- Failed Transcripts (Live Model) ---');
      res.liveFailedTranscripts.forEach((f) => {
        console.log(`  • [${f.id}] "${f.transcript}" -> ${f.reason}`);
      });
      console.log('========================================================================');
    })
    .catch((err) => {
      console.error('Evaluation run failed:', err);
      process.exit(1);
    });
}
