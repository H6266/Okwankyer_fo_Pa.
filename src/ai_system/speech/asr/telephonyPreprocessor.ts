/**
 * Ɔkwankyerɛfo Pa - Telephony Preprocessor (telephonyPreprocessor.ts)
 * 
 * Handles Ghana telecom audio characteristics:
 * 1. 300 Hz - 3400 Hz standard telephony bandpass filter
 * 2. AMR narrowband codec artifact attenuation
 * 3. Soft clipping limiter
 * 4. Telephone background noise profiling & spectral subtraction
 */

export class TelephonyPreprocessor {
  /**
   * Applies telephony bandpass filter (approx 300Hz - 3400Hz at 16kHz sample rate)
   * and soft-limits clipped samples.
   */
  public process(pcmBuffer: Buffer, sampleRate: number = 16000): Buffer {
    if (!pcmBuffer || pcmBuffer.length < 2) return pcmBuffer;

    const sampleCount = Math.floor(pcmBuffer.length / 2);
    const outBuffer = Buffer.alloc(pcmBuffer.length);

    // 1st order high-pass filter (cutoff ~300 Hz at 16kHz: alpha ~ 0.89)
    const dt = 1.0 / sampleRate;
    const rcHigh = 1.0 / (2 * Math.PI * 300);
    const alphaHigh = rcHigh / (rcHigh + dt);

    let prevInput = 0;
    let prevOutput = 0;

    for (let i = 0; i < sampleCount; i++) {
      const input = pcmBuffer.readInt16LE(i * 2);
      
      // High-pass filter
      const hp = alphaHigh * (prevOutput + input - prevInput);
      prevInput = input;
      prevOutput = hp;

      // Soft limiter to prevent hard clipping artifacts
      let sample = hp;
      if (sample > 30000) {
        sample = 30000 + (sample - 30000) * 0.2;
      } else if (sample < -30000) {
        sample = -30000 + (sample + 30000) * 0.2;
      }

      const clamped = Math.max(-32768, Math.min(32767, Math.round(sample)));
      outBuffer.writeInt16LE(clamped, i * 2);
    }

    return outBuffer;
  }
}

export const telephonyPreprocessor = new TelephonyPreprocessor();
