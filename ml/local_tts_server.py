"""
Ɔkwankyerɛfo Pa - Local Neural Piper TTS Worker

Runs a genuine local Piper neural voice through the piper-tts package.
The server does not generate formant/sine-wave placeholders.

Required environment:
  PIPER_MODEL                Model name or local model available to Piper.
  PIPER_DATA_DIR             Directory containing the .onnx voice and config.

Optional:
  PIPER_PORT=8766
  PIPER_TOKEN=<bearer token>
  PIPER_LENGTH_SCALE=1.0
  PIPER_NOISE_SCALE=0.667
  PIPER_NOISE_W=0.8

Voice model licensing MUST be checked separately before commercial deployment.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import Response


MODEL = os.getenv("PIPER_MODEL", "").strip()
DATA_DIR = os.getenv("PIPER_DATA_DIR", "").strip()
PORT = int(os.getenv("PIPER_PORT", "8766"))
TOKEN = os.getenv("PIPER_TOKEN", "").strip()

if not MODEL:
    raise RuntimeError(
        "PIPER_MODEL is required. Refusing to start a TTS worker without an explicit neural voice."
    )

if DATA_DIR and not Path(DATA_DIR).exists():
    raise RuntimeError(
        f"PIPER_DATA_DIR '{DATA_DIR}' does not exist."
    )

app = FastAPI(title="Kwankyerɛfo Pa Local Piper TTS", version="1.0.0")


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: str = "tw"
    voiceProfile: str = "ghanaian-clear"
    speed: float = Field(default=1.0, ge=0.5, le=1.6)
    pitch: Optional[float] = None
    model: Optional[str] = None


def authorize(authorization: Optional[str]) -> None:
    if not TOKEN:
        return
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid local TTS authorization token")


def validate_wav(path: Path) -> dict:
    with wave.open(str(path), "rb") as wav:
        frames = wav.getnframes()
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()

    if frames <= 0 or sample_rate < 8000 or sample_rate > 96000 or channels not in (1, 2) or sample_width not in (1, 2, 3, 4):
        raise RuntimeError("Generated WAV has invalid metadata")

    if path.stat().st_size > 20 * 1024 * 1024:
        raise RuntimeError("Generated WAV exceeds the 20 MiB response limit")

    duration = frames / sample_rate

    return {
        "sampleRate": sample_rate,
        "channels": channels,
        "sampleWidthBytes": sample_width,
        "durationSec": duration,
    }


@app.get("/health")
def health(authorization: Optional[str] = Header(default=None)):
    authorize(authorization)
    # A configured model string is not proof that the runtime can load it. Run
    # a tiny real synthesis probe before reporting the neural worker as ready.
    try:
        with tempfile.TemporaryDirectory(prefix="okwankyer_piper_health_") as temp_dir:
            output_path = Path(temp_dir) / "probe.wav"
            command = ["python", "-m", "piper", "-m", MODEL, "-f", str(output_path)]
            if DATA_DIR:
                command.extend(["--data-dir", DATA_DIR])
            command.extend(["--", "ok"])
            probe = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=float(os.getenv("PIPER_HEALTH_TIMEOUT_SEC", "8")),
            )
            if probe.returncode != 0 or not output_path.exists():
                return {"ready": False, "provider": "piper-local-neural-tts", "model": MODEL,
                        "details": "Configured Piper voice failed the inference health probe."}
            validate_wav(output_path)
    except Exception as exc:
        return {"ready": False, "provider": "piper-local-neural-tts", "model": MODEL,
                "details": f"Piper inference health probe failed: {type(exc).__name__}."}

    return {
        "ready": True,
        "provider": "piper-local-neural-tts",
        "model": MODEL,
        "dataDir": DATA_DIR,
        "details": "Piper neural voice runtime configured.",
    }


@app.post("/synthesize")
def synthesize(
    payload: SynthesisRequest,
    authorization: Optional[str] = Header(default=None),
):
    authorize(authorization)

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    with tempfile.TemporaryDirectory(prefix="okwankyer_piper_") as temp_dir:
        output_path = Path(temp_dir) / "speech.wav"

        command = [
            "python",
            "-m",
            "piper",
            "-m",
            payload.model or MODEL,
            "-f",
            str(output_path),
        ]

        if DATA_DIR:
            command.extend(["--data-dir", DATA_DIR])

        # Piper accepts the text after '--'.
        command.extend(["--", text])

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=float(os.getenv("PIPER_PROCESS_TIMEOUT_SEC", "8")),
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="Piper synthesis timed out") from exc

        if completed.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Piper synthesis failed: "
                    + (completed.stderr[-1000:] or completed.stdout[-1000:])
                ),
            )

        if not output_path.exists() or output_path.stat().st_size < 64:
            raise HTTPException(
                status_code=500,
                detail="Piper produced no valid audio file.",
            )

        metadata = validate_wav(output_path)

        audio_bytes = output_path.read_bytes()
        if len(audio_bytes) < 64:
            raise HTTPException(status_code=500, detail="Piper produced an empty WAV response.")
        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'inline; filename="speech.wav"',
                "X-Piper-Model": payload.model or MODEL,
                "X-Piper-Duration-Seconds": f"{metadata['durationSec']:.4f}",
                "X-Piper-Sample-Rate": str(metadata["sampleRate"]),
            },
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("PIPER_HOST", "127.0.0.1"),
        port=PORT,
        log_level=os.getenv("PIPER_LOG_LEVEL", "info"),
    )
