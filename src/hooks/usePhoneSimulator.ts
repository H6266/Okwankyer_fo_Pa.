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
import type {
  NavigationOutput,
  ActionOutput,
  SafetyOutput,
  DialogueOutput,
  EntitySlotMap,
} from "../ai_system/core/aiTypes";

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
  const [transcriptionStatus, setTranscriptionStatus] = useState<"IDLE" | "LISTENING" | "PROCESSING" | "TRANSCRIBED" | "ERROR">("IDLE");
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

  // Audio Playback & Microphone
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);

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

  // Audio element setup
  useEffect(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setIsAiSpeaking(false);
      audioRef.current.onerror = () => setIsAiSpeaking(false);
    }
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
      const stepLabel = requestEndpoint.replace(/^\//, "").split("?")[0] || "voice-menu";
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

      // 4. Play audio prompt (<Play url="...">)
      if (parsed.playUrl) {
        let audioUrl = parsed.playUrl;
        if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
          try {
            const u = new URL(audioUrl);
            audioUrl = u.pathname;
          } catch {}
        }
        setActiveAudioClip(audioUrl);
        if (audioRef.current && enableTts) {
          audioRef.current.src = audioUrl;
          setIsAiSpeaking(true);
          audioRef.current.play().catch(() => {});
        }
      }

      // 5. Spoken text (<Say voice="...">)
      const spokenText = parsed.say?.text || "";
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
        if (!parsed.playUrl && enableTts) {
          playAudioSynthesis(spokenText, language);
        }
      } else if (parsed.playUrl) {
        const promptName = parsed.playUrl.split("/").pop() || "";
        const promptText = getPromptTranscript(promptName);
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
        if (digit === "1") startAtCall("en");
        else if (digit === "2") startAtCall("tw");
        else startAtCall("en");
        return;
      }

      if (!atCurrentCallbackUrl) {
        console.warn("[AT Telephony] No active Africa's Talking callback URL");
        return;
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
            const res = await api.dispatchAtVoiceWebhook(atCurrentCallbackUrl, {
              sessionId: atSessionId,
              callerNumber: atCallerPhone,
              destinationNumber: "+233308048098",
              isActive: "1",
              dtmfDigits: submitted,
            });
            await processAtVoiceResponse(res, atSessionId, atCurrentCallbackUrl, {
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
          const res = await api.dispatchAtVoiceWebhook(atCurrentCallbackUrl, {
            sessionId: atSessionId,
            callerNumber: atCallerPhone,
            destinationNumber: "+233308048098",
            isActive: "1",
            dtmfDigits: digit,
          });
          await processAtVoiceResponse(res, atSessionId, atCurrentCallbackUrl, {
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
          const res = await api.dispatchAtVoiceWebhook(atCurrentCallbackUrl, {
            sessionId: atSessionId,
            callerNumber: atCallerPhone,
            destinationNumber: "+233308048098",
            isActive: "1",
            dtmfDigits: nextBuf,
          });
          await processAtVoiceResponse(res, atSessionId, atCurrentCallbackUrl, {
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

  // Web Speech Recognition for Microphone Input
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = language === "tw" ? "ak-GH" : "en-GH";

      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        if (text) {
          sendInputTurn(text, "VOICE");
        }
      };

      rec.onend = () => {
        setIsMicActive(false);
      };

      rec.onerror = (err: any) => {
        console.warn("[PhoneSimulator] Speech recognition error:", err);
        setIsMicActive(false);
      };

      recognitionRef.current = rec;
    }
  }, [language]);

  // Stop audio and mic on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * Helper to map conversation dialogue turns or steps to authentic studio recordings
   */
  const resolveStudioPrompt = useCallback((text: string, lang: string, step?: string): string | null => {
    const isTwi = lang === "tw" || lang === "ak";
    const lower = (text || "").toLowerCase().replace(/[-_]/g, " ");
    const currentCheck = (step || "").toLowerCase();

    if (currentCheck.includes("confirm") || currentCheck.includes("safe-confirm") || lower.includes("confirm and send") || lower.includes("woremane sika") || lower.includes("500 ghana cedis") || lower.includes("500 ghana cedi")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_08.mp3" : "/audio/English/Audio_prompt_10.mp3";
    }
    if (currentCheck.includes("amount") || currentCheck.includes("enter-amount") || lower.includes("cedi amount") || lower.includes("enter amount") || lower.includes("sika dodoɔ") || lower.includes("sika dodow")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_07.mp3" : "/audio/English/Audio_prompt_09.mp3";
    }
    if (currentCheck.includes("recipient") || currentCheck.includes("phone") || currentCheck.includes("enter-recipient") || lower.includes("10-digit") || lower.includes("bɔ nɔmba") || lower.includes("number you want to send")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_05.mp3" : "/audio/English/Audio_prompt_06.mp3";
    }
    if (currentCheck.includes("verify") || lower.includes("about to send money to kwame") || lower.includes("kwame nyamebrɛ") || lower.includes("ends with 8464")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_06.mp3" : "/audio/English/Audio_prompt_08.mp3";
    }
    if (currentCheck.includes("receipt") || currentCheck.includes("outcome") || currentCheck.includes("safe-outcome") || lower.includes("congratulations") || lower.includes("akɔ yie") || lower.includes("successfully sent")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_10.mp3" : "/audio/English/Audio_prompt_12.mp3";
    }
    if (currentCheck.includes("pin") || lower.includes("secret pin") || lower.includes("momo pin") || lower.includes("nkyerɛwee")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_09.mp3" : "/audio/English/Audio_prompt_11.mp3";
    }
    if (currentCheck.includes("network") || currentCheck.includes("provider") || lower.includes("network") || lower.includes("mtn") || lower.includes("telecel") || lower.includes("airteltigo")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_02.mp3" : "/audio/English/Audio_prompt_03.mp3";
    }
    if (currentCheck.includes("service") || lower.includes("telecom") || lower.includes("banking") || lower.includes("sikakorabea")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_03.mp3" : "/audio/English/Audio_prompt_02.mp3";
    }
    if (currentCheck.includes("action") || lower.includes("momo user") || lower.includes("pay bills") || lower.includes("buy airtime") || lower.includes("cash out")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_04.mp3" : "/audio/English/Audio_prompt_05.mp3";
    }
    if (currentCheck.includes("welcome") || currentCheck.includes("language") || lower.includes("welcome") || lower.includes("akwaaba")) {
      return isTwi ? "/audio/Twi/Welcome_prompt_01.mp3" : "/audio/Welcome_prompt_01.mp3";
    }
    if (lower.includes("thank you") || lower.includes("goodbye") || lower.includes("meda wo ase")) {
      return isTwi ? "/audio/Twi/Audio_prompt_twi_11.mp3" : "/audio/English/Audio_prompt_13.mp3";
    }

    return null;
  }, []);

  /**
   * Play speech or studio prompts based on selected audio mode
   */
  const playAudioSynthesis = useCallback(async (text: string, lang: string, step?: string) => {
    if (!enableTts || !text) return;
    try {
      setIsAiSpeaking(true);
      const isTwi = lang === "tw" || lang === "ak";

      // 1. Studio Pre-Recorded Prompts Mode (Priority 1)
      const matchedPrompt = resolveStudioPrompt(text, lang, step || currentStep);
      if (voiceMode === "STUDIO_PROMPTS" || (matchedPrompt && voiceMode !== "BROWSER")) {
        const promptFile = matchedPrompt || (isTwi ? "/audio/Twi/Welcome_prompt_01.mp3" : "/audio/Welcome_prompt_01.mp3");
        if (audioRef.current) {
          audioRef.current.src = promptFile;
          setActiveAudioClip(promptFile);
          await audioRef.current.play().catch(() => {});
          return;
        }
      }

      // 2. AI Neural TTS Mode (Synthesizer Service)
      if (voiceMode === "AI_NEURAL" || voiceMode === "STUDIO_PROMPTS") {
        try {
          const synth = await api.synthesizeSpeech({
            text,
            language: isTwi ? "tw" : "en",
            style: "ghanaian-warm",
          });

          if (synth?.result?.audioBase64 && audioRef.current) {
            audioRef.current.src = `data:${synth.result.audioMimeType || "audio/mp3"};base64,${synth.result.audioBase64}`;
            await audioRef.current.play().catch(() => {});
            return;
          }
        } catch {}
      }

      // 3. Browser Speech Synthesis Fallback
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.onend = () => setIsAiSpeaking(false);
        utterance.onerror = () => setIsAiSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsAiSpeaking(false);
      }
    } catch {
      setIsAiSpeaking(false);
    }
  }, [enableTts, voiceMode, currentStep, resolveStudioPrompt]);

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

    setIsLoading(true);
    const newTurnNum = turnCount + 1;
    setTurnCount(newTurnNum);

    // Record Caller turn
    const callerTurnItem: SimulatorTranscriptItem = {
      id: `turn_c_${Date.now()}`,
      role: "caller",
      text: rawInput,
      timestamp: Date.now(),
      stage: currentStep,
    };
    setTranscript((prev) => [...prev, callerTurnItem]);

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
      const resp = await api.processSimulatorTurn({
        sessionId,
        channel,
        input: rawInput,
        language,
        currentScreen: overrideScreen || currentScreen,
        currentStep: overrideStep || currentStep,
        executionMode,
        callDurationSec,
      });

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
   * Start a phone call
   */
  const startCall = useCallback(async (initialLang: "en" | "tw" = "en") => {
    if (gatewayMode === "AFRICASTALKING_IVR") {
      await startAtCall(initialLang);
      return;
    }

    const newSession = `sim_${Date.now()}`;
    setSessionId(newSession);
    setIsActive(true);
    setLanguage(initialLang);
    setCurrentScreen("HOME");
    setCurrentStep("welcome");
    setTurnCount(0);
    setDigitsBuffer("");
    setEntities({});
    setProviderResult(null);
    setAccuracyResult(null);
    setLastTurnDiagnostic(null);

    const welcomeGreeting = initialLang === "tw"
      ? "Akwaaba! Ɔkwankyerɛfo Pa MoMo Ntentan so. Sika bɛn na wobɛpɛ sɛ womane anaa wobɛyɛ?"
      : "Welcome to Ɔkwankyerɛfo Pa Voice Mobile Money! Who would you like to send money to today?";

    const initialXml = `<Response>\n  <GetDigits timeout="2" finishOnKey="#" numDigits="10">\n    <Say voice="${initialLang === "tw" ? "woman" : "alice"}">${welcomeGreeting}</Say>\n  </GetDigits>\n</Response>`;
    setVoiceXmlTraces([
      { step: "welcome", xml: initialXml, timestamp: new Date().toLocaleTimeString() },
    ]);

    setTranscript([
      {
        id: `sys_start_${Date.now()}`,
        role: "system",
        text: `📱 Call Connected (+233 30 804 8098) · Mode: ${executionMode} · AI Engine Online`,
        timestamp: Date.now(),
      },
      {
        id: `ai_init_${Date.now()}`,
        role: "ai",
        text: welcomeGreeting,
        timestamp: Date.now(),
        stage: "welcome",
        language: initialLang,
      },
    ]);

    setAiResponse(welcomeGreeting);
    playAudioSynthesis(welcomeGreeting, initialLang, "welcome");

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
    setIsActive(false);
    setIsMicActive(false);
    setIsAiSpeaking(false);
    setAtCurrentCallbackUrl(null);
    if (audioRef.current) audioRef.current.pause();
    if (recognitionRef.current) recognitionRef.current.abort();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
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
    if (gatewayMode === "AFRICASTALKING_IVR") {
      handleAtKeypadDigit(digit);
      return;
    }

    playTone(digit);

    // If call not active, pressing 1 or 2 starts call in corresponding language
    if (!isActive) {
      if (digit === "1") startCall("en");
      else if (digit === "2") startCall("tw");
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

    // Cancellation on 0 if empty
    if (digit === "0" && !digitsBuffer) {
      sendInputTurn("0", "DTMF");
      return;
    }

    const nextBuffer = digitsBuffer + digit;
    setDigitsBuffer(nextBuffer);

    // Single digit confirmation choices (1 = Yes, 2 = No) during confirmation step
    if (currentStep === "confirm" && (digit === "1" || digit === "2")) {
      sendInputTurn(digit, "DTMF");
      setDigitsBuffer("");
      return;
    }

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
   * Toggle microphone with MediaRecorder & Speech-To-Text (linking ASR Lab)
   */
  const toggleMic = useCallback(async () => {
    if (!isActive) return;
    if (isMicActive) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsMicActive(false);
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: "audio/webm" });
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64 = (reader.result as string)?.split(",")[1];
              if (base64) {
                try {
                  const asrRes = await api.transcribeAudio(base64, "audio/webm", language);
                  if (asrRes?.result?.text) {
                    sendInputTurn(asrRes.result.text, "VOICE");
                  }
                } catch (asrErr) {
                  console.warn("[PhoneSimulator ASR Lab] Transcribe notice:", asrErr);
                }
              }
            };
            reader.readAsDataURL(blob);
            stream.getTracks().forEach((track) => track.stop());
          };

          recorder.start();
          mediaRecorderRef.current = recorder;
          setIsMicActive(true);
        } else if (recognitionRef.current) {
          recognitionRef.current.start();
          setIsMicActive(true);
        }
      } catch (err) {
        console.warn("[PhoneSimulator] Mic start error:", err);
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
            setIsMicActive(true);
          } catch {}
        }
      }
    }
  }, [isActive, isMicActive, language, sendInputTurn]);

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
  const playStudioClip = useCallback(async (target: string) => {
    if (!target) return;
    try {
      setIsAiSpeaking(true);
      const isAudioFile =
        target.endsWith(".mp3") ||
        target.endsWith(".wav") ||
        target.startsWith("/audio/") ||
        target.startsWith("audio/");

      if (isAudioFile) {
        setActiveAudioClip(target);
        const url = target.startsWith("/audio/")
          ? target
          : target.startsWith("audio/")
          ? `/${target}`
          : `/audio/${target}`;

        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.onended = () => {
            setIsAiSpeaking(false);
            setActiveAudioClip(null);
          };
          audioRef.current.onerror = () => {
            setIsAiSpeaking(false);
            setActiveAudioClip(null);
          };
          await audioRef.current.play();
        }
        return;
      }

      // If target is text (e.g. from chat replay or custom test sandbox), resolve studio prompt or synthesize
      const matched = resolveStudioPrompt(target, language);
      if (matched && audioRef.current) {
        setActiveAudioClip(matched);
        audioRef.current.src = matched;
        audioRef.current.onended = () => {
          setIsAiSpeaking(false);
          setActiveAudioClip(null);
        };
        audioRef.current.onerror = () => {
          setIsAiSpeaking(false);
          setActiveAudioClip(null);
        };
        await audioRef.current.play();
        return;
      }

      // Dynamic text: synthesize speech
      try {
        const synth = await api.synthesizeSpeech({
          text: target,
          language: language === "tw" ? "tw" : "en",
          style: "ghanaian-warm",
        });

        if (synth?.result?.audioBase64 && audioRef.current) {
          audioRef.current.src = `data:${synth.result.audioMimeType || "audio/mp3"};base64,${synth.result.audioBase64}`;
          audioRef.current.onended = () => {
            setIsAiSpeaking(false);
            setActiveAudioClip(null);
          };
          audioRef.current.onerror = () => {
            setIsAiSpeaking(false);
            setActiveAudioClip(null);
          };
          await audioRef.current.play();
          return;
        }
      } catch {}

      // Browser TTS fallback
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(target);
        utterance.rate = 0.95;
        utterance.onend = () => setIsAiSpeaking(false);
        utterance.onerror = () => setIsAiSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsAiSpeaking(false);
      }
    } catch (err) {
      console.warn("Studio clip play notice:", err);
      setIsAiSpeaking(false);
      setActiveAudioClip(null);
    }
  }, [language, resolveStudioPrompt]);

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
   * 1-Click Feature Trigger: Ingest ASR Voice Sample
   */
  const simulateAsrSample = useCallback((text: string, lang: "en" | "tw" = "en") => {
    if (!isActive) startCall(lang);
    sendInputTurn(text, "VOICE");
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
  };
}
