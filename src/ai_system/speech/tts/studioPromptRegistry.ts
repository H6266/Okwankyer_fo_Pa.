/**
 * Ɔkwankyerɛfo Pa - Authoritative Studio Prompt Registry (studioPromptRegistry.ts)
 * 
 * Maps all canonical IVR prompts to pre-recorded studio files, caches audio metadata,
 * and enables HTTP 206 byte-range streaming for telephone carrier low-latency playback.
 */

import fs from "fs";
import path from "path";
import { Request, Response } from "express";

export interface StudioPromptMetadata {
  key: string;
  language: "en" | "tw" | "bilingual";
  relativeUrl: string;
  absolutePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sampleRateHz: number;
  bitrateKbps: number;
  durationSec: number;
  spokenText: string;
  stepName: string;
}

export class StudioPromptRegistry {
  private static instance: StudioPromptRegistry;
  private metadataCache = new Map<string, StudioPromptMetadata>();
  private audioBufferCache = new Map<string, Buffer>();
  private audioRoot: string;

  private constructor() {
    const candidateAudio = path.resolve(process.cwd(), "audio");
    const candidatePublic = path.resolve(process.cwd(), "public", "audio");
    this.audioRoot = fs.existsSync(candidateAudio)
      ? candidateAudio
      : fs.existsSync(candidatePublic)
      ? candidatePublic
      : candidateAudio;
    this.initializeRegistry();
  }

  public static getInstance(): StudioPromptRegistry {
    if (!StudioPromptRegistry.instance) {
      StudioPromptRegistry.instance = new StudioPromptRegistry();
    }
    return StudioPromptRegistry.instance;
  }

  /**
   * Initializes the registry and caches file metadata (duration, sample rate, bitrate)
   */
  private initializeRegistry(): void {
    const definitions: Array<{
      key: string;
      language: "en" | "tw" | "bilingual";
      filePath: string;
      spokenText: string;
      stepName: string;
      aliases: string[];
    }> = [
      {
        key: "welcome",
        language: "bilingual",
        filePath: "Welcome_prompt_01.mp3",
        spokenText: "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
        stepName: "language-selection",
        aliases: ["welcome_prompt_01", "greeting", "akwaaba_en", "language_selection"],
      },
      {
        key: "service_selection_en",
        language: "en",
        filePath: "English/Audio_prompt_02.mp3",
        spokenText: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
        stepName: "service-choice",
        aliases: ["service_en", "services_english", "audio_prompt_02"],
      },
      {
        key: "service_selection_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_03.mp3",
        spokenText: "Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.",
        stepName: "service-choice",
        aliases: ["service_twi", "dwumadie_paw", "audio_prompt_twi_03"],
      },
      {
        key: "network_selection_en",
        language: "en",
        filePath: "English/Audio_prompt_03.mp3",
        spokenText: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.",
        stepName: "network-choice",
        aliases: ["network_en", "select_network_en", "audio_prompt_03"],
      },
      {
        key: "network_selection_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_02.mp3",
        spokenText: "Afei selecte wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia anan na tie wei biom. Mia zero na si ha.",
        stepName: "network-choice",
        aliases: ["network_twi", "select_network_tw", "audio_prompt_twi_02"],
      },
      {
        key: "action_menu_en",
        language: "en",
        filePath: "English/Audio_prompt_05.mp3",
        spokenText: "MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cashout, press 4. To check your account, press 5. Press 8 to go back, or 0 to exit.",
        stepName: "action-choice",
        aliases: ["action_en", "momo_menu_en", "audio_prompt_05"],
      },
      {
        key: "action_menu_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_04.mp3",
        spokenText: "Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3. Sɛ wopɛ sɛ woallow-i cash out a, mia 4. Sɛ wopɛ sɛ wocheck-i wo account no a, mia 5. Mia 8 na kɔ back. Mia 0 na firi ha.",
        stepName: "action-choice",
        aliases: ["action_twi", "momo_menu_tw", "audio_prompt_twi_04"],
      },
      {
        key: "enter_recipient_en",
        language: "en",
        filePath: "English/Audio_prompt_06.mp3",
        spokenText: "Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit.",
        stepName: "enter-recipient",
        aliases: ["recipient_en", "enter_phone_en", "audio_prompt_06"],
      },
      {
        key: "enter_recipient_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_05.mp3",
        spokenText: "Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho. Mia zero na san akyi.",
        stepName: "enter-recipient",
        aliases: ["recipient_twi", "enter_phone_tw", "audio_prompt_twi_05"],
      },
      {
        key: "enter_amount_en",
        language: "en",
        filePath: "English/Audio_prompt_09.mp3",
        spokenText: "Enter the cedi amount you want to send to Kwame Nyamebere, followed by hash. Use star for pesewas.",
        stepName: "enter-amount",
        aliases: ["amount_en", "enter_amount", "audio_prompt_09"],
      },
      {
        key: "enter_amount_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_07.mp3",
        spokenText: "Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to.",
        stepName: "enter-amount",
        aliases: ["amount_twi", "sika_dodow_twi", "audio_prompt_twi_07"],
      },
      {
        key: "confirm_transaction_en",
        language: "en",
        filePath: "English/Audio_prompt_10.mp3",
        spokenText: "You are about to send 500 Ghana cedis to Kwame Nyamebere. To confirm and send, press 1. To cancel, press 2.",
        stepName: "confirm",
        aliases: ["confirm_en", "safe_confirm_en", "audio_prompt_10"],
      },
      {
        key: "confirm_transaction_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_08.mp3",
        spokenText: "Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2).",
        stepName: "confirm",
        aliases: ["confirm_twi", "safe_confirm_tw", "audio_prompt_twi_08"],
      },
      {
        key: "zero_pin_en",
        language: "en",
        filePath: "English/Audio_prompt_11.mp3",
        spokenText: "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.",
        stepName: "zero-pin",
        aliases: ["pin_handoff_en", "zero_pin", "audio_prompt_11"],
      },
      {
        key: "zero_pin_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_09.mp3",
        spokenText: "Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN.",
        stepName: "zero-pin",
        aliases: ["pin_handoff_twi", "audio_prompt_twi_09"],
      },
      {
        key: "success_receipt_en",
        language: "en",
        filePath: "English/Audio_prompt_12.mp3",
        spokenText: "Congratulations! You have successfully sent 500 Ghana cedis to Kwame Nyamebere. Your transaction was completed on 17 September 2026 at 5:00 PM. Your reference number is OKP-847291. Your transaction details have also been sent to you. Would you like to do anything else?",
        stepName: "receipt",
        aliases: ["receipt_en", "audio_prompt_12"],
      },
      {
        key: "success_receipt_tw",
        language: "tw",
        filePath: "Twi/Audio_prompt_twi_10.mp3",
        spokenText: "Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed wɔ 17th September 2026...",
        stepName: "receipt",
        aliases: ["receipt_twi", "audio_prompt_twi_10"],
      },
      {
        key: "thank_you_en",
        language: "en",
        filePath: "English/Audio_prompt_13.mp3",
        spokenText: "Thank you for using Ɔkwankyerɛfo Pa, an easy financial transaction service. Goodbye.",
        stepName: "end",
        aliases: ["goodbye_en", "audio_prompt_13"],
      },
    ];

    for (const def of definitions) {
      const absPath = path.resolve(this.audioRoot, def.filePath);
      if (fs.existsSync(absPath)) {
        const stats = fs.statSync(absPath);
        const fileSizeBytes = stats.size;
        // Standard studio MP3 specs (128 kbps, 44.1 kHz mono/stereo)
        const bitrateKbps = 128;
        const sampleRateHz = 44100;
        const durationSec = Math.max(1, Math.round((fileSizeBytes * 8) / (bitrateKbps * 1000)));

        const meta: StudioPromptMetadata = {
          key: def.key,
          language: def.language,
          relativeUrl: `/audio/${def.filePath}`,
          absolutePath: absPath,
          mimeType: "audio/mpeg",
          fileSizeBytes,
          sampleRateHz,
          bitrateKbps,
          durationSec,
          spokenText: def.spokenText,
          stepName: def.stepName,
        };

        this.metadataCache.set(def.key, meta);
        for (const alias of def.aliases) {
          this.metadataCache.set(alias.toLowerCase(), meta);
        }
      }
    }
  }

  /**
   * Resolves a prompt by key and optional language hint.
   * e.g. ("enter_amount", "tw") -> Audio_prompt_twi_07.mp3
   */
  public getPrompt(keyOrText: string, language: "en" | "tw" = "en"): StudioPromptMetadata | null {
    const cleanKey = keyOrText.toLowerCase().trim().replace(/[-_]/g, " ");

    // Check language-specific key
    const langKey = `${cleanKey}_${language}`;
    if (this.metadataCache.has(langKey)) {
      return this.metadataCache.get(langKey)!;
    }

    // Direct key match
    if (this.metadataCache.has(cleanKey)) {
      return this.metadataCache.get(cleanKey)!;
    }

    // Semantic key matching for canonical flow
    if (cleanKey.includes("welcome") || cleanKey.includes("akwaaba")) {
      return this.metadataCache.get("welcome") || null;
    }
    if (cleanKey.includes("amount") || cleanKey.includes("sika dodow")) {
      return this.metadataCache.get(language === "tw" ? "enter_amount_tw" : "enter_amount_en") || null;
    }
    if (cleanKey.includes("recipient") || cleanKey.includes("number") || cleanKey.includes("phone")) {
      return this.metadataCache.get(language === "tw" ? "enter_recipient_tw" : "enter_recipient_en") || null;
    }
    if (cleanKey.includes("service") || cleanKey.includes("dwumadie")) {
      return this.metadataCache.get(language === "tw" ? "service_selection_tw" : "service_selection_en") || null;
    }
    if (cleanKey.includes("network") || cleanKey.includes("carrier")) {
      return this.metadataCache.get(language === "tw" ? "network_selection_tw" : "network_selection_en") || null;
    }
    if (cleanKey.includes("confirm") || cleanKey.includes("safe")) {
      return this.metadataCache.get(language === "tw" ? "confirm_transaction_tw" : "confirm_transaction_en") || null;
    }
    if (cleanKey.includes("pin") || cleanKey.includes("handoff")) {
      return this.metadataCache.get(language === "tw" ? "zero_pin_tw" : "zero_pin_en") || null;
    }
    if (cleanKey.includes("receipt") || cleanKey.includes("success") || cleanKey.includes("congratulat")) {
      return this.metadataCache.get(language === "tw" ? "success_receipt_tw" : "success_receipt_en") || null;
    }

    return null;
  }

  /**
   * Reads and caches the binary audio buffer for the prompt
   */
  public getAudioBuffer(prompt: StudioPromptMetadata): Buffer {
    let buf = this.audioBufferCache.get(prompt.absolutePath);
    if (!buf) {
      buf = fs.readFileSync(prompt.absolutePath);
      this.audioBufferCache.set(prompt.absolutePath, buf);
    }
    return buf;
  }

  /**
   * High-performance HTTP 206 Byte-Range streaming for telephone carriers and browser simulator.
   */
  public streamPrompt(req: Request, res: Response, prompt: StudioPromptMetadata): void {
    const buffer = this.getAudioBuffer(prompt);
    const fileSize = buffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      const chunk = buffer.subarray(start, end + 1);

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": prompt.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Studio-Prompt-Key": prompt.key,
        "X-Studio-Prompt-Language": prompt.language,
      });

      res.end(chunk);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": prompt.mimeType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Studio-Prompt-Key": prompt.key,
        "X-Studio-Prompt-Language": prompt.language,
      });

      res.end(buffer);
    }
  }
}

export const studioPromptRegistry = StudioPromptRegistry.getInstance();
