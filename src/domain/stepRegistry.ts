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
import { SUPPORTED_TRANSFER_NETWORKS } from "./serviceCapabilities";

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
      "2": "service-select",
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
      "2": "service-select",
    },
  },

  "service-select": {
    id: "service-select",
    name: "Service Selection",
    promptKey: "supported_service_select",
    promptText: {
      en: "For Mobile Money services, press 1. For banking services, press 2. Press 9 to hear this again, or press 0 to exit.",
      twi: "Sɛ wopɛ mobile money services a, mia 1. Sɛ wopɛ banking services a, mia 2. Mia 9 na mate bio, anaasɛ mia 0 na woapue.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2"],
    optionsDescription: {
      en: "1 for Mobile Money, 2 for Banking (Unavailable), 9 to repeat, 0 to exit",
      twi: "1 ma Mobile Money, 2 ma Sikakorabea (Banking), 9 na tie bio, 0 na woapue",
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
  },

  "provider-select": {
    id: "provider-select",
    name: "Network Provider Selection",
    promptKey: "mtn_network_select",
    promptText: {
      en: "For MTN Mobile Money, press 1. For Telecel Cash, press 2. Press 9 to hear this again, or 0 to exit.",
      twi: "Sɛ wo network yɛ MTN a, mia 1. Sɛ ɛyɛ Telecel Cash a, mia 2. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
    },
    inputType: "single_digit",
    acceptedDigits: SUPPORTED_TRANSFER_NETWORKS.map((network) => network === "MTN" ? "1" : network === "Telecel" ? "2" : "3"),
    optionsDescription: {
      en: "1 for MTN, 2 for Telecel Cash",
      twi: "1 ma MTN, 2 ma Telecel Cash",
    },
    navigation: {
      allowBack: false,
      allowRepeat: true,
      allowCancel: true,
    },
    collects: "network",
    nextStepMap: Object.fromEntries(SUPPORTED_TRANSFER_NETWORKS.map((network) => [
      network === "MTN" ? "1" : network === "Telecel" ? "2" : "3",
      "action-select",
    ])),
  },

  "action-select": {
    id: "action-select",
    name: "Action Menu",
    promptKey: "send_money_menu",
    promptText: {
      en: "To send money, press 1. To go back, press 8. To hear this again, press 9. To exit, press 0.",
      twi: "Sɛ wopɛ sɛ womane sika a mia 1. Sɛ wopɛ sɛ wosan kɔ akyi a mia 8. Sɛ wopɛ sɛ wote bio a mia 9. Sɛ wopɛ sɛ wotwa mu a mia 0.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1"],
    optionsDescription: {
      en: "1 to Send Money",
      twi: "1 ma Sika Mane",
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
  },

  "exit-grace-period": {
    id: "exit-grace-period",
    name: "Exit Grace Period (7s Wait)",
    promptKey: "exit_grace_period",
    promptText: {
      en: "Transaction ended. Waiting 7 seconds before exit. Press any key to start a new transaction.",
      twi: "Yɛatwa mu. Frɛ no bɛtwa mu wɔ sɛkɛnd 7 mu. Sɛ wopɛ sɛ wohyɛ aseɛ foforɔ a, mia key biara.",
    },
    inputType: "single_digit",
    acceptedDigits: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"],
    optionsDescription: {
      en: "Press any key to start a new transaction, or wait 7 seconds to exit",
      twi: "Mia key biara na fa hyɛ aseɛ foforɔ, anaa twɛn sɛkɛnd 7 na gyae",
    },
    navigation: {
      allowBack: false,
      allowRepeat: false,
      allowCancel: true,
    },
    collects: "action",
    resolveNextStep: () => "enter-recipient",
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
