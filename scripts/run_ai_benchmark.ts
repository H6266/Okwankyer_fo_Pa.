/**
 * Exploratory microbenchmark of two in-process intent paths.
 *
 * This script measures only the supplied labeled text samples and local call
 * latency. It does not measure ASR, memory use, offline availability, cloud
 * quality, or production performance.
 */
import { aiUnderstanding } from "../src/ai_system/core/aiUnderstanding";
import { reasoningEngine } from "../src/ai_system/understanding/reasoningEngine";
import { LABELED_EVAL_CORPUS } from "../src/ai_eval/evalHarness";

interface Measurement {
  name: string;
  correct: number;
  count: number;
  latenciesMs: number[];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}

function format(measurement: Measurement): string {
  const accuracy = (measurement.correct / measurement.count) * 100;
  return [
    measurement.name,
    `${measurement.count}`,
    `${accuracy.toFixed(1)}%`,
    `${percentile(measurement.latenciesMs, 0.5).toFixed(2)} ms`,
    `${percentile(measurement.latenciesMs, 0.95).toFixed(2)} ms`,
  ].join(" | ");
}

async function runBenchmark(): Promise<void> {
  const samples = LABELED_EVAL_CORPUS.slice(0, 20);
  if (samples.length === 0) throw new Error("The labeled evaluation corpus is empty.");

  const deterministic: Measurement = {
    name: "Local deterministic intent",
    correct: 0,
    count: samples.length,
    latenciesMs: [],
  };
  const reasoning: Measurement = {
    name: "Local deterministic reasoning",
    correct: 0,
    count: samples.length,
    latenciesMs: [],
  };

  for (const sample of samples) {
    let started = performance.now();
    const understood = aiUnderstanding.understand(sample.text, "welcome", {});
    deterministic.latenciesMs.push(performance.now() - started);
    if (understood.intent === sample.expectedIntent) deterministic.correct++;

    started = performance.now();
    const reasoned = reasoningEngine.deterministicReasoning({
      utterance: sample.text,
      currentStep: "welcome",
    });
    reasoning.latenciesMs.push(performance.now() - started);
    if (reasoned.intent === sample.expectedIntent) reasoning.correct++;
  }

  console.log("Exploratory local intent microbenchmark");
  console.log(`Samples: first ${samples.length} entries of LABELED_EVAL_CORPUS`);
  console.log("Metrics: intent match rate and in-process call latency only");
  console.log("These results do not establish production accuracy, memory, offline behavior, or cloud comparisons.\n");
  console.log("Path | Samples | Intent match | p50 latency | p95 latency");
  console.log(format(deterministic));
  console.log(format(reasoning));
}

runBenchmark().catch((error: unknown) => {
  console.error("Benchmark failed:", error);
  process.exitCode = 1;
});
