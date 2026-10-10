/**
 * Ɔkwankyerɛfo Pa - Canonical Step Registry (stepRegistry.ts)
 * 
 * Single authoritative source of truth for every IVR step:
 * - Step ID and human label
 * - Prompt audio key per language
 * - Prompt spoken copy per language
 * - Input contract: accepted DTMF values, input format, validator
 * - Universal navigation rules (8 = back, 9 = repeat, 0 = cancel)
 * - Next step transitions
 * - Slot collection metadata
 */

import { GhanaianNetwork, validateGhanaPhoneNumber, parseAndValidateAmount } from "./validation";

export type StepInputType = "single_digit" | "phone_number" | "amount" | "confirm";

export interface StepNavigationRules {
  allowBack: boolean;
  getBackTarget?: (language: "en" | "twi") => string;
  allowRepeat: boolean;
  allowCancel: boolean;
}

export interface StepDefinition {
  id: string;
  name: string;
  promptKey: string;
  promptText: {
    en: string;
    twi: string;
  };
  inputType: StepInputType;
  /** List of valid single-digit DTMF options (for menu steps) */
  acceptedDigits?: string[];
  /** Valid options description for user and AI error feedback */
  optionsDescription: {
    en: string;
    twi: string;
  };
  navigation: StepNavigationRules;
  /** What slot or field this step collects */
  collects?: "language" | "service" | "network" | "action" | "recipientPhone" | "amount" | "confirm";
  /** Default transition map for valid single-digit inputs */
  nextStepMap?: Record<string, string>;
  /** Custom resolver when transition depends on language or session */
  resolveNextStep?: (input: string, language: "en" | "twi") => string;
  /** Spoken aliases per accepted digit or navigation key (Ghanaian-English and Twi, including ASR confusions) */
  spoken?: Record<string, string[]>;
  /** Maximum retry attempts before fallback / hangup (default 2) */
  maxRetries?: number;
}

export const STEP_REGISTRY: Record<string, StepDefinition> = {
  "voice-menu": {
    id: "voice-menu",
    name: "Language Selection Greeting",
    promptKey: "welcome",
    promptText: {
      en: "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
      twi: "Akwaaba kɔ Ɔkwankyerɛfo Pa, sika ho dwumadie a ɛyɛ mmerɛ. Sɛ wopɛ Borɔfo a mia baako. Sɛ wopɛ Twi a mia mmienu.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 for English, 2 for Twi",
      twi: "1 ma Borɔfo, 2 ma Twi",
    },
    navigation: {
      allowBack: false,
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "language",
    nextStepMap: {
      "1": "service-select",
      "2": "provider-select",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "first", "english", "borofo", "borɔfo", "baako"],
      "2": ["2", "two", "to", "too", "second", "twi", "mmienu", "asante", "akuapem"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "language-selection": {
    id: "language-selection",
    name: "Language Selection",
    promptKey: "welcome",
    promptText: {
      en: "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
      twi: "Akwaaba kɔ Ɔkwankyerɛfo Pa, sika ho dwumadie a ɛyɛ mmerɛ. Sɛ wopɛ Borɔfo a mia baako. Sɛ wopɛ Twi a mia mmienu.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 for English, 2 for Twi",
      twi: "1 ma Borɔfo, 2 ma Twi",
    },
    navigation: {
      allowBack: false,
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "language",
    nextStepMap: {
      "1": "service-select",
      "2": "provider-select",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "first", "english", "borofo", "borɔfo", "baako"],
      "2": ["2", "two", "to", "too", "second", "twi", "mmienu", "asante", "akuapem"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "service-select": {
    id: "service-select",
    name: "Service Selection",
    promptKey: "service_select",
    promptText: {
      en: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
      twi: "Sɛ wopɛ telecom anaa Mobile Money dwumadie a mia 1. Sɛ wopɛ sikakorabea dwumadie a mia 2. Sɛ wopɛ sɛ wote bio a mia 9. Sɛ wopɛ sɛ wotwa mu a mia 0.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 for Mobile Money, 2 for Banking",
      twi: "1 ma Mobile Money, 2 ma Sikakorabea",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "language-selection",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "service",
    nextStepMap: {
      "1": "provider-select",
      "2": "unsupported-banking",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "first", "telecom", "mobile money", "momo", "baako"],
      "2": ["2", "two", "to", "too", "second", "banking", "bank", "sikakorabea", "mmienu"],
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "provider-select": {
    id: "provider-select",
    name: "Network Provider Selection",
    promptKey: "provider_select",
    promptText: {
      en: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.",
      twi: "Paw wo network. Sɛ ɛyɛ MTN a mia 1. Sɛ ɛyɛ Telecel a mia 2. Sɛ ɛyɛ AirtelTigo a mia 3. Sɛ wopɛ sɛ wote bio a mia 9. Sɛ wopɛ sɛ wotwa mu a mia 0.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2", "3"],
    optionsDescription: {
      en: "1 for MTN, 2 for Telecel, 3 for AT",
      twi: "1 ma MTN, 2 ma Telecel, 3 ma AT",
    },
    navigation: {
      allowBack: false,
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "network",
    nextStepMap: {
      "1": "action-select",
      "2": "action-select",
      "3": "action-select",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "first", "mtn", "baako"],
      "2": ["2", "two", "to", "too", "second", "telecel", "vodafone", "voda", "mmienu"],
      "3": ["3", "three", "tree", "third", "airteltigo", "airtel", "tigo", "at", "mmiensa", "mmiɛnsa"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "action-select": {
    id: "action-select",
    name: "Action Menu",
    promptKey: "action_select",
    promptText: {
      en: "To send money, press 1. To check balance, press 2. To go back, press 8. To hear this again, press 9. To exit, press 0.",
      twi: "Sɛ wopɛ sɛ womane sika a mia 1. Sɛ wopɛ sɛ wohwɛ wo sika dodow a mia 2. Sɛ wopɛ sɛ wosan kɔ akyi a mia 8. Sɛ wopɛ sɛ wote bio a mia 9. Sɛ wopɛ sɛ wotwa mu a mia 0.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 to Send Money, 2 to Check Balance",
      twi: "1 ma Sika Mane, 2 ma Sika Dodow Hwɛ",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "provider-select",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "action",
    nextStepMap: {
      "1": "enter-recipient",
      "2": "check-balance",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "first", "send money", "send", "transfer", "mane sika", "mane", "soma sika", "baako"],
      "2": ["2", "two", "to", "too", "second", "check balance", "balance", "sika dodow", "hwɛ sika", "mmienu"],
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "enter-recipient": {
    id: "enter-recipient",
    name: "Recipient Phone Number Entry",
    promptKey: "enter_recipient",
    promptText: {
      en: "Please enter the recipient's ten-digit phone number, followed by the hash key.",
      twi: "Yɛsrɛ wo, bɔ obi a woremane no sika no fon nɔmba a ɛyɛ du, na fa hash ka ho.",
    },
    inputType: "phone_number",
    optionsDescription: {
      en: "10-digit Ghana phone number followed by # (e.g. 0553838464#)",
      twi: "Ghana fon nɔmba a ɛyɛ du a hash bata ho (e.g. 0553838464#)",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "action-select",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "recipientPhone",
    resolveNextStep: () => "recipient-verify-choice",
    maxRetries: 2,
    spoken: {
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "recipient-verify-choice": {
    id: "recipient-verify-choice",
    name: "Recipient KYC Verification Choice",
    promptKey: "recipient_verify",
    promptText: {
      en: "To confirm this recipient, press 1. To re-enter the phone number, press 2. To go back, press 8. To exit, press 0.",
      twi: "Sɛ wopene din yi so a mia 1. Sɛ wopɛ sɛ wosesa nɔmba no a mia 2. Sɛ wopɛ sɛ wosan kɔ akyi a mia 8. Sɛ wotwa mu a mia 0.",
    },
    inputType: "confirm",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 to Confirm Recipient, 2 to Re-enter Number",
      twi: "1 ma Pene so, 2 ma Sesa nɔmba no",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "enter-recipient",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "confirm",
    nextStepMap: {
      "1": "enter-amount",
      "2": "enter-recipient",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "confirm", "yes", "pene so", "aane", "correct", "baako"],
      "2": ["2", "two", "to", "too", "re-enter", "change", "edit", "no", "dabi", "sesa", "mmienu"],
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "enter-amount": {
    id: "enter-amount",
    name: "Amount Entry",
    promptKey: "enter_amount",
    promptText: {
      en: "Please enter the amount in Ghana Cedis followed by the hash key. Use the star key for pesewas.",
      twi: "Yɛsrɛ wo, bɔ sika dodow a wopɛ sɛ womane no wɔ Ghana Cedi mu na fa hash ka ho. Fa nsoroma bɔ pesewas.",
    },
    inputType: "amount",
    optionsDescription: {
      en: "Amount in Cedis followed by # (e.g. 50# or 25*50#)",
      twi: "Sika dodow wɔ Cedi mu a hash bata ho (e.g. 50#)",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "recipient-verify-choice",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "amount",
    resolveNextStep: () => "safe-confirmation",
    maxRetries: 2,
    spoken: {
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },

  "safe-confirmation": {
    id: "safe-confirmation",
    name: "Safe Confirmation",
    promptKey: "safe_confirmation",
    promptText: {
      en: "To confirm and send, press 1. To edit amount or cancel, press 2. To exit, press 0.",
      twi: "Sɛ ɛyɛ ampa a mia 1. Sɛ wopɛ sɛ wosesa sika dodow a mia 2. Sɛ wotwa mu a mia 0.",
    },
    inputType: "confirm",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 to Confirm & Authorize, 2 to Edit Amount",
      twi: "1 ma Pene so, 2 ma Sesa sika dodow",
    },
    navigation: {
      allowBack: true,
      getBackTarget: () => "enter-amount",
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "confirm",
    nextStepMap: {
      "1": "safe-outcome",
      "2": "enter-amount",
    },
    maxRetries: 2,
    spoken: {
      "1": ["1", "one", "won", "confirm", "send", "yes", "pene so", "aane", "ɛyɛ ampa", "eye ampa", "baako"],
      "2": ["2", "two", "to", "too", "edit", "change", "cancel", "no", "dabi", "sesa", "mmienu"],
      "8": ["8", "eight", "ate", "back", "san kɔ akyi", "san ko akyi", "nwɔtwe", "nwotwe"],
      "9": ["9", "nine", "repeat", "hear again", "tie bio", "te bio", "nkron"],
      "0": ["0", "zero", "exit", "cancel", "twa mu", "gyae", "hwee"],
    },
  },
};

/**
 * Returns canonical StepDefinition or null if unknown
 */
export function getStepDefinition(stepId: string): StepDefinition | null {
  const normalized = stepId.replace(/^\//, "").replace(/\?.*/, "");
  // Map callback aliases to parent step definition
  if (normalized === "service-choice") return STEP_REGISTRY["service-select"];
  if (normalized === "provider-choice") return STEP_REGISTRY["provider-select"];
  if (normalized === "action-choice") return STEP_REGISTRY["action-select"];
  if (normalized === "verify-recipient") return STEP_REGISTRY["enter-recipient"];
  if (normalized === "verify-amount") return STEP_REGISTRY["enter-amount"];
  if (normalized === "safe-outcome") return STEP_REGISTRY["safe-confirmation"];

  return STEP_REGISTRY[normalized] || null;
}

export interface StepValidationResult {
  valid: boolean;
  isNavigation: boolean;
  navAction?: "back" | "repeat" | "cancel";
  targetStep?: string;
  normalizedValue?: any;
  errorReason?: string;
}

/**
 * Validates keypad DTMF against the step contract before routing
 */
export function validateKeypadInput(
  stepDef: StepDefinition,
  rawDtmf: string,
  language: "en" | "twi" = "en"
): StepValidationResult {
  const clean = rawDtmf.trim().replace(/#+$/, "");

  // 1. Navigation handling
  if (clean === "0" && stepDef.navigation.allowCancel) {
    return { valid: true, isNavigation: true, navAction: "cancel" };
  }
  if (clean === "9" && stepDef.navigation.allowRepeat) {
    return { valid: true, isNavigation: true, navAction: "repeat", targetStep: stepDef.id };
  }
  if (clean === "8" && stepDef.navigation.allowBack) {
    const backTarget = stepDef.navigation.getBackTarget ? stepDef.navigation.getBackTarget(language) : undefined;
    return { valid: true, isNavigation: true, navAction: "back", targetStep: backTarget };
  }

  // 2. Step specific contracts
  switch (stepDef.inputType) {
    case "single_digit":
    case "confirm": {
      if (stepDef.acceptedDigits && stepDef.acceptedDigits.includes(clean)) {
        const next = stepDef.nextStepMap?.[clean] || (stepDef.resolveNextStep ? stepDef.resolveNextStep(clean, language) : undefined);
        return { valid: true, isNavigation: false, normalizedValue: clean, targetStep: next };
      }
      return {
        valid: false,
        isNavigation: false,
        errorReason: `Key '${clean}' is not an option for ${stepDef.name}. Valid choices: ${stepDef.optionsDescription[language]}.`,
      };
    }

    case "phone_number": {
      const phoneRes = validateGhanaPhoneNumber(clean);
      if (phoneRes.valid && phoneRes.normalized) {
        return {
          valid: true,
          isNavigation: false,
          normalizedValue: phoneRes.normalized,
          targetStep: "recipient-verify-choice",
        };
      }
      return {
        valid: false,
        isNavigation: false,
        errorReason: phoneRes.error || `Invalid Ghana phone number: '${clean}'.`,
      };
    }

    case "amount": {
      const amtRes = parseAndValidateAmount(clean);
      if (amtRes.valid && amtRes.amount !== undefined) {
        return {
          valid: true,
          isNavigation: false,
          normalizedValue: amtRes.amount,
          targetStep: "safe-confirmation",
        };
      }
      return {
        valid: false,
        isNavigation: false,
        errorReason: amtRes.error || `Invalid amount entered: '${clean}'.`,
      };
    }

    default:
      return { valid: false, isNavigation: false, errorReason: `Unsupported input format.` };
  }
}
