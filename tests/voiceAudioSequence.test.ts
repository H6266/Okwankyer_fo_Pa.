import { describe, expect, it, vi } from "vitest";
import { createSingleShotTimer, playAudioElementOnce, playVoiceSequence } from "../src/audio/voiceAudioSequence";
import { parseVoiceXml } from "../src/lib/api";

describe("voice audio sequence", () => {
  it("preserves interleaved VoiceXML play and say order", () => {
    const parsed = parseVoiceXml(`<Response>
      <Play url="/audio/first.mp3"/>
      <Say voice="female">Ama Mensah. 20 Ghana cedis.</Say>
      <Play url="/audio/confirm.mp3"/>
    </Response>`);
    expect(parsed.voiceSequence).toEqual([
      { type: "play", value: "/audio/first.mp3" },
      { type: "say", value: "Ama Mensah. 20 Ghana cedis." },
      { type: "play", value: "/audio/confirm.mp3" },
    ]);
  });

  it("advances once when ended, error, and rejected play all fire", async () => {
    let rejectPlay!: (reason?: unknown) => void;
    const audio = {
      src: "",
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
      play: vi.fn(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; })),
    };
    const order: string[] = [];
    const queue = playVoiceSequence([
      { type: "play", value: "clip-a" },
      { type: "play", value: "clip-b" },
    ], async (item) => {
      order.push(`start:${item.value}`);
      const played = await playAudioElementOnce(audio, item.value);
      order.push(`end:${item.value}:${played}`);
      return played;
    });

    audio.onended?.();
    audio.onerror?.();
    rejectPlay(new Error("autoplay rejected"));
    await vi.waitFor(() => expect(order).toContain("start:clip-b"));
    expect(order).toEqual(["start:clip-a", "end:clip-a:true", "start:clip-b"]);

    audio.onended?.();
    await expect(queue).resolves.toBe(true);
    expect(order).toEqual([
      "start:clip-a",
      "end:clip-a:true",
      "start:clip-b",
      "end:clip-b:true",
    ]);
  });

  it("continues the queue after a failed item without overlapping items", async () => {
    const order: string[] = [];
    const played = await playVoiceSequence([
      { type: "play", value: "failed" },
      { type: "say", value: "next" },
    ], async (item) => {
      order.push(`start:${item.value}`);
      await Promise.resolve();
      order.push(`end:${item.value}`);
      return item.value !== "failed";
    });

    expect(played).toBe(false);
    expect(order).toEqual(["start:failed", "end:failed", "start:next", "end:next"]);
  });

  it("cancels on caller input and never retains more than one inactivity timer", () => {
    vi.useFakeTimers();
    const timer = createSingleShotTimer(90_000);
    const reminder = vi.fn();

    timer.arm(reminder);
    expect(timer.isArmed()).toBe(true);
    vi.advanceTimersByTime(45_000);
    timer.arm(reminder);
    expect(vi.getTimerCount()).toBe(1);
    timer.clear();
    expect(timer.isArmed()).toBe(false);
    vi.advanceTimersByTime(90_000);
    expect(reminder).not.toHaveBeenCalled();

    timer.arm(reminder);
    vi.advanceTimersByTime(90_000);
    expect(reminder).toHaveBeenCalledOnce();
    expect(timer.isArmed()).toBe(false);
    vi.useRealTimers();
  });
});