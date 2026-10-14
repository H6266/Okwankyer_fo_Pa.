/**
 * Ɔkwankyerɛfo Pa - Approved Reply Templates Repository
 * (src/ai_system/brain/replyTemplates.ts)
 * 
 * Curated bilingual templates across English, Asante Twi,
 * Akuapem Twi, and Ghanaian Code-Switched (Mixed Twi-English).
 * 
 * INVARIANT: Every template has an approved flag (default false) until
 * signed off by native language specialists.
 * 
 * INVARIANT: Anything with amount, recipient, or payment status MUST use
 * an approved template from this file. Free-form translation is forbidden
 * for transactions and confirmations.
 */

import { LanguageId, ReplyKind } from './types';
import { languagePolicyConfig } from './languagePolicy';
import { approvalWorkflow } from './approvalWorkflow';

export interface TemplateConfig {
  allowUnapprovedTemplates: boolean;
}

export const templateConfig: TemplateConfig = {
  // In production, unapproved templates must never be spoken (defaults to false in prod)
  allowUnapprovedTemplates: process.env.NODE_ENV !== 'production',
};

export function setAllowUnapprovedTemplates(allowed: boolean): void {
  templateConfig.allowUnapprovedTemplates = allowed;
}

export interface ApprovedTemplateDefinition {
  key: string;
  kind: ReplyKind;
  approved: boolean; // default false pending native speaker verification
  requiresPlaceholders?: string[];
  studioPromptIds?: Partial<Record<LanguageId, string>>;
  texts: Record<LanguageId, string>;
}

export const APPROVED_REPLY_TEMPLATES: Record<string, ApprovedTemplateDefinition> = {
  confirm: {
    key: 'confirm',
    kind: 'confirm',
    approved: false,
    requiresPlaceholders: ['{amount}', '{recipient}'],
    texts: {
      'en': 'Do you confirm sending {amount} to {recipient}?',
      'twi-asante': 'Wopene so sɛ yɛmmane {amount} nkɔma {recipient}?',
      'mixed-twi-en': 'Wopene so sɛ yɛsend {amount} kɔma {recipient}?',
      'twi-akuapem': 'Wopene so sɛ yɛnsoma {amount} nkɔma {recipient}?',
    },
  },
  clarify_slot_amount: {
    key: 'clarify_slot_amount',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'How many Ghana cedis do you want to send?',
      'twi-asante': 'Sika dodoɔ sɛn na wopɛ sɛ womane?',
      'mixed-twi-en': 'Cedis sɛn na wopɛ sɛ wosend?',
      'twi-akuapem': 'Sika dodoɔ ahe na wopɛ sɛ wosoma?',
    },
  },
  clarify_slot_recipient: {
    key: 'clarify_slot_recipient',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'What is the phone number of the person you are sending to?',
      'twi-asante': 'Fon nɔma bɛn na wopɛ sɛ womane sika no kɔ so?',
      'mixed-twi-en': 'Number bɛn na wopɛ sɛ wosend sika no kɔ so?',
      'twi-akuapem': 'Fon nɔma bɛn na wopɛ sɛ wosoma sika no kɔ so?',
    },
  },
  dispatch: {
    key: 'dispatch',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'We have sent an authorization prompt to your handset. Please approve on your phone.',
      'twi-asante': 'Yɛamana nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
      'mixed-twi-en': 'Yɛasend prompt no kɔ wo phone so. Please bɔ wo PIN wɔ wo fon no so.',
      'twi-akuapem': 'Yɛasoma nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
    },
  },
  zero_pin: {
    key: 'zero_pin',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Never speak your Mobile Money PIN. You will enter it privately on your phone.',
      'twi-asante': 'Mfa wo PIN nka ano da. Bɔ wo PIN wɔ wo fon no so sɛ nkratoɔ no ba a.',
      'mixed-twi-en': 'Never speak your PIN. Bɔ wo PIN wɔ wo phone so sɛ prompt no ba a.',
      'twi-akuapem': 'Mfa wo PIN nka ano da. Bɔ wo PIN wɔ wo fon no so sɛ nkratoɔ no ba a.',
    },
  },
  not_ready_dial_170_check_balance: {
    key: 'not_ready_dial_170_check_balance',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'To protect your PIN, please dial star, one, seven, zero, hash to check your balance.',
      'twi-asante': 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
      'mixed-twi-en': 'Bɔ star, one, seven, zero, hash wɔ wo fon so na hwɛ wo balance.',
      'twi-akuapem': 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
    },
  },
  not_ready_buy_data: {
    key: 'not_ready_buy_data',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Data bundle purchasing is not ready yet. You can still send money right now.',
      'twi-asante': 'Data bundle tɔ dwumadie no nnya nnsiesieeɛ, nanso wotumi mane sika seesei ara.',
      'mixed-twi-en': 'Data bundle feature no nready ɛnnɛ, nanso wotumi send money seesei ara.',
      'twi-akuapem': 'Data bundle tɔ dwumadie no nnya nnsiesieeɛ, nanso wotumi soma sika seesei ara.',
    },
  },
  not_ready_reverse_transaction: {
    key: 'not_ready_reverse_transaction',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Transaction reversal is not ready yet. Please contact customer care for assistance.',
      'twi-asante': 'Sika a yɛsesa no nnya nnsiesieeɛ. Mepa wo kyɛw frɛ customer care mmoa.',
      'mixed-twi-en': 'Reversal feature no nready ɛnnɛ. Please contact customer care.',
      'twi-akuapem': 'Sika a yɛsesa no nnya nnsiesieeɛ. Mepa wo kyɛw frɛ customer care mmoa.',
    },
  },
  not_ready_customer_care: {
    key: 'not_ready_customer_care',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Customer care connection is not ready yet. Please dial 100 on your handset.',
      'twi-asante': 'Customer care dwumadie no nnya nnsiesieeɛ. Mepa wo kyɛw bɔ baako hwee hwee wɔ wo fon so.',
      'mixed-twi-en': 'Customer care no nready ɛnnɛ. Please dial 100 wɔ wo phone so.',
      'twi-akuapem': 'Customer care dwumadie no nnya nnsiesieeɛ. Mepa wo kyɛw bɔ baako hwee hwee wɔ wo fon so.',
    },
  },
  not_ready_loan: {
    key: 'not_ready_loan',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Mobile Money loan requests are not ready yet. You can still send money right now.',
      'twi-asante': 'Bosea gye dwumadie no nnya nnsiesieeɛ, nanso wotumi mane sika seesei ara.',
      'mixed-twi-en': 'Loan feature no nready ɛnnɛ, nanso wotumi send money seesei ara.',
      'twi-akuapem': 'Bosea gye dwumadie no nnya nnsiesieeɛ, nanso wotumi soma sika seesei ara.',
    },
  },
  filler_hold: {
    key: 'filler_hold',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'One moment please, processing your request.',
      'twi-asante': 'Twɛn kakra, mepa wo kyɛw yɛresiesie wo dwumadie no.',
      'mixed-twi-en': 'One moment please, twɛn kakra.',
      'twi-akuapem': 'Twɛn kakra, mepa wo kyɛw yɛreyɛ wo dwumadie no.',
    },
  },
  not_ready_default: {
    key: 'not_ready_default',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'That feature is not ready yet. You can still send money right now.',
      'twi-asante': 'Saa dwumadie no nnya nnsiesieeɛ, nanso wotumi mane sika seesei ara.',
      'mixed-twi-en': 'Saa feature no nready ɛnnɛ, nanso wotumi send money seesei ara.',
      'twi-akuapem': 'Saa dwumadie no nnya nnsiesieeɛ, nanso wotumi soma sika seesei ara.',
    },
  },
  not_ready_dial_170_buy_data: {
    key: 'not_ready_dial_170_buy_data',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Internet data bundles are not ready yet. Please dial star, one, seven, zero, hash on your handset to buy data.',
      'twi-asante': 'Data bundle dwumadie no nnya nnsiesieeɛ. Mepa wo kyɛw bɔ star, baako, nson, hwee, hash wɔ wo fon so na tɔ data.',
      'mixed-twi-en': 'Data bundle nready ɛnnɛ. Please dial star, one, seven, zero, hash on your phone to buy data.',
      'twi-akuapem': 'Data bundle dwumadie no nnya nnsiesieeɛ. Mepa wo kyɛw bɔ star, baako, nson, hwee, hash wɔ wo fon so na tɔ data.',
    },
  },
  not_ready_dial_100_reversal: {
    key: 'not_ready_dial_100_reversal',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Transaction reversal is not available here. Please call customer care on one zero zero for reversal assistance.',
      'twi-asante': 'Sika a wopɛ sɛ wosesa no nni ha. Mepa wo kyɛw frɛ customer care wɔ baako, hwee, hwee na wɔmmoa wo.',
      'mixed-twi-en': 'Reversal nni ha. Please call customer care on one zero zero for help.',
      'twi-akuapem': 'Sika a wopɛ sɛ wosesa no nni ha. Mepa wo kyɛw frɛ customer care wɔ baako, hwee, hwee na wɔmmoa wo.',
    },
  },
  not_ready_dial_100_customer_care: {
    key: 'not_ready_dial_100_customer_care',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'To speak with customer care, please dial one zero zero on your phone.',
      'twi-asante': 'Sɛ wopɛ sɛ wokasa kyerɛ customer care a, mepa wo kyɛw frɛ baako, hwee, hwee wɔ wo fon so.',
      'mixed-twi-en': 'Sɛ wopɛ sɛ wokasa kyerɛ customer care a, please dial one zero zero on your phone.',
      'twi-akuapem': 'Sɛ wopɛ sɛ wokasa kyerɛ customer care a, mepa wo kyɛw frɛ baako, hwee, hwee wɔ wo fon so.',
    },
  },
  not_ready_dial_170_loan: {
    key: 'not_ready_dial_170_loan',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'Loans are not supported on this voice service. Please dial star, one, seven, zero, hash to apply for a loan.',
      'twi-asante': 'Bosea dwumadie no nni ha. Mepa wo kyɛw bɔ star, baako, nson, hwee, hash wɔ wo fon so na gye bosea.',
      'mixed-twi-en': 'Loan nni ha. Please dial star, one, seven, zero, hash on your phone to apply for loan.',
      'twi-akuapem': 'Bosea dwumadie no nni ha. Mepa wo kyɛw bɔ star, baako, nson, hwee, hash wɔ wo fon so na gye bosea.',
    },
  },
  welcome_language_select: {
    key: 'welcome_language_select',
    kind: 'smalltalk',
    approved: false,
    studioPromptIds: { 'en': 'en-01', 'twi-asante': 'tw-01' },
    texts: {
      'en': 'Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.',
      'twi-asante': 'Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.',
      'mixed-twi-en': 'Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.',
      'twi-akuapem': 'Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.',
    },
  },
  service_select: {
    key: 'service_select',
    kind: 'clarify_intent',
    approved: false,
    studioPromptIds: { 'en': 'en-02', 'twi-asante': 'tw-03' },
    texts: {
      'en': 'For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.',
      'twi-asante': 'Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.',
      'mixed-twi-en': 'Sɛ wopɛ sɛ wosend sika kɔ MoMo a, mia baako. Sikakorabea dwumadie no, mia mmienu.',
      'twi-akuapem': 'Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.',
    },
  },
  network_select: {
    key: 'network_select',
    kind: 'clarify_slot',
    approved: false,
    studioPromptIds: { 'en': 'en-03', 'twi-asante': 'tw-02' },
    texts: {
      'en': 'Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.',
      'twi-asante': 'Afei selecte wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia anan na tie wei biom. Mia zero na si ha.',
      'mixed-twi-en': 'Select wo network. MTN, press 1. Telecel, press 2. AirtelTigo, press 3.',
      'twi-akuapem': 'Afei paw wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa.',
    },
  },
  network_select_alt: {
    key: 'network_select_alt',
    kind: 'clarify_slot',
    approved: false,
    studioPromptIds: { 'en': 'en-04' },
    texts: {
      'en': 'Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again, or 0 to exit.',
      'twi-asante': 'Afei selecte wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa.',
      'mixed-twi-en': 'Select wo network. MTN press 1, Telecel press 2, AirtelTigo press 3.',
      'twi-akuapem': 'Afei paw wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa.',
    },
  },
  momo_menu: {
    key: 'momo_menu',
    kind: 'clarify_intent',
    approved: false,
    studioPromptIds: { 'en': 'en-05', 'twi-asante': 'tw-04' },
    texts: {
      'en': 'To send money to a mobile money user, press 1. To pay utility bills, press 2. To buy airtime or internet bundle, press 3. To allow cash-out, press 4. To check account status, press 5. Press 8 to go back, or 0 to exit.',
      'twi-asante': 'Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3. Sɛ wopɛ sɛ woallow-i cash out a, mia 4. Sɛ wopɛ sɛ wocheck-i wo account no a, mia 5. Mia 8 na kɔ back. Mia 0 na firi ha.',
      'mixed-twi-en': 'Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3.',
      'twi-akuapem': 'Sɛ wopɛ sɛ wosoma sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3.',
    },
  },
  enter_recipient_phone: {
    key: 'enter_recipient_phone',
    kind: 'clarify_slot',
    approved: false,
    studioPromptIds: { 'en': 'en-06', 'twi-asante': 'tw-05' },
    texts: {
      'en': 'Please enter the ten-digit mobile phone number of the recipient, followed by hash. Press 0 to go back.',
      'twi-asante': 'Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho. Mia zero na san akyi.',
      'mixed-twi-en': 'Enter recipient phone number na fa hash ka ho. Press 0 to go back.',
      'twi-akuapem': 'Afei, bɔ nɔmba no a wopɛ sɛ wosoma sika no kɔ so no. Wowie a, fa hash ka ho.',
    },
  },
  demo_recipient_digits: {
    key: 'demo_recipient_digits',
    kind: 'confirm',
    approved: false,
    studioPromptIds: { 'en': 'en-07' },
    texts: {
      'en': 'You entered 0 5 5 3 8 3 8 4 6 4. If this is correct, press 1. To re-enter, press 2.',
      'twi-asante': 'Wobɔɔ nɔmba hwee enum enum mmiɛnsa nwɔtwe mmiɛnsa nwɔtwe ɛnan nsia ɛnan. Sɛ ɛyɛ pɛpɛɛpɛ a, mia baako.',
      'mixed-twi-en': 'You entered 0 5 5 3 8 3 8 4 6 4. Sɛ ɛyɛ correct a, mia 1.',
      'twi-akuapem': 'Wobɔɔ nɔmba hwee enum enum mmiɛnsa nwɔtwe mmiɛnsa nwɔtwe ɛnan nsia ɛnan. Sɛ ɛyɛ pɛpɛɛpɛ a, mia baako.',
    },
  },
  verify_recipient_name: {
    key: 'verify_recipient_name',
    kind: 'confirm',
    approved: false,
    studioPromptIds: { 'en': 'en-08', 'twi-asante': 'tw-06' },
    texts: {
      'en': 'You are about to send money to Kwame Nyamebere on phone number ending with 8464. If this name matches, press 1. To cancel, press 2. To exit, press 0.',
      'twi-asante': 'Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, anaa number 8464 ɛna ɛtɔ. Sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako (1). Sɛ wo pɛ sɛ wo cancel a mia mmienu (2). Sɛ wo pɛ sɛ wo firi mu a mia zero (0).',
      'mixed-twi-en': 'You are sending money to Kwame Nyamebere. Sɛ ɛyɛ a, press 1. To cancel, press 2.',
      'twi-akuapem': 'Worebɛsoma sika akɔ Kwame Nyamebere nɔmba a ɛwie 8464 so. Sɛ ɛyɛ nokware a, mia baako.',
    },
  },
  enter_amount_cedis: {
    key: 'enter_amount_cedis',
    kind: 'clarify_slot',
    approved: false,
    studioPromptIds: { 'en': 'en-09', 'twi-asante': 'tw-07' },
    texts: {
      'en': 'Please enter the amount in Ghana Cedis that you want to send, followed by hash. Press 0 to go back.',
      'twi-asante': 'Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to.',
      'mixed-twi-en': 'Enter amount in Ghana cedis na fa hash ka ho.',
      'twi-akuapem': 'Mepa wo kyɛw, bɔ sika dodoɔ a wopɛ sɛ wosoma no, fa hash ka ho.',
    },
  },
  confirm_transfer_summary: {
    key: 'confirm_transfer_summary',
    kind: 'confirm',
    approved: false,
    studioPromptIds: { 'en': 'en-10', 'twi-asante': 'tw-08' },
    texts: {
      'en': 'You are about to send 500 Ghana cedis to Kwame Nyamebere. To confirm and proceed, press 1. To cancel, press 2.',
      'twi-asante': "Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2).",
      'mixed-twi-en': 'Worebɛsend 500 cedis kɔma Kwame Nyamebere. To confirm, press 1. To cancel, press 2.',
      'twi-akuapem': 'Worebɛsoma 500 Ghana cedis akɔ Kwame Nyamebere so. Sɛ wopene so a, mia baako.',
    },
  },
  zero_pin_handoff: {
    key: 'zero_pin_handoff',
    kind: 'clarify_slot',
    approved: false,
    studioPromptIds: { 'en': 'en-11', 'twi-asante': 'tw-09' },
    texts: {
      'en': 'For your security, please approve the transaction on your phone. Do not speak your PIN.',
      'twi-asante': 'Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN.',
      'mixed-twi-en': 'Please approve the transaction on your phone. Bɔ wo MoMo PIN wɔ wo phone so.',
      'twi-akuapem': 'Mepa wo kyɛw gye dwumadie no to mu wɔ wo fon so. Mfa wo PIN nka ano.',
    },
  },
  receipt_summary: {
    key: 'receipt_summary',
    kind: 'confirm',
    approved: false,
    studioPromptIds: { 'en': 'en-12', 'twi-asante': 'tw-10' },
    texts: {
      'en': 'Congratulations! You have successfully sent 500 Ghana cedis to Kwame Nyamebere. Your transaction was completed on 17 September 2026 at 5:00 PM. Your reference number is OKP-847291. Your transaction details have also been sent to you. Would you like to do anything else?',
      'twi-asante': 'Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed wɔ 17th September 2026...',
      'mixed-twi-en': 'Congratulations! W\'atumi asend 500 Ghana cedis kɔma Kwame Nyamebere. Reference number ne OKP-847291.',
      'twi-akuapem': 'Mo ne yɔ! Woatumi asoma 500 Ghana cedis akɔ Kwame Nyamebere nɔmba so.',
    },
  },
  cancellation_not_available: {
    key: 'cancellation_not_available',
    kind: 'smalltalk',
    approved: false,
    studioPromptIds: { 'twi-asante': 'tw-11' },
    texts: {
      'en': 'This option is not available right now. Thank you for using Okwankyerefo Pa. Goodbye.',
      'twi-asante': 'Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye.',
      'mixed-twi-en': 'Option yi nni hɔ bio. Medaase sɛ wode Ɔkwankyerɛfo Pa dii dwuma.',
      'twi-akuapem': 'Mpanimfoɔ, fakyɛ yɛn sɛ dwumadie yi nni hɔ bio. Yɛda ase. Nante yiye.',
    },
  },
  closing_signoff: {
    key: 'closing_signoff',
    kind: 'smalltalk',
    approved: false,
    studioPromptIds: { 'en': 'en-13', 'twi-asante': 'tw-12' },
    texts: {
      'en': 'Thank you for using Ɔkwankyerɛfo Pa. Goodbye.',
      'twi-asante': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie.',
      'mixed-twi-en': 'Thank you for using Ɔkwankyerɛfo Pa. Nante yie.',
      'twi-akuapem': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yiye.',
    },
  },
  clarify_intent: {
    key: 'clarify_intent',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'Do you want to send money or check something else?',
      'twi-asante': 'Wopɛ sɛ womane sika anaa biribi foforɔ na wopɛ?',
      'mixed-twi-en': 'Wopɛ sɛ wosend money anaa biribi foforɔ?',
      'twi-akuapem': 'Wopene so sɛ wosoma sika anaa biribi foforɔ na wopɛ?',
    },
  },
  smalltalk: {
    key: 'smalltalk',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Welcome to Okwankyerefo Pa. Tell me who you want to send money to.',
      'twi-asante': 'Akwaaba Ɔkwankyerɛfo Pa. Ka obi a wopɛ sɛ womane no sika kyerɛ me.',
      'mixed-twi-en': 'Akwaaba. Ka obi a wopɛ sɛ wosend sika kɔma no kyerɛ me.',
      'twi-akuapem': 'Akwaaba Ɔkwankyerɛfo Pa. Ka obi a wopɛ sɛ wosoma no sika kyerɛ me.',
    },
  },
  error_offline: {
    key: 'error_offline',
    kind: 'error',
    approved: false,
    texts: {
      'en': 'I did not catch that. Please tell me who you want to send money to.',
      'twi-asante': 'Mente aseɛ yie. Mepa wo kyɛw ka obi a wopɛ sɛ womane no sika.',
      'mixed-twi-en': 'Mente aseɛ yie. Please ka obi a wopɛ sɛ wosend sika kɔma no.',
      'twi-akuapem': 'Mente ase yiye. Mepa wo kyɛw ka obi a wopɛ sɛ wosoma no sika.',
    },
  },
  // ── 26 STUDIO-RECORDED AUDIO PROMPTS ──────────────────────────────────────
  studio_welcome_bilingual: {
    key: 'studio_welcome_bilingual',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Welcome to Okwanchofapa, an easy financial transaction service. For English, press 1. For Twi, press 2.',
      'twi-asante': 'Akwaaba kɔ Ɔkwankyerɛfo Pa, sika ho dwumadie a ɛnyɛ den. Sɛ wopɛ Borɔfo a, mia baako. Sɛ wopɛ Twi a, mia mmienu.',
      'mixed-twi-en': 'Welcome to Okwanchofapa. For English, press 1. For Twi, press 2.',
      'twi-akuapem': 'Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ Borɔfo a, mia baako. Sɛ wopɛ Twi a, mia mmienu.',
    },
  },
  studio_en_service_select: {
    key: 'studio_en_service_select',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'For Telecom mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.',
      'twi-asante': 'Telecom anaa Mobile Money dwumadie no, mia baako. Sikakorabea dwumadie no, mia mmienu. Sɛ wopɛ sɛ wote wei bio a, mia nkron. Sɛ wopɛ sɛ wofiri mu a, mia hwee.',
      'mixed-twi-en': 'Telecom mobile money services, press 1. Banking services, press 2. To hear again, press 9. To exit, press 0.',
      'twi-akuapem': 'Telecom anaa Mobile Money dwumadie no, mia baako. Sikakorabea dwumadie no, mia mmienu.',
    },
  },
  studio_en_network_select: {
    key: 'studio_en_network_select',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again. Press 0 to exit.',
      'twi-asante': 'Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako. Sɛ ɛyɛ Telecel a, mia mmienu. Sɛ ɛyɛ AirtelTigo a, mia mmiensa.',
      'mixed-twi-en': 'Select network. MTN press 1, Telecel press 2, AirtelTigo press 3. Repeat press 9, exit press 0.',
      'twi-akuapem': 'Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako. Sɛ ɛyɛ Telecel a, mia mmienu.',
    },
  },
  studio_en_network_select_alt: {
    key: 'studio_en_network_select_alt',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3. Press 9 to hear this again or 0 to exit.',
      'twi-asante': 'Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako. Sɛ ɛyɛ Telecel a, mia mmienu. Sɛ ɛyɛ AirtelTigo a, mia mmiensa.',
      'mixed-twi-en': 'Select your network: 1 MTN, 2 Telecel, 3 AirtelTigo, 9 repeat, 0 exit.',
      'twi-akuapem': 'Yi wo nkitahodi dwumakuo no. Sɛ ɛyɛ MTN a, mia baako.',
    },
  },
  studio_en_momo_menu: {
    key: 'studio_en_momo_menu',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'MTN services. To send money to another MoMo user, press 1. To pay bills, press 2. To buy airtime or bundle, press 3. To allow cash out, press 4. To check your account, press 5. Press 8 to go back or 0 to exit.',
      'twi-asante': 'MTN dwumadie. Sɛ wopɛ sɛ womena sika ma obi a ɔde MoMo a, mia baako. Sɛ wopɛ sɛ wotua ka bi a, mia mmienu. Sɛ wopɛ sɛ wotɔ nkitahodi anaa data a, mia mmiensa.',
      'mixed-twi-en': 'MTN services. Send money to MoMo user press 1, pay bills press 2, buy airtime/bundle press 3, allow cash out press 4, check account press 5.',
      'twi-akuapem': 'MTN dwumadie. Sɛ wopɛ sɛ wosoma sika a, mia baako.',
    },
  },
  studio_en_enter_recipient: {
    key: 'studio_en_enter_recipient',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Enter the 10 digit number you want to send money to followed by hash. Press 0 to exit.',
      'twi-asante': 'Bɔ nɔma du a wopɛ sɛ womena sika no ma no, na afei mia hash. Mia hwee sɛ wofiri mu.',
      'mixed-twi-en': 'Enter the 10 digit number followed by hash. Press 0 to exit.',
      'twi-akuapem': 'Bɔ nɔma du a wopɛ sɛ wosoma sika no ma no, na afei mia hash.',
    },
  },
  studio_en_demo_recipient_digits: {
    key: 'studio_en_demo_recipient_digits',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': '0 2 4 1 2 3 4 5 6 7 hash',
      'twi-asante': 'Hwee, mmienu, nan, baako, mmienu, mmiensa, nan, nnum, nsia, nson, hash.',
      'mixed-twi-en': '0 2 4 1 2 3 4 5 6 7 hash',
      'twi-akuapem': 'Hwee, mmienu, nan, baako, mmienu, mmiensa, nan, nnum, nsia, nson, hash.',
    },
  },
  studio_en_confirm_recipient: {
    key: 'studio_en_confirm_recipient',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'You are about to send money to Kwame Nyamebere whose phone number ends with 8464. To confirm and send the money, press 1, to cancel, press 2, to exit completely, press 0.',
      'twi-asante': 'Worebɛmena sika ama Kwame Nyameba a ne nɔma no wie wɔ nan, nnum, nsia, nson. Sɛ wopene so a, mia baako. Sɛ woampene so a, mia mmienu.',
      'mixed-twi-en': 'You are about to send money to Kwame Nyamebere ending with 8464. 1 confirm, 2 cancel, 0 exit.',
      'twi-akuapem': 'Worebɛsoma sika ama Kwame Nyameba a ne nɔma no wie wɔ nan, nnum, nsia, nson.',
    },
  },
  studio_en_enter_amount: {
    key: 'studio_en_enter_amount',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Enter the cedi amount you want to send to Kwame Nyamebere followed by hash. Use star for pesewas.',
      'twi-asante': 'Bɔ Ghana sidi dodoɔ a wopɛ sɛ womena ma Kwame Nyameba, na afei mia hash. Fa nsoromma ma pesewas.',
      'mixed-twi-en': 'Enter the cedi amount followed by hash. Use star for pesewas.',
      'twi-akuapem': 'Bɔ Ghana sidi dodoɔ a wopɛ sɛ wosoma, na afei mia hash.',
    },
  },
  studio_en_confirm_transfer: {
    key: 'studio_en_confirm_transfer',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'You are about to send 500 Ghana Cedis to Kwame Nyamebere. To confirm and send, press 1. To cancel, press 2.',
      'twi-asante': 'Worebɛmena Ghana sidi ahanum ama Kwame Nyameba. Sɛ wopene so sɛ womena a, mia baako. Sɛ woampene so a, mia mmienu.',
      'mixed-twi-en': 'You are about to send 500 Ghana Cedis to Kwame Nyamebere. Press 1 to confirm, 2 to cancel.',
      'twi-akuapem': 'Worebɛsoma Ghana sidi ahanum ama Kwame Nyameba. Sɛ wopene so a, mia baako.',
    },
  },
  studio_en_pin_handoff: {
    key: 'studio_en_pin_handoff',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': "Confirmed. Now, please check your phone's screen and enter your Momo PIN accurately. Thank you for using Okwanso Papa. Goodbye.",
      'twi-asante': 'Woapene so. Afei, yɛsrɛ wo hwɛ wo fon no anim na bɔ wo MoMo PIN pɔtee. Yɛda wo ase sɛ wode Okwankyerɛfo Pa adi dwuma. Nante yie.',
      'mixed-twi-en': 'Confirmed. Check your phone screen and enter your MoMo PIN. Goodbye.',
      'twi-akuapem': 'Woapene so. Afei hwɛ wo fon no anim na bɔ wo MoMo PIN.',
    },
  },
  studio_en_transaction_receipt: {
    key: 'studio_en_transaction_receipt',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'Congratulations, you have successfully sent 500 Ghana Cedis to Kwame Nyamebere. Your transaction was completed. Would you like to do anything else?',
      'twi-asante': 'Mo ne yo! Woatumi amena Ghana sidi ahanum ama Kwame Nyameba. Woawie wo dwumadie no. Wopɛ sɛ woyɛ biribi foforɔ bi bio anaa?',
      'mixed-twi-en': 'Congratulations, you successfully sent 500 Ghana Cedis to Kwame Nyamebere. Would you like to do anything else?',
      'twi-akuapem': 'Mo ne yo! Woatumi asoma Ghana sidi ahanum ama Kwame Nyameba.',
    },
  },
  studio_en_closing: {
    key: 'studio_en_closing',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Thank you for using Okwankyerefo Pa. Goodbye.',
      'twi-asante': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie.',
      'mixed-twi-en': 'Thank you for using Okwankyerefo Pa. Nante yie.',
      'twi-akuapem': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yiye.',
    },
  },
  studio_twi_network_select: {
    key: 'studio_twi_network_select',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'Select your network. For MTN press 1, Telecel press 2, AirtelTigo press 3.',
      'twi-asante': 'Afei select-i wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia nnan na tie wei biom. Mia zero na si ha.',
      'mixed-twi-en': 'Select-i wo network: 1 MTN, 2 Telecel, 3 AirtelTigo, 4 repeat, 0 end.',
      'twi-akuapem': 'Afei yi wo network: MTN baako, Telecel mmienu, AirtelTigo mmiɛnsa.',
    },
  },
  studio_twi_service_select: {
    key: 'studio_twi_service_select',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'To send mobile money press 1, for banking press 2.',
      'twi-asante': 'Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.',
      'mixed-twi-en': 'Send sika kɔ Mobile Money mia 1. Sikakorabea dwumadie mia 2.',
      'twi-akuapem': 'Sɛ wopɛ sɛ wosoma sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu.',
    },
  },
  studio_twi_momo_menu: {
    key: 'studio_twi_momo_menu',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'To send money to a MoMo user press 1, pay bills press 2, buy airtime/bundle press 3, cash out press 4, check account press 5.',
      'twi-asante': 'Sɛ wopɛ sɛ wosend sika kɔ ma momo user, mia 1. Sɛ wopɛ sɛ wotia bɔɔsa, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle, mia 3. Sɛ wopɛ sɛ woallow cash out, mia 4. Sɛ wopɛ sɛ wochecki wo account no, mia 5. Mia 8 na kɔ back. Mia 0 next.',
      'mixed-twi-en': 'Send sika kɔ ma MoMo user mia 1, pay bills mia 2, buy airtime/bundle mia 3, cash out mia 4, check account mia 5.',
      'twi-akuapem': 'Sɛ wopɛ sɛ wosoma sika kɔ ma momo user, mia 1.',
    },
  },
  studio_twi_enter_recipient: {
    key: 'studio_twi_enter_recipient',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Enter the recipient number followed by hash. Press 0 to exit.',
      'twi-asante': 'Afei mobɔ namba no a wopɛ sɛ wosend sika toso no, wie a fa ash ɛka ho. Mia zero na esi ha.',
      'mixed-twi-en': 'Enter recipient number followed by hash. Press 0 to exit.',
      'twi-akuapem': 'Bɔ nɔma no a wopɛ sɛ wosoma sika no gu so no, wie a fa hash ka ho.',
    },
  },
  studio_twi_confirm_recipient: {
    key: 'studio_twi_confirm_recipient',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'You are sending money to Kwame Nyamebere on number ending 8464. Press 1 to confirm, 2 to cancel, 0 to exit.',
      'twi-asante': 'Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, anaa number 8464 ɛna ɛtɔ. Sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako (1). Sɛ wo pɛ sɛ wo cancel a mia mmienu (2). Sɛ wo pɛ sɛ wo firi mu a mia zero (0).',
      'mixed-twi-en': 'Send sika kɔ Kwame Nyamebrɛ number ending 8464. 1 confirm, 2 cancel, 0 exit.',
      'twi-akuapem': 'Worebɛsoma sika kɔ Kwame Nyamebrɛ fɔn so a namba no wie wɔ 8464.',
    },
  },
  studio_twi_enter_amount: {
    key: 'studio_twi_enter_amount',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Please enter the amount in cedis followed by hash. Use star for pesewas.',
      'twi-asante': 'Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to.',
      'mixed-twi-en': 'Please enter amount in cedis followed by hash. Star for pesewas.',
      'twi-akuapem': 'Mepa wo kyɛw, hyɛ sika dodow no mu na fa hash ka ho.',
    },
  },
  studio_twi_confirm_transfer: {
    key: 'studio_twi_confirm_transfer',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'You are about to send 500 Ghana cedis. Press 1 to confirm, 2 to cancel.',
      'twi-asante': 'Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m\'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2).',
      'mixed-twi-en': 'Worebɛsend 500 Ghana cedis. Press 1 to confirm, 2 to cancel.',
      'twi-akuapem': 'Worebɛsoma 500 Ghana cedis. Mia 1 sɛ wopene so, 2 sɛ wompene so.',
    },
  },
  studio_twi_pin_handoff: {
    key: 'studio_twi_pin_handoff',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'Please check your phone screen and enter your MoMo PIN.',
      'twi-asante': 'Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN.',
      'mixed-twi-en': 'Check wo phone screen na bɔ wo MoMo PIN.',
      'twi-akuapem': 'Hwɛ wo fon anim na bɔ wo MoMo PIN.',
    },
  },
  studio_twi_transaction_receipt: {
    key: 'studio_twi_transaction_receipt',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'Congratulations! 500 Ghana Cedis was successfully sent.',
      'twi-asante': 'Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed.',
      'mixed-twi-en': 'Congratulations! 500 Ghana Cedis sent successfully.',
      'twi-akuapem': 'Mo ne yo! Woatumi asoma 500 Ghana Cedis.',
    },
  },
  studio_twi_cancellation: {
    key: 'studio_twi_cancellation',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Transaction cancelled. Thank you for using Okwankyerefo Pa. Goodbye.',
      'twi-asante': 'Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye.',
      'mixed-twi-en': 'Transaction cancelled. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye.',
      'twi-akuapem': 'Yɛatwa mu. Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa dii dwuma.',
    },
  },
  studio_twi_closing: {
    key: 'studio_twi_closing',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Thank you for using Okwankyerefo Pa. Goodbye.',
      'twi-asante': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie.',
      'mixed-twi-en': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Goodbye.',
      'twi-akuapem': 'Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yiye.',
    },
  },
  studio_twi_keypad_amount: {
    key: 'studio_twi_keypad_amount',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Please enter the amount on your phone keypad.',
      'twi-asante': 'Mepa wo kyɛw, fa wo fon keypad no so hyɛ sika dodow no mu.',
      'mixed-twi-en': 'Please enter the amount on your phone keypad.',
      'twi-akuapem': 'Mepa wo kyɛw, fa wo fon keypad no so hyɛ sika dodow no mu.',
    },
  },
};

/**
 * Gets an approved template text for a key and language.
 */
export function getApprovedTemplateText(key: string, language: LanguageId): string {
  const tpl = APPROVED_REPLY_TEMPLATES[key];
  let resolvedLang = language;
  // Item B: Akuapem templates unreachable in production until approved
  if (resolvedLang === 'twi-akuapem' && !languagePolicyConfig.allowUnapprovedDialects) {
    resolvedLang = 'twi-asante';
  }

  if (!tpl) {
    return APPROVED_REPLY_TEMPLATES.smalltalk.texts[resolvedLang] || APPROVED_REPLY_TEMPLATES.smalltalk.texts.en;
  }
  return tpl.texts[resolvedLang] || tpl.texts.en;
}

/**
 * Checks if a template key is an approved registered template.
 */
export function isApprovedTemplateKey(key: string): boolean {
  return Boolean(APPROVED_REPLY_TEMPLATES[key]);
}

/**
 * Enforces rule: Anything involving money movement, confirmations, or slots
 * MUST use an approved template. Free-form translation is disallowed.
 */
export function requiresApprovedTemplate(replyKind: ReplyKind): boolean {
  return replyKind === 'confirm' || replyKind === 'clarify_slot';
}

/**
 * Finds template key from exact or normalized English text.
 */
export function findTemplateKeyByText(textEn: string): string | undefined {
  const norm = textEn.trim().toLowerCase().replace(/[^a-z0-9{} ]/g, '');
  for (const [key, tpl] of Object.entries(APPROVED_REPLY_TEMPLATES)) {
    const tplNorm = tpl.texts.en.trim().toLowerCase().replace(/[^a-z0-9{} ]/g, '');
    if (norm === tplNorm) {
      return key;
    }
  }
  return undefined;
}

// ── STUDIO RECORDING CANDIDATES (Exported for Voice Recording Team) ──────────

export interface StudioRecordingCandidate {
  id: string;
  category: 'KEYPAD_ENTRY' | 'USSD_BALANCE_GUIDANCE' | 'CONFIRMATION' | 'ZERO_PIN';
  dialect: 'twi-asante' | 'twi-akuapem' | 'en';
  text: string;
  targetRole: string;
  status: 'PENDING_STUDIO_RECORDING';
}

export const studioRecordingCandidates: StudioRecordingCandidate[] = [
  {
    id: 'twi-keypad-entry-amount',
    category: 'KEYPAD_ENTRY',
    dialect: 'twi-asante',
    text: 'Mepa wo kyɛw, bɔ sika no dodoɔ wɔ wo fon keypad no so.',
    targetRole: 'Fallback prompt for unapproved spoken amounts or amounts above single transaction cap',
    status: 'PENDING_STUDIO_RECORDING',
  },
  {
    id: 'twi-ussd-170-balance-loanwords',
    category: 'USSD_BALANCE_GUIDANCE',
    dialect: 'twi-asante',
    text: 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
    targetRole: 'Default USSD guidance with English loanwords star and hash for MoMo check balance',
    status: 'PENDING_STUDIO_RECORDING',
  },
  {
    id: 'twi-ussd-170-balance-akan',
    category: 'USSD_BALANCE_GUIDANCE',
    dialect: 'twi-asante',
    text: 'Fa wo fon no bɔ nsoroma, baako, nson, hwee, nsensaneeɛ na hwɛ wo balance.',
    targetRole: 'Alternative native Akan translation for telecom star/hash (unverified)',
    status: 'PENDING_STUDIO_RECORDING',
  },
];
