# Security Architecture & Threat Model
### Ɔkwankyerɛfo Pa ("The Good Guide")

**Security Policy & Threat Specification**  
**Version:** 2.4.0  
**Status:** Active Production Baseline  

---

## 1. Core Security Invariant: The Zero-PIN Voice Security Boundary

Mobile Money users in Ghana are frequently targeted by eavesdroppers, shoulder-surfers, and fraud syndicates when transacting in crowded public environments (trotro stations, market stalls, community centers).

### Strict Boundary Rules:
1. **Never Prompt for PIN via Voice**: Ɔkwankyerɛfo Pa NEVER asks a caller to speak or dial their secret Mobile Money PIN over the cellular call.
2. **Never Record Audio during PIN Entry**: Speech recognition recording is strictly halted prior to payment initiation.
3. **Out-of-Band Network Authorization**: PIN authorization is exclusively conducted via the carrier's encrypted SIM Application Toolkit (STK) or USSD screen push modal (`*170#` screen prompt) on the subscriber's physical handset.
4. **Zero-Knowledge Architecture**: The Ɔkwankyerɛfo Pa server has zero access to user PINs, never stores PINs, and automatically scrubs any accidental PIN-like patterns from application logs.

---

## 2. Threat Modeling & Mitigations

| Threat | Description | Attack Vector | Technical Mitigation in Code |
|---|---|---|---|
| **T1: Spoofed Webhooks** | An attacker transmits forged HTTP POST requests to `/voice-menu` or `/safe-outcome` to initiate fraudulent transfers or manipulate call state. | Remote HTTP request mimicking Africa's Talking gateway. | • `verifyAtWebhook` middleware validates Africa's Talking `sessionId` format.<br>• Optional `AT_WEBHOOK_SECRET` header validation.<br>• Out-of-band payment handoff still requires caller to approve on physical handset. |
| **T2: Audio Prompt Tampering** | An attacker uploads a malicious or deceptive audio clip to replace legitimate IVR prompts (e.g. replacing safe confirmation with deceptive instruction). | Unauthenticated audio upload endpoint (`/api/upload-audio`). | • `requireAdminAuth` middleware enforces Bearer token authentication via `ADMIN_TOKEN`.<br>• `PROTECTED_FILENAMES` allowlist strictly prevents overwriting production prompts.<br>• Upload size capped at 2MB.<br>• Custom uploads isolated to `/audio/custom_uploads/`. |
| **T3: Webhook Replay & Double Billing** | Network retries or malicious replay of `/safe-outcome` causes multiple RequestToPay pushes. | Telephony gateway duplicate delivery. | • `TransactionStateMachine` enforces unique per-session idempotency keys (`idemp_${sessionId}_${referenceId}`).<br>• Replay attempts detect terminal or pending states and return cached responses without re-executing transfers. |
| **T4: Acoustic Eavesdropping & Shoulder Surfing** | Bystanders overhear caller's sensitive account details or PIN in public. | Ambient audio interception. | • Voice layer only requires verbal or DTMF confirmation of the transaction.<br>• PIN entry is completely removed from the voice call.<br>• Phone numbers are masked in readbacks (e.g. "ending in 8 4 6 4"). |
| **T5: Path Traversal Attack** | An attacker attempts to read or stream arbitrary server files via `/audio/../../etc/passwd`. | Manipulated URL path in audio streaming route. | • `resolveSafeAudioPath` uses `path.resolve` combined with strict root containment verification.<br>• Rejects backslashes (`\`) and relative escapes (`..`).<br>• Throws `PathTraversalError` and returns HTTP 403 Forbidden. |
| **T6: PII Exposure in Logs** | Phone numbers, account balances, or user identities leak into application logs. | Unredacted log outputs. | • `auditLogger` applies `redactPii` to all log streams.<br>• Phone numbers masked to last 3 digits (`055****464`).<br>• Bearer tokens and authorization headers redacted. |
| **T7: SIM-Swap Fraud** | A fraudster who has illegally swapped a victim's SIM initiates transfers via voice IVR. | Possession of victim's phone number. | • While Ɔkwankyerɛfo Pa resolves recipient KYC and pushes RequestToPay, **the final transfer is impossible without the user's secret PIN**, which is known only to the legitimate subscriber and stored on the telco core, not on the SIM. |

---

## 3. Automated Security Verification in CI

The test suite (`tests/safeConfirmationAndSecurity.test.ts`) automatically validates:
- Path traversal rejection across POSIX and Windows escape variants.
- Prevention of illegal state transitions.
- Idempotency key stability across duplicate webhook payloads.
- Automated regex scanning of application responses for credential and PIN patterns.
