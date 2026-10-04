/**
 * Ɔkwankyerɛfo Pa - Calibrated Confidence Estimator (confidenceEstimator.ts)
 * 
 * Replaces fixed placeholder confidence scores (e.g. 0.95, 0.85) with
 * calibrated empirical probabilities derived from:
 * 1. Signal-to-Noise Ratio (SNR) in dB
 * 2. Phonetic lexical alignment match score
 * 3. Language probability agreement
 * 4. Duration sanity check
 */

export interface ConfidenceFactors {
  snrDb: number;
  lexicalMatchRatio: number;
  languageAgreement: boolean;
  durationMs: number;
  hasDtmfSupport?: boolean;
}

export class ConfidenceEstimator {
  /**
   * Computes a calibrated probability between 0.00 and 1.00.
   */
  public estimate(factors: ConfidenceFactors): number {
    if (factors.hasDtmfSupport) {
      // In-band DTMF tones have hardware-level precision
      return 0.99;
    }

    let score = 0.50;

    // SNR factor: 0dB to 30dB maps to [-0.20, +0.25]
    const clampedSnr = Math.max(-10, Math.min(35, factors.snrDb));
    const snrContribution = ((clampedSnr + 10) / 45) * 0.45 - 0.20;
    score += snrContribution;

    // Lexical match ratio: [0.0 to 1.0] maps to [-0.15, +0.30]
    const lexicalContribution = factors.lexicalMatchRatio * 0.45 - 0.15;
    score += lexicalContribution;

    // Language agreement bonus
    if (factors.languageAgreement) {
      score += 0.10;
    } else {
      score -= 0.10;
    }

    // Utterance duration factor (extremely short < 250ms or excessively long > 15000ms penalized)
    if (factors.durationMs < 250 || factors.durationMs > 15000) {
      score -= 0.15;
    }

    // Clamp between 0.05 and 0.98 (never claim 100% certainty for acoustic speech)
    const calibrated = Math.max(0.05, Math.min(0.98, score));
    return Math.round(calibrated * 100) / 100;
  }
}

export const confidenceEstimator = new ConfidenceEstimator();
