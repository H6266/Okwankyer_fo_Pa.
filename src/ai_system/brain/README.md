# Ɔkwankyerɛfo Pa - Central Reasoning Brain

The Central Reasoning Brain sits between Telephony ASR (Automatic Speech Recognition) and TTS (Text-to-Speech). It orchestrates telephony conversational understanding, slot settling, service gating, and deterministic reply generation.

---

## The 5-Stage Pipeline

```
 Utterance ──► [ 1. UNDERSTAND ] ──► [ 2. SETTLE ] ──► [ 3. GATE ] ──► [ 4. DISPATCH ] ──► [ 5. REPLY ] ──► TTS
                    │                     │                │                │                 │
                    ▼                     ▼                ▼                ▼                 ▼
              Zero-PIN Guard       Margin Checks    ServiceRegistry     Service Handler   ReplyComposer
            Language Resolution     Missing Slots    Ready/Not-Ready    (PaymentSaga)     (Zero Digits)
```

1. **UNDERSTAND**: Resolves intent and slots using the caller's detected and session language. The **Zero-PIN guard runs before any model or storage**—spoken PINs are immediately intercepted and scrubbed.
2. **SETTLE**: If intent confidence is ambiguous, missing, or top candidates are within the margin, asks for clarification (`clarify_intent`). If a required slot is missing, asks to clarify that specific slot (`clarify_slot`). Never commits on a guess.
3. **GATE**: Checks the settled intent against the `ServiceRegistry`. Unbuilt intents are recognized as `not_ready` without guessing or hallucinating.
4. **DISPATCH**: If the service is `ready`, all required slots are validated, and the caller has explicitly confirmed, hands off to the service handler.
5. **REPLY**: Generates and validates one spoken sentence in the caller's language with deterministic slot injection, zero digits, and studio prompt catalog matching.

---

## How to Add a New Service (Airtime, Bill Pay, etc.)

Adding a new service requires **zero changes to `brain.ts`**. You only add a new service folder and register it with the `serviceRegistry`.

### Step 1: Create Your Service Module

Create a folder in `src/services/<service_name>/index.ts`:

```typescript
import { SlotSpec, ServiceHandler } from '../../ai_system/brain/types';
import { serviceRegistry } from '../../ai_system/brain/serviceRegistry';

// 1. Define required slots
export const AIRTIME_REQUIRED_SLOTS: SlotSpec[] = [
  { name: 'amount', type: 'amount', required: true, description: 'Airtime amount in GHS' },
  { name: 'recipientPhone', type: 'phone', required: true, description: 'Phone number to top-up' },
];

// 2. Define handler
export const airtimeHandler: ServiceHandler = async ({ slots, sessionLanguage, callerNumber }) => {
  // Validate and execute provider call...
  return {
    success: true,
    result: { transactionId: 'TX-12345' },
  };
};

// 3. Register with ServiceRegistry
serviceRegistry.register({
  intent: 'momo.buy_airtime',
  status: 'ready',
  requiredSlots: AIRTIME_REQUIRED_SLOTS,
  handler: airtimeHandler,
});
```

### Step 2: Import the Registration

Import your new service in `src/services/index.ts` or during server bootstrap:

```typescript
import './services/airtime';
```

`brain.ts` will automatically gate, validate required slots, confirm, and dispatch to your handler.
