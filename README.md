# Ɔkwankyerɛfo Pa

## Voice accessibility prototype for Ghana

Ɔkwankyerɛfo Pa is a Node.js/TypeScript voice application exploring accessible English and Akan/Twi navigation. The documented pilot flow simulates a transfer using synthetic references and amounts. It does not send money, contact a payment provider, request a PIN, or open a payment/USSD handoff.

The project is not a validated financial service or accessibility product. No real carrier calls, participant tests, production transactions, or real-call speech accuracy measurements have been conducted.

## Current status

| Area | Status |
| --- | --- |
| Voice application | Express/TypeScript routes, VoiceXML generation, audio delivery, NLU/speech components, and DTMF paths are implemented and covered by automated tests. Deployment and provider callback behavior are unverified. |
| Pilot transfer flow | Simulation only. See [IVR_SCRIPT.md](./IVR_SCRIPT.md); no funds move and no PIN is requested. |
| Africa's Talking | Integration code exists, but provider credentials, staging callback delivery, callback authenticity, and real telephone calls are not independently verified. See [SECURITY.md](./SECURITY.md). |
| MTN MoMo | Integration code and sandbox configuration exist. No successful provider transaction is claimed or authorized for the pilot. Do not configure production financial credentials. |
| KYC / recipient identity | Not validated for the pilot; simulated recipient references are not real identity lookups. |
| Telecel Cash / AT Money | Provider access and any production integration remain unverified. |
| Twi | Text and recordings are not linguistically approved. A fluent human reviewer must review and approve the material before participant use. See [docs/TWI_REVIEW.md](./docs/TWI_REVIEW.md). |
| Real-world results | No real-call WER/CER, task-completion, or participant accessibility results are available. |
| Staging / production | No Render service deployment or production readiness is claimed. The separate staging blueprint is `render.staging.yaml`. |

Automated tests establish behavior only within the tested software environment. They do not prove provider reachability, callback authenticity, language quality, real-call performance, or participant safety.

## Local development

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Keep local settings offline and sandbox-only. Do not add production credentials or enable live financial operations. The example environment file is a configuration template, not proof of provider access.

## Verification commands

```bash
npm test
npm run typecheck
npm run build
npm run security:audit
```

## Pilot and deployment documentation

- [Controlled pilot IVR script](./IVR_SCRIPT.md)
- [Staging deployment guide](./RENDER_STAGING_DEPLOYMENT_GUIDE.md)
- [Staging checklist](./PILOT_STAGING_CHECKLIST.md)
- [Real-call pilot evidence status](./PHASE3_5_REAL_CALL_PILOT.md)
- [Security policy and limitations](./SECURITY.md)

The staging guide is preparatory documentation only. Resolve its security and persistent-storage prerequisites, obtain explicit authorization, and independently verify provider behavior before staging or participant traffic. Do not deploy the production Render service for staging.
