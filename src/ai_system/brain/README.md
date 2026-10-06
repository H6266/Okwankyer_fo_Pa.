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

---

## How to Add a New Dialect or Language

To add support for a new dialect (e.g. Fante, Akuapem Twi, Ga, Ewe):

### Step 1: Create a Language Profile
Create a new profile in `src/ai_system/brain/languageProfiles/<dialect_name>.ts` conforming to `LanguageProfile`:
```typescript
import { LanguageProfile } from './types';

export const fanteProfile: LanguageProfile = {
  id: 'twi-fante',
  name: 'Mfantse (Fante)',
  dialectFamily: 'Akan',
  confirmationAffirmations: ['aane', 'nyew', 'yoo'],
  confirmationNegations: ['dabi', 'mma no', 'gyae'],
  cancellationKeywords: ['gyae', 'mompɛ', 'dabi'],
  numberLexicon: {
    1: 'koro',
    2: 'ebien',
    3: 'ebiasa',
  },
  systemPromptGuidance: `You are speaking with a native Fante speaker. Follow standard Mfantse phonology and vocabulary conventions.`,
};
```

### Step 2: Register in `languageProfiles/index.ts` and `languagePolicy.ts`
1. Export the profile in `src/ai_system/brain/languageProfiles/index.ts`.
2. Add language detection cues and fallback rules in `languagePolicy.ts`.
3. In production, unapproved dialects are gated behind `allowUnapprovedDialects` (default `false`) until reviewed.

---

## Linguistic Approval Workflow & Production Build Gate

To guarantee safety and prevent AI hallucinations or culturally inauthentic speech:

1. **Reviewed Data Repository (`data/reviewed_templates.json`)**:
   Every reply template and spoken number word must have an entry in `data/reviewed_templates.json`:
   ```json
   {
     "templates": {
       "confirm": {
         "approved": true,
         "reviewer": "Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)",
         "reviewedAt": "2026-10-04T12:00:00Z",
         "notes": "Verified authentic Asante and Akuapem orthography"
       }
     }
   }
   ```
2. **Mandatory Metadata Invariant**:
   Any entry with `"approved": true` **MUST** include both `reviewer` (string) and `reviewedAt` (valid ISO date timestamp).
3. **Production Build Refusal**:
   During production builds and initialization, `approvalWorkflow.validateProductionApprovals()` inspects all records.
   If any entry has `"approved": true` without reviewer or date metadata, the build immediately aborts with:
   `PRODUCTION_BUILD_REFUSED: Linguistic approval metadata incomplete`.

---

## Shadow Mode & Observability

Shadow mode evaluates model reasoning against offline deterministic ground truth without altering caller conversations:

1. **Execution**: The offline engine controls the caller response. In the background, the Gemini reasoning model runs concurrently on the sanitized transcript.
2. **Strict Zero-PII Log**:
   Disagreements are stored via `shadowEngine.getDisagreements()`.
   **Zero-PII guarantee**: Phone numbers, amounts, and names are stripped. Only `hasAmount`, `hasRecipientPhone`, intent names, and `disagreementType` are logged:
   ```json
   {
     "id": "shadow-1730000000000-abcde",
     "timestamp": "2026-10-06T13:30:00.000Z",
     "language": "twi-asante",
     "turnId": 1,
     "disagreementType": "INTENT_MISMATCH",
     "offlineDecision": {
       "intent": "momo.transfer",
       "kind": "confirm",
       "hasAmount": true,
       "hasRecipientPhone": true
     },
     "modelDecision": {
       "intent": "momo.pay_bill",
       "confidence": 0.88,
       "kind": "confirm",
       "hasAmount": true,
       "hasRecipientPhone": false
     }
   }
   ```
3. **How to Read the Log**:
   - `INTENT_MISMATCH`: The model and offline engine chose different intents.
   - `DECISION_KIND_MISMATCH`: One wanted to clarify while the other wanted to confirm or dispatch.
   - `SLOT_PRESENCE_MISMATCH`: Discrepancy in whether required slots were extracted.

