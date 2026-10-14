import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists } from "../src/audio/catalog";
import { resolvePrompt, resolveSimulatorAudioUrl } from "../src/modules/ttsService";

describe("canonical audio asset registry", () => {
  it("inventories recordings strictly from Audio_files, Audio_files_2, and public welcome", () => {
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(97);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "supplied")).toHaveLength(41);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "public")).toHaveLength(2);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "additional")).toHaveLength(54);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      expect(asset.url).toMatch(/^\/audio\//);
    }
  });

  it("resolves both language variants to safe existing URLs and preserves MIME type", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/audio/Welcome_prompt_01.mp3");
    expect(resolvePrompt("welcome", "twi")).toBe(
      "/audio/supplied/Twi/01_Welcome_Session_Start/Welcome%201.m4a"
    );
    expect(resolvePrompt("OP07", "en")).toBe("/api/audio/prompt-tts/en/OP07");
    expect(resolvePrompt("OP07", "twi")).toBe(
      "/audio/supplied/Twi/02_Main_Service_Navigation/Service%20selection.m4a"
    );

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg)$/);
    }
  });

  it("uses manifest identity and role metadata, with all additional recordings linked to Twi prompts", () => {
    expect(getRecordingByPromptId("OP20", "twi")?.recordingRole).toBe("dynamic");
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath)).toContain(
      "Twi/03_Recipient_Entry_Verification/Recipient verify.m4a"
    );
    expect(AUDIO_RECORDINGS.filter((recording) => recording.assetRoot === "additional")
      .every((recording) => recording.language === "twi" && recording.promptId !== null)).toBe(true);
    expect(resolveSimulatorAudioUrl("/audio/Welcome_prompt_01.mp3", "en")).toBe(
      "/audio/Welcome_prompt_01.mp3"
    );
  });
});
