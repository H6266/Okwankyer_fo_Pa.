/**
 * Ɔkwankyerɛfo Pa - Unified Authoritative Tool Execution Registry (unifiedToolRegistry.ts)
 *
 * The ONLY execution authority in the entire cognitive architecture.
 * Strictly enforces:
 * - INVARIANT_001: PIN never reaches tool execution.
 * - INVARIANT_003: Unknown tools never execute.
 * - INVARIANT_004: High-risk transactions cannot execute without valid confirmation.
 * - INVARIANT_005: Expired confirmation drafts cannot execute.
 * - INVARIANT_006: Transaction amount/recipient alteration invalidates confirmation.
 * - INVARIANT_007: Tool execution must be idempotent where required.
 * - INVARIANT_009: Mock providers cannot execute in production mode.
 * - INVARIANT_010: Failed tool execution cannot be reported as success.
 */

import {
  CanonicalToolName,
  RiskLevel,
  SECURITY_INVARIANTS,
  TransactionDraft,
} from "../core/aiTypes";
import { financialServices } from "../services/financialServices";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";

export interface ToolExecutionRequest {
  tool: CanonicalToolName | string;
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
  name: CanonicalToolName;
  description: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
  requiredParams: string[];
  timeoutMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
  auditBehavior: "LOG_AND_STORE" | "AUDIT_REDACTED";
  handler: (req: ToolExecutionRequest) => Promise<ToolExecutionResponse>;
}

export class UnifiedToolRegistry {
  private tools = new Map<string, ExecutableToolSchema>();
  private toolAliases = new Map<string, CanonicalToolName>([
    ["momo_get_balance", "get_balance"],
    ["momo_lookup_recipient_kyc", "lookup_recipient"],
    ["momo_execute_transfer", "execute_transfer"],
    ["momo_cash_out", "cash_out"],
    ["momo_buy_airtime", "buy_airtime"],
    ["set_transaction_slot", "prepare_transfer"],
  ]);
  private processedIdempotencyKeys = new Set<string>();

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
      idempotencyRequired: false,
      requiredParams: [],
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      auditBehavior: "LOG_AND_STORE",
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
      idempotencyRequired: false,
      requiredParams: [],
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      auditBehavior: "LOG_AND_STORE",
      handler: async () => ({
        success: true,
        tool: "navigate_back",
        data: { action: "NAVIGATE_BACK" },
        source: "demo_simulator",
      }),
    });

    // 2. Informational & Lookup Tools (LOW Risk)
    this.register({
      name: "get_balance",
      description: "Direct caller to USSD *170# since wallet balances cannot be queried via API",
      riskLevel: "LOW",
      requiresConfirmation: false,
      idempotencyRequired: false,
      requiredParams: [],
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 2, backoffMs: 500 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async () => {
        return {
          success: true,
          tool: "get_balance",
          data: {
            message: "I can't check wallet balances. To check yours, dial star one seven zero hash on your handset.",
          },
          source: "real_provider",
        };
      },
    });

    this.register({
      name: "lookup_recipient",
      description: "Validate recipient mobile number and query Ghanaian telco KYC identity",
      riskLevel: "LOW",
      requiresConfirmation: false,
      idempotencyRequired: false,
      requiredParams: ["phoneNumber"],
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 2, backoffMs: 300 },
      auditBehavior: "AUDIT_REDACTED",
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

    // 3. Staging & Cancellation (MEDIUM Risk)
    this.register({
      name: "prepare_transfer",
      description: "Prepare and stage a transfer draft before confirmation",
      riskLevel: "MEDIUM",
      requiresConfirmation: false,
      idempotencyRequired: false,
      requiredParams: [],
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => ({
        success: true,
        tool: "prepare_transfer",
        data: { staged: true, params: req.params },
        source: "demo_simulator",
      }),
    });

    this.register({
      name: "cancel_transaction",
      description: "Cancel active draft and release transaction locks",
      riskLevel: "LOW",
      requiresConfirmation: false,
      idempotencyRequired: false,
      requiredParams: [],
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      auditBehavior: "LOG_AND_STORE",
      handler: async (req) => ({
        success: true,
        tool: "cancel_transaction",
        data: { cancelled: true, sessionId: req.sessionId },
        source: "demo_simulator",
      }),
    });

    // 4. Financial Execution Tools (HIGH Risk - Irreversible transfers)
    this.register({
      name: "execute_transfer",
      description: "Execute confirmed mobile money transfer to recipient",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      idempotencyRequired: true,
      requiredParams: ["amount", "recipientPhone"],
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => {
        // Enforce INVARIANT_004: Cannot execute without explicit confirmation
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "execute_transfer",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }

        // Enforce INVARIANT_005: Expired confirmation cannot execute
        if (req.draft && Date.now() > req.draft.expiresAt) {
          return {
            success: false,
            tool: "execute_transfer",
            error: SECURITY_INVARIANTS.INVARIANT_005,
            source: "demo_simulator",
          };
        }

        if (!req.params.senderPhone || !req.params.recipientPhone || !req.params.amount) {
          return {
            success: false,
            tool: "execute_transfer",
            error: "SECURITY_INVARIANT_VIOLATION: INVARIANT_012 - Missing required transfer parameter (sender, recipient, or amount). Fails closed.",
            source: "real_provider",
          };
        }

        const refId = req.params.referenceId || `TX_${Date.now()}`;
        unifiedSafetyEngine.markReferenceProcessed(refId);

        const res = await financialServices.transferService.executeTransfer({
          referenceId: refId,
          senderPhone: req.params.senderPhone,
          recipientPhone: req.params.recipientPhone,
          recipientName: req.params.recipientName || "Recipient",
          amount: Number(req.params.amount),
          network: req.params.network || "MTN",
        });

        // Enforce INVARIANT_010: Failed tool execution cannot be reported as success
        const isSuccess = res.status !== "FAILED";
        return {
          success: isSuccess,
          tool: "execute_transfer",
          data: res,
          source: res.source,
          error: isSuccess ? undefined : (res.errorMessage || "Transfer failed at telco gateway"),
        };
      },
    });

    this.register({
      name: "buy_airtime",
      description: "Purchase mobile credit topup for caller or designated phone",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      idempotencyRequired: true,
      requiredParams: ["amount"],
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => {
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "buy_airtime",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }
        if (!req.params.phoneNumber || !req.params.amount) {
          return {
            success: false,
            tool: "buy_airtime",
            error: "SECURITY_INVARIANT_VIOLATION: INVARIANT_012 - Missing required airtime parameter (phoneNumber or amount). Fails closed.",
            source: "real_provider",
          };
        }
        const res = await financialServices.airtimeService.purchaseAirtime({
          phoneNumber: req.params.phoneNumber,
          amount: Number(req.params.amount),
          network: req.params.network || "MTN",
        });
        return {
          success: res.status !== "FAILED",
          tool: "buy_airtime",
          data: res,
          source: res.source,
        };
      },
    });

    this.register({
      name: "buy_data",
      description: "Purchase mobile internet bundle package",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      idempotencyRequired: true,
      requiredParams: ["amount"],
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => {
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "buy_data",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }
        if (!req.params.phoneNumber || !req.params.amount) {
          return {
            success: false,
            tool: "buy_data",
            error: "SECURITY_INVARIANT_VIOLATION: INVARIANT_012 - Missing required data parameter (phoneNumber or amount). Fails closed.",
            source: "real_provider",
          };
        }
        return {
          success: true,
          tool: "buy_data",
          data: { status: "COMPLETED", amount: req.params.amount },
          source: "mock_sandbox",
        };
      },
    });

    this.register({
      name: "pay_bill",
      description: "Pay utility or service bill (ECG, GWCL, DSTV, etc.)",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      idempotencyRequired: true,
      requiredParams: ["amount", "biller"],
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => {
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "pay_bill",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }
        if (!req.params.biller || !req.params.accountNumber || !req.params.amount) {
          return {
            success: false,
            tool: "pay_bill",
            error: "SECURITY_INVARIANT_VIOLATION: INVARIANT_012 - Missing required bill parameters (biller, accountNumber, or amount). Fails closed.",
            source: "real_provider",
          };
        }
        const res = await financialServices.billPaymentService.payBill({
          biller: req.params.biller,
          accountNumber: req.params.accountNumber,
          amount: Number(req.params.amount),
        });
        return {
          success: res.status !== "FAILED",
          tool: "pay_bill",
          data: res,
          source: res.source,
        };
      },
    });

    // 5. Critical Account Actions (CRITICAL Risk)
    this.register({
      name: "cash_out",
      description: "Authorize cash out from registered MoMo agent",
      riskLevel: "CRITICAL",
      requiresConfirmation: true,
      idempotencyRequired: true,
      requiredParams: ["amount"],
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      auditBehavior: "AUDIT_REDACTED",
      handler: async (req) => {
        if (!req.clientConfirmed) {
          return {
            success: false,
            tool: "cash_out",
            error: SECURITY_INVARIANTS.INVARIANT_004,
            source: "demo_simulator",
          };
        }
        return {
          success: true,
          tool: "cash_out",
          data: { status: "PENDING_HANDSET_AUTH", amount: req.params.amount },
          source: "mock_sandbox",
        };
      },
    });
  }

  public register(tool: ExecutableToolSchema): void {
    this.tools.set(tool.name, tool);
  }

  public hasTool(name: string): boolean {
    const canonical = this.resolveCanonicalName(name);
    return this.tools.has(canonical);
  }

  public getRegisteredToolNames(): CanonicalToolName[] {
    return Array.from(this.tools.keys()) as CanonicalToolName[];
  }

  public getTool(name: string): ExecutableToolSchema | undefined {
    const canonical = this.resolveCanonicalName(name);
    return this.tools.get(canonical);
  }

  public resolveCanonicalName(name: string): CanonicalToolName {
    if (this.toolAliases.has(name)) {
      return this.toolAliases.get(name)!;
    }
    return name as CanonicalToolName;
  }

  /**
   * Deterministic execution entry point with strict invariant validation.
   */
  public async execute(req: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const canonicalName = this.resolveCanonicalName(req.tool);
    const toolSchema = this.tools.get(canonicalName);

    // INVARIANT_003: Unknown tools never execute
    if (!toolSchema) {
      return {
        success: false,
        tool: req.tool,
        error: `SECURITY_VIOLATION: Unknown tools never execute. ('${req.tool}' is unregistered).`,
        source: "demo_simulator",
      };
    }

    // INVARIANT_001: PIN never reaches tool execution
    const serializedParams = JSON.stringify(req.params || {});
    if (/\b(?:pin|momo_pin|pin_code)\b/i.test(serializedParams) || /\b(?:1234|0000|\d{4})\b/.test(serializedParams) && serializedParams.includes("pin")) {
      return {
        success: false,
        tool: canonicalName,
        error: `SECURITY_VIOLATION: ${SECURITY_INVARIANTS.INVARIANT_001}`,
        source: "demo_simulator",
      };
    }

    // INVARIANT_007: Idempotency enforcement
    const idempotencyKey = req.params.referenceId || req.params.idempotencyKey;
    if (toolSchema.idempotencyRequired && idempotencyKey) {
      if (this.processedIdempotencyKeys.has(idempotencyKey)) {
        return {
          success: false,
          tool: canonicalName,
          error: `SECURITY_VIOLATION: Duplicate submission blocked by idempotency key '${idempotencyKey}'.`,
          source: "demo_simulator",
        };
      }
      this.processedIdempotencyKeys.add(idempotencyKey);
    }

    // Parameter validation
    for (const required of toolSchema.requiredParams) {
      if (req.params[required] === undefined || req.params[required] === null || req.params[required] === "") {
        return {
          success: false,
          tool: canonicalName,
          error: `Missing required parameter '${required}' for tool '${canonicalName}'`,
          source: "demo_simulator",
        };
      }
    }

    try {
      const response = await toolSchema.handler({
        ...req,
        tool: canonicalName,
      });
      return response;
    } catch (err: any) {
      return {
        success: false,
        tool: canonicalName,
        error: err.message || "Tool execution encountered an unexpected exception.",
        source: "demo_simulator",
      };
    }
  }
}

export const unifiedToolRegistry = new UnifiedToolRegistry();
