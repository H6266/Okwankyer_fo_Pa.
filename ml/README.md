# Local Speech Workers

These workers are deliberately separate from the Node application so a neural model can be loaded once and reused across voice turns.

## ASR

```powershell
py -m venv .venv-ai
.\.venv-ai\Scripts\Activate.ps1
pip install -r ml\requirements-asr.txt
$env:LOCAL_ASR_MODEL_PATH="C:\models\your-verified-cpu-asr"
$env:LOCAL_ASR_MODEL_LABEL="your-verified-ghananlp-asr"
$env:LOCAL_ASR_DEVICE="cpu"
$env:LOCAL_ASR_COMPUTE_TYPE="int8"
python ml\local_asr_server.py
```

## TTS

```powershell
.\.venv-ai\Scripts\Activate.ps1
pip install -r ml\requirements-tts.txt
$env:PIPER_MODEL="your-verified-piper-model"
$env:PIPER_DATA_DIR="C:\models\piper"
python ml\local_tts_server.py
```

Do not mark the system as offline-neural-ready until:

```powershell
npm run ai:speech:health
```

returns PASS.
