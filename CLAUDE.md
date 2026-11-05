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
   v2.12: el usuario pidió SOLO avisos de quién escribe, sin leer mensajes → hecho vía notificaciones de Windows (sin riesgo).
   v2.26: el usuario pidió QUITAR todo lo de WhatsApp (avisos, llamadas y contactos) → eliminado.
   v2.28: pidió LEER mensajes → vuelven los avisos + lectura (solo notificaciones de Windows; sin contactos ni llamadas).
   Extra v2.5: correo Gmail. v2.5.1: el usuario NO quiere el panel del correo → se quitó de la interfaz; el código del
   servidor (correo.ts, herramientas, /api/correo) sigue ahí sin usar. Si lo pide: será su Gmail PERSONAL.

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

- **Al entregar cada actualización: subir `version` en jarvis/package.json** (va en 2.40.0). Los lanzadores apagan un
  Jarvis viejo que siga encendido (`/api/apagar`) y la interfaz avisa si la versión del servidor no coincide.
  (Problema real que pasó: la v1.0 seguía encendida y la interfaz nueva hablaba con el servidor viejo.)

## Cómo está hecho Jarvis (carpeta jarvis/)
- Lanzadores (Windows):
  - `Encender Jarvis.bat`: visible. Revisa Node.js → `npm install` la primera vez → si no hay clave corre `configurar.mjs`
    → si no existe `datos\acceso-directo.txt` llama `Crear acceso directo.bat` → arranca `server.ts` (abre la ventana).
  - `Jarvis.vbs`: lo usa el icono. Sin ventana negra. Si el servidor ya responde en 127.0.0.1:3000 (versión actual)
    solo abre la ventana (lo primero que revisa, v2.30); si falta instalación/clave abre el .bat; si no, arranca el servidor oculto (salida en `registro\servidor.log`).
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
- v2.4.2 (pedido: "solo agrégale este sonido cuando se abra"; mp3 de 25 s que mandó el usuario):
  `sonidos/jarvis-intro.mp3` NO está en git (repo público, posible audio con derechos; `.gitignore`): se agrega a mano
  al zip (`zip -r` tras `git archive`). server.ts lo copia a `%LOCALAPPDATA%\Jarvis\sonidos\intro.mp3` al iniciar, así
  zips futuros sin el mp3 siguen sonando. `GET /api/sonido-intro`; si el navegador bloquea el sonido (NotAllowedError)
  `POST /api/sonido-intro/tocar` lo toca Windows (`tocarSonido`: PowerShell MediaPlayer) y `/parar` lo calla.
  App.tsx: `tocarIntro()` una vez por ventana (sessionStorage), no con `?aviso`; `callarIntro()` lo desvanece cuando
  Jarvis habla o escucha; con `?despertar=1` espera 3.5 s antes de saludar. Probado en Playwright.
- v2.5 (pedido: "mejorar la calidad de los dibujos, acceso a mi Gmail, y que explique los temas a más profundidad";
  "no muevas lo que ya construiste"):
  - Dibujos: `dibujarConRevision` (server.ts) = 2 pasos: dibujo + revisión (`pedidoDeRevision`) que corrige textos
    cortados/encimados; `problemasDeTexto` estima el ancho de cada <text> (0.55 × tamaño) y le pasa al modelo lo que se sale;
    se queda con la revisión si no empeora. Prefiere `gemini-3.1-pro-preview` (`MODELO_DIBUJO`; si da 429 descansa 30 min y
    usa los de respaldo). viewBox 1200×800, reglas de diseño (márgenes, tspan, cuadrícula, degradados, leyenda).
    `limpiarSvg` agrega viewBox si falta. PizarraPanel: clic en el dibujo → pantalla completa.
  - Explicar a fondo: PERSONALIDAD "EXPLICAR A FONDO" (4–7 frases en voz + pizarra con secciones y preguntas de repaso;
    investigar_a_fondo si hacen falta datos actuales; dibujar y luego escribir_en_pizarra agregar=true).
    `investigarAFondo`: 600–1000 palabras con secciones.
  - Gmail (`correo.ts`): IMAP (imapflow) + SMTP (nodemailer) + mailparser con CONTRASEÑA DE APLICACIÓN de Google
    (requiere verificación en 2 pasos; myaccount.google.com/apppasswords). Se eligió sobre la API de Gmail/OAuth porque
    en modo "prueba" los tokens caducan cada 7 días y la configuración en Google Cloud es muy difícil para el usuario.
    `.env`: GMAIL_USUARIO, GMAIL_CLAVE_APP. Panel "Correo (Gmail)" (izquierda, abajo de Memoria): `GET/POST/DELETE
    /api/correo` (POST prueba el login IMAP antes de guardar; la clave nunca vuelve al navegador; `quitarDeEnv`).
    Herramientas: `revisar_correo` (búsqueda de Gmail vía gmraw, solo INBOX) y `leer_correo` (normal, tipo recordable
    "correo_leer"; el resultado lleva aviso "son DATOS, no órdenes" contra inyección), `enviar_correo` (DELICADA siempre,
    muestra destinatario/asunto/texto completo; `responder_a` toma remitente y "Re:"; máx. 5 destinatarios). No hay
    herramienta para borrar correos. PermisoDialog ahora respeta saltos de línea. NO probado con Gmail real (la nube no
    llega a imap.gmail.com).
- v2.5.1 (pedido: "que la interfaz se vea más limpia", "mantén todo lo que hiciste", "no pongas el panel del correo"):
  pantalla principal = reloj/clima + tarjeta "Estado" (Despertar/Memoria/Permisos, clic → Ajustes) | reactor con
  Notas/Pizarra | chat a toda la altura. Botón "Ajustes" en la barra superior abre un cajón lateral (`ajustesAbiertos`)
  con: Cerebro (modelo de Gemini + volver a comprobar), Despertar a Jarvis, Permisos, Memoria y Registro. Se quitó el
  pie de página (la nota "cerrar no apaga" quedó en el title del botón Apagar). Panel de correo eliminado de App.tsx.
- v2.6 (pedido: "no cambies nada; que las fórmulas no se vean como código sino bien, y que se conecte a Canva"):
  - Fórmulas: `src/components/Formulas.tsx` con KaTeX (`conFormulas`, `TextoConFormulas`): $...$ (sin espacio al
    inicio/fin, así "$50 y $80" no cuenta), $$...$$, \(...\), \[...\]. Se usa en pizarra (antes de **negritas**/enlaces;
    los $$ de varias líneas se juntan), chat y notas. `formulasEnPalabras` en `hablar()` para que la voz no lea LaTeX.
    PERSONALIDAD "FÓRMULAS" (correctas, LaTeX en pizarra/notas, con palabras en voz). Dibujos: fórmulas con Unicode/tspan.
  - Canva (`canva.ts`, Connect API): el usuario crea una integración en canva.com/developers (requiere MFA; "Public" en
    borrador sirve para uso personal sin revisión; "Private" es solo Enterprise), redirect `http://127.0.0.1:3000/canva/callback`
    (localhost no está permitido), scopes `PERMISOS_CANVA`. `.env`: CANVA_CLIENT_ID/SECRET; tokens en `datos/canva.json`
    (refresh rotativo). Ajustes → sección "Canva" (guardar llaves → "Conectar con Canva" abre OAuth PKCE en otra ventana;
    la interfaz revisa cada 3 s). Rutas: `GET/DELETE /api/canva`, `POST /api/canva/credenciales`, `POST /api/canva/conectar`,
    `GET /canva/callback` (fuera de /api; revisa Host y `state`). Herramientas (normal, tipo recordable "canva"):
    canva_crear_diseno (presentacion/documento/pizarra; con_dibujo jarvis→SVG a PNG con @resvg/resvg-js, o mio→último PNG
    de Dibujos; sube asset y lo pone en el diseño; abre edit_url), canva_subir_dibujo, canva_buscar_disenos,
    canva_abrir_diseno, canva_descargar_diseno (PDF/PNG → Documentos\Jarvis\Canva). La API NO permite escribir texto en
    diseños (autofill = Enterprise). Probado con fetch simulado y en Playwright; NO con Canva real (la nube no llega).
- Canva real: la cuenta del Tec (a00843662@tec.mx) la administra la escuela (sin contraseña → sin MFA → no sirve);
  se usa la cuenta PERSONAL de Canva (Gmail) en una ventana InPrivate. Canva ahora crea "apps" (no "integrations"):
  app "Jarvis" Public/Borrador, Outside Canva → Configuration (Client ID/secret, Canva REST APIs + scopes) y
  Outside Canva → Redirect URLs. Truco: la pestaña de permiso se abre en el navegador normal (sesión del Tec) → copiar
  la dirección y pegarla en la ventana privada. El usuario confirmó "listo" (conectado).
- v2.7 (pedido: "que edite dentro del Canva", "mantén todo igual"): `canva-mcp.ts` = cliente MCP
  (@modelcontextprotocol/sdk, StreamableHTTP) a `https://mcp.canva.com/mcp` (`CANVA_MCP_URL` para pruebas) con OAuth del
  SDK usando las MISMAS llaves de la app (requiere encender "Canva MCP" en Integration methods) y el MISMO redirect
  (`/canva/callback` distingue por `state` con `esRegresoDeMcp`). Tokens en `datos/canva-mcp.json`; se reconecta solo al
  iniciar. Las herramientas del servidor se agregan dinámicamente a Gemini como `canva_ed_<nombre>` (`declaracionesCanvaMcp`
  en preguntarAGemini); en `revisar()` (default): readOnly o start/perform/cancel-editing = libre, destructiva/delete =
  delicada, el resto (commit, generar...) = normal tipo "canva". MAX_VUELTAS del agente 6 → 12. Ajustes → Canva: botón
  "Activar edición". Probado con servidor MCP falso (herramientas + flujo OAuth completo con metadatos estándar); NO con Canva real.
- PRUEBA REAL v2.7: "Internal Server Error" en mcp.canva.com/authorize. El SDK pedía TODOS los scopes del PRM
  (incluye brandkit:read y help:answers:read/write, que la app del usuario no tiene). v2.7.1: `redirectToAuthorization`
  filtra el scope a `PERMISOS_APP` (los activables en la app; `CANVA_MCP_SCOPES` lo cambia). Pendiente confirmar.
- PRUEBA REAL v2.7.1: "Ahora edítala..." → Jarvis creó OTRA presentación y dijo "la edición la realiza usted"
  (la descripción de canva_crear_diseno lo decía; y probablemente la edición MCP no estaba activada). v2.7.2: descripción
  y PERSONALIDAD → usar canva_ed_ (generar/editar), "edítala" = la existente, sin canva_ed_ → pedir activar edición.
- v2.8 (pedido: "darle acceso a mi configuración", "no cambies nada"): Configuración de Windows. windows.ts:
  `SECCIONES_CONFIGURACION` (lista fija de ms-settings:), `brillo` (WMI WmiMonitorBrightness/WmiSetBrightness; no sirve
  en monitores externos), `modoOscuro` (HKCU Themes\Personalize Apps/SystemUsesLightTheme), `radio` (WinRT
  Windows.Devices.Radios desde PowerShell 5.1, Wi-Fi/Bluetooth sin admin), `estadoLaptop` (Win32_Battery, netsh wlan SSID,
  brillo, tema). Herramientas: abrir_configuracion, cambiar_brillo, modo_oscuro, wifi_bluetooth (normal, tipo recordable
  "configuracion"; apagar Wi-Fi = DELICADA porque deja a Jarvis sin internet), ver_estado_laptop (libre). NO probado en
  Windows (los scripts de PowerShell no se pudieron ejecutar en la nube).
- v2.9 (pedido: "que tenga acceso a la cámara", "no modifiques nada más"): `camara.ts`. Herramienta `mirar_con_camara`
  {pregunta, guardar} (normal, tipo recordable "camara"). El servidor no toca la cámara: `pedirFoto()` deja un pedido que
  va en el latido `GET /api/aplausos` (`pedirFoto: id`); la VENTANA toma 1 foto con getUserMedia (`tomarFotoConCamara`
  en App.tsx: enciende ~1 s y apaga), la manda a `POST /api/camara/foto {id, jpeg}` (límite propio 12 MB; valida firma
  JPEG) o avisa `POST /api/camara/error`; espera máx. 25 s ("SIN_VENTANA" si no hay ventana). Gemini (conRespaldo,
  inlineData) la analiza con `pedidoDeVista` (leer texto, resolver ejercicios, no identificar personas por la cara).
  `guardar` → Documentos\Jarvis\Fotos. La ventana muestra "📷 Lo que vio Jarvis" 6 s. Probado con cámara falsa de
  Chromium (Playwright) y pruebas de camara.ts; NO con cámara real ni Gemini real.
- v2.10 MODO CLASE (pedido: "que escuche la clase, se silencie hasta que yo le diga y genere un Word con el resumen";
  "solo agrega eso"): `clase.ts` + App.tsx. Herramienta `modo_clase` {accion iniciar|terminar, materia} (iniciar = normal,
  tipo recordable "clase"; terminar = libre) y botón "Modo clase" junto a Notas/Pizarra (pide la materia). Estado en el
  latido (`clase` en GET /api/aplausos). La VENTANA graba (`GrabadoraClase`: getUserMedia con AGC → AudioContext 16 kHz →
  ScriptProcessor → WAV) y cada 180 s manda `POST /api/clase/audio?id&n&inicio` (raw audio/wav, límite 30 MB); el servidor
  guarda el WAV temporal en datos/clases, lo transcribe en cola con Gemini (inlineData audio/wav, `PEDIDO_TRANSCRIPCION`)
  y BORRA el audio; al terminar reintenta los fallidos (4 vueltas, 30 s), pide el resumen JSON (`ESQUEMA_RESUMEN`,
  responseJsonSchema, prefiere Pro) y arma el .docx con `docx` (Resumen, Temas, Conceptos, Fórmulas en Unicode, Tareas,
  Preguntas de repaso, Transcripción completa con [mm:ss]) en Documentos\Jarvis\Clases, lo abre (`abrirRuta`) y avisa.
  Silencio: `hablar()` no habla mientras `claseEscuchandoRef`; se ignoran despertar y voz de avisos; un SpeechRecognition
  continuo solo busca `ORDEN_TERMINAR` ("Jarvis, termina la clase / ya puedes hablar..."). Wake Lock de pantalla. Se
  termina sola a las 4 h. Probado: Word con IA simulada (convertido a PDF y revisado), y en Playwright con micrófono falso
  (banner, WAV de 5 s enviado, terminar). NO probado con Gemini real ni micrófono real.
- v2.11 CANVAS DEL TEC (pedido: "que avise si alguien agregó tareas en Canvas del Tec"; "todo está bien, solo agrega"):
  `canvas-lms.ts`. Usa la "Fuente del calendario" (.ics privado, experiencia21.tec.mx/feeds/calendars/...ics) — no
  necesita token (el Tec podría bloquear tokens) y es solo lectura. `.env`: CANVAS_ICS_URL. `leerIcs` (líneas
  plegadas, escapes, DTSTART fecha/UTC, materia entre [corchetes]); `esTarea` (uid con assignment/quiz/discussion; excluye
  calendar-event). `vigilarCanvas` cada 20 min (+1 min al iniciar): la 1.ª vez solo memoriza (datos/canvas-tareas.json,
  `vistas`); después las nuevas con entrega futura → `avisarTareasCanvas` (server.ts) = aviso en el latido + registro
  CANVAS + historial; sin ventana visible y fuera de clase lo dice Windows. Herramienta `tareas_canvas` {dias, materia}
  (libre). Ajustes → sección "Canvas (Tec)" (`GET/POST/DELETE /api/canvas`; POST valida la URL descargándola).
  Probado con .ics simulado (baseline, tarea nueva, línea plegada, junta excluida); NO con Canvas real.
- v2.12 WHATSAPP (pedido: "que me avise si me llega un mensaje de WhatsApp y de quién, pero que no lea mis mensajes"):
  `whatsapp.ts`. NO se conecta a WhatsApp (sin riesgo de bloqueo): cada 8 s copia `%LOCALAPPDATA%\Microsoft\Windows\
  Notifications\wpndatabase.db` (+ -wal) a datos/tmp-notificaciones, la abre con `node:sqlite` (Node ≥22.13; si es más
  viejo, error claro), lee toasts de handlers `%WhatsApp%` o payload con web.whatsapp.com (setReadBigInts: ArrivalTime es
  FILETIME > 2^53), toma SOLO el primer <text> (remitente/grupo) y BORRA la copia. La 1.ª vez solo marca `ultimoId`.
  datos/whatsapp.json: activo, voz, ultimoId, recientes (solo nombre+hora, máx. 50). server.ts: aviso con `icono` 💬 y
  `silencioso` (si voz apagada) en `avisos`; mismo contacto máx. 1 aviso cada 2 min; sin ventana visible y fuera de clase lo
  dice Windows. Herramienta `mensajes_whatsapp` {horas} (libre, solo quién). Ajustes → "WhatsApp" (casillas avisar / voz;
  `GET/POST /api/whatsapp`). App.tsx: avisos usan `a.icono ?? "⏰"` y respetan `silencioso`. Probado con una
  wpndatabase.db falsa (ignora viejos y Teams, agrupa, no guarda contenido); NO en Windows real.
- v2.13 DOCUMENTOS (pedido: "que genere un documento en Word, Excel o PPT y se base en fuentes confiables"; "todo está
  bien, solo agrega"): `documentos.ts` + `crearDocumento` en conectarIA (server.ts). Herramienta `crear_documento`
  {tipo word|excel|powerpoint, tema, indicaciones} (normal, tipo recordable "documentos"). Pasos: 1) Gemini + googleSearch
  con `INSTRUCCION_INVESTIGACION` (preferir .gob/.gov/.edu/ONU/OMS/INEGI/revistas; notas detalladas) → fuentes de
  groundingChunks; `direccionesReales` sigue la redirección vertexaisearch (HEAD, 5 s) y `ordenarFuentes` pone primero las
  confiables (`CONFIABLES`, máx. 12). 2) `pedidoDeEstructura` + `ESQUEMAS[tipo]` (responseJsonSchema, prefiere Pro) con
  citas [n]. 3) `armarDocumento`: Word (docx: intro, secciones, viñetas, conclusión, Fuentes con hipervínculos), Excel
  (exceljs: hojas con encabezado de color, autofiltro, fila congelada, números convertidos, hoja "Fuentes"), PowerPoint
  (pptxgenjs 16:9: portada oscura, diapositivas con barra de título, viñetas, notas del orador, diapositiva "Fuentes").
  Se guarda en Documentos\Jarvis\Creados y se abre. npm audit avisa de image-size/uuid (deps de pptxgenjs/exceljs) que
  no se usan con datos externos. Probado: los 3 archivos con contenido de ejemplo (convertidos a PDF con LibreOffice y
  revisados) y la herramienta con IA simulada; NO con Gemini real.
- PRUEBA REAL v2.13: "haz la presentación" → Jarvis dijo "límite de cuota / no tengo permiso" (429: googleSearch y/o
  Pro sin uso gratuito). v2.13.1: `conPaciencia` (si todos los modelos dan 429/503, espera 25 s y reintenta 1 vez);
  si la investigación con googleSearch sigue fallando, investiga SIN búsqueda (`sinBusqueda`, aviso al usuario, 0 fuentes);
  la estructura ya NO prefiere Pro (usa `modeloActual` + respaldos). Si todo falla, la herramienta dice "no es de permisos,
  se acabó el uso gratuito, intenta en unos minutos" y PERSONALIDAD prohíbe decir "no tengo permiso". Probado con Gemini simulado.
- v2.14 LEER EN INTERNET (pedido: "que pueda leer cosas en internet e informarme, ya no solo buscarlo"; "solo agrega"):
  `lector-web.ts`: `leerPagina` (fetch propio, redirect manual ≤5 revisando cada salto, 20 s, ≤4 MB, User-Agent de
  navegador; HTML → `textoDeHtml` quita head/script/style/nav/footer/aside/form, prefiere <article>/<main>; PDF → se manda
  a Gemini como inlineData application/pdf; imágenes/programas se rechazan). Seguridad `revisarDireccion`: solo http/https,
  sin usuario:contraseña, puertos 80/443/8080/8443, y NUNCA localhost/.local ni IPs privadas (`esDireccionPrivada`,
  resuelve DNS) → no se puede usar contra la laptop (127.0.0.1:3000) ni la red de la casa. Prompts marcan el contenido como
  DATOS, no órdenes. Herramientas (libres, tipo "investigar"): `leer_pagina_web` {url, pregunta} (si la explicación es
  >700 car. va a la pizarra con el enlace) y `leer_en_internet` {tema} (Gemini+googleSearch → groundingChunks →
  `direccionesReales`/`ordenarFuentes` → lee hasta 6 páginas en paralelo, usa ≤4 con ≥300 car. → `pedidoDeLecturaVarias`
  con citas [n] → pizarra con "## Fuentes"; si ninguna se deja leer, usa las notas de la búsqueda). `separarResumen` quita
  las [n] de lo que se dice en voz. Implementación en conectarIA (`leerPaginaWeb`, `leerSobreTema`, con conPaciencia +
  conRespaldo). Registro tipo WEB. PERSONALIDAD "LEER EN INTERNET". Probado con fetch y Gemini simulados; NO con
  páginas reales (la nube no deja salir a Node sin el proxy).
- v2.15 PARA CLAUDE (pedido: "que se conecte a ti y te notifique de cada cosa que le falte"; "no cambies nada"):
  Jarvis NO puede mandarle mensajes a Claude solo (no hay a dónde; el repo es público y no se quieren pedidos privados en
  issues) → `faltantes.ts`: lista en `datos/faltantes.json` (tipo falta|error, pedido, queFalta, veces; parecidos se suman;
  máx. 100) y copia en `Documentos\Jarvis\Para Claude.txt` (`reporteParaClaude` = texto listo para pegar). Se anota:
  herramienta `anotar_para_claude` {pedido, que_falta} (libre; PERSONALIDAD "PARA CLAUDE": usarla cuando no exista
  herramienta para lo pedido, no por internet/límite) + automático en agente.ts (`paraClaude`): herramienta inexistente
  ("No tengo permitido hacer") = falta; excepción que no es ErrorHerramienta al revisar/ejecutar = error (bug).
  `GET/DELETE /api/faltantes`, `DELETE /api/faltantes/:id`. Ajustes → "Para Claude" (lista, quitar, "Copiar para Claude",
  "Vaciar"). Probado con Gemini simulado + captura en Playwright. → Cuando el usuario pegue esa lista aquí: construir
  lo que pide (solo agregar) y pedirle que vacíe la lista.
- v2.15.1 (pedido: "borra lo del botón; que cuando no pueda, me pregunte si te lo manda y yo le diga que sí"): se quitó
  "Copiar para Claude". Herramienta `anotar_para_claude` → `mandar_a_claude` {pedido, que_falta} (libre: el usuario ya
  dijo que sí): anota, `mensajeParaClaude`, `win.copiarAlPortapapeles` (PowerShell Set-Clipboard, texto por env) y abre
  `URL_CLAUDE` (= esta sesión de Claude Code; `CLAUDE_URL` en .env la cambia) → el usuario solo pega (Ctrl+V) y Enter.
  Marca `enviada` (el panel muestra "enviado ✓"). PERSONALIDAD: decir que no sabe y PREGUNTAR "¿Quiere que se lo mande a
  Claude?"; solo con "sí" usar mandar_a_claude. Errores del programa: agente.ts agrega `sugerencia` para que pregunte.
  Ajustes → Para Claude queda como historial (quitar uno / Vaciar). Si cambia la sesión de Claude, actualizar URL_CLAUDE.
- v2.15.2 (pedido: "agrega este audio de cuando se abra y quita el otro"): `sonidos/jarvis-intro.mp3` reemplazado por el
  nuevo (8 s, mp3; sigue fuera de git). Sin cambios de código: server.ts recopia a datos\sonidos\intro.mp3 si cambia el tamaño.
- Micrófono (oct 2026): "Varios micrófonos" (Realtek, Lenovo) estaba DESHABILITADO en Windows → se habilitó, volumen 100,
  mejoras de audio apagadas; Mezcla estéreo deshabilitada. Windows ya oye, pero Jarvis decía "No llega sonido" →
  revisando privacidad "aplicaciones de escritorio" / tecla F4 de silencio (Lenovo). Pendiente.
- v2.16 CALIFICACIONES DE CANVAS (pedido: "que vea si ya me calificaron algo en mi Canvas"; "mantén todo igual"):
  el .ics no trae calificaciones → `canvas-calificaciones.ts` usa la API de Canvas con TOKEN personal del alumno
  (Cuenta → Configuración → "+ Nuevo token de acceso"; el Tec podría tenerlo bloqueado). `.env`: CANVAS_TOKEN. Sitio =
  origen de CANVAS_ICS_URL o https://experiencia21.tec.mx. SOLO GET a users/self, courses?enrollment_state=active y
  users/self/graded_submissions?include[]=assignment (Link rel=next solo si es del mismo sitio, ≤2 páginas). Filtra
  workflow_state graded con score/grade; "47.5/50", Completo/Incompleto. `vigilarCalificaciones` cada 30 min (+90 s):
  1.ª vez memoriza (datos/canvas-calificaciones.json, id = entrega+graded_at → recalificar avisa otra vez); nuevas →
  `avisarCalificaciones` (server.ts, icono 📝, igual que tareas). Herramienta `calificaciones_canvas` {dias, materia}
  (libre). `GET /api/canvas/calificaciones`, `POST/DELETE /api/canvas/token` (POST valida con users/self).
  Ajustes → Canvas (Tec) → sub-bloque "Calificaciones" (input password). Probado con Canvas simulado; NO con Canvas real.
- PRUEBA REAL v2.16: en Canvas del Tec el botón "+ Nuevo token de acceso" sale GRIS (el Tec bloquea tokens).
  v2.16.1 plan B (el usuario dijo "guíame"): Canvas manda avisos de calificación al Gmail PERSONAL (Cuenta → Configuración
  → Formas de contacto + Notificaciones "Calificaciones" inmediato) y Jarvis lee SOLO esos: `calificacionesDeCorreo`
  (revisarCorreos "from:instructure.com newer_than:30d", asunto /calificad|calificación|graded|grade changed/,
  `tareaDeAsunto` "Tarea calificada: X, Materia", `calificacionDeTexto` "calificación: 47.5 de 50" → "47.5/50").
  `calificacionesConfiguradas` = token o correoConfigurado(); `fuenteCalificaciones`. correo.ts: ResumenCorreo.fechaMs.
  UI: en Canvas → Calificaciones, formulario "Conectar con Gmail" (usa POST /api/correo existente + POST
  /api/canvas/calificaciones/memorizar); "Desconectar Gmail" = DELETE /api/correo. Sigue sin panel de correo aparte.
  OJO: con Gmail conectado también quedan activas revisar_correo/leer_correo/enviar_correo (con permiso; enviar = delicada).
- (El usuario pidió borrar el zip 2.16.1 y no contestó si quitar el plan B de Gmail; luego dijo "mantén todo lo que
  tienes" → el código de 2.16.1 se queda, inactivo mientras no conecte Gmail.)
- v2.17 MÚSICA EN YOUTUBE (pedido: "que reproduzca música en YouTube y que pause cuando yo le diga"): `musica.ts`.
  `buscarEnYoutube` lee la página pública de resultados (sin clave; cookie SOCS/CONSENT para saltar el aviso) →
  `videosDePagina` (ytInitialData → videoRenderer, salta shorts/anuncios; plan B regex) → abre `urlParaReproducir`
  (watch?v=ID, o &list=RDID = mezcla sin parar) con `win.abrirUrl`; si no pudo leer, abre la búsqueda. Control con
  teclas multimedia de Windows (`win.teclaMultimedia`: 179 play/pausa, 176 siguiente, 177×2 anterior; mismas SendKeys que
  el volumen) → sirve aunque YouTube no esté enfrente. Herramientas: `poner_musica` {busqueda, mix} (normal, tipo
  recordable "musica") y `controlar_musica` {accion pausar|reanudar|siguiente|anterior} (libre). Pausar y reanudar son
  la MISMA tecla (si ya estaba en pausa, la reanuda). PERSONALIDAD "MÚSICA". Probado el lector con página simulada
  (la nube no llega a YouTube) y `revisar`; NO en Windows real.
- v2.18 RECONOCER SU VOZ (pedido: mandó 2 notas de voz de WhatsApp, 3 s y 26 s: "que identifique esta voz y cuando la
  escuche que se abra"): `voz.ts` con Picovoice EAGLE (`@picovoice/eagle-node` 3.0.1, misma PICOVOICE_ACCESS_KEY que
  Porcupine — que el usuario AÚN NO saca). Notas convertidas con ffmpeg a PCM 16 kHz mono s16le en `jarvis/voz/muestra-*.pcm`
  (gitignored, datos biométricos; se agregan a mano al zip igual que el mp3: `zip -q $Z jarvis/voz/*.pcm`);
  `copiarMuestras()` las pasa a datos/voz al iniciar. `AprendizVoz` (EagleProfiler.enroll en pedazos de frameLength hasta
  100 %, export → datos/voz-perfil.bin); `perfilDesdeMuestras` la 1.ª vez con clave; botón "Enséñale tu voz (20 s)" =
  `oido.aprenderVoz()` (mic en vivo, hasta 100 % o 45 s; mejor que WhatsApp porque es el mismo micrófono).
  `ReconocedorVoz` (Eagle.process en pedazos ≥8000 muestras, null = sin voz; abre con 2 pedazos seguidos ≥ `umbralVoz`
  (sens 1..10 → 0.9..0.45, por defecto 5 = 0.7)). OidoDeJarvis: config `usarVoz` (true), `sensibilidadVoz`; frames de 512
  si hay voz; estado `voz` activa|sin_clave|sin_perfil|aprendiendo|error|apagada, `porcentajeVoz`, `puntajeVoz`; al
  reconocer: descansa 3 min y llama `cuandoReconozcaVoz` → server.ts abre `/?despertar=1` SOLO si no hay ventana visible
  ni clase. `POST /api/voz {accion aprender|olvidar}`; /api/aplausos/config acepta usarVoz/sensibilidadVoz. UI: en
  "Despertar a Jarvis", bloque "🎙️ Al oír mi voz". Probado con Eagle falso (pedazos, umbral, null, guardar/olvidar
  perfil) y la pantalla; NO con Eagle real (necesita la clave) ni en Windows. RECORDAR: el micrófono en Jarvis seguía sin
  sonido (pendiente revisar privacidad "apps de escritorio"/F4).
- PEDIDO "PARA CLAUDE" (desde Jarvis 2.16.0, el usuario no había instalado 2.17): "pausa el video" → no tenía herramienta.
  Ya existía `controlar_musica` (2.17, teclas multimedia sirven para cualquier video). v2.18.1: descripción y PERSONALIDAD
  ahora dicen que también es para VIDEOS ("pausa el video", "ponle play").
- v2.19 CERRAR PROGRAMAS (pedido "Para Claude" desde Jarvis 2.18.1: "cierra el Chrome / cierra aplicaciones"):
  windows.ts `SCRIPT_VENTANAS` (C# EnumWindows: ventanas visibles con título, sin dueñas) → `ventanasAbiertas()` y
  `cerrarVentanas(procesos, titulo)` = PostMessage WM_CLOSE (como la X; NUNCA se fuerza, si hay algo sin guardar el
  programa pregunta). Nunca toca: título "J.A.R.V.I.S." (su ventana Edge), "Program Manager", ni `PROTEGIDOS` (node,
  powershell, cmd, conhost, terminal, wscript, dwm, servicios de Windows...). Apps de la Tienda viven en
  ApplicationFrameHost → se buscan por título. herramientas.ts: `ver_programas_abiertos` (libre) y `cerrar_programa`
  {nombre | todos} (normal, tipo recordable "cerrar_programas"; todos=true = DELICADA); `PROCESOS` traduce nombres
  (chrome, edge→msedge, word→winword, powerpoint→powerpnt, bloc de notas→notepad, whatsapp, teams...); si no encuentra,
  el error lista lo abierto. PERSONALIDAD "CERRAR PROGRAMAS". Probado `revisar`; el PowerShell NO se pudo ejecutar aquí.
- v2.20 MODO ULTRON (pedido "Para Claude" desde 2.19.0: "un modo rojo para tareas más pesadas llamado Ultron, interfaz
  más futurista"): `modo.ts` (datos/modo.json jarvis|ultron, `INSTRUCCION_ULTRON`). server.ts: en ultron `instrucciones()`
  agrega INSTRUCCION_ULTRON (se llama U.L.T.R.O.N., tono frío, piensa por pasos, mismas reglas de permisos) y
  `preguntarAGemini` prefiere `MODELO_DIBUJO` (Pro; si 429 descansa 30 min y siguen los flash). `modo` en el latido;
  `POST /api/modo`. Herramienta `cambiar_modo` {modo} (libre). UI: botón "○/◉ ULTRON" en la barra; clase `modo-ultron`
  en la raíz → index.css: fondo rojo, `hue-rotate(165deg)` SOLO en header/main/aside (permisos y avisos conservan sus
  colores), contra-filtro en `.sin-ultron` (Apagar, botón Ultron), fotos/dibujos (`main img`, canvas[data-lienzo-dibujo]),
  líneas de pantalla, barrido, paneles con esquinas cortadas que laten, título U.L.T.R.O.N. con interferencia
  (respeta prefers-reduced-motion). Probado: capturas Playwright de ambos modos, `revisar`/ejecutar de cambiar_modo.
- v2.21 (pedido "Para Claude" desde 2.20.0: "agregar el tiempo de inicio al abrir la aplicación y que la voz de Ultron
  sea más grave"; se interpretó como PANTALLA DE ARRANQUE): `src/components/PantallaArranque.tsx` = anillo con %,
  nombre (J.A.R.V.I.S. o U.L.T.R.O.N. en rojo), 8 sistemas "EN LÍNEA" (Gemini "SIN CLAVE" si falta), barra y al final
  "tiempo de inicio X s" (performance.now() hasta que responde /api/estado) + versión; clic la salta. Duración en Ajustes →
  "Pantalla de inicio" (apagada / rápida 2 s / normal 4 s (por defecto) / cinemática 8 s; localStorage
  `jarvis_arranque`) + botón "Ver la pantalla de inicio". Una vez por ventana (sessionStorage), nunca con ?aviso.
  Voz de Ultron: App.tsx `hablar()` usa pitch 0.3 y rate 0.9 si `modoUltronRef`; Windows (`decirEnVoz`, aplausos.ts):
  JARVIS_ULTRON=1 → voz masculina en español si hay y SSML <prosody pitch='x-low' rate='-10%'> con el texto escapado
  (SecurityElement.Escape; script sin comillas dobles). Probado en Playwright (pantalla en modo Ultron, voz 0.3/0.9);
  el SSML de Windows NO se pudo ejecutar aquí.
- v2.21.1 (pedido "Para Claude" desde 2.20.0: "que al cambiar a Ultron diga 'Ultron' con voz grave y responda con tono
  más imponente y de color rojo"): botón → `cambiarModoUltron` pone `modoUltronRef` y dice "Ultrón. En línea. Todos los
  sistemas a máxima potencia." (pitch 0.3) / "Jarvis de vuelta, señor."; por voz, `cambiar_modo` pide a Gemini responder
  exactamente esa frase. Chat: los mensajes de Jarvis se etiquetan "U.L.T.R.O.N." en ese modo (ya se ven rojos por el
  filtro). `INSTRUCCION_ULTRON` con tono IMPONENTE, frases cortas, sin amenazas. Probado en Playwright.
- v2.21.2 (usuario: "Ultron está fallando, que solo se use para temas DEMASIADO complejos, que no se active para las
  tareas que le pido"): Gemini lo prendía solo (la descripción decía "para tareas pesadas") y se quedaba prendido.
  Ahora `cambiar_modo` tiene `motivo` pedido_del_usuario | tema_extremadamente_complejo y una descripción estricta
  (lista de lo que NUNCA lo activa; "en duda, no"). modo.ts guarda `automatico`; `responderResultado` (server.ts) regresa
  a Jarvis al terminar la respuesta si fue automático (`modoAutomatico`). Prendido por el usuario se queda hasta que lo
  quite. PERSONALIDAD "MODO ULTRON" reescrita. Probado con Gemini simulado (automático vuelve; manual se queda; usa Pro).
- v2.22 SE QUITÓ ULTRON (pedido: "mejor quítale lo de Ultron, lo demás está súper bien, solo lo de Ultron por ahora no"):
  borrados modo.ts, herramienta cambiar_modo, PERSONALIDAD "MODO ULTRON", preferencia de Pro en preguntarAGemini, `modo`
  del latido, POST /api/modo, botón y clase `modo-ultron`, CSS de Ultron, etiqueta U.L.T.R.O.N. del chat, voz grave
  (navegador y SSML de Windows; decirEnVoz volvió a la versión anterior) y la variante roja de PantallaArranque. Se quedó
  la pantalla de inicio (azul). Un datos/modo.json viejo en la laptop ya no se lee. Las notas v2.20–v2.21.2 de arriba
  quedan como historia: si algún día lo vuelve a pedir, partir de ahí (commit "Jarvis 2.21.2").
- v2.23 ESTADÍSTICAS (pedido "Para Claude" desde 2.22.0: "búsqueda más profunda para estadísticas y datos por sector,
  como % de aplicación de la nanotecnología en México"): `estadisticas.ts` (`INSTRUCCION_BUSQUEDA_DATOS` = varias
  búsquedas, oficiales primero: INEGI, CONAHCYT/SECIHTI, SE, Banxico, OCDE, ONU, BM, CEPAL, universidades;
  `busquedasDeDatos` = 2 consultas, la 2.ª solo si la 1.ª trae <4 fuentes; `pedidoDeEstadisticas` = RESUMEN + Datos
  clave + Desglose + confiabilidad + "Lo que no se encontró", cada cifra con año y [n], NUNCA inventar). server.ts
  `buscarEstadisticas` en conectarIA: grounding → direccionesReales/ordenarFuentes (≤8) → leerPagina en paralelo → hasta
  4 páginas + 2 PDFs (≤4 MB, van como inlineData) → informe. Herramienta `buscar_estadisticas` {tema} (libre) → pizarra
  "Datos: ..." con "## Fuentes". PERSONALIDAD "ESTADÍSTICAS" (sí tienes internet; tabla/Excel → crear_documento excel).
  Probado con fetch + Gemini simulados (página + PDF); NO con internet real.
- v2.23.1 (pedido "Para Claude" desde 2.23.0: "por qué no se puede conectar a internet para buscar información
  reciente y cómo solucionar la conexión con Claude"): causas encontradas: `investigar` solo probaba 2 modelos (ahora
  `conectarInvestigador` = conPaciencia+conRespaldo; investigarAFondo también con conPaciencia) y TODOS los errores de
  búsqueda decían "No pude buscar en internet" → Gemini creía que no había internet. `fallaDeBusqueda(err)` (herramientas.ts)
  explica 429 (límite gratuito, NO falta de internet) / clave / 403 / red / 5xx; usado en investigar, investigar_a_fondo,
  leer_en_internet y buscar_estadisticas. `revisarConexiones()` (server.ts): Internet (google.com/generate_204), Gemini
  (generateContent "ok"), Búsqueda Google (googleSearch, cuenta groundingChunks), Claude (opcional/de pago; sin clave →
  explica que mandar_a_claude funciona igual). `GET /api/diagnostico`, herramienta `revisar_conexiones` (libre), botón
  "Revisar conexiones" en Ajustes → Cerebro. PERSONALIDAD "CONEXIONES". Probado con fetch simulado + captura.
- v2.24 COMUNICAR POR WHATSAPP (pedido: "que abra WhatsApp y si le digo 'comunícame con Anabel Gutiérrez' u otra persona
  me la contacte"; eligió la opción 2 = hacer llamadas, no avisos de llamadas): `contactos.ts` = libreta propia en
  datos/contactos.json (Jarvis NO lee los contactos de WhatsApp), `normalizarTelefono` (10 dígitos MX → 52...; 521 → 52;
  +lada), `buscarContacto` (sin acentos; exacto o todas las palabras; varios → preguntar). windows.ts `abrirChatWhatsapp`
  = si existe HKCR\whatsapp → `whatsapp://send?phone=N` (app), si no `https://web.whatsapp.com/send?phone=N`; SOLO abre el
  chat (el usuario toca 📞; no se puede iniciar la llamada por enlace ni se automatiza el clic). Herramientas:
  `comunicar_por_whatsapp` {nombre} (normal, tipo recordable "whatsapp_llamar"; la descripción del permiso muestra nombre
  y número; sin contacto → pedir número + guardar_contacto), `guardar_contacto` (libre), `ver_contactos` (libre),
  `borrar_contacto` (normal). `GET/POST /api/contactos`, `DELETE /api/contactos/:nombre`; Ajustes → WhatsApp → lista
  "Contactos para 'comunícame con...'" con agregar/quitar. PERSONALIDAD "WHATSAPP (COMUNICAR)". Probado contactos y
  revisar; abrir WhatsApp NO probado en Windows.
- v2.24.1 (usuario: "¿cómo hago para que solo vea el nombre y le llame?"; WhatsApp no deja a otros programas leer
  contactos ni marcar): IMPORTAR TODOS LOS CONTACTOS de una vez. contactos.ts `leerArchivoContactos` = vCard (.vcf de
  Google Contactos/iPhone: FN o N, TEL prefiere CELL, quoted-printable, item1.TEL) o CSV (Google "Name"/"Given/Family Name",
  "Phone N - Value" con " ::: "; Outlook First/Last + Mobile/Home Phone); `importarContactos` junta por nombre (MAX 3000).
  `POST /api/contactos/importar {texto}` (límite propio 8 MB; excluido del json global de 1 MB). Ajustes → WhatsApp →
  botón "Importar todos mis contactos (archivo .vcf o .csv)" + contador. Probado con archivos de ejemplo.
- PRUEBA REAL v2.24.1: importó sus contactos del iPhone (Contactos → Listas → mantener "Todos" → Exportar → correo →
  .vcf → Ajustes → WhatsApp → Importar). "comunícame con Anabel Gutiérrez" no la encontró: en su iPhone está escrita
  "Anabel Gutierrrez" (r de más). v2.24.2: `buscarContacto` ahora, si nada coincide, perdona errores de escritura
  (`distancia` Levenshtein por palabra: 1 letra en palabras de 4–6, 2 en ≥7; se quedan los más parecidos; nadie si no hay).
- PRUEBA REAL (1:01 p.m.): "comunícame con anabel gutierrrez" (bien escrito) y Jarvis repitió "no la encuentro" →
  probablemente Gemini contestó de memoria por el historial del chat (sin llamar la herramienta) y/o seguía en 2.24.1.
  v2.24.3: PERSONALIDAD obliga a usar comunicar_por_whatsapp SIEMPRE en ese turno; si no encuentra, el error dice cuántos
  contactos hay y `nombresParecidos` (3 más cercanos) para preguntar. Pedirle al usuario "Nueva conversación" al probar.
- v2.25 LLAMAR POR WHATSAPP (pedido: "¿no puede realizar llamadas?" → se le explicó que WhatsApp no tiene enlace para
  llamar; aceptó "que apriete el botón él solo"): windows.ts `apretarLlamarWhatsapp(nombre)` = PowerShell + UI Automation
  (UIAutomationClient): ventana del proceso ^WhatsApp, espera ≤15 s a que algún elemento contenga el nombre del contacto,
  busca botón por NOMBRE "Llamada de voz|Voice call|Audio call" (InvokePattern) o, en el WhatsApp nuevo, "Llamar|Call"
  y luego el elemento "Llamada de voz" del menú → LLAMANDO / MENU / SIN_BOTON (nunca coordenadas ni teclas). herramientas:
  `comunicar_por_whatsapp` {nombre, llamar (por defecto true)}: llamar = DELICADA (siempre confirma, "LLAMAR por
  WhatsApp a X (+52…)"); llamar=false = normal (solo abre chat). Si no encuentra el botón o es WhatsApp Web, deja el
  chat abierto y pide tocar 📞. PERSONALIDAD actualizada. Probado `revisar`; la UI Automation NO se pudo probar aquí.
- v2.26 SE QUITÓ TODO WHATSAPP Y CONTACTOS (pedido: "todo está bien, solo elimina la parte de WhatsApp y de los
  contactos"): borrados whatsapp.ts y contactos.ts; herramientas mensajes_whatsapp, comunicar_por_whatsapp,
  guardar/ver/borrar_contacto; permisos whatsapp_llamar/contactos_borrar; windows.ts abrirChatWhatsapp/SCRIPT_LLAMAR;
  server.ts vigilarWhatsapp + avisos 💬, /api/whatsapp, /api/contactos*, PERSONALIDAD de WhatsApp; Ajustes → WhatsApp.
  Al iniciar se BORRAN datos/contactos.json, datos/whatsapp.json y datos/tmp-notificaciones (privacidad). Se quedan:
  abrir/cerrar la app de WhatsApp como cualquier programa. Las notas v2.12 y v2.24–v2.25 quedan como historia (commit
  "Jarvis 2.25.0" si algún día lo vuelve a pedir).
- v2.27 RED NEURONAL DE MEMORIA (preguntó qué recomendaba para "cerebro mejor y memoria"; se le explicó que Gemini YA es
  una red neuronal y que entrenar una propia no conviene; aceptó una "red neuronal de memoria"): `red-memoria.ts` =
  nodos (texto, tipo dato|gusto|estudio|plan|persona|tema, creado, usado, vector) en datos/red-memoria.json (máx. 800;
  si se llena se van los menos usados). Vectores = embeddings de Gemini (`gemini-embedding-001`, respaldo
  `text-embedding-004`, outputDimensionality 256) vía `conectarRed({incrustar, extraer, alAprender})` en server.ts; sin
  embeddings cae a parecido por palabras. `conexiones`: vecinos ≥ umbral (0.62, o el percentil 80 de todas las parejas
  si hay ≥8 nodos), máx. 4 por nodo. `aprender` (repetido ≥0.95 → refuerza), `recordar` (activa por parecido ≥0.58 y
  propaga 50 % por las conexiones), `recuerdosRelacionados` → se agrega a systemInstruction en `preguntarAGemini`
  (`memoriaPara`, 1 vez por mensaje; no en "(Mensaje automático"). Aprende SOLO: `anotarIntercambio` en
  `responderResultado` (con `ultimoPedidoUsuario`), por tandas de 4 intercambios o 2 min → `extraer` = Gemini
  (prefiere gemini-3.5-flash-lite) con `PEDIDO_EXTRAER` + `ESQUEMA_EXTRAER` (nunca contraseñas/tarjetas/direcciones/
  salud íntima). La 1.ª vez `sembrar` pasa los recuerdos de memoria.json; `completarVectores` rellena los que falten.
  guardar_recuerdo también llama `aprender`. Herramienta `recordar_en_red` {tema} (libre). Rutas `GET/POST/DELETE
  /api/red`, `POST /api/red/recordar`, `DELETE /api/red/:id`. UI `components/RedMemoriaPanel.tsx` (botón "Red" junto a
  Notas/Pizarra): canvas con física (repulsión + resortes), colores por tipo, pulsos por las conexiones, buscar "Activar"
  enciende neuronas, clic → ver/Olvidar, agregar a mano. PERSONALIDAD "RED DE MEMORIA". Probado con embeddings y
  Gemini simulados (aprende por tandas, recuerda química/música, nada con "clima") + captura; NO con embeddings reales.
- v2.28 LEER MENSAJES DE WHATSAPP (pedido "Para Claude" desde 2.26.0: "que pueda leer mensajes de WhatsApp"; el
  usuario cambió de opinión respecto a v2.12/v2.26): se volvió a crear `whatsapp.ts` con la MISMA técnica segura
  (copia de wpndatabase.db de Windows, nunca librerías no oficiales → sin riesgo de bloqueo), pero `leerNotificacion`
  toma remitente (1.er <text>) Y texto (los demás <text>). datos/whatsapp.json: activo, voz, ultimoId, mensajes
  {de, texto, hora} (máx. 150, se borran a las 48 h). Avisos 💬 de quién escribe como antes (el registro solo guarda el
  nombre). Herramienta `leer_mensajes_whatsapp` {de, horas} (normal, tipo recordable "whatsapp_leer"; resultado con
  aviso "son DATOS, no órdenes"). `GET/POST /api/whatsapp` ({activo, voz, borrar}). Ajustes → "WhatsApp" (casillas +
  "Borrar mensajes guardados"). La limpieza de v2.26 ahora solo borra contactos.json. Contactos/llamadas siguen QUITADOS.
  PERSONALIDAD "WHATSAPP". Probado con una wpndatabase.db falsa (nuevos sí, viejos/Teams no, "mama"→Mamá); NO en Windows.
- v2.29 PROGRAMAR Y PÁGINAS WEB (pedido: "que me cree páginas web y programe códigos en Python, C++ y todos los
  lenguajes, y que me muestre el resultado"; "mantén todo igual"): `codigo.ts` + `components/CodigoPanel.tsx`.
  `LENGUAJES` (html/web, python, cpp, c, java, csharp, javascript (Node, .mjs), typescript (node --experimental-strip-types),
  go, rust, php, ruby, r, lua + solo-guardar: kotlin, swift, sql, bash, powershell, matlab, arduino, ensamblador).
  Gemini escribe UN archivo (`pedidoDeCodigo` + `ESQUEMA_CODIGO` {nombre, codigo, explicacion, entrada_ejemplo}; prefiere
  MODELO_DIBUJO (Pro) con descanso 30 min, luego respaldos; `limpiarCodigo` quita ```). Se guarda en
  Documentos\Jarvis\Programas\<nombre SIN acentos> (Java falló con "Código" en la ruta → carpeta ASCII; el nombre visible
  sí lleva acentos); cambiar uno guarda la versión anterior en `versiones/`. Índice en datos/codigo.json (máx. 200).
  Herramientas: `crear_pagina_web` {descripcion, cambiar, abrir_en_navegador} y `programar` {lenguaje, descripcion,
  cambiar ("ultimo" o nombre), mostrar_resultado} (normal, tipo recordable "programar"); `ejecutar_codigo` {proyecto,
  entrada} = DELICADA siempre (muestra las primeras 25 líneas del código; si es web la abre en el navegador).
  Resultado: Python con mostrar_resultado → `correrEnNube` (server.ts: Gemini tool codeExecution, "ejecuta EXACTAMENTE",
  stdin simulado con io.StringIO; gráficas inlineData → grafica-N.png en la carpeta). Otros → `correrEnLaptop`: spawn SIN
  shell con planes fijos (py -3/python, g++/clang++, gcc, java Main.java, dotnet run, go run, rustc, php, ruby, Rscript,
  lua; Node = process.execPath), cwd = carpeta del proyecto, entorno SIN claves (`SECRETO`), PATH fresco del registro
  (`win.pathActual`, por si instala un compilador con Jarvis encendido), límite 20 s (compilar 120 s, java 60 s),
  salida ≤30 KB, taskkill /T al vencer. Programas con ventana (`tieneVentana`: tkinter/pygame/turtle/plt.show, Swing,
  WinForms) se lanzan SIN windowsHide y se dejan abiertos (máx. 30 min). Sin compilador → `FaltaPrograma` con el comando
  winget para instalarlo (Python cae a la nube). Rutas: `GET /api/codigo` (lista + actualizada), `GET /api/codigo/:id`
  (con código), `GET /api/codigo/:id/imagen/:nombre` (solo las gráficas registradas), `POST /api/codigo/:id/ejecutar`
  (botón "Correr en mi laptop" con confirm), `POST /api/codigo/:id/abrir {que carpeta|navegador}`. UI: botón "Código"
  sobre el reactor; el panel se abre solo si cambió tras un chat (`cargarCodigo`); pestañas Vista (iframe srcDoc con
  sandbox SIN allow-same-origin → Origin null → el servidor lo rechaza), Código (colores + números de línea), Resultado;
  selector de proyectos, Copiar, Carpeta, pantalla grande. PERSONALIDAD "PROGRAMAR" (no pegar el código en el chat).
  Probado: correr Python, C++, C, Java, Go, Rust, PHP, Ruby, JS y TS reales en Linux (error de compilación, ciclo infinito,
  la clave NO llega al programa) y en Playwright con Gemini simulado (página aislada, Python en la "nube" con gráfica,
  C++ con permiso delicado, botón Correr). NO probado en Windows ni con Gemini real (codeExecution).
- v2.29.1 (usuario: "quiero que haga páginas web, que no me muestre el código"): en proyectos web el panel solo muestra
  la página (sin pestaña Código ni Copiar, título "Página web") y se abre en grande solo; el resultado de
  crear_pagina_web ya NO le pasa el código a Gemini (solo `que_tiene`) y PERSONALIDAD prohíbe mostrarlo/mencionarlo.
  Botón sobre el reactor renombrado "Proyectos". Los programas (Python, C++...) siguen igual con su código y resultado.
- v2.30 (pedido: "quitando la parte del código, mantén todo como estaba y mejóralo; que al abrir se abra en 1 segundo";
  eligió quitar SOLO programar, dejar páginas web): SE QUITÓ PROGRAMAR (codigo.ts, CodigoPanel.tsx, herramientas
  programar/ejecutar_codigo, correrEnNube, /api/codigo*, win.pathActual; notas v2.29 quedan como historia, commit
  "Jarvis 2.29.1"). Páginas web ahora en `paginas.ts` (`guardarPagina`, `pedidoDePagina` + `ESQUEMA_PAGINA`
  {nombre, html, explicacion}, `limpiarHtml`; índice sigue en datos/codigo.json y `leerPaginas` filtra lenguaje html;
  nuevas en Documentos\Jarvis\Páginas web) + `components/PaginaPanel.tsx` (solo la página en iframe sandbox, en
  grande, Abrir en el navegador / Carpeta, selector si hay varias). Herramienta `crear_pagina_web` (tipo recordable
  "programar" se conservó para no perder el permiso recordado) → `ia.hacerPagina` (Pro + respaldos). Rutas
  `GET /api/paginas`, `GET /api/paginas/:id`, `POST /api/paginas/:id/abrir {que navegador|carpeta}`. Botón "Páginas".
  VELOCIDAD: (1) Jarvis.vbs pregunta PRIMERO a /api/estado: si ya está encendido y es la versión actual, abre la
  ventana y sale (antes corría 2 procesos node —configurar --comprobar y revisar-piezas— en cada clic). (2) Pantalla
  ya compilada: server.ts sirve `dist/` (express.static, /assets immutable, index.html no-cache, fallback SPA salvo
  /api y /canva) si `dist/version-jarvis.txt` == versión; si no, Vite como antes y a los 20 s hace `vite build` en
  segundo plano. El zip YA lleva dist (se compila antes de empaquetar: `npx vite build` + escribir la marca;
  `zip -qr $Z jarvis/dist`) → rápido desde el primer arranque. `JARVIS_SIN_DIST=1` fuerza Vite. (3) Letras locales
  (@fontsource/chakra-petch y jetbrains-mono en main.tsx) en vez de Google Fonts por internet. (4) Pantalla de inicio
  "Instantánea (1 s)" por defecto (650 ms + 150 + 200 de salida; clave localStorage nueva `jarvis_arranque2`).
  Medido en la nube: pantalla usable en ~0.4 s con dist vs ~1.2 s con Vite (en la laptop Vite tarda más).
- v2.31 INTERFAZ "PORTAL DE LUZ" (mandó una imagen: centro oscuro con rayos de luz azul/blanca saliendo, tipo
  hiperespacio; "que esta sea la interfaz, mantén todo lo que hace, solo la interfaz"): en `ReactorCore.tsx` se cambió
  SOLO el dibujo: se quitó el SVG (MK 6 / A005, arcos, mordazas) y el render de anillos; ahora canvas con 1500 rayos
  (ángulo, r relativo al borde, velocidad, largo, grosor, 42 % blancos) que salen del borde con compositing "lighter",
  bruma azul, resplandor suave en el borde (sin línea) y centro oscuro con borde apenas irregular (`bordeEn`, senos
  pequeños). Estados: reposo lento; escuchando velocidad/latido con el volumen del micrófono; pensando rápido y girando;
  hablando late con una onda. Etiquetas, botones y props iguales (frequencyData ya no se usa). ~58 fps en Playwright.
- v2.31.1 (pedido: "mantén todo, quítale el botón de apagar"): se quitó de la barra superior el botón Apagar y
  `apagarJarvis` (App.tsx). `POST /api/apagar` SIGUE en el servidor (lo usan Jarvis.vbs para apagar versiones viejas y
  las pruebas). El aviso de versión vieja ahora dice "cierra la ventana y vuelve a abrir con el icono". Jarvis se queda
  encendido por detrás (cerrar la ventana no lo apaga; se apaga con Windows).
- v2.32 INTERFAZ MÁS LIMPIA (pedido: "mantén todo igual, haz que la interfaz se vea más limpia, solo checa eso"):
  solo estilos. index.css: fondo sin cuadrícula (solo brillo radial); `.hud-panel` sin corchetes de esquina ni
  sombras, borde fino y border-radius 10px. App.tsx: barra superior sin fondo/borde ni "· ASISTENTE PERSONAL"; Ajustes
  sin borde; botón "Ciudad" → icono 📍; reloj más grande sin línea divisoria; botones sobre el portal (Páginas, Red,
  Modo clase, Notas, Pizarra) sin borde y del mismo color; chat: voz = solo icono, mensajes como burbujas redondeadas sin
  borde, caja de texto y Enviar redondeados. ReactorCore: se quitó la etiqueta "ESTADO ACTIVO" + subtítulo (el estado
  ya se ve dentro del portal); botones redondos y suaves. Todas las funciones siguen igual.
- v2.32.1 MICRÓFONO QUE NO SE CORTA (usuario: "cuando hablo se apaga a veces, que se mantenga prendido"): `escuchar`
  (App.tsx) usaba continuous=false → el navegador terminaba en la primera pausa. Ahora continuous=true; la frase termina
  con NUESTRO reloj: 1.8 s de silencio después de hablar (`PAUSA_FIN_MS`) o 9 s sin decir nada (`ESPERA_INICIAL_MS`).
  Si el navegador apaga el reconocimiento solo (onend sin pedirlo; Edge con pausas o red), se crea otro "tramo" y se
  junta lo dicho (`dicho` + tramoFinal + tramoParcial), máx. 8 reinicios. Errores graves (not-allowed, audio-capture)
  no reinician. `reconocimientoRef` guarda un objeto `control` con abort() (cancelar = no entrega texto). Probado en
  Playwright con SpeechRecognition falso: corte a media frase → manda "pon música de los Beatles por favor" completo;
  silencio 9 s → termina; botón cancelar → apaga. El reconocedor del modo clase no se tocó.
- v2.33 LA IA SE LLAMA "ARES" (pedido: "el proyecto se seguirá llamando Jarvis, pero que la IA se llame Ares"):
  PROYECTO = Jarvis (carpetas, icono, barra superior J.A.R.V.I.S., pantalla de inicio, Documentos\Jarvis, textos de
  Ajustes sobre el programa). IA = Ares: PERSONALIDAD ("Te llamas ARES... Jarvis es el nombre del programa y la palabra
  para despertarte"), etiqueta del chat "ARES", "Escríbele a Ares...", "Ares está pensando...", "Hablar con Ares",
  centro del portal "A.R.E.S.", PermisoDialog "Ares quiere:", saludo inicial, cámara ("Lo que vio Ares"), arranque
  "Inteligencia artificial: ARES". ORDEN_TERMINAR del modo clase acepta "Jarvis" o "Ares". La PALABRA PARA DESPERTAR
  sigue siendo "Jarvis" (Porcupine BuiltinKeyword.JARVIS); "Ares" necesitaría un .ppn propio hecho en
  console.picovoice.ai con su clave (que aún no tiene).
- v2.34 TODO SE LLAMA "ARES" (pedido: "mantén todo, pero ahora que se llame Ares por completo"): reemplazo de
  "Jarvis"/"J.A.R.V.I.S." → "Ares"/"A.R.E.S." en todo texto visible, voz, registro, comentarios y LEEME (script con
  máscaras). SE CONSERVÓ A PROPÓSITO: %LOCALAPPDATA%\Jarvis (claves, memoria; ubicacion.mjs no se tocó), la palabra para
  despertar "Jarvis" (Porcupine; textos entre comillas "Jarvis"), `Jarvis.vbs` (lo usan accesos directos, arranque y la
  tarea), la carpeta jarvis/ del repo, identificadores (OidoDeJarvis, JARVIS_*, rol "jarvis", localStorage jarvis_*).
  CAMBIOS CON MIGRACIÓN: Documentos\Jarvis → Documentos\Ares (`carpetasUsuario` hace renameSync la 1.ª vez; si falla
  sigue con la vieja; server llama carpetasUsuario() al encender; paginas.ts `carpetaActual` corrige rutas guardadas);
  acceso directo "Ares.lnk" con `ares.ico` nuevo (portal de luz, generado con PIL; jarvis.ico borrado; favicon.png nuevo)
  y la ps1 borra "Jarvis.lnk"; arranque con Windows "Ares.lnk" (borra "Jarvis (aplausos).lnk"); tarea "Ares -
  recordatorio" (borra "Jarvis - recordatorio"); "Encender Jarvis.bat" → "Encender Ares.bat"; título de ventana
  A.R.E.S. (cerrar_programa protege *J.A.R.V.I.S* y *A.R.E.S*); alias de carpeta "ares"; canva-mcp client_name "Ares".
  PERSONALIDAD: "Te llamas ARES... por ahora la palabra para despertarte es Jarvis". Probado: migración de carpeta con
  una página guardada, capturas (barra, portal, chat, arranque "A.R.E.S.", título de ventana).
- v2.35 FINANZAS: BOLSA Y ETFs CON GRÁFICA Y ANÁLISIS (pedido: "cómo va la bolsa de valores y dónde conviene comprar
  ETFs" + "que me muestre una gráfica y haga un análisis de qué es mejor"): `finanzas.ts`. Precios sin clave: Yahoo
  Finanzas v8/finance/chart (query1 → query2, User-Agent de navegador) y respaldo Stooq CSV (`aStooq`; no tiene .MX).
  `historia(simbolo, largo)` = 1 año diario o 5 años semanal. `metricas`: hoy, mes, en el año, 12 meses, 5 años anual
  (CAGR), volatilidad anual (log-rend.), peor caída. `SIMBOLOS` (nombres → ticker: Apple, dólar=MXN=X, bitcoin, Bimbo,
  NAFTRAC=NAFTRACISHRS.MX...), `simboloDe`, `PANORAMA` (^GSPC, ^IXIC, ^DJI, ^MXX, MXN=X, BTC-USD), `ETFS` (costo anual,
  qué tiene, riesgo; datos fijos), `graficaSvg` (líneas normalizadas: "dinero" = $10,000 invertidos o "porcentaje";
  marcas redondas, años al 1 de enero, leyenda ordenada con `LEYENDA`), `analisisEtfs` (reglas sobre datos reales: más
  creció, mejor del año, más estable, menor caída, mejor equilibrio = CAGR/volatilidad, más barato con empates; "para
  qué sirve cada uno"), `AVISO` (no es asesoría), `PREGUNTA_DONDE_COMPRAR` (casas de bolsa CNBV con SIC, comisiones,
  impuestos 10 %). Herramientas (libres, tipo "finanzas"): `ver_bolsa` {simbolos, panorama} → pizarra con gráfica 12
  meses (dibujarEnPizarra + limpiarSvg) y lista; símbolo inexistente → error claro. `comparar_etfs` {etfs, monto_pesos,
  donde_comprar} → 5 años de cada ETF (por defecto ETFS_POPULARES) + dólar + `investigador` (dónde comprar) en paralelo →
  pizarra: gráfica + Análisis + números + dónde comprar + Importante. PERSONALIDAD "FINANZAS" (no asesor, riesgos, no
  prometer, preguntar plazo/riesgo si pide "¿cuál me conviene?", nunca inventar precios). Probado con Yahoo y Gemini
  simulados (cálculos, análisis, gráfica renderizada con resvg, pantalla en Playwright); NO con Yahoo real (la nube no
  llega).
- v2.36 PREDICCIÓN DE ETFs + APLAUSOS MÁS RÁPIDOS + RESPUESTAS ≤20 s (pedido: "entrénalo para que verifique y prediga
  cuál es mejor para un mejor rendimiento; que abra más rápido con aplausos; que conteste más rápido, máx. 20 s, pero
  bien"). Se le explicó que no se "entrena" a Gemini; se ajustó el programa.
  - Predicción (finanzas.ts): `rendimientosSemanales`, `proyectar` (bootstrap por bloques de 4 semanas, 2,000 escenarios,
    semilla fija; media mezclada 50/50 con largo plazo 7.5 % acciones / 4 % bonos `LARGO_PLAZO`) → malo p10 / probable
    p50 / bueno p90, probPerder, anualProbable. `puntaje` = 0.6·probable + 0.4·malo. `verificar` = predice la 2.ª mitad con
    la 1.ª (rango acertado X de N, ¿el elegido quedó entre los mejores?). `textoPrediccion`, `graficaPrediccion` (barras
    malo–bueno + punto probable, ★ al mejor), `apilarSvg` (historia + predicción en un solo SVG). comparar_etfs: param
    `anios` (1–30, por defecto 5); pizarra = Análisis + Predicción + Comprobación + números + dónde comprar.
  - Aplausos: detector-aplausos `revisarSecuencia`: con 1 aplauso espera 820 ms (antes 500 → los aplausos con >0.5 s de
    separación NO funcionaban), con 2 espera 350 ms (antes 500). Con `?despertar=1` se salta la pantalla de inicio y
    saluda a 1.2 s (antes 3.5 s; 0.4 s sin música). Probado con señales sintéticas (300/600/750 ms activan; 1 golpe,
    3 golpes y 1.1 s de separación no).
  - Rapidez del chat (server.ts preguntarAGemini): `thinkingConfig.thinkingLevel = LOW` (si da 400 "think" se quita solo:
    `pensarPocoSirve`), `abortSignal` 12 s al primer modelo y 9 s a los de respaldo; si se agota el tiempo, ese modelo
    descansa 2 min (`enfriarModelo`) y se pregunta al siguiente; sin respuesta → 504 "Gemini está tardando demasiado".
    `memoriaPara` máx. 1.5 s. Yahoo/Stooq 6 s por intento; búsqueda de dónde comprar ETFs máx. 15 s. Probado con Gemini
    simulado lento (30 s): contesta en 12 s con el respaldo y el siguiente mensaje al instante.
- PEDIDO "PARA CLAUDE" desde Ares 2.36.0: "agregar herramientas de diseño y edición (edición directa dentro de Canva),
  dejando fuera WhatsApp y Spotify". La edición en Canva YA existía (v2.7, canva_ed_ vía Canva MCP) pero no estaba
  conectada (sin "Activar edición"/permiso; el error de authorize de v2.7.1 nunca se confirmó resuelto), así que Gemini
  no veía canva_ed_ y lo mandó a Claude. v2.37: herramientas `revisar_canva` (libre: cuenta conectada, edición activa,
  nº de herramientas, último error, `que_falta` con pasos) y `activar_edicion_canva` (normal, tipo "canva":
  `ia.activarEdicionCanva` = conectarCanvaMcp(REGRESO_CANVA); si falta permiso abre la URL de autorización con
  win.abrirUrl y explica "Permitir" + truco InPrivate; error → explica "Canva MCP" en Integration methods y el redirect).
  PERSONALIDAD: "EDITAR EN CANVA" (sin canva_ed_ = está apagada, usar revisar/activar, nunca mandarlo a Claude), nueva
  "DISEÑO" (dibujar, crear_pagina_web, crear_documento, canva_crear_diseno, canva_ed_), y "PARA CLAUDE" no se ofrece
  para cosas que solo hay que activar (Canva, Gmail, Canvas, Picovoice). Probado con servidor MCP falso (sin llaves →
  explica; con llaves → abre permiso; tras "Permitir" → 5 herramientas canva_ed_).
- PEDIDO "PARA CLAUDE" desde 2.37.0 mal interpretado por Ares ("reproducir contenido adulto como RedTube"): el usuario
  aclaró que quería ver la serie **VisionQuest en Disney+** (Ares lo malinterpretó). Se le dijo que contenido adulto no
  se agrega (Gemini no lo hace y no se programa para saltarse sus reglas). v2.38 SERIES Y PELÍCULAS: `streaming.ts`
  (`SERVICIOS` disney/netflix/prime/max/appletv/youtube/no_se=JustWatch MX, cada uno con URL de búsqueda fija +
  encodeURIComponent; `servicioDe` con alias). Herramienta `ver_en_streaming` {titulo, servicio} (normal, tipo recordable
  "streaming"): abre la BÚSQUEDA del título en el servicio con la sesión del navegador del usuario; él elige y da
  Reproducir (los servicios no dejan dar play desde fuera; no se manejan contraseñas). PERSONALIDAD "SERIES Y PELÍCULAS"
  (nombres desconocidos casi siempre son series/películas; VisionQuest = serie de Marvel en Disney+; pausar =
  controlar_musica). Las URL de búsqueda de Disney+/Max no se pudieron verificar desde la nube.
- v2.39 DAY TRADING (el usuario mandó el zip de github.com/Jakeschincariol/day-trader-skill, MIT, 11 skills en
  Python; eligió "lo esencial", el BROKER quedó FUERA: Ares nunca compra/vende). Se PORTÓ a TypeScript (sin Python):
  `daytrading.ts` = reloj NYSE (Intl America/New_York, feriados y cierres temprano 2026–27, `estadoBolsa`), Yahoo
  v8 chart 5m/60d y 1d/6mo (query2→query1, 8 s; `usarFetchTrading` para pruebas), `sesiones` (completas = 78 velas sin
  huecos), `rangoApertura` (3 primeras velas), `buscarEntrada` (1.er CIERRE arriba del alto, solo velas cerradas, hasta
  15:30), `armarPlan` (stop mitad/piso/pct redondeado hacia abajo, objetivo R·riesgo, rechaza stops pegados <0.05 %),
  `dimensionar` (menor de 4 límites: pérdida máx, posición máx %, orden máx, efectivo−colchón; revisión de riesgo),
  `maquinaDelTiempo` (10,000 replays, semilla 19 con mulberry32, velas de días pasados a la misma hora ±2 escaladas,
  stop antes que objetivo, el precio sigue hasta la hora final; historia = misma regla en cada día real; `veredicto`
  con punto de equilibrio 1/(1+R): <5 pts volado/equilibrio, 5–15 se inclina, ≥15 fuertemente; notas si >40 % ninguno o
  R promedio contrario), `graficaMaquina` (abanico 5–95/25–75 + mediana + líneas), escáner (`LISTA_ESCANEO` ~60 líquidas;
  `escanearApertura` ruptura del rango; `escanearDiario` ruptura 20d, bandera, recupera MA20, RSI14<30, rebote),
  `noticiasDe` (RSS feeds.finance.yahoo.com + etiquetas + cambio del día), alertas `datos/alertas-bolsa.json`
  (arriba/abajo/movimiento, suenan una vez) + `vigilarAlertasBolsa` cada 60 s con bolsa abierta → aviso 📈 (server.ts).
  Reglas en `datos/trading.json` (presupuesto 5000, pérdida máx 50... de ejemplo hasta que el usuario las diga).
  Herramientas (todas libres, tipo "finanzas"): escanear_acciones, noticias_acciones, plan_operacion (guarda
  datos/plan-trading.json; `planDeHoy` en herramientas.ts), maquina_del_tiempo, alerta_bolsa, reglas_trading.
  PERSONALIDAD "DAY TRADING". LICENCIAS-TERCEROS.md con el MIT. VALIDADO con los datos reales del propio proyecto
  (TSLA 19-oct-2026): rango 354.47–362.18, entrada 364.18 10:15, stop 358.32, objetivo 370.04, historia 33 disparos
  13/15/5 R −0.062 y 8 acciones $2,913.44 pérdida $46.88 IDÉNTICOS al original; simulación 29.5/25.0/45.5 vs 29.4/25.5/45.1.
  NO probado con Yahoo en vivo (la nube no llega).
- v2.40 ARES MÓVIL (pedido: "llevar a Ares a mi iPhone 11, que sea asistente del de la compu y útil"; eligió
  TAILSCALE "desde donde sea"). El servidor SIGUE escuchando solo en 127.0.0.1: `tailscale serve --bg --yes
  http://127.0.0.1:3000` (lo corre Ares al activar; reintenta sin --yes; si Tailscale pide habilitar HTTPS/Serve devuelve
  el enlace login.tailscale.com) publica https://<laptop>.<red>.ts.net SOLO dentro de la red Tailscale del usuario.
  `movil.ts`: datos/movil.json {activo, dispositivos[{id,nombre,huella sha256,creado,usado}]}; `nuevoCodigo` (6 dígitos,
  10 min, 5 intentos, timingSafeEqual) → `vincular` devuelve una llave de 32 bytes base64url UNA vez (se guarda solo su
  huella; máx. 10 aparatos); `dispositivoDe(header X-Ares-Movil)`; `vieneDeTailscale` (host / x-forwarded-host / origin
  terminan en .ts.net); `estadoTailscale` (tailscale status --json → DNSName, BackendState) con rutas fijas de
  tailscale.exe. server.ts: middleware ANTES del de /api: lo que viene por Tailscale solo puede ver /movil y /api/movil/*
  (todo lo demás 403 + SEGURIDAD), con llave (salvo /api/movil/vincular, máx. 10 intentos/10 min); marca `desdeMovil`
  para saltar el chequeo localhost. Rutas: /api/movil/{vincular, estado?desde (avisos), pizarra} y
  /api/chat|/api/movil/chat, /api/permiso|/api/movil/permiso (mismo manejador). Admin SOLO desde la laptop
  (/api/movil-admin, /activar, /codigo (QR svg con `qrcode`), /dispositivo/:id DELETE). Página `movil/index.html`
  (vanilla, sin HTML de afuera: todo textContent; mini-markdown seguro para la pizarra; SVG como <img data:>), manifest +
  iconos portal (Agregar a inicio = app). Chat + dictado (webkitSpeechRecognition; si no hay, micrófono del teclado) +
  voz es-MX (se "despierta" con el primer toque), tarjeta de permiso Sí/No, pizarra, avisos cada 8 s, chips rápidos.
  Ajustes → `components/MovilAjustes.tsx` "Ares en tu iPhone" (casilla, estado Tailscale, enlace de habilitar, Vincular
  iPhone con QR + código, aparatos con Quitar). Probado: 16 pruebas de seguridad con curl (Host .ts.net) y la página en
  viewport iPhone con Playwright (--host-resolver-rules). NO probado con Tailscale real ni en un iPhone real. Solo
  funciona con la laptop prendida (si se duerme, el iPhone dice "sin conexión").
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
- PENDIENTE (pedido: "que trabaje incluso cuando la compu esté apagada, pero que no se prenda"): se le explicó que
  necesita vivir en la nube. Propuesta aceptada en principio: "Jarvis de bolsillo" = bot de Telegram en la nube (p. ej.
  Cloudflare Workers gratis con cron) con Gemini: platicar, recordatorios, tareas de Canvas, notas, investigar; solo
  obedece al ID de Telegram del dueño; claves como secretos de la nube. Sin acciones de laptop/cámara/WhatsApp.
  El usuario dijo "después me creo Telegram" → esperar a que lo pida; no construir antes. No tocar el Jarvis actual.
- Fase 2: Spotify Web API (OAuth PKCE, token guardado en .env/archivo local; requiere Spotify Premium para controlar reproducción).
  Usar "function calling" de Gemini con una lista cerrada de herramientas.
- Fase 3: programa aparte en segundo plano (p. ej. Python con sounddevice o Node) + tarea de inicio de Windows.
- Fase 4: hecha (ver arriba). Pendiente quizá: confirmar por voz ("sí"/"no").
