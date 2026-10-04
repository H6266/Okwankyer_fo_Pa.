/**
 * Ɔkwankyerɛfo Pa - Local Speech Runtime Health Gate (scripts/check_local_speech.ts)
 * 
 * Verifies that the local neural speech workers (faster-whisper and Piper)
 * are alive, responsive, and ready for offline inference.
 * 
 * Run with: npm run ai:speech:health
 */

import { neuralAsrProvider } from "../src/ai_system/speech/asr/neuralAsrProvider";
import { piperProvider } from "../src/ai_system/speech/tts/localTtsProvider";

async function checkLocalSpeech() {
  console.log("🎙️  Checking Ɔkwankyerɛfo Pa Local Neural Speech Runtimes...\n");

  const [asrHealth, ttsHealth] = await Promise.all([
    neuralAsrProvider.checkHealth(),
    piperProvider.checkHealth(),
  ]);

  const rows = [
    {
      Component: "Neural ASR",
      Provider: asrHealth.provider,
      Model: asrHealth.model,
      Status: asrHealth.ready ? "✓ READY" : "✗ NOT_READY",
      Details: asrHealth.details,
    },
    {
      Component: "Neural TTS",
      Provider: ttsHealth.provider,
      Model: ttsHealth.model,
      Status: ttsHealth.ready ? "✓ READY" : "✗ NOT_READY",
      Details: ttsHealth.details,
    },
  ];

  console.table(rows);

  const bothReady = asrHealth.ready && ttsHealth.ready;

  if (bothReady) {
    console.log("\n✅ All local neural speech runtimes are online, verified, and ready for production offline traffic.");
    process.exit(0);
  } else {
    console.log("\n⚠️  LOCAL NEURAL SPEECH RUNTIME WARNING:");
    if (!asrHealth.ready) {
      console.log("  • ASR worker not running on " + (process.env.LOCAL_GHANA_ASR_URL || "http://127.0.0.1:8765"));
      console.log("    To start: python ml/local_asr_server.py");
    }
    if (!ttsHealth.ready) {
      console.log("  • TTS worker not running on " + (process.env.PIPER_TTS_URL || "http://127.0.0.1:8766"));
      console.log("    To start: python ml/local_tts_server.py");
    }
    console.log("\nPer Batch 2 Invariants: The project reports local neural voice capability as NOT_READY until both workers pass health checks.");
    process.exit(1);
  }
}

checkLocalSpeech().catch((err) => {
  console.error("FATAL: Speech health check encountered an error:", err);
  process.exit(1);
});
