/**
 * Ɔkwankyerɛfo Pa - Deterministic Overlap Transcript Merger (transcriptMerger.ts)
 * 
 * Safely merges overlapping ASR chunk transcripts without boundary word stuttering.
 * Example:
 * Chunk 1: "mepa wo kyɛw mane sika aduonu kɔma"
 * Chunk 2: "aduonu kɔma Ama wɔ 0553838464"
 * Output:   "mepa wo kyɛw mane sika aduonu kɔma Ama wɔ 0553838464"
 * 
 * Rules:
 * - Deterministic token matching on normalized stems.
 * - Preserves Ghanaian names, currency terms, and phone numbers.
 * - Protects legitimate repetition (e.g., "baako baako", "5 5").
 */

export interface ChunkMergeItem {
  sequenceNumber: number;
  transcript: string;
}

export class TranscriptMerger {
  /**
   * Cleans a single token for matching (lowercase, strips punctuation).
   */
  private cleanToken(token: string): string {
    return token
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, "")
      .trim();
  }

  /**
   * Splits text into whitespace-delimited tokens while preserving original casing.
   */
  private tokenize(text: string): string[] {
    return text.trim().split(/\s+/).filter((t) => t.length > 0);
  }

  /**
   * Merges an incoming chunk transcript into an existing prefix transcript.
   * 
   * @param previous The accumulated transcript so far
   * @param incoming The next chunk transcript
   * @param minOverlapTokens Minimum overlapping tokens required (default 1)
   * @param maxOverlapTokens Maximum search window for overlap (default 8)
   */
  public mergeTwo(
    previous: string,
    incoming: string,
    minOverlapTokens: number = 1,
    maxOverlapTokens: number = 8
  ): string {
    const prevClean = previous.trim();
    const nextClean = incoming.trim();

    if (!prevClean) return nextClean;
    if (!nextClean) return prevClean;

    // If identical, return one
    if (prevClean.toLowerCase() === nextClean.toLowerCase()) {
      return prevClean;
    }

    const prevTokens = this.tokenize(prevClean);
    const nextTokens = this.tokenize(nextClean);

    const prevMatchTokens = prevTokens.map((t) => this.cleanToken(t));
    const nextMatchTokens = nextTokens.map((t) => this.cleanToken(t));

    // Determine maximum possible overlap window
    const searchLimit = Math.min(maxOverlapTokens, prevTokens.length, nextTokens.length);

    let bestOverlap = 0;

    // Search from longest possible overlap down to minOverlapTokens
    for (let k = searchLimit; k >= minOverlapTokens; k--) {
      const prevSuffix = prevMatchTokens.slice(prevTokens.length - k);
      const nextPrefix = nextMatchTokens.slice(0, k);

      let match = true;
      for (let i = 0; i < k; i++) {
        if (!prevSuffix[i] || !nextPrefix[i] || prevSuffix[i] !== nextPrefix[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        // Special guard: If k === 1, ensure it's not a common stop word where
        // legitimate repetition was intended unless context supports it.
        if (k === 1) {
          const singleWord = prevSuffix[0];
          // Common single Ghanaian repetitions: "baako baako", "kɔ kɔ", "no no", "five five"
          const prevLastTwo = prevTokens.slice(-2).map((t) => this.cleanToken(t));
          if (prevLastTwo.length === 2 && prevLastTwo[0] === singleWord && prevLastTwo[1] === singleWord) {
            // It was already repeated legitimately in prev, don't deduplicate
            continue;
          }
        }

        bestOverlap = k;
        break;
      }
    }

    if (bestOverlap > 0) {
      // Append non-overlapping tokens from incoming
      const remainingNextTokens = nextTokens.slice(bestOverlap);
      if (remainingNextTokens.length === 0) {
        return prevClean;
      }
      return `${prevClean} ${remainingNextTokens.join(" ")}`;
    }

    // No overlap found: join with single space
    return `${prevClean} ${nextClean}`;
  }

  /**
   * Deterministically merges an ordered list of chunks.
   */
  public mergeOrdered(chunks: ChunkMergeItem[]): string {
    if (!chunks || chunks.length === 0) return "";

    // Sort strictly by sequenceNumber to guarantee deterministic order
    const sorted = [...chunks]
      .filter((c) => c && typeof c.transcript === "string" && c.transcript.trim().length > 0)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (sorted.length === 0) return "";

    let accumulated = sorted[0].transcript.trim();
    for (let i = 1; i < sorted.length; i++) {
      accumulated = this.mergeTwo(accumulated, sorted[i].transcript.trim());
    }

    return accumulated;
  }
}

export const transcriptMerger = new TranscriptMerger();
