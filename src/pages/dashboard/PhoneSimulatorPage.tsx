import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Terminal as TerminalIcon,
  Activity,
  Send,
  Radio,
  Brain,
  Lock,
  ShieldCheck,
  ListOrdered,
  AlertCircle,
} from "lucide-react";
import { audioPlaybackController } from "../../audio/audioPlaybackController";
import { isAcousticSystemEcho } from "../../domain/echoFilter";
import {
  resolveSimulatorAudioUrl,
  resolveSimulatorPrompt,
  resolvePrompt,
} from "../../modules/ttsService";
import { api } from "../../lib/api";
import { getRecordingByUrl } from "../../audio/recordingRegistry";
import { resolvePromptText } from "../../modules/ttsService";
import { isDynamicPrompt, STATE_TO_CANONICAL_PROMPT_ID } from "../../audio/canonicalRegistry";
import { MONEY_TRANSFER_FLOW_STEPS } from "../../audio/audioFlowStore";
import { continuousAudioEngine } from "../../audio/continuousAudioEngine";
import { normalizeSpokenDigits } from "../../ai_system/speech/acousticModels/ghanaAcousticDataset";
import {
  repairGhanaianPronunciation,
  PhoneticCorrection,
} from "../../ai_system/speech/asr/ghanaianPhoneticMatcher";
import { normalizeGhanaPhoneNumber } from "../../domain/validation";
import { shouldDiscardSensitiveSpeech, isVoiceCaptureBlockedForStep } from "../../domain/pinSafety";
import { speechNormalizer } from "../../ai_system/speech/speechNormalizer";
import type { DraftState } from "../../ai_system/brain/types";

// ── Types ─────────────────────────────────────────────────────────────
interface TerminalLog {
  id: string;
  time: string;
  source: "caller" | "state" | "AI" | "reply" | "audio" | "system" | "asr";
  message: string;
}

export interface ChatTurnItem {
  id: string;
  time: string;
  sender: "system" | "caller" | "dtmf" | "ai";
  text: string;
  stepName?: string;
  promptId?: string;
  audioUrl?: string | null;
  audioSource?: "studio" | "synthesis" | "dtmf" | "matched-studio" | null;
  options?: string;
  phoneticRepairs?: PhoneticCorrection[];
  rawTranscript?: string;
  confidence?: number;
}

type AsrFeedbackReason =
  | "wrong_word"
  | "wrong_name"
  | "wrong_number"
  | "wrong_language"
  | "missed_speech"
  | "noise"
  | "code_switching"
  | "accent"
  | "other";

interface ParsedVoiceXml {
  raw: string;
  redirectUrl?: string;
  isReject: boolean;
  voiceSequence?: Array<{ type: "play" | "say"; value: string }>;
  transactionOutcome?: string;
  httpStatus?: number;
  guardReason?: string;
  playUrl?: string;
  playUrls?: string[];
  sayText?: string;
  getDigits?: {
    callbackUrl?: string;
    numDigits?: number;
    finishOnKey?: string;
    timeout?: number;
  };
  record?: {
    callbackUrl?: string;
    maxLength?: number;
    finishOnKey?: string;
    timeout?: number;
  };
}

interface BrowserSpeechRecognition {
  stop(): void;
  abort(): void;
}

const STEP_OPTIONS_MAP: Record<string, string> = {
  "voice-menu": "1=English, 2=Twi, 0=Exit",
  "language-selection": "1=English, 2=Twi, 0=Exit",
  "service-select": "1=Mobile Money, 2=Banking, 9=Repeat, 0=Exit",
  "service-choice": "1=Mobile Money, 2=Banking, 9=Repeat, 0=Exit",
  "provider-select": "1=MTN, 2=Telecel, 3=AirtelTigo, 9=Repeat, 0=Exit",
  "provider-choice": "1=MTN, 2=Telecel, 3=AirtelTigo, 9=Repeat, 0=Exit",
  "action-select": "1=Send Money, 8=Back, 9=Repeat, 0=Exit",
  "action-choice": "1=Send Money, 8=Back, 9=Repeat, 0=Exit",
  "enter-recipient": "Keypad: 10 digits + #; voice: say all 10 digits",
  "verify-recipient": "1=Confirm Recipient, 2=Re-enter Number, 0=Exit",
  "recipient-verify-choice": "1=Confirm Recipient, 2=Re-enter Number, 8=Back, 0=Exit",
  "enter-amount": "Amount in Cedis followed by # (* for pesewas)",
  "verify-amount": "Amount followed by #",
  "safe-confirmation": "1=Confirm Transfer, 2=Edit, 9=Repeat, 0=Cancel",
  "safe-outcome": "1=Confirm Transfer, 0=Cancel",
  "waiting-confirmation": "1=Check provider status, 0=End call",
  "enter-pin": "Authorize only on your Mobile Money provider's handset prompt",
  "verify-pin": "Waiting for provider authorization...",
  "transfer-success": "Transaction Completed",
  "pin-authorization": "Private provider authorization",
  "cashout-offer-balance": "Balance check unavailable; 1=Continue to Agent, 0=Cancel",
  "cashout-balance-pin": "Balance check unavailable",
  "cashout-awaiting-agent": "1=Agent is Done / Approve, 0=End Call",
  "cashout-confirm-approval": "1=Approve Withdrawal, 2=Reject, 0=Cancel",
};

const STEP_FRIENDLY_NAMES: Record<string, string> = {
  "voice-menu": "Welcome & Language Gate",
  "language-selection": "Language Selection",
  "service-select": "Service Selection (MoMo / Banking)",
  "service-choice": "Service Selection",
  "provider-select": "Network Selection (MTN)",
  "provider-choice": "Network Provider",
  "enter-pin": "Private MoMo Authorization",
  "verify-pin": "Waiting for Provider Authorization",
  "transfer-success": "Transfer Successful",
  "pin-authorization": "Private Provider Authorization",
  "action-select": "Supported Action (Send Money)",
  "action-choice": "Action Choice",
  "enter-recipient": "Recipient Phone Entry",
  "verify-recipient": "Verify Recipient Phone",
  "recipient-verify-choice": "Confirm Recipient Name",
  "enter-amount": "Amount Entry",
  "verify-amount": "Verify Amount",
  "safe-confirmation": "Safe Transfer Confirmation",
  "safe-outcome": "Zero-PIN Handoff & Authorization",
  "waiting-confirmation": "Waiting for Provider Status",
  "cashout-offer-balance": "Cash-Out Enabled; Balance Check Unavailable",
  "cashout-balance-pin": "Balance Check Unavailable",
  "cashout-awaiting-agent": "Awaiting Agent POS Submission",
  "cashout-confirm-approval": "Agent Withdrawal Approval",
};

const KEYPAD_BUTTONS = [
  { digit: "1", sub: "" },
  { digit: "2", sub: "ABC" },
  { digit: "3", sub: "DEF" },
  { digit: "4", sub: "GHI" },
  { digit: "5", sub: "JKL" },
  { digit: "6", sub: "MNO" },
  { digit: "7", sub: "PQRS" },
  { digit: "8", sub: "TUV" },
  { digit: "9", sub: "WXYZ" },
  { digit: "*", sub: "pesewa" },
  { digit: "0", sub: "+" },
  { digit: "#", sub: "send" },
];

function resolvePlayableSimulatorAudioUrl(
  audioUrl: string | null | undefined,
  language: "en" | "twi"
): string | null {
  if (!audioUrl) return null;
  const suppliedUrl = resolveSimulatorAudioUrl(audioUrl, language);
  if (!suppliedUrl) return null;
  return suppliedUrl;
}

export const PhoneSimulatorPage: React.FC = () => {
  // ── Call Session State ────────────────────────────────────────────────
  const [callActive, setCallActive] = useState<boolean>(false);
  const [callStatus, setCallStatus] = useState<string>("Idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [callerNumber] = useState<string>("0244123456");
  const [interactionMode, setInteractionMode] = useState<string>("UNSELECTED");
  const [conversationState, setConversationState] = useState<string>("INITIATED");
  const [language, setLanguage] = useState<"en" | "twi" | null>("twi");
  const voiceModeRef = useRef<"twi" | "en" | "auto">("twi");
  const [currentPrompt, setCurrentPrompt] = useState<string>("Lift handset or press Call to begin.");
  const [activePlayUrl, setActivePlayUrl] = useState<string | null>(null);
  const [digitsBuffer, setDigitsBuffer] = useState<string>("");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [micUnavailable, setMicUnavailable] = useState<boolean>(false);
  const [clock, setClock] = useState<string>("10:00");
  const [zeroPinOverlay, setZeroPinOverlay] = useState<boolean>(false);
  const [isAudioSpeaking, setIsAudioSpeaking] = useState<boolean>(false);
  const [isAiReasoning, setIsAiReasoning] = useState<boolean>(false);
  const [reasoningSec, setReasoningSec] = useState<number>(0);
  const [volumeMultiplier, setVolumeMultiplier] = useState<number>(audioPlaybackController.getVolumeMultiplier());

  // ── Cash-Out & Voice Withdrawal State ────────────────────────────────
  const [cashOutActive, setCashOutActive] = useState<boolean>(false);
  const [walletBalance, setWalletBalance] = useState<number>(30.0);
  const requestedWithdrawalAmountRef = useRef<number>(30);

  // ── XML & Telephony Routing State ────────────────────────────────────
  const [activeCallbackUrl, setActiveCallbackUrl] = useState<string | null>(null);
  const [activeNumDigits, setActiveNumDigits] = useState<number>(1);
  const [activeFinishOnKey, setActiveFinishOnKey] = useState<string>("#");
  const [activeStepName, setActiveStepName] = useState<string>("idle");
  const [rawVoiceXml, setRawVoiceXml] = useState<string>("");

  // ── Terminal & Chat Timeline State ───────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "terminal" | "asr_diag" | "checklist">("chat");
  const [checklistData, setChecklistData] = useState<any>(null);
  const [isSyncingChecklist, setIsSyncingChecklist] = useState<boolean>(false);

  const syncChecklist = useCallback(async (sid?: string) => {
    const targetId = sid || sessionIdRef.current || sessionId;
    if (!targetId) return;
    setIsSyncingChecklist(true);
    try {
      const data = await api.getChecklistStatus(targetId);
      if (data?.checklist) {
        setChecklistData(data.checklist);
      }
    } catch {
      // Session may not yet be initialized
    } finally {
      setIsSyncingChecklist(false);
    }
  }, [sessionId]);

  const [activeKeypadPulse, setActiveKeypadPulse] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurnItem[]>([
    {
      id: "init_prompt",
      time: new Date().toTimeString().slice(0, 5),
      sender: "system",
      text: "Ɔkwankyerɛfo Pa Voice MoMo telephony ready. Press Call or dial 1 / 2 to start.",
      stepName: "voice-menu",
      audioSource: "studio",
      options: "1=English, 2=Twi, 0=Exit",
    },
  ]);
  const [correctionDraft, setCorrectionDraft] = useState<{
    turn: ChatTurnItem;
    correctedTranscript: string;
    reason: AsrFeedbackReason;
    consent: boolean;
    error: string;
    submitting: boolean;
  } | null>(null);
  const [correctionNotice, setCorrectionNotice] = useState<string>("");
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([
    {
      id: "init",
      time: new Date().toTimeString().slice(0, 8),
      source: "system",
      message: "Ɔkwankyerɛfo Pa phone simulator initialized. Audio engine & ASR active.",
    },
  ]);

  // ── Real-Time ASR & Streaming Words State ────────────────────────────
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [customSpeechText, setCustomSpeechText] = useState<string>("");
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState<boolean>(false);
  const [recentStreamingWords, setRecentStreamingWords] = useState<
    Array<{ word: string; repaired?: string; isPhoneticMatch?: boolean; timestamp: number }>
  >([]);

  // ── Diagnostics & Dev View ───────────────────────────────────────────
  const [showDevView, setShowDevView] = useState<boolean>(false);
  const [testAudioStatus, setTestAudioStatus] = useState<string>("");

  // Refs
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const lastUtteranceTimeRef = useRef<number>(0);
  const lastUtteranceTextRef = useRef<string>("");

  // Synchronous session state refs
  const callActiveRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>("");
  const activeCallbackUrlRef = useRef<string | null>(null);
  const activeStepNameRef = useRef<string>("idle");
  const languageRef = useRef<"en" | "twi" | null>(null);
  const currentPromptRef = useRef<string>("");
  const isMicMutedRef = useRef<boolean>(false);
  const isSystemProcessingRef = useRef<boolean>(false);
  const isAudioSequenceActiveRef = useRef<boolean>(false);
  const zeroPinOverlayRef = useRef<boolean>(false);
  const brainDraftRef = useRef<DraftState>({ slots: {} });
  const startPinAuthorizationFlowRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const digitsBufferRef = useRef<string>("");

  useEffect(() => { callActiveRef.current = callActive; }, [callActive]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeCallbackUrlRef.current = activeCallbackUrl; }, [activeCallbackUrl]);
  useEffect(() => { activeStepNameRef.current = activeStepName; }, [activeStepName]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { currentPromptRef.current = currentPrompt; }, [currentPrompt]);
  useEffect(() => { isMicMutedRef.current = isMicMuted; }, [isMicMuted]);
  useEffect(() => { zeroPinOverlayRef.current = zeroPinOverlay; }, [zeroPinOverlay]);
  useEffect(() => { digitsBufferRef.current = digitsBuffer; }, [digitsBuffer]);

  // Prepare audio on any initial user touch or interaction so audio plays automatically
  useEffect(() => {
    const handleInitialUserGesture = () => {
      audioPlaybackController.enableAudio();
    };
    window.addEventListener("pointerdown", handleInitialUserGesture, { passive: true });
    window.addEventListener("click", handleInitialUserGesture, { passive: true });
    window.addEventListener("keydown", handleInitialUserGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleInitialUserGesture);
      window.removeEventListener("click", handleInitialUserGesture);
      window.removeEventListener("keydown", handleInitialUserGesture);
    };
  }, []);

  useEffect(() => {
    audioPlaybackController.setVolumeMultiplier(volumeMultiplier);
  }, [volumeMultiplier]);

  // Helper to resolve callback URL if none set
  const getFallbackCallbackUrl = useCallback((stepName: string, sessId: string): string => {
    if (stepName === "voice-menu" || stepName === "language-selection") {
      return `/api/simulator/language-selection?sessionId=${sessId}`;
    }
    if (stepName === "service-select" || stepName === "service-choice") {
      return `/api/simulator/service-choice?sessionId=${sessId}`;
    }
    if (stepName === "provider-select" || stepName === "provider-choice") {
      return `/api/simulator/provider-choice?sessionId=${sessId}`;
    }
    if (stepName === "action-select" || stepName === "action-choice") {
      return `/api/simulator/action-choice?sessionId=${sessId}`;
    }
    if (stepName.includes("recipient")) {
      return `/api/simulator/verify-recipient?sessionId=${sessId}`;
    }
    if (stepName.includes("amount")) {
      return `/api/simulator/verify-amount?sessionId=${sessId}`;
    }
    if (stepName.includes("confirm")) {
      return `/api/simulator/safe-confirmation?sessionId=${sessId}`;
    }
    if (stepName.includes("pin")) {
      return `/api/simulator/verify-pin?sessionId=${sessId}&accessiblePin=1`;
    }
    return `/api/simulator/voice-menu?sessionId=${sessId}`;
  }, []);

  // ── Logging Helpers ──────────────────────────────────────────────────
  const addLog = useCallback((source: TerminalLog["source"], message: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setTerminalLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        time,
        source,
        message,
      },
    ]);
  }, []);

  const handleSetVolume = useCallback((mult: number) => {
    setVolumeMultiplier(mult);
    audioPlaybackController.setVolumeMultiplier(mult);
    addLog("audio", `🔊 Master voice volume set to ${mult.toFixed(1)}x (+${((mult - 1) * 5.4).toFixed(1)} dB boost)`);
  }, [addLog]);

  const addChatTurn = useCallback((turn: Omit<ChatTurnItem, "id" | "time">) => {
    const time = new Date().toTimeString().slice(0, 5);
    setChatTurns((prev) => [
      ...prev,
      {
        id: `turn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        time,
        ...turn,
      },
    ]);
  }, []);

  // ── 90-Second Caller Silence Watchdog (OP67) ──────────────────────────
  const silenceWatchdogTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearSilenceWatchdog = useCallback(() => {
    if (silenceWatchdogTimerRef.current) {
      clearTimeout(silenceWatchdogTimerRef.current);
      silenceWatchdogTimerRef.current = null;
    }
  }, []);

  const triggerSilenceTimeout = useCallback(async () => {
    if (!callActiveRef.current) return;
    const curLang = languageRef.current || "twi";
    const isTwi = curLang === "twi";
    const op67Text = resolvePromptText("OP67", curLang)
      || (isTwi
        ? "Mante deɛ wofiri wo hɔ bae, yɛsrɛ wo ma yɛn mmuaeɛ!"
        : "I did not get any response from you, please give us a response!");
    const op67AudioUrl = resolvePrompt("OP67", curLang);
    addLog("system", "⏱️ [90s Silence Watchdog] No caller response; triggering OP67 and retaining the current step.");
    addChatTurn({
      sender: "system",
      text: `⏱️ OP67: "${op67Text}"`,
      promptId: "OP67",
      audioSource: op67AudioUrl ? "studio" : "synthesis",
    });

    await audioPlaybackController.speakText(op67Text, { language: curLang, promptId: "OP67" });
  }, [addLog, addChatTurn]);

  const armSilenceWatchdog = useCallback(() => {
    clearSilenceWatchdog();
    if (!callActiveRef.current) return;
    // Wait 90 seconds before reminding the caller, then keep the same step active.
    silenceWatchdogTimerRef.current = setTimeout(() => {
      triggerSilenceTimeout();
    }, 90000);
  }, [clearSilenceWatchdog, triggerSilenceTimeout]);

  // ── Clock & Auto-Login ───────────────────────────────────────────────
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Seamless auto-auth for preview environment (ensures no lockouts)
  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const session = await api.getAdminSession();
        if (cancelled) return;
        if (!session?.authenticated && session?.hint) {
          try {
            await api.adminLogin(session.hint);
          } catch (error) {
            console.warn("[PhoneSimulator] Admin login fallback failed.", error);
          }
        }
      } catch (error) {
        console.warn("[PhoneSimulator] Admin session check failed.", error);
      }
    };
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Call duration counter
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (callActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callActive]);

  // Auto-scroll chat & terminal
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns, terminalLogs, interimTranscript]);

  // Audio controller subscription: update UI indicators for playback state and arm silence watchdog
  useEffect(() => {
    const unsubscribe = audioPlaybackController.subscribe((state) => {
      const isSpeakingNow = state.isPlaying || isAudioSequenceActiveRef.current;
      setIsAudioSpeaking(isSpeakingNow);
      if (!callActiveRef.current) {
        clearSilenceWatchdog();
        return;
      }
      if (isSpeakingNow || isSystemProcessingRef.current) {
        clearSilenceWatchdog();
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        if (isSystemProcessingRef.current) {
          setCallStatus("Processing");
        } else {
          setCallStatus("Speaking");
        }
      } else {
        if (
          !isAudioSequenceActiveRef.current &&
          !isSystemProcessingRef.current &&
          !zeroPinOverlayRef.current &&
          !isVoiceCaptureBlockedForStep(activeStepNameRef.current)
        ) {
          setIsMicMuted(false);
          isMicMutedRef.current = false;
          setCallStatus("Listening");
          armSilenceWatchdog();
        }
      }
    });
    return () => {
      clearSilenceWatchdog();
      unsubscribe();
    };
  }, [armSilenceWatchdog, clearSilenceWatchdog]);

  // Format MM:SS timer
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── VoiceXML Parser ──────────────────────────────────────────────────
  const parseVoiceXml = (xml: string): ParsedVoiceXml => {
    const result: ParsedVoiceXml = {
      raw: xml,
      isReject: xml.includes("<Reject/>") || xml.includes("<Reject />"),
    };

    const redirMatch = xml.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/i);
    if (redirMatch) {
      result.redirectUrl = redirMatch[1].trim().replace(/&amp;/g, "&");
    }

    const digitsMatch = xml.match(/<GetDigits\s+([^>]+)>/i);
    if (digitsMatch) {
      const attrs = digitsMatch[1];

         const timeout = attrs.match(/timeout=["'](\d+)["']/i);
         const finishOnKey = attrs.match(/finishOnKey=["']([^"']+)["']/i);
         const numDigits = attrs.match(/numDigits=["'](\d+)["']/i);
         const callbackUrl = attrs.match(/callbackUrl=["']([^"']+)["']/i);
      result.getDigits = {
        timeout: timeout ? parseInt(timeout[1], 10) : undefined,
        finishOnKey: finishOnKey ? finishOnKey[1] : undefined,
        numDigits: numDigits ? parseInt(numDigits[1], 10) : undefined,
        callbackUrl: callbackUrl ? callbackUrl[1].replace(/&amp;/g, "&") : undefined,
      };
    }

    const playUrls: string[] = [];
    const urlMatches = xml.matchAll(/<Play[^>]*url=["']([^"']+)["']/gi);
    for (const m of urlMatches) {
      if (m[1]?.trim()) playUrls.push(m[1].trim());
    }
    const innerMatches = xml.matchAll(/<Play[^>]*>([^<]+)<\/Play>/gi);
    for (const m of innerMatches) {
      const val = m[1]?.trim();
      if (val && !playUrls.includes(val)) playUrls.push(val);
    }
    if (playUrls.length > 0) {
      result.playUrls = playUrls;
      result.playUrl = playUrls[0];
    }

    const voiceSequence: Array<{ type: "play" | "say"; value: string }> = [];
    const voiceTags = xml.matchAll(/<(Play|Say)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi);
    for (const match of voiceTags) {
      const type = match[1].toLowerCase() as "play" | "say";
      const attributes = match[2] || "";
      const body = (match[3] || "").trim();
      const url = attributes.match(/url=["']([^"']+)["']/i)?.[1];
      const value = type === "play" ? (url || body) : body;
      if (value) voiceSequence.push({ type, value });
    }
    if (voiceSequence.length > 0) result.voiceSequence = voiceSequence;

    const sayMatch = xml.match(/<Say[^>]*>([\s\S]*?)<\/Say>/i);
    if (sayMatch) {
      result.sayText = sayMatch[1].trim();
    }

    return result;
  };

  // ── Execute VoiceXML Response ─────────────────────────────────────────
  const executeVoiceXml = useCallback(
    async (
      xmlText: string,
      effectiveUrl: string,
      meta?: { httpStatus?: number; guardReason?: string; transactionOutcome?: string }
    ) => {
      const parsed = parseVoiceXml(xmlText);
      if (meta?.httpStatus) parsed.httpStatus = meta.httpStatus;
      if (meta?.guardReason) parsed.guardReason = meta.guardReason;
      parsed.transactionOutcome = meta?.transactionOutcome;
      const wasWaitingForProvider = activeStepNameRef.current === "waiting-confirmation";
      if (
        wasWaitingForProvider &&
        parsed.transactionOutcome !== "PENDING" &&
        parsed.transactionOutcome !== "RECONCILIATION_REQUIRED"
      ) {
        continuousAudioEngine.setZeroPinMuted(false);
      }
      const requestedPlayUrl = parsed.playUrl;

      // Extract step name from URL
      let stepName = "voice-menu";
      let responseLanguage: "en" | "twi" = languageRef.current || language || "twi";
      try {
        const u = new URL(effectiveUrl, window.location.origin);
        stepName = u.pathname.replace(/^\//, "").replace(/^api\/simulator\//, "") || "voice-menu";
        const langParam = u.searchParams.get("lang");
        if (langParam === "twi") {
          responseLanguage = "twi";
          setLanguage("twi");
          languageRef.current = "twi";
        } else if (langParam === "en") {
          responseLanguage = "en";
          setLanguage("en");
          languageRef.current = "en";
        }
      } catch {
        const match = effectiveUrl.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/);
        if (match) stepName = match[1];
      }
      const playbackUrl = resolvePlayableSimulatorAudioUrl(requestedPlayUrl, responseLanguage);
      setRawVoiceXml(
        xmlText.replace(
          /<Play\b[^>]*(?:\/>|>[\s\S]*?<\/Play>)/gi,
          playbackUrl ? `<Play url="${playbackUrl}"/>` : ""
        )
      );
      activeStepNameRef.current = stepName;
      setActiveStepName(stepName);
      continuousAudioEngine.setContext(stepName, responseLanguage);
      const dynamicPromptMatch = requestedPlayUrl?.match(/\/prompt-tts\/(?:en|twi)\/(OP\d{2}B?)(?:[/?]|$)/i);
      const dynamicPromptId = dynamicPromptMatch?.[1].toUpperCase();
      const requiresSuccessfulReadback = Boolean(parsed.sayText?.trim()) && (
        /recipient|amount|confirm|transaction-review|review-transaction/i.test(stepName)
        || ["OP20", "OP21", "OP29", "OP35"].includes(dynamicPromptId || "")
      );
      const blockFailedReadback = () => {
        activeCallbackUrlRef.current = null;
        setActiveCallbackUrl(null);
        setDigitsBuffer("");
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        setCallStatus("Readback unavailable — transaction paused");
        const recoveryText = "Audio unavailable. Confirmation is disabled. Please try again later.";
        setCurrentPrompt(recoveryText);
        currentPromptRef.current = recoveryText;
        addLog("state", "Required transaction readback failed; confirmation is disabled and no transaction was submitted.");
        addChatTurn({ sender: "system", text: recoveryText, stepName: "readback-unavailable" });
      };

      // Follow <Redirect> after auto-playing any associated audio prompt
      if (parsed.redirectUrl) {
        if (parsed.sayText?.trim()) {
          setCurrentPrompt(parsed.sayText);
          currentPromptRef.current = parsed.sayText;
          addChatTurn({
            sender: "system",
            text: parsed.sayText,
            stepName,
            audioUrl: playbackUrl || undefined,
            audioSource: playbackUrl ? "studio" : "synthesis",
          });
        }
        if (playbackUrl) {
          addLog("audio", `🔊 Auto-playing feed prompt: ${playbackUrl}`);
          try {
            await audioPlaybackController.play(playbackUrl, parsed.sayText || undefined);
          } catch (err) {
            console.warn("[PhoneSimulator] Redirect audio play notice:", err);
          }
        } else if (parsed.sayText?.trim()) {
          try {
            await audioPlaybackController.speakText(parsed.sayText, { language: responseLanguage });
          } catch (err) {
            console.warn("[PhoneSimulator] Redirect message speech notice:", err);
          }
        }
        addLog("state", `Redirecting to ${parsed.redirectUrl}`);
        return dispatchVoiceWebhook(parsed.redirectUrl);
      }

      if (parsed.transactionOutcome === "PENDING" || parsed.transactionOutcome === "RECONCILIATION_REQUIRED") {
        continuousAudioEngine.stop();
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (error) {
            console.warn("[PhoneSimulator] Recognition stop during provider handoff failed.", error);
          }
        }

        activeStepNameRef.current = "waiting-confirmation";
        activeCallbackUrlRef.current = parsed.getDigits?.callbackUrl || null;
        setActiveStepName("waiting-confirmation");
        setActiveCallbackUrl(parsed.getDigits?.callbackUrl || null);
        setActiveNumDigits(parsed.getDigits?.numDigits || 1);
        setActiveFinishOnKey(parsed.getDigits?.finishOnKey || "#");
        setDigitsBuffer("");
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        continuousAudioEngine.setZeroPinMuted(true);
        continuousAudioEngine.pauseForPlayback();
        setCallStatus("Awaiting provider authorization");

        const pendingText = responseLanguage === "twi"
          ? "Yɛde wo adesrɛ no akɔma provider no. Pene so wɔ wo fon so. Mfa wo PIN nka wɔ telefon frɛ yi mu."
          : "Your request is with the provider. Approve it on your handset. Never say your PIN on this call.";
        setCurrentPrompt(pendingText);
        currentPromptRef.current = pendingText;
        addLog("state", `Provider transaction status: ${parsed.transactionOutcome}. PIN remains private on the handset.`);
        addChatTurn({ sender: "ai", text: pendingText, audioSource: "studio", stepName: "pin-handoff" });

        isAudioSequenceActiveRef.current = true;
        setIsAudioSpeaking(true);
        try {
          for (const item of parsed.voiceSequence || []) {
            if (item.type === "play") {
              const audioUrl = resolvePlayableSimulatorAudioUrl(item.value, responseLanguage);
              if (audioUrl) await audioPlaybackController.play(audioUrl);
            } else if (item.value) {
              await audioPlaybackController.speakText(item.value, {
                skipStudioMatch: true,
                language: responseLanguage,
              });
            }
          }
        } catch (error) {
          console.warn("[PhoneSimulator] Provider handoff audio sequence failed.", error);
          addLog("audio", "Provider handoff audio could not be fully played; PIN collection remains blocked.");
        } finally {
          isAudioSequenceActiveRef.current = false;
          setIsAudioSpeaking(false);
          setIsMicMuted(true);
          isMicMutedRef.current = true;
          continuousAudioEngine.setZeroPinMuted(true);
        }
        return;
      }

      // Handle <Reject/>
      if (parsed.isReject) {
        continuousAudioEngine.stop();
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (error) {
            console.warn("[PhoneSimulator] Recognition stop during reject path failed.", error);
          }
        }

        const isPinHandoff =
          (parsed.sayText && parsed.sayText.toLowerCase().includes("momo pin") && !effectiveUrl.includes("verify-pin")) ||
          (parsed.sayText && parsed.sayText.toLowerCase().includes("phone screen"));

        if (isPinHandoff) {
          if (startPinAuthorizationFlowRef.current) {
            startPinAuthorizationFlowRef.current();
            return;
          }
        }

        // Check if this is a completed transaction / success receipt
        const isSuccessOutcome = parsed.transactionOutcome === "SUCCESSFUL" || stepName === "transfer-success";

        if (isSuccessOutcome) {
          const successMsg = parsed.sayText || (responseLanguage === "twi" ? "Wo MoMo transfer no akɔ pɛpɛɛpɛ!" : "Transfer completed successfully!");
          setCallStatus("Completed");
          setCurrentPrompt(successMsg);
          currentPromptRef.current = successMsg;
          setDigitsBuffer("");
          activeStepNameRef.current = "transfer-success";
          setActiveStepName("transfer-success");

          addLog("reply", "Transfer outcome announced (SUCCESSFUL).");
          addChatTurn({
            sender: "ai",
            text: successMsg,
            audioSource: playbackUrl ? "studio" : "synthesis",
            stepName: "transfer-success",
          });

          setActiveCallbackUrl(null);
          activeCallbackUrlRef.current = null;

          // Play authentic studio success audio chime, then speak receipt
          if (playbackUrl) {
            try {
              await audioPlaybackController.play(playbackUrl, successMsg);
            } catch {
              await audioPlaybackController.speakText(successMsg);
            }
          } else if (parsed.sayText) {
            await audioPlaybackController.speakText(parsed.sayText);
          }
          return;
        }

        audioPlaybackController.stop();
        setCallStatus("Ended");
        const endText = "Call ended. Lift handset or press Call to begin.";
        setCurrentPrompt(endText);
        currentPromptRef.current = endText;
        addLog("state", "Call terminated (<Reject/>).");
        addChatTurn({
          sender: "system",
          text: parsed.sayText || "Call ended. Thank you for using Ɔkwankyerɛfo Pa.",
          stepName: "call-end",
        });

        setCallActive(false);
        callActiveRef.current = false;
        setActiveCallbackUrl(null);
        activeCallbackUrlRef.current = null;
        return;
      }

      // Configure GetDigits expectations
      if (parsed.getDigits) {
        if (parsed.getDigits.callbackUrl) {
          const callbackUrl = parsed.getDigits.callbackUrl;
          if (requiresSuccessfulReadback) {
            activeCallbackUrlRef.current = null;
            setActiveCallbackUrl(null);
          } else {
            activeCallbackUrlRef.current = callbackUrl;
            setActiveCallbackUrl(callbackUrl);
          }
          if (parsed.getDigits.callbackUrl.includes("verify-pin") || stepName === "enter-pin") {
            setDigitsBuffer("");
          }
        }
        setActiveNumDigits(parsed.getDigits.numDigits || 1);
        setActiveFinishOnKey(parsed.getDigits.finishOnKey || "#");
      }

      // Determine display prompt text
      let promptText: string;
      let resolvedPromptId: string | null;
      if (requestedPlayUrl) {
        const pathname = new URL(requestedPlayUrl, window.location.origin).pathname;
        const recording = getRecordingByUrl(pathname);
        const ttsPromptKey = pathname.match(/^\/(?:api\/)?audio\/prompt-tts\/(?:en|twi)\/([^/?]+)/)?.[1];
        const promptKey = ttsPromptKey ? decodeURIComponent(ttsPromptKey) : null;
        resolvedPromptId = (promptKey && /^OP\d{2}$/i.test(promptKey))
          ? promptKey.toUpperCase()
          : recording?.promptId || STATE_TO_CANONICAL_PROMPT_ID[stepName.toUpperCase()] || null;
      } else {
        resolvedPromptId = STATE_TO_CANONICAL_PROMPT_ID[stepName.toUpperCase()] || null;
      }

      if (parsed.voiceSequence && parsed.voiceSequence.length > 1) {
        promptText = parsed.voiceSequence.map((item) => {
          if (item.type === "say") return item.value;
          const pathname = new URL(item.value, window.location.origin).pathname;
          return getRecordingByUrl(pathname)?.spokenText || "";
        }).filter(Boolean).join(" ");
      } else if (parsed.sayText) {
        if (requestedPlayUrl) {
          const pathname = new URL(requestedPlayUrl, window.location.origin).pathname;
          const recording = getRecordingByUrl(pathname);
          promptText = recording?.spokenText
            ? `${recording.spokenText} ${parsed.sayText}`
            : parsed.sayText;
        } else {
          promptText = parsed.sayText;
        }
      } else if (parsed.playUrls && parsed.playUrls.length > 1) {
        const texts = parsed.playUrls.map((u) => {
          const pathname = new URL(u, window.location.origin).pathname;
          return getRecordingByUrl(pathname)?.spokenText;
        }).filter(Boolean);
        promptText = texts.length > 0
          ? texts.join(" ")
          : (responseLanguage === "twi" ? "Akwaaba. Yɛsrɛ wo paw dwumadie a wopɛ." : "Welcome. Please select a service.");
      } else if (requestedPlayUrl) {
        const pathname = new URL(requestedPlayUrl, window.location.origin).pathname;
        const recording = getRecordingByUrl(pathname);
        const ttsPromptKey = pathname.match(/^\/(?:api\/)?audio\/prompt-tts\/(?:en|twi)\/([^/?]+)/)?.[1];
        const promptKey = ttsPromptKey ? decodeURIComponent(ttsPromptKey) : null;
        promptText = recording?.spokenText ||
          (promptKey ? resolvePromptText(promptKey, responseLanguage) : null) ||
          (responseLanguage === "twi" ? "Yɛsrɛ wo tie." : "Please listen to the prompt.");
      } else {
        // Fallback friendly script
        promptText = responseLanguage === "twi" ? "Yɛsrɛ wo paw deɛ wopɛ wɔ menyu no so." : "Please select an option from the menu.";
      }

      let matchSource: "studio" | "synthesis" | "matched-studio" = playbackUrl ? "studio" : "synthesis";
      if (resolvedPromptId && isDynamicPrompt(resolvedPromptId)) {
        matchSource = "synthesis";
      }

      setCurrentPrompt(promptText);
      currentPromptRef.current = promptText;
      setActivePlayUrl(playbackUrl);

      // Log reply text and options
      addLog("reply", `Prompt ready for step ${stepName} (${responseLanguage}).`);
      const choices = STEP_OPTIONS_MAP[stepName] || "Keypad or Speech";
      addLog("state", `step=${stepName}, prompt=${resolvedPromptId || "OP"}, options: [${choices}]`);

      // Add to interactive Chat timeline
      addChatTurn({
        sender: "system",
        text: promptText,
        stepName,
        promptId: resolvedPromptId || undefined,
        audioUrl: playbackUrl,
        audioSource: matchSource,
        options: choices,
      });

      // Play audio automatically
      audioPlaybackController.unlockAudio();
      const resolvedSequence = (parsed.playUrls && parsed.playUrls.length > 1)
        ? (parsed.playUrls.map(u => resolvePlayableSimulatorAudioUrl(u, responseLanguage)).filter(Boolean) as string[])
        : [];

      const hasDynamicSay = Boolean(parsed.sayText && parsed.sayText.trim());

      // Mark audio sequence active, mute microphone immediately
      isAudioSequenceActiveRef.current = true;
      setIsAudioSpeaking(true);
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      continuousAudioEngine.pauseForPlayback();
      setCallStatus("Speaking");
      clearSilenceWatchdog();

      try {
        if (parsed.voiceSequence && parsed.voiceSequence.length > 1) {
          let allReadbackAudioPlayed = true;
          addLog("audio", "🔊 Auto-playing ordered VoiceXML audio and speech sequence.");
          for (const item of parsed.voiceSequence) {
            try {
              if (item.type === "play") {
                const audioUrl = resolvePlayableSimulatorAudioUrl(item.value, responseLanguage);
                if (!audioUrl) {
                  allReadbackAudioPlayed = false;
                  continue;
                }
                await audioPlaybackController.play(audioUrl);
              } else {
                const played = await audioPlaybackController.speakText(item.value, {
                  skipStudioMatch: true,
                  language: responseLanguage,
                });
                if (!played) allReadbackAudioPlayed = false;
              }
            } catch (err) {
              allReadbackAudioPlayed = false;
              console.warn("[PhoneSimulator] Ordered VoiceXML playback notice:", err);
            }
          }
          if (requiresSuccessfulReadback && !allReadbackAudioPlayed) {
            blockFailedReadback();
            return;
          }
          if (requiresSuccessfulReadback && parsed.getDigits?.callbackUrl) {
            activeCallbackUrlRef.current = parsed.getDigits.callbackUrl;
            setActiveCallbackUrl(parsed.getDigits.callbackUrl);
          }
        } else if (hasDynamicSay && (stepName === "verify-recipient" || stepName.includes("recipient") || stepName.includes("confirm") || resolvedSequence.length > 0)) {
          // Step with dynamic readback (KYC name, phone number, amount):
          // 1. Play introductory fixed clip if present (e.g. "Use recipient 1.m4a" -> "Yoo, yɛde saa recipient yi bedi dwuma")
          // 2. Synthesize & speak dynamic KYC/amount readback (<Say>)
          if (resolvedSequence.length > 0) {
            addLog("audio", `🔊 Auto-playing intro clip: ${resolvedSequence[0]}`);
            try {
              await audioPlaybackController.play(resolvedSequence[0]);
            } catch (err) {
              console.warn("[PhoneSimulator] Intro clip playback notice:", err);
            }
          } else if (playbackUrl) {
            addLog("audio", `🔊 Auto-playing intro clip: ${playbackUrl}`);
            try {
              await audioPlaybackController.play(playbackUrl);
            } catch (err) {
              console.warn("[PhoneSimulator] Intro clip playback notice:", err);
            }
          }
          if (parsed.sayText) {
            addLog("audio", "Synthesizing required dynamic readback.");
            const played = await audioPlaybackController.speakText(parsed.sayText, { skipStudioMatch: true, language: responseLanguage });
            if (requiresSuccessfulReadback && !played) {
              blockFailedReadback();
              return;
            }
            if (requiresSuccessfulReadback && parsed.getDigits?.callbackUrl) {
              activeCallbackUrlRef.current = parsed.getDigits.callbackUrl;
              setActiveCallbackUrl(parsed.getDigits.callbackUrl);
            }
          }
        } else if (resolvedSequence.length > 1) {
          addLog("audio", `🔊 Auto-playing sequence: ${resolvedSequence.join(" -> ")}`);
          try {
            await audioPlaybackController.playSequence(resolvedSequence, promptText);
            if (parsed.sayText && !parsed.redirectUrl) {
              await audioPlaybackController.speakText(parsed.sayText, { language: responseLanguage });
            }
          } catch (err) {
            console.warn("[PhoneSimulator] Sequence auto-play notice:", err);
            setCallStatus("Audio unavailable");
          }
        } else if (playbackUrl) {
          addLog("audio", `🔊 Auto-playing prompt: ${playbackUrl}`);
          try {
            await audioPlaybackController.play(playbackUrl, promptText);
            if (parsed.sayText && !parsed.redirectUrl) {
              // Intro audio finished; synthesize dynamic KYC readback text
              await audioPlaybackController.speakText(parsed.sayText, { language: responseLanguage });
            }
          } catch (err) {
            console.warn("[PhoneSimulator] Auto-play prompt notice:", err);
            if (parsed.sayText) {
              try {
                const played = await audioPlaybackController.speakText(parsed.sayText, { language: responseLanguage });
                if (requiresSuccessfulReadback && !played) blockFailedReadback();
                if (requiresSuccessfulReadback && played && parsed.getDigits?.callbackUrl) {
                  activeCallbackUrlRef.current = parsed.getDigits.callbackUrl;
                  setActiveCallbackUrl(parsed.getDigits.callbackUrl);
                }
              } catch {
                if (requiresSuccessfulReadback) blockFailedReadback();
              }
            } else {
              setCallStatus("Audio unavailable");
            }
          }
        } else if (parsed.sayText) {
          addLog("audio", "Synthesizing dynamic prompt.");
          try {
            const played = await audioPlaybackController.speakText(parsed.sayText, { language: responseLanguage });
            if (requiresSuccessfulReadback && !played) blockFailedReadback();
            if (requiresSuccessfulReadback && played && parsed.getDigits?.callbackUrl) {
              activeCallbackUrlRef.current = parsed.getDigits.callbackUrl;
              setActiveCallbackUrl(parsed.getDigits.callbackUrl);
            }
          } catch (err) {
            console.warn("[PhoneSimulator] Dynamic speakText notice:", err);
            if (requiresSuccessfulReadback) blockFailedReadback();
          }
        } else if (hasDynamicSay) {
          addLog("audio", "Synthesizing dynamic prompt.");
          try {
            const played = await audioPlaybackController.speakText(parsed.sayText!, { skipStudioMatch: true, language: responseLanguage });
            if (requiresSuccessfulReadback && !played) blockFailedReadback();
          } catch {
            if (requiresSuccessfulReadback) blockFailedReadback();
          }
        } else {
          addLog("audio", "No approved audio is available for this prompt.");
        }
      } finally {
        isAudioSequenceActiveRef.current = false;
        // Strict 400ms acoustic tail buffer before turning microphone on:
        // ensures room echo from computer speakers is completely gone before listening
        setTimeout(() => {
          if (
            callActiveRef.current &&
            !isSystemProcessingRef.current &&
            !isAudioSequenceActiveRef.current &&
            !audioPlaybackController.isSpeaking() &&
            !zeroPinOverlayRef.current &&
            !isVoiceCaptureBlockedForStep(activeStepNameRef.current)
          ) {
            setIsAudioSpeaking(false);
            setIsMicMuted(false);
            isMicMutedRef.current = false;
            setCallStatus("Listening");
            continuousAudioEngine.resumeAfterPlayback();
            armSilenceWatchdog();
          }
        }, 400);
      }
    },
    [addLog, addChatTurn, language]
  );

  // ── Telephony Webhook Dispatcher ──────────────────────────────────────
  const dispatchVoiceWebhook = useCallback(
    async (url: string, params: Record<string, string> = {}) => {
      let targetUrl = url;
      if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        try {
          const u = new URL(targetUrl);
          targetUrl = u.pathname + u.search;
        } catch (error) {
          console.warn("[PhoneSimulator] URL normalization failed for external webhook target.", error);
        }
      }

      if (!targetUrl.startsWith("/api/simulator")) {
        targetUrl = `/api/simulator${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
      }

      const bodyParams = new URLSearchParams();
      const combinedParams: Record<string, string> = {
        sessionId: sessionIdRef.current || sessionId || params.sessionId || `call_${Date.now()}`,
        callerNumber,
        phoneNumber: callerNumber,
        isActive: "1",
        direction: "Inbound",
        ...params,
      };

      for (const [k, v] of Object.entries(combinedParams)) {
        if (v !== undefined && v !== null) {
          bodyParams.set(k, String(v));
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/xml, text/xml, */*",
      };
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("okw_admin_token") : null;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Mute microphone & pause speech recognition immediately while dispatching and waiting for response
      isSystemProcessingRef.current = true;
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      continuousAudioEngine.setProcessing(true);
      setCallStatus("Processing");
      clearSilenceWatchdog();

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers,
          credentials: "same-origin",
          body: bodyParams.toString(),
        });
        addLog("system", `Webhook POST ${targetUrl.split("?")[0]} status=${res.status}`);

        const decodeHeader = (val: string | null) => {
          if (!val) return null;
          try {
            return val.includes("%") ? decodeURIComponent(val) : val;
          } catch {
            return val;
          }
        };

        const guardReason = decodeHeader(res.headers.get("x-telephony-guard-reason")) || undefined;
        const transactionOutcome = decodeHeader(res.headers.get("x-transaction-outcome")) || undefined;
        setInteractionMode(res.headers.get("x-interaction-mode") || "UNSELECTED");
        setConversationState(res.headers.get("x-conversation-state") || "INITIATED");
        const aiDecisionType = decodeHeader(res.headers.get("x-ai-decision-type"));
        const aiDecisionReason = decodeHeader(res.headers.get("x-ai-decision-reason"));
        const aiReplyText = decodeHeader(res.headers.get("x-ai-reply-text"));
        const aiReplyKey = decodeHeader(res.headers.get("x-ai-reply-key"));

        if (aiReplyKey) {
          addLog("AI", `AI reply key resolved: ${aiReplyKey}`);
        }

        const recipientName = decodeHeader(res.headers.get("x-recipient-name"));
        const recipientPhone = decodeHeader(res.headers.get("x-recipient-phone"));
        if (recipientPhone) {
          if (!brainDraftRef.current) brainDraftRef.current = { slots: {} };
          if (!brainDraftRef.current.slots) brainDraftRef.current.slots = {};
          brainDraftRef.current.slots.recipient = {
            phone: recipientPhone,
            name: recipientName || undefined,
          };
          addLog("AI", `Brain draft synchronized: Recipient resolved as ${recipientName || recipientPhone} (${recipientPhone})`);
        }

        if (aiDecisionType) {
          addLog("AI", `[AI Decision] type=${aiDecisionType} reason="${aiDecisionReason || ""}"`);
          if (aiReplyText) {
            addChatTurn({
              sender: "ai",
              text: aiReplyText,
              audioSource: "synthesis",
            });
          }
        }

        const text = await res.text();
        if (text.includes("<Response>") || text.includes("<Reject")) {
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason, transactionOutcome });
        } else if (!res.ok) {
          addLog("system", `Telephony status ${res.status}: ${text.slice(0, 80)}`);
          setCallStatus("Ended");
          setCurrentPrompt("Call ended. Lift handset or press Call to begin.");
          setCallActive(false);
          audioPlaybackController.stop();
        } else {
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason, transactionOutcome });
        }

        const currentSid = sessionIdRef.current || sessionId;
        if (currentSid) {
          void syncChecklist(currentSid);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        addLog("system", `Webhook transport error: ${message}`);
      } finally {
        isSystemProcessingRef.current = false;
        continuousAudioEngine.setProcessing(false);
      }
    },
    [callerNumber, executeVoiceXml, sessionId, addLog, addChatTurn]
  );

  // ── Start Inbound Call ────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    // 1. Prime / unlock browser AudioContext & audio element on user gesture
    audioPlaybackController.unlockAudio();

    const newSession = `AT_CALL_${Date.now()}`;
      brainDraftRef.current = { slots: {} };
    callActiveRef.current = true;
    sessionIdRef.current = newSession;
    activeStepNameRef.current = "voice-menu";
    const currentMode = voiceModeRef.current;
    const initialLang = currentMode === "en" ? "en" : "twi";
    const initialCallback = `/api/simulator/language-selection?sessionId=${newSession}&lang=${initialLang}`;
    activeCallbackUrlRef.current = initialCallback;

    const initialWelcomeText = initialLang === "twi"
      ? "Akwaaba wɔ Ɔkwankyerɛfo Pa mu, wo nne akwankyerɛ a ɛma mobile services yɛ mmerɛw ma obiara."
      : "Welcome to Ɔkwankyerɛfo Pa, your accessible voice guide for mobile services.";
    const initialWelcomeAudio = initialLang === "twi"
      ? "/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3"
      : "/audio/welcome_en.mp3";

    currentPromptRef.current = initialWelcomeText;
    setCurrentPrompt(initialWelcomeText);
    setActivePlayUrl(initialWelcomeAudio);

    setSessionId(newSession);
    setInteractionMode("UNSELECTED");
    setConversationState("INITIATED");
    setCallActive(true);
    setCallStatus("Connected");
    setLanguage(initialLang);
    languageRef.current = initialLang;
    setDigitsBuffer("");
    setZeroPinOverlay(false);
    setRecentStreamingWords([]);

    addLog("system", `Call initiated. Session ID: ${newSession}`);
    addLog("state", "Connecting to phone simulator (/api/simulator/voice-menu)...");
    addLog("audio", `🔊 Playing welcome audio: ${initialWelcomeAudio}`);

    // Keep microphone OFF during initial welcome prompt playback; it will automatically turn ON when the prompt finishes playing
    setIsMicMuted(true);
    isMicMutedRef.current = true;
    continuousAudioEngine.pauseForPlayback();
    continuousAudioEngine.resetDiscussionBuffer();
    setInterimTranscript("");

    // Play the opening greeting followed by the available localized welcome clip.
    const followUpWelcomeAudio = initialLang === "twi"
      ? "/audio/welcome_twi.mp3"
      : "/audio/welcome_en.mp3";
    try {
      const welcomeSequence = [...new Set([initialWelcomeAudio, followUpWelcomeAudio])];
      await audioPlaybackController.playSequence(welcomeSequence, initialWelcomeText);
    } catch (err) {
      console.warn("[PhoneSimulator] Welcome audio sequence notice:", err);
    }

    // Initial step expectations
    setActiveStepName("voice-menu");
    setActiveCallbackUrl(initialCallback);
    setActiveNumDigits(1);
    setActiveFinishOnKey("#");

    await dispatchVoiceWebhook("/api/simulator/voice-menu", { sessionId: newSession, lang: initialLang });
  }, [dispatchVoiceWebhook, addLog]);

  // ── End Call ──────────────────────────────────────────────────────────
  const endCall = useCallback(
    async (reason = "User hung up") => {
      clearSilenceWatchdog();
      callActiveRef.current = false;
      sessionIdRef.current = "";
      brainDraftRef.current = { slots: {} };
      activeCallbackUrlRef.current = null;
      activeStepNameRef.current = "ended";

      setCallActive(false);
      setCallStatus("Ended");
      setCurrentPrompt("Call ended. Lift handset or press Call to begin.");
      setActivePlayUrl(null);
      setDigitsBuffer("");
      setZeroPinOverlay(false);
      setActiveCallbackUrl(null);
      setInterimTranscript("");

      audioPlaybackController.stop();
      continuousAudioEngine.stop();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (error) {
          console.warn("[PhoneSimulator] Recognition abort during end-call failed.", error);
        }
      }

      addLog("state", `Call ended (${reason})`);
      addChatTurn({
        sender: "system",
        text: `Call ended: ${reason}. Thank you for using Ɔkwankyerɛfo Pa.`,
        stepName: "ended",
      });
    },
    [addLog, addChatTurn, clearSilenceWatchdog]
  );

  const startPinAuthorizationFlow = useCallback(async () => {
    activeStepNameRef.current = "enter-pin";
    setActiveStepName("enter-pin");
    setDigitsBuffer("");
    zeroPinOverlayRef.current = false;
    setZeroPinOverlay(false);
    continuousAudioEngine.setZeroPinMuted(false);

    const curLang = languageRef.current || language;
    const isTwi = curLang === "twi";
    const promptText = isTwi
      ? "Yɛsrɛ wo, hyɛ wo Mobile Money PIN a ɛyɛ nkyerɛwdeɛ nnan wɔ wo keypad so na fa hash ka ho, anaa ka wo PIN pɛpɛɛpɛ. Yɛrenka wo PIN wɔ frɛ yi mu da."
      : "Please enter your 4-digit Mobile Money PIN on your phone keypad followed by hash, or speak your PIN clearly. Your PIN will never be spoken back.";

    const curSession = sessionIdRef.current || sessionId || `call_${Date.now()}`;
    activeCallbackUrlRef.current = `/api/simulator/verify-pin?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}&accessiblePin=1`;
    setActiveCallbackUrl(activeCallbackUrlRef.current);
    setActiveNumDigits(4);
    setActiveFinishOnKey("#");

    addLog("state", "Accessible In-Call PIN Mode active: keypad and spoken PIN enabled (Zero-Log Enforced).");
    setCurrentPrompt(promptText);
    currentPromptRef.current = promptText;

    await dispatchVoiceWebhook(
      `/api/simulator/safe-outcome?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}&accessiblePin=1`,
      { dtmfDigits: "1", accessiblePin: "1" }
    );
  }, [language, sessionId, addLog, dispatchVoiceWebhook]);

  useEffect(() => {
    startPinAuthorizationFlowRef.current = startPinAuthorizationFlow;
  }, [startPinAuthorizationFlow]);

  const playAiAgentReply = useCallback(
    async (
      textToPlay: string,
      langToUse: string = "twi",
      isGeminiOrigin: boolean = false,
      sessionToUse?: string
    ) => {
      try {
        const crossRes = await fetch("/api/ai/cross-reference-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            replyText: textToPlay,
            language: langToUse,
            sessionId: sessionToUse || sessionId,
            isGeminiConversation: isGeminiOrigin,
          }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

        const plan = crossRes?.plan;
        if (plan && Array.isArray(plan.segments) && plan.segments.length > 0) {
          const brainSource = (plan.source || "AI").toUpperCase();
          addLog(
            "AI",
            `[${brainSource} BRAIN] Audio Assembly Plan: ${plan.reasoning || "Assembled response sequence"}`
          );

          for (let i = 0; i < plan.segments.length; i++) {
            const seg = plan.segments[i];
            if (seg.type === "clip" && seg.audioUrl) {
              addLog(
                "audio",
                `Playing clip [${i + 1}/${plan.segments.length}]: ${seg.filename || "Studio recording"}`
              );
              await audioPlaybackController.play(seg.audioUrl, seg.transcript || textToPlay);
            } else if (seg.type === "tts" && seg.text) {
              addLog(
                "audio",
                `Synthesizing dynamic TTS [${i + 1}/${plan.segments.length}]: "${seg.text}"`
              );
              await audioPlaybackController.speakText(seg.text, { language: langToUse });
            }
          }
          return;
        }

        // Fallback to match-audio or direct TTS
        const matchRes = await fetch("/api/ai/match-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textToPlay,
            language: langToUse,
            literacyLevel: "standard",
            sessionId: sessionToUse || sessionId,
            isGeminiConversation: isGeminiOrigin,
          }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

        const matchData = matchRes?.result || matchRes;
        if (matchData?.matchFound && matchData.audioUrl) {
          addLog(
            "AI",
            `Studio audio matched (${matchData.promptId || matchData.title || "Catalog"}): "${matchData.matchReason || matchData.reason || "Catalog Match"}"`
          );
          await audioPlaybackController.play(matchData.audioUrl, textToPlay);
          return;
        }

        addLog("AI", `Dynamic response requires TTS: "${matchData?.matchReason || matchData?.reason || "Synthesizing"}"`);
        await audioPlaybackController.speakText(textToPlay, { language: langToUse });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        addLog("AI", `Audio assembly notice: playing TTS fallback (${message || "Standard"})`);
        await audioPlaybackController.speakText(textToPlay, { language: langToUse });
      }
    },
    [addLog, sessionId]
  );

  // ── Speech Recognition & Spoken Turn Handler ──────────────────────────
  const processSpokenUtterance = useCallback(
    async (
      utterance: string,
      isDirectSimulated: boolean = false
    ) => {
      // If call is inactive, initiate call first
      if (!callActiveRef.current) {
        if (activeStepNameRef.current === "ended" || !sessionIdRef.current) {
          addLog("state", `Speech arrived while call inactive; starting a new call.`);
          await startCall();
          return;
        } else {
          return;
        }
      }

      const curStep = activeStepNameRef.current;
      if (zeroPinOverlayRef.current || isVoiceCaptureBlockedForStep(curStep)) return;
      if (shouldDiscardSensitiveSpeech(utterance, curStep)) {
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        continuousAudioEngine.setZeroPinMuted(true);
        continuousAudioEngine.pauseForPlayback();
        addLog("system", "Sensitive credential-like speech was discarded.");
        return;
      }

      const clean = normalizeSpokenDigits(utterance.trim());
      if (!clean) return;
      clearSilenceWatchdog();

      // Echo filter check: ignore system audio echoing back into mic (only for live mic, not for direct simulated)
      if (
        !isDirectSimulated &&
        isAcousticSystemEcho(
          clean,
          currentPromptRef.current,
          audioPlaybackController.isSpeaking(),
          isDirectSimulated
        )
      ) {
        return;
      }

      // Debounce duplicate recognition events
      const now = Date.now();
      if (clean === lastUtteranceTextRef.current && now - lastUtteranceTimeRef.current < 400) {
        return;
      }
      lastUtteranceTextRef.current = clean;
      lastUtteranceTimeRef.current = now;

      // Ghanaian phonetic tolerance & repair
      const phoneticRepair = repairGhanaianPronunciation(clean);
      const effectiveClean = phoneticRepair.normalizedTranscript || clean;

      // Automatically turn the microphone OFF now that the user has finished their sentence!
      // It will automatically turn back ON after the next audio prompt finishes playing.
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      isSystemProcessingRef.current = true;
      continuousAudioEngine.setProcessing(true);
      setCallStatus("Processing");

      addLog("caller", `Speech "${clean}"`);
      addLog("asr", `✅ Sentence complete: "${effectiveClean}" — Microphone automatically turned OFF.`);

      const isPinAuthStep = curStep === "enter-pin" || curStep === "verify-pin" || curStep.includes("pin") || curStep.includes("auth");

      // Add to Chat Timeline with phonetic annotations (PIN entries are strictly masked as ****)
      addChatTurn({
        sender: "caller",
        text: isPinAuthStep ? "****" : effectiveClean,
        rawTranscript: isPinAuthStep ? undefined : (clean !== effectiveClean ? clean : undefined),
        phoneticRepairs: isPinAuthStep ? undefined : phoneticRepair.repairedWords,
        confidence: 0.98,
      });

      const curSession = sessionIdRef.current;
      const curLang = languageRef.current || "en";
      const isTwi = curLang === "twi";

      // Direct Spoken PIN Entry
      if (isPinAuthStep) {
        const WORD_TO_DIGIT: Record<string, string> = {
          zero: "0", oh: "0", hwee: "0",
          one: "1", baako: "1", bako: "1",
          two: "2", mmienu: "2", mienu: "2",
          three: "3", mmiɛnsa: "3", miensa: "3", mmiensa: "3",
          four: "4", nan: "4", ɛnan: "4", enan: "4",
          five: "5", num: "5", enum: "5", ɛnum: "5",
          six: "6", nsia: "6",
          seven: "7", nson: "7",
          eight: "8", nwɔtwe: "8", nwotwe: "8",
          nine: "9", nkron: "9",
        };
        const rawDigits = effectiveClean.replace(/\D/g, "");
        let spokenPin = rawDigits;
        if (spokenPin.length < 4) {
          const words = effectiveClean.toLowerCase().replace(/[^a-zA-Z0-9ɛɔƐƆ]/gu, " ").split(/\s+/).filter(Boolean);
          const digitsList: string[] = [];
          for (const w of words) {
            if (/^\d+$/.test(w)) digitsList.push(...w.split(""));
            else if (WORD_TO_DIGIT[w] !== undefined) digitsList.push(WORD_TO_DIGIT[w]);
          }
          spokenPin = digitsList.join("");
        }

        if (spokenPin.length >= 4) {
          const pinDigits = spokenPin.slice(0, 4);
          setDigitsBuffer("****");
          setCallStatus("Verifying PIN");
          addLog("caller", "Spoken PIN authenticated: [****] (Zero-Log Enforced)");
          return dispatchVoiceWebhook(
            `/api/simulator/verify-pin?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}&accessiblePin=1`,
            { dtmfDigits: pinDigits, accessiblePin: "1" }
          );
        }
      }

      if (curStep === "cashout-confirm-approval") {
        const normalizedApproval = effectiveClean.toLowerCase();
        if (/\b(approve|yes|aane|pene\s*so|go\s*ahead|proceed)\b/.test(normalizedApproval)) {
          startPinAuthorizationFlow();
          return;
        }
        if (/\b(no|cancel|dabi|reject|stop)\b/.test(normalizedApproval)) {
          addChatTurn({
            sender: "ai",
            text: isTwi ? "Yɛatwa adesrɛ no mu. Hwɛ wo tebea ansa na woasan abɔ mmɔden." : "The request was cancelled. Check its status before trying again.",
            audioSource: "synthesis",
            stepName: "completed",
          });
          endCall("Cash-out request cancelled");
          return;
        }
        addChatTurn({
          sender: "ai",
          text: isTwi ? "Ka aane sɛ wopene so, anaa dabi sɛ wompene so." : "Say yes to approve or no to cancel. Do not say or enter your PIN here.",
          audioSource: "synthesis",
          stepName: "cashout-confirm-approval",
        });
        return;
      }

      // ── CASH-OUT FLOW HANDLERS ──
      const isCashOutInitiation =
        !curStep.startsWith("cashout-") &&
        /\b(withdraw|cash\s*out|cashout|take\s*out\s*money|pull\s*money|yi\s*sika|mepɛ\s*sɛ\s*meyi\s*sika|allow\s*cash\s*out|gye\s*sika)\b/i.test(effectiveClean);

      if (isCashOutInitiation) {
        setCashOutActive(true);
        activeStepNameRef.current = "cashout-offer-balance";
        setActiveStepName("cashout-offer-balance");

        // Extract any mentioned withdrawal amount (e.g. "withdraw 40 cedis for me")
        const amtMatch = effectiveClean.match(/(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|gh¢)/i) || effectiveClean.match(/(?:withdraw|cash\s*out)\s*(\d+(?:\.\d+)?)/i);
        if (amtMatch) {
          const parsed = parseFloat(amtMatch[1]);
          if (!isNaN(parsed) && parsed > 0) {
            requestedWithdrawalAmountRef.current = parsed;
          }
        }

        addLog("state", "Initiating Allow Cash-Out on the caller's wallet...");
        try {
          const res = await api.enableVoiceCashOut({ callerPhone: callerNumber, language: curLang });
          const speakText = (isTwi ? res.messageTw : res.messageEn) ||
            (isTwi
              ? "Yɛabue Allow Cash-Out ama wo mfifii 15 mu sɛ wotumi yi sika wɔ MoMo agent hɔ. Yɛrentumi nhwɛ wo balance wɔ assistant yi so; fa wo fon bɔ star, baako, nson, hwee, hash."
              : "Cash-Out has been enabled on your wallet for the next 15 minutes. Balance checking through this assistant is currently unavailable; dial star, one, seven, zero, hash on your handset.");
          addLog("reply", "Cash-out information ready.");
          addChatTurn({ sender: "ai", text: speakText, audioSource: "synthesis", stepName: "cashout-offer-balance" });
          setCurrentPrompt(speakText);
          currentPromptRef.current = speakText;
          await audioPlaybackController.speakText(speakText);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          addLog("system", `Error enabling cash-out: ${message}`);
        }
        return;
      }

      // Cash-Out Step 1: Offer to Check Balance & Fees
      if (curStep === "cashout-offer-balance") {
        const aiRes = await api.understandCashOutIntent({
          transcript: effectiveClean.replace(/\b\d{4}\b/g, "[REDACTED_PIN]"),
          currentState: curStep,
          callerPhone: callerNumber,
          requestedAmount: requestedWithdrawalAmountRef.current,
          language: curLang,
        });

        // Keep the existing agent approval path available without collecting a PIN.
        if (aiRes.action === "FETCH_PENDING" || aiRes.intent === "AGENT_INITIATED") {
          let pending = await api.getPendingCashOutRequest(callerNumber);
          if (!pending?.hasPending) {
            const simRes = await api.simulateAgentCashOutRequest({
              callerPhone: callerNumber,
              agentCode: "284910",
              agentName: "Kofi Mensah Enterprise (MoMo Agent)",
              amount: requestedWithdrawalAmountRef.current || 30.0,
            });
            pending = { success: true, hasPending: true, request: simRes.request };
          }
          activeStepNameRef.current = "cashout-confirm-approval";
          setActiveStepName("cashout-confirm-approval");
          const readbackMsg = isTwi
            ? `MoMo Agent ${pending.request.agentName} rebisa sɛ obeyi sika ${pending.request.amount.toFixed(2)} cedis a telco fee yɛ pesewas ${(pending.request.fee * 100).toFixed(0)} afiri wo account mu. Wopene so?`
            : `MoMo Agent ${pending.request.agentName} is requesting a withdrawal of ${pending.request.amount.toFixed(2)} Cedis with a fee of ${pending.request.fee.toFixed(2)} Cedis. Do you approve this withdrawal?`;
          addChatTurn({ sender: "ai", text: readbackMsg, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
          setCurrentPrompt(readbackMsg);
          currentPromptRef.current = readbackMsg;
          await audioPlaybackController.speakText(readbackMsg);
          return;
        }

        const unavailableText = isTwi
          ? "Yɛrentumi nhwɛ wo balance wɔ assistant yi so seesei. Fa wo fon bɔ star, baako, nson, hwee, hash."
          : "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset.";
        addChatTurn({ sender: "ai", text: unavailableText, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
        setCurrentPrompt(unavailableText);
        currentPromptRef.current = unavailableText;
        activeStepNameRef.current = "cashout-awaiting-agent";
        setActiveStepName("cashout-awaiting-agent");
        await audioPlaybackController.speakText(unavailableText);
        return;
      }

      // ── CASH-OUT STEP 3 & 4: AI AGENT REASONING OVER DIALOGUE (ZERO-PIN ISOLATED) ──
      if (curStep === "cashout-awaiting-agent" || curStep === "cashout-confirm-approval") {
        const textForAi = effectiveClean;

        addLog("AI", `AI Agent analyzing caller utterance: "${textForAi}" in step="${curStep}"...`);
        const aiDecision = await api.understandCashOutIntent({
          transcript: textForAi,
          currentState: curStep,
          callerPhone: callerNumber,
          requestedAmount: requestedWithdrawalAmountRef.current,
          language: curLang,
        });
        addLog("AI", `AI Agent Feedback: intent=${aiDecision.intent} action=${aiDecision.action} (${aiDecision.reason || "Semantic evaluation"})`);

        // Handle Step 3: Awaiting Agent
        if (curStep === "cashout-awaiting-agent") {
          // Check if caller updated the withdrawal amount (e.g. "okay withdraw 19.50")
          const amtMatch = effectiveClean.match(/(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|gh¢)/i) || effectiveClean.match(/(?:withdraw|cash\s*out|amount\s*(?:is|to)?)\s*(\d+(?:\.\d+)?)/i);
          if (amtMatch && !aiDecision.intent.includes("AGENT_INITIATED") && aiDecision.action !== "FETCH_PENDING") {
            const parsed = parseFloat(amtMatch[1]);
            if (!isNaN(parsed) && parsed > 0) {
              requestedWithdrawalAmountRef.current = parsed;
              const fee = parsed <= 50 ? (parsed * 0.01 < 0.20 ? 0.20 : Math.round(parsed * 0.01 * 100) / 100) : parsed <= 1000 ? Math.round(parsed * 0.01 * 100) / 100 : 10.0;
              const total = parsed + fee;
              const updateMsg = isTwi
                ? `Mate aseɛ, wobɛyi GHS ${parsed.toFixed(2)}. Telco fee bɛyɛ GHS ${fee.toFixed(2)}, ne nyinaa yɛ GHS ${total.toFixed(2)}. Ka wo phone nɔmba ${callerNumber} kyerɛ agent no sɛ ɔmbɔ GHS ${parsed.toFixed(2)}. Sɛ ɔwie a, ka kyerɛ me na yɛapene so.`
                : `Understood, you want to withdraw ${parsed.toFixed(2)} Cedis. The telco fee will be ${fee.toFixed(2)} Cedis, for a total of ${total.toFixed(2)} Cedis. Tell the agent your number: ${callerNumber} and have them enter ${parsed.toFixed(2)} Cedis. Once they enter it, let me know and I will help you approve it.`;
              addLog("reply", "Transaction status update ready.");
              addChatTurn({ sender: "ai", text: updateMsg, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
              setCurrentPrompt(updateMsg);
              currentPromptRef.current = updateMsg;
              await audioPlaybackController.speakText(updateMsg);
              return;
            }
          }

          if (aiDecision.action === "FETCH_PENDING" || aiDecision.intent === "AGENT_INITIATED") {
            addLog("state", "AI Agent identified agent initiation. Fetching the pending agent withdrawal request...");
            let pending = await api.getPendingCashOutRequest(callerNumber);
            if (!pending?.hasPending) {
              const simRes = await api.simulateAgentCashOutRequest({
                callerPhone: callerNumber,
                agentCode: "284910",
                agentName: "Kofi Mensah Enterprise (MoMo Agent)",
                amount: requestedWithdrawalAmountRef.current || 30.0,
              });
              pending = { success: true, hasPending: true, request: simRes.request };
            }

            activeStepNameRef.current = "cashout-confirm-approval";
            setActiveStepName("cashout-confirm-approval");

            const readbackMsg = isTwi
              ? `MoMo Agent ${pending.request.agentName} rebisa sɛ obeyi sika ${pending.request.amount.toFixed(2)} cedis a telco fee yɛ pesewas ${(pending.request.fee * 100).toFixed(0)} afiri wo account mu. Wopene so?`
              : `MoMo Agent ${pending.request.agentName} is requesting a withdrawal of ${pending.request.amount.toFixed(2)} Cedis with a fee of ${pending.request.fee.toFixed(2)} Cedis. Do you approve this withdrawal?`;

            addLog("reply", "Transaction readback ready.");
            addChatTurn({ sender: "ai", text: readbackMsg, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
            setCurrentPrompt(readbackMsg);
            currentPromptRef.current = readbackMsg;
            await audioPlaybackController.speakText(readbackMsg);
            return;
          } else if (aiDecision.action === "CANCEL" || aiDecision.intent === "REJECT_CANCEL") {
            addLog("caller", `Caller cancelled cash-out while awaiting agent.`);
            const cancelMsg = isTwi
              ? "Yɛatwa cash-out no mu. Wotumi frɛ bio berɛ biara. Nante yie."
              : "Cash-Out cancelled. You can call back anytime. Goodbye.";
            addChatTurn({ sender: "ai", text: cancelMsg, audioSource: "synthesis", stepName: "completed" });
            setCurrentPrompt(cancelMsg);
            currentPromptRef.current = cancelMsg;
            activeStepNameRef.current = "completed";
            setActiveStepName("completed");
            await audioPlaybackController.speakText(cancelMsg);
            endCall("User cancelled cash-out");
            return;
          } else {
            // Caller spoke while waiting for agent
            const waitPrompt = isTwi
              ? `Meretwɛn agent no. Wotumi ka wo number ${callerNumber} kyerɛ no. Sɛ ɔwie a, ka kyerɛ me na yɛapene so.`
              : `I am waiting on the line with you. You can give the agent your number: ${callerNumber}. Once they enter the withdrawal, just let me know and I will help you approve it.`;
            addChatTurn({ sender: "ai", text: waitPrompt, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
            setCurrentPrompt(waitPrompt);
            currentPromptRef.current = waitPrompt;
            await audioPlaybackController.speakText(waitPrompt);
            return;
          }
        }

        // Handle Step 4: Confirm Approval
        if (curStep === "cashout-confirm-approval") {
          const isApprovalUtterance =
            aiDecision.action === "PROCEED" ||
            aiDecision.intent === "CONFIRM_PROCEED" ||
            /\b(approve|pene\s*so|yes|aane|go\s*ahead|please\s*go\s*ahead|proceed|yoo|do\s*it|allow\s*it|yes\s*please)\b/i.test(effectiveClean);

          if (isApprovalUtterance) {
            startPinAuthorizationFlow();
            return;
          } else if (aiDecision.action === "CANCEL" || aiDecision.intent === "REJECT_CANCEL") {
            addLog("caller", `Caller rejected agent withdrawal request.`);
            const rejectMsg = isTwi
              ? "Yɛatwa agent no adesrɛ no mu. Hwɛ wo tebea ansa na woasan abɔ mmɔden. Nante yie."
              : "Withdrawal request rejected. Check your transaction status before trying again. Goodbye.";
            addChatTurn({ sender: "ai", text: rejectMsg, audioSource: "synthesis", stepName: "completed" });
            setCurrentPrompt(rejectMsg);
            currentPromptRef.current = rejectMsg;
            activeStepNameRef.current = "completed";
            setActiveStepName("completed");
            await audioPlaybackController.speakText(rejectMsg);
            endCall("User rejected withdrawal");
            return;
          }
        }
      }

      const targetCallback =
        activeCallbackUrlRef.current ||
        activeCallbackUrl ||
        getFallbackCallbackUrl(curStep, curSession);

      const normalizedOption = effectiveClean.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
      const optionMap: Record<string, Record<string, string>> = {
        language: {
          "1": "1", one: "1", baako: "1", english: "1", borɔfo: "1", brofo: "1",
          "2": "2", two: "2", mmienu: "2", mienu: "2", twi: "2", akan: "2", asante: "2",
        },
        service: {
          "1": "1", one: "1", baako: "1", momo: "1", "mobile money": "1", telecom: "1",
          "2": "2", two: "2", mmienu: "2", banking: "2", bank: "2",
        },
        provider: {
          "1": "1", one: "1", mtn: "1", "2": "2", two: "2", telecel: "2", vodafone: "2",
          "3": "3", three: "3", airteltigo: "3", tigo: "3", at: "3",
        },
        action: {
          "1": "1", one: "1", send: "1", "send money": "1", transfer: "1", mane: "1",
          "2": "2", two: "2", balance: "2", "check balance": "2",
        },
        confirmation: {
          "1": "1", one: "1", yes: "1", confirm: "1", okay: "1", aane: "1", "pene so": "1",
          "2": "2", two: "2", no: "2", cancel: "2", dabi: "2", sesa: "2",
        },
      };
      const stepGroup = curStep.includes("language") || curStep === "voice-menu"
        ? "language"
        : curStep.includes("service")
        ? "service"
        : curStep.includes("provider")
        ? "provider"
        : curStep.includes("action")
        ? "action"
        : curStep.includes("confirm") || curStep.includes("verify-choice") || curStep === "verify-recipient" || curStep === "recipient-verify-choice"
        ? "confirmation"
        : "";
      const navigationOptions: Record<string, string> = {
        back: "8",
        "go back": "8",
        previous: "8",
        repeat: "9",
        again: "9",
        "say again": "9",
        cancel: "0",
        stop: "0",
        exit: "0",
      };
      // Only single-token menu shortcuts (e.g. "1", "2", "8", "9", "0") trigger immediate DTMF auto-dial.
      // Full natural conversation sentences are routed directly to the AI Brain.
      const isSingleChoice = effectiveClean.split(/\s+/).length <= 2;
      const matchedDtmf = isSingleChoice
        ? (navigationOptions[normalizedOption] || (stepGroup ? optionMap[stepGroup][normalizedOption] : undefined))
        : undefined;

      const isTransferConfirmStep =
        curStep === "safe-confirmation" ||
        curStep === "safe-outcome" ||
        curStep === "transaction-confirm" ||
        curStep === "confirm" ||
        curStep === "confirm-speech" ||
        curStep.includes("confirm");

      if (isTransferConfirmStep) {
        const isAffirmative =
          /\b(yes|confirm|proceed|okay|sure|aane|pene\s*so|ampa|that'?s\s*him|that'?s\s*her|correct|send\s*it|kɔ\s*so|yie|1|baako|agree|i\s*agree|yes\s*i\s*agree|send\s*(?:the|her|him)?\s*money|send\s*it\s*please|yes\s*please|my\s*mother\s*name\s*is|that\s*is\s*my\s*mother)\b/i.test(effectiveClean) ||
          matchedDtmf === "1";
        const isNegative = /\b(no|cancel|wrong|dabi|stop|sesa|change|reject|2|mmienu)\b/i.test(effectiveClean) || matchedDtmf === "2";
        if (isAffirmative) {
          addLog("caller", `Spoken confirmation approval: "${effectiveClean}"`);
          if (brainDraftRef.current?.slots) {
            brainDraftRef.current.slots.hasNetworkDiscrepancy = false;
            brainDraftRef.current.slots.crossNetworkApproved = true;
          }
          startPinAuthorizationFlow();
          return;
        } else if (isNegative) {
          addLog("caller", `Spoken confirmation rejection: "${effectiveClean}"`);
          brainDraftRef.current = { slots: {} };
          const cancelMsg = curLang === "twi"
            ? "Yɛatwa mu. Wo pɛ sɛ womane sika kɔ nɔmba foforɔ bɛn so?"
            : "Transaction cancelled. What phone number would you like to send money to instead?";
          addChatTurn({ sender: "ai", text: cancelMsg, audioSource: "synthesis" });
          setCurrentPrompt(cancelMsg);
          currentPromptRef.current = cancelMsg;
          activeStepNameRef.current = "enter-recipient";
          setActiveStepName("enter-recipient");
          await audioPlaybackController.speakText(cancelMsg);
          return;
        } else if (brainDraftRef.current?.slots?.hasNetworkDiscrepancy) {
          addLog("AI", `Processing caller response to cross-network discrepancy confirmation: "${effectiveClean}"`);
          // Let fall through to api.processBrain below
        }
      }

      if (matchedDtmf) {
        addLog("asr", `Spoken menu choice "${effectiveClean}" mapped to keypad [${matchedDtmf}]`);
        setActiveKeypadPulse(matchedDtmf);
        audioPlaybackController.playDtmfTone(matchedDtmf, 130);
        setTimeout(() => setActiveKeypadPulse(null), 450);
        return dispatchVoiceWebhook(targetCallback, { dtmfDigits: matchedDtmf });
      }

      if (!isTransferConfirmStep && (curStep.includes("confirm") || curStep.includes("verify-choice"))) {
        addLog("state", "Routing spoken approval through the guarded simulator confirmation callback.");
        return dispatchVoiceWebhook(
          `/api/simulator/speech-fallback?step=${encodeURIComponent(curStep)}&sessionId=${encodeURIComponent(curSession)}&lang=${curLang}`,
          { speechText: effectiveClean }
        );
      }

      // Fast-Path Step-Aware Routing for 10-Digit Recipient Phone Numbers:
      const rawDigits = speechNormalizer.extractSpokenDigits(effectiveClean);
      const phoneMatch = rawDigits.match(/\b(0[235]\d{8})\b/) || effectiveClean.match(/\b(0[235]\d{8})\b/) || rawDigits.match(/(0[235]\d{8})/);
      const extractedPhone = phoneMatch ? phoneMatch[1] : normalizeGhanaPhoneNumber(rawDigits || effectiveClean);
      const isTenDigitPhone =
        extractedPhone.length === 10 && (extractedPhone.startsWith("02") || extractedPhone.startsWith("05") || extractedPhone.startsWith("03") || extractedPhone.startsWith("0"));

      if (
        isTenDigitPhone &&
        (curStep === "enter-recipient" ||
         curStep === "enter_recipient_2" ||
         curStep === "action-choice" ||
         curStep === "action-select" ||
         curStep.includes("recipient") ||
         curStep.includes("action"))
      ) {
        addLog("asr", `📞 Step-Aware Router: Detected 10-digit recipient phone number: ${extractedPhone}`);
        setDigitsBuffer(extractedPhone);
        setCallStatus("Verifying Recipient");
        activeStepNameRef.current = "verify-recipient";
        setActiveStepName("verify-recipient");
        return dispatchVoiceWebhook(
          `/api/simulator/verify-recipient?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}`,
          { dtmfDigits: extractedPhone + "#" }
        );
      }

      // Fast-Path Step-Aware Routing for Spoken Amount:
      if (curStep === "enter-amount" || curStep === "amount-entry" || curStep.includes("amount")) {
        const amtMatch = effectiveClean.match(/(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|gh¢)?/i);
        const parsedAmt = amtMatch ? parseFloat(amtMatch[1]) : (rawDigits.length > 0 && rawDigits.length <= 5 ? parseFloat(rawDigits) : NaN);
        if (!isNaN(parsedAmt) && parsedAmt > 0 && parsedAmt <= 10000) {
          const amtStr = String(parsedAmt);
          addLog("asr", `💰 Step-Aware Router: Detected amount: ${amtStr} Cedis`);
          setDigitsBuffer(amtStr);
          setCallStatus("Verifying Amount");
          activeStepNameRef.current = "verify-amount";
          setActiveStepName("verify-amount");
          return dispatchVoiceWebhook(
            `/api/simulator/verify-amount?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}`,
            { dtmfDigits: amtStr + "#", amount: amtStr }
          );
        }
      }

      addLog("AI", `POST /api/ai/brain/process step=${curStep} language=${curLang} (Tier 1 Fast-Path enabled)`);
      setIsAiReasoning(true);
      setReasoningSec(0);
      const reasoningInterval = setInterval(() => {
        setReasoningSec((prev) => prev + 1);
      }, 1000);

      let stallTimer: NodeJS.Timeout | null = setTimeout(async () => {
        const stallMsg = curLang === "twi"
          ? "Kyerɛ me kakra, mate deɛ wokaeɛ no na mereka akyerɛ wo seesei ara, mesrɛ wo twɛn kakra."
          : "Please wait, I heard what you said and I am currently trying to find out what it means, sorry for the delay.";
        addLog("AI", `[Comfort Loader @10s] "${stallMsg}"`);
        addChatTurn({ sender: "ai", text: `⏳ ${stallMsg}`, audioSource: "synthesis" });
        setCurrentPrompt(stallMsg);
        try {
          await audioPlaybackController.speakText(stallMsg);
        } catch {
          // safe audio playback
        }
      }, 10000);

      let timeout20sTimer: NodeJS.Timeout | null = setTimeout(() => {
        addLog("system", "⏱️ AI reasoning is still in progress after 20 seconds. The server is continuing its provider fallback chain.");
      }, 20000);

      try {
        const response = await api.processBrain({
          transcript: effectiveClean,
          language: curLang === "twi" ? "twi-asante" : "en",
          draft: brainDraftRef.current,
          callerNumber,
          sessionId: curSession,
        });

        if (stallTimer) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
        if (timeout20sTimer) {
          clearTimeout(timeout20sTimer);
          timeout20sTimer = null;
        }
        clearInterval(reasoningInterval);
        setIsAiReasoning(false);

        const brainOutput = response.brainOutput;
        brainDraftRef.current = brainOutput.updatedDraft || { slots: {} };
        const slots = brainDraftRef.current.slots || {};
        const intent = brainDraftRef.current.intent || "unknown";
        const modelProvider = brainOutput.modelOutput?.provider;
        const isGeminiOrigin = Boolean(brainOutput.modelOutput) || (brainOutput.decision.kind === "clarify_slot" && brainOutput.decision.slot === "conversational");

        addLog("AI", `Brain decision=${brainOutput.decision.kind} intent=${intent} modelUsed=${Boolean(brainOutput.modelOutput)} (Tier ${brainOutput.modelOutput ? `2 ${modelProvider === "groq" ? "Groq" : "Gemini"}` : "1 Fast-Path"})`);
        addLog("AI", `Brain slots amount=${slots.amount ?? "missing"} recipient=${slots.recipient?.phone ? "provided" : "missing"}`);

        const replyText = String(brainOutput.reply?.text || "Please repeat your request.");
        addChatTurn({ sender: "ai", text: replyText, audioSource: "synthesis" });

        const recipientPhone = slots.recipient?.phone || slots.recipientPhone;
        const amount = typeof slots.amount === "number" && Number.isFinite(slots.amount) ? slots.amount : undefined;

        // Case 1: Conversational Turn (Gemini is conversing, clarifying, or asking questions)
        // No local slot overrides or step transitions: speak Gemini's reply and await caller response!
        if (brainOutput.decision.kind === "clarify_slot" && brainOutput.decision.slot === "conversational") {
          addLog("AI", `Gemini conversational turn: "${replyText}"`);
          setCurrentPrompt(replyText);
          currentPromptRef.current = replyText;
          await playAiAgentReply(replyText, curLang, isGeminiOrigin, curSession);
          return;
        }

        // Case 2: Gemini Tool Handoff (Recipient & Amount Gathered -> Safe Confirmation)
        if (brainOutput.decision.kind === "confirm") {
          addLog("state", "AI handed over transaction details. Starting required readback.");
          return dispatchVoiceWebhook(
            `/api/simulator/safe-confirmation?sessionId=${encodeURIComponent(curSession)}&lang=${curLang}`
          );
        }

        // Case 3: Explicit Dispatch after Confirmation -> Start PIN Authorization
        if (brainOutput.decision.kind === "dispatch") {
          addLog("state", `Caller confirmed transaction. Starting active PIN authorization.`);
          startPinAuthorizationFlow();
          return;
        }

        const isTransfer = intent === "momo.transfer";
        if (isTransfer && recipientPhone) {
          const normalizedPhone = normalizeGhanaPhoneNumber(String(recipientPhone));
          if (normalizedPhone.length === 10) {
            addLog("state", `Submitting recipient for provider verification; amount ${amount == null ? "not provided" : "provided"}.`);
            return dispatchVoiceWebhook(
              `/api/simulator/verify-recipient?sessionId=${curSession}&lang=${curLang}`,
              { dtmfDigits: normalizedPhone + "#", ...(amount !== undefined ? { amount: String(amount) } : {}) }
            );
          }
        }

        const missingSlot = brainOutput.decision.kind === "clarify_slot"
          ? brainOutput.decision.slot
          : isTransfer && !recipientPhone
          ? "recipient"
          : isTransfer && amount === undefined
          ? "amount"
          : undefined;
        if (missingSlot === "recipient" || missingSlot === "amount") {
          const nextStep = missingSlot === "recipient" ? "enter-recipient" : "enter-amount";
          const nextCallback = missingSlot === "recipient"
            ? `/api/simulator/verify-recipient?sessionId=${curSession}&lang=${curLang}`
            : `/api/simulator/verify-amount?sessionId=${curSession}&lang=${curLang}`;
          activeStepNameRef.current = nextStep;
          activeCallbackUrlRef.current = nextCallback;
          setActiveStepName(nextStep);
          setActiveCallbackUrl(nextCallback);
          setActiveNumDigits(missingSlot === "recipient" ? 10 : 6);
          setCurrentPrompt(replyText);
          currentPromptRef.current = replyText;
          addLog("state", `Brain requested missing slot: ${missingSlot}`);
          await playAiAgentReply(replyText, curLang, isGeminiOrigin, curSession);
          return;
        }

        addLog("AI", `Brain reply: "${replyText}"`);
        setCurrentPrompt(replyText);
        currentPromptRef.current = replyText;
        await playAiAgentReply(replyText, curLang, isGeminiOrigin, curSession);
      } catch (err: unknown) {
        if (stallTimer) clearTimeout(stallTimer);
        if (timeout20sTimer) clearTimeout(timeout20sTimer);
        clearInterval(reasoningInterval);
        setIsAiReasoning(false);
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = errMsg.includes("Timeout") || errMsg.includes("20s");
        if (isTimeout) {
          addLog("system", "⏱️ AI turn exceeded the expected response time; the request failed before a provider response was returned.");
          addChatTurn({
            sender: "system",
            text: "⏱️ Gemini exceeded 20s budget due to API latency. Local offline fallback activated.",
          });
        } else {
          addLog("system", `Brain request failed: ${errMsg}`);
        }
        const fallbackUrl = resolvePrompt("wrong_figure", curLang);
        if (fallbackUrl) await audioPlaybackController.play(fallbackUrl, "Please choose from the available options.");
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
        if (timeout20sTimer) clearTimeout(timeout20sTimer);
        clearInterval(reasoningInterval);
        setIsAiReasoning(false);
      }

    },
    [
      activeCallbackUrl,
      activeNumDigits,
      dispatchVoiceWebhook,
      getFallbackCallbackUrl,
      startCall,
      addLog,
      addChatTurn,
    ]
  );

  // ── Simulated Voice Utterance (Word-by-word streaming) ─────────────────
  const simulateVoiceUtterance = useCallback(
    async (textToSpeak: string) => {
      const phrase = textToSpeak.trim();
      if (!phrase || isSimulatingSpeech) return;

      audioPlaybackController.unlockAudio();
      setIsSimulatingSpeech(true);
      if (!callActiveRef.current) {
        await startCall();
        await new Promise((r) => setTimeout(r, 120));
      }

      audioPlaybackController.stop();
      setInterimTranscript("");
      const currentLang = languageRef.current || language;
      addLog("asr", `🎙️ Incoming speech stream detected (${currentLang === "twi" ? "Akan Twi" : "Ghanaian English"})`);

      const words = phrase.split(/\s+/).filter(Boolean);
      let rolling = "";

      for (let i = 0; i < words.length; i++) {
        const rawWord = words[i];
        rolling = rolling ? `${rolling} ${rawWord}` : rawWord;
        setInterimTranscript(rolling);

        const phonetic = repairGhanaianPronunciation(rawWord);
        const tokenItem = {
          word: rawWord,
          repaired: phonetic.repairedWords.length > 0 ? phonetic.normalizedTranscript : undefined,
          isPhoneticMatch: phonetic.repairedWords.length > 0,
          timestamp: Date.now(),
        };

        setRecentStreamingWords((prev) => [...prev.slice(-8), tokenItem]);

        if (tokenItem.isPhoneticMatch && tokenItem.repaired) {
          addLog("asr", `🎙️ Word: "${rawWord}" ➔ "${tokenItem.repaired}" (phonetic match)`);
        } else {
          addLog("asr", `🎙️ Word: "${rawWord}"`);
        }

        // 75ms realistic speaking pause per word
        await new Promise((r) => setTimeout(r, 75));
      }

      // Finalize utterance with Ghanaian pronunciation repair
      const normalized = normalizeSpokenDigits(phrase);
      const repair = repairGhanaianPronunciation(normalized);
      const effective = repair.normalizedTranscript || normalized;

      if (repair.repairedWords.length > 0) {
        addLog(
          "asr",
          `💡 Pronunciation normalized: ${repair.repairedWords
            .map((r) => `"${r.original}" ➔ "${r.corrected}" (${r.reason})`)
            .join(", ")}`
        );
      }
      addLog("asr", `✅ Final ASR: "${effective}"`);
      setInterimTranscript("");
      setIsSimulatingSpeech(false);

      // Process utterance directly (bypassing mic acoustic echo filter since it is direct test input)
      processSpokenUtterance(effective, true);
    },
    [isSimulatingSpeech, language, processSpokenUtterance, startCall, addLog]
  );

  // Synchronize audio engine context and Zero-PIN security
  useEffect(() => {
    continuousAudioEngine.setContext(activeStepName, language || "en");
    continuousAudioEngine.setZeroPinMuted(Boolean(zeroPinOverlay));
  }, [activeStepName, language, zeroPinOverlay]);

  // Subscribe to Always-On continuous audio engine utterances & state
  useEffect(() => {
    const unsubUtterance = continuousAudioEngine.subscribeUtterance((utterance) => {
      if (
        isMicMutedRef.current ||
        zeroPinOverlayRef.current ||
        isSystemProcessingRef.current ||
        isAudioSequenceActiveRef.current
      ) {
        return;
      }
      if (utterance && utterance.trim()) {
        processSpokenUtterance(utterance);
      }
    });

    const unsubWords = continuousAudioEngine.subscribeWordToken((token) => {
      if (token && token.word) {
        setRecentStreamingWords((prev) => [
          ...prev.slice(-8),
          {
            word: token.word,
            repaired: token.repaired,
            isPhoneticMatch: token.isPhoneticMatch,
            timestamp: token.timestamp,
          },
        ]);
        // Show in simulator terminal as speech-to-text is recognized in real time
        if (token.isPhoneticMatch && token.repaired) {
          addLog("asr", `🎙️ Live STT: "${token.word}" ➔ "${token.repaired}" (phonetic repair)`);
        } else {
          addLog("asr", `🎙️ Live STT: "${token.word}"`);
        }
      }
    });

    const unsubState = continuousAudioEngine.subscribeState((state) => {
      if (state.currentInterimTranscript) {
        setInterimTranscript(state.currentInterimTranscript);
      }
      if (state.isListening && !isAudioSpeaking && !zeroPinOverlayRef.current && !isMicMutedRef.current) {
        setCallStatus("Listening");
      }
      if (!state.isMicActive && !state.isPermissionGranted && !micUnavailable) {
        setMicUnavailable(true);
      }
    });

    return () => {
      unsubUtterance();
      unsubWords();
      unsubState();
    };
  }, [processSpokenUtterance, isAudioSpeaking, micUnavailable]);


  // Auto-scroll chat timeline to latest turn
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns, interimTranscript]);

  // One-time gesture audio unlock on page
  useEffect(() => {
    const handleGesture = () => {
      audioPlaybackController.unlockAudio();
    };
    window.addEventListener("click", handleGesture, { once: true });
    window.addEventListener("keydown", handleGesture, { once: true });
    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, []);

  // Keypad click handler with dual-tone audio beep
  const handleKeypadPress = useCallback(
    async (digit: string) => {
      clearSilenceWatchdog();
      if (zeroPinOverlayRef.current || isVoiceCaptureBlockedForStep(activeStepNameRef.current)) {
        if (digit === "0") endCall("Caller ended the secure handset handoff");
        return;
      }
      audioPlaybackController.unlockAudio();
      // 1. Play realistic DTMF telephone beep
      audioPlaybackController.playDtmfTone(digit);

      // 2. Barge-in: stop system audio on keypress and mute mic
      audioPlaybackController.stop();
      setIsMicMuted(true);
      isMicMutedRef.current = true;
      continuousAudioEngine.pauseForPlayback();

      // If inactive, dial in chosen language
      if (!callActiveRef.current) {
        await startCall();
        return;
      }

      if (zeroPinOverlayRef.current) return;

      const targetCallback =
        activeCallbackUrlRef.current ||
        activeCallbackUrl ||
        getFallbackCallbackUrl(activeStepNameRef.current, sessionIdRef.current);

      // Add to Chat Timeline
      addChatTurn({
        sender: "dtmf",
        text: `Pressed Key '${digit}'`,
        stepName: activeStepNameRef.current,
      });

      // Special Handling 2: Keypad during Cash-Out steps
      if (activeStepNameRef.current === "cashout-offer-balance") {
        if (digit === "1") {
          addLog("caller", "Keypad 1: Requested a balance check, which is unavailable.");
          activeStepNameRef.current = "cashout-awaiting-agent";
          setActiveStepName("cashout-awaiting-agent");
          const unavailableText = languageRef.current === "twi"
            ? "Yɛrentumi nhwɛ wo balance wɔ assistant yi so seesei. Fa wo fon bɔ star, baako, nson, hwee, hash. Mɛtwɛn wo sɛ agent no de withdrawal request no ba."
            : "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset. I can still wait for the agent's withdrawal request.";
          addChatTurn({ sender: "ai", text: unavailableText, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
          setCurrentPrompt(unavailableText);
          currentPromptRef.current = unavailableText;
          audioPlaybackController.speakText(unavailableText).catch(() => {});
          return;
        } else if (digit === "2") {
          addLog("caller", "Keypad 2: Skipping balance check.");
          activeStepNameRef.current = "cashout-awaiting-agent";
          setActiveStepName("cashout-awaiting-agent");
          const waitPrompt = (languageRef.current === "twi")
            ? `Yoo, mate aseɛ! Yɛabue kwan ama wo mfifii 15 mu. Wotumi ka wo phone nɔmba ${callerNumber} kyerɛ agent no.`
            : `Understood! Cash-Out remains enabled for 15 minutes. Tell the agent your number: ${callerNumber}.`;
          addChatTurn({ sender: "ai", text: waitPrompt, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
          setCurrentPrompt(waitPrompt);
          currentPromptRef.current = waitPrompt;
          audioPlaybackController.speakText(waitPrompt).catch(() => {});
          return;
        }
      }

      if (activeStepNameRef.current === "cashout-balance-pin") {
        addLog("caller", "Ignored keypad input during unavailable balance check.");
        activeStepNameRef.current = "cashout-awaiting-agent";
        setActiveStepName("cashout-awaiting-agent");
        const msg = languageRef.current === "twi"
          ? "Yɛrentumi nhwɛ wo balance wɔ assistant yi so seesei. Fa wo fon bɔ star, baako, nson, hwee, hash."
          : "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset.";
        addChatTurn({ sender: "ai", text: msg, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
        setCurrentPrompt(msg);
        currentPromptRef.current = msg;
        audioPlaybackController.speakText(msg).catch(() => {});
        return;
      }

      if (activeStepNameRef.current === "cashout-awaiting-agent" && digit === "1") {
        addLog("caller", "Keypad 1: Agent has completed entry, checking request...");
        api.getPendingCashOutRequest(callerNumber).then(async (pending) => {
          let req = pending?.request;
          if (!req) {
            const sim = await api.simulateAgentCashOutRequest({
              callerPhone: callerNumber,
              agentCode: "284910",
              agentName: "Kofi Mensah Enterprise (MoMo Agent)",
              amount: 50.0,
            });
            req = sim.request;
          }
          activeStepNameRef.current = "cashout-confirm-approval";
          setActiveStepName("cashout-confirm-approval");
          const readback = (languageRef.current === "twi")
            ? `MoMo Agent ${req.agentName} rebisa sɛ obeyi sika ${req.amount.toFixed(2)} cedis afiri wo account mu. Wopene so? (1=Pene so, 2=Twa mu)`
            : `MoMo Agent ${req.agentName} is requesting a withdrawal of ${req.amount.toFixed(2)} Cedis. Do you approve? (1=Approve, 2=Reject)`;
          addChatTurn({ sender: "ai", text: readback, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
          setCurrentPrompt(readback);
          currentPromptRef.current = readback;
          audioPlaybackController.speakText(readback).catch(() => {});
        });
        return;
      }

      if (activeStepNameRef.current === "waiting-confirmation") {
        if (digit === "0") {
          await dispatchVoiceWebhook(targetCallback, { dtmfDigits: "0" });
          return;
        }
        if (digit === "1") {
          await dispatchVoiceWebhook(targetCallback, { dtmfDigits: "1" });
          return;
        }
        addLog("caller", `Ignored key '${digit}' while waiting for provider status.`);
        return;
      }

      // Special Handling 3: Keypad '1' during safe-confirmation
      const isTransferConfirmStep =
        activeStepNameRef.current === "safe-confirmation" ||
        activeStepNameRef.current === "safe-outcome" ||
        activeStepNameRef.current === "transaction-confirm" ||
        activeStepNameRef.current === "confirm" ||
        activeStepNameRef.current === "confirm-speech" ||
        activeStepNameRef.current.includes("confirm");
      if (digit === "1" && isTransferConfirmStep) {
        setDigitsBuffer("");
        addLog("caller", "Keypad '1' confirmed transaction. Moving to PIN entry.");
        startPinAuthorizationFlow();
        return;
      }

      // Special Handling: Direct 4-Digit PIN Entry on Keypad (Accessible Mode for Blind & Elderly Users)
      const isPinStep =
        activeStepNameRef.current === "enter-pin" ||
        activeStepNameRef.current === "verify-pin" ||
        activeStepNameRef.current === "pin-authorization" ||
        activeStepNameRef.current.includes("pin") ||
        activeStepNameRef.current.includes("auth");

      if (isPinStep) {
        if (digit === activeFinishOnKey || digit === "#") {
          if (digitsBuffer.length >= 4) {
            const submitted = digitsBuffer.slice(0, 4);
            setDigitsBuffer("****");
            addLog("caller", "Keypad PIN: ****# (Zero-Log Enforced)");
            setCallStatus("Verifying PIN");
            dispatchVoiceWebhook(
              `/api/simulator/verify-pin?sessionId=${encodeURIComponent(sessionIdRef.current || sessionId)}&lang=${languageRef.current || "en"}&accessiblePin=1`,
              { dtmfDigits: submitted, accessiblePin: "1" }
            );
          }
          return;
        }

        if (/^\d$/.test(digit)) {
          const nextBuf = digitsBuffer + digit;
          setDigitsBuffer(nextBuf);
          addLog("caller", `Keypad PIN digit entered (${Math.min(nextBuf.length, 4)}/4)`);
          if (nextBuf.length >= 4) {
            setTimeout(() => {
              setDigitsBuffer("****");
              addLog("caller", "Keypad PIN: **** (Zero-Log Enforced)");
              setCallStatus("Verifying PIN");
              dispatchVoiceWebhook(
                `/api/simulator/verify-pin?sessionId=${encodeURIComponent(sessionIdRef.current || sessionId)}&lang=${languageRef.current || "en"}&accessiblePin=1`,
                { dtmfDigits: nextBuf.slice(0, 4), accessiblePin: "1" }
              );
            }, 300);
          }
        }
        return;
      }

      // Multi-digit input with finish on key (#)
      if (digit === activeFinishOnKey) {
        if (digitsBuffer.trim()) {
          const submitted = digitsBuffer.trim();
          setDigitsBuffer("");
          addLog("caller", `Keypad '${submitted}#'`);
          dispatchVoiceWebhook(targetCallback, { dtmfDigits: submitted });
        }
        return;
      }

      if (digitsBuffer.length >= 16) return;
      const nextBuf = digitsBuffer + digit;
      setDigitsBuffer(nextBuf);

      const callbackStep = targetCallback.split("?")[0].split("/").pop()?.toLowerCase() || "";
      const isMultiDigitField = ["verify-recipient", "verify-amount"].includes(callbackStep);
      const isAccumulatingInput =
        isMultiDigitField || nextBuf.startsWith("0") || nextBuf.startsWith("233");

      if (activeNumDigits === 1 && !isAccumulatingInput) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${digit}'`);
        dispatchVoiceWebhook(targetCallback, { dtmfDigits: digit });
        return;
      }

      if (!isMultiDigitField && !activeFinishOnKey && nextBuf.length >= activeNumDigits) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${nextBuf}'`);
        dispatchVoiceWebhook(targetCallback, { dtmfDigits: nextBuf });
      }
    },
    [
      activeCallbackUrl,
      activeFinishOnKey,
      activeNumDigits,
      digitsBuffer,
      dispatchVoiceWebhook,
      getFallbackCallbackUrl,
      startCall,
      addLog,
      addChatTurn,
    ]
  );

  // Physical keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      const key = e.key;
      if (/^[0-9]$/.test(key) || key === "#" || key === "*") {
        e.preventDefault();
        handleKeypadPress(key);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeypadPress]);

  // Push-to-Talk (PTT) & Mic Toggle
  const [isPushToTalkHeld, setIsPushToTalkHeld] = useState<boolean>(false);

  const startPushToTalk = useCallback(() => {
    if (!callActiveRef.current || zeroPinOverlayRef.current || isAudioSpeaking) return;
    audioPlaybackController.unlockAudio();
    setIsPushToTalkHeld(true);
    setIsMicMuted(false);
    isMicMutedRef.current = false;
    continuousAudioEngine.setZeroPinMuted(false);
    continuousAudioEngine.startAlwaysOnMic(languageRef.current || "en", activeStepName);
    addLog("asr", "🎙️ Push-to-Talk active: recording speech for Whisper ASR...");
  }, [isAudioSpeaking, activeStepName, addLog]);

  const stopPushToTalk = useCallback(() => {
    if (!isPushToTalkHeld) return;
    setIsPushToTalkHeld(false);
    addLog("asr", "🎙️ Push-to-Talk released.");
  }, [isPushToTalkHeld, addLog]);

  // Toggle mic
  const toggleMic = () => {
    audioPlaybackController.unlockAudio();
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    continuousAudioEngine.setZeroPinMuted(nextState);
    if (nextState) {
      addLog("caller", "Microphone muted.");
    } else {
      continuousAudioEngine.startAlwaysOnMic(language || "en", activeStepName);
      addLog("caller", "Microphone unmuted (live).");
    }
  };

  // Replay a prompt's audio
  const handleReplayPrompt = (audioUrl?: string | null, text?: string) => {
    audioPlaybackController.unlockAudio();
    const playbackUrl = resolvePlayableSimulatorAudioUrl(audioUrl, language || "en");
    if (playbackUrl) {
      audioPlaybackController.play(playbackUrl, text || currentPrompt).then((played) => {
        if (!played) {
          setTestAudioStatus("Audio unavailable; no approved recording could be played.");
          addLog("audio", "Prompt replay failed; no alternate recording was selected.");
        }
      }).catch((error) => {
        console.error("[PhoneSimulator] Prompt replay failed.", error);
        setTestAudioStatus("Audio unavailable; no approved recording could be played.");
      });
    } else {
      setTestAudioStatus("Audio unavailable; no approved recording could be played.");
    }
  };

  // Test sound output
  const handleTestAudio = async () => {
    audioPlaybackController.unlockAudio();
    setTestAudioStatus("Testing sound...");
    try {
      const testUrl = resolvePlayableSimulatorAudioUrl(
        resolveSimulatorPrompt("welcome", "twi"),
        "twi"
      );
      const ok = await audioPlaybackController.play(testUrl || "", "Akwaaba Ɔkwankyerɛfo Pa.");
      if (ok) {
        setTestAudioStatus("Audio playing successfully!");
      } else {
        setTestAudioStatus("Audio unavailable; no verified welcome recording is installed.");
      }
      setTimeout(() => setTestAudioStatus(""), 4000);
    } catch {
      setTestAudioStatus("Audio check error");
      setTimeout(() => setTestAudioStatus(""), 3000);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-4 space-y-4">
      {/* ── Top Header & Telephony Status Bar ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                Ɔkwankyerɛfo Pa Voice MoMo Simulator
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                MTN MoMo Telephony
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live Ghanaian Akan Twi &amp; English ASR with Phonetic Pronunciation Tolerance
            </p>
          </div>
        </div>

        {/* Status badges & Audio Test */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                callActive ? "bg-emerald-400 animate-ping" : "bg-slate-500"
              }`}
            />
            <span className="text-slate-300 font-medium">
              {callActive ? `In Call (${formatTimer(callDuration)})` : "Handset Idle"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
            <Volume2
              className={`w-3.5 h-3.5 ${
                isAudioSpeaking ? "text-teal-400 animate-bounce" : "text-slate-400"
              }`}
            />
            <span>{isAudioSpeaking ? "Audio Speaking" : "Audio Ready"}</span>
          </div>

          <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
            <span className="text-slate-500">Mode </span>
            {interactionMode === "UNSELECTED" ? "Awaiting meaningful input" : interactionMode.replaceAll("_", " ")}
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-slate-500">State </span>{conversationState}
          </div>

          <button
            type="button"
            onClick={handleTestAudio}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white font-medium px-3 py-1.5 rounded-xl shadow transition-colors cursor-pointer text-xs"
            title="Test sound output"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Test Sound</span>
          </button>

          {testAudioStatus && (
            <span className="text-[11px] text-teal-300 font-mono animate-fade-in">
              {testAudioStatus}
            </span>
          )}
        </div>
      </div>

      {/* ── Main Two-Column Layout (Handset + Chat Terminal) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ════ LEFT COLUMN: Traditional Phone Handset (Col 5) ════ */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[340px] bg-slate-950 border-2 border-emerald-500/60 rounded-[36px] p-4 shadow-2xl text-slate-100 flex flex-col items-center relative">
            {/* Top Earpiece Slit */}
            <div className="w-16 h-1.5 bg-slate-800 rounded-full mb-3" />

            {/* Handset OLED Screen */}
            <div className="w-full bg-slate-900 border border-emerald-500/30 rounded-2xl p-3 flex flex-col justify-between min-h-[190px] shadow-inner relative overflow-hidden">
              {/* Screen Top Status Header */}
              <div className="flex items-center justify-between text-[11px] text-emerald-400 font-mono border-b border-slate-800 pb-1.5 mb-2">
                <span className="font-semibold tracking-wide">MTN GH 4G</span>
                <span>{clock}</span>
                <span>{callActive ? formatTimer(callDuration) : "00:00"}</span>
                <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-600/40 font-bold">
                  {language ? language.toUpperCase() : "BI"}
                </span>
              </div>

              {/* Center Display: Digits or State */}
              <div className="my-auto py-1 text-center w-full">
                {(activeStepName.includes("pin") || activeStepName.includes("auth") || callStatus === "Verifying PIN") ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 w-full px-2 py-1">
                    <div className="flex items-center justify-between w-full text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        <span>{callStatus === "Verifying PIN" ? "Verifying MoMo PIN..." : "Enter MoMo PIN"}</span>
                      </span>
                      <span className="bg-emerald-950/80 px-1.5 py-0.5 rounded text-emerald-300 border border-emerald-600/40 font-mono">
                        {Math.min(digitsBuffer.length, 4)} / 4 digits
                      </span>
                    </div>
                    {/* Visual PIN dots */}
                    <div className="flex items-center justify-center gap-3 py-2 w-full bg-slate-950/80 rounded-lg border border-emerald-500/30">
                      {[0, 1, 2, 3].map((idx) => (
                        <div
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                            idx < digitsBuffer.length
                              ? "bg-emerald-400 border-emerald-300 scale-110 shadow-sm shadow-emerald-400/50"
                              : "border-slate-600 bg-slate-900/60"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between w-full text-[10px] text-slate-400">
                      <span className="text-amber-400/90 font-medium">
                        {callStatus === "Verifying PIN" ? (
                          <span className="flex items-center gap-1 text-emerald-300 animate-pulse font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block mr-1" />
                            Validating PIN with MoMo Switch...
                          </span>
                        ) : (
                          "Type 4-digit PIN on keypad or say aloud"
                        )}
                      </span>
                      <span className="font-mono text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-700/40">Secure PIN</span>
                    </div>
                  </div>
                ) : activeStepName === "transfer-success" || callStatus === "Completed" ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 w-full px-2 py-1">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Transfer Completed
                    </span>
                    <span className="text-[10px] text-slate-300 font-mono text-center px-1 leading-tight line-clamp-2">
                      {currentPrompt || "Payment authorized & completed successfully."}
                    </span>
                  </div>
                ) : activeStepName === "verify-recipient" || activeStepName === "recipient-verify-choice" ? (
                  <div className="flex flex-col items-center justify-center gap-1 w-full px-1">
                    <div className="flex items-center justify-between w-full text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                      <span>Confirm Recipient</span>
                      <span className="bg-emerald-950/80 px-1.5 py-0.5 rounded text-emerald-300 border border-emerald-600/40 font-mono">
                        1-Key Choice
                      </span>
                    </div>
                    <div className="text-sm font-bold text-emerald-300 font-sans truncate px-2 py-1.5 bg-slate-950/80 rounded-lg border border-emerald-500/30 w-full text-center">
                      {brainDraftRef.current?.slots?.recipient?.name || "Recipient Verified"}
                    </div>
                    <div className="flex items-center justify-between w-full text-[10px] text-slate-400">
                      <span className="text-amber-400/90 font-medium">1=Confirm, 2=Re-enter</span>
                      <span className="font-mono text-emerald-400">Recipient Verification</span>
                    </div>
                  </div>
                ) : activeStepName.includes("recipient") ? (
                  <div className="flex flex-col items-center justify-center gap-1 w-full px-1">
                    <div className="flex items-center justify-between w-full text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                      <span>Recipient phone number</span>
                      <span className="bg-emerald-950/80 px-1.5 py-0.5 rounded text-emerald-300 border border-emerald-600/40">
                        {digitsBuffer.replace(/\D/g, "").length} / 10 digits
                      </span>
                    </div>
                    <div className="text-xl font-bold tracking-widest text-emerald-300 font-mono w-full bg-slate-950/80 py-1.5 px-2 rounded-lg border border-emerald-500/30">
                      {digitsBuffer ? digitsBuffer : <span className="text-slate-500 tracking-normal text-xs">Enter 10 digits</span>}
                    </div>
                    <div className="flex items-center justify-between w-full text-[10px] text-slate-400">
                      <span className="text-amber-400/90 font-medium animate-pulse">Waiting for # to submit</span>
                      <span className="font-mono text-emerald-400">Phone Entry</span>
                    </div>
                  </div>
                ) : activeStepName.includes("amount") ? (
                  <div className="flex flex-col items-center justify-center gap-1 w-full px-1">
                    <div className="flex items-center justify-between w-full text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
                      <span>Transfer amount</span>
                      <span className="text-slate-400 text-[9px]">* for pesewas</span>
                    </div>
                    <div className="text-xl font-bold tracking-widest text-emerald-300 font-mono w-full bg-slate-950/80 py-1.5 px-2 rounded-lg border border-emerald-500/30">
                      {digitsBuffer ? `GHS ${digitsBuffer.replace("*", ".")}` : <span className="text-slate-500 tracking-normal text-xs">GHS 0.00</span>}
                    </div>
                    <div className="flex items-center justify-between w-full text-[10px] text-slate-400">
                      <span className="text-amber-400/90 font-medium animate-pulse">Waiting for # to submit</span>
                      <span className="font-mono text-emerald-400">Amount Entry</span>
                    </div>
                  </div>
                ) : digitsBuffer ? (
                  <div className="text-2xl font-bold tracking-widest text-emerald-300 font-mono truncate px-2">
                    {digitsBuffer}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="text-[11px] uppercase tracking-wider text-emerald-400/80 font-medium">
                      {callStatus}
                    </span>
                    {callActive && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {STEP_FRIENDLY_NAMES[activeStepName] || activeStepName}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Active AI Reasoning Loader Indicator */}
              {isAiReasoning && (
                <div className="bg-emerald-950/70 rounded-xl p-2.5 border border-emerald-500/50 text-emerald-200 flex items-center justify-between gap-2 shadow-lg shadow-emerald-950/50 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <div>
                      <div className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span>Gemini Reasoning</span>
                        <span className="font-mono text-xs text-emerald-400">({reasoningSec}s / 20s)</span>
                      </div>
                      <p className="text-[10px] text-emerald-400/80 leading-tight">
                        {reasoningSec >= 10
                          ? "Stalling comfort prompt delivered: evaluating speech..."
                          : "Processing voice, context & arithmetic..."}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-700/60 text-emerald-300">
                      {Math.max(0, 20 - reasoningSec)}s left
                    </span>
                  </div>
                </div>
              )}

              {/* Active Prompt Card with Replay Button */}
              <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800/80 flex items-start justify-between gap-2 text-slate-200">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mb-0.5">
                    <Volume2 className="w-3 h-3" />
                    <span>Prompt Selected</span>
                  </div>
                  <p className="text-[11px] leading-tight line-clamp-2 text-slate-300 font-sans">
                    {currentPrompt}
                  </p>
                </div>
                {callActive && (
                  <button
                    type="button"
                    onClick={() => handleReplayPrompt(activePlayUrl, currentPrompt)}
                    className="p-1 rounded-lg bg-emerald-900/40 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 transition-colors shrink-0 cursor-pointer"
                    title="Re-listen to prompt"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Amplified Audio Volume Indicator & Booster */}
              <div className="bg-slate-950/70 rounded-lg px-2.5 py-1.5 border border-slate-800/90 flex items-center justify-between text-[10px] mt-1.5">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-slate-300 font-medium">Master volume:</span>
                  <span className="font-mono text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
                    {volumeMultiplier.toFixed(1)}x
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[1.0, 1.5, 2.0].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleSetVolume(v)}
                      className={`px-1.5 py-0.5 rounded font-mono text-[9px] border cursor-pointer transition-all ${
                        Math.abs(volumeMultiplier - v) < 0.1
                          ? "bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-700/80 hover:text-slate-200"
                      }`}
                      title={`Set voice volume to ${v}x`}
                    >
                      {v}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Soft Keys Under Screen */}
            <div className="w-full flex items-center justify-between mt-3 px-1">
              <button
                type="button"
                onMouseDown={startPushToTalk}
                onMouseUp={stopPushToTalk}
                onTouchStart={startPushToTalk}
                onTouchEnd={stopPushToTalk}
                onClick={toggleMic}
                disabled={!callActive}
                title="Hold down for Push-to-Talk (Whisper ASR) or click to toggle mic"
                aria-label={isPushToTalkHeld ? "Release to stop speaking" : isMicMuted ? "Unmute microphone" : "Mute microphone"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border select-none ${
                  isPushToTalkHeld
                    ? "bg-rose-950/80 border-rose-500/90 text-rose-200 ring-2 ring-rose-500/50 scale-105 shadow-md shadow-rose-500/20"
                    : isAudioSpeaking
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                    : isMicMuted
                    ? "bg-slate-800/80 border-slate-600/50 text-slate-300 hover:bg-slate-800"
                    : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/20"
                } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
              >
                {isPushToTalkHeld ? (
                  <Radio className="w-3.5 h-3.5 animate-spin text-rose-400" />
                ) : isAudioSpeaking || isMicMuted ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className={`w-3.5 h-3.5 ${callActive ? "animate-pulse text-emerald-400" : ""}`} />
                )}
                <span>
                  {isPushToTalkHeld
                    ? "Speaking (PTT)..."
                    : isAudioSpeaking
                    ? "Mic OFF (Audio Playing)"
                    : isMicMuted
                    ? "Push-to-Talk / Mic OFF"
                    : "Push-to-Talk / Mic ON"}
                </span>
              </button>

              <div className="text-[11px] text-slate-400 font-mono">
                {activeNumDigits > 1 ? `Enter #${activeFinishOnKey}` : "1-Key Choice"}
              </div>
            </div>

            {/* Green Call & Red End Keys */}
            <div className="w-full grid grid-cols-2 gap-3 mt-3">
              <button
                type="button"
                onClick={startCall}
                disabled={callActive}
                aria-label="Start Call"
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl min-h-[44px] shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              >
                <Phone className="w-4 h-4 fill-current" />
                <span>Call</span>
              </button>

              <button
                type="button"
                onClick={() => endCall("User pressed End Call key")}
                disabled={!callActive}
                aria-label="End Call"
                className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl min-h-[44px] shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              >
                <PhoneOff className="w-4 h-4 fill-current" />
                <span>End</span>
              </button>
            </div>

            {/* 4x3 Keypad Grid with Dual-Tone Audio */}
            <div className="w-full grid grid-cols-3 gap-2 mt-4">
              {KEYPAD_BUTTONS.map(({ digit, sub }) => {
                const isPulsing = activeKeypadPulse === digit;
                return (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeypadPress(digit)}
                    className={`border rounded-xl py-2 flex flex-col items-center justify-center shadow transition-all cursor-pointer select-none ${
                      isPulsing
                        ? "bg-emerald-500 text-white border-emerald-300 ring-4 ring-emerald-400/80 scale-105 shadow-lg shadow-emerald-500/50"
                        : "bg-slate-900 hover:bg-slate-800 active:bg-emerald-700 active:text-white text-slate-100 border-slate-800"
                    }`}
                  >
                    <span className="text-base font-bold leading-none">{digit}</span>
                    {sub && (
                      <span
                        className={`text-[9px] uppercase mt-0.5 ${
                          isPulsing ? "text-emerald-100 font-bold" : "text-slate-400"
                        }`}
                      >
                        {sub}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Mic Grille */}
            <div className="flex gap-1.5 mt-4">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            </div>
          </div>
        </div>

        {/* ════ RIGHT COLUMN: Interactive Chat & Voice ASR Terminal (Col 7) ════ */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* MoMo Cash-Out (Withdrawal) & Agent Flow Test Control */}
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-emerald-950/40 border border-amber-500/30 rounded-2xl p-3 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🏧</span>
                <span className="text-xs font-bold text-amber-300">
                  MoMo Cash-Out (Withdrawal) &amp; Agent Approval Flow
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  cashOutActive
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}>
                  {cashOutActive ? `🟢 Allow Cash-Out Active (15m)` : `⚪ Cash-Out Inactive`}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 text-[11px]">Wallet Balance:</span>
                <button
                  type="button"
                  onClick={async () => {
                    const nextBal = walletBalance === 30.0 ? 250.0 : 30.0;
                    setWalletBalance(nextBal);
                    await api.setCashOutWalletBalance({ callerPhone: callerNumber, balance: nextBal });
                    addLog("state", "Updated the test wallet balance.");
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-600/40 font-mono text-[11px] font-bold transition-colors cursor-pointer"
                  title="Click to toggle between GH₵30.00 and GH₵250.00"
                >
                  GH₵ {walletBalance.toFixed(2)} {walletBalance === 30.0 ? "(Tight/Shortage)" : "(Sufficient)"}
                </button>
              </div>
            </div>

            {/* Audio-aligned MoMo transfer guide */}
            <div className="bg-slate-900/90 border border-emerald-900/40 rounded-2xl p-3 shadow-md mb-3">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>MoMo Audio Flow Guide</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  Active: {activeStepName || "idle"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {MONEY_TRANSFER_FLOW_STEPS
                  .filter((step) => step.flowType === "NORMAL" && step.category !== "recovery")
                  .map((step) => {
                  const selectedAudio = language === "en" ? step.defaultAudioEn : step.defaultAudioTwi;
                  const audioFilename = selectedAudio.split("/").pop() || selectedAudio;
                  const activeFilename = activePlayUrl?.split("/").pop()?.toLowerCase();
                  const isActive = Boolean(activeFilename && activeFilename === audioFilename.toLowerCase());
                  const title = language === "en" ? step.titleEn : step.titleTwi;
                  const transcript = language === "en" ? step.transcriptEn : step.transcriptTwi;
                  const audioSequence = step.audioSequenceTwi || [audioFilename];
                  return (
                    <div
                      key={step.id}
                      className={`p-2 rounded-lg border text-[10px] transition-all ${
                        isActive
                          ? "bg-emerald-950/80 border-emerald-500/80 text-emerald-200 ring-1 ring-emerald-400"
                          : "bg-slate-950/40 border-slate-800/80 text-slate-400"
                      }`}
                      title={`${title}\nAudio: ${audioSequence.join(" -> ")}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-[11px] shrink-0">{step.sequenceOrder}</span>
                        <span className="font-semibold leading-tight">{title}</span>
                      </div>
                      <p className="mt-1.5 text-slate-300 leading-snug">{transcript}</p>
                      <p className="mt-1.5 text-[9px] font-mono text-emerald-300/80 break-words">
                        {audioSequence.join(" -> ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cash-Out Action Chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => simulateVoiceUtterance("Mepɛ sɛ meyi sika")}
                disabled={isSimulatingSpeech}
                title="Twi: Request to withdraw cash at MoMo vendor"
                className="px-2.5 py-1 text-xs bg-amber-950/80 hover:bg-amber-900 active:bg-amber-700 text-amber-200 rounded-lg border border-amber-500/40 font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                🇬🇭 &ldquo;Mepɛ sɛ meyi sika&rdquo; (Twi Cash-Out)
              </button>

              <button
                type="button"
                onClick={() => simulateVoiceUtterance("I want to withdraw 30 cedis")}
                disabled={isSimulatingSpeech}
                title="English: Request to withdraw 30 Cedis"
                className="px-2.5 py-1 text-xs bg-amber-950/80 hover:bg-amber-900 active:bg-amber-700 text-amber-200 rounded-lg border border-amber-500/40 font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                🇬🇧 &ldquo;I want to withdraw 30 cedis&rdquo;
              </button>

              <button
                type="button"
                onClick={() => simulateVoiceUtterance("Yes")}
                disabled={isSimulatingSpeech}
                title="Demonstrate that assistant balance checking is unavailable"
                className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                ✓ &ldquo;Yes, check balance (unavailable)&rdquo;
              </button>

              <button
                type="button"
                onClick={() => simulateVoiceUtterance("No")}
                disabled={isSimulatingSpeech}
                title="Skip balance check and wait for agent"
                className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
              >
                ✕ &ldquo;No, skip&rdquo;
              </button>

              <button
                type="button"
                onClick={() => simulateVoiceUtterance("The agent is done")}
                disabled={isSimulatingSpeech}
                title="Tell AI agent has finished entering withdrawal"
                className="px-2.5 py-1 text-xs bg-sky-950/80 hover:bg-sky-900 text-sky-200 rounded-lg border border-sky-500/40 font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                📲 &ldquo;The agent is done&rdquo;
              </button>

              <button
                type="button"
                onClick={async () => {
                  await api.simulateAgentCashOutRequest({
                    callerPhone: callerNumber,
                    agentCode: "284910",
                    agentName: "Kofi Mensah Enterprise (MoMo Agent)",
                    amount: 50.0,
                  });
                  addLog("state", "MoMo Agent terminal submitted a request.");
                }}
                className="px-2.5 py-1 text-xs bg-teal-950/90 hover:bg-teal-900 text-teal-200 rounded-lg border border-teal-500/40 font-medium transition-colors cursor-pointer"
              >
                🏢 Push Agent Request (GH₵50)
              </button>
            </div>
          </div>

          {/* Quick Ghanaian Speech Action Chips */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Test Spoken Ghanaian Phrases &amp; Pronunciations</span>
              </span>
              <span className="text-[10px] text-slate-500">Click any chip to speak into ASR</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={triggerSilenceTimeout}
                disabled={!callActive}
                title="Rule 3 Test: Trigger OP67 (Please Respond) after 1-minute silence without skipping the step"
                className="px-2.5 py-1 text-xs bg-amber-950/80 hover:bg-amber-900 active:bg-amber-700 text-amber-200 rounded-lg border border-amber-500/60 font-semibold transition-colors cursor-pointer disabled:opacity-40"
              >
                ⏱️ Test 1m Silence (OP67)
              </button>
              {[
                { label: "1 (One)", desc: "Say 'One' -> Mapped to DTMF 1" },
                { label: "2 (Two)", desc: "Say 'Two' -> Mapped to DTMF 2" },
                { label: "3 (Three)", desc: "Say 'Three' -> Mapped to DTMF 3" },
                { label: "English", desc: "Select English (DTMF 1)" },
                { label: "Twi", desc: "Select Akan Twi (DTMF 2)" },
                { label: "Mobile Money", desc: "Service 1 (MoMo)" },
                { label: "MTN", desc: "Network 1 (MTN)" },
                { label: "Send money", desc: "Action 1 (Send Money)" },
                { label: "0543546010", desc: "Full 10-Digit Recipient Phone (OP21)" },
                { label: "0553838464", desc: "10-Digit Recipient Phone" },
                { label: "50 cedis", desc: "Amount 50 Cedis" },
                { label: "Confirm", desc: "Confirm Safe Transfer (1)" },
                { label: "Baako", desc: "Twi 1 (Baako)" },
                { label: "Mmienu", desc: "Twi 2 (Mmienu)" },
                { label: "Aane, pene so", desc: "Twi: Confirm transfer" },
                { label: "Mepɛ sɛ mesoma 50 cedis", desc: "Twi: Send 50 Cedis" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => simulateVoiceUtterance(chip.label)}
                  disabled={isSimulatingSpeech}
                  title={chip.desc}
                  className="px-2.5 py-1 text-xs bg-slate-950 hover:bg-slate-800 active:bg-cyan-700 active:text-white text-slate-200 rounded-lg border border-slate-800 hover:border-cyan-500/40 transition-colors cursor-pointer disabled:opacity-40"
                >
                  💬 {chip.label}
                </button>
              ))}
            </div>

            {/* Custom Spoken Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customSpeechText.trim()) {
                  simulateVoiceUtterance(customSpeechText);
                  setCustomSpeechText("");
                }
              }}
              className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-800/80"
            >
              <input
                type="text"
                value={customSpeechText}
                onChange={(e) => setCustomSpeechText(e.target.value)}
                placeholder="Type or pronounce any Ghanaian phrase (e.g., 'Mepɛ sɛ memane sika kɔ ma Kwame')..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={!customSpeechText.trim() || isSimulatingSpeech}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl shadow transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Speak &amp; Transcribe</span>
              </button>
            </form>
          </div>

          {/* ── Main Chat Terminal Container ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm flex flex-col overflow-hidden h-[540px]">
            {/* Header Tabs: Chat Conversation vs Terminal Log vs ASR Diag */}
            <div className="bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "chat"
                      ? "bg-cyan-950 text-cyan-300 border border-cyan-600/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat Timeline (Voice &amp; Prompts)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("terminal")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "terminal"
                      ? "bg-slate-800 text-slate-200 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>Telephony Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("asr_diag")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "asr_diag"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-600/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>ASR &amp; Phonetics</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("checklist");
                    void syncChecklist();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "checklist"
                      ? "bg-amber-950 text-amber-300 border border-amber-600/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>9-Stage Checklist Gate</span>
                  {checklistData && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        checklistData.isReadyForInitiation
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {checklistData.isReadyForInitiation
                        ? "READY"
                        : `${checklistData.stages?.[checklistData.currentStage]?.order || 1}/9`}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChatTurns([]);
                    setTerminalLogs([]);
                    setRecentStreamingWords([]);
                  }}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* TAB 1: Chat Conversation (Prompt vs Caller Voice Transcription) */}
            {activeTab === "chat" && (
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-950">
                {correctionNotice && (
                  <div role="status" className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-lg px-3 py-2">
                    {correctionNotice}
                  </div>
                )}
                {chatTurns.length === 0 ? (
                  <div className="text-slate-500 italic py-16 text-center text-xs">
                    No conversation turns yet. Press Call or choose a prompt to begin.
                  </div>
                ) : (
                  chatTurns.map((turn) => {
                    const isSystem = turn.sender === "system";
                    const isCaller = turn.sender === "caller";
                    const isDtmf = turn.sender === "dtmf";
                    const isAi = turn.sender === "ai";

                    return (
                      <div
                        key={turn.id}
                        className={`flex flex-col ${
                          isSystem || isAi ? "items-start" : "items-end"
                        } space-y-1`}
                      >
                        {/* Bubble Header */}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                          {isSystem && (
                            <>
                              <span className="font-bold text-teal-400">Ɔkwankyerɛfo Pa IVR</span>
                              {turn.stepName && (
                                <>
                                  <span className="text-slate-500">·</span>
                                  <span className="text-slate-300 font-mono">
                                    {STEP_FRIENDLY_NAMES[turn.stepName] || turn.stepName}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                          {isCaller && (
                            <>
                              <span className="font-bold text-cyan-400">Caller Voice (ASR)</span>
                              <span className="bg-cyan-950 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-800/40">
                                98% Conf
                              </span>
                            </>
                          )}
                          {isDtmf && <span className="font-bold text-emerald-400">Keypad DTMF</span>}
                          {isAi && <span className="font-bold text-amber-400">Telephony Brain</span>}
                          <span>• {turn.time}</span>
                        </div>

                        {/* Bubble Body */}
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow ${
                            isSystem
                              ? "bg-slate-900 border border-teal-500/30 text-slate-100"
                              : isCaller
                              ? "bg-cyan-950/80 border border-cyan-500/40 text-cyan-100"
                              : isDtmf
                              ? "bg-emerald-950/70 border border-emerald-500/40 text-emerald-200"
                              : "bg-amber-950/70 border border-amber-500/40 text-amber-200"
                          }`}
                        >
                          <div className="font-medium text-sm">{turn.text}</div>

                          {/* Raw transcript if corrected */}
                          {turn.rawTranscript && (
                            <div className="mt-1 text-[11px] text-slate-400 italic">
                              Raw spoken: &ldquo;{turn.rawTranscript}&rdquo;
                            </div>
                          )}

                          {/* Phonetic corrections applied badge */}
                          {turn.phoneticRepairs && turn.phoneticRepairs.length > 0 && (
                            <div className="mt-2 pt-1.5 border-t border-cyan-800/50 flex flex-wrap gap-1">
                              {turn.phoneticRepairs.map((r, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-cyan-900/60 text-cyan-200 px-2 py-0.5 rounded-full border border-cyan-500/40 flex items-center gap-1"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-cyan-300" />
                                  <span>
                                    &ldquo;{r.original}&rdquo; ➔ &ldquo;{r.corrected}&rdquo; ({r.reason})
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Expected menu options for System Prompts */}
                          {turn.options && (
                            <div className="mt-2 text-[11px] text-slate-400 font-mono flex items-center gap-1">
                              <span className="text-teal-400">Options:</span> [{turn.options}]
                            </div>
                          )}

                          {/* Audio Controls for System Prompts */}
                          {isSystem && (
                            <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                              <span className="flex items-center gap-1 text-teal-400">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                  {turn.audioSource === "synthesis" ? "Dynamic TTS" : (turn.audioUrl ? "Studio Audio" : "Dynamic TTS")}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReplayPrompt(turn.audioUrl, turn.text)}
                                className="flex items-center gap-1 text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Play Audio</span>
                              </button>
                            </div>
                          )}
                        </div>
                        {isCaller && (
                          <button
                            type="button"
                            onClick={() => {
                              setCorrectionNotice("");
                              setCorrectionDraft({
                                turn,
                                correctedTranscript: turn.text,
                                reason: "wrong_word",
                                consent: false,
                                error: "",
                                submitting: false,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Submit a transcript correction for ASR evaluation"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Correct transcript</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Live Real-Time Interim Transcript Bubble */}
                {interimTranscript && (
                  <div className="flex flex-col items-end space-y-1 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-[10px] text-cyan-300 px-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span className="font-bold">ASR Transcribing Live...</span>
                    </div>
                    <div className="max-w-[85%] rounded-2xl p-3 bg-cyan-950/40 border border-cyan-500/50 text-cyan-200 text-xs shadow-inner">
                      <div className="italic text-sm">{interimTranscript}</div>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>
            )}

            {/* TAB 2: Telephony Terminal Logs */}
            {activeTab === "terminal" && (
              <div className="flex-1 p-4 font-mono text-xs overflow-y-auto bg-slate-950 text-slate-200 space-y-1.5">
                {terminalLogs.length === 0 ? (
                  <div className="text-slate-500 italic py-16 text-center">
                    Terminal idle. Start a call to observe live telephony events.
                  </div>
                ) : (
                  terminalLogs.map((log) => {
                    let badgeClass = "text-slate-400 bg-slate-800";
                    if (log.source === "caller") badgeClass = "text-cyan-300 bg-cyan-950/80 border border-cyan-600/40";
                    if (log.source === "state") badgeClass = "text-sky-300 bg-sky-950/80 border border-sky-600/40";
                    if (log.source === "AI") badgeClass = "text-amber-300 bg-amber-950/80 border border-amber-600/40";
                    if (log.source === "reply") badgeClass = "text-violet-300 bg-violet-950/80 border border-violet-600/40";
                    if (log.source === "audio") badgeClass = "text-teal-300 bg-teal-950/80 border border-teal-600/40";
                    if (log.source === "asr") badgeClass = "text-emerald-300 bg-emerald-950/90 border border-emerald-500/50";

                    return (
                      <div key={log.id} className="flex items-start gap-2 leading-relaxed break-words">
                        <span className="text-slate-500 select-none shrink-0">[{log.time}]</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 ${badgeClass}`}>
                          {log.source}
                        </span>
                        <span className="text-slate-200">{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>
            )}

            {/* TAB 3: ASR & Phonetics Diagnostics */}
            {activeTab === "asr_diag" && (
              <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-xs space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <h3 className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Active Ghanaian ASR Configuration</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                    <div>Primary ASR: <span className="text-emerald-400">UG HCI Lab + Open Vosk</span></div>
                    <div>Phonetic Matcher: <span className="text-emerald-400">ghanaianPhoneticMatcher.ts</span></div>
                    <div>Dialect Coverage: <span className="text-emerald-400">Asante Twi, Akuapem, Fante</span></div>
                    <div>Echo Filter: <span className="text-emerald-400">Active (isAcousticSystemEcho)</span></div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                  <h3 className="font-semibold text-slate-200 text-xs mb-2">
                    Recently Streamed Words (Word-by-Word Live ASR)
                  </h3>
                  {recentStreamingWords.length === 0 ? (
                    <p className="text-slate-500 italic text-[11px]">
                      No words streamed yet. Speak into the mic or click a speech chip above.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {recentStreamingWords.map((item, idx) => (
                        <div
                          key={idx}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-mono ${
                            item.isPhoneticMatch
                              ? "bg-emerald-950 border-emerald-500/50 text-emerald-300"
                              : "bg-slate-950 border-slate-800 text-slate-200"
                          }`}
                        >
                          <span>{item.word}</span>
                          {item.repaired && (
                            <span className="text-emerald-400 font-bold ml-1">➔ {item.repaired}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: 9-Stage Transaction Flow Checklist Gate */}
            {activeTab === "checklist" && (
              <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-xs space-y-4">
                {/* Gate Security Banner */}
                <div
                  className={`rounded-xl p-4 border transition-all ${
                    checklistData?.isReadyForInitiation
                      ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-200"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          checklistData?.isReadyForInitiation
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {checklistData?.isReadyForInitiation ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <ShieldCheck className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-100">
                            {checklistData?.isReadyForInitiation
                              ? "Checklist Gate Cleared: Ready for Initiation"
                              : "9-Stage Transaction Prerequisite Gate Active"}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                              checklistData?.isReadyForInitiation
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            }`}
                          >
                            {checklistData?.isReadyForInitiation ? "STAGE 8 UNLOCKED" : "STAGE 8 LOCKED"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Authoritative invariant: Until all prerequisites (Stages 1 through 7) are satisfied, financial
                          saga execution is blocked. No transactions can trigger on missing or unverified KYC data.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void syncChecklist()}
                      disabled={isSyncingChecklist}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      title="Refresh live checklist status from state cache"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isSyncingChecklist ? "animate-spin" : ""}`} />
                      <span>{isSyncingChecklist ? "Checking..." : "Sync State"}</span>
                    </button>
                  </div>

                  {/* Bilingual Error / Guidance Alert */}
                  {checklistData?.errorFeedback && (
                    <div className="mt-3.5 p-3 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Active Telephony Gate Guidance:</span>
                      </div>
                      <p className="text-[11px]">
                        <strong className="text-amber-100">EN:</strong> {checklistData.errorFeedback.en}
                      </p>
                      <p className="text-[11px]">
                        <strong className="text-amber-100">TWI:</strong> {checklistData.errorFeedback.twi}
                      </p>
                    </div>
                  )}
                </div>

                {/* Canonical 9 Stages Ordered Pipeline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span className="font-semibold uppercase tracking-wider text-slate-300">The 9 Pipeline Stages</span>
                    <span>
                      Active Session ID:{" "}
                      <span className="font-mono text-cyan-400">{sessionId || "No Session (Dial to Begin)"}</span>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {[
                      {
                        id: "STAGE_1_LANGUAGE",
                        num: 1,
                        name: "Language Selection",
                        spec: "English or Akan Twi (Asante / Akuapem / Fante)",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_2_SERVICE",
                        num: 2,
                        name: "Supported Service",
                        spec: "Mobile Money Transfer verified",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_3_NETWORKS",
                        num: 3,
                        name: "Network Provider",
                        spec: "MTN, Telecel, or AirtelTigo selected",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_4_RECIPIENT",
                        num: 4,
                        name: "Recipient Mobile Number",
                        spec: "Validated 10-digit Ghana mobile number",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_5_AMOUNT",
                        num: 5,
                        name: "Amount Entry",
                        spec: "Validated transaction amount (GHS 1.00 – 5,000.00)",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_6_REFERENCE_KYC",
                        num: 6,
                        name: "Check for Reference (Telco KYC)",
                        spec: "Telco subscriber name lookup & audio verification readback",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_7_PIN_GATE",
                        num: 7,
                        name: "PIN Gate Security",
                        spec: "Zero-PIN handset prompt gate (Buffered until #)",
                        type: "Prerequisite",
                      },
                      {
                        id: "STAGE_8_INITIATE_TRANSACTION",
                        num: 8,
                        name: "Initiate Transaction",
                        spec: "Dispatches Authoritative MoMo Payment Saga",
                        type: "Gated Action",
                      },
                      {
                        id: "STAGE_9_REPORT_STATE",
                        num: 9,
                        name: "Report Back State",
                        spec: "Final transaction receipt & telco reference delivery",
                        type: "Outcome",
                      },
                    ].map((step) => {
                      const stageInfo = checklistData?.stages?.[step.id];
                      const isCompleted = Boolean(stageInfo?.completed);
                      const isCurrent = checklistData?.currentStage === step.id;
                      const valDesc = stageInfo?.valueDescription;

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            isCompleted
                              ? "bg-slate-900/90 border-emerald-500/40 text-slate-200"
                              : isCurrent
                              ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-100 shadow-sm shadow-cyan-900/20"
                              : "bg-slate-900/40 border-slate-800/70 text-slate-400 opacity-75"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-colors ${
                                isCompleted
                                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                                  : isCurrent
                                  ? "bg-cyan-500 text-slate-950 animate-pulse"
                                  : "bg-slate-800 text-slate-400 border border-slate-700"
                              }`}
                            >
                              {isCompleted ? "✓" : step.num}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold text-xs ${isCompleted ? "text-slate-100" : isCurrent ? "text-cyan-200" : "text-slate-300"}`}>
                                  {step.name}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase tracking-wider ${
                                    step.type === "Prerequisite"
                                      ? "bg-slate-800 text-slate-400 border border-slate-700"
                                      : step.type === "Gated Action"
                                      ? "bg-amber-950 text-amber-300 border border-amber-800/60"
                                      : "bg-indigo-950 text-indigo-300 border border-indigo-800/60"
                                  }`}
                                >
                                  {step.type}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{step.spec}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {valDesc ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-600/40">
                                {valDesc}
                              </span>
                            ) : isCurrent ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 animate-pulse">
                                Current Stage
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] text-slate-400 bg-slate-800 border border-slate-700">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Terminal Live Word Stream Footer */}
            <div className="bg-slate-950 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {isAudioSpeaking ? "System speaking prompt..." : "Listening for voice transcription..."}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                <span>0ms Latency Preloaded</span>
                <span>•</span>
                <span>Zero-PIN Protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {correctionDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !correctionDraft.submitting) setCorrectionDraft(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="asr-correction-title"
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="asr-correction-title" className="text-base font-semibold text-slate-100">Correct transcript</h2>
                <p className="text-xs text-slate-400 mt-1">The correction is separate from the active call and will not change this transaction.</p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionDraft(null)}
                disabled={correctionDraft.submitting}
                className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 disabled:opacity-50"
                aria-label="Close transcript correction"
              >
                ×
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!correctionDraft.consent || !sessionId || !correctionDraft.correctedTranscript.trim()) return;

                setCorrectionDraft((current) => current ? { ...current, submitting: true, error: "" } : current);
                try {
                  const response = await fetch("/api/ai/asr/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sessionId,
                      provider: "phone-simulator",
                      language: language === "twi" ? "twi" : "eng",
                      originalTranscript: correctionDraft.turn.rawTranscript || correctionDraft.turn.text,
                      correctedTranscript: correctionDraft.correctedTranscript.trim(),
                      reason: correctionDraft.reason,
                      userConsent: true,
                    }),
                  });
                  const result = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(result.error || "Correction could not be submitted.");
                  setCorrectionDraft(null);
                  setCorrectionNotice("Correction submitted for ASR evaluation. It does not update the live model automatically.");
                } catch (error) {
                  setCorrectionDraft((current) => current ? {
                    ...current,
                    submitting: false,
                    error: error instanceof Error ? error.message : "Correction could not be submitted.",
                  } : current);
                }
              }}
            >
              <div>
                <label htmlFor="asr-correction-text" className="block text-xs font-medium text-slate-300 mb-1.5">Corrected words</label>
                <textarea
                  id="asr-correction-text"
                  value={correctionDraft.correctedTranscript}
                  onChange={(event) => setCorrectionDraft((current) => current ? { ...current, correctedTranscript: event.target.value } : current)}
                  rows={3}
                  maxLength={1000}
                  required
                  className="w-full resize-y bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label htmlFor="asr-correction-reason" className="block text-xs font-medium text-slate-300 mb-1.5">Correction type</label>
                <select
                  id="asr-correction-reason"
                  value={correctionDraft.reason}
                  onChange={(event) => setCorrectionDraft((current) => current ? { ...current, reason: event.target.value as AsrFeedbackReason } : current)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="wrong_word">Wrong word</option>
                  <option value="wrong_name">Name</option>
                  <option value="wrong_number">Number</option>
                  <option value="wrong_language">Language</option>
                  <option value="missed_speech">Missed speech</option>
                  <option value="noise">Noise</option>
                  <option value="code_switching">Code-switching</option>
                  <option value="accent">Accent</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-300">
                <input
                  type="checkbox"
                  checked={correctionDraft.consent}
                  onChange={(event) => setCorrectionDraft((current) => current ? { ...current, consent: event.target.checked } : current)}
                  className="mt-0.5 accent-cyan-500"
                />
                <span>I agree to store this transcript correction for ASR evaluation and possible future model improvement. Do not include a PIN, password, or other secret.</span>
              </label>

              {correctionDraft.error && <p role="alert" className="text-xs text-red-300">{correctionDraft.error}</p>}
              {!sessionId && <p className="text-xs text-amber-300">Start a simulator session before submitting feedback.</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectionDraft(null)}
                  disabled={correctionDraft.submitting}
                  className="px-3 py-2 text-xs text-slate-300 hover:text-white border border-slate-700 rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!correctionDraft.consent || !sessionId || !correctionDraft.correctedTranscript.trim() || correctionDraft.submitting}
                  className="px-3 py-2 text-xs font-medium text-white bg-cyan-700 hover:bg-cyan-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {correctionDraft.submitting ? "Submitting…" : "Submit correction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ── Developer Diagnostics View (Collapsible) ── */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900">
        <button
          type="button"
          onClick={() => setShowDevView((prev) => !prev)}
          className="w-full px-4 py-3 bg-slate-950 hover:bg-slate-900 flex items-center justify-between text-left text-xs font-semibold text-slate-300 cursor-pointer"
        >
          <span>Developer Telephony Diagnostics &amp; Raw VoiceXML</span>
          {showDevView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDevView && (
          <div className="p-4 bg-slate-950 text-slate-300 font-mono text-xs border-t border-slate-800 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500">Session ID:</span>{" "}
                <span className="text-emerald-400">{sessionId || "none"}</span>
              </div>
              <div>
                <span className="text-slate-500">Callback URL:</span>{" "}
                <span className="text-emerald-400">{activeCallbackUrl || "none"}</span>
              </div>
              <div>
                <span className="text-slate-500">Expected Digits:</span>{" "}
                <span className="text-emerald-400">{activeNumDigits}</span>
              </div>
              <div>
                <span className="text-slate-500">Finish Key:</span>{" "}
                <span className="text-emerald-400">{activeFinishOnKey}</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Latest VoiceXML Response:</div>
              <pre className="p-3 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto text-emerald-300 max-h-40">
                {rawVoiceXml || "<!-- No VoiceXML captured yet -->"}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhoneSimulatorPage;
