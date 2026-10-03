export interface ConfirmationPromptInput {
  language: "en" | "twi";
  recipient: {
    phone: string;
    name?: string | null;
    verified?: boolean;
  };
  amount: number;
  reference: string;
  timestamp: Date;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function phoneSuffix(phone: string): string {
  const cleaned = (phone || "").replace(/[^0-9]/g, "");
  return cleaned.length >= 4 ? cleaned.slice(-4) : cleaned;
}

export function buildConfirmationPrompt(input: ConfirmationPromptInput): string {
  const safeAmount = Number(input.amount || 0);
  const suffix = phoneSuffix(input.recipient.phone);
  const verified = input.recipient.verified !== false;
  const name = input.recipient.name && input.recipient.name !== "Unknown subscriber" ? input.recipient.name : "recipient";
  const ref = input.reference || "OKP-000000";
  const stamp = formatTimestamp(input.timestamp || new Date());

  if (!verified) {
    return input.language === "twi"
      ? `Woama sika no nkyɛrɛ no yɛ unverified. Worepɛ sɛ wotwe nɔmba a ɛwɔ awiei ${suffix} no ho na wohwɛ sika a ɛyɛ ${safeAmount} bio ansa na wocɔnfirm. Mma sɛnɛ a, mia baako (1) ma confirm again.`
      : `The recipient is unverified. Please confirm the last four digits ${suffix} and the amount ${safeAmount} again before sending. To confirm again, press 1.`;
  }

  return input.language === "twi"
    ? `Wowɔ akyea sɛ wopɛ sɛ wowɔ ${safeAmount} Ghana Cedis kɔ ${name} nɔmba a ɛwo awiei ${suffix} no so. Reference no yɛ ${ref}. Nnawɔtwe no yɛ ${stamp}. Sɛ wowɔ akyea a, mia baako (1).`
    : `You are about to send ${safeAmount} Ghana Cedis to ${name}, whose number ends in ${suffix}. Transaction reference ${ref}. Timestamp ${stamp}. To confirm this transfer, press 1.`;
}
