/**
 * Ɔkwankyerɛfo Pa - Telecel Cash (Ghana) API Routes
 * 
 * Provides endpoints for Telecel sandbox/production:
 * - Diagnostics & credentials checklist
 * - Runtime sandbox keys update
 * - Subscriber KYC lookup (020, 050, 028)
 * - Merchant float balance inquiry
 * - Collections (RequestToPay) & Disbursements (Transfer)
 * - Status polling and Webhook callbacks
 */

import { Router, Request, Response } from "express";
import { telecelEngine } from "../integrations/telecel";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";

export const telecelRouter = Router();

// ── Diagnostics & Setup Checklist ─────────────────────────────────────
telecelRouter.get("/api/telecel/status", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    diagnostics: telecelEngine.getDiagnostics(),
  });
});

// ── Update Telecel Sandbox / Production Keys at Runtime ──────────────
telecelRouter.post("/api/telecel/keys", adminRateLimiter, requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { apiKey, clientId, clientSecret, merchantId, targetEnv, baseUrl } = req.body;

    if (apiKey !== undefined) process.env.TELECEL_API_KEY = String(apiKey).trim();
    if (clientId !== undefined) process.env.TELECEL_CLIENT_ID = String(clientId).trim();
    if (clientSecret !== undefined) process.env.TELECEL_CLIENT_SECRET = String(clientSecret).trim();
    if (merchantId !== undefined) process.env.TELECEL_MERCHANT_ID = String(merchantId).trim();
    if (targetEnv !== undefined) process.env.TELECEL_TARGET_ENV = String(targetEnv).trim();
    if (baseUrl !== undefined) process.env.TELECEL_BASE_URL = String(baseUrl).trim();

    telecelEngine.reloadConfig();

    res.json({
      success: true,
      message: "Telecel credentials updated and reloaded successfully.",
      diagnostics: telecelEngine.getDiagnostics(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── KYC & Subscriber Validation (020, 050, 028) ───────────────────────
telecelRouter.get("/api/telecel/kyc/:phone", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const validated = validateGhanaPhoneNumber(phone);
    if (!validated.valid || !validated.normalized) {
      return res.status(400).json({ success: false, error: validated.error || "Invalid phone number." });
    }

    const kyc = await telecelEngine.lookupKyc(validated.normalized);
    res.json({
      success: true,
      kyc,
      gatewayEvidence: kyc.gatewayEvidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Float Balance Inquiry ─────────────────────────────────────────────
telecelRouter.get("/api/telecel/balance", adminRateLimiter, requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const balance = await telecelEngine.getBalance();
    res.json({
      success: true,
      balance,
      gatewayEvidence: balance.gatewayEvidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Collections: RequestToPay (USSD Push or Voucher) ───────────────────
telecelRouter.post("/api/telecel/collection", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { amount, payerPhone, payerName, payerMessage, payeeNote, voucherCode, externalId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: "Valid positive amount is required." });
    }
    if (!payerPhone) {
      return res.status(400).json({ success: false, error: "Missing required 'payerPhone' parameter." });
    }

    const tx = await telecelEngine.requestToPay({
      amount: parsedAmount,
      payerPhone,
      payerName,
      payerMessage,
      payeeNote,
      voucherCode,
      externalId,
    });

    res.status(202).json({
      success: tx.status !== "FAILED",
      transaction: tx,
      gatewayEvidence: tx.gatewayEvidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Disbursements: Transfer (Direct Payout to Telecel Wallet) ─────────
telecelRouter.post("/api/telecel/transfer", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { amount, payeePhone, payeeName, payerMessage, payeeNote, externalId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: "Valid positive amount is required." });
    }
    if (!payeePhone) {
      return res.status(400).json({ success: false, error: "Missing required 'payeePhone' parameter." });
    }

    const tx = await telecelEngine.transfer({
      amount: parsedAmount,
      payeePhone,
      payeeName,
      payerMessage,
      payeeNote,
      externalId,
    });

    res.status(202).json({
      success: tx.status !== "FAILED",
      transaction: tx,
      gatewayEvidence: tx.gatewayEvidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Transaction Status Polling ────────────────────────────────────────
telecelRouter.get("/api/telecel/transaction/:referenceId", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const tx = await telecelEngine.getTransactionStatus(referenceId);
    if (!tx) {
      return res.status(404).json({ success: false, error: `Telecel transaction ${referenceId} not found.` });
    }
    res.json({
      success: true,
      transaction: tx,
      gatewayEvidence: tx.gatewayEvidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Webhook Callback Handler ──────────────────────────────────────────
telecelRouter.post("/api/telecel/webhook", (req: Request, res: Response) => {
  const result = telecelEngine.handleWebhookCallback(req.body);
  res.json({ success: result.success, received: true });
});
