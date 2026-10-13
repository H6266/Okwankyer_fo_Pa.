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
  ShieldCheck,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Terminal as TerminalIcon,
  Activity,
  Layers,
  Send,
  HelpCircle,
  Radio,
  Clock,
  Check,
  Brain,
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
import { continuousAudioEngine, ContinuousAudioState } from "../../audio/continuousAudioEngine";
import { AcousticVisualizer } from "../../components/audio/AcousticVisualizer";
import { normalizeSpokenDigits } from "../../ai_system/speech/acousticModels/ghanaAcousticDataset";
import {
  repairGhanaianPronunciation,
  extractStreamingWords,
  PhoneticCorrection,
} from "../../ai_system/speech/asr/ghanaianPhoneticMatcher";
import { normalizeGhanaPhoneNumber } from "../../domain/validation";
import { numberDecoder } from "../../ai_system/speech/asr/numberDecoder";

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
  audioUrl?: string | null;
  audioSource?: "studio" | "synthesis" | "dtmf" | null;
  options?: string;
  phoneticRepairs?: PhoneticCorrection[];
  rawTranscript?: string;
  confidence?: number;
}

interface ParsedVoiceXml {
  raw: string;
  redirectUrl?: string;
  isReject: boolean;
  httpStatus?: number;
  guardReason?: string;
  playUrl?: string;
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

const STEP_OPTIONS_MAP: Record<string, string> = {
  "voice-menu": "1=English, 2=Twi, 0=Exit",
  "language-selection": "1=English, 2=Twi, 0=Exit",
  "service-select": "1=Mobile Money, 2=Banking, 9=Repeat, 0=Exit",
  "service-choice": "1=Mobile Money, 2=Banking, 9=Repeat, 0=Exit",
  "provider-select": "1=MTN, 9=Repeat, 0=Exit",
  "provider-choice": "1=MTN, 9=Repeat, 0=Exit",
  "action-select": "1=Send Money, 8=Back, 9=Repeat, 0=Exit",
  "action-choice": "1=Send Money, 8=Back, 9=Repeat, 0=Exit",
  "enter-recipient": "10-digit number followed by #",
  "verify-recipient": "10-digit number followed by #",
  "recipient-verify-choice": "1=Confirm, 2=Re-enter, 8=Back, 9=Repeat",
  "enter-amount": "Amount in Cedis followed by # (* for pesewas)",
  "verify-amount": "Amount followed by #",
  "safe-confirmation": "1=Confirm Transfer, 2=Edit, 9=Repeat, 0=Cancel",
  "safe-outcome": "1=Confirm Transfer, 0=Cancel",
  "pin-authorization": "Speak 4-digit PIN aloud or enter via Keypad (0=Cancel)",
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
  "pin-authorization": "MoMo PIN Authorization (Voice & Keypad)",
  "action-select": "Supported Action (Send Money)",
  "action-choice": "Action Choice",
  "enter-recipient": "Recipient Phone Entry",
  "verify-recipient": "Verify Recipient Phone",
  "recipient-verify-choice": "Confirm Recipient Name",
  "enter-amount": "Amount Entry",
  "verify-amount": "Verify Amount",
  "safe-confirmation": "Safe Transfer Confirmation",
  "safe-outcome": "Zero-PIN Handoff & Authorization",
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
  const suppliedUrl = resolveSimulatorAudioUrl(audioUrl, language);
  if (!suppliedUrl) return null;

  if (suppliedUrl.endsWith(".m4a")) {
    const audio = document.createElement("audio");
    if (!audio.canPlayType?.('audio/mp4; codecs="mp4a.40.2"')) return null;
  }

  return suppliedUrl;
}

export const PhoneSimulatorPage: React.FC = () => {
  // ── Call Session State ────────────────────────────────────────────────
  const [callActive, setCallActive] = useState<boolean>(false);
  const [callStatus, setCallStatus] = useState<string>("Idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [interactionMode, setInteractionMode] = useState<string>("UNSELECTED");
  const [conversationState, setConversationState] = useState<string>("INITIATED");
  const [callerNumber] = useState<string>("0543546010");
  const [language, setLanguage] = useState<"en" | "twi" | null>(null);
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

  // ── Cash-Out & Voice Withdrawal State ────────────────────────────────
  const [cashOutActive, setCashOutActive] = useState<boolean>(false);
  const [cashOutExpiryMin, setCashOutExpiryMin] = useState<number>(15);
  const [walletBalance, setWalletBalance] = useState<number>(30.0);
  const [pendingAgentRequest, setPendingAgentRequest] = useState<any | null>(null);
  const heldPinRef = useRef<string | null>(null);
  const isCashOutFlowRef = useRef<boolean>(false);
  const requestedWithdrawalAmountRef = useRef<number>(30);

  // ── XML & Telephony Routing State ────────────────────────────────────
  const [activeCallbackUrl, setActiveCallbackUrl] = useState<string | null>(null);
  const [activeNumDigits, setActiveNumDigits] = useState<number>(1);
  const [activeFinishOnKey, setActiveFinishOnKey] = useState<string>("#");
  const [activeStepName, setActiveStepName] = useState<string>("idle");
  const [rawVoiceXml, setRawVoiceXml] = useState<string>("");

  // ── Terminal & Chat Timeline State ───────────────────────────────────
  const [activeTab, setActiveTab] = useState<"chat" | "terminal" | "asr_diag">("chat");
  const [splitView, setSplitView] = useState<boolean>(true);
  const [voiceSyncStatus, setVoiceSyncStatus] = useState<{
    text: string;
    action: string;
    dtmf?: string;
    timestamp: number;
  } | null>(null);
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
  const [finalizedTranscript, setFinalizedTranscript] = useState<string>("");
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
  const recognitionRef = useRef<any>(null);
  const lastUtteranceTimeRef = useRef<number>(0);
  const lastUtteranceTextRef = useRef<string>("");
  const prevInterimTranscriptRef = useRef<string>("");

  // Synchronous session state refs
  const callActiveRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>("");
  const activeCallbackUrlRef = useRef<string | null>(null);
  const activeStepNameRef = useRef<string>("idle");
  const languageRef = useRef<"en" | "twi" | null>(null);
  const currentPromptRef = useRef<string>("");
  const isMicMutedRef = useRef<boolean>(false);
  const zeroPinOverlayRef = useRef<boolean>(false);
  const brainDraftRef = useRef<any>({ slots: {} });
  const pinSilenceGenRef = useRef<number>(0);
  const pinTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPinAuthorizationFlowRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handlePinSubmissionRef = useRef<(pin: string) => Promise<void>>(() => Promise.resolve());

  useEffect(() => { callActiveRef.current = callActive; }, [callActive]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { activeCallbackUrlRef.current = activeCallbackUrl; }, [activeCallbackUrl]);
  useEffect(() => { activeStepNameRef.current = activeStepName; }, [activeStepName]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { currentPromptRef.current = currentPrompt; }, [currentPrompt]);
  useEffect(() => { isMicMutedRef.current = isMicMuted; }, [isMicMuted]);
  useEffect(() => { zeroPinOverlayRef.current = zeroPinOverlay; }, [zeroPinOverlay]);

  // Pre-unlock audio on any initial user touch or interaction so audio plays automatically
  useEffect(() => {
    const unlock = () => {
      audioPlaybackController.unlockAudio();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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
          } catch {}
        }
      } catch {}
    };
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Call duration counter
  useEffect(() => {
    let timer: any = null;
    if (callActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [callActive]);

  // Auto-scroll chat & terminal
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns, terminalLogs, interimTranscript]);

  // Audio controller subscription: keep mic strictly OFF while prompt audio is playing,
  // and automatically turn on the mic ONLY after the prompt audio finishes playing.
  useEffect(() => {
    let wasPlaying = false;
    const unsubscribe = audioPlaybackController.subscribe((state) => {
      setIsAudioSpeaking(state.isPlaying);
      if (!callActiveRef.current) return;
      if (state.isPlaying) {
        wasPlaying = true;
        // Turn mic OFF while prompt is playing so internal audio is never recorded
        setIsMicMuted(true);
        isMicMutedRef.current = true;
        continuousAudioEngine.pauseForPlayback();
        setCallStatus("Speaking");
      } else {
        if (wasPlaying && !zeroPinOverlayRef.current) {
          wasPlaying = false;
          // Brief 150ms acoustic tail buffer so speaker room echo isn't recorded, then auto-turn ON mic
          setTimeout(() => {
            if (!audioPlaybackController.isSpeaking() && callActiveRef.current && !zeroPinOverlayRef.current) {
              setIsMicMuted(false);
              isMicMutedRef.current = false;
              continuousAudioEngine.setZeroPinMuted(false);
              continuousAudioEngine.startAlwaysOnMic(languageRef.current || "en", activeStepNameRef.current);
              setCallStatus("Listening");
              addLog("asr", "🎙️ Audio prompt finished — Microphone automatically turned ON to record your need.");
            }
          }, 150);
        }
      }
    });
    return () => unsubscribe();
  }, [addLog]);

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

    const playMatch = xml.match(/<Play[^>]*url=["']([^"']+)["']/i);
    if (playMatch) {
      result.playUrl = playMatch[1].trim();
    } else {
      const playInnerMatch = xml.match(/<Play[^>]*>([^<]+)<\/Play>/i);
      if (playInnerMatch) {
        result.playUrl = playInnerMatch[1].trim();
      }
    }

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
      meta?: { httpStatus?: number; guardReason?: string }
    ) => {
      const parsed = parseVoiceXml(xmlText);
      if (meta?.httpStatus) parsed.httpStatus = meta.httpStatus;
      if (meta?.guardReason) parsed.guardReason = meta.guardReason;
      const requestedPlayUrl = parsed.playUrl;

      // Extract step name from URL
      let stepName = "voice-menu";
      let responseLanguage: "en" | "twi" = language || "en";
      try {
        const u = new URL(effectiveUrl, window.location.origin);
        stepName = u.pathname.replace(/^\//, "").replace(/^api\/simulator\//, "") || "voice-menu";
        const langParam = u.searchParams.get("lang");
        if (langParam === "twi") {
          responseLanguage = "twi";
          setLanguage("twi");
        } else if (langParam === "en") {
          responseLanguage = "en";
          setLanguage("en");
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

      // Follow <Redirect> immediately
      if (parsed.redirectUrl) {
        addLog("state", `Redirecting to ${parsed.redirectUrl}`);
        return dispatchVoiceWebhook(parsed.redirectUrl);
      }

      // Handle <Reject/>
      if (parsed.isReject) {
        audioPlaybackController.stop();
        continuousAudioEngine.stop();
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }

        const isPinHandoff =
          effectiveUrl.includes("safe-outcome") ||
          (parsed.sayText && parsed.sayText.toLowerCase().includes("momo pin")) ||
          (parsed.sayText && parsed.sayText.toLowerCase().includes("phone screen"));

        if (isPinHandoff) {
          if (startPinAuthorizationFlowRef.current) {
            startPinAuthorizationFlowRef.current();
            return;
          }
        } else {
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
        }

        setCallActive(false);
        callActiveRef.current = false;
        setActiveCallbackUrl(null);
        activeCallbackUrlRef.current = null;
        return;
      }

      // Configure GetDigits expectations
      if (parsed.getDigits) {
        if (parsed.getDigits.callbackUrl) {
          activeCallbackUrlRef.current = parsed.getDigits.callbackUrl;
          setActiveCallbackUrl(parsed.getDigits.callbackUrl);
        }
        setActiveNumDigits(parsed.getDigits.numDigits || 1);
        setActiveFinishOnKey(parsed.getDigits.finishOnKey || "#");
      }

      // Determine display prompt text
      let promptText = "";
      if (parsed.sayText) {
        promptText = parsed.sayText;
      } else if (requestedPlayUrl) {
        const pathname = new URL(requestedPlayUrl, window.location.origin).pathname;
        const recording = getRecordingByUrl(pathname);
        const ttsPromptKey = pathname.match(/^\/api\/audio\/prompt-tts\/(?:en|twi)\/([^/]+)$/)?.[1];
        const promptKey = ttsPromptKey ? decodeURIComponent(ttsPromptKey) : null;
        promptText = recording?.spokenText ||
          (promptKey ? resolvePromptText(promptKey, responseLanguage) : null) ||
          (responseLanguage === "twi" ? "Yɛsrɛ wo tie." : "Please listen to the prompt.");
      } else {
        // Fallback friendly script
        promptText = responseLanguage === "twi" ? "Yɛsrɛ wo paw deɛ wopɛ wɔ menyu no so." : "Please select an option from the menu.";
      }

      setCurrentPrompt(promptText);
      currentPromptRef.current = promptText;
      setActivePlayUrl(playbackUrl);

      // Log reply text and options
      addLog("reply", `"${promptText}"`);
      const choices = STEP_OPTIONS_MAP[stepName] || "Keypad or Speech";
      addLog("state", `step=${stepName}, options: [${choices}]`);

      // Add to interactive Chat timeline
      addChatTurn({
        sender: "system",
        text: promptText,
        stepName,
        audioUrl: playbackUrl,
        audioSource: playbackUrl ? "studio" : "synthesis",
        options: choices,
      });

      // Play audio automatically (studio audio or neural synthesis)
      audioPlaybackController.unlockAudio();
      if (playbackUrl) {
        addLog("audio", `🔊 Auto-playing prompt: ${playbackUrl}`);
        audioPlaybackController.play(playbackUrl, promptText).catch((err) => {
          console.warn("[PhoneSimulator] Auto-play prompt failed; playing guidance tone indicator:", err);
          addLog("audio", `🔔 Audio failed to play; emitted guidance tone indicator.`);
          audioPlaybackController.playToneIndicator().catch(() => {});
        });
      } else {
        addLog("audio", `🔔 Prompt recording unavailable; playing guidance tone indicator.`);
        audioPlaybackController.playToneIndicator().catch(() => {});
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
        } catch {}
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
        setInteractionMode(res.headers.get("x-interaction-mode") || "UNSELECTED");
        setConversationState(res.headers.get("x-conversation-state") || "INITIATED");
        const aiDecisionType = decodeHeader(res.headers.get("x-ai-decision-type"));
        const aiDecisionReason = decodeHeader(res.headers.get("x-ai-decision-reason"));
        const aiReplyText = decodeHeader(res.headers.get("x-ai-reply-text"));
        const aiReplyKey = decodeHeader(res.headers.get("x-ai-reply-key"));

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
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason });
        } else if (!res.ok) {
          addLog("system", `Telephony status ${res.status}: ${text.slice(0, 80)}`);
          setCallStatus("Ended");
          setCurrentPrompt("Call ended. Lift handset or press Call to begin.");
          setCallActive(false);
          audioPlaybackController.stop();
        } else {
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason });
        }
      } catch (err: any) {
        addLog("system", `Webhook transport error: ${err.message}`);
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
    const initialCallback = `/api/simulator/language-selection?sessionId=${newSession}`;
    activeCallbackUrlRef.current = initialCallback;
    currentPromptRef.current = "Welcome to Ɔkwankyerɛfo Pa. For English press 1, for Twi press 2.";

    setSessionId(newSession);
    setInteractionMode("UNSELECTED");
    setConversationState("INITIATED");
    setCallActive(true);
    setCallStatus("Connected");
    setLanguage(null);
    setDigitsBuffer("");
    setZeroPinOverlay(false);
    setRecentStreamingWords([]);

    addLog("system", `Call initiated. Session ID: ${newSession}`);
    addLog("state", "Connecting to phone simulator (/api/simulator/voice-menu)...");

    // Keep microphone OFF during initial welcome prompt playback; it will automatically turn ON when the prompt finishes playing
    setIsMicMuted(true);
    isMicMutedRef.current = true;
    continuousAudioEngine.pauseForPlayback();
    continuousAudioEngine.resetDiscussionBuffer();
    setInterimTranscript("");
    setFinalizedTranscript("");

    // Initial step expectations
    setActiveStepName("voice-menu");
    setActiveCallbackUrl(initialCallback);
    setActiveNumDigits(1);
    setActiveFinishOnKey("#");

    await dispatchVoiceWebhook("/api/simulator/voice-menu", { sessionId: newSession });
  }, [dispatchVoiceWebhook, addLog]);

  // ── End Call ──────────────────────────────────────────────────────────
  const endCall = useCallback(
    async (reason = "User hung up") => {
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
      setFinalizedTranscript("");

      audioPlaybackController.stop();
      continuousAudioEngine.stop();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      clearPinSilenceTimers();

      addLog("state", `Call ended (${reason})`);
      addChatTurn({
        sender: "system",
        text: `Call ended: ${reason}. Thank you for using Ɔkwankyerɛfo Pa.`,
        stepName: "ended",
      });
    },
    [addLog, addChatTurn]
  );

  const clearPinSilenceTimers = useCallback(() => {
    pinSilenceGenRef.current += 1;
    if (pinTimerRef.current) {
      clearTimeout(pinTimerRef.current);
      pinTimerRef.current = null;
    }
  }, []);

  const schedulePinSilenceTimers = useCallback(() => {
    clearPinSilenceTimers();
    const gen = pinSilenceGenRef.current;
    const curLang = languageRef.current || language;
    const isTwi = curLang === "twi";

    // Stage 1: 5s initial wait (5s + 15s + 20s = 40s total)
    pinTimerRef.current = setTimeout(async () => {
      if (pinSilenceGenRef.current !== gen || !callActiveRef.current || activeStepNameRef.current !== "pin-authorization") return;

      const msg1 = isTwi
        ? "Mepa wo kyɛw bɔ wo PIN no, yɛretwɛn deɛ worebɛka no na yɛawie dwumadie no."
        : "Please mention your PIN, we are waiting for it to finalize the process.";
      addLog("system", `[Silence Ladder Stage 1 @5s] "${msg1}"`);
      addChatTurn({ sender: "ai", text: `⏳ ${msg1}`, audioSource: "synthesis", stepName: "pin-authorization" });
      setCurrentPrompt(msg1);
      currentPromptRef.current = msg1;
      try {
        await audioPlaybackController.speakText(msg1);
      } catch {}

      if (pinSilenceGenRef.current !== gen || !callActiveRef.current || activeStepNameRef.current !== "pin-authorization") return;

      // Stage 2: 15s after Stage 1 finishes speaking
      pinTimerRef.current = setTimeout(async () => {
        if (pinSilenceGenRef.current !== gen || !callActiveRef.current || activeStepNameRef.current !== "pin-authorization") return;

        const msg2 = isTwi
          ? "Yɛda so retwɛn wo, mesrɛ wo fa wo keypad no bɔ mu sɛ worentumi nka no nteaseɛ a."
          : "We are still waiting for you please, use your keypad if you cannot say it out loud.";
        addLog("system", `[Silence Ladder Stage 2 @+15s] "${msg2}"`);
        addChatTurn({ sender: "ai", text: `⏳ ${msg2}`, audioSource: "synthesis", stepName: "pin-authorization" });
        setCurrentPrompt(msg2);
        currentPromptRef.current = msg2;
        try {
          await audioPlaybackController.speakText(msg2);
        } catch {}

        if (pinSilenceGenRef.current !== gen || !callActiveRef.current || activeStepNameRef.current !== "pin-authorization") return;

        // Stage 3: 20s after Stage 2 finishes speaking (total 40s silence reached -> termination)
        pinTimerRef.current = setTimeout(async () => {
          if (pinSilenceGenRef.current !== gen || !callActiveRef.current || activeStepNameRef.current !== "pin-authorization") return;

          const msg3 = isTwi
            ? "Ɛte sɛ nea yɛantumi ante wo PIN no, enti yɛrebɛto fon no mu seesei ara. Nante yie."
            : "We are about to end the call as we could not receive your PIN. Goodbye.";
          addLog("system", `[Silence Ladder Stage 3 @+20s, Total 40s reached] "${msg3}"`);
          addChatTurn({ sender: "ai", text: `📞 ${msg3}`, audioSource: "synthesis", stepName: "pin-authorization" });
          setCurrentPrompt(msg3);
          currentPromptRef.current = msg3;
          try {
            await audioPlaybackController.speakText(msg3);
          } catch {}
          endCall("PIN silence timeout (40s reached without input)");
        }, 20000);
      }, 15000);
    }, 5000);
  }, [clearPinSilenceTimers, language, addLog, addChatTurn, endCall]);

  const handlePinSubmission = useCallback(
    async (pinValue: string) => {
      clearPinSilenceTimers();
      const cleanPin = pinValue.replace(/\D/g, "");
      if (cleanPin.length !== 4) return;

      const curSession = sessionIdRef.current || sessionId;
      const curLang = languageRef.current || language;
      const isTwi = curLang === "twi";

      // ── Handle Cash-Out Approval PIN ──
      if (isCashOutFlowRef.current || pendingAgentRequest) {
        addLog("caller", `PIN submitted: **** (4 digits secured)`);
        addLog("state", `Submitting PIN to approve MoMo Cash-Out withdrawal...`);
        try {
          const appRes = await api.approveCashOut({
            callerPhone: callerNumber,
            pin: cleanPin,
            language: curLang,
          });
          if (appRes.success) {
            addLog("state", `✓ Cash-Out Withdrawal Approved! Ref: ${appRes.referenceId}`);
            const successText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Withdrawal approved.";
            addChatTurn({ sender: "ai", text: successText, audioSource: "synthesis", stepName: "completed" });
            activeStepNameRef.current = "completed";
            setActiveStepName("completed");
            setCurrentPrompt(successText);
            currentPromptRef.current = successText;
            await audioPlaybackController.speakText(successText);
            isCashOutFlowRef.current = false;
            setPendingAgentRequest(null);
            heldPinRef.current = null;
            return;
          } else {
            if (appRes.error === "WALLET_LOCKED") {
              addLog("system", "Security Lockout: Wallet locked due to 3 failed attempts.");
              const lockText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Wallet locked.";
              addChatTurn({ sender: "ai", text: lockText, audioSource: "synthesis", stepName: "completed" });
              activeStepNameRef.current = "completed";
              setActiveStepName("completed");
              setCurrentPrompt(lockText);
              currentPromptRef.current = lockText;
              await audioPlaybackController.speakText(lockText);
              endCall("Wallet locked: 3 failed PIN attempts");
              return;
            }

            if (appRes.error === "INSUFFICIENT_BALANCE") {
              addLog("system", `Deficit Read-Back: Balance insufficient for withdrawal (${appRes.balanceDetails?.shortage ?? 0} GHS deficit)`);
              const balMsg = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Insufficient balance for withdrawal.";
              addChatTurn({ sender: "ai", text: balMsg, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
              activeStepNameRef.current = "cashout-awaiting-agent";
              setActiveStepName("cashout-awaiting-agent");
              setCurrentPrompt(balMsg);
              currentPromptRef.current = balMsg;
              await audioPlaybackController.speakText(balMsg);
              return;
            }

            if (appRes.error === "INVALID_PIN") {
              const rem = appRes.remainingAttempts ?? 2;
              addLog("system", `PIN rejection: Remaining attempts = ${rem}`);
              const warnText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || `That PIN is incorrect. You have ${rem} attempts remaining.`;
              addChatTurn({ sender: "ai", text: warnText, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
              setCurrentPrompt(warnText);
              currentPromptRef.current = warnText;
              await audioPlaybackController.speakText(warnText);
              schedulePinSilenceTimers();
              return;
            }

            addLog("system", `Cash-out rejection: ${appRes.error}`);
            const errText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Could not complete request.";
            addChatTurn({ sender: "ai", text: errText, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
            setCurrentPrompt(errText);
            currentPromptRef.current = errText;
            await audioPlaybackController.speakText(errText);
            return;
          }
        } catch (err: any) {
          addLog("system", `Cash-out approval error: ${err.message}`);
          schedulePinSilenceTimers();
          return;
        }
      }

      const slots = brainDraftRef.current?.slots || {};
      const txAmount = typeof slots.amount === "number" ? slots.amount : 50;
      const recPhone = slots.recipient?.phone || slots.recipientPhone || "0244123456";
      const recName = slots.verifiedName || slots.recipient?.name || "Emmanuel Mensah";
      const txNet = slots.network || "MTN";

      addLog("caller", `PIN submitted: **** (4 digits secured)`);
      addLog("state", `Submitting PIN directly to MoMo Sandbox authorization service...`);

      try {
        const res = await api.submitPin({
          sessionId: curSession,
          pin: cleanPin,
          amount: txAmount,
          recipientPhone: recPhone,
          recipientName: recName,
          network: txNet,
          callerPhone: callerNumber,
          language: curLang,
        });

        if (res.success) {
          addLog("state", `✓ MoMo Sandbox Transaction Approved! Ref: ${res.reference}`);
          const successText = (isTwi ? res.messageTw : res.message) || `Transfer of ${txAmount} Cedis completed successfully! Ref: ${res.reference}`;
          addChatTurn({ sender: "ai", text: successText, audioSource: "synthesis", stepName: "completed" });
          activeStepNameRef.current = "completed";
          setActiveStepName("completed");
          setCurrentPrompt(successText);
          currentPromptRef.current = successText;
          await audioPlaybackController.speakText(successText);
        } else {
          if (res.error === "WALLET_LOCKED") {
            addLog("system", `🔒 Wallet locked due to 3 failed PIN attempts.`);
            const lockText = (isTwi ? res.messageTw : res.message) || "Wallet locked for security. Goodbye.";
            addChatTurn({ sender: "ai", text: lockText, audioSource: "synthesis", stepName: "locked" });
            setCurrentPrompt(lockText);
            currentPromptRef.current = lockText;
            await audioPlaybackController.speakText(lockText);
            endCall("Wallet locked (maximum PIN attempts exceeded)");
          } else {
            // INVALID_PIN: Re-engage AI reasoning & safety advice
            addLog("AI", `[Safety Guard] PIN verification failed. Remaining attempts: ${res.remainingAttempts}. Speaking security & lockout advisory.`);
            const warnText = (isTwi ? res.messageTw : res.message) || `PIN incorrect. ${res.remainingAttempts} attempts remaining. Please use your phone keypad if you prefer.`;
            addChatTurn({ sender: "ai", text: warnText, audioSource: "synthesis", stepName: "pin-authorization" });
            setCurrentPrompt(warnText);
            currentPromptRef.current = warnText;
            await audioPlaybackController.speakText(warnText);
            schedulePinSilenceTimers();
          }
        }
      } catch (err: any) {
        addLog("system", `PIN verification error: ${err.message}`);
        schedulePinSilenceTimers();
      }
    },
    [clearPinSilenceTimers, sessionId, language, callerNumber, addLog, addChatTurn, endCall, schedulePinSilenceTimers]
  );

  const startPinAuthorizationFlow = useCallback(async () => {
    clearPinSilenceTimers();
    activeStepNameRef.current = "pin-authorization";
    setActiveStepName("pin-authorization");
    setDigitsBuffer("");

    const curLang = languageRef.current || language;
    const isTwi = curLang === "twi";
    const promptText = isTwi
      ? "Mepa wo kyɛw bɔ wo MoMo PIN ahintasɛm no, anaa fa wo keypad no bɔ mu."
      : "Please mention your secret MoMo PIN, or use your phone keypad if you prefer.";

    addLog("state", `Entering PIN authorization state. Microphone is active and listening for spoken digits or keypad entry.`);
    addLog("AI", `[Zero-PIN Guard] LLM disabled during PIN collection. Digits are routed directly to MoMo Sandbox authorization service.`);
    addChatTurn({ sender: "ai", text: promptText, audioSource: "synthesis", stepName: "pin-authorization" });
    setCurrentPrompt(promptText);
    currentPromptRef.current = promptText;

    try {
      await audioPlaybackController.speakText(promptText);
    } catch {}

    schedulePinSilenceTimers();
  }, [clearPinSilenceTimers, language, addLog, addChatTurn, schedulePinSilenceTimers]);

  useEffect(() => {
    startPinAuthorizationFlowRef.current = startPinAuthorizationFlow;
  }, [startPinAuthorizationFlow]);

  useEffect(() => {
    handlePinSubmissionRef.current = handlePinSubmission;
  }, [handlePinSubmission]);

  // ── Speech Recognition & Spoken Turn Handler ──────────────────────────
  const processSpokenUtterance = useCallback(
    async (
      utterance: string,
      isDirectSimulated: boolean = false
    ) => {
      // If call is inactive, initiate call first
      if (!callActiveRef.current) {
        addLog("state", `Speech arrived while call inactive (previous step=${activeStepNameRef.current}); starting a new call.`);
        await startCall();
      }

      if (zeroPinOverlayRef.current) return;

      const clean = normalizeSpokenDigits(utterance.trim());
      if (!clean) return;

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
      continuousAudioEngine.pauseForPlayback();
      setCallStatus("Processing");

      addLog("caller", `Speech "${clean}"`);
      addLog("asr", `✅ Sentence complete: "${effectiveClean}" — Microphone automatically turned OFF.`);

      // Add to Chat Timeline with phonetic annotations
      addChatTurn({
        sender: "caller",
        text: effectiveClean,
        rawTranscript: clean !== effectiveClean ? clean : undefined,
        phoneticRepairs: phoneticRepair.repairedWords,
        confidence: 0.98,
      });

      const curStep = activeStepNameRef.current;
      const curSession = sessionIdRef.current;
      const curLang = languageRef.current || "en";
      const isTwi = curLang === "twi";

      // 0. PIN Authorization Step (AI LLM is BYPASSED for security!)
      if (curStep === "pin-authorization") {
        clearPinSilenceTimers();
        const lower = effectiveClean.toLowerCase();
        if (lower.includes("cancel") || lower.includes("dabi") || lower.includes("stop") || lower.includes("exit")) {
          addLog("caller", "Spoken cancellation during PIN authorization.");
          endCall("User cancelled PIN authorization");
          return;
        }

        const digitsFromSpoken = normalizeSpokenDigits(effectiveClean);
        const digitsOnly = digitsFromSpoken.replace(/\D/g, "");
        const rawDigits = effectiveClean.replace(/\D/g, "");
        let extractedPin = "";
        if (digitsOnly.length === 4) {
          extractedPin = digitsOnly;
        } else if (rawDigits.length === 4) {
          extractedPin = rawDigits;
        } else {
          const decoded = numberDecoder.decode(effectiveClean);
          if (decoded.phoneNumberDigits && decoded.phoneNumberDigits.length === 4) {
            extractedPin = decoded.phoneNumberDigits;
          }
        }

        if (extractedPin.length === 4) {
          addLog("asr", `Extracted 4 spoken PIN digits.`);
          handlePinSubmission(extractedPin);
          return;
        }

        // When extractedPin is not exactly 4 digits (e.g. 3 digits, letters, or garbled)
        const digitErrorText = isTwi
          ? "MoMo PIN no yɛ nɔmba nan pɛpɛɛpɛ. Mesrɛ wo, fa wo keypad no bɔ wo PIN a ɛyɛ nɔmba nan no mu, anaa ka bio."
          : "A Mobile Money PIN must be 4 digits. Please enter your 4-digit PIN on your phone keypad, or speak it carefully.";
        addLog("system", `Incomplete PIN: heard "${effectiveClean}". Prompting 4 digits.`);
        addChatTurn({ sender: "ai", text: digitErrorText, audioSource: "synthesis", stepName: "pin-authorization" });
        setCurrentPrompt(digitErrorText);
        currentPromptRef.current = digitErrorText;
        await audioPlaybackController.speakText(digitErrorText);
        schedulePinSilenceTimers();
        return;
      }

      // ── CASH-OUT FLOW HANDLERS ──
      const isCashOutInitiation =
        !curStep.startsWith("cashout-") &&
        /\b(withdraw|cash\s*out|cashout|take\s*out\s*money|pull\s*money|yi\s*sika|mepɛ\s*sɛ\s*meyi\s*sika|allow\s*cash\s*out|gye\s*sika)\b/i.test(effectiveClean);

      if (isCashOutInitiation) {
        clearPinSilenceTimers();
        isCashOutFlowRef.current = true;
        setCashOutActive(true);
        setCashOutExpiryMin(15);
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

        addLog("state", `Initiating Allow Cash-Out on wallet for ${callerNumber}...`);
        try {
          const res = await api.enableVoiceCashOut({ callerPhone: callerNumber, language: curLang });
          const speakText = (isTwi ? res.messageTw : res.messageEn) ||
            (isTwi
              ? "Yɛabue Allow Cash-Out ama wo mfifii 15 mu sɛ wotumi yi sika wɔ MoMo agent hɔ. Yɛrentumi nhwɛ wo balance wɔ assistant yi so; fa wo fon bɔ star, baako, nson, hwee, hash."
              : "Cash-Out has been enabled on your wallet for the next 15 minutes. Balance checking through this assistant is currently unavailable; dial star, one, seven, zero, hash on your handset.");
          addLog("reply", `"${speakText}"`);
          addChatTurn({ sender: "ai", text: speakText, audioSource: "synthesis", stepName: "cashout-offer-balance" });
          setCurrentPrompt(speakText);
          currentPromptRef.current = speakText;
          await audioPlaybackController.speakText(speakText);
        } catch (err: any) {
          addLog("system", `Error enabling cash-out: ${err.message}`);
        }
        return;
      }

      // Cash-Out Step 1: Offer to Check Balance & Fees
      if (curStep === "cashout-offer-balance") {
        clearPinSilenceTimers();
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
          setPendingAgentRequest(pending.request);
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
        // Zero-PIN Boundary: Extract any spoken 4-digit PIN into secure memory, then blur from transcript
        const digitsFromSpoken = normalizeSpokenDigits(effectiveClean);
        const digitsOnly = digitsFromSpoken.replace(/\D/g, "");
        const rawDigits = effectiveClean.replace(/\D/g, "");
        let blurtedPin = "";
        if (digitsOnly.length === 4) {
          blurtedPin = digitsOnly;
        } else if (rawDigits.length === 4) {
          blurtedPin = rawDigits;
        } else if (/\b\d{4}\b/.test(effectiveClean)) {
          blurtedPin = effectiveClean.match(/\b\d{4}\b/)![0];
        }

        if (blurtedPin) {
          heldPinRef.current = blurtedPin;
          addLog("caller", `Early PIN blurt safely secured: **** (4 digits isolated from AI prompt)`);
        }

        // Mask PIN digits so the AI agent NEVER sees raw PIN digits
        const textForAi = effectiveClean
          .replace(/\b\d{4}\b/g, "[REDACTED_PIN]")
          .replace(/\b\d\s+\d\s+\d\s+\d\b/g, "[REDACTED_PIN]")
          .replace(/\b(?:pin|secret|passcode|code)\s*(?:is|:)?\s*\d+\b/gi, "pin [REDACTED_PIN]");

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
              setPendingAgentRequest(null);
              const fee = parsed <= 50 ? (parsed * 0.01 < 0.20 ? 0.20 : Math.round(parsed * 0.01 * 100) / 100) : parsed <= 1000 ? Math.round(parsed * 0.01 * 100) / 100 : 10.0;
              const total = parsed + fee;
              const updateMsg = isTwi
                ? `Mate aseɛ, wobɛyi GHS ${parsed.toFixed(2)}. Telco fee bɛyɛ GHS ${fee.toFixed(2)}, ne nyinaa yɛ GHS ${total.toFixed(2)}. Ka wo phone nɔmba ${callerNumber} kyerɛ agent no sɛ ɔmbɔ GHS ${parsed.toFixed(2)}. Sɛ ɔwie a, ka kyerɛ me na yɛapene so.`
                : `Understood, you want to withdraw ${parsed.toFixed(2)} Cedis. The telco fee will be ${fee.toFixed(2)} Cedis, for a total of ${total.toFixed(2)} Cedis. Tell the agent your number: ${callerNumber} and have them enter ${parsed.toFixed(2)} Cedis. Once they enter it, let me know and I will help you approve it.`;
              addLog("reply", `"${updateMsg}"`);
              addChatTurn({ sender: "ai", text: updateMsg, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
              setCurrentPrompt(updateMsg);
              currentPromptRef.current = updateMsg;
              await audioPlaybackController.speakText(updateMsg);
              return;
            }
          }

          if (aiDecision.action === "FETCH_PENDING" || aiDecision.intent === "AGENT_INITIATED") {
            clearPinSilenceTimers();
            addLog("state", `AI Agent identified agent initiation. Fetching pending agent withdrawal request for ${callerNumber}...`);
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
            setPendingAgentRequest(pending.request);

            activeStepNameRef.current = "cashout-confirm-approval";
            setActiveStepName("cashout-confirm-approval");

            const readbackMsg = isTwi
              ? `MoMo Agent ${pending.request.agentName} rebisa sɛ obeyi sika ${pending.request.amount.toFixed(2)} cedis a telco fee yɛ pesewas ${(pending.request.fee * 100).toFixed(0)} afiri wo account mu. Wopene so?`
              : `MoMo Agent ${pending.request.agentName} is requesting a withdrawal of ${pending.request.amount.toFixed(2)} Cedis with a fee of ${pending.request.fee.toFixed(2)} Cedis. Do you approve this withdrawal?`;

            addLog("reply", `"${readbackMsg}"`);
            addChatTurn({ sender: "ai", text: readbackMsg, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
            setCurrentPrompt(readbackMsg);
            currentPromptRef.current = readbackMsg;
            await audioPlaybackController.speakText(readbackMsg);
            return;
          } else if (aiDecision.action === "CANCEL" || aiDecision.intent === "REJECT_CANCEL") {
            clearPinSilenceTimers();
            heldPinRef.current = null;
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
            Boolean(blurtedPin) ||
            /\b(approve|pene\s*so|yes|aane|go\s*ahead|please\s*go\s*ahead|proceed|yoo|do\s*it|allow\s*it|yes\s*please)\b/i.test(effectiveClean);

          if (isApprovalUtterance) {
            clearPinSilenceTimers();
            if (heldPinRef.current || blurtedPin) {
              const pinToUse = heldPinRef.current || blurtedPin;
              heldPinRef.current = null;
              addLog("state", `Submitting securely held PIN to vault for withdrawal approval...`);
              const appRes = await api.approveCashOut({
                callerPhone: callerNumber,
                pin: pinToUse,
                language: curLang,
              });

              if (appRes.success) {
                const successText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Withdrawal approved.";
                addChatTurn({ sender: "ai", text: successText, audioSource: "synthesis", stepName: "completed" });
                setCurrentPrompt(successText);
                currentPromptRef.current = successText;
                activeStepNameRef.current = "completed";
                setActiveStepName("completed");
                await audioPlaybackController.speakText(successText);
                isCashOutFlowRef.current = false;
                setPendingAgentRequest(null);
                return;
              } else {
                if (appRes.error === "WALLET_LOCKED") {
                  addLog("system", "Security Lockout: Wallet locked due to 3 failed attempts.");
                  const lockText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Wallet locked.";
                  addChatTurn({ sender: "ai", text: lockText, audioSource: "synthesis", stepName: "completed" });
                  activeStepNameRef.current = "completed";
                  setActiveStepName("completed");
                  setCurrentPrompt(lockText);
                  currentPromptRef.current = lockText;
                  await audioPlaybackController.speakText(lockText);
                  endCall("Wallet locked: 3 failed PIN attempts");
                  return;
                }

                if (appRes.error === "INSUFFICIENT_BALANCE") {
                  addLog("system", `Deficit Read-Back: Balance insufficient for withdrawal (${appRes.balanceDetails?.shortage ?? 0} GHS deficit)`);
                  const balMsg = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Insufficient balance for withdrawal.";
                  addChatTurn({ sender: "ai", text: balMsg, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
                  activeStepNameRef.current = "cashout-awaiting-agent";
                  setActiveStepName("cashout-awaiting-agent");
                  setCurrentPrompt(balMsg);
                  currentPromptRef.current = balMsg;
                  await audioPlaybackController.speakText(balMsg);
                  return;
                }

                if (appRes.error === "INVALID_PIN") {
                  const rem = appRes.remainingAttempts ?? 2;
                  addLog("system", `PIN rejection: Remaining attempts = ${rem}`);
                  const warnText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || `That PIN is incorrect. You have ${rem} attempts remaining.`;
                  addChatTurn({ sender: "ai", text: warnText, audioSource: "synthesis", stepName: "cashout-confirm-approval" });
                  setCurrentPrompt(warnText);
                  currentPromptRef.current = warnText;
                  await audioPlaybackController.speakText(warnText);
                  schedulePinSilenceTimers();
                  return;
                }

                addLog("system", `Cash-out rejection: ${appRes.error}`);
                const errText = (isTwi ? appRes.messageTw : appRes.messageEn) || appRes.message || "Could not complete request.";
                addChatTurn({ sender: "ai", text: errText, audioSource: "synthesis", stepName: "cashout-awaiting-agent" });
                setCurrentPrompt(errText);
                currentPromptRef.current = errText;
                await audioPlaybackController.speakText(errText);
                return;
              }
            } else {
              // Caller agreed verbally without entering PIN yet -> transition to PIN authorization
              isCashOutFlowRef.current = true;
              activeStepNameRef.current = "pin-authorization";
              setActiveStepName("pin-authorization");
              const pinPrompt = isTwi
                ? "Mepa wo kyɛw bɔ wo MoMo PIN ahintasɛm no, anaa fa wo keypad no bɔ mu."
                : "Please mention your secret MoMo PIN to authorize this withdrawal, or use your phone keypad.";
              addChatTurn({ sender: "ai", text: pinPrompt, audioSource: "synthesis", stepName: "pin-authorization" });
              setCurrentPrompt(pinPrompt);
              currentPromptRef.current = pinPrompt;
              await audioPlaybackController.speakText(pinPrompt);
              schedulePinSilenceTimers();
              return;
            }
          } else if (aiDecision.action === "CANCEL" || aiDecision.intent === "REJECT_CANCEL") {
            clearPinSilenceTimers();
            heldPinRef.current = null;
            addLog("caller", `Caller rejected agent withdrawal request.`);
            const rejectMsg = isTwi
              ? "Yɛatwa agent no sika yi mu. Yɛrenma sika no mfiri wo account mu. Nante yie."
              : "Withdrawal request rejected. No money has been deducted from your account. Goodbye.";
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
        : curStep.includes("confirm") || curStep.includes("verify-choice")
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

      if (curStep.includes("confirm") || curStep === "safe-confirmation") {
        const isAffirmative = /\b(yes|confirm|proceed|okay|sure|aane|pene so|ampa|that's him|thats him|correct|send it|kɔ so|yie|1|baako)\b/i.test(effectiveClean) || matchedDtmf === "1";
        const isNegative = /\b(no|cancel|wrong|dabi|stop|sesa|change|reject|2|mmienu)\b/i.test(effectiveClean) || matchedDtmf === "2";
        if (isAffirmative) {
          addLog("caller", `Spoken confirmation approval: "${effectiveClean}"`);
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
        }
      }

      if (matchedDtmf) {
        addLog("asr", `Spoken menu choice "${effectiveClean}" mapped to keypad [${matchedDtmf}]`);
        setVoiceSyncStatus({ text: effectiveClean, action: `Auto-dialed DTMF [${matchedDtmf}]`, dtmf: matchedDtmf, timestamp: Date.now() });
        setActiveKeypadPulse(matchedDtmf);
        audioPlaybackController.playDtmfTone(matchedDtmf, 130);
        setTimeout(() => setActiveKeypadPulse(null), 450);
        return dispatchVoiceWebhook(targetCallback, { dtmfDigits: matchedDtmf });
      }

      if (curStep.includes("confirm") || curStep.includes("verify-choice")) {
        addLog("state", "Routing spoken approval through the guarded simulator confirmation callback.");
        return dispatchVoiceWebhook(
          `/api/simulator/speech-fallback?step=${encodeURIComponent(curStep)}&sessionId=${encodeURIComponent(curSession)}&lang=${curLang}`,
          { speechText: effectiveClean }
        );
      }

      addLog("AI", `POST /api/ai/brain/process step=${curStep} language=${curLang} forceModel=true`);
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
        addLog("system", "⏱️ [Gemini Diagnosis @20s] Gemini reasoning reached 20-second threshold without response. Cause: Remote model latency spike or network stall. Transitioning to local deterministic processing.");
      }, 20000);

      try {
        const response = await api.processBrain({
          transcript: effectiveClean,
          language: curLang === "twi" ? "twi-asante" : "en",
          draft: brainDraftRef.current,
          callerNumber,
          sessionId: curSession,
          forceModel: true,
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
        addLog("AI", `Brain decision=${brainOutput.decision.kind} intent=${intent} modelUsed=${Boolean(brainOutput.modelOutput)}`);
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
          await audioPlaybackController.speakText(replyText);
          return;
        }

        // Case 2: Gemini Tool Handoff (Recipient & Amount Gathered -> Safe Confirmation)
        if (brainOutput.decision.kind === "confirm") {
          addLog("state", `AI handed over gathered transaction details: amount=${amount ?? "provided"}, recipient=${recipientPhone || "provided"}. Starting safe readback.`);
          activeStepNameRef.current = "safe-confirmation";
          activeCallbackUrlRef.current = `/api/simulator/safe-confirmation?sessionId=${curSession}&lang=${curLang}`;
          setActiveStepName("safe-confirmation");
          setActiveCallbackUrl(`/api/simulator/safe-confirmation?sessionId=${curSession}&lang=${curLang}`);
          setCurrentPrompt(replyText);
          currentPromptRef.current = replyText;
          await audioPlaybackController.speakText(replyText);
          return;
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
            addLog("state", `Submitting Brain-identified recipient for provider verification; amount=${amount ?? "not provided"}.`);
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
          await audioPlaybackController.speakText(replyText);
          return;
        }

        addLog("AI", `Brain reply: "${replyText}"`);
        setCurrentPrompt(replyText);
        currentPromptRef.current = replyText;
        await audioPlaybackController.speakText(replyText);
      } catch (err: any) {
        if (stallTimer) clearTimeout(stallTimer);
        if (timeout20sTimer) clearTimeout(timeout20sTimer);
        clearInterval(reasoningInterval);
        setIsAiReasoning(false);
        const errMsg = String(err?.message || "");
        const isTimeout = errMsg.includes("Timeout") || errMsg.includes("20s");
        if (isTimeout) {
          addLog("system", "⏱️ [Gemini Diagnosis @20s] Gemini turn exceeded 20-second threshold. Cause: Remote API latency / processing delay. Seamlessly activating local fallback.");
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
      setFinalizedTranscript("");
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
      setFinalizedTranscript(effective);
      setIsSimulatingSpeech(false);

      // Process utterance directly (bypassing mic acoustic echo filter since it is direct test input)
      processSpokenUtterance(effective, true);
    },
    [isSimulatingSpeech, language, processSpokenUtterance, startCall, addLog]
  );

  // Synchronize audio engine
  useEffect(() => {
    continuousAudioEngine.setContext(activeStepName, language || "en");
    continuousAudioEngine.setZeroPinMuted(zeroPinOverlay || isMicMuted);
  }, [activeStepName, language, zeroPinOverlay, isMicMuted]);

  // Subscribe to Always-On continuous audio engine utterances & state
  useEffect(() => {
    const unsubUtterance = continuousAudioEngine.subscribeUtterance((utterance) => {
      if (isMicMutedRef.current || zeroPinOverlayRef.current) return;
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
      if (state.finalizedTranscript) {
        setFinalizedTranscript(state.finalizedTranscript);
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
      audioPlaybackController.unlockAudio();
      // 1. Play realistic DTMF telephone beep
      audioPlaybackController.playDtmfTone(digit);

      // 2. Barge-in: stop system audio on keypress
      audioPlaybackController.stop();

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

      // Special Handling 1: Keypad input during PIN Authorization
      if (activeStepNameRef.current === "pin-authorization") {
        clearPinSilenceTimers();
        if (digit === "0" && digitsBuffer.length === 0) {
          addLog("caller", "Cancelled PIN authorization via Keypad 0.");
          endCall("User pressed 0 to cancel PIN");
          return;
        }
        const nextPin = digitsBuffer + digit;
        setDigitsBuffer(nextPin);
        addLog("caller", `Keypad PIN digit entered (*#*#)`);
        if (nextPin.length === 4) {
          setDigitsBuffer("");
          handlePinSubmission(nextPin);
        } else {
          schedulePinSilenceTimers();
        }
        return;
      }

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
        clearPinSilenceTimers();
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
          setPendingAgentRequest(req);
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

      // Special Handling 3: Keypad '1' during safe-confirmation
      if (digit === "1" && (activeStepNameRef.current === "safe-confirmation" || activeStepNameRef.current.includes("confirm"))) {
        setDigitsBuffer("");
        if (heldPinRef.current && activeStepNameRef.current === "cashout-confirm-approval") {
          addLog("caller", `Keypad '1' approved using held PIN.`);
          api.approveCashOut({
            callerPhone: callerNumber,
            pin: heldPinRef.current,
            language: languageRef.current || "en",
          }).then((appRes) => {
            heldPinRef.current = null;
            if (appRes.success) {
              const successText = (languageRef.current === "twi" ? appRes.messageTw : appRes.messageEn) || appRes.message;
              addChatTurn({ sender: "ai", text: successText, audioSource: "synthesis", stepName: "completed" });
              setCurrentPrompt(successText);
              currentPromptRef.current = successText;
              activeStepNameRef.current = "completed";
              setActiveStepName("completed");
              audioPlaybackController.speakText(successText).catch(() => {});
            }
          });
          return;
        }
        if (activeStepNameRef.current === "cashout-confirm-approval") {
          isCashOutFlowRef.current = true;
        }
        addLog("caller", `Keypad '1' confirmed transaction. Entering PIN authorization.`);
        startPinAuthorizationFlow();
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

      const nextBuf = digitsBuffer + digit;
      setDigitsBuffer(nextBuf);

      // AUTOMATIC RECOGNITION: The moment user punches numbers up to 10 at a time
      const digitsOnly = nextBuf.replace(/\D/g, "");
      if (digitsOnly.length === 10) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${digitsOnly}#'`);
        addLog("AI", `⚡ Auto-identified 10-digit number for sending money: ${digitsOnly}. Advancing to amount stage!`);
        dispatchVoiceWebhook(
          activeStepNameRef.current.includes("recipient")
            ? targetCallback
            : `/api/simulator/verify-recipient?sessionId=${sessionIdRef.current || sessionId}&lang=${languageRef.current || "en"}`,
          { dtmfDigits: digitsOnly + "#" }
        );
        return;
      }

      // Single-digit expectation (only when NOT accumulating a 10-digit phone number)
      const isAccumulatingPhone =
        nextBuf.startsWith("0") ||
        nextBuf.startsWith("233") ||
        activeStepNameRef.current.includes("recipient") ||
        activeStepNameRef.current.includes("phone");

      if (activeNumDigits === 1 && !isAccumulatingPhone) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${digit}'`);
        dispatchVoiceWebhook(targetCallback, { dtmfDigits: digit });
        return;
      }

      if (!activeFinishOnKey && nextBuf.length >= activeNumDigits) {
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
      audioPlaybackController.play(playbackUrl, text || currentPrompt).catch(() => {
        audioPlaybackController.playToneIndicator().catch(() => {});
      });
    } else {
      audioPlaybackController.playToneIndicator().catch(() => {});
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
        setTestAudioStatus("Playing via speech synthesis...");
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
              <div className="my-auto py-1 text-center">
                {digitsBuffer ? (
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

              {/* Zero-PIN Push Screen Overlay */}
              {zeroPinOverlay && (
                <div className="absolute inset-0 bg-slate-950/95 rounded-2xl p-4 flex flex-col justify-between text-center border-2 border-emerald-400 z-20">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>MTN MoMo PIN Screen</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Check your phone screen &amp; enter your MoMo PIN securely. Voice mic is strictly muted
                    for your safety (Zero-PIN Bank Regulation).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setZeroPinOverlay(false);
                      addLog("state", "MoMo PIN authorized on handset screen.");
                      addChatTurn({
                        sender: "system",
                        text: "Transfer approved. MoMo SMS confirmation & reference code dispatched. Goodbye.",
                        stepName: "receipt",
                      });
                    }}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition-colors cursor-pointer"
                  >
                    Authorize on Phone Screen
                  </button>
                </div>
              )}
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
                disabled={!callActive || zeroPinOverlay}
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
                    addLog("state", `Set test wallet balance for ${callerNumber} to GH₵ ${nextBal.toFixed(2)}`);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-600/40 font-mono text-[11px] font-bold transition-colors cursor-pointer"
                  title="Click to toggle between GH₵30.00 and GH₵250.00"
                >
                  GH₵ {walletBalance.toFixed(2)} {walletBalance === 30.0 ? "(Tight/Shortage)" : "(Sufficient)"}
                </button>
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
                onClick={() => simulateVoiceUtterance("1234")}
                disabled={isSimulatingSpeech}
                title="Spoken 4-digit sandbox PIN"
                className="px-2.5 py-1 text-xs bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 rounded-lg border border-emerald-500/40 font-mono transition-colors cursor-pointer disabled:opacity-40"
              >
                🔢 Say PIN &ldquo;1234&rdquo;
              </button>

              <button
                type="button"
                onClick={() => simulateVoiceUtterance("Yes approve it my PIN is 1234")}
                disabled={isSimulatingSpeech}
                title="Early PIN Blurt Safeguard test"
                className="px-2.5 py-1 text-xs bg-rose-950/80 hover:bg-rose-900 text-rose-200 rounded-lg border border-rose-500/40 font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                ⚡ Early Blurt: &ldquo;My PIN is 1234&rdquo;
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
                  const sim = await api.simulateAgentCashOutRequest({
                    callerPhone: callerNumber,
                    agentCode: "284910",
                    agentName: "Kofi Mensah Enterprise (MoMo Agent)",
                    amount: 50.0,
                  });
                  setPendingAgentRequest(sim.request);
                  addLog("state", `⚡ MoMo Agent terminal pushed request: GHS ${sim.request.amount} by ${sim.request.agentName}`);
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
              {[
                { label: "1 (One)", desc: "Say 'One' -> Mapped to DTMF 1" },
                { label: "2 (Two)", desc: "Say 'Two' -> Mapped to DTMF 2" },
                { label: "3 (Three)", desc: "Say 'Three' -> Mapped to DTMF 3" },
                { label: "English", desc: "Select English (DTMF 1)" },
                { label: "Twi", desc: "Select Akan Twi (DTMF 2)" },
                { label: "Mobile Money", desc: "Service 1 (MoMo)" },
                { label: "MTN", desc: "Network 1 (MTN)" },
                { label: "Send money", desc: "Action 1 (Send Money)" },
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
                                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                                  {STEP_FRIENDLY_NAMES[turn.stepName] || turn.stepName}
                                </span>
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
                                <span>{turn.audioUrl ? "Studio Audio" : "Voice Synthesizer"}</span>
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
                    <div>Primary ASR: <span className="text-emerald-400">GhanaNLP v3 + Open Vosk</span></div>
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
