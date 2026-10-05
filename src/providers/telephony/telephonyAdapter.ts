/**
 * Ɔkwankyerɛfo Pa - Telephony Adapter Interface & Dual Implementations
 *
 * Implements Section 11 & 12:
 * ONE TELEPHONY LOGIC -> TWO DELIVERY ADAPTERS
 * 1. AfricaTalkingAdapter: Produces authentic Africa's Talking VoiceXML for real phone calls.
 * 2. SimulatorTelephonyAdapter: Produces identical VoiceXML plus structured UI state for the Digital Twin simulator.
 */

export function escapeXml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface CollectDigitsOptions {
  timeout?: number;
  finishOnKey?: string;
  numDigits?: number;
  callbackUrl: string;
  promptText?: string;
  promptAudioUrl?: string;
  voice?: string;
}

export interface CollectSpeechOptions {
  timeout?: number;
  finishOnKey?: string;
  maxLength?: number;
  callbackUrl: string;
  playBeep?: boolean;
  trimSilence?: boolean;
}

export interface SimulatorInstruction {
  type: "SPEAK" | "COLLECT_DIGITS" | "COLLECT_SPEECH" | "PLAY_AUDIO" | "REDIRECT" | "HANGUP";
  prompt?: string;
  audioUrl?: string;
  timeoutSec?: number;
  finishOnKey?: string;
  numDigits?: number;
  callbackUrl?: string;
  voiceXml: string;
}

export interface TelephonyAdapter {
  answerCall(params: { sessionId: string; callerNumber: string }): string;
  speak(text: string, options?: { voice?: string; language?: string }): string;
  playAudio(url: string): string;
  collectDigits(options: CollectDigitsOptions): string;
  collectSpeech(options: CollectSpeechOptions): string;
  redirect(url: string): string;
  hangup(reason?: string): string;
  buildVoiceXml(elements: string[]): string;
}

/**
 * Real Africa's Talking Telephony Delivery Adapter
 */
export class AfricaTalkingAdapter implements TelephonyAdapter {
  public answerCall(params: { sessionId: string; callerNumber: string }): string {
    return `<Response><!-- Inbound call accepted from ${escapeXml(params.callerNumber)} --></Response>`;
  }

  public speak(text: string, options?: { voice?: string; language?: string }): string {
    const voice = options?.voice || (options?.language === "tw" || options?.language === "ak" ? "woman" : "alice");
    return `<Say voice="${escapeXml(voice)}">${escapeXml(text)}</Say>`;
  }

  public playAudio(url: string): string {
    return `<Play url="${escapeXml(url)}"/>`;
  }

  public collectDigits(options: CollectDigitsOptions): string {
    const timeout = options.timeout ?? 5;
    const finishOnKey = options.finishOnKey ?? "#";
    const numDigits = options.numDigits ?? 10;
    const voice = options.voice || "alice";

    let inner = "";
    if (options.promptAudioUrl) {
      inner += `    <Play url="${escapeXml(options.promptAudioUrl)}"/>\n`;
    }
    if (options.promptText) {
      inner += `    <Say voice="${escapeXml(voice)}">${escapeXml(options.promptText)}</Say>\n`;
    }

    return `  <GetDigits timeout="${timeout}" finishOnKey="${escapeXml(finishOnKey)}" numDigits="${numDigits}" callbackUrl="${escapeXml(options.callbackUrl)}">\n${inner}  </GetDigits>`;
  }

  public collectSpeech(options: CollectSpeechOptions): string {
    const timeout = options.timeout ?? 4;
    const finishOnKey = options.finishOnKey ?? "#";
    const maxLength = options.maxLength ?? 5;
    const playBeep = options.playBeep ?? true;
    const trimSilence = options.trimSilence ?? true;

    return `  <Record timeout="${timeout}" finishOnKey="${escapeXml(finishOnKey)}" maxLength="${maxLength}" playBeep="${playBeep}" trimSilence="${trimSilence}" callbackUrl="${escapeXml(options.callbackUrl)}"/>`;
  }

  public redirect(url: string): string {
    return `  <Redirect>${escapeXml(url)}</Redirect>`;
  }

  public hangup(_reason?: string): string {
    return "  <Reject/>";
  }

  public buildVoiceXml(elements: string[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${elements.join("\n")}\n</Response>`;
  }
}

/**
 * Phone Simulator Digital Twin Delivery Adapter
 * Emits matching VoiceXML and records structured UI delivery instructions.
 */
export class SimulatorTelephonyAdapter implements TelephonyAdapter {
  private lastInstruction: SimulatorInstruction | null = null;
  private xmlTraces: Array<{ step: string; xml: string; timestamp: string }> = [];

  public getLastInstruction(): SimulatorInstruction | null {
    return this.lastInstruction;
  }

  public getTraces(): Array<{ step: string; xml: string; timestamp: string }> {
    return [...this.xmlTraces];
  }

  public answerCall(params: { sessionId: string; callerNumber: string }): string {
    const xml = `<Response><!-- Simulator connected: ${escapeXml(params.sessionId)} --></Response>`;
    this.lastInstruction = {
      type: "SPEAK",
      prompt: `Connected from ${params.callerNumber}`,
      voiceXml: xml,
    };
    return xml;
  }

  public speak(text: string, options?: { voice?: string; language?: string }): string {
    const voice = options?.voice || (options?.language === "tw" || options?.language === "ak" ? "woman" : "alice");
    const xml = `<Say voice="${escapeXml(voice)}">${escapeXml(text)}</Say>`;
    this.lastInstruction = {
      type: "SPEAK",
      prompt: text,
      voiceXml: xml,
    };
    return xml;
  }

  public playAudio(url: string): string {
    const xml = `<Play url="${escapeXml(url)}"/>`;
    this.lastInstruction = {
      type: "PLAY_AUDIO",
      audioUrl: url,
      voiceXml: xml,
    };
    return xml;
  }

  public collectDigits(options: CollectDigitsOptions): string {
    const timeout = options.timeout ?? 5;
    const finishOnKey = options.finishOnKey ?? "#";
    const numDigits = options.numDigits ?? 10;
    const voice = options.voice || "alice";

    let inner = "";
    if (options.promptAudioUrl) {
      inner += `    <Play url="${escapeXml(options.promptAudioUrl)}"/>\n`;
    }
    if (options.promptText) {
      inner += `    <Say voice="${escapeXml(voice)}">${escapeXml(options.promptText)}</Say>\n`;
    }

    const xml = `  <GetDigits timeout="${timeout}" finishOnKey="${escapeXml(finishOnKey)}" numDigits="${numDigits}" callbackUrl="${escapeXml(options.callbackUrl)}">\n${inner}  </GetDigits>`;
    this.lastInstruction = {
      type: "COLLECT_DIGITS",
      prompt: options.promptText,
      audioUrl: options.promptAudioUrl,
      timeoutSec: timeout,
      finishOnKey,
      numDigits,
      callbackUrl: options.callbackUrl,
      voiceXml: xml,
    };
    return xml;
  }

  public collectSpeech(options: CollectSpeechOptions): string {
    const timeout = options.timeout ?? 4;
    const finishOnKey = options.finishOnKey ?? "#";
    const maxLength = options.maxLength ?? 5;
    const playBeep = options.playBeep ?? true;
    const trimSilence = options.trimSilence ?? true;

    const xml = `  <Record timeout="${timeout}" finishOnKey="${escapeXml(finishOnKey)}" maxLength="${maxLength}" playBeep="${playBeep}" trimSilence="${trimSilence}" callbackUrl="${escapeXml(options.callbackUrl)}"/>`;
    this.lastInstruction = {
      type: "COLLECT_SPEECH",
      timeoutSec: timeout,
      finishOnKey,
      callbackUrl: options.callbackUrl,
      voiceXml: xml,
    };
    return xml;
  }

  public redirect(url: string): string {
    const xml = `  <Redirect>${escapeXml(url)}</Redirect>`;
    this.lastInstruction = {
      type: "REDIRECT",
      callbackUrl: url,
      voiceXml: xml,
    };
    return xml;
  }

  public hangup(reason?: string): string {
    const xml = "  <Reject/>";
    this.lastInstruction = {
      type: "HANGUP",
      prompt: reason || "Call ended",
      voiceXml: xml,
    };
    return xml;
  }

  public buildVoiceXml(elements: string[]): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${elements.join("\n")}\n</Response>`;
    this.xmlTraces.unshift({
      step: this.lastInstruction?.callbackUrl || "turn",
      xml,
      timestamp: new Date().toLocaleTimeString(),
    });
    if (this.xmlTraces.length > 50) {
      this.xmlTraces.pop();
    }
    return xml;
  }
}

export const africaTalkingAdapter = new AfricaTalkingAdapter();
export const simulatorTelephonyAdapter = new SimulatorTelephonyAdapter();
