/**
 * Ɔkwankyerɛfo Pa - Simulator Event Bus & Structured Terminal Logger (simulatorLog.ts)
 * 
 * Provides an authoritative typed event stream for the Phone Simulator:
 * - Independent of React, callable from any engine, hook, or controller.
 * - Format: HH:MM:SS.mmm  [CATEGORY]  message  (+Δms)
 * - Capped at 2000 entries (drops oldest).
 * - Exports formatted text and JSON payloads.
 */

import { useState, useEffect, useCallback } from "react";

export type LogCategory =
  | "KEY"
  | "AUDIO"
  | "MIC"
  | "ASR"
  | "MATCH"
  | "BRAIN"
  | "TURN"
  | "TTS"
  | "STEP"
  | "ERROR";

export interface LogEventInput {
  ts?: number;
  category: LogCategory;
  message: string;
  turnId?: string;
  data?: unknown;
}

export interface SimulatorLogEntry {
  id: string;
  ts: number;
  deltaMs: number;
  category: LogCategory;
  message: string;
  turnId?: string;
  data?: unknown;
  formattedTime: string;
}

const MAX_LOG_ENTRIES = 2000;

class SimulatorLogBus {
  private entries: SimulatorLogEntry[] = [];
  private listeners: Set<(entry: SimulatorLogEntry) => void> = new Set();
  private batchListeners: Set<(entries: SimulatorLogEntry[]) => void> = new Set();
  private lastTimestamp: number = Date.now();
  private counter: number = 0;

  public emit(input: LogEventInput): SimulatorLogEntry {
    const ts = typeof input.ts === "number" ? input.ts : Date.now();
    const deltaMs = Math.max(0, ts - this.lastTimestamp);
    this.lastTimestamp = ts;
    this.counter++;

    const date = new Date(ts);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    const formattedTime = `${hours}:${minutes}:${seconds}.${ms}`;

    const entry: SimulatorLogEntry = {
      id: `log_${ts}_${this.counter}`,
      ts,
      deltaMs,
      category: input.category,
      message: input.message,
      turnId: input.turnId,
      data: input.data,
      formattedTime,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    this.listeners.forEach((fn) => {
      try {
        fn(entry);
      } catch (err) {
        console.error("[SimulatorLog] Listener error:", err);
      }
    });

    this.batchListeners.forEach((fn) => {
      try {
        fn(this.entries);
      } catch (err) {
        console.error("[SimulatorLog] Batch listener error:", err);
      }
    });

    return entry;
  }

  public subscribe(listener: (entry: SimulatorLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeBatch(listener: (entries: SimulatorLogEntry[]) => void): () => void {
    this.batchListeners.add(listener);
    listener(this.entries);
    return () => this.batchListeners.delete(listener);
  }

  public getEntries(): SimulatorLogEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries = [];
    this.lastTimestamp = Date.now();
    this.batchListeners.forEach((fn) => {
      try {
        fn(this.entries);
      } catch {}
    });
  }

  public exportText(): string {
    return this.entries
      .map((e) => {
        const turnPrefix = e.turnId ? `[${e.turnId}] ` : "";
        const delta = `(+${e.deltaMs}ms)`;
        return `${e.formattedTime}  ${turnPrefix}[${e.category.padEnd(5)}]  ${e.message}  ${delta}`;
      })
      .join("\n");
  }
}

export const simulatorLog = new SimulatorLogBus();

export function emitSimulatorLog(input: LogEventInput): SimulatorLogEntry {
  return simulatorLog.emit(input);
}

/**
 * React hook to subscribe to the simulator terminal log stream
 */
export function useSimulatorLog() {
  const [logs, setLogs] = useState<SimulatorLogEntry[]>(() => simulatorLog.getEntries());

  useEffect(() => {
    return simulatorLog.subscribeBatch((updated) => {
      setLogs([...updated]);
    });
  }, []);

  const clear = useCallback(() => {
    simulatorLog.clear();
  }, []);

  const exportText = useCallback(() => {
    return simulatorLog.exportText();
  }, []);

  return {
    logs,
    clear,
    exportText,
    count: logs.length,
  };
}
