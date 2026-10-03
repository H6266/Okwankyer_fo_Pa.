/**
 * Ɔkwankyerɛfo Pa - MTN MoMo API Routes
 * 
 * Supports collections, transfers, status polling, balances, and webhook callbacks.
 * Protected by admin authorization and strict validation.
 */

import { Router, Request, Response } from "express";
import { mtnMomoService } from "../modules/mtnMomoService";
import { transactionOrchestrator } from "../modules/transactionOrchestrator";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";
import { momoSagaOrchestrator } from "../services/momoSagaOrchestrator";

export const momoRouter = Router();

// ── Diagnostics & Capability Matrix ──────────────────────────────────
momoRouter.get("/api/momo/status", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    diagnostics: mtnMomoService.getDiagnostics(),
  });
});

momoRouter.get("/api/momo/capability-matrix", (_req: Request, res: Response) => {
  res.json({
    success: true,
    matrix: transactionOrchestrator.getCapabilityMatrix(),
  });
});

// ── Centralized Transaction Service Endpoints ─────────────────────────

// Send Money (Unified Central Pipeline)
momoRouter.post("/api/momo/send", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { recipient_phone, recipient_name, amount, network, payer_phone, payer_name, mode } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!recipient_phone || typeof recipient_phone !== "string") {
      return res.status(400).json({ error: "Missing required 'recipient_phone' field." });
    }

    const validatedRecipient = validateGhanaPhoneNumber(recipient_phone);
    if (!validatedRecipient.valid || !validatedRecipient.normalized) {
      return res.status(400).json({ error: validatedRecipient.error || "Invalid recipient phone number." });
    }

    const payerPhone = payer_phone || (req.headers["x-payer-phone"] as string) || "0553838464";

    const result = await transactionOrchestrator.executeSendMoney({
      source: "WEB",
      network: network || "MTN",
      recipient_phone: validatedRecipient.normalized,
      recipient_name: recipient_name || "MTN Subscriber",
      amount: parsedAmount,
      payer_phone: payerPhone,
      payer_name: payer_name || "Web Dashboard User",
      mode,
    });

    res.status(result.status === "PENDING" ? 202 : 200).json({
      success: result.status !== "FAILED",
      transaction: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Buy Airtime (Central Transaction Service)
momoRouter.post("/api/momo/airtime", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone, amount, network, payer_phone } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing required 'phone' field." });
    }

    const validatedPhone = validateGhanaPhoneNumber(phone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid phone number." });
    }

    const result = await transactionOrchestrator.executeAirtime({
      source: "WEB",
      phone: validatedPhone.normalized,
      amount: parsedAmount,
      network: network || "MTN",
      payer_phone: payer_phone || "0553838464",
    });

    res.json({
      success: result.status === "SUCCESS" || result.status === "PENDING",
      transaction: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Buy Data Bundle (Central Transaction Service)
momoRouter.post("/api/momo/data", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone, bundle, amount, network, payer_phone } = req.body;
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ error: "Missing required 'phone' field." });
    }
    if (!bundle || typeof bundle !== "string") {
      return res.status(400).json({ error: "Missing required 'bundle' field." });
    }

    const validatedPhone = validateGhanaPhoneNumber(phone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid phone number." });
    }

    const result = await transactionOrchestrator.executeDataBundle({
      source: "WEB",
      phone: validatedPhone.normalized,
      bundle,
      amount: amount ? parseFloat(amount) : undefined,
      network: network || "MTN",
      payer_phone: payer_phone || "0553838464",
    });

    res.json({
      success: result.status === "SUCCESS" || result.status === "PENDING",
      transaction: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pay Bills (Central Transaction Service)
momoRouter.post("/api/momo/bills", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { biller, accountNumber, amount, payer_phone } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!biller || !accountNumber) {
      return res.status(400).json({ error: "Missing 'biller' or 'accountNumber' field." });
    }

    const result = await transactionOrchestrator.executeBillPayment({
      source: "WEB",
      biller,
      accountNumber,
      amount: parsedAmount,
      payer_phone: payer_phone || "0553838464",
    });

    res.json({
      success: result.status === "SUCCESS" || result.status === "PENDING",
      transaction: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cash Out (Central Transaction Service)
momoRouter.post("/api/momo/cashout", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone, amount, agentId, payer_phone } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!phone) {
      return res.status(400).json({ error: "Missing required 'phone' field." });
    }

    const validatedPhone = validateGhanaPhoneNumber(phone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid phone number." });
    }

    const result = await transactionOrchestrator.executeCashOut({
      source: "WEB",
      phone: validatedPhone.normalized,
      amount: parsedAmount,
      agentId,
      payer_phone: payer_phone || validatedPhone.normalized,
    });

    res.json({
      success: result.status === "SUCCESS" || result.status === "PENDING",
      transaction: result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Collections RequestToPay
momoRouter.post("/api/momo/request-to-pay", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { amount, payerPhone, payerMessage, payeeNote, externalId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!payerPhone || typeof payerPhone !== "string") {
      return res.status(400).json({ error: "Missing required 'payerPhone' field." });
    }
    const validatedPhone = validateGhanaPhoneNumber(payerPhone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid payer phone number." });
    }

    const tx = await mtnMomoService.requestToPay({
      amount: parsedAmount,
      payerPhone: validatedPhone.normalized,
      payerMessage: payerMessage || "Payment for services",
      payeeNote: payeeNote || "Payment received",
      externalId,
    });
    res.status(202).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RequestToPay Status Check
momoRouter.get("/api/momo/request-to-pay/:referenceId", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const tx = await mtnMomoService.getTransactionStatus(referenceId);
    if (!tx) {
      return res.status(404).json({ error: "RequestToPay reference not found" });
    }
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-Provision Sandbox API User & Key using Subscription Key
momoRouter.post("/api/momo/provision", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { subscriptionKey, callbackHost } = req.body;
    const key = (subscriptionKey || "").trim() ||
      process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
      process.env.MOMO_SUBSCRIPTION_KEY ||
      process.env.MOMO_SUBSCRIPTION_KEY_SECONDARY;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: "Missing required 'subscriptionKey'. Please provide your MTN Developer Portal primary or secondary subscription key.",
      });
    }

    const host = callbackHost || req.get("host") || "sandbox.momodeveloper.mtn.com";
    const credentials = await mtnMomoService.autoProvisionSandbox(key, host);

    res.json({
      success: true,
      message: "Successfully auto-provisioned Sandbox API User and API Key with MTN!",
      subscriptionKey: `${key.slice(0, 6)}••••${key.slice(-4)}`,
      apiUserId: credentials.apiUserId,
      apiKey: credentials.apiKey,
      diagnostics: mtnMomoService.getDiagnostics(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Automated Real Account / Sandbox Test Runner
momoRouter.post("/api/momo/test-account", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone, amount, subscriberName, targetEnv } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Missing required 'phone' parameter." });
    }
    const result = await mtnMomoService.testRealAccount({
      phone,
      amount: amount ? parseFloat(amount) : 5.0,
      subscriberName,
      targetEnv,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ZERO-PIN SECURITY ENFORCEMENT: Never simulate customer PIN entry
momoRouter.post("/api/momo/authorize-prompt", (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: "SECURITY ENFORCEMENT: Handset PIN entry cannot be simulated or intercepted. Customer authorization occurs strictly on the user's mobile handset via MTN network USSD prompt. Our application never receives, processes, or simulates user PINs.",
    rule: "Zero-PIN Security Boundary",
  });
});

// Collections RequestToPay (Admin only)
momoRouter.post("/api/momo/collection", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { amount, payerPhone, payerMessage, payeeNote, externalId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!payerPhone || typeof payerPhone !== "string") {
      return res.status(400).json({ error: "Missing required 'payerPhone' field." });
    }
    const validatedPhone = validateGhanaPhoneNumber(payerPhone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid payer phone number." });
    }

    const tx = await mtnMomoService.requestToPay({
      amount: parsedAmount,
      payerPhone: validatedPhone.normalized,
      payerMessage: payerMessage || "Payment for services",
      payeeNote: payeeNote || "Payment received",
      externalId,
    });
    res.status(202).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Collection Status Check (Admin only)
momoRouter.get("/api/momo/collection/:referenceId", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const tx = await mtnMomoService.getTransactionStatus(referenceId);
    if (!tx) {
      return res.status(404).json({ error: "Collection reference not found" });
    }
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer / Disbursement (Admin only)
momoRouter.post("/api/momo/transfer", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { amount, payeePhone, payerMessage, payeeNote, externalId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }
    if (!payeePhone || typeof payeePhone !== "string") {
      return res.status(400).json({ error: "Missing required 'payeePhone' field." });
    }
    const validatedPhone = validateGhanaPhoneNumber(payeePhone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid payee phone number." });
    }

    const tx = await mtnMomoService.transfer({
      amount: parsedAmount,
      payeePhone: validatedPhone.normalized,
      payerMessage: payerMessage || "Disbursement Transfer",
      payeeNote: payeeNote || "Funds received",
      externalId,
    });
    res.status(202).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer Status Check (Admin only)
momoRouter.get("/api/momo/transfer/:referenceId", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const tx = await mtnMomoService.getTransactionStatus(referenceId);
    if (!tx) {
      return res.status(404).json({ error: "Transfer reference not found" });
    }
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Account Balance (Admin only)
momoRouter.get("/api/momo/account/balance", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const product = (req.query.product === "disbursement" ? "disbursement" : "collection") as "collection" | "disbursement";
    const balance = await mtnMomoService.getAccountBalance(product);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Validate Account Holder & KYC (Admin only)
momoRouter.get("/api/momo/account/holder/:phone", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const validatedPhone = validateGhanaPhoneNumber(phone);
    if (!validatedPhone.valid || !validatedPhone.normalized) {
      return res.status(400).json({ error: validatedPhone.error || "Invalid Ghanaian phone number format." });
    }
    const holder = await mtnMomoService.validateAccountHolder(validatedPhone.normalized);
    res.json({ success: true, accountHolder: holder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Callback (Callback endpoint with reference header verification)
momoRouter.post("/api/momo/callback", async (req: Request, res: Response) => {
  const refHeader = (req.headers["x-reference-id"] || req.headers["x-reference_id"]) as string;
  const updated = mtnMomoService.handleWebhook(req.body, refHeader);
  await momoSagaOrchestrator.handleWebhookCallback({ ...req.body, referenceId: refHeader });
  res.status(200).json({ success: true, recorded: Boolean(updated) });
});

// Transaction Ledger History (Admin only)
momoRouter.get("/api/momo/transactions", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    transactions: mtnMomoService.getHistory(),
  });
});

// Keys & Configuration (Admin only)
momoRouter.get("/api/momo/keys", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    ...mtnMomoService.getKeys(),
  });
});

// Switch Target Environment (Admin only)
momoRouter.post("/api/momo/switch-env", adminRateLimiter, requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { targetEnv } = req.body;
    if (targetEnv !== "sandbox" && targetEnv !== "production") {
      return res.status(400).json({ error: "targetEnv must be 'sandbox' or 'production'" });
    }
    const updated = mtnMomoService.setTargetEnv(targetEnv);
    res.json({
      success: true,
      message: `Target environment switched to ${targetEnv}.`,
      ...updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
