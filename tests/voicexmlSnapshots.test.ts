import { describe, it, expect } from "vitest";
import { generateVoiceXmlStep, getAllVoiceXmlSnapshots } from "../src/modules/devServices";

describe("VoiceXML Telephony Snapshots & Pillar Invariants", () => {
  const baseUrl = "https://test.okwankyer-fo-pa.org";

  it("generates compliant VoiceXML snapshots for all 10 steps in English and Twi", () => {
    const snapshots = getAllVoiceXmlSnapshots(baseUrl);
    expect(snapshots.tracks).toHaveLength(2);

    for (let step = 1; step <= 10; step++) {
      expect(snapshots.en[`step_${step}`]).toBeDefined();
      expect(snapshots.twi[`step_${step}`]).toBeDefined();
      expect(snapshots.en[`step_${step}`]).toContain("<Response>");
      expect(snapshots.twi[`step_${step}`]).toContain("<Response>");
    }
  });

  it("Pillar 3 Guarantee: Verifies Step 7 (Zero-PIN) NEVER collects PIN digits over audio", () => {
    const enStep7 = generateVoiceXmlStep(7, "en", baseUrl);
    const twiStep7 = generateVoiceXmlStep(7, "twi", baseUrl);

    // Microphones must be marked as muted
    expect(enStep7.zeroPinMuted).toBe(true);
    expect(twiStep7.zeroPinMuted).toBe(true);

    // VoiceXML must NOT contain GetDigits for PIN entry
    expect(enStep7.xml.toLowerCase()).not.toContain("enter pin");
    expect(enStep7.xml.toLowerCase()).not.toContain("<getdigits");
    expect(twiStep7.xml.toLowerCase()).not.toContain("<getdigits");

    // Audio prompts must be present
    expect(enStep7.promptAudioUrl).toContain("Audio_prompt_11.mp3");
    expect(twiStep7.promptAudioUrl).toContain("Audio_prompt_twi_11.mp3");
  });

  it("Pillar 1 & 4: Verifies DTMF barge-in timeouts and input windows", () => {
    const enStep1 = generateVoiceXmlStep(1, "en", baseUrl);
    // Instant DTMF barge-in timeout of 2 seconds
    expect(enStep1.inputWindowSec).toBe(2);
    expect(enStep1.xml).toContain('timeout="2"');

    // Step 3 (Recipient input) generous 40s window for elderly
    const enStep3 = generateVoiceXmlStep(3, "en", baseUrl);
    expect(enStep3.inputWindowSec).toBe(40);
    expect(enStep3.xml).toContain('timeout="40"');

    // Step 5 (Amount input) 30s window with pesewas star key
    const enStep5 = generateVoiceXmlStep(5, "en", baseUrl);
    expect(enStep5.inputWindowSec).toBe(30);
    expect(enStep5.xml).toContain('timeout="30"');
  });

  it("Guarantees no PIN or secret leaks in any of the 20 generated VoiceXML outputs", () => {
    const snapshots = getAllVoiceXmlSnapshots(baseUrl);
    const allXml = Object.values(snapshots.en).concat(Object.values(snapshots.twi)).join("\n");

    // Must never contain sensitive credential patterns
    expect(allXml).not.toMatch(/atsk_[a-zA-Z0-9]+/);
    expect(allXml).not.toMatch(/api_key/i);
    expect(allXml).not.toMatch(/momo_secret/i);
  });
});
