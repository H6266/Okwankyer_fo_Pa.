/**
 * Ɔkwankyerɛfo Pa - AI Speech & NLU Evaluation Harness
 * 
 * Benchmarks and measures accuracy, confidence thresholds, and DTMF fallback rates
 * across:
 * 1. Labeled text corpus (English, Akan Twi, colloquial noise, and out-of-scope).
 * 2. Real audio recordings (ASR evaluation using real MP3/WAV audio files from the repository).
 * 
 * Strict Rule 7 compliance: No fake accuracy figures or mock latencies.
 * All reported metrics come from real code executions.
 */

import fs from "fs";
import path from "path";
import { parseUserIntent, IntentType } from "../modules/nluService";
import { speechToText } from "../modules/sttService";

export interface LabeledUtterance {
  id: string;
  text: string;
  expectedIntent: IntentType;
  language: "en" | "twi" | "mixed";
  isNoiseOrOutOfScope?: boolean;
  expectedMinConfidence?: number;
  isFinancialSlot?: boolean;
}

export const LABELED_EVAL_CORPUS: LabeledUtterance[] = [
  // ── English Standard & Colloquial ─────────────────────────────────
  { id: "en-1", text: "1", expectedIntent: "SEND_MONEY", language: "en" },
  { id: "en-2", text: "one", expectedIntent: "SEND_MONEY", language: "en" },
  { id: "en-3", text: "send money", expectedIntent: "SEND_MONEY", language: "en" },
  { id: "en-4", text: "I want to send money to Kwame", expectedIntent: "SEND_MONEY", language: "en", isFinancialSlot: true },
  { id: "en-5", text: "transfer 50 cedis to 0553838464", expectedIntent: "SEND_MONEY", language: "en", isFinancialSlot: true },
  { id: "en-6", text: "send 500 cedis", expectedIntent: "SEND_MONEY", language: "en", isFinancialSlot: true },
  { id: "en-7", text: "check my balance", expectedIntent: "CHECK_BALANCE", language: "en" },
  { id: "en-8", text: "how much is in my account", expectedIntent: "CHECK_BALANCE", language: "en" },
  { id: "en-9", text: "cancel this transaction", expectedIntent: "CANCEL", language: "en" },
  { id: "en-10", text: "stop", expectedIntent: "CANCEL", language: "en" },
  { id: "en-11", text: "go back to previous step", expectedIntent: "GO_BACK", language: "en" },
  { id: "en-12", text: "8", expectedIntent: "GO_BACK", language: "en" },
  { id: "en-13", text: "0", expectedIntent: "EXIT", language: "en" },
  { id: "en-14", text: "exit", expectedIntent: "EXIT", language: "en" },
  { id: "en-15", text: "help me", expectedIntent: "HELP", language: "en" },
  { id: "en-16", text: "pay electricity bill", expectedIntent: "PAY_BILL", language: "en" },
  { id: "en-17", text: "buy airtime for my phone", expectedIntent: "BUY_AIRTIME", language: "en" },

  // ── Akan Twi Standard & Dialectal ─────────────────────────────────
  { id: "tw-1", text: "baako", expectedIntent: "SEND_MONEY", language: "twi" },
  { id: "tw-2", text: "mmienu", expectedIntent: "SEND_MONEY", language: "twi" },
  { id: "tw-3", text: "mane sika kɔ ma Kwame", expectedIntent: "SEND_MONEY", language: "twi", isFinancialSlot: true },
  { id: "tw-4", text: "sika a aka wɔ me account mu", expectedIntent: "CHECK_BALANCE", language: "twi" },
  { id: "tw-5", text: "gye sika no bra", expectedIntent: "CASH_OUT", language: "twi" },
  { id: "tw-6", text: "tɔ airtime", expectedIntent: "BUY_AIRTIME", language: "twi" },
  { id: "tw-7", text: "gyae", expectedIntent: "CANCEL", language: "twi" },
  { id: "tw-8", text: "kɔ akyi", expectedIntent: "GO_BACK", language: "twi" },
  { id: "tw-9", text: "san akyi", expectedIntent: "GO_BACK", language: "twi" },
  { id: "tw-10", text: "tie biom", expectedIntent: "HELP", language: "twi" },
  { id: "tw-11", text: "bue me account ma me", expectedIntent: "CHECK_ACCOUNT", language: "twi" },

  // ── Colloquial & Noisy Variants ───────────────────────────────────
  { id: "noise-1", text: "uh please send like 50 cedis to my brother", expectedIntent: "SEND_MONEY", language: "en", isFinancialSlot: true },
  { id: "noise-2", text: "actually can you check my balance first", expectedIntent: "CHECK_BALANCE", language: "en" },
  { id: "noise-3", text: "stop stop cancel everything", expectedIntent: "CANCEL", language: "en" },
  { id: "noise-4", text: "no wait go back please", expectedIntent: "GO_BACK", language: "en" },
  { id: "noise-5", text: "mepa wo kyɛw mane sika kakra kɔma me maame", expectedIntent: "SEND_MONEY", language: "twi", isFinancialSlot: true },

  // ── Out-of-Scope / Background Noise (Should Trigger Fallback or UNKNOWN) ─
  { id: "oos-1", text: "order me a large pepperoni pizza", expectedIntent: "UNKNOWN", language: "en", isNoiseOrOutOfScope: true },
  { id: "oos-2", text: "what is the capital of France", expectedIntent: "UNKNOWN", language: "en", isNoiseOrOutOfScope: true },
  { id: "oos-3", text: "empty", expectedIntent: "UNKNOWN", language: "en", isNoiseOrOutOfScope: true },
  { id: "oos-4", text: "[background static]", expectedIntent: "UNKNOWN", language: "en", isNoiseOrOutOfScope: true },
];

export interface EvalReport {
  totalUtterances: number;
  correctClassifications: number;
  accuracyPercent: number;
  totalOutOfScope: number;
  fallbackTriggeredCount: number;
  fallbackRatePercent: number;
  financialSlotCount: number;
  financialSafelyGatedCount: number;
  failures: Array<{
    id: string;
    text: string;
    expected: IntentType;
    actual: IntentType;
    confidence: number;
  }>;
}

/**
 * Runs the text evaluation suite and returns structured accuracy and fallback metrics
 */
export async function runEvaluationHarness(
  corpus: LabeledUtterance[] = LABELED_EVAL_CORPUS
): Promise<EvalReport> {
  let correct = 0;
  let fallbackCount = 0;
  let oosCount = 0;
  let financialSlotCount = 0;
  let financialSafelyGatedCount = 0;
  const failures: EvalReport["failures"] = [];

  for (const item of corpus) {
    const result = await parseUserIntent(item.text);
    const isCorrect = result.intent === item.expectedIntent;

    if (item.isNoiseOrOutOfScope) {
      oosCount++;
      if (result.intent === "UNKNOWN" || result.confidence < 0.75) {
        fallbackCount++;
      }
    }

    if (item.isFinancialSlot) {
      financialSlotCount++;
      if (result.intent === "SEND_MONEY") {
        financialSafelyGatedCount++;
      }
    }

    if (isCorrect) {
      correct++;
    } else {
      failures.push({
        id: item.id,
        text: item.text,
        expected: item.expectedIntent,
        actual: result.intent,
        confidence: result.confidence,
      });
    }
  }

  const accuracyPercent = Math.round((correct / corpus.length) * 1000) / 10;
  const fallbackRatePercent = oosCount > 0 ? Math.round((fallbackCount / oosCount) * 1000) / 10 : 0;

  return {
    totalUtterances: corpus.length,
    correctClassifications: correct,
    accuracyPercent,
    totalOutOfScope: oosCount,
    fallbackTriggeredCount: fallbackCount,
    fallbackRatePercent,
    financialSlotCount,
    financialSafelyGatedCount,
    failures,
  };
}

// ── Audio Speech-to-Text Evaluation ───────────────────────────────────

export interface AudioSampleBenchmark {
  id: string;
  filePath: string;
  expectedKeywords: string[];
  isSilenceOrNoise?: boolean;
}

export const AUDIO_EVAL_SAMPLES: AudioSampleBenchmark[] = [
  {
    id: "audio-welcome-en",
    filePath: "audio/Welcome_prompt_01.mp3",
    expectedKeywords: ["welcome", "english", "twi"],
  },
  {
    id: "audio-menu-en",
    filePath: "audio/English/Audio_prompt_02.mp3",
    expectedKeywords: ["telecom", "mobile", "banking"],
  },
  {
    id: "audio-network-en",
    filePath: "audio/English/Audio_prompt_03.mp3",
    expectedKeywords: ["network", "mtn", "telecel"],
  },
  {
    id: "audio-momo-menu-en",
    filePath: "audio/English/Audio_prompt_05.mp3",
    expectedKeywords: ["send", "money", "bills", "airtime"],
  },
  {
    id: "audio-welcome-twi",
    filePath: "audio/Twi/Welcome_prompt_01.mp3",
    expectedKeywords: ["akwaaba", "borɔfo", "twi"],
  },
];

export interface AudioEvalReport {
  totalAudioSamples: number;
  samplesEvaluated: number;
  averageLatencyMs: number;
  keywordMatchRatePercent: number;
  results: Array<{
    id: string;
    filePath: string;
    text: string;
    confidence: number;
    latencyMs: number;
    matchedKeywords: string[];
    passed: boolean;
  }>;
}

/**
 * Evaluates speech recognition on real audio files from disk.
 * Returns measured latency and keyword fidelity.
 */
export async function runAudioEvaluationHarness(
  samples: AudioSampleBenchmark[] = AUDIO_EVAL_SAMPLES
): Promise<AudioEvalReport> {
  const results: AudioEvalReport["results"] = [];
  let totalLatency = 0;
  let matchesCount = 0;

  for (const sample of samples) {
    const fullPath = path.resolve(process.cwd(), sample.filePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const audioBuffer = fs.readFileSync(fullPath);
    const start = performance.now();

    const stt = await speechToText(audioBuffer, "audio/mp3");
    const latency = Math.round(performance.now() - start);
    totalLatency += latency;

    const lower = stt.text.toLowerCase();
    const matched = sample.expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const passed = Boolean(matched.length > 0 || (sample.isSilenceOrNoise && (stt.text === "empty" || stt.confidence === 0)));

    if (passed) {
      matchesCount++;
    }

    results.push({
      id: sample.id,
      filePath: sample.filePath,
      text: stt.text,
      confidence: stt.confidence,
      latencyMs: latency,
      matchedKeywords: matched,
      passed,
    });
  }

  const evaluatedCount = results.length;
  const avgLatency = evaluatedCount > 0 ? Math.round(totalLatency / evaluatedCount) : 0;
  const matchRate = evaluatedCount > 0 ? Math.round((matchesCount / evaluatedCount) * 1000) / 10 : 0;

  return {
    totalAudioSamples: samples.length,
    samplesEvaluated: evaluatedCount,
    averageLatencyMs: avgLatency,
    keywordMatchRatePercent: matchRate,
    results,
  };
}
