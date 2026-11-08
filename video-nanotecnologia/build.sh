#!/usr/bin/env bash
# Reconstruye nanotecnologia.mp4 desde cero.
set -euo pipefail
cd "$(dirname "$0")"
BUILD=${BUILD:-build}
VOICE=es-mls_10246-low
mkdir -p "$BUILD/voices"
if [ ! -f "$BUILD/voices/$VOICE/$VOICE.onnx" ]; then
  curl -sSL -o "$BUILD/voices/$VOICE.tar.gz" "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-$VOICE.tar.gz"
  mkdir -p "$BUILD/voices/$VOICE" && tar xzf "$BUILD/voices/$VOICE.tar.gz" -C "$BUILD/voices/$VOICE"
fi
python3 audio.py "$BUILD/voices/$VOICE/$VOICE.onnx" "$BUILD"
node render.mjs "$BUILD"
ffmpeg -y -loglevel error -i "$BUILD/video_sin_audio.mp4" -i "$BUILD/audio.wav" \
  -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart nanotecnologia.mp4
echo "Listo: nanotecnologia.mp4"
