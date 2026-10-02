/**
 * Ɔkwankyerɛfo Pa - Controlled Tool Registry
 * Ensures only safe, pre-registered tools can be requested by the AI engine.
 */

import { APPROVED_TOOLS, ApprovedToolName, ToolDefinition } from "./actionTypes";

export class ToolRegistry {
  public isApproved(toolName: string): toolName is ApprovedToolName {
    return Object.prototype.hasOwnProperty.call(APPROVED_TOOLS, toolName);
  }

  public getTool(toolName: ApprovedToolName): ToolDefinition | undefined {
    return APPROVED_TOOLS[toolName];
  }

  public getAllApprovedTools(): ToolDefinition[] {
    return Object.values(APPROVED_TOOLS);
  }
}

export const toolRegistry = new ToolRegistry();
