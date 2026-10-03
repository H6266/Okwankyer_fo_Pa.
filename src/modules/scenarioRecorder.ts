/**
 * Scenario Recorder & Replay Engine for Ɔkwankyerɛfo Pa Voice Studio
 * Enables recording keypress flows, saving scenarios, replaying in one-click,
 * and running automated regression suites in CI.
 */

export interface ScenarioStep {
  digit: string;
  delayMs: number;
  expectedTurn: string;
  expectedAudio?: string;
}

export interface VoiceScenario {
  id: string;
  name: string;
  description: string;
  language: "en" | "twi";
  steps: ScenarioStep[];
  expectedFinalStatus: "COMPLETED" | "CANCELLED" | "DECLINED" | "TIMEOUT";
  isPreset?: boolean;
}

export const PRESET_SCENARIOS: VoiceScenario[] = [
  {
    id: "sc-en-happy",
    name: "English Happy Path (Send GH₵ 50 to Sister)",
    description: "Chooses English (1), enters recipient (0241234567#), confirms KYC (1), enters 50#, approves USSD on screen.",
    language: "en",
    steps: [
      { digit: "1", delayMs: 400, expectedTurn: "recipient" },
      { digit: "0", delayMs: 150, expectedTurn: "recipient" },
      { digit: "2", delayMs: 150, expectedTurn: "recipient" },
      { digit: "4", delayMs: 150, expectedTurn: "recipient" },
      { digit: "1", delayMs: 150, expectedTurn: "recipient" },
      { digit: "2", delayMs: 150, expectedTurn: "recipient" },
      { digit: "3", delayMs: 150, expectedTurn: "recipient" },
      { digit: "4", delayMs: 150, expectedTurn: "recipient" },
      { digit: "5", delayMs: 150, expectedTurn: "recipient" },
      { digit: "6", delayMs: 150, expectedTurn: "recipient" },
      { digit: "7", delayMs: 150, expectedTurn: "recipient" },
      { digit: "#", delayMs: 300, expectedTurn: "kyc" },
      { digit: "1", delayMs: 400, expectedTurn: "amount" },
      { digit: "5", delayMs: 150, expectedTurn: "amount" },
      { digit: "0", delayMs: 150, expectedTurn: "amount" },
      { digit: "#", delayMs: 300, expectedTurn: "safe_confirmation" },
      { digit: "1", delayMs: 400, expectedTurn: "zero_pin" },
    ],
    expectedFinalStatus: "COMPLETED",
    isPreset: true,
  },
  {
    id: "sc-twi-happy",
    name: "Akan Twi Happy Path (Mane Sika GH₵ 100)",
    description: "Chooses Twi (2), enters recipient (0553838464#), confirms KYC readback (1), enters 100#, approves USSD on screen.",
    language: "twi",
    steps: [
      { digit: "2", delayMs: 400, expectedTurn: "recipient" },
      { digit: "0", delayMs: 150, expectedTurn: "recipient" },
      { digit: "5", delayMs: 150, expectedTurn: "recipient" },
      { digit: "5", delayMs: 150, expectedTurn: "recipient" },
      { digit: "3", delayMs: 150, expectedTurn: "recipient" },
      { digit: "8", delayMs: 150, expectedTurn: "recipient" },
      { digit: "3", delayMs: 150, expectedTurn: "recipient" },
      { digit: "8", delayMs: 150, expectedTurn: "recipient" },
      { digit: "4", delayMs: 150, expectedTurn: "recipient" },
      { digit: "6", delayMs: 150, expectedTurn: "recipient" },
      { digit: "4", delayMs: 150, expectedTurn: "recipient" },
      { digit: "#", delayMs: 300, expectedTurn: "kyc" },
      { digit: "1", delayMs: 400, expectedTurn: "amount" },
      { digit: "1", delayMs: 150, expectedTurn: "amount" },
      { digit: "0", delayMs: 150, expectedTurn: "amount" },
      { digit: "0", delayMs: 150, expectedTurn: "amount" },
      { digit: "#", delayMs: 300, expectedTurn: "safe_confirmation" },
      { digit: "1", delayMs: 400, expectedTurn: "zero_pin" },
    ],
    expectedFinalStatus: "COMPLETED",
    isPreset: true,
  },
  {
    id: "sc-cancel-0",
    name: "Universal Cancel via Key 0",
    description: "Starts in English, enters 0 at recipient stage to instantly exit with cancel audio confirmation.",
    language: "en",
    steps: [
      { digit: "1", delayMs: 400, expectedTurn: "recipient" },
      { digit: "0", delayMs: 300, expectedTurn: "cancel" },
    ],
    expectedFinalStatus: "CANCELLED",
    isPreset: true,
  },
  {
    id: "sc-repeat-9",
    name: "Prompt Replay via Key 9",
    description: "Tests replay mechanism without losing state or advancing turn counter.",
    language: "en",
    steps: [
      { digit: "1", delayMs: 400, expectedTurn: "recipient" },
      { digit: "9", delayMs: 300, expectedTurn: "recipient" },
    ],
    expectedFinalStatus: "COMPLETED",
    isPreset: true,
  },
];

const LOCAL_STORAGE_KEY = "okp_saved_scenarios";

export function getSavedScenarios(): VoiceScenario[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return PRESET_SCENARIOS;
    const custom = JSON.parse(raw);
    return [...PRESET_SCENARIOS, ...(Array.isArray(custom) ? custom : [])];
  } catch {
    return PRESET_SCENARIOS;
  }
}

export function saveScenario(scenario: Omit<VoiceScenario, "id">): VoiceScenario {
  const newSc: VoiceScenario = {
    ...scenario,
    id: `sc-custom-${Date.now()}`,
    isPreset: false,
  };
  try {
    const existing = getSavedScenarios().filter((s) => !s.isPreset);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([newSc, ...existing]));
  } catch (e) {
    console.warn("Failed to persist scenario in localStorage:", e);
  }
  return newSc;
}

export function deleteSavedScenario(id: string): void {
  try {
    const existing = getSavedScenarios().filter((s) => !s.isPreset && s.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to delete scenario:", e);
  }
}
