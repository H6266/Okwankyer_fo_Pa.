/**
 * Ɔkwankyerɛfo Pa - Honest System Health & Smoke Test Service
 * 
 * Performs REAL probing with real measured latencies:
 * 1. Audio catalog files existence on local disk
 * 2. Africa's Talking API connectivity & credentials
 * 3. Gemini ASR reachability
 * 4. MTN MoMo API configuration & sandbox ping
 * 
 * Never fakes passes or fabricates synthetic latencies.
 */

import { config } from "../config/env";
import { audioFileExists } from "../audio/catalog";
import { VoiceService } from "../../africastalking";
import { mtnMomoService } from "../modules/mtnMomoService";
import { GoogleGenAI } from "@google/genai";

export interface HealthCheckItem {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "warn";
  latencyMs: number;
  details: string;
}

export interface SmokeTestReport {
  timestamp: string;
  overallStatus: "pass" | "fail";
  checks: HealthCheckItem[];
  passCount: number;
  failCount: number;
  warnCount: number;
}

export async function runRealSmokeTests(): Promise<SmokeTestReport> {
  const checks: HealthCheckItem[] = [];

  // Check 1: Audio Catalog on Disk
  const startAudio = Date.now();
  const welcomeExists = audioFileExists("Welcome_prompt_01.mp3");
  const enExists = audioFileExists("Audio_prompt_02.mp3");
  const twiExists = audioFileExists("Audio_prompt_twi_02.mp3");
  const audioLatency = Date.now() - startAudio;

  const allAudioFound = welcomeExists && enExists && twiExists;
  checks.push({
    id: "check_audio",
    name: "Audio Catalog & Studio Files on Disk",
    description: "Verifies core English, Akan Twi, and Welcome studio audio clips exist on filesystem",
    status: allAudioFound ? "pass" : "fail",
    latencyMs: audioLatency,
    details: allAudioFound
      ? "Welcome prompt and English/Twi studio prompt files verified on disk."
      : "One or more core studio audio files are missing from /audio directory.",
  });

  // Check 2: Africa's Talking Gateway
  const startAt = Date.now();
  if (!config.at.configured) {
    checks.push({
      id: "check_at",
      name: "Africa's Talking Voice Credentials",
      description: "Checks AT_API_KEY and AT_USERNAME environment settings",
      status: "warn",
      latencyMs: Date.now() - startAt,
      details: "AT_API_KEY is not configured. Telephony calls run in local simulator mode.",
    });
  } else {
    try {
      const voiceService = new VoiceService(config.at.username, config.at.apiKey);
      const verifyResult = await voiceService.verifyCredentials();
      const atLatency = Date.now() - startAt;
      checks.push({
        id: "check_at",
        name: "Africa's Talking Voice Gateway Connection",
        description: "Direct API verification against Africa's Talking authentication server",
        status: verifyResult.valid ? "pass" : "fail",
        latencyMs: atLatency,
        details: verifyResult.valid
          ? `Credentials verified. Account balance: ${verifyResult.balance || "Active"}. Virtual voice line: ${config.at.voiceNumber}.`
          : `Authentication failed: ${verifyResult.errorMessage}`,
      });
    } catch (err: any) {
      checks.push({
        id: "check_at",
        name: "Africa's Talking Gateway Connection",
        description: "Ping to Africa's Talking API",
        status: "fail",
        latencyMs: Date.now() - startAt,
        details: `Connection error: ${err.message}`,
      });
    }
  }

  // Check 3: Gemini Speech & NLU Engine
  const startGemini = Date.now();
  if (!config.gemini.configured) {
    checks.push({
      id: "check_gemini",
      name: "Gemini AI Speech Recognition",
      description: "Validates GEMINI_API_KEY for spoken English and Akan Twi ASR",
      status: "warn",
      latencyMs: Date.now() - startGemini,
      details: "GEMINI_API_KEY not configured. Spoken voice recognition falls back directly to DTMF keypad.",
    });
  } else {
    try {
      const ai = new GoogleGenAI({
        apiKey: config.gemini.apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const modelToPing = process.env.GEMINI_REASONING_MODEL || "gemini-3.1-flash-lite";
      const pingResponse = await ai.models.generateContent({
        model: modelToPing,
        contents: "Respond with the word 'READY' if this system check is working.",
      });
      const geminiLatency = Date.now() - startGemini;
      const isOk = pingResponse.text?.includes("READY");
      checks.push({
        id: "check_gemini",
        name: "Gemini Speech & NLU API",
        description: "Live round-trip probe to Google Gemini API",
        status: isOk ? "pass" : "warn",
        latencyMs: geminiLatency,
        details: isOk
          ? `Gemini API live and responsive (${geminiLatency}ms). Spoken ASR active.`
          : `Gemini API returned unexpected response: ${pingResponse.text?.slice(0, 50)}`,
      });
    } catch (err: any) {
      checks.push({
        id: "check_gemini",
        name: "Gemini Speech & NLU API",
        description: "Ping to Google Gemini API",
        status: "fail",
        latencyMs: Date.now() - startGemini,
        details: `Gemini probe error: ${err.message}`,
      });
    }
  }

  // Check 4: MTN MoMo Collections
  const startMomo = Date.now();
  const isMomoConfigured = mtnMomoService.isConfigured("collection");
  if (!isMomoConfigured) {
    checks.push({
      id: "check_momo",
      name: "MTN MoMo API Integration",
      description: "Verifies subscription key and API credentials for mobile money requests",
      status: "warn",
      latencyMs: Date.now() - startMomo,
      details: "Live MTN MoMo credentials not configured; sandbox mock provider active.",
    });
  } else {
    try {
      // Validate token generation
      await mtnMomoService.getAccountBalance("collection");
      const momoLatency = Date.now() - startMomo;
      checks.push({
        id: "check_momo",
        name: "MTN MoMo Collections API",
        description: "Tests OAuth2 token exchange and account balance query",
        status: "pass",
        latencyMs: momoLatency,
        details: `MTN MoMo API connected in ${config.momo.targetEnv} mode (${momoLatency}ms).`,
      });
    } catch (err: any) {
      checks.push({
        id: "check_momo",
        name: "MTN MoMo Collections API",
        description: "MTN MoMo API authentication probe",
        status: "fail",
        latencyMs: Date.now() - startMomo,
        details: `MoMo API authentication failed: ${err.message}`,
      });
    }
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  return {
    timestamp: new Date().toISOString(),
    overallStatus: failCount === 0 ? "pass" : "fail",
    checks,
    passCount,
    failCount,
    warnCount,
  };
}
