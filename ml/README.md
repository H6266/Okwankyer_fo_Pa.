# Pluggable Speech Engine Architecture

Ɔkwankyerɛfo Pa provides a dual-phase speech engine:
- **Phase II Prototype (Local/Offline)**: faster-whisper ASR + Piper TTS (local FastAPI servers).
- **Final Hackathon Submission**: University of Ghana HCI Lab API (native Akan Twi & Ghanaian English).

Swapping between the prototype and the University of Ghana API is controlled by a single configuration flag:
```bash
SPEECH_PROVIDER="free"     # Vosk ASR + Piper TTS (prototype)
SPEECH_PROVIDER="hci_lab"  # University of Ghana HCI Lab API (final)
```

---

## 1. Free Prototype Setup (faster-whisper + Piper)

### Step 1: Install Dependencies
On Debian/Ubuntu, install Python's virtual-environment support if it is missing:
```bash
sudo apt-get install python3-venv python3-pip
```

```bash
python3 -m venv .venv-ai
source .venv-ai/bin/activate
pip install -r ml/requirements-asr.txt
```

### Step 2: Start the local speech stack

The launcher uses the multilingual faster-whisper `small` model by default.
It downloads the model on first start and caches it for later offline use.
Set `LOCAL_ASR_MODEL_PATH` to a local model directory to avoid downloading it,
or set `LOCAL_ASR_ALLOW_MODEL_DOWNLOAD=false` to require a preinstalled model.

```bash
bash scripts/start_free_speech_stack.sh
```

*Health check:* `http://127.0.0.1:8765/health`

### Step 3: Start Piper TTS Server
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

## 2. Optional Open-Weight Reasoning Brain (Qwen3 1.7B)

The TypeScript `ModelRouter` supports the Hugging Face [Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) model through Ollama's OpenAI-compatible local API. The upstream model card declares Apache-2.0 at revision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`. Local Qwen is opt-in; without `QWEN_MODE=local`, the current cloud/local fallback configuration is unchanged.

Install Ollama using its official installation instructions, then run:
```bash
ollama pull qwen3:1.7b
ollama serve
```

Configure the application process:
```bash
export QWEN_MODE=local
export QWEN_BASE_URL=http://127.0.0.1:11434/v1
export QWEN_MODEL=qwen3:1.7b
```

No API key is needed for Ollama. The model returns a structured reasoning proposal only; phone masking, schema checks, deterministic transaction state, caller confirmation, and verified provider results remain application-owned. The model has not been benchmarked on Ɔkwankyerɛfo Pa's held-out Ghanaian speech or finance corpus, so keep it in evaluation/pilot use until local latency, Twi/code-switch accuracy, and safety regressions are measured.

## 3. Optional local Akan/Twi ASR

The neural worker uses faster-whisper for English. For Twi, it can optionally
use the Apache-2.0 [ASR Africa Akan XLS-R model](https://huggingface.co/asr-africa/wav2vec2-xls-r-akan-50-hours)
instead. Its model card reports 30.65% WER on its evaluation set; that result
has not been independently validated against this project's Ghanaian English,
Twi, or code-switching recordings.

Install the additional CPU/GPU inference packages:
```bash
pip install -r ml/requirements-asr-twi.txt
```

Configure a local model directory or, when online model downloads are
acceptable, the Hugging Face model ID:
```bash
export LOCAL_ASR_TWI_MODEL_PATH="asr-africa/wav2vec2-xls-r-akan-50-hours"
export LOCAL_ASR_TWI_MODEL_LABEL="ASR Africa Akan XLS-R 50h"
export LOCAL_ASR_ALLOW_MODEL_DOWNLOAD="true"
```

The model is loaded only when a Twi turn is routed to the local ASR worker.
English turns continue to use the configured faster-whisper model. The Akan
model is optional and should be evaluated with representative Ghanaian speech
before production use; University of Ghana HCI Lab remains the primary ASR provider.

---

## 2. University of Ghana HCI Lab Integration (Final Submission)

To switch to the University of Ghana HCI Lab API, no code changes are required:
```bash
export SPEECH_PROVIDER="hci_lab"
export UG_HCI_LAB_URL="https://api.hci.ug.edu.gh"
export UG_HCI_LAB_API_KEY="your-ug-api-key"
```

The unified adapter in `src/ai_system/speech/speechProvider.ts` automatically routes all synthesis and transcription calls through the University of Ghana HCI Lab API.
