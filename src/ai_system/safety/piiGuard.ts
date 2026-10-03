/**
 * Ɔkwankyerɛfo Pa - PII Guard
 * Redacts personal identifiers from logs and telemetry to protect caller confidentiality.
 */

export class PiiGuard {
  public sanitizeLogData<T extends Record<string, any>>(data: T): T {
    const serialized = JSON.stringify(data);
    const sanitized = serialized
      // Redact 10-digit Ghanaian mobile numbers (024..., 055...)
      .replace(/"(0[25]\d{8})"/g, (_m, phone) => `"${phone.slice(0, 3)}****${phone.slice(-3)}"`)
      // Redact any suspected PIN / password keys
      .replace(/"(pin|password|secret|momoPin)":\s*"[^"]+"/gi, '"$1":"[REDACTED]"');

    return JSON.parse(sanitized);
  }
}

export const piiGuard = new PiiGuard();
