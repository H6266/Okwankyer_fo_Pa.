/**
 * Ɔkwankyerɛfo Pa - Deterministic Intelligent Understanding Engine (aiUnderstanding.ts)
 *
 * Implements:
 * 1. Bayesian Intent Scoring: P(intent | tokens, step_context, history_prior)
 * 2. High-Precision Entity Extraction: Ghana phone numbers, amounts (Akan & numeric), networks, names
 * 3. Correction & Reversal Intelligence: detects "no, I meant X not Y", "make it 200"
 * 4. Multilingual Confirmation Detection: Twi (aane, ɛyɛ, yɛ, yoo) & English (yes, sure, correct)
 * 5. Interruption Detection: detects context-switching (e.g. balance check during money transfer)
 * 6. Negation Intelligence: distinguishes pure cancellations from corrective updates ("not 50, but 100")
 * 7. Coreference Resolution: resolves "that amount", "to him/her", "same recipient"
 * 8. Ambiguity Resolution: detects competing intents and requests clarification
 *
 * Performance budget: < 15ms
 */

import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  MobileNetwork,
} from "./aiTypes";
import { inputNormalizer } from "../perception/inputNormalizer";

export interface BayesianIntentScore {
  intent: IntentName;
  prior: number;
  likelihood: number;
  posterior: number;
}

export interface UnderstandingResult {
  intent: IntentName;
  confidence: number;
  candidateIntents: BayesianIntentScore[];
  entities: EntitySlotMap;
  isCorrection: boolean;
  correctionDetail?: {
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
  };
  isConfirmation: boolean;
  isDenial: boolean;
  isInterruption: boolean;
  interruptedIntent?: IntentName;
  isAmbiguous: boolean;
  ambiguityCandidates?: IntentName[];
  processingLatencyMs: number;
}

// Ghanaian Name Lexicon for reliable contextual NER
const GHANAIAN_NAMES = new Set([
  "kwame", "kofi", "kwaku", "yaw", "kwesi", "kwadwo", "kwabena",
  "ama", "akosua", "abena", "yaa", "afia", "adwoa", "amba",
  "mensah", "boateng", "asante", "osei", "agyemang", "appiah",
  "owusu", "darko", "frimpong", "acheampong", "badu", "anita",
  "emmanuel", "grace", "esther", "samuel", "michael", "mary",
]);

// Step priors mapping: step -> likely intents with base probabilities
const STEP_PRIORS: Record<string, Partial<Record<IntentName, number>>> = {
  welcome: { SEND_MONEY: 0.40, CHECK_BALANCE: 0.25, BUY_AIRTIME: 0.15, PAY_BILL: 0.10, HELP: 0.10 },
  recipient: { SEND_MONEY: 0.70, GO_BACK: 0.15, CANCEL: 0.10, HELP: 0.05 },
  amount: { SEND_MONEY: 0.65, CHANGE_INFORMATION: 0.15, GO_BACK: 0.10, CANCEL: 0.10 },
  confirm: { CONFIRM: 0.60, DENY: 0.15, CHANGE_INFORMATION: 0.15, CANCEL: 0.10 },
  auth: { CONFIRM: 0.50, CANCEL: 0.30, HELP: 0.20 },
};

// Intent keyword weights for Likelihood calculation P(tokens | intent)
const INTENT_LEXICON: Record<IntentName, Array<{ word: string; weight: number }>> = {
  SEND_MONEY: [
    { word: "send", weight: 3.0 },
    { word: "mane", weight: 3.5 },
    { word: "sika", weight: 2.5 },
    { word: "transfer", weight: 3.0 },
    { word: "remit", weight: 2.5 },
    { word: "pay", weight: 1.5 },
    { word: "kɔma", weight: 2.0 },
  ],
  CHECK_BALANCE: [
    { word: "balance", weight: 4.0 },
    { word: "check", weight: 2.0 },
    { word: "hwɛ", weight: 2.5 },
    { word: "dodoɔ", weight: 2.0 },
    { word: "account", weight: 1.5 },
    { word: "sika a aka", weight: 4.0 },
  ],
  BUY_AIRTIME: [
    { word: "airtime", weight: 4.0 },
    { word: "credit", weight: 3.5 },
    { word: "kraditi", weight: 4.0 },
    { word: "topup", weight: 3.0 },
    { word: "recharge", weight: 3.0 },
  ],
  BUY_DATA: [
    { word: "data", weight: 4.0 },
    { word: "bundle", weight: 3.5 },
    { word: "internet", weight: 3.0 },
  ],
  CASH_OUT: [
    { word: "cash out", weight: 4.0 },
    { word: "withdraw", weight: 4.0 },
    { word: "yi sika", weight: 4.0 },
    { word: "agent", weight: 2.0 },
  ],
  PAY_BILL: [
    { word: "bill", weight: 4.0 },
    { word: "ecg", weight: 4.0 },
    { word: "gwcl", weight: 4.0 },
    { word: "water", weight: 2.5 },
    { word: "light", weight: 2.5 },
    { word: "electricity", weight: 3.0 },
    { word: "dstv", weight: 4.0 },
  ],
  CHECK_ACCOUNT: [
    { word: "statement", weight: 4.0 },
    { word: "mini statement", weight: 4.5 },
    { word: "recent", weight: 2.0 },
    { word: "history", weight: 3.0 },
  ],
  HELP: [
    { word: "help", weight: 4.0 },
    { word: "mmoa", weight: 4.0 },
    { word: "guide", weight: 2.5 },
    { word: "kwan", weight: 1.5 },
    { word: "explain", weight: 2.5 },
  ],
  GO_BACK: [
    { word: "back", weight: 3.5 },
    { word: "san", weight: 3.5 },
    { word: "san kɔ", weight: 4.0 },
    { word: "previous", weight: 3.0 },
  ],
  GO_HOME: [
    { word: "home", weight: 4.0 },
    { word: "fie", weight: 3.0 },
    { word: "main menu", weight: 4.0 },
    { word: "beginning", weight: 3.0 },
    { word: "start over", weight: 3.5 },
  ],
  CANCEL: [
    { word: "cancel", weight: 4.0 },
    { word: "gyae", weight: 4.0 },
    { word: "abort", weight: 4.0 },
    { word: "stop", weight: 3.0 },
    { word: "dismiss", weight: 3.0 },
  ],
  REPEAT: [
    { word: "repeat", weight: 4.0 },
    { word: "ka bio", weight: 4.0 },
    { word: "again", weight: 3.0 },
    { word: "say it again", weight: 4.0 },
    { word: "pardon", weight: 3.5 },
  ],
  CHANGE_INFORMATION: [
    { word: "change", weight: 3.5 },
    { word: "sesa", weight: 4.0 },
    { word: "modify", weight: 3.5 },
    { word: "edit", weight: 3.5 },
    { word: "make it", weight: 3.0 },
    { word: "instead", weight: 3.0 },
    { word: "mistake", weight: 3.0 },
  ],
  CONFIRM: [
    { word: "yes", weight: 4.0 },
    { word: "aane", weight: 4.5 },
    { word: "ɛyɛ", weight: 4.0 },
    { word: "yɛ", weight: 3.0 },
    { word: "yoo", weight: 3.0 },
    { word: "correct", weight: 3.5 },
    { word: "proceed", weight: 3.5 },
    { word: "confirm", weight: 4.0 },
    { word: "send it", weight: 3.5 },
    { word: "sure", weight: 3.0 },
    { word: "okay", weight: 2.5 },
  ],
  DENY: [
    { word: "no", weight: 4.0 },
    { word: "dabi", weight: 4.5 },
    { word: "not that", weight: 3.5 },
    { word: "don't", weight: 3.0 },
    { word: "wrong", weight: 3.5 },
    { word: "deny", weight: 4.0 },
  ],
  UNKNOWN: [],
};

export class AiUnderstanding {
  /**
   * Primary entry point for deterministic language understanding (<15ms).
   */
  public understand(
    rawUtterance: string,
    currentStep: string = "welcome",
    activeSlots: EntitySlotMap = {},
    sessionHistory: Array<{ intent: IntentName }> = []
  ): UnderstandingResult {
    const start = performance.now();
    const normalizedText = inputNormalizer.normalize(rawUtterance).toLowerCase().trim();

    // 1. Direct Confirmation & Denial Fast-Paths
    const isConfirmation = this.checkConfirmation(normalizedText);
    const isDenial = this.checkDenial(normalizedText);

    // 2. Check for Negation & Corrections
    const correctionCheck = this.detectCorrection(normalizedText, activeSlots);

    // 3. Entity Extraction
    const extractedEntities = this.extractEntities(normalizedText, activeSlots);

    // Merge correction entities if detected
    if (correctionCheck.isCorrection && correctionCheck.correctionDetail) {
      extractedEntities[correctionCheck.correctionDetail.field] = correctionCheck.correctionDetail.newValue;
      extractedEntities.correctionField = correctionCheck.correctionDetail.field;
      extractedEntities.previousValue = correctionCheck.correctionDetail.oldValue;
      extractedEntities.correctionReason = correctionCheck.correctionDetail.reason;
    }

    // 4. Coreference Resolution (resolves "him", "that amount", etc.)
    const resolvedCoreferences = this.resolveCoreferences(normalizedText, {
      ...activeSlots,
      ...extractedEntities,
    });
    const finalEntities = { ...extractedEntities, ...resolvedCoreferences };

    // 5. Bayesian Intent Scoring
    const candidateScores = this.computeBayesianScores(normalizedText, currentStep, sessionHistory, isConfirmation, isDenial, correctionCheck.isCorrection);
    const topCandidate = candidateScores[0] || { intent: "UNKNOWN" as IntentName, posterior: 0.1 };

    // 6. Ambiguity Analysis
    let isAmbiguous = false;
    let ambiguityCandidates: IntentName[] | undefined = undefined;
    if (candidateScores.length >= 2) {
      const top = candidateScores[0];
      const second = candidateScores[1];
      if (top.posterior < 0.70 && Math.abs(top.posterior - second.posterior) < 0.12) {
        isAmbiguous = true;
        ambiguityCandidates = [top.intent, second.intent];
      }
    }

    // 7. Interruption Detection (e.g. asking to check balance when mid-transfer)
    let isInterruption = false;
    let interruptedIntent: IntentName | undefined = undefined;
    if (
      (topCandidate.intent === "CHECK_BALANCE" || topCandidate.intent === "HELP") &&
      (activeSlots.amount || activeSlots.recipientPhone) &&
      currentStep !== "welcome"
    ) {
      isInterruption = true;
      interruptedIntent = "SEND_MONEY";
    }

    const latency = Math.round(performance.now() - start);

    return {
      intent: topCandidate.intent,
      confidence: Math.round(topCandidate.posterior * 100) / 100,
      candidateIntents: candidateScores.slice(0, 4),
      entities: finalEntities,
      isCorrection: correctionCheck.isCorrection,
      correctionDetail: correctionCheck.correctionDetail,
      isConfirmation,
      isDenial,
      isInterruption,
      interruptedIntent,
      isAmbiguous,
      ambiguityCandidates,
      processingLatencyMs: latency,
    };
  }

  // =========================================================================
  // BAYESIAN SCORING: P(intent | text, step, history)
  // =========================================================================
  private computeBayesianScores(
    text: string,
    currentStep: string,
    history: Array<{ intent: IntentName }>,
    isConfirmation: boolean,
    isDenial: boolean,
    isCorrection: boolean
  ): BayesianIntentScore[] {
    const scores: BayesianIntentScore[] = [];
    const allIntents = Object.keys(INTENT_LEXICON) as IntentName[];

    // If explicit confirm or deny or correction, prioritize with near-certainty
    if (isConfirmation && !text.includes("send") && !text.includes("balance")) {
      return [{ intent: "CONFIRM", prior: 0.9, likelihood: 1.0, posterior: 0.98 }];
    }
    if (isDenial && !text.includes("send") && !text.includes("balance") && !isCorrection) {
      return [{ intent: "DENY", prior: 0.9, likelihood: 1.0, posterior: 0.98 }];
    }
    if (isCorrection) {
      return [{ intent: "CHANGE_INFORMATION", prior: 0.85, likelihood: 0.95, posterior: 0.95 }];
    }

    const stepPriors = STEP_PRIORS[currentStep] || { SEND_MONEY: 0.3, CHECK_BALANCE: 0.3, HELP: 0.2 };

    let totalPosterior = 0;

    for (const intent of allIntents) {
      if (intent === "UNKNOWN") continue;

      // 1. Context Prior P(intent | step)
      let prior = stepPriors[intent] || 0.05;

      // History continuity prior boost
      if (history.length > 0 && history[history.length - 1].intent === intent) {
        prior *= 1.25;
      }

      // 2. Lexical Likelihood P(tokens | intent)
      const keywords = INTENT_LEXICON[intent] || [];
      let matchScore = 0;
      for (const kw of keywords) {
        if (text.includes(kw.word)) {
          matchScore += kw.weight;
        }
      }

      // Handle single-intent phrases
      if (text === "send money" && intent === "SEND_MONEY") matchScore += 6.0;
      if ((text === "check balance" || text === "check my balance") && intent === "CHECK_BALANCE") matchScore += 6.0;
      if (text === "cancel" && intent === "CANCEL") matchScore += 6.0;
      if (text === "go back" && intent === "GO_BACK") matchScore += 6.0;
      if (text === "take me home" && intent === "GO_HOME") matchScore += 6.0;
      if (text === "repeat that" && intent === "REPEAT") matchScore += 6.0;

      const likelihood = matchScore > 0 ? Math.min(1.0, 0.15 + matchScore * 0.22) : 0.02;
      const unnormalized = prior * likelihood;

      scores.push({
        intent,
        prior,
        likelihood,
        posterior: unnormalized,
      });

      totalPosterior += unnormalized;
    }

    // Evidence Normalization
    if (totalPosterior > 0) {
      for (const s of scores) {
        s.posterior = s.posterior / totalPosterior;
      }
    }

    scores.sort((a, b) => b.posterior - a.posterior);

    // If top score is very weak, assign to UNKNOWN
    if (scores.length === 0 || scores[0].posterior < 0.20) {
      scores.unshift({ intent: "UNKNOWN", prior: 0.5, likelihood: 0.5, posterior: 0.5 });
    }

    return scores;
  }

  // =========================================================================
  // HIGH-PRECISION ENTITY EXTRACTION
  // =========================================================================
  public extractEntities(text: string, currentSlots: EntitySlotMap = {}): EntitySlotMap {
    const slots: EntitySlotMap = {};

    // 1. Ghanaian Mobile Phone Number Extraction (MTN, Telecel, AT)
    // Matches 024, 054, 055, 059, 020, 050, 027, 057, 026, 028 + 7 digits
    const phoneMatch = text.match(/\b(0(?:24|54|55|59|20|50|27|57|26|56|28)\d{7})\b/) ||
      text.match(/\b0\d{9}\b/);
    if (phoneMatch) {
      slots.recipientPhone = phoneMatch[0];
      // Inferred network from prefix
      const prefix = phoneMatch[0].substring(0, 3);
      if (["024", "054", "055", "059"].includes(prefix)) slots.network = "MTN";
      else if (["020", "050"].includes(prefix)) slots.network = "Telecel";
      else if (["027", "057", "026", "056"].includes(prefix)) slots.network = "AT";
    }

    // 2. Explicit Network Mentions
    if (/\bmtn\b/i.test(text)) slots.network = "MTN";
    else if (/\b(telecel|vodafone)\b/i.test(text)) slots.network = "Telecel";
    else if (/\b(at|airteltigo|airtel|tigo)\b/i.test(text)) slots.network = "AT";
    else if (/\bg-?money\b/i.test(text)) slots.network = "G-Money";

    // 3. Amount Extraction (Handling Negation: "not 50, but 100")
    const extractedAmt = this.extractAmountSafe(text);
    if (extractedAmt !== null && extractedAmt !== undefined) {
      slots.amount = extractedAmt;
      slots.currency = "GHS";
    }

    // 4. Recipient Name Extraction
    const extractedName = this.extractRecipientName(text);
    if (extractedName) {
      slots.recipientName = extractedName;
    }

    return slots;
  }

  /**
   * Safely extracts amounts while rejecting negated numbers ("don't send 50, send 100")
   */
  private extractAmountSafe(text: string): number | null {
    // Check for negation pattern: "not/don't send X... send/make it Y"
    const negationAmountMatch = text.match(/(?:not|don't|dabi)\s+(?:want to\s+)?(?:send\s+)?(\d+|aduonum|ahanum|apem).*?(?:send|make it|but|na mmom)\s+(\d+|aduonum|ahanum|apem)/i);
    if (negationAmountMatch) {
      const chosenWord = negationAmountMatch[2];
      return inputNormalizer.extractNumber(chosenWord);
    }

    // Normal extraction using inputNormalizer (supports Akan and digits)
    // Avoid matching phone numbers as amounts
    const textWithoutPhones = text.replace(/\b0\d{9}\b/g, "");
    return inputNormalizer.extractNumber(textWithoutPhones);
  }

  /**
   * Context-aware Ghanaian name recognition
   */
  private extractRecipientName(text: string): string | null {
    // Look for prepositional contexts: "to Kwame", "kɔma Ama", "ma Kofi", "send it to Yaw"
    const prepMatch = text.match(/\b(?:to|kɔma|ma|give)\s+([a-zA-Zɛɔ]+)\b/i);
    if (prepMatch) {
      const candidate = prepMatch[1].toLowerCase();
      if (!["send", "the", "him", "her", "them", "money", "sika"].includes(candidate)) {
        return this.capitalizeName(candidate);
      }
    }

    // Direct Ghanaian names in utterance
    const words = text.split(/\s+/);
    for (const w of words) {
      const clean = w.toLowerCase().replace(/[^a-zɛɔ]/g, "");
      if (GHANAIAN_NAMES.has(clean)) {
        return this.capitalizeName(clean);
      }
    }

    return null;
  }

  private capitalizeName(str: string): string {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // =========================================================================
  // CORRECTION & REVERSAL DETECTION
  // =========================================================================
  public detectCorrection(
    text: string,
    currentSlots: EntitySlotMap
  ): { isCorrection: boolean; correctionDetail?: { field: string; oldValue: any; newValue: any; reason: string } } {
    const lower = text.toLowerCase();

    // 1. Amount correction: "Make it 200", "Actually 150", "No, I said 200", "Sesa no kɔ 150", "Change amount to 300"
    const amountCorrectionRegex = /(?:make it|actually|instead|i said|sesa(?:\s+no)?(?:\s+kɔ)?|change(?: that)? amount(?: to)?|change(?: it)?(?: to)?|no,?\s*(?:send)?)\s*(\d+|aduonum|ahanum|apem)/i;
    const amountMatch = lower.match(amountCorrectionRegex);
    if (amountMatch) {
      const newAmt = inputNormalizer.extractNumber(amountMatch[1]);
      if (newAmt !== null && newAmt !== currentSlots.amount) {
        return {
          isCorrection: true,
          correctionDetail: {
            field: "amount",
            oldValue: currentSlots.amount ?? null,
            newValue: newAmt,
            reason: `Caller corrected amount to ${newAmt} GHS via "${text}"`,
          },
        };
      }
    }

    // 2. Recipient correction: "No, I said Ama", "Actually send to Kwame", "Instead send to Kofi"
    const nameCorrectionRegex = /(?:no,?\s*(?:i said|send to|it's)|actually(?: send it to)?|instead)\s+([a-zA-Zɛɔ]+)/i;
    const nameMatch = lower.match(nameCorrectionRegex);
    if (nameMatch) {
      const newName = this.capitalizeName(nameMatch[1].trim());
      if (GHANAIAN_NAMES.has(newName.toLowerCase()) && newName !== currentSlots.recipientName) {
        return {
          isCorrection: true,
          correctionDetail: {
            field: "recipientName",
            oldValue: currentSlots.recipientName ?? null,
            newValue: newName,
            reason: `Caller corrected recipient to ${newName} via "${text}"`,
          },
        };
      }
    }

    // 3. Phone correction: "No, the number is 055..."
    const phoneMatch = lower.match(/\b(0(?:24|54|55|59|20|50|27|57|26|56|28)\d{7})\b/);
    if (phoneMatch && /\b(no|nope|dabi|actually|mistake|wrong|sesa)\b/i.test(lower)) {
      return {
        isCorrection: true,
        correctionDetail: {
          field: "recipientPhone",
          oldValue: currentSlots.recipientPhone ?? null,
          newValue: phoneMatch[0],
          reason: `Caller corrected phone number to ${phoneMatch[0]}`,
        },
      };
    }

    return { isCorrection: false };
  }

  // =========================================================================
  // COREFERENCE RESOLUTION ("that amount", "to him", "same recipient")
  // =========================================================================
  public resolveCoreferences(text: string, currentSlots: EntitySlotMap): Partial<EntitySlotMap> {
    const resolved: Partial<EntitySlotMap> = {};
    const lower = text.toLowerCase();

    // "Send to him" / "Send to her" / "same person"
    if (
      lower.includes("to him") ||
      lower.includes("to her") ||
      lower.includes("same person") ||
      lower.includes("same recipient") ||
      lower.includes("saa nipa no")
    ) {
      if (currentSlots.recipientName) resolved.recipientName = currentSlots.recipientName;
      if (currentSlots.recipientPhone) resolved.recipientPhone = currentSlots.recipientPhone;
      if (currentSlots.network) resolved.network = currentSlots.network;
    }

    // "Use that amount" / "same amount"
    if (
      lower.includes("same amount") ||
      lower.includes("that amount") ||
      lower.includes("saa sika no ara")
    ) {
      if (currentSlots.amount) resolved.amount = currentSlots.amount;
    }

    return resolved;
  }

  // =========================================================================
  // MULTILINGUAL CONFIRMATION & DENIAL
  // =========================================================================
  public checkConfirmation(text: string): boolean {
    const lower = text.toLowerCase().trim();
    const confirmTokens = [
      "yes", "yeah", "yep", "sure", "correct", "confirm", "proceed",
      "okay", "ok", "aane", "aane yoo", "ɛyɛ", "yɛ", "ampa", "kɔ so", "send it", "yoo"
    ];
    return confirmTokens.some((tok) => lower === tok || lower.startsWith(`${tok} `) || lower.endsWith(` ${tok}`) || lower.includes(` ${tok} `));
  }

  public checkDenial(text: string): boolean {
    const lower = text.toLowerCase().trim();
    const denialTokens = [
      "no", "nope", "dabi", "wrong", "don't", "not that", "stop", "deny", "sesa", "gyae"
    ];
    return denialTokens.some((tok) => lower === tok || lower.startsWith(`${tok} `) || lower.endsWith(` ${tok}`) || lower.includes(` ${tok} `));
  }
}

export const aiUnderstanding = new AiUnderstanding();
