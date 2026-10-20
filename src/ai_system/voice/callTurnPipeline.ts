import { aiSystem } from "../index";
import type { AiProcessInput, AiProcessResult } from "../core/aiTypes";
import { brain } from "../brain/brain";
import { randomUUID } from "node:crypto";
import { ttsRouter } from "../speech/tts/ttsRouter";
import type { TtsSynthesisResponse } from "../speech/tts/ttsProvider";
import { transcodeAudioBufferToMp3 } from "../../audio/streaming";

const CALL_AUDIO_TTL_MS = 2 * 60 * 1000;
const CALL_AUDIO_MAX_ENTRIES = 128;
const callAudioCache = new Map<string, { audio: TtsSynthesisResponse; expiresAt: number }>();

export interface CanonicalCallTurnInput extends AiProcessInput {
  callerPhone?: string;
  draft?: any;
}

export interface CanonicalCallTurn {
  input: CanonicalCallTurnInput;
  result: AiProcessResult;
  brainOutput: Awaited<ReturnType<typeof brain.process>>;
  ttsAudio: TtsSynthesisResponse | null;
  ttsAudioUrl: string | null;
}

export function getCachedCallAudio(audioId: string): TtsSynthesisResponse | null {
  const cached = callAudioCache.get(audioId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    callAudioCache.delete(audioId);
    return null;
  }
  return cached.audio;
}

function cacheCallAudio(audio: TtsSynthesisResponse): string | null {
  if (!audio.audioBuffer?.length) return null;
  const now = Date.now();
  for (const [audioId, entry] of callAudioCache) {
    if (entry.expiresAt <= now) callAudioCache.delete(audioId);
  }
  while (callAudioCache.size >= CALL_AUDIO_MAX_ENTRIES) {
    const oldestId = callAudioCache.keys().next().value;
    if (!oldestId) break;
    callAudioCache.delete(oldestId);
  }
  const audioId = randomUUID();
  callAudioCache.set(audioId, { audio, expiresAt: now + CALL_AUDIO_TTL_MS });
  return `/api/telephony/audio/${audioId}`;
}

export function normalizeCanonicalCallInput(input: CanonicalCallTurnInput): CanonicalCallTurnInput {
  if (input.channel !== "DTMF") return input;

  const digit = input.input.trim();
  const step = (input.currentStep || "welcome").toLowerCase();
  let normalized = digit;

  if (step === "welcome" || step === "service-select" || step === "action-select") {
    if (digit === "1") normalized = "send money";
    else if (digit === "2" && step === "welcome") normalized = "banking services";
  } else if (step === "confirm") {
    if (digit === "1") normalized = "yes";
    else if (digit === "2") normalized = "no";
  }

  return normalized === input.input ? input : { ...input, input: normalized };
}

export async function processCanonicalCallTurn(input: CanonicalCallTurnInput): Promise<CanonicalCallTurn> {
  const normalizedInput = normalizeCanonicalCallInput({
    ...input,
    currentScreen: input.currentScreen || "HOME",
    currentStep: input.currentStep || "welcome",
    executionMode: input.executionMode || "SIMULATION",
  });
  const result = await aiSystem.process(normalizedInput);
  const selectedLanguage = normalizedInput.language || "en";
  const brainLanguage = selectedLanguage === "tw" || selectedLanguage === "ak"
    ? "twi-asante"
    : selectedLanguage === "en-ak"
    ? "mixed-twi-en"
    : "en";
  const pinDetectedInVoice = result.safety.pinDetectedInVoice || normalizedInput.input === "[DISCARDED_PIN]";
  const brainOutput = pinDetectedInVoice
    ? {
        reply: { text: result.dialogue.response, language: brainLanguage },
        decision: { kind: "clarify_slot" },
        updatedDraft: { slots: result.entities },
      } as Awaited<ReturnType<typeof brain.process>>
    : await brain.process({
        transcript: normalizedInput.input,
        language: brainLanguage,
        languageConfidence: 0.95,
        sessionLanguage: brainLanguage,
        draft: normalizedInput.draft || {},
        sessionId: normalizedInput.sessionId,
        callerNumber: normalizedInput.callerPhone,
      });

  let ttsAudio: TtsSynthesisResponse | null = null;
  let ttsAudioUrl: string | null = null;
  try {
    const synthesizedAudio = await ttsRouter.synthesizeBrainReply(brainOutput.reply);
    const sourceAudio = synthesizedAudio.audioBuffer
      || (synthesizedAudio.audioBase64 ? Buffer.from(synthesizedAudio.audioBase64, "base64") : undefined);
    ttsAudio = sourceAudio
      ? {
          ...synthesizedAudio,
          audioBuffer: await transcodeAudioBufferToMp3(sourceAudio, synthesizedAudio.audioMimeType),
          audioMimeType: "audio/mpeg",
          mimeType: "audio/mpeg",
        }
      : synthesizedAudio;
    if (ttsAudio.audioBuffer) ttsAudio.audioBase64 = ttsAudio.audioBuffer.toString("base64");
    ttsAudioUrl = cacheCallAudio(ttsAudio);
  } catch {
    // VoiceXML falls back to an approved recording or the telephony voice.
  }

  return {
    input: normalizedInput,
    result,
    brainOutput,
    ttsAudio,
    ttsAudioUrl,
  };
}