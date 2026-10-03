# Audit: README claims vs. actual code

## What the repo actually contains

- A Node + Express + TypeScript demo IVR app with a browser simulator and a server that serves static pages under `public/`.
- Africa's Talking integration exists in `africastalking.ts`, but it is a thin wrapper and not a full verified voice/security pipeline.
- The app includes a mock contact book and a MoMo-style sandbox ledger in `src/modules/mockContacts.ts` and `src/modules/paymentProvider.ts`.
- The application includes numerous voice-flow modules in `src/modules/` and an AI package in `src/ai_system/`.
- `server.ts` is the central runtime file and contains multiple responsibilities: env config, CORS, media resolution, KYC lookup, prompt definitions, routes, and a large amount of demo logic.
- Build tooling exists and currently builds successfully, but the project is not yet hardened for real-money production use.

## What the README claims that the code does not fully support

- The README describes a production-grade system for real Mobile Money transfers, KYC-based recipient validation, and secure zero-PIN handoff. The implementation in code is still largely prototype/demo behavior.
- The README says there is a strict English/Twi separation and stable audio prompts, but the code has hardcoded demo names and numbers, including `Kwame Nyamebere` / `8464` style fallbacks.
- The README positions the app as a real financial product, but several paths still rely on mock data and permissive demo logic.
- The README describes an AI system with real speech recognition and safety gating; the code has Gemini integration but no formal confidence threshold or hardened fallback policy yet.
- The README names real security controls, but the code currently exposes permissive CORS, large JSON/form limits, and unvalidated audio upload behavior.
- The README claims a production deployment flow and robust observability; however the repo still has shared state, demo ledger data, and no strong separation between production and demo paths.

## High-risk items found in the current codebase

- Hardcoded recipient fallbacks such as `endsWith("8464")` and synthetic names in `server.ts` and `src/modules/paymentProvider.ts`.
- Demo-only transaction data in the ledger and mock contact book.
- Large dynamic route logic in `server.ts` rather than a structured application layout.
- Security gaps: wildcard CORS, large upload limits, missing webhook verification checks, and broad debugging output.
- AI and speech handling are partially present but not yet measurable or constrained by a strict fallback policy.

## Bottom line

The project is best understood as a richly demoed proof-of-concept IVR and MoMo voice simulator, not a hardened production money-transfers system.
