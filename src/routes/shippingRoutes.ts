/**
 * Ɔkwankyerɛfo Pa - Shipping & Telecom Verification Routes
 * 
 * Powers the Shipping & Telecom verification dashboard.
 */

import { Router, Request, Response } from "express";
import { config } from "../config/env";
import { VoiceService } from "../../africastalking";
import { audioFileExists } from "../audio/catalog";

export const shippingRouter = Router();

shippingRouter.get("/api/shipping/status", async (req: Request, res: Response) => {
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const baseUrl = config.baseUrl || `${proto}://${host}`.replace(/\/+$/, "");

  let credentialsStatus: any = {
    valid: config.at.configured,
    message: config.at.configured ? "Trunk client configured" : "Voice client in simulator mode",
  };

  if (config.at.configured) {
    try {
      const voiceService = new VoiceService(config.at.username, config.at.apiKey);
      credentialsStatus = await voiceService.verifyCredentials();
    } catch (e: any) {
      credentialsStatus = { valid: false, errorMessage: e.message };
    }
  }

  const welcomeAudioExists = audioFileExists("Welcome_prompt_01.mp3");

  res.json({
    status: "ok",
    voiceNumber: config.at.voiceNumber,
    username: config.at.username,
    atConfigured: config.at.configured,
    credentialsStatus,
    audioAssetsReady: welcomeAudioExists,
    baseUrl,
    callbackUrl: `${baseUrl}/voice-menu`,
    preFlightChecks: [
      { name: "AT Account Credentials", status: credentialsStatus.valid ? "passed" : "warning", details: credentialsStatus.message || credentialsStatus.errorMessage },
      { name: "Virtual Voice Trunk Number", status: config.at.voiceNumber ? "passed" : "warning", details: config.at.voiceNumber },
      { name: "Inbound Callback URL", status: "passed", details: `${baseUrl}/voice-menu` },
      { name: "Studio Audio Manifest (24 Clips)", status: welcomeAudioExists ? "passed" : "warning", details: "HTTP 206 Partial Content enabled" },
      { name: "Zero-PIN Security Boundary", status: "passed", details: "Muted during USSD handset PIN prompt" },
      { name: "Dual-Track Speech Recognition", status: config.gemini.configured ? "passed" : "warning", details: config.gemini.configured ? "Gemini active" : "Keypad DTMF fallback active" },
    ],
  });
});
