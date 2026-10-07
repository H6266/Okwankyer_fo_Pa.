/**
 * Ɔkwankyerɛfo Pa - Acoustic Echo & Noise Filter (echoFilter.ts)
 *
 * Prevents the ASR from listening to and transcribing the system's own prompts.
 * Filters out system audio echoing into the microphone from speakers.
 * Distinguishes genuine user voice from background noise, room static, and fan hum.
 */

import { formatSpokenNumbersAsDigits } from "./numberFormatter";

// Known core system prompt phrases that must NEVER be treated as caller inputs
const CANONICAL_SYSTEM_PROMPTS: string[] = [
  "welcome to okwankyerɛfo pa",
  "welcome to okwankyerεfo pa",
  "welcome to okwankyerɛfo pa an easy financial transaction service",
  "welcome to okwankyerɛfo pa voice mobile money who would you like to send money to today",
  "who would you like to send money to today",
  "for english press 1 for twi press 2",
  "for english press 1",
  "for twi press 2",
  "for telecom or mobile money services press 1 for banking services press 2",
  "for telecom mobile money services press 1",
  "for banking services press 2",
  "to hear this again press 9",
  "to exit press 0",
  "select your network",
  "for mtn press 1",
  "for telecel press 2",
  "for airteltigo press 3",
  "press 9 to hear this again or 0 to exit",
  "mtn services to send money to another momo user press 1",
  "to pay bills press 2",
  "to buy airtime or bundle press 3",
  "to allow cashout press 4",
  "to allow cash out press 4",
  "to check your account press 5",
  "press 8 to go back or 0 to exit",
  "enter the 10 digit number you want to send money to followed by hash",
  "enter the 10 digit number you want to send money to",
  "press 0 to exit",
  "you are about to send money to",
  "whose phone number ends with",
  "to confirm and send the money press 1 to cancel press 2 to exit completely press 0",
  "to confirm and send the money press 1 to cancel press 2",
  "to confirm and send press 1 to cancel press 2",
  "enter the cedi amount you want to send to",
  "followed by hash use star for pesewas",
  "enter the cedi amount you want to send",
  "you are about to send",
  "confirmed now please check your phone screen and enter your momo pin accurately",
  "confirmed now please check your phone screen and enter your momo pin",
  "thank you for using okwankyerɛfo pa goodbye",
  "congratulations you have successfully sent",
  "your transaction was completed on",
  "your reference number is",
  "would you like to do anything else",
  "mobile money service menu press 1 for mobile money 2 for banking",
  "select provider press 1 for mtn 2 for telecel 3 for at",
  "action menu press 1 to send money press 2 to check balance",
  "please enter the 10 digit mobile number of the recipient followed by the hash key",
  "please enter the amount in ghana cedis followed by the hash key",
  "safe confirmation press 1 to confirm transfer 2 to re enter",
  "transaction dispatched to momo provider sms receipt pending",
  "playing africa s talking audio prompt",

  // Akan Twi prompts
  "akwaaba okwankyerɛfo pa momo ntentan so",
  "sika bɛn na wobɛpɛ sɛ womane anaa wobɛyɛ",
  "okwankyerɛfo pa ma wo akwaaba",
  "kasa twi anaa borɔfo",
  "afei selecte wo network",
  "afei paw wo network",
  "sɛ mtn a mia 1",
  "sɛ mtn a mia baako",
  "sɛ telecel a mia 2",
  "sɛ telecel a mia mmienu",
  "sɛ airteltigo a mia 3",
  "sɛ airteltigo a mia mmiɛnsa",
  "mia anan na tie wei biom",
  "mia 4 na tie wei biom",
  "mia zero na si ha",
  "mia 0 na firi ha",
  "sɛ wopɛ sɛ wosende sika kɔ mobile money a mia baako",
  "sɛ wopɛ sɛ wosend sika kɔ mobile money a mia 1",
  "sikakorabea dwumadie no mia mmienu",
  "sikakorabea dwumadie no mia 2",
  "sɛ wopɛ sɛ wosend sika kɔ ma momo user a mia 1",
  "sɛ wopɛ sɛ womane sika kɔma momo user mia 1",
  "sɛ wopɛ sɛ wotua bills a mia 2",
  "sɛ wopɛ sɛ wotɔ airtime anaa bundle a mia 3",
  "sɛ wopɛ sɛ woallow i cash out a mia 4",
  "sɛ wopɛ sɛ wocheck i wo account no a mia 5",
  "sɛ wopɛ sɛ wochecki wo account mia 5",
  "mia 8 na kɔ back",
  "mia 8 na kɔ akyi",
  "mia 0 na pue",
  "afei bɔ nɔmba no a wopɛ sɛ wosende sika no to so no",
  "afei bɔ nɔma no a wopɛ sɛ wosend sika kɔma no no",
  "wowie a fa hash ka ho",
  "mia zero na san akyi",
  "me pɛ sɛ wo bɛ sendi sika kɔ",
  "worebɛmane sika kɔma",
  "sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako 1",
  "sɛ wo pɛ sɛ wo cancel a mia mmienu 2",
  "sɛ wo pɛ sɛ wo firi mu a mia zero 0",
  "sɛ wopene so a mia 1 sɛ wonpene so a mia 2",
  "mepa wo kyɛw si di amount a wo pɛ sɛ wo send ɛkɔ",
  "hyɛ sidi dodoɔ a wopɛ sɛ womane",
  "woyɛ a fa hash ɛntua to",
  "worebɛmane sidi",
  "me pɛ sɛ wo sendi",
  "sɛ wopɛ sɛ woyi tum na wo sendi a mia baako 1",
  "sɛ wopɛ sɛ wo cancel a mia mmienu 2",
  "me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo momo pin",
  "wapene so afei hwɛ wo foon screen so na hyɛ wo momo pin",
  "congratulations 500 ghana cedis a wosendee to",
  "ayekoo woatumi amane sidi",
  "mpanimfoɔ fakyɛ yɛn sɛ option yi nni hɔ bio",
  "yɛdaase sɛ woayɛ use wɔ okwankyerɛfo pa goodbye",
  "yɛda wo ase sɛ wode okwankyerɛfo pa adi dwuma nante yie",
  "meda wo ase nante yie",
  "mane sika mia 1 ma mane sika mia 2 ma balance",
  "who would you like to send money to",
  "please say their name or mobile number",
  "how much would you like to send",
  "please enter the amount",
  "would you like to confirm",
];

function normalizeTextForComparison(text: string): string {
  if (!text) return "";
  return formatSpokenNumbersAsDigits(text)
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recognizes if an utterance is an authentic standalone user intent,
 * which should NEVER be mistaken for an echo even if the prompt mentions the same word.
 */
function isStandaloneCallerIntent(normalizedText: string): boolean {
  if (!normalizedText) return false;
  // Single digits or simple digits (e.g. "1", "2", "3", "0", "8", "9", "5", "0553838464")
  if (/^[0-9]+$/.test(normalizedText)) return true;

  // Single word affirmative / navigation / selection commands
  const callerKeywords = new Set([
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
    "aane", "dabi", "yes", "no", "confirm", "cancel", "stop", "back",
    "mtn", "telecel", "airteltigo", "at", "vodafone",
    "balance", "sika", "mane", "send", "transfer", "airtime", "bundle",
    "kwame", "ama", "kofi", "akua", "yaw", "abena", "mensah",
    "yoo", "ampa", "ɛyɛ", "sesa", "tie bio", "san akyi"
  ]);

  if (callerKeywords.has(normalizedText)) return true;

  // Amount expressions like "50 cedis", "20 cedis", "cedi 100", "sidi 50"
  if (/^(?:(?:send|mane|transfer)?\s*(?:cedi|sidi|ghs)?\s*\d+\s*(?:cedis|sidi|pesewas)?)$/i.test(normalizedText)) {
    return true;
  }

  // Recipient entry phrases like "send to kwame", "send 50 to ama", "send money to kwame"
  if (/^(?:send|mane|soma)\s+(?:\d+|sika|to|kɔma)\b/i.test(normalizedText)) {
    return true;
  }

  return false;
}

/**
 * Checks if a recognized utterance is an acoustic echo of the system's own prompt.
 */
export function isAcousticSystemEcho(
  transcript: string,
  activeAssistantPrompt?: string | null,
  isAssistantSpeaking?: boolean
): boolean {
  if (!transcript || transcript.trim().length === 0) return false;

  const normalizedTranscript = normalizeTextForComparison(transcript);
  if (normalizedTranscript.length < 3) return false;

  // Explicit user inputs are NOT echoes!
  if (isStandaloneCallerIntent(normalizedTranscript)) {
    return false;
  }

  // 1. Check against the currently / recently playing assistant prompt
  if (activeAssistantPrompt && activeAssistantPrompt.trim().length > 0) {
    const normalizedPrompt = normalizeTextForComparison(activeAssistantPrompt);
    
    // Substring match: transcript is a direct phrase from the prompt
    if (normalizedTranscript.length >= 6 && normalizedPrompt.includes(normalizedTranscript)) {
      return true;
    }

    // High word overlap match: >= 60% of words in transcript come directly from the prompt
    const transcriptWords = normalizedTranscript.split(" ").filter((w) => w.length > 2);
    if (transcriptWords.length >= 2) {
      const matchCount = transcriptWords.filter((w) => normalizedPrompt.includes(w)).length;
      if (matchCount / transcriptWords.length >= 0.6) {
        return true;
      }
    }
  }

  // 2. Check against known system prompt catalog
  for (const prompt of CANONICAL_SYSTEM_PROMPTS) {
    // If transcript is found inside a known system prompt
    if (prompt.includes(normalizedTranscript) && normalizedTranscript.length >= 8) {
      return true;
    }
    // If transcript contains a major chunk of a system prompt
    if (normalizedTranscript.includes(prompt) && prompt.length >= 10) {
      return true;
    }
    // High word overlap against known prompt
    const words = normalizedTranscript.split(" ").filter((w) => w.length > 2);
    if (words.length >= 3) {
      const matchCount = words.filter((w) => prompt.includes(w)).length;
      if (matchCount / words.length >= 0.7) {
        return true;
      }
    }
  }

  // 3. Extra sensitivity if the assistant is actively playing audio through the speakers
  if (isAssistantSpeaking) {
    for (const prompt of CANONICAL_SYSTEM_PROMPTS) {
      const words = normalizedTranscript.split(" ").filter((w) => w.length > 2);
      if (words.length >= 2) {
        const matchCount = words.filter((w) => prompt.includes(w)).length;
        if (matchCount / words.length >= 0.5) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Strips echoed system prompt text from a combined transcript if the user spoke after an echo.
 * E.g.: "Welcome to Okwankyerɛfo Pa for English press 1 for Twi press 2 ... 2" -> "2"
 * E.g.: "Afei selecte wo network sɛ MTN a mia 1 ... 1" -> "1"
 */
export function stripSystemEchoFromTranscript(
  transcript: string,
  activeAssistantPrompt?: string | null
): string {
  if (!transcript) return "";
  const cleaned = transcript.trim();
  const normalized = normalizeTextForComparison(cleaned);

  if (isStandaloneCallerIntent(normalized)) {
    return cleaned;
  }

  // Check if system prompt appears at the start and user appended their answer (e.g. trailing command or number)
  const normalizedPrompt = activeAssistantPrompt ? normalizeTextForComparison(activeAssistantPrompt) : "";
  const promptList = normalizedPrompt ? [normalizedPrompt, ...CANONICAL_SYSTEM_PROMPTS] : CANONICAL_SYSTEM_PROMPTS;

  for (const p of promptList) {
    if (p.length < 8) continue;
    // Look for prompt words at the beginning
    const pPrefix = p.slice(0, 30);
    if (normalized.startsWith(pPrefix) || normalized.includes(p)) {
      const userWords = cleaned.split(/\s+/);
      // Scan from end backwards to find where genuine user command starts
      for (let i = userWords.length - 1; i >= 0; i--) {
        const candidate = userWords.slice(i).join(" ");
        const normCandidate = normalizeTextForComparison(candidate);
        if (isStandaloneCallerIntent(normCandidate)) {
          return candidate;
        }
      }
    }
  }

  // If the whole string is an echo with no appended command, return empty
  if (isAcousticSystemEcho(cleaned, activeAssistantPrompt)) {
    return "";
  }

  return cleaned;
}

/**
 * Distinguishes genuine voice from background room noise, coughing, breathing, or static.
 */
export function isBackgroundNoiseOrStatic(
  transcript: string,
  audioLevel: number = 0
): boolean {
  if (!transcript || transcript.trim().length === 0) return true;

  const clean = transcript.trim().toLowerCase();

  // Common background noise markers & non-verbal acoustic tokens
  const noiseMarkers = [
    "[noise]",
    "[applause]",
    "[music]",
    "[laughter]",
    "[cough]",
    "[throat-clearing]",
    "[sigh]",
    "[gasp]",
    "[silence]",
    "[static]",
    "[snort]",
    "...",
    "..",
    ".",
    "*",
    "uh",
    "um",
    "er",
    "ah",
    "hmm",
    "mm-hmm",
    "mhm",
    "eh",
    "oh",
  ];

  if (noiseMarkers.includes(clean)) return true;

  // Repetitive punctuation / non-alphanumeric noise
  if (/^[. _\-*~,;:'"?!]+$/.test(clean)) return true;

  // Pure murmurs or filler sounds
  if (/^(?:uh|um|er|ah|hmm|mm|eh)\s*(?:uh|um|er|ah|hmm|mm|eh)*$/i.test(clean)) {
    return true;
  }

  // If audio level is essentially flat noise floor (< 12%) and transcript is tiny fragment (< 3 chars)
  if (audioLevel > 0 && audioLevel < 12 && clean.length < 3) {
    return true;
  }

  return false;
}
