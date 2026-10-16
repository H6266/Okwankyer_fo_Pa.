import { useCallback, useEffect, useRef, useState } from "react";
import { resolvePrompt, resolvePromptText } from "../modules/ttsService";
import { validateGhanaPhoneNumber, parseAndValidateAmount } from "../domain/validation";
import { formatFullPhoneNumberForSpeech } from "../audio/dynamicPromptBuilder";

const promptUrl = (key: string, language: "en" | "twi") => resolvePrompt(key, language) || "";

export type CallStep =
  | "idle"
  | "welcome"
  | "language_select"
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
  promptId: string;
  timeoutSec?: number;
}

export const CALL_STEPS: StepDefinition[] = [
  {
    stepIndex: 1,
    id: "welcome",
    nameEn: "1. Welcome Greeting",
    nameTwi: "1. Akwaaba Nkaebɔ",
    expectedInput: "Listening to Welcome (OP01)",
    audioEn: promptUrl("welcome", "en"),
    audioTwi: promptUrl("welcome", "twi"),
    promptId: "OP01",
  },
  {
    stepIndex: 2,
    id: "language_select",
    nameEn: "2. Language Selection",
    nameTwi: "2. Kasa Paw",
    expectedInput: "1 (English) or 2 (Twi)",
    audioEn: promptUrl("language_selection", "en"),
    audioTwi: promptUrl("language_selection", "twi"),
    promptId: "OP02",
  },
  {
    stepIndex: 3,
    id: "service",
    nameEn: "3. Service Selection",
    nameTwi: "3. Dwumadie Paw",
    expectedInput: "1 (Mobile Money) or 2 (Banking)",
    audioEn: promptUrl("service_select", "en"),
    audioTwi: promptUrl("service_select", "twi"),
    promptId: "OP07",
  },
  {
    stepIndex: 4,
    id: "provider",
    nameEn: "4. Network Provider",
    nameTwi: "4. Network Paw",
    expectedInput: "1 (MTN), 2 (Telecel), 3 (AT)",
    audioEn: promptUrl("provider_select", "en"),
    audioTwi: promptUrl("provider_select", "twi"),
    promptId: "OP08",
  },
  {
    stepIndex: 5,
    id: "action",
    nameEn: "5. MoMo Action Menu",
    nameTwi: "5. MoMo Menyu",
    expectedInput: "1 (Send Money), 2 (Account/Balance)",
    audioEn: promptUrl("action_select", "en"),
    audioTwi: promptUrl("action_select", "twi"),
    promptId: "OP09",
  },
  {
    stepIndex: 6,
    id: "recipient",
    nameEn: "6. Recipient Phone Entry",
    nameTwi: "6. Nɔma a Woremane",
    expectedInput: "10 Digits followed by # (OP16)",
    audioEn: promptUrl("enter_recipient", "en"),
    audioTwi: promptUrl("enter_recipient", "twi"),
    promptId: "OP16",
    timeoutSec: 40,
  },
  {
    stepIndex: 7,
    id: "kyc",
    nameEn: "7. Recipient Verification & Readback",
    nameTwi: "7. KYC Din & Nɔmba a Ɛdi Mũ",
    expectedInput: "1 (Confirm) or 2 (Change) (OP22)",
    audioEn: promptUrl("recipient_verify", "en"),
    audioTwi: promptUrl("recipient_verify", "twi"),
    promptId: "OP19",
  },
  {
    stepIndex: 8,
    id: "amount",
    nameEn: "8. Transfer Amount Entry",
    nameTwi: "8. Sika Dodow (Cedi)",
    expectedInput: "Amount + # (* for pesewas) (OP26)",
    audioEn: promptUrl("enter_amount", "en"),
    audioTwi: promptUrl("enter_amount", "twi"),
    promptId: "OP26",
    timeoutSec: 30,
  },
  {
    stepIndex: 9,
    id: "confirm",
    nameEn: "9. Transaction Review & Decision",
    nameTwi: "9. Bammbɔ Nhwɛsoɔ",
    expectedInput: "1 (Confirm) or 2 (Cancel) (OP36)",
    audioEn: promptUrl("confirm_continue", "en"),
    audioTwi: promptUrl("confirm_continue", "twi"),
    promptId: "OP36",
  },
  {
    stepIndex: 10,
    id: "zero_pin",
    nameEn: "10. Zero-PIN Handset Handoff",
    nameTwi: "10. Zero-PIN Bammbɔ Apono",
    expectedInput: "Approve on phone screen (Voice muted) (OP40)",
    audioEn: promptUrl("pin_handoff", "en"),
    audioTwi: promptUrl("pin_handoff", "twi"),
    promptId: "OP40",
  },
  {
    stepIndex: 11,
    id: "receipt",
    nameEn: "11. Spoken Audio Receipt",
    nameTwi: "11. Nne Nkaedum & Ref ID",
    expectedInput: "0 (Exit) (OP52)",
    audioEn: promptUrl("success", "en"),
    audioTwi: promptUrl("success", "twi"),
    promptId: "OP52",
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
  isRecipientVerified: boolean;
  amount: string;
  referenceId: string;
  callDurationSec: number;
  stepRemainingSec: number | null;
  isMicMuted: boolean;
  isPinModalOpen: boolean;
  digitsBuffer: string;
  validationError: string | null;
  isLookingUp: boolean;
  activePromptId: string;
  activePromptTitle: string;
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
    isRecipientVerified: false,
    amount: "",
    referenceId: "",
    callDurationSec: 0,
    stepRemainingSec: null,
    isMicMuted: false,
    isPinModalOpen: false,
    digitsBuffer: "",
    validationError: null,
    isLookingUp: false,
    activePromptId: "OP01",
    activePromptTitle: "Welcome",
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
      language_select: "language_selection",
      service: "service_select",
      provider: "provider_select",
      action: "action_select",
      recipient: "enter_recipient",
      kyc: "recipient_verify",
      amount: "enter_amount",
      confirm: "confirm_continue",
      zero_pin: "pin_handoff",
      receipt: "success",
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
  <!-- OP01: Welcome Greeting (Separate Audio) -->
  ${playback || promptSay}
  <Redirect>/language-selection</Redirect>
</Response>`;
      case "language_select":
        return `<Response>
  <!-- OP02: Language Selection (Separate Audio) -->
  <GetDigits timeout="10" finishOnKey="#" callbackUrl="/voice-menu">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: English, 2: Akan Twi -->
</Response>`;
      case "service":
        return `<Response>
  <!-- OP07: Service Selection -->
  <GetDigits timeout="15" finishOnKey="#" callbackUrl="/service-choice">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: Mobile Money, 2: Banking, 0: Exit -->
</Response>`;
      case "provider":
        return `<Response>
  <!-- OP08: Network Selection -->
  <GetDigits timeout="15" finishOnKey="#" callbackUrl="/provider-choice">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: MTN, 2: Telecel, 3: AT -->
</Response>`;
      case "action":
        return `<Response>
  <!-- OP09: Action Menu -->
  <GetDigits timeout="20" finishOnKey="#" callbackUrl="/action-choice">
    ${playback || promptSay}
  </GetDigits>
  <!-- 1: Send Money, 2: Account/Bills, 8: Back, 0: Exit -->
</Response>`;
      case "recipient":
        return `<Response>
  <!-- OP16: Enter Recipient Number followed by Hash (#) -->
  <GetDigits timeout="40" finishOnKey="#" callbackUrl="/verify-recipient">
    ${playback || promptSay}
  </GetDigits>
  <!-- Collects full unmasked number until caller presses # -->
</Response>`;
      case "kyc": {
        const fullSpoken = details.recipientPhone ? formatFullPhoneNumberForSpeech(details.recipientPhone, isTwi ? "twi" : "en") : "";
        const name = details.recipientName || "Kwame Nyamebere";
        const readback = isTwi
          ? `Yɛahu obi a woremane no sika no. Tie ne din ne ne nɔmba a ɛdi mũ no yiye. Obi a woremane no no din ne ${name}. Ne phone nɔmba a ɛdi mũ ne ${fullSpoken}. Sɛ wopene so a, mia 1. Sɛ wopɛ sɛ wosesa nɔmba no a, mia 2. Sɛ wopɛ sɛ wogyae a, mia 0.`
          : `We found the recipient. Please listen carefully to the name and the full phone number. The recipient's name is ${name}. The full recipient phone number is ${fullSpoken}. To confirm this recipient, press 1. To change the recipient, press 2. To exit, press 0.`;
        return `<Response>
  <!-- OP19 + OP20 (Name) + OP21 (Full 10-Digit Number) + OP22 (Confirm Menu) -->
  <GetDigits timeout="15" finishOnKey="#" callbackUrl="/recipient-verify-choice">
    <Say voice="female">${escapeXml(readback)}</Say>
  </GetDigits>
</Response>`;
      }
      case "amount":
        return `<Response>
  <!-- OP26: Enter Amount followed by Hash (#), star for pesewas -->
  <GetDigits timeout="30" finishOnKey="#" callbackUrl="/verify-amount">
    ${playback || promptSay}
  </GetDigits>
</Response>`;
      case "confirm": {
        const fullSpoken = details.recipientPhone ? formatFullPhoneNumberForSpeech(details.recipientPhone, isTwi ? "twi" : "en") : "";
        const amountStr = details.amount || "50";
        const name = details.recipientName || "Kwame Nyamebere";
        const reviewText = isTwi
          ? `Worepɛ sɛ womane GHS ${amountStr} kɔma ${name} a ne phone nɔmba a ɛdi mũ ne ${fullSpoken}. Sɛ wopene so na wopɛ sɛ wokɔ so a, mia 1. Sɛ wopɛ sɛ wotwa mu a, mia 2. Sɛ wopɛ sɛ wogyae a, mia 0.`
          : `You are about to send ${amountStr} Ghana cedis to ${name}, whose full phone number is ${fullSpoken}. To confirm and continue, press 1. To cancel, press 2. To exit, press 0.`;
        return `<Response>
  <!-- OP34 + OP35 + OP36: Transaction Review & Explicit Confirmation -->
  <GetDigits timeout="25" finishOnKey="#" callbackUrl="/safe-outcome">
    <Say voice="female">${escapeXml(reviewText)}</Say>
  </GetDigits>
</Response>`;
      }
      case "zero_pin":
        return `<Response>
  <!-- OP40 + OP47 + OP48: ZERO-PIN HANDSET USSD PROMPT (Audio Muted, No Voice PIN) -->
  <Say voice="female">${isTwi ? "Wo transaction no ayɛ krado ma authorization. Yɛsrɛ wo, hwɛ wo fon screen so na fa wo Mobile Money PIN hyɛ hɔ. Mpa wo nne mu nka wo PIN da. Yɛdaase." : "Your transaction is ready for authorization. Please check your phone screen and enter your Mobile Money PIN there. Never say your PIN aloud. Thank you."}</Say>
</Response>`;
      case "receipt":
        return `<Response>
  <!-- OP52: Spoken Success Receipt with actual Confirmed Reference -->
  <Say voice="female">${isTwi ? `Mo! Woatumi amane sika no. Wo reference nɔmba ne ${details.referenceId || "OKP-847291"}. Yɛdaase.` : `Congratulations! Your payment has succeeded. Your reference number is ${details.referenceId || "OKP-847291"}. Thank you for using Okwankyerɛfo Pa. Goodbye.`}</Say>
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
        const nextVerified = overrides?.isRecipientVerified !== undefined ? overrides.isRecipientVerified : prev.isRecipientVerified;

        const stepDef = CALL_STEPS.find((s) => s.id === step);
        let audioUrl: string | null = null;
        if (stepDef) {
          audioUrl = nextLang === "twi" ? stepDef.audioTwi : stepDef.audioEn;
        }

        // Language isolation audit
        let isolationViolation = false;
        if (prev.language && nextLang && prev.language !== nextLang && step !== "welcome" && step !== "language_select") {
          isolationViolation = true;
          console.warn("[SECURITY VIOLATION] Language changed after language selection step!");
        }

        const isPinStep = step === "zero_pin";
        const xml = generateVoiceXml(step, nextLang, {
          recipientName: nextRecipientName,
          recipientPhone: nextRecipientPhone,
          isRecipientVerified: nextVerified,
          amount: nextAmount,
          referenceId: nextRef,
        });

        return {
          ...prev,
          step,
          language: nextLang,
          recipientPhone: nextRecipientPhone,
          recipientName: nextRecipientName,
          isRecipientVerified: nextVerified,
          amount: nextAmount,
          referenceId: nextRef,
          isMicMuted: isPinStep, // Strictly muted during Zero-PIN handoff
          isPinModalOpen: isPinStep,
          digitsBuffer: overrides?.digitsBuffer !== undefined ? overrides.digitsBuffer : "",
          validationError: overrides?.validationError !== undefined ? overrides.validationError : null,
          isLookingUp: false,
          activePromptId: stepDef?.promptId || prev.activePromptId,
          activePromptTitle: stepDef?.nameEn || prev.activePromptTitle,
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
        validationError: null,
        isLookingUp: false,
        isMicMuted: false,
        isPinModalOpen: false,
        languageIsolationViolation: false,
        activePromptId: "OP01",
        activePromptTitle: "1. Welcome Greeting",
      }));

      // Call duration timer
      timerRef.current = setInterval(() => {
        setSession((s) => ({ ...s, callDurationSec: s.callDurationSec + 1 }));
      }, 1000);

      if (preferredLang) {
        goToStep("service", { language: preferredLang, activePromptId: "OP07" });
      } else {
        // Rule 1: Play OP01 (Welcome) first, then OP02 (Language Selection) separately
        goToStep("welcome", { language: null, activePromptId: "OP01" });
        // Automatically transition to OP02 language options once welcome intro is queued
        setTimeout(() => {
          setSession((curr) => {
            if (curr.isActive && curr.step === "welcome") {
              return {
                ...curr,
                step: "language_select",
                activePromptId: "OP02",
                activePromptTitle: "2. Language Selection",
                currentAudioUrl: promptUrl("language_selection", "twi"),
              };
            }
            return curr;
          });
        }, 1200);
      }
      addLog(`Call initiated to +233 30 804 8098 (OP01 Welcome queued)`);
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
      addLog(`Call ended with outcome: ${outcome} (${outcome === "COMPLETED" ? "OP52/OP94" : "OP77 Exit"})`);
    },
    [addLog]
  );

  // Keypad DTMF input handler — Strict Rule 3: Wait for # on multi-digit numbers!
  const handleKeypadDigit = useCallback(
    (digit: string) => {
      setSession((prev) => {
        if (!prev.isActive) return prev;

        // Universal grammar 0 = Exit cleanly when buffer is empty
        if (digit === "0" && !prev.digitsBuffer && prev.step !== "amount" && prev.step !== "recipient") {
          setTimeout(() => endCall("CANCELLED"), 50);
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Universal grammar 8 = Back when buffer is empty
        if (digit === "8" && !prev.digitsBuffer && prev.step !== "amount" && prev.step !== "recipient") {
          const currentIndex = CALL_STEPS.findIndex((s) => s.id === prev.step);
          if (currentIndex > 0) {
            const prevStep = CALL_STEPS[currentIndex - 1].id;
            setTimeout(() => goToStep(prevStep), 50);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Universal grammar 9 = Repeat prompt when buffer is empty
        if (digit === "9" && !prev.digitsBuffer && prev.step !== "amount" && prev.step !== "recipient") {
          addLog(`Key 9: Replaying audio prompt for step ${prev.step} (${prev.activePromptId})`);
          return { ...prev };
        }

        // Welcome / Language Selection (OP01 / OP02)
        if (prev.step === "welcome" || prev.step === "language_select") {
          if (digit === "1") {
            setTimeout(() => goToStep("service", { language: "en", activePromptId: "OP07" }), 80);
          } else if (digit === "2") {
            setTimeout(() => goToStep("service", { language: "twi", activePromptId: "OP07" }), 80);
          } else if (digit === "0") {
            setTimeout(() => endCall("CANCELLED"), 50);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Service step (OP07): 1 = MoMo, 2 = Banking
        if (prev.step === "service") {
          if (digit === "1") {
            setTimeout(() => goToStep("provider", { service: "momo", activePromptId: "OP08" }), 80);
          } else if (digit === "2") {
            setTimeout(() => goToStep("provider", { service: "banking", activePromptId: "OP08" }), 80);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Provider step (OP08): 1 = MTN, 2 = Telecel, 3 = AT
        if (prev.step === "provider") {
          let p: "MTN" | "Telecel" | "AT" = "MTN";
          if (digit === "1") p = "MTN";
          else if (digit === "2") p = "Telecel";
          else if (digit === "3") p = "AT";
          setTimeout(() => goToStep("action", { provider: p, activePromptId: "OP09" }), 80);
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Action menu (OP09): 1 = Send Money, 2 = Bills/Account
        if (prev.step === "action") {
          if (digit === "1") {
            // Play OP10 (Send Money Selected) and advance to OP16 (Recipient Entry)
            addLog(`[OP10] Send Money Selected`);
            setTimeout(() => goToStep("recipient", { activePromptId: "OP16" }), 80);
          } else if (digit === "8") {
            setTimeout(() => goToStep("provider", { activePromptId: "OP08" }), 80);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // ── Rule 3 & Section 5: Recipient Number Input (OP16) ───────────────
        // Append digits immediately, update display live. DO NOT auto-advance at 10 digits.
        // Wait strictly for #!
        if (prev.step === "recipient") {
          if (digit === "#") {
            const rawPhone = prev.digitsBuffer.trim();
            const validation = validateGhanaPhoneNumber(rawPhone);

            // Incomplete or invalid number -> Play OP17, clear buffer, stay on OP16
            if (!validation.valid || !validation.normalized || rawPhone.length !== 10) {
              addLog(`[OP17] Invalid recipient: ${rawPhone.length} digits entered. Exactly 10 digits required.`);
              return {
                ...prev,
                digitsBuffer: "",
                validationError: `Invalid phone number (${rawPhone.length} digits). Exactly 10 digits required (OP17).`,
                eventLogs: [
                  ...prev.eventLogs,
                  `[OP17 - INVALID_RECIPIENT] Entry rejected (${rawPhone.length} digits). Please enter 10 digits + #.`,
                ],
              };
            }

            // Valid 10-digit number -> Perform single recipient KYC lookup
            const phone = validation.normalized;
            const name = phone.endsWith("8464")
              ? "Kwame Nyamebere"
              : phone === "0241234567"
              ? "Kwame Nyameba"
              : phone === "0543546010"
              ? "Hannes Aboagye"
              : `Subscriber ending in ${phone.slice(-4)}`;

            addLog(`[OP18] Recipient found: ${name} (${phone})`);
            // Transition to KYC verification (OP19 -> dynamic OP20 -> dynamic OP21 -> OP22)
            setTimeout(() => {
              goToStep("kyc", {
                recipientPhone: phone,
                recipientName: name,
                isRecipientVerified: true,
                activePromptId: "OP19",
                validationError: null,
                digitsBuffer: "",
              });
            }, 80);

            return {
              ...prev,
              recipientPhone: phone,
              recipientName: name,
              isRecipientVerified: true,
              isLookingUp: true,
              validationError: null,
            };
          }

          // Digit 0 when empty -> Cancel / Exit
          if (digit === "0" && !prev.digitsBuffer) {
            setTimeout(() => endCall("CANCELLED"), 50);
            return { ...prev, digitsBuffer: "" };
          }

          // Append digit 0-9 to buffer without auto-advancing
          if (/\d/.test(digit)) {
            const nextBuf = prev.digitsBuffer + digit;
            return { ...prev, digitsBuffer: nextBuf, validationError: null };
          }

          return prev;
        }

        // ── Rule 4 & Section 6: Recipient Confirmation (OP19 / OP20 / OP21 / OP22) ─
        // Reads all 10 digits individually in order. 1 = Confirm (OP24), 2 = Change (OP25), 0 = Exit
        if (prev.step === "kyc") {
          if (digit === "1") {
            addLog(`[OP24] Recipient confirmed. Advancing to amount entry (OP26).`);
            setTimeout(() => goToStep("amount", { activePromptId: "OP26" }), 80);
          } else if (digit === "2") {
            addLog(`[OP25] Change recipient requested. Returning to recipient entry (OP16).`);
            setTimeout(() => goToStep("recipient", { recipientPhone: "", recipientName: "", activePromptId: "OP16" }), 80);
          } else if (digit === "0") {
            setTimeout(() => endCall("CANCELLED"), 50);
          } else if (digit === "9") {
            addLog(`Key 9: Replaying recipient verification readback (OP19-OP22).`);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // ── Rule 3 & Section 7: Amount Entry (OP26) ─────────────────────────
        // Digits 0-9 and * for pesewas. Wait strictly for #!
        if (prev.step === "amount") {
          if (digit === "#") {
            const rawAmt = prev.digitsBuffer.trim();
            const parsed = parseAndValidateAmount(rawAmt || "0");

            if (!parsed.valid || parsed.amount === undefined) {
              addLog(`[OP27] Invalid amount format entered.`);
              return {
                ...prev,
                digitsBuffer: "",
                validationError: "Invalid amount format. Please enter numbers, * for pesewas, followed by # (OP27).",
              };
            }

            if (parsed.amount > 1000) {
              addLog(`[OP31] Amount GHS ${parsed.amount} exceeds limit (1000 GHS max).`);
              return {
                ...prev,
                digitsBuffer: "",
                validationError: `Amount too high (Max GHS 1,000.00). Please re-enter (OP31).`,
              };
            }

            if (parsed.amount < 1) {
              addLog(`[OP32] Amount GHS ${parsed.amount} is below minimum (1 GHS min).`);
              return {
                ...prev,
                digitsBuffer: "",
                validationError: `Amount too low (Min GHS 1.00). Please re-enter (OP32).`,
              };
            }

            const cleanAmt = String(parsed.amount);
            addLog(`[OP29] Spoken Amount Readback: GHS ${cleanAmt}`);
            setTimeout(() => goToStep("confirm", { amount: cleanAmt, activePromptId: "OP36" }), 80);
            return { ...prev, amount: cleanAmt, digitsBuffer: "", validationError: null };
          }

          if (digit === "0" && !prev.digitsBuffer) {
            setTimeout(() => endCall("CANCELLED"), 50);
            return { ...prev, digitsBuffer: "" };
          }

          if (digit === "8" && !prev.digitsBuffer) {
            setTimeout(() => goToStep("kyc", { activePromptId: "OP19" }), 80);
            return { ...prev, digitsBuffer: "" };
          }

          // Buffer digit 0-9 and * without advancing
          if (/[\d\*]/.test(digit)) {
            return { ...prev, digitsBuffer: prev.digitsBuffer + digit, validationError: null };
          }

          return prev;
        }

        // ── Section 9: Transaction Review & Confirm (OP34 / OP35 / OP36) ─────
        // 1 = Confirm -> Zero-PIN (OP40), 2 = Cancel/Edit -> OP76 / amount, 0 = Exit
        if (prev.step === "confirm") {
          if (digit === "1") {
            addLog(`[OP40] Confirmed transaction. Initiating Zero-PIN Handset Handoff.`);
            setTimeout(() => goToStep("zero_pin", { activePromptId: "OP40" }), 80);
          } else if (digit === "2") {
            addLog(`[OP76] Transaction cancelled during review.`);
            setTimeout(() => goToStep("amount", { activePromptId: "OP26" }), 80);
          } else if (digit === "0") {
            setTimeout(() => endCall("CANCELLED"), 50);
          }
          return { ...prev, digitsBuffer: "", validationError: null };
        }

        // Receipt step (OP52): 0 = Exit
        if (prev.step === "receipt" && digit === "0") {
          setTimeout(() => endCall("COMPLETED"), 50);
          return { ...prev, digitsBuffer: "" };
        }

        return prev;
      });
    },
    [addLog, endCall, goToStep]
  );

  // Spoken speech input handler (ASR mode: no # required!)
  const handleSpeechInput = useCallback(
    (spokenText: string) => {
      setSession((prev) => {
        if (!prev.isActive) return prev;
        addLog(`[ASR Utterance Recognized]: "${spokenText}"`);

        // If on recipient step and spoken phone number is detected
        if (prev.step === "recipient") {
          const validation = validateGhanaPhoneNumber(spokenText);
          if (validation.valid && validation.normalized) {
            const phone = validation.normalized;
            const name = phone.endsWith("8464")
              ? "Kwame Nyamebere"
              : phone === "0241234567"
              ? "Kwame Nyameba"
              : phone === "0543546010"
              ? "Hannes Aboagye"
              : `Subscriber ending in ${phone.slice(-4)}`;

            addLog(`[ASR Recipient Recognized]: ${phone} (${name}). Advancing to verification.`);
            setTimeout(() => {
              goToStep("kyc", {
                recipientPhone: phone,
                recipientName: name,
                isRecipientVerified: true,
                activePromptId: "OP19",
                digitsBuffer: "",
                validationError: null,
              });
            }, 80);
            return { ...prev, recipientPhone: phone, recipientName: name, isRecipientVerified: true };
          }
        }

        // If on KYC recipient verification step (OP19 - OP24) and spoken confirmation is detected
        if (prev.step === "kyc") {
          const lower = spokenText.toLowerCase().trim();
          if (/\b(1|one|yes|confirm|aane|pene\s*so|proceed|okay|yoo|baako|kɔ\s*so)\b/.test(lower)) {
            addLog(`[OP24] Recipient confirmed via voice. Advancing to amount entry (OP26).`);
            setTimeout(() => goToStep("amount", { activePromptId: "OP26" }), 80);
            return { ...prev, digitsBuffer: "", validationError: null };
          }
          if (/\b(2|two|no|change|sesa|re-enter|different|dabi|mmienu)\b/.test(lower)) {
            addLog(`[OP25] Change recipient requested via voice. Returning to recipient entry (OP16).`);
            setTimeout(() => goToStep("recipient", { recipientPhone: "", recipientName: "", activePromptId: "OP16" }), 80);
            return { ...prev, digitsBuffer: "", validationError: null };
          }
        }

        // If on amount step and spoken amount is detected
        if (prev.step === "amount") {
          const parsed = parseAndValidateAmount(spokenText);
          if (parsed.valid && parsed.amount && parsed.amount >= 1 && parsed.amount <= 1000) {
            const cleanAmt = String(parsed.amount);
            addLog(`[ASR Amount Recognized]: GHS ${cleanAmt}. Advancing to review.`);
            setTimeout(() => goToStep("confirm", { amount: cleanAmt, activePromptId: "OP36" }), 80);
            return { ...prev, amount: cleanAmt, digitsBuffer: "", validationError: null };
          }
        }

        return prev;
      });
    },
    [addLog, goToStep]
  );

  // USSD modal approval handler for Zero-PIN handoff
  const handleUssdPinSubmit = useCallback(
    (approved: boolean) => {
      if (approved) {
        const ref = `OKP-${Date.now().toString().slice(-6)}`;
        addLog(`✅ [OP52] Handset USSD PIN verified on private telco prompt. Confirmed Ref: ${ref}`);
        goToStep("receipt", {
          referenceId: ref,
          activePromptId: "OP52",
        });
      } else {
        addLog("❌ [OP57] Handset USSD PIN entry declined by user.");
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
    handleSpeechInput,
    handleUssdPinSubmit,
  };
}
