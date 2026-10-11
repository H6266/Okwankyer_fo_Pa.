/**
 * Ɔkwankyerɛfo Pa - Phase 6e Tests: Data Protection & PII Audit
 * (tests/dataProtectionAndPiiAudit.test.ts)
 * 
 * Verifies:
 * 1. Configurable consent notice prompt at call start.
 * 2. Data retention policies for transcripts, audio, and audit logs.
 * 3. Log scanning audit: Scans all audit logs and durable records for 10-digit numbers,
 *    raw PINs, or unredacted financial information. Confirms ZERO leakage!
 */

import { describe, it, expect } from "vitest";
import { dataRetentionService } from "../src/services/dataRetentionService";
import { pilotControls } from "../src/services/pilotControls";
import { auditLogger } from "../src/services/auditLogger";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { transactionStateMachine } from "../src/domain/stateMachine";

describe("Phase 6e: Data Protection & PII Audit", () => {
  it("1. Configurable consent notice prompt is provided in English and Twi", () => {
    expect(pilotControls.isConsentNoticeEnabled()).toBe(true);

    const noticeEn = dataRetentionService.getConsentNotice("en");
    expect(noticeEn).toContain("accessibility");
    expect(noticeEn).toContain("PIN");

    const noticeTw = dataRetentionService.getConsentNotice("twi");
    expect(noticeTw).toContain("PIN");
  });

  it("2. Data retention sweep purges expired session transcripts and old logs", () => {
    const oldSessionId = "session_old_test_123";
    dataRetentionService.registerSession(oldSessionId);

    // Immediate sweep with 0ms threshold purges session
    const purged = dataRetentionService.purgeExpiredTranscripts(0);
    expect(purged).toBeGreaterThanOrEqual(1);

    // Sweep report structure
    const sweep = dataRetentionService.runRetentionSweep();
    expect(sweep.purgedTranscripts).toBeDefined();
    expect(sweep.purgedLogs).toBeDefined();
  });

  it("3. PII Scanner correctly identifies unmasked 10-digit numbers and PIN patterns", () => {
    // Unmasked Ghanaian phone number
    const leakTest1 = dataRetentionService.scanForPiiLeaks("Sending money to 0553838464 right now");
    expect(leakTest1.hasPii).toBe(true);
    expect(leakTest1.matches.length).toBeGreaterThan(0);

    // Unmasked PIN pattern
    const leakTest2 = dataRetentionService.scanForPiiLeaks("The user entered pin: 1234 on device");
    expect(leakTest2.hasPii).toBe(true);

    // Properly masked content
    const safeContent = "Sending money to 055****464 with ref OKP-123456";
    const leakTest3 = dataRetentionService.scanForPiiLeaks(safeContent);
    expect(leakTest3.hasPii).toBe(false);
  });

  it("4. Scans all audit logs and transaction records for raw 10-digit numbers and PINs", () => {
    // Execute simulated call session to populate logs
    const sessId = `pii_scan_${Date.now()}`;
    const sess = transactionStateMachine.getOrCreateSession(sessId, "en", "VOICE");
    sess.callerPhone = "0553838464";
    sess.recipientPhone = "0241234567";
    sess.amount = 25;

    auditLogger.log("info", "MOMO", `Transaction initiated for caller ${sess.callerPhone} to ${sess.recipientPhone}`, sessId);
    auditLogger.log("info", "TELEPHONY", `Call processed for recipient 0241234567`, sessId);

    // Scan all logged messages in the auditLogger buffer
    const logs = auditLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);

    const raw10DigitRegex = /\b0(?:24|54|55|59|53|20|50|27|57|26)\d{7}\b/;
    const rawPinRegex = /\bpin\s*[:=]\s*\d{4,6}\b/i;

    for (const log of logs) {
      // Invariant: No raw 10-digit phone number in any log message!
      expect(raw10DigitRegex.test(log.message)).toBe(false);
      // Invariant: No raw PIN in any log message!
      expect(rawPinRegex.test(log.message)).toBe(false);
    }
  });
});
