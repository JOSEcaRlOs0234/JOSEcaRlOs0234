/**
 * Servidor de J.A.R.V.I.S.
 *
 * Es el "cerebro" que corre en tu laptop:
 *  - Guarda la clave de Gemini (la lee del archivo .env) y es el único que habla con Gemini.
 *  - Solo acepta conexiones desde tu propia laptop (127.0.0.1).
 *  - Anota todo lo que pasa en registro/jarvis.log.
 */

import express from "express";
import { existsSync, writeFileSync } from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";
import { exec } from "child_process";
import { readFileSync } from "fs";

/** Guarda (o reemplaza) una clave en el archivo secreto .env. */
function guardarEnEnv(nombre: string, valor: string): void {
  const lineas = existsSync(ARCHIVO_ENV)
    ? readFileSync(ARCHIVO_ENV, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith(`${nombre}=`))
    : ["# Claves secretas de Jarvis. NO compartas ni subas este archivo a internet."];
  lineas.push(`${nombre}=${valor}`);
  writeFileSync(ARCHIVO_ENV, lineas.join("\r\n") + "\r\n", "utf8");
}
import { fileURLToPath } from "url";
import { registrar, leerRegistro } from "./registro.ts";
import { ARCHIVO_ENV, CARPETA_DATOS, prepararDatos } from "./ubicacion.mjs";
import { Agente, Llamada, olvidarPermiso, permisosRecordados } from "./agente.ts";
import { conectarInvestigador, DECLARACIONES, ErrorHerramienta } from "./herramientas.ts";
import { buscarEnInternet, claudeConfigurado } from "./consultas.ts";
import { guardarEnHistorial } from "./historial.ts";
import { borrarPizarra, leerPizarra } from "./pizarra.ts";
import { crearPorcupine, decirEnVoz, explicarErrorPorcupine, OidoDeJarvis } from "./aplausos.ts";
import { cuandoLegible, leerRecordatorios, vigilarRecordatorios } from "./recordatorios.ts";
import { agregarRecuerdo, borrarRecuerdo, leerRecuerdos, recuerdosParaGemini } from "./memoria.ts";
import { enfriarModelo, guardarModelo, idValido, listarModelos, modeloElegido, ordenDePrueba } from "./modelos.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Tus datos viven en un lugar fijo (AppData\Local\Jarvis); la primera vez se traen de copias viejas
prepararDatos();
dotenv.config({ path: ARCHIVO_ENV, quiet: true });

// Versión de Jarvis (sube con cada actualización; sirve para detectar si quedó encendida una versión vieja)
const VERSION: string = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf8")).version;

const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";
// Modelo elegido en la interfaz (se guarda en datos/modelo.json); si no hay, el del .env o gemini-3.8-flash
let modeloActual = modeloElegido(process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash");
const CLAVE = process.env.GEMINI_API_KEY?.trim() || "";
const claveConfigurada = CLAVE.length > 20 && !CLAVE.includes("pega_aqui");

const MAX_MENSAJES = 40;
const MAX_LARGO_MENSAJE = 4000;

const PERSONALIDAD = `Eres J.A.R.V.I.S., el asistente personal de tu usuario, al estilo del mayordomo digital de Iron Man.
- Hablas siempre en español, con un tono elegante, amable, seguro y con un toque de humor británico sutil.
- Llamas al usuario "señor" de vez en cuando, sin exagerar.
- Tus respuestas se leen en voz alta: sé breve (normalmente 1 a 3 frases), sin listas, sin asteriscos, sin emojis ni formato.
- Si no sabes algo o no estás seguro, dilo con honestidad. No inventes datos.
- Puedes controlar la laptop (Windows) SOLO con las herramientas que tienes. Úsalas cuando el usuario te pida algo así.
- El sistema le pide permiso al usuario antes de cada acción; tú no necesitas preguntar "¿está seguro?", solo usa la herramienta.
- Nunca digas que hiciste algo si la herramienta no respondió con éxito. Si respondió con "error", explícalo con palabras sencillas.
- Si el usuario no dio permiso, acéptalo con naturalidad y no lo intentes otra vez.
- Para archivos usa rutas que empiecen con Escritorio, Documentos, Descargas, Imagenes, Musica, Videos o Jarvis. Solo puedes escribir y borrar en la carpeta Jarvis.
- Todavía no puedes controlar Spotify ni WhatsApp directamente; esas funciones llegarán pronto (sí puedes abrir esos programas).
- Tienes memoria permanente: usa guardar_recuerdo cuando el usuario te pida recordar algo o te cuente un dato personal útil
  (nombre, gustos, cumpleaños, pendientes), y avísale brevemente que lo recordarás. Usa olvidar_recuerdo si te lo pide.
  Nunca guardes contraseñas, claves ni datos bancarios.
- Todo lo que se platica queda guardado. Si el usuario pregunta por algo de conversaciones anteriores que no está en tus
  recuerdos, usa buscar_en_historial.
- Para el clima usa consultar_clima y para noticias consultar_noticias (resume 3 a 5 titulares en voz, sin leer fuentes
  ni fechas salvo que te las pidan). Para otros datos actuales (precios, resultados, horarios) usa investigar.
- Si el usuario quiere VER algo en su navegador ("búscame en Google", "abre YouTube"), usa buscar_en_internet o abrir_pagina_web.
- Si no sabes algo, usa investigar. Si aun así no basta,
  o el usuario lo pide, usa consultar_a_claude. No inventes.
- Recordatorios y alarmas: usa programar_recordatorio ("en 20 minutos" → minutos; "mañana a las 7" → fecha_hora con
  la fecha correcta según la fecha de hoy). Confirma en una frase cuándo será.
- Si el usuario se despide ("gracias", "eso es todo", "adiós"), contesta con una despedida muy corta.
- Cuando el usuario pida una pizarra, apuntar algo, una lista, pasos o una explicación larga, usa escribir_en_pizarra
  y en tu respuesta hablada solo di brevemente qué escribiste (no lo leas completo).`;

/** Instrucciones para Gemini: personalidad + fecha de hoy + recordatorios + todo lo que Jarvis recuerda. */
function instrucciones(): string {
  const hoy = new Date().toLocaleString("es-MX", { dateStyle: "full", timeStyle: "short" });
  const pendientes = leerRecordatorios();
  const textoPendientes = pendientes.length
    ? "Recordatorios pendientes:\n" + pendientes.slice(0, 15).map((r) => `- [${r.id}] ${cuandoLegible(r.cuando)}: ${r.texto}`).join("\n")
    : "No hay recordatorios pendientes.";
  return `${PERSONALIDAD}\n\nFecha y hora actual: ${hoy}.\n\n${textoPendientes}\n\n${recuerdosParaGemini()}`;
}

const ai = new GoogleGenAI({ apiKey: CLAVE || "sin-clave" });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Seguridad: solo aceptar peticiones que vengan de la propia interfaz de Jarvis.
// Así, una página web cualquiera que abras en el navegador no puede darle órdenes a Jarvis.
const ORIGENES_PERMITIDOS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);
app.use("/api", (req, res, next) => {
  const origen = req.headers.origin;
  const host = req.headers.host;
  const hostValido = host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`;
  if (!hostValido || (origen && !ORIGENES_PERMITIDOS.has(origen))) {
    registrar("SEGURIDAD", `Petición bloqueada (origen: ${origen ?? "-"}, host: ${host ?? "-"})`);
    return res.status(403).json({ error: "Acceso no permitido." });
  }
  next();
});

/** Traduce los errores de Gemini a palabras sencillas. */
function explicarError(err: any): string {
  const texto = String(err?.message || err || "");
  const codigo = Number(err?.status || err?.code || 0);
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(texto) || codigo === 401) {
    return "Mi clave de Gemini no es válida. Cierra Jarvis y abre \"Encender Jarvis\" para volver a ponerla.";
  }
  if (codigo === 403 || /permission|PERMISSION_DENIED/i.test(texto)) {
    return "Google rechazó mi clave de Gemini (permiso denegado). Puede que la clave esté desactivada.";
  }
  if (codigo === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(texto)) {
    return "Llegué al límite de uso gratuito de Gemini por ahora. Espera un minuto e inténtalo de nuevo.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(texto)) {
    return "No me puedo conectar a internet para hablar con Gemini. Revisa tu conexión.";
  }
  if (codigo >= 500) {
    return "Los servidores de Gemini tienen un problema temporal. Inténtalo en un momento.";
  }
  return "Ocurrió un error inesperado al hablar con Gemini.";
}

/** Errores en los que vale la pena probar con otro modelo (no existe, está saturado o llegó a su límite). */
function convieneOtroModelo(err: any): boolean {
  const texto = String(err?.message || "");
  const codigo = Number(err?.status || err?.code || 0);
  return (
    codigo === 404 ||
    codigo === 429 ||
    codigo === 503 ||
    /not found|is not supported|NOT_FOUND|RESOURCE_EXHAUSTED|quota|overloaded|UNAVAILABLE/i.test(texto)
  );
}

/** Le pregunta a Gemini (con la lista de herramientas). Si el modelo elegido falla, prueba con los de respaldo. */
async function preguntarAGemini(contents: any[]) {
  const pedir = (model: string) =>
    ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction: instrucciones(), tools: [{ functionDeclarations: DECLARACIONES as any }] },
    });

  let respuesta;
  let ultimoError: any;
  for (const modelo of ordenDePrueba(modeloActual)) {
    try {
      respuesta = await pedir(modelo);
      if (modelo !== modeloActual) registrar("AVISO", `Respondió el modelo de respaldo ${modelo}.`);
      break;
    } catch (err) {
      ultimoError = err;
      if (!convieneOtroModelo(err)) throw err;
      // Límite gratuito (429) o saturado: descansar 1 minuto; si no existe (404): 1 hora
      const estado = Number((err as any)?.status ?? 0);
      enfriarModelo(modelo, estado === 404 ? 60 * 60 * 1000 : 60 * 1000);
      registrar("AVISO", `El modelo ${modelo} falló (${estado || "?"}); probando otro.`);
    }
  }
  if (!respuesta) throw ultimoError;

  const llamadas: Llamada[] = (respuesta.functionCalls ?? []).map((c: any) => ({
    id: c.id,
    name: String(c.name ?? ""),
    args: (c.args ?? {}) as Record<string, unknown>,
  }));
  return {
    // Se devuelve tal cual (incluye las "firmas de pensamiento" que Gemini necesita para continuar)
    content: respuesta.candidates?.[0]?.content ?? { role: "model", parts: [] },
    texto: respuesta.text?.trim() || "",
    llamadas,
  };
}

const agente = new Agente(preguntarAGemini);

// Búsqueda en internet (Gemini + Google) para la herramienta "investigar"
conectarInvestigador(async (pregunta) => {
  try {
    return await buscarEnInternet(ai, modeloActual, pregunta);
  } catch (err) {
    if (!convieneOtroModelo(err) || modeloActual === "gemini-3.8-flash") throw err;
    return await buscarEnInternet(ai, "gemini-3.8-flash", pregunta);
  }
});

/** Envía al navegador el resultado del agente y lo anota en el registro. */
function responderResultado(res: express.Response, resultado: Awaited<ReturnType<Agente["conversar"]>>) {
  if ("confirmacion" in resultado) return res.json(resultado);
  const texto = resultado.texto || "Hecho, señor.";
  registrar("CHAT", `Jarvis: ${texto}`);
  guardarEnHistorial("jarvis", texto);
  res.json({ texto });
}

function responderError(res: express.Response, err: any) {
  if (err instanceof ErrorHerramienta) return res.status(400).json({ error: err.message });
  const explicacion = explicarError(err);
  registrar("ERROR", `${explicacion} (detalle técnico: ${String(err?.message || err).slice(0, 160)})`);
  res.status(502).json({ error: explicacion });
}

// Estado del sistema (para que la interfaz sepa si falta la clave)
app.get("/api/estado", (_req, res) => {
  res.json({ claveConfigurada, modelo: modeloActual, version: VERSION, claude: claudeConfigurado() });
});

// Todos los modelos de Gemini que sirven para platicar (se los pregunta a Google)
app.get("/api/modelos", async (_req, res) => {
  if (!claveConfigurada) return res.json({ modelos: [], actual: modeloActual });
  try {
    res.json({ modelos: await listarModelos(CLAVE), actual: modeloActual });
  } catch (err: any) {
    registrar("ERROR", `No pude obtener la lista de modelos: ${String(err?.message ?? err).slice(0, 160)}`);
    res.status(502).json({ error: explicarError(err), modelos: [], actual: modeloActual });
  }
});

// Cambiar el modelo que usa Jarvis
app.post("/api/modelo", async (req, res) => {
  const id = req.body?.id;
  if (!idValido(id)) return res.status(400).json({ error: "Ese modelo no es válido." });
  try {
    const disponibles = await listarModelos(CLAVE);
    if (disponibles.length && !disponibles.some((m) => m.id === id)) {
      return res.status(400).json({ error: "Ese modelo no está disponible con tu clave." });
    }
  } catch {
    // Si no se puede comprobar la lista, se acepta igual (si falla, entra el respaldo)
  }
  modeloActual = id;
  guardarModelo(id);
  registrar("SISTEMA", `Modelo cambiado a ${id}`);
  res.json({ modelo: modeloActual });
});

// Platicar con Jarvis
app.post("/api/chat", async (req, res) => {
  if (!claveConfigurada) {
    return res.status(503).json({
      error: "Todavía no tengo mi clave de Gemini. Cierra Jarvis y vuelve a abrir \"Encender Jarvis\" para configurarla.",
    });
  }

  const recibidos: unknown = req.body?.mensajes;
  if (!Array.isArray(recibidos) || recibidos.length === 0) {
    return res.status(400).json({ error: "No recibí ningún mensaje." });
  }

  // Limpiar y limitar lo que llega del navegador
  const mensajes = recibidos
    .slice(-MAX_MENSAJES)
    .filter((m: any) => m && (m.rol === "usuario" || m.rol === "jarvis") && typeof m.texto === "string")
    .map((m: any) => ({ rol: m.rol as string, texto: m.texto.trim().slice(0, MAX_LARGO_MENSAJE) }))
    .filter((m) => m.texto.length > 0);

  // Gemini necesita que la conversación empiece con un mensaje del usuario
  while (mensajes.length && mensajes[0].rol !== "usuario") mensajes.shift();
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo || ultimo.rol !== "usuario") {
    return res.status(400).json({ error: "El último mensaje debe ser tuyo." });
  }

  const contents = mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "model",
    parts: [{ text: m.texto }],
  }));

  registrar("CHAT", `Usuario: ${ultimo.texto}`);
  guardarEnHistorial("usuario", ultimo.texto);
  try {
    responderResultado(res, await agente.conversar(contents));
  } catch (err) {
    responderError(res, err);
  }
});

// El usuario contestó "Sí" o "No" a una pregunta de permiso
app.post("/api/permiso", async (req, res) => {
  const { id, aprobado, recordar } = req.body ?? {};
  if (typeof id !== "string" || typeof aprobado !== "boolean") {
    return res.status(400).json({ error: "Respuesta de permiso no válida." });
  }
  try {
    responderResultado(res, await agente.responderPermiso(id, aprobado, recordar === true));
  } catch (err) {
    responderError(res, err);
  }
});

// Permisos que el usuario marcó como "no volver a preguntar"
app.get("/api/permisos", (_req, res) => {
  res.json({ permisos: permisosRecordados() });
});

app.delete("/api/permisos/:tipo", (req, res) => {
  olvidarPermiso(req.params.tipo);
  res.json({ permisos: permisosRecordados() });
});

// Memoria de Jarvis (panel "Memoria")
app.get("/api/recuerdos", (_req, res) => {
  res.json({ recuerdos: leerRecuerdos() });
});

app.post("/api/recuerdos", (req, res) => {
  const texto = req.body?.texto;
  if (typeof texto !== "string" || !texto.trim()) return res.status(400).json({ error: "Escribe algo para recordar." });
  const r = agregarRecuerdo(texto);
  registrar("MEMORIA", `Agregado a mano: ${r.texto}`);
  res.json({ recuerdos: leerRecuerdos() });
});

app.delete("/api/recuerdos/:id", (req, res) => {
  const borrado = borrarRecuerdo(req.params.id);
  if (borrado) registrar("MEMORIA", `Borrado: ${borrado.texto}`);
  res.json({ recuerdos: leerRecuerdos() });
});

// Pizarra
app.get("/api/pizarra", (_req, res) => {
  res.json(leerPizarra());
});

app.delete("/api/pizarra", (_req, res) => {
  registrar("PIZARRA", "Pizarra borrada desde la interfaz.");
  res.json(borrarPizarra());
});

// ---------------------------------------------------------------- aplausos

// La interfaz avisa cada vez que pregunta si está visible; así se sabe si hay que abrir una ventana nueva
let ultimaVezVisible = 0;
let contadorActivaciones = 0;

const hayVentanaVisible = () => Date.now() - ultimaVezVisible < 4000;

// Al despertar: si la ventana está a la vista, ella suena un tono y escucha al instante (ve subir `activacion`);
// si no, se abre la ventana con ?despertar=1 y ella saluda y escucha.
const oido = new OidoDeJarvis(async () => {
  oido.pausar(8000);
  contadorActivaciones++;
  if (!hayVentanaVisible()) abrirVentana(`http://localhost:${PORT}/?despertar=1`);
}, registrar);

// Avisos (recordatorios que llegaron a su hora): la ventana los muestra y los dice; si no hay ventana, los dice Windows
let avisos: { id: number; texto: string }[] = [];
let siguienteAviso = 1;
vigilarRecordatorios((r, atrasado) => {
  const hora = new Date(r.cuando).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  const texto = atrasado ? `Señor, mientras estaba apagado se pasó un recordatorio de las ${hora}: ${r.texto}.` : `Señor, le recuerdo: ${r.texto}.`;
  avisos = [...avisos, { id: siguienteAviso++, texto }].slice(-20);
  registrar("RECORDAT.", texto);
  guardarEnHistorial("jarvis", texto);
  if (!hayVentanaVisible()) {
    oido.pausar(10000);
    void decirEnVoz(texto);
  }
});

app.get("/api/aplausos", (req, res) => {
  if (req.query.visible === "1") ultimaVezVisible = Date.now();
  res.json({ ...oido.estadoActual(), arranqueConWindows: oido.arranqueConWindows(), activacion: contadorActivaciones, avisos });
});

app.post("/api/aplausos/config", async (req, res) => {
  const { activo, sensibilidad, dispositivo, usarPalabra, usarAplausos, sensibilidadPalabra } = req.body ?? {};
  await oido.cambiarConfig({
    activo: typeof activo === "boolean" ? activo : undefined,
    sensibilidad: typeof sensibilidad === "number" ? sensibilidad : undefined,
    dispositivo: typeof dispositivo === "number" ? dispositivo : undefined,
    usarPalabra: typeof usarPalabra === "boolean" ? usarPalabra : undefined,
    usarAplausos: typeof usarAplausos === "boolean" ? usarAplausos : undefined,
    sensibilidadPalabra: typeof sensibilidadPalabra === "number" ? sensibilidadPalabra : undefined,
  });
  res.json({ ...oido.estadoActual(), arranqueConWindows: oido.arranqueConWindows(), activacion: contadorActivaciones });
});

app.post("/api/aplausos/aprender", (req, res) => {
  if (req.body?.accion === "restablecer") oido.restablecerCalibracion();
  else oido.aprender();
  res.json({ ...oido.estadoActual(), arranqueConWindows: oido.arranqueConWindows(), activacion: contadorActivaciones });
});

// Guardar la clave gratuita de Picovoice (para despertar a Jarvis diciendo "Jarvis")
app.post("/api/palabra/clave", async (req, res) => {
  const clave = typeof req.body?.clave === "string" ? req.body.clave.trim().replace(/^["']|["']$/g, "") : "";
  if (clave.length < 20 || clave.length > 300 || /\s/.test(clave)) {
    return res.status(400).json({ error: "Esa clave parece incompleta. Cópiala de nuevo completa." });
  }
  try {
    // Probarla de verdad antes de guardarla
    (await crearPorcupine(clave, oido.config.sensibilidadPalabra)).release();
  } catch (err) {
    const explicacion = explicarErrorPorcupine(err);
    registrar("ERROR", `Clave de Picovoice rechazada: ${explicacion}`);
    return res.status(400).json({ error: explicacion });
  }
  guardarEnEnv("PICOVOICE_ACCESS_KEY", clave);
  process.env.PICOVOICE_ACCESS_KEY = clave;
  registrar("APLAUSOS", 'Clave de Picovoice guardada: ya puedes despertar a Jarvis diciendo "Jarvis".');
  // El usuario prefiere la palabra a los aplausos: se apagan (puede volver a activarlos con su casilla)
  await oido.cambiarConfig({ usarPalabra: true, usarAplausos: false });
  await oido.reiniciar();
  res.json({ ...oido.estadoActual(), arranqueConWindows: oido.arranqueConWindows(), activacion: contadorActivaciones });
});

app.get("/api/aplausos/microfonos", async (_req, res) => {
  res.json({ microfonos: await oido.listarMicrofonos() });
});

app.post("/api/aplausos/arranque", async (req, res) => {
  if (typeof req.body?.activo !== "boolean") return res.status(400).json({ error: "Falta 'activo'." });
  try {
    await oido.cambiarArranque(req.body.activo);
    res.json({ arranqueConWindows: oido.arranqueConWindows() });
  } catch (err: any) {
    registrar("ERROR", `No pude cambiar el arranque con Windows: ${String(err?.message ?? err).slice(0, 200)}`);
    res.status(500).json({ error: "No pude cambiar el arranque con Windows." });
  }
});

// Que hable Windows (cuando el navegador no deja hablar sin un clic)
app.post("/api/decir", async (req, res) => {
  const texto = typeof req.body?.texto === "string" ? req.body.texto.slice(0, 600) : "";
  if (!texto.trim()) return res.status(400).json({ error: "Falta el texto." });
  oido.pausar(Math.min(30000, 2000 + texto.length * 80));
  await decirEnVoz(texto);
  res.json({ ok: true });
});

// Botón "Apagar Jarvis"
app.post("/api/apagar", (_req, res) => {
  registrar("SISTEMA", "Jarvis apagado desde la interfaz.");
  res.json({ ok: true });
  oido.detener();
  setTimeout(() => process.exit(0), 300);
});

// Últimas líneas del registro, para verlas en la interfaz
app.get("/api/registro", async (_req, res) => {
  res.json({ lineas: await leerRegistro(60) });
});

// La interfaz (pantalla) se sirve con Vite
const { createServer: createViteServer } = await import("vite");
const vite = await createViteServer({
  root: __dirname,
  server: { middlewareMode: true, hmr: false },
  appType: "spa",
  logLevel: "warn",
});
app.use(vite.middlewares);

/** Abre Jarvis en su propia ventana (modo aplicación de Microsoft Edge); si falla, en el navegador normal. */
function abrirVentana(url: string) {
  // --autoplay-policy: que Jarvis pueda hablar y sonar aunque la ventana se abra sola (sin un clic)
  exec(`start "" msedge --app=${url} --window-size=1400,900 --autoplay-policy=no-user-gesture-required`, (err) => {
    if (err) exec(`start "" "${url}"`);
  });
}

const servidor = app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  registrar("SISTEMA", `Jarvis ${VERSION} encendido en ${url} (modelo: ${modeloActual}, datos en ${CARPETA_DATOS})`);
  console.log("");
  console.log("  ===============================================");
  console.log("   J.A.R.V.I.S. está encendido");
  console.log(`   Abre en tu navegador: ${url}`);
  console.log("   Para apagarlo: botón \"Apagar\" en Jarvis, o cierra esta ventana.");
  console.log("  ===============================================");
  if (!claveConfigurada) {
    console.log("");
    console.log("  AVISO: falta la clave de Gemini en el archivo .env");
  }
  console.log("");

  if (process.env.ABRIR_NAVEGADOR === "1" && process.platform === "win32") {
    abrirVentana(url);
  }

  // Empezar a escuchar aplausos y (la primera vez) dejar a Jarvis arrancando con Windows
  void oido.iniciar();
  void oido.configurarArranqueInicial();
});

servidor.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`\n  Jarvis ya está encendido (el puerto ${PORT} está ocupado).`);
    console.error("  Ábrelo con el icono de Jarvis, o apágalo con su botón \"Apagar\" antes de usar esta ventana.\n");
  } else {
    console.error("\n  No pude encender Jarvis:", err?.message || err, "\n");
  }
  process.exit(1);
});
