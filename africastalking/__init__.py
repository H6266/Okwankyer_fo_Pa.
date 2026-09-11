from .Voice import VoiceService

SMS = None
Airtime = None
Voice = None
Application = None
Token = None
MobileData = None
Insights = None
Whatsapp = None


def initialize(username, api_key):
    if username is None or api_key is None:
        raise RuntimeError("Please check if your username and api key have been set.")

    globals()["Voice"] = VoiceService(username, api_key)
    globals()["SMS"] = None
    globals()["Airtime"] = None
    globals()["Application"] = None
    globals()["Token"] = None
    globals()["MobileData"] = None
    globals()["Insights"] = None
    globals()["Whatsapp"] = None
