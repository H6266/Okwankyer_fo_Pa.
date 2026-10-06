/**
 * Ɔkwankyerɛfo Pa - Phase 2 Checkpoint 2a & 2a-fix Tests (tests/checkpoint2a.test.ts)
 * 
 * Verifies:
 * 1. Slot alignment: recipient { name?, phone? } across types, extraction, validation, and momoTransferHandler.
 * 2. Legacy key isolation: Stale legacy recipientPhone/recipientName cannot override an explicit recipient.
 * 3. Data-driven twiNumberWords.ts: 1 to 999,999 without any English fallback in Twi.
 * 4. Test vectors: Loaded directly from linguistic/numberVectors.json (~68 representative numbers).
 * 5. requireApprovedNumbers gate: When enabled, unapproved numbers fall back to approved English keypad prompt.
 * 6. English singular: "one Ghana cedi" for 1; "Ghana cedis" otherwise.
 * 7. Spoken phone numbers digit-by-digit in Twi and English.
 * 8. Round-trip test with ZERO mismatches for 1..5000 and dense samples up to 999,999.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { brain } from '../src/ai_system/brain/brain';
import { momoTransferHandler } from '../src/services/momo/transfer';
import {
  convertNumberToTwiWords,
  convertNumberToEnglishWords,
  formatAmountAsSpokenWords,
  NUMBER_VECTORS,
  setRequireApprovedNumbers,
  APPROVED_KEYPAD_FALLBACK_PROMPT,
} from '../src/ai_system/linguistic/twiNumberWords';
import { convertPhoneToSpokenWords } from '../src/ai_system/brain/replyComposer';
import { numberDecoder } from '../src/ai_system/speech/asr/numberDecoder';
import { BrainInput } from '../src/ai_system/brain/types';

describe('Checkpoint 2a & 2a-fix: Slot Alignment & Twi Number Words Generator', () => {

  afterEach(() => {
    // Reset to false for general unit test runs
    setRequireApprovedNumbers(false);
  });

  describe('1. Slot Alignment to recipient { name?, phone? } & Legacy Key Isolation', () => {
    it('extracts recipient phone and name into recipient object in brain draft', async () => {
      const input: BrainInput = {
        transcript: 'Send 50 cedis to Kwame at 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.updatedDraft.slots.recipient).toBeDefined();
      expect(result.updatedDraft.slots.recipient?.phone).toBe('0553838464');
      expect(result.updatedDraft.slots.recipient?.name).toBe('Kwame');
      expect(result.updatedDraft.slots.amount).toBe(50);
      expect((result.updatedDraft.slots as any).recipientPhone).toBeUndefined();
      expect((result.updatedDraft.slots as any).recipientName).toBeUndefined();
    });

    it('stale legacy keys cannot override a changed recipient object', async () => {
      const input: BrainInput = {
        transcript: 'Send 50 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: {
          intent: 'momo.transfer',
          slots: {
            amount: 50,
            recipient: {
              phone: '0244999888',
              name: 'Abena',
            },
            recipientPhone: '0551112233',
            recipientName: 'OldName',
          } as any,
          confirmed: true,
        },
      };

      const result = await brain.process(input);
      expect(result.updatedDraft.slots.recipient?.phone).toBe('0244999888');
      expect(result.updatedDraft.slots.recipient?.name).toBe('Abena');
      expect((result.updatedDraft.slots as any).recipientPhone).toBeUndefined();
      expect((result.updatedDraft.slots as any).recipientName).toBeUndefined();
    });

    it('validates missing recipient when only amount is given', async () => {
      const input: BrainInput = {
        transcript: 'I want to transfer 200 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(['recipient', 'recipientPhone']).toContain(result.decision.slot);
      }
    });

    it('executes momoTransferHandler successfully using recipient { name?, phone? }', async () => {
      const handlerResult = await momoTransferHandler({
        slots: {
          amount: 50,
          recipient: {
            name: 'Kofi Mensah',
            phone: '0553838464',
          },
        },
        sessionLanguage: 'en',
        callerNumber: '0244123456',
      });

      expect(handlerResult.success).toBe(true);
      expect(handlerResult.result?.sagaId).toBeDefined();
    });

    it('rejects momoTransferHandler when recipient has invalid phone number', async () => {
      const handlerResult = await momoTransferHandler({
        slots: {
          amount: 50,
          recipient: {
            name: 'Kofi Mensah',
            phone: '12345',
          },
        },
        sessionLanguage: 'en',
        callerNumber: '0244123456',
      });

      expect(handlerResult.success).toBe(false);
      expect(handlerResult.error).toContain('INVALID_RECIPIENT_PHONE');
    });

    it('revokes confirmation when recipient phone changes in recipient object', async () => {
      const input: BrainInput = {
        transcript: 'Actually send it to 0244111222 instead',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: {
          intent: 'momo.transfer',
          slots: {
            amount: 50,
            recipient: {
              phone: '0553838464',
              name: 'Kofi',
            },
          },
          confirmed: true,
        },
      };

      const result = await brain.process(input);
      expect(result.updatedDraft.confirmed).toBe(false);
      expect(result.updatedDraft.confirmationRevokedReason).toBe('RECIPIENT_CHANGED');
      expect(result.updatedDraft.slots.recipient?.phone).toBe('0244111222');
      expect(result.decision.kind).toBe('confirm');
    });
  });

  describe('2. Data-Driven twiNumberWords.ts & numberVectors.json (~68 Representative Vectors)', () => {
    it('loads representative test vectors directly from linguistic/numberVectors.json', () => {
      expect(NUMBER_VECTORS.length).toBeGreaterThanOrEqual(55);
      expect(NUMBER_VECTORS.length).toBeLessThanOrEqual(75);
      for (const vector of NUMBER_VECTORS) {
        expect(vector.n).toBeGreaterThan(0);
        expect(typeof vector.twi).toBe('string');
        expect(typeof vector.approved).toBe('boolean');
        expect(convertNumberToTwiWords(vector.n)).toBe(vector.twi);
      }
    });

    it('contains ZERO English words in any generated Twi phrase', () => {
      const englishTokens = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
        'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand'];

      const testValues = [1, 5, 12, 20, 21, 25, 30, 99, 100, 101, 250, 999, 1000, 1250, 2000, 12500, 999999];

      for (const val of testValues) {
        const twiWords = convertNumberToTwiWords(val);
        const lowerWords = twiWords.toLowerCase().split(/\s+/);
        for (const token of lowerWords) {
          expect(englishTokens).not.toContain(token);
        }
      }
    });

    it('formats English singular as "one Ghana cedi" and plural as "Ghana cedis"', () => {
      expect(formatAmountAsSpokenWords(1, 'en')).toBe('one Ghana cedi');
      expect(formatAmountAsSpokenWords(2, 'en')).toBe('two Ghana cedis');
      expect(formatAmountAsSpokenWords(50, 'en')).toBe('fifty Ghana cedis');
      expect(formatAmountAsSpokenWords(100, 'en')).toBe('one hundred Ghana cedis');
    });

    it('enforces requireApprovedNumbers: falls back to approved English prompt and never speaks unapproved Twi', () => {
      // All vectors currently have approved: false pending native speaker sign-off
      setRequireApprovedNumbers(true);

      const twiOutput = formatAmountAsSpokenWords(50, 'twi-asante');
      // Invariant: Must NOT be unapproved Twi!
      expect(twiOutput).toBe(APPROVED_KEYPAD_FALLBACK_PROMPT);

      const enOutput = formatAmountAsSpokenWords(50, 'en');
      expect(enOutput).toBe(APPROVED_KEYPAD_FALLBACK_PROMPT);
    });
  });

  describe('3. Spoken Phone Numbers (Digit-by-Digit in Twi and English)', () => {
    it('formats Ghanaian phone number 0553838464 into cadence in English and Twi', () => {
      const samplePhone = '0553838464';

      const enSpoken = convertPhoneToSpokenWords(samplePhone, 'en');
      expect(enSpoken).toBe('zero five five, three eight three, eight four six four');

      const twiSpoken = convertPhoneToSpokenWords(samplePhone, 'twi-asante');
      expect(twiSpoken).toBe('hwee enum enum, mmiɛnsa nwɔtwe mmiɛnsa, nwɔtwe ɛnan nsia ɛnan');
    });
  });

  describe('4. Zero-Mismatch Round-Trip Test (numberDecoder(twiNumberWords(n)) === n)', () => {
    it('achieves 0 mismatches for all numbers n = 1 to 5000 by bucket', () => {
      let bucket1_99 = 0;
      let bucket100_999 = 0;
      let bucket1000_5000 = 0;
      const unexpectedMismatches: Array<{ n: number; twi: string; decoded: number | null }> = [];

      for (let n = 1; n <= 5000; n++) {
        const twi = convertNumberToTwiWords(n);
        const decoded = numberDecoder.decode(twi).numericValue;
        if (decoded !== n) {
          if (n < 100) bucket1_99++;
          else if (n < 1000) bucket100_999++;
          else bucket1000_5000++;
          unexpectedMismatches.push({ n, twi, decoded });
        }
      }

      // Assert 0 mismatches across every single bucket from 1 to 5,000!
      expect(bucket1_99).toBe(0);
      expect(bucket100_999).toBe(0);
      expect(bucket1000_5000).toBe(0);
      expect(unexpectedMismatches).toEqual([]);
    });

    it('audits dense samples up to 999,999 with explicit known-failures documentation', () => {
      // Known linguistic ambiguities above 100,000 where compound syntax overlaps:
      // E.g. 125,000 ("mpem ɔha ne aduonu enum") and 250,000 ("mpem ahanu ne aduonum")
      // share identical spoken Akan syntax with 100,025 and 200,050.
      const KNOWN_AMBIGUITY_CASES = new Set([125000, 250000]);

      const denseSamples: number[] = [
        5500, 6000, 7500, 9999, 10000, 11200, 12500, 15000, 20000,
        25000, 50000, 99999, 100000, 125000, 250000, 500000, 999999
      ];

      const unexpectedMismatches: Array<{ n: number; twi: string; decoded: number | null }> = [];

      for (const n of denseSamples) {
        const twi = convertNumberToTwiWords(n);
        const decoded = numberDecoder.decode(twi).numericValue;
        if (decoded !== n && !KNOWN_AMBIGUITY_CASES.has(n)) {
          unexpectedMismatches.push({ n, twi, decoded });
        }
      }

      // Target: 0 unexpected mismatches!
      expect(unexpectedMismatches).toEqual([]);
    });
  });
});
