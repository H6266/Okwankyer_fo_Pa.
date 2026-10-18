import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists } from "../src/audio/catalog";
import { resolvePrompt, resolveSimulatorAudioUrl } from "../src/modules/ttsService";
import { matchReplyToAudio } from "../src/audio/replyAudioMatcher";
import { resolveSafeAudioPath } from "../src/audio/streaming";
import { getRecordingFilePath } from "../src/audio/recordingRegistry";
import fs from "fs";
import path from "path";

describe("canonical audio asset registry", () => {
  it("inventories exact recording paths from the current audio roots", () => {
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(AUDIO_RECORDINGS.length);
    expect(AUDIO_ASSET_INVENTORY.length).toBeGreaterThan(0);
    expect(AUDIO_RECORDINGS.every((recording) => !recording.audioVerified)).toBe(true);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(asset.url).toMatch(/^\/audio\//);
      if (asset.filename.startsWith("English_Library/")) {
        expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      }
    }
    expect(AUDIO_RECORDINGS.filter((asset) => asset.language === "twi")
      .every((asset) => !audioFileExists(asset.filename, asset.assetRoot))).toBe(true);
  });

  it("keeps unverified fixed prompts out of runtime audio and TTS", () => {
    expect(resolvePrompt("welcome", "en")).toBeNull();
    expect(resolvePrompt("welcome", "twi")).toBeNull();
    expect(resolvePrompt("OP07", "en")).toBeNull();
    expect(resolvePrompt("OP07", "twi")).toBeNull();

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg|aac)$/);
    }
  });

  it("keeps unreviewed and dynamic recordings out of fixed prompt playback", () => {
    expect(getRecordingByPromptId("OP20", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP07", "twi")).toBeNull();
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath))
      .toContain("Twi/Recipient_verify.mp3");
    expect(resolveSimulatorAudioUrl("/audio/welcome_en.mp3", "en")).toBeNull();
    expect(matchReplyToAudio("Completely unknown arbitrary prompt text that has no recording", "twi").match).toBe(false);
  });

  it("maps canonical Twi URLs only to the intended canonical directory and reports missing assets", () => {
    const twiRecording = getRecordingsByPromptId("OP19", "twi")[0];
    expect(twiRecording?.legacyRelativePath).toBe("Twi_library/Recipient_verify.mp3");
    expect(getRecordingFilePath(twiRecording.relativePath)).toBe(
      "Audio_files/audio/Twi/Recipient_verify.mp3"
    );
    expect(resolveSafeAudioPath("Twi/Recipient_verify.mp3")).toBeNull();
    expect(fs.existsSync(path.resolve("Audio_files", "audio", "Twi"))).toBe(false);
    expect(fs.existsSync(path.resolve("Audio_files", "Twi_library", "Recipient_verify.mp3"))).toBe(true);
  });

  it("links English candidates to canonical prompts without treating them as verified audio", () => {
    const expected = [
      ["OP07", "English_Library/2.m4a"],
      ["OP08", "English_Library/3.m4a"],
      ["OP41", "English_Library/4.m4a"],
    ] as const;
    for (const [index, [promptId, relativePath]] of expected.entries()) {
      const recording = getRecordingsByPromptId(promptId, "en")[0];
      expect(recording?.relativePath).toBe(relativePath);
      expect(recording?.url).toBe(`/audio/${relativePath}`);
      expect(recording?.audioVerified).toBe(false);
      expect(audioFileExists(relativePath, "supplied")).toBe(true);
      expect(resolvePrompt(promptId, "en")).toBeNull();
    }
  });
});
