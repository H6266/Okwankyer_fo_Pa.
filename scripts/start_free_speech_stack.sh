#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "Ɔkwankyerɛfo Pa - Local Speech Stack (faster-whisper + Piper)"
echo "Configurable for University of Ghana HCI Lab API"
echo "=========================================================="

export LOCAL_ASR_PORT="${LOCAL_ASR_PORT:-8765}"
export PIPER_TTS_PORT="${PIPER_TTS_PORT:-8766}"
export LOCAL_ASR_MODEL_PATH="${LOCAL_ASR_MODEL_PATH:-small}"
export LOCAL_ASR_MODEL_LABEL="${LOCAL_ASR_MODEL_LABEL:-faster-whisper-small-multilingual}"
export LOCAL_ASR_ALLOW_MODEL_DOWNLOAD="${LOCAL_ASR_ALLOW_MODEL_DOWNLOAD:-true}"

# Start the ASR worker used by the authoritative ASR orchestrator.
if command -v python3 &>/dev/null && python3 -c "import fastapi, faster_whisper" &>/dev/null; then
  echo "[1/2] Starting faster-whisper ASR server on port ${LOCAL_ASR_PORT}..."
  python3 ml/local_asr_server.py &
  LOCAL_ASR_PID=$!
else
  echo "[ERROR] faster-whisper dependencies are missing. Install them with:"
  echo "        python3 -m pip install -r ml/requirements-asr.txt"
  exit 1
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
echo "   ASR:       http://127.0.0.1:${LOCAL_ASR_PORT}/health"
echo "   Piper TTS: http://127.0.0.1:${PIPER_TTS_PORT}/health"
echo ""
echo "To switch to University of Ghana HCI Lab API for final submission:"
echo "   export SPEECH_PROVIDER=hci_lab"
echo "   export UG_HCI_LAB_URL=https://api.hci.ug.edu.gh"
echo "   export UG_HCI_LAB_API_KEY=<your-key>"
