# MoMo Sandbox Event-to-Audio Telephony Bridge

Connect real-time MTN Mobile Money (MoMo) sandbox transaction callback feeds (Collection Request-to-Pay and Transfer Disbursement) directly into the Central Brain, dynamically resolving transaction status changes into authentic Akan Twi and English studio voice recordings (OP01–OP94) with automated, real-time telephony playback over Africa's Talking phone calls.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following core architectural decisions were confirmed in Phase 1 and govern this implementation plan:

- **Confirmed Decision 1 (MoMo Sandbox Feed Scope)**: Connect the brain to live transaction callbacks and webhook events, specifically tracking `PENDING` (awaiting handset PIN authorization), `SUCCESSFUL` (financial authorization settled), and `FAILED` (declined by user, insufficient funds, or expired).
- **Confirmed Decision 2 (Audio Resolution Strategy)**: Direct deterministic mapping to the existing authentic Akan Twi and English studio audio recordings (OP01–OP94), utilizing OP45–OP50 for authorization/processing and OP52–OP63 for settlement/decline outcomes.
- **Confirmed Decision 3 (Presentation & Telephony Gateway)**: Automated voice audio playback delivered directly on live Africa's Talking telephone lines via synchronous VoiceXML polling loops during active calls, supplemented by outbound telephony status callbacks if the user hangs up during PIN entry.

---

### 1. Overview & Core Concept

- **What It Does**: Bridges the asynchronous world of Mobile Money payments with real-time conversational telephony. When a caller confirms a transfer on a voice call, the USSD PIN prompt appears on their handset. Instead of dead silence or generic synthesized English text, the system listens to the MoMo sandbox webhook feed. As the sandbox transitions through `PENDING` -> `AUTH_RECEIVED` -> `SUCCESSFUL` / `FAILED`, the brain matches the exact event to high-fidelity Akan Twi or English studio recordings (e.g., OP49 *"Auth received"*, OP53 *"Success sent"*, OP57 *"Customer declined"*) and plays them immediately to the caller.
- **Target Audience / Persona**: Visually impaired citizens, elderly pensioners, and rural market traders across Ghana who rely on phone calls to initiate transactions and need clear, spoken audio cues in their mother tongue explaining what is happening on their handset in real time.
- **Key Value**: Completely eliminates the "blind drop" anxiety where callers are asked to enter their PIN on a handset while the call is disconnected or left in silence. Provides instant, authoritative voice verification of payment settlement directly from authentic Ghanaian studio recordings.

---

### 2. User Experience & Visual Design

#### Key Telephony User Flows

1. **Active Call Handset Authorization & Live Audio Feedback**:
   - Caller confirms sending 50 GHS to Kwame. The brain dispatches the MoMo collection request.
   - The telephony call transitions into a live waiting loop playing authentic studio prompt OP47 (*"Check phone - Please check your phone screen to enter your PIN"*).
   - In the background, the MoMo sandbox receives the subscriber's PIN approval and fires a webhook to `/api/momo/callback`.
   - The Brain Event Broker receives the callback, updates the session, and the next VoiceXML response immediately streams OP49 (*"Auth received - Your authorization has been received"*) followed by OP53 (*"Success sent - The transfer was successful"*).
   - The caller hears authentic, native Akan Twi studio audio confirming their transaction without ever checking USSD screens or reading text messages.

2. **Customer Decline or Timeout Recovery**:
   - If the subscriber cancels the USSD prompt or enters an invalid PIN in the sandbox, MoMo fires a failure callback (`status: FAILED`, `reason: APPROVAL_REJECTED` or `EXPIRED`).
   - The Brain Event Broker matches this failure reason to OP57 (*"Customer declined"*) or OP59 (*"Timeout"*), followed by OP60 (*"Failure retry - Please try your transaction again"*).
   - The call gracefully explains the issue in Twi or English before concluding or offering to restart.

3. **Operator & QA Observability (MoMo Lab & Simulator)**:
   - Operators on the `/dashboard/momo` and `/dashboard/phone` views see the live MoMo webhook feed updating in real time.
   - Each inbound feed item highlights: `Reference ID`, `Status`, `Resolved Canonical Prompt ID (e.g. OP49, OP53)`, and an interactive audio waveform preview button allowing instant listening.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Direct Mapping to Canonical Studio Recordings (OP01–OP94)
- **Chosen Approach**: Deterministic status-to-prompt lookup table mapping MoMo webhook event codes (`PENDING_USER_INPUT`, `SUCCESSFUL`, `APPROVAL_REJECTED`, `NOT_ENOUGH_FUNDS`, `TIMEOUT`) directly to existing authentic `.m4a` / `.aac` studio recordings.
- **Why**: Studio recordings deliver authentic native Akan Twi acoustic inflection and maximum clarity for non-literate callers, far surpassing synthetic formant voices for standard financial settlement messages.
- **Alternatives Considered**: Free-form LLM audio commentary was rejected because transaction status must be 100% deterministic, immediate, and cryptographically verified.

#### Decision 2: Telephony Keep-Alive vs. Outbound Callback Handoff
- **Chosen Approach**: Two-tier delivery model:
  1. *Tier 1 (In-Call Keep-Alive)*: While the caller remains on the line, VoiceXML `<GetDigits timeout="5">` loops play waiting audio (OP46/OP47) while polling for the webhook.
  2. *Tier 2 (Outbound Telephony Trigger)*: If the caller hangs up before entering their PIN, the webhook arrival triggers an automated Africa's Talking outbound call (`client.voice.call`) that dials the caller back to play the settlement prompt (OP53 or OP57).
- **Why**: Handset USSD popups sometimes suspend active calls on certain feature phones; having both Tier 1 and Tier 2 guarantees the caller hears the final resolution audio regardless of phone hardware.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MTN MOMO SANDBOX GATEWAY                           │
│   - Collection Request-to-Pay (USSD PIN Prompt Push)                        │
│   - Asynchronous Webhook Callback: POST /api/momo/callback                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP Webhook Event (referenceId, status)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOMO FEED EVENT BROKER                              │
│   - Validates Reference ID against active Telephony & Simulator sessions    │
│   - Normalizes Status: PENDING | SUCCESSFUL | REJECTED | TIMEOUT | FAILED   │
│   - Emits session event on internal Telephony Event Bus                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Session ID + Normalized Event Status
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CENTRAL BRAIN AUDIO RESOLVER                          │
│   - Inspects Session Language (Akan Twi / English)                          │
│   - Resolves Canonical Prompt ID from Authoritative Registry:               │
│       • SUCCESSFUL       ──► OP49 (Auth Received) + OP53 (Success Sent)     │
│       • REJECTED         ──► OP57 (Customer Declined)                       │
│       • TIMEOUT          ──► OP59 (Session Timeout)                         │
│       • FAILED           ──► OP58 (Failed) + OP60 (Failure Retry)           │
│       • WAITING_PIN      ──► OP47 (Check Phone) + OP46 (Waiting Conf.)      │
│   - Verifies Physical Audio File Exists (.m4a / .aac / .mp3)                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Public Canonical Audio URL(s)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AFRICA'S TALKING TELEPHONY ENGINE                       │
│   - In-Call VoiceXML: Streams <Play url="..."/> to caller on active line    │
│   - Outbound Trigger: If call dropped, dials caller & plays settlement audio│
│   - Dashboard Broadcast: Emits WebSocket packet to Live Audio Monitor UI    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Entities & Event Contracts

1. **MoMo Webhook Event Feed Schema**:
   - `referenceId`: UUID identifying the transfer or collection.
   - `externalId`: Internal session reference.
   - `status`: `"SUCCESSFUL"` | `"FAILED"` | `"PENDING"`.
   - `financialTransactionId`: Telco payment gateway reference.
   - `reason`: `"APPROVAL_REJECTED"` | `"NOT_ENOUGH_FUNDS"` | `"TIMEOUT"` | `"INTERNAL_ERROR"`.

2. **Status-to-Audio Registry Mapping**:
   | MoMo Sandbox Status | Brain Internal State | Canonical Prompt ID | Authentic Studio Audio File (Akan Twi) |
   |---|---|---|---|
   | `PENDING` (USSD Push) | `WAITING_CONFIRMATION` | `OP47` + `OP46` | `Audio_files/Check phone.m4a` + `Audio_files/Waiting confirmation.m4a` |
   | `AUTH_RECEIVED` | `AUTH_RECEIVED` | `OP49` | `Audio_files/Auth received.m4a` |
   | `SUCCESSFUL` | `TRANSACTION_SUCCESS` | `OP53` | `Audio_files/Success sent.m4a` |
   | `APPROVAL_REJECTED` | `CUSTOMER_DECLINED` | `OP57` | `Audio_files/Customer Declined.m4a` |
   | `TIMEOUT` | `TIMEOUT` | `OP59` | `Audio_files/Timeout.m4a` |
   | `FAILED` | `TRANSACTION_FAILED` | `OP58` + `OP60` | `Audio_files/Failed.m4a` + `Audio_files/Failure Retry.m4a` |

---

### 5. Implementation Roadmap & Milestones

1. **MoMo Feed-to-Session Bridge**:
   - Link incoming `/api/momo/callback` reference IDs directly to active `callSession` records in `src/routes/voiceRoutes.ts`.
   - Implement an in-memory event dispatcher that notifies waiting telephony sessions when a transaction updates.
2. **Deterministic Audio Search & Resolver Engine**:
   - Create a dedicated `MomoAudioFeedResolver` in `src/audio/` that accepts a sandbox status and session language, returning the exact public MP3 audio stream URLs for the canonical OP prompts.
3. **Telephony VoiceXML Keep-Alive & Playback Route**:
   - Add a `/telephony/poll-status` endpoint in `voiceRoutes.ts` using `<GetDigits timeout="4" callbackUrl="...">` that plays `OP47` / `OP46` while waiting, and immediately transitions to `OP53` or `OP57` VoiceXML `<Play>` tags as soon as the callback fires.
4. **Outbound Call Settlement Dispatcher**:
   - Implement an automated fallback trigger via Africa's Talking voice API (`client.voice.call`) that automatically calls back any user who disconnected before their payment callback arrived, playing the settlement audio.
5. **Dashboard Live Feed Monitor**:
   - Surface the live feed and matched audio prompts in the dashboard with immediate audio playback buttons for testing.
