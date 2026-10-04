/**
 * Ɔkwankyerɛfo Pa - Gateway Evidence Store
 * Records full provenance and verification trail for every telecom gateway call.
 */

import { redactHeaders, redactObject } from "./securityRedactor";

export interface StoredEvidenceRecord {
  evidenceId: string;
  timestamp: string;
  host: string;
  endpoint: string;
  roundTripMs: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: any;
    contentLengthHeader?: number;
    actualBodyByteLength: number;
    contentLengthMatches: boolean;
  };
}

class EvidenceStore {
  private records = new Map<string, StoredEvidenceRecord>();

  public save(record: StoredEvidenceRecord): void {
    // Ensure all headers and data pass through redaction before storing
    const sanitized: StoredEvidenceRecord = {
      ...record,
      request: {
        ...record.request,
        headers: redactHeaders(record.request.headers),
        body: redactObject(record.request.body),
      },
      response: {
        ...record.response,
        headers: redactHeaders(record.response.headers),
        body: redactObject(record.response.body),
      },
    };

    this.records.set(sanitized.evidenceId, sanitized);

    // Keep store memory bounded
    if (this.records.size > 200) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey) this.records.delete(oldestKey);
    }
  }

  public get(evidenceId: string): StoredEvidenceRecord | undefined {
    return this.records.get(evidenceId);
  }

  public getAll(): StoredEvidenceRecord[] {
    return Array.from(this.records.values());
  }

  public clear(): void {
    this.records.clear();
  }
}

export const evidenceStore = new EvidenceStore();
