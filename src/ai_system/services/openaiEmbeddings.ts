/**
 * Ɔkwankyerɛfo Pa - OpenAI Embeddings & Semantic Transaction Memory Service (openaiEmbeddings.ts)
 * 
 * OpenAI 4 — Embeddings Layer:
 * Responsible for:
 * - Semantic memory representation and retrieval across past transactions.
 * - Resolving user references like "Send the same amount to Ama again" or "Send to Ama like last week".
 * - Retrieving relevant past transaction context (recipient name, previous amount, phone number).
 * 
 * INVARIANT: Memory retrieval NEVER authorizes a transaction.
 * It merely provides contextual suggestions to the Reasoner and Service Requirement Planner.
 * All amounts and recipients must still proceed through explicit verification, caller confirmation,
 * and DTMF PIN handoff.
 */

export interface TransactionMemoryRecord {
  id: string;
  callerPhone?: string;
  recipientName: string;
  recipientPhone: string;
  amount: number;
  currency: string;
  summary: string;
  timestamp: number;
  embedding?: number[];
}

export interface SemanticRetrievalResult {
  hasMatch: boolean;
  matchedRecord?: TransactionMemoryRecord;
  similarityScore: number;
  contextSummary: string;
  suggestedSlots: {
    recipientName?: string;
    recipientPhone?: string;
    amount?: number;
  };
}

export class OpenAiEmbeddingsService {
  private memoryStore: Map<string, TransactionMemoryRecord[]> = new Map();

  constructor() {
    this.seedDefaultMemoryRecords();
  }

  private get apiKey(): string {
    return (process.env.OPENAI_API_KEY || "").trim();
  }

  private get embeddingModel(): string {
    return (process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Seeds realistic demo transaction records for immediate simulator responsiveness
   */
  private seedDefaultMemoryRecords(): void {
    const defaultCaller = "0240000000";
    const sampleHistory: TransactionMemoryRecord[] = [
      {
        id: "mem_tx_01",
        callerPhone: defaultCaller,
        recipientName: "Ama",
        recipientPhone: "0241234567",
        amount: 50,
        currency: "GHS",
        summary: "Sent 50 cedis to Ama Serwaa (0241234567)",
        timestamp: Date.now() - 86400000 * 2,
      },
      {
        id: "mem_tx_02",
        callerPhone: defaultCaller,
        recipientName: "Kofi",
        recipientPhone: "0559876543",
        amount: 100,
        currency: "GHS",
        summary: "Sent 100 cedis to Kofi Mensah (0559876543)",
        timestamp: Date.now() - 86400000 * 5,
      },
      {
        id: "mem_tx_03",
        callerPhone: defaultCaller,
        recipientName: "Kwame",
        recipientPhone: "0245551212",
        amount: 200,
        currency: "GHS",
        summary: "Sent 200 cedis to Kwame Boateng (0245551212)",
        timestamp: Date.now() - 86400000 * 10,
      },
    ];

    this.memoryStore.set(defaultCaller, sampleHistory);
  }

  /**
   * Adds a completed transaction to semantic memory
   */
  public async recordTransaction(record: Omit<TransactionMemoryRecord, "id" | "timestamp">): Promise<void> {
    const caller = record.callerPhone || "0240000000";
    const userRecords = this.memoryStore.get(caller) || [];

    const newRecord: TransactionMemoryRecord = {
      ...record,
      id: `mem_tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };

    if (this.isConfigured()) {
      try {
        newRecord.embedding = await this.generateEmbedding(newRecord.summary);
      } catch (err: any) {
        console.warn("[OpenAiEmbeddings] Could not generate embedding, saving record without vector:", err.message);
      }
    }

    userRecords.unshift(newRecord);
    // Retain up to 20 recent memory entries
    this.memoryStore.set(caller, userRecords.slice(0, 20));
  }

  /**
   * Retrieves semantic context when the caller refers to past transactions
   * e.g., "Send the same amount to Ama again", "Send to Kofi like before"
   */
  public async retrieveSemanticContext(
    queryText: string,
    callerPhone: string = "0240000000"
  ): Promise<SemanticRetrievalResult> {
    const records = this.memoryStore.get(callerPhone) || this.memoryStore.get("0240000000") || [];
    if (records.length === 0 || !queryText) {
      return {
        hasMatch: false,
        similarityScore: 0,
        contextSummary: "",
        suggestedSlots: {},
      };
    }

    const lowerQuery = queryText.toLowerCase();

    // Fast named-entity matching against past recipient names
    for (const rec of records) {
      const recLower = rec.recipientName.toLowerCase();
      if (lowerQuery.includes(recLower)) {
        const isRepeatedTransfer =
          lowerQuery.includes("same") ||
          lowerQuery.includes("again") ||
          lowerQuery.includes("last") ||
          lowerQuery.includes("before") ||
          lowerQuery.includes("bio");

        return {
          hasMatch: true,
          matchedRecord: rec,
          similarityScore: 0.95,
          contextSummary: `Caller previously sent ${rec.amount} GHS to ${rec.recipientName} (${rec.recipientPhone}).`,
          suggestedSlots: {
            recipientName: rec.recipientName,
            recipientPhone: rec.recipientPhone,
            amount: isRepeatedTransfer ? rec.amount : undefined,
          },
        };
      }
    }

    // If embeddings are configured, perform cosine similarity search
    if (this.isConfigured()) {
      try {
        const queryEmbedding = await this.generateEmbedding(queryText);
        let bestScore = -1;
        let bestRecord: TransactionMemoryRecord | undefined;

        for (const rec of records) {
          if (!rec.embedding) {
            rec.embedding = await this.generateEmbedding(rec.summary);
          }
          const score = this.cosineSimilarity(queryEmbedding, rec.embedding);
          if (score > bestScore) {
            bestScore = score;
            bestRecord = rec;
          }
        }

        if (bestRecord && bestScore > 0.72) {
          return {
            hasMatch: true,
            matchedRecord: bestRecord,
            similarityScore: Math.round(bestScore * 100) / 100,
            contextSummary: `Past transaction matched: ${bestRecord.summary}`,
            suggestedSlots: {
              recipientName: bestRecord.recipientName,
              recipientPhone: bestRecord.recipientPhone,
              amount: bestRecord.amount,
            },
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiEmbeddings] Vector comparison error:", err.message);
      }
    }

    return {
      hasMatch: false,
      similarityScore: 0,
      contextSummary: "",
      suggestedSlots: {},
    };
  }

  /**
   * Fetches vector embedding from OpenAI Embeddings API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI Embeddings HTTP ${response.status}: ${err.slice(0, 100)}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  public getHistoryCount(callerPhone: string = "0240000000"): number {
    return (this.memoryStore.get(callerPhone) || []).length;
  }
}

export const openaiEmbeddings = new OpenAiEmbeddingsService();
