export function normalizeAtPhone(phoneStr: string): string {
  let cleaned = (phoneStr || "").replace(/[\s\-\(\)]/g, "").trim();
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("233")) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `+233${cleaned.slice(1)}`;
  }
  if (/^\d{9,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function validatePhone(phoneStr: string): boolean {
  const normalized = normalizeAtPhone(phoneStr);
  return /^\+\d{1,3}\d{4,14}$/.test(normalized);
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
    const normalizedCallTo: string[] = [];
    for (const rawPhone of options.callTo) {
      const phoneNumber = normalizeAtPhone(rawPhone);
      if (!validatePhone(phoneNumber)) {
        throw new Error("Invalid callTo phone number: " + rawPhone);
      }
      normalizedCallTo.push(phoneNumber);
    }
    const callFromNumber = normalizeAtPhone(options.callFrom);

    // Auto-adapt sandbox username if key starts with atsk_
    let effectiveUsername = this.username;
    if (this.apiKey.startsWith("atsk_") && effectiveUsername.toLowerCase() !== "sandbox") {
      effectiveUsername = "sandbox";
    }

    const formParams = new URLSearchParams({
      username: effectiveUsername,
      from: callFromNumber,
      to: normalizedCallTo.join(","),
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

export interface SmsSendOptions {
  to: string[];
  message: string;
  from?: string;
}

export class SmsService {
  private username: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(username: string, apiKey: string) {
    this.username = (username || "").trim();
    this.apiKey = (apiKey || "").trim();
    const isSandbox = this.username.toLowerCase() === "sandbox" || this.apiKey.startsWith("atsk_");
    this.baseUrl = isSandbox
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";
  }

  async send(options: SmsSendOptions): Promise<any> {
    const normalizedRecipients: string[] = [];
    for (const raw of options.to) {
      const norm = normalizeAtPhone(raw);
      if (validatePhone(norm)) {
        normalizedRecipients.push(norm);
      }
    }

    if (normalizedRecipients.length === 0) {
      throw new Error("No valid recipient phone numbers provided for SMS dispatch.");
    }

    let effectiveUsername = this.username;
    if (this.apiKey.startsWith("atsk_") && effectiveUsername.toLowerCase() !== "sandbox") {
      effectiveUsername = "sandbox";
    }

    const formParams = new URLSearchParams({
      username: effectiveUsername,
      to: normalizedRecipients.join(","),
      message: options.message,
    });
    if (options.from) {
      formParams.append("from", options.from);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey: this.apiKey,
      "User-Agent": "africastalking-node/2.0.0",
    };

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: formParams.toString(),
    });

    const data = await res.json().catch(async () => ({ raw: await res.text() }));
    if (!res.ok) {
      throw new Error(`Africa's Talking SMS API failed with HTTP ${res.status}: ${JSON.stringify(data)}`);
    }
    return data;
  }
}

export function initialize(username: string, apiKey: string): { Voice: VoiceService; SMS: SmsService } {
  if (!username || !apiKey) {
    throw new Error("Please check if your username and api key have been set.");
  }
  return {
    Voice: new VoiceService(username, apiKey),
    SMS: new SmsService(username, apiKey),
  };
}
