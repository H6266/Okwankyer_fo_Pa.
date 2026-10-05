# Ɔkwankyerɛfo Pa capability status

**Status date:** 2026-10-05
**Evidence policy:** A capability is not considered production-ready because code or a provider adapter exists. It must pass its runtime and integration checks. This checkout currently has no installed Node or Python toolchain dependencies, so those checks have not been reproduced in this work session.

## Verified repository state

| Area | Current code evidence | Status |
|---|---|---|
| Text understanding | Multiple overlapping paths remain. LocalLanguageBrain uses lexical rules and number extraction; the primary AiEngine still calls reasoningEngine. | Partial; not empirically evaluated |
| Confidence | Older implementations contain heuristic/static confidence values. The local brain now emits an explicitly uncalibrated lexical evidence score, not a probability. | Not calibrated |
| Gemini | Optional integrations exist. CognitiveRouter output is schema-checked; canonical orchestration is not fully routed through a centralized gateway. | Optional, not a core dependency |
| ASR | Local neural ASR requires a separately configured worker and model. DTMF/VAD utilities are not speech recognition. | Runtime not verified here |
| TTS | Fixed studio recordings are distinct from generated speech. Dynamic TTS routes through studio catalog, Piper, optional remote TTS, then an explicit development-only experimental fallback. | Runtime not verified here |
| MoMo transfers | The AI path now rejects implicit network/sender/recipient values and requires a real provider financial transaction ID before reporting completion. Multiple route/provider paths still exist outside a single fully consolidated saga. | Safety improved; consolidation incomplete |
| Airtime/data/bills | Some tools remain mock or unimplemented. They are not represented as verified provider completion by the unified tool registry. | Not production-ready |
| Balance inquiry | No authoritative subscriber-balance integration is established; the safe response directs users to the provider's handset channel. | Unavailable through this API |
| Memory | Production mode selects encrypted file repositories for sessions, conversations, preferences, transactions, semantic records, pronunciation, and task drafts. This is a single-host design; no PostgreSQL or multi-instance guarantee exists. | Durable single-host only |
| Evaluation | Fabricated benchmark claims were removed. The new safety and memory tests are present but could not run because `vitest` is not installed. | Evidence incomplete |
| Release/CI | Dataset validation and claim checks were improved in prior commits. Full typecheck, lint, tests, build, and release gates were not executable in this environment. | Not release-approved |

## Operating requirements and limits

- Production must set `ADMIN_TOKEN`, `SESSION_SECRET`, and `ENCRYPTION_KEY` to values of at least 32 characters; startup validation now fails otherwise. Production CORS must use explicit origins.
- Persistent local memory is encrypted with AES-256-GCM. Back up and protect `ENCRYPTION_KEY`; losing or rotating it without migration makes encrypted memory unreadable.
- Local ASR and Piper TTS require separately installed model runtimes and verified model files. No model weights are bundled or downloaded automatically.
- A transfer may be described as completed only when status is terminal-successful, source is `real_provider`, and a provider `financialTransactionId` is present. A local/reference ID is not provider evidence.
- MoMo route consolidation, PostgreSQL/shared idempotency, authenticated webhook replay handling, telephony hardening, and broad end-to-end tests remain unfinished.

## Release decision

**Not production-ready.** No overall AI score is published because the empirical evaluation and complete release gate have not passed. Do not use this report as evidence of transaction readiness or model accuracy.
