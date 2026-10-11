/**
 * Ɔkwankyerɛfo Pa - Pilot Operational Management API Routes (pilotRoutes.ts)
 * 
 * Provides runtime administration for:
 * - Kill switch toggling (force offline_only instantly)
 * - Pilot phone number allowlist management
 * - Zero-PII operational metrics reporting
 * - Pending payment reconciliation
 * - Data retention enforcement sweeps
 */

import { Router, Request, Response, NextFunction } from "express";
import { pilotControls } from "../services/pilotControls";
import { pilotMetrics } from "../services/pilotMetrics";
import { paymentReconciliation } from "../services/paymentReconciliation";
import { dataRetentionService } from "../services/dataRetentionService";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";

export const pilotRouter = Router();

// Apply rate limiting and admin authentication strictly to pilot control endpoints
pilotRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/pilot")) {
    return adminRateLimiter(req, res, () => requireAdminAuth(req, res, next));
  }
  return next();
});

// ── Kill Switch & Status ────────────────────────────────────────────────────

pilotRouter.get("/api/pilot/status", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: pilotControls.getStatus(),
  });
});

pilotRouter.post("/api/pilot/kill-switch", (req: Request, res: Response) => {
  const { active, reason } = req.body;
  if (typeof active !== "boolean") {
    return res.status(400).json({ success: false, error: "Missing or invalid 'active' boolean." });
  }

  pilotControls.setKillSwitch(active, reason);
  res.json({
    success: true,
    message: active
      ? "Kill switch ENGAGED: All pilot calls forced to offline_only."
      : "Kill switch DISENGAGED: Pilot operating according to configured mode.",
    data: pilotControls.getStatus(),
  });
});

// ── Allowlist Management ────────────────────────────────────────────────────

pilotRouter.get("/api/pilot/allowlist", (req: Request, res: Response) => {
  const unmasked = req.query.unmasked === "true";
  res.json({
    success: true,
    enabled: pilotControls.isAllowlistEnabled(),
    allowedNumbers: pilotControls.getAllowedNumbers(!unmasked),
  });
});

pilotRouter.post("/api/pilot/allowlist", (req: Request, res: Response) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    return res.status(400).json({ success: false, error: "Missing required 'phone' string." });
  }

  const added = pilotControls.addAllowedNumber(phone);
  if (!added) {
    return res.status(400).json({ success: false, error: "Invalid phone number format." });
  }

  res.json({
    success: true,
    message: "Number added to pilot allowlist.",
    allowedNumbers: pilotControls.getAllowedNumbers(true),
  });
});

pilotRouter.delete("/api/pilot/allowlist/:phone", (req: Request, res: Response) => {
  const phone = req.params.phone;
  const removed = pilotControls.removeAllowedNumber(phone);
  res.json({
    success: true,
    removed,
    allowedNumbers: pilotControls.getAllowedNumbers(true),
  });
});

pilotRouter.post("/api/pilot/allowlist/toggle", (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ success: false, error: "Missing or invalid 'enabled' boolean." });
  }

  pilotControls.setAllowlistEnabled(enabled);
  res.json({
    success: true,
    enabled: pilotControls.isAllowlistEnabled(),
  });
});

// ── Operational Metrics ─────────────────────────────────────────────────────

pilotRouter.get("/api/pilot/metrics", (_req: Request, res: Response) => {
  const report = pilotMetrics.getMetricsReport();
  res.json({
    success: true,
    data: report,
  });
});

pilotRouter.post("/api/pilot/metrics/reset", (_req: Request, res: Response) => {
  pilotMetrics.resetMetrics();
  res.json({
    success: true,
    message: "Pilot operational metrics reset successfully.",
    data: pilotMetrics.getMetricsReport(),
  });
});

// ── Payment Reconciliation ──────────────────────────────────────────────────

pilotRouter.post("/api/pilot/reconciliation/run", async (req: Request, res: Response) => {
  const timeoutMs = req.body?.timeoutMs ? parseInt(req.body.timeoutMs, 10) : undefined;
  const report = await paymentReconciliation.reconcilePendingPayments(timeoutMs);
  res.json({
    success: true,
    data: report,
  });
});

// ── Data Retention Sweep ────────────────────────────────────────────────────

pilotRouter.post("/api/pilot/retention/sweep", (_req: Request, res: Response) => {
  const report = dataRetentionService.runRetentionSweep();
  res.json({
    success: true,
    data: report,
  });
});
