import { describe, expect, it } from "vitest";
import { hasExplicitAsrFeedbackConsent } from "../src/ai_system/speech/asr/feedbackConsent";
import { FeedbackService } from "../src/ai_system/speech/asr/feedbackService";

describe("ASR feedback consent", () => {
  it("accepts only an explicit true opt-in", () => {
    expect(hasExplicitAsrFeedbackConsent(true)).toBe(true);
    expect(hasExplicitAsrFeedbackConsent(false)).toBe(false);
    expect(hasExplicitAsrFeedbackConsent(undefined)).toBe(false);
    expect(hasExplicitAsrFeedbackConsent(null)).toBe(false);
    expect(hasExplicitAsrFeedbackConsent("true")).toBe(false);
  });

  it("redacts local and spaced international Ghana phone numbers", () => {
    const feedbackService = new FeedbackService();

    expect(feedbackService.sanitizeTranscript("Send to 0244123456")).toBe("Send to [REDACTED_PHONE]");
    expect(feedbackService.sanitizeTranscript("Send to +233 24 412 3456")).toBe("Send to [REDACTED_PHONE]");
  });
});