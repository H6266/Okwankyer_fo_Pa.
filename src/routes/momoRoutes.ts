/**
 * Ɔkwankyerɛfo Pa - MTN MoMo API Routes
 * 
 * Supports collections, transfers, status polling, balances, and webhook callbacks.
 */

import { Router, Request, Response } from "express";
import { mtnMomoService } from "../modules/mtnMomoService";
import { config } from "../config/env";

export const momoRouter = Router();

// Collections RequestToPay
momoRouter.post("/api/momo/collection", async (req: Request, res: Response) => {
  try {
    const { amount, payerPhone, payerMessage, payeeNote, externalId } = req.body;
    const tx = await mtnMomoService.requestToPay({
      amount: parseFloat(amount) || 5.0,
      payerPhone: payerPhone || "0553838464",
      payerMessage: payerMessage || "Payment for goods",
      payeeNote: payeeNote || "Payment received",
      externalId,
    });
    res.status(202).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Collection Status Check
momoRouter.get("/api/momo/collection/:referenceId", async (req: Request, res: Response) => {
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

// Transfer / Disbursement
momoRouter.post("/api/momo/transfer", async (req: Request, res: Response) => {
  try {
    const { amount, payeePhone, payerMessage, payeeNote, externalId } = req.body;
    const tx = await mtnMomoService.transfer({
      amount: parseFloat(amount) || 5.0,
      payeePhone: payeePhone || "0553838464",
      payerMessage: payerMessage || "Transfer",
      payeeNote: payeeNote || "Funds transferred",
      externalId,
    });
    res.status(202).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer Status Check
momoRouter.get("/api/momo/transfer/:referenceId", async (req: Request, res: Response) => {
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

// Account Balance
momoRouter.get("/api/momo/account/balance", async (req: Request, res: Response) => {
  try {
    const product = (req.query.product === "disbursement" ? "disbursement" : "collection") as "collection" | "disbursement";
    const balance = await mtnMomoService.getAccountBalance(product);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Validate Account Holder & KYC
momoRouter.get("/api/momo/account/holder/:phone", async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const holder = await mtnMomoService.validateAccountHolder(phone);
    res.json({ success: true, accountHolder: holder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook Callback
momoRouter.post("/api/momo/callback", (req: Request, res: Response) => {
  const refHeader = (req.headers["x-reference-id"] || req.headers["x-reference_id"]) as string;
  const updated = mtnMomoService.handleWebhook(req.body, refHeader);
  res.status(200).json({ success: true, recorded: Boolean(updated) });
});

// Transaction Ledger History
momoRouter.get("/api/momo/transactions", (_req: Request, res: Response) => {
  res.json({
    success: true,
    transactions: mtnMomoService.getHistory(),
  });
});

// Keys & Configuration
momoRouter.get("/api/momo/keys", (_req: Request, res: Response) => {
  res.json({
    success: true,
    ...mtnMomoService.getKeys(),
  });
});

// Switch Target Environment
momoRouter.post("/api/momo/switch-env", (req: Request, res: Response) => {
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
