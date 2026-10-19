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
    expect(AUDIO_ASSET_INVENTORY).toHaveLength(AUDIO_RECORDINGS.length);
    expect(AUDIO_ASSET_INVENTORY.length).toBeGreaterThan(0);
    expect(AUDIO_RECORDINGS.filter((recording) =>
      recording.id.startsWith("supplied:Twi_library/") && recording.recordingRole === "fixed"
    ).every((recording) => recording.audioVerified)).toBe(true);
    expect(AUDIO_RECORDINGS.filter((recording) => recording.recordingRole === "dynamic")
      .every((recording) => !recording.audioVerified)).toBe(true);
    expect(AUDIO_RECORDINGS.filter((recording) => recording.language === "en")
      .every((recording) => recording.audioVerified)).toBe(true);

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

  it("plays approved fixed recordings in English and Twi without fixed-prompt TTS", () => {
    expect(resolvePrompt("welcome", "en")).toBe("/audio/welcome_en.mp3");
    expect(resolvePrompt("welcome", "twi")).toBe("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
    expect(resolvePrompt("OP07", "en")).toBe("/audio/English_Library/2.m4a");
    expect(resolvePrompt("OP07", "twi")).toBe("/audio/Twi/Service_selection.mp3");
    expect(resolvePrompt("supported_service_select", "twi")).toBe("/audio/Twi/Service_selection.mp3");
    expect(resolvePromptXml("supported_service_select", "twi", "https://example.test"))
      .toContain('<Play url="https://example.test/audio/Twi/Service_selection.mp3?format=mp3"/>');

    for (const recording of AUDIO_CATALOG) {
      expect(recording.url).not.toMatch(/(?:null|undefined|\/)$/);
      expect(recording.mimeType).toMatch(/^audio\/(?:mp4|mpeg|aac)$/);
    }
  });

  it("keeps unreviewed and dynamic recordings out of fixed prompt playback", () => {
    expect(getRecordingByPromptId("OP20", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP29", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP35", "twi")).toBeNull();
    expect(getRecordingByPromptId("OP70", "twi")).toBeNull();
    expect(getRecordingByPromptKey("amount_readback", "twi")).toBeNull();
    expect(resolvePrompt("amount_readback", "twi")).toBe("/api/audio/prompt-tts/twi/OP29");
    expect(getRecordingByPromptId("OP07", "twi")?.audioVerified).toBe(true);
    expect(getRecordingByPromptId("OP22", "twi")?.title).toBe("Recipient_confirm_speech");
    expect(getRecordingByPromptId("OP34", "twi")?.title).toBe("Review transaction");
    expect(getRecordingByPromptId("OP44", "twi")?.title).toBe("Security_warning");
    expect(getRecordingByPromptId("OP48", "twi")?.title).toBe("Authorize_phone");
    expect(getRecordingByPromptId("OP51", "twi")?.title).toBe("Processing");
    expect(getRecordingByPromptId("OP62", "twi")?.title).toBe("Check_messages");
    expect(getRecordingByPromptId("OP66", "twi")?.title).toBe("Please_respond");
    expect(getRecordingByPromptId("OP47", "twi")?.title).toBe("Check phone");
    expect(getRecordingsByPromptId("OP19", "twi").map((recording) => recording.relativePath))
      .toContain("Twi/Recipient_verify.mp3");
    expect(resolveSimulatorAudioUrl("/audio/welcome_en.mp3", "en")).toBe("/audio/welcome_en.mp3");
    expect(resolveSimulatorAudioUrl("/audio/English_Library/2.m4a", "en"))
      .toBe("/audio/English_Library/2.m4a");
    expect(resolveSimulatorAudioUrl("/audio/Twi/Recipient_verify.mp3", "twi"))
      .toBe("/audio/Twi/Recipient_verify.mp3");
    expect(resolveSimulatorAudioUrl("/audio/Twi/Recipient_verify.mp3", "en")).toBeNull();
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

  it("maps the recorded PIN handoff clip to the canonical OP40 prompt", () => {
    const pinHandoff = getRecordingByPromptKey("pin_handoff", "twi");
    expect(pinHandoff?.audioVerified).toBe(true);
    expect(resolveSafeAudioPath(pinHandoff?.url || ""))
      .toMatch(/Audio_files\/Twi_library\/Pin_Handoff\.mp3$/);
    const resolvedPrompt = resolvePrompt("pin_handoff", "twi");
    expect(resolveSafeAudioPath(resolvedPrompt || "")).toBe(
      resolveSafeAudioPath("/audio/Twi_library/Pin_Handoff.mp3")
    );
    expect(resolvePromptXml("pin_handoff", "twi", "https://example.test"))
      .toContain("Pin_Handoff.mp3?format=mp3");
    expect(resolveSafeAudioPath("Twi/Pin_Handoff.mp3"))
      .toMatch(/Audio_files\/Twi_library\/Pin_Handoff\.mp3$/);
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
