/**
 * Ɔkwankyerɛfo Pa - Unified Tool Execution Registry (unifiedToolRegistry.ts)
 *
 * Authoritative registry for all tool executions.
 * Validates parameters, risk tiers, client confirmations, and idempotency
 * before invoking services.
 */

import {
  ActionOutput,
  RiskLevel,
  SECURITY_INVARIANTS,
  TransactionDraft,
} from "../core/aiTypes";
import { financialServices } from "../services/financialServices";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";

export interface ToolExecutionRequest {
  tool: string;
  sessionId: string;
  params: Record<string, any>;
  draft?: TransactionDraft | null;
  clientConfirmed?: boolean;
}

export interface ToolExecutionResponse {
  success: boolean;
  tool: string;
  data?: any;
  error?: string;
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
}

export interface ExecutableToolSchema {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  requiredParams: string[];
  handler: (req: ToolExecutionRequest) => Promise<ToolExecutionResponse>;
}

export class UnifiedToolRegistry {
  private tools = new Map<string, ExecutableToolSchema>();
  private executionLog: Array<{ tool: string; timestamp: number; success: boolean }> = [];

  constructor() {
    this.registerCanonicalTools();
  }

  private registerCanonicalTools(): void {
    // 1. Navigation Tools (LOW Risk)
    this.register({
      name: "navigate_home",
      description: "Return caller to the main home menu",
      riskLevel: "LOW",
      requiresConfirmation: false,
      requiredParams: [],
      handler: async () => ({
        success: true,
        tool: "navigate_home",
        data: { targetScreen: "HOME", targetStep: "welcome" },
        source: "demo_simulator",
      }),
    });

    this.register({
      name: "navigate_back",
      description: "Return caller one step back in the navigation stack",
      riskLevel: "LOW",
      requiresConfirmation: false,
      requiredParams: [],
      handler: async () => ({
        success: true,
        tool: "navigate_back",
        data: { action: "NAVIGATE_BACK" },
        source: "demo_simulator",
      }),
    });

    // 2. Informational & KYC Tools (LOW Risk)
    this.register({
      name: "get_balance",
      description: "Query caller's Mobile Money balance",
      riskLevel: "LOW",
      requiresConfirmation: false,
      requiredParams: [],
      handler: async (req) => {
        const phone = req.params.phoneNumber || "0553838464";
        const res = await financialServices.balanceService.getBalance(phone);
        return {
          success: true,
          tool: "get_balance",
          data: res,
          source: res.source,
        };
      },
    });

    this.register({
      name: "lookup_recipient",
      description: "Validate recipient mobile number and query real KYC identity",
      riskLevel: "LOW",
      requiresConfirmation: false,
      requiredParams: ["phoneNumber"],
      handler: async (req) => {
        const res = await financialServices.recipientLookupService.lookup(req.params.phoneNumber);
        if (!res) {
          return {
            success: false,
            tool: "lookup_recipient",
            error: "Recipient phone number was not recognized or has invalid length.",
            source: "demo_simulator",
          };
        }
        return {
          success: true,
          tool: "lookup_recipient",
          data: res,
          source: res.source,
        };
      },
    });

    // 3. Financial Execution Tools (HIGH Risk - Irreversible transfers)
    this.register({
      name: "momo_execute_transfer",
      description: "Execute a mobile money transfer to recipient",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      requiredParams: ["amount", "recipientPhone"],
      handler: async (req) => {
        // Enforce INVARIANT_004: Cannot execute without explicit confirmation
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "momo_execute_transfer",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }

        // Enforce INVARIANT_005: Expired confirmation cannot execute
        if (req.draft && Date.now() > req.draft.expiresAt) {
          return {
            success: false,
            tool: "momo_execute_transfer",
            error: SECURITY_INVARIANTS.INVARIANT_005,
            source: "demo_simulator",
          };
        }

        const refId = req.params.referenceId || `TX_${Date.now()}`;
        unifiedSafetyEngine.markReferenceProcessed(refId);

        const res = await financialServices.transferService.executeTransfer({
          referenceId: refId,
          senderPhone: req.params.senderPhone || "0553838464",
          recipientPhone: req.params.recipientPhone,
          recipientName: req.params.recipientName || "Recipient",
          amount: Number(req.params.amount),
          network: req.params.network || "MTN",
        });

        return {
          success: res.status !== "FAILED",
          tool: "momo_execute_transfer",
          data: res,
          source: res.source,
        };
      },
    });

    // 4. Critical Account Actions (CRITICAL Risk)
    this.register({
      name: "momo_cash_out",
      description: "Authorize cash out from registered agent",
      riskLevel: "CRITICAL",
      requiresConfirmation: true,
      requiredParams: ["amount", "agentCode"],
      handler: async (req) => {
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "momo_cash_out",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }
        return {
          success: true,
          tool: "momo_cash_out",
          data: { status: "PENDING_HANDSET_AUTH", amount: req.params.amount },
          source: "mock_sandbox",
        };
      },
    });
  }

  public register(tool: ExecutableToolSchema): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ExecutableToolSchema | undefined {
    return this.tools.get(name);
  }

  public isApproved(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Executes tool with strict parameter validation and invariant safety gates.
   */
  public async execute(req: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const start = performance.now();

    // INVARIANT_003: Unknown tools never execute
    const schema = this.tools.get(req.tool);
    if (!schema) {
      return {
        success: false,
        tool: req.tool,
        error: `SECURITY_VIOLATION: ${SECURITY_INVARIANTS.INVARIANT_003} ('${req.tool}' is unregistered).`,
        source: "demo_simulator",
      };
    }

    // Validate required parameters
    for (const p of schema.requiredParams) {
      if (req.params[p] === undefined || req.params[p] === null || req.params[p] === "") {
        return {
          success: false,
          tool: req.tool,
          error: `MISSING_PARAMETER: Parameter '${p}' is required to execute '${req.tool}'.`,
          source: "demo_simulator",
        };
      }
    }

    try {
      const response = await schema.handler(req);
      this.executionLog.push({ tool: req.tool, timestamp: Date.now(), success: response.success });
      return response;
    } catch (err: any) {
      // INVARIANT_010: Failed tool execution cannot be reported as success
      return {
        success: false,
        tool: req.tool,
        error: err.message || "Tool execution failed.",
        source: "demo_simulator",
      };
    }
  }

  public getExecutionLog() {
    return [...this.executionLog];
  }
}

export const unifiedToolRegistry = new UnifiedToolRegistry();
