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
import { momoProvider } from "../integrations/momo";
import { voicePaymentService } from "../integrations/momo/voicePaymentService";
import { evidenceStore } from "../integrations/momo/evidenceStore";

export const momoRouter = Router();

// ── Centralized Recipient Lookup Service ──────────────────────────────
momoRouter.post("/api/momo/validate-recipient", async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body?.phone || req.body?.msisdn || req.body?.phoneNumber;
    if (!rawPhone || typeof rawPhone !== "string") {
      return res.status(400).json({ success: false, error: "Missing required 'phone' or 'msisdn' parameter." });
    }

    const validation = validateGhanaPhoneNumber(rawPhone);
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({ success: false, error: validation.error || "Invalid phone number format." });
    }

    const result = await voicePaymentService.verifyNumber(validation.normalized);
    const evidence = evidenceStore.get(result.evidenceId);
    const name = result.fields.name || [result.fields.given_name, result.fields.family_name].filter(Boolean).join(" ") || undefined;

    res.json({
      success: result.ok,
      phone: validation.normalized,
      msisdn: result.fields.msisdn,
      name,
      verified: result.ok,
      normalizedResult: result,
      gatewayEvidence: evidence,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Centralized Transaction Engine Endpoints ──────────────────────────

// Step 1: Create Transaction
momoRouter.post("/api/momo/transaction/create", async (req: Request, res: Response) => {
  try {
    const { operation, recipientPhone, amount, channel, payerPhone, payerName, payerMessage, payeeNote, sessionId } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: "Positive amount is required." });
    }
    if (!recipientPhone) {
      return res.status(400).json({ success: false, error: "recipientPhone is required." });
    }

    const tx = momoProvider.createTransaction({
      operation: operation || "SEND_MONEY",
      recipientPhone,
      amount: parsedAmount,
      channel: channel || "WEB",
      payerPhone,
      payerName,
      payerMessage,
      payeeNote,
      sessionId,
    });

    res.status(201).json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 2: Validate Recipient for Transaction
momoRouter.post("/api/momo/transaction/validate", async (req: Request, res: Response) => {
  try {
    const { transactionId, phone } = req.body;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: "transactionId is required." });
    }

    const tx = await momoProvider.validateRecipient(transactionId, phone);
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 3: Confirm Transaction
momoRouter.post("/api/momo/transaction/confirm", (req: Request, res: Response) => {
  try {
    const { transactionId, confirmed } = req.body;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: "transactionId is required." });
    }

    const tx = momoProvider.confirmTransaction(transactionId, confirmed !== false);
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 4: Submit Transaction to MTN
momoRouter.post("/api/momo/transaction/submit", async (req: Request, res: Response) => {
  try {
    const { transactionId, mode, payerPhone } = req.body;
    if (!transactionId) {
      return res.status(400).json({ success: false, error: "transactionId is required." });
    }

    const tx = await momoProvider.submitTransaction(transactionId, { mode, payerPhone });
    res.status(tx.status === "PENDING" ? 202 : 200).json({
      success: tx.status !== "FAILED" && tx.status !== "SUBMISSION_FAILED",
      transaction: tx,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 5: Get Transaction by ID or Reference
momoRouter.get("/api/momo/transaction/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const tx = momoProvider.getTransaction(id);
  if (!tx) {
    return res.status(404).json({ success: false, error: `Transaction ${id} not found.` });
  }
  res.json({ success: true, transaction: tx });
});

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
    matrix: [
      { operation: "OAuth Token Generation (Disbursement)", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "POST /disbursement/token/" },
      { operation: "OAuth Token Generation (Collection)", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "POST /collection/token/" },
      { operation: "Send Money / Collections", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "202 Accepted", endpoint: "POST /collection/v1_0/requesttopay" },
      { operation: "Transfer Status Polling", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "GET /collection/v1_0/requesttopay/{ref}" },
      { operation: "Account Holder active verification", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "GET /collection/v1_0/accountholder/msisdn/{id}/active" },
      { operation: "Basic KYC information", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "GET /collection/v1_0/accountholder/msisdn/{id}/basicuserinfo" },
      { operation: "Account Balance", classification: "REAL MTN SANDBOX REQUEST", leavesServer: "YES", httpStatus: "200 OK", endpoint: "GET /collection/v1_0/account/balance" },
    ],
  });
});

// ── Centralized Transaction Service Endpoints ─────────────────────────

// Send Money (Supports both Consumer P2P RequestToPay and Direct Float Disbursement)
momoRouter.post("/api/momo/send", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { recipient_phone, recipient_name, amount, payer_phone, network, mode } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid positive 'amount' field." });
    }

    if (!recipient_phone || typeof recipient_phone !== "string") {
      return res.status(400).json({ error: "Missing required recipient_phone." });
    }
    if (network !== "MTN") {
      return res.status(400).json({ error: "This endpoint currently supports only an explicitly selected MTN network." });
    }

    const validatedRecipient = validateGhanaPhoneNumber(recipient_phone);
    if (!validatedRecipient.valid || !validatedRecipient.normalized) {
      return res.status(400).json({ error: validatedRecipient.error || "Invalid recipient phone number." });
    }
    const finalRecipientPhone = validatedRecipient.normalized;

    // Handle Direct Float Disbursement
    if (mode === "DISBURSEMENT_TRANSFER") {
      const tx = await mtnMomoService.transfer({
        amount: parsedAmount,
        payeePhone: finalRecipientPhone,
        payeeName: typeof recipient_name === "string" ? recipient_name : "",
        payerMessage: "Direct Float Disbursement",
        payeeNote: "Okwankyerɛfo Pa MoMo",
      });

      tx.payerPhone = "FLOAT (Business Float)";
      tx.recipientPhone = finalRecipientPhone;
      tx.recipientName = typeof recipient_name === "string" ? recipient_name : "";
      tx.requestedAmount = parsedAmount;
      tx.requestedCurrency = "GHS";
      mtnMomoService.recordTransaction(tx);

      return res.status(202).json({
        success: tx.status !== "FAILED",
        transaction: {
          status: tx.status,
          reference: tx.referenceId,
          amount: parsedAmount,
          requestedAmount: parsedAmount,
          requestedCurrency: "GHS",
          currency: tx.currency,
          executionCurrency: tx.currency,
          currencyNotice: tx.currency === "EUR" ? "MTN Developer Sandbox executes in EUR; live Ghana production executes in GHS" : undefined,
          payer_phone: "FLOAT (Business Float)",
          recipient_name: typeof recipient_name === "string" ? recipient_name : undefined,
          recipient_phone: finalRecipientPhone,
          momoDetails: {
            referenceId: tx.referenceId,
            externalId: tx.externalId,
            financialTransactionId: tx.financialTransactionId,
          },
          reason: tx.reason,
        },
        gatewayEvidence: tx.gatewayEvidence,
        evidenceId: tx.referenceId,
      });
    }

    // Consumer collection requires the payer identity separately from the recipient.
    if (typeof payer_phone !== "string" || !payer_phone.trim()) {
      return res.status(400).json({ error: "Missing required payer_phone; payer and recipient are never inferred from each other." });
    }
    const validatedPayer = validateGhanaPhoneNumber(payer_phone);
    if (!validatedPayer.valid || !validatedPayer.normalized) {
      return res.status(400).json({ error: validatedPayer.error || "Invalid payer phone number." });
    }

    // Request handset authorization from the explicitly supplied payer.
    const result = await voicePaymentService.initiatePayment(validatedPayer.normalized, parsedAmount);
    const evidence = evidenceStore.get(result.evidenceId);

    // Carry recipient details in normalized result fields
    result.fields.recipient_phone = finalRecipientPhone;
    if (recipient_name) {
      result.fields.recipient_name = recipient_name;
    }

    const refId = result.fields.referenceId || result.evidenceId;
    const extId = result.fields.externalId || refId;
    mtnMomoService.recordTransaction({
      id: extId || refId,
      referenceId: refId,
      externalId: extId,
      type: "COLLECTION_REQUEST_TO_PAY",
      status: (result.mtnStatus as any) || (result.ok ? "PENDING" : "FAILED"),
      amount: parsedAmount,
      requestedAmount: parsedAmount,
      requestedCurrency: "GHS",
      currency: result.fields.currency || "EUR",
      msisdn: validatedPayer.normalized,
      payerPhone: validatedPayer.normalized,
      recipientPhone: finalRecipientPhone,
      recipientName: typeof recipient_name === "string" ? recipient_name : undefined,
      mode: "SANDBOX_API",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      gatewayEvidence: evidence as any,
    });

    const httpStatus = result.mtnHttpStatus === 202 ? 202 : (result.mtnHttpStatus || 400);
    res.status(httpStatus).json({
      success: result.ok,
      transaction: {
        status: result.mtnStatus || "PENDING",
        reference: result.fields.referenceId,
        amount: parsedAmount,
        requestedAmount: parsedAmount,
        requestedCurrency: "GHS",
        currency: result.fields.currency || "EUR",
        executionCurrency: result.fields.currency || "EUR",
        currencyNotice: result.fields.currency === "EUR" ? "MTN Developer Sandbox executes in EUR; live Ghana production executes in GHS" : undefined,
        payer_phone: validatedPayer.normalized,
        recipient_name: typeof recipient_name === "string" ? recipient_name : undefined,
        recipient_phone: finalRecipientPhone,
        momoDetails: {
          referenceId: result.fields.referenceId,
          externalId: result.fields.externalId,
          financialTransactionId: result.fields.financialTransactionId,
        },
        reason: result.mtnReason || result.error?.message,
      },
      normalizedResult: result,
      gatewayEvidence: evidence,
      evidenceId: result.evidenceId,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Buy Airtime (Unimplemented in MTN MoMo Open API)
momoRouter.post("/api/momo/airtime", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: "Not implemented. MTN MoMo Open API does not offer native endpoints for Airtime Top-Up.",
    implemented: false,
  });
});

// Buy Data Bundle (Unimplemented in MTN MoMo Open API)
momoRouter.post("/api/momo/data", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: "Not implemented. MTN MoMo Open API does not offer native endpoints for Data Bundles.",
    implemented: false,
  });
});

// Pay Bills (Unimplemented in MTN MoMo Open API)
momoRouter.post("/api/momo/bills", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: "Not implemented. MTN MoMo Open API does not offer native endpoints for Utility & Bill Payment.",
    implemented: false,
  });
});

// Cash Out (Unimplemented in MTN MoMo Open API)
momoRouter.post("/api/momo/cashout", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: "Not implemented. MTN MoMo Open API does not offer native endpoints for Cash Out.",
    implemented: false,
  });
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
momoRouter.post(
  "/api/momo/test-all",
  adminRateLimiter,
  requireAdminAuth,
  async (req: Request, res: Response) => {
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  if (!/^0\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, error: "Provide an explicit Ghanaian phone number to run provider diagnostics." });
    return;
  }
  const results: Array<{
    functionName: string;
    passed: boolean;
    mode: string;
    reference: string;
    details: string;
    gatewayEvidence?: any;
  }> = [];

  // 1. Account Holder / KYC Validation
  try {
    const holder = await mtnMomoService.validateAccountHolder(phone);
    results.push({
      functionName: "Account Holder / KYC Lookup",
      passed: true,
      mode: holder.mode,
      reference: holder.msisdn,
      details: `Active: ${holder.isActive} | Name: ${holder.name || "Unknown (KYC not verified)"}`,
      gatewayEvidence: holder.gatewayEvidence,
    });
  } catch (err: any) {
    results.push({
      functionName: "Account Holder / KYC Lookup",
      passed: false,
      mode: "ERROR",
      reference: phone,
      details: err.message,
      gatewayEvidence: err.gatewayEvidence,
    });
  }

  // 2. Check Account Balance (Disbursement)
  try {
    const bal = await mtnMomoService.getAccountBalance("disbursement");
    results.push({
      functionName: "Check Balance (Disbursement Float)",
      passed: true,
      mode: bal.mode,
      reference: "FLOAT-ACC",
      details: `Available: ${bal.formatted}`,
      gatewayEvidence: bal.gatewayEvidence,
    });
  } catch (err: any) {
    results.push({
      functionName: "Check Balance (Disbursement Float)",
      passed: false,
      mode: "ERROR",
      reference: "FLOAT-ACC",
      details: err.message,
      gatewayEvidence: err.gatewayEvidence,
    });
  }

  // 3. Send Money / Disbursement Transfer
  let transferRef = "";
  try {
    const tx = await mtnMomoService.transfer({
      amount: 5.0,
      payeePhone: phone,
      payeeName: "Test Subscriber",
      payerMessage: "Suite Payout Verification",
      payeeNote: "Okwankyerɛfo Pa Test",
    });
    transferRef = tx.referenceId;
    results.push({
      functionName: "Send Money (Disbursement Transfer)",
      passed: tx.status !== "FAILED",
      mode: tx.mode,
      reference: tx.referenceId,
      details: `Dispatched ${tx.amount} ${tx.currency} (Status: ${tx.status}, FinID: ${tx.financialTransactionId || "Pending"})`,
      gatewayEvidence: tx.gatewayEvidence,
    });
  } catch (err: any) {
    results.push({
      functionName: "Send Money (Disbursement Transfer)",
      passed: false,
      mode: "ERROR",
      reference: "N/A",
      details: err.message,
      gatewayEvidence: err.gatewayEvidence,
    });
  }

  // 4. Transfer Status Polling
  if (transferRef) {
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const statusTx = await mtnMomoService.getTransactionStatus(transferRef);
      results.push({
        functionName: "Transfer Status Polling",
        passed: Boolean(statusTx && statusTx.status !== "FAILED"),
        mode: statusTx?.mode || "SANDBOX_API",
        reference: transferRef,
        details: `Polled state: ${statusTx?.status} (FinID: ${statusTx?.financialTransactionId || "N/A"})`,
        gatewayEvidence: statusTx?.gatewayEvidence,
      });
    } catch (err: any) {
      results.push({
        functionName: "Transfer Status Polling",
        passed: false,
        mode: "ERROR",
        reference: transferRef,
        details: err.message,
        gatewayEvidence: err.gatewayEvidence,
      });
    }
  }

  const allPassed = results.every((r) => r.passed);
  res.json({
    success: true,
    allPassed,
    totalTests: results.length,
    results,
    diagnostics: mtnMomoService.getDiagnostics(),
  });
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
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence });
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
    res.status(202).json({ success: true, transaction: tx, gatewayEvidence: tx.gatewayEvidence });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence, endpoint: err.endpoint });
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
    res.json({ success: true, transaction: tx, gatewayEvidence: tx.gatewayEvidence });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence, endpoint: err.endpoint });
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
    res.status(202).json({ success: true, transaction: tx, gatewayEvidence: tx.gatewayEvidence });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence, endpoint: err.endpoint });
  }
});

// Transfer / RequestToPay Status Check
momoRouter.get("/api/momo/transfer/:referenceId", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;
    const localTx = mtnMomoService.getTransactionRecord(referenceId);

    let status = "PENDING";
    let financialTransactionId: string | undefined = localTx?.financialTransactionId;
    let reason: string | undefined = localTx?.reason;
    let evidence: any = localTx?.gatewayEvidence;
    let normalizedResult: any = undefined;

    if (localTx?.type === "DISBURSEMENT_TRANSFER") {
      const polled = await mtnMomoService.getTransactionStatus(referenceId);
      if (polled) {
        status = polled.status;
        financialTransactionId = polled.financialTransactionId || financialTransactionId;
        evidence = polled.gatewayEvidence || evidence;
      }
    } else {
      const voiceStatus = await voicePaymentService.checkStatus(referenceId, { singlePoll: true });
      evidence = evidenceStore.get(voiceStatus.evidenceId) || evidence;
      status = voiceStatus.mtnStatus || (voiceStatus.ok ? "SUCCESSFUL" : "PENDING");
      financialTransactionId = voiceStatus.fields.financialTransactionId || financialTransactionId;
      reason = voiceStatus.mtnReason || reason;
      normalizedResult = voiceStatus;
    }

    if (localTx && status) {
      localTx.status = status as any;
      if (financialTransactionId) localTx.financialTransactionId = financialTransactionId;
    }

    const providerCompleted = (status === "SUCCESSFUL" || status === "SUCCESS") && Boolean(financialTransactionId?.trim());
    res.json({
      success: providerCompleted,
      state: providerCompleted ? "COMPLETED" : (status === "SUCCESSFUL" || status === "SUCCESS") ? "RECONCILIATION_REQUIRED" : status,
      transaction: {
        status,
        financialTransactionId,
        reason,
        amount: localTx?.amount,
        requestedAmount: localTx?.requestedAmount || localTx?.amount,
        currency: localTx?.currency,
        requestedCurrency: localTx?.requestedCurrency,
        executionCurrency: localTx?.currency,
        currencyNotice: localTx?.currency === "EUR" ? "MTN Developer Sandbox executes in EUR; live Ghana production executes in GHS" : undefined,
        referenceId,
        recipient_phone: localTx?.recipientPhone || localTx?.msisdn,
        recipient_name: localTx?.recipientName,
        payer_phone: localTx?.payerPhone,
        momoDetails: {
          referenceId,
          externalId: localTx?.externalId,
          status,
          financialTransactionId,
        },
      },
      normalizedResult,
      gatewayEvidence: evidence,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Gateway Evidence Store Lookup
momoRouter.get("/api/momo/evidence/:evidenceId", (req: Request, res: Response) => {
  const evidence = evidenceStore.get(req.params.evidenceId);
  if (!evidence) {
    return res.status(404).json({ success: false, error: "Evidence record not found" });
  }
  res.json({ success: true, evidence });
});

// Account Balance (Admin only)
momoRouter.get("/api/momo/account/balance", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const product = (req.query.product === "disbursement" ? "disbursement" : "collection") as "collection" | "disbursement";
    const balance = await mtnMomoService.getAccountBalance(product);
    res.json({ success: true, balance, gatewayEvidence: balance.gatewayEvidence });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence, endpoint: err.endpoint });
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
    res.json({ success: true, accountHolder: holder, gatewayEvidence: holder.gatewayEvidence });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, gatewayEvidence: err.gatewayEvidence, endpoint: err.endpoint });
  }
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
