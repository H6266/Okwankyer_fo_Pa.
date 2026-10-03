/**
 * Ɔkwankyerɛfo Pa - Real-Time Voice Gateway & Interruption Engine (liveVoiceGateway.ts)
 *
 * Implements:
 * 1. Single Cognitive Authority: All conversational turns, decisions, actions, and speech
 *    flow through the canonical aiEngine.process() pipeline. No secondary brain.
 * 2. Gemini Live Session Integration: Low-latency live speech event streaming and transcription.
 * 3. Dynamic Ghanaian Voice Profiles: Voice name selected from configurable profiles, not hard-coded.
 * 4. Immediate Barge-in / Interruption: AI playback cancels immediately upon user speech.
 * 5. Full Audio-First Protocol: Supports binary PCM, WAV, base64 audio frames, VAD events, and DTMF.
 */

import { WebSocket, WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { AI_CONFIG } from "../core/aiConfig";
import { aiEngine } from "../core/aiEngine";
import { GHANA_VOICE_PROFILES } from "../speech/voiceProfiles/ghanaProfile";
import { ttsService } from "../speech/tts/ttsService";
import { audioIngestor } from "../perception/audioIngestor";
import { AudioFrame, InterruptionEvent, TranscriptFinal, TranscriptPartial, VoiceSessionState } from "../core/aiTypes";

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
  voiceProfileId: string;
  turnCount: number;
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
      const voiceProfileId = url.searchParams.get("voiceProfile") || "ghanaian-warm";

      const session: LiveVoiceSession = {
        sessionId,
        ws,
        isAiSpeaking: false,
        currentScreen: "HOME",
        currentStep: "welcome",
        audioChunks: [],
        lastVADTimestamp: Date.now(),
        voiceProfileId,
        turnCount: 0,
      };

      this.sessions.set(sessionId, session);
      this.emitEvent(session, {
        type: "STATE_CHANGE",
        state: "IDLE",
        sessionId,
        voiceProfile: session.voiceProfileId,
      });

      // Connect Live API bridge for real-time speech event ingestion
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

    // Resolve voice name from dynamic profile architecture (never hard-coded!)
    const profile = GHANA_VOICE_PROFILES[session.voiceProfileId] || GHANA_VOICE_PROFILES["ghanaian-warm"];
    const voiceName = profile?.providerVoiceName || "Kore";

    try {
      const liveSession = await this.ai.live.connect({
        model: AI_CONFIG.liveModel,
        config: {
          responseModalities: [Modality.TEXT], // Live session used for transcription events; canonical engine is the sole voice authority
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: "You are an automated speech recognition and transcription assistant for Ɔkwankyerɛfo Pa. You transcribe user utterances in English or Akan/Twi accurately.",
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            // Forward partial transcripts to client for zero-latency feedback
            const textPart = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (textPart) {
              this.emitEvent(session, {
                type: "TRANSCRIPT_PARTIAL",
                text: textPart,
                timestamp: Date.now(),
              });
            }

            // User speech barge-in detected by Gemini Live
            if (message.serverContent?.interrupted) {
              this.handleBargeIn(session, "Gemini Live detected user barge-in");
            }

            // End-of-turn boundary from user speech
            if (message.serverContent?.turnComplete && textPart) {
              this.emitEvent(session, {
                type: "TRANSCRIPT_FINAL",
                text: textPart,
                timestamp: Date.now(),
              });
              await this.processTurn(session, textPart);
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
      if (typeof rawData === "string") {
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = { type: "USER_UTTERANCE", text: rawData };
        }
      } else if (Buffer.isBuffer(rawData)) {
        try {
          parsed = JSON.parse(rawData.toString("utf-8"));
        } catch {
          // Binary audio frame
          parsed = { type: "AUDIO_FRAME", buffer: rawData };
        }
      }

      switch (parsed.type) {
        // User speech audio frame or streaming audio input
        case "AUDIO_FRAME":
        case "AUDIO_INPUT": {
          this.handleIncomingAudio(session, parsed.audioBase64 || parsed.buffer, parsed.mimeType);
          break;
        }

        // Explicit barge-in event from client VAD
        case "BARGE_IN":
        case "INTERRUPT": {
          this.handleBargeIn(session, parsed.reason || "Client-side VAD barge-in detected");
          break;
        }

        // Finalized utterance (from client speech recognition or text)
        case "USER_UTTERANCE": {
          if (session.isAiSpeaking) {
            this.handleBargeIn(session, "User utterance arrived during AI playback");
          }
          await this.processTurn(session, parsed.text || "", parsed.language);
          break;
        }

        // DTMF keypress (1, 2, 3, #, etc.)
        case "DTMF": {
          if (session.isAiSpeaking) {
            this.handleBargeIn(session, "User DTMF keypress during AI playback");
          }
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
   * Immediate Barge-in / Interruption Handler
   * Stops audio playback, cancels synthesis, and frees turn.
   */
  public handleBargeIn(session: LiveVoiceSession, reason: string): void {
    if (session.isAiSpeaking) {
      const interruptedTurnId = session.activePlaybackTurnId || `turn_${Date.now()}`;
      session.isAiSpeaking = false;
      session.activePlaybackTurnId = undefined;

      const interruptionEvent: InterruptionEvent = {
        turnId: interruptedTurnId,
        interruptedAtTimestamp: Date.now(),
        reason,
        playbackCancelled: true,
      };

      // Discard buffered playback and instruct client to stop audio output immediately
      this.emitEvent(session, {
        type: "INTERRUPTED",
        ...interruptionEvent,
      });
      this.emitEvent(session, { type: "STATE_CHANGE", state: "INTERRUPTED" });
    }
  }

  private handleIncomingAudio(session: LiveVoiceSession, chunk: string | Buffer, mimeType?: string): void {
    // If AI is currently speaking and user speaks, trigger barge-in immediately!
    if (session.isAiSpeaking) {
      this.handleBargeIn(session, "User speech detected during AI playback");
    }

    let buf: Buffer;
    if (typeof chunk === "string") {
      buf = Buffer.from(chunk.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64");
    } else {
      buf = chunk;
    }

    session.audioChunks.push(buf);
    session.lastVADTimestamp = Date.now();
    this.emitEvent(session, { type: "STATE_CHANGE", state: "LISTENING" });

    // Stream real-time input to Live API if session exists
    if (session.geminiLiveSession) {
      const base64Data = buf.toString("base64");
      session.geminiLiveSession.sendRealtimeInput({
        audio: { data: base64Data, mimeType: mimeType || "audio/pcm;rate=16000" },
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
    channel: "VOICE" | "DTMF" | "TEXT" = "VOICE",
    audioBuffer?: Buffer
  ): Promise<void> {
    this.emitEvent(session, { type: "STATE_CHANGE", state: "UNDERSTANDING" });
    session.turnCount++;

    // Run through central canonical orchestrator (Sole Cognitive Authority)
    const result = await aiEngine.process({
      sessionId: session.sessionId,
      channel,
      input,
      audioBuffer: audioBuffer || (session.audioChunks.length > 0 ? Buffer.concat(session.audioChunks) : undefined),
      language: (languageHint as any) || "tw",
      currentScreen: session.currentScreen,
      currentStep: session.currentStep,
    });

    // Clear buffered chunks for next turn
    session.audioChunks = [];

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

    // Synthesize audio response via canonical TTS
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

      // Only send audio if this turn was NOT interrupted during synthesis
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
