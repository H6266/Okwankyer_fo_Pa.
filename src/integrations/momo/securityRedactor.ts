/**
 * Ɔkwankyerɛfo Pa - Strict Security Redaction Layer
 * Enforces zero-leakage rules across logs, evidence records, and API responses.
 * Masks 32-character hex strings (keys), Basic auth tokens, and JWT Bearer tokens.
 */

// 32-character hex string pattern (MTN Subscription Keys & API Keys)
const HEX_32_REGEX = /\b[0-9a-fA-F]{32}\b/g;

// Basic authentication header pattern (Base64 payload)
const BASIC_AUTH_REGEX = /Basic\s+([A-Za-z0-9+/=]{16,})/gi;

// JWT pattern (header.payload.signature)
const JWT_REGEX = /\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;

// Generic Bearer token pattern
const BEARER_REGEX = /Bearer\s+([A-Za-z0-9._~+/-]{16,})/gi;

/**
 * Redacts all sensitive patterns from a raw string
 */
export function redactString(input: string): string {
  if (!input || typeof input !== "string") return input;

  let result = input;

  // 1. Redact JWTs
  result = result.replace(JWT_REGEX, (match) => `••••${match.slice(-4)}`);

  // 2. Redact Bearer tokens
  result = result.replace(BEARER_REGEX, (_match, token) => `Bearer ••••${token.slice(-4)}`);

  // 3. Redact Basic Auth headers
  result = result.replace(BASIC_AUTH_REGEX, (_match, token) => `Basic ••••${token.slice(-4)}`);

  // 4. Redact 32-character hex keys
  result = result.replace(HEX_32_REGEX, (match) => `••••${match.slice(-4)}`);

  return result;
}

/**
 * Redacts an HTTP headers object
 */
export function redactHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (val === undefined || val === null) continue;
    const lowerKey = key.toLowerCase();
    const strVal = String(val);

    if (lowerKey === "authorization") {
      clean[key] = redactString(strVal);
    } else if (
      lowerKey.includes("key") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password")
    ) {
      clean[key] = strVal.length > 4 ? `••••${strVal.slice(-4)}` : "••••";
    } else {
      clean[key] = redactString(strVal);
    }
  }
  return clean;
}

/**
 * Recursively redacts objects, arrays, and primitive values
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return redactString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }

  if (typeof obj === "object") {
    const clone: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lowerKey = k.toLowerCase();
      if (
        (lowerKey.includes("key") || lowerKey.includes("secret") || lowerKey.includes("token") || lowerKey.includes("password")) &&
        typeof v === "string"
      ) {
        clone[k] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
      } else {
        clone[k] = redactObject(v);
      }
    }
    return clone as T;
  }

  return obj;
}

/**
 * Security Assertion: Throws if any 32-char hex string, unmasked Basic header, or JWT is detected
 */
export function assertNoSecrets(data: any): void {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);

  // Check for 32-character hex key leaks
  const hexMatches = serialized.match(HEX_32_REGEX);
  if (hexMatches && hexMatches.length > 0) {
    throw new Error(`SECURITY LEAK DETECTED: 32-character hex key string found in output: ${hexMatches.map(m => `••••${m.slice(-4)}`).join(", ")}`);
  }

  // Check for Basic auth header leaks
  const basicMatches = serialized.match(/Basic\s+[A-Za-z0-9+/=]{16,}/i);
  if (basicMatches) {
    throw new Error("SECURITY LEAK DETECTED: Unmasked Basic authentication header found in output");
  }

  // Check for JWT leaks
  const jwtMatches = serialized.match(JWT_REGEX);
  if (jwtMatches) {
    throw new Error("SECURITY LEAK DETECTED: Unmasked JWT found in output");
  }
}
