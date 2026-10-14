import { useCallback, useEffect, useRef, useState } from "react";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
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
  onMatch?: (result: SpeechMatchResult) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastMatch, setLastMatch] = useState<SpeechMatchResult | null>(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const onMatchRef = useRef(options.onMatch);
  onMatchRef.current = options.onMatch;

  // Resolve spoken input to keypad digit/intent
  const resolveSpokenText = useCallback((text: string, lang: "en" | "twi"): SpeechMatchResult => {
    const formatted = formatSpokenNumbersAsDigits(text);
    const raw = formatted.toLowerCase().trim();

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

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options.language === "twi" ? "ak-GH" : "en-US";

      recognition.onresult = (event: any) => {
        if (options.isMuted) return; // Strict Zero-PIN muting
        const lastResultIndex = event.results.length - 1;
        const res = event.results[lastResultIndex];
        const rawText = (res[0]?.transcript || "").trim();
        if (!rawText || isBackgroundNoiseOrStatic(rawText)) return;

        // Acoustic Echo Suppression
        if (isAcousticSystemEcho(rawText, options.activePrompt, options.isSpeaking)) {
          const stripped = stripSystemEchoFromTranscript(rawText, options.activePrompt);
          if (!stripped || isAcousticSystemEcho(stripped, options.activePrompt)) {
            return;
          }
        }

        const formattedText = formatSpokenNumbersAsDigits(rawText);
        setTranscript(formattedText);

        if (res.isFinal) {
          const match = resolveSpokenText(formattedText, options.language);
          setLastMatch(match);
          if (onMatchRef.current) {
            onMatchRef.current(match);
          }
        }
      };

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
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
