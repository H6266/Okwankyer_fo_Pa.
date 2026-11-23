# Ɔkwankyerɛfo Pa ("The Good Guide")
## Controlled Pilot IVR Voice Script
**Team Anidasoɔ ("Hope") | Hackathon Prototype Specification**

> **Pilot safety boundary:** This script is for authorised staging calls only. A transfer is simulated from start to finish: no payment, purchase, Mobile Money PIN entry, or USSD handoff takes place. Use only approved test callers and synthetic recipient references. Do not describe this prototype as field-tested.

---

## 🎯 Executive Overview & Architectural Philosophy

**Ɔkwankyerɛfo Pa** ("The Good Guide") is a voice accessibility prototype being evaluated in a controlled staging pilot. The pilot evaluates the voice experience, not live financial services.

The pilot evaluates:
1. **Strict Language Separation**: Once a caller selects English (<kbd>1</kbd>) or Akan Twi (<kbd>2</kbd>) at the initial welcome greeting, the entire subsequent experience runs **exclusively** in that chosen language.
2. **No-PIN Boundary**: The call never requests or accepts a Mobile Money PIN and never hands off to a payment prompt.
3. **Synthetic Transfer Readback**: Reads back a test recipient reference and simulated amount so callers can correct either before confirming.
4. **Universal Accessible Navigation Grammar**: Predictable keys across all menus:
   - <kbd>#</kbd> : Submit / Proceed
   - <kbd>8</kbd> : Back to previous menu
   - <kbd>9</kbd> : Replay / Repeat prompt
   - <kbd>0</kbd> : Cancel & Exit safely

---

## 🎧 Complete Audio Prompt Inventory

### English Audio Suite (11 Prompts in `/audio/English/`)
| Step # | File Name | Route / Context | User Options | Key Action |
|:---:|:---|:---|:---|:---|
| **01** | `Welcome_prompt_01.mp3` | `/voice-menu` (Inbound Welcome) | 1: English, 2: Twi | Language lock |
| **02** | `Audio_prompt_02.mp3` | `/service-selection` (Pilot service menu) | 1: Transfer simulation, 2: Unavailable service notice, 9: Replay, 0: Exit | Select simulation |
| **03/04** | `Audio_prompt_03.mp3` | `/network-selection` (Simulated provider choice only) | 1: MTN, 2: Telecel, 3: AT, 9: Replay, 0: Exit | No provider connection |
| **05** | `Audio_prompt_05.mp3` | `/momo-menu` (Pilot action menu) | 1: Transfer simulation, 8: Back, 0: Exit | Select simulation |
| **06** | `Audio_prompt_06.mp3` | `/enter-recipient` (Test recipient reference) | Enter approved synthetic test reference, 0: Exit | Recipient entry |
| **07** | `Audio_prompt_07.mp3` | `/enter-recipient` (Input Sample) | Use only a staging-approved test number if numeric DTMF is required | Test input |
| **08** | `Audio_prompt_08.mp3` | `/recipient-verify` (Synthetic recipient readback) | 1: Confirm, 2: Correct, 3: Cancel, 0: Exit | Test recipient review |
| **09** | `Audio_prompt_09.mp3` | `/enter-amount` (Amount in Cedis) | Dial cedi amount + `#`, `*` for pesewas | Amount entry |
| **10** | `Audio_prompt_10.mp3` | `/safe-confirmation` (Simulated final confirmation) | 1: Confirm simulation, 2: Correct, 3: Cancel, 0: Exit | Confirm no real action |
| **11** | `Audio_prompt_11.mp3` | `/safe-outcome` (Simulated outcome) | No PIN or USSD handoff | Explain no money was sent |
| **12** | `Audio_prompt_12.mp3` | `/transaction-receipt` (Simulation summary) | 0: Exit | Simulated result only |

---

### Akan Twi Audio Suite (12 Prompts in `/audio/Twi/`)
| Step # | File Name | Route / Context | User Options | Key Action |
|:---:|:---|:---|:---|:---|
| **01** | `Welcome_prompt_01.mp3` | `/voice-menu` (Inbound Welcome) | 1: English, 2: Twi | Language lock |
| **02** | `Audio_prompt_twi_02.mp3` | `/network-selection?lang=twi` (Simulated provider choice only) | 1: MTN, 2: Telecel, 3: AirtelTigo, replay, 0: Exit | No provider connection |
| **03/04** | `Audio_prompt_twi_04.mp3` | `/momo-menu?lang=twi` (Pilot action menu) | 1: Transfer simulation, 8: Back, 0: Exit | Select simulation |
| **05** | `Audio_prompt_twi_05.mp3` | `/enter-recipient?lang=twi` | Enter approved synthetic test reference, 0: Exit | Recipient entry |
| **06** | `Audio_prompt_twi_06.mp3` | `/recipient-verify?lang=twi` | 1: Gye tum (Confirm), 2: Sesa (Correct), 3: Kansɛla (Cancel), 0: Exit | Test recipient review |
| **07** | `Audio_prompt_twi_07.mp3` | `/enter-amount?lang=twi` | Dial cedi amount + `#`, `*` for pesewas | Amount entry |
| **08** | `Audio_prompt_twi_08.mp3` | `/safe-confirmation?lang=twi` | 1: Confirm simulation, 2: Correct, 3: Kansɛla (Cancel) | Confirm no real action |
| **09** | `Audio_prompt_twi_09.mp3` | `/safe-outcome?lang=twi` | No PIN or USSD handoff | Explain no money was sent |
| **10** | `Audio_prompt_twi_10.mp3` | `/transaction-receipt?lang=twi` | 0: Dabi / Exit | Simulation summary |
| **11** | `Audio_prompt_twi_11.mp3` | `/cancel?lang=twi` | Abort & polite sign-off | Exit call |
| **12** | `Audio_prompt_twi_12.mp3` | Calibration / Supplementary prompt | Optional reference clip | System archive |

---

## 📜 Full Step-by-Step Parallel Script (English vs. Akan Twi)

### Step 1: Inbound Call Greeting & Language Lock
*Triggered by an authorised staging call through the configured IVR callback.*

#### English & Twi Combined Greeting
- **Audio File**: `/audio/Welcome_prompt_01.mp3`
- **Spoken Text**:
  > *"Welcome to Okwanchofapa, a voice-service pilot using simulated transfers only. No money will be sent. For English, press 1. For Twi, press 2."*
- **Akan Twi Phonetic Meaning**:
  > *"Akwaaba kɔ Ɔkwankyerɛfo Pa. Yɛde simulated transfer na yɛreyɛ nhwehwɛmu; sika biara renkɔ. Sɛ wopɛ Borɔfo a, mia baako. Sɛ wopɛ Twi a, mia mmienu."*
- **Keypad Inputs**:
  - <kbd>1</kbd> ➔ **LOCKED IN ENGLISH FLOW** (No Twi audio played hereafter).
  - <kbd>2</kbd> ➔ **LOCKED IN TWI FLOW** (No English audio played hereafter).

---

### Step 2: Service Category Selection (Telecom MoMo vs. Banking)

#### Branch A: English Path
- **Context**: Caller pressed <kbd>1</kbd>. Directed to Service Category Menu.
- **Audio File**: `/audio/English/Audio_prompt_02.mp3`
- **Spoken Text**:
  > *"To try a simulated Mobile Money transfer, press 1. No money will be sent. Banking services are not part of this pilot; press 2 to hear that this service is unavailable. To hear this again, press 9. To exit, press 0."*
- **User Action**: Press <kbd>1</kbd> for Telecom Mobile Money.

#### Branch B: Akan Twi Path
- **Context**: Caller pressed <kbd>2</kbd>. Directed to Service Category Menu in Twi.
- **Audio File**: `/audio/Twi/Audio_prompt_twi_03.mp3`
- **Spoken Text**:
  > *"Sɛ wopɛ sɛ woyɛ Mobile Money transfer simulation a, mia baako (1). Sika biara renkɔ. Sikakorabea dwumadie nni pilot yi mu; mia mmienu (2) na tie sɛ saa service yi nni hɔ. Tie biom, mia 9. Firi ha, mia 0."*
- **English Translation**:
  > *"To try a simulated Mobile Money transfer, press 1. No money will be sent. Banking services are not part of this pilot; press 2 to hear that this service is unavailable. To hear this again, press 9. To exit, press 0."*
- **User Action**: Press <kbd>1</kbd> for Mobile Money.

---

### Step 3: Network Provider Selection (MTN, Telecel, AT)

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_03.mp3`
- **Spoken Text**:
  > *"For this simulation only, select a provider: MTN, press 1; Telecel, press 2; AirtelTigo, press 3. This does not connect to a provider or move money. Press 9 to hear this again or 0 to exit."*
- **User Action**: Select a provider for the simulated conversation; no provider transaction occurs.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_02.mp3`
- **Spoken Text**:
  > *"Afei select-i wo network. Sɛ MTN a, mia baako (1). Sɛ Telecel a, mia mmienu (2). Sɛ AirtelTigo a, mia mmiɛnsa (3). Mia anan (4) na tie wei biom. Mia zero (0) na si ha."*
- **English Translation**:
  > *"Simulation yi nko ara mu no, paw provider: MTN, mia 1; Telecel, mia 2; AirtelTigo, mia 3. Wei nkɔ provider biara hɔ na sika biara renkɔ. Mia 4 na tie bio, anaa mia 0 na woafiri."*
- **English Translation**: For this simulation only, select a provider. This does not connect to a provider or move money. Press 4 to replay or 0 to exit.
- **User Action**: Select a provider for the simulated conversation; no provider transaction occurs.

---

### Step 4: Main Mobile Money Action Menu

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_05.mp3`
- **Spoken Text**:
  > *"This is a simulation; no network service or financial transaction is available. To practise a simulated transfer, press 1. Other services are unavailable during this pilot. Press 8 to go back or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to practise the transfer simulation.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_04.mp3`
- **Spoken Text**:
  > *"Simulation nko ara na yɛreyɛ; network service anaa financial transaction biara nni hɔ. Sɛ wopɛ sɛ wosua transfer simulation a, mia 1. Service foforɔ nni pilot yi mu. Mia 8 na kɔ back, anaa mia 0 na woafiri."*
- **English Translation**:
  > *"This is a simulation; no network service or financial transaction is available. To practise a simulated transfer, press 1. Other services are unavailable during this pilot. Press 8 to go back or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to practise the transfer simulation.

---

### Step 5: Synthetic Recipient Entry

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_06.mp3`
- **Spoken Text**:
  > *"Enter or say the approved test recipient reference followed by hash. Use only the synthetic reference provided for this test; do not enter a real person's phone number. Press 0 to exit."*
- **User Action**: Caller enters or says the approved synthetic reference, for example `TEST-001`.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_05.mp3`
- **Spoken Text**:
  > *"Afei ka anaa hyɛ test recipient reference a wɔama wo no; wie a fa hash ka ho. Mfa obi ankasa phone nɔma nhyɛ mu. Mia zero na wofiri ha."*
- **English Translation**:
  > *"Now say or enter the test recipient reference provided to you, then add hash (#). Do not enter a real person's phone number. Press 0 to exit."*
- **User Action**: Caller enters or says the approved synthetic reference, for example `TEST-001`.

---

### Step 6: Synthetic Recipient Readback
*Use a preconfigured fictional test alias and reference only. This is not a telecom lookup or identity verification.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_08.mp3`
- **Spoken Text**:
  > *"This simulation is for Test Recipient A, reference TEST-001. No money will be sent. Press 1 to confirm this test recipient, 2 to correct it, 3 to cancel, or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to confirm, <kbd>2</kbd> to correct the reference, or <kbd>3</kbd> to cancel.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_06.mp3`
- **Spoken Text**:
  > *"Simulation yi fa Test Recipient A, reference TEST-001 ho. Sika biara renkɔ. Sɛ wopɛ sɛ wogye test recipient yi tom a, mia baako; sɛ wopɛ sɛ wosesa no a, mia mmienu; sɛ wopɛ sɛ wokansɛla a, mia mmiɛnsa; anaa mia zero na woafiri."*
- **English Translation**:
  > *"This simulation is for Test Recipient A, reference TEST-001. No money will be sent. Press 1 to confirm the test recipient, 2 to change it, 3 to cancel, or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to confirm, <kbd>2</kbd> to correct the reference, or <kbd>3</kbd> to cancel.

---

### Step 7: Amount Entry in Ghana Cedis

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_09.mp3`
- **Spoken Text**:
  > *"Enter or say a simulated amount in Ghana cedis followed by hash. This is not a payment. Press 0 to exit."*
- **User Action**: Caller enters or says a test amount, for example `50#`.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_07.mp3`
- **Spoken Text**:
  > *"Afei, ka anaa hyɛ sima amount a wopɛ sɛ wode yɛ test no; wie a fa hash ka ho. Sika biara renkɔ. Mia zero na woafiri."*
- **English Translation**:
  > *"Now say or enter the simulated amount in cedis for the test, then add hash. No money will be sent. Press 0 to exit."*
- **User Action**: Caller enters or says a test amount, for example `50#`.

---

### Step 8: Simulated Transfer Readback and Correction
*Read the exact synthetic recipient and amount back before confirmation. Allow the caller to correct either detail or cancel. Confirmation must not initiate a payment.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_10.mp3`
- **Spoken Text**:
  > *"You requested a simulated transfer of 50 Ghana cedis to Test Recipient A, reference TEST-001. No money will be sent. Press 1 to confirm this simulation, 2 to correct the recipient or amount, 3 to cancel, or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to confirm the simulation, <kbd>2</kbd> to correct a detail, or <kbd>3</kbd> to cancel.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_08.mp3`
- **Spoken Text**:
  > *"Woreyɛ transfer simulation a ɛyɛ 50 Ghana cedis kɔ Test Recipient A, reference TEST-001. Sika biara renkɔ. Sɛ wopɛ sɛ wogye simulation yi tom a, mia baako; sɛ wopɛ sɛ wosesa recipient anaa amount a, mia mmienu; sɛ wopɛ sɛ wokansɛla a, mia mmiɛnsa; anaa mia zero na woafiri."*
- **English Translation**:
  > *"This is a simulated transfer of 50 Ghana cedis to Test Recipient A, reference TEST-001. No money will be sent. Press 1 to confirm the simulation, 2 to correct a detail, 3 to cancel, or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to confirm the simulation, <kbd>2</kbd> to correct a detail, or <kbd>3</kbd> to cancel.

---

### Step 9: No-PIN Boundary and Simulated Outcome
*The call never requests a PIN and never opens a handset payment prompt or USSD session.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_11.mp3`
- **Spoken Text**:
  > *"Your simulated transfer request is complete. No money was sent, and no Mobile Money PIN or payment prompt is needed. Thank you for taking part in this test."*

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_09.mp3`
- **Spoken Text**:
  > *"Wo transfer simulation no awie. Sika biara ankɔ, na Mobile Money PIN anaa payment prompt biara ho nhia. Yɛdaase sɛ woaboa yɛn wɔ test yi mu."*
- **English Translation**:
  > *"Your transfer simulation is complete. No money was sent, and no Mobile Money PIN or payment prompt is needed. Thank you for helping with this test."*
- **Handset Behavior**: None. No PIN screen or USSD handoff occurs.

---

### Step 10: Simulation Summary and Sign-Off

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_12.mp3`
- **Spoken Text**:
  > *"This was a simulated transfer of 50 Ghana cedis to Test Recipient A. No money was sent and no transaction took place. Press 0 to exit."*
- **Options**: Press <kbd>0</kbd> to exit. Do not issue a real transaction receipt or claim a payment succeeded.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_10.mp3`
- **Spoken Text**:
  > *"Wei yɛ transfer simulation a ɛyɛ 50 Ghana cedis kɔ Test Recipient A. Sika biara ankɔ, na transaction biara ansi. Mia zero na woafiri."*
- **Options**: Press <kbd>0</kbd> to exit. Do not issue a real transaction receipt or claim a payment succeeded.

---

## 🛡️ Security & Inclusion Verification Matrix

| Pilot safety requirement | Expected pilot behavior | Evidence status |
|---|---|:---:|
| **PIN/payment safety** | Never collect a PIN; never initiate a payment, purchase, or USSD handoff. | Must be verified before and during pilot |
| **Recipient mistakes** | Read back the synthetic recipient reference; allow correction or cancellation. No real identity lookup. | Must be observed in pilot calls |
| **Prompt recovery** | Replay and DTMF recovery should keep the call active where supported. | Must be observed in pilot calls |
| **Language/accessibility** | Evaluate English and Twi with participants, including people with visual impairments and limited digital literacy. | Not established until participant evidence is reviewed |
| **Amount mistakes** | Read back the exact simulated amount; allow correction or cancellation before simulated confirmation. | Must be observed in pilot calls |

Have the Twi wording reviewed by a fluent speaker before participant calls. This script describes the intended pilot experience; it is not evidence that the controls have been field-tested.
