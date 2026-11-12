# User Memory Architecture Audit

**Audit date:** 2026-11-11
**Scope:** Existing memory modules, runtime integration, persistence, retrieval, and nearby tests.

## Findings

- Production `UnifiedMemory` selects encrypted file repositories for profile preferences, semantic vectors, sessions, conversations, tasks, pronunciations, and transaction records. The durable preference repository is user-keyed and is read by `aiEngine`; it is not connected to the separate `PreferenceMemory` class.
- `PreferenceMemory` and `UserProfileManager` use process-local maps. Writes through those APIs do not survive restart, and profile updates are not wired into the engine's durable profile reads.
- `MemoryRetriever.retrieve` does not use its utterance argument, returns a fixed `0.95` relevance score, and is not called by `aiEngine`. The active engine instead searches semantic turn records directly.
- `MemoryConsolidator` promotes the language detected for any session to an explicit permanent user preference. Session language is not evidence of a permanent preference.
- Durable semantic vectors are partitioned by `sessionId`; the repository has no user-level search contract. `UnifiedMemory.searchSemanticMemory` returns prior turns only from that same session, so authenticated-user cross-session retrieval is unsupported.
- Semantic storage records masked conversation turns, not a structured user knowledge model. There is no goal/need lifecycle, memory relationship model, decision/extraction engine, user consent/inspection/deletion API, or memory-feedback workflow in the inspected path.
- Embedding generation distinguishes Gemini embeddings from a lexical fallback, but `UnifiedMemory.recordTurn` persists only the vector and drops its source. Search has no lexical fallback ranking path and does not expose score or retrieval rationale.
- Existing durable repositories encrypt records, hash identifiers for filenames, and use atomic file replacement. This is single-host persistence, not transactional or safe for multiple application instances. Existing tests cover session path hashing, vector persistence per session, and task persistence, but not durable preferences or cross-session memory.
- The cognitive engine supplies recent turns and same-session semantic turns to reasoning. It does not construct a compact, ranked user-memory context. Financial transaction confirmation remains handled through separate task/draft and safety paths; this audit does not propose changing those paths.

## Recommended Staging

1. Establish one durable profile/preference write path and stop session-language promotion.
2. Add explicit extraction decisions and goal/need records with lifecycle and links.
3. Add user-scoped retrieval and provenance-aware ranking without treating lexical fallback as semantic evidence.
4. Integrate bounded structured memory context into the engine/router, preserving financial safeguards.
5. Add consent, inspection, correction, deletion, retention, and end-to-end regression coverage.

## Constraints and Risks

Keep the encrypted-file adapter as the initial persistence target; no database URL, PostgreSQL dependency, or vector database is configured in the inspected deployment. Its single-instance limitation should be addressed before horizontal scaling. Preference persistence currently stores a `UserProfileData` object without per-field provenance, expiry, consent, or confirmation metadata; the next stage must add those semantics without making the existing profile and preference records competing sources of truth.

Do not treat language detection, an isolated request, or model inference as an explicit permanent preference. Do not persist credentials or let memory authorize financial actions. Existing memory tests are narrow and the current behavior needs regression coverage before expanding the architecture.