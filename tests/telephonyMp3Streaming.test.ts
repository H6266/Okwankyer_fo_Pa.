import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/serverApp";
import { resolveSafeAudioPath, getOrTranscodeMp3 } from "../src/audio/streaming";
import fs from "fs";

describe("Telephony MP3 Transcoding & Playback", () => {
  it("resolves safe audio path when requesting .mp3 for an .m4a studio recording", () => {
    const safePath = resolveSafeAudioPath("supplied/Twi/1.Welcome & Session Start/Language selection.mp3");
    expect(safePath).not.toBeNull();
    expect(fs.existsSync(safePath!)).toBe(true);
    expect(safePath).toMatch(/\.m4a$/i);
  });

  it("transcodes .m4a to standard .mp3 and caches the result", async () => {
    const sourcePath = resolveSafeAudioPath("supplied/Twi/1.Welcome & Session Start/Language selection.m4a")!;
    const mp3Path = await getOrTranscodeMp3(sourcePath);
    expect(fs.existsSync(mp3Path)).toBe(true);
    expect(mp3Path).toMatch(/\.mp3$/i);
    expect(fs.statSync(mp3Path).size).toBeGreaterThan(1000);
  });

  it("streams .mp3 audio with audio/mpeg content type over HTTP", async () => {
    const res = await request(app)
      .get("/audio/supplied/Twi/1.Welcome%20%26%20Session%20Start/Language%20selection.mp3")
      .expect(200);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
  });

  it("produces valid Africa's Talking VoiceXML on inbound call with GetDigits and .mp3 URLs", async () => {
    const res = await request(app)
      .post("/voice-menu")
      .send({
        sessionId: "at_test_session_123",
        callerNumber: "+233543546010",
        isActive: "1",
      })
      .expect(200);

    const xml = res.text;
    expect(xml).toContain("<Response>");
    expect(xml).toContain("<GetDigits");
    expect(xml).toContain("callbackUrl=");
    expect(xml).toContain("/language-selection?sessionId=at_test_session_123");
    // Verify it plays MP3 audio for Africa's Talking compatibility
    expect(xml).toContain(".mp3");
    expect(xml).not.toContain(".m4a");
    // Verify no bare <Redirect> cutting off audio
    expect(xml).not.toMatch(/<\/GetDigits>\s*<Redirect>/);
  });
});
