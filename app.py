import os
from flask import Flask, has_request_context, request, Response, send_from_directory
import africastalking

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────────────
# API key comes from an environment variable (Codespaces secret / Render
# env var) — never hardcoded here.
#
# IMPORTANT: the SDK decides sandbox-vs-production purely by checking
# `username == "sandbox"`. For a live voice number, AT_USERNAME must be
# your real AT app username from the dashboard, not a local name and not
# the word "sandbox". If this is wrong, the SDK routes API requests to the
# wrong environment and the call flow never reaches the voice IVR.
USERNAME = os.environ.get("AT_USERNAME")
API_KEY = os.environ.get("AT_API_KEY")

if not USERNAME:
    print("⚠️  AT_USERNAME is not set. Set the real Africa's Talking username from your dashboard.")

if not API_KEY:
    print("⚠️  AT_API_KEY is not set — outbound voice calls will not work until it is configured.")

if USERNAME and API_KEY:
    africastalking.initialize(USERNAME, API_KEY)
    voice_client = africastalking.Voice
else:
    voice_client = None

# The AT Voice number you were issued. Also set as an env var so you don't
# have to edit code if it ever changes.
VOICE_NUMBER = os.environ.get("AT_VOICE_NUMBER", "+233308048098")

PORT = int(os.environ.get("PORT", "55120"))

# ── Demo transaction data ────────────────────────────────────────────
# Hardcoded for the hackathon demo since real MoMo API access requires a
# formal MTN/Telecel partnership outside hackathon scope. Swap this for a
# real lookup later if that partnership happens.
DEMO_TRANSACTION = {
    "recipient_name": "Kwame Mensah",
    "amount_cedis": "50",
}


def get_public_base_url():
    """Prefer an explicit public URL from configuration, otherwise use the
    current request host when available, and fall back to localhost for local
    testing. This avoids crashing outside a request context and avoids
    generating broken callback URLs."""
    public_base = os.environ.get("BASE_URL") or os.environ.get("PUBLIC_BASE_URL")
    if public_base:
        return public_base.rstrip("/")

    if has_request_context():
        return request.url_root.rstrip("/")

    return os.environ.get("APP_URL") or "http://localhost:55120"


# ── Health / status routes ───────────────────────────────────────────
@app.route("/")
def home():
    return {"status": "ok", "service": "Ɔkwankyerɛfo Pa", "message": "Flask app is running"}


@app.route("/health")
def health():
    return {"status": "ok", "service": "Ɔkwankyerɛfo Pa", "port": PORT}


# ── Static audio files ───────────────────────────────────────────────
@app.route("/audio/<path:filename>")
def audio_file(filename):
    return send_from_directory("audio", filename)


# ── Step 1: USSD dial trigger ────────────────────────────────────────
@app.route("/ussd-trigger", methods=["POST"])
def ussd_trigger():
    """User dials the shortcode. We reply END (closing the USSD session
    immediately, since USSD isn't accessible) and separately place an
    outbound voice call back to them."""
    phone_number = request.form.get("phoneNumber")
    base_url = get_public_base_url()

    ussd_response = (
        "END Ɔkwankyerɛfo Pa refrɛ wo sesei ara...\n"
        "(The Good Guide is calling you back now...)"
    )

    if voice_client and phone_number:
        try:
            # NOTE: the SDK's real parameter names are callFrom / callTo
            # (camelCase), not call_from / call_to. Using the wrong names
            # raises a TypeError that gets caught below and silently
            # printed — it will look like a network failure but isn't.
            voice_client.call(
                callFrom=VOICE_NUMBER,
                callTo=[phone_number],
                callbackUrl=f"{base_url}/voice-menu",
            )
            print(f"📡 Voice trigger activated for line: {phone_number}")
        except Exception as e:
            print(f"❌ Failed to initiate callback call: {e}")
    else:
        print("⚠️  Skipped outbound call — AT credentials or phoneNumber missing.")

    return Response(ussd_response, mimetype="text/plain")


# ── Step 2: Call connects → welcome + language choice ───────────────
@app.route("/voice-menu", methods=["GET", "POST"])
def voice_menu():
    """Also the entry point if someone dials the Voice number directly."""
    base_url = get_public_base_url()
    audio_url = f"{base_url}/audio/intro.mp3"

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play url="{audio_url}"/>
    <GetDigits timeout="2" finishOnKey="#" numDigits="1" callbackUrl="{base_url}/language-selection">
        <Say voice="man">Press 1 for English. Press 2 for Twi.</Say>
    </GetDigits>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")


# ── Step 3: Language chosen → route onward ───────────────────────────
@app.route("/language-selection", methods=["GET", "POST"])
def language_selection():
    dtmf_digits = request.form.get("dtmfDigits", "") or request.args.get("dtmfDigits", "")
    lang = "twi" if dtmf_digits == "2" else "en"
    base_url = get_public_base_url()

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Redirect>{base_url}/transfer-menu?lang={lang}</Redirect>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")


# ── Step 4: THE CORE DEMO MOMENT — confirm or cancel ─────────────────
@app.route("/transfer-menu", methods=["GET", "POST"])
def transfer_menu():
    """Reads back the transaction details and asks the user to confirm
    or cancel by voice — this is the centerpiece feature from the
    abstract: independent verification without reading a screen."""
    lang = request.args.get("lang", "en")
    base_url = get_public_base_url()
    name = DEMO_TRANSACTION["recipient_name"]
    amount = DEMO_TRANSACTION["amount_cedis"]

    if lang == "twi":
        prompt = (
            f"Woremane sika cedi {amount} kɔma {name}. "
            f"Sɛ wopene so a, mia baako. Sɛ woampene so a, mia mmienu."
        )
    else:
        prompt = (
            f"You are sending {amount} Ghana Cedis to {name}. "
            f"To confirm this transfer, press 1. To cancel, press 2."
        )

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <GetDigits timeout="3" finishOnKey="#" callbackUrl="{base_url}/momo-confirmation?lang={lang}">
        <Say voice="man">{prompt}</Say>
    </GetDigits>
    <Say voice="man">No response. Goodbye.</Say>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")


# ── Step 5: Final outcome ────────────────────────────────────────────
@app.route("/momo-confirmation", methods=["GET", "POST"])
def momo_confirmation():
    dtmf_digits = request.form.get("dtmfDigits", "") or request.args.get("dtmfDigits", "")
    lang = request.args.get("lang", "en")
    print(f"🎯 Transaction choice: {dtmf_digits} (Language: {lang})")

    if dtmf_digits == "1":
        msg = (
            "Yɛapene so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu sika no nkɔ pɛpɛɛpɛ."
            if lang == "twi"
            else "Transaction authorized. Please check your screen now to enter your Mobile Money PIN."
        )
    else:
        msg = (
            "Yɛatwa mu. Sika no mfiri wo account mu."
            if lang == "twi"
            else "Transaction cancelled. No money has been deducted from your account."
        )

    response_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="man">{msg}</Say>
    <Reject/>
</Response>
"""
    return Response(response_xml, mimetype="application/xml")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)