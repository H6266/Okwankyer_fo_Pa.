import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingByPromptKey,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists } from "../src/audio/catalog";
import { resolvePrompt, resolvePromptXml, resolveSimulatorAudioUrl } from "../src/modules/ttsService";
import { matchReplyToAudio } from "../src/audio/replyAudioMatcher";
import { resolveSafeAudioPath } from "../src/audio/streaming";
import { getRecordingFilePath } from "../src/audio/recordingRegistry";
import fs from "fs";
import path from "path";

describe("canonical audio asset registry", () => {
  it("inventories exact recording paths from the current audio roots", () => {
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(94);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "supplied")).toHaveLength(92);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "public")).toHaveLength(2);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "additional")).toHaveLength(0);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(asset.url).toMatch(/^\/audio\//);
      if (asset.filename.startsWith("English_Library/")) {
        expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      }
    }
    expect(AUDIO_RECORDINGS.filter((asset) => asset.language === "twi" && asset.audioVerified)
      .every((asset) => audioFileExists(asset.relativePath, asset.assetRoot))).toBe(true);
    expect(getRecordingByPromptId("OP27", "twi")).toBeNull();
  });

  it("uses language-specific text fallback until audio is reviewed", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/api/audio/prompt-tts/en/welcome");
    expect(resolvePrompt("welcome", "twi")).toBe("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
    expect(resolvePrompt("OP07", "en")).toBe("/api/audio/prompt-tts/en/OP07");
    expect(resolvePrompt("OP07", "twi")).toBe("/audio/Twi/Service_selection.mp3");

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg|aac)$/);
    }
  });

  it("keeps unreviewed and dynamic recordings out of fixed prompt playback", () => {
    expect(getRecordingByPromptId("OP20", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP07", "twi")).not.toBeNull();
    expect(getRecordingsByPromptId("OP19", "twi").some(
      (recording) => recording.relativePath === "Twi_library/Recipient_verify.mp3"
    )).toBe(true);
    expect(AUDIO_RECORDINGS.filter((recording) => recording.assetRoot === "additional")).toHaveLength(0);
    expect(AUDIO_RECORDINGS.filter((recording) => recording.recordingRole === "unmapped")
      .every((recording) => recording.promptId === null)).toBe(true);
    expect(resolveSimulatorAudioUrl("/audio/Welcome_prompt_01.mp3", "en")).toBeNull();
    expect(matchReplyToAudio("Completely unknown arbitrary prompt text that has no recording", "twi").match).toBe(false);
  });

  it("maps canonical Twi URLs to the approved recordings in the existing library", () => {
    const twiRecording = getRecordingsByPromptId("OP19", "twi")[0];
    expect(twiRecording?.legacyRelativePath).toBe("Twi_library/Recipient_verify.mp3");
    expect(getRecordingFilePath(twiRecording.relativePath)).toBe(
      "Audio_files/Twi_library/Recipient_verify.mp3"
    );
    expect(resolveSafeAudioPath("Twi/Recipient_verify.mp3")).toMatch(/Audio_files\/Twi_library\/Recipient_verify\.mp3$/);
    expect(fs.existsSync(path.resolve("Audio_files", "audio", "Twi"))).toBe(false);
    expect(fs.existsSync(path.resolve("Audio_files", "Twi_library", "Recipient_verify.mp3"))).toBe(true);
  });

  it("links approved English recordings to their canonical prompts", () => {
    const expected = [
      ["OP07", "English_Library/2.m4a"],
      ["OP08", "English_Library/3.m4a"],
      ["OP41", "English_Library/4.m4a"],
    ] as const;
    for (const [index, [promptId, relativePath]] of expected.entries()) {
      const recording = getRecordingsByPromptId(promptId, "en")[0];
      expect(recording?.relativePath).toBe(relativePath);
      expect(recording?.url).toBe(`/audio/${relativePath}`);
      expect(recording?.audioVerified).toBe(true);
      expect(audioFileExists(relativePath, "supplied")).toBe(true);
      expect(resolvePrompt(promptId, "en")).toBe(`/audio/${relativePath}`);
    }
  });
});
