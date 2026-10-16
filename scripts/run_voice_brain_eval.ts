import fs from "node:fs";
import path from "node:path";
import type { BrainInput, BrainOutput, IntentId, LanguageId } from "../src/ai_system/brain/types";
import { CANONICAL_PROMPT_LIST, resolveCanonicalAudioUrl } from "../src/audio/canonicalRegistry";
import { resolveMomoAudioFeed } from "../src/audio/momoAudioFeedResolver";
import { AUDIO_RECORDINGS } from "../src/audio/recordingRegistry";
import { normalizeGhanaPhoneNumber } from "../src/domain/validation";

interface LabeledDialogue {
  id: string;
  scenario: "en" | "twi" | "code-switched";
  transcript: string;
  expectedIntent: IntentId;
  expectedSlots: {
    amount?: number;
    recipientPhone?: string;
    recipientName?: string;
  };
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function languageForScenario(scenario: LabeledDialogue["scenario"]): LanguageId {
  if (scenario === "twi") return "twi-asante";
  if (scenario === "code-switched") return "mixed-twi-en";
  return "en";
}

function predictedIntent(output: BrainOutput): IntentId | undefined {
  return "intent" in output.decision ? output.decision.intent : output.updatedDraft.intent;
}

async function main(): Promise<void> {
  process.env.MOMO_TARGET_ENV = "production";
  const { Brain } = await import("../src/ai_system/brain/brain");
  const datasetPath = path.resolve(process.argv[2] || "data/heldoutTranscripts.json");
  if (!fs.existsSync(datasetPath)) throw new Error(`Dialogue dataset not found: ${datasetPath}`);
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as LabeledDialogue[];
  if (!Array.isArray(dataset) || dataset.length === 0) throw new Error("Dialogue dataset must be a non-empty JSON array.");

  const brain = new Brain({ mode: "offline_only" });
  let correctIntent = 0;
  let correctSlotExamples = 0;
  let slotExamples = 0;
  let exactRequestExamples = 0;
  const failures: Array<{ id: string; expected: string; actual: string }> = [];

  for (const item of dataset) {
    const language = languageForScenario(item.scenario);
    const input: BrainInput = {
      transcript: item.transcript,
      language,
      sessionLanguage: language,
      languageConfidence: 0.95,
      draft: { slots: {} },
    };
    const output = await brain.process(input);
    const actualIntent = predictedIntent(output);
    const intentCorrect = actualIntent === item.expectedIntent;
    if (intentCorrect) correctIntent++;

    const expected = item.expectedSlots || {};
    const hasAnnotatedSlots = Object.keys(expected).length > 0;
    let slotsCorrect = true;
    if (expected.amount !== undefined && output.updatedDraft.slots.amount !== expected.amount) slotsCorrect = false;
    if (
      expected.recipientPhone !== undefined &&
      normalizeGhanaPhoneNumber(output.updatedDraft.slots.recipient?.phone || "") !==
        normalizeGhanaPhoneNumber(expected.recipientPhone)
    ) slotsCorrect = false;
    if (
      expected.recipientName !== undefined &&
      output.updatedDraft.slots.recipient?.name?.trim().toLowerCase() !== expected.recipientName.trim().toLowerCase()
    ) slotsCorrect = false;
    if (hasAnnotatedSlots) {
      slotExamples++;
      if (slotsCorrect) correctSlotExamples++;
    }

    if (intentCorrect && slotsCorrect) exactRequestExamples++;
    if (!intentCorrect) {
      failures.push({
        id: item.id,
        expected: item.expectedIntent,
        actual: actualIntent ?? output.decision.kind,
      });
    }
  }

  let fixedPromptLanguagePairs = 0;
  let verifiedRecordedPairs = 0;
  let ttsFallbackPairs = 0;
  let routablePromptLanguagePairs = 0;
  for (const prompt of CANONICAL_PROMPT_LIST) {
    for (const language of ["en", "twi"] as const) {
      const audio = resolveCanonicalAudioUrl(prompt.id, language);
      if (audio.url) routablePromptLanguagePairs++;
      if (prompt.type === "DYNAMIC") continue;
      fixedPromptLanguagePairs++;
      if (
        audio.mode === "RECORDED" &&
        AUDIO_RECORDINGS.some((recording) =>
          recording.promptId === prompt.id &&
          recording.language === language &&
          recording.url === audio.url &&
          recording.mappingStatus === "VERIFIED" &&
          recording.recordingRole === "fixed"
        )
      ) {
        verifiedRecordedPairs++;
      } else if (audio.mode === "DYNAMIC_TTS" && audio.url.includes(`/prompt-tts/${language}/`)) {
        ttsFallbackPairs++;
      }
    }
  }

  const feedCases = [
    "PENDING",
    "AUTH_RECEIVED",
    "SUCCESSFUL",
    "DECLINED",
    "TIMEOUT",
    "FAILED",
    "UNRECOGNIZED_PROVIDER_STATE",
  ];
  const feedRoutes = feedCases.flatMap((status) => resolveMomoAudioFeed(status, undefined, "en").prompts);
  const report = {
    dataset: path.relative(process.cwd(), datasetPath),
    evidenceNote: "This corpus is an internal regression set, not a speaker-disjoint independent field evaluation.",
    conversations: dataset.length,
    deterministicIntentAccuracyPercent: percent(correctIntent, dataset.length),
    annotatedSlotExactMatchPercent: percent(correctSlotExamples, slotExamples),
    exactIntentAndAnnotatedSlotsPercent: percent(exactRequestExamples, dataset.length),
    slotExamples,
    intentFailures: failures,
    audioRouting: {
      canonicalPromptLanguagePairs: routablePromptLanguagePairs,
      canonicalRouteAddressabilityPercent: percent(routablePromptLanguagePairs, CANONICAL_PROMPT_LIST.length * 2),
      fixedPromptLanguagePairs,
      verifiedStudioAssetPairs: verifiedRecordedPairs,
      verifiedStudioCoveragePercent: percent(verifiedRecordedPairs, fixedPromptLanguagePairs),
      sameLanguageTtsFallbackPairs: ttsFallbackPairs,
      sandboxStatusCases: feedCases.length,
      sandboxPromptRoutes: feedRoutes.length,
      sandboxCasesWithAudioRoutePercent: percent(
        feedCases.filter((status) => resolveMomoAudioFeed(status, undefined, "en").prompts.every((prompt) => Boolean(prompt.url))).length,
        feedCases.length
      ),
    },
    liveGeminiEvaluation: "NOT_RUN",
    liveSandboxTransactionEvaluation: "NOT_RUN",
    generatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Voice brain evaluation failed:", error);
  process.exitCode = 1;
});
