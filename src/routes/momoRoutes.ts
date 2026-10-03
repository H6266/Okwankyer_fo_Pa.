/**
 * Ɔkwankyerɛfo Pa - MTN MoMo API Routes
 * 
 * Supports collections, transfers, status polling, balances, and webhook callbacks.
 * Protected by admin authorization and strict validation.
 */

import { Router, Request, Response } from "express";
import { mtnMomoService } from "../modules/mtnMomoService";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";
import { momoSagaOrchestrator } from "../services/momoSagaOrchestrator";

export const momoRouter = Router();

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
