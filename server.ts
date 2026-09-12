import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { initialize, VoiceService } from "./africastalking";

const app = express();
const PORT = 3000;

// Parse standard form bodies and large payloads for audio uploads
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// ── Config ────────────────────────────────────────────────────────────
const USERNAME = process.env.AT_USERNAME;
const API_KEY = process.env.AT_API_KEY;

if (!USERNAME) {
  console.log("⚠️  AT_USERNAME is not set. Set the real Africa's Talking username from your dashboard.");
}

if (!API_KEY) {
  console.log("⚠️  AT_API_KEY is not set — outbound voice calls will not work until it is configured.");
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

// The AT Voice number you were issued. Also set as an env var.
const VOICE_NUMBER = process.env.AT_VOICE_NUMBER || "+233308048098";

// ── Demo transaction data ────────────────────────────────────────────
// Hardcoded for the hackathon demo since real MoMo API access requires a
// formal MTN/Telecel partnership outside hackathon scope.
const DEMO_TRANSACTION = {
  recipient_name: "Kwame Mensah",
  amount_cedis: "50",
};

// ── Audio Phrase Bank Definition ─────────────────────────────────────
// As outlined in Team Anidasoɔ's architecture: fixed prompts come from
// a pre-recorded phrase bank recorded by native speakers, with dynamic TTS fallback.
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
];

function audioExists(filename: string): boolean {
  const p = path.join(process.cwd(), "audio", filename);
  return fs.existsSync(p);
}

function getPublicBaseUrl(req?: Request): string {
  const publicBase = process.env.BASE_URL || process.env.PUBLIC_BASE_URL;
  if (publicBase) {
    return publicBase.replace(/\/+$/, "");
  }
  if (req) {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }
  return (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
}

// ── Streaming Audio Handler with HTTP 206 Byte Ranges ─────────────────
// Telco VoiceXML media players require standard Range headers to stream audio
app.all("/audio/:filename", (req: Request, res: Response) => {
  const filePath = path.join(process.cwd(), "audio", req.params.filename);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Audio file not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
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
      "Content-Type": "audio/mpeg",
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── API: Audio Phrase Bank Status & Management ──────────────────────
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

// ── API: Audio File Upload ───────────────────────────────────────────
app.post("/api/upload-audio", (req: Request, res: Response) => {
  const { filename, base64Data } = req.body;

  if (!filename || !base64Data) {
    return res.status(400).json({ error: "Missing filename or base64Data" });
  }

  const cleanFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "");
  if (!cleanFilename.endsWith(".mp3") && !cleanFilename.endsWith(".wav")) {
    return res.status(400).json({ error: "File must be an .mp3 or .wav format" });
  }

  try {
    const audioDir = path.join(process.cwd(), "audio");
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const data = base64Data.replace(/^data:audio\/[a-z0-9]+;base64,/, "");
    const buffer = Buffer.from(data, "base64");
    const targetPath = path.join(audioDir, cleanFilename);
    fs.writeFileSync(targetPath, buffer);

    console.log(`🎙️ New audio file uploaded: ${cleanFilename} (${buffer.length} bytes)`);
    res.json({
      success: true,
      message: `File ${cleanFilename} uploaded successfully`,
      sizeBytes: buffer.length,
      url: `/audio/${cleanFilename}`,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to save file" });
  }
});

// ── Step 2: Call connects → welcome + language choice ───────────────
function handleVoiceMenu(req: Request, res: Response) {
  const isActive = req.body?.isActive ?? req.query?.isActive;
  const callSessionState = req.body?.callSessionState ?? req.query?.callSessionState;

  // If the call was hung up or completed, Africa's Talking sends isActive=0 or callSessionState=Completed
  if (isActive === "0" || callSessionState === "Completed") {
    console.log(`📞 Call session ended notification (sessionId: ${req.body?.sessionId || req.query?.sessionId})`);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response/>\n`);
  }

  const baseUrl = getPublicBaseUrl(req);
  const caller = req.body?.callerNumber || req.query?.callerNumber || "caller";
  console.log(`📞 Inbound voice call connected from ${caller}!`);

  const hasIntroAudio = audioExists("intro.mp3");
  const playTag = hasIntroAudio ? `    <Play url="${baseUrl}/audio/intro.mp3"/>\n` : "";

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${playTag}    <GetDigits timeout="5" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection">
        <Say voice="man">Press 1 for English. Press 2 for Twi.</Say>
    </GetDigits>
    <Say voice="man">No response received. Goodbye.</Say>
</Response>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(responseXml);
}

// ── Health route ─────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Ɔkwankyerɛfo Pa",
    team: "Anidasoɔ (Hope)",
    port: PORT,
  });
});

// ── Step 1: USSD dial trigger ────────────────────────────────────────
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
    console.log("⚠️  Skipped outbound call — AT credentials or phoneNumber missing.");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(ussdResponse);
});

// ── Step 2: Welcome / Language Menu Route ────────────────────────────
app.all("/voice-menu", handleVoiceMenu);

// ── Step 3: Language chosen → route onward ───────────────────────────
app.all("/language-selection", (req: Request, res: Response) => {
  const dtmfDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "") as string;
  const lang = dtmfDigits === "2" ? "twi" : "en";
  const baseUrl = getPublicBaseUrl(req);
  console.log(`🗣️ Language selected: ${lang.toUpperCase()} (DTMF: ${dtmfDigits})`);

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>${baseUrl}/transfer-menu?lang=${lang}</Redirect>
</Response>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(responseXml);
});

// ── Step 4: THE CORE DEMO MOMENT — Confirm or Cancel ─────────────────
app.all("/transfer-menu", (req: Request, res: Response) => {
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const baseUrl = getPublicBaseUrl(req);
  const name = DEMO_TRANSACTION.recipient_name;
  const amount = DEMO_TRANSACTION.amount_cedis;

  const audioFileName = lang === "twi" ? "confirm_twi.mp3" : "confirm_en.mp3";
  const hasAudio = audioExists(audioFileName);
  const playTag = hasAudio ? `    <Play url="${baseUrl}/audio/${audioFileName}"/>\n` : "";

  let spokenPrompt = "";
  if (lang === "twi") {
    spokenPrompt =
      `Woremane sika cedi ${amount} kɔma ${name}. ` +
      `Sɛ wopene so a, mia baako. Sɛ woampene so a, mia mmienu.`;
  } else {
    spokenPrompt =
      `You are sending ${amount} Ghana Cedis to ${name}. ` +
      `To confirm this transfer, press 1. To cancel, press 2.`;
  }

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${playTag}    <GetDigits timeout="5" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/momo-confirmation?lang=${lang}">
        <Say voice="man">${spokenPrompt}</Say>
    </GetDigits>
    <Say voice="man">No response. Goodbye.</Say>
</Response>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(responseXml);
});

// ── Step 5: Final Outcome (Authorization / Cancel) ───────────────────
app.all("/momo-confirmation", (req: Request, res: Response) => {
  const dtmfDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as string;
  const baseUrl = getPublicBaseUrl(req);
  console.log(`🎯 Transaction choice: ${dtmfDigits} (Language: ${lang})`);

  let audioFileName = "";
  let spokenMsg = "";

  if (dtmfDigits === "1") {
    audioFileName = lang === "twi" ? "success_twi.mp3" : "success_en.mp3";
    spokenMsg =
      lang === "twi"
        ? "Yɛapene so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu sika no nkɔ pɛpɛɛpɛ."
        : "Transaction authorized. Please check your screen now to enter your Mobile Money PIN.";
  } else {
    audioFileName = lang === "twi" ? "cancel_twi.mp3" : "cancel_en.mp3";
    spokenMsg =
      lang === "twi"
        ? "Yɛatwa mu. Sika no mfiri wo account mu."
        : "Transaction cancelled. No money has been deducted from your account.";
  }

  const hasAudio = audioExists(audioFileName);
  const playTag = hasAudio ? `    <Play url="${baseUrl}/audio/${audioFileName}"/>\n` : "";

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${playTag}    <Say voice="man">${spokenMsg}</Say>
    <Reject/>
</Response>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.send(responseXml);
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
    const baseUrl = getPublicBaseUrl(req);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ɔkwankyerɛfo Pa</title>
  <meta name="description" content="A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot) by Team Anidasoɔ">
  <meta property="og:title" content="Ɔkwankyerɛfo Pa">
  <meta property="og:description" content="A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot) by Team Anidasoɔ">
  <script>
    window.addEventListener('error', function(event) {
      var msg = (event && (event.message || '')) + '';
      var file = (event && (event.filename || '')) + '';
      if (msg.includes('MetaMask') || msg.includes('ethereum') || msg.includes('web3') || file.includes('extension') || file.includes('moz-extension') || file.includes('chrome-extension')) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return true;
      }
    }, true);
    window.addEventListener('unhandledrejection', function(event) {
      var reason = (event && (event.reason ? (event.reason.message || event.reason) : '')) + '';
      if (reason.includes('MetaMask') || reason.includes('ethereum') || reason.includes('web3')) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    }, true);
  </script>
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
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }
    .top-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .team-badge {
      display: inline-block;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 9999px;
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.35);
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .status-badge {
      display: inline-block;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 9999px;
      background: rgba(34, 197, 94, 0.15);
      color: var(--success);
      border: 1px solid rgba(34, 197, 94, 0.35);
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: var(--muted);
      margin-top: 6px;
      font-size: 15px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }
    h2 {
      font-size: 19px;
      font-weight: 700;
      margin-bottom: 14px;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-box {
      background: var(--card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #cbd5e1;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 768px) {
      .grid-2 { grid-template-columns: 1fr; }
    }
    .config-item {
      background: var(--card-alt);
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
    }
    .config-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      font-weight: 600;
    }
    .config-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin-top: 5px;
      font-size: 14px;
      color: #f8fafc;
      word-break: break-all;
    }
    .btn {
      background: var(--primary);
      color: #090e17;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: var(--card-alt);
      color: #f1f5f9;
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: #23324d;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }
    /* Phrase bank table */
    .phrase-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .phrase-card {
      background: var(--card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .phrase-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .phrase-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }
    .phrase-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .tag-ready { background: rgba(34, 197, 94, 0.2); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.4); }
    .tag-tts { background: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.4); }
    .phrase-text {
      font-size: 13.5px;
      color: #cbd5e1;
      font-style: italic;
      background: rgba(0, 0, 0, 0.2);
      padding: 8px 12px;
      border-radius: 6px;
      border-left: 3px solid var(--primary);
    }
    .phrase-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    audio {
      height: 36px;
      max-width: 280px;
    }
    /* Simulator */
    .sim-step {
      background: var(--card-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .sim-step-title {
      font-size: 14px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    .keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      max-width: 240px;
      margin: 16px auto 0;
    }
    .key-btn {
      background: #090e17;
      border: 1px solid var(--border);
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      padding: 14px;
      border-radius: 10px;
      cursor: pointer;
      text-align: center;
    }
    .key-btn:hover {
      background: #1e293b;
      border-color: var(--primary);
    }
    input[type="text"], input[type="file"], select {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      background: #090e17;
      border: 1px solid var(--border);
      color: #fff;
      font-size: 14px;
    }
    pre {
      background: #06090e;
      border: 1px solid var(--border);
      padding: 14px;
      border-radius: 8px;
      font-size: 12.5px;
      color: #38bdf8;
      overflow-x: auto;
      margin-top: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .upload-zone {
      border: 2px dashed var(--border);
      border-radius: 10px;
      padding: 24px;
      text-align: center;
      background: rgba(0,0,0,0.15);
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-zone:hover {
      border-color: var(--primary);
      background: rgba(56, 189, 248, 0.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="top-meta">
        <span class="team-badge">Team Anidasoɔ (Hope)</span>
        <span class="status-badge">● Live Gateway Active</span>
      </div>
      <h1>Ɔkwankyerɛfo Pa ("The Good Guide")</h1>
      <p class="subtitle">A Voice Accessibility Layer for Ghana's Digital Services — Mobile Money Voice Verification Pilot</p>
    </header>

    <!-- Project Abstract Overview Card -->
    <div class="card">
      <h2>Ghana MoMo Voice Accessibility Architecture</h2>
      <div class="meta-box">
        <p><strong>The Core Challenge:</strong> Ghana's Mobile Money (*170#) relies on a visual USSD screen with a strict 20-second timeout. Over 560,000 blind or visually impaired Ghanaians, plus elderly and low-literacy citizens, are forced to share their phones and disclose private transaction details to roadside agents or strangers.</p>
        <p style="margin-top: 8px;"><strong>The Solution:</strong> Ɔkwankyerɛfo Pa acts as an independent voice layer. A voice call speaks transfer details in Akan (Twi) or English, prompts a verbal confirm-or-cancel choice, and directs the user to authorize on their device. <em>Ɔkwankyerɛfo Pa never sees or stores PINs.</em></p>
      </div>

      <div class="grid-2">
        <div class="config-item">
          <div class="config-label">Africa's Talking Voice Number</div>
          <div class="config-value">${VOICE_NUMBER}</div>
        </div>
        <div class="config-item">
          <div class="config-label">AT Callback URL (Voice Menu)</div>
          <div class="config-value">${baseUrl}/voice-menu</div>
        </div>
        <div class="config-item">
          <div class="config-label">Speech Engine Strategy</div>
          <div class="config-value">Hybrid: Pre-recorded native phrase bank + TTS fallback</div>
        </div>
        <div class="config-item">
          <div class="config-label">Supported Languages</div>
          <div class="config-value">Akan (Twi) &amp; English (extensible to Ga, Ewe, Dagbani)</div>
        </div>
      </div>
    </div>

    <!-- Audio Phrase Bank Card -->
    <div class="card" id="phraseBankCard">
      <h2>Recorded Phrase Bank (Native Speaker Audio)</h2>
      <p class="subtitle" style="margin-bottom: 16px;">
        High-fidelity native speaker voice prompts. If an audio file is uploaded, Africa's Talking streams the recording. If missing, it smoothly falls back to text-to-speech so calls never fail.
      </p>

      <div class="phrase-list" id="phraseListContainer">
        <!-- Loaded via JS -->
      </div>
    </div>

    <!-- Audio File Uploader Card -->
    <div class="card">
      <h2>Upload New Audio Prompt</h2>
      <p class="subtitle" style="margin-bottom: 16px;">Upload native speaker .mp3 or .wav recordings directly to your live voice server.</p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label class="config-label" style="display:block; margin-bottom:6px;">Target Phrase Slot</label>
          <select id="uploadSlotSelect" onchange="updateSelectedSlot()">
            <option value="intro.mp3">intro.mp3 (Welcome &amp; Language Menu)</option>
            <option value="confirm_twi.mp3">confirm_twi.mp3 (Twi Confirmation - Core Demo)</option>
            <option value="confirm_en.mp3">confirm_en.mp3 (English Confirmation - Core Demo)</option>
            <option value="success_twi.mp3">success_twi.mp3 (Twi Authorization Instructions)</option>
            <option value="success_en.mp3">success_en.mp3 (English Authorization Instructions)</option>
            <option value="cancel_twi.mp3">cancel_twi.mp3 (Twi Cancellation Notice)</option>
            <option value="cancel_en.mp3">cancel_en.mp3 (English Cancellation Notice)</option>
            <option value="custom">Custom Filename...</option>
          </select>
        </div>
        <div id="customNameBox" style="display:none;">
          <label class="config-label" style="display:block; margin-bottom:6px;">Custom Filename (.mp3)</label>
          <input type="text" id="customFileNameInput" placeholder="e.g. balance_twi.mp3">
        </div>
      </div>

      <div class="upload-zone" onclick="document.getElementById('audioFileInput').click()">
        <input type="file" id="audioFileInput" accept="audio/*" style="display:none" onchange="handleFileSelected(event)">
        <p style="font-weight:600; font-size:15px;" id="uploadZoneText">📁 Click to choose an MP3 audio file or drag it here</p>
        <p style="font-size:12px; color:var(--muted); margin-top:4px;">Supported format: MP3 / WAV (Max 25MB)</p>
      </div>

      <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
        <button class="btn" id="uploadBtn" onclick="uploadAudioFile()" disabled>Upload Audio Prompt</button>
      </div>
      <div id="uploadStatusMsg" style="margin-top:10px; font-size:13px; display:none;"></div>
    </div>

    <!-- Live Call / USSD Simulator Card -->
    <div class="card">
      <h2>Live Call &amp; USSD Simulator</h2>
      <p class="subtitle" style="margin-bottom: 16px;">Test the full interactive voice flow in the browser or trigger a real outbound call to your phone via Africa's Talking.</p>

      <div class="grid-2" style="margin-bottom: 20px;">
        <div>
          <label class="config-label" style="display:block; margin-bottom:6px;">Trigger Outbound Callback via AT API</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="phoneInput" value="+233241234567" placeholder="+233..." />
            <button class="btn" onclick="triggerOutboundCall()">Dial Callback</button>
          </div>
          <p style="font-size:12px; color:var(--muted); margin-top:6px;">Simulates dialing the shortcode to receive a callback from ${VOICE_NUMBER}.</p>
        </div>

        <div>
          <label class="config-label" style="display:block; margin-bottom:6px;">Interactive Browser Flow Test</label>
          <button class="btn btn-secondary" style="width:100%; justify-content:center;" onclick="startInteractiveSim()">
            ▶ Start Interactive Call Flow
          </button>
          <p style="font-size:12px; color:var(--muted); margin-top:6px;">Step through the IVR menu right on this screen.</p>
        </div>
      </div>

      <div id="simConsole" style="display:none;">
        <div class="sim-step">
          <div class="sim-step-title" id="simStepTitle">Step 1: Call Connected</div>
          <div id="simStepContent" style="font-size:14px; margin-bottom:12px;"></div>
          <div id="simAudioPlayerBox" style="margin-bottom:12px; display:none;"></div>
          <div id="simKeypadBox" style="display:none;">
            <div style="font-size:12px; color:var(--muted); text-align:center;">Press DTMF Key:</div>
            <div class="keypad">
              <button class="key-btn" onclick="pressSimKey('1')">1</button>
              <button class="key-btn" onclick="pressSimKey('2')">2</button>
              <button class="key-btn" onclick="pressSimKey('#')">#</button>
            </div>
          </div>
        </div>
        <pre id="simXmlOutput"></pre>
      </div>
    </div>
  </div>

  <script>
    let currentSelectedFile = null;

    async function loadPhraseBank() {
      try {
        const res = await fetch('/api/phrase-bank');
        const data = await res.json();
        const container = document.getElementById('phraseListContainer');
        container.innerHTML = '';

        data.phrases.forEach(p => {
          const card = document.createElement('div');
          card.className = 'phrase-card';
          card.innerHTML = \`
            <div class="phrase-header">
              <div>
                <span class="phrase-title">\${p.title}</span>
                <span style="font-size:12px; color:var(--muted); margin-left:8px; font-family:monospace;">(\${p.filename})</span>
              </div>
              <span class="phrase-tag \${p.exists ? 'tag-ready' : 'tag-tts'}">
                \${p.exists ? '● Audio Active (' + p.sizeFormatted + ')' : '○ TTS Fallback Active'}
              </span>
            </div>
            <div class="phrase-text">"\${p.spokenText}"</div>
            <div style="font-size:12px; color:var(--muted);">\${p.description}</div>
            <div class="phrase-actions">
              \${p.exists ? '<audio controls src="' + p.url + '"></audio>' : '<span style="font-size:12px; color:var(--warning);">No audio file yet — synthesized voice will play automatically</span>'}
              <button class="btn btn-secondary btn-sm" onclick="selectSlotForUpload('\${p.filename}')">Replace / Upload Audio</button>
            </div>
          \`;
          container.appendChild(card);
        });
      } catch (err) {
        console.error("Failed to load phrase bank", err);
      }
    }

    function selectSlotForUpload(filename) {
      const select = document.getElementById('uploadSlotSelect');
      select.value = filename;
      updateSelectedSlot();
      document.getElementById('audioFileInput').click();
    }

    function updateSelectedSlot() {
      const val = document.getElementById('uploadSlotSelect').value;
      const customBox = document.getElementById('customNameBox');
      customBox.style.display = val === 'custom' ? 'block' : 'none';
    }

    function handleFileSelected(e) {
      const file = e.target.files[0];
      if (!file) return;
      currentSelectedFile = file;
      document.getElementById('uploadZoneText').innerText = 'Selected: ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
      document.getElementById('uploadBtn').disabled = false;
    }

    async function uploadAudioFile() {
      if (!currentSelectedFile) return;
      const btn = document.getElementById('uploadBtn');
      const status = document.getElementById('uploadStatusMsg');
      btn.disabled = true;
      btn.innerText = 'Uploading...';
      status.style.display = 'block';
      status.style.color = 'var(--primary)';
      status.innerText = 'Reading audio file...';

      let targetFilename = document.getElementById('uploadSlotSelect').value;
      if (targetFilename === 'custom') {
        targetFilename = document.getElementById('customFileNameInput').value.trim();
        if (!targetFilename) {
          status.style.color = 'var(--danger)';
          status.innerText = 'Please specify a filename';
          btn.disabled = false;
          btn.innerText = 'Upload Audio Prompt';
          return;
        }
      }

      const reader = new FileReader();
      reader.onload = async function() {
        try {
          const res = await fetch('/api/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: targetFilename,
              base64Data: reader.result
            })
          });
          const json = await res.json();
          if (res.ok) {
            status.style.color = 'var(--success)';
            status.innerText = '✅ ' + json.message;
            loadPhraseBank();
            currentSelectedFile = null;
            document.getElementById('uploadZoneText').innerText = '📁 Click to choose an MP3 audio file or drag it here';
          } else {
            status.style.color = 'var(--danger)';
            status.innerText = '❌ Error: ' + (json.error || 'Upload failed');
          }
        } catch (err) {
          status.style.color = 'var(--danger)';
          status.innerText = '❌ Network error: ' + err.message;
        } finally {
          btn.disabled = false;
          btn.innerText = 'Upload Audio Prompt';
        }
      };
      reader.readAsDataURL(currentSelectedFile);
    }

    // Call Simulator
    let simCurrentState = 'menu';
    let simCurrentLang = 'en';

    async function startInteractiveSim() {
      document.getElementById('simConsole').style.display = 'block';
      simCurrentState = 'menu';
      document.getElementById('simStepTitle').innerText = 'Step 1: Call Connects (Voice Menu)';
      document.getElementById('simStepContent').innerHTML = 'Playing introductory greeting. Prompting for language choice: <strong>1 for English, 2 for Twi</strong>.';
      
      const res = await fetch('/voice-menu');
      const xml = await res.text();
      document.getElementById('simXmlOutput').innerText = 'Africa\\'s Talking XML Response:\\n' + xml;

      const playerBox = document.getElementById('simAudioPlayerBox');
      playerBox.style.display = 'block';
      playerBox.innerHTML = '<audio controls autoplay src="/audio/intro.mp3"></audio>';
      document.getElementById('simKeypadBox').style.display = 'block';
    }

    async function pressSimKey(key) {
      const stepTitle = document.getElementById('simStepTitle');
      const stepContent = document.getElementById('simStepContent');
      const playerBox = document.getElementById('simAudioPlayerBox');
      const xmlOut = document.getElementById('simXmlOutput');

      if (simCurrentState === 'menu') {
        simCurrentLang = key === '2' ? 'twi' : 'en';
        simCurrentState = 'confirm';
        stepTitle.innerText = 'Step 2: Language Chosen (' + simCurrentLang.toUpperCase() + ') ➔ MoMo Confirmation';
        
        const res = await fetch('/transfer-menu?lang=' + simCurrentLang);
        const xml = await res.text();
        xmlOut.innerText = 'Africa\\'s Talking XML Response:\\n' + xml;

        const audioFile = simCurrentLang === 'twi' ? 'confirm_twi.mp3' : 'confirm_en.mp3';
        const spoken = simCurrentLang === 'twi' 
          ? 'Woremane sika cedi 50 kɔma Kwame Mensah. Sɛ wopene so a, mia baako (1). Sɛ woampene so a, mia mmienu (2).'
          : 'You are sending 50 Ghana Cedis to Kwame Mensah. To confirm, press 1. To cancel, press 2.';

        stepContent.innerHTML = '<strong>' + spoken + '</strong>';
        playerBox.innerHTML = '<audio controls autoplay src="/audio/' + audioFile + '"></audio>';
      } else if (simCurrentState === 'confirm') {
        simCurrentState = 'done';
        stepTitle.innerText = 'Step 3: Outcome (Key ' + key + ' pressed)';
        
        const res = await fetch('/momo-confirmation?lang=' + simCurrentLang + '&dtmfDigits=' + key);
        const xml = await res.text();
        xmlOut.innerText = 'Africa\\'s Talking XML Response:\\n' + xml;

        const audioFile = key === '1' 
          ? (simCurrentLang === 'twi' ? 'success_twi.mp3' : 'success_en.mp3')
          : (simCurrentLang === 'twi' ? 'cancel_twi.mp3' : 'cancel_en.mp3');

        const outcomeText = key === '1'
          ? (simCurrentLang === 'twi' 
              ? 'Yɛapene so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu sika no nkɔ pɛpɛɛpɛ.' 
              : 'Transaction authorized. Please check your screen now to enter your Mobile Money PIN.')
          : (simCurrentLang === 'twi' 
              ? 'Yɛatwa mu. Sika no mfiri wo account mu.' 
              : 'Transaction cancelled. No money has been deducted from your account.');

        stepContent.innerHTML = '<strong>' + (key === '1' ? '✅ Authorized: ' : '❌ Cancelled: ') + outcomeText + '</strong>';
        playerBox.innerHTML = '<audio controls autoplay src="/audio/' + audioFile + '"></audio>';
        document.getElementById('simKeypadBox').style.display = 'none';
      }
    }

    async function triggerOutboundCall() {
      const phone = document.getElementById('phoneInput').value;
      alert('Triggering outbound callback to: ' + phone + '\\nMake sure your Africa\\'s Talking credentials (AT_USERNAME & AT_API_KEY) are set.');
      const params = new URLSearchParams();
      params.append('phoneNumber', phone);
      await fetch('/ussd-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
    }

    // Initialize phrase bank on load
    loadPhraseBank();
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
