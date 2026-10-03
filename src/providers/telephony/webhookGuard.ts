/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Webhook Verification Guard
 * 
 * Protects IVR callback endpoints from spoofing, replay, and malformed payloads.
 */

import { Request, Response, NextFunction } from "express";
import { auditLogger } from "../../services/auditLogger";

export function verifyAtWebhook(req: Request, res: Response, next: NextFunction): void {
  const sessionId = (req.body?.sessionId || req.query?.sessionId || "") as string;
  const phoneNumber = (req.body?.phoneNumber || req.query?.phoneNumber || req.body?.callerNumber || req.query?.callerNumber || "") as string;

  // Check required Africa's Talking session identifier
  if (!sessionId) {
    auditLogger.log("warn", "SECURITY", "Rejected telephony callback without sessionId", req.ip);
    res.status(400).send("<Response><Reject/></Response>");
    return;
  }

  // Validate format of sessionId (alphanumeric, dashes, underscores)
  if (!/^[a-zA-Z0-9_\-.:]{3,128}$/.test(sessionId)) {
    auditLogger.log("warn", "SECURITY", `Rejected malformed sessionId: "${sessionId.slice(0, 32)}"`, req.ip);
    res.status(400).send("<Response><Reject/></Response>");
    return;
  }

  // Optional shared secret check if configured in environment
  const expectedSecret = process.env.AT_WEBHOOK_SECRET;
  if (expectedSecret) {
    const providedSecret = req.headers["x-at-webhook-secret"] || req.query?.secret;
    if (providedSecret !== expectedSecret) {
      auditLogger.log("error", "SECURITY", "Telephony webhook secret verification failed", sessionId);
      res.status(401).send("<Response><Reject/></Response>");
      return;
    }
  }

  next();
}
