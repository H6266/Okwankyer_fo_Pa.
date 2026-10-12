import { useCallback, useEffect, useRef, useState } from "react";
import { resolvePrompt, resolvePromptText } from "../modules/ttsService";

const promptUrl = (key: string, language: "en" | "twi") => resolvePrompt(key, language) || "";

export type CallStep =
  | "idle"
  | "welcome"
  | "service"
  | "provider"
  | "action"
  | "recipient"
  | "kyc"
  | "amount"
  | "confirm"
  | "zero_pin"
  | "receipt"
  | "cancelled"
  | "timeout"
  | "error";

export interface StepDefinition {
  stepIndex: number;
  id: CallStep;
  nameEn: string;
  nameTwi: string;
  expectedInput: string;
  audioEn: string;
  audioTwi: string;
  timeoutSec?: number;
}

export const CALL_STEPS: StepDefinition[] = [
  {
    stepIndex: 1,
    id: "welcome",
    nameEn: "1. Language Selector",
    nameTwi: "1. Kasa Paw",
    expectedInput: "1 (English) or 2 (Twi)",
    audioEn: promptUrl("welcome", "en"),
    audioTwi: promptUrl("welcome", "twi"),
  },
  {
    stepIndex: 2,
    id: "service",
    nameEn: "2. Service Selection",
    nameTwi: "2. Dwumadie Paw",
    expectedInput: "1 (Mobile Money) or 2 (Banking)",
    audioEn: promptUrl("service_select", "en"),
    audioTwi: promptUrl("service_select", "twi"),
  },
  {
    stepIndex: 3,
    id: "provider",
    nameEn: "3. Network Provider",
    nameTwi: "3. Network Paw",
    expectedInput: "1 (MTN), 2 (Telecel), 3 (AT)",
    audioEn: promptUrl("provider_select", "en"),
    audioTwi: promptUrl("provider_select", "twi"),
  },
  {
    stepIndex: 4,
    id: "action",
    nameEn: "4. MoMo Action Menu",
    nameTwi: "4. MoMo Menyu",
    expectedInput: "1 (Send Money), 2 (Pay Bills), 3 (Airtime)",
    audioEn: promptUrl("action_select", "en"),
    audioTwi: promptUrl("action_select", "twi"),
  },
  {
    stepIndex: 5,
    id: "recipient",
    nameEn: "5. Recipient Phone Entry",
    nameTwi: "5. Nɔma a Woremane",
    expectedInput: "10 Digits + #",
    audioEn: promptUrl("enter_recipient", "en"),
    audioTwi: promptUrl("enter_recipient", "twi"),
    timeoutSec: 40,
  },
  {
    stepIndex: 6,
    id: "kyc",
    nameEn: "6. Spoken KYC Verification",
    nameTwi: "6. KYC Din Ka Peefe",
    expectedInput: "1 (Confirm) or 2 (Cancel)",
    audioEn: promptUrl("recipient_verify", "en"),
    audioTwi: promptUrl("recipient_verify", "twi"),
  },
  {
    stepIndex: 7,
    id: "amount",
    nameEn: "7. Amount Entry (Cedis)",
    nameTwi: "7. Sika Dodow (Cedi)",
    expectedInput: "Amount + # (* for pesewas)",
    audioEn: promptUrl("enter_amount", "en"),
    audioTwi: promptUrl("enter_amount", "twi"),
    timeoutSec: 30,
  },
  {
    stepIndex: 8,
    id: "confirm",
    nameEn: "8. Safe Confirmation Summary",
    nameTwi: "8. Bammbɔ Nkaebɔ",
    expectedInput: "1 (Confirm) or 2 (Edit)",
    audioEn: "",
    audioTwi: "",
  },
  {
    stepIndex: 9,
    id: "zero_pin",
    nameEn: "9. Zero-PIN Handset Handoff",
    nameTwi: "9. Zero-PIN Bammbɔ Apono",
    expectedInput: "Approve on phone screen (Voice muted)",
    audioEn: "",
    audioTwi: "",
  },
  {
    stepIndex: 10,
    id: "receipt",
    nameEn: "10. Spoken Audio Receipt",
    nameTwi: "10. Nne Nkaedum & Ref ID",
    expectedInput: "0 (Exit)",
    audioEn: "",
    audioTwi: "",
  },
];

export interface CallSessionState {
  isActive: boolean;
  step: CallStep;
  language: "en" | "twi" | null;
  service: "momo" | "banking";
  provider: "MTN" | "Telecel" | "AT";
  recipientPhone: string;
  recipientName: string;
  amount: string;
  referenceId: string;
  callDurationSec: number;
  stepRemainingSec: number | null;
  isMicMuted: boolean;
  isPinModalOpen: boolean;
  digitsBuffer: string;
  languageIsolationViolation: boolean;
  currentAudioUrl: string | null;
  voiceXml: string;
  eventLogs: string[];
}

export function useCallSession() {
  const [session, setSession] = useState<CallSessionState>({
    isActive: false,
    step: "idle",
    language: null,
    service: "momo",
    provider: "MTN",
    recipientPhone: "",
    recipientName: "",
    amount: "",
    referenceId: "",
    callDurationSec: 0,
    stepRemainingSec: null,
    isMicMuted: false,
    isPinModalOpen: false,
    digitsBuffer: "",
    languageIsolationViolation: false,
    currentAudioUrl: null,
    voiceXml: '<!-- Call session idle. Click "Start Call Simulation" to begin -->',
    eventLogs: ["[SYSTEM] Session initialized in idle state."],
  });

  const timerRef = useRef<any>(null);
  const stepTimerRef = useRef<any>(null);

  const addLog = useCallback((msg: string) => {
    setSession((s) => ({
      ...s,
      eventLogs: [`[${new Date().toLocaleTimeString()}] ${msg}`, ...s.eventLogs.slice(0, 49)],
    }));
  }, []);

  const generateVoiceXml = useCallback((step: CallStep, lang: "en" | "twi" | null, details: Partial<CallSessionState>) => {
    const isTwi = lang === "twi";
    const stepDefinition = CALL_STEPS.find((definition) => definition.id === step);
    const audioUrl = stepDefinition ? (isTwi ? stepDefinition.audioTwi : stepDefinition.audioEn) : "";
    const playback = audioUrl ? `<Play>${audioUrl}</Play>` : "";
    const promptKeyByStep: Partial<Record<CallStep, string>> = {
      welcome: "welcome",
      service: "service_select",
      provider: "provider_select",
      action: "action_select",
      recipient: "enter_recipient",
      kyc: "recipient_verify",
      amount: "enter_amount",
    };
    const promptKey = promptKeyByStep[step];
    const fallbackText = promptKey && lang ? resolvePromptText(promptKey, lang) : null;
    const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (character) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
    })[character] || character);
    const promptSay = !playback && fallbackText ? `<Say>${escapeXml(fallbackText)}</Say>` : "";
    switch (step) {
      case "welcome":
        return `<Response>
  <GetDigits timeout="10" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: English, 2: Akan Twi -->
</Response>`;
      case "service":
        return `<Response>
  <GetDigits timeout="15" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: Mobile Money, 2: Banking, 0: Exit -->
</Response>`;
      case "provider":
        return `<Response>
  <GetDigits timeout="15" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: MTN, 2: Telecel, 3: AT -->
</Response>`;
      case "action":
        return `<Response>
  <GetDigits timeout="20" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: Send Money, 2: Pay Bills, 8: Back, 0: Exit -->
</Response>`;
      case "recipient":
        return `<Response>
  <GetDigits timeout="40" numDigits="10" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- Generous 40s input window for accessibility -->
</Response>`;
      case "kyc":
        return `<Response>
  <GetDigits timeout="25" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- Spoken KYC Verification: ${details.recipientName || "Kwame Nyamebere"} -->
</Response>`;
      case "amount":
        return `<Response>
  <GetDigits timeout="30" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- Amount with * for pesewas (30s window) -->
</Response>`;
      case "confirm":
        return `<Response>
  <GetDigits timeout="25" finishOnKey="#" callbackUrl="/voice-menu">
    <Say>${isTwi
      ? escapeXml(`Confirm ${details.amount || ""} Ghana cedis to ${details.recipientName || ""}.`)
      : escapeXml(`Confirm ${details.amount || ""} Ghana cedis to ${details.recipientName || ""}.`)}</Say>
  </GetDigits>
  <!-- Safe Confirmation: GHS ${details.amount || "500"} to ${details.recipientName} -->
</Response>`;
      case "zero_pin":
        return `<Response>
  <!-- ZERO-PIN VOICE GATE: Audio muted, no DTMF PIN capture -->
  <!-- Trigger telco RequestToPay USSD push to handset screen -->
</Response>`;
      case "receipt":
        return `<Response>
  <!-- Spoken Receipt Ref: ${details.referenceId || "OKP-847291"} -->
  ${isTwi ? "" : `<Say>Thank you for using Okwankyerɛfo Pa. Goodbye.</Say>`}
</Response>`;
      default:
        return `<Response><Say>Call ended.</Say></Response>`;
    }
  }, []);

  const goToStep = useCallback(
    (step: CallStep, overrides?: Partial<CallSessionState>) => {
      setSession((prev) => {
        const nextLang = overrides?.language !== undefined ? overrides.language : prev.language;
        const nextRecipientPhone = overrides?.recipientPhone !== undefined ? overrides.recipientPhone : prev.recipientPhone;
        const nextRecipientName = overrides?.recipientName !== undefined ? overrides.recipientName : prev.recipientName;
        const nextAmount = overrides?.amount !== undefined ? overrides.amount : prev.amount;
        const nextRef = overrides?.referenceId !== undefined ? overrides.referenceId : prev.referenceId;

        // Step audio URL mapping
        const stepDef = CALL_STEPS.find((s) => s.id === step);
        let audioUrl: string | null = null;
        if (stepDef) {
          audioUrl = nextLang === "twi" ? stepDef.audioTwi : stepDef.audioEn;
        }

        // Language isolation audit
        let isolationViolation = false;
        if (prev.language && nextLang && prev.language !== nextLang && step !== "welcome") {
          isolationViolation = true;
          console.warn("[SECURITY VIOLATION] Language changed after choice step!");
        }

        const isPinStep = step === "zero_pin";
        const xml = generateVoiceXml(step, nextLang, {
          recipientName: nextRecipientName,
          recipientPhone: nextRecipientPhone,
          amount: nextAmount,
          referenceId: nextRef,
        });

        return {
          ...prev,
          step,
          language: nextLang,
          recipientPhone: nextRecipientPhone,
          recipientName: nextRecipientName,
          amount: nextAmount,
          referenceId: nextRef,
          isMicMuted: isPinStep, // MUTED during Zero-PIN handoff
          isPinModalOpen: isPinStep,
          digitsBuffer: "",
          currentAudioUrl: audioUrl,
          voiceXml: xml,
          languageIsolationViolation: isolationViolation,
          stepRemainingSec: stepDef?.timeoutSec || null,
          ...(overrides || {}),
        };
      });
      addLog(`Transitioned to step: ${step}`);
    },
    [addLog, generateVoiceXml]
  );

  const startCall = useCallback(
    (preferredLang?: "en" | "twi") => {
      clearInterval(timerRef.current);
      clearInterval(stepTimerRef.current);

      setSession((s) => ({
        ...s,
        isActive: true,
        callDurationSec: 0,
        language: preferredLang || null,
        digitsBuffer: "",
        isMicMuted: false,
        isPinModalOpen: false,
        languageIsolationViolation: false,
      }));

      // Call duration timer
      timerRef.current = setInterval(() => {
        setSession((s) => ({ ...s, callDurationSec: s.callDurationSec + 1 }));
      }, 1000);

      if (preferredLang) {
        goToStep("service", { language: preferredLang });
      } else {
        goToStep("welcome", { language: null });
      }
      addLog(`Call initiated to +233 30 804 8098`);
    },
    [addLog, goToStep]
  );

  const endCall = useCallback(
    (outcome: "COMPLETED" | "CANCELLED" | "TIMEOUT" = "CANCELLED") => {
      clearInterval(timerRef.current);
      clearInterval(stepTimerRef.current);
      setSession((s) => ({
        ...s,
        isActive: false,
        step: outcome === "COMPLETED" ? "receipt" : outcome === "TIMEOUT" ? "timeout" : "cancelled",
        isMicMuted: false,
        isPinModalOpen: false,
        stepRemainingSec: null,
        currentAudioUrl: null,
      }));
      addLog(`Call ended with outcome: ${outcome}`);
    },
    [addLog]
  );

  // Keypad DTMF input handler
  const handleKeypadDigit = useCallback(
    (digit: string) => {
      setSession((prev) => {
        if (!prev.isActive) return prev;

        // Auto-detect 10-digit phone number for sending money across steps
        const cleanDigitsOnly = digit.replace(/\D/g, "");
        if (cleanDigitsOnly.length === 10 && prev.step !== "amount" && prev.step !== "confirm" && prev.step !== "zero_pin") {
          const phone = cleanDigitsOnly;
          const name = phone.endsWith("8464")
            ? "Kwame Nyamebere"
            : phone === "0241234567"
            ? "Kwame Nyameba"
            : phone === "0543546010"
            ? "Hannes Aboagye"
            : `Subscriber ending in ${phone.slice(-4)}`;
          setTimeout(() => goToStep("amount", { recipientPhone: phone, recipientName: name }), 100);
          return { ...prev, digitsBuffer: "", recipientPhone: phone, recipientName: name };
        }

        // Universal grammar 0 = Cancel cleanly
        if (digit === "0" && prev.step !== "amount" && prev.step !== "recipient") {
          setTimeout(() => endCall("CANCELLED"), 50);
          return { ...prev, digitsBuffer: "" };
        }

        // Universal grammar 8 = Back
        if (digit === "8" && prev.step !== "amount" && prev.step !== "recipient") {
          const currentIndex = CALL_STEPS.findIndex((s) => s.id === prev.step);
          if (currentIndex > 0) {
            const prevStep = CALL_STEPS[currentIndex - 1].id;
            setTimeout(() => goToStep(prevStep), 50);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // UNIVERSAL AUTO-IDENTIFICATION: The moment user punches or says numbers up to 10 at a time,
        // automatically identify it as recipient phone for sending money and allow user to next stage (amount sending)!
        const nextAccumulated = (prev.digitsBuffer + digit).replace(/[^0-9]/g, "");
        if (prev.step !== "amount" && prev.step !== "confirm" && prev.step !== "kyc" && (digit.length === 10 || nextAccumulated.length === 10)) {
          const phone = digit.length === 10 ? digit : nextAccumulated;
          const name = phone.endsWith("8464")
            ? "Kwame Nyamebere"
            : phone === "0241234567"
            ? "Kwame Nyameba"
            : phone === "0543546010"
            ? "Hannes Aboagye"
            : `Subscriber ending in ${phone.slice(-4)}`;
          addLog(`[AUTO-IDENTIFIED] 10-digit number for sending money: ${phone} (${name}). Advancing to amount stage!`);
          setTimeout(() => goToStep("amount", { recipientPhone: phone, recipientName: name }), 100);
          return { ...prev, digitsBuffer: "", recipientPhone: phone, recipientName: name };
        }

        // If accumulating a phone number starting with '0', keep buffering without triggering single-digit menus
        if ((prev.digitsBuffer.startsWith("0") || (digit === "0" && !prev.digitsBuffer)) && prev.step !== "amount" && prev.step !== "confirm" && prev.step !== "kyc") {
          return { ...prev, digitsBuffer: prev.digitsBuffer + digit };
        }

        // Universal grammar 9 = Repeat prompt
        if (digit === "9" && prev.step !== "amount" && prev.step !== "recipient") {
          addLog(`Key 9: Replaying audio prompt for step ${prev.step}`);
          return { ...prev };
        }

        // Welcome step: 1 = English, 2 = Twi
        if (prev.step === "welcome") {
          if (digit === "1") {
            setTimeout(() => goToStep("service", { language: "en" }), 100);
          } else if (digit === "2") {
            setTimeout(() => goToStep("service", { language: "twi" }), 100);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // Service step: 1 = MoMo, 2 = Banking
        if (prev.step === "service") {
          if (digit === "1") {
            setTimeout(() => goToStep("provider", { service: "momo" }), 100);
          } else if (digit === "2") {
            setTimeout(() => goToStep("provider", { service: "banking" }), 100);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // Provider step: 1 = MTN, 2 = Telecel, 3 = AT
        if (prev.step === "provider") {
          let p: "MTN" | "Telecel" | "AT" = "MTN";
          if (digit === "1") p = "MTN";
          else if (digit === "2") p = "Telecel";
          else if (digit === "3") p = "AT";
          setTimeout(() => goToStep("action", { provider: p }), 100);
          return { ...prev, digitsBuffer: "" };
        }

        // Action menu: 1 = Send, 2 = Bills, 3 = Airtime
        if (prev.step === "action") {
          if (digit === "1") {
            setTimeout(() => goToStep("recipient"), 100);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // Recipient step: Accumulate 10 digits and auto-advance immediately to amount stage!
        if (prev.step === "recipient") {
          const nextDigits = (prev.digitsBuffer + digit).slice(0, 10);
          if (nextDigits.length === 10 || digit === "#") {
            const phone = nextDigits.length === 10 ? nextDigits : prev.digitsBuffer;
            if (phone.length < 10) {
              return {
                ...prev,
                eventLogs: [
                  ...prev.eventLogs,
                  `[INPUT ERROR] Incomplete phone number (${phone.length} digits entered). 10 digits required.`,
                ],
              };
            }
            const name = phone.endsWith("8464")
              ? "Kwame Nyamebere"
              : phone === "0241234567"
              ? "Kwame Nyameba"
              : phone === "0543546010"
              ? "Hannes Aboagye"
              : `Subscriber ending in ${phone.slice(-4)}`;
            // Auto advance directly to amount stage without stacking!
            setTimeout(() => goToStep("amount", { recipientPhone: phone, recipientName: name }), 100);
            return { ...prev, digitsBuffer: "", recipientPhone: phone, recipientName: name };
          }
          return { ...prev, digitsBuffer: nextDigits };
        }

        // KYC step: 1 = Confirm, 2 = Edit/Cancel
        if (prev.step === "kyc") {
          if (digit === "1") {
            setTimeout(() => goToStep("amount"), 100);
          } else if (digit === "2") {
            setTimeout(() => goToStep("recipient"), 100);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // Amount step: Accumulate digits + * + #
        if (prev.step === "amount") {
          if (digit === "#") {
            const amt = prev.digitsBuffer ? prev.digitsBuffer.replace("*", ".") : "500";
            setTimeout(() => goToStep("confirm", { amount: amt }), 100);
            return { ...prev, digitsBuffer: "" };
          }
          return { ...prev, digitsBuffer: prev.digitsBuffer + digit };
        }

        // Confirm step: 1 = Confirm, 2 = Edit
        if (prev.step === "confirm") {
          if (digit === "1") {
            setTimeout(() => goToStep("zero_pin"), 100);
          } else if (digit === "2") {
            setTimeout(() => goToStep("amount"), 100);
          }
          return { ...prev, digitsBuffer: "" };
        }

        // Receipt step: 0 = Exit
        if (prev.step === "receipt" && digit === "0") {
          setTimeout(() => endCall("COMPLETED"), 50);
          return { ...prev, digitsBuffer: "" };
        }

        return prev;
      });
    },
    [addLog, endCall, goToStep]
  );

  // USSD modal approval handler for Zero-PIN handoff
  const handleUssdPinSubmit = useCallback(
    (approved: boolean) => {
      if (approved) {
        addLog("✅ Handset USSD PIN verified on private telco prompt (zero PIN captured by voice).");
        goToStep("receipt", {
          referenceId: `OKP-${Date.now().toString().slice(-6)}`,
        });
      } else {
        addLog("❌ Handset USSD PIN entry declined by user.");
        endCall("CANCELLED");
      }
    },
    [addLog, endCall, goToStep]
  );

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(stepTimerRef.current);
    };
  }, []);

  return {
    ...session,
    startCall,
    endCall,
    goToStep,
    handleKeypadDigit,
    handleUssdPinSubmit,
  };
}
