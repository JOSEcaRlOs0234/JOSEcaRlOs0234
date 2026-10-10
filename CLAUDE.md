# Proyecto J.A.R.V.I.S. — notas para continuar

## Sobre el usuario
- Principiante total: explicar todo en español, paso a paso, palabras sencillas.
- Una fase a la vez. No avanzar hasta que el usuario diga que la fase funciona.
- Cuando el usuario deba hacer algo: un paso a la vez y esperar a que diga "listo".

## Fases
1. Platicar con Jarvis desde la interfaz (Gemini). ← ACTUAL: código listo, esperando prueba del usuario
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

## Estado actual
- Laptop del usuario: **Windows**. El usuario delegó todas las decisiones técnicas.
- El código vive en la carpeta `jarvis/` de este repo (repo de perfil de GitHub, público → nunca subir secretos).
- Push a GitHub falló por permisos (la app de Claude no tiene acceso al repo); el usuario debe conectar GitHub en claude.ai.
- Fase 1: código terminado y probado en la nube (sin clave real). **Esperando que el usuario lo pruebe en su laptop.**

## Cómo está hecho Jarvis (carpeta jarvis/)
- `Encender Jarvis.bat`: revisa Node.js → `npm install` la primera vez → si no hay clave corre `configurar.mjs` → arranca `server.ts` y abre el navegador.
- `configurar.mjs`: pide la clave de Gemini, la prueba contra Google y la guarda en `.env`.
- `server.ts` (Express + Vite en modo middleware, se corre con `tsx`, sin paso de compilación):
  - Escucha solo en 127.0.0.1:3000. Rechaza peticiones a /api con Origin/Host que no sean localhost (registra "SEGURIDAD").
  - `POST /api/chat {mensajes:[{rol:"usuario"|"jarvis",texto}]}` → Gemini con personalidad de Jarvis (respuestas cortas, para voz).
    Modelo `GEMINI_MODEL` (por defecto `gemini-3.8-flash`, respaldo `gemini-3.5-flash` si el modelo no existe).
    Errores traducidos a español sencillo en `explicarError`.
  - `GET /api/estado`, `GET /api/registro`.
- `registro.ts`: escribe `registro/jarvis.log` (fecha | TIPO | mensaje). Tipos: SISTEMA, CHAT, ERROR, SEGURIDAD, AVISO.
- Interfaz `src/App.tsx` (React + Tailwind): reloj/clima (Open-Meteo), detector de aplausos de prueba en el navegador,
  reactor (`components/ReactorCore.tsx`), chat con dictado por voz (Web Speech API, Chrome/Edge) y voz de Jarvis
  (speechSynthesis, prefiere voces de Windows en español: Jorge/Raúl/Pablo), panel de registro.
- Se quitó del diseño original de AI Studio: Gmail/Drive/Firebase (permisos excesivos), video Veo, voz Live, "lecciones".
  El zip original no está en el repo.

## Ideas para fases siguientes
- Fase 2: Spotify Web API (OAuth PKCE, token guardado en .env/archivo local; requiere Spotify Premium para controlar reproducción).
  Usar "function calling" de Gemini con una lista cerrada de herramientas.
- Fase 3: programa aparte en segundo plano (p. ej. Python con sounddevice o Node) + tarea de inicio de Windows.
- Fase 4: herramientas permitidas (lista blanca), confirmación para acciones delicadas, carpeta única para archivos.
