import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pilotRouter } from "../src/routes/pilotRoutes";
import { realCallPilot } from "../src/services/realCallPilot";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(pilotRouter);
  return app;
}

describe("Phase 3.5 real-call evidence gate", () => {
  beforeEach(() => {
    realCallPilot.clearForTesting();
  });

  afterEach(() => {
    realCallPilot.clearForTesting();
  });

  it("requires explicit consent and anonymizes evidence", () => {
    expect(() => realCallPilot.record({
      consentRecorded: false as unknown as true,
      callId: "call-real-1",
      participantId: "participant-real-1",
      language: "en",
      task: "transfer",
      humanVerifiedTranscript: "send fifty cedis",
      providerTranscript: "send fifty cities",
      conversationCompleted: false,
      spokenResponseDelivered: true,
      unexpectedCallTermination: false,
      emptyTranscription: false,
      recognitionTimeout: false,
      clarificationRequired: true,
      recoveryUsed: "speech",
    })).toThrow(/consent/i);

    const record = realCallPilot.record({
      consentRecorded: true,
      callId: "call-real-1",
      participantId: "participant-real-1",
      language: "en",
      task: "transfer",
      humanVerifiedTranscript: "send fifty cedis to a synthetic recipient",
      providerTranscript: "send fifty cities",
      conversationCompleted: true,
      spokenResponseDelivered: true,
      unexpectedCallTermination: false,
      emptyTranscription: false,
      recognitionTimeout: false,
      clarificationRequired: true,
      recoveryUsed: "dtmf",
    });
    expect(record.callId).toMatch(/^anon_/);
    expect(record.participantId).toMatch(/^anon_/);
  });

  it("does not manufacture real-call WER or participant counts", () => {
    const report = realCallPilot.getReport();
    expect(report.consentingParticipants).toBe(0);
    expect(report.attemptedCalls).toBe(0);
    expect(report.english.wer).toBeNull();
    expect(report.twi.wer).toBeNull();
  });

  it("changes evidence status only after a consented record is submitted", () => {
    const before = realCallPilot.getReport();
    expect(before.evidenceState).toBe("NO_REAL_CALL_EVIDENCE");

    realCallPilot.record({
      consentRecorded: true,
      callId: "call-evidence-1",
      participantId: "participant-evidence-1",
      language: "twi",
      task: "balance",
      conversationCompleted: false,
      spokenResponseDelivered: true,
      unexpectedCallTermination: false,
      emptyTranscription: false,
      recognitionTimeout: false,
      clarificationRequired: true,
      recoveryUsed: "dtmf",
    });

    const after = realCallPilot.getReport();
    expect(after.evidenceState).toBe("REAL_CALL_EVIDENCE_RECORDED");
    expect(after.attemptedCalls).toBe(1);
    expect(after.twi.calls).toBe(1);
  });

  it("exposes the report only through the existing admin pilot router", async () => {
    const app = createApp();
    const unauthorized = await request(app).get("/api/pilot/call-evidence/report");
    expect(unauthorized.status).toBe(401);

    const response = await request(app)
      .get("/api/pilot/call-evidence/report")
      .set("Authorization", "Bearer admin");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.evidenceState).toBe("NO_REAL_CALL_EVIDENCE");
  });

  it("rejects call evidence without explicit consent", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/pilot/call-evidence")
      .set("Authorization", "Bearer admin")
      .send({
        callId: "call-1",
        participantId: "participant-1",
        language: "en",
        consentRecorded: false,
      });
    expect(response.status).toBe(400);
  });
});
