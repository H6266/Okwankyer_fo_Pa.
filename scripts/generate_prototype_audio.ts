import * as googleTTS from "google-tts-api";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface PromptDef {
  num: string;
  name: string;
  alias: string;
  text: string;
  description: string;
}

const PROMPTS: PromptDef[] = [
  {
    num: "01",
    name: "01_service_select.mp3",
    alias: "service_select.mp3",
    text: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
    description: "Main telecom vs banking menu prompt",
  },
  {
    num: "02",
    name: "02_network_select.mp3",
    alias: "network_select.mp3",
    text: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again. Press 0 to exit.",
    description: "Network provider selection (MTN, Telecel, AT)",
  },
  {
    num: "03",
    name: "03_network_select_alt.mp3",
    alias: "network_select_alt.mp3",
    text: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again or 0 to exit.",
    description: "Network provider selection alternate variation",
  },
  {
    num: "04",
    name: "04_mtn_services_menu.mp3",
    alias: "mtn_services.mp3",
    text: "MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cash out, press 4. To check your account, press 5. Press 8 to go back or 0 to exit.",
    description: "MTN services sub-menu",
  },
  {
    num: "05",
    name: "05_enter_recipient_phone.mp3",
    alias: "enter_recipient.mp3",
    text: "Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit.",
    description: "Prompt for recipient telephone digits",
  },
  {
    num: "06",
    name: "06_demo_recipient_digits.mp3",
    alias: "demo_recipient_digits.mp3",
    text: "0, 2, 4, 1, 2, 3, 4, 5, 6, 7, hash.",
    description: "Spoken DTMF input read-back sample",
  },
  {
    num: "07",
    name: "07_confirm_recipient_name.mp3",
    alias: "confirm_recipient_name.mp3",
    text: "You are about to send money to Kwame Nyameba, whose phone number ends with 4 5 6 7. To confirm and send the money, press 1. To cancel, press 2. To exit completely, press 0.",
    description: "Recipient name verification KYC gate",
  },
  {
    num: "08",
    name: "08_enter_amount_cedis.mp3",
    alias: "enter_amount.mp3",
    text: "Enter the cedi amount you want to send to Kwame Nyameba, followed by hash. Use star for pesewas.",
    description: "Amount input prompt with star decimal note",
  },
  {
    num: "09",
    name: "09_confirm_transfer_summary.mp3",
    alias: "confirm_transfer.mp3",
    text: "You are about to send 500 Ghana Cedis to Kwame Nyameba. To confirm and send, press 1. To cancel, press 2.",
    description: "Final transfer authorization challenge",
  },
  {
    num: "10",
    name: "10_pin_prompt_screen_handoff.mp3",
    alias: "pin_prompt_screen_handoff.mp3",
    text: "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately. Thank you for using Okwankyerɛfo Pa. Goodbye.",
    description: "Zero-PIN security handset handoff prompt",
  },
  {
    num: "11",
    name: "11_transaction_receipt_summary.mp3",
    alias: "transaction_receipt.mp3",
    text: "Congratulations! You have successfully sent 500 Ghana Cedis to Kwame Nyameba. Your transaction was completed on 17th September 2026 at 5:00 PM. Your reference number is OKP 847291. Your transaction details have also been sent to you. Would you like to do anything else?",
    description: "Transaction receipt summary and reference code",
  },
  {
    num: "12",
    name: "12_welcome_language_intro.mp3",
    alias: "welcome_language_intro.mp3",
    text: "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    description: "Initial IVR welcome greeting and language selection",
  },
];

async function generateAll() {
  const targetDir = path.join(process.cwd(), "audio", "English_audio_prot");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Also create "English prototype audio" as a symlink or mirror for exact match
  const spaceDir = path.join(process.cwd(), "audio", "English prototype audio");
  try {
    if (!fs.existsSync(spaceDir)) {
      fs.symlinkSync(targetDir, spaceDir, "dir");
    }
  } catch (err) {
    console.warn("Could not create symlink for spaced dir:", err);
  }

  console.log(`Generating 12 English prototype audio files in ${targetDir}...`);

  for (const item of PROMPTS) {
    console.log(`Generating [${item.num}] ${item.name}...`);
    try {
      // Use googleTTS to get base64 audio
      // If text is long, getAudioBase64 can split or handle it
      let buffer: Buffer;
      if (item.text.length < 200) {
        const base64 = await googleTTS.getAudioBase64(item.text, {
          lang: "en",
          slow: false,
          host: "https://translate.google.com",
          timeout: 15000,
        });
        buffer = Buffer.from(base64, "base64");
      } else {
        // Multi-segment for longer speech
        const results = await googleTTS.getAllAudioBase64(item.text, {
          lang: "en",
          slow: false,
          host: "https://translate.google.com",
          timeout: 15000,
        });
        buffer = Buffer.concat(results.map((r) => Buffer.from(r.base64, "base64")));
      }

      const filePath = path.join(targetDir, item.name);
      fs.writeFileSync(filePath, buffer);

      // Also copy/symlink alias
      const aliasPath = path.join(targetDir, item.alias);
      fs.writeFileSync(aliasPath, buffer);

      console.log(`  ✓ Written ${item.name} (${buffer.length} bytes)`);
    } catch (e: any) {
      console.error(`  ✗ Error generating ${item.name}:`, e.message);
    }
  }

  // Generate a manifest file: manifest.json inside English_audio_prot
  const manifest = {
    folder: "English_audio_prot",
    title: "English Prototype Audio Suite",
    description: "12 voice prompts for Ghana Digital Services IVR MoMo Pilot",
    recordedAt: "2026-09-18",
    prompts: PROMPTS.map((p) => {
      const pPath = path.join(targetDir, p.name);
      let size = 0;
      if (fs.existsSync(pPath)) {
        size = fs.statSync(pPath).size;
      }
      return {
        number: p.num,
        filename: p.name,
        alias: p.alias,
        url: `/audio/English_audio_prot/${p.name}`,
        aliasUrl: `/audio/English_audio_prot/${p.alias}`,
        spokenText: p.text,
        description: p.description,
        sizeBytes: size,
      };
    }),
  };

  fs.writeFileSync(
    path.join(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
  console.log("✓ Created manifest.json in English_audio_prot directory");
}

generateAll().catch(console.error);
