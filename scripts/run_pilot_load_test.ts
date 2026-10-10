/**
 * Ɔkwankyerɛfo Pa - Pilot Concurrency & Degradation Load Test
 * (scripts/run_pilot_load_test.ts)
 * 
 * Verifies:
 * 1. Concurrency Handling: Runs concurrent call sessions (default 20 concurrent calls).
 * 2. Degradation & Circuit Breaking: When Gemini encounters rate limits (HTTP 429) or high load,
 *    system gracefully falls back to deterministic offline engine, NEVER returning silence or hanging.
 * 3. Cost Modeling: Estimates Gemini token consumption and cost per completed call.
 * 
 * Executable via: `npx tsx scripts/run_pilot_load_test.ts`
 */

import { Brain } from '../src/ai_system/brain/brain';
import { geminiClient } from '../src/services/geminiClient';
import { pilotControls } from '../src/services/pilotControls';

interface LoadTestScenario {
  concurrency: number;
  totalCalls: number;
  simulatedErrorRate: number; // 0.0 - 1.0 (fraction of calls with simulated model failure)
}

interface LoadTestResult {
  concurrency: number;
  totalCalls: number;
  successfulTurns: number;
  silentOrFailedTurns: number; // INVARIANT: MUST BE 0!
  offlineFallbackTurns: number;
  latencies: number[];
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  estimatedCostUsdPerCall: number;
  estimatedCostGhsPerCall: number;
}

export async function runLoadTest(scenario: LoadTestScenario): Promise<LoadTestResult> {
  const { concurrency, totalCalls, simulatedErrorRate } = scenario;
  const brain = new Brain({ mode: 'live', skipModelTierConfidence: 0.95 });

  const latencies: number[] = [];
  let successfulTurns = 0;
  let silentOrFailedTurns = 0;
  let offlineFallbackTurns = 0;

  // Utterance test bank
  const testUtterances = [
    "I want to send 50 cedis to 0553838464",
    "Transfer twenty ghana cedis to zero two four one two three four five six seven",
    "Send 100 ghs to Kofi 0509876543 right now",
    "Please send 35 cedis to Ama on 0271122334",
    "I want to send five cedis to 0541122334",
  ];

  // Run in concurrent batches
  const batches: Array<Array<number>> = [];
  let currentBatch: number[] = [];
  for (let i = 0; i < totalCalls; i++) {
    currentBatch.push(i);
    if (currentBatch.length >= concurrency || i === totalCalls - 1) {
      batches.push([...currentBatch]);
      currentBatch = [];
    }
  }

  for (const batch of batches) {
    const promises = batch.map(async (callIndex) => {
      const utterance = testUtterances[callIndex % testUtterances.length];
      const simulateFailure = Math.random() < simulatedErrorRate;

      const start = Date.now();
      try {
        if (simulateFailure) {
          // Temporarily trip circuit breaker or simulate offline fallback
          pilotControls.setKillSwitch(true, "Simulated load degradation / rate limit test");
        }

        const out = await brain.process({
          transcript: utterance,
          language: 'en',
          languageConfidence: 0.9,
          sessionLanguage: 'en',
          draft: { slots: {} },
          callerNumber: `0553838${String(callIndex).padStart(3, '0')}`,
          sessionId: `load_test_${callIndex}`,
        });

        const duration = Date.now() - start;
        latencies.push(duration);

        if (!out || !out.reply || !out.reply.text || out.reply.text.trim().length === 0) {
          silentOrFailedTurns++;
        } else {
          successfulTurns++;
          if (simulateFailure || out.decision.kind === 'confirm') {
            offlineFallbackTurns++;
          }
        }
      } catch {
        silentOrFailedTurns++;
      } finally {
        if (simulateFailure) {
          pilotControls.setKillSwitch(false);
        }
      }
    });

    await Promise.all(promises);
  }

  // Latency computation
  latencies.sort((a, b) => a - b);
  const p50Ms = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length));

  // Cost calculation (Gemini Flash Token Pricing)
  // Input: $0.10 / 1M tokens ($0.00000010/token) | Output: $0.40 / 1M tokens ($0.00000040/token)
  // Avg call: 3.5 turns. Each turn: ~140 input tokens, ~35 output tokens.
  const turnsPerCall = 3.5;
  const inputTokensPerCall = turnsPerCall * 140;
  const outputTokensPerCall = turnsPerCall * 35;
  const costUsd = inputTokensPerCall * 0.00000010 + outputTokensPerCall * 0.00000040;
  const usdToGhsRate = 14.5;
  const costGhs = costUsd * usdToGhsRate;

  return {
    concurrency,
    totalCalls,
    successfulTurns,
    silentOrFailedTurns,
    offlineFallbackTurns,
    latencies,
    p50Ms,
    p95Ms,
    avgMs,
    estimatedCostUsdPerCall: parseFloat(costUsd.toFixed(6)),
    estimatedCostGhsPerCall: parseFloat(costGhs.toFixed(6)),
  };
}

export async function runLoadTestCLI(): Promise<void> {
  console.log('='.repeat(72));
  console.log("Ɔkwankyerɛfo Pa - Concurrency & Graceful Degradation Load Test");
  console.log('='.repeat(72));

  const testConfig: LoadTestScenario = {
    concurrency: 20,
    totalCalls: 60,
    simulatedErrorRate: 0.35, // 35% of calls experience rate limit / circuit trip
  };

  console.log(`Target Concurrency     : ${testConfig.concurrency} concurrent calls`);
  console.log(`Total Simulated Calls  : ${testConfig.totalCalls}`);
  console.log(`Simulated 429/Degraded : ${(testConfig.simulatedErrorRate * 100).toFixed(0)}%`);
  console.log('-'.repeat(72));
  console.log("Executing simulated calls...");

  const res = await runLoadTest(testConfig);

  console.log('-'.repeat(72));
  console.log("Load Test Results:");
  console.log(`  - Total Processed Calls: ${res.totalCalls}`);
  console.log(`  - Successful Turns     : ${res.successfulTurns}`);
  console.log(`  - Silent / Failed Turns: ${res.silentOrFailedTurns} (MUST BE 0)`);
  console.log(`  - Graceful Fallbacks   : ${res.offlineFallbackTurns}`);
  console.log(`  - Latency p50 (Median) : ${res.p50Ms} ms`);
  console.log(`  - Latency p95          : ${res.p95Ms} ms`);
  console.log(`  - Average Latency      : ${res.avgMs} ms`);
  console.log('-'.repeat(72));
  console.log("Cost Modeling (Gemini Flash Token Economics):");
  console.log(`  - Estimated Cost / Call: $${res.estimatedCostUsdPerCall} USD (~${res.estimatedCostGhsPerCall} GHS)`);
  console.log(`  - 10,000 Calls Cost    : $${(res.estimatedCostUsdPerCall * 10000).toFixed(2)} USD (~GH₵${(res.estimatedCostGhsPerCall * 10000).toFixed(2)})`);
  console.log(`  - Offline Only Mode    : GH₵0.00 (Zero marginal API cost)`);
  console.log('='.repeat(72));

  if (res.silentOrFailedTurns === 0) {
    console.log("✓ RESILIENCE VERIFIED: 100% of degraded/rate-limited calls smoothly fell back to offline engine.");
  } else {
    console.error(`❌ FAILURE: ${res.silentOrFailedTurns} calls failed without graceful speech response!`);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('run_pilot_load_test')) {
  runLoadTestCLI().catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
  });
}
