import os
from flask import Flask, request, Response, send_from_directory

app = Flask(__name__)

PORT = int(os.environ.get("PORT", "5000"))

def get_public_base_url():
    public_base = os.environ.get("BASE_URL") or os.environ.get("PUBLIC_BASE_URL")
    if public_base:
        return public_base.rstrip("/")
    return request.url_root.rstrip("/")

@app.route("/")
def home():
    return {
        "status": "ok",
        "service": "Okwankyerɛfo Pa",
        "message": "Flask app is running"
    }

@app.route("/health")
def health():
    return {
        "status": "ok",
        "service": "Okwankyerɛfo Pa",
        "port": PORT
    }

@app.route("/audio/<path:filename>")
def audio_file(filename):
    return send_from_directory("audio", filename)

@app.route("/voice-menu", methods=["POST"])
def voice_menu():
    base_url = get_public_base_url()
    audio_url = f"{base_url}/audio/intro.mp3"

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>{audio_url}</Play>
    <GetDigits
        timeout="10"
        finishOnKey="#"
        callbackUrl="{base_url}/language-selection">
    </GetDigits>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")

@app.route("/language-selection", methods=["POST"])
def language_selection():
    dtmf_digits = request.form.get("dtmfDigits", "")
    lang = "en" if dtmf_digits == "1" else "twi" if dtmf_digits == "2" else "en"
    base_url = get_public_base_url()

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>{base_url}/main-menu?lang={lang}</Redirect>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")

@app.route("/main-menu", methods=["POST"])
def main_menu():
    lang = request.args.get("lang", "en")
    base_url = get_public_base_url()

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>{base_url}/audio/welcome-en-fixed.mp3</Play>
    <Redirect>{base_url}/transfer-menu?lang={lang}</Redirect>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")

@app.route("/transfer-menu", methods=["POST"])
def transfer_menu():
    base_url = get_public_base_url()
    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>{base_url}/audio/intro.mp3</Play>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")

@app.route("/play-audio", methods=["POST"])
def play_audio():
    base_url = get_public_base_url()
    audio_url = f"{base_url}/audio/intro.mp3"

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play>{audio_url}</Play>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
