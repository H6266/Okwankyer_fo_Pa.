# Pluggable Speech Engine Architecture

Ɔkwankyerɛfo Pa provides a dual-phase speech engine:
- **Phase II Prototype (Local/Offline)**: Vosk ASR + Piper TTS (100% free open-source, local FastAPI servers).
- **Final Hackathon Submission**: University of Ghana HCI Lab API (native Akan Twi & Ghanaian English).

Swapping between the prototype and the University of Ghana API is controlled by a single configuration flag:
```bash
SPEECH_PROVIDER="free"     # Vosk ASR + Piper TTS (prototype)
SPEECH_PROVIDER="hci_lab"  # University of Ghana HCI Lab API (final)
```

---

## 1. Free Prototype Setup (Vosk + Piper)

### Step 1: Install Dependencies
```bash
python3 -m venv .venv-ai
source .venv-ai/bin/activate
pip install fastapi uvicorn vosk
```

### Step 2: Download English Model for Vosk
```bash
mkdir -p models/asr
cd models/asr
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip
cd ../..
```

*(Optional: Place local Twi model in `models/asr/twi-model` if available; otherwise prototype uses English + studio prompts and plans UG HCI Lab for Twi).*

### Step 3: Start Vosk ASR Server
```bash
export VOSK_EN_MODEL_PATH="models/asr/vosk-model-small-en-us-0.15"
export VOSK_TW_MODEL_PATH="models/asr/twi-model"
python ml/vosk_asr_server.py
```
*Health check:* `http://127.0.0.1:8765/health`

### Step 4: Start Piper TTS Server
**Via Docker (recommended):**
```bash
docker run --rm -it -p 127.0.0.1:8766:5000 rhasspy/piper
```
**Or via Python FastAPI wrapper:**
```bash
export PIPER_MODEL="en_US-lessac-medium"
python ml/piper_tts_server.py
```
*Health check:* `http://127.0.0.1:8766/health`

---

## 2. University of Ghana HCI Lab Integration (Final Submission)

To switch to the University of Ghana HCI Lab API, no code changes are required:
```bash
export SPEECH_PROVIDER="hci_lab"
export UG_HCI_LAB_URL="https://api.hci.ug.edu.gh"
export UG_HCI_LAB_API_KEY="your-ug-api-key"
```

The unified adapter in `src/ai_system/speech/speechProvider.ts` automatically routes all synthesis and transcription calls through the University of Ghana HCI Lab API.

