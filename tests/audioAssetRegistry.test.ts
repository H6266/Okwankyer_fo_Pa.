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
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(91);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "supplied")).toHaveLength(89);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "public")).toHaveLength(2);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "additional")).toHaveLength(0);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      expect(asset.url).toMatch(/^\/audio\//);
    }
  });

  it("uses language-specific text fallback until audio is reviewed", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/api/audio/prompt-tts/en/welcome");
    expect(resolvePrompt("welcome", "twi")).toBe("/audio/Twi_library/Opening_voice_welcome_to_okwankyerefopa.mp3");
    expect(resolvePrompt("OP07", "en")).toBe("/api/audio/prompt-tts/en/OP07");
    expect(resolvePrompt("OP07", "twi")).toBe("/audio/Twi_library/Service_selection.mp3");

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
    expect(resolveSimulatorAudioUrl("/audio/Welcome_prompt_01.mp3", "en")).toBe("/audio/Welcome_prompt_01.mp3");
    expect(matchReplyToAudio("Completely unknown arbitrary prompt text that has no recording", "twi").match).toBe(false);
  });
});
