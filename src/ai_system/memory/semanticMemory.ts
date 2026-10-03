/**
 * Ɔkwankyerɛfo Pa - Semantic Memory
 * Static domain facts: telecom carriers, banking rules, currencies, and linguistic parameters.
 */

export interface TelcoSpecification {
  name: "MTN" | "Telecel" | "AT" | "G-Money";
  prefixes: string[];
  ussdShortCode: string;
  supportsVoiceBargeIn: boolean;
}

export class SemanticMemory {
  public readonly supportedNetworks: TelcoSpecification[] = [
    { name: "MTN", prefixes: ["024", "054", "055", "059", "053"], ussdShortCode: "*170#", supportsVoiceBargeIn: true },
    { name: "Telecel", prefixes: ["020", "050"], ussdShortCode: "*110#", supportsVoiceBargeIn: true },
    { name: "AT", prefixes: ["027", "057", "026", "056"], ussdShortCode: "*110#", supportsVoiceBargeIn: true },
  ];

  public readonly limits = {
    minTransactionGHS: 0.5,
    maxSingleTransferGHS: 5000,
    dailyLimitGHS: 10000,
    currencyCode: "GHS",
    currencySymbol: "GH₵",
  };

  public getNetworkForPrefix(prefix: string): "MTN" | "Telecel" | "AT" | null {
    for (const net of this.supportedNetworks) {
      if (net.prefixes.includes(prefix)) {
        return net.name as any;
      }
    }
    return null;
  }

  public isSupportedCarrier(name: string): boolean {
    return this.supportedNetworks.some((n) => n.name.toLowerCase() === name.toLowerCase());
  }
}

export const semanticMemory = new SemanticMemory();
