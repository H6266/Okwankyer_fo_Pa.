import brainTraining from "../../../Okwankyerɛfo_Pa_Brain_Training_v2.json";

if (typeof brainTraining.system_instructions !== "string" || brainTraining.system_instructions.trim().length === 0) {
  throw new Error("Brain training JSON is missing system_instructions.");
}

export const BRAIN_TRAINING_SYSTEM_INSTRUCTIONS = brainTraining.system_instructions;