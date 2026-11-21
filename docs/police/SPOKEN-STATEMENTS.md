# Spoken statements (audio with a live transcript)

Written 2026-11-21 at the owner's request: "speaks and it records as it transcribes and keeps both things". Owner chose the engine the same day: **offline, on this computer** (whisper.cpp). Consistent with `PRODUCT.md`, Statements: the audio and the transcript are the content of the one Statement record, not a separate system.

## What it is

An officer taking a statement presses record. The person speaks. Words appear on the screen a few seconds behind the speech. When the officer saves the statement:

- the **audio** is kept, sealed in the vault like every other file (`attachments/<id>.enc`), attached to the statement;
- the **transcript** is the statement's text, already checked and corrected by the officer.

Both stay together. Nothing is sent anywhere: the model is a file on the computer and no network is used.

## Rules this keeps

- **The transcript is a draft until a person keeps it.** The officer is the author of the statement. The engine only drafts. The form says so, and the transcript is editable before it is saved.
- **Nothing is made up.** With no model on the computer, the form says so and offers recording with a typed transcript. It never shows invented words.
- **Honest about languages.** whisper's multilingual base model is usable for English and Kiswahili and weak for Luganda and other local languages. The officer picks the language before recording (English, Kiswahili, French, or detect). Accuracy on real Ugandan speech has not been measured.
- **Restricted cases** apply as for any attachment: the audio is not listed to an officer who cannot open the case.

## How it is built

- Engine: `packages/node-core/src/speech.rs` (cargo feature `speech`, off unless an app asks, because it builds whisper.cpp). `Transcriber` keeps the loaded model; `normalize_segments` drops empty and `[BLANK_AUDIO]` lines and converts timings to milliseconds; `samples_from_bytes` reads 16 kHz mono 32-bit float samples.
- Model: `PLEADLI_WHISPER_MODEL`, or `<data folder>/models/ggml-base.bin` (multilingual base, 147,951,465 bytes, SHA-256 `60ed5bc3...a2efe`). **Delivery (owner decision 2026-11-21: from GitHub, downloaded when needed, or bundled):** the statement form offers "Download the speech model" when it is missing. `POST /api/transcription/install` fetches it once from the public `phe-rus/pleadli-releases` release `models-1` (override with `PLEADLI_MODEL_URL` for a station that keeps the file on its own server), checks the SHA-256, and only then puts it in place; a wrong or damaged file is thrown away. Progress shows in the panel.
- Police asks the engine in about ten-second windows of the recording, so words appear while the person is still speaking.

## State on 2026-11-21

- Built and seen in the real Police window (debug build, test data folder): the engine; `GET /api/transcription/status` and `POST /api/transcription/transcribe` (JSON, base64 samples, language and offset); `POST /api/attachments/bytes` (a file the window made, sealed in the vault, checked on disk: no plain text); the 'Speak the statement' panel in the statement form (language choice, record/stop, live words, audio player, 'Use these words'), in English, Kiswahili and French.
- Measured: a synthesised English statement (9 s) came back word for word apart from one place name, in 3.9 s in a debug build.
- NOT proven: speaking into a real microphone (none usable here: recording starts, no words arrive from silence), Kiswahili or Luganda accuracy,  how the model reaches an installed computer (still undecided; the test copy links the model into `<data folder>/models/`).
- Playback (seen in the window): a saved recording appears as an audio player in the statement's Attachments (Edit tab), decoded from the sealed vault in memory (8.9 s webm read back with its real duration). Audio types (webm, ogg, mp3, m4a, wav) are now recognised.
- Download seen in the window: from a local test server, the model (148 MB) downloaded with live progress, passed the checksum and the panel became ready.
- Published 2026-11-21 (owner asked): release `models-1` on `phe-rus/pleadli-releases` with asset `ggml-base.bin`, not marked Latest so app updates are unaffected. The real URL was downloaded with curl and the SHA-256 matched. The app's own download button has been tried only against a local server, not yet against GitHub. Bundling in the installer was not chosen.
- Next: try with a real voice on the owner's machine; decide model delivery.
