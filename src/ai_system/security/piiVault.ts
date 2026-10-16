/**
 * Ɔkwankyerɛfo Pa - Cryptographic PII Vault & Zero-PIN Guard
 * 
 * Invariants:
 * 1. ZERO-PIN RULE: Spoken PINs and sensitive passcodes are blocked before model requests.
 * 2. CRYPTOGRAPHIC TOKENIZATION: Phone numbers and PII are redacted using cryptographic
 *    tokens [RECIPIENT_TOKEN_<hash>] with raw digits retained in an ephemeral session vault.
 * 3. PROMPT DELIMITER SANITIZATION: Injection attacks and delimiters (<caller_transcript>, etc.)
 *    are stripped before model invocation.
 */

import crypto from 'crypto';

/**
 * Ephemeral session vault for cryptographic tokenization of phone numbers and PII.
 * Map: sessionId -> (token -> raw phone digits).
 */
export const sessionTokenVault = new Map<string, Map<string, string>>();

/**
 * Clears expired or terminated session vault data.
 */
export function clearSessionVault(sessionId: string): void {
  sessionTokenVault.delete(sessionId);
}

/**
 * Escapes/strips </caller_transcript> and similar delimiters from raw untrusted caller speech.
 */
export function sanitizeTranscriptForModel(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?caller_transcript[^>]*>/gi, '')
    .replace(/<\/?(?:system|instruction|prompt|context|human|assistant)[^>]*>/gi, '')
    .replace(/<!\[CDATA\[.*?\]\]>/gi, '')
    .replace(/[<>]/g, '');
}

/**
 * Masks 10-digit and spoken phone numbers in the transcript before sending to the model.
 * Invariant: No phone number reaches the model payload.
 */
export function maskPhoneNumbers(text: string): string {
  if (!text) return '';
  // 1. Mask 10-digit / international phone numbers
  let masked = text.replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, '[PHONE_MASKED]');
  masked = masked.replace(/\b(?:\d[\s-]*){9,12}\b/g, '[PHONE_MASKED]');

  // 2. Mask spoken phone numbers in English or Twi (sequences of 7+ spoken digit words)
  const spokenSequenceRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)){6,}\b/gi;
  masked = masked.replace(spokenSequenceRegex, '[PHONE_MASKED]');

  return masked;
}

/**
 * Tokenizes phone numbers and PII in caller transcript using cryptographic tokens.
 * Retains raw digits in the ephemeral session token vault for secure post-model reconstruction.
 */
export function tokenizeAndMaskPii(
  text: string,
  sessionId?: string
): { maskedText: string; tokens: Map<string, string>; hasToken: boolean } {
  if (!text) return { maskedText: '', tokens: new Map(), hasToken: false };
  const tokens = new Map<string, string>();
  let hasToken = false;

  const replaceToken = (match: string): string => {
    hasToken = true;
    const cleanDigits = match.replace(/\D/g, '');
    const hash = crypto.createHash('sha256').update(cleanDigits || match).digest('hex').slice(0, 8);
    const token = `[RECIPIENT_TOKEN_${hash}]`;
    tokens.set(token, cleanDigits || match);
    if (sessionId) {
      if (!sessionTokenVault.has(sessionId)) {
        sessionTokenVault.set(sessionId, new Map());
      }
      sessionTokenVault.get(sessionId)!.set(token, cleanDigits || match);
    }
    return token;
  };

  let maskedText = text.replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, replaceToken);
  maskedText = maskedText.replace(/\b(?:\d[\s-]*){9,12}\b/g, (m) => {
    if (m.includes('[RECIPIENT_TOKEN_')) return m;
    return replaceToken(m);
  });

  const spokenSequenceRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)){6,}\b/gi;
  maskedText = maskedText.replace(spokenSequenceRegex, replaceToken);

  return { maskedText, tokens, hasToken };
}

/**
 * Deterministic hash of settled transaction draft (intent + amount + recipient).
 */
export function computeDraftHash(draft: { intent?: string; slots: Record<string, any> }): string {
  const payload = {
    intent: draft.intent || '',
    amount: draft.slots?.amount ?? null,
    phone: draft.slots?.recipient?.phone ?? null,
    name: draft.slots?.recipient?.name ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// ── SPOKEN PIN INTERCEPTION (Uncompromising Zero-PIN Guard) ─────────────────

const PIN_CUES = /\b(?:pin|secret|passcode|code|password)\b/i;
const PIN_DIGIT_SEQUENCE = /\b(?:\d[\s-]*){4,6}\b/;

export function isSpokenPinPresent(raw: string): boolean {
  if (!raw) return false;
  const text = raw.trim().toLowerCase();

  // 1. Spoken digit sequence of 4-6 digits
  if (PIN_DIGIT_SEQUENCE.test(text)) {
    // If it's a 10-digit phone number, it's not a PIN
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 4 && digitsOnly.length <= 6) {
      return true;
    }
    if (PIN_CUES.test(text)) {
      return true;
    }
  }

  // 2. PIN keyword followed by numbers or number words
  if (PIN_CUES.test(text)) {
    if (/\d{4}/.test(text)) return true;
    if (/\b(?:one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiensa|ɛnan|enum)\b/i.test(text)) {
      return true;
    }
  }

  return false;
}
