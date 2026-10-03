export interface DemoRecipientFixture {
  phone: string;
  name: string;
  network: "MTN" | "Telecel" | "AT";
  verified: boolean;
}

export const demoRecipientFixtures: Record<string, DemoRecipientFixture> = {
  "0553838464": {
    phone: "0553838464",
    name: "Kwame Boateng",
    network: "MTN",
    verified: true,
  },
  "0241234567": {
    phone: "0241234567",
    name: "Amina Mensah",
    network: "MTN",
    verified: true,
  },
  "0543546010": {
    phone: "0543546010",
    name: "Hannes Aboagye",
    network: "MTN",
    verified: true,
  },
};
