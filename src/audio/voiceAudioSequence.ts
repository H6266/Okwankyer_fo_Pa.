export interface VoiceSequenceItem {
  type: "play" | "say";
  value: string;
}

export interface VoiceAudioElement {
  src: string;
  onended: ((...args: any[]) => unknown) | null;
  onerror: ((...args: any[]) => unknown) | null;
  play(): Promise<void> | void;
}

export interface SingleShotTimer {
  arm(callback: () => void): void;
  clear(): void;
  isArmed(): boolean;
}

export function createSingleShotTimer(timeoutMs: number): SingleShotTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    arm(callback) {
      this.clear();
      handle = setTimeout(() => {
        handle = null;
        callback();
      }, timeoutMs);
    },
    clear() {
      if (handle) clearTimeout(handle);
      handle = null;
    },
    isArmed: () => handle !== null,
  };
}

export function playAudioElementOnce(audio: VoiceAudioElement, src: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (played: boolean) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      resolve(played);
    };

    audio.onended = () => settle(true);
    audio.onerror = () => settle(false);
    audio.src = src;

    try {
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        void playResult.catch(() => settle(false));
      }
    } catch {
      settle(false);
    }
  });
}

export async function playVoiceSequence(
  items: readonly VoiceSequenceItem[],
  playItem: (item: VoiceSequenceItem) => Promise<boolean>
): Promise<boolean> {
  let allPlayed = true;
  for (const item of items) {
    try {
      if (!await playItem(item)) allPlayed = false;
    } catch {
      allPlayed = false;
    }
  }
  return allPlayed;
}