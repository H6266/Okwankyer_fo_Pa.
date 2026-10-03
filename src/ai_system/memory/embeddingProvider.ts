/**
 * Ɔkwankyerɛfo Pa - Embedding Provider & Vector Similarity (embeddingProvider.ts)
 *
 * Implements real semantic embedding generation using @google/genai
 * model 'gemini-embedding-2-preview' with verified cosine similarity.
 *
 * Explicitly distinguishes real semantic embeddings from offline lexical fallback.
 */

import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "../core/aiConfig";

export interface EmbeddingResult {
  vector: number[];
  source: "GEMINI_EMBEDDING" | "LEXICAL_FALLBACK";
  dimension: number;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
  cosineSimilarity(a: number[], b: number[]): number;
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private ai: GoogleGenAI | null = null;
  private fallbackProvider: LexicalFallbackEmbeddingProvider;

  constructor() {
    this.fallbackProvider = new LexicalFallbackEmbeddingProvider();
    if (process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  public async embed(text: string): Promise<EmbeddingResult> {
    const clean = text.trim();
    if (!clean) {
      return this.fallbackProvider.embed(text);
    }

    // In unit tests without live internet, use deterministic fallback
    if (process.env.VITEST && process.env.ENABLE_REMOTE_AI_TESTS !== "true") {
      return this.fallbackProvider.embed(text);
    }

    if (!this.ai || !process.env.GEMINI_API_KEY) {
      return this.fallbackProvider.embed(text);
    }

    try {
      const response = await this.ai.models.embedContent({
        model: AI_CONFIG.embeddingModel,
        contents: clean,
      });

      const values = response.embeddings?.[0]?.values;
      if (values && Array.isArray(values) && values.length > 0) {
        return {
          vector: values,
          source: "GEMINI_EMBEDDING",
          dimension: values.length,
        };
      }
      return this.fallbackProvider.embed(text);
    } catch (err: any) {
      // Fail safely to lexical fallback
      return this.fallbackProvider.embed(text);
    }
  }

  public cosineSimilarity(a: number[], b: number[]): number {
    return this.fallbackProvider.cosineSimilarity(a, b);
  }
}

export class LexicalFallbackEmbeddingProvider implements IEmbeddingProvider {
  private dimension = 64;

  public async embed(text: string): Promise<EmbeddingResult> {
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase().trim();
    if (!normalized) {
      return { vector, source: "LEXICAL_FALLBACK", dimension: this.dimension };
    }

    // Token frequency & character 3-gram distribution hashed into fixed dimensionality
    const tokens = normalized.split(/\s+/);
    for (const t of tokens) {
      let hash = 5381;
      for (let i = 0; i < t.length; i++) {
        hash = (hash * 33) ^ t.charCodeAt(i);
      }
      const idx = Math.abs(hash) % this.dimension;
      vector[idx] += 1.0;
    }

    for (let i = 0; i <= normalized.length - 3; i++) {
      const trigram = normalized.substring(i, i + 3);
      let hash = 0;
      for (let j = 0; j < 3; j++) {
        hash = (hash << 5) - hash + trigram.charCodeAt(j);
      }
      const idx = Math.abs(hash) % this.dimension;
      vector[idx] += 0.5;
    }

    // L2 Normalization
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return {
      vector,
      source: "LEXICAL_FALLBACK",
      dimension: this.dimension,
    };
  }

  public cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : Math.max(0, Math.min(1.0, dot / denom));
  }
}

export const embeddingProvider: IEmbeddingProvider = new GeminiEmbeddingProvider();
