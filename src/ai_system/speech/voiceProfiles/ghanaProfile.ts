/**
 * Ɔkwankyerɛfo Pa - Voice Profiles
 */

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  accent: "ghanaian-akan" | "ghanaian-english" | "neutral";
  pitch: number;
  speed: number;
  providerVoiceName: string;
  recommendedAudience: "elderly" | "visually-impaired" | "general";
}

export const GHANA_VOICE_PROFILES: Record<string, VoiceProfile> = {
  "ghanaian-warm": {
    id: "ghanaian-warm",
    name: "Ghanaian Warm & Clear (Default)",
    description: "Warm, respectful, natural Ghanaian conversational tone with clear diction",
    accent: "ghanaian-akan",
    pitch: 0.0,
    speed: 1.0,
    providerVoiceName: "Kore",
    recommendedAudience: "general",
  },
  "ghanaian-patient": {
    id: "ghanaian-patient",
    name: "Ghanaian Patient & Slower",
    description: "Paced, gentle, repeated phrasing designed for elderly and rural callers",
    accent: "ghanaian-akan",
    pitch: -0.1,
    speed: 0.85,
    providerVoiceName: "Fenrir",
    recommendedAudience: "elderly",
  },
  "ghanaian-high-clarity": {
    id: "ghanaian-high-clarity",
    name: "Ghanaian High Contrast Audio",
    description: "Crisp consonants and high intelligibility for visually impaired users",
    accent: "ghanaian-english",
    pitch: 0.0,
    speed: 0.95,
    providerVoiceName: "Zephyr",
    recommendedAudience: "visually-impaired",
  },
};
