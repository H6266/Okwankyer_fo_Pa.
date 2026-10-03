# Security notes

## Threat model

- Spoofed Africa's Talking webhook requests
- Prompt or message tampering in transit
- Replay of the same voice or callback payload
- Eavesdropping on PIN entry or voice confirmation
- SIM-swap or number mismatch risk on recipient resolution

## Current status

The codebase still needs a proper production security pass before real-money use. Some safeguards are present in the prototype, but a hard production deployment requires:

- verified AT webhook signatures or IP allowlists
- secret-managed environment configuration
- the removal of wildcard CORS and permissive upload endpoints
- real recipient verification via a provider with signed responses
- explicit audit logging with redaction of phone numbers and amounts

## Human review required

- Live MTN MoMo credentials
- Signed callback configuration from Africa's Talking
- Native review of all Twi prompts
- Deployment review for Render and production base URLs
