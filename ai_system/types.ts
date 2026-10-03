/**
 * Ɔkwankyerɛfo Pa - AI System Types & Interfaces
 * Comprehensive type definitions for Speech-to-Text, Natural Language Understanding,
 * Conversational Dialogue State, Ghanaian Language Translation, and Audio Synthesis.
 */

export type SupportedLanguage = "en" | "twi" | "bilingual";

export type TelcoNetwork = "MTN" | "Telecel" | "AT" | "G-Money";

export type IntentCategory =
  | "SEND_MONEY"
  | "PAY_BILL"
  | "BUY_AIRTIME"
  | "BUY_DATA"
  | "CASH_OUT"
  | "CHECK_BALANCE"
  | "CHECK_ACCOUNT"
  | "CONFIRM"
  | "CANCEL"
  | "REPEAT"
  | "GO_BACK"
  | "SWITCH_LANGUAGE"
  | "HELP"
  | "EXIT"
  | "UNKNOWN";

export interface TranscribeOptions {
  audioBuffer: Buffer | string;
  mimeType?: string;
  expectedLanguage?: SupportedLanguage;
  contextHints?: string[];
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  detectedLanguage: SupportedLanguage;
  languageConfidence: number;
  durationSeconds?: number;
  rawResponse?: string;
  isFallback?: boolean;
}

export interface ExtractedSlots {
  intent: IntentCategory;
  confidence: number;
  amount: number | null;
  currency: "GHS";
  recipientName: string | null;
  recipientPhone: string | null;
  network: TelcoNetwork | null;
  rawUtterance: string;
  language: SupportedLanguage;
  requiresClarification: boolean;
  clarificationPrompt?: {
    en: string;
    twi: string;
  };
}

export interface DialogueTurn {
  role: "user" | "assistant" | "system";
  content: string;
  language: SupportedLanguage;
  timestamp: number;
  audioUrl?: string;
  intent?: IntentCategory;
  slotsExtracted?: Partial<ExtractedSlots>;
}

export interface DialogueSessionState {
  sessionId: string;
  callerPhone: string;
  selectedLanguage: SupportedLanguage;
  currentStep:
    | "LANGUAGE_SELECT"
    | "MAIN_MENU"
    | "RECIPIENT_INPUT"
    | "RECIPIENT_CONFIRM"
    | "AMOUNT_INPUT"
    | "TRANSACTION_CONFIRM"
    | "HANDOFF_PIN"
    | "COMPLETED"
    | "CANCELLED";
  transactionData: {
    recipientPhone?: string;
    recipientName?: string;
    recipientNetwork?: TelcoNetwork;
    amountGHS?: number;
    referenceId?: string;
  };
  turns: DialogueTurn[];
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiSystemConfig {
  geminiModel: string;
  transcriptionModel: string;
  ttsModel: string;
  confidenceThreshold: number;
  defaultLanguage: SupportedLanguage;
  enableZeroPinEnforcement: boolean;
  userAgentHeader: string;
}

export interface VoicePromptResult {
  spokenText: string;
  language: SupportedLanguage;
  audioBase64?: string;
  audioMimeType?: string;
  preRecordedFile?: string;
}
