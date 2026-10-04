/**
 * Ɔkwankyerɛfo Pa - Authoritative ASR Benchmark Evaluation Runner (scripts/run_asr_eval.ts)
 * 
 * Benchmarks speech recognition against gold-standard Ghanaian utterances:
 * - Computes Word Error Rate (WER)
 * - Computes Character Error Rate (CER)
 * - Exact String Match rate
 * - Average inference latency (ms)
 * - Provider breakdown
 * 
 * Fails if no local neural provider generated evaluated transcripts,
 * unless ALLOW_REMOTE_ONLY_ASR_EVAL=true is explicitly provided.
 */

import fs from "fs";
import path from "path";
import { asrRouter } from "../src/ai_system/speech/asr/asrRouter";
import {
  computeWer,
  computeCer,
  summarizeAsrBenchmark,
  AsrEvaluationItem,
} from "../src/ai_system/speech/asr/metrics";

interface GoldItem {
  id: string;
  audio: string;
  reference: string;
  language: "tw" | "en";
  speakerId: string;
}

async function runAsrEvaluation() {
  console.log("📊 [ASR Evaluation] Initializing Empirical Ghanaian ASR Benchmark...\n");

  const goldPath = path.resolve(process.cwd(), "eval/asr/gold.jsonl");
  if (!fs.existsSync(goldPath)) {
    throw new Error(`Gold evaluation file not found at ${goldPath}`);
  }

  const rawLines = fs.readFileSync(goldPath, "utf-8").split("\n").filter((l) => l.trim().length > 0);
  const items: GoldItem[] = rawLines.map((line) => JSON.parse(line));

  console.log(`Loaded ${items.length} gold test utterances from eval/asr/gold.jsonl.`);

  const evalResults: AsrEvaluationItem[] = [];

  for (const item of items) {
    const audioPath = path.resolve(process.cwd(), item.audio);
    if (!fs.existsSync(audioPath)) {
      console.warn(`[ASR Eval] Warning: Audio file ${item.audio} not found, skipping.`);
      continue;
    }

    const audioBuffer = fs.readFileSync(audioPath);
    const mimeType = item.audio.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

    const start = performance.now();
    const result = await asrRouter.transcribe(audioBuffer, mimeType, item.language);
    const latencyMs = Math.round(performance.now() - start);

    const wer = computeWer(item.reference, result.text);
    const cer = computeCer(item.reference, result.text);
    const exactMatch = item.reference.toLowerCase().trim() === result.text.toLowerCase().trim();

    evalResults.push({
      id: item.id,
      reference: item.reference,
      hypothesis: result.text,
      language: item.language,
      wer,
      cer,
      exactMatch,
      latencyMs,
      provider: result.provider,
    });
  }

  const summary = summarizeAsrBenchmark(evalResults);

  console.log("\n==================== ASR BENCHMARK RESULTS ====================");
  console.log(`Total Utterances Evaluated: ${summary.totalItems}`);
  console.log(`Average Word Error Rate (WER): ${(summary.averageWer * 100).toFixed(2)}%`);
  console.log(`Average Character Error Rate (CER): ${(summary.averageCer * 100).toFixed(2)}%`);
  console.log(`Exact Match Rate: ${(summary.exactMatchRate * 100).toFixed(2)}%`);
  console.log(`Average Inference Latency: ${summary.averageLatencyMs} ms`);
  console.log("\nProvider Coverage Breakdown:");
  for (const [provider, count] of Object.entries(summary.providerCoverage)) {
    console.log(`  • ${provider}: ${count} utterances (${((count / summary.totalItems) * 100).toFixed(1)}%)`);
  }
  console.log("===============================================================\n");

  // Export report to eval/reports/asr_benchmark_latest.json
  const reportsDir = path.resolve(process.cwd(), "eval/reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(reportsDir, "asr_benchmark_latest.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), ...summary }, null, 2)
  );

  const hasNeuralProvider = Object.keys(summary.providerCoverage).some(
    (p) => p.includes("neural") || p.includes("whisper")
  );

  const allowRemoteOnly = process.env.ALLOW_REMOTE_ONLY_ASR_EVAL === "true";

  if (!hasNeuralProvider && !allowRemoteOnly) {
    console.log("❌ ASR EVALUATION FAILED: No local neural provider generated evaluated transcripts.");
    console.log("Per Batch 2 Invariants: Deterministic signal processing or fallbacks cannot be presented as official ASR performance.");
    console.log("Start the faster-whisper local worker at localhost:8765, or pass ALLOW_REMOTE_ONLY_ASR_EVAL=true for routing experiments.");
    process.exit(1);
  }

  console.log("✓ ASR evaluation completed successfully.");
}

runAsrEvaluation().catch((err) => {
  console.error("FATAL: ASR evaluation failed:", err);
  process.exit(1);
});
