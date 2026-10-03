/**
 * Ɔkwankyerɛfo Pa - Sandbox Demo Recipient Fixtures
 * 
 * IMPORTANT: This file contains ONLY test fixtures for local development and sandbox simulation.
 * It is completely isolated from production code paths.
 * No real customer phone numbers or private subscriber data are stored here.
 */

export interface DemoRecipientFixture {
  phoneNumber: string;
  name: string;
  network: "MTN" | "Telecel" | "AT";
  isVerified: boolean;
}

export const SANDBOX_RECIPIENT_FIXTURES: Record<string, DemoRecipientFixture> = {
  // Test fixture 1: Verified MTN subscriber
  "0553838464": {
    phoneNumber: "0553838464",
    name: "Kwame Boateng",
    network: "MTN",
    isVerified: true,
  },
  // Test fixture 2: Verified MTN subscriber
  "0241234567": {
    phoneNumber: "0241234567",
    name: "Ama Serwaa",
    network: "MTN",
    isVerified: true,
  },
  // Test fixture 3: Verified Telecel subscriber
  "0201234567": {
    phoneNumber: "0201234567",
    name: "Kofi Annan",
    network: "Telecel",
    isVerified: true,
  },
  // Test fixture 4: Verified AirtelTigo subscriber
  "0271234567": {
    phoneNumber: "0271234567",
    name: "Yaw Mensah",
    network: "AT",
    isVerified: true,
  },
};
