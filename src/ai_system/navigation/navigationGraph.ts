/**
 * Ɔkwankyerɛfo Pa - Navigation Graph
 * Declarative state machine graph for telecom IVR banking.
 */

export interface NavigationNode {
  id: string;
  nameEn: string;
  nameTwi: string;
  screen: string;
  parent?: string;
  children: string[];
  allowedBackTarget?: string;
}

export const NAVIGATION_GRAPH: Record<string, NavigationNode> = {
  HOME: {
    id: "HOME",
    nameEn: "Main Menu",
    nameTwi: "Menyu Titiriw",
    screen: "welcome",
    children: ["MOBILE_MONEY", "BANKING", "HELP"],
  },
  MOBILE_MONEY: {
    id: "MOBILE_MONEY",
    nameEn: "Mobile Money Services",
    nameTwi: "Mobile Money Dwumadie",
    screen: "service",
    parent: "HOME",
    children: ["SEND_MONEY", "CHECK_BALANCE", "PAY_BILL", "BUY_AIRTIME", "CASH_OUT"],
    allowedBackTarget: "HOME",
  },
  SEND_MONEY: {
    id: "SEND_MONEY",
    nameEn: "Send Money",
    nameTwi: "Mane Sika",
    screen: "provider",
    parent: "MOBILE_MONEY",
    children: ["NETWORK_SELECT"],
    allowedBackTarget: "MOBILE_MONEY",
  },
  NETWORK_SELECT: {
    id: "NETWORK_SELECT",
    nameEn: "Select Network Carrier",
    nameTwi: "Paw Wo Network",
    screen: "provider",
    parent: "SEND_MONEY",
    children: ["RECIPIENT_INPUT"],
    allowedBackTarget: "SEND_MONEY",
  },
  RECIPIENT_INPUT: {
    id: "RECIPIENT_INPUT",
    nameEn: "Enter Recipient",
    nameTwi: "Bɔ Nɔmba",
    screen: "recipient",
    parent: "NETWORK_SELECT",
    children: ["RECIPIENT_KYC"],
    allowedBackTarget: "NETWORK_SELECT",
  },
  RECIPIENT_KYC: {
    id: "RECIPIENT_KYC",
    nameEn: "KYC Name Verification",
    nameTwi: "Din Ka Peefe",
    screen: "kyc",
    parent: "RECIPIENT_INPUT",
    children: ["AMOUNT_INPUT"],
    allowedBackTarget: "RECIPIENT_INPUT",
  },
  AMOUNT_INPUT: {
    id: "AMOUNT_INPUT",
    nameEn: "Enter Cedi Amount",
    nameTwi: "Sika Dodow (Cedi)",
    screen: "amount",
    parent: "RECIPIENT_KYC",
    children: ["TRANSACTION_CONFIRM"],
    allowedBackTarget: "RECIPIENT_KYC",
  },
  TRANSACTION_CONFIRM: {
    id: "TRANSACTION_CONFIRM",
    nameEn: "Confirm Transfer",
    nameTwi: "Bammbɔ Nkaebɔ",
    screen: "confirm",
    parent: "AMOUNT_INPUT",
    children: ["SECURE_AUTHENTICATION"],
    allowedBackTarget: "AMOUNT_INPUT",
  },
  SECURE_AUTHENTICATION: {
    id: "SECURE_AUTHENTICATION",
    nameEn: "Zero-PIN Handset Handoff",
    nameTwi: "Fon Screen MoMo PIN",
    screen: "zero_pin",
    parent: "TRANSACTION_CONFIRM",
    children: ["TRANSACTION_RESULT"],
    allowedBackTarget: "TRANSACTION_CONFIRM",
  },
  TRANSACTION_RESULT: {
    id: "TRANSACTION_RESULT",
    nameEn: "Spoken Receipt",
    nameTwi: "Nne Nkaedum",
    screen: "receipt",
    parent: "SECURE_AUTHENTICATION",
    children: ["HOME"],
  },
  CHECK_BALANCE: {
    id: "CHECK_BALANCE",
    nameEn: "Check Account Balance",
    nameTwi: "Hwɛ Wo Balance",
    screen: "zero_pin",
    parent: "MOBILE_MONEY",
    children: ["HOME"],
    allowedBackTarget: "MOBILE_MONEY",
  },
  PAY_BILL: {
    id: "PAY_BILL",
    nameEn: "Pay Utilities & Bills",
    nameTwi: "Tua Bill Dwumadie",
    screen: "service",
    parent: "MOBILE_MONEY",
    children: ["HOME"],
    allowedBackTarget: "MOBILE_MONEY",
  },
  BUY_AIRTIME: {
    id: "BUY_AIRTIME",
    nameEn: "Buy Airtime & Data",
    nameTwi: "Tɔ Airtime / Bundle",
    screen: "service",
    parent: "MOBILE_MONEY",
    children: ["HOME"],
    allowedBackTarget: "MOBILE_MONEY",
  },
  HELP: {
    id: "HELP",
    nameEn: "Customer Care & Voice Guidance",
    nameTwi: "Mmoa Menyu",
    screen: "welcome",
    parent: "HOME",
    children: ["HOME"],
    allowedBackTarget: "HOME",
  },
};
