# Proyecto J.A.R.V.I.S. — notas para continuar

## Sobre el usuario
- Principiante total: explicar todo en español, paso a paso, palabras sencillas.
- Una fase a la vez. No avanzar hasta que el usuario diga que la fase funciona.
- Cuando el usuario deba hacer algo: un paso a la vez y esperar a que diga "listo".

## Fases
1. Platicar con Jarvis desde la interfaz (Gemini). ← ACTUAL: plan presentado, esperando respuestas
2. Spotify (poner canción/playlist, pausar, siguiente, qué suena).
3. Activación con doble aplauso (programa en segundo plano, ignora ruidos sueltos, arranca al prender, sensibilidad ajustable).
4. Control de la laptop (abrir programas/webs, volumen, crear/leer archivos en UNA carpeta).
5. WhatsApp (antes: explicar opciones, riesgos de bloqueo, recomendar).

## Reglas de seguridad (aplican a todas las fases)
- Claves (Gemini, Spotify...) solo en archivo `.env` en la laptop; nunca en GitHub (`.env*` está en .gitignore).
- La clave de Gemini solo la usa el servidor; el navegador nunca la ve.
- Servidor escucha solo en 127.0.0.1 (no accesible desde otros equipos de la red).
- Acciones en la laptop: solo lista permitida, nunca comandos libres.
- Confirmación antes de algo delicado (borrar, mandar mensaje a otra persona, apagar).
- WhatsApp: solo obedecer al número del dueño.
- Registro (log) de todo lo que hace Jarvis.

## Estado de la interfaz original (zip de Google AI Studio)
- React + Vite + Tailwind (frontend) y `server.ts` con Express (backend) que llama a Gemini con `@google/genai`.
- Tiene: reactor animado de 4 estados, chat, voz del navegador (speechSynthesis), detector de aplausos en el navegador,
  clima Open-Meteo, Gmail/Drive con login de Google vía Firebase, "lecciones" en IndexedDB, generación de video Veo,
  voz en vivo por WebSocket.
- Problemas detectados: el chat usa `/api/teacher` (sin memoria de la conversación, siempre dice "No lo sé todavía");
  pide permisos enormes de Gmail/Drive (no necesarios); servidor escucha en 0.0.0.0.

## Pendiente de confirmar con el usuario
- Sistema operativo de la laptop (Claude corre en la nube y no puede verlo).
- Dónde guardar el código (este repo es el de perfil público de GitHub; se recomendó un repo privado `jarvis`).
