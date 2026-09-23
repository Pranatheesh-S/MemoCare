# Your reference voice goes here

Two files, both ignored by git. Neither ever leaves this machine.

```
voices/
  my_voice.wav    ~30–45 seconds of your voice
  my_voice.txt    the exact words you said, as you said them
```

## The recording

Roughly **30–45 seconds**. Qwen3-TTS can clone from far less, but a longer,
varied sample gives a steadier voice across two hundred different sentences.

It should contain:

- only your voice — no second speaker, no music, no television behind you
- little background noise, and as little room echo as possible
- natural speech at a calm, unhurried pace
- a mixture of sentence types, because the app needs all of them:
  - calm instructions — *"Touch a card, then touch where it belongs."*
  - questions — *"Would you like to play a memory game?"*
  - plain statements — *"Everything is saved on this device."*
  - supportive lines — *"You are doing so well. There is no hurry."*

Record it the way the app should sound: warm, clear, a little slower than you
would speak to a friend, never dramatic and never rushed. This is narration for
someone who may be tired, anxious or hard of hearing.

You do **not** record the application's sentences. This one sample becomes the
voice; every sentence in the app is then generated in it.

## Preparing it

From `services/tts-service`:

```bash
python scripts/prepare_reference_voice.py --input ~/my-recording.opus --transcribe
```

That converts any phone recording to the mono WAV the model expects, trims it to
45 seconds, evens out the level, and drafts the transcript with Whisper if it is
installed. **Read the draft back against the recording and correct it** — the
closer the transcript matches what you actually said, the closer the clone
sounds to you.

Without `--transcribe`, write `my_voice.txt` yourself: the exact words, plain
text, punctuation included.

## Privacy

This project's team has chosen to commit `voices/*.wav` and `voices/*.txt` to
the shared repository so any teammate can resume generation without a manual
file transfer — if that is not what you want for your own fork, add them back
to `.gitignore` before recording. Regardless, the running service never logs
the recording, never returns it over the API and never sends it anywhere: a
client can only send text and receive audio, never a voice, a path or a file.
