# Proyecto J.A.R.V.I.S. — notas para continuar

## Sobre el usuario
- Principiante total: explicar todo en español, paso a paso, palabras sencillas.
- Una fase a la vez. No avanzar hasta que el usuario diga que la fase funciona.
- Cuando el usuario deba hacer algo: un paso a la vez y esperar a que diga "listo".

## Fases
1. Platicar con Jarvis desde la interfaz (Gemini). ✅ el usuario confirmó que funciona.
2. Spotify (poner canción/playlist, pausar, siguiente, qué suena).
3. Activación con doble aplauso (programa en segundo plano, ignora ruidos sueltos, arranca al prender, sensibilidad ajustable).
4. Control de la laptop (abrir programas/webs, volumen, crear/leer archivos en UNA carpeta).
   ← ACTUAL (adelantada a pedido del usuario, junto con "Jarvis como app"): código listo, esperando prueba del usuario.
   Después: volver a la Fase 2 (Spotify).
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
- Laptop del usuario: **Windows**, Jarvis instalado en `C:\Jarvis\jarvis` (en la v1.5 lo reinstaló en otra carpeta:
  pidió la clave de nuevo; para saber dónde está: clic derecho en el icono → "Abrir ubicación del archivo"). El usuario delegó todas las decisiones técnicas.
- El código vive en la carpeta `jarvis/` de este repo (repo de perfil de GitHub, público → nunca subir secretos).
- GitHub: el usuario dio acceso; el trabajo se sube a la rama `claude/zealous-bardeen-xz2fta` (no a main).
  Al usuario se le entrega además un zip (`git archive HEAD jarvis`) con SendUserFile para instalarlo en su laptop.
  Para actualizar: extraer el zip en `C:\Jarvis` reemplazando archivos (`.env`, `node_modules`, `datos`, `registro` se conservan).
- El usuario pidió: Jarvis como app + "acceso a la compu en general pero con mi permiso". Se interpretó como lista
  amplia de herramientas, todas con diálogo de permiso (nunca comandos libres, por su propia regla de seguridad).

- **Al entregar cada actualización: subir `version` en jarvis/package.json** (va en 1.6.0). Los lanzadores apagan un
  Jarvis viejo que siga encendido (`/api/apagar`) y la interfaz avisa si la versión del servidor no coincide.
  (Problema real que pasó: la v1.0 seguía encendida y la interfaz nueva hablaba con el servidor viejo.)

## Cómo está hecho Jarvis (carpeta jarvis/)
- Lanzadores (Windows):
  - `Encender Jarvis.bat`: visible. Revisa Node.js → `npm install` la primera vez → si no hay clave corre `configurar.mjs`
    → si no existe `datos\acceso-directo.txt` llama `Crear acceso directo.bat` → arranca `server.ts` (abre la ventana).
  - `Jarvis.vbs`: lo usa el icono. Sin ventana negra. Si falta instalación/clave abre el .bat; si el servidor ya responde
    en 127.0.0.1:3000 solo abre la ventana; si no, arranca el servidor oculto (salida en `registro\servidor.log`).
  - `Crear acceso directo.bat` + `crear-acceso-directo.ps1`: icono `jarvis.ico` en Escritorio y menú Inicio → wscript Jarvis.vbs.
  - La ventana es Edge en modo app (`msedge --app=http://localhost:3000`); `abrirVentana` en server.ts.
  - .bat/.vbs/.ps1 deben tener fin de línea CRLF (`.gitattributes`).
- `configurar.mjs`: pide la clave de Gemini, la prueba contra Google y la guarda en `.env`.
- `server.ts` (Express + Vite en modo middleware, se corre con `tsx`, sin paso de compilación):
  - Escucha solo en 127.0.0.1:3000. Rechaza peticiones a /api con Origin/Host que no sean localhost (registra "SEGURIDAD").
  - `POST /api/chat {mensajes:[{rol,texto}]}` → `Agente` → `{texto}` o `{confirmacion:{id,descripcion,delicada,tipo,nombreTipo}}`.
  - `POST /api/permiso {id,aprobado,recordar}` → continúa el turno pausado. `GET/DELETE /api/permisos[/:tipo]`. `POST /api/apagar`.
  - Modelos (`modelos.ts`, pedido del usuario: "todas las versiones de Gemini"): `GET /api/modelos` lista desde Google
    (REST v1beta/models, filtra los que no sirven para chat: embedding, tts, live, imagen...), `POST /api/modelo {id}`
    lo cambia y lo guarda en `datos/modelo.json`. Menú desplegable en la barra superior.
    Si el modelo falla con 404/429/503 prueba en orden: elegido → gemini-3.8-flash → 3.5-flash → 3.5-flash-lite → 3.1-pro-preview.
    La misma clave sirve para todos. Errores en español en `explicarError`.
- `agente.ts`: bucle de function calling (máx. 6 vueltas). Devuelve el `content` del modelo tal cual (firmas de pensamiento).
  Pausa en cada acción que necesita permiso (pendientes en memoria, caducan en 5 min). Permisos recordados en `datos/permisos.json`.
- `herramientas.ts`: LISTA PERMITIDA (`DECLARACIONES`) + `revisar()` que valida y clasifica cada acción:
  libre (cancelar apagado) / normal (pregunta, se puede recordar) / delicada (siempre pregunta: borrar, reemplazar, apagar,
  reiniciar, suspender, bloquear). Herramientas: abrir_programa (Get-StartApps, incluye apps de la Store), abrir_pagina_web
  (solo http/https), buscar_en_internet, controlar_volumen (teclas de volumen vía SendKeys), listar_archivos, leer_archivo
  (solo texto, ≤200 KB, nunca .env), crear_archivo (solo texto, solo Documentos\Jarvis), abrir_archivo (nunca ejecutables),
  borrar_archivo (solo Documentos\Jarvis, a la Papelera), sistema.
  Rutas: alias Escritorio/Documentos/Descargas/Imagenes/Musica/Videos/Jarvis; `resolverRuta` impide salir (.., absolutas, enlaces).
- `memoria.ts` (pedido del usuario: "para la memoria"): recuerdos permanentes en `datos/memoria.json` (máx. 200, 300 car.).
  Herramientas `guardar_recuerdo`/`olvidar_recuerdo` (nivel libre: no tocan la laptop). Se inyectan en las instrucciones
  de Gemini en cada turno (`instrucciones()` en server.ts, junto con fecha/hora). `GET/POST/DELETE /api/recuerdos`.
  Panel "Memoria de Jarvis" para ver/agregar/borrar. La conversación del chat se guarda en localStorage (últimos 60 mensajes);
  botón "Nueva conversación" la borra (la memoria se conserva).
- Pedido del usuario: "almacenar todo lo que se habla, pizarra, y conectarse contigo (Claude) si no sabe algo":
  - `historial.ts`: TODO el chat (usuario y Jarvis) se guarda en `datos/historial/AAAA-MM.jsonl`; herramienta
    `buscar_en_historial` (libre). No se instala ninguna base de datos: archivos JSON en la laptop.
  - `pizarra.ts` + `components/PizarraPanel.tsx`: herramientas `escribir_en_pizarra` (titulo, contenido, agregar) y
    `borrar_pizarra` (libres). `datos/pizarra.json`; `GET/DELETE /api/pizarra`. La interfaz la abre sola sobre el reactor
    cuando cambia `actualizada`. Formato mini-markdown (#, -, 1., **negritas**) dibujado sin HTML.
  - `consultas.ts`: `investigar` (libre) = Gemini + googleSearch (gratis, misma clave); `consultar_a_claude` (normal,
    se puede recordar como "consultar_claude") = SDK `@anthropic-ai/sdk`, modelo `claude-opus-5-5`, effort medium,
    `fallbacks: "default"` (beta server-side-fallback-2026-07-01), web_search_20260209 (max 3), maneja pause_turn y refusal.
    Necesita `ANTHROPIC_API_KEY` en `.env` (opcional, de pago): `Configurar Claude.bat` → `configurar-claude.mjs`.
    Probado: rechazo con clave falsa (401) se explica bien. No probado con clave real ni googleSearch real.
  - `informacion.ts` (pedido: "acceso al clima y noticias"): `consultar_clima` (Open-Meteo, sin clave, 3 días) y
    `consultar_noticias` (RSS de Google Noticias MX, opcional tema, 8 titulares). Libres. La nube de Claude NO puede
    llegar a esos sitios (proxy), se probó el parseo con datos simulados; en la laptop del usuario Open-Meteo sí funciona.
  - `revisar-piezas.cjs`: los lanzadores corren `npm install` si falta alguna dependencia (las actualizaciones pueden traer nuevas).
- `windows.ts`: ejecuciones reales. Sin shell con texto libre: `explorer.exe <destino>`, programas fijos, y PowerShell con
  scripts fijos y datos por variables de entorno.
- `registro.ts`: `registro/jarvis.log` (fecha | TIPO | mensaje). Tipos: SISTEMA, CHAT, ERROR, SEGURIDAD, AVISO, PERMISO, ACCION.
- Interfaz `src/App.tsx` (React + Tailwind): reloj/clima, detector de aplausos de prueba, panel "Permisos sin preguntar",
  reactor, chat con dictado (Web Speech API) y voz (speechSynthesis), registro, botón Apagar.
  `components/PermisoDialog.tsx` = ventana Sí/No (en acciones delicadas el foco queda en "No permitir").
- Se quitó del diseño original de AI Studio: Gmail/Drive/Firebase (permisos excesivos), video Veo, voz Live, "lecciones".
- Pruebas: no hay suite en el repo; se probaron `resolverRuta`, `revisar` y el flujo del agente con un modelo simulado (Linux).
  Las acciones de Windows NO se han podido probar en la nube.

## Ideas para fases siguientes
- Fase 2: Spotify Web API (OAuth PKCE, token guardado en .env/archivo local; requiere Spotify Premium para controlar reproducción).
  Usar "function calling" de Gemini con una lista cerrada de herramientas.
- Fase 3: programa aparte en segundo plano (p. ej. Python con sounddevice o Node) + tarea de inicio de Windows.
- Fase 4: hecha (ver arriba). Pendiente quizá: confirmar por voz ("sí"/"no").
