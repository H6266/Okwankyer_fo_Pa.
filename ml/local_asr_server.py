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

import io
import os
import tempfile
import time
from pathlib import Path
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


app = FastAPI(title="Kwankyerɛfo Pa Local Neural ASR", version="1.0.0")
model: Optional[WhisperModel] = None


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

        active_model = load_model()

        segments_generator, info = active_model.transcribe(
            str(temp_path),
            language=None if language_hint == "auto" else language_hint,
            beam_size=int(os.getenv("LOCAL_ASR_BEAM_SIZE", "5")),
            best_of=int(os.getenv("LOCAL_ASR_BEST_OF", "3")),
            condition_on_previous_text=False,
            vad_filter=True,
            temperature=0.0,
        )

        segments = list(segments_generator)
        transcript = " ".join(
            segment.text.strip()
            for segment in segments
            if segment.text and segment.text.strip()
        ).strip()

        language = getattr(info, "language", None)
        no_speech_probability = getattr(info, "no_speech_prob", None)
        confidence = average_confidence(segments)
        duration_ms = int((time.perf_counter() - started) * 1000)

        if not transcript:
            confidence = 0.0

        return {
            "text": transcript,
            "confidence": confidence,
            "confidenceSource": "MODEL_HEURISTIC",
            "language": "tw" if language == "tw" else "en" if language == "en" else "unknown",
            "model": MODEL_LABEL,
            "provider": "faster-whisper-local-neural-asr",
            "durationMs": duration_ms,
            "decoder": {
                "languageHint": language_hint,
                "detectedLanguage": language,
                "noSpeechProbability": no_speech_probability,
                "segmentCount": len(segments),
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
