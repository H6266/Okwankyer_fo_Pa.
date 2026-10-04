# Ɔkwankyerɛfo Pa - Layered Cognitive Architecture (AI_ARCHITECTURE.md)

## 1. High-Level Vision
Ɔkwankyerɛfo Pa ("The Good Guide") is a voice-first cognitive accessibility system designed for Ghanaian Digital Financial Services (Mobile Money and IVR). It bridges digital literacy, vision, and language barriers by providing spoken conversational interactions in **Akan Twi** (Asante and Akuapem), **Ghanaian English**, and **bilingual code-switching**, with instant DTMF keypad fallback.

The architecture strictly rejects the "toy chatbot" paradigm. AI models are **untrusted advisors** that propose intents, extract slots, and formulate conversational dialogue. Deterministic, cryptographically verifiable policies, capability engines, and state machines serve as the **authoritative execution and safety gates**.

---

## 2. The 20-Stage Cognitive Processing Lifecycle

Every voice, audio, DTMF, or text interaction executes across 20 distinct stages:

```
 1. PERCEPTION                  Audio ingest, 8kHz/16kHz resampling, VAD, DTMF detection
 2. LANGUAGE IDENTIFICATION     Language classifier (English, Asante Twi, Akuapem Twi, Code-Switch)
 3. SPEECH NORMALIZATION        Phone numbers, currency (GHS, cedis, pesewas), Akan number words
 4. CONTEXT HYDRATION           Session state, working memory, profile, past turns
 5. INTENT UNDERSTANDING        Local NLU classifier -> Local SLM -> Optional Gemini
 6. ENTITY / SLOT EXTRACTION    Phone, amount, recipient name, carrier network, biller
 7. COREFERENCE RESOLUTION      "him", "her", "that person", "same amount", "send to Kofi instead"
 8. TASK REASONING              Fact vs Inference vs Assumption vs Unknown
 9. DOMAIN RETRIEVAL            MoMo grammar, telco codes, carrier prefixes, KYC directory
10. POLICY & SAFETY ANALYSIS    Zero-PIN Gate, Invariants INVARIANT_001..015, Rate Limits
11. DECISION                    Determine Next Best Action (Clarify, Prompt, Route, Execute)
12. ACTION PLANNING             Structured Action Proposal (strictly unexecuted)
13. TOOL AUTHORIZATION          Verify draft expiration, material change check, user confirmation
14. TOOL EXECUTION              Unified Tool Registry (authoritative provider calls)
15. RESULT VERIFICATION         TruthEngine: verify provider receipt, assert not assumed
16. DIALOGUE GENERATION         Generate concise single-slot prompt in caller's active dialect
17. SPEECH GENERATION           Local Ghanaian TTS -> Generic Local TTS -> Optional Cloud TTS
18. BARGE-IN & INTERRUPTION     Cancel speech if speech activity detected on incoming channel
19. MEMORY UPDATE               Update Working, Session, Episodic, Task, and Transaction Memory
20. SELF-EVALUATION             Internal truth and certainty reflection, trace logging
```

---

## 3. Cognitive State Representation

The runtime cognitive state cleanly separates epistemic categories:
```typescript
export interface CognitiveState {
  facts: Map<string, any>;          // Verified by authoritative provider or user affirmation
  inferences: Map<string, any>;     // Deduced from conversation history with high confidence
  assumptions: Map<string, any>;    // Tentative defaults; NEVER treated as facts
  uncertainties: Map<string, any>;  // Ambiguous slots requiring targeted clarification
  unknowns: Set<string>;            // Required slots that have not been provided

  sessionId: string;
  activeLanguage: "en" | "tw" | "en-tw";
  activeTask: TaskState | null;
  interruptedTasks: TaskState[];
  currentScreen: string;
  currentStep: string;
  workingSlots: Record<string, any>;
  confirmedSlots: Set<string>;
  transactionDraft: TransactionDraft | null;
  conversationHistory: TurnRecord[];
}
```

### Invariant: Separation of Epistemic Levels
**An assumption or inference must NEVER be converted into a fact.**
- If a caller says "Send money", the recipient is `UNKNOWN`.
- If a caller previously sent money to "Ama", `recipient = Ama` is an `INFERENCE` or `ASSUMPTION` only if explicitly requested ("same person").
- A monetary balance is an `UNKNOWN` unless returned by an authoritative banking/telco provider.

---

## 4. Multi-Brain / Capability-Based Architecture

Rather than hardcoding calls to a single cloud provider, all cognitive operations are routed through the **ModelRouter**:

| Capability | Tier 1 (Primary) | Tier 2 (Secondary) | Tier 3 (Cloud Fallback) |
|---|---|---|---|
| **Speech-to-Text (ASR)** | Local Ghanaian Offline ASR (8/16kHz) | GhanaNLP Whisper Twi | Gemini Multimodal Audio |
| **Language Detection** | Local N-Gram & Lexicon Classifier | Local FastText/Compact ML | Cloud Model |
| **Intent & Slot NLU** | Deterministic Ghanaian NLU Engine | Local Compact SLM (1B/Q4) | Gemini Reasoning Model |
| **Complex Dialogue** | Local Dialogue State Machine | Local Instruction SLM | Gemini Flash Reasoning |
| **Text-to-Speech (TTS)**| Local Ghanaian Phoneme Synthesizer | Pre-recorded Studio Audio | Gemini Cloud TTS Voice |
| **Financial Safety** | Deterministic Policy Engine | Invariant Validator | *External AI Prohibited* |
| **Tool Execution** | Unified Tool Registry | *External AI Prohibited*| *External AI Prohibited* |

---

## 5. Truth Engine Architecture

The `TruthEngine` acts as an independent verifier before any statement or execution is permitted:
- `assertKnown(slotName, value)`: Verifies value is present and non-empty.
- `assertProviderConfirmed(transactionId)`: Reconstructs state from durable storage and validates provider receipt.
- `assertUserConfirmed(draft)`: Verifies user provided explicit affirmation after hearing exact recipient and amount.
- `assertNoMaterialChanges(draft, currentSlots)`: Verifies amount and recipient did not mutate post-confirmation.
- `assertNotExpired(draft)`: Verifies confirmation was given within the allowable time window (default 120s).
- `assertBalanceAvailable(source)`: If subscriber balance is not exposed via telco API, returns `BALANCE_NOT_AVAILABLE_VIA_API` and directs user to USSD `*170#`.

---

## 6. Durable Payment Saga State Machine

Financial operations strictly adhere to an asynchronous, idempotent saga:
```
DRAFT
  ↓
RECIPIENT_VERIFIED (via Telco KYC Lookup)
  ↓
AMOUNT_VERIFIED (validated against limits: min 1 GHS, max 5000 GHS)
  ↓
CONFIRMATION_REQUESTED (spoken safe readback: "Kwame Nyamebere ending in 8464")
  ↓
CONFIRMED (user presses 1 or speaks "aane" / "yes")
  ↓
REQUEST_TO_PAY_PENDING (telco collection push dispatched)
  ↓
WAITING_FOR_CUSTOMER_AUTHORIZATION (USSD prompt on customer phone)
  ↓
COLLECTION_CONFIRMED (webhook / status poll confirms funds reserved)
  ↓
DISBURSEMENT_INITIATED (funds dispatched to recipient wallet)
  ↓
DISBURSEMENT_CONFIRMED (telco confirms recipient credited)
  ↓
COMPLETED (authoritative receipt generated and spoken)
```

**Failure Branches**:
- `CUSTOMER_DECLINED`: User canceled PIN prompt on handset.
- `COLLECTION_TIMEOUT`: User took > 120s to respond to USSD prompt.
- `DISBURSEMENT_FAILED`: Recipient wallet suspended or limit reached -> triggers automatic reconciliation.
- `RECONCILIATION_REQUIRED`: System flags transaction for manual/automated reversal.
