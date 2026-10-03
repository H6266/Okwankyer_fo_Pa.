/**
 * Ɔkwankyerɛfo Pa - Authenticated Field Encryption (fieldEncryption.ts)
 *
 * Implements real AES-256-GCM authenticated encryption for sensitive transaction
 * data and audit records. Never uses Base64 as pseudo-encryption.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || "okwankyerɛfo_pa_default_secure_vault_key_2026";
  // Ensure 32 bytes via SHA-256
  return crypto.createHash("sha256").update(envKey).digest();
}

export class FieldEncryptionService {
  private key: Buffer;

  constructor() {
    this.key = getEncryptionKey();
  }

  /**
   * Encrypts plaintext string using AES-256-GCM.
   * Format: iv:authTag:ciphertext (all hex-encoded)
   */
  public encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let ciphertext = cipher.update(plainText, "utf8", "hex");
    ciphertext += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
  }

  /**
   * Decrypts and verifies authenticated ciphertext.
   * Throws if authentication tag does not match or tampering occurred.
   */
  public decrypt(encryptedPayload: string): string {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) {
      throw new Error("INVALID_CIPHERTEXT_FORMAT: Encrypted field must contain iv:authTag:ciphertext");
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
      throw new Error("INVALID_CIPHERTEXT_METADATA: Invalid IV or Auth Tag length");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Encrypts any JSON object after checking for PIN leaks.
   */
  public encryptSensitiveJson(data: Record<string, any>): string {
    const jsonStr = JSON.stringify(data);
    // Security assertion: never encrypt data containing raw PIN tokens
    if (/\b(?:pin|otp)\b/i.test(jsonStr) && /\b\d{4}\b/.test(jsonStr)) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: Attempted to store or encrypt MoMo PIN/OTP.");
    }
    return this.encrypt(jsonStr);
  }

  /**
   * Decrypts and parses JSON object.
   */
  public decryptSensitiveJson<T = any>(encryptedPayload: string): T {
    const decrypted = this.decrypt(encryptedPayload);
    return JSON.parse(decrypted) as T;
  }
}

export const fieldEncryption = new FieldEncryptionService();
