/**
 * Ɔkwankyerɛfo Pa - OpenAI Embeddings Provider (openaiEmbeddings.ts)
 * 
 * Provides vector embeddings using text-embedding-3-small for:
 * - Semantic long-term memory retrieval
 * - Conversation recall across sessions
 * - Frequent contact / recipient matching
 */

import { openaiClient } from "./openaiClient";

export interface OpenAiEmbeddingResult {
  vector: number[];
  dimension: number;
  source: "OPENAI_EMBEDDING";
}

export class OpenAIEmbeddingService {
  private getModel(): string {
    return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  }

  private getTimeoutMs(): number {
    const val = process.env.OPENAI_EMBEDDING_TIMEOUT_MS;
    return val ? parseInt(val, 10) : 3000;
  }

  public isAvailable(): boolean {
    return openaiClient.isAvailable();
  }

  public async embed(text: string): Promise<OpenAiEmbeddingResult> {
    const clean = text.trim();
    if (!clean) {
      throw new Error("EMPTY_EMBEDDING_TEXT: Cannot embed empty text.");
    }

    const vector = await openaiClient.executeWithTimeout(
      "EMBEDDING",
      async (client, signal) => {
        const response = await client.embeddings.create(
          {
            model: this.getModel(),
            input: clean,
          },
          { signal }
        );

        return response.data[0]?.embedding || [];
      },
      this.getTimeoutMs()
    );

    return {
      vector,
      dimension: vector.length,
      source: "OPENAI_EMBEDDING",
    };
  }

  public cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const openAiEmbeddings = new OpenAIEmbeddingService();
