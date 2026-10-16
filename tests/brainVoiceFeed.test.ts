import { describe, expect, it } from "vitest";
import { Brain } from "../src/ai_system/brain/brain";
import { CANONICAL_PROMPT_LIST, resolveCanonicalAudioUrl } from "../src/audio/canonicalRegistry";
import { normalizeMomoStatus, resolveMomoAudioFeed } from "../src/audio/momoAudioFeedResolver";
import { matchReplyToAudio } from "../src/audio/replyAudioMatcher";
import { AUDIO_RECORDINGS, getRecordingByPromptId } from "../src/audio/recordingRegistry";

describe("brain interpretation and spoken response routing", () => {
  it("recognizes additional Ghanaian English, Twi, and code-switched intents", async () => {
    const cases = [
      { text: "water company gwcl bill payment forty cedis", language: "en", expected: "momo.pay_bill" },
      { text: "can you check what is remaining in my mobile wallet", language: "en", expected: "momo.check_balance" },
      { text: "mesrɛ wo sesa sika a mesomaeɛ mfomsoɔ no ma me", language: "twi-asante", expected: "momo.reverse_transaction" },
      { text: "tɔ kɔkɔɔ cedi du ma me seesei", language: "twi-asante", expected: "momo.buy_airtime" },
      { text: "me pɛ sɛ me gye quickloan cedi aduowɔtwe", language: "twi-asante", expected: "momo.loan" },
      { text: "mepa wo kyɛw yɛda wo ase", language: "twi-asante", expected: "smalltalk" },
      { text: "how much sika dey my momo wallet check am", language: "mixed-twi-en", expected: "momo.check_balance" },
      { text: "wrong transfer kɔɔ 0501122334 reverse am fast", language: "mixed-twi-en", expected: "momo.reverse_transaction" },
    ] as const;

    const brain = new Brain({ mode: "offline_only" });
    for (const item of cases) {
      const output = await brain.process({
        transcript: item.text,
        language: item.language,
        sessionLanguage: item.language,
        draft: { slots: {} },
      });
      const intent = "intent" in output.decision ? output.decision.intent : output.updatedDraft.intent;
      expect(intent, item.text).toBe(item.expected);
    }
  });

  it("routes every canonical prompt and language to verified recording or same-language TTS", () => {
    let resolvedPairs = 0;

    for (const prompt of CANONICAL_PROMPT_LIST) {
      for (const language of ["en", "twi"] as const) {
        const audio = resolveCanonicalAudioUrl(prompt.id, language);
        expect(audio.url).toBeTruthy();
        if (audio.mode === "RECORDED") {
          const recording = AUDIO_RECORDINGS.find((item) =>
            item.promptId === prompt.id && item.language === language && item.url === audio.url
          );
          expect(recording, `${prompt.id}/${language}`).toBeDefined();
          expect(recording?.mappingStatus).toBe("VERIFIED");
          expect(recording?.recordingRole).toBe("fixed");
        } else {
          expect(audio.url).toContain(`/api/audio/prompt-tts/${language}/${prompt.id}`);
        }
        resolvedPairs++;
      }
    }

    expect(resolvedPairs).toBe(188);
  });

  it("does not play an unverified or wrong-language recording as a reply match", () => {
    const ambiguous = AUDIO_RECORDINGS.find((recording) => recording.mappingStatus !== "VERIFIED");
    if (ambiguous?.promptId) {
      expect(getRecordingByPromptId(ambiguous.promptId, "twi")?.mappingStatus).toBe("VERIFIED");
    }

    const twiText = "Sɛ wopɛ mobile money services a, mia baako.";
    const englishMatch = matchReplyToAudio(twiText, "en");
    expect(englishMatch.match).toBe(false);
    expect(englishMatch.isFallbackToTts).toBe(true);
  });

  it("maps known MoMo events explicitly and unknown feed statuses to a safe verification prompt", () => {
    const expected = [
      ["PENDING", "PENDING", ["OP47", "OP46"]],
      ["AUTHORIZED", "AUTH_RECEIVED", ["OP49"]],
      ["COMPLETED", "SUCCESSFUL", ["OP49", "OP53"]],
      ["APPROVAL_REJECTED", "DECLINED", ["OP57", "OP60"]],
      ["EXPIRED", "TIMEOUT", ["OP59", "OP63"]],
      ["FAILED", "FAILED", ["OP58", "OP60"]],
      ["FUTURE_PROVIDER_STATE", "UNKNOWN", ["OP90"]],
    ] as const;

    for (const [rawStatus, normalized, promptIds] of expected) {
      expect(normalizeMomoStatus(rawStatus)).toBe(normalized);
      const feed = resolveMomoAudioFeed(rawStatus, undefined, "en");
      expect(feed.normalizedStatus).toBe(normalized);
      expect(feed.promptIds).toEqual(promptIds);
      expect(feed.prompts).toHaveLength(promptIds.length);
      expect(feed.spokenTexts.every(Boolean)).toBe(true);
      expect(feed.voiceXml).not.toContain("[");
      if (normalized === "UNKNOWN") {
        expect(feed.statusDescription).toContain("could not verify");
      }
    }
  });
});
