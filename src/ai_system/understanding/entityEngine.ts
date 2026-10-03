/**
 * Ɔkwankyerɛfo Pa - Entity Extraction Engine
 * Extracts financial entities: amount, currency, phone number, recipient name, and telco network.
 */

import { EntitySlotMap } from "../core/aiTypes";
import { inputNormalizer } from "../perception/inputNormalizer";
import { findContact, normalizePhoneNumber, isPhoneNumber } from "../../modules/mockContacts";

export class EntityEngine {
  public extract(text: string): EntitySlotMap {
    const slots: EntitySlotMap = {
      currency: "GHS",
    };

    // 1. Extract Amount
    const extractedAmount = this.extractAmount(text);
    if (extractedAmount !== null) {
      slots.amount = extractedAmount;
    }

    // 2. Extract Phone Number
    const phoneMatch = text.match(/\b(0[25][0-9]{8}|233[25][0-9]{8})\b/);
    if (phoneMatch) {
      const normalized = normalizePhoneNumber(phoneMatch[0]);
      slots.recipientPhone = normalized;
      const contact = findContact(normalized);
      if (contact) {
        slots.recipientName = contact.name;
        slots.network = contact.network;
      }
    }

    // 3. Extract Recipient Name if not found via phone
    if (!slots.recipientName) {
      const name = this.extractRecipientName(text);
      if (name) {
        slots.recipientName = name;
        const contact = findContact(name);
        if (contact) {
          slots.recipientPhone = contact.phoneNumber;
          slots.network = contact.network;
        }
      }
    }

    // 4. Extract Network
    const lower = text.toLowerCase();
    if (lower.includes("mtn")) {
      slots.network = "MTN";
    } else if (lower.includes("telecel") || lower.includes("vodafone")) {
      slots.network = "Telecel";
    } else if (lower.includes("airteltigo") || lower.includes("airtel") || lower.includes("at")) {
      slots.network = "AT";
    }

    // 5. Extract Biller
    if (lower.includes("ecg")) {
      slots.biller = "ECG (Electricity)";
    } else if (lower.includes("gwcl") || lower.includes("water")) {
      slots.biller = "GWCL (Water)";
    }

    return slots;
  }

  private extractAmount(text: string): number | null {
    // Check patterns like: "50 cedis", "100 GHS", "GHS 200", "send 50"
    const amountRegex = /(?:send|mane|amount|make it|cedis?|ghs)?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:cedis?|ghs|pesewas?)?/i;
    const match = text.match(amountRegex);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0 && val < 10000) {
        // Exclude phone numbers (which have 10 digits starting with 0)
        if (!/^0[25]\d{8}$/.test(match[1])) {
          return val;
        }
      }
    }

    // Fall back to input normalizer word extraction (e.g. 'aduonum' -> 50)
    return inputNormalizer.extractNumber(text);
  }

  private extractRecipientName(text: string): string | null {
    // Matches patterns like "to Kwame", "kɔma Ama", "ma Kofi", "send to Kwame Mensah"
    const nameMatch = text.match(/(?:to|kɔma|ma|send to|sendi kɔ)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch && nameMatch[1]) {
      const candidate = nameMatch[1].trim();
      const forbidden = ["money", "cedis", "ghs", "momo", "airtime", "balance", "sika"];
      if (!forbidden.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // Check direct known Ghanaian names
    const knownNames = ["Kwame", "Ama", "Kofi", "Yaw", "Kwesi", "Abena", "Akosua", "Mensah", "Boateng", "Nyameba", "Nyamebere"];
    for (const name of knownNames) {
      const reg = new RegExp(`\\b${name}\\b`, "i");
      if (reg.test(text)) {
        return name;
      }
    }

    return null;
  }
}

export const entityEngine = new EntityEngine();
