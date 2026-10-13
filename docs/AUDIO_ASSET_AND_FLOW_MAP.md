# Audio asset and conversation flow map

## Scope and inventory

The registry inventories **123 physical files**:

| Asset root | Files | Language/identity source |
|---|---:|---|
| `Audio_files/audio/` | 40 | Twi directory and canonical manifest path |
| `public/audio/` | 29 | `English/` and `Twi/` directories; root-level files are unresolved |
| `Audio_files_2/` | 54 | Language and prompt identity are unresolved |

The registry resolves **65 files to canonical prompt IDs**: 38 supplied Twi recordings and 27 language-labeled legacy recordings. There are **58 files without an established prompt ID** (including two language-known Twi files). The manifest provides at least one registered asset for 50 prompt/language pairs: English OP01–OP13 and Twi OP01–OP22, OP24–OP35, and OP37–OP39. This is not complete OP01–OP94 coverage.

The inventory and its exact per-file URL, MIME type, prompt ID, language, state, role, and asset-root metadata are exposed by `AUDIO_ASSET_INVENTORY` in [`src/audio/catalog.ts`](../src/audio/catalog.ts). Only language-resolved files receive playable URLs. Supplied `.m4a` files use `audio/mp4` and `/audio/supplied/`; legacy `.mp3` files use `audio/mpeg` and `/audio/`. The supplied-file server remains limited to registered paths under `Audio_files/audio/`.

### Canonical Twi files in `Audio_files/audio/`

The manifest path is primary identity evidence. The right-hand role is the registered role; the three dynamic recordings are variable-value prompts and must be composed with dynamic speech where needed.

| Exact asset path | Prompt | State | Role |
|---|---|---|---|
| `Audio_files/audio/Twi/01_Welcome_Session_Start/Acknowledge.m4a` | OP05 | ACKNOWLEDGE | fixed |
| `Audio_files/audio/Twi/01_Welcome_Session_Start/Language selection.m4a` | OP02 | LANGUAGE_SELECTION | fixed |
| `Audio_files/audio/Twi/01_Welcome_Session_Start/Processing.m4a` | OP06 | PROCESSING | fixed |
| `Audio_files/audio/Twi/01_Welcome_Session_Start/Welcome 1.m4a` | OP01 | WELCOME | fixed |
| `Audio_files/audio/Twi/01_Welcome_Session_Start/Welcome back.m4a` | OP04 | WELCOME_BACK | fixed |
| `Audio_files/audio/Twi/01_Welcome_Session_Start/what do you want to do.m4a` | — | — | unmapped; Twi known |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Choose instead.m4a` | OP15 | CHOOSE_INSTEAD | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Main service Unavailable.m4a` | OP11 | SERVICE_UNAVAILABLE | alternative |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/MTN menu.m4a` | OP09 | MTN_MENU | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Network selection.m4a` | OP08 | NETWORK_SELECTION | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Send money selected.m4a` | OP10 | SEND_MONEY_SELECTED | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Service alternative.m4a` | OP12 | SERVICE_ALTERNATIVE | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Service not ready.m4a` | OP13 | SERVICE_NOT_READY | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Service selection.m4a` | OP07 | SERVICE_SELECTION | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Service unavailable.m4a` | OP11 | SERVICE_UNAVAILABLE | fixed |
| `Audio_files/audio/Twi/02_Main_Service_Navigation/Try another service.m4a` | OP14 | TRY_ANOTHER_SERVICE | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Change recipient.m4a` | OP25 | CHANGE_RECIPIENT | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Enter recipient.m4a` | OP16 | ENTER_RECIPIENT | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Invalid recipient.m4a` | OP17 | INVALID_RECIPIENT | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient confirm.m4a` | OP22 | RECIPIENT_CONFIRM | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient found.m4a` | OP18 | RECIPIENT_FOUND | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient last 4.m4a` | OP21 | RECIPIENT_LAST4 | dynamic |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient name.m4a` | OP20 | RECIPIENT_NAME | dynamic |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient verification.m4a` | OP19 | RECIPIENT_VERIFY | alternative |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient verify.m4a` | OP19 | RECIPIENT_VERIFY | fixed |
| `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Use recipient.m4a` | OP24 | USE_RECIPIENT | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount prompt.m4a` | OP28 | AMOUNT_PROMPT | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount read back.m4a` | OP29 | AMOUNT_READBACK | dynamic |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount readback.m4a` | — | — | unmapped; Twi known |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount too high.m4a` | OP31 | AMOUNT_TOO_HIGH | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount too low.m4a` | OP32 | AMOUNT_TOO_LOW | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Change amount.m4a` | OP33 | CHANGE_AMOUNT | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Enter amount.m4a` | OP26 | ENTER_AMOUNT | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Invalid amount.m4a` | OP27 | INVALID_AMOUNT | fixed |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Repeat amount.m4a` | OP30 | REPEAT_AMOUNT | fixed |
| `Audio_files/audio/Twi/05_Transaction_Confirmation/Confirm speech.m4a` | OP37 | CONFIRM_SPEECH | fixed |
| `Audio_files/audio/Twi/05_Transaction_Confirmation/Confirmation intro.m4a` | OP34 | CONFIRMATION_INTRO | fixed |
| `Audio_files/audio/Twi/05_Transaction_Confirmation/Ready submit.m4a` | OP39 | READY_SUBMIT | fixed |
| `Audio_files/audio/Twi/05_Transaction_Confirmation/Reject speech.m4a` | OP38 | REJECT_SPEECH | fixed |
| `Audio_files/audio/Twi/05_Transaction_Confirmation/Review transaction.m4a` | OP35 | REVIEW_TRANSACTION | fixed |

### Language-labeled legacy assets in `public/audio/`

Filenames with a prompt number are associated with the same-numbered OP ID; the subdirectory supplies language metadata. No speech-content equivalence between alternate takes is assumed.

| Exact asset path(s) | Prompt(s) | Language | Role |
|---|---|---|---|
| `public/audio/English/Welcome_prompt_01.mp3` | OP01 | English | fixed |
| `public/audio/English/welcome_prompt_01.mp3` | OP01 | English | alternative |
| `public/audio/English/Audio_prompt_02.mp3` through `public/audio/English/Audio_prompt_13.mp3` | OP02–OP13 respectively | English | fixed |
| `public/audio/Twi/Welcome_prompt_01.mp3` | OP01 | Twi | alternative |
| `public/audio/Twi/welcome_prompt_01.mp3` | OP01 | Twi | alternative |
| `public/audio/Twi/Audio_prompt_twi_02.mp3` | OP02 | Twi | alternative |
| `public/audio/Twi/Audio_prompt_twi_03.mp3` | OP03 | Twi | fixed |
| `public/audio/Twi/Audio_prompt_twi_04.mp3` through `public/audio/Twi/Audio_prompt_twi_12.mp3` | OP04–OP12 respectively | Twi | alternative |

### Unresolved recordings (not playable by prompt ID)

`Audio_files_2/` files have neither reliable language metadata nor canonical prompt identity. Their names are inventory labels only; they do not establish the spoken content or a prompt mapping.

| Exact path | Language | Prompt ID | Status |
|---|---|---|---|
| `Audio_files/audio/Twi/01_Welcome_Session_Start/what do you want to do.m4a` | Twi | — | identity/role unresolved |
| `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount readback.m4a` | Twi | — | identity/role unresolved |
| `public/audio/Welcome_prompt_01.mp3` | unresolved | — | language unresolved; no URL |
| `public/audio/welcome_prompt_01.mp3` | unresolved | — | language and take relationship unresolved; no URL |
| `Audio_files_2/Another recipient.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Another transaction.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Anything else.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Auth received.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Authorize phone.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Back.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Balance Unavailable.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Cancel.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Check final status.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Check messages.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Check phone.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Confirm understanding.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Continue.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Correct prompt.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Customer Declined.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Did not get.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Exit.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Failed.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Failure Retry.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Finish.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Help command.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Help.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Input not recognized.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Keep reference.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Keypad option.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Main menu.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/No transfer confirmed.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Not understood.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Pin Block.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Pin Handoff.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Please respond.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Post success Help.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Processing.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Repeat Option.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Repeat.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Restart.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Secure pin.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Security warning.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Sensitive Block.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Session End.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Session timeout.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Start Again.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Submitted.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Success close.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Success sent.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Success.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/System Error.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Take your time.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Timeout.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Unsupported service.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Voice or keypad.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Waiting confirmation.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Yes -No.m4a` | unresolved | — | language/content/role unresolved |
| `Audio_files_2/Yes -no- keypad.m4a` | unresolved | — | language/content/role unresolved |

## Capability and narrative map

`SERVICE_CAPABILITIES` in [`src/domain/serviceCapabilities.ts`](../src/domain/serviceCapabilities.ts) currently enables Send Money on MTN only. Banking, balance checks, airtime, data, bill payment, and cash-out are unavailable. The live service/network/action menus use language-specific speech scripts when a canonical recording would advertise unavailable options (notably OP07/OP08/OP09). Banking selection is explicitly answered as unavailable; it is not a payment handler.

### Shared opening and guided IVR

1. `voice-menu` resolves OP01 welcome and OP02 language selection; English is used for this initial language gate. The DTMF or speech language response persists the chosen language and continues to `service-select`. It does not itself lock the input mode.
2. A valid service-menu DTMF response selects `GUIDED_IVR`; Send Money proceeds to the provider menu. A valid network selection is limited to MTN and proceeds to the action menu.
3. Action 1 enters recipient capture. Only recipient-entry/verification handlers treat input as a phone-number candidate. The captured string is passed through the existing Ghana number normalizer and validator; incomplete or invalid values do not advance. Menu-stage ten-digit input no longer jumps to recipient verification.
4. Recipient lookup is delegated to the existing resolver. A missing provider name remains absent (no synthetic name); the user confirms the resolver result before proceeding.
5. The amount path uses existing parsing and limits, persists a validated amount, then reviews dynamic recipient/amount information and requires explicit confirmation.
6. Confirmation enters the payment saga and its secure authorization handoff. No voice PIN collection is used. The state machine keeps an authorization-pending transfer distinct from completed success; provider callbacks/status results govern final transitions.

### Natural conversation

After language selection, speech is handled from the service-selection/conversation route by the existing ASR, intent and slot logic. Recognized intents are processed in current state; the existing transaction session carries recipient and amount slots. An accepted natural utterance selects `NATURAL_CONVERSATION`, while natural recipient entry uses the same phone validation and resolver path and does not require the guided keypad repeat step. Final transaction confirmation and secure authorization remain required. Unrecognized speech is handled through the existing recovery/clarification path. Free-form model output is not a payment handler.

Keypad and speech inputs must converge on the same transaction session. Switching channels does not clear recipient/amount fields. Session state and mode are visible to the phone simulator through the shared voice routes and response headers.

## Prompt and error outcomes

Prompt lookup is centralized in [`src/audio/recordingRegistry.ts`](../src/audio/recordingRegistry.ts) and [`src/modules/ttsService.ts`](../src/modules/ttsService.ts). It prefers a matching-language recording and uses registered script text only when that exact prompt has supported fallback text. An unresolved language or asset does not produce a playable URL. Missing Twi/English variants remain visible as coverage gaps.

| Internal condition | Canonical prompt | Notes |
|---|---|---|
| Invalid recipient number | OP17 | Twi recording available; English script fallback |
| Recipient verification | OP18–OP25 | Twi variants available; English variants missing |
| Invalid amount / limits | OP27, OP31, OP32 | Twi recordings available; English script fallback |
| Amount review | OP29 | Dynamic Twi recording; value must be supplied through the dynamic speech path |
| Unrecognized input / repeat | OP64–OP68 | No mapped recording in current manifest inventory; registered text fallback where provided |
| Balance unavailable | OP88 | Balance capability is off; no balance result is fabricated |
| Unsupported service | OP89 | Additional-folder file remains unresolved and is not played |
| Payment submitted / waiting | OP45–OP51 | Additional-folder files remain unresolved; use truthful current route/status responses |
| Success with reference | OP52–OP56 | Success must only follow authoritative provider success; matching Twi/English files are missing |
| Decline/failure/timeout | OP57–OP63 | Matching language recordings are missing; distinguish timeout/unknown from confirmed failure |
| System error | OP90 | No mapped recording; do not speak internal diagnostics |

Prompt coverage is incomplete: English audio ends at OP13; Twi recordings end at OP39 with OP23 and OP36 absent. OP40–OP94 have no mapped Twi or English recording. Dynamic manifest prompts without a mapped asset remain dependent on speech synthesis and must not be represented as recorded clips.

## Remaining gaps and external dependencies

- `Audio_files_2/` must be authoritatively labeled by language, prompt ID/state, role (fixed, fragment, dynamic, take), and content before any clip can safely be mapped. Filename similarity is not sufficient.
- The two public-root welcome files and two named supplied Twi clips need identity/take confirmation; the welcome-like public files are not playable until their language is established.
- English OP14–OP94 and Twi OP23, OP36, OP40–OP94 need recordings for full language parity.
- The MTN Mobile Money adapter, Africa's Talking callback deployment, webhook secret, and provider credentials/configuration are external requirements. A simulator/mock response is not a real payment result. A delayed or unavailable provider status must remain pending/unknown rather than be announced as success or failure.
- Real call routing and secure authorization depend on configured telecom/provider infrastructure. The repository's VoiceXML and simulator routes exercise application logic but do not deploy a carrier integration.
- Recorded fragments/alternatives have not been acoustically reviewed or transcribed here. Only manifest identity, explicit directory metadata, filename, file existence, and current code usage were used; no phrase-level claims are made for unresolved clips.
