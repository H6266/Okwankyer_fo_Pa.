/**
 * Ɔkwankyerɛfo Pa - Canonical AI Event Bus (eventBus.ts)
 * 
 * Lightweight event system decoupling internal AI stages, observability,
 * telephony pipelines, payment sagas, and digital-twin simulator listeners.
 */

import { EventEmitter } from "events";

export type AiEventType =
  | "ai.call.started"
  | "ai.turn.received"
  | "ai.asr.completed"
  | "ai.intent.detected"
  | "ai.entities.updated"
  | "ai.safety.checked"
  | "ai.confirmation.requested"
  | "ai.confirmation.accepted"
  | "ai.tool.started"
  | "ai.tool.completed"
  | "ai.provider.pending"
  | "ai.provider.success"
  | "ai.provider.failed"
  | "ai.truth.verified"
  | "ai.truth.unknown"
  | "ai.call.completed"
  | "ai.call.failed"
  | "ai.call.cancelled";

export interface AiEvent<T = any> {
  type: AiEventType;
  sessionId: string;
  timestamp: number;
  data: T;
}

class AppEventBus extends EventEmitter {
  private history: AiEvent[] = [];
  private readonly MAX_HISTORY = 500;

  public emitEvent<T = any>(type: AiEventType, sessionId: string, data?: T): boolean {
    const event: AiEvent<T> = {
      type,
      sessionId,
      timestamp: Date.now(),
      data: data as T,
    };

    this.history.push(event);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    return this.emit(type, event);
  }

  public getSessionEvents(sessionId: string): AiEvent[] {
    return this.history.filter((e) => e.sessionId === sessionId);
  }

  public getRecentEvents(limit: number = 50): AiEvent[] {
    return this.history.slice(-limit);
  }

  public clearHistory(): void {
    this.history = [];
  }
}

export const eventBus = new AppEventBus();
