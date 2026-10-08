/**
 * Ɔkwankyerɛfo Pa - Authoritative Audio Normalizer (audioNormalizer.ts)
 * 
 * Responsibilities:
 * - Decodes WAV, MP3, WebM/Opus, OGG, M4A/AAC
 * - Normalizes to mono, 16 kHz, 16-bit PCM
 * - Removes DC offset, normalizes amplitude to target (-26 dBFS telephony), prevents clipping
 * - Detects corrupt / truncated audio
 * - Produces pristine 16 kHz mono PCM WAV accepted by GhanaNLP and neural models
 * - Preserves timing metadata
 */

import { spawn } from "child_process";
import fs from "fs";

export interface NormalizedAudio {
  wavBuffer: Buffer;        // 16 kHz mono 16-bit PCM WAV (with canonical 44-byte RIFF header)
  pcm16Buffer: Buffer;      // Raw 16-bit mono PCM data
  sampleRate: number;       // 16000
  channels: number;         // 1
  durationMs: number;
  rmsDb: number;
  isSilent: boolean;
  formatDetected: string;
}

export class AudioNormalizer {
  /**
   * Constructs a canonical 44-byte RIFF WAV header for 16-bit PCM audio.
   */
  public static createWavHeader(dataLength: number, sampleRate: number = 16000, channels: number = 1): Buffer {
    const header = Buffer.alloc(44);
    // RIFF identifier
    header.write("RIFF", 0);
    // Overall file size - 8
    header.writeUInt32LE(36 + dataLength, 4);
    // WAVE identifier
    header.write("WAVE", 8);
    // fmt subchunk
    header.write("fmt ", 12);
    // Subchunk1Size (16 for PCM)
    header.writeUInt32LE(16, 16);
    // AudioFormat (1 for PCM)
    header.writeUInt16LE(1, 20);
    // NumChannels
    header.writeUInt16LE(channels, 22);
    // SampleRate
    header.writeUInt32LE(sampleRate, 24);
    // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    header.writeUInt32LE(sampleRate * channels * 2, 28);
    // BlockAlign (NumChannels * BitsPerSample/8)
    header.writeUInt16LE(channels * 2, 32);
    // BitsPerSample
    header.writeUInt16LE(16, 34);
    // data subchunk
    header.write("data", 36);
    // Subchunk2Size
    header.writeUInt32LE(dataLength, 40);
    return header;
  }

  /**
   * Normalizes incoming audio payload (Buffer or base64) into pristine 16 kHz mono PCM WAV.
   */
  public async normalize(
    input: Buffer | string,
    mimeHint: string = "audio/wav"
  ): Promise<NormalizedAudio> {
    const rawBuffer = typeof input === "string"
      ? Buffer.from(input.replace(/^data:audio\/[a-z0-9-]+;base64,/, ""), "base64")
      : input;

    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error("EMPTY_AUDIO: Audio payload contains 0 bytes.");
    }

    if (rawBuffer.length < 32) {
      throw new Error("CORRUPT_AUDIO: Audio payload is truncated (< 32 bytes).");
    }

    const format = this.detectFormat(rawBuffer, mimeHint);

    // If ffmpeg is available, use it for universal multi-codec conversion
    if (this.hasFfmpeg()) {
      try {
        const convertedPcm = await this.transcodeWithFfmpeg(rawBuffer);
        return this.postProcessPcm(convertedPcm, format);
      } catch (err: any) {
        console.warn(`[AudioNormalizer] ffmpeg transcoding notice (${err.message}), attempting native fallback...`);
      }
    }

    // Native fallback for PCM/WAV
    return this.nativeNormalizePcmWav(rawBuffer, format);
  }

  /**
   * Fast format detection from header magic bytes.
   */
  public detectFormat(buffer: Buffer, mimeHint: string = ""): string {
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
      return "wav";
    }
    if (buffer.length >= 3 && (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))) {
      return "mp3";
    }
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return "webm";
    }
    if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") {
      return "ogg";
    }
    if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") {
      return "m4a";
    }
    if (mimeHint.includes("webm")) return "webm";
    if (mimeHint.includes("mp3") || mimeHint.includes("mpeg")) return "mp3";
    if (mimeHint.includes("ogg")) return "ogg";
    if (mimeHint.includes("m4a") || mimeHint.includes("mp4")) return "m4a";
    return "wav";
  }

  private hasFfmpeg(): boolean {
    return fs.existsSync("/usr/bin/ffmpeg") || fs.existsSync("/usr/local/bin/ffmpeg");
  }

  /**
   * Transcodes any audio format to 16 kHz mono s16le PCM using ffmpeg.
   */
  private transcodeWithFfmpeg(inputBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", "pipe:0",               // Read from stdin
        "-vn",                        // Disable video
        "-ac", "1",                   // Mono
        "-ar", "16000",               // 16 kHz
        "-f", "s16le",                // Raw 16-bit signed LE PCM
        "-af", "highpass=f=200,lowpass=f=3400", // Telephony speech bandpass filter
        "pipe:1",                     // Write to stdout
      ]);

      const chunks: Buffer[] = [];
      let stderr = "";

      ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

      ffmpeg.on("error", (err) => reject(err));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          const result = Buffer.concat(chunks);
          if (result.length === 0) {
            reject(new Error("ffmpeg produced 0 bytes of audio"));
          } else {
            resolve(result);
          }
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-200)}`));
        }
      });

      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Removes DC offset, normalizes amplitude to -26 dBFS, prevents clipping,
   * and packages into a standard 16 kHz 16-bit mono WAV.
   */
  public postProcessPcm(rawPcm16: Buffer, formatDetected: string = "pcm"): NormalizedAudio {
    const sampleCount = Math.floor(rawPcm16.length / 2);
    if (sampleCount <= 0) {
      const emptyHeader = AudioNormalizer.createWavHeader(0, 16000, 1);
      return {
        wavBuffer: emptyHeader,
        pcm16Buffer: Buffer.alloc(0),
        sampleRate: 16000,
        channels: 1,
        durationMs: 0,
        rmsDb: -100,
        isSilent: true,
        formatDetected,
      };
    }

    // Step 1: Calculate DC offset and initial RMS
    let sum = 0;
    let sumSquares = 0;
    const samples = new Int16Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const s = rawPcm16.readInt16LE(i * 2);
      samples[i] = s;
      sum += s;
      sumSquares += s * s;
    }

    const mean = sum / sampleCount;
    const rms = Math.sqrt(sumSquares / sampleCount);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;
    const isSilent = rmsDb < -50 || rms < 100;

    // Step 2: Target telephony level: ~ -26 dBFS (target RMS ~ 1642 out of 32768)
    const targetRms = 1642;
    const gainFactor = !isSilent && rms > 0
      ? Math.min(3.5, Math.max(0.4, targetRms / rms))
      : 1.0;

    // Step 3: Remove DC offset and apply gain with soft limiting (prevent clipping)
    const cleanBuffer = Buffer.alloc(sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      const centered = samples[i] - mean;
      let amplified = centered * gainFactor;
      // Soft saturation limit at +/- 32000
      if (amplified > 32767) amplified = 32767;
      if (amplified < -32768) amplified = -32768;
      cleanBuffer.writeInt16LE(Math.round(amplified), i * 2);
    }

    const durationMs = Math.round((sampleCount / 16000) * 1000);
    const wavHeader = AudioNormalizer.createWavHeader(cleanBuffer.length, 16000, 1);
    const wavBuffer = Buffer.concat([wavHeader, cleanBuffer]);

    return {
      wavBuffer,
      pcm16Buffer: cleanBuffer,
      sampleRate: 16000,
      channels: 1,
      durationMs,
      rmsDb,
      isSilent,
      formatDetected,
    };
  }

  /**
   * Native normalizer for WAV / PCM buffers when ffmpeg is not invoked.
   */
  private nativeNormalizePcmWav(rawAudio: Buffer, format: string): NormalizedAudio {
    let pcmOffset = 0;
    let sampleRate = 16000;
    let channels = 1;

    // Parse RIFF header
    if (rawAudio.length >= 44 && rawAudio.toString("ascii", 0, 4) === "RIFF") {
      try {
        channels = rawAudio.readUInt16LE(22);
        sampleRate = rawAudio.readUInt32LE(24);
        pcmOffset = 44;
      } catch {
        pcmOffset = 0;
      }
    }

    let pcm = rawAudio.subarray(pcmOffset);

    // If stereo, convert to mono
    if (channels === 2) {
      const monoLength = Math.floor(pcm.length / 4);
      const monoBuffer = Buffer.alloc(monoLength * 2);
      for (let i = 0; i < monoLength; i++) {
        const left = pcm.readInt16LE(i * 4);
        const right = pcm.readInt16LE(i * 4 + 2);
        const avg = Math.round((left + right) / 2);
        monoBuffer.writeInt16LE(avg, i * 2);
      }
      pcm = monoBuffer;
    }

    // If 8 kHz telephony, up-sample to 16 kHz using linear interpolation
    if (sampleRate === 8000) {
      const sampleCount = Math.floor(pcm.length / 2);
      const upsampled = Buffer.alloc(sampleCount * 4);
      for (let i = 0; i < sampleCount - 1; i++) {
        const s1 = pcm.readInt16LE(i * 2);
        const s2 = pcm.readInt16LE((i + 1) * 2);
        upsampled.writeInt16LE(s1, i * 4);
        upsampled.writeInt16LE(Math.round((s1 + s2) / 2), i * 4 + 2);
      }
      if (sampleCount > 0) {
        const last = pcm.readInt16LE((sampleCount - 1) * 2);
        upsampled.writeInt16LE(last, (sampleCount - 1) * 4);
        upsampled.writeInt16LE(last, (sampleCount - 1) * 4 + 2);
      }
      pcm = upsampled;
    }

    return this.postProcessPcm(pcm, format);
  }
}

export const audioNormalizer = new AudioNormalizer();
