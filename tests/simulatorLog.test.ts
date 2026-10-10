import { describe, it, expect, beforeEach } from "vitest";
import { simulatorLog, emitSimulatorLog } from "../src/lib/simulatorLog";

describe("SimulatorLog Event Bus", () => {
  beforeEach(() => {
    simulatorLog.clear();
  });

  it("emits events with formatted time, deltaMs, and category", () => {
    const entry = emitSimulatorLog({
      category: "KEY",
      message: "Pressed key 1",
      turnId: "T1",
    });

    expect(entry.category).toBe("KEY");
    expect(entry.message).toBe("Pressed key 1");
    expect(entry.turnId).toBe("T1");
    expect(entry.formattedTime).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(simulatorLog.getEntries()).toHaveLength(1);
  });

  it("supports listener subscriptions", () => {
    const received: string[] = [];
    const unsubscribe = simulatorLog.subscribe((e) => {
      received.push(e.message);
    });

    emitSimulatorLog({ category: "AUDIO", message: "Prompt start" });
    emitSimulatorLog({ category: "AUDIO", message: "Prompt end" });
    unsubscribe();
    emitSimulatorLog({ category: "AUDIO", message: "After unsubscribe" });

    expect(received).toEqual(["Prompt start", "Prompt end"]);
  });

  it("caps retained entries at 2000", () => {
    for (let i = 0; i < 2050; i++) {
      emitSimulatorLog({
        category: "MIC",
        message: `Frame chunk ${i}`,
      });
    }

    const entries = simulatorLog.getEntries();
    expect(entries.length).toBe(2000);
    expect(entries[entries.length - 1].message).toBe("Frame chunk 2049");
    expect(entries[0].message).toBe("Frame chunk 50");
  });

  it("clears entries and exports formatted text", () => {
    emitSimulatorLog({ category: "STEP", message: "Step changed to service-select", turnId: "T2" });
    emitSimulatorLog({ category: "TURN", message: "Turn accepted", turnId: "T2" });

    const text = simulatorLog.exportText();
    expect(text).toContain("[T2] [STEP ]  Step changed to service-select");
    expect(text).toContain("[T2] [TURN ]  Turn accepted");

    const json = simulatorLog.exportJson();
    expect(json).toContain('"category": "STEP"');
    expect(json).toContain('"category": "TURN"');

    simulatorLog.clear();
    expect(simulatorLog.getEntries()).toHaveLength(0);
    expect(simulatorLog.exportText()).toBe("");
    expect(simulatorLog.exportJson()).toBe("[]");
  });
});
