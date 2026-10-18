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
      .get("/audio/English_Library/2.mp3")
      .expect(200);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
    expect(res.body[0] === 0xff || res.body.toString("ascii", 0, 3) === "ID3").toBe(true);
  });

  it("returns valid byte-range headers and payload for transcoded MP3", async () => {
    const res = await request(app)
      .get("/audio/English_Library/2.mp3")
      .set("Range", "bytes=0-99")
      .expect(206);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
    expect(Number(res.headers["content-length"])).toBe(100);
    expect(res.body).toHaveLength(100);
  });

  it("does not resolve legacy Twi files as runtime audio", () => {
    expect(resolveSafeAudioPath("Twi/Recipient_verify.mp3")).toBeNull();
    expect(resolveSafeAudioPath("Twi_library/Recipient_verify.mp3")).toBeNull();
  });

  it("uses a clear recovery when the requested Twi welcome recording is unavailable", async () => {
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
    expect(xml).toContain("Twi audio is unavailable");
    expect(xml).not.toContain("<Play");
    expect(xml).not.toContain("Twi_library");
    expect(xml).not.toContain(".m4a");
  });
});
