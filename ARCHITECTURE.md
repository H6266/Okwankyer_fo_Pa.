# Architecture snapshot

## Current state

This repository is still a prototype IVR and simulator. The current architecture is split roughly as follows:

- `server.ts`: runtime entry point, static assets, route handling, and some simulated business logic
- `src/modules/`: voice/session orchestration, mock contacts, MoMo abstraction, and NLU helpers
- `src/ai_system/`: AI orchestration components and provider wrappers
- `src/domain/`: small, validated domain logic for money-transfer safety and state transitions
- `src/providers/`: provider abstractions, including recipient resolution interfaces
- `src/demo/`: fixture-only demo data

## Call-state diagram

```text
INITIATED
  -> RECIPIENT_VERIFIED
  -> AMOUNT_ENTERED
  -> CONFIRMED
  -> PIN_PENDING
  -> COMPLETED | FAILED | CANCELLED | TIMEOUT
```

## Risk note

The project is still nearer to a hackathon demo than a production money app. The dynamic prompt and validation logic added here is a responsible first step, but real production deployment still requires a live MoMo provider, signed webhooks, secure storage, and native Twi review.
