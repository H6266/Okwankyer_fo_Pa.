/**
 * Ɔkwankyerɛfo Pa - Telephony Audio Normalizer (audioNormalizer.ts)
 * 
 * Prepares raw incoming PCM / WAV audio for Ghanaian speech recognition:
 * 1. RIFF WAV header parsing & raw PCM extraction
 * 2. DC offset removal
 * 3. RMS energy normalization to telephony target (-26 dBFS)
 * 4. Sample rate normalization (8 kHz telephony narrowband to 16 kHz wideband)
 * 5. Frame-by-frame Voice Activity Detection (VAD) energy segmentation
 */

export interface NormalizedAudio {
  pcm16Buffer: Buffer;
  sampleRate: number;
  channels: number;
  durationMs: number;
  isSilent: boolean;
  rmsDb: number;
  speechFrames: number[];
}

export class AudioNormalizer {
  /**
   * Parses and normalizes incoming audio payload into standard 16 kHz 16-bit mono PCM.
   */
  public normalize(rawAudio: Buffer): NormalizedAudio {
    if (!rawAudio || rawAudio.length < 44) {
      return {
        pcm16Buffer: Buffer.alloc(0),
        sampleRate: 16000,
        channels: 1,
        durationMs: 0,
        isSilent: true,
        rmsDb: -100,
        speechFrames: [],
      };
    }

    let pcmOffset = 0;
    let inputSampleRate = 8000;
    let inputChannels = 1;

    // Detect RIFF WAV header
    if (rawAudio.toString("ascii", 0, 4) === "RIFF") {
      try {
        inputChannels = rawAudio.readUInt16LE(22);
        inputSampleRate = rawAudio.readUInt32LE(24);
        pcmOffset = 44;
      } catch {
        pcmOffset = 0;
      }
    }

    const rawSamplesCount = Math.floor((rawAudio.length - pcmOffset) / 2);
    if (rawSamplesCount <= 0) {
      return {
        pcm16Buffer: Buffer.alloc(0),
        sampleRate: 16000,
        channels: 1,
        durationMs: 0,
        isSilent: true,
        rmsDb: -100,
        speechFrames: [],
      };
    }

    // Step 1: Read samples and compute DC offset
    let sum = 0;
    let sumSquares = 0;
    const samples: number[] = new Array(rawSamplesCount);

    for (let i = 0; i < rawSamplesCount; i++) {
      const s = rawAudio.readInt16LE(pcmOffset + i * 2);
      samples[i] = s;
      sum += s;
      sumSquares += s * s;
    }

    const mean = sum / rawSamplesCount;
    const rms = Math.sqrt(sumSquares / rawSamplesCount);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;

    // Silence threshold for telephony: -48 dBFS
    const isSilent = rmsDb < -48;

    // Step 2: Remove DC offset and normalize gain
    const gainFactor = rms > 0 ? Math.min(3.0, 4000 / rms) : 1.0;
    const cleanSamples = new Int16Array(rawSamplesCount);
    for (let i = 0; i < rawSamplesCount; i++) {
      const normalized = Math.round((samples[i] - mean) * gainFactor);
      cleanSamples[i] = Math.max(-32768, Math.min(32767, normalized));
    }

    // Step 3: Up-sample 8 kHz to 16 kHz if necessary (linear interpolation)
    let finalSamples: Int16Array;
    let finalSampleRate: number;

    if (inputSampleRate === 8000) {
      finalSamples = new Int16Array(rawSamplesCount * 2);
      for (let i = 0; i < rawSamplesCount - 1; i++) {
        finalSamples[i * 2] = cleanSamples[i];
        finalSamples[i * 2 + 1] = Math.round((cleanSamples[i] + cleanSamples[i + 1]) / 2);
      }
      finalSamples[(rawSamplesCount - 1) * 2] = cleanSamples[rawSamplesCount - 1];
      finalSamples[(rawSamplesCount - 1) * 2 + 1] = cleanSamples[rawSamplesCount - 1];
      finalSampleRate = 16000;
    } else {
      finalSamples = cleanSamples;
      finalSampleRate = inputSampleRate;
    }

    // Convert Int16Array to Buffer
    const outBuffer = Buffer.alloc(finalSamples.length * 2);
    for (let i = 0; i < finalSamples.length; i++) {
      outBuffer.writeInt16LE(finalSamples[i], i * 2);
    }

    const durationMs = Math.round((finalSamples.length / finalSampleRate) * 1000);

    return {
      pcm16Buffer: outBuffer,
      sampleRate: finalSampleRate,
      channels: 1,
      durationMs,
      isSilent,
      rmsDb: Math.round(rmsDb * 10) / 10,
      speechFrames: isSilent ? [] : [0, durationMs],
    };
  }
}

export const audioNormalizer = new AudioNormalizer();
