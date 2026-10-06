import os
import subprocess
import json
import base64
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title="Piper TTS Server", version="1.0.0")

PIPER_MODEL = os.getenv("PIPER_MODEL", "en_US-lessac-medium")

@app.get("/health")
def health():
    return {
        "ready": True,
        "provider": "piper-offline-tts",
        "languages": ["en"],
        "model": PIPER_MODEL,
        "note": "English supported in prototype. Use University of Ghana HCI Lab API for native Twi/Akan TTS."
    }

@app.post("/synthesize")
async def synthesize(payload: dict):
    text = payload.get("text", "").strip()
    language = payload.get("language", "en").lower()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    if language != "en":
        raise HTTPException(
            status_code=400,
            detail="Only English is supported in the free prototype. Use University of Ghana HCI Lab API for Twi TTS."
        )

    model_path = os.getenv("PIPER_MODEL_PATH", "")
    output_path = "/tmp/piper_voice.wav"
    if not model_path:
        cmd = ["piper", "--voice", PIPER_MODEL, "--output_file", output_path]
    else:
        cmd = ["piper", "--model", model_path, "--output_file", output_path]

    try:
        proc = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="ignore"))
        with open(output_path, "rb") as f:
            audio_bytes = f.read()

        b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {
            "audio_base64": b64,
            "audio_hex": audio_bytes.hex(),
            "audio_mime": "audio/wav",
            "provider": "piper-offline-tts",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8766)
