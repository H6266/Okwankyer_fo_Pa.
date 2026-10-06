import os
import json
import wave
import tempfile
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from vosk import Model, KaldiRecognizer

app = FastAPI(title="Vosk ASR Server", version="1.0.0")

EN_MODEL_PATH = os.getenv("VOSK_EN_MODEL_PATH", "models/asr/vosk-model-small-en-us-0.15")
TW_MODEL_PATH = os.getenv("VOSK_TW_MODEL_PATH", "models/asr/twi-model")

def load_model(lang: str):
    if lang == "tw":
        if not os.path.exists(TW_MODEL_PATH):
            raise HTTPException(
                status_code=400,
                detail="Twi model not found in free offline prototype. Use University of Ghana HCI Lab API for Twi in final stage."
            )
        return Model(TW_MODEL_PATH)
    return Model(EN_MODEL_PATH)

@app.get("/health")
def health():
    return {
        "ready": True,
        "provider": "vosk-offline-asr",
        "languages": ["en", "tw"],
        "twi_ready": os.path.exists(TW_MODEL_PATH),
    }

@app.post("/transcribe")
async def transcribe(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty audio body")

    language_hint = request.headers.get("X-Language-Hint", "en").strip().lower()
    if language_hint not in {"en", "tw"}:
        language_hint = "en"

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(body)
            temp_path = tmp.name

        model = load_model(language_hint)
        wf = wave.open(temp_path, "rb")
        rec = KaldiRecognizer(model, wf.getframerate())

        transcript_parts = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if "result" in result:
                    transcript_parts.extend(item.get("word", "") for item in result["result"])

        final = json.loads(rec.FinalResult())
        if "result" in final:
            transcript_parts.extend(item.get("word", "") for item in final["result"])

        text = " ".join(part for part in transcript_parts if part).strip()

        return {
            "text": text,
            "confidence": 0.85 if text else 0.0,
            "language": language_hint,
            "provider": "vosk-offline-asr",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}")
    finally:
        if temp_path:
            try:
                os.remove(temp_path)
            except Exception:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
