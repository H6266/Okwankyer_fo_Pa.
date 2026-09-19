import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { initialize, VoiceService } from "./africastalking";
import { transactionOrchestrator } from "./src/modules/transactionOrchestrator";
import { conversationManager } from "./src/modules/conversationManager";
import { speechToText } from "./src/modules/sttService";
import { parseUserIntent, extractAmount, extractRecipient } from "./src/modules/nluService";
import { MOCK_CONTACTS, findContact } from "./src/modules/mockContacts";

const app = express();
const PORT = 3000;

// Parse standard form bodies and large payloads for audio uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

// ── Config ────────────────────────────────────────────────────────────
const USERNAME = process.env.AT_USERNAME;
const API_KEY = process.env.AT_API_KEY;

if (!USERNAME) {
  console.log("⚠️  AT_USERNAME is not set. Outbound voice calls will not trigger via AT API.");
}

if (!API_KEY) {
  console.log("⚠️  AT_API_KEY is not set — outbound voice calls will not work until configured.");
}

let voiceClient: VoiceService | null = null;
if (USERNAME && API_KEY) {
  try {
    const at = initialize(USERNAME, API_KEY);
    voiceClient = at.Voice;
  } catch (err) {
    console.error("Failed to initialize Africa's Talking client:", err);
  }
}

const VOICE_NUMBER = process.env.AT_VOICE_NUMBER || "+233308048098";

// ── KYC & Recipient Database (Simulated Telco Core) ───────────────────
// Maps Ghanaian phone numbers to verified real names for human-readable confirmation
export interface RecipientRecord {
  phoneNumber: string;
  name: string;
  network: "MTN" | "Telecel" | "AT" | "G-Money";
}

const REGISTERED_SUBSCRIBERS: Record<string, RecipientRecord> = {
  "0241234567": { phoneNumber: "0241234567", name: "Kwame Nyameba", network: "MTN" },
  "0543546010": { phoneNumber: "0543546010", name: "Hannes Aboagye", network: "MTN" },
  "0244123456": { phoneNumber: "0244123456", name: "Kwame Mensah", network: "MTN" },
  "0249876543": { phoneNumber: "0249876543", name: "Kofi Annan", network: "MTN" },
  "0201234567": { phoneNumber: "0201234567", name: "Ama Serwaa", network: "Telecel" },
  "0271234567": { phoneNumber: "0271234567", name: "Yaw Osei", network: "AT" },
  "0551234567": { phoneNumber: "0551234567", name: "Abena Mansa", network: "MTN" },
};

export function lookupRecipient(rawPhone: string): { valid: boolean; error?: string; record?: RecipientRecord } {
  // Normalize string: strip spaces, dashes, country code +233
  let clean = rawPhone.replace(/[^0-9]/g, "");
  if (clean.startsWith("233")) {
    clean = "0" + clean.slice(3);
  }

  // Check length
  if (clean.length !== 10) {
    return {
      valid: false,
      error: "Phone number must be exactly 10 digits.",
    };
  }

  // Check valid Ghanaian prefixes: 024, 054, 055, 059, 053 (MTN), 020, 050 (Telecel), 027, 057, 026, 056 (AT)
  const prefix = clean.slice(0, 3);
  const mtnPrefixes = ["024", "054", "055", "059", "053"];
  const telecelPrefixes = ["020", "050"];
  const atPrefixes = ["027", "057", "026", "056"];

  let network: "MTN" | "Telecel" | "AT" = "MTN";
  if (mtnPrefixes.includes(prefix)) network = "MTN";
  else if (telecelPrefixes.includes(prefix)) network = "Telecel";
  else if (atPrefixes.includes(prefix)) network = "AT";
  else {
    return {
      valid: false,
      error: `Invalid Ghanaian network prefix ${prefix}.`,
    };
  }

  if (REGISTERED_SUBSCRIBERS[clean]) {
    return { valid: true, record: REGISTERED_SUBSCRIBERS[clean] };
  }

  // Dynamic fallback for any valid Ghanaian number
  return {
    valid: true,
    record: {
      phoneNumber: clean,
      name: `Subscriber (${clean.slice(0, 3)}...${clean.slice(-4)})`,
      network,
    },
  };
}

export function validateAmount(rawAmount: string): { valid: boolean; error?: string; amountGHS?: number } {
  // Can contain digits or '*' used as decimal point in DTMF (e.g. 50*10 = 50.10)
  const normalized = rawAmount.replace(/\*/g, ".");
  const num = parseFloat(normalized);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: "Invalid amount." };
  }
  if (num > 5000) {
    return { valid: false, error: "Amount exceeds single transaction limit of 5,000 Cedis." };
  }
  return { valid: true, amountGHS: Math.round(num * 100) / 100 };
}

// ── Audio Phrase Bank Definition ─────────────────────────────────────
export interface PhraseItem {
  id: string;
  filename: string;
  category: "welcome" | "confirm" | "auth" | "cancel";
  language: "bilingual" | "twi" | "en";
  title: string;
  spokenText: string;
  description: string;
}

export const PHRASE_BANK: PhraseItem[] = [
  {
    id: "intro",
    filename: "intro.mp3",
    category: "welcome",
    language: "bilingual",
    title: "Intro & Language Prompt",
    spokenText: "For English, press 1. Twi firi mu, mia 2.",
    description: "Plays when incoming/outgoing call connects. Welcomes user and asks for language selection.",
  },
  {
    id: "confirm_twi",
    filename: "confirm_twi.mp3",
    category: "confirm",
    language: "twi",
    title: "Twi MoMo Confirmation (Core Demo)",
    spokenText: "Woremane sika cedi 50 kɔma Kwame Mensah. Sɛ wopene so a, mia baako. Sɛ woampene so a, mia mmienu.",
    description: "Reads back transfer details in Akan (Twi) and prompts user to press 1 to confirm or 2 to cancel.",
  },
  {
    id: "confirm_en",
    filename: "confirm_en.mp3",
    category: "confirm",
    language: "en",
    title: "English MoMo Confirmation (Core Demo)",
    spokenText: "You are sending 50 Ghana Cedis to Kwame Mensah. To confirm this transfer, press 1. To cancel, press 2.",
    description: "Reads back transfer details in English and prompts user to press 1 to confirm or 2 to cancel.",
  },
  {
    id: "success_twi",
    filename: "success_twi.mp3",
    category: "auth",
    language: "twi",
    title: "Twi Authorization Feedback",
    spokenText: "Yɛapene so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu sika no nkɔ pɛpɛɛpɛ.",
    description: "Spoken when user confirms (1). Instructs user to enter their PIN on their phone's MoMo prompt.",
  },
  {
    id: "success_en",
    filename: "success_en.mp3",
    category: "auth",
    language: "en",
    title: "English Authorization Feedback",
    spokenText: "Transaction authorized. Please check your screen now to enter your Mobile Money PIN.",
    description: "Spoken when user confirms (1). Instructs user to enter their PIN on their phone's MoMo prompt.",
  },
  {
    id: "cancel_twi",
    filename: "cancel_twi.mp3",
    category: "cancel",
    language: "twi",
    title: "Twi Cancellation Feedback",
    spokenText: "Yɛatwa mu. Sika no mfiri wo account mu.",
    description: "Spoken when user cancels (2). Confirms that transaction was aborted and no funds were deducted.",
  },
  {
    id: "cancel_en",
    filename: "cancel_en.mp3",
    category: "cancel",
    language: "en",
    title: "English Cancellation Feedback",
    spokenText: "Transaction cancelled. No money has been deducted from your account.",
    description: "Spoken when user cancels (2). Confirms that transaction was aborted and no funds were deducted.",
  },
  // ── English Prototype Audio Suite (/audio/English_audio_prot/) ────────
  {
    id: "prot_01",
    filename: "English_audio_prot/01_service_select.mp3",
    category: "welcome",
    language: "en",
    title: "1. Service Selection (Telecom vs Bank)",
    spokenText: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
    description: "Main service selection branch prompt.",
  },
  {
    id: "prot_02",
    filename: "English_audio_prot/02_network_select.mp3",
    category: "welcome",
    language: "en",
    title: "2. Network Provider Selection",
    spokenText: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again. Press 0 to exit.",
    description: "Telco selection prompt (MTN, Telecel, AT).",
  },
  {
    id: "prot_03",
    filename: "English_audio_prot/03_network_select_alt.mp3",
    category: "welcome",
    language: "en",
    title: "3. Network Provider (Variation 2)",
    spokenText: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again or 0 to exit.",
    description: "Alternate network selection variation with concise tail.",
  },
  {
    id: "prot_04",
    filename: "English_audio_prot/04_mtn_services_menu.mp3",
    category: "welcome",
    language: "en",
    title: "4. MTN MoMo Services Menu",
    spokenText: "MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cash out, press 4. To check your account, press 5. Press 8 to go back or 0 to exit.",
    description: "Full MTN services sub-menu with 6 navigational choices.",
  },
  {
    id: "prot_05",
    filename: "English_audio_prot/05_enter_recipient_phone.mp3",
    category: "confirm",
    language: "en",
    title: "5. Recipient Phone Number Entry",
    spokenText: "Enter the 10-digit number you want to send money to, followed by hash. Press 0 to exit.",
    description: "Spoken instruction for entering beneficiary's 10-digit telephone number.",
  },
  {
    id: "prot_06",
    filename: "English_audio_prot/06_demo_recipient_digits.mp3",
    category: "confirm",
    language: "en",
    title: "6. Dialled Recipient Digits Sample",
    spokenText: "0, 2, 4, 1, 2, 3, 4, 5, 6, 7, hash.",
    description: "Read-back sample of user's dialled beneficiary telephone digits.",
  },
  {
    id: "prot_07",
    filename: "English_audio_prot/07_confirm_recipient_name.mp3",
    category: "confirm",
    language: "en",
    title: "7. KYC Recipient Verification",
    spokenText: "You are about to send money to Kwame Nyameba, whose phone number ends with 4 5 6 7. To confirm and send the money, press 1. To cancel, press 2. To exit completely, press 0.",
    description: "Voice gate confirming recipient name and last 4 digits.",
  },
  {
    id: "prot_08",
    filename: "English_audio_prot/08_enter_amount_cedis.mp3",
    category: "confirm",
    language: "en",
    title: "8. Transfer Amount Prompt",
    spokenText: "Enter the cedi amount you want to send to Kwame Nyameba, followed by hash. Use star for pesewas.",
    description: "Amount collection prompt with universal star decimal notation.",
  },
  {
    id: "prot_09",
    filename: "English_audio_prot/09_confirm_transfer_summary.mp3",
    category: "confirm",
    language: "en",
    title: "9. Transfer Confirmation Read-back",
    spokenText: "You are about to send 500 Ghana Cedis to Kwame Nyameba. To confirm and send, press 1. To cancel, press 2.",
    description: "High-contrast read-back before financial authorization.",
  },
  {
    id: "prot_10",
    filename: "English_audio_prot/10_pin_prompt_screen_handoff.mp3",
    category: "auth",
    language: "en",
    title: "10. Zero-PIN Handset Handoff",
    spokenText: "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately. Thank you for using Okwankyerɛfo Pa. Goodbye.",
    description: "Crucial security prompt routing PIN entry away from telephone voice channel.",
  },
  {
    id: "prot_11",
    filename: "English_audio_prot/11_transaction_receipt_summary.mp3",
    category: "auth",
    language: "en",
    title: "11. Transaction Receipt & Ref Number",
    spokenText: "Congratulations! You have successfully sent 500 Ghana Cedis to Kwame Nyameba. Your transaction was completed on 17th September 2026 at 5:00 PM. Your reference number is OKP 847291. Your transaction details have also been sent to you. Would you like to do anything else?",
    description: "Spoken post-transaction receipt with timestamp and reference code.",
  },
  {
    id: "prot_12",
    filename: "English_audio_prot/12_welcome_language_intro.mp3",
    category: "welcome",
    language: "en",
    title: "12. Service Welcome & Language Selector",
    spokenText: "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    description: "Comprehensive English service greeting and dialect menu.",
  },
];

function audioExists(filename: string): boolean {
  const p = path.join(process.cwd(), "audio", filename);
  if (fs.existsSync(p)) return true;
  const pProt = path.join(process.cwd(), "audio", "English_audio_prot", filename);
  if (fs.existsSync(pProt)) return true;
  if (filename === "confirm_en.mp3" || filename === "success_en.mp3") return true;
  return false;
}

function getPublicBaseUrl(req?: Request): string {
  const publicBase = process.env.BASE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_URL;
  if (publicBase) {
    return publicBase.replace(/\/+$/, "");
  }
  if (req) {
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
    let proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    if (host) {
      if (host.includes(".run.app") || host.includes("ai.studio") || (!host.includes("localhost") && !host.includes("127.0.0.1"))) {
        proto = "https";
      }
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }
  return "https://ais-dev-cpr6p4vdntetpvjzrftv3o-557622788575.europe-west1.run.app";
}

// ── Streaming Audio Handler with HTTP 206 Byte Ranges ─────────────────
// Supports root /audio/:filename as well as nested subfolders e.g. /audio/English_audio_prot/:file
app.all("/audio/*", (req: Request, res: Response) => {
  const rawSubpath = decodeURIComponent((req.params as any)[0] || "");
  // Guard against directory traversal
  const cleanSubpath = path.normalize(rawSubpath).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(process.cwd(), "audio", cleanSubpath);

  // If not directly in /audio, check /audio/English_audio_prot/
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const altProt = path.join(process.cwd(), "audio", "English_audio_prot", cleanSubpath);
    if (fs.existsSync(altProt) && !fs.statSync(altProt).isDirectory()) {
      filePath = altProt;
    } else if (cleanSubpath === "confirm_en.mp3") {
      filePath = path.join(process.cwd(), "audio", "English_audio_prot", "09_confirm_transfer_summary.mp3");
    } else if (cleanSubpath === "success_en.mp3") {
      filePath = path.join(process.cwd(), "audio", "English_audio_prot", "10_pin_prompt_screen_handoff.mp3");
    } else if (cleanSubpath === "cancel_en.mp3") {
      filePath = path.join(process.cwd(), "audio", "English_audio_prot", "10_pin_prompt_screen_handoff.mp3");
    }
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).send("Audio file not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const mimeType =
    ext === ".wav"
      ? "audio/wav"
      : ext === ".ogg"
      ? "audio/ogg"
      : ext === ".m4a" || ext === ".aac"
      ? "audio/mp4"
      : "audio/mpeg";

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── API: Phrase Bank Status & Management ──────────────────────────────
app.get("/api/phrase-bank", (_req: Request, res: Response) => {
  const phrases = PHRASE_BANK.map((item) => {
    const filePath = path.join(process.cwd(), "audio", item.filename);
    const exists = fs.existsSync(filePath);
    let size = 0;
    if (exists) {
      try {
        size = fs.statSync(filePath).size;
      } catch {}
    }
    return {
      ...item,
      exists,
      sizeBytes: size,
      sizeFormatted: exists ? `${(size / 1024).toFixed(1)} KB` : "Missing (using TTS)",
      url: `/audio/${item.filename}`,
    };
  });
  res.json({ phrases, count: phrases.length });
});

// ── API: English Prototype Audio Catalog ──────────────────────────────
app.get("/api/prototype-audio", (_req: Request, res: Response) => {
  const targetDir = path.join(process.cwd(), "audio", "English_audio_prot");
  const manifestPath = path.join(targetDir, "manifest.json");
  let manifest: any = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {}
  }

  let files: Array<{ name: string; size: number; sizeFormatted: string; url: string; ext: string }> = [];
  if (fs.existsSync(targetDir)) {
    const dirFiles = fs.readdirSync(targetDir);
    files = dirFiles
      .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".m4a") || f.endsWith(".aac"))
      .sort()
      .map((f) => {
        const stat = fs.statSync(path.join(targetDir, f));
        return {
          name: f,
          size: stat.size,
          sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
          url: `/audio/English_audio_prot/${encodeURIComponent(f)}`,
          ext: path.extname(f).toLowerCase(),
        };
      });
  }

  res.json({
    folder: "English_audio_prot",
    aliasFolder: "English prototype audio",
    manifest,
    files,
    count: files.length,
  });
});

// ── API: Audio File Upload (with target folder selection) ───────────────
app.post("/api/upload-audio", (req: Request, res: Response) => {
  const { filename, base64Data, folder } = req.body;

  if (!filename || !base64Data) {
    return res.status(400).json({ error: "Missing filename or base64Data" });
  }

  const cleanFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const ext = path.extname(cleanFilename).toLowerCase();
  if (![".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext)) {
    return res.status(400).json({ error: "File must be an audio format (.mp3, .wav, .m4a, .aac, .ogg)" });
  }

  try {
    let targetDir = path.join(process.cwd(), "audio");
    let relativeUrlPrefix = "/audio";

    if (folder === "English_audio_prot" || folder === "English prototype audio") {
      targetDir = path.join(process.cwd(), "audio", "English_audio_prot");
      relativeUrlPrefix = "/audio/English_audio_prot";
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const data = base64Data.replace(/^data:audio\/[a-z0-9]+;base64,/, "");
    const buffer = Buffer.from(data, "base64");
    const targetPath = path.join(targetDir, cleanFilename);
    fs.writeFileSync(targetPath, buffer);

    console.log(`🎙️ New audio file uploaded to ${targetDir}: ${cleanFilename} (${buffer.length} bytes)`);
    res.json({
      success: true,
      message: `File ${cleanFilename} uploaded successfully`,
      sizeBytes: buffer.length,
      url: `${relativeUrlPrefix}/${cleanFilename}`,
      folder: folder || "root",
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to save file" });
  }
});

// ── API: Health Status ───────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Ɔkwankyerɛfo Pa",
    team: "Anidasoɔ (Hope)",
    abstract: "A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot)",
    voiceNumber: VOICE_NUMBER,
    atConfigured: Boolean(voiceClient),
  });
});

// ── API: KYC & Recipient Directory ───────────────────────────────────
app.get("/api/kyc/lookup", (req: Request, res: Response) => {
  const phone = (req.query.phone as string) || "";
  const result = lookupRecipient(phone);
  res.json(result);
});

app.get("/api/kyc/list", (_req: Request, res: Response) => {
  const subscribers = Object.values(REGISTERED_SUBSCRIBERS);
  res.json({ subscribers, count: subscribers.length });
});

app.post("/api/kyc/subscriber", (req: Request, res: Response) => {
  const { phone, name, network } = req.body;
  if (!phone || !name || !network) {
    return res.status(400).json({ error: "phone, name, and network are required." });
  }
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ error: "Phone number must be 10 digits." });
  }
  REGISTERED_SUBSCRIBERS[cleanPhone] = {
    phoneNumber: cleanPhone,
    name: name.trim(),
    network: network as "MTN" | "Telecel" | "AT" | "G-Money",
  };
  res.json({ success: true, record: REGISTERED_SUBSCRIBERS[cleanPhone] });
});

// ── Helper: VoiceXML Generator ────────────────────────────────────────
function xmlResponse(res: Response, content: string) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>\n`);
}

// ── Helper: Universal Navigation Handler ──────────────────────────────
// Universal Key Grammar:
//   0 = Cancel transaction / exit
//   9 = Repeat current prompt
//   8 = Back to previous menu
function checkUniversalNav(
  digit: string,
  lang: string,
  prevUrl: string,
  currentUrl: string,
  res: Response
): boolean {
  if (digit === "0") {
    // TODO: Pending Phase 2 (Twi recordings)
    const msg =
      lang === "twi"
        ? "Yɛatwa mu sɛnea worepɛ no. Akwaaba, nante yiye."
        : "Transaction cancelled as requested. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.";
    xmlResponse(res, `    <Say voice="man">${msg}</Say>\n    <Reject/>`);
    return true;
  }
  if (digit === "8") {
    xmlResponse(res, `    <Redirect>${prevUrl}</Redirect>`);
    return true;
  }
  if (digit === "9") {
    xmlResponse(res, `    <Redirect>${currentUrl}</Redirect>`);
    return true;
  }
  return false;
}

// ── Helper: Speech Fallback VoiceXML Builder ───────────────────────────
// Builds the fallback VoiceXML containing <Record> when keypad input times out or is bypassed
function buildSpeechFallbackXml(options: {
  promptAudioUrl?: string;
  promptText?: string;
  errorPrefixText?: string;
  speechCallbackUrl: string;
}): string {
  let prompt = "";
  if (options.errorPrefixText) {
    prompt += `    <Say voice="man">${options.errorPrefixText}</Say>\n`;
  }
  if (options.promptAudioUrl) {
    prompt += `    <Play url="${options.promptAudioUrl}"/>`;
  } else {
    prompt += `    <Say voice="man">${options.promptText || "Please speak after the beep."}</Say>`;
  }
  return `${prompt}
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="10" callbackUrl="${options.speechCallbackUrl}"/>
    <Say voice="man">No response received. Goodbye.</Say>`;
}

// ── Speech Fallback Handler (Phase 1 English Voice Input) ─────────────
app.all("/speech-fallback", async (req: Request, res: Response) => {
  const step = (req.query?.step || req.body?.step || "") as string;
  const retryUrl = (req.query?.retryUrl || req.body?.retryUrl || "") as string;
  const targetUrl = (req.query?.targetUrl || req.body?.targetUrl || "") as string;
  const recordingUrl = (req.body?.recordingUrl || req.query?.recordingUrl || "") as string;
  const speechText = (req.body?.speechText || req.query?.speechText || "") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const service = (req.query?.service || req.body?.service || "momo") as string;
  const phone = (req.query?.phone || req.body?.phone || "0241234567") as string;
  const name = (req.query?.name || req.body?.name || "Kwame Nyameba") as string;
  const amount = (req.query?.amount || req.body?.amount || "500") as string;
  const baseUrl = getPublicBaseUrl(req);

  console.log(`🎙️ Speech fallback triggered for step: ${step}`);
  console.log(`   Recording URL: ${recordingUrl || "none"}`);
  console.log(`   Speech text payload: ${speechText || "none"}`);

  // Transcribe the audio or use simulated text input
  let transcript = "";
  let confidence = 0;

  try {
    const sttPayload = speechText || recordingUrl || "empty";
    const sttResult = await speechToText(sttPayload);
    transcript = (sttResult.text || "").trim();
    confidence = sttResult.confidence || 0;
    console.log(`🎙️ STT transcribed: "${transcript}" (confidence: ${(confidence * 100).toFixed(1)}%)`);
  } catch (err) {
    console.error("❌ STT transcription failed:", err);
    confidence = 0;
  }

  // Low-confidence or silence threshold: below 75% (0.75), replay the prompt and re-listen
  if (confidence < 0.75 || !transcript || transcript.toLowerCase() === "empty") {
    console.log(`⚠️ Speech confidence too low (${(confidence * 100).toFixed(1)}% < 75%) or empty. Re-prompting step.`);
    const fallbackRedirect = retryUrl ? `${baseUrl}${retryUrl}` : `${baseUrl}/voice-menu`;
    return xmlResponse(res, `    <Redirect>${fallbackRedirect}</Redirect>`);
  }

  const cleanText = transcript.toLowerCase();

  // Universal voice commands across any step
  if (/\b(cancel|stop|abort|quit|exit)\b/i.test(cleanText)) {
    return xmlResponse(
      res,
      `    <Say voice="man">Transaction cancelled as requested. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.</Say>\n    <Reject/>`
    );
  }

  // Universal Back Command: preserves provider, phone, and name across steps
  if (/\b(back|previous|go back)\b/i.test(cleanText)) {
    const encProvider = encodeURIComponent(provider);
    const encPhone = encodeURIComponent(phone);
    const encName = encodeURIComponent(name);
    const encService = encodeURIComponent(service);

    const backMap: Record<string, string> = {
      "language-selection": `${baseUrl}/voice-menu`,
      "service-select": `${baseUrl}/language-selection`,
      "provider-select": `${baseUrl}/service-select?lang=en`,
      "action-select": `${baseUrl}/provider-select?lang=en&amp;service=${encService}`,
      "enter-recipient": `${baseUrl}/action-select?lang=en&amp;provider=${encProvider}`,
      "enter-amount": `${baseUrl}/enter-recipient?lang=en&amp;provider=${encProvider}&amp;phone=${encPhone}&amp;name=${encName}`,
      "safe-confirmation": `${baseUrl}/enter-amount?lang=en&amp;provider=${encProvider}&amp;phone=${encPhone}&amp;name=${encName}`,
    };
    const backRedirect = backMap[step] || (retryUrl ? `${baseUrl}${retryUrl}` : `${baseUrl}/voice-menu`);
    return xmlResponse(res, `    <Redirect>${backRedirect}</Redirect>`);
  }

  // Step-specific priority NLU check: balance request at action-select before checking generic repeat
  if (step === "action-select" && /\b(balance|check balance|my balance|statement)\b/i.test(cleanText)) {
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-choice?lang=en&amp;provider=${provider}&amp;dtmfDigits=2</Redirect>`);
  }

  // Universal Repeat Command: narrowed so bare 'what' or 'again' doesn't match inside phrases like "what's my balance"
  const isRepeat =
    /^(what|what\?|what\!|again|pardon|pardon me|come again)$/i.test(cleanText) ||
    /^(repeat|repeat that|say again|say that again|play again|tell me again|once more)$/i.test(cleanText) ||
    /\b(repeat that|say that again|play again)\b/i.test(cleanText);

  if (isRepeat) {
    const repeatRedirect = retryUrl ? `${baseUrl}${retryUrl}` : `${baseUrl}/voice-menu`;
    return xmlResponse(res, `    <Redirect>${repeatRedirect}</Redirect>`);
  }

  // Route step-specific NLU resolution
  if (step === "language-selection") {
    let resolvedDtmf = "1";
    if (/\b(twi|akan|asante)\b/i.test(cleanText)) {
      resolvedDtmf = "2";
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?dtmfDigits=${resolvedDtmf}</Redirect>`);
  }

  if (step === "service-select") {
    let resolvedDtmf = "1";
    if (/\b(bank|banking|bank account|deposit)\b/i.test(cleanText)) {
      resolvedDtmf = "2";
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/service-choice?lang=en&amp;dtmfDigits=${resolvedDtmf}</Redirect>`);
  }

  if (step === "provider-select") {
    let resolvedDtmf = "1"; // MTN default
    if (/\b(telecel|vodafone|voda)\b/i.test(cleanText)) {
      resolvedDtmf = "2";
    } else if (/\b(at|airtel|tigo|airteltigo)\b/i.test(cleanText)) {
      resolvedDtmf = "3";
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/provider-choice?lang=en&amp;service=${service}&amp;dtmfDigits=${resolvedDtmf}</Redirect>`);
  }

  if (step === "action-select") {
    let resolvedDtmf = "1"; // Send Money default
    if (/\b(balance|check balance|my balance|statement)\b/i.test(cleanText)) {
      resolvedDtmf = "2";
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-choice?lang=en&amp;provider=${provider}&amp;dtmfDigits=${resolvedDtmf}</Redirect>`);
  }

  if (step === "enter-recipient") {
    const recipientData = extractRecipient(transcript);
    console.log(`🎙️ extractRecipient result:`, recipientData);

    if (recipientData.phone) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?lang=en&amp;provider=${provider}&amp;dtmfDigits=${recipientData.phone}</Redirect>`);
    }

    // Direct digit extraction fallback if spoken as digits
    const digitsOnly = transcript.replace(/\D/g, "");
    if (digitsOnly.length >= 9 && digitsOnly.length <= 12) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?lang=en&amp;provider=${provider}&amp;dtmfDigits=${digitsOnly}</Redirect>`);
    }

    console.log(`⚠️ Recipient phone could not be extracted from: "${transcript}". Replaying prompt.`);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?lang=en&amp;provider=${provider}&amp;err=invalid</Redirect>`);
  }

  if (step === "enter-amount") {
    const parsedAmount = extractAmount(transcript);
    console.log(`🎙️ extractAmount result: ${parsedAmount}`);

    if (parsedAmount && parsedAmount > 0 && parsedAmount <= 10000) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?lang=en&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;dtmfDigits=${parsedAmount}</Redirect>`);
    }

    // Direct digit extraction fallback
    const digitsOnly = transcript.replace(/[^0-9.]/g, "");
    const directNum = parseFloat(digitsOnly);
    if (!isNaN(directNum) && directNum > 0 && directNum <= 10000) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?lang=en&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;dtmfDigits=${directNum}</Redirect>`);
    }

    console.log(`⚠️ Amount could not be extracted from: "${transcript}". Replaying prompt.`);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?lang=en&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;err=invalid</Redirect>`);
  }

  if (step === "safe-confirmation") {
    let resolvedDtmf = "1"; // Confirm default
    if (/\b(change|re-enter|edit|wrong|no|mistake)\b/i.test(cleanText)) {
      resolvedDtmf = "2";
    } else if (/\b(cancel|stop|quit|abort)\b/i.test(cleanText)) {
      resolvedDtmf = "0";
    }

    return xmlResponse(
      res,
      `    <Redirect>${baseUrl}/safe-outcome?lang=en&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;amount=${amount}&amp;dtmfDigits=${resolvedDtmf}</Redirect>`
    );
  }

  // Generic fallback if step unrecognized
  const fallbackUrl = retryUrl ? `${baseUrl}${retryUrl}` : `${baseUrl}/voice-menu`;
  xmlResponse(res, `    <Redirect>${fallbackUrl}</Redirect>`);
});

// ── Step 1: Call connects → Welcome & Language Choice ─────────────────
function handleVoiceMenu(req: Request, res: Response) {
  const isActive = req.body?.isActive ?? req.query?.isActive;
  const callSessionState = req.body?.callSessionState ?? req.query?.callSessionState;

  if (isActive === "0" || callSessionState === "Completed") {
    console.log(`📞 Call ended (sessionId: ${req.body?.sessionId || req.query?.sessionId})`);
    return xmlResponse(res, "");
  }

  const baseUrl = getPublicBaseUrl(req);
  const caller = req.body?.callerNumber || req.query?.callerNumber || "caller";
  console.log(`📞 Inbound voice call connected from ${caller}!`);

  const introAudioUrl = `${baseUrl}/audio/English_audio_prot/12_welcome_language_intro.mp3`;

  // English/Bilingual intro menu: DTMF primary, fallback to speech recording
  const speechFallbackUrl = `${baseUrl}/speech-fallback?step=language-selection&amp;retryUrl=%2Fvoice-menu`;
  const xml = `    <Play url="${introAudioUrl}"/>
    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection">
    </GetDigits>
${buildSpeechFallbackXml({ promptAudioUrl: introAudioUrl, speechCallbackUrl: speechFallbackUrl })}`;

  xmlResponse(res, xml);
}

// ── Step 2: Language Selection ────────────────────────────────────────
app.all("/language-selection", (req: Request, res: Response) => {
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);
  const lang = dtmf === "2" ? "twi" : "en";
  console.log(`🗣️ Language chosen: ${lang.toUpperCase()}`);

  xmlResponse(res, `    <Redirect>${baseUrl}/service-select?lang=${lang}</Redirect>`);
});

// ── Step 3: Service Selection (Telecom / Banking) ─────────────────────
app.all("/service-select", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/01_service_select.mp3`;
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=service-select&amp;retryUrl=%2Fservice-select%3Flang%3Den`;
    const xml = `    <Play url="${audioUrl}"/>
    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?lang=en">
    </GetDigits>
${buildSpeechFallbackXml({ promptAudioUrl: audioUrl, speechCallbackUrl: speechFallbackUrl })}`;
    return xmlResponse(res, xml);
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const prompt = "Sɛ worepɛ Mobile Money anaa Telecom a, mia baako (1). Sɛ worepɛ Sikakorabea Banking a, mia mmienu (2). Mia hwee (0) sɛ worepɛ agyae.";
  const xml = `    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?lang=${lang}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No response. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

app.all("/service-choice", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (checkUniversalNav(dtmf, lang, `${baseUrl}/voice-menu`, `${baseUrl}/service-select?lang=${lang}`, res)) {
    return;
  }

  if (dtmf === "2") {
    // Banking roadmap teaser
    // TODO: Pending Phase 2 (Twi recordings)
    const bankMsg =
      lang === "twi"
        ? "Yɛredi Sikakorabea nhyehyɛe no ho dwuma sesei. Yɛrebɛsan akɔ Mobile Money so."
        : "Banking services integration pilot is in development. Connecting you to Telecom Mobile Money services.";
    const xml = `    <Say voice="man">${bankMsg}</Say>
    <Redirect>${baseUrl}/provider-select?lang=${lang}&amp;service=momo</Redirect>`;
    return xmlResponse(res, xml);
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?lang=${lang}&amp;service=momo</Redirect>`);
});

// ── Step 4: Provider Selection (MTN / Telecel / AT) ───────────────────
app.all("/provider-select", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const service = (req.query?.service || req.body?.service || "momo") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/02_network_select.mp3`;
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=provider-select&amp;service=${service}&amp;retryUrl=%2Fprovider-select%3Flang%3Den%26service%3D${service}`;
    const xml = `    <Play url="${audioUrl}"/>
    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?lang=en&amp;service=${service}">
    </GetDigits>
${buildSpeechFallbackXml({ promptAudioUrl: audioUrl, speechCallbackUrl: speechFallbackUrl })}`;
    return xmlResponse(res, xml);
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const prompt = "Paw wo network. MTN, mia baako (1). Telecel, mia mmienu (2). Africa's Talking AT, mia mmiɛnsa (3). Mia akron (9) sɛ worepɛ ate bio, anaa hwee (0) sɛ worepɛ agyae.";
  const xml = `    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?lang=${lang}&amp;service=${service}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No response. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

app.all("/provider-choice", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const service = (req.query?.service || req.body?.service || "momo") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (checkUniversalNav(dtmf, lang, `${baseUrl}/service-select?lang=${lang}`, `${baseUrl}/provider-select?lang=${lang}&service=${service}`, res)) {
    return;
  }

  let provider = "MTN";
  if (dtmf === "2") provider = "Telecel";
  if (dtmf === "3") provider = "AT";

  xmlResponse(res, `    <Redirect>${baseUrl}/action-select?lang=${lang}&amp;provider=${provider}</Redirect>`);
});

// ── Step 5: Action Menu (Send Money, Bills, Airtime, Balance) ─────────
app.all("/action-select", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/04_mtn_services_menu.mp3`;
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=action-select&amp;provider=${provider}&amp;retryUrl=%2Faction-select%3Flang%3Den%26provider%3D${provider}`;
    const xml = `    <Play url="${audioUrl}"/>
    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?lang=en&amp;provider=${provider}">
    </GetDigits>
${buildSpeechFallbackXml({ promptAudioUrl: audioUrl, speechCallbackUrl: speechFallbackUrl })}`;
    return xmlResponse(res, xml);
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const prompt =
    lang === "twi"
      ? `${provider} dwumadie. Sɛ woremane sika a, mia baako (1). Sɛ woregye wo balance a, mia mmienu (2). Mia hwee (0) sɛ worepɛ agyae.`
      : `${provider} menu. To send money, press 1. To check balance, press 2. Press 8 to go back, or 0 to cancel.`;

  const xml = `    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?lang=${lang}&amp;provider=${provider}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No response. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

app.all("/action-choice", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);

  if (checkUniversalNav(dtmf, lang, `${baseUrl}/provider-select?lang=${lang}`, `${baseUrl}/action-select?lang=${lang}&provider=${provider}`, res)) {
    return;
  }

  if (dtmf === "2") {
    // Balance check info
    // TODO: Pending Phase 2 (Twi recordings)
    const balMsg =
      lang === "twi"
        ? "Woregye wo balance. Sesei, hwɛ wo fon so na fa wo MoMo PIN nwura mu pɛpɛɛpɛ."
        : "Checking balance. Please check your screen now to enter your PIN securely on the network prompt.";
    const xml = `    <Say voice="man">${balMsg}</Say>\n    <Reject/>`;
    return xmlResponse(res, xml);
  }

  // Transfer flow: Prompt for recipient number
  xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?lang=${lang}&amp;provider=${provider}</Redirect>`);
});

// ── Step 6: Enter Recipient Number ────────────────────────────────────
app.all("/enter-recipient", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const err = req.query?.err as string;
  const baseUrl = getPublicBaseUrl(req);

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/05_enter_recipient_phone.mp3`;
    // TODO: Audio Asset to record later: Dedicated invalid-recipient retry prompt audio (single recorded file)
    const errSay = err === "invalid" ? `    <Say voice="man">That number wasn't recognized.</Say>\n` : "";
    const retryQuery = err ? `%26err%3D${encodeURIComponent(err)}` : "";
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=enter-recipient&amp;provider=${provider}&amp;retryUrl=%2Fenter-recipient%3Flang%3Den%26provider%3D${provider}${retryQuery}`;
    const xml = `${errSay}    <Play url="${audioUrl}"/>
    <GetDigits timeout="12" finishOnKey="#" numDigits="15" callbackUrl="${baseUrl}/verify-recipient?lang=en&amp;provider=${provider}">
    </GetDigits>
${buildSpeechFallbackXml({
  errorPrefixText: err === "invalid" ? "That number wasn't recognized." : undefined,
  promptAudioUrl: audioUrl,
  speechCallbackUrl: speechFallbackUrl,
})}`;
    return xmlResponse(res, xml);
  }

  let prefixPrompt = "";
  if (err === "invalid") {
    prefixPrompt =
      lang === "twi"
        ? "Nɔma no nyɛ pɛpɛɛpɛ. Mpaepaemu: "
        : "That phone number appears incomplete or invalid. ";
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const prompt =
    prefixPrompt +
    (lang === "twi"
      ? "Fa nɔma du (10) a woremane kɔma no nwura mu, na wie no hash (#). Mia hwee (0) sɛ worepɛ agyae."
      : "Please enter the 10-digit recipient phone number, followed by hash. Press 0 to cancel.");

  // Twi branch (DTMF only, speech pending Phase 2)
  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="15" callbackUrl="${baseUrl}/verify-recipient?lang=${lang}&amp;provider=${provider}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No phone number entered. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

// ── Step 7: Verify Recipient & KYC Lookup ─────────────────────────────
app.all("/verify-recipient", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getPublicBaseUrl(req);

  if (checkUniversalNav(dtmf, lang, `${baseUrl}/action-select?lang=${lang}&provider=${provider}`, `${baseUrl}/enter-recipient?lang=${lang}&provider=${provider}`, res)) {
    return;
  }

  const lookup = lookupRecipient(dtmf);
  if (!lookup.valid || !lookup.record) {
    console.log(`⚠️ Invalid recipient number entered: ${dtmf} (${lookup.error})`);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?lang=${lang}&amp;provider=${provider}&amp;err=invalid</Redirect>`);
  }

  const recipient = lookup.record;
  console.log(`✅ Recipient resolved: ${recipient.name} (${recipient.phoneNumber})`);

  xmlResponse(
    res,
    `    <Redirect>${baseUrl}/enter-amount?lang=${lang}&amp;provider=${provider}&amp;phone=${recipient.phoneNumber}&amp;name=${encodeURIComponent(recipient.name)}</Redirect>`
  );
});

// ── Step 8: Enter Amount ──────────────────────────────────────────────
app.all("/enter-amount", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const phone = (req.query?.phone || req.body?.phone || "0241234567") as string;
  const name = (req.query?.name || req.body?.name || "Kwame Nyameba") as string;
  const err = req.query?.err as string;
  const baseUrl = getPublicBaseUrl(req);

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/08_enter_amount_cedis.mp3`;
    // TODO: Audio Asset to record later: Dedicated invalid-amount retry prompt audio (single recorded file)
    const errSay = err === "invalid" ? `    <Say voice="man">That amount wasn't recognized.</Say>\n` : "";
    const retryQuery = err ? `%26err%3D${encodeURIComponent(err)}` : "";
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=enter-amount&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;retryUrl=%2Fenter-amount%3Flang%3Den%26provider%3D${provider}%26phone%3D${phone}%26name%3D${encodeURIComponent(name)}${retryQuery}`;
    const xml = `${errSay}    <Play url="${audioUrl}"/>
    <GetDigits timeout="10" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-amount?lang=en&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}">
    </GetDigits>
${buildSpeechFallbackXml({
  errorPrefixText: err === "invalid" ? "That amount wasn't recognized." : undefined,
  promptAudioUrl: audioUrl,
  speechCallbackUrl: speechFallbackUrl,
})}`;
    return xmlResponse(res, xml);
  }

  let prefixPrompt = "";
  if (err === "invalid") {
    prefixPrompt =
      lang === "twi"
        ? "Sika dodow no nyɛ pɛpɛɛpɛ. "
        : "Invalid amount entered. ";
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const prompt =
    prefixPrompt +
    (lang === "twi"
      ? `Fa cedi dodow a woremane kɔma ${name} no nwura mu, na wie no hash (#). Fa nsoroma (*) di dwuma ma pesewa. Mia hwee (0) sɛ worepɛ agyae.`
      : `Enter the amount in Ghana Cedis to send to ${name}, followed by hash. Use star for pesewas. Press 0 to cancel.`);

  // Twi branch (DTMF only, speech pending Phase 2)
  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-amount?lang=${lang}&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No amount entered. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

// ── Step 9: Verify Amount & Route to Safe Confirmation ────────────────
app.all("/verify-amount", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const phone = (req.query?.phone || req.body?.phone || "") as string;
  const name = (req.query?.name || req.body?.name || "") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getPublicBaseUrl(req);

  if (checkUniversalNav(dtmf, lang, `${baseUrl}/enter-recipient?lang=${lang}&provider=${provider}`, `${baseUrl}/enter-amount?lang=${lang}&provider=${provider}&phone=${phone}&name=${encodeURIComponent(name)}`, res)) {
    return;
  }

  const validation = validateAmount(dtmf);
  if (!validation.valid || validation.amountGHS === undefined) {
    console.log(`⚠️ Invalid amount entered: ${dtmf} (${validation.error})`);
    return xmlResponse(
      res,
      `    <Redirect>${baseUrl}/enter-amount?lang=${lang}&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;err=invalid</Redirect>`
    );
  }

  const amount = validation.amountGHS;
  console.log(`💰 Amount verified: GH₵${amount} to ${name}`);

  xmlResponse(
    res,
    `    <Redirect>${baseUrl}/safe-confirmation?lang=${lang}&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;amount=${amount}</Redirect>`
  );
});

// ── Step 10: The "Safe Confirmation" Innovation (Core Security Read-Back)
app.all("/safe-confirmation", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const phone = (req.query?.phone || req.body?.phone || "0241234567") as string;
  const name = (req.query?.name || req.body?.name || "Kwame Nyameba") as string;
  const amount = (req.query?.amount || req.body?.amount || "500") as string;
  const baseUrl = getPublicBaseUrl(req);

  const callbackUrl = `${baseUrl}/safe-outcome?lang=${lang}&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;amount=${amount}`;

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/09_confirm_transfer_summary.mp3`;
    const speechFallbackUrl = `${baseUrl}/speech-fallback?step=safe-confirmation&amp;provider=${provider}&amp;phone=${phone}&amp;name=${encodeURIComponent(name)}&amp;amount=${amount}&amp;retryUrl=%2Fsafe-confirmation%3Flang%3Den%26provider%3D${provider}%26phone%3D${phone}%26name%3D${encodeURIComponent(name)}%26amount%3D${amount}`;
    const xml = `    <Play url="${audioUrl}"/>
    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
    </GetDigits>
${buildSpeechFallbackXml({ promptAudioUrl: audioUrl, speechCallbackUrl: speechFallbackUrl })}`;
    return xmlResponse(res, xml);
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const last4 = phone.slice(-4);
  const prompt = `Woremane sika cedi ${amount} kɔma ${name}, a ne fon nɔma wie ${last4}. Sɛ wopene so a, mia baako (1). Sɛ worepɛ sesa no a, mia mmienu (2). Sɛ worepɛ agyae koraa a, mia hwee (0).`;

  const xml = `    <GetDigits timeout="6" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Say voice="man">${prompt}</Say>
    </GetDigits>
    <Say voice="man">No response received. Goodbye.</Say>`;

  xmlResponse(res, xml);
});

// ── Step 11: Final Outcome & PIN Security Handoff ─────────────────────
// NOTE: ZERO-PIN BOUNDARY PRESERVED. PIN entry occurs 100% on the SIM/USSD network overlay, never over voice.
app.all("/safe-outcome", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const provider = (req.query?.provider || req.body?.provider || "MTN") as string;
  const phone = (req.query?.phone || req.body?.phone || "") as string;
  const name = (req.query?.name || req.body?.name || "") as string;
  const amount = (req.query?.amount || req.body?.amount || "") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);

  console.log(`🎯 Safe confirmation choice: ${dtmf}`);

  if (dtmf === "2") {
    // User wants to re-enter
    console.log("🔄 User chose to re-enter details");
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?lang=${lang}&amp;provider=${provider}</Redirect>`);
  }

  if (dtmf === "0") {
    // TODO: Pending Phase 2 (Twi recordings)
    const cancelMsg =
      lang === "twi"
        ? "Yɛatwa mu. Sika no mfiri wo account mu. Akwaaba."
        : "Transaction cancelled. No money has been deducted from your account. Goodbye.";
    return xmlResponse(res, `    <Say voice="man">${cancelMsg}</Say>\n    <Reject/>`);
  }

  // Confirmed (Key 1): Strong Security Posture Handoff
  // Converged execution: Keypad input calls the unified Service Orchestrator
  const amtNum = parseFloat(amount) || 50;
  transactionOrchestrator.executeSendMoney({
    source: "KEYPAD",
    network: (provider as any) || "MTN",
    recipient_phone: phone || "0241234567",
    recipient_name: name || "Subscriber",
    amount: amtNum,
  }).catch((err) => console.error("[Keypad] Converged transaction execution error:", err));

  if (lang === "en") {
    const audioUrl = `${baseUrl}/audio/English_audio_prot/10_pin_prompt_screen_handoff.mp3`;
    const xml = `    <Play url="${audioUrl}"/>\n    <Reject/>`;
    return xmlResponse(res, xml);
  }

  // TODO: Pending Phase 2 (Twi recordings)
  const successMsg = `Yɛapene cedi ${amount} a woremane kɔma ${name} no so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu pɛpɛɛpɛ.`;
  const xml = `    <Say voice="man">${successMsg}</Say>\n    <Reject/>`;
  xmlResponse(res, xml);
});

// ── Mock Transaction Backend (Section 11: POST /transactions/send) ─────
app.post("/transactions/send", async (req: Request, res: Response) => {
  try {
    const { network, recipient_phone, recipient_name, amount } = req.body;
    const result = await transactionOrchestrator.executeSendMoney({
      source: "VOICE",
      network: network || "MTN",
      recipient_phone: recipient_phone || "0553838464",
      recipient_name: recipient_name || "Kwame Nyamebere",
      amount: typeof amount === "number" ? amount : parseFloat(amount) || 500,
    });

    res.status(200).json({
      status: result.status,
      reference: result.reference,
      amount: result.amount,
      recipient_name: result.recipient_name,
      timestamp: result.timestamp,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Transaction failed" });
  }
});

// ── Conversational Accessibility Layer APIs ───────────────────────────
app.post("/api/conversation/turn", async (req: Request, res: Response) => {
  try {
    const { sessionId, text, language } = req.body;
    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and text are required." });
    }

    const turn = await conversationManager.handleTurn(sessionId, text, language || "en");
    res.json({ success: true, turn });
  } catch (err: any) {
    console.error("[Conversation API Error]:", err);
    res.status(500).json({ error: err.message || "Failed to process turn" });
  }
});

app.post("/api/conversation/authorize", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const result = await conversationManager.completeAuthorizedTransaction(sessionId);
    const tx = result.state.lastTransactionResult;
    res.json({
      success: true,
      turn: result,
      spokenReceipt: tx?.spokenReceipt || result.spokenPrompt,
      reference: tx?.reference || "OKW-" + Math.floor(100000 + Math.random() * 900000),
      amount: tx?.amount || result.state.amount,
      recipientName: tx?.recipient_name || result.state.recipient_name,
      recipientPhone: tx?.recipient_phone || result.state.recipient_phone,
      timestamp: tx?.timestamp || Date.now(),
    });
  } catch (err: any) {
    console.error("[Authorize API Error]:", err);
    res.status(500).json({ error: err.message || "Authorization failed" });
  }
});

app.post("/api/conversation/stt", async (req: Request, res: Response) => {
  try {
    const { audio, text } = req.body;
    const transcribed = await speechToText(audio || text || "");
    res.json(transcribed);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "STT failed" });
  }
});

app.get("/api/account/balance", (req: Request, res: Response) => {
  const network = (req.query?.network as string) || "MTN";
  const balance = transactionOrchestrator.getAccountBalance(network);
  res.json(balance);
});

app.get("/api/contacts", (_req: Request, res: Response) => {
  res.json(Object.values(MOCK_CONTACTS));
});

// ── Legacy Compatibility Routes for backward compatibility ────────────
app.all("/voice-menu", handleVoiceMenu);

app.all("/transfer-menu", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const baseUrl = getPublicBaseUrl(req);
  xmlResponse(
    res,
    `    <Redirect>${baseUrl}/safe-confirmation?lang=${lang}&amp;provider=MTN&amp;phone=0241234567&amp;name=${encodeURIComponent("Kwame Mensah")}&amp;amount=50</Redirect>`
  );
});

app.all("/momo-confirmation", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1") as string;
  const baseUrl = getPublicBaseUrl(req);
  xmlResponse(
    res,
    `    <Redirect>${baseUrl}/safe-outcome?lang=${lang}&amp;dtmfDigits=${dtmf}&amp;name=${encodeURIComponent("Kwame Mensah")}&amp;amount=50</Redirect>`
  );
});

// ── Health Check ─────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Ɔkwankyerɛfo Pa",
    team: "Anidasoɔ (Hope)",
    features: [
      "Voice Accessibility Layer",
      "Universal Navigation Grammar (#, 0, 8, 9)",
      "Smart KYC Recipient Lookup",
      "Human-Readable Safe Confirmation",
      "Zero-PIN Voice Security Gate",
      "Hybrid Native Audio + Dynamic TTS",
    ],
  });
});

// ── Step 0: USSD Dial Callback Trigger ───────────────────────────────
app.post("/ussd-trigger", async (req: Request, res: Response) => {
  const phoneNumber = (req.body?.phoneNumber || req.query?.phoneNumber) as string;
  const baseUrl = getPublicBaseUrl(req);

  const ussdResponse =
    "END Ɔkwankyerɛfo Pa refrɛ wo sesei ara...\n" +
    "(The Good Guide is calling you back now...)";

  if (voiceClient && phoneNumber) {
    try {
      await voiceClient.call({
        callFrom: VOICE_NUMBER,
        callTo: [phoneNumber],
        callbackUrl: `${baseUrl}/voice-menu`,
      });
      console.log(`📡 Voice trigger activated for line: ${phoneNumber}`);
    } catch (e: any) {
      console.log(`❌ Failed to initiate callback call: ${e.message || e}`);
    }
  } else {
    console.log("⚠️ Skipped outbound call — AT credentials or phoneNumber missing.");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(ussdResponse);
});

// ── Root Web UI & Interactive Console ────────────────────────────────
app.all("/", (req: Request, res: Response) => {
  const isAtRequest =
    req.method === "POST" ||
    req.body?.sessionId ||
    req.query?.sessionId ||
    req.body?.isActive !== undefined ||
    req.body?.direction;

  if (isAtRequest) {
    return handleVoiceMenu(req, res);
  }

  const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
  const wantsJson = req.query.format === "json" || req.xhr;

  if (acceptsHtml && !wantsJson) {
    const indexPath = path.join(process.cwd(), "public", "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }

  if (acceptsHtml && !wantsJson) {
    const baseUrl = getPublicBaseUrl(req);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ɔkwankyerɛfo Pa — Voice Accessibility Layer</title>
  <meta name="description" content="A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot) by Team Anidasoɔ">
  <style>
    :root {
      --bg: #090e17;
      --card: #131c2d;
      --card-alt: #1a253a;
      --border: #23324d;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --accent: #a855f7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 24px 16px 60px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header { margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    .top-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
    .team-badge {
      font-size: 11px; padding: 3px 10px; border-radius: 9999px;
      background: rgba(168, 85, 247, 0.15); color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.35); font-weight: 700;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .status-badge {
      font-size: 11px; padding: 3px 10px; border-radius: 9999px;
      background: rgba(34, 197, 94, 0.15); color: var(--success);
      border: 1px solid rgba(34, 197, 94, 0.35); font-weight: 700;
      letter-spacing: 0.5px;
    }
    h1 { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
    .subtitle { color: var(--muted); margin-top: 6px; font-size: 15px; }
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 22px; margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }
    h2 { font-size: 19px; font-weight: 700; margin-bottom: 14px; color: var(--primary); display: flex; align-items: center; gap: 8px; }
    .meta-box {
      background: var(--card-alt); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px; margin-bottom: 16px;
      font-size: 14px; color: #cbd5e1;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 768px) {
      .grid-2, .grid-3 { grid-template-columns: 1fr; }
    }
    .config-item {
      background: var(--card-alt); padding: 12px 16px;
      border-radius: 10px; border: 1px solid var(--border);
    }
    .config-label {
      color: var(--muted); font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.6px; font-weight: 600;
    }
    .config-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin-top: 5px; font-size: 14px; color: #f8fafc; word-break: break-all;
    }
    .btn {
      background: var(--primary); color: #090e17; border: none;
      padding: 10px 18px; border-radius: 8px; font-weight: 700;
      cursor: pointer; font-size: 14px; transition: all 0.15s ease;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--card-alt); color: #f1f5f9; border: 1px solid var(--border); }
    .btn-secondary:hover { background: #23324d; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    
    /* Architecture Diagram */
    .arch-flow {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; overflow-x: auto; padding: 14px 0; margin-bottom: 14px;
    }
    .arch-node {
      background: var(--card-alt); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 14px; text-align: center;
      min-width: 130px; font-size: 12.5px;
    }
    .arch-node strong { display: block; color: var(--primary); font-size: 13px; }
    .arch-arrow { color: var(--muted); font-size: 18px; font-weight: bold; }

    /* Grammar table */
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13.5px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    kbd {
      background: #090e17; border: 1px solid var(--border);
      padding: 2px 8px; border-radius: 6px; font-family: monospace;
      color: var(--primary); font-weight: 700;
    }

    /* Interactive Simulator */
    .sim-screen {
      background: #06090e; border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-top: 16px;
    }
    .sim-step-badge {
      display: inline-block; font-size: 11px; font-weight: 700;
      color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
    }
    .sim-spoken {
      font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 14px;
      line-height: 1.5; background: rgba(56, 189, 248, 0.08);
      padding: 14px 16px; border-radius: 8px; border-left: 4px solid var(--primary);
    }
    .keypad-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; max-width: 280px; margin: 16px auto;
    }
    .key-btn {
      background: #131c2d; border: 1px solid var(--border);
      color: #fff; font-size: 18px; font-weight: 700;
      padding: 12px; border-radius: 10px; cursor: pointer; text-align: center;
    }
    .key-btn:hover { background: #1e293b; border-color: var(--primary); }
    input[type="text"] {
      width: 100%; padding: 10px 14px; border-radius: 8px;
      background: #090e17; border: 1px solid var(--border);
      color: #fff; font-size: 14px;
    }
    pre {
      background: #06090e; border: 1px solid var(--border);
      padding: 12px; border-radius: 8px; font-size: 12px;
      color: #38bdf8; overflow-x: auto; margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="top-meta">
        <span class="team-badge">Team Anidasoɔ (Hope)</span>
        <span class="status-badge">● End-to-End Voice Layer Active</span>
      </div>
      <h1>Ɔkwankyerɛfo Pa ("The Good Guide")</h1>
      <p class="subtitle">A Voice Accessibility Layer for Ghana's Digital Services — Telecom, MoMo &amp; Universal Navigation Engine</p>
    </header>

    <!-- Architecture Abstract Card -->
    <div class="card">
      <h2>The Voice Accessibility Layer Architecture</h2>
      <div class="meta-box">
        <p><strong>The Core Innovation:</strong> Ɔkwankyerɛfo Pa does not rebuild existing telecom or banking services. Instead, it sits between Ghanaian citizens and existing USSD/digital services as an independent voice accessibility and safety bridge. It provides <em>Universal Navigation</em>, <em>Smart KYC Recipient Lookup</em>, <em>Human-Readable Safe Confirmation</em>, and a <em>Zero-PIN Voice Security Gate</em>.</p>
      </div>

      <div class="arch-flow">
        <div class="arch-node">
          <strong>Caller</strong>
          Blind / Low-Literacy
        </div>
        <div class="arch-arrow">➔</div>
        <div class="arch-node">
          <strong>Voice Gateway</strong>
          Africa's Talking
        </div>
        <div class="arch-arrow">➔</div>
        <div class="arch-node" style="border-color: var(--primary);">
          <strong>Ɔkwankyerɛfo Pa</strong>
          Voice Layer Engine
        </div>
        <div class="arch-arrow">➔</div>
        <div class="arch-node">
          <strong>Validation / KYC</strong>
          Number &amp; Name Lookup
        </div>
        <div class="arch-arrow">➔</div>
        <div class="arch-node">
          <strong>Digital Services</strong>
          MTN / Telecel / AT
        </div>
      </div>

      <div class="grid-2">
        <div class="config-item">
          <div class="config-label">Africa's Talking Voice Number</div>
          <div class="config-value">${VOICE_NUMBER}</div>
        </div>
        <div class="config-item">
          <div class="config-label">Public Callback URL (Voice Menu)</div>
          <div class="config-value">${baseUrl}/voice-menu</div>
        </div>
      </div>
    </div>

    <!-- Universal Navigation Grammar & Security -->
    <div class="card">
      <h2>Universal Navigation Grammar &amp; Safety Layer</h2>
      <p class="subtitle" style="margin-bottom: 14px;">A standardized voice interaction grammar ensures users never get stuck or disoriented, paired with strict safety gates.</p>

      <div class="grid-2">
        <div>
          <table>
            <thead>
              <tr><th>Key</th><th>Action</th><th>Standard Function</th></tr>
            </thead>
            <tbody>
              <tr><td><kbd>#</kbd></td><td>Submit</td><td>Submits phone number or amount</td></tr>
              <tr><td><kbd>0</kbd></td><td>Cancel</td><td>Immediately cancels &amp; aborts transaction</td></tr>
              <tr><td><kbd>8</kbd></td><td>Back</td><td>Returns to previous menu stage</td></tr>
              <tr><td><kbd>9</kbd></td><td>Repeat</td><td>Replays current spoken prompt</td></tr>
              <tr><td><kbd>*</kbd></td><td>Decimal</td><td>Input pesewas (e.g. 50*10 = GH₵50.10)</td></tr>
            </tbody>
          </table>
        </div>
        <div class="meta-box" style="margin-bottom: 0;">
          <strong style="color:var(--primary); display:block; margin-bottom:6px;">🛡️ The Zero-PIN Voice Rule</strong>
          <p style="font-size:13.5px;">Ɔkwankyerɛfo Pa <em>never</em> prompts users to speak or dial their secret MoMo PIN over the voice call. Once human-readable confirmation succeeds, the voice layer instructs the caller to authorize on their private phone screen.</p>
          <p style="font-size:13.5px; margin-top:8px;"><strong>🔍 KYC Resolution:</strong> Prevents sending money to the wrong person by reading back the recipient's verified full name before any money moves.</p>
        </div>
      </div>
    </div>

    <!-- End-to-End Interactive Simulator -->
    <div class="card">
      <h2>Interactive End-to-End Call Simulator</h2>
      <p class="subtitle" style="margin-bottom: 14px;">Test the full 11-step accessibility flow right here on screen or trigger a live phone callback.</p>

      <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <button class="btn" onclick="startSim()">▶ Start Full Simulated Call Flow</button>
        <button class="btn btn-secondary" onclick="triggerOutboundCall()">Dial Real Phone via AT</button>
      </div>

      <div class="sim-screen" id="simContainer" style="display:none;">
        <div class="sim-step-badge" id="simStepBadge">Step 1: Welcome &amp; Language</div>
        <div class="sim-spoken" id="simSpokenText">Loading call prompt...</div>
        <div id="simAudioBox" style="margin-bottom: 12px; display:none;"></div>

        <!-- Dynamic Controls based on Step -->
        <div id="simInputArea"></div>

        <pre id="simXmlLog"></pre>
      </div>
    </div>
  </div>

  <script>
    let simState = {
      step: 'welcome',
      lang: 'en',
      service: 'momo',
      provider: 'MTN',
      phone: '0241234567',
      name: 'Kofi Annan',
      amount: '50'
    };

    function startSim() {
      document.getElementById('simContainer').style.display = 'block';
      goToStep('welcome');
    }

    async function goToStep(step, params = '') {
      simState.step = step;
      const badge = document.getElementById('simStepBadge');
      const spoken = document.getElementById('simSpokenText');
      const inputArea = document.getElementById('simInputArea');
      const xmlLog = document.getElementById('simXmlLog');
      const audioBox = document.getElementById('simAudioBox');

      if (step === 'welcome') {
        badge.innerText = 'Step 1: Welcome & Language Selection';
        const res = await fetch('/voice-menu');
        const xml = await res.text();
        xmlLog.innerText = xml;
        spoken.innerHTML = '🗣️ <strong>"Welcome to Ɔkwankyerɛfo Pa. For English, press 1. Twi firi mu, mia 2."</strong>';
        audioBox.style.display = 'block';
        audioBox.innerHTML = '<audio controls autoplay src="/audio/English_audio_prot/12_welcome_language_intro.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="btn" onclick="selectLang('en')">1: English</button>
            <button class="btn" onclick="selectLang('twi')">2: Twi (Akan)</button>
          </div>
        \`;
      } else if (step === 'service') {
        badge.innerText = 'Step 2: Service Engine Selection';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"Sɛ worepɛ Mobile Money anaa Telecom a, mia 1. Sikakorabea Banking, mia 2. Mia 0 sɛ worepɛ agyae."</strong>'
          : '🗣️ <strong>"For Telecom and Mobile Money, press 1. For Banking services, press 2. Press 0 to cancel."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/service_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/01_service_select.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="btn" onclick="selectService('momo')">1: Mobile Money / Telecom</button>
            <button class="btn btn-secondary" onclick="selectService('banking')">2: Banking (Pilot)</button>
            <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel</button>
          </div>
        \`;
      } else if (step === 'provider') {
        badge.innerText = 'Step 3: Service Adapter Provider Menu';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"Paw wo network: MTN, mia 1. Telecel, mia 2. AT, mia 3. Mia 9 sɛ worepɛ ate bio, anaa 0 sɛ worepɛ agyae."</strong>'
          : '🗣️ <strong>"Select your network provider: For MTN, press 1. For Telecel, press 2. For AT, press 3. Press 9 to repeat, or 0 to cancel."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/provider_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/02_network_select.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="btn" onclick="selectProvider('MTN')">1: MTN</button>
            <button class="btn" onclick="selectProvider('Telecel')">2: Telecel</button>
            <button class="btn" onclick="selectProvider('AT')">3: AT</button>
            <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel</button>
          </div>
        \`;
      } else if (step === 'action') {
        badge.innerText = 'Step 4: Provider Action Menu (' + simState.provider + ')';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"' + simState.provider + ' dwumadie. Sɛ woremane sika a, mia 1. Sɛ woregye balance a, mia 2. Mia 8 ma akyi, 0 ma agyae."</strong>'
          : '🗣️ <strong>"' + simState.provider + ' menu. To send money, press 1. To check balance, press 2. Press 8 to go back, or 0 to cancel."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/action_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/04_mtn_services_menu.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="btn" onclick="goToStep('recipient')">1: Transfer Money</button>
            <button class="btn btn-secondary" onclick="checkBalance()">2: Check Balance</button>
            <button class="btn btn-secondary" onclick="goToStep('provider')">8: Back</button>
            <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel</button>
          </div>
        \`;
      } else if (step === 'recipient') {
        badge.innerText = 'Step 5: Enter Recipient Number & Validation Engine';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"Fa nɔma du (10) a woremane kɔma no nwura mu, na wie no hash (#)."</strong>'
          : '🗣️ <strong>"Please enter the 10-digit recipient phone number, followed by hash (#)."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/recipient_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/05_enter_recipient_phone.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="max-width: 320px; margin: 0 auto;">
            <input type="text" id="simPhoneInput" value="0241234567" placeholder="e.g. 0241234567" style="margin-bottom:8px; text-align:center; font-size:16px; font-weight:bold;" />
            <div style="display:flex; gap:8px;">
              <button class="btn" style="flex:1;" onclick="submitRecipient()">Submit Number (#)</button>
              <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel</button>
            </div>
            <p style="font-size:11px; color:var(--muted); margin-top:6px; text-align:center;">Demo verified records: 0241234567 (Kofi Annan), 0543546010 (Hannes Aboagye)</p>
          </div>
        \`;
      } else if (step === 'amount') {
        badge.innerText = 'Step 6: Enter Amount (* for Pesewas)';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"Fa cedi dodow a woremane kɔma ' + simState.name + ' no nwura mu, na wie no hash (#)."</strong>'
          : '🗣️ <strong>"Enter the amount in Ghana Cedis to send to ' + simState.name + ', followed by hash (#)."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/amount_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/08_enter_amount_cedis.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="max-width: 320px; margin: 0 auto;">
            <input type="text" id="simAmountInput" value="50" placeholder="e.g. 50 or 50*10" style="margin-bottom:8px; text-align:center; font-size:16px; font-weight:bold;" />
            <div style="display:flex; gap:8px;">
              <button class="btn" style="flex:1;" onclick="submitAmount()">Submit Amount (#)</button>
              <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel</button>
            </div>
          </div>
        \`;
      } else if (step === 'confirm') {
        badge.innerText = 'Step 7: The "Safe Confirmation" Innovation (Core Security Read-Back)';
        const isTwi = simState.lang === 'twi';
        const last4 = simState.phone.slice(-4);
        spoken.innerHTML = isTwi
          ? '🗣️ <strong>"Woremane sika cedi ' + simState.amount + ' kɔma ' + simState.name + ', a ne fon nɔma wie ' + last4 + '. Sɛ wopene so a, mia baako (1). Sɛ worepɛ sesa no a, mia mmienu (2). Sɛ worepɛ agyae koraa a, mia hwee (0)."</strong>'
          : '🗣️ <strong>"You are sending ' + simState.amount + ' Ghana Cedis to ' + simState.name + ', ending in ' + last4 + '. Press 1 to confirm, 2 to re-enter details, or 0 to cancel."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/confirm_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/09_confirm_transfer_summary.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="display:flex; gap:10px; justify-content:center;">
            <button class="btn" onclick="finishTransaction(true)">1: Confirm Transfer</button>
            <button class="btn btn-secondary" onclick="goToStep('recipient')">2: Edit / Re-enter</button>
            <button class="btn btn-secondary" onclick="cancelCall()">0: Cancel (0)</button>
          </div>
        \`;
      } else if (step === 'done') {
        badge.innerText = 'Step 8: Zero-PIN Security Handoff';
        const isTwi = simState.lang === 'twi';
        spoken.innerHTML = isTwi
          ? '✅ <strong>"Yɛapene cedi ' + simState.amount + ' a woremane kɔma ' + simState.name + ' no so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu pɛpɛɛpɛ."</strong>'
          : '✅ <strong>"Transaction of ' + simState.amount + ' Ghana Cedis to ' + simState.name + ' authorized. Please check your screen now to enter your Mobile Money PIN securely."</strong>';

        audioBox.style.display = 'block';
        audioBox.innerHTML = isTwi
          ? '<audio controls autoplay src="/audio/success_twi.mp3"></audio>'
          : '<audio controls autoplay src="/audio/English_audio_prot/10_pin_prompt_screen_handoff.mp3"></audio>';

        inputArea.innerHTML = \`
          <div style="text-align:center;">
            <p style="font-size:13px; color:var(--success); margin-bottom:10px;">🔒 Call completed safely. Zero PIN entered over voice.</p>
            <button class="btn btn-secondary" onclick="startSim()">Restart Flow</button>
          </div>
        \`;
      }
    }

    function selectLang(lang) {
      simState.lang = lang;
      goToStep('service');
    }

    function selectService(service) {
      simState.service = service;
      goToStep('provider');
    }

    function selectProvider(provider) {
      simState.provider = provider;
      goToStep('action');
    }

    function submitRecipient() {
      const val = document.getElementById('simPhoneInput').value.trim();
      if (val.length < 10) {
        alert('Invalid phone number. Please enter a 10-digit number.');
        return;
      }
      simState.phone = val;
      if (val === '0241234567') simState.name = 'Kofi Annan';
      else if (val === '0543546010') simState.name = 'Hannes Aboagye';
      else if (val === '0201234567') simState.name = 'Ama Serwaa';
      else simState.name = 'Subscriber (ends ' + val.slice(-4) + ')';

      goToStep('amount');
    }

    function submitAmount() {
      const val = document.getElementById('simAmountInput').value.trim().replace('*', '.');
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        alert('Please enter a valid amount.');
        return;
      }
      simState.amount = val;
      goToStep('confirm');
    }

    function finishTransaction(confirmed) {
      if (confirmed) {
        goToStep('done');
      } else {
        cancelCall();
      }
    }

    function cancelCall() {
      const isTwi = simState.lang === 'twi';
      document.getElementById('simStepBadge').innerText = 'Call Cancelled';
      document.getElementById('simSpokenText').innerHTML = isTwi
        ? '❌ <strong>"Yɛatwa mu. Sika no mfiri wo account mu. Akwaaba."</strong>'
        : '❌ <strong>"Transaction cancelled. No money has been deducted from your account. Goodbye."</strong>';
      document.getElementById('simAudioBox').style.display = 'block';
      document.getElementById('simAudioBox').innerHTML = '<audio controls autoplay src="/audio/' + (isTwi ? 'cancel_twi.mp3' : 'cancel_en.mp3') + '"></audio>';
      document.getElementById('simInputArea').innerHTML = '<button class="btn btn-secondary" onclick="startSim()">Start New Call</button>';
    }

    function checkBalance() {
      const isTwi = simState.lang === 'twi';
      document.getElementById('simStepBadge').innerText = 'Balance Check Requested';
      document.getElementById('simSpokenText').innerHTML = isTwi
        ? '📱 <strong>"Woregye wo balance. Sesei, hwɛ wo fon so na fa wo MoMo PIN nwura mu pɛpɛɛpɛ."</strong>'
        : '📱 <strong>"Checking balance. Please check your screen now to enter your PIN securely on the network prompt."</strong>';
      document.getElementById('simInputArea').innerHTML = '<button class="btn btn-secondary" onclick="startSim()">Start New Call</button>';
    }

    async function triggerOutboundCall() {
      const phone = prompt('Enter the phone number to receive the callback from ' + '${VOICE_NUMBER}:', '+233543546010');
      if (!phone) return;
      alert('Triggering outbound callback to: ' + phone);
      const params = new URLSearchParams();
      params.append('phoneNumber', phone);
      await fetch('/ussd-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    }
  </script>
</body>
</html>`);
  }

  res.json({
    status: "ok",
    service: "Ɔkwankyerɛfo Pa",
    team: "Anidasoɔ (Hope)",
    abstract: "A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot)",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ɔkwankyerɛfo Pa server running on http://0.0.0.0:${PORT}`);
});
