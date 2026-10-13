import { GhanaianNetwork } from "./validation";

export const SERVICE_CAPABILITIES = {
  banking: { available: false },
  sendMoney: {
    available: true,
    networks: ["MTN"] as GhanaianNetwork[],
  },
  checkBalance: { available: false },
  buyAirtime: { available: false },
  buyData: { available: false },
  billPayment: { available: false },
  cashOut: { available: false },
} as const;

export const SUPPORTED_TRANSFER_NETWORKS = SERVICE_CAPABILITIES.sendMoney.networks;
