/**
 * Ɔkwankyerɛfo Pa - Audio Catalog & Phrase Bank
 * 
 * Single authoritative source of truth for recorded studio audio clips
 * across English and Akan Twi tracks.
 */

import path from "path";
import fs from "fs";

export interface AudioPromptMetadata {
  id: string;
  stepNumber: number;
  filename: string;
  language: "en" | "twi" | "bilingual";
  title: string;
  spokenText: string;
  description: string;
}

export const AUDIO_CATALOG: AudioPromptMetadata[] = [
  // ── English Suite ──────────────────────────────────────────────────
  {
    id: "en-01",
    stepNumber: 1,
    filename: "Welcome_prompt_01.mp3",
    language: "bilingual",
    title: "1. Language Selector",
    spokenText: "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    description: "Inbound bilingual greeting and language selection gate.",
  },
  {
    id: "en-02",
    stepNumber: 2,
    filename: "English/Audio_prompt_02.mp3",
    language: "en",
    title: "2. Service Selection",
    spokenText: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
    description: "Branch between telecom/momo and banking.",
  },
  {
    id: "en-03",
    stepNumber: 3,
    filename: "English/Audio_prompt_03.mp3",
    language: "en",
    title: "3. Network Provider Selection",
    spokenText: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.",
    description: "Carrier network selection.",
  },
  {
    id: "en-04",
    stepNumber: 3,
    filename: "English/Audio_prompt_04.mp3",
    language: "en",
    title: "4. Network Provider Alt",
    spokenText: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.",
    description: "Alternate network menu with concise repeat.",
  },
  {
    id: "en-05",
    stepNumber: 4,
    filename: "English/Audio_prompt_05.mp3",
    language: "en",
    title: "5. MoMo Action Menu",
    spokenText: "MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cashout, press 4. To check your account, press 5. Press 8 to go back, or 0 to exit.",
    description: "MTN Mobile Money action menu.",
  },
  {
    id: "en-06",
    stepNumber: 5,
    filename: "English/Audio_prompt_06.mp3",
    language: "en",
    title: "6. Recipient Phone Entry",
    spokenText: "Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit.",
    description: "10-digit beneficiary entry instruction.",
  },
  {
    id: "en-07",
    stepNumber: 5,
    filename: "English/Audio_prompt_07.mp3",
    language: "en",
    title: "7. Dialled Digits Sample",
    spokenText: "0, 5, 5, 3, 8, 3, 8, 4, 6, 4, hash.",
    description: "Digit read-back cadence sample.",
  },
  {
    id: "en-08",
    stepNumber: 6,
    filename: "English/Audio_prompt_08.mp3",
    language: "en",
    title: "8. KYC Name Verification",
    spokenText: "You are about to send money to Kwame Nyamebere, whose phone number ends with 8464. To confirm and send the money, press 1. To cancel, press 2. To exit completely, press 0.",
    description: "Historical studio baseline for KYC verification.",
  },
  {
    id: "en-09",
    stepNumber: 7,
    filename: "English/Audio_prompt_09.mp3",
    language: "en",
    title: "9. Transfer Amount Prompt",
    spokenText: "Enter the cedi amount you want to send to Kwame Nyamebere, followed by hash. Use star for pesewas.",
    description: "Cedi and pesewas amount input prompt.",
  },
  {
    id: "en-10",
    stepNumber: 8,
    filename: "English/Audio_prompt_10.mp3",
    language: "en",
    title: "10. Historical Safe Confirmation (500 GHS)",
    spokenText: "You are about to send 500 Ghana cedis to Kwame Nyamebere. To confirm and send, press 1. To cancel, press 2.",
    description: "Historical studio baseline prompt; dynamic TTS used for actual calls.",
  },
  {
    id: "en-11",
    stepNumber: 9,
    filename: "English/Audio_prompt_11.mp3",
    language: "en",
    title: "11. Zero-PIN Handset Handoff",
    spokenText: "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.",
    description: "Crucial prompt routing PIN entry away from telephone voice channel.",
  },
  {
    id: "en-12",
    stepNumber: 10,
    filename: "English/Audio_prompt_12.mp3",
    language: "en",
    title: "12. Historical Success Receipt (500 GHS)",
    spokenText: "Congratulations! You have successfully sent 500 Ghana cedis to Kwame Nyamebere. Your transaction was completed on 17 September 2026 at 5:00 PM. Your reference number is OKP-847291. Your transaction details have also been sent to you. Would you like to do anything else?",
    description: "Historical studio baseline prompt; dynamic TTS used for actual calls.",
  },

  // ── Akan Twi Suite ────────────────────────────────────────────────
  {
    id: "tw-01",
    stepNumber: 1,
    filename: "Welcome_prompt_01.mp3",
    language: "bilingual",
    title: "1. Kasa Paw (Language)",
    spokenText: "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    description: "Greeting and language gate.",
  },
  {
    id: "tw-02",
    stepNumber: 2,
    filename: "Twi/Audio_prompt_twi_02.mp3",
    language: "twi",
    title: "2. Network Paw",
    spokenText: "Afei selecte wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia anan na tie wei biom. Mia zero na si ha.",
    description: "Network carrier selection in Twi.",
  },
  {
    id: "tw-03",
    stepNumber: 3,
    filename: "Twi/Audio_prompt_twi_03.mp3",
    language: "twi",
    title: "3. Dwumadie Paw",
    spokenText: "Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.",
    description: "Telecom vs Banking in Twi.",
  },
  {
    id: "tw-04",
    stepNumber: 4,
    filename: "Twi/Audio_prompt_twi_04.mp3",
    language: "twi",
    title: "4. MoMo Menyu",
    spokenText: "Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3. Sɛ wopɛ sɛ woallow-i cash out a, mia 4. Sɛ wopɛ sɛ wocheck-i wo account no a, mia 5. Mia 8 na kɔ back. Mia 0 na firi ha.",
    description: "MoMo action options in Twi.",
  },
  {
    id: "tw-05",
    stepNumber: 5,
    filename: "Twi/Audio_prompt_twi_05.mp3",
    language: "twi",
    title: "5. Nɔma a Woremane",
    spokenText: "Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho. Mia zero na san akyi.",
    description: "Recipient phone number prompt in Twi.",
  },
  {
    id: "tw-06",
    stepNumber: 6,
    filename: "Twi/Audio_prompt_twi_06.mp3",
    language: "twi",
    title: "6. KYC Din Ka Peefe",
    spokenText: "Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, anaa number 8464 ɛna ɛtɔ. Sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako (1). Sɛ wo pɛ sɛ wo cancel a mia mmienu (2). Sɛ wo pɛ sɛ wo firi mu a mia zero (0).",
    description: "Historical studio KYC verification in Twi.",
  },
  {
    id: "tw-07",
    stepNumber: 7,
    filename: "Twi/Audio_prompt_twi_07.mp3",
    language: "twi",
    title: "7. Sika Dodow (Cedi)",
    spokenText: "Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to.",
    description: "Amount entry prompt in Twi.",
  },
  {
    id: "tw-08",
    stepNumber: 8,
    filename: "Twi/Audio_prompt_twi_08.mp3",
    language: "twi",
    title: "8. Bammbɔ Nkaebɔ (500 GHS)",
    spokenText: "Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2).",
    description: "Historical studio confirmation in Twi; dynamic TTS used for actual calls.",
  },
  {
    id: "tw-09",
    stepNumber: 9,
    filename: "Twi/Audio_prompt_twi_09.mp3",
    language: "twi",
    title: "9. Zero-PIN Screen Handoff",
    spokenText: "Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN.",
    description: "PIN handset handoff prompt in Twi.",
  },
  {
    id: "tw-10",
    stepNumber: 10,
    filename: "Twi/Audio_prompt_twi_10.mp3",
    language: "twi",
    title: "10. Nne Nkaedum (500 GHS)",
    spokenText: "Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed wɔ 17th September 2026...",
    description: "Historical studio receipt in Twi; dynamic TTS used for actual calls.",
  },
  {
    id: "tw-11",
    stepNumber: 11,
    filename: "Twi/Audio_prompt_twi_11.mp3",
    language: "twi",
    title: "11. Option Not Available / Cancellation",
    spokenText: "Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye.",
    description: "Cancellation sign-off in Twi.",
  },
  {
    id: "tw-12",
    stepNumber: 12,
    filename: "Twi/Audio_prompt_twi_12.mp3",
    language: "twi",
    title: "12. Studio Closing",
    spokenText: "Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie.",
    description: "Clean sign-off prompt in Twi.",
  },
];

export const LEGACY_AUDIO_MAP: Record<string, string> = {
  "01_service_select.mp3": "English/Audio_prompt_02.mp3",
  "02_network_select.mp3": "English/Audio_prompt_03.mp3",
  "03_network_select_alt.mp3": "English/Audio_prompt_04.mp3",
  "04_mtn_services_menu.mp3": "English/Audio_prompt_05.mp3",
  "05_enter_recipient_phone.mp3": "English/Audio_prompt_06.mp3",
  "06_demo_recipient_digits.mp3": "English/Audio_prompt_07.mp3",
  "07_confirm_recipient_name.mp3": "English/Audio_prompt_08.mp3",
  "08_enter_amount_cedis.mp3": "English/Audio_prompt_09.mp3",
  "09_confirm_transfer_summary.mp3": "English/Audio_prompt_10.mp3",
  "10_pin_prompt_screen_handoff.mp3": "English/Audio_prompt_11.mp3",
  "11_transaction_receipt_summary.mp3": "English/Audio_prompt_12.mp3",
  "confirm_en.mp3": "English/Audio_prompt_10.mp3",
  "confirm_twi.mp3": "Twi/Audio_prompt_twi_08.mp3",
  "success_en.mp3": "English/Audio_prompt_11.mp3",
  "success_twi.mp3": "Twi/Audio_prompt_twi_09.mp3",
  "cancel_en.mp3": "English/Audio_prompt_11.mp3",
  "cancel_twi.mp3": "Twi/Audio_prompt_twi_11.mp3",
};

export function audioFileExists(filename: string): boolean {
  const rootAudio = path.resolve(process.cwd(), "audio");
  const candidate = path.resolve(rootAudio, filename);
  if (candidate.startsWith(rootAudio) && fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
    return true;
  }
  const inEng = path.resolve(rootAudio, "English", filename);
  if (inEng.startsWith(rootAudio) && fs.existsSync(inEng) && !fs.statSync(inEng).isDirectory()) {
    return true;
  }
  const inTwi = path.resolve(rootAudio, "Twi", filename);
  if (inTwi.startsWith(rootAudio) && fs.existsSync(inTwi) && !fs.statSync(inTwi).isDirectory()) {
    return true;
  }
  return false;
}
