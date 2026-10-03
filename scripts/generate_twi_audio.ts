import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TWI_PROMPTS = [
  {
    num: "01",
    name: "01_service_select.mp3",
    aliases: ["service_select.mp3", "service_twi.mp3"],
    text: "Telecom anaa Mobile Money dwumadie no, mia baako. Sikakorabea dwumadie no, mia mmienu. Sɛ wopɛ sɛ wote wei bio a, mia nkron. Sɛ wopɛ sɛ wofiri mu a, mia hwee.",
    description: "Service selection prompt in Twi"
  },
  {
    num: "02",
    name: "02_network_select.mp3",
    aliases: ["network_select.mp3", "provider_twi.mp3"],
    text: "Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako. Sɛ ɛyɛ Telecel a, mia mmienu. Sɛ ɛyɛ AirtelTigo a, mia mmiensa. Sɛ wopɛ sɛ wote wei bio a, mia nkron. Sɛ wopɛ sɛ wofiri mu a, mia hwee.",
    description: "Network provider selection in Twi"
  },
  {
    num: "03",
    name: "03_network_select_alt.mp3",
    aliases: ["network_select_alt.mp3"],
    text: "Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako. Sɛ ɛyɛ Telecel a, mia mmienu. Sɛ ɛyɛ AirtelTigo a, mia mmiensa. Sɛ wopɛ sɛ wote wei bio a, mia nkron. Anaasɛ mia hwee sɛ wofiri mu.",
    description: "Network provider selection alternate variation in Twi"
  },
  {
    num: "04",
    name: "04_mtn_services_menu.mp3",
    aliases: ["mtn_services.mp3", "action_twi.mp3"],
    text: "MTN dwumadie. Sɛ wopɛ sɛ womena sika ma obi a ɔde MoMo a, mia baako. Sɛ wopɛ sɛ wotua ka bi a, mia mmienu. Sɛ wopɛ sɛ wotɔ nkitahodi anaa data a, mia mmiensa. Sɛ wopɛ sɛ woyi sika a, mia nan. Sɛ wopɛ sɛ wohwɛ sika a ɛwɔ wo so a, mia nnum. Sɛ wopɛ sɛ wokɔ akyi a, mia nwɔtwe. Anaasɛ mia hwee sɛ wofiri mu.",
    description: "MTN services menu in Twi"
  },
  {
    num: "05",
    name: "05_enter_recipient_phone.mp3",
    aliases: ["enter_recipient.mp3", "recipient_twi.mp3"],
    text: "Bɔ nɔma du a wopɛ sɛ womena sika no ma no, na afei mia hash. Mia hwee sɛ wofiri mu.",
    description: "Enter recipient phone number prompt in Twi"
  },
  {
    num: "06",
    name: "06_demo_recipient_digits.mp3",
    aliases: ["demo_recipient_digits.mp3"],
    text: "Hwee, mmienu, nan, baako, mmienu, mmiensa, nan, nnum, nsia, nson, hash.",
    description: "Spoken DTMF recipient digits read-back in Twi"
  },
  {
    num: "07",
    name: "07_confirm_recipient_name.mp3",
    aliases: ["confirm_recipient_name.mp3"],
    text: "Worebɛmena sika ama Kwame Nyameba a ne nɔma no wie wɔ nan, nnum, nsia, nson. Sɛ wopene so sɛ womena sika no a, mia baako. Sɛ woampene so a, mia mmienu. Sɛ wopɛ sɛ wofiri mu koraa a, mia hwee.",
    description: "Recipient name verification in Twi"
  },
  {
    num: "08",
    name: "08_enter_amount_cedis.mp3",
    aliases: ["enter_amount.mp3", "amount_twi.mp3"],
    text: "Bɔ Ghana sidi dodoɔ a wopɛ sɛ womena ma Kwame Nyameba, na afei mia hash. Fa nsoromma ma pesewas.",
    description: "Enter amount in Cedis prompt in Twi"
  },
  {
    num: "09",
    name: "09_confirm_transfer_summary.mp3",
    aliases: ["confirm_transfer.mp3", "confirm_twi.mp3"],
    text: "Worebɛmena Ghana sidi ahanum ama Kwame Nyameba. Sɛ wopene so sɛ womena a, mia baako. Sɛ woampene so a, mia mmienu.",
    description: "Final transfer confirmation summary in Twi"
  },
  {
    num: "10",
    name: "10_pin_prompt_screen_handoff.mp3",
    aliases: ["pin_prompt_screen_handoff.mp3", "success_twi.mp3"],
    text: "Woapene so. Afei, yɛsrɛ wo hwɛ wo fon no anim na bɔ wo MoMo PIN pɔtee. Yɛda wo ase sɛ wode Okwankyerɛfo Pa adi dwuma. Nante yie.",
    description: "Zero-PIN screen handoff prompt in Twi"
  },
  {
    num: "11",
    name: "11_transaction_receipt_summary.mp3",
    aliases: ["transaction_receipt.mp3"],
    text: "Mo ne yo! Woatumi amena Ghana sidi ahanum ama Kwame Nyameba. Woawie wo dwumadie no wɔ 17th September 2026, anwummerɛ dɔn nnum. Wo reference nɔma yɛ OKP 847291. Yɛamena wo dwumadie no ho nsɛm nyinaa nso ama wo. Wopɛ sɛ woyɛ biribi foforɔ bi bio anaa?",
    description: "Transaction receipt summary in Twi"
  },
  {
    num: "cancel",
    name: "cancel_twi.mp3",
    aliases: ["cancel.mp3"],
    text: "Yɛatwa mu. Sika no mfiri wo account mu. Akwaaba.",
    description: "Transaction cancelled in Twi"
  }
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(text: string, maxAttempts = 5): Promise<Buffer> {
  const models = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-3.1-flash-tts-preview"
  ];

  for (const model of models) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" }
              }
            }
          }
        });
        const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (data) {
          return Buffer.from(data, "base64");
        }
        throw new Error("No inline data returned");
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.log(`[${model} Attempt ${attempt}] Error: ${msg.slice(0, 100)}`);
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          console.log(`Model ${model} exhausted, trying next model...`);
          break; // Move to next model immediately!
        }
        if (attempt === maxAttempts) break;
        await sleep(3000);
      }
    }
  }
  throw new Error("Exhausted all models and retries");
}

async function main() {
  const targetDir = path.join(process.cwd(), "audio", "twi_recording");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Create symlink for "twi recording" (with space)
  const spacedDir = path.join(process.cwd(), "audio", "twi recording");
  if (!fs.existsSync(spacedDir)) {
    try {
      fs.symlinkSync(targetDir, spacedDir, "dir");
    } catch (err) {
      console.warn("Could not create symlink for spaced dir:", err);
    }
  }

  for (const item of TWI_PROMPTS) {
    const mp3Path = path.join(targetDir, item.name);
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 5000) {
      console.log(`✓ Skipping already generated ${item.name}`);
      for (const alias of item.aliases) {
        fs.copyFileSync(mp3Path, path.join(targetDir, alias));
        fs.copyFileSync(mp3Path, path.join(process.cwd(), "audio", alias));
      }
      continue;
    }

    console.log(`Generating ${item.num}: ${item.name}...`);
    try {
      const pcmBuffer = await generateWithRetry(item.text);
      const pcmTemp = path.join("/tmp", `${item.name}.pcm`);
      fs.writeFileSync(pcmTemp, pcmBuffer);
      execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmTemp}" -b:a 128k "${mp3Path}" 2>/dev/null`);
      fs.unlinkSync(pcmTemp);

      for (const alias of item.aliases) {
        fs.copyFileSync(mp3Path, path.join(targetDir, alias));
        fs.copyFileSync(mp3Path, path.join(process.cwd(), "audio", alias));
      }
      console.log(`  ✓ Written ${item.name} (${fs.statSync(mp3Path).size} bytes)`);

      // Gentle pause to respect rate limits
      await sleep(15000);
    } catch (e: any) {
      console.error(`  ✗ Failed to generate ${item.name}:`, e.message);
    }
  }

  // Generate manifest.json in twi_recording
  const manifest = {
    folder: "twi recording",
    aliases: ["twi_recording"],
    title: "Twi Recording Voice Suite",
    description: "11 Authentic Twi (Akan) audio prompts for Ghana IVR MoMo Pilot",
    recordedAt: "2026-09-19",
    prompts: TWI_PROMPTS.map((p) => {
      const pPath = path.join(targetDir, p.name);
      const size = fs.existsSync(pPath) ? fs.statSync(pPath).size : 0;
      return {
        number: p.num,
        filename: p.name,
        aliases: p.aliases,
        url: `/audio/twi_recording/${p.name}`,
        urlSpaced: `/audio/twi%20recording/${p.name}`,
        spokenText: p.text,
        description: p.description,
        sizeBytes: size,
      };
    }),
  };

  fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log("✓ Manifest updated in twi_recording!");
}

main().catch(console.error);
