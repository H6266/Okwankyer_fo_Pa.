/**
 * Ɔkwankyerɛfo Pa - AI System Core Types
 * Defines the strict structured schemas for inputs, outputs, intents, entities,
 * dialogue, navigation, actions, safety, and speech.
 */

export type AiChannel = "VOICE" | "DTMF" | "TEXT" | "SIMULATOR";

export type AiLanguage = "en" | "ak" | "tw" | "en-ak" | "unknown";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type IntentName =
  | "SEND_MONEY"
  | "PAY_BILL"
  | "BUY_AIRTIME"
  | "BUY_DATA"
  | "CASH_OUT"
  | "CHECK_BALANCE"
  | "CHECK_ACCOUNT"
  | "HELP"
  | "GO_BACK"
  | "GO_HOME"
  | "CANCEL"
  | "REPEAT"
  | "CHANGE_INFORMATION"
  | "CONFIRM"
  | "DENY"
  | "UNKNOWN";

export interface EntitySlotMap {
  amount?: number | null;
  currency?: "GHS";
  recipientName?: string | null;
  recipientPhone?: string | null;
  network?: "MTN" | "Telecel" | "AT" | "G-Money" | null;
  biller?: string | null;
  accountNumber?: string | null;
  service?: string | null;
  location?: string | null;
  correctionField?: "amount" | "recipientName" | "recipientPhone" | "network" | null;
  [key: string]: any;
}

export interface UserProfileData {
  userId?: string;
  phoneNumber?: string;
  preferredLanguage?: AiLanguage;
  displayName?: string;
  preferredSpokenName?: string;
  pronunciationPreference?: string;
  accessibilityNeeds?: {
    isVisuallyImpaired?: boolean;
    isElderly?: boolean;
    prefersSlowerSpeech?: boolean;
    highContrast?: boolean;
  };
}

export interface AiProcessInput {
  sessionId: string;
  channel: AiChannel;
  input: string; // Utterance text, DTMF string, or transcription
  audioBuffer?: Buffer | string;
  mimeType?: string;
  language?: AiLanguage;
  currentScreen?: string;
  currentStep?: string;
  conversationHistory?: Array<{
    role: "user" | "assistant" | "system";
    text: string;
    timestamp: number;
    intent?: IntentName;
  }>;
  transactionState?: {
    intent?: IntentName;
    amount?: number | null;
    recipientPhone?: string | null;
    recipientName?: string | null;
    network?: string | null;
    isConfirmed?: boolean;
    referenceId?: string;
    step?: string;
  };
  availableActions?: string[];
  userProfile?: UserProfileData;
  metadata?: Record<string, any>;
}

export interface DialogueOutput {
  type: "CONTINUE_TRANSACTION" | "ASK_SLOT" | "CONFIRM_ACTION" | "INFORM_AND_EXIT" | "ERROR_RECOVERY";
  response: string;
  promptLanguage: AiLanguage;
  audioPromptUrl?: string;
  needsClarification: boolean;
  clarificationOptions?: string[];
}

export interface NavigationOutput {
  action: string; // e.g. "NAVIGATE_SEND_MONEY", "NAVIGATE_HOME", "NAVIGATE_BACK", "STAY"
  targetScreen?: string;
  targetStep?: string;
  breadcrumb: string[];
}

export interface ActionOutput {
  type: string; // e.g. "SET_AMOUNT", "SET_RECIPIENT", "REQUEST_CONFIRMATION", "EXECUTE_TRANSACTION"
  tool: string;
  params: Record<string, any>;
  riskLevel: RiskLevel;
  requiresClientConfirmation: boolean;
}

export interface SafetyOutput {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  pinDetectedInVoice: boolean;
  blockedReason?: string;
  sanitized: boolean;
  piiMaskedInput: string;
}

export interface SpeechOutput {
  language: AiLanguage;
  voiceProfile: "ghanaian-warm" | "ghanaian-clear" | "ghanaian-patient";
  spokenText: string;
  phoneticHints?: Record<string, string>;
  speedMultiplier: number;
  pitch: number;
}

export interface AiProcessResult {
  sessionId: string;
  intent: IntentName;
  confidence: number;
  language: AiLanguage;
  entities: EntitySlotMap;
  dialogue: DialogueOutput;
  navigation: NavigationOutput;
  action: ActionOutput;
  safety: SafetyOutput;
  speech: SpeechOutput;
  performance: {
    totalLatencyMs: number;
    understandingLatencyMs?: number;
    planningLatencyMs?: number;
    safetyCheckLatencyMs?: number;
  };
}
