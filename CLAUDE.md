# Proyecto J.A.R.V.I.S. — notas para continuar

## Sobre el usuario
- Principiante total: explicar todo en español, paso a paso, palabras sencillas.
- Una fase a la vez. No avanzar hasta que el usuario diga que la fase funciona.
- Cuando el usuario deba hacer algo: un paso a la vez y esperar a que diga "listo".

## Fases
1. Platicar con Jarvis desde la interfaz (Gemini). ✅ el usuario confirmó que funciona.
2. Spotify (poner canción/playlist, pausar, siguiente, qué suena).
3. Activación con doble aplauso (programa en segundo plano, ignora ruidos sueltos, arranca al prender, sensibilidad ajustable).
   Los aplausos no funcionaron bien con su micrófono (muy bajito/filtrado). El usuario pidió: "mejor que prenda
   cuando le diga Jarvis" → v2.2 palabra "Jarvis" con Porcupine (ver abajo). ← esperando que saque la clave de Picovoice.
4. Control de la laptop (abrir programas/webs, volumen, crear/leer archivos en UNA carpeta).
   v2.4 (agregado): notas, dibujos (Jarvis y a mano) e investigar a fondo con fuentes. ← esperando prueba del usuario.
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
  **Desde v2.0 los datos NO viven en la carpeta del programa** (`ubicacion.mjs`): `.env`, memoria, historial, permisos,
  pizarra, modelo, aplausos y registro van en `%LOCALAPPDATA%\Jarvis` (Linux: ~/.jarvis; `JARVIS_DATOS` lo cambia).
  `prepararDatos()` (lo llaman server.ts, configurar.mjs y configurar-claude.mjs) copia la primera vez el `.env` + `datos/`
  + `registro/` de la copia más reciente encontrada (carpeta del programa, C:\Jarvis\*, Descargas\*\jarvis, Escritorio).
  Así el usuario puede extraer cada zip donde sea (lo hizo en Descargas varias veces) sin que pida la clave.
  El icono del Escritorio se rehace por copia (marcador `datos\acceso-directo.txt` en la carpeta del programa) y el
  acceso de arranque con Windows se rehace en cada inicio para apuntar a la copia actual.
  `configurar.mjs`: sin argumentos pide clave solo si falta; `--cambiar`; `--comprobar` (exit 1 si falta; lo usa Jarvis.vbs).
  `Cambiar clave de Gemini.bat` para cambiarla.
- El usuario pidió: Jarvis como app + "acceso a la compu en general pero con mi permiso". Se interpretó como lista
  amplia de herramientas, todas con diálogo de permiso (nunca comandos libres, por su propia regla de seguridad).

- **Al entregar cada actualización: subir `version` en jarvis/package.json** (va en 2.4.1). Los lanzadores apagan un
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
- Fase 3 (aplausos):
  - `detector-aplausos.ts`: `DetectorAplausos.procesar(Int16Array 16 kHz, ms)`. Aplauso = subida de golpe (rms > 3× los 3
    pedacitos previos), pico ≥ `umbralPorSensibilidad(1..10)` (0.35·0.78^(s-1)) y ≥ 12× ruido de fondo, dura ≤160 ms, y
    "agudos" (rms de la diferencia / rms) ≥ 0.55. Exactamente 2 aplausos con 120–800 ms entre sí y picos parecidos (<4×),
    luego 500 ms de calma → "activado" y pausa 4 s. 3+ golpes = ignorado. Probado con 13 casos sintéticos (todos bien).
  - `aplausos.ts`: `OidoDeJarvis` usa `@picovoice/pvrecorder-node` (binarios listos para Windows, sin compilar, gratis;
    frames de 256, micrófono predeterminado). Reintenta cada 15 s si no hay micrófono (al prender la laptop). Config en
    `datos/aplausos.json` (activo, sensibilidad, arranqueConfigurado). Arranque con Windows = acceso directo
    `%APPDATA%\...\Startup\Jarvis (aplausos).lnk` → `wscript Jarvis.vbs fondo` (se crea solo la primera vez).
    `decirEnVoz` = PowerShell System.Speech (voz en español de Windows), `saludo()` según la hora.
  - server.ts: al activarse → pausa 8 s, si no hay ventana visible (latido `GET /api/aplausos?visible=1` en los últimos
    4 s) abre la ventana; saluda en voz. La interfaz (si está abierta) ve `activacion` subir y empieza a dictar.
    `POST /api/aplausos/config {activo,sensibilidad}`, `POST /api/aplausos/arranque {activo}`.
  - Se quitó el detector de prueba del navegador; el panel "Activar con aplausos" muestra estado, nivel, sensibilidad,
    casilla de arranque con Windows y los últimos eventos (para ajustar la sensibilidad).
  - No probado con micrófono real (la nube no tiene); sí que sin micrófono no se rompe.
  - PRUEBA REAL v1.7 (usuario): estado "ESCUCHANDO" pero volumen 0% y ningún evento, aun con sensibilidad 10 →
    le llegan solo ceros. Causas probables: privacidad de Windows ("Permitir que las aplicaciones de escritorio
    accedan al micrófono") o micrófono equivocado. v1.8: `config.dispositivo` (-1 = predeterminado),
    `GET /api/aplausos/microfonos` (PvRecorder.getAvailableDevices), menú "Micrófono" en el panel y aviso `sinSonido`
    (escuchando >4 s y solo ceros).
  - El usuario revisó privacidad: todo activado y "Node.js JavaScript Runtime — Actualmente en uso" → el permiso NO era
    el problema; probablemente el micrófono predeterminado equivocado. Pidió "hazlo tú" → v1.9: si hay 3 s de puro
    silencio (y el micrófono no fue elegido a mano), `buscarMicrofono()` prueba cada dispositivo ~1.2 s y se queda con
    el primero que manda sonido; guarda `dispositivo` + `nombreDispositivo` (el número se re-busca por nombre al iniciar)
    y `microfonoManual`. Estado "buscando" en el panel. Probado con un PvRecorder falso (elige el 3.º de 3).
  - PRUEBA REAL v1.9: el micrófono YA oye, pero sus aplausos salían "Ignorado: golpe grave" y "sonido largo".
    v2.0: reglas más flexibles por defecto (`CALIBRACION_INICIAL`: dura ≤250 ms, agudos ≥0.30; fin de evento cuando
    rms < 20% del pico) y botón "Enseñarle mis aplausos": las siguientes 3 palmadas se miden y `terminarAprendizaje()`
    AFLOJA las reglas para aceptarlas (nunca las endurece; tope 450 ms, agudos mín 0.08). Guardado en
    `config.calibracion`; "Reiniciar" vuelve a fábrica. Los "Ignorado" ahora muestran "· N ms, agudos X" para diagnosticar.
    Siguen pasando los 13 casos sintéticos + aplausos "de laptop" (ruido filtrado a 2.5 kHz con eco 60–150 ms).
  - PRUEBA REAL v2.0: "Aplauso (fuerza 0.05)" e "Ignorado: golpe grave · 84 ms, agudos 0.22", volumen en reposo 0%,
    sensibilidad 10; además apretó "Reiniciar" en vez de "Enseñarle". → su micrófono capta MUY bajito y muy filtrado.
    v2.1: `umbralPorSensibilidad` = 0.25·0.7^(s-1) (s=10 → 0.01), `CALIBRACION_INICIAL.minAgudos` = 0.15; al enseñar
    escucha con sensibilidad 10 y al terminar fija la sensibilidad más baja cuyo umbral ≤ 0.6 × el aplauso más suave
    (evento "calibrado" trae `sensibilidad`). Probado: aplausos de 0.035–0.05 → aprende, pone sens 7 y activa.
    Recomendado al usuario: subir "Volumen de entrada" del micrófono en Windows al 100%.
  - v2.2 PALABRA "JARVIS" (pedido del usuario, preferida sobre aplausos): `@picovoice/porcupine-node` con la palabra
    integrada `BuiltinKeyword.JARVIS` (offline, preciso; binarios Windows incluidos). Necesita AccessKey GRATIS de
    console.picovoice.ai → `PICOVOICE_ACCESS_KEY` en el `.env` central. Se pega en el panel "Despertar a Jarvis"
    (`POST /api/palabra/clave`: valida creando Porcupine, guarda con `guardarEnEnv`, apaga aplausos, reinicia el oído).
    `OidoDeJarvis`: si hay Porcupine, PvRecorder usa frameLength 512 y los aplausos (si `usarAplausos`) se procesan en
    trozos de 256. Config nueva: `usarPalabra`, `usarAplausos`, `sensibilidadPalabra` (1..10 → 0.30..0.85).
    Estado `palabra`: activa / sin_clave / error (`errorPalabra`, `explicarErrorPorcupine`) / apagada.
    Probado: clave falsa → "La clave de Picovoice no es válida" y no se guarda; panel con y sin clave. NO probado con
    clave real ni voz real.
  - En su registro se vio 429 en gemini-3.8-flash y 3.5-flash (límite gratuito) y respondió el respaldo: funciona.
- v2.3 "que se sienta como un Jarvis real" (pedido del usuario: "todo lo que puedas mejorar, menos manual"):
  - Modo conversación (App.tsx): `conversacionRef`/`conversando`. "Hablar con Jarvis" o despertarlo inicia; tras cada
    respuesta `hablar(texto, alTerminar)` → `escucharSiguiente()`; silencio (no-speech) o despedida (`DESPEDIDA`:
    gracias / eso es todo / adiós...) termina. Insignia "Conversación activa · Terminar" en el chat.
  - Permiso por voz: en conversación, `pedirPermisoPorVoz` lo pregunta en voz; "sí/claro/adelante..." aprueba;
    acciones delicadas exigen decir "confirmo"; "no/cancela" rechaza; los botones siguen sirviendo.
  - Despertar: con la ventana visible → tono "bip" y escucha al instante (sin saludo largo); sin ventana → el servidor
    abre `/?despertar=1` y la interfaz saluda y escucha. Primera vez del día → mensaje OCULTO `PEDIDO_RESUMEN`
    (clima + 3 titulares + recordatorios). Mensajes `oculto` se mandan a Gemini pero no se pintan.
  - Si el navegador no deja hablar sin un clic (`not-allowed`), `POST /api/decir` hace hablar a Windows (System.Speech).
    Edge se abre con `--autoplay-policy=no-user-gesture-required`.
  - `recordatorios.ts`: `programar_recordatorio` (minutos o fecha_hora local), `ver_recordatorios`,
    `cancelar_recordatorio` (libres). `datos/recordatorios.json`; `vigilarRecordatorios` cada 15 s; vencidos con la
    laptop apagada se avisan al encender ("se pasó..."). Aviso → `avisos` en `GET /api/aplausos` (la ventana lo
    muestra con ⏰ y lo dice) o, sin ventana visible, lo dice Windows. Pendientes van en `instrucciones()`.
  - Modelos: `enfriarModelo` — tras 429/503 se salta ese modelo 1 min (404: 1 h) para no perder tiempo.
  - Probado con micrófono/voz simulados en Playwright: conversación completa (pedido → permiso por voz "sí" → sigue →
    "gracias" → se duerme), despertar con resumen oculto, recordatorio en pantalla y en servidor.
- BUG REAL v2.3 (usuario): "abre el navegador"/búsquedas decían "Hecho" pero no aparecía nada. Causa: `spawn(explorer.exe,
  {windowsHide:true})` → Windows pasa SW_HIDE al programa abierto y el navegador salía invisible. v2.3.1: explorer sin
  windowsHide; `abrirUrl`/`abrirRuta` = PowerShell `Start-Process -WindowStyle Normal` (destino por variable de entorno).
  NUNCA volver a poner windowsHide al lanzar programas/páginas para el usuario.
- v2.4 (pedido: "que no cambie nada, solo agrégale anotar, dibujar y buscar en la web para que me dé información"):
  - `notas.ts`: `datos/notas.json` (máx. 500, 5000 car., más nuevas primero). Herramientas `anotar`, `ver_notas`,
    `borrar_nota` (libres). `GET/POST /api/notas`, `DELETE /api/notas/:id` (traen `actualizada`). `components/NotasPanel.tsx`
    sobre el reactor (se abre sola si cambian tras un chat; botón "Notas" junto a "Pizarra").
  - `dibujos.ts`: herramienta `dibujar` (libre) → Gemini genera SVG (`pedidoDeDibujo`, 800×600 fondo oscuro) →
    `limpiarSvg` (quita script, foreignObject, image/iframe..., on*, href no internos; agrega xmlns/xmlns:xlink; ≤300 KB)
    → `dibujarEnPizarra` (campo `dibujo` en pizarra.json; `agregar` lo conserva). Se muestra con `<img src=data:svg>`.
    Pizarra → "Dibujar yo": lienzo 1600×1000 (colores, grosor, borrador, deshacer, limpiar, usar dibujo de Jarvis de
    fondo) → `POST /api/dibujos {png}` (ruta con su propio límite 12 MB; el resto 1 MB) → `guardarDibujoPng` valida
    la firma PNG y guarda en Documentos\Jarvis\Dibujos.
  - `investigar_a_fondo` (libre): `consultas.investigarAFondo` = Gemini + googleSearch, "RESUMEN: ..." + informe con ##,
    fuentes de groundingChunks (≤8) → pizarra con `## Fuentes` como `[título](url)` (PizarraPanel dibuja enlaces
    http/https que abren en otra ventana). Devuelve `resumen_para_decir`.
  - server.ts: `conRespaldo()` prueba modelos con `ordenDePrueba`/`enfriarModelo`; `conectarIA({investigarAFondo, dibujar})`.
    PERSONALIDAD: anota/apunta → anotar; dibuja/diagrama → dibujar; info detallada → investigar_a_fondo.
  - Probado: limpiarSvg, notas, las 5 herramientas con IA simulada, endpoints, y en Playwright: panel de notas, dibujo
    de Jarvis con fuentes, dibujar a mano + guardar PNG. NO probado con Gemini real (dibujo/búsqueda).
- v2.4.1 (pedido: "si tiene un recordatorio y la compu está prendida, que se prenda solo"; vio "mientras estaba
  apagado se pasó un recordatorio"): `programarEncendido` (windows.ts) registra la tarea de usuario "Jarvis - recordatorio"
  (Register-ScheduledTask, sin admin, StartWhenAvailable, sin límite de tiempo) → `wscript Jarvis.vbs recordatorio`
  (= modo fondo) 1 min antes del recordatorio más próximo. `sincronizarEncendido` (server.ts) se llama al iniciar y cada
  vez que cambia recordatorios.json (`cuandoCambienRecordatorios`); los que faltan <70 s los avisa el Jarvis ya encendido.
  Al avisar sin ventana visible: Windows lo dice + se abre la ventana `/?aviso=N` (máx. 1 cada 15 s), que lo muestra
  sin repetirlo en voz. Probado en Linux (sin la tarea real). NO probado en Windows.
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
