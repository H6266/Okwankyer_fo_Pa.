export function validatePhone(phoneStr: string): boolean {
  return /^\+\d{1,3}\d{3,}$/.test(phoneStr);
}

export interface VoiceCallOptions {
  callFrom: string;
  callTo: string[];
  callbackUrl?: string;
}

export interface QueuedCallOptions {
  phoneNumbers: string;
}

export class VoiceService {
  private username: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(username: string, apiKey: string) {
    this.username = username;
    this.apiKey = apiKey;
    const isSandbox = username === "sandbox";
    this.baseUrl = isSandbox
      ? "https://voice.sandbox.africastalking.com"
      : "https://voice.africastalking.com";
  }

  async call(options: VoiceCallOptions): Promise<any> {
    for (const phoneNumber of options.callTo) {
      if (!validatePhone(phoneNumber)) {
        throw new Error("Invalid callTo phone number: " + phoneNumber);
      }
    }

    const url = `${this.baseUrl}/call`;
    const formParams = new URLSearchParams({
      username: this.username,
      from: options.callFrom,
      to: options.callTo.join(","),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: this.apiKey,
        "User-Agent": "africastalking-node/2.0.0",
      },
      body: formParams.toString(),
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  }

  async fetchQueuedCalls(phoneNumbers: string): Promise<any> {
    if (!validatePhone(phoneNumbers)) {
      throw new Error("Invalid phone number");
    }

    const url = `${this.baseUrl}/queueStatus`;
    const formParams = new URLSearchParams({
      username: this.username,
      phoneNumbers: phoneNumbers,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: this.apiKey,
        "User-Agent": "africastalking-node/2.0.0",
      },
      body: formParams.toString(),
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  }
}

export function initialize(username: string, apiKey: string): { Voice: VoiceService } {
  if (!username || !apiKey) {
    throw new Error("Please check if your username and api key have been set.");
  }
  return {
    Voice: new VoiceService(username, apiKey),
  };
}
