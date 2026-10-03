/**
 * Ɔkwankyerɛfo Pa - Real-Time Voice Gateway & Interruption Engine (liveVoiceGateway.ts)
 *
 * Implements low-latency WebSocket voice streaming, Gemini Live API bridge,
 * Voice Activity Detection (VAD), barge-in handling, client playback cancellation,
 * and structured state emission.
 */

import { WebSocket, WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { AI_CONFIG } from "../core/aiConfig";
import { aiEngine } from "../core/aiEngine";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";
import { ttsService } from "../speech/tts/ttsService";

export interface LiveVoiceSession {
  sessionId: string;
  ws: WebSocket;
  geminiLiveSession?: any;
  isAiSpeaking: boolean;
  activePlaybackTurnId?: string;
  currentScreen: string;
  currentStep: string;
  audioChunks: Buffer[];
  lastVADTimestamp: number;
}

export class LiveVoiceGateway {
  private sessions = new Map<string, LiveVoiceSession>();
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    if (process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  /**
   * Attaches WebSocket server handling `/api/ai/live` streams.
   */
  public attachServer(wss: WebSocketServer): void {
    wss.on("connection", (ws: WebSocket, req) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname !== "/api/ai/live") return;

      const sessionId = url.searchParams.get("sessionId") || `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const session: LiveVoiceSession = {
        sessionId,
        ws,
        isAiSpeaking: false,
        currentScreen: "HOME",
        currentStep: "welcome",
        audioChunks: [],
        lastVADTimestamp: Date.now(),
      };

      this.sessions.set(sessionId, session);
      this.emitEvent(session, { type: "STATE_CHANGE", state: "IDLE", sessionId });

      // Initialize Gemini Live API if key is present
      this.setupLiveConnection(session).catch(err => {
        console.warn("[LiveVoiceGateway] Gemini Live API fallback mode:", err.message);
      });

      ws.on("message", async (data: Buffer | string) => {
        await this.handleClientMessage(session, data);
      });

      ws.on("close", () => {
        if (session.geminiLiveSession) {
          try {
            session.geminiLiveSession.close();
          } catch {}
        }
        this.sessions.delete(sessionId);
      });

      ws.on("error", (err) => {
        console.error(`[LiveVoiceGateway] WebSocket error (${sessionId}):`, err);
      });
    });
  }

  private async setupLiveConnection(session: LiveVoiceSession): Promise<void> {
    if (!this.ai || !process.env.GEMINI_API_KEY) return;

    try {
      const liveSession = await this.ai.live.connect({
        model: AI_CONFIG.liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: "You are Ɔkwankyerɛfo Pa, an empathetic Ghanaian mobile money voice assistant fluent in English and Akan/Twi. Never ask for or accept a MoMo PIN.",
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              session.isAiSpeaking = true;
              this.emitEvent(session, {
                type: "AUDIO_CHUNK",
                audioBase64: audioData,
                mimeType: "audio/pcm;rate=24000",
              });
            }

            if (message.serverContent?.interrupted) {
              this.handleBargeIn(session, "Gemini Live detected user barge-in");
            }
          },
        },
      });

      session.geminiLiveSession = liveSession;
    } catch (err: any) {
      console.warn("[LiveVoiceGateway] Could not connect to Gemini Live:", err.message);
    }
  }

  private async handleClientMessage(session: LiveVoiceSession, rawData: Buffer | string): Promise<void> {
    try {
      let parsed: any;
      if (typeof rawData === "string" || Buffer.isBuffer(rawData)) {
        try {
          parsed = JSON.parse(rawData.toString());
        } catch {
          // If binary PCM audio buffer, treat directly as audio frame
          parsed = { type: "AUDIO_FRAME", buffer: rawData };
        }
      }

      switch (parsed.type) {
        // User is speaking (Audio frame or VAD activity)
        case "AUDIO_FRAME":
        case "AUDIO_INPUT": {
          this.handleIncomingAudio(session, parsed.audioBase64 || parsed.buffer);
          break;
        }

        // Explicit barge-in event from client VAD
        case "BARGE_IN":
        case "INTERRUPT": {
          this.handleBargeIn(session, "Client-side VAD barge-in detected");
          break;
        }

        // Finalized utterance (spoken speech transcribed on client or text message)
        case "USER_UTTERANCE": {
          await this.processTurn(session, parsed.text || "", parsed.language);
          break;
        }

        // DTMF keypress (1, 2, 3, #, etc.)
        case "DTMF": {
          await this.processTurn(session, parsed.digit, parsed.language, "DTMF");
          break;
        }

        default:
          break;
      }
    } catch (err: any) {
      console.error("[LiveVoiceGateway] Message handler error:", err);
      this.emitEvent(session, { type: "ERROR", message: err.message });
    }
  }

  /**
   * Low-latency Barge-in / Interruption handler
   * Cancels client playback immediately and flags turn.
   */
  public handleBargeIn(session: LiveVoiceSession, reason: string): void {
    if (session.isAiSpeaking) {
      session.isAiSpeaking = false;
      session.activePlaybackTurnId = undefined;

      // Discard buffered playback and instruct client to stop audio output immediately
      this.emitEvent(session, {
        type: "INTERRUPTED",
        reason,
        timestamp: Date.now(),
      });
      this.emitEvent(session, { type: "STATE_CHANGE", state: "INTERRUPTED" });
    }
  }

  private handleIncomingAudio(session: LiveVoiceSession, chunk: string | Buffer): void {
    // If AI is currently speaking and user speaks, trigger barge-in!
    if (session.isAiSpeaking) {
      this.handleBargeIn(session, "User speech detected during AI playback");
    }

    // Buffer audio for batch transcription if not using Live API
    if (typeof chunk === "string") {
      session.audioChunks.push(Buffer.from(chunk, "base64"));
    } else {
      session.audioChunks.push(chunk);
    }

    session.lastVADTimestamp = Date.now();
    this.emitEvent(session, { type: "STATE_CHANGE", state: "LISTENING" });

    // Forward to Gemini Live API if connected
    if (session.geminiLiveSession) {
      const base64Data = typeof chunk === "string" ? chunk : chunk.toString("base64");
      session.geminiLiveSession.sendRealtimeInput({
        audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
      });
    }
  }

  /**
   * Processes a turn through the single canonical aiEngine orchestrator.
   */
  public async processTurn(
    session: LiveVoiceSession,
    input: string,
    languageHint?: string,
    channel: "VOICE" | "DTMF" | "TEXT" = "VOICE"
  ): Promise<void> {
    this.emitEvent(session, { type: "STATE_CHANGE", state: "UNDERSTANDING" });

    // Run through central canonical orchestrator
    const result = await aiEngine.process({
      sessionId: session.sessionId,
      channel,
      input,
      language: (languageHint as any) || "tw",
      currentScreen: session.currentScreen,
      currentStep: session.currentStep,
    });

    // Update session state
    session.currentScreen = result.navigation.targetScreen || session.currentScreen;
    session.currentStep = result.navigation.targetStep || session.currentStep;

    // Check safety alert
    if (result.safety.pinDetectedInVoice) {
      this.emitEvent(session, {
        type: "SECURITY_ALERT",
        reason: result.safety.blockedReason,
      });
    }

    // Check if client confirmation is required
    if (result.action.requiresClientConfirmation) {
      this.emitEvent(session, {
        type: "CONFIRMATION_REQUIRED",
        action: result.action.type,
        params: result.action.params,
        prompt: result.dialogue.response,
      });
    }

    // Synthesize audio response via TTS
    this.emitEvent(session, { type: "STATE_CHANGE", state: "SPEAKING" });
    session.isAiSpeaking = true;
    const turnId = `turn_${Date.now()}`;
    session.activePlaybackTurnId = turnId;

    try {
      const ttsResult = await ttsService.speak(
        result.dialogue.response,
        result.language,
        result.speech.voiceProfile
      );

      if (ttsResult.audioBase64 && session.activePlaybackTurnId === turnId) {
        this.emitEvent(session, {
          type: "AUDIO_RESPONSE",
          turnId,
          audioBase64: ttsResult.audioBase64,
          mimeType: ttsResult.audioMimeType,
          text: result.dialogue.response,
        });
      }
    } catch (err: any) {
      console.warn("[LiveVoiceGateway] TTS synthesis notice:", err.message);
    }

    this.emitEvent(session, {
      type: "TURN_COMPLETED",
      turnId,
      result,
    });
  }

  private emitEvent(session: LiveVoiceSession, event: Record<string, any>): void {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(event));
    }
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}

export const liveVoiceGateway = new LiveVoiceGateway();
