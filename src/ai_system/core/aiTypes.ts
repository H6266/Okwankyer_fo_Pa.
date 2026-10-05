/**
 * Ɔkwankyerɛfo Pa - AI System Core Types
 * Complete type definitions for the production voice-first cognitive system.
 */

export type AiChannel = "VOICE" | "DTMF" | "TEXT" | "SIMULATOR";

export type AiLanguage = "en" | "ak" | "tw" | "en-ak" | "unknown";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CognitiveState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "UNDERSTANDING"
  | "CLARIFYING"
  | "COLLECTING"
  | "CONFIRMING"
  | "AUTH_HANDOFF"
  | "EXECUTING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED"
  | "RECOVERING";

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

export type MobileNetwork = "MTN" | "Telecel" | "AT" | "G-Money";
export type TelcoNetwork = MobileNetwork;

export type CanonicalToolName =
  | "navigate_home"
  | "navigate_back"
  | "get_balance"
  | "momo_get_balance"
  | "lookup_recipient"
  | "momo_lookup_recipient_kyc"
  | "prepare_transfer"
  | "execute_transfer"
  | "momo_execute_transfer"
  | "cancel_transaction"
  | "cash_out"
  | "momo_cash_out"
  | "buy_airtime"
  | "momo_buy_airtime"
  | "buy_data"
  | "pay_bill"
  | "none";

export type VerificationStatus =
  | "VALID_NUMBER"
  | "NETWORK_INFERRED"
  | "IDENTITY_VERIFIED"
  | "IDENTITY_UNVERIFIED";

export type TransactionStatus =
  | "DRAFT"
  | "CONFIRMATION_REQUESTED"
  | "CONFIRMED"
  | "SUBMITTED"
  | "PENDING"
  | "COMPLETED"
  | "SUCCESSFUL"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED"
  | "TIMEOUT"
  | "EXPIRED"
  | "RECONCILIATION_REQUIRED";

// Voice-first streaming & real-time audio interaction types
export interface AudioFrame {
  data: Buffer | Uint8Array | string;
  mimeType: string;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export interface TranscriptPartial {
  text: string;
  confidence: number;
  isFinal: false;
  timestamp: number;
}

export interface TranscriptFinal {
  text: string;
  confidence: number;
  isFinal: true;
  language?: AiLanguage;
  timestamp: number;
}

export interface VoiceTurn {
  turnId: string;
  speaker: "user" | "assistant";
  audioBase64?: string;
  transcript: string;
  timestamp: number;
  interrupted?: boolean;
}

export interface VoiceSessionState {
  sessionId: string;
  state: CognitiveState;
  isAiSpeaking: boolean;
  activePlaybackTurnId?: string;
  currentScreen: string;
  currentStep: string;
  language: AiLanguage;
  turnCount: number;
  lastActivityTimestamp: number;
}

export interface InterruptionEvent {
  turnId: string;
  interruptedAtTimestamp: number;
  reason: string;
  playbackCancelled: boolean;
}

export interface SpeechResponse {
  audioBuffer: Buffer;
  audioBase64: string;
  mimeType: string;
  durationMs?: number;
  sampleRate: number;
  voiceName: string;
}

export interface ActionPlan {
  actionType: string;
  toolName: CanonicalToolName;
  params: Record<string, any>;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  confidence: number;
  reason: string;
  idempotencyKey?: string;
  isExecutable?: boolean;
}

export interface EntitySlotMap {
  amount?: number | null;
  currency?: "GHS";
  recipientName?: string | null;
  recipientPhone?: string | null;
  network?: MobileNetwork | null;
  biller?: string | null;
  accountNumber?: string | null;
  service?: string | null;
  location?: string | null;
  correctionField?: "amount" | "recipientName" | "recipientPhone" | "network" | string | null;
  previousValue?: any;
  correctionReason?: string | null;
  [key: string]: any;
}

export interface UserAccessibilityNeeds {
  isVisuallyImpaired?: boolean;
  isElderly?: boolean;
  prefersSlowerSpeech?: boolean;
  highContrast?: boolean;
  repeatConfirmationRequired?: boolean;
}

export interface UserProfileData {
  userId?: string;
  phoneNumber?: string;
  preferredLanguage?: AiLanguage;
  displayName?: string;
  preferredSpokenName?: string;
  pronunciationPreference?: string;
  knownContacts?: Array<{
    name: string;
    phone: string;
    network?: MobileNetwork;
    frequentAmount?: number;
  }>;
  accessibilityNeeds?: UserAccessibilityNeeds;
  registeredDate?: string;
  trustedRecipients?: string[];
}

export interface ConversationTurnRecord {
  turnId: string;
  timestamp: number;
  role: "user" | "assistant" | "system";
  rawInput: string;
  sanitizedInput: string;
  detectedLanguage: AiLanguage;
  intent: IntentName;
  slots: EntitySlotMap;
  response: string;
  screen: string;
  step: string;
  vectorHash?: number[];
  embeddingVector?: number[];
  semanticSummary?: string;
  latencyMs?: number;
}

export interface CorrectionRecord {
  timestamp: number;
  field: string;
  oldValue: any;
  newValue: any;
  reason: string;
  turnIndex: number;
}

export interface TransactionDraft {
  draftId: string;
  version?: number;
  type?: "TRANSFER" | "AIRTIME" | "BILL_PAYMENT" | "CASH_OUT";
  operation?: "TRANSFER" | "AIRTIME" | "BILL_PAYMENT" | "CASH_OUT";
  sessionId?: string;
  recipientName?: string;
  recipientPhone?: string;
  amount?: number;
  network?: MobileNetwork;
  currency: "GHS";
  confirmationState: "UNCONFIRMED" | "CONFIRMATION_REQUESTED" | "CONFIRMED" | "REJECTED" | "EXPIRED";
  confirmationPrompt?: string;
  createdAt: number;
  expiresAt: number;
}

export interface TransactionalMemoryRecord {
  referenceId: string;
  timestamp: number;
  type: string;
  amount: number;
  currency: "GHS";
  recipientPhoneMasked: string;
  recipientName: string;
  network: MobileNetwork;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "BLOCKED" | "FAILED";
  encryptedSlotData?: string;
  source?: "real_provider" | "mock_sandbox" | "demo_simulator";
}

export interface TaskState {
  taskId: string;
  intent: IntentName;
  type?: string;
  slots: EntitySlotMap;
  currentStep: string;
  resumptionStep?: string;
  interruptedBy?: IntentName;
  resumptionPrompt?: {
    en: string;
    twi: string;
  };
  createdAt: number;
  updatedAt: number;
  draft?: TransactionDraft;
}

// ── Discriminated Union for Typed AI Commands ────────────────────────
export interface NavigateCommand {
  kind: "NAVIGATE";
  targetScreen: string;
  targetStep?: string;
  reason: string;
}

export interface TransferCommand {
  kind: "TRANSFER";
  recipientPhone: string;
  recipientName?: string;
  amount: number;
  network: MobileNetwork;
  currency: "GHS";
  referenceId: string;
}

export interface BalanceCommand {
  kind: "BALANCE";
  accountPhone?: string;
}

export interface AirtimeCommand {
  kind: "AIRTIME";
  phoneNumber: string;
  amount: number;
  network: MobileNetwork;
}

export interface BillPaymentCommand {
  kind: "BILL_PAYMENT";
  biller: string;
  accountNumber: string;
  amount: number;
}

export interface CancelCommand {
  kind: "CANCEL";
  reason: string;
}

export interface RepeatCommand {
  kind: "REPEAT";
}

export interface HelpCommand {
  kind: "HELP";
  topic?: string;
}

export type AICommand =
  | NavigateCommand
  | TransferCommand
  | BalanceCommand
  | AirtimeCommand
  | BillPaymentCommand
  | CancelCommand
  | RepeatCommand
  | HelpCommand;

// ── Structured Model Reasoning Response ──────────────────────────────
export interface StructuredReasoningResponse {
  intent: IntentName;
  confidence: number;
  language: AiLanguage;
  entities: EntitySlotMap;
  conversationAct: "INFORM" | "REQUEST" | "CONFIRM" | "DENY" | "CORRECT" | "INTERRUPT" | "CHITCHAT" | "UNKNOWN";
  correction: {
    isCorrection: boolean;
    field?: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
  } | null;
  referenceResolution: {
    hasReference: boolean;
    referenceType?: "SAME_RECIPIENT" | "SAME_AMOUNT" | "PREVIOUS_TARGET";
    resolvedField?: string;
    resolvedValue?: any;
  } | null;
  ambiguity: {
    isAmbiguous: boolean;
    candidates: IntentName[];
  };
  requestedAction: {
    type: string;
    tool: string | null;
    arguments: Record<string, any>;
  };
  requiresConfirmation: boolean;
  safetyFlags: string[];
}

// ── Process Input & Outputs ──────────────────────────────────────────
export interface AiProcessInput {
  sessionId: string;
  channel: AiChannel;
  input: string;
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
    network?: MobileNetwork | string | null;
    isConfirmed?: boolean;
    referenceId?: string;
    step?: string;
  };
  availableActions?: string[];
  userProfile?: UserProfileData;
  executionMode?: "SIMULATION" | "MTN_SANDBOX";
  metadata?: Record<string, any>;
}

export interface DialogueOutput {
  type:
    | "CONTINUE_TRANSACTION"
    | "ASK_SLOT"
    | "CONFIRM_ACTION"
    | "INFORM_AND_EXIT"
    | "ERROR_RECOVERY"
    | "ZERO_PIN_SECURITY_ALERT";
  response: string;
  promptLanguage: AiLanguage;
  audioPromptUrl?: string;
  needsClarification: boolean;
  clarificationOptions?: string[];
  targetedSlot?: string;
  includesCorrectionAcknowledgement?: boolean;
}

export interface NavigationOutput {
  action: string;
  targetScreen?: string;
  targetStep?: string;
  breadcrumb: string[];
  predictedNextIntent?: IntentName;
  preStagedData?: Record<string, any>;
}

export interface ActionOutput {
  type: string;
  tool: string;
  params: Record<string, any>;
  riskLevel: RiskLevel;
  requiresClientConfirmation: boolean;
  isExecutable?: boolean;
  predictedFailureModes?: string[];
  clarifyingQuestions?: string[];
  executedResult?: {
    success: boolean;
    source: "real_provider" | "mock_sandbox" | "demo_simulator";
    data?: any;
    error?: string;
  };
}

export interface SafetyOutput {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  pinDetectedInVoice: boolean;
  blockedReason?: string;
  sanitized: boolean;
  piiMaskedInput: string;
  rateLimitExceeded?: boolean;
  failedAttemptsCount?: number;
  socialEngineeringAlert?: {
    detected: boolean;
    reasons: string[];
    riskScore: number;
  };
}

export interface SpeechOutput {
  language: AiLanguage;
  voiceProfile: "ghanaian-warm" | "ghanaian-clear" | "ghanaian-patient";
  spokenText: string;
  phoneticHints?: Record<string, string>;
  speedMultiplier: number;
  pitch: number;
  audioBase64?: string;
  audioMimeType?: string;
}

export interface PerformanceBreakdown {
  totalLatencyMs: number;
  normalizationLatencyMs: number;
  memoryRetrievalLatencyMs: number;
  understandingLatencyMs: number;
  navigationLatencyMs: number;
  actionPlanningLatencyMs: number;
  safetyCheckLatencyMs: number;
  dialogueLatencyMs: number;
  speechPlanningLatencyMs: number;
  ttsSynthesisLatencyMs?: number;
  memoryConsolidationLatencyMs?: number;
}

export interface CognitiveSnapshot {
  sessionId: string;
  language: AiLanguage;
  confidence: number;
  currentScreen?: string;
  currentStep?: string;
  intent: IntentName;
  workingSlots: EntitySlotMap;
  activeTask: TaskState | null;
  activeDraft: TransactionDraft | null;
  turnCount: number;
  lastInteractionTimestamp: number;
}

export interface AiProcessResult {
  success?: boolean;
  sessionId: string;
  state: CognitiveState;
  cognitiveState?: any;
  cognitiveSnapshot?: CognitiveSnapshot;
  intent: IntentName;
  confidence: number;
  language: AiLanguage;
  entities: EntitySlotMap;
  dialogue: DialogueOutput;
  navigation: NavigationOutput;
  action: ActionOutput;
  safety: SafetyOutput;
  speech: SpeechOutput;
  performance: PerformanceBreakdown;
  latencies?: any;
  traceId?: string;
  sessionState?: {
    breadcrumb: string[];
    turnCount: number;
    activeTask?: string;
    suspendedTasksCount: number;
  };
}

// ── Security Invariants ──────────────────────────────────────────────
export const SECURITY_INVARIANTS = {
  INVARIANT_001: "PIN never reaches tool execution.",
  INVARIANT_002: "PIN never reaches persistent memory.",
  INVARIANT_003: "Unknown tools never execute.",
  INVARIANT_004: "High-risk transaction cannot execute without valid confirmation.",
  INVARIANT_005: "Expired confirmation cannot execute.",
  INVARIANT_006: "Transaction amount cannot be modified after authorization without new confirmation.",
  INVARIANT_007: "Tool execution must be idempotent where required.",
  INVARIANT_008: "Model cannot directly authorize its own financial transaction.",
  INVARIANT_009: "Mock provider cannot execute in production mode.",
  INVARIANT_010: "Failed tool execution cannot be reported as success.",
} as const;
