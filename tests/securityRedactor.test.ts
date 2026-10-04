import { describe, it, expect } from "vitest";
import {
  redactString,
  redactHeaders,
  redactObject,
  assertNoSecrets,
} from "../src/integrations/momo/securityRedactor";

describe("Security Redaction Layer", () => {
  const sample32Hex = "0aa16c020c5e4905be3818671bc3febd";
  const sampleBasic = "Basic ZjYyNzg5OWMtZDBjZC00ODc0LTk5YmMtODgwMDlhZmJmZjZmOjBiNDI4MTI3ZGJhMjQ0MGRhOTcwMzE0NGFjNWJmODli";
  const sampleJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG4b4_nZk1H0c6";

  it("redacts 32-character hex keys to the last 4 characters", () => {
    const raw = `ApiKey is ${sample32Hex} in string`;
    const redacted = redactString(raw);
    expect(redacted).not.toContain(sample32Hex);
    expect(redacted).toContain("••••febd");
  });

  it("redacts Basic auth headers", () => {
    const raw = `Header: ${sampleBasic}`;
    const redacted = redactString(raw);
    expect(redacted).not.toContain(sampleBasic);
    expect(redacted).toMatch(/Basic ••••/);
  });

  it("redacts JWT tokens", () => {
    const raw = `Token: Bearer ${sampleJwt}`;
    const redacted = redactString(raw);
    expect(redacted).not.toContain(sampleJwt);
    expect(redacted).toMatch(/Bearer ••••|••••/);
  });

  it("redacts nested objects and header dictionaries", () => {
    const headers = {
      Authorization: sampleBasic,
      "Ocp-Apim-Subscription-Key": sample32Hex,
      "Content-Type": "application/json",
    };
    const cleanHeaders = redactHeaders(headers);
    expect(cleanHeaders["Authorization"]).not.toContain(sampleBasic);
    expect(cleanHeaders["Ocp-Apim-Subscription-Key"]).toBe("••••febd");
    expect(cleanHeaders["Content-Type"]).toBe("application/json");

    expect(() => assertNoSecrets(cleanHeaders)).not.toThrow();
  });

  it("fails assertNoSecrets when a 32-character hex string appears", () => {
    expect(() => {
      assertNoSecrets({ leakedKey: sample32Hex });
    }).toThrow(/SECURITY LEAK DETECTED/);
  });

  it("fails assertNoSecrets when a Basic auth header appears", () => {
    expect(() => {
      assertNoSecrets({ auth: sampleBasic });
    }).toThrow(/SECURITY LEAK DETECTED/);
  });

  it("fails assertNoSecrets when a JWT appears", () => {
    expect(() => {
      assertNoSecrets({ token: sampleJwt });
    }).toThrow(/SECURITY LEAK DETECTED/);
  });
});
