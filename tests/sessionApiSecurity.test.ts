import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiRouter } from "../src/routes/apiRoutes";

describe("call session API access control", () => {
  const app = express().use(express.json()).use(apiRouter);

  it("requires administrator authentication for session traces and mutations", async () => {
    const responses = await Promise.all([
      request(app).get("/api/sessions"),
      request(app).get("/api/sessions/session-1"),
      request(app).post("/api/sessions/session-1/turn").send({ callerInput: "hello" }),
      request(app).post("/api/sessions/session-1/api-trace").send({ endpoint: "/voice-menu" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });
});
