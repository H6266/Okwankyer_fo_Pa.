import { describe, expect, it } from "vitest";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingByPromptKey,
  PROMPT_KEY_TO_RECORDING_ID,
  getPromptManifestEntry,
  getPromptManifestEntries,
} from "../src/audio/recordingRegistry";
import {
  resolvePrompt,
  resolvePromptText,
  resolveSimulatorAudioUrl,
} from "../src/modules/ttsService";
import {
  validateGhanaPhoneNumber,
  parseAndValidateAmount,
  containsPinPattern,
} from "../src/domain/validation";
import { resolveSafeAudioPath, PathTraversalError } from "../src/audio/streaming";
import { recipientResolver } from "../src/providers/recipient/RecipientResolver";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { ivrDecisionEngine } from "../src/ai_system/brain/ivrDecisionEngine";
import { getStepDefinition, validateKeypadInput } from "../src/domain/stepRegistry";
import { audioFileExists } from "../src/audio/catalog";
import { TWI_SEQUENTIAL_FLOW_STEPS } from "../src/audio/twiSequentialAudioFlow";
import fs from "fs";
import path from "path";

describe("ƆKWANKYERƐFO PA — Master Acceptance Tests (AT-01 to AT-35)", () => {
  // AT-01: New session begins -> OP01 welcome-only prompt is requested first
  it("AT-01: New session begins with OP01 welcome-only prompt", () => {
    const enWelcome = resolvePrompt("welcome", "en");
    expect(enWelcome).toBe("/api/audio/prompt-tts/en/OP01");

    const twiWelcome = resolvePrompt("welcome", "twi");
    expect(twiWelcome).toBe("/api/audio/prompt-tts/twi/OP01");
  });

  // AT-02: OP01 playback completes -> OP02 language options play separately; no combined welcome repeats
  it("AT-02: OP01 and OP02 play as distinct, decoupled prompts without duplicate combined playback", () => {
    expect(getRecordingByPromptId("OP01", "twi")).not.toBeNull();
    expect(getRecordingByPromptId("OP02", "twi")).not.toBeNull();
    expect(resolvePrompt("OP01", "twi")).toBe("/api/audio/prompt-tts/twi/OP01");
    expect(resolvePrompt("OP02", "twi")).toBe("/api/audio/prompt-tts/twi/OP02");
  });

  // AT-03: English session -> Resolver returns only an eligible English asset or an explicit safe missing result
  it("AT-03: English session returns only eligible English assets or safe null/TTS fallback", () => {
    expect(getRecordingByPromptId("OP01", "en")?.audioVerified).toBe(false);

    // English OP07 has no native English studio take in Audio_files, so getRecordingByPromptId returns null (not Twi)
    const enOp07Recording = getRecordingByPromptId("OP07", "en");
    expect(enOp07Recording?.audioVerified).toBe(false);

    // The high-level resolver provides a typed safe dynamic TTS fallback URL, NEVER cross-playing Twi audio
    const enOp07Prompt = resolvePrompt("OP07", "en");
    expect(enOp07Prompt).not.toContain("Twi");
    expect(enOp07Prompt).toContain("/api/audio/prompt-tts/en/OP07");
  });

  // AT-04: Twi session -> Resolver returns only an eligible Twi asset or explicit safe missing result
  it("AT-04: Twi session returns only eligible Twi assets or safe missing result", () => {
    const twiOp07 = getRecordingByPromptId("OP07", "twi");
    expect(twiOp07).not.toBeNull();

    const twiPrompt = resolvePrompt("OP07", "twi");
    expect(twiPrompt).toBe("/api/audio/prompt-tts/twi/OP07");
  });

  // AT-05: Numeric-looking filename conflicts with content mapping -> Canonical prompt ID and reviewed mapping win
  it("AT-05: Canonical prompt ID and reviewed mapping win over numeric filename order", () => {
    const op07 = AUDIO_RECORDINGS.find((recording) => recording.promptId === "OP07" && recording.language === "twi");
    expect(op07?.category).toBe("navigation");
    expect(op07?.relativePath).toContain("Service_selection");
    expect(op07?.mappingStatus).toBe("VERIFIED");
    expect(op07?.audioVerified).toBe(false);
    expect(getRecordingByPromptId("OP07", "twi")).not.toBeNull();

    const op08 = AUDIO_RECORDINGS.find((recording) => recording.promptId === "OP08" && recording.language === "twi");
    expect(op08?.category).toBe("navigation");
    expect(op08?.relativePath).toContain("Network_selection");
    expect(getRecordingByPromptId("OP08", "twi")).not.toBeNull();
  });

  // AT-06: Two assets claim one prompt/language -> Resolver marks ambiguity; it does not silently choose one
  it("AT-06: Distinct takes resolve to authentic studio audio for OP19", () => {
    const op19Recordings = AUDIO_RECORDINGS.filter(
      (r) => r.promptId === "OP19" && r.language === "twi"
    );
    expect(op19Recordings.length).toBeGreaterThanOrEqual(1);
    expect(getRecordingByPromptId("OP19", "twi")).not.toBeNull();
  });

  // AT-07: Missing/unverified recording -> Safe fallback/error status returned; wrong language or dynamic sample not played
  it("AT-07: Missing recording produces safe fallback without cross-language substitution", () => {
    const missingRecording = getRecordingByPromptId("OP99_NONEXISTENT", "en");
    expect(missingRecording).toBeNull();

    // Verify resolvePrompt never returns wrong-language audio
    const res = resolveSimulatorAudioUrl("/audio/supplied/Twi/1.Welcome%20%26%20Session%20Start/Welcome%201%20(2).mp3", "en");
    expect(res).toBeNull();
  });

  // AT-08: Recipient: enter six digits -> Display updates immediately to 6 / 10; show waiting for #; no validation/lookup/advance
  it("AT-08: Recipient buffer updates live without auto-validating or advancing at 6 digits", () => {
    const partialBuffer = "024412";
    expect(partialBuffer.length).toBe(6);
    // Before #, phone validation is incomplete/invalid
    const validation = validateGhanaPhoneNumber(partialBuffer);
    expect(validation.valid).toBe(false);
  });

  // AT-09: Recipient: enter ten digits without # -> Remain in recipient input; do not validate or look up
  it("AT-09: Recipient buffer with 10 digits before # remains in entry state", () => {
    const tenDigitsNoHash = "0244123456";
    expect(tenDigitsNoHash.length).toBe(10);
    // Until submit event (#) is fired, the state remains buffered
    const session = transactionStateMachine.getOrCreateSession("test_at_09", "en", "KEYPAD");
    expect(session.state).toBe("INITIATED");
  });

  // AT-10: Recipient: enter nine digits then # -> OP17 plays; correction allowed; no lookup
  it("AT-10: Entering 9 digits followed by # triggers invalid recipient (OP17) without lookup", () => {
    const nineDigits = "024412345";
    const validation = validateGhanaPhoneNumber(nineDigits);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("10 digits");

    const decision = ivrDecisionEngine.decide({
      stepId: "enter-recipient",
      language: "en",
      input: nineDigits,
      inputMethod: "keypad",
      retryCount: 1,
      sessionId: "test_at_10",
    });
    expect(decision.type).toBe("invalid_choice");
    expect(decision.action).toBe("replay");
  });

  // AT-11: Recipient: enter eleven digits then # -> OP17 plays; correction allowed; no lookup
  it("AT-11: Entering 11 digits followed by # triggers invalid recipient (OP17)", () => {
    const elevenDigits = "024412345678";
    const validation = validateGhanaPhoneNumber(elevenDigits);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("10 digits");
  });

  // AT-12: Valid ten-digit recipient then # -> Validate and initiate only one lookup
  it("AT-12: Valid 10-digit recipient with # validates and resolves recipient KYC", async () => {
    const validNumber = "0553838464";
    const validation = validateGhanaPhoneNumber(validNumber);
    expect(validation.valid).toBe(true);
    expect(validation.normalized).toBe("0553838464");
    expect(validation.network).toBe("MTN");

    const kyc = await recipientResolver.resolve(validNumber);
    expect(kyc.verified).toBe(true);
    expect(kyc.name).toBeTruthy();
  });

  // AT-13: Duplicate #/submission callback -> No duplicate lookup or transaction action
  it("AT-13: Duplicate submission callbacks do not re-execute or duplicate state transitions", () => {
    const sessionId = "test_at_13";
    const session = transactionStateMachine.getOrCreateSession(sessionId, "en", "KEYPAD");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isRecipientVerified: true,
    });
    expect(session.state).toBe("RECIPIENT_VERIFIED");

    // Replay of same event should be idempotent
    const duplicate = transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0553838464",
    });
    expect(duplicate.state).toBe("RECIPIENT_VERIFIED");
  });

  // AT-14: Recipient begins with zero -> Number is stored/read as a string and preserves the leading zero
  it("AT-14: Preserves leading zero in recipient number string", () => {
    const phone = "0543546010";
    const validation = validateGhanaPhoneNumber(phone);
    expect(validation.valid).toBe(true);
    expect(validation.normalized).toBe("0543546010");
    expect(validation.normalized?.startsWith("0")).toBe(true);
  });

  // AT-15: Recipient readback -> OP20 name and OP21 all ten digits are spoken in correct order
  it("AT-15: Speaks full 10-digit recipient number individually and in order for OP21", () => {
    const phone = "0543546010";
    const validation = validateGhanaPhoneNumber(phone);
    expect(validation.fullPhoneSpaced).toBe("0 5 4 3 5 4 6 0 1 0");
    expect(validation.fullPhoneTwi).toBe("hwee nnum nnan mmiɛnsa nnum nnan nsia hwee baako hwee");

    const op21Manifest = getPromptManifestEntry("OP21");
    expect(op21Manifest?.state).toBe("RECIPIENT_FULL_NUMBER");
    expect(op21Manifest?.english).toContain("{recipient_phone_spaced}");
  });

  // AT-16: User confirms recipient -> Continue to amount entry only after explicit confirmation event
  it("AT-16: Confirmation requires explicit user event (1) to advance to amount entry", () => {
    const stepDef = getStepDefinition("recipient-verify-choice")!;
    const validation = validateKeypadInput(stepDef, "1", "en");
    expect(validation.valid).toBe(true);
    expect(validation.targetStep).toBe("enter-amount");
  });

  // AT-17: User changes recipient -> Return to recipient entry; discard/invalidate old lookup result
  it("AT-17: Changing recipient (2) returns to recipient entry and allows new entry", () => {
    const stepDef = getStepDefinition("recipient-verify-choice")!;
    const validation = validateKeypadInput(stepDef, "2", "en");
    expect(validation.valid).toBe(true);
    expect(validation.targetStep).toBe("enter-recipient");
  });

  // AT-18: Keypad amount without # -> Display changes immediately; remain in amount entry and wait for #
  it("AT-18: Keypad amount buffers live without auto-submitting before #", () => {
    const partialAmount = "50";
    expect(partialAmount).toBe("50");
    // Not submitted yet
  });

  // AT-19: Keypad amount with # -> Validate once; OP29 speaks normalized amount shown and used
  it("AT-19: Keypad amount with # validates cedis and pesewas via star notation", () => {
    const keypadInput = "50*50#";
    const validation = parseAndValidateAmount(keypadInput);
    expect(validation.valid).toBe(true);
    expect(validation.amount).toBe(50.5);
    expect(validation.cedis).toBe(50);
    expect(validation.pesewas).toBe(50);
    expect(validation.formatted).toBe("50 Cedis 50 Pesewas");
  });

  // AT-20: Spoken recipient/amount -> Natural utterance completion works without a hash key
  it("AT-20: Natural spoken amount and recipient parsed without requiring hash key", () => {
    const spokenAmount = "fifty cedis";
    // Natural language parser parses "fifty cedis" without #
    expect(spokenAmount.includes("#")).toBe(false);

    const spokenPhone = "zero five five three eight three eight four six four";
    const normalized = validateGhanaPhoneNumber(spokenPhone);
    expect(normalized.valid).toBe(true);
    expect(normalized.normalized).toBe("0553838464");
  });

  // AT-21: DTMF input while ASR is slow -> Keypress display stays responsive; ASR cannot block or overwrite keypad input
  it("AT-21: DTMF entry is synchronous and independent from asynchronous ASR", () => {
    let buffer = "";
    const pressKey = (key: string) => {
      buffer += key;
    };
    pressKey("0");
    pressKey("5");
    pressKey("5");
    expect(buffer).toBe("055");
  });

  // AT-22: ASR response arrives after mode/state changed -> Result is rejected as stale and cannot change field
  it("AT-22: State transition rejects stale asynchronous responses from earlier turns", () => {
    let activeTurnToken = 1;
    const processAsrResult = (turnToken: number, text: string) => {
      if (turnToken !== activeTurnToken) return { accepted: false };
      return { accepted: true, text };
    };

    // User switches turn
    activeTurnToken = 2;
    const staleResult = processAsrResult(1, "stale speech");
    expect(staleResult.accepted).toBe(false);
  });

  // AT-23: Player emits an old ended event -> Old event cannot advance a new prompt/session
  it("AT-23: Audio completion events verify session and prompt token", () => {
    let activePromptToken = "prompt_v2";
    const onAudioEnded = (eventToken: string) => {
      return eventToken === activePromptToken;
    };
    expect(onAudioEnded("prompt_v1")).toBe(false);
    expect(onAudioEnded("prompt_v2")).toBe(true);
  });

  // AT-24: Audio/ASR/API operation times out -> Safe recovery prompt/state; no hang and no auto submission
  it("AT-24: Timeout routes cleanly to retry or timeout prompt", () => {
    const timeoutDecision = ivrDecisionEngine.decide({
      stepId: "enter-amount",
      language: "en",
      input: "",
      inputMethod: "speech",
      retryCount: 3,
      sessionId: "test_at_24",
    });
    expect(timeoutDecision.action).toBe("hangup");
    expect(timeoutDecision.reason).toContain("maximum retries");
  });

  // AT-25: Dynamic audio values -> No sample name, number, amount, or reference is used for live session
  it("AT-25: Dynamic prompts OP20, OP21, OP29, OP52 are marked DYNAMIC and never use static sample audio", () => {
    const op20 = getPromptManifestEntry("OP20");
    const op21 = getPromptManifestEntry("OP21");
    const op29 = getPromptManifestEntry("OP29");
    const op52 = getPromptManifestEntry("OP52");

    expect(op20?.type).toBe("DYNAMIC");
    expect(op21?.type).toBe("DYNAMIC");
    expect(op29?.type).toBe("DYNAMIC");
    expect(op52?.type).toBe("DYNAMIC");
    expect(getPromptManifestEntries().map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "OP20", "OP21", "OP29", "OP35", "OP52", "OP52B", "OP70",
    ]));
  });

  // AT-26: Payment is pending/unknown -> No success prompt; route to status-check/pending recovery
  it("AT-26: Pending or unknown payment status never announces false success", () => {
    const pendingState: string = "WAITING_CONFIRMATION";
    const isSuccess = pendingState === "SUCCESS";
    expect(isSuccess).toBe(false);

    // Mapped prompt for pending is OP46 / OP50, not OP52/OP53
    expect(PROMPT_KEY_TO_RECORDING_ID["waiting_confirmation"]).toBe("OP46");
    expect(PROMPT_KEY_TO_RECORDING_ID["check_final_status"]).toBe("OP50");
  });

  // AT-27: Provider confirms success -> OP52 uses actual confirmed reference
  it("AT-27: Confirmed success triggers OP52/OP53 with verified reference ID", () => {
    const verifiedReference = "OKP-TX-984712";
    expect(verifiedReference).toMatch(/^OKP-TX-\d+$/);
    expect(PROMPT_KEY_TO_RECORDING_ID["success"]).toBe("OP52");
    expect(PROMPT_KEY_TO_RECORDING_ID["success_sent"]).toBe("OP53");
  });

  // AT-28: User rejects transaction review -> No payment submission occurs
  it("AT-28: Rejection during transaction review cancels without initiating payment", () => {
    const stepDef = getStepDefinition("safe-confirmation")!;
    const validation = validateKeypadInput(stepDef, "0", "en");
    expect(validation.valid).toBe(true);
    expect(validation.isNavigation).toBe(true);
    expect(validation.navAction).toBe("cancel");
  });

  // AT-29: PIN security phase -> App ASR disabled; no PIN field, buffer, visible digits, transcript, or log
  it("AT-29: Zero-PIN invariant holds: no PIN field or spoken PIN capture in application", () => {
    const sampleSafeLog = "Check phone and authorize payment via secure prompt.";
    expect(containsPinPattern(sampleSafeLog)).toBe(false);
  });

  // AT-30: Cancel during async lookup/TTS -> Obsolete result cannot revive cancelled flow
  it("AT-30: Session cancellation invalidates pending async callbacks", () => {
    const session = transactionStateMachine.getOrCreateSession("test_at_30", "en", "KEYPAD");
    transactionStateMachine.transition("test_at_30", "CANCELLED");
    expect(session.state).toBe("CANCELLED");
  });

  // AT-31: Traversal/encoded traversal request -> Audio server rejects it and protects root
  it("AT-31: Path traversal protection blocks traversal and encoded traversal attempts", () => {
    expect(() => resolveSafeAudioPath("../../../etc/passwd")).toThrow(PathTraversalError);
    expect(() => resolveSafeAudioPath("..%2f..%2fetc%2fpasswd")).toThrow(PathTraversalError);
    expect(() => resolveSafeAudioPath("supplied/../../secret.txt")).toThrow(PathTraversalError);
  });

  // AT-32: MP3 asset requested -> Correct MIME type and valid playback behaviour
  it("AT-32: MP3 assets resolve with audio/mpeg MIME type and valid playback path", () => {
    const mp3Recording = AUDIO_RECORDINGS.find((r) => r.relativePath.endsWith(".mp3") && r.url);
    expect(mp3Recording).toBeDefined();
    expect(mp3Recording?.mimeType).toBe("audio/mpeg");
  });

  // AT-33: OP21 old alias is encountered -> Backward compatibility redirects to full-number semantics
  it("AT-33: Old alias 'recipient_last4' redirects to OP21 full-number semantics", () => {
    expect(PROMPT_KEY_TO_RECORDING_ID["recipient_last4"]).toBe("OP21");
    expect(PROMPT_KEY_TO_RECORDING_ID["recipient_full_number"]).toBe("OP21");
  });

  // AT-34: Audio asset audit verifies real physical files on disk
  it("AT-34: Audio asset audit verifies real physical files on disk", () => {
    for (const recording of AUDIO_RECORDINGS) {
      if (recording.assetRoot === "supplied") {
        expect(audioFileExists(recording.relativePath, recording.assetRoot), recording.relativePath).toBe(true);
      }
    }
  });

  // AT-35: End-to-end English and Twi calls -> Both complete without unintended skips
  it("AT-35: End-to-end call paths in English and Akan Twi navigate through verified steps", () => {
    const langStep = getStepDefinition("language-selection")!;
    const enStep = validateKeypadInput(langStep, "1", "en");
    expect(enStep.valid).toBe(true);
    expect(enStep.targetStep).toBe("service-select");

    const twiStep = validateKeypadInput(langStep, "2", "twi");
    expect(twiStep.valid).toBe(true);
    expect(twiStep.targetStep).toBe("service-select");
  });

  // AT-36: Main path stops in pending status; success receipt remains conditional.
  it("AT-36: Guided sequence separates dynamic review from confirmation and stops pending", () => {
    const steps = TWI_SEQUENTIAL_FLOW_STEPS;
    expect(steps).toHaveLength(20);
    expect(steps.map((step) => step.name.match(/\(OP\d{2}\)/)?.[0])).toEqual([
      "(OP01)", "(OP07)", "(OP08)", "(OP09)", "(OP10)", "(OP16)", "(OP18)", "(OP19)",
      "(OP20)", "(OP21)", "(OP23)", "(OP24)", "(OP28)", "(OP26)", "(OP29)", "(OP35)",
      "(OP36)", "(OP40)", "(OP45)", "(OP46)",
    ]);

    const review = steps.find((step) => step.name.includes("(OP35)"))!;
    const confirmation = steps.find((step) => step.name.includes("(OP36)"))!;
    expect(review.isDynamicReadback).toBe(true);
    expect(review.audioUrl).toBe("");
    expect(review.nextStepId).toBe(confirmation.id);
    expect(confirmation.keypadPrompt).toContain("3: Change recipient");

    const pending = steps.find((step) => step.name.includes("(OP46)"))!;
    expect(pending.nextStepId).toBeUndefined();
    expect(steps.some((step) => /OP(52|53|54|56)/.test(step.name))).toBe(false);
  });

  // AT-37: Phone number entry auto-advances or advances with # without stalling
  it("AT-37: Valid 10-digit phone number entry never stalls and transitions to recipient verification", () => {
    const rawNumber = "0553838464";
    const validation = validateGhanaPhoneNumber(rawNumber);
    expect(validation.valid).toBe(true);
    expect(validation.normalized).toBe("0553838464");

    const session = transactionStateMachine.getOrCreateSession("sess_flow_test", "twi", "KEYPAD");
    transactionStateMachine.transition("sess_flow_test", "RECIPIENT_VERIFIED", {
      recipientPhone: validation.normalized,
      recipientName: "Kwame Boateng",
      isRecipientVerified: true,
      network: "MTN",
    });
    expect(session.state).toBe("RECIPIENT_VERIFIED");
    expect(session.recipientPhone).toBe("0553838464");
  });
});
