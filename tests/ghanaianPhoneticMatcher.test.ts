import { describe, it, expect } from "vitest";
import {
  repairGhanaianPronunciation,
  extractStreamingWords,
} from "../src/ai_system/speech/asr/ghanaianPhoneticMatcher";

describe("Ghanaian Phonetic Matcher & Pronunciation Tolerance Engine", () => {
  it("normalizes mispronounced Ghanaian currency terms ('cities', 'sidi', 'sedis' -> 'cedis')", () => {
    const input1 = "send 50 cities to Kwame";
    const res1 = repairGhanaianPronunciation(input1);
    expect(res1.normalizedTranscript).toContain("50 cedis");
    expect(res1.repairedWords.some((w) => w.corrected === "cedis")).toBe(true);

    const input2 = "transfer 100 sidi";
    const res2 = repairGhanaianPronunciation(input2);
    expect(res2.normalizedTranscript).toContain("100 cedis");

    const input3 = "20 sedis kɔ ma Kofi";
    const res3 = repairGhanaianPronunciation(input3);
    expect(res3.normalizedTranscript).toContain("20 cedis");
  });

  it("normalizes colloquial Ghanaian currency slang (bars and sticks)", () => {
    const input1 = "send 1 bar to 0244123456";
    const res1 = repairGhanaianPronunciation(input1);
    expect(res1.normalizedTranscript).toContain("10 cedis");

    const input2 = "I want to transfer one stick";
    const res2 = repairGhanaianPronunciation(input2);
    expect(res2.normalizedTranscript).toContain("100 cedis");

    const input3 = "two sticks to Ama";
    const res3 = repairGhanaianPronunciation(input3);
    expect(res3.normalizedTranscript).toContain("200 cedis");
  });

  it("normalizes Akan Twi intention phrases and phonetic variations", () => {
    const input1 = "mepe se mesoma 50 cedis";
    const res1 = repairGhanaianPronunciation(input1);
    expect(res1.normalizedTranscript).toContain("mepɛ sɛ mesoma");
    expect(res1.detectedIntent).toBe("send_money");

    const input2 = "check me balance";
    const res2 = repairGhanaianPronunciation(input2);
    expect(res2.detectedIntent).toBe("check_balance");
  });

  it("normalizes Akan number words to numerals (baako -> 1, mmienu -> 2, mmiɛnsa -> 3)", () => {
    expect(repairGhanaianPronunciation("baako").normalizedTranscript).toBe("1");
    expect(repairGhanaianPronunciation("mmienu").normalizedTranscript).toBe("2");
    expect(repairGhanaianPronunciation("mmiɛnsa").normalizedTranscript).toBe("3");
    expect(repairGhanaianPronunciation("aduanan").normalizedTranscript).toBe("40");
    expect(repairGhanaianPronunciation("aduonum").normalizedTranscript).toBe("50");
    expect(repairGhanaianPronunciation("oha").normalizedTranscript).toBe("100");
    expect(repairGhanaianPronunciation("nnum").normalizedTranscript).toBe("5");
  });

  it("normalizes Twi phone digit sequences before zero/cancel phonetic rules", () => {
    const result = repairGhanaianPronunciation(
      "hwee nnum nnum mmiɛnsa nwɔtwe mmiɛnsa nwɔtwe anan nsia anan"
    );

    expect(result.normalizedTranscript).toBe("0553838464");
    expect(result.extractedPhone).toBe("0553838464");
  });

  it("normalizes Twi pesewa amounts without losing the five-pesewa component", () => {
    const result = repairGhanaianPronunciation("mane sidi aduonum ne nnum pesewas");

    expect(result.normalizedTranscript).toContain("50 ne 5 pesewas");
  });

  it("normalizes accented English numbers with Ghanaian phonetics", () => {
    expect(repairGhanaianPronunciation("tree").normalizedTranscript).toBe("3");
    expect(repairGhanaianPronunciation("faiv").normalizedTranscript).toBe("5");
    expect(repairGhanaianPronunciation("fifti").normalizedTranscript).toBe("50");
  });

  it("extracts word-by-word streaming transcript with real-time phonetic annotations", () => {
    const prev = "send 50";
    const curr = "send 50 cities to Kwame";
    const streaming = extractStreamingWords(prev, curr);

    expect(streaming.newWords).toEqual(["cities", "to", "Kwame"]);
    expect(streaming.annotatedWords.find((w) => w.word === "cities")?.isPhoneticMatch).toBe(true);
    expect(streaming.annotatedWords.find((w) => w.word === "cities")?.repaired).toBe("cedis");
  });
});
