import { useCallback, useEffect, useRef, useState } from "react";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
import { normalizeGhanaPhoneNumber } from "../domain/validation";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../domain/echoFilter";

export interface SpeechMatchResult {
  transcript: string;
  confidence: number;
  resolvedDigit?: string;
  resolvedIntent?: string;
  matchedRule?: string;
  resolverType: "local_pattern" | "nlu_model";
}

export function useSpeechRecognition(options: {
  language: "en" | "twi";
  isMuted: boolean;
  activePrompt?: string;
  isSpeaking?: boolean;
  currentStep?: string;
  isAccessiblePinMode?: boolean;
  onMatch?: (result: SpeechMatchResult) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastMatch, setLastMatch] = useState<SpeechMatchResult | null>(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const onMatchRef = useRef(options.onMatch);
  onMatchRef.current = options.onMatch;

  const isSpeakingRef = useRef(options.isSpeaking);
  isSpeakingRef.current = options.isSpeaking;

  const activePromptRef = useRef(options.activePrompt);
  activePromptRef.current = options.activePrompt;

  const isMutedRef = useRef(options.isMuted);
  isMutedRef.current = options.isMuted;

  const currentStepRef = useRef(options.currentStep);
  currentStepRef.current = options.currentStep;

  const isAccessiblePinModeRef = useRef(options.isAccessiblePinMode);
  isAccessiblePinModeRef.current = options.isAccessiblePinMode;

  // Resolve spoken input to keypad digit/intent
  const resolveSpokenText = useCallback((text: string, lang: "en" | "twi"): SpeechMatchResult => {
    const formatted = formatSpokenNumbersAsDigits(text);
    const raw = formatted.toLowerCase().trim();

    // 0. Spoken 4-digit PIN for accessible in-call authentication
    const digitsOnlyCandidate = formatted.replace(/\D/g, "");
    const isPinStep =
      currentStepRef.current?.includes("pin") ||
      currentStepRef.current?.includes("handoff") ||
      currentStepRef.current === "PIN_GATE";

    if (
      isAccessiblePinModeRef.current &&
      isPinStep &&
      digitsOnlyCandidate.length >= 4 &&
      digitsOnlyCandidate.length <= 6
    ) {
      return {
        transcript: "****", // Strictly masked in transcript display
        confidence: 0.99,
        resolvedDigit: digitsOnlyCandidate, // Sent securely to authorization handler
        resolvedIntent: "PIN_ENTERED",
        matchedRule: "Accessible spoken PIN recognized and masked as ****",
        resolverType: "local_pattern",
      };
    }

    // 1. Direct digits
    if (/^[0-9]$/.test(raw)) {
      return {
        transcript: formatted,
        confidence: 0.98,
        resolvedDigit: raw,
        resolvedIntent: `Digit ${raw}`,
        matchedRule: "Exact single digit match",
        resolverType: "local_pattern",
      };
    }

    // 1b. Auto-detect 10-digit phone number for sending money
    const digitsOnly = formatted.replace(/\D/g, "");
    const normalizedWords = normalizeGhanaPhoneNumber(text);
    if (digitsOnly.length === 10 || (digitsOnly.length === 12 && digitsOnly.startsWith("233")) || (normalizedWords.length === 10 && normalizedWords.startsWith("0"))) {
      const phone =
        normalizedWords.length === 10 && normalizedWords.startsWith("0")
          ? normalizedWords
          : digitsOnly.length === 12
          ? "0" + digitsOnly.slice(3)
          : digitsOnly;
      return {
        transcript: formatted,
        confidence: 0.99,
        resolvedDigit: phone,
        resolvedIntent: `RECIPIENT_PHONE_${phone}`,
        matchedRule: "Auto-detected 10-digit recipient phone number for sending money",
        resolverType: "local_pattern",
      };
    }

    // 2. English keywords
    if (lang === "en") {
      if (raw.includes("english") || raw.includes("one") || raw.includes("momo") || raw.includes("send") || raw.includes("confirm")) {
        return {
          transcript: text,
          confidence: 0.92,
          resolvedDigit: "1",
          resolvedIntent: "SELECT_OPTION_1",
          matchedRule: "English keyword pattern",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("twi") || raw.includes("two") || raw.includes("banking") || raw.includes("telecel") || raw.includes("cancel")) {
        return {
          transcript: text,
          confidence: 0.91,
          resolvedDigit: "2",
          resolvedIntent: "SELECT_OPTION_2",
          matchedRule: "English keyword pattern",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("three") || raw.includes("airtime") || raw.includes("airteltigo")) {
        return {
          transcript: text,
          confidence: 0.88,
          resolvedDigit: "3",
          resolvedIntent: "SELECT_OPTION_3",
          matchedRule: "English keyword pattern",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("back") || raw.includes("previous") || raw.includes("eight")) {
        return {
          transcript: text,
          confidence: 0.94,
          resolvedDigit: "8",
          resolvedIntent: "NAVIGATE_BACK",
          matchedRule: "Universal grammar 8",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("repeat") || raw.includes("again") || raw.includes("nine")) {
        return {
          transcript: text,
          confidence: 0.94,
          resolvedDigit: "9",
          resolvedIntent: "REPEAT_PROMPT",
          matchedRule: "Universal grammar 9",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("exit") || raw.includes("stop") || raw.includes("cancel") || raw.includes("zero")) {
        return {
          transcript: text,
          confidence: 0.95,
          resolvedDigit: "0",
          resolvedIntent: "ABORT_CALL",
          matchedRule: "Universal grammar 0",
          resolverType: "local_pattern",
        };
      }
    }

    // 3. Akan Twi keywords
    if (lang === "twi") {
      if (
        raw.includes("baako") ||
        raw.includes("pene") ||
        raw.includes("kɔ") ||
        raw.includes("sendi") ||
        raw.includes("mtn") ||
        raw.includes("borɔfo") ||
        raw.includes("first")
      ) {
        return {
          transcript: text,
          confidence: 0.93,
          resolvedDigit: "1",
          resolvedIntent: "PENE_SO_BAAKO (Option 1)",
          matchedRule: "Akan Twi affirmative keyword",
          resolverType: "local_pattern",
        };
      }
      if (
        raw.includes("mmienu") ||
        raw.includes("twi") ||
        raw.includes("telecel") ||
        raw.includes("sikakorabea") ||
        raw.includes("ampa")
      ) {
        return {
          transcript: text,
          confidence: 0.92,
          resolvedDigit: "2",
          resolvedIntent: "MMIENU (Option 2)",
          matchedRule: "Akan Twi second option keyword",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("mmiɛnsa") || raw.includes("airteltigo") || raw.includes("bundle")) {
        return {
          transcript: text,
          confidence: 0.89,
          resolvedDigit: "3",
          resolvedIntent: "MMIƐNSA (Option 3)",
          matchedRule: "Akan Twi third option keyword",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("san") || raw.includes("akyi") || raw.includes("nwɔtwe")) {
        return {
          transcript: text,
          confidence: 0.94,
          resolvedDigit: "8",
          resolvedIntent: "SAN_AKYI_8 (Back)",
          matchedRule: "Akan Twi back grammar",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("tie bio") || raw.includes("ka bio") || raw.includes("kronkron") || raw.includes("nkron")) {
        return {
          transcript: text,
          confidence: 0.93,
          resolvedDigit: "9",
          resolvedIntent: "TIE_BIO_9 (Repeat)",
          matchedRule: "Akan Twi repeat grammar",
          resolverType: "local_pattern",
        };
      }
      if (raw.includes("twa mu") || raw.includes("agyae") || raw.includes("zero") || raw.includes("hwee") || raw.includes("firi mu")) {
        return {
          transcript: text,
          confidence: 0.96,
          resolvedDigit: "0",
          resolvedIntent: "TWA_MU_0 (Cancel/Exit)",
          matchedRule: "Akan Twi cancel grammar",
          resolverType: "local_pattern",
        };
      }
    }

    return {
      transcript: text,
      confidence: 0.65,
      resolvedIntent: "UNKNOWN_SPEECH",
      matchedRule: "Fallback NLU pattern",
      resolverType: "nlu_model",
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    setSupported(true);

    let sentenceChunks: string[] = [];
    let sentenceTimer: any = null;
    const SENTENCE_END_SILENCE_MS = 2200;

    const clearSentenceTimer = () => {
      if (sentenceTimer) {
        clearTimeout(sentenceTimer);
        sentenceTimer = null;
      }
    };

    const commitCompleteSentence = (pendingInterim: string = "") => {
      clearSentenceTimer();
      const fullSentence = [...sentenceChunks, pendingInterim]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      sentenceChunks = [];
      if (!fullSentence) return;

      const formattedText = formatSpokenNumbersAsDigits(fullSentence);
      setTranscript(formattedText);

      // Automatically turn off the microphone once the user finishes their sentence
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);

      const match = resolveSpokenText(formattedText, options.language);
      setLastMatch(match);
      if (onMatchRef.current) {
        onMatchRef.current(match);
      }
    };

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options.language === "twi" ? "ak-GH" : "en-US";

      recognition.onresult = (event: any) => {
        if (isMutedRef.current || isSpeakingRef.current) return; // Strict muting during prompt playback

        let interimPart = "";
        let finalPart = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const textChunk = (res[0]?.transcript || "").trim();
          if (!textChunk) continue;
          if (res.isFinal) {
            finalPart += " " + textChunk;
          } else {
            interimPart += " " + textChunk;
          }
        }

        interimPart = interimPart.trim();
        finalPart = finalPart.trim();
        const combinedCurrent = (finalPart || interimPart).trim();
        if (!combinedCurrent || isBackgroundNoiseOrStatic(combinedCurrent)) return;

        // Acoustic Echo Suppression - strictly checked with current speaking state
        if (isAcousticSystemEcho(combinedCurrent, activePromptRef.current, isSpeakingRef.current)) {
          const stripped = stripSystemEchoFromTranscript(combinedCurrent, activePromptRef.current, isSpeakingRef.current);
          if (!stripped || isAcousticSystemEcho(stripped, activePromptRef.current, isSpeakingRef.current)) {
            return;
          }
        }

        if (finalPart) {
          const strippedFinal = stripSystemEchoFromTranscript(finalPart, activePromptRef.current, isSpeakingRef.current) || finalPart;
          sentenceChunks.push(formatSpokenNumbersAsDigits(strippedFinal));
        }

        const preview = [...sentenceChunks, interimPart ? formatSpokenNumbersAsDigits(interimPart) : ""]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (preview) {
          setTranscript(preview);
        }

        // Wait until user finishes their full sentence before turning off mic and dispatching
        clearSentenceTimer();
        sentenceTimer = setTimeout(() => {
          commitCompleteSentence(interimPart);
        }, SENTENCE_END_SILENCE_MS);
      };

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("Speech recognition error:", e.error);
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Speech recognition initialization failed:", e);
    }

    return () => {
      clearSentenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [options.isMuted, options.language, resolveSpokenText]);

  const startListening = useCallback(() => {
    if (options.isMuted || !recognitionRef.current) return;
    try {
      recognitionRef.current.lang = options.language === "twi" ? "ak-GH" : "en-US";
      recognitionRef.current.start();
    } catch {}
  }, [options.isMuted, options.language]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {}
  }, []);

  return {
    isListening,
    transcript,
    lastMatch,
    supported,
    startListening,
    stopListening,
    resolveSpokenText,
  };
}
