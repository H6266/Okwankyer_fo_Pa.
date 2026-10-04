/**
 * Ɔkwankyerɛfo Pa - Speech Recognition Evaluation Metrics (metrics.ts)
 * 
 * Provides rigorous, mathematically sound ASR evaluation metrics:
 * 1. Word Error Rate (WER) via dynamic programming Levenshtein distance
 * 2. Character Error Rate (CER)
 * 3. Exact string match percentage
 * 4. Latency and provider breakdown metrics
 */

export interface AsrEvaluationItem {
  id: string;
  reference: string;
  hypothesis: string;
  language: string;
  wer: number;
  cer: number;
  exactMatch: boolean;
  latencyMs: number;
  provider: string;
}

export interface AsrBenchmarkSummary {
  totalItems: number;
  averageWer: number;
  averageCer: number;
  exactMatchRate: number;
  averageLatencyMs: number;
  providerCoverage: Record<string, number>;
  items: AsrEvaluationItem[];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\sɛɔƐƆ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculates Levenshtein distance between two token sequences (words or characters).
 */
export function levenshteinDistance<T>(seq1: T[], seq2: T[]): number {
  const m = seq1.length;
  const n = seq2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seq1[i - 1] === seq2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // Deletion
          dp[i][j - 1] + 1,      // Insertion
          dp[i - 1][j - 1] + 1   // Substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Computes Word Error Rate (WER) = (S + D + I) / N
 */
export function computeWer(reference: string, hypothesis: string): number {
  const refWords = normalizeText(reference).split(/\s+/).filter(Boolean);
  const hypWords = normalizeText(hypothesis).split(/\s+/).filter(Boolean);

  if (refWords.length === 0) {
    return hypWords.length === 0 ? 0 : 1.0;
  }

  const distance = levenshteinDistance(refWords, hypWords);
  return Number((distance / refWords.length).toFixed(4));
}

/**
 * Computes Character Error Rate (CER) = (S + D + I) / N_chars
 */
export function computeCer(reference: string, hypothesis: string): number {
  const refChars = normalizeText(reference).replace(/\s/g, "").split("");
  const hypChars = normalizeText(hypothesis).replace(/\s/g, "").split("");

  if (refChars.length === 0) {
    return hypChars.length === 0 ? 0 : 1.0;
  }

  const distance = levenshteinDistance(refChars, hypChars);
  return Number((distance / refChars.length).toFixed(4));
}

/**
 * Compiles a comprehensive ASR benchmark report from evaluated items.
 */
export function summarizeAsrBenchmark(items: AsrEvaluationItem[]): AsrBenchmarkSummary {
  if (items.length === 0) {
    return {
      totalItems: 0,
      averageWer: 0,
      averageCer: 0,
      exactMatchRate: 0,
      averageLatencyMs: 0,
      providerCoverage: {},
      items: [],
    };
  }

  const totalWer = items.reduce((sum, item) => sum + item.wer, 0);
  const totalCer = items.reduce((sum, item) => sum + item.cer, 0);
  const exactMatches = items.filter((item) => item.exactMatch).length;
  const totalLatency = items.reduce((sum, item) => sum + item.latencyMs, 0);

  const providerCoverage: Record<string, number> = {};
  for (const item of items) {
    providerCoverage[item.provider] = (providerCoverage[item.provider] || 0) + 1;
  }

  return {
    totalItems: items.length,
    averageWer: Number((totalWer / items.length).toFixed(4)),
    averageCer: Number((totalCer / items.length).toFixed(4)),
    exactMatchRate: Number((exactMatches / items.length).toFixed(4)),
    averageLatencyMs: Math.round(totalLatency / items.length),
    providerCoverage,
    items,
  };
}
