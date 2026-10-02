/**
 * Ɔkwankyerɛfo Pa - Action Types & Risk Mapping
 */

import { RiskLevel } from "../core/aiTypes";

export type ApprovedToolName =
  | "navigate_home"
  | "navigate_momo"
  | "navigate_send_money"
  | "navigate_balance"
  | "select_network"
  | "set_recipient"
  | "set_amount"
  | "request_confirmation"
  | "confirm_transaction"
  | "cancel_transaction"
  | "go_back"
  | "repeat_prompt"
  | "request_help"
  | "end_session";

export interface ToolDefinition {
  name: ApprovedToolName;
  description: string;
  riskLevel: RiskLevel;
  requiredParams: string[];
  requiresConfirmation: boolean;
}

export const APPROVED_TOOLS: Record<ApprovedToolName, ToolDefinition> = {
  navigate_home: {
    name: "navigate_home",
    description: "Navigate to the main home menu",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  navigate_momo: {
    name: "navigate_momo",
    description: "Navigate to Mobile Money services sub-menu",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  navigate_send_money: {
    name: "navigate_send_money",
    description: "Navigate to Send Money flow",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  navigate_balance: {
    name: "navigate_balance",
    description: "Navigate to Balance Inquiry flow",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  select_network: {
    name: "select_network",
    description: "Select carrier network (MTN, Telecel, AT)",
    riskLevel: "MEDIUM",
    requiredParams: ["network"],
    requiresConfirmation: false,
  },
  set_recipient: {
    name: "set_recipient",
    description: "Assign beneficiary phone number or contact name",
    riskLevel: "MEDIUM",
    requiredParams: ["recipientPhone"],
    requiresConfirmation: false,
  },
  set_amount: {
    name: "set_amount",
    description: "Specify the transfer amount in GHS",
    riskLevel: "MEDIUM",
    requiredParams: ["amount"],
    requiresConfirmation: false,
  },
  request_confirmation: {
    name: "request_confirmation",
    description: "Verbal read-back of transfer summary for caller confirmation",
    riskLevel: "LOW",
    requiredParams: ["amount", "recipientName"],
    requiresConfirmation: false,
  },
  confirm_transaction: {
    name: "confirm_transaction",
    description: "Authorizes financial transfer execution to secure auth layer",
    riskLevel: "HIGH",
    requiredParams: ["amount", "recipientPhone"],
    requiresConfirmation: true,
  },
  cancel_transaction: {
    name: "cancel_transaction",
    description: "Aborts the current transaction without moving money",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  go_back: {
    name: "go_back",
    description: "Return to the previous screen or step",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  repeat_prompt: {
    name: "repeat_prompt",
    description: "Re-plays the current voice audio prompt",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  request_help: {
    name: "request_help",
    description: "Offers voice assistance and guidance",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
  end_session: {
    name: "end_session",
    description: "Terminates the voice telephone session",
    riskLevel: "LOW",
    requiredParams: [],
    requiresConfirmation: false,
  },
};
