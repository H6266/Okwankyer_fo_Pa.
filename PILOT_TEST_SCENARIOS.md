# Pilot Test Scenarios

All values are simulated. Use only approved test numbers and synthetic recipient references.

## 20 practical scripts

### 1. English greeting and language selection

Caller: "Hello."

System: "For English press 1 or say English."

Caller: "English."

Success: English prompts continue and the call remains active.

### 2. Twi greeting and language selection

Caller: "Akwaaba."

System: "Sɛ wopɛ Twi a mia 2 anaa ka sɛ Twi."

Caller: "Twi."

Success: Twi prompts continue.

### 3. Natural Ghanaian English transfer

Caller: "Please help me send fifty cedis to a test person."

Success: The system requests the synthetic recipient or clarifies, and does not assume a real phone number.

### 4. Natural Twi transfer

Caller: "Mepɛ sɛ mesoma sika aduonum kɔma obi."

Success: Twi transfer intent is understood or the missing recipient is asked for clearly.

### 5. Direct transfer with synthetic number

Caller: "Transfer 20 cedis to 0241234567."

Success: The amount and synthetic recipient are read back exactly before confirmation.

### 6. Twi direct transfer

Caller: "Mane sika aduonu kɔma 0553838464."

Success: Twi intent is understood and both slots are read back before confirmation.

### 7. Balance enquiry in English

Caller: "How much is in my account?"

Success: The system explains the balance feature limitation and directs the caller to official handset balance access.

### 8. Balance enquiry in Twi

Caller: "Hwɛ sika a aka wɔ me account mu."

Success: The system gives a Twi balance limitation response.

### 9. Airtime request

Caller: "I want to buy 10 cedis airtime."

Success: The pilot service response is accurate and no real airtime purchase is initiated.

### 10. Twi airtime request

Caller: "Mepɛ sɛ metɔ airtime edu cedis."

Success: Intent is recognised as airtime and the value is clarified if uncertain.

### 11. Data request

Caller: "Can I buy an internet data bundle?"

Success: Intent is recognised as data and no live purchase occurs.

### 12. Withdrawal request

Caller: "I want to withdraw 30 cedis."

Success: Withdrawal intent is distinct from a transfer and no money moves.

### 13. Twi withdrawal request

Caller: "Mepɛ sɛ megye sika aduasa."

Success: Withdrawal/cash-out intent is recognised.

### 14. Correction

Caller: "Actually make it eighty cedis."

Success: The amount changes without replacing recipient or silently committing an action.

### 15. Recipient correction

Caller: "No, not Ama. Send it to Kofi."

Success: Recipient changes and the previous amount remains or is clarified.

### 16. Negative confirmation

Caller: "No, cancel."

Success: The transaction is cancelled and the caller receives a clear goodbye or safe continuation.

### 17. Ambiguous instruction

Caller: "I want to do something with my money."

Success: The system offers send, withdraw, or balance choices instead of guessing.

### 18. DTMF recovery

Caller: [speech is empty or not recognised].

Administrator observes DTMF fallback. Caller presses the appropriate supported key.

Success: The call remains active and returns to the current or repeated menu.

### 19. Background noise or poor telephone audio

Use moderate-room noise or a weak telephone line. Caller: "Check my balance."

Success: Either a correct clarification, repeat request, or DTMF fallback occurs. Silence is not guessed.

### 20. Unexpected silence

Caller stays silent during the response window.

Success: The system explains that no response was heard and gives a repeat or keypad option.

## Additional stress checks

- Repeated instructions.
- "Yes", "No", "Aane", "Dabi", "Sesa", "Tie bio", "San akyi".
- Language switching mid-call.
- Interruption and continuation.
- Caller says "wait, check my balance first".
- Caller says a PIN, password, or secret; system must never accept or store it.

## Observation fields

Record:

- language;
- human-verified intended words;
- provider transcript;
- identified intent;
- expected intent;
- amount and synthetic recipient reference;
- clarification needed;
- recovery method;
- completion;
- spoken response delivery;
- unexpected disconnection;
- empty transcription;
- timeout;
- failure origin;
- accessibility feedback.

## Accessibility feedback fields

Ask participants to answer after the call:

```json
{
  "understoodInstructions": true,
  "selectedPreferredLanguage": true,
  "navigatedWithoutScreen": true,
  "recoveredWhenMisunderstood": true,
  "completedWithoutAssistance": true
}
```
