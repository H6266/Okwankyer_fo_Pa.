export interface LevenshteinSample {
  id: string;
  language: "en" | "twi";
  humanTranscript: string;
  asrTranscript: string;
  expectedIntent: string;
  actualIntent: string;
  noise: "quiet" | "moderate_noise" | "telephone" | "synthetic_error";
}

export interface VoiceEvaluationMetrics {
  sampleCount: number;
  wer: number;
  cer: number;
  intentAccuracy: number;
  englishIntentAccuracy: number;
  twiIntentAccuracy: number;
  emptyTranscriptionRate: number;
  timeoutRate: number;
}

function tokens(text: string): string[] {
  return text.trim().toLowerCase().replace(/[.!?,]/g, "").split(/\s+/).filter(Boolean);
}

export function levenshtein(reference: string[], hypothesis: string[]): number {
  const rows = hypothesis.length + 1;
  const columns = reference.length + 1;
  const distance = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let i = 0; i < rows; i++) distance[i][0] = i;
  for (let j = 0; j < columns; j++) distance[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      const cost = hypothesis[i - 1] === reference[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + cost,
      );
    }
  }
  return distance[rows - 1][columns - 1];
}

export function characterLevenshtein(reference: string, hypothesis: string): number {
  return levenshtein(Array.from(reference), Array.from(hypothesis));
}

export function evaluateVoiceSamples(samples: LevenshteinSample[]): VoiceEvaluationMetrics {
  let werDistance = 0;
  let referenceWords = 0;
  let cerDistance = 0;
  let referenceCharacters = 0;
  let correctIntents = 0;
  let englishCorrect = 0;
  let englishCount = 0;
  let twiCorrect = 0;
  let twiCount = 0;
  let emptyCount = 0;

  for (const sample of samples) {
    const referenceWordsForSample = tokens(sample.humanTranscript);
    referenceWords += referenceWordsForSample.length;
    werDistance += levenshtein(referenceWordsForSample, tokens(sample.asrTranscript));

    referenceCharacters += Array.from(sample.humanTranscript).length;
    cerDistance += characterLevenshtein(sample.humanTranscript, sample.asrTranscript);

    if (!sample.asrTranscript.trim()) emptyCount++;
    if (sample.actualIntent === sample.expectedIntent) correctIntents++;
    if (sample.language === "en") {
      englishCount++;
      if (sample.actualIntent === sample.expectedIntent) englishCorrect++;
    } else {
      twiCount++;
      if (sample.actualIntent === sample.expectedIntent) twiCorrect++;
    }
  }

  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0;

  return {
    sampleCount: samples.length,
    wer: rate(werDistance, referenceWords),
    cer: rate(cerDistance, referenceCharacters),
    intentAccuracy: rate(correctIntents, samples.length),
    englishIntentAccuracy: rate(englishCorrect, englishCount),
    twiIntentAccuracy: rate(twiCorrect, twiCount),
    emptyTranscriptionRate: rate(emptyCount, samples.length),
    timeoutRate: 0,
  };
}
