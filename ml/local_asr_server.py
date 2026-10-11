"""
Ɔkwankyerɛfo Pa - Local Neural ASR Worker

Real offline inference service backed by faster-whisper / CTranslate2.

The JavaScript application talks to this process over localhost. No cloud
service is contacted by this worker.

Environment:
  LOCAL_ASR_MODEL_PATH       Required local model directory or compatible
                             faster-whisper model identifier.
                             For genuinely offline deployment, point this to a
                             model already downloaded on disk.
  LOCAL_ASR_MODEL_LABEL      Human-readable model label.
  LOCAL_ASR_DEVICE           cpu or cuda (default cpu).
  LOCAL_ASR_COMPUTE_TYPE     int8 for CPU; float16/int8_float16 for GPU.
  LOCAL_ASR_PORT              default 8765.
  LOCAL_ASR_TOKEN             optional bearer token.

The server deliberately returns model confidence as a diagnostic field, not
as a calibrated probability. Calibration belongs to the evaluation pipeline.
"""

from __future__ import annotations

import os
import wave
import tempfile
import time
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from faster_whisper import WhisperModel
except ImportError as exc:  # pragma: no cover - operational startup guard
    raise RuntimeError(
        "faster-whisper is not installed. Install ml/requirements-asr.txt before starting the worker."
    ) from exc


MODEL_PATH = os.getenv("LOCAL_ASR_MODEL_PATH", "").strip()
MODEL_LABEL = os.getenv("LOCAL_ASR_MODEL_LABEL", "local-faster-whisper").strip()
TWI_MODEL_PATH = os.getenv("LOCAL_ASR_TWI_MODEL_PATH", "").strip()
TWI_MODEL_LABEL = os.getenv("LOCAL_ASR_TWI_MODEL_LABEL", "local-akan-wav2vec2-asr").strip()
DEVICE = os.getenv("LOCAL_ASR_DEVICE", "cpu").strip().lower()
COMPUTE_TYPE = os.getenv(
    "LOCAL_ASR_COMPUTE_TYPE",
    "int8" if DEVICE == "cpu" else "float16",
).strip()
PORT = int(os.getenv("LOCAL_ASR_PORT", "8765"))
AUTH_TOKEN = os.getenv("LOCAL_ASR_TOKEN", "").strip()

if not MODEL_PATH:
    raise RuntimeError(
        "LOCAL_ASR_MODEL_PATH is required. Refusing to start a fake or unspecified neural ASR service."
    )

model_path = Path(MODEL_PATH)
if not model_path.exists():
    # A model identifier is permitted only when the environment is explicitly
    # configured to allow a download before offline deployment.
    if os.getenv("LOCAL_ASR_ALLOW_MODEL_DOWNLOAD", "false").lower() != "true":
        raise RuntimeError(
            f"Local ASR model path '{MODEL_PATH}' does not exist. "
            "For offline operation, download/convert the model first and point LOCAL_ASR_MODEL_PATH to it."
        )

if TWI_MODEL_PATH and not Path(TWI_MODEL_PATH).exists():
    if os.getenv("LOCAL_ASR_ALLOW_MODEL_DOWNLOAD", "false").lower() != "true":
        raise RuntimeError(
            f"Local Akan ASR model '{TWI_MODEL_PATH}' is not present locally. "
            "Set LOCAL_ASR_ALLOW_MODEL_DOWNLOAD=true to download it on first use."
        )

app = FastAPI(title="Kwankyerɛfo Pa Local Neural ASR", version="1.0.0")
model: Optional[WhisperModel] = None
twi_processor = None
twi_model = None
inference_lock = Lock()


def authorize(authorization: Optional[str]) -> None:
    if not AUTH_TOKEN:
        return

    expected = f"Bearer {AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid local ASR authorization token")


def load_model() -> WhisperModel:
    global model
    if model is None:
        model = WhisperModel(
            MODEL_PATH,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
        )
    return model


def load_twi_model():
    global twi_processor, twi_model
    if not TWI_MODEL_PATH:
        return None, None
    if twi_model is None:
        try:
            import torch
            from transformers import AutoProcessor, Wav2Vec2ForCTC
        except ImportError as exc:
            raise RuntimeError(
                "Akan ASR requires the optional dependencies in ml/requirements-asr-twi.txt."
            ) from exc

        device = "cuda" if DEVICE == "cuda" and torch.cuda.is_available() else "cpu"
        twi_processor = AutoProcessor.from_pretrained(TWI_MODEL_PATH)
        twi_model = Wav2Vec2ForCTC.from_pretrained(TWI_MODEL_PATH).to(device).eval()
    return twi_processor, twi_model


def transcribe_twi_audio(audio_path: Path) -> str:
    import numpy as np
    import torch

    processor, active_model = load_twi_model()
    if processor is None or active_model is None:
        return ""

    with wave.open(str(audio_path), "rb") as wav_file:
        if wav_file.getnchannels() != 1 or wav_file.getframerate() != 16000:
            raise ValueError("Akan ASR expects 16 kHz mono WAV audio.")
        audio = np.frombuffer(wav_file.readframes(wav_file.getnframes()), dtype="<i2").astype(np.float32) / 32768.0

    inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
    device = next(active_model.parameters()).device
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        logits = active_model(**inputs).logits
    token_ids = torch.argmax(logits, dim=-1)
    return processor.batch_decode(token_ids)[0].strip()


def average_confidence(segments) -> float:
    """
    Derive a model-diagnostic confidence proxy from no_speech_prob.
    This is not a calibrated probability; consumers must keep the distinction.
    """
    values = []
    for segment in segments:
        probability = getattr(segment, "no_speech_prob", None)
        if isinstance(probability, (int, float)):
            values.append(max(0.0, min(1.0, 1.0 - float(probability))))

    if not values:
        return 0.0

    return sum(values) / len(values)


@app.get("/health")
def health(authorization: Optional[str] = Header(default=None)):
    authorize(authorization)

    try:
        load_model()
        return {
            "ready": True,
            "provider": "faster-whisper-local-neural-asr",
            "model": MODEL_LABEL,
            "twiModel": TWI_MODEL_LABEL if TWI_MODEL_PATH else None,
            "twiConfigured": bool(TWI_MODEL_PATH),
            "device": DEVICE,
            "computeType": COMPUTE_TYPE,
            "details": "Model loaded and ready for local inference.",
        }
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "ready": False,
                "provider": "faster-whisper-local-neural-asr",
                "model": MODEL_LABEL,
                "details": str(exc),
            },
        )


@app.post("/transcribe")
async def transcribe(
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    authorize(authorization)

    audio_bytes = await request.body()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio body")

    language_hint = request.headers.get("X-Language-Hint", "auto").strip().lower()
    if language_hint not in {"auto", "en", "tw"}:
        language_hint = "auto"

    # faster-whisper delegates audio decoding to PyAV/FFmpeg. Writing to a
    # temporary file keeps the worker independent from the Node process.
    started = time.perf_counter()
    temp_path: Optional[Path] = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as handle:
            handle.write(audio_bytes)
            temp_path = Path(handle.name)

        with inference_lock:
            segment_count = 0
            if language_hint == "tw" and TWI_MODEL_PATH:
                transcript = transcribe_twi_audio(temp_path)
                language = "aka" if transcript else None
                no_speech_probability = None
                confidence = 0.0
                provider = "local-akan-wav2vec2-asr"
                model_label = TWI_MODEL_LABEL
            else:
                active_model = load_model()
                segments_generator, info = active_model.transcribe(
                    str(temp_path),
                    language="en" if language_hint == "en" else None,
                    beam_size=int(os.getenv("LOCAL_ASR_BEAM_SIZE", "5")),
                    best_of=int(os.getenv("LOCAL_ASR_BEST_OF", "3")),
                    condition_on_previous_text=False,
                    vad_filter=True,
                    temperature=0.0,
                )

                segments = list(segments_generator)
                segment_count = len(segments)
                transcript = " ".join(
                    segment.text.strip()
                    for segment in segments
                    if segment.text and segment.text.strip()
                ).strip()
                language = getattr(info, "language", None)
                no_speech_probability = getattr(info, "no_speech_prob", None)
                confidence = average_confidence(segments)
                provider = "faster-whisper-local-neural-asr"
                model_label = MODEL_LABEL

        duration_ms = int((time.perf_counter() - started) * 1000)

        if not transcript:
            confidence = 0.0

        return {
            "text": transcript,
            "confidence": confidence,
            "confidenceSource": "MODEL_HEURISTIC",
            "language": "tw" if language in {"tw", "ak", "aka"} else "en" if language == "en" else "unknown",
            "model": model_label,
            "provider": provider,
            "durationMs": duration_ms,
            "decoder": {
                "languageHint": language_hint,
                "detectedLanguage": language,
                "noSpeechProbability": no_speech_probability,
                "segmentCount": segment_count,
            },
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Local neural ASR inference failed: {exc}",
        ) from exc
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("LOCAL_ASR_HOST", "127.0.0.1"),
        port=PORT,
        log_level=os.getenv("LOCAL_ASR_LOG_LEVEL", "info"),
    )
