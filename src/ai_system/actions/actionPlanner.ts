/**
 * Ɔkwankyerɛfo Pa - Action Planner
 * Maps conversational intent and entities to controlled action requests.
 */

import { ActionOutput, EntitySlotMap, IntentName } from "../core/aiTypes";
import { APPROVED_TOOLS, ApprovedToolName } from "./actionTypes";
import { actionValidator } from "./actionValidator";

export class ActionPlanner {
  public plan(
    intent: IntentName,
    slots: EntitySlotMap,
    currentStep: string = "welcome"
  ): ActionOutput {
    let chosenTool: ApprovedToolName = "navigate_home";
    let params: Record<string, any> = {};

    switch (intent) {
      case "SEND_MONEY":
        if (slots.amount && slots.recipientPhone) {
          chosenTool = "request_confirmation";
          params = {
            amount: slots.amount,
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName || "Recipient",
          };
        } else if (slots.recipientPhone && !slots.amount) {
          chosenTool = "set_recipient";
          params = { recipientPhone: slots.recipientPhone };
        } else {
          chosenTool = "navigate_send_money";
        }
        break;

      case "CONFIRM":
        if (currentStep === "confirm" || (slots.amount && slots.recipientPhone)) {
          chosenTool = "confirm_transaction";
          params = {
            amount: slots.amount,
            currency: "GHS",
            senderPhone: slots.callerPhone,
            recipientPhone: slots.recipientPhone,
            recipientName: slots.recipientName,
            network: slots.network || "MTN",
            referenceId: `REF_${Date.now()}`,
          };
        } else {
          chosenTool = "request_confirmation";
        }
        break;

      case "CANCEL":
        chosenTool = "cancel_transaction";
        break;

      case "CHECK_BALANCE":
        chosenTool = "navigate_balance";
        break;

      case "GO_BACK":
        chosenTool = "go_back";
        break;

      case "GO_HOME":
        chosenTool = "navigate_home";
        break;

      case "REPEAT":
        chosenTool = "repeat_prompt";
        break;

      case "HELP":
        chosenTool = "request_help";
        break;

      case "CHANGE_INFORMATION":
        if (slots.amount) {
          chosenTool = "set_amount";
          params = { amount: slots.amount };
        } else if (slots.recipientPhone) {
          chosenTool = "set_recipient";
          params = { recipientPhone: slots.recipientPhone };
        } else if (slots.network) {
          chosenTool = "select_network";
          params = { network: slots.network };
        }
        break;

      default:
        chosenTool = "repeat_prompt";
        break;
    }

    const toolDef = APPROVED_TOOLS[chosenTool];
    const validation = actionValidator.validate(chosenTool, params);

    return {
      type: chosenTool.toUpperCase(),
      tool: chosenTool,
      params,
      riskLevel: toolDef.riskLevel,
      requiresClientConfirmation: toolDef.requiresConfirmation || !validation.isValid,
    };
  }
}

export const actionPlanner = new ActionPlanner();
