/**
 * Ɔkwankyerɛfo Pa - Deterministic Action Planner (aiAction.ts)
 *
 * Implements:
 * 1. Strict Risk-Tier Matrix: LOW, MEDIUM, HIGH, CRITICAL
 * 2. Exclusively plans tools registered in the authoritative UnifiedToolRegistry
 * 3. Pre-execution Parameter Validation (no execution without required slots)
 * 4. Proactive Failure Prediction (limits, invalid phone numbers)
 * 5. High-Risk Financial Confirmation Gates
 */

import {
  ActionOutput,
  ActionPlan,
  CanonicalToolName,
  EntitySlotMap,
  IntentName,
  RiskLevel,
} from "./aiTypes";
import { unifiedToolRegistry } from "../actions/unifiedToolRegistry";

export class AiActionPlanner {
  /**
   * Plans action, calculates risk level, checks executability, and predicts failure modes.
   * Guarantees that every planned tool exists in the authoritative UnifiedToolRegistry.
   */
  public plan(
    intent: IntentName,
    slots: EntitySlotMap,
    currentStep: string = "welcome",
    hasConfirmableDraft: boolean = false,
  ): ActionOutput {
    let type = "NOOP";
    let tool: CanonicalToolName = "none";
    let params: Record<string, any> = {};
    let riskLevel: RiskLevel = "LOW";
    let requiresClientConfirmation = false;
    let isExecutable = false;
    const predictedFailureModes: string[] = [];
    const clarifyingQuestions: string[] = [];

    switch (intent) {
      case "SEND_MONEY": {
        if (!slots.recipientPhone) {
          type = "REQUEST_RECIPIENT";
          tool = "prepare_transfer";
          clarifyingQuestions.push(slots.recipientName
            ? `Please provide ${slots.recipientName}'s mobile number.`
            : "Who should receive the transfer? Please provide their mobile number.");
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        } else if (!slots.amount) {
          type = "REQUEST_AMOUNT";
          tool = "prepare_transfer";
          params = {
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
          };
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        } else if (!slots.network) {
          type = "REQUEST_NETWORK";
          tool = "none";
          clarifyingQuestions.push("Which mobile money network should receive this transfer?");
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        } else {
          type = "PREPARE_CONFIRMATION";
          tool = "lookup_recipient";
          params = {
            amount: slots.amount,
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
            phoneNumber: slots.recipientPhone,
            network: slots.network,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = false; // Never auto-execute without explicit client confirmation

          // Predict failure modes proactively
          if (slots.amount && slots.amount > 5000) {
            predictedFailureModes.push("AMOUNT_EXCEEDS_DAILY_LIMIT");
            clarifyingQuestions.push("This amount is over the standard daily limit. Do you have tier-3 KYC approval?");
          }
          if (slots.recipientPhone && slots.recipientPhone.length !== 10) {
            predictedFailureModes.push("INVALID_PHONE_DIGIT_LENGTH");
            clarifyingQuestions.push("The phone number must be exactly 10 digits starting with 0.");
          }
        }
        break;
      }

      case "CONFIRM": {
        if (!hasConfirmableDraft) {
          type = "CONFIRM_INCOMPLETE";
          tool = "none";
          clarifyingQuestions.push("There is no transaction awaiting confirmation.");
        } else if (!slots.recipientPhone || !slots.amount || !slots.network) {
          type = "CONFIRM_INCOMPLETE";
          tool = "none";
          clarifyingQuestions.push(!slots.recipientPhone
            ? "A recipient mobile number is required."
            : !slots.amount
            ? "A transfer amount is required."
            : "A mobile money network must be selected.");
        } else if (currentStep === "confirm" || currentStep === "execution") {
          type = "EXECUTE_TRANSFER";
          tool = "momo_execute_transfer";
          params = {
            amount: slots.amount,
            currency: "GHS",
            senderPhone: slots.callerPhone || slots.senderPhone,
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
            network: slots.network,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = Boolean(slots.callerPhone || slots.senderPhone); // Caller identity must come from the authenticated telephony context.
          if (!isExecutable) {
            type = "CALLER_ID_UNAVAILABLE";
            tool = "none";
            clarifyingQuestions.push("I could not verify the caller's mobile number for this transfer.");
          }
        } else {
          type = "CONFIRM_INCOMPLETE";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        }
        break;
      }

      case "CHECK_BALANCE": {
        if (!slots.recipientPhone && !slots.callerPhone) {
          type = "REQUEST_BALANCE_PHONE";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else {
          type = "FETCH_BALANCE";
          tool = "get_balance";
          params = { phoneNumber: (slots.recipientPhone || slots.callerPhone)! };
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = true;
        }
        break;
      }

      case "BUY_AIRTIME": {
        if (!slots.amount) {
          type = "REQUEST_AIRTIME_AMOUNT";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else if (!slots.recipientPhone && !slots.callerPhone) {
          type = "REQUEST_AIRTIME_PHONE";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else if (!slots.network) {
          type = "REQUEST_AIRTIME_NETWORK";
          tool = "none";
          clarifyingQuestions.push("Which mobile money network should receive this airtime top-up?");
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else {
          type = "EXECUTE_AIRTIME";
          tool = "buy_airtime";
          params = {
            amount: slots.amount,
            phoneNumber: (slots.recipientPhone || slots.callerPhone)!,
            network: slots.network,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = currentStep === "confirm";
        }
        break;
      }

      case "BUY_DATA": {
        if (!slots.amount || (!slots.recipientPhone && !slots.callerPhone) || !slots.network) {
          type = "REQUEST_DATA_PARAMS";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
          if (slots.amount && (slots.recipientPhone || slots.callerPhone) && !slots.network) {
            clarifyingQuestions.push("Which mobile money network should receive this data bundle?");
          }
        } else {
          type = "EXECUTE_DATA";
          tool = "buy_data";
          params = {
            amount: slots.amount,
            phoneNumber: (slots.recipientPhone || slots.callerPhone)!,
            network: slots.network,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = currentStep === "confirm";
        }
        break;
      }

      case "PAY_BILL": {
        if (!slots.biller || !slots.accountNumber || !slots.amount) {
          type = "REQUEST_BILL_PARAMS";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else {
          type = "EXECUTE_BILL";
          tool = "pay_bill";
          params = {
            biller: slots.biller,
            accountNumber: slots.accountNumber,
            amount: slots.amount,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = currentStep === "confirm";
        }
        break;
      }

      case "CASH_OUT": {
        if (!slots.amount || !slots.accountNumber) {
          type = "REQUEST_CASH_OUT_PARAMS";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
          isExecutable = false;
        } else {
          type = "EXECUTE_CASH_OUT";
          tool = "cash_out";
          params = {
            amount: slots.amount,
            agentCode: slots.accountNumber,
          };
          riskLevel = "CRITICAL";
          requiresClientConfirmation = true;
          isExecutable = currentStep === "confirm";
        }
        break;
      }

      case "GO_BACK": {
        type = "NAVIGATE_BACK";
        tool = "navigate_back";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "GO_HOME": {
        type = "NAVIGATE_HOME";
        tool = "navigate_home";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "CANCEL": {
        type = "CANCEL_SESSION";
        tool = "cancel_transaction";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "CHANGE_INFORMATION": {
        type = "UPDATE_SLOT";
        tool = "prepare_transfer";
        params = {
          field: slots.correctionField,
          value: slots[slots.correctionField || ""],
          previousValue: slots.previousValue,
        };
        riskLevel = "MEDIUM";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      default: {
        type = "NOOP";
        tool = "none";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = false;
      }
    }

    // Compile-time & runtime contract:
    // If tool !== "none", verify it exists in the authoritative unifiedToolRegistry
    if (tool !== "none" && !unifiedToolRegistry.hasTool(tool)) {
      throw new Error(`ACTION_PLANNER_CONTRACT_VIOLATION: Planner produced unregistered tool '${tool}'.`);
    }

    return {
      type,
      tool,
      params,
      riskLevel,
      requiresClientConfirmation,
      isExecutable,
      predictedFailureModes: predictedFailureModes.length > 0 ? predictedFailureModes : undefined,
      clarifyingQuestions: clarifyingQuestions.length > 0 ? clarifyingQuestions : undefined,
    };
  }

  /**
   * Returns a strongly-typed ActionPlan structure matching Phase 5.
   */
  public createActionPlan(
    intent: IntentName,
    slots: EntitySlotMap,
    currentStep: string = "welcome"
  ): ActionPlan {
    const output = this.plan(intent, slots, currentStep);
    return {
      actionType: output.type,
      toolName: output.tool as CanonicalToolName,
      params: output.params,
      riskLevel: output.riskLevel,
      requiresConfirmation: output.requiresClientConfirmation,
      reason: `Action planned for intent ${intent} at step ${currentStep}`,
      idempotencyKey: output.params.referenceId,
      isExecutable: output.isExecutable,
    };
  }
}

export const aiAction = new AiActionPlanner();
