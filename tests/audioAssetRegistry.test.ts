import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists } from "../src/audio/catalog";
import { resolvePrompt, resolveSimulatorAudioUrl } from "../src/modules/ttsService";
import { matchReplyToAudio } from "../src/audio/replyAudioMatcher";

describe("canonical audio asset registry", () => {
  it("inventories exact recording paths from the current audio roots", () => {
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(AUDIO_RECORDINGS.length);
    expect(AUDIO_ASSET_INVENTORY.length).toBeGreaterThan(0);
    expect(AUDIO_RECORDINGS.every((recording) => !recording.audioVerified)).toBe(true);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      expect(asset.url).toMatch(/^\/audio\//);
    }
  });

  it("uses language-specific text fallback until audio is reviewed", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/api/audio/prompt-tts/en/OP01");
    expect(resolvePrompt("welcome", "twi")).toBe("/api/audio/prompt-tts/twi/OP01");
    expect(resolvePrompt("OP07", "en")).toBe("/api/audio/prompt-tts/en/OP07");
    expect(resolvePrompt("OP07", "twi")).toBe("/api/audio/prompt-tts/twi/OP07");

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg|aac)$/);
    }
  });

  it("keeps unreviewed and dynamic recordings out of fixed prompt playback", () => {
    expect(getRecordingByPromptId("OP20", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP07", "twi")).not.toBeNull();
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath))
      .toContain("Twi_library/Recipient_verify.m4a");
    expect(resolveSimulatorAudioUrl("/audio/welcome_en.mp3", "en"))
      .toBe("/api/audio/prompt-tts/en/OP01");
    expect(matchReplyToAudio("Completely unknown arbitrary prompt text that has no recording", "twi").match).toBe(false);
  });

  it("links the English Library service, network, and PIN warning clips to their canonical prompts", () => {
    const expected = [
      ["OP07", "English_Library/2.m4a"],
      ["OP08", "English_Library/3.m4a"],
      ["OP41", "English_Library/4.m4a"],
    ] as const;
    const expectedTts = ["OP07", "OP08", "OP41"];

    for (const [index, [promptId, relativePath]] of expected.entries()) {
      const recording = getRecordingByPromptId(promptId, "en");
      expect(recording?.relativePath).toBe(relativePath);
      expect(recording?.url).toBe(`/audio/${relativePath}`);
      expect(recording?.audioVerified).toBe(false);
      expect(audioFileExists(relativePath, "supplied")).toBe(true);
      expect(resolvePrompt(promptId, "en")).toBe(`/api/audio/prompt-tts/en/${expectedTts[index]}`);
    }
  });
});
