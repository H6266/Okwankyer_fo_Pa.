/**
 * Ɔkwankyerɛfo Pa - Pronunciation Memory
 * Remembers user-specific name pronunciations and updates on correction.
 */

export interface UserPronunciationRecord {
  userId: string;
  displayName: string;
  preferredSpokenName: string;
  pronunciationPreference: string;
  language: string;
  updatedAt: number;
}

export class PronunciationMemory {
  private userPronunciations = new Map<string, UserPronunciationRecord>();

  public setPronunciation(record: UserPronunciationRecord): void {
    this.userPronunciations.set(record.userId, {
      ...record,
      updatedAt: Date.now(),
    });
  }

  public getPronunciation(userId: string): UserPronunciationRecord | undefined {
    return this.userPronunciations.get(userId);
  }

  /**
   * Updates pronunciation when caller says "That's not how you pronounce my name"
   */
  public correctPronunciation(userId: string, correctedSpokenForm: string): UserPronunciationRecord | undefined {
    const existing = this.userPronunciations.get(userId);
    if (existing) {
      existing.preferredSpokenName = correctedSpokenForm;
      existing.updatedAt = Date.now();
      return existing;
    }
    return undefined;
  }
}

export const pronunciationMemory = new PronunciationMemory();
