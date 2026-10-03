/**
 * Ɔkwankyerɛfo Pa - Contact & KYC Verification Service
 * 
 * Provides an isolated service interface for looking up contacts,
 * resolving names to verified subscriber profiles, and formatting numbers for TTS cadence.
 */

import {
  MOCK_CONTACTS,
  ContactRecord,
  formatPhoneNumberForSpeech,
  maskPhoneNumber,
} from "./mockContacts";
import {
  networkDetectionService,
  normalizeGhanaianPhoneNumber,
} from "./networkDetectionService";

export interface KycSubscriberInfo {
  name: string;
  phoneNumber: string;
  network: "MTN" | "Telecel" | "AT" | "UNKNOWN";
  isMtn: boolean;
  relationship?: string;
  isRegisteredKyc: boolean;
}

export class ContactService {
  /**
   * Resolves contact or KYC identity by phone number or name query.
   */
  public lookup(query: string): KycSubscriberInfo | null {
    if (!query) return null;
    const trimmed = query.trim();

    // 1. Check if direct telephone number
    const normalized = normalizeGhanaianPhoneNumber(trimmed);
    if (normalized && normalized.length === 10) {
      const netRes = networkDetectionService.validatePhoneNumber(normalized);
      const matched = MOCK_CONTACTS[normalized];
      if (matched) {
        return {
          name: matched.name,
          phoneNumber: normalized,
          network: matched.network,
          isMtn: matched.network === "MTN",
          relationship: matched.relationship,
          isRegisteredKyc: true,
        };
      }

      // Valid phone, but not in seeded address book
      return {
        name: `Subscriber (${maskPhoneNumber(normalized)})`,
        phoneNumber: normalized,
        network: netRes.network,
        isMtn: netRes.isMtn,
        isRegisteredKyc: true,
      };
    }

    // 2. Lookup by recipient name in address book
    const queryLower = trimmed.toLowerCase();
    for (const contact of Object.values(MOCK_CONTACTS)) {
      const contactNameLower = contact.name.toLowerCase();
      if (
        contactNameLower === queryLower ||
        contactNameLower.includes(queryLower) ||
        queryLower.includes(contactNameLower.split(" ")[0].toLowerCase())
      ) {
        return {
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          network: contact.network,
          isMtn: contact.network === "MTN",
          relationship: contact.relationship,
          isRegisteredKyc: true,
        };
      }
    }

    return null;
  }

  /**
   * Formats a phone number for clear cadence during speech synthesis (e.g. "0 2 4, 1 2 3, 4 5 6 7")
   */
  public formatForSpeech(phone: string): string {
    return formatPhoneNumberForSpeech(phone);
  }

  /**
   * Masked number for safe readback (e.g. "ending in 8 4 6 4")
   */
  public maskForSpeech(phone: string): string {
    return maskPhoneNumber(phone);
  }
}

export const contactService = new ContactService();
