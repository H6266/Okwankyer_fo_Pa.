# System Architecture & Technical Specifications
### Ɔkwankyerɛfo Pa ("The Good Guide")

---

## 1. High-Level Architecture Overview

Ɔkwankyerɛfo Pa functions as an **independent Voice Accessibility and Safety Layer** that connects cellular feature phone callers to Ghanaian Mobile Money (MTN MoMo, Telecel Cash, AT Money) and digital financial services via standard cellular voice calls (`+233 30 804 8098`).

```
                    CITIZEN CELLULAR HANDSET (Feature Phone or Smartphone)
                                             │
                                   PSTN / 2G / 3G / 4G Voice Call
                                             ▼
                             AFRICA'S TALKING TELEPHONY TRUNK
                                  (+233 30 804 8098)
                                             │
                                HTTP Webhooks / VoiceXML
                                             ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │                 ƆKWANKYERƐFO PA CORE APPLICATION                       │
       │                                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │  Inbound Webhook Router │  │  Webhook Security Guard             │  │
       │  │  (/voice-menu)          │  │  - SessionID validation             │  │
       │  └────────────┬────────────┘  │  - Optional shared secret           │  │
       │               │               └─────────────────────────────────────┘  │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Transaction State Mach. │  │ Recipient KYC Resolver              │  │
       │  │ (INITIATED → COMPLETED) │  │ - Sandbox fixtures (demo/)          │  │
       │  │ Idempotency Cache       │  │ - MTN MoMo API (live)               │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       │               │                                                        │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Dynamic Safe Readback   │  │ Dual-Track Speech / NLU Engine      │  │
       │  │ - Spoken exact Cedis    │  │ - Gemini ASR (English & Twi)        │  │
       │  │ - Spoken recipient/warn │  │ - Confidence threshold (≥ 0.75)     │  │
       │  │ - Unique per-tx Ref     │  │ - Guaranteed DTMF Keypad Fallback   │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       │               │                                                        │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Zero-PIN Handoff Gate   │  │ HTTP 206 Streaming Engine           │  │
       │  │ - Handset screen prompt │  │ - Byte ranges for telco channel     │  │
       │  │ - Never speaks/logs PIN │  │ - Path traversal protection         │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       └───────────────┼────────────────────────────────────────────────────────┘
                       │
                       ▼ Out-of-band RequestToPay
        ┌──────────────────────────────────────────────┐
        │        MTN MOBILE MONEY PARTNER API          │
        │   (Dispatches USSD PIN prompt to caller)     │
        └──────────────────────────────────────────────┘
```

---

## 2. Formal Transaction State Machine

Transactions advance strictly sequentially through an explicit state machine managed in `src/domain/stateMachine.ts`. Out-of-order transitions are rejected, and repeated webhooks are handled idempotently.

```
 [ INITIATED ]
       │
       ▼ (Recipient phone number validated & resolved)
 [ RECIPIENT_VERIFIED ]
       │
       ▼ (Valid Cedi/Pesewa amount validated)
 [ AMOUNT_ENTERED ]
       │
       ▼ (Caller presses Key 1 on Dynamic Safe Confirmation)
 [ CONFIRMED ]
       │
       ▼ (RequestToPay dispatched to telco provider)
 [ PIN_PENDING ]
       │
 ┌─────┴─────────────────────────┐
 │                               │
 ▼ (Handset USSD approved)       ▼ (Handset timeout or rejected)
[ COMPLETED ]                   [ FAILED ]

* Universal Transitions:
Any active state can transition to [ CANCELLED ] (caller presses 0 or says "cancel")
or [ TIMEOUT ] (no caller response after 2 re-prompts).
```

---

## 3. Component Separation & Directory Structure

```
├── /audio/                     # Studio-recorded audio files
│   ├── English/                # 11 English studio prompts
│   ├── Twi/                    # 12 Akan Twi studio prompts
│   └── Welcome_prompt_01.mp3   # Shared bilingual welcome prompt
├── /docs/                      # Documentation
│   ├── TWI_REVIEW.md           # Dialect review & linguistic flags
│   └── RENDER_RUNBOOK.md       # Render deployment instructions
├── /src/
│   ├── audio/                  # Audio catalog, dynamic prompt synthesis, HTTP 206 streaming
│   │   ├── catalog.ts          # Single source of truth for audio prompts
│   │   ├── dynamicPromptBuilder.ts # Dynamic Safe Confirmation & Receipt generator
│   │   └── streaming.ts        # Path-safe byte-range streaming service
│   ├── config/                 # Typed environment configuration
│   │   └── env.ts              # Validates configuration on boot
│   ├── demo/                   # Isolated test fixtures
│   │   └── recipientFixtures.ts# Clearly labeled sandbox test recipients
│   ├── domain/                 # Domain logic and state machine
│   │   ├── stateMachine.ts     # Idempotent transaction state machine
│   │   └── validation.ts       # Phone validation, amount parsing, PII redaction
│   ├── providers/              # Integration provider adapters
│   │   ├── recipient/          # RecipientResolver interface (Sandbox vs MTN Live)
│   │   └── telephony/          # Africa's Talking webhook security guard
│   ├── routes/                 # Modular Express route handlers
│   │   ├── adminRoutes.ts      # Protected admin endpoints (upload-audio)
│   │   ├── aiRoutes.ts         # Speech analysis, transcription, dialogue
│   │   ├── apiRoutes.ts        # Health check, smoke tests, sessions
│   │   ├── dashboardRoutes.ts  # Developer console, tasks, releases
│   │   ├── momoRoutes.ts       # MTN MoMo collections, transfers, balances
│   │   ├── shippingRoutes.ts   # Telecom verification status
│   │   └── voiceRoutes.ts      # Telephony VoiceXML callback routes
│   └── services/               # Core business services
│       ├── auditLogger.ts      # Redacted structured logger
│       ├── callSessionRepository.ts # Honest call logs and ledger
│       └── healthService.ts    # Real probes with measured latencies
├── /tests/                     # Test suites (Vitest)
│   ├── safeConfirmationAndSecurity.test.ts # Mismatch tests, traversal, PII tests
│   ├── ivrFullFlowIntegration.test.ts      # E2E simulated call sessions
│   └── callSessionPillars.test.ts          # Core architectural pillars
└── server.ts                   # Lean application entry point (< 180 lines)
```

---

## 4. Key Architectural Guarantees

1. **Safe Confirmation Mismatch Guarantee**: The system never plays static pre-recorded amounts or recipient names for financial confirmation. Spoken readbacks are generated dynamically for the caller's exact transaction inputs.
2. **Zero-PIN Security Boundary**: The IVR telephony stream NEVER captures, prompts for, records, or logs Mobile Money PINs. PIN authorization is strictly executed out-of-band by the network carrier via a USSD overlay on the caller's screen.
3. **Deterministic Idempotency**: Each transaction is assigned a unique idempotency key (`idemp_${sessionId}_${referenceId}`). Repeated webhook deliveries cannot double-charge a user.
4. **Honest Observability**: Real measured latencies, real file-existence probes on disk, and transparent labeling of sandbox/demo records.
