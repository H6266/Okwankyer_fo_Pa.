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
} from "lucide-react";
import { audioPlaybackController } from "../../audio/audioPlaybackController";
import { isAcousticSystemEcho } from "../../domain/echoFilter";
import { resolvePrompt } from "../../modules/ttsService";
import { api } from "../../lib/api";

interface TerminalLog {
  id: string;
  time: string;
  source: "caller" | "state" | "AI" | "reply" | "audio" | "system";
  message: string;
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
}

const STEP_OPTIONS_MAP: Record<string, string> = {
  "voice-menu": "1=English, 2=Twi, 0=Exit",
  "language-selection": "1=English, 2=Twi, 0=Exit",
  "service-select": "1=Mobile Money, 2=Banking, 8=Back, 9=Repeat, 0=Exit",
  "service-choice": "1=Mobile Money, 2=Banking, 8=Back, 9=Repeat, 0=Exit",
  "provider-select": "1=MTN, 2=Telecel, 3=AT, 8=Back, 9=Repeat, 0=Exit",
  "provider-choice": "1=MTN, 2=Telecel, 3=AT, 8=Back, 9=Repeat, 0=Exit",
  "action-select": "1=Send Money, 2=Check Balance, 8=Back, 9=Repeat, 0=Exit",
  "action-choice": "1=Send Money, 2=Check Balance, 8=Back, 9=Repeat, 0=Exit",
  "enter-recipient": "10 Digits followed by #, 8=Back, 0=Exit",
  "verify-recipient": "10 Digits followed by #, 8=Back, 0=Exit",
  "recipient-verify-choice": "1=Confirm Recipient, 2=Re-enter, 8=Back, 0=Exit",
  "enter-amount": "Amount followed by # (* for pesewas), 8=Back, 0=Exit",
  "verify-amount": "Amount followed by #, 8=Back, 0=Exit",
  "safe-confirmation": "1=Confirm & Authorize, 2=Edit Amount, 8=Back, 0=Exit",
  "safe-outcome": "1=Confirm & Authorize, 0=Cancel",
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
  { digit: "*", sub: "" },
  { digit: "0", sub: "+" },
  { digit: "#", sub: "" },
];

export const PhoneSimulatorPage: React.FC = () => {
  // Call session state
  const [callActive, setCallActive] = useState<boolean>(false);
  const [callStatus, setCallStatus] = useState<string>("Idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [callerNumber] = useState<string>("0543546010");
  const [language, setLanguage] = useState<"en" | "twi" | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("Lift handset or press Call to begin.");
  const [digitsBuffer, setDigitsBuffer] = useState<string>("");
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [micUnavailable, setMicUnavailable] = useState<boolean>(false);
  const [clock, setClock] = useState<string>("10:00");
  const [zeroPinOverlay, setZeroPinOverlay] = useState<boolean>(false);

  // XML / Backend routing state
  const [activeCallbackUrl, setActiveCallbackUrl] = useState<string | null>(null);
  const [activeNumDigits, setActiveNumDigits] = useState<number>(1);
  const [activeFinishOnKey, setActiveFinishOnKey] = useState<string>("#");
  const [activeStepName, setActiveStepName] = useState<string>("idle");
  const [rawVoiceXml, setRawVoiceXml] = useState<string>("");
  const [showDevView, setShowDevView] = useState<boolean>(false);

  // Terminal log
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([
    {
      id: "init",
      time: new Date().toTimeString().slice(0, 8),
      source: "system",
      message: "Ɔkwankyerɛfo Pa phone simulator initialized. Keypad and terminal active.",
    },
  ]);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastUtteranceTimeRef = useRef<number>(0);
  const lastUtteranceTextRef = useRef<string>("");
  const silenceCountRef = useRef<number>(0);
  const lastSubmitted10DigitRef = useRef<number>(0);

  // Clock timer
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
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

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Audio controller subscription
  useEffect(() => {
    const unsubscribe = audioPlaybackController.subscribe((state) => {
      if (!callActive) return;
      if (state.isPlaying) {
        setCallStatus("Speaking");
      } else if (!isMicMuted && !zeroPinOverlay) {
        setCallStatus("Listening");
      }
    });
    return () => unsubscribe();
  }, [callActive, isMicMuted, zeroPinOverlay]);

  // Helper to append a single chronological line to the terminal
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

  // Format MM:SS timer
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  /**
   * Client-side VoiceXML parser for Africa's Talking XML
   */
  const parseVoiceXml = (xml: string): ParsedVoiceXml => {
    const result: ParsedVoiceXml = {
      raw: xml,
      isReject: xml.includes("<Reject/>") || xml.includes("<Reject />"),
    };

    // <Redirect>url</Redirect>
    const redirMatch = xml.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/i);
    if (redirMatch) {
      result.redirectUrl = redirMatch[1].trim().replace(/&amp;/g, "&");
    }

    // <GetDigits attributes>
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

    // <Play url="..."/> or <Play>...</Play>
    const playUrlMatch = xml.match(/<Play[^>]*\s+url=["']([^"']+)["'][^>]*>/i);
    if (playUrlMatch) {
      result.playUrl = playUrlMatch[1].trim();
    } else {
      const playInnerMatch = xml.match(/<Play[^>]*>([^<]+)<\/Play>/i);
      if (playInnerMatch) {
        result.playUrl = playInnerMatch[1].trim();
      }
    }

    // <Say voice="...">text</Say>
    const sayMatch = xml.match(/<Say[^>]*>([\s\S]*?)<\/Say>/i);
    if (sayMatch) {
      result.sayText = sayMatch[1].trim();
    }

    return result;
  };

  /**
   * Executes the returned Africa's Talking VoiceXML
   */
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
        stepName = u.pathname.replace(/^\//, "") || "voice-menu";
        const langParam = u.searchParams.get("lang");
        if (langParam === "twi") setLanguage("twi");
        else if (langParam === "en") setLanguage("en");
      } catch {
        // Fallback step name
        const match = effectiveUrl.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/);
        if (match) stepName = match[1];
      }
      setActiveStepName(stepName);

      // 1. Follow <Redirect> immediately
      if (parsed.redirectUrl) {
        addLog("state", `Redirecting to ${parsed.redirectUrl}`);
        return dispatchVoiceWebhook(parsed.redirectUrl);
      }

      // 2. Handle <Reject/>
      if (parsed.isReject) {
        audioPlaybackController.stop();
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
          setCurrentPrompt("Please check phone screen & enter MoMo PIN.");
          addLog("state", "Zero-PIN Handoff: Telco USSD push sent to phone screen. Mic muted.");
        } else {
          setCallStatus("Ended");
          setCurrentPrompt("Call ended. Goodbye.");

          // Display specific rejection reason from telephony guard or HTTP status
          const rejectReasonDesc = parsed.guardReason
            ? `Call rejected: ${parsed.guardReason} (HTTP ${parsed.httpStatus || 401})`
            : parsed.httpStatus && parsed.httpStatus !== 200
            ? `Call rejected with HTTP ${parsed.httpStatus} (<Reject/>)`
            : "Call rejected: Telephony reject response (<Reject/>)";
          addLog("state", rejectReasonDesc);
        }

        setCallActive(false);
        setActiveCallbackUrl(null);
        return;
      }

      // 3. Configure GetDigits expectations
      if (parsed.getDigits) {
        setActiveCallbackUrl(parsed.getDigits.callbackUrl || null);
        setActiveNumDigits(parsed.getDigits.numDigits || 1);
        setActiveFinishOnKey(parsed.getDigits.finishOnKey || "#");
      }

      // 4. Determine display prompt text
      let promptText = "";
      if (parsed.sayText) {
        promptText = parsed.sayText;
      } else if (parsed.playUrl) {
        const filename = parsed.playUrl.split("/").pop() || "";
        if (filename.includes("Welcome_prompt_01")) {
          promptText = "Welcome to Ɔkwankyerɛfo Pa. For English press 1, for Twi press 2.";
        } else if (filename.includes("02")) {
          promptText = language === "twi" ? "Afei paw wo network." : "Select your service.";
        } else if (filename.includes("03")) {
          promptText = language === "twi" ? "Sɛ wopɛ sɛ wosend sika kɔ ma momo user a mia 1." : "Select your network provider.";
        } else if (filename.includes("04") || filename.includes("05")) {
          promptText = language === "twi" ? "Afei bɔ nɔmba a wopɛ sɛ wosend sika no kɔ ma no." : "Action menu: Press 1 to send money.";
        } else if (filename.includes("06")) {
          promptText = language === "twi" ? "Bɔ nɔma no na fa # ka ho." : "Enter 10-digit recipient phone number followed by #.";
        } else if (filename.includes("07") || filename.includes("09")) {
          promptText = language === "twi" ? "Bɔ sika dodow a wopɛ sɛ womane no." : "Enter the amount in Cedis followed by #.";
        } else if (filename.includes("10")) {
          promptText = language === "twi" ? "Bammbɔ Nkaebɔ: Sɛ ɛyɛ ampa a mia 1." : "Safe confirmation: Press 1 to confirm transfer.";
        } else if (filename.includes("11")) {
          promptText = language === "twi" ? "Wobɔɔ nɔmba a ɛnyɛ pɛpɛɛpɛ." : "Incorrect figure entered. Please listen carefully.";
        } else {
          promptText = "Listening for your response...";
        }
      }
      setCurrentPrompt(promptText);

      // 5. Log reply text and options
      if (promptText) {
        addLog("reply", `"${promptText}"`);
      }
      const choices = STEP_OPTIONS_MAP[stepName] || "Keypad or Speech";
      addLog("state", `step=${stepName}, options: [${choices}]`);

      // 6. Audio playback through AudioPlaybackController
      if (parsed.playUrl) {
        addLog("audio", parsed.playUrl);
        await audioPlaybackController.play(parsed.playUrl, promptText);
      } else {
        const keyTag = stepName;
        addLog("audio", `no audio: ${keyTag}`);
      }
    },
    [addLog, language]
  );

  /**
   * Webhook dispatcher to backend
   */
  const dispatchVoiceWebhook = useCallback(
    async (url: string, params: Record<string, string> = {}) => {
      let targetUrl = url;
      if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
        try {
          const u = new URL(targetUrl);
          targetUrl = u.pathname + u.search;
        } catch {}
      }

      // Route all telephony requests through the simulator proxy /api/simulator
      if (!targetUrl.startsWith("/api/simulator")) {
        targetUrl = `/api/simulator${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
      }

      const bodyParams = new URLSearchParams();
      bodyParams.append("sessionId", sessionId || `call_${Date.now()}`);
      bodyParams.append("callerNumber", callerNumber);
      bodyParams.append("phoneNumber", callerNumber);
      bodyParams.append("isActive", "1");
      bodyParams.append("direction", "Inbound");

      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          bodyParams.append(k, v);
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
          credentials: "include",
          body: bodyParams.toString(),
        });
        const guardReason = res.headers.get("x-telephony-guard-reason") || undefined;
        const text = await res.text();
        if (text.includes("<Response>") || text.includes("<Reject")) {
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason });
        } else if (!res.ok) {
          let errorMsg = `HTTP ${res.status}`;
          try {
            const json = JSON.parse(text);
            if (json.error) errorMsg += `: ${json.error}`;
          } catch {
            if (text) errorMsg += `: ${text.slice(0, 100)}`;
          }
          const rejectReasonDesc = guardReason
            ? `Call rejected: ${guardReason} (HTTP ${res.status})`
            : `Call rejected: ${errorMsg}`;
          addLog("state", rejectReasonDesc);
          setCallStatus("Ended");
          setCurrentPrompt("Call ended. Lift handset or press Call to begin.");
          setCallActive(false);
          audioPlaybackController.stop();
        } else {
          await executeVoiceXml(text, targetUrl, { httpStatus: res.status, guardReason });
        }
      } catch (err: any) {
        addLog("system", `Backend network error: ${err.message}`);
        setCallStatus("Error");
      }
    },
    [callerNumber, executeVoiceXml, sessionId, addLog]
  );

  /**
   * Start inbound call
   */
  const startCall = useCallback(async () => {
    const newSession = `AT_CALL_${Date.now()}`;
    setSessionId(newSession);
    setCallActive(true);
    setCallStatus("Connected");
    setLanguage(null);
    setDigitsBuffer("");
    setZeroPinOverlay(false);

    addLog("system", `Call initiated. Session ID: ${newSession}`);
    addLog("state", "Connecting to phone simulator (/api/simulator/voice-menu)...");

    // Start speech recognition once permission granted
    if (!micUnavailable) {
      startSpeechRecognition();
    }

    await dispatchVoiceWebhook("/api/simulator/voice-menu", { sessionId: newSession });
  }, [dispatchVoiceWebhook, micUnavailable, addLog]);

  /**
   * Hang up the call
   */
  const endCall = useCallback(
    async (reason = "User hung up") => {
      setCallActive(false);
      setCallStatus("Ended");
      setCurrentPrompt("Call ended. Lift handset or press Call to begin.");
      setDigitsBuffer("");
      setZeroPinOverlay(false);
      setActiveCallbackUrl(null);

      audioPlaybackController.stop();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }

      addLog("caller", `Hangup: ${reason}`);
      addLog("system", "Call ended. Audio and microphone stopped.");

      // Notify backend if session active
      if (sessionId) {
        const endHeaders: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
        const token = typeof localStorage !== "undefined" ? localStorage.getItem("okw_admin_token") : null;
        if (token) endHeaders["Authorization"] = `Bearer ${token}`;
        fetch("/api/simulator/voice-menu", {
          method: "POST",
          headers: endHeaders,
          credentials: "include",
          body: new URLSearchParams({
            sessionId,
            callerNumber,
            isActive: "0",
          }).toString(),
        }).catch(() => {});
      }
    },
    [callerNumber, sessionId, addLog]
  );

  /**
   * Fast path + Brain path for spoken utterances
   */
  const processSpokenUtterance = useCallback(
    async (utterance: string) => {
      if (!callActive || !activeCallbackUrl || zeroPinOverlay) return;

      const clean = utterance.trim();
      if (!clean) return;

      // Echo filter check
      if (isAcousticSystemEcho(clean, currentPrompt, audioPlaybackController.isSpeaking())) {
        return;
      }

      // Debounce duplicate recognition events
      const now = Date.now();
      if (clean === lastUtteranceTextRef.current && now - lastUtteranceTimeRef.current < 1500) {
        return;
      }
      lastUtteranceTextRef.current = clean;
      lastUtteranceTimeRef.current = now;

      addLog("caller", `Speech "${clean}"`);

      // ── Fast path: direct match against current step's expected digits ──
      const lower = clean.toLowerCase();
      let matchedDtmf: string | null = null;

      // Language selection
      if (activeStepName.includes("welcome") || activeStepName.includes("language")) {
        if (/^(1|one|english|baako|bako)$/i.test(lower)) matchedDtmf = "1";
        else if (/^(2|two|twi|akan|mmienu|mienu)$/i.test(lower)) matchedDtmf = "2";
      }
      // Service selection
      else if (activeStepName.includes("service")) {
        if (/^(1|one|momo|mobile money|telecom|baako)$/i.test(lower)) matchedDtmf = "1";
        else if (/^(2|two|bank|banking|sikakorabea|mmienu)$/i.test(lower)) matchedDtmf = "2";
      }
      // Provider selection
      else if (activeStepName.includes("provider")) {
        if (/^(1|one|mtn|baako)$/i.test(lower)) matchedDtmf = "1";
        else if (/^(2|two|telecel|vodafone|voda|mmienu)$/i.test(lower)) matchedDtmf = "2";
        else if (/^(3|three|airteltigo|at|mmiɛnsa)$/i.test(lower)) matchedDtmf = "3";
      }
      // Action menu
      else if (activeStepName.includes("action")) {
        if (/^(1|one|send|send money|transfer|baako|mane)$/i.test(lower)) matchedDtmf = "1";
        else if (/^(2|two|balance|check balance|my balance|mmienu)$/i.test(lower)) matchedDtmf = "2";
      }
      // Affirmative / Negative confirmations
      else if (activeStepName.includes("confirm") || activeStepName.includes("verify-choice")) {
        if (/^(1|one|yes|confirm|aane|pene so|yie|ampa|proceed|baako)$/i.test(lower)) matchedDtmf = "1";
        else if (/^(2|two|no|dabi|sesa|change|cancel|mmienu)$/i.test(lower)) matchedDtmf = "2";
      }

      // Universal navigation
      if (!matchedDtmf) {
        if (/^(back|go back|previous|san|san akyi)$/i.test(lower)) matchedDtmf = "8";
        else if (/^(repeat|again|say again|tie bio)$/i.test(lower)) matchedDtmf = "9";
        else if (/^(cancel|stop|abort|quit|exit|gyae|hwee)$/i.test(lower)) matchedDtmf = "0";
      }

      if (matchedDtmf) {
        addLog("AI", `dtmf=${matchedDtmf} (fast path mapped from "${clean}")`);
        return dispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: matchedDtmf });
      }

      // ── Brain path: POST /api/ivr/understand ───────────────────────────
      try {
        const brainRes = await fetch("/api/ivr/understand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            utterance: clean,
            currentStep: activeStepName,
            callState: { lang: language, sessionId },
            sessionId,
          }),
        });

        if (!brainRes.ok) {
          throw new Error(`Brain response status ${brainRes.status}`);
        }

        const decision = await brainRes.json();

        if (decision.type === "dtmf") {
          addLog("AI", `dtmf=${decision.dtmf} (${decision.reason || "brain resolved option"})`);
          return dispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: decision.dtmf });
        }

        if (decision.type === "skip") {
          const slotsDesc = Object.entries(decision.slots || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", ");
          addLog("AI", `skip to ${decision.targetStep} (${slotsDesc})`);

          // Follow target step directly on backend
          const targetUrl = `/${decision.targetStep}?sessionId=${sessionId}&lang=${language || "en"}`;
          return dispatchVoiceWebhook(targetUrl);
        }

        if (decision.type === "clarify") {
          addLog("AI", `clarify (${decision.action || "repeat"}) - "${decision.replyText || "repeating"}"`);
          if (decision.promptAudio) {
            addLog("audio", decision.promptAudio);
            await audioPlaybackController.play(decision.promptAudio, decision.replyText);
          } else {
            addLog("audio", "no audio: clarify_say");
          }
          return;
        }

        // Unknown: fallback to prompt 11 once
        addLog("AI", "unknown (unmatched speech) -> playing prompt 11");
        const prompt11Url = resolvePrompt("wrong_figure", language || "en");
        if (prompt11Url) {
          addLog("audio", prompt11Url);
          await audioPlaybackController.play(prompt11Url, decision.promptText || "Incorrect figure");
        } else {
          addLog("audio", "no audio: wrong_figure");
        }
      } catch (err: any) {
        addLog("system", `Cognitive brain error: ${err.message}`);
      }
    },
    [
      activeCallbackUrl,
      activeStepName,
      callActive,
      currentPrompt,
      dispatchVoiceWebhook,
      language,
      sessionId,
      zeroPinOverlay,
      addLog,
    ]
  );

  /**
   * Keypad digit handler
   */
  const handleKeypadPress = useCallback(
    (digit: string) => {
      // Barge-in: immediate playback stop
      audioPlaybackController.stop();

      // If call is inactive, pressing 1 or 2 dials in that language
      if (!callActive) {
        startCall();
        return;
      }

      if (!activeCallbackUrl || zeroPinOverlay) return;

      // ── Single-digit expectation (menu selection) ──
      if (activeNumDigits === 1) {
        setDigitsBuffer("");
        addLog("caller", `Keypad '${digit}'`);
        dispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: digit });
        return;
      }

      // ── Multi-digit input (Recipient phone or Amount) ──
      // Finish on key (#)
      if (digit === activeFinishOnKey) {
        // Guard: if user just auto-submitted 10 digits within 5000ms, ignore stray #
        if (Date.now() - lastSubmitted10DigitRef.current < 5000) {
          return;
        }

        if (digitsBuffer.trim()) {
          const submitted = digitsBuffer.trim();
          setDigitsBuffer("");
          addLog("caller", `Keypad '${submitted}#'`);
          dispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: submitted });
        }
        return;
      }

      const nextBuf = digitsBuffer + digit;
      setDigitsBuffer(nextBuf);

      // Auto-submit 10-digit Ghanaian phone numbers if at recipient step
      if (activeStepName.includes("recipient") && nextBuf.length === 10) {
        lastSubmitted10DigitRef.current = Date.now();
        setDigitsBuffer("");
        addLog("caller", `Keypad '${nextBuf}' (10 Digits)`);
        dispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: nextBuf });
      }
    },
    [
      activeCallbackUrl,
      activeFinishOnKey,
      activeNumDigits,
      activeStepName,
      callActive,
      digitsBuffer,
      dispatchVoiceWebhook,
      startCall,
      zeroPinOverlay,
      addLog,
    ]
  );

  /**
   * Browser Speech Recognition Setup
   */
  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicUnavailable(true);
      addLog("system", "Speech recognition unavailable in this browser. Keypad remains fully active.");
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "twi" ? "ak-GH" : "en-US";

      recognition.onstart = () => {
        if (!zeroPinOverlay && !isMicMuted) {
          setCallStatus("Listening");
        }
      };

      recognition.onresult = (event: any) => {
        if (isMicMuted || zeroPinOverlay) return; // Strict Zero-PIN muting

        const lastIdx = event.results.length - 1;
        const res = event.results[lastIdx];
        const text = (res[0]?.transcript || "").trim();

        // Interim barge-in: stop audio immediately on speech start
        if (!res.isFinal && text.length > 1) {
          audioPlaybackController.stop();
          return;
        }

        // Final result: dispatch turn
        if (res.isFinal && text) {
          silenceCountRef.current = 0;
          processSpokenUtterance(text);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "permission-denied") {
          setMicUnavailable(true);
          setCallStatus("Mic Denied");
          addLog("system", "Microphone access denied. Telephone keypad remains fully operational.");
        } else if (e.error === "no-speech") {
          silenceCountRef.current += 1;
          if (silenceCountRef.current >= 2 && callActive) {
            addLog("system", "Silence timeout (no caller input twice). Hanging up.");
            endCall("Silence timeout");
          }
        }
      };

      recognition.onend = () => {
        // Automatically restart speech recognition while call is alive and unmuted
        if (callActive && !isMicMuted && !zeroPinOverlay) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e: any) {
      setMicUnavailable(true);
      addLog("system", `Mic initialization warning: ${e.message}`);
    }
  }, [addLog, callActive, endCall, isMicMuted, language, processSpokenUtterance, zeroPinOverlay]);

  // Physical keyboard listeners for telephone keypad
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

  // Mic toggle handler
  const toggleMic = () => {
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    if (nextState) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      addLog("caller", "Microphone muted.");
    } else {
      startSpeechRecognition();
      addLog("caller", "Microphone unmuted.");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      {/* Handset + Terminal side-by-side (stacks at phone width) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Traditional Phone Handset */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[340px] bg-slate-900 border-2 border-emerald-600 rounded-[32px] p-4 shadow-xl text-slate-100 flex flex-col items-center">
            {/* Top Earpiece Slit */}
            <div className="w-16 h-1.5 bg-slate-700 rounded-full mb-3" />

            {/* Handset Display Screen */}
            <div className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl p-3 flex flex-col justify-between min-h-[160px] text-emerald-400 font-mono shadow-inner relative">
              {/* Top Status Header */}
              <div className="flex items-center justify-between text-[11px] text-emerald-300 border-b border-emerald-500/20 pb-1 mb-1">
                <span className="font-semibold tracking-wide">MTN GH</span>
                <span>{clock}</span>
                <span>{callActive ? formatTimer(callDuration) : "00:00"}</span>
                <span className="bg-emerald-950/80 px-1 rounded border border-emerald-600/30">
                  {language ? language.toUpperCase() : "—"}
                </span>
              </div>

              {/* Center Display: Digits Buffer & Status */}
              <div className="my-auto py-1">
                {digitsBuffer ? (
                  <div className="text-2xl font-bold tracking-widest text-emerald-200 text-center truncate">
                    {digitsBuffer}
                  </div>
                ) : (
                  <div className="text-xs uppercase tracking-wider text-emerald-400/80 font-sans text-center">
                    {callStatus}
                  </div>
                )}
              </div>

              {/* Bottom Display: Current Prompt Text (One short line) */}
              <div className="text-[12px] text-slate-200 leading-tight border-t border-emerald-500/20 pt-1.5 font-sans line-clamp-2">
                {currentPrompt}
              </div>

              {/* Zero-PIN Screen Authorization Notice Overlay */}
              {zeroPinOverlay && (
                <div className="absolute inset-0 bg-slate-950/95 rounded-xl p-3 flex flex-col justify-between text-center border-2 border-emerald-400 z-10 font-sans">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    MTN MoMo PIN Screen
                  </div>
                  <div className="text-[11px] text-slate-200 leading-tight">
                    Check phone screen & enter secret MoMo PIN securely. Voice is muted (Zero-PIN).
                  </div>
                  <button
                    onClick={() => {
                      setZeroPinOverlay(false);
                      addLog("state", "MoMo PIN authorized on handset screen. Transaction dispatched.");
                      addLog("reply", "SMS confirmation and reference code dispatched. Goodbye.");
                    }}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                  >
                    Authorize on Handset
                  </button>
                </div>
              )}
            </div>

            {/* Microphone Toggle & Soft Keys Under Display */}
            <div className="w-full flex items-center justify-between mt-3 px-1">
              <button
                type="button"
                onClick={toggleMic}
                disabled={!callActive || zeroPinOverlay}
                aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold min-h-[44px] transition-colors border ${
                  isMicMuted
                    ? "bg-amber-950/40 border-amber-500/50 text-amber-300 hover:bg-amber-900/60"
                    : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMicMuted ? "Mic Off" : "Mic On"}</span>
              </button>

              <div className="text-[11px] text-slate-400 font-sans">
                {activeNumDigits > 1 ? `Enter #${activeFinishOnKey}` : "1-Key"}
              </div>
            </div>

            {/* Green Call & Red End Keys */}
            <div className="w-full grid grid-cols-2 gap-3 mt-3">
              <button
                type="button"
                onClick={startCall}
                disabled={callActive}
                aria-label="Start Call"
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl min-h-[48px] shadow transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Phone className="w-5 h-5 fill-current" />
                <span>Call</span>
              </button>

              <button
                type="button"
                onClick={() => endCall("User pressed End Call key")}
                disabled={!callActive}
                aria-label="End Call"
                className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl min-h-[48px] shadow transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PhoneOff className="w-5 h-5 fill-current" />
                <span>End</span>
              </button>
            </div>

            {/* 4x3 Keypad Grid */}
            <div className="w-full grid grid-cols-3 gap-2.5 mt-4">
              {KEYPAD_BUTTONS.map(({ digit, sub }) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeypadPress(digit)}
                  aria-label={`Key ${digit} ${sub}`}
                  className="bg-slate-800 hover:bg-slate-700 active:bg-emerald-700 active:scale-95 text-slate-100 rounded-xl min-h-[50px] flex flex-col items-center justify-center border border-slate-700 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <span className="text-lg font-bold leading-none">{digit}</span>
                  {sub && <span className="text-[9px] text-slate-400 font-semibold tracking-widest mt-0.5">{sub}</span>}
                </button>
              ))}
            </div>

            {/* Bottom Microphone Hole */}
            <div className="w-2 h-2 rounded-full bg-slate-700 mt-4" />
          </div>
        </div>

        {/* RIGHT COLUMN: Chronological Call Terminal */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-[620px]">
          {/* Terminal Top Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-sm text-slate-800">Call Terminal Log</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTerminalLogs([])}
                aria-label="Clear Terminal Logs"
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-200/60 min-h-[32px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Terminal Events Body (Chronological) */}
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto bg-slate-950 text-slate-200 space-y-1.5">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-500 italic py-8 text-center">
                Terminal idle. Start a call to observe live telephony events.
              </div>
            ) : (
              terminalLogs.map((log) => {
                let badgeClass = "text-slate-400 bg-slate-800";
                if (log.source === "caller") badgeClass = "text-emerald-300 bg-emerald-950/80 border border-emerald-600/40";
                if (log.source === "state") badgeClass = "text-sky-300 bg-sky-950/80 border border-sky-600/40";
                if (log.source === "AI") badgeClass = "text-amber-300 bg-amber-950/80 border border-amber-600/40";
                if (log.source === "reply") badgeClass = "text-violet-300 bg-violet-950/80 border border-violet-600/40";
                if (log.source === "audio") badgeClass = "text-teal-300 bg-teal-950/80 border border-teal-600/40";

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

          {/* Terminal Footer Info */}
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Authoritative Africa&apos;s Talking Webhook Engine</span>
            <span>Zero-PIN &amp; Echo Filter Enforced</span>
          </div>
        </div>
      </div>

      {/* Developer Diagnostics View (Hidden by Default) */}
      <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden bg-white">
        <button
          type="button"
          onClick={() => setShowDevView((prev) => !prev)}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left text-xs font-semibold text-slate-700 min-h-[44px]"
        >
          <span>Developer Diagnostics &amp; Raw VoiceXML</span>
          {showDevView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDevView && (
          <div className="p-4 bg-slate-900 text-slate-200 font-mono text-xs border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-[11px]">
              <div>
                <span className="text-slate-400">Active Session:</span>{" "}
                <span className="text-emerald-400">{sessionId || "none"}</span>
              </div>
              <div>
                <span className="text-slate-400">Callback URL:</span>{" "}
                <span className="text-emerald-400">{activeCallbackUrl || "none"}</span>
              </div>
              <div>
                <span className="text-slate-400">Expected Digits:</span>{" "}
                <span className="text-emerald-400">{activeNumDigits}</span>
              </div>
              <div>
                <span className="text-slate-400">Finish Key:</span>{" "}
                <span className="text-emerald-400">{activeFinishOnKey}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 mb-1">Latest VoiceXML Response:</div>
            <pre className="p-3 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto text-emerald-300 max-h-48">
              {rawVoiceXml || "<!-- No VoiceXML captured yet -->"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
