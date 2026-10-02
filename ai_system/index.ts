/**
 * Ɔkwankyerɛfo Pa - AI System Root Facade
 * Connects root imports directly to the comprehensive architecture in src/ai_system/
 */

export * from "../src/ai_system/index";

import { aiEngine } from "../src/ai_system/core/aiEngine";
import { transcriptionEngine } from "./transcriptionEngine";
import { nluEngine } from "./nluEngine";
import { speechSynthesisEngine } from "./speechSynthesisEngine";
import { dialogueEngine } from "./dialogueEngine";

export const aiSystem = {
  process: aiEngine.process.bind(aiEngine),
  transcribe: transcriptionEngine.transcribe.bind(transcriptionEngine),
  analyzeUtterance: nluEngine.analyzeUtterance.bind(nluEngine),
  synthesizeSpeech: speechSynthesisEngine.synthesize.bind(speechSynthesisEngine),
  handleTurn: dialogueEngine.handleTurn.bind(dialogueEngine),
  getSession: dialogueEngine.getSession.bind(dialogueEngine),
  clearSession: dialogueEngine.clearSession.bind(dialogueEngine),
};

export default aiSystem;
