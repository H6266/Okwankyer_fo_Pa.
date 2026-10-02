/**
 * Ɔkwankyerɛfo Pa - User Profile & Pronunciation Preferences
 * Strictly respects privacy: never stores PINs or transaction secrets.
 */

import { UserProfileData, AiLanguage } from "../core/aiTypes";

export class UserProfileManager {
  private profiles = new Map<string, UserProfileData>();

  public getProfile(userId: string): UserProfileData | undefined {
    return this.profiles.get(userId);
  }

  public updateProfile(userId: string, data: Partial<UserProfileData>): UserProfileData {
    const existing = this.profiles.get(userId) || { userId };
    const updated: UserProfileData = {
      ...existing,
      ...data,
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  public updatePronunciationPreference(
    userId: string,
    spokenName: string,
    pronunciationNote: string,
    language: AiLanguage = "tw"
  ): UserProfileData {
    return this.updateProfile(userId, {
      preferredSpokenName: spokenName,
      pronunciationPreference: pronunciationNote,
      preferredLanguage: language,
    });
  }
}

export const userProfileManager = new UserProfileManager();
