import json
import time
import websocket  # websocket-client package
from backend.speech.asr import record_until_silence
from backend.speech.tts import speak

USER_ID = int(input("Enter user_id: "))
FLOW_TYPE = input("Flow type (memory_lane/story_completion/who_is_this/routine_chat): ").strip()
LANG = input("Language (en/hi/as/ta): ").strip()

ws = websocket.WebSocket()
ws.connect(f"ws://localhost:8000/ws/session/{USER_ID}/{FLOW_TYPE}?lang={LANG}")

opening = json.loads(ws.recv())
print(f"[COMPANION]: {opening['content']}")
speak(opening["content"], lang=LANG)

while True:
    result, _ = record_until_silence(language=LANG)   # your ASR module, language passed through
    if not result.transcript.strip():
        print("[ASR] Nothing heard, try again.")
        continue

    print(f"[YOU]: {result.transcript}")

    payload = {
        "type": "text",
        "content": result.transcript,
        "asr_metadata": {
            "audio_duration_s": result.audio_duration_s,
            "words_per_minute": result.words_per_minute,
            "pause_durations_s": result.pause_durations_s,
        },
    }
    ws.send(json.dumps(payload))

    response = json.loads(ws.recv())
    print(f"[COMPANION]: {response['content']}")
    speak(response["content"], lang=LANG)

    if input("\n[Enter] continue, [q] to end: ").strip().lower() == "q":
        ws.send(json.dumps({"type": "end"}))
        break

ws.close()
