# Participant Information and Consent: Controlled Voice Pilot

## Plain-language summary

We are asking for your help to test a Ghanaian voice telephone assistant called Ɔkwankyerɛfo Pa.

The assistant may ask you to:

- choose English or Twi;
- ask to check a balance;
- ask for a simulated airtime or data purchase;
- ask to send a simulated amount;
- ask to withdraw a simulated amount;
- correct or repeat an instruction;
- use the phone keypad if the assistant cannot hear you.

This pilot does not use real financial transactions. No real money, airtime, data, or withdrawal will be sent.

## Why we are asking

We want to know whether the service:

- understands Ghanaian English and Akan/Twi;
- keeps track of a conversation;
- speaks clearly;
- helps people who cannot see the phone screen;
- allows people to recover after a misunderstanding.

## What may be collected

Depending on provider and consent settings, the test operator may record:

- whether the call connected;
- whether the system delivered a spoken response;
- provider transcript text;
- a human-verified intended phrase;
- selected intent and synthetic amount or recipient reference;
- whether clarification or DTMF was used;
- whether the call completed;
- accessibility feedback.

You should not speak a real account number, real PIN, password, or real financial information.

## Voice recordings

Ask the operator to state clearly whether Africa's Talking recording is enabled for the call.

The application currently:

- can receive a recording URL or callback transcript;
- can transcribe speech through configured providers;
- hashes call and participant identifiers in the call-evidence collector;
- redacts phone-like and PIN-like text before saving call evidence;
- stores anonymized evidence in `data/real_call_pilot.jsonl` on the application host.

The repository does not document an automatic deletion schedule for that evidence file. The operator must obtain specific consent and explain whether provider/caller recordings are retained separately.

Do not infer that every provider recording is deleted. Ask for the provider and operator's recording and deletion procedure.

## Anonymisation

Your call and participant identifiers are converted to anonymous hashes in the pilot evidence endpoint. The report should not show your name or phone number.

Anonymisation is not a promise that all incidental provider information is anonymous. Do not provide sensitive information.

## Your choices

You may:

- say no;
- stop a call;
- skip a task;
- ask for a break;
- withdraw from the pilot.

You will not be asked to complete a real payment. Saying no or stopping does not affect any real financial service.

After participation, you may ask the operator to stop recording further evidence or request deletion of evidence that can still be identified.

## Consent confirmation

Before a call begins, the operator may write:

- Participant identifier: ____________________
- Administrator: ____________________________
- Date and time: ____________________________
- Language: English / Twi / Both
- Recording or transcript consent: Yes / No
- Understanding and willingness: Yes / No

The operator must set `consentRecorded: true` only after this explicit consent.
