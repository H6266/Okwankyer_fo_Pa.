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
    this.username = (username || "").trim();
    this.apiKey = (apiKey || "").trim();
    // In Africa's Talking, Voice call dispatch is unified at https://voice.africastalking.com
    this.baseUrl = "https://voice.africastalking.com";
  }

  async call(options: VoiceCallOptions): Promise<any> {
    for (const phoneNumber of options.callTo) {
      if (!validatePhone(phoneNumber)) {
        throw new Error("Invalid callTo phone number: " + phoneNumber);
      }
    }

    // Auto-adapt sandbox username if key starts with atsk_
    let effectiveUsername = this.username;
    if (this.apiKey.startsWith("atsk_") && effectiveUsername.toLowerCase() !== "sandbox") {
      effectiveUsername = "sandbox";
    }

    const formParams = new URLSearchParams({
      username: effectiveUsername,
      from: options.callFrom,
      to: options.callTo.join(","),
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey: this.apiKey,
      "User-Agent": "africastalking-node/2.0.0",
    };

    // Primary URL attempt
    let url = `${this.baseUrl}/call`;
    let response: any;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: formParams.toString(),
      });
    } catch (fetchErr: any) {
      // If sandbox subdomain has DNS issue, fall back to production voice gateway
      if (fetchErr.message?.includes("ENOTFOUND") && url.includes("sandbox")) {
        url = "https://voice.africastalking.com/call";
        response = await fetch(url, {
          method: "POST",
          headers,
          body: formParams.toString(),
        });
      } else {
        throw fetchErr;
      }
    }

    const contentType = response.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    // Check for Africa's Talking API error response
    if (!response.ok || (data && data.errorMessage && data.errorMessage !== "None")) {
      const errMsg = (data && data.errorMessage) ? data.errorMessage : `HTTP ${response.status} from Africa's Talking`;
      const err: any = new Error(errMsg);
      err.statusCode = response.status;
      err.response = data;
      throw err;
    }

    return data;
  }

  async verifyCredentials(): Promise<{ valid: boolean; balance?: string; errorMessage?: string }> {
    const isSandbox = this.username.toLowerCase() === "sandbox" || this.apiKey.startsWith("atsk_");
    const domain = isSandbox ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const user = isSandbox ? "sandbox" : this.username;

    try {
      const url = `https://${domain}/version1/user?username=${encodeURIComponent(user)}`;
      const res = await fetch(url, {
        headers: {
          apiKey: this.apiKey,
          Accept: "application/json",
        },
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.UserData) {
        return {
          valid: true,
          balance: data.UserData.balance,
        };
      }

      return {
        valid: false,
        errorMessage: data?.errorMessage || `HTTP ${res.status}: The supplied authentication is invalid`,
      };
    } catch (e: any) {
      return {
        valid: false,
        errorMessage: e.message || "Network error connecting to Africa's Talking",
      };
    }
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
