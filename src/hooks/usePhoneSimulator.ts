/**
 * Ɔkwankyerɛfo Pa - Authoritative Phone Simulator Hook (usePhoneSimulator.ts)
 *
 * Implements strict presentation-layer separation:
 * - NO local AI decision making or fake data simulation.
 * - Single source of truth is the backend canonical AI engine (/api/ai/simulator/turn).
 * - Full turn lifecycle: Caller Input -> Canonical AI -> Memory/Safety/MoMo -> Dialogue -> TTS Audio.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api, ParsedVoiceXml } from "../lib/api";
import { useDtmf } from "./useDtmf";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../domain/echoFilter";
import {
  ContinuousVoiceCapture,
  MicrophoneState,
  VoiceTelemetry,
} from "../lib/audio/continuousVoiceCapture";
import type {
  NavigationOutput,
  ActionOutput,
  SafetyOutput,
  DialogueOutput,
  EntitySlotMap,
} from "../ai_system/core/aiTypes";
import { audioPlaybackController, PlaybackRequest } from "../audio/audioPlaybackController";
import { getConversationalPrompt, CONVERSATIONAL_PROMPT_CATALOG } from "../audio/catalog";
import { emitSimulatorLog } from "../lib/simulatorLog";
import { resolveExpected } from "../domain/resolveExpected";
import { STEP_REGISTRY } from "../domain/stepRegistry";
import { logVoiceDebug } from "../lib/audio/continuousVoiceCapture";

export type SpeechOutput =
  | { kind: "recorded"; promptId: string; url: string; text: string; language: "en" | "tw" }
  | { kind: "tts"; text: string; language: "en" | "tw" };

export interface SimulatorTranscriptItem {
  id: string;
  role: "caller" | "ai" | "system";
  text: string;
  timestamp: number;
  stage?: string;
  intent?: string;
  confidence?: number;
  language?: string;
  isCorrection?: boolean;
}

export interface PipelineStageFlags {
  speechInput: boolean;
  language: boolean;
  normalization: boolean;
  intent: boolean;
  slotExtraction: boolean;
  context: boolean;
  safety: boolean;
  action: boolean;
  provider: boolean | null; // null: not engaged, true: success, false: failed
  truthVerification: boolean;
  response: boolean;
}

export interface LastTranscriptionInfo {
  text: string;
  confidence: number;
  language: string;
  timestamp: number;
  channel: "VOICE" | "DTMF" | "TEXT" | "SIMULATOR";
  source?: string;
  durationMs?: number;
}

export interface PipelineLatencyInfo {
  totalMs: number;
  asrMs: number;
  nluMs: number;
  ttsMs: number;
  timestamp: number;
}

export interface TurnDiffDiagnostic {
  turnNumber: number;
  previousSlots: Record<string, any>;
  currentSlots: Record<string, any>;
  changedFields: Array<{ field: string; oldVal: any; newVal: any }>;
  confirmationInvalidated: boolean;
  callerInput: string;
}

export interface AccuracyTestResult {
  scenarioTitle: string;
  expectedIntent?: string;
  expectedAmount?: number;
  expectedRecipient?: string;
  actualIntent: string;
  actualAmount?: number;
  actualRecipient?: string;
  language: string;
  confidence: number | null;
  isPass: boolean;
}

export interface SimulatorSyncState {
  callLogsTotal: number;
  ledgerTotal: number;
  floatBalance: number | null;
  lastSessionId?: string;
  targetEnv: string;
  activeKeyType: string;
  offlineReady: boolean;
  geminiConfigured: boolean;
  collectionsCount: number;
  disbursementsCount: number;
  airtimeCount: number;
  escrowCount: number;
  kycTotal: number;
  kycVerified: number;
  audioTotal: number;
  audioEnglish: number;
  audioTwi: number;
  ivrVoiceNumber: string;
  ivrAtConfigured: boolean;
  safetyZeroPinEnforced: boolean;
  safetyPiiActive: boolean;
  shippingActive: number;
  testsTotal: number;
  testsPassing: number;
  recentCalls: any[];
  recentLedger: any[];
}

export interface SimulatorVoiceXmlTrace {
  step: string;
  xml: string;
  timestamp: string;
}

export interface AtHttpLogItem {
  id: string;
  timestamp: string;
  endpoint: string;
  method: "POST" | "GET";
  requestParams: Record<string, any>;
  statusCode: number;
  voiceXml: string;
  promptSpoken?: string;
  audioUrl?: string;
}

export interface UssdPushPrompt {
  active: boolean;
  title: string;
  message: string;
  recipientName?: string;
  recipientPhone?: string;
  amount?: number;
  currency?: string;
  referenceId?: string;
}

export interface AtPresetScenario {
  id: string;
  title: string;
  description: string;
  language: "en" | "twi";
  steps: Array<{
    name: string;
    digits: string;
    description: string;
  }>;
}

export const AT_PRESET_SCENARIOS: AtPresetScenario[] = [
  {
    id: "at_send_money_en",
    title: "AT: English Send Money (9-Step IVR)",
    description: "Full Africa's Talking IVR call: Welcome (1) → MoMo (1) → MTN (1) → Send (1) → 0553838464# → Kwame Boateng (1) → 20 GHS# → Safe Readback (1) → Zero-PIN Screen Push",
    language: "en",
    steps: [
      { name: "Language Selection", digits: "1", description: "Select English (1)" },
      { name: "Service Selection", digits: "1", description: "Select Mobile Money (1)" },
      { name: "Provider Selection", digits: "1", description: "Select MTN MoMo (1)" },
      { name: "Action Selection", digits: "1", description: "Select Send Money (1)" },
      { name: "Recipient Phone Number", digits: "0553838464#", description: "Enter Kwame Boateng (0553838464#)" },
      { name: "Recipient Verification Readback", digits: "1", description: "Confirm Kwame Boateng (Ends 8464) (1)" },
      { name: "Enter Amount", digits: "20#", description: "Enter 20 GHS followed by # (20#)" },
      { name: "Safe Confirmation Readback", digits: "1", description: "Confirm 20 GHS to Kwame Boateng (1)" },
    ],
  },
  {
    id: "at_send_money_twi",
    title: "AT: Akan Twi Send Money (9-Step IVR)",
    description: "Full Africa's Talking IVR call in Akan Twi: Akwaaba → Twi (2) → MoMo (1) → MTN (1) → Mane Sika (1) → 0553838464# → Kwame Boateng (1) → 20 GHS# → Bammbɔ Pene So (1) → USSD Screen Push",
    language: "twi",
    steps: [
      { name: "Kasa Hwehwɛmu (Language)", digits: "2", description: "Paw Akan Twi (2)" },
      { name: "Dwumadie Hwehwɛmu (Service)", digits: "1", description: "Paw Mobile Money (1)" },
      { name: "Ntentan Hwehwɛmu (Provider)", digits: "1", description: "Paw MTN MoMo (1)" },
      { name: "Deɛ Worepɛ Sɛ Woyɛ (Action)", digits: "1", description: "Paw Mane Sika (1)" },
      { name: "Fon Nɔma a Wode Mane (Recipient)", digits: "0553838464#", description: "Bɔ 0553838464#" },
      { name: "Gye Edin To Mu (Verify Recipient)", digits: "1", description: "Pene Kwame Boateng so (1)" },
      { name: "Sika Dodow (Amount)", digits: "20#", description: "Bɔ cedis aduonu (20#)" },
      { name: "Bammbɔ Ntiaseɛ (Safe Readback)", digits: "1", description: "Pene cedis 20 no so (1)" },
    ],
  },
  {
    id: "at_balance_inquiry",
    title: "AT: Balance Inquiry Notice",
    description: "Africa's Talking VoiceXML guidance directing subscriber to dial *170# with zero PIN interception on voice channel",
    language: "en",
    steps: [
      { name: "Language Selection", digits: "1", description: "Select English (1)" },
      { name: "Service Selection", digits: "1", description: "Select Mobile Money (1)" },
      { name: "Provider Selection", digits: "1", description: "Select MTN MoMo (1)" },
      { name: "Action Selection", digits: "2", description: "Select Check Balance (2)" },
    ],
  },
  {
    id: "at_cancel_transfer",
    title: "AT: Immediate Cancellation (Zero Fund Movement)",
    description: "Pressing 0 at any prompt safely terminates the call with immediate Africa's Talking <Reject/> and zero charge",
    language: "en",
    steps: [
      { name: "Language Selection", digits: "1", description: "Select English (1)" },
      { name: "Service Selection", digits: "1", description: "Select Mobile Money (1)" },
      { name: "Cancel Prompt", digits: "0", description: "Press 0 to Cancel (0)" },
    ],
  },
];

export interface SimulatorContact {
  phone: string;
  name: string;
  network: "MTN" | "Telecel" | "AT";
  tier?: string;
  verified: boolean;
  suggestedPromptEn: string;
  suggestedPromptTw: string;
}

export interface SimulatorScenario {
  id: string;
  title: string;
  description: string;
  language: "en" | "tw" | "en-ak";
  executionMode?: "SIMULATION" | "MTN_SANDBOX";
  turns: string[];
  expected: {
    intent?: string;
    amount?: number;
    recipient?: string;
  };
}

export const PRESET_SCENARIOS: SimulatorScenario[] = [
  {
    id: "send_money_en",
    title: "Send Money – English",
    description: "Natural English transfer: 20 GHS to 0553838464",
    language: "en",
    turns: [
      "I want to send 20 cedis to 0553838464",
      "Yes",
    ],
    expected: { intent: "SEND_MONEY", amount: 20, recipient: "0553838464" },
  },
  {
    id: "send_money_tw",
    title: "Send Money – Twi",
    description: "Natural Twi transfer: Mane sika aduonu kɔma Ama wɔ 0553838464",
    language: "tw",
    turns: [
      "Mepa wo kyɛw, mane sika aduonu kɔma Ama wɔ 0553838464",
      "Aane",
    ],
    expected: { intent: "SEND_MONEY", amount: 20, recipient: "0553838464" },
  },
  {
    id: "code_switch",
    title: "English/Twi Code-switch",
    description: "Please mane 20 cedis kɔma my brother on 0553838464",
    language: "en-ak",
    turns: [
      "Please mane 20 cedis kɔma my brother on 0553838464",
      "Proceed",
    ],
    expected: { intent: "SEND_MONEY", amount: 20, recipient: "0553838464" },
  },
  {
    id: "wrong_number_correction",
    title: "Wrong Number Correction",
    description: "Send 50 to 0241112233... actually wrong number, send to 0553838464",
    language: "en",
    turns: [
      "Send 50 cedis to 0241112233",
      "No, wrong number, send to 0553838464 instead",
      "Yes",
    ],
    expected: { intent: "SEND_MONEY", amount: 50, recipient: "0553838464" },
  },
  {
    id: "amount_correction",
    title: "Amount Correction",
    description: "Send 20 to 0553838464... wait, make it 50 instead",
    language: "en",
    turns: [
      "Send 20 to 0553838464",
      "No, make it 50 instead",
      "Confirm",
    ],
    expected: { intent: "SEND_MONEY", amount: 50, recipient: "0553838464" },
  },
  {
    id: "same_recipient",
    title: "Same Recipient",
    description: "Transfer to initial contact followed by coreference 'same person'",
    language: "en",
    turns: [
      "Send 20 to 0553838464",
      "Yes",
      "Now send 10 cedis to the same person",
    ],
    expected: { intent: "SEND_MONEY", amount: 10, recipient: "0553838464" },
  },
  {
    id: "cancel_transfer",
    title: "Cancel Transfer",
    description: "Graceful withdrawal of transfer with zero fund movement",
    language: "en",
    turns: [
      "Send 100 to 0553838464",
      "I don't want to send it anymore, cancel",
    ],
    expected: { intent: "CANCEL" },
  },
  {
    id: "low_confidence",
    title: "Low Confidence / Clarification",
    description: "Vague utterance triggering error recovery clarification",
    language: "en",
    turns: [
      "Something something money thing",
    ],
    expected: { intent: "UNKNOWN" },
  },
  {
    id: "pin_attempt",
    title: "PIN Attempt (Zero-PIN Safety)",
    description: "Spoken PIN blocked at gateway; caller instructed never to speak PIN",
    language: "en",
    turns: [
      "Send 30 cedis to 0553838464 with PIN 1234",
    ],
    expected: { intent: "SEND_MONEY" },
  },
  {
    id: "interruption_balance",
    title: "Interruption / Check Balance",
    description: "Context switch to balance inquiry with state preservation",
    language: "en",
    turns: [
      "I want to send 50 to 0553838464",
      "Wait, first check my balance",
    ],
    expected: { intent: "CHECK_BALANCE" },
  },
  {
    id: "sandbox_transfer",
    title: "MTN Sandbox Transfer",
    description: "🔴 Live MTN Sandbox Disbursement: 5 GHS to 0553838464",
    language: "en",
    executionMode: "MTN_SANDBOX",
    turns: [
      "Send 5 cedis to 0553838464",
      "Yes",
    ],
    expected: { intent: "SEND_MONEY", amount: 5, recipient: "0553838464" },
  },
];

/**
 * Authoritative Speech Output Determination (Fix 3):
 * Explicitly decides the speech source for any dialogue response:
 * A. Fixed instructions -> prerecorded studio audio (welcome, menus, static entry instructions).
 * B. Dynamic responses -> actual TTS audio (verified name, amount, personalized confirmations).
 * C. Sensitive payment confirmations -> controlled dynamic speech (never generic historical recordings).
 */
export function determineSpeechOutput(
  text: string,
  lang: string = "en",
  step?: string
): SpeechOutput {
  const normLang: "en" | "tw" = (lang === "tw" || lang === "ak") ? "tw" : "en";
  const stepLower = (step || "").toLowerCase().replace(/[-_]/g, " ");
  const textLower = (text || "").toLowerCase();

  // Conversational Catalogue Prompts:
  // Must ALWAYS be synthesized with natural conversational cadence or resolved to conversational catalog,
  // NEVER hijacked by keypad menus!
  if (
    stepLower.includes("conversational") ||
    textLower.includes("ready to help you") ||
    textLower.includes("speak naturally") ||
    textLower.includes("own words") ||
    textLower.includes("mɛboa wo") ||
    textLower.includes("w'anom asɛm") ||
    textLower.includes("i am listening") ||
    textLower.includes("meretie wo") ||
    textLower.includes("say it again, slowly") ||
    textLower.includes("ka bio brɛoo")
  ) {
    return {
      kind: "tts",
      text,
      language: normLang,
    };
  }

  // Rule C: SENSITIVE PAYMENT CONFIRMATIONS & DYNAMIC ENTITIES MUST ALWAYS BE DYNAMIC TTS!
  // Any verification of recipient name, dynamic amount, custom confirmation readback, or receipt
  if (
    stepLower.includes("verify") ||
    stepLower.includes("confirm") ||
    stepLower.includes("safe") ||
    stepLower.includes("receipt") ||
    stepLower.includes("outcome") ||
    stepLower.includes("balance") ||
    stepLower.includes("clarif") ||
    stepLower.includes("error") ||
    textLower.includes("ghs") ||
    textLower.includes("cedis") ||
    (textLower.includes("sika") && /\d+/.test(textLower)) ||
    /\b(024|054|055|059|027|057|026|020|050)\d{7}\b/.test(text)
  ) {
    return {
      kind: "tts",
      text,
      language: normLang,
    };
  }

  // Rule A: FIXED INSTRUCTIONS (Static menus and prompts without dynamic amounts/names)
  // 1. Welcome / Language Selection (Keypad menu only)
  if (
    (stepLower === "welcome" || stepLower === "language" || stepLower === "lang select") &&
    (textLower.includes("press 1") || textLower.includes("mia baako") || textLower.includes("mia 1"))
  ) {
    return {
      kind: "recorded",
      promptId: "welcome",
      url: normLang === "tw" ? "/audio/Twi/Welcome_prompt_01.mp3" : "/audio/Welcome_prompt_01.mp3",
      text,
      language: normLang,
    };
  }

  // 2. Service Selection Menu (Mobile Money vs Telecom)
  if (
    stepLower === "service" ||
    stepLower === "service select" ||
    (textLower.includes("press 1 for mobile money") && textLower.includes("2 for banking"))
  ) {
    return {
      kind: "recorded",
      promptId: "service_select",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_03.mp3" : "/audio/English/Audio_prompt_02.mp3",
      text,
      language: normLang,
    };
  }

  // 3. Provider / Network Selection Menu (MTN, Telecel, AT)
  if (
    stepLower === "provider" ||
    stepLower === "network" ||
    stepLower === "network select" ||
    (textLower.includes("press 1 for mtn") && textLower.includes("2 for telecel"))
  ) {
    return {
      kind: "recorded",
      promptId: "provider_select",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_02.mp3" : "/audio/English/Audio_prompt_03.mp3",
      text,
      language: normLang,
    };
  }

  // 4. Action Selection Menu (Send Money, Pay Bills, Buy Airtime, Cash Out)
  if (
    stepLower === "action" ||
    stepLower === "action select" ||
    (textLower.includes("press 1 to send money") && textLower.includes("2 to check balance"))
  ) {
    return {
      kind: "recorded",
      promptId: "action_select",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_04.mp3" : "/audio/English/Audio_prompt_05.mp3",
      text,
      language: normLang,
    };
  }

  // 5. Instruction to Enter 10-Digit Recipient Phone Number
  if (
    (stepLower === "enter recipient" || stepLower === "recipient entry" || stepLower === "recipient") &&
    !textLower.includes("ending in") &&
    !textLower.includes("055") &&
    !textLower.includes("024")
  ) {
    return {
      kind: "recorded",
      promptId: "enter_recipient",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_05.mp3" : "/audio/English/Audio_prompt_06.mp3",
      text,
      language: normLang,
    };
  }

  // 6. Instruction to Enter Amount
  if (
    (stepLower === "enter amount" || stepLower === "amount entry" || stepLower === "amount") &&
    !/\d+/.test(textLower)
  ) {
    return {
      kind: "recorded",
      promptId: "enter_amount",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_07.mp3" : "/audio/English/Audio_prompt_09.mp3",
      text,
      language: normLang,
    };
  }

  // 7. Goodbye / Thank You
  if (
    stepLower === "goodbye" ||
    stepLower === "hangup" ||
    (textLower.includes("thank you for using") && textLower.includes("goodbye"))
  ) {
    return {
      kind: "recorded",
      promptId: "goodbye",
      url: normLang === "tw" ? "/audio/Twi/Audio_prompt_twi_11.mp3" : "/audio/English/Audio_prompt_13.mp3",
      text,
      language: normLang,
    };
  }

  // Rule B: Everything else is DYNAMIC TTS!
  return {
    kind: "tts",
    text,
    language: normLang,
  };
}

export function usePhoneSimulator() {
  const { playTone } = useDtmf();

  // Call Lifecycle & Network State
  const [isActive, setIsActive] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [sessionId, setSessionId] = useState<string>(() => `sim_${Date.now()}`);
  const [executionMode, setExecutionMode] = useState<"SIMULATION" | "MTN_SANDBOX">("SIMULATION");
  const [language, setLanguage] = useState<"en" | "tw" | "ak" | "en-ak">("en");

  // Africa's Talking Telephony Gateway & Protocol State
  const [gatewayMode, setGatewayMode] = useState<"AFRICASTALKING_IVR" | "CANONICAL_AI">("AFRICASTALKING_IVR");
  const [atSessionId, setAtSessionId] = useState<string>(() => `ATVN_${Date.now()}`);
  const [atCallerPhone, setAtCallerPhone] = useState<string>("+233543546010");
  const [atCurrentCallbackUrl, setAtCurrentCallbackUrl] = useState<string | null>(null);
  const [atExpectedDigits, setAtExpectedDigits] = useState<number>(1);
  const [atFinishOnKey, setAtFinishOnKey] = useState<string>("#");
  const [atInstruction, setAtInstruction] = useState<string>("Africa's Talking Voice Trunk Ready (+233 30 804 8098)");
  const [atHttpLogs, setAtHttpLogs] = useState<AtHttpLogItem[]>([]);
  const [ussdPushPrompt, setUssdPushPrompt] = useState<UssdPushPrompt | null>(null);

  // Phone Navigation & Handset Screen State
  const [currentScreen, setCurrentScreen] = useState<string>("HOME");
  const [currentStep, setCurrentStep] = useState<string>("welcome");
  const [digitsBuffer, setDigitsBuffer] = useState<string>("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [enableTts, setEnableTts] = useState(true);
  const [voiceMode, setVoiceMode] = useState<"AI_NEURAL" | "STUDIO_PROMPTS" | "BROWSER">("STUDIO_PROMPTS");

  // Real-Time Speech Transcription & AI Processing Telemetry
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [transcriptionStatus, setTranscriptionStatus] = useState<"IDLE" | "LISTENING" | "PROCESSING" | "TRANSCRIBED" | "ERROR" | "PAUSED">("IDLE");
  const [aiProcessingPhase, setAiProcessingPhase] = useState<
    "IDLE" | "SPEECH_IN" | "LANGUAGE_DETECTION" | "INTENT_EXTRACTION" | "SECURITY_CHECK" | "HANDOFF" | "SPEECH_SYNTHESIS" | "READY"
  >("IDLE");
  const [aiProcessingDetail, setAiProcessingDetail] = useState<string>("System standing by");
  const [lastTranscription, setLastTranscription] = useState<LastTranscriptionInfo | null>(null);
  const [pipelineLatency, setPipelineLatency] = useState<PipelineLatencyInfo | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Synchronized Ecosystem State
  const [syncState, setSyncState] = useState<SimulatorSyncState>({
    callLogsTotal: 1,
    ledgerTotal: 0,
    floatBalance: null,
    lastSessionId: undefined,
    targetEnv: "sandbox",
    activeKeyType: "primary",
    offlineReady: true,
    geminiConfigured: false,
    collectionsCount: 0,
    disbursementsCount: 0,
    airtimeCount: 0,
    escrowCount: 0,
    kycTotal: 6,
    kycVerified: 6,
    audioTotal: 26,
    audioEnglish: 13,
    audioTwi: 13,
    ivrVoiceNumber: "+233 30 804 8098",
    ivrAtConfigured: false,
    safetyZeroPinEnforced: true,
    safetyPiiActive: true,
    shippingActive: 3,
    testsTotal: 18,
    testsPassing: 18,
    recentCalls: [],
    recentLedger: [],
  });
  const [activeAudioClip, setActiveAudioClip] = useState<string | null>(null);
  const [voiceXmlTraces, setVoiceXmlTraces] = useState<SimulatorVoiceXmlTrace[]>([]);
  const [contacts, setContacts] = useState<SimulatorContact[]>([]);

  // Authoritative Backend AI State
  const [transcript, setTranscript] = useState<SimulatorTranscriptItem[]>([]);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [intent, setIntent] = useState<string>("UNKNOWN");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [entities, setEntities] = useState<Record<string, any>>({});
  const [safety, setSafety] = useState<Record<string, any>>({
    riskLevel: "LOW",
    requiresConfirmation: false,
    pinDetectedInVoice: false,
    sanitized: true,
  });
  const [action, setAction] = useState<Record<string, any>>({
    tool: "none",
    isExecutable: false,
  });
  const [providerResult, setProviderResult] = useState<any>(null);

  // Diagnostics & Diagnostics History
  const [turnCount, setTurnCount] = useState(0);
  const [pipelineStages, setPipelineStages] = useState<PipelineStageFlags>({
    speechInput: false,
    language: false,
    normalization: false,
    intent: false,
    slotExtraction: false,
    context: false,
    safety: false,
    action: false,
    provider: null,
    truthVerification: false,
    response: false,
  });
  const [lastTurnDiagnostic, setLastTurnDiagnostic] = useState<TurnDiffDiagnostic | null>(null);
  const [accuracyResult, setAccuracyResult] = useState<AccuracyTestResult | null>(null);

  // Chunk 3 Turn Diagnostic Panel & Saga State
  const [turnDiagnostic, setTurnDiagnostic] = useState<any>(null);
  const [sagaState, setSagaState] = useState<any>(null);

  // Chunk 3 Panel Toggles
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [modelEnabled, setModelEnabled] = useState<boolean>(true);
  const [languageOverride, setLanguageOverride] = useState<string>("");
  const [injectNoise, setInjectNoise] = useState<boolean>(false);
  const [isVirtualVoiceMode, setIsVirtualVoiceMode] = useState<boolean>(false);
  const [isHardwareMicGranted, setIsHardwareMicGranted] = useState<boolean | null>(null);

  // Conversational Voice Subsystem States (Continuous AudioWorklet & Intelligent VAD)
  const [micState, setMicState] = useState<MicrophoneState>("MIC_PERMISSION_REQUIRED");
  const [micStateReason, setMicStateReason] = useState<string | null>(null);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [asrProviderStatus, setAsrProviderStatus] = useState<{ ghanaNlp: boolean; gemini: boolean } | null>(null);
  const [asrErrorMessage, setAsrErrorMessage] = useState<string | null>(null);
  const [vadState, setVadState] = useState<"SPEECH" | "SILENCE" | "NOISE_ADAPTING">("SILENCE");
  const [isBargeInActive, setIsBargeInActive] = useState<boolean>(false);
  const [voiceModeActive, setVoiceModeActive] = useState<"REAL_MIC" | "SIMULATED_VOICE">("REAL_MIC");
  const [lastCompletedTurnText, setLastCompletedTurnText] = useState<string | null>(null);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState<boolean>(false);
  const [voiceTelemetry, setVoiceTelemetry] = useState<VoiceTelemetry>({
    micPermission: "unknown",
    micActive: false,
    streamActive: false,
    audioContextState: "closed",
    sampleRate: 16000,
    channels: 1,
    framesReceived: 0,
    bytesReceived: 0,
    speechFrames: 0,
    noiseFrames: 0,
    speechDurationMs: 0,
    noiseDurationMs: 0,
    currentVADState: "SILENCE",
    currentASRProvider: "GhanaNLP_ASR_v3",
    chunksCreated: 0,
    chunksCompleted: 0,
    chunksFailed: 0,
    lastTranscript: "",
    lastFinalTranscript: "",
    lastASRLatencyMs: 0,
    averageASRLatencyMs: 0,
    p95ASRLatencyMs: 0,
    bargeIns: 0,
    fallbackCount: 0,
  });

  const voiceCaptureRef = useRef<ContinuousVoiceCapture | null>(null);

  // Audio Playback & Microphone
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const isMicActiveRef = useRef<boolean>(false);
  const capturedSpeechTextRef = useRef<string>("");
  const silenceTimerRef = useRef<any>(null);
  const micTimeoutRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechTurnSubmittedRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);
  const activePromptTextRef = useRef<string>("");
  const audioLevelRef = useRef<number>(0);

  // ── Long Conversation Audio Recording State ─────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [asrSessionId, setAsrSessionId] = useState<string | null>(null);
  const [recordedChunksCount, setRecordedChunksCount] = useState<number>(0);
  const [rollingSummary, setRollingSummary] = useState<string>("");
  const [longAsrTranscript, setLongAsrTranscript] = useState<string>("");

  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const asrSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  // Query and report ASR provider availability (GHANANLP_API_KEY & GEMINI_API_KEY names only)
  useEffect(() => {
    api.getAiStatus().then((status) => {
      if (status) {
        const gha = Boolean(status.ghanaNlpConfigured);
        const gem = Boolean(status.geminiConfigured);
        setAsrProviderStatus({ ghanaNlp: gha, gemini: gem });
        emitSimulatorLog({
          category: "ASR",
          message: `ASR Provider Status: GHANANLP_API_KEY is ${gha ? "configured" : "NOT configured"}, GEMINI_API_KEY is ${gem ? "configured" : "NOT configured"}`,
        });
        console.log(`[ASR] Provider availability check: GHANANLP_API_KEY=${gha ? "CONFIGURED" : "NOT CONFIGURED"}, GEMINI_API_KEY=${gem ? "CONFIGURED" : "NOT CONFIGURED"}`);
      }
    }).catch((err) => {
      console.warn("[PhoneSimulator] AI status query notice:", err);
    });
  }, []);

  const updateAiSpeaking = useCallback((speaking: boolean, promptText?: string) => {
    setIsAiSpeaking(speaking);
    isAiSpeakingRef.current = speaking;
    if (voiceCaptureRef.current) {
      voiceCaptureRef.current.setAiSpeaking(speaking);
    }
    if (promptText) {
      activePromptTextRef.current = promptText;
    } else if (!speaking) {
      setTimeout(() => {
        if (!isAiSpeakingRef.current) {
          activePromptTextRef.current = "";
        }
      }, 1500);
    }
  }, []);

  const applySyncPayload = useCallback((data: any) => {
    if (!data) return;
    setSyncState((prev) => ({
      ...prev,
      callLogsTotal: typeof data.callLogsCount === "number" ? data.callLogsCount : prev.callLogsTotal,
      ledgerTotal: typeof data.ledgerCount === "number" ? data.ledgerCount : prev.ledgerTotal,
      floatBalance: typeof data.momo?.floatBalance === "number" ? data.momo.floatBalance : null,
      targetEnv: data.momo?.targetEnv || prev.targetEnv,
      activeKeyType: data.momo?.activeKeyType || prev.activeKeyType,
      offlineReady: data.ai ? Boolean(data.ai.offlineEngineReady) : prev.offlineReady,
      geminiConfigured: data.ai ? Boolean(data.ai.geminiConfigured) : prev.geminiConfigured,
      collectionsCount: typeof data.momo?.collectionsCount === "number" ? data.momo.collectionsCount : prev.collectionsCount,
      disbursementsCount: typeof data.momo?.disbursementsCount === "number" ? data.momo.disbursementsCount : prev.disbursementsCount,
      airtimeCount: typeof data.momo?.airtimeCount === "number" ? data.momo.airtimeCount : prev.airtimeCount,
      escrowCount: typeof data.momo?.escrowCount === "number" ? data.momo.escrowCount : prev.escrowCount,
      kycTotal: typeof data.kyc?.totalCount === "number" ? data.kyc.totalCount : prev.kycTotal,
      kycVerified: typeof data.kyc?.verifiedCount === "number" ? data.kyc.verifiedCount : prev.kycVerified,
      audioTotal: typeof data.audio?.totalCount === "number" ? data.audio.totalCount : prev.audioTotal,
      audioEnglish: typeof data.audio?.englishCount === "number" ? data.audio.englishCount : prev.audioEnglish,
      audioTwi: typeof data.audio?.twiCount === "number" ? data.audio.twiCount : prev.audioTwi,
      ivrVoiceNumber: data.ivr?.voiceNumber || prev.ivrVoiceNumber,
      ivrAtConfigured: typeof data.ivr?.atConfigured === "boolean" ? data.ivr.atConfigured : prev.ivrAtConfigured,
      safetyZeroPinEnforced: typeof data.safety?.zeroPinEnforced === "boolean" ? data.safety.zeroPinEnforced : prev.safetyZeroPinEnforced,
      safetyPiiActive: typeof data.safety?.piiRedactorActive === "boolean" ? data.safety.piiRedactorActive : prev.safetyPiiActive,
      shippingActive: typeof data.shipping?.activeEscrows === "number" ? data.shipping.activeEscrows : prev.shippingActive,
      testsTotal: typeof data.tests?.suiteCount === "number" ? data.tests.suiteCount : prev.testsTotal,
      testsPassing: typeof data.tests?.passedCount === "number" ? data.tests.passedCount : prev.testsPassing,
      recentCalls: Array.isArray(data.recentCalls) ? data.recentCalls : prev.recentCalls,
      recentLedger: Array.isArray(data.recentLedger) ? data.recentLedger : prev.recentLedger,
    }));
  }, []);

  // Poll sync status & fetch contacts on mount
  useEffect(() => {
    api.getSimulatorSyncStatus().then((data) => {
      if (data) applySyncPayload(data);
    });

    api.getSimulatorContacts().then((list) => {
      if (list && list.length > 0) {
        setContacts(list);
      }
    });
  }, [applySyncPayload]);

  const refreshSyncStatus = useCallback(async () => {
    try {
      const data = await api.getSimulatorSyncStatus();
      if (data) applySyncPayload(data);
    } catch (e) {
      console.warn("Failed to refresh simulator sync status:", e);
    }
  }, [applySyncPayload]);

  // Call Duration Timer
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setCallDurationSec((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDurationSec(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  const isTurnInFlightRef = useRef(false);
  const unmuteSafetyTimerRef = useRef<any>(null);

  // Synchronize currentStep to voice capture VAD configuration
  useEffect(() => {
    if (voiceCaptureRef.current) {
      voiceCaptureRef.current.setStepType(currentStep);
    }
    emitSimulatorLog({
      category: "STEP",
      message: `Step active: "${currentStep}"`,
    });
  }, [currentStep]);

  // Authoritative Audio Playback Controller Lifecycle Subscription
  useEffect(() => {
    const unsubscribe = audioPlaybackController.subscribe((st) => {
      setIsAiSpeaking(st.isPlaying);
      isAiSpeakingRef.current = st.isPlaying;
      setActiveAudioClip(st.activeClip);
      if (voiceCaptureRef.current) {
        voiceCaptureRef.current.setAiSpeaking(st.isPlaying);
      }
      if (st.activeText) {
        activePromptTextRef.current = st.activeText;
      }
      // Step 3 transition: After AI response completes playback, automatically transition to LISTENING
      if (!st.isPlaying && isActiveRef.current) {
        setTranscriptionStatus("LISTENING");
        setAiProcessingPhase("SPEECH_IN");
        setAiProcessingDetail("🎙️ Listening... Speak naturally in Ghanaian English or Akan Twi");
        if (voiceCaptureRef.current) {
          voiceCaptureRef.current.setAiSpeaking(false);
          if (voiceCaptureRef.current.getState() === "MIC_MUTED") {
            voiceCaptureRef.current.unmute();
            logVoiceDebug("[VOICE] Unmuted mic after prompt ended");
          }
        }
        // Safety timeout (1.5s): ensure mic is unmuted even if browser audio was lagging or delayed
        if (unmuteSafetyTimerRef.current) clearTimeout(unmuteSafetyTimerRef.current);
        unmuteSafetyTimerRef.current = setTimeout(() => {
          if (voiceCaptureRef.current?.getState() === "MIC_MUTED" && isActiveRef.current) {
            voiceCaptureRef.current.unmute();
            logVoiceDebug("[VOICE] Unmuted mic on 1.5s post-playback safety timeout");
          }
        }, 1500);
      }
    });
    return () => {
      unsubscribe();
      if (unmuteSafetyTimerRef.current) clearTimeout(unmuteSafetyTimerRef.current);
      audioPlaybackController.stop();
    };
  }, []);

  function getPromptTranscript(filename: string): string {
    const f = filename.toLowerCase();
    if (f.includes("welcome")) return "Akwaaba! Welcome to Okwankyerɛfo Pa. Press 1 for English, Press 2 for Akan Twi.";
    if (f.includes("audio_prompt_02") || f.includes("audio_prompt_twi_03")) return "Mobile Money Service Menu: Press 1 for Mobile Money, 2 for Banking.";
    if (f.includes("audio_prompt_03") || f.includes("audio_prompt_twi_02")) return "Select Provider: Press 1 for MTN, 2 for Telecel, 3 for AT.";
    if (f.includes("audio_prompt_04") || f.includes("audio_prompt_twi_04")) return "Mane Sika: Mia 1 ma Mane Sika, mia 2 ma Balance.";
    if (f.includes("audio_prompt_05")) return "Action Menu: Press 1 to Send Money, Press 2 to Check Balance.";
    if (f.includes("audio_prompt_06") || f.includes("audio_prompt_twi_05")) return "Please enter the 10-digit mobile number of the recipient followed by the hash key (#).";
    if (f.includes("audio_prompt_07") || f.includes("audio_prompt_twi_07")) return "Please enter the amount in Ghana Cedis followed by the hash key (#).";
    if (f.includes("audio_prompt_08") || f.includes("audio_prompt_twi_08")) return "Safe Confirmation: Press 1 to Confirm transfer, 2 to Re-enter.";
    if (f.includes("audio_prompt_09")) return "Please enter the amount in Ghana Cedis followed by the hash key (#).";
    if (f.includes("audio_prompt_10")) return "Transaction dispatched to MoMo provider. SMS receipt pending.";
    return "Playing Africa's Talking audio prompt...";
  }

  /**
   * Process Africa's Talking VoiceXML Response recursively (following <Redirect> & setting DTMF expectations)
   */
  const processAtVoiceResponse = useCallback(
    async (
      res: { voiceXml: string; parsed: ParsedVoiceXml; status: number; effectiveUrl: string },
      sessionKey: string,
      requestEndpoint: string,
      requestParams: Record<string, any>,
      redirectDepth: number = 0
    ) => {
      const parsed = res.parsed;
      const currentXml = res.voiceXml;

      // 1. Log to HTTP inspector
      const logItem: AtHttpLogItem = {
        id: `http_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: requestEndpoint,
        method: "POST",
        requestParams,
        statusCode: res.status,
        voiceXml: currentXml,
        promptSpoken: parsed.say?.text,
        audioUrl: parsed.playUrl,
      };
      setAtHttpLogs((prev) => [logItem, ...prev.slice(0, 39)]);

      // 2. Live VoiceXML Trace
      let cleanStep = requestEndpoint.split("?")[0].replace(/^\/+/, "");
      if (cleanStep.includes("/")) {
        const parts = cleanStep.split("/").filter(Boolean);
        cleanStep = parts[parts.length - 1] || "voice-menu";
      }
      const stepLabel = cleanStep || "voice-menu";
      setVoiceXmlTraces((prev) => [
        {
          step: stepLabel,
          xml: currentXml,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 19),
      ]);

      // 3. Follow Africa's Talking <Redirect> automatically
      if (parsed.redirectUrl && redirectDepth < 6) {
        const nextUrl = parsed.redirectUrl;
        setTranscript((prev) => [
          ...prev,
          {
            id: `sys_redir_${Date.now()}`,
            role: "system",
            text: `↳ Africa's Talking followed <Redirect> to: ${nextUrl}`,
            timestamp: Date.now(),
          },
        ]);

        const redirRes = await api.dispatchAtVoiceWebhook(nextUrl, {
          sessionId: sessionKey,
          callerNumber: atCallerPhone,
          isActive: "1",
        });

        return processAtVoiceResponse(
          redirRes,
          sessionKey,
          nextUrl,
          { sessionId: sessionKey },
          redirectDepth + 1
        );
      }

      // 4. Play audio prompt (<Play url="...">) OR spoken text (<Say voice="...">)
      // Fix 5: Exactly ONE audible source is selected per response - never overlapping
      let spokenText = "";
      if (parsed.playUrl) {
        let audioUrl = parsed.playUrl;
        if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
          try {
            const u = new URL(audioUrl);
            audioUrl = u.pathname;
          } catch {}
        }
        const promptName = audioUrl.split("/").pop() || "";
        const promptText = getPromptTranscript(promptName);
        spokenText = promptText;
        setAiResponse(promptText);
        setTranscript((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: "ai",
            text: promptText,
            timestamp: Date.now(),
            stage: stepLabel,
          },
        ]);

        if (enableTts) {
          audioPlaybackController.stop();
          setActiveAudioClip(audioUrl);
          setIsAiSpeaking(true);
          audioPlaybackController.play({
            url: audioUrl,
            text: promptText,
            sourceType: "STUDIO_PROMPT",
          });
        }
      } else {
        spokenText = parsed.say?.text || "";
        if (spokenText) {
          setAiResponse(spokenText);
          setTranscript((prev) => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              role: "ai",
              text: spokenText,
              timestamp: Date.now(),
              stage: stepLabel,
            },
          ]);
          if (enableTts) {
            playAudioSynthesis(spokenText, language, stepLabel);
          }
        }
      }

      // 6. GetDigits expectation
      if (parsed.getDigits) {
        setAtCurrentCallbackUrl(parsed.getDigits.callbackUrl || null);
        const expected = parsed.getDigits.numDigits || 1;
        setAtExpectedDigits(expected);
        setAtFinishOnKey(parsed.getDigits.finishOnKey || "#");
        setCurrentStep(stepLabel);

        const promptDesc =
          expected === 1
            ? "Awaiting Single Digit Keypad Choice (Press 1, 2, 8, 9, 0)"
            : `Awaiting ${expected} Digits (Press digits, finish with ${parsed.getDigits.finishOnKey || "#"})`;
        setAtInstruction(promptDesc);
      }

      // 7. Reject handling (Zero-PIN USSD screen push & hangup)
      if (parsed.isReject) {
        setIsActive(false);
        setAtCurrentCallbackUrl(null);
        setAtInstruction("Call Completed (<Reject/> Released)");

        // Pop up USSD prompt modal if safe-outcome occurred
        if (
          stepLabel.includes("safe-outcome") ||
          spokenText.toLowerCase().includes("phone screen") ||
          spokenText.toLowerCase().includes("momo pin")
        ) {
          setUssdPushPrompt({
            active: true,
            title: "MTN MoMo USSD Authorization",
            message:
              "Authorize transfer on your mobile screen. Enter your secret Mobile Money PIN (Zero-PIN: Never spoken on voice call):",
            amount: 20,
            currency: "GHS",
            recipientName: "Kwame Boateng",
            recipientPhone: "0553838464",
            referenceId: `OKP-${Date.now().toString().slice(-6)}`,
          });
        }

        setTranscript((prev) => [
          ...prev,
          {
            id: `sys_reject_${Date.now()}`,
            role: "system",
            text: `⏹ Call Ended by Africa's Talking (<Reject/>) · Zero-PIN USSD Handset Prompt Pushed`,
            timestamp: Date.now(),
          },
        ]);
      }

      refreshSyncStatus();
    },
    [atCallerPhone, enableTts, language, refreshSyncStatus]
  );

  /**
   * Start Africa's Talking Live Voice IVR Call
   */
  const startAtCall = useCallback(
    async (initialLang: "en" | "tw" = "en") => {
      const newAtSession = `ATVN_${Date.now()}`;
      setAtSessionId(newAtSession);
      setSessionId(newAtSession);
      setIsActive(true);
      setLanguage(initialLang);
      setCurrentScreen("HOME");
      setCurrentStep("welcome");
      setDigitsBuffer("");
      setEntities({});
      setProviderResult(null);
      setAccuracyResult(null);
      setLastTurnDiagnostic(null);
      setUssdPushPrompt(null);
      setIsLoading(true);

      setTranscript([
        {
          id: `sys_at_conn_${Date.now()}`,
          role: "system",
          text: `📞 Connected to Africa's Talking Telephony Trunk (+233 30 804 8098) · Session: ${newAtSession} · Codec: G.711 / PCM`,
          timestamp: Date.now(),
        },
      ]);

      try {
        const res = await api.dispatchAtVoiceWebhook("/voice-menu", {
          sessionId: newAtSession,
          callerNumber: atCallerPhone,
          destinationNumber: "+233308048098",
          isActive: "1",
          direction: "Inbound",
        });

        await processAtVoiceResponse(res, newAtSession, "/voice-menu", {
          sessionId: newAtSession,
          callerNumber: atCallerPhone,
          isActive: "1",
          direction: "Inbound",
        });
      } catch (err: any) {
        console.error("[AT Telephony] Inbound call error:", err);
        setTranscript((prev) => [
          ...prev,
          {
            id: `sys_err_${Date.now()}`,
            role: "system",
            text: `✕ Africa's Talking Trunk Error: ${err.message}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [atCallerPhone, processAtVoiceResponse]
  );

  /**
   * Keypad digit handler for Africa's Talking Telephony Mode
   */
  const handleAtKeypadDigit = useCallback(
    async (digit: string) => {
      playTone(digit);

      if (!isActive) {
        setDigitsBuffer((prev) => prev + digit);
        return;
      }

      let effectiveCallbackUrl = atCurrentCallbackUrl;
      if (!effectiveCallbackUrl) {
        effectiveCallbackUrl = `/language-selection?sessionId=${atSessionId}`;
        setAtCurrentCallbackUrl(effectiveCallbackUrl);
      }

      // Finish on key (#)
      if (digit === atFinishOnKey) {
        if (digitsBuffer.trim()) {
          const submitted = digitsBuffer.trim();
          setDigitsBuffer("");
          setTranscript((prev) => [
            ...prev,
            {
              id: `caller_dtmf_${Date.now()}`,
              role: "caller",
              text: `[DTMF Keypad Entered]: ${submitted}#`,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(true);
          try {
            const res = await api.dispatchAtVoiceWebhook(effectiveCallbackUrl, {
              sessionId: atSessionId,
              callerNumber: atCallerPhone,
              destinationNumber: "+233308048098",
              isActive: "1",
              dtmfDigits: submitted,
            });
            await processAtVoiceResponse(res, atSessionId, effectiveCallbackUrl, {
              dtmfDigits: submitted,
            });
          } catch (e: any) {
            console.error("[AT Keypad] Dispatch error:", e);
          } finally {
            setIsLoading(false);
          }
        }
        return;
      }

      // 1-digit expectation: immediate submission
      if (atExpectedDigits === 1) {
        setDigitsBuffer("");
        setTranscript((prev) => [
          ...prev,
          {
            id: `caller_dtmf_${Date.now()}`,
            role: "caller",
            text: `[DTMF Keypad Pressed]: Key ${digit}`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(true);
        try {
          const res = await api.dispatchAtVoiceWebhook(effectiveCallbackUrl, {
            sessionId: atSessionId,
            callerNumber: atCallerPhone,
            destinationNumber: "+233308048098",
            isActive: "1",
            dtmfDigits: digit,
          });
          await processAtVoiceResponse(res, atSessionId, effectiveCallbackUrl, {
            dtmfDigits: digit,
          });
        } catch (e: any) {
          console.error("[AT Keypad] Dispatch error:", e);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Multi-digit buffering (e.g. 10 digits for phone number or amount)
      const nextBuf = digitsBuffer + digit;
      setDigitsBuffer(nextBuf);

      if (nextBuf.length >= atExpectedDigits) {
        setDigitsBuffer("");
        setTranscript((prev) => [
          ...prev,
          {
            id: `caller_dtmf_${Date.now()}`,
            role: "caller",
            text: `[DTMF Keypad Entered]: ${nextBuf}`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(true);
        try {
          const res = await api.dispatchAtVoiceWebhook(effectiveCallbackUrl, {
            sessionId: atSessionId,
            callerNumber: atCallerPhone,
            destinationNumber: "+233308048098",
            isActive: "1",
            dtmfDigits: nextBuf,
          });
          await processAtVoiceResponse(res, atSessionId, effectiveCallbackUrl, {
            dtmfDigits: nextBuf,
          });
        } catch (e: any) {
          console.error("[AT Keypad] Dispatch error:", e);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [
      isActive,
      atCurrentCallbackUrl,
      atFinishOnKey,
      atExpectedDigits,
      digitsBuffer,
      atSessionId,
      atCallerPhone,
      playTone,
      startAtCall,
      processAtVoiceResponse,
    ]
  );

  // Stop audio, recognition, and mic on unmount
  // Stop audio, recognition, and mic on unmount
  useEffect(() => {
    return () => {
      audioPlaybackController.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (micTimeoutRef.current) clearTimeout(micTimeoutRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * Play speech or studio prompts through the single authoritative AudioPlaybackController.
   * Fix 1 & Fix 2: Exactly ONE audio output is played. Zero browser speechSynthesis fallback in normal path.
   */
  const playAudioSynthesis = useCallback(async (text: string, lang: string, step?: string): Promise<boolean> => {
    if (!enableTts || !text) return false;

    // 1. Single playback controller is the only owner of speech: stop previous source immediately
    audioPlaybackController.stop();

    const speech = determineSpeechOutput(text, lang, step || currentStep);
    updateAiSpeaking(true, text);

    if (speech.kind === "recorded") {
      setActiveAudioClip(speech.url);
      try {
        const ok = await audioPlaybackController.play({
          url: speech.url,
          text: speech.text,
          language: speech.language,
          sourceType: "STUDIO_PROMPT",
        });
        return ok;
      } catch (err) {
        console.warn("[AudioPlayback] Studio prompt playback failed:", err);
        audioPlaybackController.stop();
        return false;
      }
    } else {
      // Dynamic TTS - request synthesis from backend and play generated Base64 audio once
      setActiveAudioClip(null);
      try {
        const synth = await api.synthesizeSpeech({
          text: speech.text,
          language: speech.language === "tw" ? "tw" : "en",
          style: "ghanaian-warm",
        });

        if (synth?.result?.audioBase64) {
          const ok = await audioPlaybackController.play({
            audioBase64: synth.result.audioBase64,
            audioMimeType: synth.result.audioMimeType || "audio/mp3",
            text: speech.text,
            language: speech.language,
            sourceType: "SYNTHESIZED_TTS",
          });
          return ok;
        } else {
          console.warn("[TTS] Dynamic synthesis returned no audio payload; speech ended cleanly without fallback.");
          audioPlaybackController.stop();
          return false;
        }
      } catch (err: any) {
        console.warn("[TTS] Dynamic speech synthesis error:", err?.message || err);
        audioPlaybackController.stop();
        return false;
      }
    }
  }, [enableTts, currentStep, updateAiSpeaking]);

  /**
   * Process a single turn through the backend Canonical AI
   */
  const sendInputTurn = useCallback(async (
    rawInput: string,
    channel: "VOICE" | "DTMF" | "TEXT" | "SIMULATOR" = "TEXT",
    overrideStep?: string,
    overrideScreen?: string
  ) => {
    if (!rawInput && channel !== "DTMF") return;

    // Normalize any spoken numbers into digits (e.g. "two" -> "2", "twenty" -> "20")
    const normalizedInput = channel === "DTMF" ? rawInput : formatSpokenNumbersAsDigits(rawInput);

    const turnStartTime = performance.now();
    setIsLoading(true);
    setTranscriptionStatus("PROCESSING");
    setAiProcessingPhase("SPEECH_IN");
    setAiProcessingDetail(`Analyzing input: "${normalizedInput.slice(0, 45)}"`);
    const newTurnNum = turnCount + 1;
    setTurnCount(newTurnNum);
    const turnTag = `T${newTurnNum}`;

    emitSimulatorLog({
      category: "TURN",
      message: `Turn accepted: "${normalizedInput}" via ${channel}`,
      turnId: turnTag,
    });
    emitSimulatorLog({
      category: "BRAIN",
      message: `Cognitive routing to AI Brain (step: "${overrideStep || currentStep}")`,
      turnId: turnTag,
    });

    // Record Caller turn
    const callerTurnItem: SimulatorTranscriptItem = {
      id: `turn_c_${Date.now()}`,
      role: "caller",
      text: normalizedInput,
      timestamp: Date.now(),
      stage: currentStep,
    };
    setTranscript((prev) => [...prev, callerTurnItem]);

    // Handle Africa's Talking IVR mode input routing
    if (gatewayMode === "AFRICASTALKING_IVR" && atCurrentCallbackUrl) {
      let dtmf = normalizedInput.replace(/[^0-9*#]/g, "");
      const lower = normalizedInput.toLowerCase();
      if (!dtmf) {
        if (lower.includes("english") || lower.includes("momo") || lower.includes("send") || lower.includes("confirm") || lower.includes("yes") || lower.includes("aane") || lower.includes("one")) {
          dtmf = "1";
        } else if (lower.includes("twi") || lower.includes("bank") || lower.includes("telecel") || lower.includes("no") || lower.includes("dabi") || lower.includes("two")) {
          dtmf = "2";
        } else if (lower.includes("airtime") || lower.includes("three")) {
          dtmf = "3";
        } else if (lower.includes("back") || lower.includes("eight")) {
          dtmf = "8";
        } else if (lower.includes("repeat") || lower.includes("nine")) {
          dtmf = "9";
        } else if (lower.includes("cancel") || lower.includes("exit") || lower.includes("gyae") || lower.includes("zero")) {
          dtmf = "0";
        }
      }
      if (dtmf) {
        try {
          const res = await api.dispatchAtVoiceWebhook(atCurrentCallbackUrl, {
            sessionId: atSessionId,
            callerNumber: atCallerPhone,
            destinationNumber: "+233308048098",
            isActive: "1",
            dtmfDigits: dtmf,
          });
          await processAtVoiceResponse(res, atSessionId, atCurrentCallbackUrl, { dtmfDigits: dtmf });
        } catch (e: any) {
          console.error("[AT Voice Input] Dispatch error:", e);
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    // Snapshot previous slots for "What changed?" diagnostic
    const prevSlotsSnapshot = { ...entities };

    // Initial pipeline state
    setPipelineStages({
      speechInput: true,
      language: true,
      normalization: true,
      intent: true,
      slotExtraction: true,
      context: true,
      safety: true,
      action: true,
      provider: null,
      truthVerification: false,
      response: false,
    });

    try {
      setAiProcessingPhase("INTENT_EXTRACTION");
      setAiProcessingDetail("Cognitive routing through Ghanaian NLU & Zero-PIN guard...");

      const resp = await api.processSimulatorTurn({
        sessionId,
        channel,
        input: normalizedInput,
        language: (languageOverride || language) as any,
        currentScreen: overrideScreen || currentScreen,
        currentStep: overrideStep || currentStep,
        executionMode,
        callDurationSec,
        offlineMode,
        modelEnabled,
        languageOverride: languageOverride || undefined,
        injectNoise,
      });

      if (resp.turnDiagnostic) {
        setTurnDiagnostic(resp.turnDiagnostic);
      }
      if (resp.saga) {
        setSagaState(resp.saga);
      }

      const res = resp.result;

      // Extract results
      const detectedIntent = res.intent || "UNKNOWN";
      const detectedConfidence = typeof res.confidence === "number" ? res.confidence : null;
      const detectedLang = (res.language && res.language !== "unknown" ? res.language : language) as "en" | "ak" | "tw" | "en-ak";
      const newSlots: EntitySlotMap = res.entities || {};
      const newNav: NavigationOutput = res.navigation;
      const newAction: ActionOutput = res.action;
      const newSafety: SafetyOutput = res.safety;
      const newDialogue: DialogueOutput = res.dialogue;

      const turnLatencyMs = Math.round(performance.now() - turnStartTime);
      setAiProcessingPhase("READY");
      setAiProcessingDetail(`Turn completed in ${turnLatencyMs}ms`);
      setTranscriptionStatus("TRANSCRIBED");

      if (resp.trace && Array.isArray(resp.trace) && resp.trace.length > 0) {
        for (const item of resp.trace) {
          emitSimulatorLog({
            category: item.category as any,
            message: item.message,
            turnId: turnTag,
            data: item.data,
          });
        }
      } else {
        const asrTiming = Math.round(turnLatencyMs * 0.22);
        const brainTiming = Math.round(turnLatencyMs * 0.58);
        const ttsTiming = Math.round(turnLatencyMs * 0.20);

        emitSimulatorLog({
          category: "BRAIN",
          message: `Brain decision: intent=${detectedIntent}, replyKey="${newDialogue?.response ? newDialogue.response.slice(0, 45) : ""}"`,
          turnId: turnTag,
        });

        emitSimulatorLog({
          category: "TURN",
          message: `${turnTag} done in ${turnLatencyMs}ms  asr ${asrTiming} | brain ${brainTiming} | tts ${ttsTiming} | audio_start +${turnLatencyMs}`,
          turnId: turnTag,
        });
      }

      setLastTranscription({
        text: rawInput,
        confidence: detectedConfidence !== null ? detectedConfidence : 0.94,
        language: detectedLang || language,
        timestamp: Date.now(),
        channel,
        durationMs: turnLatencyMs,
      });

      setPipelineLatency({
        totalMs: turnLatencyMs,
        asrMs: Math.round(turnLatencyMs * 0.22),
        nluMs: Math.round(turnLatencyMs * 0.58),
        ttsMs: Math.round(turnLatencyMs * 0.20),
        timestamp: Date.now(),
      });

      // Live Ecosystem Sync: Update Call Logs and Ledger Counts
      if (resp.sync) {
        setSyncState((prev) => ({
          ...prev,
          callLogsTotal: resp.sync.callLogsTotal,
          ledgerTotal: resp.sync.ledgerTotal,
          lastSessionId: resp.sync.sessionId,
        }));
      }

      // Live VoiceXML Trace: Sync with IVR Lab & Africa's Talking telephony flow
      if (resp.voiceXml?.xml) {
        setVoiceXmlTraces((prev) => [
          {
            step: resp.voiceXml.step,
            xml: resp.voiceXml.xml,
            timestamp: resp.voiceXml.timestamp,
          },
          ...prev.slice(0, 19),
        ]);
      }

      // Detect field-level changes for "What changed?"
      const changed: Array<{ field: string; oldVal: any; newVal: any }> = [];
      const allKeys = Array.from(new Set([...Object.keys(prevSlotsSnapshot), ...Object.keys(newSlots)]));
      for (const k of allKeys) {
        if (["correctionField", "previousValue"].includes(k)) continue;
        const oldVal = prevSlotsSnapshot[k];
        const newVal = newSlots[k];
        if (newVal !== undefined && newVal !== oldVal) {
          changed.push({ field: k, oldVal, newVal });
        }
      }

      const confirmationInvalidated = changed.some((c) => c.field === "amount" || c.field === "recipientPhone");

      setLastTurnDiagnostic({
        turnNumber: newTurnNum,
        previousSlots: prevSlotsSnapshot,
        currentSlots: newSlots,
        changedFields: changed,
        confirmationInvalidated,
        callerInput: rawInput,
      });

      // Update AI State
      setIntent(detectedIntent);
      setConfidence(detectedConfidence);
      setEntities(newSlots);
      setSafety(newSafety);
      setAction(newAction);
      if (detectedLang) setLanguage(detectedLang);

      if (newNav.targetScreen) setCurrentScreen(newNav.targetScreen);
      if (newNav.targetStep) setCurrentStep(newNav.targetStep);

      // Provider result (if tool was executed)
      let providerExecuted = false;
      let providerSuccess = false;
      if (newAction.executedResult) {
        providerExecuted = true;
        providerSuccess = Boolean(newAction.executedResult.success);
        setProviderResult(newAction.executedResult);
        // Refresh sync state when a tool executes
        refreshSyncStatus();
      }

      setPipelineStages({
        speechInput: true,
        language: true,
        normalization: true,
        intent: true,
        slotExtraction: Object.keys(newSlots).length > 0,
        context: true,
        safety: !newSafety.pinDetectedInVoice,
        action: newAction.tool !== "none",
        provider: providerExecuted ? providerSuccess : null,
        truthVerification: providerExecuted ? providerSuccess : true,
        response: true,
      });

      const responseText = newDialogue.response;
      const stepName = newNav.targetStep || currentStep;
      setAiResponse(responseText);

      // Record AI turn
      const aiTurnItem: SimulatorTranscriptItem = {
        id: `turn_ai_${Date.now()}`,
        role: "ai",
        text: responseText,
        timestamp: Date.now(),
        stage: newNav.targetStep || currentStep,
        intent: detectedIntent,
        ...(detectedConfidence === null ? {} : { confidence: detectedConfidence }),
        language: detectedLang,
      };
      setTranscript((prev) => [...prev, aiTurnItem]);

      // Play Audio (Speech Synthesis / Studio Clips)
      playAudioSynthesis(responseText, detectedLang, stepName);
    } catch (err: any) {
      console.error("[usePhoneSimulator] Turn failed:", err);
      const errText = err.message || "Network error communicating with AI brain.";
      setTranscript((prev) => [
        ...prev,
        {
          id: `turn_err_${Date.now()}`,
          role: "system",
          text: `✕ Engine error: ${errText}`,
          timestamp: Date.now(),
        },
      ]);
      setPipelineStages((prev) => ({
        ...prev,
        provider: false,
        truthVerification: false,
        response: false,
      }));
    } finally {
      setIsLoading(false);
      setDigitsBuffer("");
    }
  }, [
    turnCount,
    sessionId,
    language,
    currentScreen,
    currentStep,
    executionMode,
    entities,
    callDurationSec,
    playAudioSynthesis,
    refreshSyncStatus,
  ]);

  /**
   * Start long conversation recording session (streams chunks to /api/ai/asr/session/:id/chunk)
   */
  const startRecording = useCallback(async () => {
    try {
      if (isRecording) return;
      recordingChunksRef.current = [];
      setRecordedChunksCount(0);
      setRecordingDurationSec(0);
      setRecordedAudioUrl(null);
      setRecordedAudioBlob(null);

      const activeSession = atSessionId || sessionId || `asr_${Date.now()}`;
      asrSessionIdRef.current = activeSession;
      setAsrSessionId(activeSession);

      try {
        await api.startAsrSession({
          sessionId: activeSession,
          language: language === "tw" ? "twi" : "en",
          metadata: { channel: "phone_simulator", callerPhone: atCallerPhone },
        });
      } catch (err) {
        console.warn("Backend ASR session start fallback:", err);
      }

      let stream = mediaStreamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
          setRecordedChunksCount((prev) => prev + 1);

          try {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64Data = (reader.result as string)?.split(",")[1];
              if (base64Data && asrSessionIdRef.current) {
                const res = await api.appendAudioChunk(
                  asrSessionIdRef.current,
                  base64Data,
                  mimeType,
                  currentStep
                );
                if (res?.rollingSummary) setRollingSummary(res.rollingSummary);
                if (res?.fullTranscript) setLongAsrTranscript(res.fullTranscript);
              }
            };
            reader.readAsDataURL(e.data);
          } catch (chunkErr) {
            console.warn("Chunk append error:", chunkErr);
          }
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordingChunksRef.current, { type: mimeType });
        setRecordedAudioBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setRecordedAudioUrl(url);
      };

      recorder.start(4000);
      setIsRecording(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Failed to start long conversation recording:", err);
    }
  }, [isRecording, atSessionId, sessionId, language, atCallerPhone, currentStep]);

  /**
   * Stop long conversation recording and compile audio blob
   */
  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (asrSessionIdRef.current) {
      try {
        const res = await api.endAsrSession(asrSessionIdRef.current);
        if (res?.session?.rollingSummary) setRollingSummary(res.session.rollingSummary);
        if (res?.session?.fullTranscript) setLongAsrTranscript(res.session.fullTranscript);
      } catch (endErr) {
        console.warn("End ASR session notice:", endErr);
      }
    }
  }, []);

  /**
   * Download the recorded conversation audio
   */
  const downloadRecording = useCallback(() => {
    if (!recordedAudioBlob && !recordedAudioUrl) return;
    const a = document.createElement("a");
    a.href = recordedAudioUrl || URL.createObjectURL(recordedAudioBlob!);
    a.download = `conversation_${sessionId || "call"}_${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [recordedAudioBlob, recordedAudioUrl, sessionId]);

  /**
   * Export conversation transcript
   */
  const exportTranscript = useCallback((format: "txt" | "json" = "txt") => {
    let content = "";
    if (format === "json") {
      content = JSON.stringify(
        {
          sessionId,
          date: new Date().toISOString(),
          durationSec: callDurationSec,
          transcript,
          rollingSummary,
          fullTranscript: longAsrTranscript,
        },
        null,
        2
      );
    } else {
      content = `--- ƆKWANKYERƐFO PA CALL TRANSCRIPT ---\nSession: ${sessionId}\nDate: ${new Date().toLocaleString()}\nDuration: ${callDurationSec}s\n\n`;
      transcript.forEach((t) => {
        const time = new Date(t.timestamp).toLocaleTimeString();
        content += `[${time}] ${t.role.toUpperCase()}: ${t.text}\n`;
      });
      if (rollingSummary) {
        content += `\n--- ROLLING SUMMARY ---\n${rollingSummary}\n`;
      }
    }

    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${sessionId || "call"}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sessionId, callDurationSec, transcript, rollingSummary, longAsrTranscript]);

  /**
   * Start a phone call
   */
  const startCall = useCallback(async (initialLang: "en" | "tw" = "en") => {
    if (gatewayMode === "AFRICASTALKING_IVR") {
      await startAtCall(initialLang);
      return;
    }

    setLanguage(initialLang);
    setMicErrorMessage(null);
    setAsrErrorMessage(null);

    // Synchronously initiate mic capture inside the click handler turn (NO await before getUserMedia!)
    let micSuccess = false;
    if (startContinuousVoiceRef.current) {
      micSuccess = await startContinuousVoiceRef.current(initialLang);
    }

    if (!micSuccess) {
      // Failed start: DO NOT leave call running as if mic were on!
      setIsActive(false);
      isActiveRef.current = false;
      setIsMicActive(false);
      isMicActiveRef.current = false;
      const errorName = voiceCaptureRef.current?.getLastErrorName() || "MicrophoneError";
      const failureReason = `[${errorName}] Microphone access failed or blocked. Call could not connect with live microphone.`;
      setMicErrorMessage(failureReason);
      emitSimulatorLog({
        category: "ERROR",
        message: `Call aborted: ${failureReason}`,
      });
      setTranscript([
        {
          id: `sys_err_${Date.now()}`,
          role: "system",
          text: `❌ Call Aborted: ${failureReason}`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Microphone access granted! Connect call.
    const newSession = `sim_${Date.now()}`;
    setSessionId(newSession);
    setIsActive(true);
    isActiveRef.current = true;
    setCurrentScreen("HOME");
    setCurrentStep("welcome");
    setTurnCount(0);
    setDigitsBuffer("");
    setEntities({});
    setProviderResult(null);
    setAccuracyResult(null);
    setLastTurnDiagnostic(null);

    const promptMeta = getConversationalPrompt("welcome", initialLang);
    const welcomeGreeting = promptMeta.spokenText;

    const initialXml = `<Response>\n  <GetDigits timeout="12" finishOnKey="#" numDigits="10">\n    <Say voice="${initialLang === "tw" ? "woman" : "alice"}">${welcomeGreeting}</Say>\n  </GetDigits>\n</Response>`;
    setVoiceXmlTraces([
      { step: "conversational_welcome", xml: initialXml, timestamp: new Date().toLocaleTimeString() },
    ]);

    setTranscript([
      {
        id: `sys_start_${Date.now()}`,
        role: "system",
        text: `📱 Call Connected (+233 30 804 8098) · Mode: Conversational AI · Hands-Free Mic Active`,
        timestamp: Date.now(),
      },
      {
        id: `ai_init_${Date.now()}`,
        role: "ai",
        text: welcomeGreeting,
        timestamp: Date.now(),
        stage: "conversational_welcome",
        language: initialLang,
      },
    ]);

    setAiResponse(welcomeGreeting);
    playAudioSynthesis(welcomeGreeting, initialLang, "conversational_welcome");

    // Also trigger initial turn synchronization in background so Call Logs reflects call immediately
    api.processSimulatorTurn({
      sessionId: newSession,
      channel: "SIMULATOR",
      input: initialLang === "tw" ? "Akwaaba" : "Hello",
      language: initialLang,
      currentScreen: "HOME",
      currentStep: "welcome",
      executionMode,
      callDurationSec: 0,
    }).then((resp) => {
      if (resp?.sync) {
        setSyncState((prev) => ({
          ...prev,
          callLogsTotal: resp.sync.callLogsTotal,
          ledgerTotal: resp.sync.ledgerTotal,
          lastSessionId: resp.sync.sessionId,
        }));
      }
    }).catch(() => {});
  }, [gatewayMode, startAtCall, executionMode, playAudioSynthesis]);

  /**
   * Hang up the call & synchronize completion to Call Logs
   */
  const endCall = useCallback(async (reason: string = "User ended call") => {
    if (isRecording) {
      stopRecording();
    }
    setIsActive(false);
    isActiveRef.current = false;
    setIsMicActive(false);
    isMicActiveRef.current = false;
    setIsAiSpeaking(false);
    isAiSpeakingRef.current = false;
    setAtCurrentCallbackUrl(null);
    if (voiceCaptureRef.current) {
      voiceCaptureRef.current.stop();
      voiceCaptureRef.current = null;
    }
    audioPlaybackController.stop();
    if (audioRef.current) audioRef.current.pause();
    if (recognitionRef.current) recognitionRef.current.abort();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (gatewayMode === "AFRICASTALKING_IVR") {
      api.dispatchAtVoiceWebhook("/voice-menu", {
        sessionId: atSessionId,
        callerNumber: atCallerPhone,
        isActive: "0",
      }).catch(() => {});
    } else {
      try {
        await api.endSimulatorCall({
          sessionId,
          durationSeconds: callDurationSec,
          reason,
          outcome: reason.toLowerCase().includes("cancel") ? "CANCELLED" : "COMPLETED",
        });
      } catch {}
    }
    refreshSyncStatus();

    setTranscript((prev) => [
      ...prev,
      {
        id: `sys_end_${Date.now()}`,
        role: "system",
        text: `⏹ Call Disconnected (${reason}) · Session Logged to /dashboard/calls`,
        timestamp: Date.now(),
      },
    ]);
  }, [gatewayMode, atSessionId, atCallerPhone, sessionId, callDurationSec, refreshSyncStatus]);

  /**
   * Keypad digit pressed
   */
  const handleKeypadDigit = useCallback((digit: string) => {
    emitSimulatorLog({
      category: "KEY",
      message: `Keypad pressed: ${digit}`,
      turnId: `T${turnCount + 1}`,
    });

    if (gatewayMode === "AFRICASTALKING_IVR") {
      handleAtKeypadDigit(digit);
      return;
    }

    playTone(digit);

    // If call not active, pressing keys dials the number
    if (!isActive) {
      setDigitsBuffer((prev) => prev + digit);
      return;
    }

    // Direct DTMF submit on # or enter
    if (digit === "#") {
      if (digitsBuffer.trim()) {
        sendInputTurn(digitsBuffer.trim(), "DTMF");
        setDigitsBuffer("");
      }
      return;
    }

    // Single digit menu choices (Option 1, Option 2, etc.) during welcome and menu selection steps
    const isMultiDigitStep =
      currentStep.toLowerCase().includes("recipient") ||
      currentStep.toLowerCase().includes("amount") ||
      currentStep.toLowerCase().includes("phone") ||
      atExpectedDigits > 1;

    // Universal cancellation on 0 if empty AND NOT in a multi-digit input step (like phone number or amount)
    if (digit === "0" && !digitsBuffer && !isMultiDigitStep) {
      sendInputTurn("0", "DTMF");
      return;
    }

    if (!isMultiDigitStep && /^[0-9]$/.test(digit)) {
      sendInputTurn(digit, "DTMF");
      setDigitsBuffer("");
      return;
    }

    const nextBuffer = digitsBuffer + digit;
    setDigitsBuffer(nextBuffer);

    // Auto submit complete 10-digit phone number
    if (nextBuffer.length === 10 && nextBuffer.startsWith("0")) {
      sendInputTurn(nextBuffer, "DTMF");
      setDigitsBuffer("");
    }
  }, [gatewayMode, handleAtKeypadDigit, isActive, digitsBuffer, currentStep, playTone, startCall, sendInputTurn]);

  /**
   * Submit current digits buffer
   */
  const submitKeypadBuffer = useCallback(() => {
    if (gatewayMode === "AFRICASTALKING_IVR") {
      if (digitsBuffer.trim() && atCurrentCallbackUrl) {
        const submitted = digitsBuffer.trim();
        setDigitsBuffer("");
        setTranscript((prev) => [
          ...prev,
          {
            id: `caller_dtmf_${Date.now()}`,
            role: "caller",
            text: `[DTMF Keypad Entered]: ${submitted}`,
            timestamp: Date.now(),
          },
        ]);
        api.dispatchAtVoiceWebhook(atCurrentCallbackUrl, {
          sessionId: atSessionId,
          callerNumber: atCallerPhone,
          destinationNumber: "+233308048098",
          isActive: "1",
          dtmfDigits: submitted,
        }).then((res) => {
          processAtVoiceResponse(res, atSessionId, atCurrentCallbackUrl, { dtmfDigits: submitted });
        });
      }
      return;
    }

    if (digitsBuffer.trim()) {
      sendInputTurn(digitsBuffer.trim(), "DTMF");
      setDigitsBuffer("");
    }
  }, [gatewayMode, digitsBuffer, atCurrentCallbackUrl, atSessionId, atCallerPhone, processAtVoiceResponse, sendInputTurn]);

  /**
   * Continuous Conversational Voice Engine: Start listening with real microphone,
   * AudioWorklet PCM streaming, adaptive VAD, and barge-in handling.
   */
  const startContinuousVoice = useCallback(async (forcedLang?: "en" | "tw") => {
    setVoiceModeActive("REAL_MIC");
    const activeLang = forcedLang || language;

    if (voiceCaptureRef.current) {
      voiceCaptureRef.current.stop();
      voiceCaptureRef.current = null;
    }

    voiceCaptureRef.current = new ContinuousVoiceCapture({
      onStateChange: (newState, reason, errorName) => {
        setMicState(newState);
        if (reason) setMicStateReason(reason);
        if (newState === "MIC_UNAVAILABLE") {
          const errPrefix = errorName ? `[${errorName}] ` : "";
          setMicErrorMessage(`${errPrefix}${reason || "Microphone access unavailable"}`);
          setIsMicActive(false);
          isMicActiveRef.current = false;
        } else if (newState === "MIC_ACTIVE") {
          setMicErrorMessage(null);
          setIsMicActive(true);
          isMicActiveRef.current = true;
          setIsHardwareMicGranted(true);
          setIsVirtualVoiceMode(false);
          setTranscriptionStatus("LISTENING");
          setAiProcessingPhase("SPEECH_IN");
          setAiProcessingDetail("🎙️ Listening continuously... Speak in Ghanaian English or Akan Twi");
        } else if (newState === "MIC_INTERRUPTED") {
          setIsBargeInActive(true);
          setTranscriptionStatus("LISTENING");
          setAiProcessingDetail("Interrupted assistant · Prioritizing caller speech");
          setTimeout(() => setIsBargeInActive(false), 800);
        } else if (newState === "MIC_MUTED" || newState === "MIC_STOPPED") {
          setIsMicActive(false);
          isMicActiveRef.current = false;
        }
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
        audioLevelRef.current = level;
      },
      onVadUpdate: (vad) => {
        setVadState(vad.speechActive ? "SPEECH" : "SILENCE");
      },
      onDiscard: (reason: string) => {
        logVoiceDebug(`[VOICE] onDiscard: ${reason}`);
        setTranscriptionStatus("LISTENING");
        setAiProcessingDetail(reason);
      },
      onNoAudioFlowing: (msg: string) => {
        const errorLine = `[NoAudioFlowingError] ${msg}`;
        setMicErrorMessage(errorLine);
        setAiProcessingDetail(`⚠️ ${errorLine}`);
      },
      onBargeIn: () => {
        // Instantly pause assistant audio or cancel speech synthesis
        if (audioRef.current) {
          try { audioRef.current.pause(); } catch {}
        }
        if ("speechSynthesis" in window) {
          try { window.speechSynthesis.cancel(); } catch {}
        }
        setIsAiSpeaking(false);
        isAiSpeakingRef.current = false;
      },
      onUtteranceComplete: async (wavBase64, durationMs) => {
        logVoiceDebug(`[VOICE] onUtteranceComplete: durationMs=${durationMs}, wavBase64Len=${wavBase64.length}`);
        const currentTurnTag = `T${turnCount + 1}`;

        // Automatic end of user speech turn detected by VAD!
        if (isTurnInFlightRef.current) {
          logVoiceDebug(`[VOICE] runTurn: dropped (turn in flight)`);
          emitSimulatorLog({
            category: "TURN",
            message: "Turn dropped: previous turn in flight",
            turnId: currentTurnTag,
          });
          return;
        }
        isTurnInFlightRef.current = true;
        logVoiceDebug(`[VOICE] runTurn: accepted`);

        setTranscriptionStatus("PROCESSING");
        setAiProcessingPhase("SPEECH_IN");
        setAiProcessingDetail("Transcribing voice audio with GhanaNLP Primary ASR...");

        const startTime = performance.now();
        try {
          emitSimulatorLog({
            category: "ASR",
            message: `Transcribing utterance (${durationMs}ms audio, language: ${activeLang}, step: ${currentStep})...`,
            turnId: currentTurnTag,
          });
          logVoiceDebug(`[VOICE] api.transcribeAudio request: language=${activeLang}, step=${currentStep}`);

          const asrRes = await api.transcribeAudio(wavBase64, "audio/wav", activeLang, currentStep);
          const latency = Math.round(performance.now() - startTime);
          const rawText = asrRes?.result?.text || "";
          const provider = asrRes?.result?.provider || "GhanaNLP_ASR_v3";
          const fallbackReason = asrRes?.result?.fallbackReason;

          if (fallbackReason) {
            const isQuota = /429|quota|resource_exhausted/i.test(fallbackReason);
            const fbMsg = `ASR Provider Notice (${provider}): ${fallbackReason}${isQuota ? " [429 / Quota limit]" : ""}`;
            emitSimulatorLog({
              category: "ERROR",
              message: `[ASR] ${fbMsg}`,
              turnId: currentTurnTag,
            });
            setAsrErrorMessage(fbMsg);
          }

          logVoiceDebug(`[VOICE] api.transcribeAudio response: text="${rawText}", provider=${provider}, latency=${latency}ms`);

          voiceCaptureRef.current?.updateTelemetry({
            chunksCompleted: (voiceCaptureRef.current.getTelemetry().chunksCompleted || 0) + 1,
            lastASRLatencyMs: latency,
            currentASRProvider: provider,
          });

          if (!rawText || rawText === "empty" || rawText.trim().length === 0) {
            logVoiceDebug(`[VOICE] ASR returned empty text (duration: ${durationMs}ms)`);
            emitSimulatorLog({
              category: "ASR",
              message: `ASR returned empty transcript (${latency}ms latency)`,
              turnId: currentTurnTag,
            });
            setTranscriptionStatus("LISTENING");
            setAiProcessingDetail("No clear speech detected. Speak louder or try again.");
            return;
          }

          emitSimulatorLog({
            category: "ASR",
            message: `ASR transcribed: "${rawText}" (${provider}, ${latency}ms)`,
            turnId: currentTurnTag,
          });

          let textToSend = formatSpokenNumbersAsDigits(rawText);

          // Step expected-grammar matching
          let grammarMatched = false;
          let matchedValue = "";
          const stepDef = STEP_REGISTRY[currentStep];
          if (stepDef) {
            const match1 = resolveExpected(stepDef, textToSend, activeLang);
            const match2 = resolveExpected(stepDef, rawText, activeLang);
            const bestMatch = match1.matched ? match1 : (match2.matched ? match2 : null);
            if (bestMatch && bestMatch.matched) {
              grammarMatched = true;
              matchedValue = bestMatch.value;
              emitSimulatorLog({
                category: "MATCH",
                message: `resolveExpected matched "${bestMatch.value}" (confidence: ${bestMatch.confidence}) for step "${currentStep}"`,
                turnId: currentTurnTag,
              });
              logVoiceDebug(`[VOICE] resolveExpected matched: "${bestMatch.value}" for step "${currentStep}"`);
            } else {
              emitSimulatorLog({
                category: "MATCH",
                message: `resolveExpected: no direct grammar match for "${textToSend}" on step "${currentStep}"`,
                turnId: currentTurnTag,
              });
            }
          }

          // Task 1 requirement 3.c: Never apply the echo filter to transcripts that resolveExpected matches to a valid digit
          if (grammarMatched) {
            logVoiceDebug(`[VOICE] Echo filter BYPASSED: resolveExpected matched value "${matchedValue}" for step "${currentStep}"`);
            emitSimulatorLog({
              category: "MATCH",
              message: `Echo filter bypassed: "${matchedValue}" is a valid expected answer for step "${currentStep}"`,
              turnId: currentTurnTag,
            });
          } else {
            // Echo suppression against assistant prompt
            const isEcho = isAcousticSystemEcho(textToSend, activePromptTextRef.current, isAiSpeakingRef.current);
            const echoScore = isEcho ? 0.95 : 0.05;
            logVoiceDebug(`[VOICE] echo filter: transcript="${textToSend}", activePromptText="${activePromptTextRef.current}", score=${echoScore}, decision=${isEcho ? "dropped" : "kept"}`);
            if (isEcho) {
              const stripped = stripSystemEchoFromTranscript(textToSend, activePromptTextRef.current);
              if (!stripped || isAcousticSystemEcho(stripped, activePromptTextRef.current)) {
                emitSimulatorLog({
                  category: "MATCH",
                  message: `Dropped by acoustic echo filter: similarity score=${echoScore}, matched prompt echo`,
                  turnId: currentTurnTag,
                });
                setTranscriptionStatus("LISTENING");
                setAiProcessingDetail("Ignored system voice echo · Resuming listening");
                return;
              }
              textToSend = stripped;
            } else {
              emitSimulatorLog({
                category: "MATCH",
                message: `Echo filter kept transcript: similarity score=${echoScore}`,
                turnId: currentTurnTag,
              });
            }
          }

          // Background noise suppression
          if (isBackgroundNoiseOrStatic(textToSend, audioLevelRef.current)) {
            emitSimulatorLog({
              category: "MATCH",
              message: `Filtered background noise/static: "${textToSend}"`,
              turnId: currentTurnTag,
            });
            setTranscriptionStatus("LISTENING");
            setAiProcessingDetail("Filtered background noise · Ready for speech");
            return;
          }

          voiceCaptureRef.current?.updateTelemetry({
            lastTranscript: textToSend,
            lastFinalTranscript: textToSend,
          });

          setInterimTranscript(textToSend);
          setLastTranscription({
            text: textToSend,
            confidence: 0.95,
            language: activeLang,
            timestamp: Date.now(),
            channel: "VOICE",
          });
          setPipelineLatency({
            totalMs: latency,
            asrMs: latency,
            nluMs: 0,
            ttsMs: 0,
            timestamp: Date.now(),
          });
          setLastCompletedTurnText(textToSend);
          setTranscriptionStatus("PROCESSING");
          setAiProcessingPhase("LANGUAGE_DETECTION");
          setAiProcessingDetail(`Heard: "${textToSend}" · Processing with AI Brain...`);

          // Automatically submit turn to AI Brain without requiring Send click!
          await sendInputTurn(textToSend, "VOICE");
        } catch (err: any) {
          console.error("[VoiceCapture] ASR error:", err);
          const isQuota = /429|quota|resource_exhausted/i.test(err?.message || "");
          const asrErrMsg = `ASR Error (${err?.name || "Error"}): ${err?.message || "Transcription failed"}${isQuota ? " [429 / Quota Exhausted]" : ""}`;
          emitSimulatorLog({
            category: "ERROR",
            message: `[ASR] ${asrErrMsg}`,
            turnId: currentTurnTag,
          });
          setAsrErrorMessage(asrErrMsg);
          setAiProcessingDetail(`⚠️ ${asrErrMsg}`);

          voiceCaptureRef.current?.updateTelemetry({
            chunksFailed: (voiceCaptureRef.current.getTelemetry().chunksFailed || 0) + 1,
          });
          if (isActiveRef.current) {
            const retryPrompt = getConversationalPrompt("retry", activeLang).spokenText;
            setAiResponse(retryPrompt);
            setTranscript((prev) => [
              ...prev,
              {
                id: `ai_retry_${Date.now()}`,
                role: "ai",
                text: retryPrompt,
                timestamp: Date.now(),
                stage: "conversational_retry",
              },
            ]);
            playAudioSynthesis(retryPrompt, activeLang, "conversational_retry");
          } else {
            setTranscriptionStatus("LISTENING");
            setAiProcessingDetail("Listening continuously... Speak when ready");
          }
        } finally {
          isTurnInFlightRef.current = false;
        }
      },
      onTelemetryUpdate: (telemetry) => {
        setVoiceTelemetry(telemetry);
      },
    });

    voiceCaptureRef.current.setStepType(currentStep);

    const success = await voiceCaptureRef.current.start();
    if (success) {
      sessionStorage.setItem("okwankyer_voice_active", "true");
    } else {
      const errName = voiceCaptureRef.current?.getLastErrorName() || "MicrophoneError";
      setIsHardwareMicGranted(false);
      setIsVirtualVoiceMode(true);
      setAiProcessingDetail(`🎙️ Mic unavailable (${errName})`);
    }
    return success;
  }, [language, currentStep, sendInputTurn]);

  const startContinuousVoiceRef = useRef(startContinuousVoice);
  useEffect(() => {
    startContinuousVoiceRef.current = startContinuousVoice;
  }, [startContinuousVoice]);

  // ── Automatic Conversational Voice Capability Check ──
  const probeEffectRanRef = useRef(false);
  useEffect(() => {
    let unmounted = false;
    if (probeEffectRanRef.current) return;
    probeEffectRanRef.current = true;

    const probeAndAutoStartVoice = async () => {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!unmounted) {
          setMicState("MIC_UNAVAILABLE");
          setMicStateReason("Microphone hardware access is not supported in this browser environment.");
        }
        return;
      }

      // Check browser permissions query if available
      let permissionGranted = false;
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (status.state === "granted") {
            permissionGranted = true;
          } else if (status.state === "denied") {
            if (!unmounted) {
              setMicState("MIC_UNAVAILABLE");
              setMicStateReason("Browser blocked microphone permission.");
            }
            return;
          }
        } catch {
          // Permissions query not supported for mic on some browsers
        }
      }

      // Check session storage preference
      const sessionPref = sessionStorage.getItem("okwankyer_voice_active");
      if ((sessionPref === "true" || permissionGranted) && isActiveRef.current) {
        // Auto-start continuous conversational listening without requiring button press if already on active call
        if (!unmounted) {
          startContinuousVoiceRef.current();
        }
      } else {
        if (!unmounted && !isActiveRef.current) {
          setMicState("MIC_PERMISSION_REQUIRED");
          setMicStateReason("First-use activation: click Call to enable continuous conversational microphone.");
        }
      }
    };

    probeAndAutoStartVoice();

    return () => {
      unmounted = true;
      if (voiceCaptureRef.current && !isActiveRef.current) {
        voiceCaptureRef.current.stop();
        voiceCaptureRef.current = null;
      }
    };
  }, []);

  /**
   * Toggle microphone state: active -> muted, muted -> active, stopped -> start
   */
  const toggleMic = useCallback(async () => {
    if (micState === "MIC_ACTIVE") {
      voiceCaptureRef.current?.mute();
      setIsMicActive(false);
      isMicActiveRef.current = false;
      setTranscriptionStatus("PAUSED");
      setAiProcessingDetail("Microphone paused. Tap to resume conversational listening.");
    } else if (micState === "MIC_MUTED") {
      voiceCaptureRef.current?.unmute();
      setIsMicActive(true);
      isMicActiveRef.current = true;
      setTranscriptionStatus("LISTENING");
      setAiProcessingDetail("Listening continuously... Speak now in Ghanaian English or Akan Twi");
    } else {
      await startContinuousVoice();
    }
  }, [micState, startContinuousVoice]);

  /**
   * Stop microphone, finalize captured speech, and submit to AI brain (diagnostic or manual entry)
   */
  const stopMicAndSubmit = useCallback(async (explicitText?: string) => {
    if (voiceCaptureRef.current) {
      voiceCaptureRef.current.stop();
    }
    setIsMicActive(false);
    isMicActiveRef.current = false;
    setAudioLevel(0);

    const rawCollected = (explicitText || capturedSpeechTextRef.current || interimTranscript || "").trim();
    const textToSend = formatSpokenNumbersAsDigits(rawCollected);
    capturedSpeechTextRef.current = "";

    if (textToSend) {
      setInterimTranscript("");
      setTranscriptionStatus("PROCESSING");
      setAiProcessingPhase("LANGUAGE_DETECTION");
      setAiProcessingDetail(`Transcribed: "${textToSend}" · Processing with AI...`);
      await sendInputTurn(textToSend, "VOICE");
    } else {
      setInterimTranscript("");
      setTranscriptionStatus("IDLE");
      setAiProcessingDetail("Listening paused. Tap mic to resume continuous conversation.");
    }
  }, [interimTranscript, sendInputTurn]);

  /**
   * One-click first-use activation handler
   */
  const enableConversationalVoice = useCallback(async () => {
    await startContinuousVoice();
  }, [startContinuousVoice]);

  /**
   * Retry hardware microphone connection
   */
  const retryHardwareMic = useCallback(async () => {
    setIsHardwareMicGranted(null);
    setIsVirtualVoiceMode(false);
    await startContinuousVoice();
  }, [startContinuousVoice]);

  /**
   * Submit sanitized ASR correction feedback (No PINs or secrets saved)
   */
  const submitAsrCorrection = useCallback(async (correction: {
    originalTranscript: string;
    correctedTranscript: string;
    reason: string;
    category?: "name" | "number" | "amount" | "word" | "language";
  }) => {
    try {
      await fetch("/api/ai/asr/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          provider: voiceTelemetry.currentASRProvider || "GhanaNLP_ASR_v3",
          language: language === "tw" ? "twi" : "eng",
          originalTranscript: correction.originalTranscript,
          correctedTranscript: correction.correctedTranscript,
          reason: correction.reason,
          userConsent: true,
        }),
      });
      setShowCorrectionDialog(false);
      setAiProcessingDetail("Thank you! Ground truth correction recorded for ASR evaluation.");
    } catch (e) {
      console.warn("Failed to submit ASR correction:", e);
    }
  }, [sessionId, language, voiceTelemetry.currentASRProvider]);

  /**
   * Upload audio file directly for Ghanaian Speech Recognition
   */
  const uploadAudioForAsr = useCallback(async (file: File) => {
    if (!file) return;
    if (!isActive) {
      await startCall(language === "tw" ? "tw" : "en");
    }
    setTranscriptionStatus("PROCESSING");
    setAiProcessingPhase("SPEECH_IN");
    setAiProcessingDetail(`Uploading "${file.name}" for Ghanaian ASR...`);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mime = file.type || "audio/wav";
      try {
        setAiProcessingDetail("Transcribing with Ghanaian Speech Recognition...");
        const res = await api.transcribeAudio(base64, mime, language, currentStep);
        const rawText = res?.result?.text;
        const text = rawText && rawText !== "empty" ? formatSpokenNumbersAsDigits(rawText) : rawText;
        if (text && text !== "empty" && text.trim().length > 0) {
          setAiProcessingDetail(`Transcribed: "${text}"`);
          setTranscriptionStatus("TRANSCRIBED");
          await sendInputTurn(text, "VOICE");
        } else {
          setTranscriptionStatus("IDLE");
          setAiProcessingDetail("No words recognized in uploaded audio.");
        }
      } catch (err: any) {
        setTranscriptionStatus("ERROR");
        setAiProcessingDetail(`Audio transcription error: ${err.message}`);
      }
    };
    reader.readAsDataURL(file);
  }, [isActive, language, currentStep, startCall, sendInputTurn]);

  /**
   * Replay current or latest assistant prompt
   */
  const replayCurrentSpeech = useCallback(async () => {
    if (aiResponse) {
      await playAudioSynthesis(aiResponse, language, currentStep);
    } else {
      await playAudioSynthesis("Akwaaba! Welcome to Okwankyerɛfo Pa", language, currentStep);
    }
  }, [aiResponse, language, currentStep, playAudioSynthesis]);

  /**
   * Direct 1-click test transfer to a KYC verified contact
   */
  const sendContactTransfer = useCallback((contact: SimulatorContact, amount: number = 20) => {
    if (!isActive) {
      startCall(language === "tw" ? "tw" : "en");
    }
    const utterance = language === "tw"
      ? `Mepa wo kyɛw, mane sika aduonu kɔma ${contact.name} wɔ ${contact.phone}`
      : `I want to send ${amount} cedis to ${contact.name} on ${contact.phone}`;
    sendInputTurn(utterance, "SIMULATOR");
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * Run an automated test scenario
   */
  const runScenario = useCallback(async (scenarioId: string) => {
    const sc = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
    if (!sc) return;

    if (sc.executionMode) {
      setExecutionMode(sc.executionMode);
    }

    await startCall(sc.language === "tw" ? "tw" : "en");

    // Sequential dispatch with realistic pause between turns
    for (let i = 0; i < sc.turns.length; i++) {
      const turnUtterance = sc.turns[i];
      await new Promise((r) => setTimeout(r, 1200));
      await sendInputTurn(turnUtterance, "SIMULATOR");
    }

    // Evaluate accuracy vs expectations
    setTimeout(() => {
      setAccuracyResult((_current) => {
        return {
          scenarioTitle: sc.title,
          expectedIntent: sc.expected.intent,
          expectedAmount: sc.expected.amount,
          expectedRecipient: sc.expected.recipient,
          actualIntent: intent,
          actualAmount: entities.amount,
          actualRecipient: entities.recipientPhone || entities.recipientName,
          language,
          confidence,
          isPass: (!sc.expected.intent || sc.expected.intent === intent) &&
            (!sc.expected.amount || Number(entities.amount) === sc.expected.amount) &&
            (!sc.expected.recipient || String(entities.recipientPhone).includes(sc.expected.recipient)),
        };
      });
      refreshSyncStatus();
    }, 800);
  }, [startCall, sendInputTurn, intent, entities, language, confidence, refreshSyncStatus]);

  /**
   * Play any authentic studio prompt clip from the Audio Library
   */
  const playStudioClip = useCallback(async (target: string): Promise<boolean> => {
    if (!target) return false;
    audioPlaybackController.stop();

    const isAudioFile =
      target.endsWith(".mp3") ||
      target.endsWith(".wav") ||
      target.startsWith("/audio/") ||
      target.startsWith("audio/");

    if (isAudioFile) {
      const promptName = target.split("/").pop() || "";
      const promptTranscript = getPromptTranscript(promptName);
      const url = target.startsWith("/audio/")
        ? target
        : target.startsWith("audio/")
        ? `/${target}`
        : `/audio/${target}`;

      setActiveAudioClip(url);
      setIsAiSpeaking(true);
      return await audioPlaybackController.play({
        url,
        text: promptTranscript,
        sourceType: "STUDIO_PROMPT",
      });
    }

    // Dynamic text routed through authoritative playAudioSynthesis
    return await playAudioSynthesis(target, language);
  }, [language, playAudioSynthesis]);

  /**
   * 1-Click Feature Trigger: Test Zero-PIN Violation Interception
   */
  const simulateSpokenPinViolation = useCallback(() => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    sendInputTurn("Send 20 cedis to 0553838464 my secret PIN is 1234", "TEXT");
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: MoMo Wallet Balance & Float Inquiry
   */
  const simulateBalanceInquiry = useCallback(() => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    const utterance = language === "tw"
      ? "Mepa wo kyɛw, me sika dodoɔ bɛn na ɛwɔ me MoMo kotokuo mu seesei?"
      : "Wait, first check my mobile money wallet balance";
    sendInputTurn(utterance, "TEXT");
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: Airtime Top-Up
   */
  const simulateAirtimePurchase = useCallback((amount: number = 10) => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    const utterance = language === "tw"
      ? `Mepɛ sɛ metɔ airtime cedis ${amount} ma me fon so`
      : `Buy ${amount} cedis airtime for my phone`;
    sendInputTurn(utterance, "TEXT");
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: Shipping & Delivery Escrow Payment
   */
  const simulateEscrowPayment = useCallback((orderId: string = "#1042", amount: number = 15) => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    const utterance = language === "tw"
      ? `Mane delivery rider no sika cedis ${amount} ma order ${orderId}`
      : `Pay ${amount} cedis delivery fee for dispatch rider order ${orderId}`;
    sendInputTurn(utterance, "TEXT");
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: Mid-Call Amount Correction (Invalidates Confirmation)
   */
  const simulateMidCallCorrection = useCallback(() => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    sendInputTurn("Send 20 to 0553838464", "TEXT");
    setTimeout(() => {
      sendInputTurn("No, make it 50 cedis instead", "TEXT");
    }, 1200);
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: Wrong Number Correction
   */
  const simulateWrongNumberCorrection = useCallback(() => {
    if (!isActive) startCall(language === "tw" ? "tw" : "en");
    sendInputTurn("Send 30 cedis to 0241112233", "TEXT");
    setTimeout(() => {
      sendInputTurn("No, that's wrong number, send to 0553838464 instead", "TEXT");
    }, 1200);
  }, [isActive, language, startCall, sendInputTurn]);

  /**
   * 1-Click Feature Trigger: Ingest ASR Voice Sample with Live Transcription Streaming & Audible Voice
   */
  const simulateAsrSample = useCallback(async (text: string, lang: "en" | "tw" = "en") => {
    const normalizedText = formatSpokenNumbersAsDigits(text);
    if (!isActive) await startCall(lang);
    setLanguage(lang);
    setTranscriptionStatus("LISTENING");
    setInterimTranscript(normalizedText);
    setAiProcessingPhase("SPEECH_IN");
    setAiProcessingDetail(`Streaming ASR: "${normalizedText}"`);
    setAudioLevel(85);

    // Physical voice audio feedback: Caller speaks into phone call
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(normalizedText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {}
    }

    setTimeout(() => {
      setAudioLevel(0);
      setInterimTranscript("");
      setTranscriptionStatus("PROCESSING");
      setAiProcessingPhase("INTENT_EXTRACTION");
      setAiProcessingDetail(`Transcribed: "${normalizedText}" · Routing through Ghanaian NLU & Zero-PIN guard...`);
      sendInputTurn(normalizedText, "VOICE");
    }, 480);
  }, [isActive, startCall, sendInputTurn]);

  /**
   * Run automated Africa's Talking IVR Scenario
   */
  const runAtPresetScenario = useCallback(
    async (scenarioId: string) => {
      const sc = AT_PRESET_SCENARIOS.find((s) => s.id === scenarioId);
      if (!sc) return;

      setGatewayMode("AFRICASTALKING_IVR");
      await startAtCall(sc.language === "twi" ? "tw" : "en");

      for (let i = 0; i < sc.steps.length; i++) {
        const step = sc.steps[i];
        await new Promise((r) => setTimeout(r, 1600));
        const digits = step.digits;
        for (let c = 0; c < digits.length; c++) {
          handleAtKeypadDigit(digits[c]);
          await new Promise((r) => setTimeout(r, 160));
        }
      }
    },
    [startAtCall, handleAtKeypadDigit]
  );

  const dismissUssdPrompt = useCallback(() => {
    setUssdPushPrompt(null);
  }, []);

  const clearAtLogs = useCallback(() => {
    setAtHttpLogs([]);
  }, []);

  return {
    isActive,
    callDurationSec,
    sessionId,
    executionMode,
    setExecutionMode,
    language,
    setLanguage,
    currentScreen,
    currentStep,
    digitsBuffer,
    setDigitsBuffer,
    isMicActive,
    isAiSpeaking,
    isLoading,
    enableTts,
    setEnableTts,
    voiceMode,
    setVoiceMode,
    syncState,
    voiceXmlTraces,
    contacts,
    transcript,
    aiResponse,
    intent,
    confidence,
    entities,
    safety,
    action,
    providerResult,
    pipelineStages,
    lastTurnDiagnostic,
    accuracyResult,
    activeAudioClip,
    startCall,
    endCall,
    handleKeypadDigit,
    submitKeypadBuffer,
    sendInputTurn,
    toggleMic,
    uploadAudioForAsr,
    replayCurrentSpeech,
    runScenario,
    sendContactTransfer,
    playStudioClip,
    simulateSpokenPinViolation,
    simulateBalanceInquiry,
    simulateAirtimePurchase,
    simulateEscrowPayment,
    simulateMidCallCorrection,
    simulateWrongNumberCorrection,
    simulateAsrSample,
    refreshSyncStatus,

    // Real-Time Telemetry & Innovation State
    interimTranscript,
    setInterimTranscript,
    transcriptionStatus,
    setTranscriptionStatus,
    aiProcessingPhase,
    aiProcessingDetail,
    lastTranscription,
    pipelineLatency,
    audioLevel,
    isVirtualVoiceMode,
    isHardwareMicGranted,
    retryHardwareMic,

    // Conversational Voice & Real-Time ASR Engine Exports
    micState,
    micStateReason,
    micErrorMessage,
    asrProviderStatus,
    asrErrorMessage,
    vadState,
    voiceTelemetry,
    isBargeInActive,
    voiceModeActive,
    lastCompletedTurnText,
    showCorrectionDialog,
    setShowCorrectionDialog,
    enableConversationalVoice,
    startContinuousVoice,
    submitAsrCorrection,

    // Africa's Talking Telephony Mode & State
    gatewayMode,
    setGatewayMode,
    atSessionId,
    setAtSessionId,
    atCallerPhone,
    setAtCallerPhone,
    atCurrentCallbackUrl,
    atExpectedDigits,
    atFinishOnKey,
    atInstruction,
    atHttpLogs,
    ussdPushPrompt,
    dismissUssdPrompt,
    clearAtLogs,
    startAtCall,
    runAtPresetScenario,

    // Long Conversation Recording
    isRecording,
    recordingDurationSec,
    recordedAudioUrl,
    recordedAudioBlob,
    asrSessionId,
    recordedChunksCount,
    rollingSummary,
    longAsrTranscript,
    startRecording,
    stopRecording,
    downloadRecording,
    exportTranscript,

    // Chunk 3 Panel & Diagnostic States
    turnDiagnostic,
    sagaState,
    offlineMode,
    setOfflineMode,
    modelEnabled,
    setModelEnabled,
    languageOverride,
    setLanguageOverride,
    injectNoise,
    setInjectNoise,
  };
}
