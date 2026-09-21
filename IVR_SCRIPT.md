# Ɔkwankyerɛfo Pa ("The Good Guide")
## Comprehensive Prototype IVR Voice Script & Dialect Specification
**Team Anidasoɔ ("Hope") | Hackathon Prototype Specification**

---

## 🎯 Executive Overview & Architectural Philosophy

**Ɔkwankyerɛfo Pa** ("The Good Guide") is an independent Voice Accessibility & Transaction Safety Layer for Ghana's digital financial infrastructure. Standard USSD interfaces (`*170#`, `*110#`) rely heavily on visual literacy, rapid timeout windows (frequently dropping callers within 15–20 seconds), and unassisted entry of phone numbers. 

Ɔkwankyerɛfo Pa provides:
1. **Strict Language Separation**: Once a caller selects English (<kbd>1</kbd>) or Akan Twi (<kbd>2</kbd>) at the initial welcome greeting, the entire subsequent experience runs **exclusively** in that chosen language.
2. **Zero-PIN Voice Security Gate**: Callers **never** speak or dial their secret 4-digit Mobile Money PIN over the voice call. Instead, the call safely yields to the handset's secure native screen prompt.
3. **Automated KYC Name Readback**: Resolves recipient identities before any funds transfer to eliminate "wrong number" mistakes.
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
| **02** | `Audio_prompt_02.mp3` | `/service-selection` (Service Menu) | 1: Mobile Money, 2: Banking, 9: Replay, 0: Exit | Select MoMo |
| **03/04** | `Audio_prompt_03.mp3` | `/network-selection` (Telco Network) | 1: MTN, 2: Telecel, 3: AT, 9: Replay, 0: Exit | Select MTN |
| **05** | `Audio_prompt_05.mp3` | `/momo-menu` (Action Menu) | 1: Send Money, 2: Pay Bills, 3: Airtime, 4: Cashout, 5: Check Acct, 8: Back, 0: Exit | Select Send Money |
| **06** | `Audio_prompt_06.mp3` | `/enter-recipient` (Phone Number) | Dial 10 digits followed by `#`, 0: Exit | Recipient entry |
| **07** | `Audio_prompt_07.mp3` | `/enter-recipient` (Input Sample) | DTMF demonstration: `0 2 4 1 2 3 4 5 6 7 #` | Reference input |
| **08** | `Audio_prompt_08.mp3` | `/recipient-verify` (KYC Readback) | 1: Confirm & Proceed, 2: Cancel/Change, 0: Exit | KYC verification |
| **09** | `Audio_prompt_09.mp3` | `/enter-amount` (Amount in Cedis) | Dial cedi amount + `#`, `*` for pesewas | Amount entry |
| **10** | `Audio_prompt_10.mp3` | `/safe-confirmation` (Final Gate) | 1: Confirm & Send, 2: Cancel, 0: Exit | Safe confirmation |
| **11** | `Audio_prompt_11.mp3` | `/safe-outcome` (Zero-PIN Prompt) | Screen PIN prompt handoff notice | Handoff to USSD |
| **12** | `Audio_prompt_12.mp3` | `/transaction-receipt` (Receipt & Done) | 0: Exit, 1: Other services | Transaction summary |

---

### Akan Twi Audio Suite (12 Prompts in `/audio/Twi/`)
| Step # | File Name | Route / Context | User Options | Key Action |
|:---:|:---|:---|:---|:---|
| **01** | `Welcome_prompt_01.mp3` | `/voice-menu` (Inbound Welcome) | 1: English, 2: Twi | Language lock |
| **02** | `Audio_prompt_twi_02.mp3` | `/network-selection?lang=twi` | 1: MTN, 2: Telecel, 3: AirtelTigo, 4/9: Replay, 0: Exit | Select Telco |
| **03/04** | `Audio_prompt_twi_04.mp3` | `/momo-menu?lang=twi` | 1: Send Money, 2: Bosea/Loan, 3: Airtime, 4: Cashout, 5: Account, 8: Back, 0: Exit | Select MoMo |
| **05** | `Audio_prompt_twi_05.mp3` | `/enter-recipient?lang=twi` | Dial recipient phone number + `#`, 0: Exit | Recipient entry |
| **06** | `Audio_prompt_twi_06.mp3` | `/recipient-verify?lang=twi` | 1: Gye tum (Accept/Confirm), 2: Cancel, 0: Exit | KYC verification |
| **07** | `Audio_prompt_twi_07.mp3` | `/enter-amount?lang=twi` | Dial cedi amount + `#`, `*` for pesewas | Amount entry |
| **08** | `Audio_prompt_twi_08.mp3` | `/safe-confirmation?lang=twi` | 1: Pene so na send (Confirm), 2: Kansɛla (Cancel) | Safe confirmation |
| **09** | `Audio_prompt_twi_09.mp3` | `/safe-outcome?lang=twi` | Screen PIN prompt handoff notice | Handoff to USSD |
| **10** | `Audio_prompt_twi_10.mp3` | `/transaction-receipt?lang=twi` | 0: Dabi / Exit, 1: Foforo (Other services) | Transaction summary |
| **11** | `Audio_prompt_twi_11.mp3` | `/cancel?lang=twi` | Abort & polite sign-off | Exit call |
| **12** | `Audio_prompt_twi_12.mp3` | Calibration / Supplementary prompt | Optional reference clip | System archive |

---

## 📜 Full Step-by-Step Parallel Script (English vs. Akan Twi)

### Step 1: Inbound Call Greeting & Language Lock
*Triggered when caller dials the Africa's Talking IVR access number (`+233 30 804 8098`)*

#### English & Twi Combined Greeting
- **Audio File**: `/audio/Welcome_prompt_01.mp3`
- **Spoken Text**:
  > *"Welcome to Okwanchofapa, an easy financial transaction service. For English, press 1. For Twi, press 2."*
- **Akan Twi Phonetic Meaning**:
  > *"Akwaaba kɔ Ɔkwankyerɛfo Pa, sika ho dwumadie a ɛnyɛ den. Sɛ wopɛ Borɔfo a, mia baako. Sɛ wopɛ Twi a, mia mmienu."*
- **Keypad Inputs**:
  - <kbd>1</kbd> ➔ **LOCKED IN ENGLISH FLOW** (No Twi audio played hereafter).
  - <kbd>2</kbd> ➔ **LOCKED IN TWI FLOW** (No English audio played hereafter).

---

### Step 2: Service & Network Selection

#### Branch A: English Path
- **Context**: Caller pressed <kbd>1</kbd>. Directed to Service Category Menu.
- **Audio File**: `/audio/English/Audio_prompt_02.mp3`
- **Spoken Text**:
  > *"For Telecom mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0."*
- **User Action**: Press <kbd>1</kbd> for Telecom Mobile Money.
- **Sub-step (Network Selection)**:
  - **Audio File**: `/audio/English/Audio_prompt_03.mp3`
  - **Spoken Text**:
    > *"Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again. Press 0 to exit."*
  - **User Action**: Press <kbd>1</kbd> for MTN MoMo.

#### Branch B: Akan Twi Path
- **Context**: Caller pressed <kbd>2</kbd>. Directed directly to Network Selection in Twi.
- **Audio File**: `/audio/Twi/Audio_prompt_twi_02.mp3`
- **Spoken Text**:
  > *"Afei select-i wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia nnan na tie wei biom. Mia zero na si ha."*
- **English Translation**:
  > *"Now select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 4 to listen to this again. Press 0 to exit here."*
- **User Action**: Press <kbd>1</kbd> for MTN.

---

### Step 3: Main Mobile Money Action Menu

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_05.mp3`
- **Spoken Text**:
  > *"MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cash out, press 4. To check your account, press 5. Press 8 to go back or 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to Send Money to another MoMo user.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_04.mp3`
- **Spoken Text**:
  > *"Sɛ wopɛ sɛ wosend sika kɔ ma momo user, mia 1. Sɛ wopɛ sɛ wotia bɔɔsa, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle, mia 3. Sɛ wopɛ sɛ woallow cash out, mia 4. Sɛ wopɛ sɛ wochecki wo account no, mia 5. Mia 8 na kɔ back. Mia 0 next."*
- **English Translation**:
  > *"If you want to send money to a MoMo user, press 1. If you want to repay a loan, press 2. If you want to buy airtime or a data bundle, press 3. If you want to allow cash out, press 4. If you want to check your account, press 5. Press 8 to go back. Press 0 to exit."*
- **User Action**: Press <kbd>1</kbd> to Send Money.

---

### Step 4: Recipient Phone Number Entry

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_06.mp3`
- **Spoken Text**:
  > *"Enter the 10 digit number you want to send money to followed by hash. Press 0 to exit."*
- **User Action**: Caller dials `0553838464#` on keypad.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_05.mp3`
- **Spoken Text**:
  > *"Afei mobɔ namba no a wopɛ sɛ wosend sika toso no, wie a fa hash ɛka ho. Mia zero na esi ha."*
- **English Translation**:
  > *"Now dial the number you want to send money to, and when finished add hash (#). Press 0 to stop here."*
- **User Action**: Caller dials `0553838464#` on keypad.

---

### Step 5: Real-Time Recipient Verification (KYC Readback)
*The system instantly queries the telecom subscriber directory and reads back the verified recipient's name to prevent wrong transfers.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_08.mp3`
- **Spoken Text**:
  > *"You are about to send money to Kwame Nyamebre whose phone number ends with 8464. To confirm and proceed, press 1, to cancel, press 2, to exit completely, press 0."*
- **User Action**: Press <kbd>1</kbd> to confirm the recipient.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_06.mp3`
- **Spoken Text**:
  > *"Worepɛ sɛ wosend sika kɔ Kwame Nyamebre fɔn so, a nɔmba 8464 na ɛtwatoɔ. Sɛ wopɛ sɛ wogye tum na wosend sika no a, mia baako. Sɛ wopɛ sɛ wokansɛla a, mia mmienu. Sɛ wopɛ sɛ wosi ha a, mia zero."*
- **English Translation**:
  > *"You are sending money to Kwame Nyamebre's phone ending in 8464. If you accept and wish to send the money, press 1. If you want to cancel, press 2. If you want to exit, press 0."*
- **User Action**: Press <kbd>1</kbd> to accept.

---

### Step 6: Amount Entry in Ghana Cedis

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_09.mp3`
- **Spoken Text**:
  > *"Enter the cedi amount you want to send to Kwame Nyamebre followed by hash. Use star for pesewas."*
- **User Action**: Caller dials `500#` on keypad.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_07.mp3`
- **Spoken Text**:
  > *"Mpo, siidi amount a worepɛ sɛ wosende kɔ Kwame Nyamebre hɔ no, wowie a fa hash ka ho. Fa star ma pesewas."*
- **English Translation**:
  > *"Now, dial the cedi amount you want to send to Kwame Nyamebre, and when finished add hash. Use star for pesewas."*
- **User Action**: Caller dials `500#` on keypad.

---

### Step 7: "Safe Confirmation" Final Gate
*The critical double-check before any payment is authorized.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_10.mp3`
- **Spoken Text**:
  > *"You are about to send 500 Ghana Cedis to Kwame Nyamebre. To confirm and send, press 1. To cancel, press 2."*
- **User Action**: Press <kbd>1</kbd> to authorize.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_08.mp3`
- **Spoken Text**:
  > *"Worepɛ sɛ wosend 500 Ghana Cedis kɔ Kwame Nyamebre nɔmba so. Sɛ wopɛ sɛ wogye tum na wosend a, mia baako. Sɛ wopɛ sɛ wokansɛla a, mia mmienu."*
- **English Translation**:
  > *"You are sending 500 Ghana Cedis to Kwame Nyamebre's number. If you agree and want to send, press 1. If you want to cancel, press 2."*
- **User Action**: Press <kbd>1</kbd> to authorize.

---

### Step 8: The Zero-PIN Voice Security Gate
*Crucial Security Mandate: The voice call NEVER asks the user to speak or keypad their MoMo PIN.*

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_11.mp3`
- **Spoken Text**:
  > *"Confirmed. Now, please check your phone's screen and enter your Momo PIN accurately. Thank you for using Okwankyerɛfo Pa. Goodbye."*
- **Handset Behavior**: The IVR call safely triggers the telecom's secure network USSD push prompt directly to the caller's secure screen.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_09.mp3`
- **Spoken Text**:
  > *"Afei, hwɛ wo cellphone fɔn no screen so na bɔ wo MoMo PIN wɔ ahobammbɔ mu. Yɛdaase sɛ wode Ɔkwankyerɛfo Pa adi dwuma."*
- **English Translation**:
  > *"Now, look at your phone's screen and enter your MoMo PIN securely. Thank you for using Ɔkwankyerɛfo Pa."*
- **Handset Behavior**: Secure USSD screen push modal opens.

---

### Step 9: Transaction Summary Receipt & Sign-Off

#### Branch A: English Path
- **Audio File**: `/audio/English/Audio_prompt_12.mp3`
- **Spoken Text**:
  > *"Congratulations, you have successfully sent 500 Ghana Cedis to Kwame Nyamebrɛ. Your transaction was completed on 17th September 2026 at 5:00 PM. Your reference number is OKP847291. Your transaction details have also been sent to you. Would you like to do anything else?"*
- **Options**: Press <kbd>0</kbd> to exit, or <kbd>1</kbd> for another service.

#### Branch B: Akan Twi Path
- **Audio File**: `/audio/Twi/Audio_prompt_twi_10.mp3`
- **Spoken Text**:
  > *"Congratulations, 500 Ghana cedis a wosende kɔ Kwame Nyamebre nɔmba no so no aye successful. Wo transaction no ye completed wo 17th September 2026 ɛwɔ anwummerɛ 5 PM. Wo reference nɔmba no ye OKP847291. Wo transaction details no nso, yɛasende akɔ wo fɔn so. Wopɛ sɛ woyɛ biribi foforɔ anaa?"*
- **Options**: Press <kbd>0</kbd> to exit, or <kbd>1</kbd> for another service.

---

## 🛡️ Security & Inclusion Verification Matrix

| Vulnerability in Traditional USSD | Ɔkwankyerɛfo Pa Voice Innovation | Verification In Prototype |
|---|---|:---:|
| **Eavesdropping / PIN theft** | **Zero-PIN Gate**: Secret PIN is entered strictly into the OS-level prompt on the phone screen, never over the call audio. | ✅ Fully Enforced |
| **Wrong Recipient Number** | **KYC Resolution**: Reads back recipient full name before amount entry. | ✅ Kwame Nyamebre (0553838464) verified |
| **Rapid Screen Timeout** | **Paced Audio & Replay**: Key <kbd>9</kbd> repeats prompts without session termination. | ✅ Supported on all menus |
| **Illiteracy / Visual Impairment** | **Akan Twi Audio Track**: 100% spoken dialect parity without reliance on written text. | ✅ 12 Twi studio voice clips |
| **Accidental Over-transfer** | **Explicit Safe Confirmation**: Re-reads exact Cedi & Pesewa amount before authorization. | ✅ GH₵ 500.00 readback |
