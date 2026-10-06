#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "Ɔkwankyerɛfo Pa - Free Prototype Speech Stack (Vosk + Piper)"
echo "Configurable for University of Ghana HCI Lab API"
echo "=========================================================="

export VOSK_ASR_PORT="${VOSK_ASR_PORT:-8765}"
export PIPER_TTS_PORT="${PIPER_TTS_PORT:-8766}"
export VOSK_EN_MODEL_PATH="${VOSK_EN_MODEL_PATH:-models/asr/vosk-model-small-en-us-0.15}"
export VOSK_TW_MODEL_PATH="${VOSK_TW_MODEL_PATH:-models/asr/twi-model}"

# Start Vosk ASR Server
if command -v python3 &>/dev/null; then
  echo "[1/2] Starting Vosk ASR FastAPI server on port ${VOSK_ASR_PORT}..."
  python3 ml/vosk_asr_server.py &
  VOSK_PID=$!
elif command -v python &>/dev/null; then
  echo "[1/2] Starting Vosk ASR FastAPI server on port ${VOSK_ASR_PORT}..."
  python ml/vosk_asr_server.py &
  VOSK_PID=$!
else
  echo "[WARN] Python not found. Please install Python 3 to run local Vosk ASR."
fi

# Start Piper TTS Server
if command -v docker &>/dev/null; then
  echo "[2/2] Launching Piper TTS container on port ${PIPER_TTS_PORT}..."
  docker run --rm -d -p 127.0.0.1:${PIPER_TTS_PORT}:5000 rhasspy/piper || true
elif command -v python3 &>/dev/null; then
  echo "[2/2] Starting Piper TTS FastAPI wrapper on port ${PIPER_TTS_PORT}..."
  python3 ml/piper_tts_server.py &
  PIPER_PID=$!
fi

echo ""
echo "✅ Speech Stack initialized."
echo "   Vosk ASR:  http://127.0.0.1:${VOSK_ASR_PORT}/health"
echo "   Piper TTS: http://127.0.0.1:${PIPER_TTS_PORT}/health"
echo ""
echo "To switch to University of Ghana HCI Lab API for final submission:"
echo "   export SPEECH_PROVIDER=hci_lab"
echo "   export UG_HCI_LAB_URL=https://api.hci.ug.edu.gh"
echo "   export UG_HCI_LAB_API_KEY=<your-key>"
