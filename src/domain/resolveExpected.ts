/**
 * Ɔkwankyerɛfo Pa - Expected Answer Grammar Resolver (resolveExpected.ts)
 * 
 * Determines whether caller speech matches the deterministic expectations of the current step
 * before invoking the central reasoning brain.
 */

import { StepDefinition } from "./stepRegistry";
import { formatSpokenNumbersAsDigits } from "./numberFormatter";
import { validateGhanaPhoneNumber, parseAndValidateAmount } from "./validation";

export type ResolveExpectedResult =
  | { matched: true; value: string; confidence: number }
  | { matched: false };

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function levenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return 1 - dist / maxLen;
}

export function cleanSpokenTranscript(raw: string): string {
  if (!raw) return "";
  let text = raw.toLowerCase().trim();
  // Strip punctuation
  text = text.replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ");
  // Strip common filler words
  text = text.replace(/\b(press|please|number|uh|um|er|ah|yo|so|just|okay|ok)\b/gi, " ");
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Resolves caller speech against the step's expected-answer grammar.
 */
export function resolveExpected(
  step: StepDefinition,
  transcript: string,
  _language: "en" | "twi" | string = "en"
): ResolveExpectedResult {
  if (!transcript || !transcript.trim()) {
    return { matched: false };
  }

  const rawClean = cleanSpokenTranscript(transcript);
  if (!rawClean) {
    return { matched: false };
  }

  // 1. Handle phone_number input type first
  if (step.inputType === "phone_number") {
    // Check navigation shortcuts if exact match (e.g. "back", "cancel", "repeat")
    if (step.spoken) {
      for (const [navDigit, aliases] of Object.entries(step.spoken)) {
        if (["8", "9", "0"].includes(navDigit)) {
          for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase();
            if (cleanAlias !== "0" && cleanAlias !== "zero" && (rawClean === cleanAlias || rawClean === `go ${cleanAlias}`)) {
              return { matched: true, value: navDigit, confidence: 1.0 };
            }
          }
        }
      }
    }

    // Convert spoken number words to digits (e.g. "zero five five three..." -> "0553...")
    const formatted = formatSpokenNumbersAsDigits(transcript);
    const digitsOnly = formatted.replace(/\D/g, "");
    if (digitsOnly.length >= 9) {
      const phoneRes = validateGhanaPhoneNumber(digitsOnly);
      if (phoneRes.valid && phoneRes.normalized) {
        return { matched: true, value: phoneRes.normalized, confidence: 1.0 };
      }
    }
    // Also try rawClean digits if any
    const rawDigits = rawClean.replace(/\D/g, "");
    if (rawDigits.length >= 9) {
      const phoneRes = validateGhanaPhoneNumber(rawDigits);
      if (phoneRes.valid && phoneRes.normalized) {
        return { matched: true, value: phoneRes.normalized, confidence: 1.0 };
      }
    }
  }

  // 2. Handle amount input type
  if (step.inputType === "amount") {
    // Check navigation shortcuts if exact match
    if (step.spoken) {
      for (const [navDigit, aliases] of Object.entries(step.spoken)) {
        if (["8", "9", "0"].includes(navDigit)) {
          for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase();
            if (cleanAlias !== "0" && cleanAlias !== "zero" && (rawClean === cleanAlias || rawClean === `go ${cleanAlias}`)) {
              return { matched: true, value: navDigit, confidence: 1.0 };
            }
          }
        }
      }
    }

    const formatted = formatSpokenNumbersAsDigits(transcript);
    // Find numeric candidates in formatted string (e.g. "50", "25.50", "100")
    const match = formatted.match(/\b\d+(?:[\.*]\d+)?\b/);
    if (match) {
      const amtRes = parseAndValidateAmount(match[0]);
      if (amtRes.valid && amtRes.amount !== undefined) {
        return { matched: true, value: String(amtRes.amount), confidence: 1.0 };
      }
    }
  }

  // 3. Navigation shortcuts available across steps
  if (step.spoken) {
    for (const [navDigit, aliases] of Object.entries(step.spoken)) {
      if (["8", "9", "0"].includes(navDigit)) {
        for (const alias of aliases) {
          const cleanAlias = alias.toLowerCase();
          if (rawClean === cleanAlias || rawClean === `go ${cleanAlias}` || rawClean.split(" ").includes(cleanAlias)) {
            return { matched: true, value: navDigit, confidence: 1.0 };
          }
          if (levenshteinRatio(rawClean, cleanAlias) >= 0.85) {
            return { matched: true, value: navDigit, confidence: 0.9 };
          }
        }
      }
    }
  }

  // 4. Handle single_digit / confirm steps (and general step spoken grammar)
  if (step.spoken) {
    const formatted = formatSpokenNumbersAsDigits(transcript);
    const formattedClean = cleanSpokenTranscript(formatted);
    const words = rawClean.split(" ").filter(Boolean);
    const formattedWords = formattedClean.split(" ").filter(Boolean);

    let bestMatch: { digit: string; confidence: number } | null = null;

    for (const [digit, aliases] of Object.entries(step.spoken)) {
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().trim();

        // Exact match against raw or formatted
        if (rawClean === cleanAlias || formattedClean === cleanAlias) {
          return { matched: true, value: digit, confidence: 1.0 };
        }

        // Substring / phrase match (e.g. "send money" in "i want to send money")
        if (
          cleanAlias.length > 3 &&
          (rawClean.includes(cleanAlias) || formattedClean.includes(cleanAlias))
        ) {
          const conf = 0.95;
          if (!bestMatch || conf > bestMatch.confidence) {
            bestMatch = { digit, confidence: conf };
          }
        }

        // Token overlap
        if (words.includes(cleanAlias) || formattedWords.includes(cleanAlias)) {
          // Prepositions "to" and "for" can only match if utterance is purely the digit or "option to"
          if (["to", "for"].includes(cleanAlias)) {
            if (words.length > 2 || words.some(w => ["send", "want", "transfer", "pay", "money", "check", "i", "we"].includes(w))) {
              continue;
            }
          }
          const conf = 0.9;
          if (!bestMatch || conf > bestMatch.confidence) {
            bestMatch = { digit, confidence: conf };
          }
        }

        // Levenshtein ratio on full text
        const ratioFull = Math.max(
          levenshteinRatio(rawClean, cleanAlias),
          levenshteinRatio(formattedClean, cleanAlias)
        );
        if (ratioFull >= 0.8) {
          if (!bestMatch || ratioFull > bestMatch.confidence) {
            bestMatch = { digit, confidence: ratioFull };
          }
        }

        // Levenshtein ratio on individual words
        for (const word of words) {
          if (word.length >= 3 && cleanAlias.length >= 3) {
            if (["send", "want", "money", "transfer"].includes(word)) {
              continue;
            }
            const ratioWord = levenshteinRatio(word, cleanAlias);
            if (ratioWord >= 0.8) {
              if (!bestMatch || ratioWord > bestMatch.confidence) {
                bestMatch = { digit, confidence: ratioWord };
              }
            }
          }
        }
      }
    }

    if (bestMatch) {
      return { matched: true, value: bestMatch.digit, confidence: bestMatch.confidence };
    }
  }

  return { matched: false };
}
