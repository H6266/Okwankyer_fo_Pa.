/**
 * Ɔkwankyerɛfo Pa - Action Validator
 * Validates action preconditions and enforces zero-PIN protection.
 */

import { ApprovedToolName, APPROVED_TOOLS } from "./actionTypes";
import { ActionOutput } from "../core/aiTypes";

export interface ActionValidationResult {
  isValid: boolean;
  error?: string;
}

export class ActionValidator {
  public validate(toolName: string, params: Record<string, any>): ActionValidationResult {
    // 1. Check if tool is in approved registry
    if (!APPROVED_TOOLS[toolName as ApprovedToolName]) {
      return {
        isValid: false,
        error: `Unapproved tool request: '${toolName}'. Only registered tools are permitted.`,
      };
    }

    const toolDef = APPROVED_TOOLS[toolName as ApprovedToolName];

    // 2. Check for required parameters
    for (const req of toolDef.requiredParams) {
      if (params[req] === undefined || params[req] === null || params[req] === "") {
        return {
          isValid: false,
          error: `Missing required parameter '${req}' for action '${toolName}'.`,
        };
      }
    }

    // 3. Financial invariant checks
    if (toolName === "set_amount" || toolName === "confirm_transaction") {
      const amt = Number(params.amount);
      if (isNaN(amt) || amt <= 0) {
        return { isValid: false, error: "Amount must be a positive number greater than 0." };
      }
      if (amt > 5000) {
        return { isValid: false, error: "Amount exceeds single transaction ceiling of 5,000 GHS." };
      }
    }

    // 4. Critical: Zero-PIN enforcement
    if (params.pin || params.momoPin || params.secret) {
      return {
        isValid: false,
        error: "ZERO-PIN VIOLATION: Financial credentials must never be passed through action parameters.",
      };
    }

    return { isValid: true };
  }
}

export const actionValidator = new ActionValidator();
