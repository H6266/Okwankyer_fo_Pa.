/**
 * Ɔkwankyerɛfo Pa - Intent Taxonomy (intentTaxonomy.ts)
 * 
 * Central registry of ALL intents the product will ever support,
 * both currently implemented and future unbuilt roadmap features.
 */

import { IntentId, SlotSpec } from './types';

export interface IntentMetadata {
  id: IntentId;
  name: string;
  description: string;
  category: 'momo' | 'general' | 'fallback';
  requiredSlots: SlotSpec[];
  optionalSlots: SlotSpec[];
  keywords: {
    en: string[];
    twi: string[];
  };
}

export const ALL_INTENTS: Record<IntentId, IntentMetadata> = {
  'momo.transfer': {
    id: 'momo.transfer',
    name: 'MoMo Transfer',
    description: 'Direct transfer of Mobile Money funds from subscriber wallet to recipient wallet.',
    category: 'momo',
    requiredSlots: [
      { name: 'amount', type: 'amount', required: true, description: 'Transaction amount in GHS' },
      { name: 'recipient', type: 'recipient', required: true, description: 'Recipient information with phone number' },
    ],
    optionalSlots: [
      { name: 'network', type: 'network', required: false, description: 'Recipient telecom carrier network' },
    ],
    keywords: {
      en: ['send', 'transfer', 'money', 'pay money', 'cedis', 'momo send'],
      twi: ['mane', 'kɔma', 'sika', 'send sika', 'cedi', 'me pɛ sɛ me mane'],
    },
  },

  'momo.check_balance': {
    id: 'momo.check_balance',
    name: 'MoMo Check Balance',
    description: 'Inquiry into subscriber current wallet balance. (Directs to official *170# PIN channel).',
    category: 'momo',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: ['balance', 'check balance', 'wallet balance', 'how much do i have', 'remaining'],
      twi: ['akontaabu', 'sika dodoɔ', 'hwɛ balance', 'sika a aka', 'check balance'],
    },
  },

  'momo.buy_airtime': {
    id: 'momo.buy_airtime',
    name: 'MoMo Buy Airtime',
    description: 'Purchase cellular phone credit / airtime top-up for self or another phone number.',
    category: 'momo',
    requiredSlots: [
      { name: 'amount', type: 'amount', required: true, description: 'Airtime purchase amount in GHS' },
      { name: 'recipientPhone', type: 'phone', required: true, description: 'Target phone number for airtime top-up' },
    ],
    optionalSlots: [
      { name: 'network', type: 'network', required: false, description: 'Telecom network operator' },
    ],
    keywords: {
      en: ['airtime', 'credit', 'top up', 'recharge', 'buy credit', 'phone credit'],
      twi: ['kɔkɔɔ', 'tɔ airtime', 'tɔ credit', 'credit', 'recharge'],
    },
  },

  'momo.pay_bill': {
    id: 'momo.pay_bill',
    name: 'MoMo Pay Bill',
    description: 'Payment for utility bills such as ECG electricity, GWCL water, or pay-TV subscriptions.',
    category: 'momo',
    requiredSlots: [
      { name: 'biller', type: 'string', required: true, description: 'Biller entity (e.g. ECG, GWCL, DStv)' },
      { name: 'accountNumber', type: 'string', required: true, description: 'Meter or utility account number' },
      { name: 'amount', type: 'amount', required: true, description: 'Bill payment amount in GHS' },
    ],
    optionalSlots: [],
    keywords: {
      en: ['bill', 'pay bill', 'electricity', 'ecg', 'water', 'gwcl', 'dstv', 'light bill'],
      twi: ['tua bill', 'ecg', 'kanea', 'nsuo', 'gwcl', 'tua ka'],
    },
  },

  'momo.buy_data': {
    id: 'momo.buy_data',
    name: 'MoMo Buy Data Bundle',
    description: 'Purchase internet data bundle packages for mobile handset.',
    category: 'momo',
    requiredSlots: [
      { name: 'amount', type: 'amount', required: true, description: 'Bundle cost in GHS' },
    ],
    optionalSlots: [],
    keywords: {
      en: ['buy data', 'data bundle', 'internet bundle', 'internet', 'bundle', 'megabytes', 'gigabytes', 'wifi bundle'],
      twi: ['tɔ data', 'data bundle', 'intanɛt', 'bundle', 'tɔ bundle'],
    },
  },

  'momo.reverse_transaction': {
    id: 'momo.reverse_transaction',
    name: 'MoMo Reverse Transaction',
    description: 'Request reversal for wrong transaction or money sent to wrong phone number.',
    category: 'momo',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: ['reverse', 'reverse transaction', 'wrong number', 'wrong transfer', 'sent by mistake', 'refund money', 'reversal'],
      twi: ['sesa transaction', 'nɔmba mfomsoɔ', 'san fa sika', 'reverse', 'mfomsoɔ'],
    },
  },

  'momo.customer_care': {
    id: 'momo.customer_care',
    name: 'MoMo Customer Care Support',
    description: 'Connect subscriber with human customer care service or telco support desk.',
    category: 'momo',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: ['customer care', 'agent', 'support', 'human', 'representative', 'help desk', 'talk to agent', 'speak to person'],
      twi: ['customer care', 'kasa kyerɛ agent', 'panin', 'customer service', 'obi nka me ho'],
    },
  },

  'momo.loan': {
    id: 'momo.loan',
    name: 'MoMo QwickLoan & Credit',
    description: 'Apply for microloan or advance mobile money credit.',
    category: 'momo',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: ['loan', 'quick loan', 'borrow money', 'qwickloan', 'bemu', 'borrow'],
      twi: ['bosea', 'gye bosea', 'loan', 'qwickloan', 'fɛm me sika'],
    },
  },

  'smalltalk': {
    id: 'smalltalk',
    name: 'Conversational Smalltalk & Assistance',
    description: 'Polite greetings, conversational inquiries, navigation, help, or small talk.',
    category: 'general',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: ['hello', 'hi', 'good morning', 'good afternoon', 'how are you', 'help', 'what can you do', 'thank you'],
      twi: ['akwaaba', 'mepa wo kyɛw', 'maakye', 'maaha', 'yoo', 'medaase', 'boa me', 'ɛte sɛn'],
    },
  },

  'unknown': {
    id: 'unknown',
    name: 'Unknown Intent',
    description: 'Unrecognized intent or speech that cannot be classified with sufficient confidence.',
    category: 'fallback',
    requiredSlots: [],
    optionalSlots: [],
    keywords: {
      en: [],
      twi: [],
    },
  },
};

export function getIntentMetadata(intentId: IntentId): IntentMetadata {
  return ALL_INTENTS[intentId] || ALL_INTENTS.unknown;
}

export function isValidIntentId(id: string): id is IntentId {
  return id in ALL_INTENTS;
}
