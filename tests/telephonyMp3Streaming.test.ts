import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/serverApp";
import { resolveSafeAudioPath, getOrTranscodeMp3 } from "../src/audio/streaming";
import fs from "fs";

describe("Telephony MP3 Transcoding & Playback", () => {
  it("resolves safe audio path when requesting studio recording", () => {
    const safePath = resolveSafeAudioPath("English_Library/2.mp3");
    expect(safePath).not.toBeNull();
    expect(fs.existsSync(safePath!)).toBe(true);
    expect(safePath).toMatch(/Audio_files\/English_Library\/2\.m4a$/i);
  });

  it("transcodes M4A to actual MP3 bytes and caches the result", async () => {
    const sourcePath = resolveSafeAudioPath("English_Library/2.mp3")!;
    const mp3Path = await getOrTranscodeMp3(sourcePath);
    expect(fs.existsSync(mp3Path)).toBe(true);
    expect(mp3Path).toMatch(/\.mp3$/i);
    expect(fs.statSync(mp3Path).size).toBeGreaterThan(1000);
    const bytes = fs.readFileSync(mp3Path);
    expect(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)).toBe(true);
  });

  it("streams .mp3 audio with audio/mpeg content type over HTTP", async () => {
    const res = await request(app)
      .get("/audio/English_Library/2.mp3?format=mp3")
      .expect(200);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
    expect(res.body[0] === 0xff || res.body.toString("ascii", 0, 3) === "ID3").toBe(true);
  });

  it("streams the approved Twi recordings from the canonical playback URL", async () => {
    const res = await request(app)
      .get("/audio/Twi/Recipient_verify.mp3")
      .expect(200);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
  });

  it("produces AT-compatible VoiceXML on inbound call and keeps audio assets MP3-compatible", async () => {
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
    expect(xml).toContain("sessionId=at_test_session_123");
    expect(xml.match(/Opening_voice_welcome_to_okwankyerefopa\.mp3/g)).toHaveLength(1);
    expect(xml).toContain("/api/audio/prompt-tts/en/language_selection");
    // Verify no bare <Redirect> cutting off audio
    expect(xml).not.toMatch(/<\/GetDigits>\s*<Redirect>/);
  });
});
