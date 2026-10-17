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
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(156);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "supplied")).toHaveLength(98);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "public")).toHaveLength(4);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "additional")).toHaveLength(54);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      expect(asset.url).toMatch(/^\/audio\//);
    }
  });

  it("uses language-specific text fallback until audio is reviewed", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/api/audio/prompt-tts/en/welcome");
    expect(resolvePrompt("welcome", "twi")).toContain("Welcome%201%20(2).m4a");
    expect(resolvePrompt("OP07", "en")).toBe("/api/audio/prompt-tts/en/OP07");
    expect(resolvePrompt("OP07", "twi")).toContain("Service%20selection.m4a");

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg|aac)$/);
    }
  });

  it("keeps unreviewed and dynamic recordings out of fixed prompt playback", () => {
    expect(getRecordingByPromptId("OP20", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP07", "twi")).not.toBeNull();
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath)).toContain(
      "Twi/3.Recipient Entry & Verification/Recipient verify.m4a"
    );
    expect(AUDIO_RECORDINGS.filter((recording) => recording.assetRoot === "additional")
      .every((recording) => recording.language === "twi" && recording.promptId !== null)).toBe(true);
    expect(resolveSimulatorAudioUrl("/audio/Welcome_prompt_01.mp3", "en")).toBe("/audio/Welcome_prompt_01.mp3");
    expect(matchReplyToAudio("Completely unknown arbitrary prompt text that has no recording", "twi").match).toBe(false);
  });
});
