/**
 * Ɔkwankyerɛfo Pa - Ghanaian Phonetic Matcher & Pronunciation Tolerance Engine
 * (ghanaianPhoneticMatcher.ts)
 * 
 * Specifically designed for Ghanaian Akan Twi & Ghanaian English telephony:
 * - Tolerates accented, slurred, dialectal, and non-standard pronunciations.
 * - Bridges English <-> Akan Twi code-switching and colloquial MoMo speech.
 * - Normalizes Ghanaian currencies ("cities", "sidi", "sedis", "see this" -> "cedis").
 * - Normalizes Twi number words & Ghanaian accented English numbers.
 * - Extracts financial slots (amount, recipient phone, recipient name, network) even from imperfect speech.
 * - Provides word-by-word streaming phonetic normalization for the phone simulator terminal.
 */

import { normalizeAkanToken, SHARED_TOKEN_VALUES } from "../../linguistic/numberLexicon";

export interface PhoneticCorrection {
  original: string;
  corrected: string;
  confidence: number;
  category: "currency" | "number" | "intent" | "network" | "name" | "affirmation" | "navigation";
  reason: string;
}

export interface PhoneticMatchResult {
  rawTranscript: string;
  normalizedTranscript: string;
  repairedWords: PhoneticCorrection[];
  detectedIntent?: "send_money" | "check_balance" | "airtime" | "confirm" | "cancel" | "navigation";
  extractedAmount?: number;
  extractedPhone?: string;
  extractedName?: string;
  extractedNetwork?: "MTN" | "Telecel" | "AT";
  isAffirmative?: boolean;
  isNegative?: boolean;
  confidenceBoost: number;
}

// ── Known Ghanaian Phone Number Prefixes ──────────────────────────────────
const GHANA_TELCO_PREFIXES = ["024", "054", "055", "059", "025", "020", "050", "027", "057", "026", "056"];

// ── Canonical Phonetic Map ────────────────────────────────────────────────
// Maps mispronounced, misspelled, or slang tokens to canonical representations
const PHONETIC_CORRECTION_RULES: Array<{
  pattern: RegExp;
  replacement: string;
  category: PhoneticCorrection["category"];
  reason: string;
}> = [
  // ── Currency: Cedis & Pesewas ──
  { pattern: /\b(?:cities|city|see\s+this|see\s+the|sedis|sidi|cidi|cedi|sedee|sidie|cediez|ghs|gh\s*cedis?)\b/gi, replacement: "cedis", category: "currency", reason: "Ghanaian cedi pronunciation normalization" },
  { pattern: /\b(?:pesewas|pesewa|peseua|piseua|peswas|pisewas|passengers|pese)\b/gi, replacement: "pesewas", category: "currency", reason: "Ghanaian pesewa pronunciation normalization" },

  // ── Colloquial Currency Slang (Bars & Sticks) ──
  { pattern: /\b(?:half\s+a\s+bar)\b/gi, replacement: "5 cedis", category: "currency", reason: "Ghanaian slang: half a bar = 5 GHS" },
  { pattern: /\b(?:one\s+bar|1\s+bar)\b/gi, replacement: "10 cedis", category: "currency", reason: "Ghanaian slang: one bar = 10 GHS" },
  { pattern: /\b(?:two\s+bars|2\s+bars)\b/gi, replacement: "20 cedis", category: "currency", reason: "Ghanaian slang: two bars = 20 GHS" },
  { pattern: /\b(?:one\s+stick|1\s+stick)\b/gi, replacement: "100 cedis", category: "currency", reason: "Ghanaian slang: one stick = 100 GHS" },
  { pattern: /\b(?:two\s+sticks|2\s+sticks)\b/gi, replacement: "200 cedis", category: "currency", reason: "Ghanaian slang: two sticks = 200 GHS" },

  // ── Intent: Send Money / Transfer / Mane Sika ──
  { pattern: /\b(?:sen\s+moni|sen\s+mani|send\s+moni|sen\s+money|sendi\s+sika|send\s+sika)\b/gi, replacement: "send money", category: "intent", reason: "Phonetic send money approximation" },
  { pattern: /\b(?:transfa|tranzfa|transfar|trensfer)\b/gi, replacement: "transfer", category: "intent", reason: "Phonetic transfer approximation" },
  { pattern: /\b(?:me\s*p[eɛ]\s*s[eɛ]\s*me\s*(?:send|sendi|mane|soma))\b/gi, replacement: "mepɛ sɛ mesoma", category: "intent", reason: "Twi send intent normalization" },
  { pattern: /\b(?:mep3\s*s3\s*me(?:send|soma|mane))\b/gi, replacement: "mepɛ sɛ mesoma", category: "intent", reason: "Twi orthographic ASCII normalization" },
  { pattern: /\b(?:fa\s+k[oɔ]\s*ma|fa\s+mane|k[oɔ]\s*ma)\b/gi, replacement: "kɔma", category: "intent", reason: "Twi give/send to normalization" },

  // ── Intent: Check Balance ──
  { pattern: /\b(?:chek\s+(?:my|me\s+)?balans|check\s+(?:my|me\s+)?balance|check\s+balans|me\s+balans|how\s+much\s+dey\s+inside)\b/gi, replacement: "check balance", category: "intent", reason: "Phonetic balance check approximation" },
  { pattern: /\b(?:hw[eɛ]\s*sika\s*no\s*so|hw[eɛ]\s*me\s*balance)\b/gi, replacement: "hwɛ me balance", category: "intent", reason: "Twi check balance normalization" },

  // ── Intent: Airtime & Bundles ──
  { pattern: /\b(?:bai\s+etaim|buy\s+etaim|t[oɔ]\s+airtime|kredit|credit)\b/gi, replacement: "buy airtime", category: "intent", reason: "Phonetic airtime purchase normalization" },
  { pattern: /\b(?:bandil|bundle|data\s+bundle)\b/gi, replacement: "bundle", category: "intent", reason: "Phonetic bundle normalization" },

  // ── Networks / Providers ──
  { pattern: /\b(?:em\s*ti\s*en|emtien|empty\s*n|empty\s*end|yellow\s+network)\b/gi, replacement: "MTN", category: "network", reason: "Phonetic MTN approximation" },
  { pattern: /\b(?:telesel|telasel|vodafone|voda|vodafoni|red\s+network)\b/gi, replacement: "Telecel", category: "network", reason: "Phonetic Telecel approximation" },
  { pattern: /\b(?:ei\s*ti|eitel\s*tigo|etigo|airtel\s*tigo|blue\s+network)\b/gi, replacement: "AT", category: "network", reason: "Phonetic AirtelTigo / AT approximation" },

  // ── Affirmation / Yes ──
  { pattern: /\b(?:aane|ane|aan[eɛ]|ampah|ampa|pene\s+so|yie|yoo|yo|confam|konfirm)\b/gi, replacement: "confirm", category: "affirmation", reason: "Akan/Ghanaian affirmation normalization" },

  // ── Negation / No / Cancel ──
  { pattern: /\b(?:dabi|daabi|dabii|gyae|hwee|kansil|annk[oɔ])\b/gi, replacement: "cancel", category: "navigation", reason: "Akan/Ghanaian negation normalization" },

  // ── Navigation (Back, Repeat, Exit) ──
  { pattern: /\b(?:san\s+akyi|k[oɔ]\s+akyi|go\s+back|bak)\b/gi, replacement: "back", category: "navigation", reason: "Back navigation normalization" },
  { pattern: /\b(?:tie\s+bio|ka\s+bio|tie\s+wei\s+biom|say\s+again|ripit)\b/gi, replacement: "repeat", category: "navigation", reason: "Repeat navigation normalization" },
  { pattern: /\b(?:gyae\s+mu|pue|firi\s+mu)\b/gi, replacement: "exit", category: "navigation", reason: "Exit navigation normalization" },

  // ── Akan Number Words to Numerals ──
  { pattern: /\b(?:baako|bako|barko|baakor|pako)\b/gi, replacement: "1", category: "number", reason: "Akan 1 normalization" },
  { pattern: /\b(?:mmienu|mienu|menu|meenu|mi[eɛ]nu)\b/gi, replacement: "2", category: "number", reason: "Akan 2 normalization" },
  { pattern: /\b(?:mmi[eɛ]nsa|mmiensa|miensa|miesa)\b/gi, replacement: "3", category: "number", reason: "Akan 3 normalization" },
  { pattern: /\b(?:[eɛ]nan|enan|nnan|nan)\b/gi, replacement: "4", category: "number", reason: "Akan 4 normalization" },
  { pattern: /\b(?:[eɛ]num|enum|nnum|num)\b/gi, replacement: "5", category: "number", reason: "Akan 5 normalization" },
  { pattern: /\b(?:nsia|nsiaa|sia)\b/gi, replacement: "6", category: "number", reason: "Akan 6 normalization" },
  { pattern: /\b(?:nson|nso)\b/gi, replacement: "7", category: "number", reason: "Akan 7 normalization" },
  { pattern: /\b(?:nw[oɔ]twe|nwotwe|wotwe|notwe)\b/gi, replacement: "8", category: "number", reason: "Akan 8 normalization" },
  { pattern: /\b(?:nkron|kron)\b/gi, replacement: "9", category: "number", reason: "Akan 9 normalization" },
  { pattern: /\b(?:du|edu|edoo)\b/gi, replacement: "10", category: "number", reason: "Akan 10 normalization" },
  { pattern: /\b(?:dubaako|du\s+baako)\b/gi, replacement: "11", category: "number", reason: "Akan 11 normalization" },
  { pattern: /\b(?:dummienu|du\s+mmienu)\b/gi, replacement: "12", category: "number", reason: "Akan 12 normalization" },
  { pattern: /\b(?:aduonu|adwenu|aduenu)\b/gi, replacement: "20", category: "number", reason: "Akan 20 normalization" },
  { pattern: /\b(?:aduasa|adwasa)\b/gi, replacement: "30", category: "number", reason: "Akan 30 normalization" },
  { pattern: /\b(?:aduanan|adwanan)\b/gi, replacement: "40", category: "number", reason: "Akan 40 normalization" },
  { pattern: /\b(?:aduonum|adwonum)\b/gi, replacement: "50", category: "number", reason: "Akan 50 normalization" },
  { pattern: /\b(?:adunsia|aduansia)\b/gi, replacement: "60", category: "number", reason: "Akan 60 normalization" },
  { pattern: /\b(?:aduonson|aduanson)\b/gi, replacement: "70", category: "number", reason: "Akan 70 normalization" },
  { pattern: /\b(?:adunw[oɔ]twe|aduanwotwe)\b/gi, replacement: "80", category: "number", reason: "Akan 80 normalization" },
  { pattern: /\b(?:aduokron|aduankron)\b/gi, replacement: "90", category: "number", reason: "Akan 90 normalization" },
  { pattern: /\b(?:[oɔ]ha|oha)\b/gi, replacement: "100", category: "number", reason: "Akan 100 normalization" },
  { pattern: /\b(?:ahannu|aha\s*nnu)\b/gi, replacement: "200", category: "number", reason: "Akan 200 normalization" },
  { pattern: /\b(?:ahansia|aha\s*nsia)\b/gi, replacement: "600", category: "number", reason: "Akan 600 normalization" },
  { pattern: /\b(?:ahanum|aha\s*num)\b/gi, replacement: "500", category: "number", reason: "Akan 500 normalization" },
  { pattern: /\b(?:apem|mpem)\b/gi, replacement: "1000", category: "number", reason: "Akan 1000 normalization" },

  // ── English Numbers with Ghanaian Accents ──
  { pattern: /\b(?:won|wan)\b/gi, replacement: "1", category: "number", reason: "Ghanaian accent 1" },
  { pattern: /\b(?:too|tu)\b/gi, replacement: "2", category: "number", reason: "Ghanaian accent 2" },
  { pattern: /\b(?:tree|tri)\b/gi, replacement: "3", category: "number", reason: "Ghanaian accent 3" },
  { pattern: /\b(?:fo|fore)\b/gi, replacement: "4", category: "number", reason: "Ghanaian accent 4" },
  { pattern: /\b(?:faiv|fiv)\b/gi, replacement: "5", category: "number", reason: "Ghanaian accent 5" },
  { pattern: /\b(?:siks)\b/gi, replacement: "6", category: "number", reason: "Ghanaian accent 6" },
  { pattern: /\b(?:sevn)\b/gi, replacement: "7", category: "number", reason: "Ghanaian accent 7" },
  { pattern: /\b(?:eit|ate)\b/gi, replacement: "8", category: "number", reason: "Ghanaian accent 8" },
  { pattern: /\b(?:nain)\b/gi, replacement: "9", category: "number", reason: "Ghanaian accent 9" },
  { pattern: /\b(?:ziro|zerro)\b/gi, replacement: "0", category: "number", reason: "Ghanaian accent 0" },
  { pattern: /\b(?:toti|tarti)\b/gi, replacement: "30", category: "number", reason: "Ghanaian accent 30" },
  { pattern: /\b(?:foti|fawti)\b/gi, replacement: "40", category: "number", reason: "Ghanaian accent 40" },
  { pattern: /\b(?:fifti|fivety|fiftie)\b/gi, replacement: "50", category: "number", reason: "Ghanaian accent 50" },
  { pattern: /\b(?:siksti)\b/gi, replacement: "60", category: "number", reason: "Ghanaian accent 60" },
  { pattern: /\b(?:sevnti)\b/gi, replacement: "70", category: "number", reason: "Ghanaian accent 70" },
  { pattern: /\b(?:eiti)\b/gi, replacement: "80", category: "number", reason: "Ghanaian accent 80" },
  { pattern: /\b(?:nainti)\b/gi, replacement: "90", category: "number", reason: "Ghanaian accent 90" },
  { pattern: /\b(?:handred|handrid|hondred)\b/gi, replacement: "100", category: "number", reason: "Ghanaian accent 100" },
  { pattern: /\b(?:tusan|taosan)\b/gi, replacement: "1000", category: "number", reason: "Ghanaian accent 1000" },

  // ── Ghanaian Names Phonetic Normalization ──
  { pattern: /\b(?:kwami|quame|kame)\b/gi, replacement: "Kwame", category: "name", reason: "Kwame spelling normalization" },
  { pattern: /\b(?:coffie|cofi|koffi)\b/gi, replacement: "Kofi", category: "name", reason: "Kofi spelling normalization" },
  { pattern: /\b(?:amah|ammar)\b/gi, replacement: "Ama", category: "name", reason: "Ama spelling normalization" },
  { pattern: /\b(?:kodjo|cudjoe|kudjoe)\b/gi, replacement: "Kojo", category: "name", reason: "Kojo spelling normalization" },
  { pattern: /\b(?:aqua|acquah)\b/gi, replacement: "Akua", category: "name", reason: "Akua spelling normalization" },
  { pattern: /\b(?:abina|abenaa)\b/gi, replacement: "Abena", category: "name", reason: "Abena spelling normalization" },
  { pattern: /\b(?:adjoa|ajua)\b/gi, replacement: "Adwoa", category: "name", reason: "Adwoa spelling normalization" },
  { pattern: /\b(?:quashie|kwesi|kwasi)\b/gi, replacement: "Kwesi", category: "name", reason: "Kwesi spelling normalization" },
  { pattern: /\b(?:mensa)\b/gi, replacement: "Mensah", category: "name", reason: "Mensah spelling normalization" },
];

/**
 * Phonetic String Repair & Smart Normalization
 */
export function repairGhanaianPronunciation(rawText: string): PhoneticMatchResult {
  if (!rawText || !rawText.trim()) {
    return {
      rawTranscript: "",
      normalizedTranscript: "",
      repairedWords: [],
      confidenceBoost: 0,
    };
  }

  let text = rawText.trim();
  const corrections: PhoneticCorrection[] = [];
  const twiPhone = normalizeTwiSpokenPhoneNumbers(text);
  if (twiPhone !== text) {
    corrections.push({
      original: text,
      corrected: twiPhone,
      confidence: 0.96,
      category: "number",
      reason: "Twi spoken phone digit sequence normalization",
    });
    text = twiPhone;
  }

  // 1. Apply Rule-Based Phonetic Normalizations
  for (const rule of PHONETIC_CORRECTION_RULES) {
    if (rule.pattern.test(text)) {
      // Find original matches
      const matches = text.match(rule.pattern);
      if (matches) {
        matches.forEach((m) => {
          corrections.push({
            original: m,
            corrected: rule.replacement,
            confidence: 0.96,
            category: rule.category,
            reason: rule.reason,
          });
        });
      }
      text = text.replace(rule.pattern, rule.replacement);
    }
  }

  // 2. Normalize Spoken Phone Numbers (e.g., "zero two four four ...")
  text = normalizeSpokenPhoneNumbers(text);

  // 3. Extract Intent & Financial Entities
  let detectedIntent: PhoneticMatchResult["detectedIntent"];
  if (/\b(?:send\s+money|transfer|mepɛ\s+sɛ\s+mesoma|mane|soma)\b/i.test(text)) {
    detectedIntent = "send_money";
  } else if (/\b(?:check\s+balance|hwɛ\s+me\s+balance)\b/i.test(text)) {
    detectedIntent = "check_balance";
  } else if (/\b(?:buy\s+airtime|bundle)\b/i.test(text)) {
    detectedIntent = "airtime";
  } else if (/\b(?:confirm|proceed|okay|yes)\b/i.test(text)) {
    detectedIntent = "confirm";
  } else if (/\b(?:cancel|stop|back|exit)\b/i.test(text)) {
    detectedIntent = "cancel";
  }

  // 4. Extract Amount
  let extractedAmount: number | undefined;
  const amountMatch = text.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:cedis|sidi|pesewas)?\b/i);
  if (amountMatch) {
    const parsed = parseFloat(amountMatch[1]);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10000) {
      extractedAmount = parsed;
    }
  }

  // 5. Extract Recipient Phone (10 digits starting with Ghanaian prefix)
  let extractedPhone: string | undefined;
  const phoneMatch = text.match(/\b(0[235][0-9]{8})\b/);
  if (phoneMatch) {
    extractedPhone = phoneMatch[1];
  }

  // 6. Extract Recipient Name
  let extractedName: string | undefined;
  const nameMatch = text.match(/\b(?:to|kɔma|ma|give)\s+([A-Z][a-z]+)\b/i);
  if (nameMatch) {
    extractedName = nameMatch[1];
  } else {
    // Check known names in text
    const names = ["Kwame", "Kofi", "Ama", "Yaw", "Akua", "Abena", "Kojo", "Kwesi", "Adwoa", "Mensah", "Osei", "Boateng"];
    for (const n of names) {
      if (new RegExp(`\\b${n}\\b`, "i").test(text)) {
        extractedName = n;
        break;
      }
    }
  }

  // 7. Extract Telco Network
  let extractedNetwork: PhoneticMatchResult["extractedNetwork"];
  if (/\bMTN\b/i.test(text)) extractedNetwork = "MTN";
  else if (/\b(?:Telecel|Vodafone)\b/i.test(text)) extractedNetwork = "Telecel";
  else if (/\b(?:AT|AirtelTigo)\b/i.test(text)) extractedNetwork = "AT";

  const isAffirmative = /\b(?:confirm|yes|proceed)\b/i.test(text);
  const isNegative = /\b(?:cancel|stop|no)\b/i.test(text);

  return {
    rawTranscript: rawText,
    normalizedTranscript: text.replace(/\s+/g, " ").trim(),
    repairedWords: corrections,
    detectedIntent,
    extractedAmount,
    extractedPhone,
    extractedName,
    extractedNetwork,
    isAffirmative,
    isNegative,
    confidenceBoost: Math.min(0.2, corrections.length * 0.05),
  };
}

function normalizeTwiSpokenPhoneNumbers(input: string): string {
  const tokens = input.split(/\s+/).filter(Boolean);
  const digitValues = tokens.map((token) => {
    const value = SHARED_TOKEN_VALUES[normalizeAkanToken(token)];
    return value !== undefined && value >= 0 && value <= 9 ? String(value) : null;
  });

  for (let start = 0; start <= tokens.length - 10; start++) {
    const digits = digitValues.slice(start, start + 10);
    if (digits[0] !== "0" || digits.some((digit) => digit === null)) continue;
    return [...tokens.slice(0, start), digits.join(""), ...tokens.slice(start + 10)].join(" ");
  }

  return input;
}

/**
 * Normalizes spoken phone digit strings into canonical 10-digit format
 * E.g. "zero two four four one two three four five six" -> "0244123456"
 * E.g. "oh five five two zero one eight nine three" -> "055201893"
 */
function normalizeSpokenPhoneNumbers(input: string): string {
  // Replace spoken single digits in word clusters
  let s = input
    .replace(/\b(?:zero|oh|o|ziro)\b/gi, "0")
    .replace(/\b(?:one|won|wan)\b/gi, "1")
    .replace(/\b(?:two|too|tu)\b/gi, "2")
    .replace(/\b(?:three|tree|tri)\b/gi, "3")
    .replace(/\b(?:four|fo)\b/gi, "4")
    .replace(/\b(?:five|faiv)\b/gi, "5")
    .replace(/\b(?:six|siks)\b/gi, "6")
    .replace(/\b(?:seven|sevn)\b/gi, "7")
    .replace(/\b(?:eight|eit|ate)\b/gi, "8")
    .replace(/\b(?:nine|nain)\b/gi, "9");

  // If there are sequences of separated digits like "0 2 4 4 1 2 3 4 5 6", collapse them
  s = s.replace(/(?:\b[0-9]\s+){3,}[0-9]\b/g, (match) => {
    return match.replace(/\s+/g, "");
  });

  return s;
}

/**
 * Word-by-word streaming transcript analyzer for terminal output.
 * Compares current interim transcript with previous transcript to identify
 * and annotate newly spoken words in real time.
 */
export function extractStreamingWords(
  previousTranscript: string,
  currentTranscript: string
): {
  newWords: string[];
  annotatedWords: Array<{ word: string; repaired?: string; isPhoneticMatch?: boolean }>;
} {
  const prevList = (previousTranscript || "").trim().split(/\s+/).filter(Boolean);
  const currList = (currentTranscript || "").trim().split(/\s+/).filter(Boolean);

  // Newly added words are at the end
  const newWords = currList.slice(prevList.length);

  const annotatedWords = newWords.map((word) => {
    const repair = repairGhanaianPronunciation(word);
    if (repair.repairedWords.length > 0) {
      return {
        word,
        repaired: repair.normalizedTranscript,
        isPhoneticMatch: true,
      };
    }
    return {
      word,
      isPhoneticMatch: false,
    };
  });

  return { newWords, annotatedWords };
}
