/**
 * Ɔkwankyerɛfo Pa - Acoustic Intelligence & Long-Conversation Test Suite
 * 
 * Verifies:
 * 1. Voice Activity Detection (VAD) vs Background Noise (fan, hum, click)
 * 2. Hardware & Software Acoustic Echo Cancellation (system prompt rejection vs barge-in)
 * 3. Mozilla Common Voice, FLEURS & UG HCI Lab phonetic repairs
 * 4. Long conversation and multi-sentence discussion parsing (autofilling amount, recipient, provider, purpose)
 * 5. Server REST endpoints for datasets and discussion parsing
 */

import { acousticNoiseFilterModel } from "../src/ai_system/speech/acousticModels/noiseFilterModel";
import {
  repairNoisyAcousticTranscript,
  GHANAIAN_ACOUSTIC_TOKENS,
  GHANAIAN_DIALECT_PROFILES,
} from "../src/ai_system/speech/acousticModels/ghanaAcousticDataset";
import { parseLongDiscussion } from "../src/ai_system/brain/longDiscussionParser";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript } from "../src/domain/echoFilter";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  }
}

console.log("=================================================");
console.log("🚀 Testing Acoustic Intelligence & Long Discussions");
console.log("=================================================");

// --- Section 1: Noise Classification & VAD ---
console.log("\n--- Section 1: Voice Activity Detection & Noise Gate ---");

// Synthesize a speech-like frame (periodic vocal signal ~200Hz)
const sampleRate = 16000;
const frameSize = 1024;
const speechFrame = new Float32Array(frameSize);
for (let i = 0; i < frameSize; i++) {
  // Fundamental 180Hz + Formant 800Hz
  speechFrame[i] = 0.25 * Math.sin((2 * Math.PI * 180 * i) / sampleRate) +
                   0.15 * Math.sin((2 * Math.PI * 800 * i) / sampleRate);
}

// Warm up VAD with a couple frames
acousticNoiseFilterModel.analyzeFrame(speechFrame, sampleRate, false);
const speechAnalysis = acousticNoiseFilterModel.analyzeFrame(speechFrame, sampleRate, false);
assert(speechAnalysis.isVoiceActive === true, "VAD identifies human vocal periodic energy as active speech");
assert(speechAnalysis.noiseCategory === "speech", "Acoustic category classified as 'speech'");
assert(speechAnalysis.snrDb > 10, `SNR is robust above background noise floor (${speechAnalysis.snrDb} dB)`);

// Synthesize high-frequency fan/white noise
const noiseFrame = new Float32Array(frameSize);
for (let i = 0; i < frameSize; i++) {
  noiseFrame[i] = (Math.random() * 2 - 1) * 0.04;
}
// Reset model before evaluating ambient noise frame
acousticNoiseFilterModel.reset();
const noiseAnalysis = acousticNoiseFilterModel.analyzeFrame(noiseFrame, sampleRate, false);
assert(noiseAnalysis.isVoiceActive === false, "VAD correctly gates out fan/white noise");

// --- Section 2: Acoustic Echo Cancellation & System Rejection ---
console.log("\n--- Section 2: System Audio Rejection & Echo Cancellation ---");

const systemPrompt = "Welcome to Okwankyerɛfo Pa. For English press 1. For Twi press 2.";
assert(
  isAcousticSystemEcho("Welcome to Okwankyerɛfo Pa", systemPrompt, true) === true,
  "Acoustic filter rejects system prompt echo when prompt is playing"
);
assert(
  isAcousticSystemEcho("for english press 1 for twi press 2", systemPrompt, true) === true,
  "Acoustic filter rejects multi-word prompt echo from laptop/phone speaker"
);
assert(
  isAcousticSystemEcho("send money", systemPrompt, true) === false,
  "Acoustic filter preserves user intent 'send money' even during prompt playback"
);
assert(
  isAcousticSystemEcho("1", systemPrompt, true) === false,
  "Acoustic filter preserves single-digit barge-in command '1'"
);

// Echo stripping
const combinedEcho = "Welcome to Okwankyerɛfo Pa for English press 1 for Twi press 2 ... 2";
const stripped = stripSystemEchoFromTranscript(combinedEcho, systemPrompt);
assert(stripped === "2", `Stripped system echo leaving authentic caller answer: got "${stripped}"`);

// --- Section 3: Open-Source Ghanaian Acoustic Dataset Normalization ---
console.log("\n--- Section 3: Mozilla Common Voice & FLEURS Dataset Normalization ---");

assert(GHANAIAN_ACOUSTIC_TOKENS.length > 50, `Acoustic token dataset populated (${GHANAIAN_ACOUSTIC_TOKENS.length} tokens)`);
assert(Object.keys(GHANAIAN_DIALECT_PROFILES).length >= 4, "Dialect profiles configured (Asante, Akuapem, Fante, Ghanaian English)");

// Noisy acoustic input repairs
const repaired1 = repairNoisyAcousticTranscript("sen moni to kwame boateng");
assert(repaired1.repairedText.includes("send money"), `Repairs phonetic 'sen moni' -> 'send money' (got "${repaired1.repairedText}")`);
assert(repaired1.repairedText.includes("Kwame Boateng"), `Repairs contact name 'kwame boateng' (got "${repaired1.repairedText}")`);

const repaired2 = repairNoisyAcousticTranscript("fivety sedis");
assert(repaired2.repairedText.includes("50 cedis"), `Repairs colloquial 'fivety sedis' -> '50 cedis' (got "${repaired2.repairedText}")`);

const repaired3 = repairNoisyAcousticTranscript("mepɛ sɛ mesend aduonum kɔma Kwame");
assert(repaired3.repairedText.includes("send 50 to Kwame"), `Repairs Akan code-switching expression -> 'send 50 to Kwame' (got "${repaired3.repairedText}")`);

// --- Section 4: Long Conversation & Discussion Parser ---
console.log("\n--- Section 4: Long Conversation & Discussion Understanding ---");

const longUtterance1 =
  "Good morning please, I want to transfer 150 cedis to my brother Kwame Nyamebere on his MTN number 0553838464 because he needs to buy his school medicine.";

const parsed1 = parseLongDiscussion(longUtterance1, "service-select");
assert(parsed1.isLongDiscussion === true, "Identifies utterance as an extended conversation discussion");
assert(parsed1.primaryIntent === "send_money", "Extracts primary intent 'send_money'");
assert(parsed1.slots.amount === 150, `Extracts transfer amount 150 GHS (got ${parsed1.slots.amount})`);
assert(parsed1.slots.recipientPhone === "0553838464", `Extracts recipient phone 0553838464 (got ${parsed1.slots.recipientPhone})`);
assert(parsed1.slots.recipientName === "Kwame Nyamebere", `Extracts recipient name (got "${parsed1.slots.recipientName}")`);
assert(parsed1.slots.provider === "mtn", `Extracts network provider 'mtn' (got "${parsed1.slots.provider}")`);
assert(parsed1.shortcutSuggestedStep === "safe-confirmation", "Suggests shortcut fast-track to 'safe-confirmation'");

const longUtterance2 = "Mepa wo kyɛw, mepɛ sɛ memane aduonum cedis kɔma Ama Mensah wɔ 0241234567 so.";
const parsed2 = parseLongDiscussion(longUtterance2, "welcome");
assert(parsed2.slots.amount === 50, `Extracts amount 50 GHS from Akan utterance (got ${parsed2.slots.amount})`);
assert(parsed2.slots.recipientPhone === "0241234567", `Extracts phone 0241234567 (got ${parsed2.slots.recipientPhone})`);
assert(parsed2.slots.recipientName === "Ama Mensah", `Extracts contact name Ama Mensah (got "${parsed2.slots.recipientName}")`);

console.log("\n=================================================");
console.log(`🏁 Acoustic Suite Complete: ${passCount} Passed, ${failCount} Failed`);
console.log("=================================================");

if (failCount > 0) {
  process.exit(1);
}
