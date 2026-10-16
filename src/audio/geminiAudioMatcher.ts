/**
 * Ɔkwankyerɛfo Pa - AI-Driven Audio Link Matcher & Literacy Engine (geminiAudioMatcher.ts)
 * 
 * Flow:
 * 1. AI Reply arrives from conversational agent/brain.
 * 2. Feeds the AI reply text, language, and Audio Link Catalog (from TWI_AUDIO_LINK_MANIFEST & prompts) to Gemini.
 * 3. Gemini evaluates semantic matching while taking into account caller literacy
 *    (e.g., favoring warm, intuitive, colloquial Akan speech over formal text).
 * 4. If a pre-recorded studio audio file matches -> returns audio URL for authentic voice playback.
 * 5. If no pre-recorded audio matches (e.g., dynamic names, calculations) -> explicitly tells the system to synthesize via TTS.
 */

import { AUDIO_RECORDINGS, AudioRecording } from "./recordingRegistry";
import { TWI_SEQUENTIAL_FLOW_STEPS } from "./twiSequentialAudioFlow";
import { UnifiedGeminiClient } from "../services/geminiClient";
import promptManifest from "../../Audio_files/prompts.json";

export interface GeminiAudioMatchResult {
  matchFound: boolean;
  promptId?: string;
  audioUrl?: string;
  title?: string;
  spokenText?: string;
  reason: string;
  requiresTts: boolean;
  literacyContext?: string;
  confidence?: number;
}

export interface CallerLiteracyOptions {
  literacyLevel?: "low" | "standard" | "elderly";
  prefersColloquial?: boolean;
}

interface CatalogCandidate {
  promptId: string;
  category: string;
  state: string;
  twiText: string;
  englishText: string;
  audioUrl: string;
}

// Build pre-indexed candidate catalog of available recorded audio clips
function buildCandidateCatalog(): CatalogCandidate[] {
  const candidates: CatalogCandidate[] = [];
  const seenIds = new Set<string>();

  // 1. From TWI_SEQUENTIAL_FLOW_STEPS
  for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
    if (step.audioUrl && step.id) {
      candidates.push({
        promptId: step.id,
        category: step.name,
        state: step.id,
        twiText: step.spokenTextTwi,
        englishText: step.spokenTextEn,
        audioUrl: step.audioUrl,
      });
      seenIds.add(step.id);
    }
  }

  // 2. From prompts.json linked with AUDIO_RECORDINGS
  const manifestPrompts = (promptManifest as any).prompts || [];
  for (const p of manifestPrompts) {
    if (seenIds.has(p.id)) continue;
    const twiAudio = p.audio?.twi;
    if (!twiAudio) continue;

    // Resolve URL in AUDIO_RECORDINGS
    const rec = AUDIO_RECORDINGS.find((r) => r.promptId === p.id && r.url);
    const audioUrl = rec?.url || `/audio/supplied/${twiAudio.replace(/^audio\/Twi\//, "Twi/")}`;

    candidates.push({
      promptId: p.id,
      category: p.category,
      state: p.state,
      twiText: p.twi || "",
      englishText: p.english || "",
      audioUrl,
    });
    seenIds.add(p.id);
  }

  // 3. From remaining AUDIO_RECORDINGS with spokenText
  for (const rec of AUDIO_RECORDINGS) {
    if (rec.promptId && !seenIds.has(rec.promptId) && rec.url && rec.spokenText) {
      candidates.push({
        promptId: rec.promptId,
        category: rec.category,
        state: rec.state || rec.promptId,
        twiText: rec.language === "twi" ? rec.spokenText : "",
        englishText: rec.language === "en" ? rec.spokenText : "",
        audioUrl: rec.url,
      });
      seenIds.add(rec.promptId);
    }
  }

  return candidates;
}

const CATALOG_CANDIDATES = buildCandidateCatalog();

/**
 * Matches an AI reply to the Audio Link Catalog using Gemini, factoring in caller literacy.
 */
export async function matchAiReplyWithGemini(
  replyText: string,
  language: "twi" | "en" = "twi",
  literacyOptions?: CallerLiteracyOptions
): Promise<GeminiAudioMatchResult> {
  const cleanReply = (replyText || "").trim();
  if (!cleanReply) {
    return {
      matchFound: false,
      requiresTts: true,
      reason: "Empty reply text provided.",
    };
  }

  const isTwi = language.startsWith("tw") || language === "twi";
  const literacyLevel = literacyOptions?.literacyLevel || "standard";

  // Provide a focused subset of candidate prompt descriptions to keep prompt compact and fast
  const candidatesSummary = CATALOG_CANDIDATES.map((c) => ({
    id: c.promptId,
    category: c.category,
    twi: c.twiText,
    en: c.englishText,
    url: c.audioUrl,
  }));

  const systemInstruction = `You are the Audio Dispatch & Literacy Intelligence Engine for Ɔkwankyerɛfo Pa, an accessible Ghanaian Akan (Twi) and English Voice Mobile Money (MoMo) IVR platform.
Your job is to examine an AI-generated assistant reply and decide whether it matches an authentic pre-recorded human studio audio clip, or whether it requires dynamic Text-to-Speech (TTS) synthesis.

LITERACY & ACCESSIBILITY GUIDELINES:
- Many callers have limited formal textual literacy or are elderly. They rely on simple, colloquial, warm, spoken Akan expressions (e.g. "Mepa wo kyɛw bɔ sika dodow no", "Akwaaba kɔ Mobile Money", "Obi a woremane no nɔmba").
- If the AI reply conveys the same core intent and action as a pre-recorded studio audio clip, prefer the pre-recorded authentic human recording because it sounds much more natural and trustworthy to the caller than robotic TTS.
- DYNAMIC CONTENT EXCLUSION: If the AI reply contains specific dynamic values that are unique to this call (e.g. dynamic amounts like "GHS 37.50", specific recipient names like "Kofi Mensah", fee calculations, custom status explanations), a static pre-recorded clip CANNOT be used. In this case, mark matchFound=false and requiresTts=true.
- If none of the audio clips in the catalog match the message, mark matchFound=false and requiresTts=true.

Return ONLY a valid JSON object with:
{
  "matchFound": boolean,
  "matchedPromptId": string | null,
  "audioUrl": string | null,
  "reason": string,
  "requiresTts": boolean,
  "literacyNote": string
}`;

  const promptContent = `Language: ${isTwi ? "Akan Twi" : "English"}
Caller Literacy Profile: ${literacyLevel} (prefers intuitive, colloquial spoken clarity)
AI Reply Text to play: "${cleanReply}"

Available Audio Link Catalog Candidates:
${JSON.stringify(candidatesSummary.slice(0, 35), null, 2)}

Determine if an authentic studio audio clip matches this reply, or if dynamic TTS is required.`;

  try {
    const client = UnifiedGeminiClient.getInstance("telephony");
    if (client.isAvailable()) {
      const resultText = await client.executeWithTimeout(
        "gemini-audio-link-matcher",
        async (ai, signal) => {
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              { role: "user", parts: [{ text: systemInstruction + "\n\n" + promptContent }] },
            ],
            config: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          });
          return response.text || "";
        },
        5000,
        1,
        undefined,
        4000,
        "gemini-3.8-flash"
      );

      if (resultText) {
        const parsed = JSON.parse(resultText);
        if (parsed.matchFound && parsed.matchedPromptId) {
          const found = CATALOG_CANDIDATES.find(
            (c) => c.promptId.toLowerCase() === String(parsed.matchedPromptId).toLowerCase()
          );
          const resolvedUrl = found?.audioUrl || parsed.audioUrl;
          if (resolvedUrl) {
            return {
              matchFound: true,
              promptId: found?.promptId || parsed.matchedPromptId,
              audioUrl: resolvedUrl,
              title: found?.category || "Matched Studio Prompt",
              spokenText: isTwi ? found?.twiText : found?.englishText,
              reason: parsed.reason || "Semantic and literacy match via Gemini",
              requiresTts: false,
              literacyContext: parsed.literacyNote,
              confidence: 0.95,
            };
          }
        }
        return {
          matchFound: false,
          requiresTts: true,
          reason: parsed.reason || "Dynamic or non-catalog content; requires TTS synthesis.",
          literacyContext: parsed.literacyNote,
          confidence: 0.90,
        };
      }
    }
  } catch (err: any) {
    console.warn("[GeminiAudioMatcher] Gemini evaluation notice, using heuristic fallback:", err?.message);
  }

  // Graceful Semantic Fallback when offline or fast fallback needed
  return semanticCatalogFallback(cleanReply, isTwi);
}

/**
 * Deterministic semantic fallback matching when Gemini is offline or rate-limited
 */
function semanticCatalogFallback(cleanReply: string, isTwi: boolean): GeminiAudioMatchResult {
  const lower = cleanReply.toLowerCase();

  // Check if reply has dynamic figures / amounts
  const hasDynamicNumbers = /\b\d{2,}\b|\bghs\b|\bcedis?\b/i.test(lower);
  if (hasDynamicNumbers && (lower.includes("akɔma") || lower.includes("sent") || lower.includes("fee") || lower.includes("cedis"))) {
    return {
      matchFound: false,
      requiresTts: true,
      reason: "Contains dynamic transaction details; requires dynamic TTS synthesis.",
    };
  }

  for (const candidate of CATALOG_CANDIDATES) {
    const target = (isTwi ? candidate.twiText : candidate.englishText).toLowerCase();
    if (!target) continue;

    // High semantic similarity
    if (lower === target || (lower.length > 15 && target.includes(lower)) || (target.length > 15 && lower.includes(target))) {
      return {
        matchFound: true,
        promptId: candidate.promptId,
        audioUrl: candidate.audioUrl,
        title: candidate.category,
        spokenText: isTwi ? candidate.twiText : candidate.englishText,
        reason: "Exact/high semantic match to catalog recording",
        requiresTts: false,
        confidence: 0.92,
      };
    }
  }

  // Default: tell system to use TTS
  return {
    matchFound: false,
    requiresTts: true,
    reason: "No pre-recorded studio audio matches; fallback to TTS synthesis.",
  };
}
