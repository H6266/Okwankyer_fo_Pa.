/**
 * Ɔkwankyerɛfo Pa - Process Runner (processRunner.ts)
 * 
 * Executes the chosen process from the flow planner:
 * - collect_slot: returns prompt for the missing slot (recipient, amount, etc.)
 * - verify_recipient: queries RecipientResolver (mockable in tests), handles >800ms hold line, never invents names
 * - confirm_transaction: reads back verified name and amount for explicit confirmation
 * - initiate_payment: zero-PIN prompt handoff to caller's handset
 * - go_back: navigation back
 * - cancel: clean transaction cancellation
 * - select_language / select_service / select_provider / select_action: deterministic menu steps
 */

import { FlowProcess, FlowPlannerSession } from "./flowPlanner";
import { RecipientResolver, recipientResolver as defaultRecipientResolver } from "../providers/recipient/RecipientResolver";

export interface ProcessRunnerParams {
  process: FlowProcess;
  session: FlowPlannerSession;
  language?: "en" | "twi" | string;
  targetSlot?: string;
  recipientResolver?: RecipientResolver;
  onHold?: (holdNotice: { replyKey: string; replyText: string }) => void;
  holdThresholdMs?: number; // default 800ms
}

export interface ProcessRunnerResult {
  process: FlowProcess;
  replyKey: string;
  replyText: string;
  language: "en" | "twi";
  data: Record<string, any>;
  sessionUpdates?: Partial<FlowPlannerSession>;
}

export async function runProcess(params: ProcessRunnerParams): Promise<ProcessRunnerResult> {
  const {
    process,
    session,
    targetSlot,
    recipientResolver = defaultRecipientResolver,
    onHold,
    holdThresholdMs = 800,
  } = params;

  const lang: "en" | "twi" =
    params.language === "twi" ||
    params.language?.startsWith("tw") ||
    params.language?.startsWith("ak") ||
    session.language === "twi"
      ? "twi"
      : "en";

  switch (process) {
    case "collect_slot": {
      const slot = targetSlot || (session.recipientPhone ? "amount" : "recipient");
      if (slot === "amount") {
        return {
          process,
          replyKey: "enter_amount",
          replyText:
            lang === "twi"
              ? "Yɛsrɛ wo, bɔ sika dodoɔ a wopɛ sɛ womane no, na fa hash ka ho."
              : "Please enter the amount you want to send, followed by hash.",
          language: lang,
          data: { targetSlot: "amount" },
        };
      }
      if (slot === "recipient") {
        const isRetry = Boolean(session.recipientLookupFailed);
        return {
          process,
          replyKey: isRetry ? "recipient_lookup_failed" : "enter_recipient",
          replyText: isRetry
            ? lang === "twi"
              ? "Yɛantumi anhu fon nɔmba no mu deɛ. Yɛsrɛ wo hwɛ nɔmba no yie na bɔ bio."
              : "We could not verify that recipient number. Please check the number and try entering it again."
            : lang === "twi"
            ? "Yɛsrɛ wo, bɔ fon nɔmba a ɛyɛ du a woremane no sika no, na fa hash ka ho."
            : "Please enter the 10-digit number you want to send money to, followed by hash.",
          language: lang,
          data: { targetSlot: "recipient", isRetry },
        };
      }
      return {
        process,
        replyKey: "welcome",
        replyText:
          lang === "twi"
            ? "Akwaaba kɔ Ɔkwankyerɛfo Pa. Dɛn na wopɛ sɛ woyɛ nnɛ?"
            : "Welcome to Ɔkwankyerɛfo Pa. What would you like to do today?",
        language: lang,
        data: { targetSlot: slot },
      };
    }

    case "verify_recipient": {
      const phone = session.recipientPhone || "";
      let holdTriggered = false;

      // Start hold timer if lookup takes > 800ms
      const holdTimer = setTimeout(() => {
        holdTriggered = true;
        const holdNotice = {
          replyKey: "verify_hold",
          replyText:
            lang === "twi"
              ? "Yɛsrɛ wo twɛn kakra berɛ a yɛrehwɛ nɔmba no mu."
              : "Please hold on while we verify the recipient number.",
        };
        if (onHold) {
          onHold(holdNotice);
        }
      }, holdThresholdMs);

      let lookupResult;
      try {
        lookupResult = await recipientResolver.resolve(phone);
      } catch (err: any) {
        lookupResult = {
          valid: false,
          phoneNumber: phone,
          normalizedPhone: "",
          name: null,
          network: "MTN" as const,
          verified: false,
          source: "UNRESOLVED" as const,
          error: err.message || "Lookup service error",
        };
      } finally {
        clearTimeout(holdTimer);
      }

      // If lookup verified a registered subscriber name:
      if (lookupResult.valid && lookupResult.name) {
        const verifiedName = lookupResult.name;
        const amount = session.amount || 0;
        const replyText =
          lang === "twi"
            ? `Worebɛmane sika cedis ${amount} akɔma ${verifiedName}. Wo gyedi so sɛ womane saa sika yi?`
            : `You are about to send ${amount} cedis to ${verifiedName}. Are you sure you want to send this money?`;

        return {
          process,
          replyKey: "confirm_transaction",
          replyText,
          language: lang,
          data: {
            verified: true,
            recipientName: verifiedName,
            recipientPhone: phone,
            amount,
            network: lookupResult.network,
            holdPlayed: holdTriggered,
          },
          sessionUpdates: {
            recipientName: verifiedName,
            recipientVerified: true,
            recipientLookupFailed: false,
            pendingConfirmation: true,
          },
        };
      }

      // Lookup failed or subscriber unverified: NEVER invent a name!
      return {
        process,
        replyKey: "recipient_lookup_failed",
        replyText:
          lang === "twi"
            ? "Yɛantumi anhu fon nɔmba no mu deɛ. Yɛsrɛ wo hwɛ nɔmba no yie na bɔ bio."
            : "We could not verify that recipient number. Please check the number and try entering it again.",
        language: lang,
        data: {
          verified: false,
          error: lookupResult.error || lookupResult.warning || "Subscriber not found in registry",
          holdPlayed: holdTriggered,
        },
        sessionUpdates: {
          recipientName: null,
          recipientVerified: false,
          recipientLookupFailed: true,
          pendingConfirmation: false,
        },
      };
    }

    case "confirm_transaction": {
      const name = session.recipientName || "Recipient";
      const amount = session.amount || 0;
      const replyText =
        lang === "twi"
          ? `Worebɛmane sika cedis ${amount} akɔma ${name}. Wo gyedi so sɛ womane saa sika yi?`
          : `You are about to send ${amount} cedis to ${name}. Are you sure you want to send this money?`;

      return {
        process,
        replyKey: "confirm_transaction",
        replyText,
        language: lang,
        data: {
          recipientName: name,
          recipientPhone: session.recipientPhone,
          amount,
        },
        sessionUpdates: {
          pendingConfirmation: true,
        },
      };
    }

    case "initiate_payment": {
      return {
        process,
        replyKey: "pin_handoff",
        replyText:
          lang === "twi"
            ? "Yɛsrɛ wo, hwɛ wo fon so ma bɔtɔn no mbra na pene so. Mma obiara wo PIN nɔmba."
            : "Please check your phone for an approval prompt to authorize this payment. Do not share your PIN with anyone.",
        language: lang,
        data: {
          status: "initiated",
          recipientName: session.recipientName,
          recipientPhone: session.recipientPhone,
          amount: session.amount,
        },
        sessionUpdates: {
          confirmed: true,
          pendingConfirmation: false,
        },
      };
    }

    case "go_back": {
      return {
        process,
        replyKey: "go_back",
        replyText:
          lang === "twi"
            ? "Yɛresan akɔ akyi kakra."
            : "Going back to the previous step.",
        language: lang,
        data: {},
      };
    }

    case "cancel": {
      return {
        process,
        replyKey: "call_cancelled",
        replyText:
          lang === "twi"
            ? "Dwumadie no atwa mu. Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa dii dwuma."
            : "Transaction cancelled. Thank you for using Ɔkwankyerɛfo Pa.",
        language: lang,
        data: { cancelled: true },
        sessionUpdates: {
          pendingConfirmation: false,
          confirmed: false,
        },
      };
    }

    case "select_language": {
      return {
        process,
        replyKey: "welcome",
        replyText: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.",
        language: lang,
        data: {},
      };
    }

    case "select_service": {
      return {
        process,
        replyKey: "service_select",
        replyText:
          lang === "twi"
            ? "Sɛ wopɛ sɛ wode fon anaa sika dwumadie a, mia baako. Sɛ wopɛ sikakorabea a, mia mmienu."
            : "For telecom or mobile money services, press 1. For banking services, press 2.",
        language: lang,
        data: {},
      };
    }

    case "select_provider": {
      return {
        process,
        replyKey: "provider_select",
        replyText:
          lang === "twi"
            ? "Fa w'ahosuo si so. MTN, mia 1. Telecel, mia 2. AirtelTigo, mia 3."
            : "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3.",
        language: lang,
        data: {},
      };
    }

    case "select_action": {
      return {
        process,
        replyKey: "action_select",
        replyText:
          lang === "twi"
            ? "Sɛ wopɛ sɛ womane sika a, mia 1. Sɛ wopɛ sɛ wohwɛ wo sika a, mia 5."
            : "To send money, press 1. To check account, press 5.",
        language: lang,
        data: {},
      };
    }

    default: {
      return {
        process,
        replyKey: "welcome",
        replyText: "Please choose an option to continue.",
        language: lang,
        data: {},
      };
    }
  }
}
