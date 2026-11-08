"""Genera la narración (Piper TTS, offline), la música de fondo y timeline.json.

Uso: python3 audio.py <ruta_modelo_piper.onnx> <dir_salida>
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).parent
SR = 44100
GAP = 0.45      # silencio entre frases
LEAD = 0.9      # silencio al iniciar escena
TAIL = 1.3      # silencio al terminar escena


def tts(voice, text):
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(length_scale=0.86, noise_scale=0.6, noise_w_scale=0.7))
    buf.seek(0)
    with wave.open(buf, "rb") as wf:
        sr = wf.getframerate()
        data = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    # re-muestreo lineal a 44.1 kHz
    n = int(len(data) * SR / sr)
    data = np.interp(np.linspace(0, len(data) - 1, n), np.arange(len(data)), data)
    # recorta silencio inicial/final
    idx = np.where(np.abs(data) > 0.01)[0]
    if len(idx):
        data = data[max(0, idx[0] - 400): idx[-1] + 2000]
    return data


def music(total):
    """Pad ambiental + arpegio suave (síntesis propia, sin derechos de autor)."""
    t = np.arange(int(total * SR)) / SR
    out = np.zeros_like(t)
    # progresión Am - F - C - G (frecuencias de raíz y triadas)
    chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]]
    bar = 4.8
    for i, ch in enumerate(chords * int(total / bar / 4 + 2)):
        s = i * bar
        if s > total:
            break
        a, b = int(s * SR), int(min(total, s + bar + 1.5) * SR)
        tt = t[a:b] - s
        env = np.minimum(1, tt / 1.6) * np.exp(-np.maximum(0, tt - bar) / 0.6)
        for f in ch:
            for det in (-0.6, 0.6):
                out[a:b] += 0.05 * env * np.sin(2 * np.pi * (f / 2 + det) * tt)
            out[a:b] += 0.015 * env * np.sin(2 * np.pi * f * tt)
        # arpegio
        notes = [ch[0] * 2, ch[1] * 2, ch[2] * 2, ch[1] * 2] * 2
        for k, f in enumerate(notes):
            ns = s + k * bar / 8
            na, nb = int(ns * SR), int(min(total, ns + 1.2) * SR)
            if na >= len(t):
                break
            nt = t[na:nb] - ns
            out[na:nb] += 0.03 * np.exp(-nt * 3.5) * np.sin(2 * np.pi * f * nt) * (1 - np.exp(-nt * 200))
    # fade in/out global
    out *= np.minimum(1, t / 2.5) * np.minimum(1, (total - t) / 4)
    return out


def main():
    model, outdir = sys.argv[1], Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(model)
    scenes = json.loads((HERE / "scenes.json").read_text())
    clips, timeline, cur = [], [], 0.0
    for sc in scenes:
        st = cur
        lines = []
        if sc.get("silent"):
            dur = sc["silent"]
        else:
            pos = sc.get("lead", LEAD)
            for ln in sc["lines"]:
                audio = tts(voice, ln.get("say", ln["sub"]))
                d = len(audio) / SR
                clips.append((st + pos, audio))
                lines.append({"sub": ln["sub"], "start": round(pos, 3), "end": round(pos + d, 3)})
                pos += d + GAP
            dur = pos - GAP + sc.get("tail", TAIL)
        timeline.append({"id": sc["id"], "start": round(st, 3), "dur": round(dur, 3), "lines": lines})
        cur += dur
        print(f"{sc['id']:12s} {st:7.2f}s  +{dur:6.2f}s")
    total = cur
    voice_track = np.zeros(int(total * SR) + SR)
    for s, a in clips:
        i = int(s * SR)
        voice_track[i:i + len(a)] += a
    voice_track = voice_track[: int(total * SR)]
    voice_track *= 0.85 / max(1e-6, np.abs(voice_track).max())
    # ducking: baja la música cuando hay voz
    envv = np.convolve(np.abs(voice_track), np.ones(SR // 5) / (SR // 5), mode="same")
    duck = 1 - 0.55 * np.clip(envv / 0.05, 0, 1)
    duck = np.convolve(duck, np.ones(SR // 4) / (SR // 4), mode="same")
    mus = music(total)
    mus *= 0.9 / max(1e-6, np.abs(mus).max()) * 0.32
    mix = voice_track + mus * duck
    mix = np.clip(mix, -1, 1)
    with wave.open(str(outdir / "audio.wav"), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((mix * 32767).astype(np.int16).tobytes())
    (outdir / "timeline.json").write_text(json.dumps({"total": round(total, 3), "scenes": timeline}, ensure_ascii=False, indent=1))
    print(f"TOTAL {total:.1f}s")


if __name__ == "__main__":
    main()
