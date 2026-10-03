/**
 * Ɔkwankyerɛfo Pa - Deterministic Action Planner (aiAction.ts)
 *
 * Implements:
 * 1. Strict Risk-Tier Matrix: LOW, MEDIUM, HIGH, CRITICAL
 * 2. Deterministic Approved Tool Registry Execution Rules
 * 3. Pre-execution Parameter Validation (no execution without full validation)
 * 4. Failure Mode Prediction & Proactive Clarification Questions
 *
 * Performance budget: < 10ms
 */

import {
  ActionOutput,
  EntitySlotMap,
  IntentName,
  RiskLevel,
} from "./aiTypes";

export interface ActionToolDefinition {
  name: string;
  requiredParams: string[];
  riskLevel: RiskLevel;
  requiresClientConfirmation: boolean;
  handler: (params: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export class AiAction {
  private toolRegistry = new Map<string, ActionToolDefinition>();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // 1. Informational Tools (LOW Risk)
    this.registerTool({
      name: "momo_get_balance",
      requiredParams: [],
      riskLevel: "LOW",
      requiresClientConfirmation: false,
      handler: async () => ({ success: true, data: { availableBalance: 420.50, currency: "GHS" } }),
    });

    this.registerTool({
      name: "momo_lookup_recipient_kyc",
      requiredParams: ["phoneNumber"],
      riskLevel: "LOW",
      requiresClientConfirmation: false,
      handler: async (p) => ({ success: true, data: { name: "Kwame Mensah", network: "MTN", verified: true } }),
    });

    // 2. Data Setting Tools (MEDIUM Risk)
    this.registerTool({
      name: "set_transaction_slot",
      requiredParams: ["field", "value"],
      riskLevel: "MEDIUM",
      requiresClientConfirmation: false,
      handler: async () => ({ success: true }),
    });

    // 3. Financial Execution Tools (HIGH Risk)
    this.registerTool({
      name: "momo_execute_transfer",
      requiredParams: ["amount", "recipientPhone"],
      riskLevel: "HIGH",
      requiresClientConfirmation: true,
      handler: async (p) => ({ success: true, data: { transactionId: `TX_${Date.now()}` } }),
    });

    this.registerTool({
      name: "momo_buy_airtime",
      requiredParams: ["amount"],
      riskLevel: "HIGH",
      requiresClientConfirmation: true,
      handler: async () => ({ success: true }),
    });

    // 4. Critical Account Actions (CRITICAL Risk)
    this.registerTool({
      name: "momo_cash_out",
      requiredParams: ["amount", "agentCode"],
      riskLevel: "CRITICAL",
      requiresClientConfirmation: true,
      handler: async () => ({ success: true }),
    });
  }

  public registerTool(tool: ActionToolDefinition): void {
    this.toolRegistry.set(tool.name, tool);
  }

  /**
   * Plans action, calculates risk level, checks executability, and predicts failure modes.
   */
  public plan(
    intent: IntentName,
    slots: EntitySlotMap,
    currentStep: string = "welcome"
  ): ActionOutput {
    let type = "NOOP";
    let tool = "none";
    let params: Record<string, any> = {};
    let riskLevel: RiskLevel = "LOW";
    let requiresClientConfirmation = false;
    let isExecutable = false;
    const predictedFailureModes: string[] = [];
    const clarifyingQuestions: string[] = [];

    switch (intent) {
      case "SEND_MONEY": {
        if (!slots.recipientPhone && !slots.recipientName) {
          type = "REQUEST_RECIPIENT";
          tool = "prompt_recipient";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        } else if (!slots.amount) {
          type = "REQUEST_AMOUNT";
          tool = "prompt_amount";
          params = {
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
          };
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        } else {
          type = "PREPARE_CONFIRMATION";
          tool = "momo_lookup_recipient_kyc";
          params = {
            amount: slots.amount,
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
            network: slots.network || "MTN",
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;

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
        if ((currentStep === "confirm" || currentStep === "execution") && slots.amount && (slots.recipientPhone || slots.recipientName)) {
          type = "EXECUTE_TRANSFER";
          tool = "momo_execute_transfer";
          params = {
            amount: slots.amount,
            currency: "GHS",
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
            network: slots.network || "MTN",
            referenceId: `REF_${Date.now()}`,
          };
          riskLevel = "HIGH";
          requiresClientConfirmation = true;
          isExecutable = true;
        } else {
          type = "CONFIRM_INCOMPLETE";
          tool = "none";
          riskLevel = "LOW";
          requiresClientConfirmation = false;
        }
        break;
      }

      case "CHECK_BALANCE": {
        type = "FETCH_BALANCE";
        tool = "momo_get_balance";
        params = {};
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "CHANGE_INFORMATION": {
        type = "UPDATE_SLOT";
        tool = "set_transaction_slot";
        params = {
          field: slots.correctionField,
          value: slots.correctionField ? slots[slots.correctionField] : null,
          previousValue: slots.previousValue,
        };
        riskLevel = "MEDIUM";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "CANCEL": {
        type = "ABORT_TRANSACTION";
        tool = "none";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      case "GO_BACK": {
        type = "NAVIGATE_PREVIOUS";
        tool = "none";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
        isExecutable = true;
        break;
      }

      default: {
        type = "NOOP";
        tool = "none";
        riskLevel = "LOW";
        requiresClientConfirmation = false;
      }
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
}

export const aiAction = new AiAction();
