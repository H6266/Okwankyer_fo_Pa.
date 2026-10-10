import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, ShieldAlert, ExternalLink, Activity } from "lucide-react";
import { VOICE_DEBUG, logVoiceDebug } from "../../lib/audio/continuousVoiceCapture";
import { emitSimulatorLog } from "../../lib/simulatorLog";

export function MicTestRow() {
  const [isSecure, setIsSecure] = useState<boolean>(true);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [permState, setPermState] = useState<string>("checking...");
  const [hasMediaDevices, setHasMediaDevices] = useState<boolean>(true);
  const [audioCtxState, setAudioCtxState] = useState<string>("none");
  const [selectedDevice, setSelectedDevice] = useState<string>("none");
  const [inputLevel, setInputLevel] = useState<number>(0);
  const [testActive, setTestActive] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. Check window.isSecureContext
    const secure = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
    setIsSecure(secure);

    // 2. Check iframe status (window.self !== window.top)
    let inFrame = false;
    try {
      inFrame = typeof window !== "undefined" && window.self !== window.top;
    } catch {
      inFrame = true;
    }
    setIsInIframe(inFrame);

    // 3. Check navigator.mediaDevices presence
    const mediaDevs = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    setHasMediaDevices(mediaDevs);

    // 4. Permissions API query for microphone
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((p) => {
          setPermState(p.state);
          p.onchange = () => {
            setPermState(p.state);
          };
        })
        .catch(() => {
          setPermState("unsupported");
        });
    } else {
      setPermState("unsupported");
    }

    return () => {
      stopTest();
    };
  }, []);

  const stopTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setTestActive(false);
    setInputLevel(0);
    setAudioCtxState("closed");
  };

  const startTest = async () => {
    if (testActive) {
      stopTest();
      return;
    }

    setTestError(null);
    try {
      emitSimulatorLog({
        category: "MIC",
        message: "Diagnostic Mic Test initiated by user...",
      });
      logVoiceDebug("[MIC_TEST] Starting standalone mic test...");

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("AudioContext not supported");
      }
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      setAudioCtxState(ctx.state);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const deviceLabel = track?.label || "Default Input Device";
      setSelectedDevice(deviceLabel);

      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      setAudioCtxState(ctx.state);

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setTestActive(true);

      emitSimulatorLog({
        category: "MIC",
        message: `Diagnostic Mic Test running: device="${deviceLabel}", AudioContext=${ctx.state}`,
      });

      const updateMeter = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setInputLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (err: any) {
      const errName = err?.name || "MicTestError";
      const errMsg = err?.message || String(err);
      setTestError(`${errName}: ${errMsg}`);
      emitSimulatorLog({
        category: "ERROR",
        message: `[MIC_TEST] Mic test failed: ${errName} - ${errMsg}`,
      });
      stopTest();
    }
  };

  if (!VOICE_DEBUG) {
    return null;
  }

  return (
    <div
      data-testid="mic-test-row"
      className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 my-2 shadow-md text-xs font-mono"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
          <Activity size={14} className={testActive ? "animate-pulse" : ""} />
          <span>MIC TEST (VOICE_DEBUG)</span>
        </div>
        <button
          type="button"
          onClick={startTest}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
            testActive
              ? "bg-rose-600 hover:bg-rose-500 text-white"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          }`}
        >
          {testActive ? <MicOff size={12} /> : <Mic size={12} />}
          <span>{testActive ? "Stop Test" : "Test Live Mic"}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Secure Context:</span>
          <span className={isSecure ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
            {isSecure ? "true (HTTPS)" : "false (Insecure)"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">Inside iframe:</span>
          <span className={isInIframe ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
            {isInIframe ? "YES (isolated)" : "NO (top window)"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">Permissions API:</span>
          <span
            className={
              permState === "granted"
                ? "text-emerald-400 font-bold"
                : permState === "denied"
                ? "text-rose-400 font-bold"
                : "text-amber-400"
            }
          >
            {permState}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">MediaDevices:</span>
          <span className={hasMediaDevices ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
            {hasMediaDevices ? "available" : "MISSING"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">AudioContext:</span>
          <span className="text-cyan-400 font-bold">{audioCtxState}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">Device:</span>
          <span className="text-slate-300 truncate max-w-[120px]" title={selectedDevice}>
            {selectedDevice}
          </span>
        </div>
      </div>

      {/* Live Input Level Bar */}
      <div className="mt-2.5 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>Live Input Level:</span>
          <span className="font-bold text-emerald-400">{inputLevel}%</span>
        </div>
        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-75 ${
              inputLevel > 60
                ? "bg-rose-500"
                : inputLevel > 20
                ? "bg-emerald-400"
                : "bg-slate-600"
            }`}
            style={{ width: `${inputLevel}%` }}
          />
        </div>
      </div>

      {testError && (
        <div className="mt-2 p-1.5 bg-rose-950/80 border border-rose-600/70 rounded text-[10px] text-rose-300 break-words">
          ⚠️ {testError}
        </div>
      )}
    </div>
  );
}
