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

  it("streams approved English M4A recordings without relabeling them as MP3", async () => {
    const res = await request(app)
      .get("/audio/English_Library/2.m4a")
      .expect(200);

    expect(res.headers["content-type"]).toBe("audio/mp4");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
  });

  it("streams Twi recordings with their actual M4A container type when named .mp3", async () => {
    const filenames = [
      "Network_selection.mp3",
      "Service_notready.mp3",
      "MTN menu.mp3",
      "Choose instead.mp3",
      "Service_selection.mp3",
      "Service_alternative.mp3",
    ];

    for (const filename of filenames) {
      const res = await request(app)
        .get(`/audio/Twi/${encodeURIComponent(filename)}`)
        .expect(200);

      expect(res.headers["content-type"]).toBe("audio/mp4");
      expect(Number(res.headers["content-length"])).toBeGreaterThan(1000);
      expect(res.body.toString("ascii", 4, 8)).toBe("ftyp");
    }
  });

  it("transcodes the mislabeled Twi recordings to MP3 for telephony", async () => {
    const filenames = [
      "Network_selection.mp3",
      "Service_notready.mp3",
      "MTN menu.mp3",
      "Choose instead.mp3",
      "Service_selection.mp3",
      "Service_alternative.mp3",
    ];

    for (const filename of filenames) {
      const res = await request(app)
        .get(`/audio/Twi/${encodeURIComponent(filename)}?format=mp3`)
        .expect(200);

      expect(res.headers["content-type"]).toBe("audio/mpeg");
      expect(res.body.toString("ascii", 0, 3) === "ID3" || (res.body[0] === 0xff && (res.body[1] & 0xe0) === 0xe0)).toBe(true);
    }
  });

  it("returns valid byte-range headers and payload for transcoded MP3", async () => {
    const res = await request(app)
      .get("/audio/English_Library/2.mp3?format=mp3")
      .set("Range", "bytes=0-99")
      .expect(206);

    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
    expect(Number(res.headers["content-length"])).toBe(100);
    expect(res.body).toHaveLength(100);
  });

  it("resolves canonical Twi URLs to the approved Twi library files", () => {
    expect(resolveSafeAudioPath("Twi/Recipient_verify.mp3")).toMatch(/Audio_files\/Twi_library\/Recipient_verify\.mp3$/);
    expect(resolveSafeAudioPath("Twi_library/Recipient_verify.mp3")).toMatch(/Audio_files\/Twi_library\/Recipient_verify\.mp3$/);
  });

  it("plays the approved Twi welcome recording in the inbound IVR flow", async () => {
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
    expect(xml).toContain("<Play");
    expect(xml).toContain("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
    expect(xml).not.toContain("Twi audio is unavailable");
    expect(xml).not.toContain("<Say");
    expect(xml).not.toContain(".m4a");
  });
});
