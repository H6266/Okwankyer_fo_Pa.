# MoMo Cash-Out & Voice Withdrawal Architecture Plan

A voice-first cash withdrawal workflow for **Ɔkwankyerɛfo Pa**, enabling Ghanaian Mobile Money users (including visually impaired, elderly, and market traders) to safely allow cash-out, verify balances and telco withdrawal fees, and approve agent requests without ever exposing their PIN to agents or bystanders.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions have been aligned on and will govern the implementation:

- **Automatic Caller ID**: The system automatically reads the caller's phone number from telephony metadata (ANI / Caller ID); the AI **never** asks users for their own number for withdrawals.
- **Pure "Allow Cash-Out" Telco Model**: Cash withdrawal is NOT treated as a peer-to-peer transfer. When a user says "I want to withdraw money", the system enables Cash-Out on their wallet.
- **System vs. AI Boundary**: The LLM/AI acts solely as a conversational dialogue interface. It never checks balances, validates PINs, or computes fees directly. The backend system performs calculations and hands structured results to the AI.
- **Proactive Balance & Fee Check**: After enabling Cash-Out, the system asks if the user wants to verify if they have enough balance. If YES, it requests PIN; if NO, it skips without forcing PIN entry.
- **Handling "GH₵30 for GH₵30" (Fee Calculation)**: If balance is tight, the system calculates the telco cash-out fee (e.g., 1%) and computes the exact maximum cash they can collect (e.g., GH₵29.50) so transactions do not fail at the agent counter.
- **Early PIN Blurt Protection**: If a user speaks their 4-digit PIN prematurely:
  1. The ASR and transcript cleaner immediately redact it to `****` in all logs, displays, and LLM prompts.
  2. The secure payment vault captures the digits.
  3. If they haven't heard the agent name and withdrawal amount yet, the AI holds execution and verifies the details first before approving.
- **Approval Assistance**: The user can choose to remain on the call while the agent enters the withdrawal, or hang up and call back for voice approval.

---

### 1. Overview & Core Concept

- **What It Does**: Provides an end-to-end voice guide for MoMo cash withdrawals at physical agent stalls. It turns on wallet Cash-Out, proactively warns users about telco withdrawal fees, protects them from agent overdraft failures, and enables secure approval without sharing PINs with agents.
- **Target Audience**: Ghanaian citizens withdrawing cash at MoMo kiosks, especially rural traders, elderly pensioners, and visually impaired users who are vulnerable to PIN theft and agent confusion.
- **Key Value**: Zero PIN disclosure to agents, zero math confusion over withdrawal fees, and seamless voice approval.

---

### 2. User Experience & Conversational Flow

```
[ User: "Mepɛ sɛ meyi sika" / "I want to withdraw money" ]
                           │
                           ▼
             System Enables "Allow Cash-Out"
             (15-Minute Authorization Window)
                           │
                           ▼
          AI: "Cash-Out is now enabled. Would you
               like to check your balance and fees?"
              ┌────────────────────────┴────────────────────────┐
              ▼                                                 ▼
      [ User says YES ]                                 [ User says NO ]
              │                                                 │
   Prompt PIN for Balance                               Skip PIN prompt
              │                                                 │
   System checks Wallet + Fees                                  │
   (e.g., GH₵30 bal -> max GH₵29.50 cash)                       │
              │                                                 │
              └────────────────────────┬────────────────────────┘
                                       │
                                       ▼
                       Approval Assistance Choice
        "I can wait on the line with you, or you can hang up
         and call back when the agent enters the withdrawal."
                                       │
               ┌───────────────────────┴───────────────────────┐
               ▼                                               ▼
      [ Wait on Line ]                                  [ Call Back ]
               │                                               │
   User: "Agent is done" /                              User dials back:
   Incoming Prompt Detected                             "Approve transaction"
               │                                               │
               └───────────────────────┬───────────────────────┘
                                       │
                                       ▼
                  System Reads Request to Caller:
              "Agent [Name] is requesting GH₵[Amount].
                    Fee is GH₵[Fee]. Do you approve?"
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼                                                           ▼
 [ User says "Yes" ]                                   [ User blurts "Yes, PIN is 1234" ]
         │                                                           │
 Secure PIN-Gate Ladder                                      Instant Redaction (****)
 (5s gentle -> 15s keypad -> 20s hangup)                     Vault checks & approves immediately
         │                                                           │
         └─────────────────────────────┬─────────────────────────────┘
                                       │
                                       ▼
                          Success & Privacy Advisory:
            "Withdrawal approved. Tip: You can also use your keypad
             quietly next time so bystanders don't overhear your PIN."
```

#### Dialogue Scripts:
* **Twi (Allow Cash-Out & Balance Offer):**
  * *"Yɛabue kwan ama wo sɛ wotumi yi sika wɔ MoMo agent hɔ. Wobɛpɛ sɛ yɛhwɛ wo sika a aka ne sika a telco no bɛgye ansa na woayi?"*
* **Twi (Insufficient with Fee Explanation):**
  * *"Wo sika a ɛwɔ wo account mu nyinaa yɛ 30 cedis. Esiane sɛ MTN gye pesewas 30 sika-yi ho nti, wontumi nyi 30 no nyinaa. Nea wotumi yi pɛpɛɛpɛ seesei yɛ 29 cedis ne pesewas 50. Ka kyerɛ agent no sɛ onyi 29 cedis ne pesewas 50 mma wo."*
* **Twi (Approval Readback):**
  * *"MoMo Agent Kofi Mensah rebisa sɛ obeyi sika cedis 50 afiri wo account mu. Wopene so?"*

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: No Upfront Amount Required to Enable Cash-Out**
  - *Chosen Approach*: Enable Cash-Out globally on the wallet first, matching real-world telco USSD behavior (`*170#` -> Allow Cash Out -> Yes).
  - *Why*: In Ghana, the agent enters the amount on their POS terminal; the user does not need to pre-commit to an amount before unlocking Cash-Out.
- **Decision 2: Fee-Aware Balance Calculator**
  - *Chosen Approach*: The backend computes both standard withdrawal fees (1% up to GH₵1,000) and net allowable cash.
  - *Why*: Eliminates the frequent "insufficient funds" rejections caused by users forgetting about the withdrawal fee.
- **Decision 3: Multi-Layer PIN Redaction & Premature Capture**
  - *Chosen Approach*: Immediate regex and acoustic masking for 4-digit sequences before transcript persistence; passing digits directly to the secure PIN vault.
  - *Why*: Prevents PIN exposure in telemetry and browser logs while accommodating natural user speech patterns.

---

### 4. Technical Architecture & State Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Telephony Gateway                             │
│                  (Africa's Talking / SIP / Audio Ingest)                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Caller ID: 0543546010
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AI Orchestrator / NLU                          │
│  • Intent Extraction: CASH_OUT_REQUEST, BALANCE_CHECK, APPROVE_CASHOUT │
│  • PII & PIN Redactor: Masks \b\d{4}\b to [REDACTED_PIN]               │
└──────────────────┬───────────────────────────────▲─────────────────────┘
                   │ Extracted Intent              │ Structured Narrative
                   ▼                               │
┌──────────────────────────────────────────────────┴─────────────────────┐
│                       System Cash-Out Manager                          │
│  • enableCashOut(callerMsisdn, ttl=15m)                                │
│  • getWalletBalance(callerMsisdn, pinToken)                            │
│  • computeMaxWithdrawal(balance, telcoFeeRules)                        │
│  • getPendingApproval(callerMsisdn)                                    │
│  • executeApproval(callerMsisdn, approvalId, pin)                      │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Secure Telco / MoMo API                         │
│             (MTN MoMo API / Telecel Sandbox / Core Banking)            │
└────────────────────────────────────────────────────────────────────────┘
```

#### State Machine Flow:
1. `IDLE` $\rightarrow$ User requests withdrawal $\rightarrow$ `CASHOUT_ENABLED`
2. `CASHOUT_ENABLED` $\rightarrow$ Ask balance check $\rightarrow$ `AWAITING_BALANCE_CHOICE`
3. If Choice = Yes $\rightarrow$ `PIN_GATE_BALANCE` $\rightarrow$ `BALANCE_REPORTED`
4. If Choice = No $\rightarrow$ `AWAITING_AGENT_SUBMISSION`
5. Agent submits withdrawal $\rightarrow$ `CONFIRMING_WITHDRAWAL_DETAILS`
6. User confirms $\rightarrow$ `PIN_GATE_APPROVAL` $\rightarrow$ `CASHOUT_COMPLETED`
7. (Fast Path): If user speaks PIN alongside confirmation $\rightarrow$ direct to `CASHOUT_COMPLETED` with privacy advisory.

---

### Next Steps Once Approved

Upon your explicit approval ("Proceed"), we will:
1. Implement the backend `CashOutService` and fee calculator with Ghanaian telco fee schedules (MTN/Telecel).
2. Wire the intent handling and early PIN redaction filter into the conversational orchestrator and NLU parser.
3. Update the interactive Phone Simulator page with cash-out test fixtures (including the "GH₵30 wallet" test scenario and agent approval mock).
4. Run comprehensive test verification across English and Twi flows.
