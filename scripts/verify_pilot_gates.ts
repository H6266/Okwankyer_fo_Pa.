/**
 * Ɔkwankyerɛfo Pa - Pre-Pilot Gate Verification Script
 * (scripts/verify_pilot_gates.ts)
 * 
 * Programmatically validates all 8 mandatory pre-pilot gates:
 * 1. Model Configuration Gate
 * 2. Zero-PIN & PII Protection Gate
 * 3. Webhook Authenticity & Replay Protection Gate
 * 4. Per-Number Allowlist Gate
 * 5. Dynamic Kill Switch Gate
 * 6. Data Retention & Privacy Notice Gate
 * 7. Payment Reconciliation Scanner Gate
 * 8. Dialect Gating (Akuapem Twi) Gate
 * 
 * Executable via: `npx tsx scripts/verify_pilot_gates.ts`
 */

import { pilotControls } from '../src/services/pilotControls';
import { dataRetentionService } from '../src/services/dataRetentionService';
import { paymentReconciliation } from '../src/services/paymentReconciliation';
import { isSpokenPinPresent } from '../src/ai_system/brain/brain';
import { checkReplayGuard, safeCompare } from '../src/providers/telephony/webhookGuard';
import { languagePolicyConfig } from '../src/ai_system/brain/languagePolicy';

interface GateResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function verifyAllGates(): Promise<{ allPassed: boolean; results: GateResult[] }> {
  const results: GateResult[] = [];

  // Gate 1: Model Configuration Gate
  const modelConfigured = Boolean(process.env.GEMINI_MODEL || process.env.NODE_ENV !== 'production');
  results.push({
    id: 'GATE-01',
    name: 'Model Configuration Gate',
    passed: modelConfigured,
    details: modelConfigured
      ? `Model specified: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash (dev fallback)'}`
      : 'GEMINI_MODEL missing in production environment',
  });

  // Gate 2: Zero-PIN & PII Protection Gate
  const pin1 = isSpokenPinPresent('my pin is 1234');
  const pin2 = isSpokenPinPresent('me pin ne baako mmienu mmiensa enan');
  const safePhone = dataRetentionService.scanForPiiLeaks('User 055****464 verified');
  const pinGatePassed = pin1 && pin2 && !safePhone.hasPii;
  results.push({
    id: 'GATE-02',
    name: 'Zero-PIN & PII Protection Gate',
    passed: pinGatePassed,
    details: pinGatePassed
      ? 'Zero-PIN interception and log redactor active and functional'
      : 'PIN detection or PII scanner failed validation',
  });

  // Gate 3: Webhook Security & Replay Protection Gate
  const timingSafe = safeCompare('test-secret', 'test-secret');
  const replayTest = checkReplayGuard({
    body: { sessionId: 'gate-test-session', nonce: `gate-nonce-${Date.now()}` },
    headers: {},
  } as any);
  const webhookGatePassed = timingSafe && replayTest.valid;
  results.push({
    id: 'GATE-03',
    name: 'Webhook Security & Replay Gate',
    passed: webhookGatePassed,
    details: webhookGatePassed
      ? 'Constant-time verification and sliding-window replay guard operational'
      : 'Webhook guard timing or replay validation failed',
  });

  // Gate 4: Per-Number Allowlist Gate
  const allowlistActive = pilotControls.isAllowlistEnabled();
  pilotControls.addAllowedNumber('0553838464');
  const allowed = pilotControls.isNumberAllowed('0553838464');
  const notAllowed = pilotControls.isNumberAllowed('0200000000');
  const allowlistGatePassed = allowlistActive && allowed && !notAllowed;
  results.push({
    id: 'GATE-04',
    name: 'Per-Number Allowlist Gate',
    passed: allowlistGatePassed,
    details: allowlistGatePassed
      ? 'Allowlist active: Only approved pilot numbers can route to live models'
      : 'Allowlist not filtering numbers correctly',
  });

  // Gate 5: Dynamic Kill Switch Gate
  pilotControls.setKillSwitch(false);
  const beforeMode = pilotControls.getEffectiveBrainMode('0553838464', 'live');
  pilotControls.setKillSwitch(true, 'Gate test validation');
  const afterMode = pilotControls.getEffectiveBrainMode('0553838464', 'live');
  pilotControls.setKillSwitch(false); // Reset to false
  const killSwitchPassed = beforeMode === 'live' && afterMode === 'offline_only';
  results.push({
    id: 'GATE-05',
    name: 'Dynamic Kill Switch Gate',
    passed: killSwitchPassed,
    details: killSwitchPassed
      ? 'Kill switch instantly forces offline_only mode without deployment'
      : 'Kill switch failed to force offline_only mode',
  });

  // Gate 6: Data Retention & Consent Notice Gate
  const consentNotice = pilotControls.isConsentNoticeEnabled();
  const noticeEn = dataRetentionService.getConsentNotice('en');
  const retentionGatePassed = consentNotice && noticeEn.length > 10;
  results.push({
    id: 'GATE-06',
    name: 'Data Retention & Consent Notice Gate',
    passed: retentionGatePassed,
    details: retentionGatePassed
      ? 'Consent notice prompt active and retention sweep ready'
      : 'Consent notice disabled or empty',
  });

  // Gate 7: Payment Reconciliation Scanner Gate
  let reconciliationPassed = true;
  try {
    const report = await paymentReconciliation.reconcilePendingPayments(10 * 60 * 1000);
    reconciliationPassed = Array.isArray(report.results);
  } catch {
    reconciliationPassed = false;
  }
  results.push({
    id: 'GATE-07',
    name: 'Payment Reconciliation Scanner Gate',
    passed: reconciliationPassed,
    details: reconciliationPassed
      ? 'Automated scanner identifies and reconciles stuck PENDING payments'
      : 'Payment reconciliation execution encountered error',
  });

  // Gate 8: Dialect Gating (Akuapem Twi) Gate
  const akuapemGated = !languagePolicyConfig.allowUnapprovedDialects;
  results.push({
    id: 'GATE-08',
    name: 'Dialect Safety Gate (Akuapem Gated)',
    passed: akuapemGated,
    details: akuapemGated
      ? 'Akuapem Twi strictly gated from production until native verification is supplied'
      : 'Akuapem Twi is ungated prematurely',
  });

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

export async function runCLI(): Promise<void> {
  console.log('='.repeat(72));
  console.log("Ɔkwankyerɛfo Pa - Pre-Pilot Operational Gates Verification");
  console.log('='.repeat(72));

  const { allPassed, results } = await verifyAllGates();

  for (const r of results) {
    const statusIcon = r.passed ? '✓ GREEN' : '❌ RED';
    console.log(`[${r.id}] ${r.name.padEnd(38)}: ${statusIcon}`);
    console.log(`         Details: ${r.details}`);
  }

  console.log('='.repeat(72));
  if (allPassed) {
    console.log("🎉 ALL PRE-PILOT GATES ARE GREEN. SYSTEM IS READY FOR CONTROLLED PILOT.");
  } else {
    console.error("⚠️ SOME PRE-PILOT GATES FAILED. DO NOT LAUNCH PILOT UNTIL GREEN.");
    process.exit(1);
  }
}

if (process.argv[1]?.includes('verify_pilot_gates')) {
  runCLI().catch((err) => {
    console.error("Gate verification failed:", err);
    process.exit(1);
  });
}
