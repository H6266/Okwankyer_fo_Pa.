# Ɔkwankyerɛfo Pa - Security Invariants & Safety Architecture (AI_SAFETY.md)

## 1. Core Principle
In Ɔkwankyerɛfo Pa, **no AI model is permitted to execute or authorize a financial transaction**. The language model acts solely as an untrusted interpreter. All policy enforcement, authorization, and execution are governed by deterministic, verifiable rules.

---

## 2. Formal Security Invariants

The cognitive and execution engines strictly enforce 15 inviolable security invariants:

### INVARIANT_001: PIN Never Reaches an AI Model or Tool
Under no circumstances may a PIN, passcode, or secret credential be passed to an LLM, NLU engine, persistent log, tool parameter, or external API. Any detected PIN must be stripped at perception and replaced with `[REDACTED_PIN]`.

### INVARIANT_002: PIN Never Reaches Persistent Memory
Working memory, session logs, audit databases, and conversation records must immediately purge any token matching a detected PIN.

### INVARIANT_003: Unknown Tools Never Execute
The `UnifiedToolRegistry` maintains a closed, strictly typed allowlist of canonical tools. Any proposed tool not explicitly registered is rejected immediately.

### INVARIANT_004: Financial Execution Requires Explicit Confirmation
High-risk actions (money transfers, airtime purchases, bill payments, cash outs) cannot execute unless the caller has explicitly confirmed after hearing a safe readback containing the verified recipient name, network, and exact amount.

### INVARIANT_005: Expired Confirmation Cannot Execute
Confirmation drafts have a hard time-to-live (default 120 seconds). Any confirmation received after expiration is void and requires re-confirmation.

### INVARIANT_006: Changing Amount or Recipient Invalidates Confirmation
If a caller changes the recipient phone number, recipient name, or transaction amount after confirming, the confirmation is instantly revoked, and the caller must confirm the new details.

### INVARIANT_007: Financial Actions Must Be Idempotent
Every financial request generates a cryptographically unique `idempotencyKey` derived from the session, timestamp, and transaction parameters. Retries with the same key must return the original transaction record rather than executing a second charge.

### INVARIANT_008: AI Cannot Authorize Its Own Financial Transaction
The AI planner may only propose an action. Confirmation state must be set by deterministic input verification (DTMF `#` / `1` or explicit affirmative voice token `"aane"` / `"yes"`).

### INVARIANT_009: Mock/Simulator Providers Cannot Execute in Production
In production environments (`NODE_ENV === "production"`), mock or sandbox financial services fail closed immediately with a `SECURITY_INVARIANT_VIOLATION`.

### INVARIANT_010: Failed Provider Operations Can Never Be Spoken as Success
The dialogue and speech engines must verify the authoritative status (`COMPLETED` or `SUCCESSFUL`). A `202 ACCEPTED` or pending state can only be reported as "in progress".

### INVARIANT_011: Unverified Recipient Identity Must Never Be Presented as Verified
If the telco KYC lookup fails or is unavailable, the caller must be told: *"The recipient name could not be verified by the network. Please confirm the number carefully."*

### INVARIANT_012: Missing Financial Parameters Must Fail Closed
If a required parameter (sender phone, recipient phone, amount, biller, account) is missing or cannot be validated, the transaction fails closed. **The system must never substitute a fictional default value.**

### INVARIANT_013: Provider Acceptance Is Not Transaction Completion
When MTN MoMo API returns `202 Accepted` for a Request-to-Pay, funds have not yet moved. The system transitions to `WAITING_FOR_CUSTOMER_AUTHORIZATION` and polls or waits for webhook confirmation before announcing completion.

### INVARIANT_014: Any Balance Spoken Must Be Provider-Confirmed
If the wallet balance API is unsupported or unavailable, the system returns `BALANCE_NOT_AVAILABLE_VIA_API` and directs the user to USSD `*170#`. **A dummy balance like GHS 250.00 must never be spoken.**

### INVARIANT_015: Spoken Receipts Must Be Based on Authoritative Completed Data
Receipt prompts must reflect the exact amount, reference ID, and fee confirmed by the authoritative provider upon completion.

---

## 3. Context-Aware PIN Security

To avoid false positives that degrade accessibility, the PIN detector is **dialogue-step aware**:
1. **Explicit Credential Words**: Keywords like "PIN", "passcode", "secret", "ahintasɛm", "kokoam" are dropped and redacted in **all** contexts.
2. **Amount Step Differentiation**: At the `enter-amount` step, values between 1 and 5000 (e.g., "1000", "2500", "5000") are valid financial amounts in Ghana Cedis. They are **not** blocked as PINs.
3. **Standalone 4-Digit Sequences at Menu Steps**: A 4-digit spoken sequence at a menu step (where no digits were requested) is treated as a probable spoken PIN, redacted immediately, and triggers the educational prompt:
   - *Twi*: *"Yɛmfa wo MoMo PIN wɔ fon ano. Mepa wo kyɛw, hwɛ wo fon screen na bɔ wo PIN wɔ hɔ pɛpɛɛpɛ."*
   - *English*: *"Never speak your MoMo PIN on a call. Please check your phone screen to enter your PIN securely."*
