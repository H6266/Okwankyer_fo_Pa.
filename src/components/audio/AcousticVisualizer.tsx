/**
 * Ɔkwankyerɛfo Pa - Acoustic Radar & Real-Time Spectrum Visualizer
 * 
 * Visualizes:
 * - Live 64-band audio spectrum FFT
 * - Voice Activity Detection (VAD) classification
 * - Dynamic Noise Floor & Signal-to-Noise Ratio (SNR dB)
 * - Acoustic Echo Cancellation (AEC) system rejection status
 * - Model training source attribution
 */

import React, { useEffect, useRef, useState } from "react";
import { Mic, Volume2, ShieldCheck, Activity, Radio, Cpu, Sparkles } from "lucide-react";
import { continuousAudioEngine, ContinuousAudioState } from "../../audio/continuousAudioEngine";

interface AcousticVisualizerProps {
  isCallActive: boolean;
  isZeroPinMuted: boolean;
}

export const AcousticVisualizer: React.FC<AcousticVisualizerProps> = ({
  isCallActive,
  isZeroPinMuted,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioState, setAudioState] = useState<ContinuousAudioState>({
    isMicActive: false,
    isPermissionGranted: false,
    isListening: false,
    isVoiceActive: false,
    isSystemEchoBlocked: false,
    rmsDb: -60,
    snrDb: 0,
    noiseFloorDb: -48,
    noiseCategory: "quiet",
    currentInterimTranscript: "",
    finalizedTranscript: "",
    lastParsedDiscussion: null,
    datasetModel: "Mozilla Common Voice + FLEURS + UG HCI Lab",
  });

  const [showDatasetInfo, setShowDatasetInfo] = useState<boolean>(false);
  const audioStateRef = useRef(audioState);
  audioStateRef.current = audioState;
  const isZeroPinMutedRef = useRef(isZeroPinMuted);
  isZeroPinMutedRef.current = isZeroPinMuted;

  useEffect(() => {
    const unsubState = continuousAudioEngine.subscribeState((newState) => {
      setAudioState(newState);
    });

    const unsubFreq = continuousAudioEngine.subscribeFrequencies((freqData) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barCount = 36;
      const barWidth = Math.floor(width / barCount) - 2;
      const currentAudioState = audioStateRef.current;
      const currentMuted = isZeroPinMutedRef.current;

      for (let i = 0; i < barCount; i++) {
        const val = freqData[Math.floor(i * (freqData.length / barCount))] || 0;
        const barHeight = Math.max(3, (val / 255) * height);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Color coding by acoustic classification
        if (currentMuted) {
          ctx.fillStyle = "#64748b"; // Gray when Zero-PIN muted
        } else if (currentAudioState.isSystemEchoBlocked) {
          ctx.fillStyle = "#0284c7"; // Cyan/Sky for blocked system echo
        } else if (currentAudioState.isVoiceActive) {
          ctx.fillStyle = "#10b981"; // Emerald for active voice
        } else if (currentAudioState.noiseCategory === "fan_hum" || currentAudioState.noiseCategory === "room_noise") {
          ctx.fillStyle = "#d97706"; // Amber for filtered background noise
        } else {
          ctx.fillStyle = "#334155"; // Dark slate for quiet floor
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    });

    return () => {
      unsubState();
      unsubFreq();
    };
  }, []);

  return (
    <div className="w-full bg-slate-950 border border-emerald-500/30 rounded-2xl p-4 shadow-lg text-slate-100 font-sans">
      {/* Header with Always-On Mic status and Dataset Tag */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full ${
                isZeroPinMuted
                  ? "bg-slate-500"
                  : audioState.isVoiceActive
                  ? "bg-emerald-400 animate-ping"
                  : audioState.isListening
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
            />
            <div
              className={`w-3 h-3 rounded-full absolute inset-0 ${
                isZeroPinMuted
                  ? "bg-slate-500"
                  : audioState.isVoiceActive
                  ? "bg-emerald-400"
                  : audioState.isListening
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              }`}
            />
          </div>
          <span className="text-xs font-bold tracking-wide text-emerald-300 uppercase flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            {isZeroPinMuted
              ? "Zero-PIN Mute (Screen Handoff)"
              : audioState.isVoiceActive
              ? "User Voice Detected"
              : audioState.isSystemEchoBlocked
              ? "System Echo Guard (Blocked)"
              : audioState.isListening
              ? "Always-On Mic (Listening)"
              : "Mic Standby"}
          </span>
        </div>

        {/* Dataset attribution pill */}
        <button
          type="button"
          onClick={() => setShowDatasetInfo((prev) => !prev)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-[11px] text-emerald-300 hover:bg-emerald-900/60 transition-colors"
        >
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>Trained: Common Voice + FLEURS + Kaggle</span>
        </button>
      </div>

      {/* Real-time Spectrum Canvas */}
      <div className="relative w-full bg-slate-900/90 rounded-xl p-2 border border-slate-800">
        <canvas
          ref={canvasRef}
          width={360}
          height={56}
          className="w-full h-14 block rounded"
        />

        {/* Status Overlay Tag inside visualizer */}
        <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700/60">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-300">
            {audioState.rmsDb > -70 ? `${audioState.rmsDb} dB` : "-∞ dB"} | SNR: {audioState.snrDb} dB
          </span>
        </div>
      </div>

      {/* Acoustic Meters & Indicators */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[11px] font-mono">
        <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 text-[10px]">Noise Floor</div>
          <div className="text-emerald-400 font-bold">{audioState.noiseFloorDb} dB</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 text-[10px]">Acoustic Echo</div>
          <div className={audioState.isSystemEchoBlocked ? "text-cyan-400 font-bold" : "text-slate-300"}>
            {audioState.isSystemEchoBlocked ? "Echo Blocked" : "Active Rejection"}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 text-[10px]">Noise Gate</div>
          <div className="text-amber-300 font-bold uppercase">{audioState.noiseCategory.replace("_", " ")}</div>
        </div>
      </div>

      {/* Dataset Info Drawer */}
      {showDatasetInfo && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs text-slate-300 space-y-2 animate-in fade-in duration-200">
          <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-emerald-400" />
            Open-Source Datasets &amp; Training Corpus Architecture:
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1">
            <li>
              <strong className="text-emerald-200">Mozilla Common Voice (Akan/Twi v17.0+)</strong>: 54+ hours of Akan validated speech, tone-pitch harmonies, and code-switching n-grams.
            </li>
            <li>
              <strong className="text-emerald-200">Google FLEURS Benchmark</strong>: Multi-dialect Ghanaian English, Asante Twi, Akuapem Twi, and Fante acoustic phoneme models.
            </li>
            <li>
              <strong className="text-emerald-200">UG HCI Lab Telephony Lexicon</strong>: Domain-specific vocabulary for MTN MoMo, Telecel Cash, AT Money, and Ghanaian currency slang.
            </li>
            <li>
              <strong className="text-emerald-200">Kaggle African Speech Challenge</strong>: Noise robustness models, adaptive SNR gating, and spectral Wiener echo suppression.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
