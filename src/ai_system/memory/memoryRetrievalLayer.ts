/**
 * Ɔkwankyerɛfo Pa - Memory Retrieval Layer (memoryRetrievalLayer.ts)
 * 
 * Canonical Step:
 * USER INPUT -> MEMORY RETRIEVAL -> CURRENT CONTEXT PACKET -> REASONING
 * 
 * Retrieves targeted relevant context before cognitive reasoning:
 * 1. Current working slots & task state (active task, interrupted tasks).
 * 2. Recent conversation turns (last 4 turns).
 * 3. Relevant long-term semantic memories (vector similarity matches).
 * 4. Known contacts & transaction history ("same number as before", "the other Ama").
 * 5. User preferences & language history.
 * 6. Coreference, anaphora, and mid-turn correction resolution.
 */

import { unifiedMemory } from "./unifiedMemory";
import {
  AiLanguage,
  ContextPacket,
  EntitySlotMap,
  IntentName,
  MobileNetwork,
  TaskState,
  UserProfileData,
} from "../core/aiTypes";

export interface ResolvedCoreferences {
  resolvedRecipientPhone?: string;
  resolvedRecipientName?: string;
  resolvedAmount?: number;
  resolvedNetwork?: MobileNetwork;
  disambiguationCandidates?: Array<{ name: string; phone: string; network?: MobileNetwork }>;
  isCorrection: boolean;
  correctionField?: string;
  correctionOldValue?: any;
  correctionNewValue?: any;
  isInterruption: boolean;
  isResumption: boolean;
  isRepeatRequest: boolean;
}

export class MemoryRetrievalLayer {
  /**
   * Retrieves a focused ContextPacket prior to cognitive reasoning.
   */
  public async retrieve(params: {
    sessionId: string;
    rawInput: string;
    normalizedInput: string;
    detectedLanguage: AiLanguage;
    userProfile?: UserProfileData;
  }): Promise<{ packet: ContextPacket; coreferences: ResolvedCoreferences }> {
    const { sessionId, rawInput, normalizedInput, detectedLanguage, userProfile } = params;

    // 1. Working slots & active task
    const workingSlots = unifiedMemory.getWorkingSlots(sessionId);
    const activeTask = unifiedMemory.getActiveTask(sessionId);
    const interruptedTaskState = unifiedMemory.getInterruptedTask(sessionId);

    // 2. Recent conversation history
    const fullHistory = await unifiedMemory.getConversationHistory(sessionId);
    const recentTurns = fullHistory.slice(-4).map((t) => ({
      role: t.role,
      text: t.sanitizedInput,
    }));

    // 3. Past transactions & extracted known contacts
    const transactions = await unifiedMemory.listTransactions(sessionId);
    const recentTransactions = transactions.slice(-5).map((tx) => ({
      type: tx.type,
      amount: tx.amount,
      recipient: tx.recipientName || "Unknown",
      phone: tx.recipientPhone || "",
      network: tx.network || "MTN",
      timestamp: tx.timestamp,
    }));

    const knownContactsMap = new Map<string, { name: string; phone: string; network?: MobileNetwork; lastUsed: number }>();
    
    // Seed from transactions
    for (const tx of transactions) {
      if (tx.recipientPhone) {
        knownContactsMap.set(tx.recipientPhone, {
          name: tx.recipientName || "Contact",
          phone: tx.recipientPhone,
          network: tx.network as MobileNetwork,
          lastUsed: tx.timestamp,
        });
      }
    }

    // Seed from previous turn slots
    for (const turn of fullHistory) {
      if (turn.slots?.recipientPhone && turn.slots?.recipientName) {
        const phone = turn.slots.recipientPhone;
        if (!knownContactsMap.has(phone)) {
          knownContactsMap.set(phone, {
            name: turn.slots.recipientName,
            phone,
            network: turn.slots.network as MobileNetwork,
            lastUsed: turn.timestamp,
          });
        }
      }
    }

    const knownContacts = Array.from(knownContactsMap.values());

    // 4. Targeted Semantic Memory Search (e.g. past turns mentioning names or keywords)
    let relevantPastTurns: Array<{ role: string; text: string; relevance?: string }> = [];
    const lowerInput = rawInput.toLowerCase();

    const isReferential =
      /\b(same|other|before|last|again|bio|koro|fofor|dodo)\b/i.test(lowerInput) ||
      knownContacts.some((c) => lowerInput.includes(c.name.toLowerCase()));

    if (isReferential && fullHistory.length > 2) {
      try {
        const semanticMatches = await unifiedMemory.searchSemanticMemory(sessionId, rawInput, 2);
        relevantPastTurns = semanticMatches
          .filter((match) => !recentTurns.some((rt) => rt.text === match.sanitizedInput))
          .map((m) => ({
            role: m.role,
            text: m.sanitizedInput,
            relevance: "SEMANTIC_SIMILARITY",
          }));
      } catch (err) {
        // Non-blocking semantic lookup fallback
      }
    }

    // 5. Coreference & Context Disambiguation Resolution
    const coreferences = this.resolveCoreferences({
      input: lowerInput,
      workingSlots,
      activeTask,
      knownContacts,
      recentTransactions,
      fullHistory,
    });

    // 6. Build the canonical ContextPacket
    const packet: ContextPacket = {
      currentTask: activeTask?.intent || null,
      currentAmount: (coreferences.resolvedAmount ?? workingSlots.amount) || null,
      currentRecipient: (coreferences.resolvedRecipientName ?? workingSlots.recipientName) || null,
      currentRecipientPhone: (coreferences.resolvedRecipientPhone ?? workingSlots.recipientPhone) || null,
      currentNetwork: (coreferences.resolvedNetwork ?? (workingSlots.network as MobileNetwork)) || null,
      recentTurns,
      relevantPastTurns,
      preferredLanguage: userProfile?.preferredLanguage || detectedLanguage,
      knownContacts,
      recentTransactions,
      interruptedTask: interruptedTaskState
        ? {
            task: interruptedTaskState.intent,
            slots: interruptedTaskState.slots,
            suspendedAt: interruptedTaskState.createdAt,
          }
        : null,
      taskQueue: [],
    };

    return { packet, coreferences };
  }

  /**
   * Resolves colloquial Ghanaian anaphora, mid-turn corrections, interruptions, and resumptions.
   */
  private resolveCoreferences(params: {
    input: string;
    workingSlots: EntitySlotMap;
    activeTask: TaskState | null;
    knownContacts: Array<{ name: string; phone: string; network?: MobileNetwork }>;
    recentTransactions: Array<{ type: string; amount: number; recipient: string; phone: string; network: string; timestamp: number }>;
    fullHistory: any[];
  }): ResolvedCoreferences {
    const { input, workingSlots, activeTask, knownContacts, recentTransactions } = params;

    const res: ResolvedCoreferences = {
      isCorrection: false,
      isInterruption: false,
      isResumption: false,
      isRepeatRequest: false,
    };

    // A. Interruption ("wait", "hold on", "twɛn kakra", "gyae ansa")
    if (/\b(wait|hold on|pause|twɛn|twen kakra|gyae ansa|kakra|tie ansa)\b/i.test(input)) {
      res.isInterruption = true;
    }

    // B. Resumption ("continue", "proceed", "kɔ so", "oa yɛntoa so", "resume", "okay go ahead")
    if (/\b(continue|proceed|kɔ so|ko so|toa so|resume|go ahead|yoo kɔ so)\b/i.test(input)) {
      res.isResumption = true;
    }

    // C. Repeat Request ("what did you say", "repeat", "ka bio", "tie bio", "pardon")
    if (/\b(what did you say|repeat|say that again|say again|ka bio|tie bio|tie biom|pardon)\b/i.test(input)) {
      res.isRepeatRequest = true;
    }

    // D. "Same number we used before" / "same person" / "saa nipa korɔ no ara"
    if (/\b(same number|same person|same one|last number|previous number|saa nɔma no ara|saa nipa no ara|koro no ara)\b/i.test(input)) {
      if (recentTransactions.length > 0) {
        const lastTx = recentTransactions[recentTransactions.length - 1];
        res.resolvedRecipientPhone = lastTx.phone;
        res.resolvedRecipientName = lastTx.recipient;
        if (lastTx.network) {
          res.resolvedNetwork = lastTx.network as MobileNetwork;
        }
      } else if (knownContacts.length > 0) {
        const lastContact = knownContacts[0];
        res.resolvedRecipientPhone = lastContact.phone;
        res.resolvedRecipientName = lastContact.name;
        if (lastContact.network) res.resolvedNetwork = lastContact.network;
      }
    }

    // E. "Use the other Ama" / "the other one" / "foforɔ no"
    if (/\b(the other|other one|foforɔ no|foforo no|different one)\b/i.test(input)) {
      const currentName = workingSlots.recipientName || (activeTask?.slots.recipientName);
      if (currentName) {
        // Find contacts with the same name but different phone numbers
        const matching = knownContacts.filter(
          (c) => c.name.toLowerCase() === currentName.toLowerCase() && c.phone !== workingSlots.recipientPhone
        );
        if (matching.length === 1) {
          res.resolvedRecipientPhone = matching[0].phone;
          res.resolvedRecipientName = matching[0].name;
          if (matching[0].network) res.resolvedNetwork = matching[0].network;
        } else if (matching.length > 1) {
          res.disambiguationCandidates = matching;
        }
      }
    }

    // F. Amount correction ("actually make it 80", "no, 50 cedis rather", "sesa kɔ 80")
    const amountCorrectionMatch = input.match(/\b(?:make it|actually|change to|rather|instead|sesa kɔ|mmom)\s+(\d+(?:\.\d+)?)/i);
    if (amountCorrectionMatch) {
      const newAmount = parseFloat(amountCorrectionMatch[1]);
      if (!isNaN(newAmount) && newAmount > 0) {
        res.isCorrection = true;
        res.correctionField = "amount";
        res.correctionOldValue = workingSlots.amount;
        res.correctionNewValue = newAmount;
        res.resolvedAmount = newAmount;
      }
    }

    // G. Number correction ("no, I meant the other number", "wrong number, it's 055...")
    const phoneCorrectionMatch = input.match(/\b(?:wrong number|not that number|rather use|sesa nɔma|it's|use)\s*(0\d{9})/i);
    if (phoneCorrectionMatch) {
      const newPhone = phoneCorrectionMatch[1];
      res.isCorrection = true;
      res.correctionField = "recipientPhone";
      res.correctionOldValue = workingSlots.recipientPhone;
      res.correctionNewValue = newPhone;
      res.resolvedRecipientPhone = newPhone;
    }

    return res;
  }
}

export const memoryRetrievalLayer = new MemoryRetrievalLayer();
