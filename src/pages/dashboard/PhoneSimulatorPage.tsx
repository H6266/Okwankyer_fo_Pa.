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
} from "lucide-react";
import { audioPlaybackController } from "../../audio/audioPlaybackController";
import { isAcousticSystemEcho } from "../../domain/echoFilter";
import { resolvePrompt } from "../../modules/ttsService";
import { api } from "../../lib/api";
import { continuousAudioEngine, ContinuousAudioState } from "../../audio/continuousAudioEngine";
import { AcousticVisualizer } from "../../components/audio/AcousticVisualizer";
import { parseLongDiscussion, ParsedDiscussionState } from "../../ai_system/brain/longDiscussionParser";
import { normalizeSpokenDigits } from "../../ai_system/speech/acousticModels/ghanaAcousticDataset";
import {
  repairGhanaianPronunciation,
  extractStreamingWords,
  PhoneticCorrection,
} from "../../ai_system/speech/asr/ghanaianPhoneticMatcher";

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
  "provider-select": "1=MTN, 2=Telecel, 3=AT, 9=Repeat, 0=Exit",
  "provider-choice": "1=MTN, 2=Telecel, 3=AT, 9=Repeat, 0=Exit",
  "action-select": "1=Send Money, 2=Check Balance, 8=Back, 9=Repeat, 0=Exit",
  "action-choice": "1=Send Money, 2=Check Balance, 8=Back, 9=Repeat, 0=Exit",
  "enter-recipient": "10-digit number followed by #",
  "verify-recipient": "10-digit number followed by #",
  "recipient-verify-choice": "1=Confirm, 2=Re-enter, 8=Back, 9=Repeat",
  "enter-amount": "Amount in Cedis followed by # (* for pesewas)",
  "verify-amount": "Amount followed by #",
  "safe-confirmation": "1=Confirm Transfer, 2=Edit, 9=Repeat, 0=Cancel",
  "safe-outcome": "1=Confirm Transfer, 0=Cancel",
};

const STEP_FRIENDLY_NAMES: Record<string, string> = {
  "voice-menu": "Welcome & Language Gate",
  "language-selection": "Language Selection",
  "service-select": "Service Selection (MoMo / Banking)",
  "service-choice": "Service Selection",
  "provider-select": "Network Selection (MTN / Telecel / AT)",
  "provider-choice": "Network Provider",
  "action-select": "Action Menu (Send / Balance)",
  "action-choice": "Action Choice",
  "enter-recipient": "Recipient Phone Entry",
  "verify-recipient": "Verify Recipient Phone",
  "recipient-verify-choice": "Confirm Recipient Name",
  "enter-amount": "Amount Entry",
  "verify-amount": "Verify Amount",
  "safe-confirmation": "Safe Transfer Confirmation",
  "safe-outcome": "Zero-PIN Handoff & Authorization",
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

export const PhoneSimulatorPage: React.FC = () => {
  // ── Call Session State ────────────────────────────────────────────────
  const [callActive, setCallActive] = useState<boolean>(false);
  const [callStatus, setCallStatus] = useState<string>("Idle");
  const [sessionId, setSessionId] = useState<string>("");
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

  // Preload studio audio prompts for instant 0ms playback
  useEffect(() => {
    audioPlaybackController.preload([
      "/audio/Welcome_prompt_01.mp3",
      "/audio/English/Audio_prompt_02.mp3",
      "/audio/English/Audio_prompt_03.mp3",
      "/audio/English/Audio_prompt_04.mp3",
      "/audio/English/Audio_prompt_06.mp3",
      "/audio/English/Audio_prompt_07.mp3",
      "/audio/English/Audio_prompt_09.mp3",
      "/audio/English/Audio_prompt_10.mp3",
      "/audio/English/Audio_prompt_11.mp3",
      "/audio/English/Audio_prompt_12.mp3",
      "/audio/Twi/Welcome_prompt_01.mp3",
      "/audio/Twi/Audio_prompt_twi_02.mp3",
      "/audio/Twi/Audio_prompt_twi_03.mp3",
      "/audio/Twi/Audio_prompt_twi_04.mp3",
      "/audio/Twi/Audio_prompt_twi_05.mp3",
      "/audio/Twi/Audio_prompt_twi_06.mp3",
      "/audio/Twi/Audio_prompt_twi_07.mp3",
      "/audio/Twi/Audio_prompt_twi_08.mp3",
      "/audio/Twi/Audio_prompt_twi_09.mp3",
      "/audio/Twi/Audio_prompt_twi_10.mp3",
      "/audio/Twi/Audio_prompt_twi_11.mp3",
      "/audio/Twi/Audio_prompt_twi_12.mp3",
    ]);
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

  // Audio controller subscription: automatically turn on mic when audio ends playing
  useEffect(() => {
    let wasPlaying = false;
    const unsubscribe = audioPlaybackController.subscribe((state) => {
      setIsAudioSpeaking(state.isPlaying);
      if (!callActiveRef.current) return;
      if (state.isPlaying) {
        wasPlaying = true;
        setCallStatus("Speaking");
      } else {
        if (wasPlaying && !zeroPinOverlayRef.current) {
          wasPlaying = false;
          // Automatically unmute and turn on microphone to record user's need when prompt audio finishes
          setIsMicMuted(false);
          isMicMutedRef.current = false;
          continuousAudioEngine.setZeroPinMuted(false);
          continuousAudioEngine.startAlwaysOnMic(languageRef.current || "en", activeStepNameRef.current);
          addLog("asr", "🎙️ Audio prompt finished — Microphone automatically turned ON to record your need.");
        }
        if (!isMicMutedRef.current && !zeroPinOverlayRef.current) {
          setCallStatus("Listening");
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
      setRawVoiceXml(xmlText);
      const parsed = parseVoiceXml(xmlText);
      if (meta?.httpStatus) parsed.httpStatus = meta.httpStatus;
      if (meta?.guardReason) parsed.guardReason = meta.guardReason;

      // Extract step name from URL
      let stepName = "voice-menu";
      try {
        const u = new URL(effectiveUrl, window.location.origin);
        stepName = u.pathname.replace(/^\//, "").replace(/^api\/simulator\//, "") || "voice-menu";
        const langParam = u.searchParams.get("lang");
        if (langParam === "twi") setLanguage("twi");
        else if (langParam === "en") setLanguage("en");
      } catch {
        const match = effectiveUrl.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/);
        if (match) stepName = match[1];
      }
      activeStepNameRef.current = stepName;
      setActiveStepName(stepName);
      continuousAudioEngine.setContext(stepName, language || "en");

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
          setZeroPinOverlay(true);
          setCallStatus("Ended (PIN Handoff)");
          const pinText = language === "twi" 
            ? "Yɛsrɛ wo, hwɛ wo fon no so na fa wo MoMo PIN a ɛyɛ kokoam no hyɛ mu."
            : "Please check your phone screen and enter your secret MoMo PIN securely.";
          setCurrentPrompt(pinText);
          currentPromptRef.current = pinText;
          addLog("state", "Zero-PIN Handoff: Telco USSD push sent to phone screen. Mic muted.");
          addChatTurn({
            sender: "system",
            text: pinText,
            stepName: "safe-outcome",
            options: "Enter PIN on phone screen",
            audioSource: "synthesis",
          });
          audioPlaybackController.speakText(pinText).catch(() => {});
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
      } else if (parsed.playUrl) {
        const filename = parsed.playUrl.split("/").pop() || "";
        if (filename.includes("Welcome_prompt_01")) {
          promptText = "Welcome to Ɔkwankyerɛfo Pa. For English press 1, for Twi press 2.";
        } else if (filename.includes("02")) {
          promptText = language === "twi" ? "Afei paw wo network." : "Select your service. Press 1 for MoMo, 2 for Banking.";
        } else if (filename.includes("03")) {
          promptText = language === "twi" ? "Sɛ wopɛ sɛ wosend sika kɔ ma momo user a mia 1." : "Select your network: Press 1 for MTN, 2 for Telecel, 3 for AT.";
        } else if (filename.includes("04") || filename.includes("05")) {
          promptText = language === "twi" ? "Afei bɔ nɔmba a wopɛ sɛ wosend sika no kɔ ma no." : "Action menu: Press 1 to send money, 2 to check balance.";
        } else if (filename.includes("06")) {
          promptText = language === "twi" ? "Bɔ nɔmba no a wopɛ sɛ wosend sika no kɔ ma no na fa # ka ho." : "Enter 10-digit recipient phone number followed by #.";
        } else if (filename.includes("07") || filename.includes("09")) {
          promptText = language === "twi" ? "Bɔ sika dodow a wopɛ sɛ womane no wɔ Cedi mu na fa # ka ho." : "Enter the amount in Cedis followed by #.";
        } else if (filename.includes("10")) {
          promptText = language === "twi" ? "Bammbɔ Nkaebɔ: Sɛ ɛyɛ ampa a mia 1 na fa to so." : "Safe confirmation: Press 1 to confirm transfer, 2 to change.";
        } else if (filename.includes("11")) {
          promptText = language === "twi" ? "Wobɔɔ nɔmba a ɛnyɛ pɛpɛɛpɛ. Yɛsrɛ wo san tie biom." : "Incorrect figure entered. Please listen carefully.";
        } else {
          promptText = "Listening for your response...";
        }
      } else {
        // Fallback friendly script
        promptText = language === "twi" ? "Yɛsrɛ wo paw deɛ wopɛ wɔ menyu no so." : "Please select an option from the menu.";
      }

      setCurrentPrompt(promptText);
      currentPromptRef.current = promptText;
      setActivePlayUrl(parsed.playUrl || null);

      // Log reply text and options
      addLog("reply", `"${promptText}"`);
      const choices = STEP_OPTIONS_MAP[stepName] || "Keypad or Speech";
      addLog("state", `step=${stepName}, options: [${choices}]`);

      // Add to interactive Chat timeline
      addChatTurn({
        sender: "system",
        text: promptText,
        stepName,
        audioUrl: parsed.playUrl || null,
        audioSource: parsed.playUrl ? "studio" : "synthesis",
        options: choices,
      });

      // Play audio automatically (studio audio or neural synthesis)
      audioPlaybackController.unlockAudio();
      if (parsed.playUrl) {
        addLog("audio", `🔊 Auto-playing prompt: ${parsed.playUrl}`);
        audioPlaybackController.play(parsed.playUrl, promptText).catch((err) => {
          console.warn("[PhoneSimulator] Auto-play prompt failed:", err);
        });
      } else {
        addLog("audio", `🔊 Auto-playing prompt via speech synthesis`);
        audioPlaybackController.speakText(promptText).catch((err) => {
          console.warn("[PhoneSimulator] Speech synthesis failed:", err);
        });
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

        const guardReason = res.headers.get("x-telephony-guard-reason") || undefined;
        const aiDecisionType = res.headers.get("x-ai-decision-type");
        const aiDecisionReason = res.headers.get("x-ai-decision-reason");
        const aiReplyText = res.headers.get("x-ai-reply-text");
        const aiReplyKey = res.headers.get("x-ai-reply-key");

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

    audioPlaybackController.preload([
      "/audio/Welcome_prompt_01.mp3",
      "/audio/English/Audio_prompt_02.mp3",
      "/audio/Twi/Audio_prompt_twi_02.mp3",
      "/audio/English/Audio_prompt_03.mp3",
      "/audio/Twi/Audio_prompt_twi_03.mp3",
      "/audio/English/Audio_prompt_04.mp3",
      "/audio/English/Audio_prompt_05.mp3",
      "/audio/English/Audio_prompt_06.mp3",
      "/audio/English/Audio_prompt_07.mp3",
      "/audio/English/Audio_prompt_08.mp3",
      "/audio/English/Audio_prompt_09.mp3",
      "/audio/English/Audio_prompt_10.mp3",
    ]);

    const newSession = `AT_CALL_${Date.now()}`;
    callActiveRef.current = true;
    sessionIdRef.current = newSession;
    activeStepNameRef.current = "voice-menu";
    const initialCallback = `/api/simulator/language-selection?sessionId=${newSession}`;
    activeCallbackUrlRef.current = initialCallback;
    currentPromptRef.current = "Welcome to Ɔkwankyerɛfo Pa. For English press 1, for Twi press 2.";

    setSessionId(newSession);
    setCallActive(true);
    setCallStatus("Connected");
    setLanguage(null);
    setDigitsBuffer("");
    setZeroPinOverlay(false);
    setRecentStreamingWords([]);

    addLog("system", `Call initiated. Session ID: ${newSession}`);
    addLog("state", "Connecting to phone simulator (/api/simulator/voice-menu)...");

    // Launch Always-On Continuous Audio Engine
    continuousAudioEngine.startAlwaysOnMic(languageRef.current || "en", "voice-menu");
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

      addLog("state", `Call ended (${reason})`);
      addChatTurn({
        sender: "system",
        text: `Call ended: ${reason}. Thank you for using Ɔkwankyerɛfo Pa.`,
        stepName: "ended",
      });
    },
    [addLog, addChatTurn]
  );

  // ── Speech Recognition & Spoken Turn Handler ──────────────────────────
  const processSpokenUtterance = useCallback(
    async (
      utterance: string,
      parsedDiscussion?: ParsedDiscussionState,
      isDirectSimulated: boolean = false
    ) => {
      // If call is inactive, initiate call first
      if (!callActiveRef.current) {
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

      addLog("caller", `Speech "${clean}"`);
      addLog("asr", `✅ Recognized utterance: "${effectiveClean}"`);

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
      const targetCallback =
        activeCallbackUrlRef.current ||
        activeCallbackUrl ||
        getFallbackCallbackUrl(curStep, curSession);

      // Long discussion parsing & fast-track
      const discussion = parsedDiscussion || parseLongDiscussion(effectiveClean, curStep);
      if (
        discussion.shortcutSuggestedStep === "safe-confirmation" &&
        discussion.slots.recipientPhone &&
        discussion.slots.amount
      ) {
        addLog(
          "AI",
          `Transfer intention extracted: ${discussion.slots.amount} GHS to ${
            discussion.slots.recipientName || discussion.slots.recipientPhone
          }`
        );
        try {
          await fetch(`/api/simulator/verify-recipient?sessionId=${curSession}&lang=${curLang}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dtmfDigits: discussion.slots.recipientPhone + "#" }),
          });
          await fetch(`/api/simulator/enter-amount?sessionId=${curSession}&lang=${curLang}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dtmfDigits: String(discussion.slots.amount) + "#" }),
          });
          return dispatchVoiceWebhook(
            `/api/simulator/safe-confirmation?sessionId=${curSession}&lang=${curLang}`
          );
        } catch {}
      }

      const digitsOnly = effectiveClean.replace(/\D/g, "");
      if (curStep.includes("recipient")) {
        const phone = discussion.slots.recipientPhone || (digitsOnly.length === 10 ? digitsOnly : null);
        if (phone) {
          addLog("AI", `Recipient phone parsed: ${phone}`);
          return dispatchVoiceWebhook(targetCallback, { dtmfDigits: phone + "#" });
        }
      }

      if (curStep.includes("amount")) {
        const amt = discussion.slots.amount || (digitsOnly.length > 0 && digitsOnly.length <= 6 ? digitsOnly : null);
        if (amt) {
          addLog("AI", `Amount parsed: ${amt} Cedis`);
          return dispatchVoiceWebhook(targetCallback, { dtmfDigits: String(amt) + "#" });
        }
      }

      // Fast-path: map common spoken Ghanaian tokens to step digits
      const lower = effectiveClean.toLowerCase();
      let matchedDtmf: string | null = null;

      if (
        curStep.includes("welcome") ||
        curStep.includes("language") ||
        curStep === "voice-menu"
      ) {
        if (/\b(1|one|won|wan|english|borɔfo|first|option 1|option one|number 1|number one|choice 1|choice one|baako|bako)\b/i.test(lower)) matchedDtmf = "1";
        else if (/\b(2|two|tu|too|to|twi|akan|asante|mmienu|mienu|second|option 2|option two|number 2|number two|choice 2|choice two)\b/i.test(lower)) matchedDtmf = "2";
        else if (/\b(0|zero|exit|cancel|stop|gyae|hwee)\b/i.test(lower)) matchedDtmf = "0";
      } else if (curStep.includes("service")) {
        if (/\b(1|one|won|wan|momo|mobile money|telecom|first|option 1|option one|baako)\b/i.test(lower)) matchedDtmf = "1";
        else if (/\b(2|two|tu|too|bank|banking|sikakorabea|second|option 2|option two|mmienu)\b/i.test(lower)) matchedDtmf = "2";
        else if (/\b(9|nine|repeat|say again|tie bio)\b/i.test(lower)) matchedDtmf = "9";
        else if (/\b(0|zero|exit|cancel|quit|gyae)\b/i.test(lower)) matchedDtmf = "0";
      } else if (curStep.includes("provider")) {
        if (/\b(1|one|won|wan|mtn|yellow|mtn momo|first|option 1|option one|baako)\b/i.test(lower)) matchedDtmf = "1";
        else if (/\b(2|two|tu|too|telecel|vodafone|voda|red|second|option 2|option two|mmienu)\b/i.test(lower)) matchedDtmf = "2";
        else if (/\b(3|three|tree|tri|airteltigo|at|tigo|blue|third|option 3|option three|mmiɛnsa|mmiensa)\b/i.test(lower)) matchedDtmf = "3";
        else if (/\b(9|nine|repeat|tie bio)\b/i.test(lower)) matchedDtmf = "9";
        else if (/\b(0|zero|exit|cancel)\b/i.test(lower)) matchedDtmf = "0";
      } else if (curStep.includes("action")) {
        if (/\b(1|one|won|wan|send|send money|transfer|mane|soma|first|option 1|option one|baako)\b/i.test(lower)) matchedDtmf = "1";
        else if (/\b(2|two|tu|too|balance|check balance|my balance|second|option 2|option two|mmienu)\b/i.test(lower)) matchedDtmf = "2";
        else if (/\b(8|eight|back|go back|previous|san|san akyi)\b/i.test(lower)) matchedDtmf = "8";
        else if (/\b(9|nine|repeat|tie bio)\b/i.test(lower)) matchedDtmf = "9";
        else if (/\b(0|zero|exit|cancel)\b/i.test(lower)) matchedDtmf = "0";
      } else if (curStep.includes("confirm") || curStep.includes("verify-choice")) {
        if (/\b(1|one|won|wan|yes|confirm|aane|pene so|yie|ampa|proceed|okay|correct|send it|pay|approve|first|option 1|option one|baako)\b/i.test(lower)) matchedDtmf = "1";
        else if (/\b(2|two|tu|too|no|dabi|sesa|change|cancel|edit|re-enter|second|option 2|option two|mmienu)\b/i.test(lower)) matchedDtmf = "2";
        else if (/\b(8|eight|back|go back|previous|san)\b/i.test(lower)) matchedDtmf = "8";
        else if (/\b(9|nine|repeat|tie bio)\b/i.test(lower)) matchedDtmf = "9";
        else if (/\b(0|zero|cancel|stop|abort|gyae)\b/i.test(lower)) matchedDtmf = "0";
      }

      // Universal navigation and single spoken numerals
      if (!matchedDtmf) {
        if (/\b(back|go back|previous|san|san akyi)\b/i.test(lower)) matchedDtmf = "8";
        else if (/\b(repeat|again|say again|tie bio)\b/i.test(lower)) matchedDtmf = "9";
        else if (/\b(cancel|stop|abort|quit|exit|gyae|hwee)\b/i.test(lower)) matchedDtmf = "0";
        else if (/^(?:1|one|won|wan|baako)$/i.test(lower.trim())) matchedDtmf = "1";
        else if (/^(?:2|two|tu|too|to|mmienu)$/i.test(lower.trim())) matchedDtmf = "2";
        else if (/^(?:3|three|tree|tri|mmiɛnsa|mmiensa)$/i.test(lower.trim())) matchedDtmf = "3";
        else if (/^(?:4|four|fo|ɛnan|enan)$/i.test(lower.trim())) matchedDtmf = "4";
        else if (/^(?:5|five|enum|num)$/i.test(lower.trim())) matchedDtmf = "5";
        else if (/^(?:6|six|nsia)$/i.test(lower.trim())) matchedDtmf = "6";
        else if (/^(?:7|seven|nson)$/i.test(lower.trim())) matchedDtmf = "7";
        else if (/^(?:8|eight|nwɔtwe|nwotwe)$/i.test(lower.trim())) matchedDtmf = "8";
        else if (/^(?:9|nine|nkron)$/i.test(lower.trim())) matchedDtmf = "9";
        else if (/^(?:0|zero|hwee)$/i.test(lower.trim())) matchedDtmf = "0";
        else if (activeNumDigits === 1 && /^[0-9]$/.test(lower.trim())) matchedDtmf = lower.trim();
      }

      if (matchedDtmf) {
        addLog("asr", `⚡ Spoken input recognized: "${effectiveClean}" ➔ Keypad [${matchedDtmf}]`);
        addLog("state", `🔄 ASR synced with system: Auto-dialing [${matchedDtmf}] on step "${curStep}"`);
        setVoiceSyncStatus({
          text: effectiveClean,
          action: `Auto-dialed DTMF [${matchedDtmf}]`,
          dtmf: matchedDtmf,
          timestamp: Date.now(),
        });
        setActiveKeypadPulse(matchedDtmf);
        audioPlaybackController.playDtmfTone(matchedDtmf, 130);
        setTimeout(() => setActiveKeypadPulse(null), 450);

        return dispatchVoiceWebhook(targetCallback, { dtmfDigits: matchedDtmf });
      }

      // Brain path: POST /api/ivr/understand
      try {
        const brainRes = await fetch("/api/ivr/understand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            utterance: effectiveClean,
            currentStep: curStep,
            callState: { lang: curLang, sessionId: curSession },
            sessionId: curSession,
          }),
        });

        if (brainRes.ok) {
          const decision = await brainRes.json();
          if (decision.type === "dtmf" && decision.dtmf) {
            addLog("AI", `dtmf=${decision.dtmf} (${decision.reason || "brain resolved option"})`);
            addLog("state", `🔄 ASR synced with system: Brain resolved "${effectiveClean}" ➔ Keypad [${decision.dtmf}]`);
            setVoiceSyncStatus({
              text: effectiveClean,
              action: `AI Brain mapped to [${decision.dtmf}]`,
              dtmf: decision.dtmf,
              timestamp: Date.now(),
            });
            setActiveKeypadPulse(decision.dtmf);
            audioPlaybackController.playDtmfTone(decision.dtmf, 130);
            setTimeout(() => setActiveKeypadPulse(null), 450);
            return dispatchVoiceWebhook(targetCallback, { dtmfDigits: decision.dtmf });
          }

          if (decision.type === "skip" && decision.targetStep) {
            const targetUrl = `/${decision.targetStep}?sessionId=${curSession}&lang=${curLang}`;
            return dispatchVoiceWebhook(targetUrl);
          }

          if (decision.replyText) {
            addLog("AI", `Brain reply: "${decision.replyText}"`);
            addChatTurn({
              sender: "ai",
              text: decision.replyText,
              audioSource: "synthesis",
            });
            if (decision.promptAudio) {
              await audioPlaybackController.play(decision.promptAudio, decision.replyText);
            } else {
              await audioPlaybackController.speakText(decision.replyText);
            }
            return;
          }
        }
      } catch (err: any) {
        addLog("system", `Cognitive reasoning note: ${err.message}`);
      }

      // Default fallback replay
      const fallbackUrl = resolvePrompt("wrong_figure", curLang);
      if (fallbackUrl) {
        audioPlaybackController.play(fallbackUrl, "Please choose from the available options.").catch(() => {});
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
      processSpokenUtterance(effective, undefined, true);
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
    const unsubUtterance = continuousAudioEngine.subscribeUtterance((utterance, parsedDiscussion) => {
      if (isMicMutedRef.current || zeroPinOverlayRef.current) return;
      if (utterance && utterance.trim()) {
        processSpokenUtterance(utterance, parsedDiscussion);
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

      // Single-digit expectation
      if (activeNumDigits === 1) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${digit}'`);
        dispatchVoiceWebhook(targetCallback, { dtmfDigits: digit });
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
    if (audioUrl) {
      audioPlaybackController.play(audioUrl, text || currentPrompt).catch(() => {});
    } else if (text) {
      audioPlaybackController.speakText(text).catch(() => {});
    }
  };

  // Test sound output
  const handleTestAudio = async () => {
    audioPlaybackController.unlockAudio();
    setTestAudioStatus("Testing sound...");
    try {
      const ok = await audioPlaybackController.play("/audio/Welcome_prompt_01.mp3", "Welcome to Okwankyerɛfo Pa.");
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
                onClick={toggleMic}
                disabled={!callActive || zeroPinOverlay}
                aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                  isMicMuted
                    ? "bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/60"
                    : isAudioSpeaking
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                    : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/20"
                } disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
              >
                {isMicMuted ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className={`w-3.5 h-3.5 ${!isAudioSpeaking && callActive ? "animate-pulse text-emerald-400" : ""}`} />
                )}
                <span>
                  {isMicMuted
                    ? "Mic Muted"
                    : isAudioSpeaking
                    ? "Audio Playing (Mic Ready)"
                    : "Mic Recording ON"}
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
