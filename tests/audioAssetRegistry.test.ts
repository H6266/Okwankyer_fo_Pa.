import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists } from "../src/audio/catalog";
import { resolvePrompt, resolveSimulatorAudioUrl } from "../src/modules/ttsService";

describe("canonical audio asset registry", () => {
  it("inventories every recording across supplied, legacy public, and unresolved additional folders", () => {
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(123);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "supplied")).toHaveLength(40);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "public")).toHaveLength(29);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.assetRoot === "additional")).toHaveLength(54);
    expect(AUDIO_ASSET_INVENTORY.filter((asset) => asset.language === "unresolved")).toHaveLength(56);

    for (const asset of AUDIO_ASSET_INVENTORY) {
      expect(audioFileExists(asset.filename, asset.assetRoot), asset.filename).toBe(true);
      if (asset.language === "unresolved") {
        expect(asset.promptId).toBeNull();
        expect(asset.url).toBeNull();
      } else {
        expect(asset.url).toMatch(/^\/audio\//);
      }
    }
  });

  it("resolves both language variants to safe existing URLs and preserves MIME type", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/audio/English/Welcome_prompt_01.mp3");
    expect(resolvePrompt("welcome", "twi")).toBe(
      "/audio/supplied/Twi/01_Welcome_Session_Start/Welcome%201.m4a"
    );
    expect(resolvePrompt("OP07", "en")).toBe("/audio/English/Audio_prompt_07.mp3");
    expect(resolvePrompt("OP07", "twi")).toBe(
      "/audio/supplied/Twi/02_Main_Service_Navigation/Service%20selection.m4a"
    );

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg)$/);
    }
  });

  it("uses manifest identity and role metadata, while leaving ambiguous legacy takes unmapped", () => {
    expect(getRecordingByPromptId("OP20", "twi")?.recordingRole).toBe("dynamic");
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath)).toContain(
      "Twi/03_Recipient_Entry_Verification/Recipient verify.m4a"
    );
    expect(AUDIO_RECORDINGS.filter((recording) => recording.assetRoot === "additional")
      .every((recording) => recording.language === "unresolved" && recording.promptId === null)).toBe(true);
    expect(resolveSimulatorAudioUrl("/audio/English/Audio_prompt_06.mp3", "en")).toBe(
      "/audio/English/Audio_prompt_06.mp3"
    );
    expect(resolveSimulatorAudioUrl("/audio/English/Audio_prompt_06.mp3", "twi")).toBeNull();
  });
});
