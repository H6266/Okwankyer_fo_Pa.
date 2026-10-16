/**
 * Ɔkwankyerɛfo Pa - MoMo Sandbox Audio Feed Resolver
 *
 * Bridges asynchronous Mobile Money (MoMo) webhook callbacks and sandbox events
 * to canonical authentic Akan Twi and English studio voice recordings (OP01–OP94).
 *
 * Guaranteed mappings:
 * - PENDING (USSD push)       -> OP47 (Check Phone) + OP46 (Waiting Confirmation)
 * - AUTH_RECEIVED             -> OP49 (Auth Received)
 * - SUCCESSFUL / COMPLETED    -> OP49 (Auth Received) + OP53 (Success Sent)
 * - DECLINED / REJECTED       -> OP57 (Customer Declined) + OP60 (Failure Retry)
 * - TIMEOUT / EXPIRED         -> OP59 (Timeout) + OP63 (Start Again)
 * - FAILED                    -> OP58 (Failed) + OP60 (Failure Retry)
 */

import {
  resolveCanonicalAudioUrl,
  resolvePromptSpokenText,
  getCanonicalPrompt,
  CanonicalPromptLanguage,
} from "./canonicalRegistry";
import { DynamicPromptParams } from "./dynamicPromptBuilder";

export type NormalizedMomoFeedStatus =
  | "PENDING"
  | "AUTH_RECEIVED"
  | "SUCCESSFUL"
  | "DECLINED"
  | "TIMEOUT"
  | "FAILED"
  | "UNKNOWN";

export interface MomoFeedAudioMatch {
  normalizedStatus: NormalizedMomoFeedStatus;
  statusDescription: string;
  promptIds: string[];
  audioUrls: string[];
  spokenTexts: string[];
  combinedSpokenText: string;
  voiceXml: string;
  prompts: Array<{
    id: string;
    state: string;
    url: string;
    spokenText: string;
    isRecorded: boolean;
  }>;
}

export function normalizeMomoStatus(rawStatus: string, reason?: string): NormalizedMomoFeedStatus {
  const s = (rawStatus || "").toUpperCase().trim();
  const r = (reason || "").toUpperCase().trim();

  if (s === "AUTH_RECEIVED" || s === "AUTHORIZED") {
    return "AUTH_RECEIVED";
  }

  if (s === "SUCCESSFUL" || s === "SUCCESS" || s === "COMPLETED") {
    return "SUCCESSFUL";
  }

  if (
    s === "APPROVAL_REJECTED" ||
    s === "CUSTOMER_DECLINED" ||
    s === "DECLINED" ||
    r.includes("DECLINED") ||
    r.includes("REJECTED")
  ) {
    return "DECLINED";
  }

  if (s === "TIMEOUT" || s === "EXPIRED" || r.includes("TIMEOUT") || r.includes("EXPIRED")) {
    return "TIMEOUT";
  }

  if (
    s === "FAILED" ||
    s === "REJECTED" ||
    s === "SUBMISSION_FAILED" ||
    r.includes("INSUFFICIENT") ||
    r.includes("FUNDS") ||
    r.includes("NOT_ENOUGH_FUNDS") ||
    r.includes("ERROR")
  ) {
    return "FAILED";
  }

  if (s === "PENDING" || s === "WAITING" || s === "PROCESSING") {
    return "PENDING";
  }

  return "UNKNOWN";
}

export function resolveMomoAudioFeed(
  rawStatus: string,
  reason?: string,
  lang: CanonicalPromptLanguage = "twi",
  baseUrl: string = "",
  params: DynamicPromptParams = {}
): MomoFeedAudioMatch {
  const normalizedStatus = normalizeMomoStatus(rawStatus, reason);

  let promptIds: string[] = [];
  let statusDescription = "";

  switch (normalizedStatus) {
    case "PENDING":
      promptIds = ["OP47", "OP46"];
      statusDescription = lang === "twi"
        ? "Yɛretwɛn wo MoMo PIN wɔ wo fon so"
        : "Waiting for handset PIN authorization";
      break;

    case "AUTH_RECEIVED":
      promptIds = ["OP49"];
      statusDescription = lang === "twi"
        ? "Yɛanya wo tumikyerɛ a wode maa so"
        : "Authorization received from handset";
      break;

    case "SUCCESSFUL":
      promptIds = ["OP49", "OP53"];
      statusDescription = lang === "twi"
        ? "Sika no akɔ n'anim pɛpɛɛpɛ"
        : "Transfer successfully authorized and sent";
      break;

    case "DECLINED":
      promptIds = ["OP57", "OP60"];
      statusDescription = lang === "twi"
        ? "Wotwaa adesrɛ no mu anaa w'amfa wo PIN ammrɛ"
        : "Customer declined payment authorization on handset";
      break;

    case "TIMEOUT":
      promptIds = ["OP59", "OP63"];
      statusDescription = lang === "twi"
        ? "Berɛ a wɔde ma no atwam. Bɔ mmɔden bio"
        : "Handset PIN entry timed out without confirmation";
      break;

    case "FAILED":
      promptIds = ["OP58", "OP60"];
      statusDescription = lang === "twi"
        ? "Sika dwumadie no antumi ankɔ"
        : "Mobile Money transaction failed";
      break;

    case "UNKNOWN":
    default:
      promptIds = ["OP90"];
      statusDescription = lang === "twi"
        ? "Yɛrentumi nkyerɛ wo dwumadie no tebea seesei. Yɛsrɛ wo san hwɛ bio."
        : "We could not verify the transaction status. Please check again before retrying.";
      break;
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const prompts = promptIds.map((pid) => {
    const canonical = getCanonicalPrompt(pid);
    const audioRes = resolveCanonicalAudioUrl(pid, lang, cleanBase, params);
    const spoken = resolvePromptSpokenText(pid, lang, params);

    return {
      id: pid,
      state: canonical?.state || "UNKNOWN",
      url: audioRes.url,
      spokenText: spoken,
      isRecorded: audioRes.mode === "RECORDED",
    };
  });

  const audioUrls = prompts.map((p) => p.url);
  const spokenTexts = prompts.map((p) => p.spokenText);
  const combinedSpokenText = spokenTexts.join(" ");

  // Generate robust VoiceXML <Play> tags for Africa's Talking telephony
  const xmlElements = prompts.map((p) => {
    const escapedUrl = p.url.replace(/&/g, "&amp;");
    const escapedText = p.spokenText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `    <Play url="${escapedUrl}"/>\n    <Say voice="female">${escapedText}</Say>`;
  });

  const voiceXml = xmlElements.join("\n");

  return {
    normalizedStatus,
    statusDescription,
    promptIds,
    audioUrls,
    spokenTexts,
    combinedSpokenText,
    voiceXml,
    prompts,
  };
}
