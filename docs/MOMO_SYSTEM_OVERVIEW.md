# Ɔkwankyerɛfo Pa: How MoMo Works in Our System

**Build status:** Hackathon prototype running on the MTN MoMo **Sandbox** only. We have no production MoMo licence or live MTN agreement, so no real money moves and no real handset is contacted.

**In one line:** Ɔkwankyerɛfo Pa lets someone send money by speaking, in Twi or English, over an ordinary phone call. The MTN MoMo sandbox is the payment engine behind it.

---

## 1. What the feature does

Many services assume the user can read screens, navigate menus or remember USSD codes. Ɔkwankyerɛfo Pa is a voice layer on top of those services: the user speaks, the system understands, reads the request back out loud for confirmation, and completes the task.

Sending MoMo is the first service built (Phase 1 in the dev console). Speech recognition, speech synthesis, intent understanding and the phone line (Africa's Talking IVR) are Phases 2 to 5 and show as inactive in the console at the time of writing.

## 2. The one thing to understand about MTN's API

MTN does not offer a single "move money from wallet A to wallet B" call. It offers two, in opposite directions:

| API | Direction | Who approves | Endpoint |
|---|---|---|---|
| Collections | Customer wallet → our business account | The customer, with their PIN on their own handset (production) | `POST /collection/v1_0/requesttopay` |
| Disbursements | Our business account → any wallet | Nobody; it is our own float | `POST /disbursement/v1_0/transfer` |

So "send money from A to B" is always **two legs**: collect from A, then disburse to B.

## 3. End-to-end flow

```
Caller speaks (Twi or English)
  → IVR phone line (Africa's Talking)
  → ASR: speech to text
  → LLM: intent {send_money, recipient, amount}
  → Recipient check (MTN account-holder lookup)
  → TTS read-back + caller says "yes"
  → Leg 1: MTN Collections requestToPay   → poll until final status
  → Leg 2: MTN Disbursements transfer     → poll until final status
  → TTS receipt, built only from confirmed MTN fields
```

Rules:
- Leg 2 starts only after MTN reports Leg 1 as `SUCCESSFUL`.
- The transfer counts as successful only when **both** legs are `SUCCESSFUL`.
- If Leg 1 fails, stop and tell the caller. If Leg 2 fails after Leg 1 succeeded, we are holding the customer's money, so a refund or retry path is required.

## 4. Zero-PIN policy

The system never collects, hears, stores or processes a MoMo PIN. It is not typed on the dashboard, not spoken to speech recognition and not handled through the IVR. In production the customer enters it on their own handset in response to MTN's prompt.

## 5. What the sandbox is, and is not

| Real | Simulated |
|---|---|
| Genuine HTTPS calls to `sandbox.momodeveloper.mtn.com` | No money moves |
| The statuses and transaction IDs MTN returns | No handset prompt, SMS or PIN entry; requests resolve on their own within a few seconds |
| MTN's real error responses | Currency is EUR, not GHS |
| Documented test outcomes (below) | The recipient receives nothing; account-holder names appear to be placeholders |

Test numbers for Collections, used to prove the app reports failures honestly. Results observed in our sandbox audit on 4 Oct 2026:
- `46733123450`: status `FAILED`, reason `INTERNAL_PROCESSING_ERROR`
- `46733123451`: status `FAILED`, reason `APPROVAL_REJECTED` (MTN reports a rejection as a failure with a reason, not as a separate status)
- `46733123454`: status `CREATED`, and it does not resolve, so the app treats it as still waiting and reports a polling timeout as our own outcome, not an MTN status

## 6. How we keep the demo honest

- The UI shows only data MTN returned. No mock data and no silent fallbacks.
- Failures show as failures, with MTN's real HTTP status and error body.
- Every result carries a **Gateway Evidence** panel: the request sent, the response received (status, headers, body) and round-trip time, with secrets masked.
- Status comes only from MTN's `status` field, and any message shown is derived from it.
- Values we generate ourselves (our `OKP-` reference, timestamps) are labelled app-generated and kept apart from MTN's raw payload.
- An amount spoken in GH₵ is shown as user input beside MTN's EUR sandbox amount, with no silent conversion.

## 7. Where testing stands (4 Oct 2026)

- **Collection leg:** a sandbox test returned `202 Accepted`, then `SUCCESSFUL` with a financial transaction ID on the follow-up status check.
- **Disbursement leg:** not yet verified end to end.
- **Full A to B transfer:** not yet demonstrated. The test inspected so far used only the Collection call, with the same number as payer and recipient.

Open items:
- Run both legs in one orchestrated transfer, with two separate statuses on screen.
- Remove leftover template text (for example "pending authorization" shown next to `SUCCESSFUL`).
- Use a single source for the recipient name, and treat sandbox account-holder names as unverified.
- Add the failure and refund path, and run the failing test numbers above.
- Confirm a transaction independently by querying its reference ID outside the app.

## 8. What production would need

- **MTN agreement:** production MoMo API access, with GHS settlement and real handset prompts.
- **Regulatory position:** collecting customers' money and paying it onward is typically treated as operating a payment service in Ghana, which generally means a Bank of Ghana licence or a licensed partner or aggregator. Confirm with MTN and a Ghanaian fintech lawyer; this document is not legal advice.
- **Hardening:** MTN callbacks instead of polling, idempotent requests, reconciliation, secure key storage and audit logging.
- **Privacy:** phone numbers and voice recordings are personal data, so collect consent and limit retention.
- **Lighter alternative:** voice-guide the user through MTN's own USSD menu (`*170#`) so our system never holds customer funds.

## 9. Suggested line for judges

"Every status you see comes straight from MTN's sandbox, and nothing is simulated by our app. The sandbox moves no real money, and going live would need MTN onboarding and regulatory clearance."