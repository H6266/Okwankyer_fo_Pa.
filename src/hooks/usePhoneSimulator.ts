/**
 * Ɔkwankyerɛfo Pa - Authoritative Phone Simulator Hook (usePhoneSimulator.ts)
 *
 * Implements strict presentation-layer separation:
 * - NO local AI decision making or fake data simulation.
 * - Single source of truth is the backend canonical AI engine (/api/ai/simulator/turn).
 * - Full turn lifecycle: Caller Input -> Canonical AI -> Memory/Safety/MoMo -> Dialogue -> TTS Audio.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";
import { useDtmf } from "./useDtmf";

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
  confidence: number;
  isPass: boolean;
}

export interface SimulatorSyncState {
  callLogsTotal: number;
  ledgerTotal: number;
  floatBalance: number;
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

  // Phone Navigation & Handset Screen State
  const [currentScreen, setCurrentScreen] = useState<string>("HOME");
  const [currentStep, setCurrentStep] = useState<string>("welcome");
  const [digitsBuffer, setDigitsBuffer] = useState<string>("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [enableTts, setEnableTts] = useState(true);
  const [voiceMode, setVoiceMode] = useState<"AI_NEURAL" | "STUDIO_PROMPTS" | "BROWSER">("AI_NEURAL");

  // Synchronized Ecosystem State
  const [syncState, setSyncState] = useState<SimulatorSyncState>({
    callLogsTotal: 1,
    ledgerTotal: 0,
    floatBalance: 25480.0,
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
  const [confidence, setConfidence] = useState<number>(0.0);
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
      floatBalance: typeof data.momo?.floatBalance === "number" ? data.momo.floatBalance : prev.floatBalance,
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
   * Play speech or studio prompts based on selected audio mode
   */
  const playAudioSynthesis = useCallback(async (text: string, lang: string, step?: string) => {
    if (!enableTts || !text) return;
    try {
      setIsAiSpeaking(true);
      const isTwi = lang === "tw" || lang === "ak";

      // 1. Studio Pre-Recorded Prompts Mode
      if (voiceMode === "STUDIO_PROMPTS") {
        let promptFile = isTwi ? "/audio/Twi/Welcome_prompt_01.mp3" : "/audio/English/Welcome_prompt_01.mp3";
        const currentCheck = step || currentStep;
        if (currentCheck === "confirm") {
          promptFile = isTwi ? "/audio/Twi/Audio_prompt_twi_08.mp3" : "/audio/English/Audio_prompt_08.mp3";
        } else if (currentCheck === "amount") {
          promptFile = isTwi ? "/audio/Twi/Audio_prompt_twi_07.mp3" : "/audio/English/Audio_prompt_07.mp3";
        } else if (currentCheck === "phone") {
          promptFile = isTwi ? "/audio/Twi/Audio_prompt_twi_04.mp3" : "/audio/English/Audio_prompt_04.mp3";
        } else if (currentCheck === "receipt") {
          promptFile = isTwi ? "/audio/Twi/Audio_prompt_twi_10.mp3" : "/audio/English/Audio_prompt_10.mp3";
        } else if (currentCheck === "service") {
          promptFile = isTwi ? "/audio/Twi/Audio_prompt_twi_02.mp3" : "/audio/English/Audio_prompt_02.mp3";
        }

        if (audioRef.current) {
          audioRef.current.src = promptFile;
          await audioRef.current.play().catch(() => {});
          return;
        }
      }

      // 2. AI Neural TTS Mode (Synthesizer Service)
      if (voiceMode === "AI_NEURAL") {
        const synth = await api.synthesizeSpeech({
          text,
          language: isTwi ? "tw" : "en",
          style: "ghanaian-warm",
        });

        if (synth?.result?.audioBase64 && audioRef.current) {
          audioRef.current.src = `data:${synth.result.audioMimeType || "audio/wav"};base64,${synth.result.audioBase64}`;
          await audioRef.current.play().catch(() => {});
          return;
        }
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
  }, [enableTts, voiceMode, currentStep]);

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
      const detectedConfidence = typeof res.confidence === "number" ? res.confidence : 0.85;
      const detectedLang = res.language || language;
      const newSlots = res.entities || {};
      const newNav = res.navigation || {};
      const newAction = res.action || {};
      const newSafety = res.safety || {};
      const newDialogue = res.dialogue || {};

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
      const stepName = newNav.targetStep || currentStep;
      const responseText = newDialogue.response || "Mepa wo kyɛw, tie me yie.";
      const langChoice = detectedLang === "tw" || detectedLang === "ak" ? "woman" : "alice";
      const generatedXml = `<Response>\n  <GetDigits timeout="2" finishOnKey="#" numDigits="10">\n    <Say voice="${langChoice}">${responseText}</Say>\n  </GetDigits>\n</Response>`;
      setVoiceXmlTraces((prev) => [
        {
          step: stepName,
          xml: generatedXml,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 19),
      ]);

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

      setAiResponse(responseText);

      // Record AI turn
      const aiTurnItem: SimulatorTranscriptItem = {
        id: `turn_ai_${Date.now()}`,
        role: "ai",
        text: responseText,
        timestamp: Date.now(),
        stage: newNav.targetStep || currentStep,
        intent: detectedIntent,
        confidence: detectedConfidence,
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
        confidence: 0.99,
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
  }, [executionMode, playAudioSynthesis]);

  /**
   * Hang up the call & synchronize completion to Call Logs
   */
  const endCall = useCallback(async (reason: string = "User ended call") => {
    setIsActive(false);
    setIsMicActive(false);
    setIsAiSpeaking(false);
    if (audioRef.current) audioRef.current.pause();
    if (recognitionRef.current) recognitionRef.current.abort();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      await api.endSimulatorCall({
        sessionId,
        durationSeconds: callDurationSec,
        reason,
        outcome: reason.toLowerCase().includes("cancel") ? "CANCELLED" : "COMPLETED",
      });
      refreshSyncStatus();
    } catch {}

    setTranscript((prev) => [
      ...prev,
      {
        id: `sys_end_${Date.now()}`,
        role: "system",
        text: `⏹ Call Disconnected (${reason}) · Session Logged to /dashboard/calls`,
        timestamp: Date.now(),
      },
    ]);
  }, [sessionId, callDurationSec, refreshSyncStatus]);

  /**
   * Keypad digit pressed
   */
  const handleKeypadDigit = useCallback((digit: string) => {
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
  }, [isActive, digitsBuffer, currentStep, playTone, startCall, sendInputTurn]);

  /**
   * Submit current digits buffer
   */
  const submitKeypadBuffer = useCallback(() => {
    if (digitsBuffer.trim()) {
      sendInputTurn(digitsBuffer.trim(), "DTMF");
      setDigitsBuffer("");
    }
  }, [digitsBuffer, sendInputTurn]);

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
  const playStudioClip = useCallback(async (filepath: string) => {
    try {
      setIsAiSpeaking(true);
      setActiveAudioClip(filepath);
      const url = filepath.startsWith("/audio/")
        ? filepath
        : filepath.startsWith("audio/")
        ? `/${filepath}`
        : `/audio/${filepath}`;

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
    } catch (err) {
      console.warn("Studio clip play notice:", err);
      setIsAiSpeaking(false);
      setActiveAudioClip(null);
    }
  }, []);

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
  };
}
