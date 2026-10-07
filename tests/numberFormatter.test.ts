import { describe, it, expect } from "vitest";
import { formatSpokenNumbersAsDigits } from "../src/domain/numberFormatter";

describe("formatSpokenNumbersAsDigits - User Mandate: ASR writes numbers as digits not words", () => {
  it("converts single spoken digits (e.g. 'two' -> '2', 'one' -> '1')", () => {
    expect(formatSpokenNumbersAsDigits("two")).toBe("2");
    expect(formatSpokenNumbersAsDigits("one")).toBe("1");
    expect(formatSpokenNumbersAsDigits("three")).toBe("3");
    expect(formatSpokenNumbersAsDigits("zero")).toBe("0");
    expect(formatSpokenNumbersAsDigits("nine")).toBe("9");
  });

  it("converts Akan Twi single spoken digits ('baako' -> '1', 'mmienu' -> '2')", () => {
    expect(formatSpokenNumbersAsDigits("baako")).toBe("1");
    expect(formatSpokenNumbersAsDigits("mmienu")).toBe("2");
    expect(formatSpokenNumbersAsDigits("mmiɛnsa")).toBe("3");
    expect(formatSpokenNumbersAsDigits("mmiensa")).toBe("3");
    expect(formatSpokenNumbersAsDigits("ɛnan")).toBe("4");
    expect(formatSpokenNumbersAsDigits("enum")).toBe("5");
    expect(formatSpokenNumbersAsDigits("nsia")).toBe("6");
    expect(formatSpokenNumbersAsDigits("nson")).toBe("7");
    expect(formatSpokenNumbersAsDigits("nwɔtwe")).toBe("8");
    expect(formatSpokenNumbersAsDigits("nkron")).toBe("9");
  });

  it("converts spoken menu navigation instructions so the system recognizes digits", () => {
    expect(formatSpokenNumbersAsDigits("for twi press two")).toBe("for twi press 2");
    expect(formatSpokenNumbersAsDigits("for english press one")).toBe("for english press 1");
    expect(formatSpokenNumbersAsDigits("select option two")).toBe("select option 2");
    expect(formatSpokenNumbersAsDigits("first option")).toBe("1");
    expect(formatSpokenNumbersAsDigits("second option")).toBe("2");
  });

  it("converts spoken transfer amounts in English and Akan Twi", () => {
    expect(formatSpokenNumbersAsDigits("Send two cedis to Kwame")).toBe("Send 2 cedis to Kwame");
    expect(formatSpokenNumbersAsDigits("Send twenty cedis to Kwame")).toBe("Send 20 cedis to Kwame");
    expect(formatSpokenNumbersAsDigits("Send fifty cedis")).toBe("Send 50 cedis");
    expect(formatSpokenNumbersAsDigits("Transfer two hundred cedis")).toBe("Transfer 200 cedis");
    expect(formatSpokenNumbersAsDigits("two hundred and fifty cedis")).toBe("250 cedis");
    expect(formatSpokenNumbersAsDigits("Fa sidi aduonu kɔma Kwame")).toBe("Fa sidi 20 kɔma Kwame");
    expect(formatSpokenNumbersAsDigits("Fa sidi mmienu kɔma Ama")).toBe("Fa sidi 2 kɔma Ama");
    expect(formatSpokenNumbersAsDigits("Mane sika aduonum")).toBe("Mane sika 50");
    expect(formatSpokenNumbersAsDigits("Sɛ wopene so a mia baako, dabi a mia mmienu")).toBe("Sɛ wopene so a mia 1, dabi a mia 2");
  });

  it("converts spoken Ghanaian phone numbers into concatenated numeric strings", () => {
    expect(formatSpokenNumbersAsDigits("zero five five three eight three eight four six four")).toBe("0553838464");
    expect(formatSpokenNumbersAsDigits("0 5 5 3 8 3 8 4 6 4")).toBe("0553838464");
    expect(formatSpokenNumbersAsDigits("0 2 4 1 2 3 4 5 6 7")).toBe("0241234567");
  });

  it("converts compound numbers (21-99)", () => {
    expect(formatSpokenNumbersAsDigits("twenty one")).toBe("21");
    expect(formatSpokenNumbersAsDigits("twenty-two")).toBe("22");
    expect(formatSpokenNumbersAsDigits("ninety nine")).toBe("99");
    expect(formatSpokenNumbersAsDigits("aduonu baako")).toBe("21");
    expect(formatSpokenNumbersAsDigits("aduasa mmienu")).toBe("32");
  });

  it("converts double digits and large compounds", () => {
    expect(formatSpokenNumbersAsDigits("double two")).toBe("22");
    expect(formatSpokenNumbersAsDigits("double zero")).toBe("00");
    expect(formatSpokenNumbersAsDigits("double five")).toBe("55");
    expect(formatSpokenNumbersAsDigits("one thousand five hundred")).toBe("1500");
    expect(formatSpokenNumbersAsDigits("two thousand five hundred")).toBe("2500");
    expect(formatSpokenNumbersAsDigits("two hundred and fifty")).toBe("250");
    expect(formatSpokenNumbersAsDigits("Worebɛmane sidi ahanum akɔma Kwame")).toBe("Worebɛmane sidi 500 akɔma Kwame");
    expect(formatSpokenNumbersAsDigits("Mia baako na mia mmienu")).toBe("Mia 1 na mia 2");
  });
});
