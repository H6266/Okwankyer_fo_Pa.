/**
 * Ɔkwankyerɛfo Pa - SSRF (Server-Side Request Forgery) Protection Guard
 * 
 * Protects remote media download endpoints (such as Africa's Talking recording URLs)
 * from reaching internal networks, cloud metadata services (e.g. 169.254.169.254),
 * loopback interfaces (localhost, 127.0.0.1, ::1), or unauthorized protocols.
 */

import { URL } from "url";

const BLOCKED_IP_PATTERNS = [
  /^127\./,                         // Loopback IPv4 (127.0.0.0/8)
  /^10\./,                          // RFC 1918 Private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // RFC 1918 Private Class B (172.16.0.0/12)
  /^192\.168\./,                    // RFC 1918 Private Class C (192.168.0.0/16)
  /^169\.254\./,                    // IPv4 Link-Local / Cloud Metadata (169.254.0.0/16)
  /^0\./,                           // RFC 1122 'This host on this network'
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
  /^::1$/,                          // IPv6 Loopback
  /^fe80:/i,                        // IPv6 Link-Local
  /^fc00:/i,                        // IPv6 Unique Local Address
  /^fd00:/i,                        // IPv6 Unique Local Address
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "169.254.169.254",
]);

export interface UrlValidationResult {
  valid: boolean;
  sanitizedUrl?: string;
  reason?: string;
}

/**
 * Validates whether an external audio recording URL is safe to download.
 */
export function validateSafeAudioUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, reason: "URL_EMPTY_OR_INVALID" };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { valid: false, reason: "URL_EXCEEDS_MAX_LENGTH" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "URL_MALFORMED" };
  }

  // Only permit HTTP and HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `UNSUPPORTED_PROTOCOL: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Strip brackets from IPv6 hostnames
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(cleanHostname)) {
    return { valid: false, reason: `FORBIDDEN_HOST: ${cleanHostname}` };
  }

  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(cleanHostname)) {
      return { valid: false, reason: `INTERNAL_IP_ACCESS_DENIED: ${cleanHostname}` };
    }
  }

  // Reject credentials inside URL (e.g. http://user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URL_EMBEDDED_CREDENTIALS_DENIED" };
  }

  // Reject non-standard dangerous ports (permit 80, 443, 8080, 8443)
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
    if (!ALLOWED_PORTS.has(portNum)) {
      return { valid: false, reason: `NON_STANDARD_PORT_DENIED: ${portNum}` };
    }
  }

  return { valid: true, sanitizedUrl: parsed.toString() };
}

/**
 * Downloads a remote audio URL with strict SSRF validation, timeout, and max byte size guard.
 */
export async function downloadSafeAudio(
  url: string,
  options: {
    maxBytes?: number;
    timeoutMs?: number;
    headers?: Record<string, string>;
  } = {}
): Promise<{ buffer: Buffer; mimeType: string }> {
  const maxBytes = options.maxBytes || 10 * 1024 * 1024; // 10MB default
  const timeoutMs = options.timeoutMs || 2500;

  const validation = validateSafeAudioUrl(url);
  if (!validation.valid || !validation.sanitizedUrl) {
    throw new Error(`SSRF_VIOLATION: ${validation.reason || "Unsafe URL blocked"}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(validation.sanitizedUrl, {
      method: "GET",
      headers: options.headers || {},
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`HTTP_DOWNLOAD_FAILED: ${resp.status} ${resp.statusText}`);
    }

    // Check Content-Length header if present
    const contentLength = resp.headers.get("content-length");
    if (contentLength) {
      const parsedLen = parseInt(contentLength, 10);
      if (!isNaN(parsedLen) && parsedLen > maxBytes) {
        throw new Error(`FILE_TOO_LARGE: Audio size (${parsedLen} bytes) exceeds limit of ${maxBytes} bytes`);
      }
    }

    const mimeType = (resp.headers.get("content-type") || "audio/wav").split(";")[0].trim();

    // Stream download with strict byte ceiling check
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      throw new Error(`FILE_TOO_LARGE: Downloaded audio (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes`);
    }

    if (buffer.length < 64) {
      throw new Error(`FILE_TOO_SMALL: Downloaded payload (${buffer.length} bytes) is too small to be audio`);
    }

    return { buffer, mimeType };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`DOWNLOAD_TIMEOUT: Audio download timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}
