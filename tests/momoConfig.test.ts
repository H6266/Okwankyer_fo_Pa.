import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfigFromEnv } from "../src/integrations/momo/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MoMo environment configuration", () => {
  it("prefers complete product credentials over legacy credentials", () => {
    vi.stubEnv("MOMO_SUBSCRIPTION_KEY", "legacy-subscription");
    vi.stubEnv("MOMO_API_USER_ID", "legacy-user");
    vi.stubEnv("MOMO_API_KEY", "legacy-api-key");
    vi.stubEnv("MOMO_COLLECTION_SUBSCRIPTION_KEY", "collection-subscription");
    vi.stubEnv("MOMO_COLLECTION_API_USER_ID", "collection-user");
    vi.stubEnv("MOMO_COLLECTION_API_KEY", "collection-api-key");
    vi.stubEnv("MOMO_DISBURSEMENT_SUBSCRIPTION_KEY", "disbursement-subscription");
    vi.stubEnv("MOMO_DISBURSEMENT_API_USER_ID", "disbursement-user");
    vi.stubEnv("MOMO_DISBURSEMENT_API_KEY", "disbursement-api-key");

    const config = loadConfigFromEnv();

    expect(config.collection).toEqual({
      subscriptionKey: "collection-subscription",
      apiUserId: "collection-user",
      apiKey: "collection-api-key",
    });
    expect(config.disbursement).toEqual({
      subscriptionKey: "disbursement-subscription",
      apiUserId: "disbursement-user",
      apiKey: "disbursement-api-key",
    });
  });

  it("uses the complete legacy credential set when Collections credentials are incomplete", () => {
    vi.stubEnv("MOMO_SUBSCRIPTION_KEY", "legacy-subscription");
    vi.stubEnv("MOMO_API_USER_ID", "legacy-user");
    vi.stubEnv("MOMO_API_KEY", "legacy-api-key");
    vi.stubEnv("MOMO_COLLECTION_SUBSCRIPTION_KEY", "incomplete-collection-subscription");
    vi.stubEnv("MOMO_COLLECTION_API_USER_ID", "incomplete-collection-user");
    vi.stubEnv("MOMO_COLLECTION_API_KEY", "");
    vi.stubEnv("MOMO_DISBURSEMENT_SUBSCRIPTION_KEY", "disbursement-subscription");
    vi.stubEnv("MOMO_DISBURSEMENT_API_USER_ID", "disbursement-user");
    vi.stubEnv("MOMO_DISBURSEMENT_API_KEY", "disbursement-api-key");

    const config = loadConfigFromEnv();

    expect(config.collection).toEqual({
      subscriptionKey: "legacy-subscription",
      apiUserId: "legacy-user",
      apiKey: "legacy-api-key",
    });
    expect(config.disbursement).toEqual({
      subscriptionKey: "disbursement-subscription",
      apiUserId: "disbursement-user",
      apiKey: "disbursement-api-key",
    });
  });

  it("retains legacy shared credentials when no product-specific credentials are set", () => {
    vi.stubEnv("MOMO_SUBSCRIPTION_KEY", "legacy-subscription");
    vi.stubEnv("MOMO_API_USER_ID", "legacy-user");
    vi.stubEnv("MOMO_API_KEY", "legacy-api-key");
    vi.stubEnv("MOMO_COLLECTION_SUBSCRIPTION_KEY", "");
    vi.stubEnv("MOMO_COLLECTION_API_USER_ID", "");
    vi.stubEnv("MOMO_COLLECTION_API_KEY", "");
    vi.stubEnv("MOMO_DISBURSEMENT_SUBSCRIPTION_KEY", "");
    vi.stubEnv("MOMO_DISBURSEMENT_API_USER_ID", "");
    vi.stubEnv("MOMO_DISBURSEMENT_API_KEY", "");

    const config = loadConfigFromEnv();

    expect(config.collection.apiKey).toBe("legacy-api-key");
    expect(config.disbursement.apiKey).toBe("legacy-api-key");
  });
});
