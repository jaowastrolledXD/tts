# Discloud deployment

This repository contains the bot in `vsync-tts-bot-pc-atualizado/`.

## Deploying the repository root

Upload the repository root as the app source. The root `discloud.config` installs Node dependencies, Python requirements, and FFmpeg before starting the bot.

## Environment variables

Because `.env` files are excluded from uploads, configure these in the Discloud app's environment/settings:

- `VSYNC_BOT_TOKEN` — required VSync bot token.
- `FISH_API_KEY` — required for Fish Audio voices, including Garnet.
- Optional: `FISH_TTS_MODEL`, `FISH_TTS_STREAMING`, `TTS_SPEED`, `TTS_MAX_CHARS`, `TTS_QUEUE_LIMIT`, `TTS_IDLE_LEAVE_MINUTES`, `TTS_TEXT_CHANNEL_ID`.

Do not commit or share API keys or bot tokens.

## After deploying

1. Redeploy the application so the `BUILD` step runs.
2. Check logs for the `[runtime] Python:` line and confirm the bot logs `Online as ...`.
3. Join a voice call with at least one person and send a message in a text channel the bot can read.
4. If it still does not speak, check logs for `MESSAGE_CREATE`, `Fish Audio`, `FFmpeg`, `WebRTC`, or `ICE` errors. The bot must be able to access the text channel and join the voice channel.

The code now checks `python3` before `python` on Linux, and bounds temporary role/guild caches to reduce long-running memory growth. Actual voice connectivity and memory usage still need to be verified in the deployed VSync/Discloud environment.
