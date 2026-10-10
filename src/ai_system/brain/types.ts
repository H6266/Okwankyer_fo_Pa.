/**
 * Ɔkwankyerɛfo Pa - Central Reasoning Brain Types
 * 
 * Defines strict taxonomy, decisions, session language, and brain I/O contracts.
 */

export type BrainMode = 'offline_only' | 'shadow' | 'live';

export type IntentId =
  | 'momo.transfer'
  | 'momo.check_balance'
  | 'momo.buy_airtime'
  | 'momo.buy_data'
  | 'momo.reverse_transaction'
  | 'momo.customer_care'
  | 'momo.loan'
  | 'momo.pay_bill'
  | 'smalltalk'
  | 'unknown';

export type LanguageId =
  | 'twi-asante'
  | 'twi-akuapem'
  | 'en'
  | 'mixed-twi-en';

export type TargetLanguageId = 'twi-asante' | 'twi-akuapem' | 'en';

export type ReplyKind =
  | 'clarify_slot'
  | 'clarify_intent'
  | 'not_ready'
  | 'confirm'
  | 'dispatch'
  | 'smalltalk'
  | 'error';

export interface RecipientSlot {
  name?: string;
  phone?: string;
}

export interface ModelOutputContract {
  intent: {
    id: IntentId;
    confidence: number;
    alternatives?: Array<{ id: IntentId; confidence: number }>;
  };
  slots: {
    amount?: number | null;
    recipient?: RecipientSlot | null;
    network?: string | null;
  };
  signals: {
    correction: boolean;
    interruption: boolean;
    user_confirmed: boolean;
  };
  reply: {
    text_en: string;
    target_language: TargetLanguageId;
    reply_kind: ReplyKind;
    template_key?: string;
  };
}

export type SlotType = 'amount' | 'phone' | 'name' | 'network' | 'recipient' | 'string' | 'number';

export interface SlotSpec {
  name: string;
  type: SlotType;
  required: boolean;
  description?: string;
}

export interface BrainSlots {
  amount?: number;
  recipient?: RecipientSlot;
  network?: string;
  [key: string]: any;
}

export type Slots = BrainSlots;

export interface ServiceHandlerResult {
  success: boolean;
  result?: any;
  error?: string;
}

export type ServiceHandler = (params: {
  slots: Slots;
  sessionLanguage: LanguageId;
  callerNumber?: string;
  sessionId?: string;
  confirmedDraftHash?: string;
  dispatchKey?: string;
}) => Promise<ServiceHandlerResult>;

export interface ServiceDefinition {
  intent: IntentId;
  status: 'ready' | 'not_ready';
  requiredSlots: SlotSpec[];
  handler?: ServiceHandler;
  notReadyMessageKey?: string;
}

export type BrainDecision =
  | { kind: 'clarify_intent'; candidates: IntentId[] }
  | { kind: 'clarify_slot'; slot: string }
  | { kind: 'confirm'; intent: IntentId; slots: Slots }
  | { kind: 'not_ready'; intent: IntentId }
  | { kind: 'dispatch'; intent: IntentId; slots: Slots };

export interface TurnHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface ReadbackRecord {
  amount: number;
  recipientRef: string;
  spokenAt: number;
  draftHash: string;
}

export interface DraftState {
  intent?: IntentId;
  slots: Slots;
  confirmed?: boolean;
  confirmationRevokedReason?: string;
  pendingClarification?: 'intent' | 'slot' | null;
  clarificationField?: string;
  interruptedIntent?: IntentId | null;
  interruptedSlots?: Slots | null;
  recentTurns?: TurnHistoryItem[];
  turnCount?: number;
  lastReplyKind?: ReplyKind;
  lastConfirmReadbackText?: string;
  readback?: ReadbackRecord;
  draftHash?: string;
  confirmedDraftHash?: string;
  clarificationLoops?: number;
}

export interface BrainInput {
  transcript: string;
  language: LanguageId;
  languageConfidence?: number;
  sessionLanguage?: LanguageId;
  draft: DraftState;
  callerNumber?: string;
  sessionId?: string;
}

export interface BrainOutput {
  decision: BrainDecision;
  modelOutput?: ModelOutputContract;
  reply: {
    text: string;
    text_en?: string;
    language: LanguageId;
    target_language?: TargetLanguageId;
    promptId?: string;
    template_key?: string;
  };
  updatedDraft: DraftState;
  sessionLanguage: LanguageId;
}
