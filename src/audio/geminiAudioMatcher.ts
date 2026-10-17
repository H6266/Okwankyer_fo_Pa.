/**
 * Ɔkwankyerɛfo Pa - AI-Driven Audio Cross-Referencing & Assembly Brain
 *
 * Architecture:
 * 1. AI is the Brain: An API request is made to the AI (Gemini as primary,
 *    cascading to OpenAI -> Qwen) with the reply and the complete library transcripts.
 * 2. The AI reasons about what pre-recorded audio files communicate the message,
 *    arranges them in exact playback order, and isolates dynamic variables or missing
 *    phrases for dynamic TTS.
 * 3. System is the Body: Initiates the playback of the ordered clips and requests TTS.
 * 4. Local System Fallback: ONLY if all AI APIs fail does our local matching system
 *    take over to do deterministic/fuzzy transcript matching.
 */

import { TWI_AUDIO_LIBRARY_ITEMS, TwiLibraryItem } from "./twiLibraryManifest";
import { AUDIO_RECORDINGS, AudioRecording } from "./recordingRegistry";
import { UnifiedGeminiClient } from "../services/geminiClient";
import { openaiClient } from "../services/openai/openaiClient";
import { qwenClient } from "../services/qwen/qwenClient";

export interface AudioSegment {
  type: "clip" | "tts";
  filename?: string;
  audioUrl?: string;
  transcript?: string;
  text?: string;
}

export interface CrossReferenceAudioPlan {
  replyText: string;
  source: "gemini" | "openai" | "qwen" | "local_fallback";
  segments: AudioSegment[];
  orderedClipFilenames: string[];
  ttsText: string | null;
  reasoning: string;
  confidence: number;
}

export interface CallerLiteracyOptions {
  literacyLevel?: "low" | "standard" | "elderly";
  prefersColloquial?: boolean;
  sessionId?: string;
  isGeminiConversation?: boolean;
}

export interface StoredGeminiReply {
  text: string;
  language: string;
  sessionId?: string;
  timestamp: number;
}

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
  audioPlan?: CrossReferenceAudioPlan;
}

// ── Stored Conversation Replies for Memory Verification ─────────────
const storedGeminiReplies = new Map<string, StoredGeminiReply>();

export function storeGeminiConversationReply(
  text: string,
  language: string,
  sessionId?: string
): void {
  const clean = (text || "").trim();
  if (!clean) return;
  const entry: StoredGeminiReply = {
    text: clean,
    language,
    sessionId,
    timestamp: Date.now(),
  };
  storedGeminiReplies.set(`text:${clean.toLowerCase()}`, entry);
  if (sessionId) {
    storedGeminiReplies.set(`${sessionId}:${clean.toLowerCase()}`, entry);
  }
}

export function getStoredGeminiReply(replyText: string, sessionId?: string): StoredGeminiReply | null {
  const trimmed = (replyText || "").trim().toLowerCase();
  if (sessionId) {
    return storedGeminiReplies.get(`${sessionId}:${trimmed}`) || null;
  }
  return storedGeminiReplies.get(`text:${trimmed}`) || null;
}

// ── In-Memory Cache for Match Plans ─────────────────────────────────
const matchPlanCache = new Map<string, CrossReferenceAudioPlan>();
const MAX_CACHE_ENTRIES = 500;

function getCacheKey(text: string, lang: string): string {
  return `${lang}:${(text || "").trim().toLowerCase()}`;
}

// Format the Twi Audio Library catalog as concise text for AI context
function getFormattedAudioLibraryCatalog(): string {
  return TWI_AUDIO_LIBRARY_ITEMS.map(
    (item, idx) => `[${idx + 1}] file: "${item.filename}" | transcript: "${item.transcript}" | category: ${item.category}`
  ).join("\n");
}

const CATALOG_PROMPT_STRING = getFormattedAudioLibraryCatalog();

/**
 * Primary Brain: Cross-reference reply text with the audio library using AI reasoning.
 */
export async function crossReferenceReplyAudioWithAi(
  replyText: string,
  language: "twi" | "en" = "twi",
  options?: CallerLiteracyOptions
): Promise<CrossReferenceAudioPlan> {
  const cleanReply = (replyText || "").trim();
  if (!cleanReply) {
    return {
      replyText: "",
      source: "local_fallback",
      segments: [],
      orderedClipFilenames: [],
      ttsText: null,
      reasoning: "Empty reply text.",
      confidence: 1.0,
    };
  }

  // 1. Check in-memory plan cache
  const cacheKey = getCacheKey(cleanReply, language);
  const cached = matchPlanCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Primary Path: Call Gemini API (The Brain)
  try {
    const plan = await callGeminiAudioMatcher(cleanReply, language, options);
    if (plan && plan.segments.length > 0) {
      if (matchPlanCache.size > MAX_CACHE_ENTRIES) matchPlanCache.clear();
      matchPlanCache.set(cacheKey, plan);
      return plan;
    }
  } catch (err: any) {
    console.warn("[AudioMatcherBrain] Gemini API call failed, cascading to fallback:", err?.message || err);
  }

  // 3. Fallback 1: OpenAI
  try {
    const plan = await callOpenAiAudioMatcher(cleanReply, language);
    if (plan && plan.segments.length > 0) {
      matchPlanCache.set(cacheKey, plan);
      return plan;
    }
  } catch (err: any) {
    console.warn("[AudioMatcherBrain] OpenAI fallback failed:", err?.message || err);
  }

  // 4. Fallback 2: Qwen
  try {
    const plan = await callQwenAudioMatcher(cleanReply, language);
    if (plan && plan.segments.length > 0) {
      matchPlanCache.set(cacheKey, plan);
      return plan;
    }
  } catch (err: any) {
    console.warn("[AudioMatcherBrain] Qwen fallback failed:", err?.message || err);
  }

  // 5. Ultimate Fallback: Local Rule & Token Matcher
  const localPlan = localAudioMatcherFallback(cleanReply, language);
  matchPlanCache.set(cacheKey, localPlan);
  return localPlan;
}

/**
 * Gemini Prompt Execution for Audio Cross-Referencing
 */
async function callGeminiAudioMatcher(
  replyText: string,
  language: "twi" | "en",
  _options?: CallerLiteracyOptions
): Promise<CrossReferenceAudioPlan | null> {
  const gemini = UnifiedGeminiClient.getInstance("telephony");
  if (!gemini.isAvailable()) return null;

  const prompt = `You are the Audio Assembly Brain for Ɔkwankyerɛfo Pa, an accessible Mobile Money voice system in Ghana.
Given the intended reply message to speak to the user and our library of pre-recorded studio audio files (with verbatim transcripts), your task is:
1. Examine what the reply says.
2. Cross-reference with our pre-recorded audio library files.
3. Decide which audio clips to play and in what EXACT order (e.g. 1, 2, or 3 clips).
4. For dynamic variables (such as recipient names, amounts, reference numbers, transaction IDs, or phrases not in any recording), isolate them into 'ttsText'.
5. If no audio clip matches at all, set 'orderedClipFilenames' to [] and put the whole reply into 'ttsText'.
6. If 1 or more clips match, specify them in exact sequence. Any trailing or embedded variable text goes to 'ttsText'.

AVAILABLE AUDIO LIBRARY:
${CATALOG_PROMPT_STRING}

TARGET MESSAGE TO COMMUNICATE:
"${replyText}"

LANGUAGE: ${language}

Output strictly valid JSON with this exact schema:
{
  "orderedClipFilenames": ["Processing.m4a", "Success_sent.m4a"],
  "ttsText": "the reference number is Rent and transaction ID is OKP-91283",
  "reasoning": "Play Processing clip, then Success_sent clip, followed by TTS of the reference and transaction ID.",
  "confidence": 0.95
}`;

  const response = await gemini.executeWithTimeout(
    "audio-cross-referencing",
    async (ai) => {
      return await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });
    },
    10000,
    1,
    undefined,
    undefined,
    "gemini-3.8-flash"
  );

  const responseText = response?.text;
  if (!responseText) return null;
  return parseAiPlanResponse(responseText, replyText, "gemini");
}

/**
 * OpenAI Fallback Execution
 */
async function callOpenAiAudioMatcher(
  replyText: string,
  language: "twi" | "en"
): Promise<CrossReferenceAudioPlan | null> {
  if (!openaiClient.isAvailable()) return null;
  const rawClient = openaiClient.getRawClient();
  if (!rawClient) return null;

  const prompt = `You are the Audio Assembly Brain for Ɔkwankyerɛfo Pa.
Given the intended reply and our pre-recorded audio files catalog, determine which audio files to play in order and which text needs TTS.
Audio Library:
${CATALOG_PROMPT_STRING}

Message: "${replyText}"
Language: ${language}

Respond strictly in JSON:
{
  "orderedClipFilenames": ["filename.m4a"],
  "ttsText": "dynamic variables or empty string",
  "reasoning": "explanation",
  "confidence": 0.9
}`;

  const response = await rawClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You output JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 400,
  });

  const resText = response.choices?.[0]?.message?.content;
  if (!resText) return null;
  return parseAiPlanResponse(resText, replyText, "openai");
}

/**
 * Qwen Fallback Execution
 */
async function callQwenAudioMatcher(
  replyText: string,
  language: "twi" | "en"
): Promise<CrossReferenceAudioPlan | null> {
  if (!qwenClient.isAvailable()) return null;
  const rawClient = qwenClient.getRawClient();
  if (!rawClient) return null;

  const prompt = `Audio library:
${CATALOG_PROMPT_STRING}
Message: "${replyText}"
Select matching audio clips in order and any TTS remainder as JSON:
{"orderedClipFilenames": [], "ttsText": "", "reasoning": "", "confidence": 0.8}`;

  const response = await rawClient.chat.completions.create({
    model: qwenClient.getModel(),
    messages: [
      { role: "system", content: "You output JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 400,
  });

  const resText = response.choices?.[0]?.message?.content;
  if (!resText) return null;
  return parseAiPlanResponse(resText, replyText, "qwen");
}

/**
 * Parse structured JSON returned by AI model
 */
function parseAiPlanResponse(
  rawText: string,
  replyText: string,
  source: "gemini" | "openai" | "qwen"
): CrossReferenceAudioPlan | null {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    const filenames: string[] = Array.isArray(parsed.orderedClipFilenames)
      ? parsed.orderedClipFilenames
      : [];
    const ttsText: string | null = parsed.ttsText && typeof parsed.ttsText === "string" && parsed.ttsText.trim().length > 0
      ? parsed.ttsText.trim()
      : null;

    const segments: AudioSegment[] = [];

    // Map matched filenames to audio URLs
    for (const fn of filenames) {
      const item = TWI_AUDIO_LIBRARY_ITEMS.find(
        (i) => i.filename.toLowerCase() === fn.toLowerCase()
      );
      if (item) {
        segments.push({
          type: "clip",
          filename: item.filename,
          audioUrl: item.audioUrl,
          transcript: item.transcript,
        });
      } else {
        // Find in AUDIO_RECORDINGS
        const rec = AUDIO_RECORDINGS.find(
          (r) => r.relativePath.toLowerCase().endsWith(fn.toLowerCase())
        );
        if (rec && rec.url) {
          segments.push({
            type: "clip",
            filename: fn,
            audioUrl: rec.url,
            transcript: rec.spokenText || "",
          });
        }
      }
    }

    if (ttsText) {
      segments.push({
        type: "tts",
        text: ttsText,
      });
    }

    // If AI found no clips and no ttsText, use replyText as full TTS
    if (segments.length === 0) {
      segments.push({
        type: "tts",
        text: replyText,
      });
    }

    return {
      replyText,
      source,
      segments,
      orderedClipFilenames: filenames,
      ttsText,
      reasoning: parsed.reasoning || "AI assembled audio plan.",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Local Deterministic & Fuzzy Matching Fallback (Operates 100% offline)
 */
export function localAudioMatcherFallback(
  replyText: string,
  _language: "twi" | "en" = "twi"
): CrossReferenceAudioPlan {
  const normReply = replyText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const words = new Set(normReply.split(/\s+/).filter(Boolean));

  let bestItem: TwiLibraryItem | null = null;
  let highestScore = 0;

  for (const item of TWI_AUDIO_LIBRARY_ITEMS) {
    let score = 0;
    const itemTranscriptNorm = item.transcript.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    
    // Exact or substring match of full transcript
    if (normReply.includes(itemTranscriptNorm) || itemTranscriptNorm.includes(normReply)) {
      score += 15;
    }

    // Exact keyword match
    for (const kw of item.keywords) {
      const kwNorm = kw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
      if (normReply.includes(kwNorm)) {
        score += 6;
      }
    }

    // Word overlap for words longer than 3 characters
    const itemWords = itemTranscriptNorm.split(/\s+/);
    for (const w of itemWords) {
      if (w.length > 3 && words.has(w)) {
        score += 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestItem = item;
    }
  }

  // Check if reply contains dynamic details
  const hasDynamic = /\b\d{4,}\b|\b(?:cedis|ghs|kwame|kofi|yaw|kwabena|ama|yaa)\b/i.test(replyText);

  if (bestItem && highestScore >= 2.0) {
    const segments: AudioSegment[] = [
      {
        type: "clip",
        filename: bestItem.filename,
        audioUrl: bestItem.audioUrl,
        transcript: bestItem.transcript,
      },
    ];

    let ttsText: string | null = null;
    if (hasDynamic) {
      ttsText = replyText;
      segments.push({
        type: "tts",
        text: replyText,
      });
    }

    return {
      replyText,
      source: "local_fallback",
      segments,
      orderedClipFilenames: [bestItem.filename],
      ttsText,
      reasoning: `Local fallback matched highest scoring audio item '${bestItem.filename}' (score ${highestScore}).`,
      confidence: Math.min(0.85, highestScore / 10),
    };
  }

  // Full TTS fallback
  return {
    replyText,
    source: "local_fallback",
    segments: [{ type: "tts", text: replyText }],
    orderedClipFilenames: [],
    ttsText: replyText,
    reasoning: "No high-confidence pre-recorded audio match found locally; routing to TTS.",
    confidence: 0.5,
  };
}

/**
 * Backward compatibility function for callers expecting GeminiAudioMatchResult
 */
export async function matchAiReplyWithGemini(
  replyText: string,
  language: "twi" | "en" = "twi",
  literacyOptions?: CallerLiteracyOptions
): Promise<GeminiAudioMatchResult> {
  const plan = await crossReferenceReplyAudioWithAi(replyText, language, literacyOptions);

  const primaryClip = plan.segments.find((s) => s.type === "clip");
  if (primaryClip && primaryClip.audioUrl) {
    return {
      matchFound: true,
      audioUrl: primaryClip.audioUrl,
      title: primaryClip.filename || "Matched Audio Clip",
      spokenText: primaryClip.transcript || replyText,
      reason: plan.reasoning,
      requiresTts: Boolean(plan.ttsText),
      confidence: plan.confidence,
      audioPlan: plan,
    };
  }

  return {
    matchFound: false,
    reason: plan.reasoning,
    requiresTts: true,
    confidence: plan.confidence,
    audioPlan: plan,
  };
}
