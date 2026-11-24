export type VoiceChannel = "AT_LINE" | "SIMULATOR";

export interface CanonicalVoiceStage {
  order: number;
  id: string;
  route: string;
  promptId: string;
  titleEn: string;
  titleTwi: string;
  dynamic: boolean;
  terminal: boolean;
}

export const CANONICAL_VOICE_SEQUENCE: readonly CanonicalVoiceStage[] = Object.freeze([
  { order: 1, id: "welcome", route: "voice-menu", promptId: "OP01", titleEn: "Welcome and language choice", titleTwi: "Akwaaba ne kasa paw", dynamic: false, terminal: false },
  { order: 2, id: "language", route: "language-selection", promptId: "OP02", titleEn: "Language confirmation", titleTwi: "Kasa nhyehyɛe", dynamic: false, terminal: false },
  { order: 3, id: "service", route: "service-select", promptId: "OP07", titleEn: "Select Mobile Money", titleTwi: "Paw Mobile Money", dynamic: false, terminal: false },
  { order: 4, id: "network", route: "provider-select", promptId: "OP08", titleEn: "Select network", titleTwi: "Paw network", dynamic: false, terminal: false },
  { order: 5, id: "send-money", route: "action-select", promptId: "OP09", titleEn: "Confirm Send Money action", titleTwi: "Si sika mane dwumadie so", dynamic: false, terminal: false },
  { order: 6, id: "recipient-input", route: "verify-recipient", promptId: "OP16", titleEn: "Enter recipient number", titleTwi: "Bɔ recipient fon nɔma", dynamic: false, terminal: false },
  { order: 7, id: "recipient-readback", route: "recipient-verify-choice", promptId: "OP20", titleEn: "Read back recipient name and number", titleTwi: "San ka recipient din ne nɔma", dynamic: true, terminal: false },
  { order: 8, id: "amount-input", route: "verify-amount", promptId: "OP26", titleEn: "Enter amount", titleTwi: "Bɔ sika dodow", dynamic: false, terminal: false },
  { order: 9, id: "amount-readback", route: "amount-readback-choice", promptId: "OP29", titleEn: "Read back exact amount", titleTwi: "San ka sika dodow pɛpɛɛpɛ", dynamic: true, terminal: false },
  { order: 10, id: "transaction-review", route: "safe-confirmation", promptId: "OP35", titleEn: "Review amount, recipient and network", titleTwi: "Hwɛ sika, recipient ne network", dynamic: true, terminal: false },
  { order: 11, id: "transaction-confirmation", route: "safe-outcome", promptId: "OP36", titleEn: "Final confirmation", titleTwi: "Nsiemupɛ a edi akyire", dynamic: false, terminal: false },
  { order: 12, id: "handset-authorization", route: "submit-transfer", promptId: "OP40", titleEn: "Private handset authorization", titleTwi: "Nhyɛso a ɛyɛ kokoam wɔ handset so", dynamic: false, terminal: false },
  { order: 13, id: "provider-status", route: "check-status", promptId: "OP46", titleEn: "Wait for provider status", titleTwi: "Twɛn provider tebea", dynamic: false, terminal: false },
  { order: 14, id: "terminal-outcome", route: "receipt-status", promptId: "OP52", titleEn: "Success, failure or pending result", titleTwi: "Nkunimdie, nkɔsoɔ anaa nkonta", dynamic: true, terminal: true },
]);

export function getCanonicalStage(order: number): CanonicalVoiceStage | undefined {
  return CANONICAL_VOICE_SEQUENCE.find((stage) => stage.order === order);
}

export function getCanonicalStageById(id: string): CanonicalVoiceStage | undefined {
  return CANONICAL_VOICE_SEQUENCE.find((stage) => stage.id === id);
}

export function getCanonicalStageRoute(route: string): CanonicalVoiceStage | undefined {
  return CANONICAL_VOICE_SEQUENCE.find((stage) => stage.route === route);
}

export function getCanonicalVoiceSequence(): readonly CanonicalVoiceStage[] {
  return CANONICAL_VOICE_SEQUENCE;
}
