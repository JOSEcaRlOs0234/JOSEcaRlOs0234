# Video: Lo que puedes hacer con la nanotecnología

Video educativo (≈7.5 min, 1920×1080, en español) para motivar a estudiar la carrera de
Nanotecnología. Cada dato está respaldado por un artículo científico, citado en pantalla y
en la lista final de referencias.

**Archivo final:** `nanotecnologia.mp4`

## Contenido

| # | Tema | Artículos base |
|---|------|----------------|
| 0 | Introducción | — |
| 1 | La escala nano | Feynman (1959) |
| 2 | Ver y mover átomos | Binnig & Rohrer (1982) · Eigler & Schweizer (1990) |
| 3 | Puntos cuánticos | Murray, Norris & Bawendi (1993) — Nobel 2023 |
| 4 | Carbono: C60, nanotubos, grafeno | Kroto (1985) · Iijima (1991) · Novoselov (2004) · Lee (2008) |
| 5 | Vacunas de ARNm | Polack (2020) · Hou (2021) |
| 6 | Cáncer | Matsumura & Maeda (1986) · Hirsch (2003) · Barenholz (2012) |
| 7 | Origami de ADN y nanorobots | Rothemund (2006) · Douglas (2012) |
| 8 | Motores moleculares | Koumura/Feringa (1999) — Nobel 2016 |
| 9 | Electrónica | Shulaker (2013) |
| 10 | Energía | Chan (2008) · Kojima (2009) |
| 11 | Agua potable | Surwade (2015) |
| 12 | Biomimética (loto, gecko) | Barthlott & Neinhuis (1997) · Autumn (2000, 2002) |
| 13 | ¿Por qué estudiar la carrera? | — |
| 14 | Cierre y referencias | — |

## Cómo se genera

Todo es generado por código (sin imágenes ni música con derechos de autor):

- `scenes.json` — guion: textos en pantalla, narración (`sub` = subtítulo, `say` = cómo se pronuncia) y referencias.
- `audio.py` — narración con [Piper TTS](https://github.com/rhasspy/piper) (voz `es-mls_10246-low`, offline), música ambiental sintetizada y `timeline.json` con los tiempos de cada frase.
- `scene.html` — animaciones en `<canvas>` para cada escena.
- `render.mjs` — Playwright dibuja cada cuadro (30 fps) y ffmpeg lo codifica.

```bash
./build.sh
```

Requisitos: Python 3 con `numpy` y `piper-tts`, Node con `playwright` (Chromium), `ffmpeg`.
