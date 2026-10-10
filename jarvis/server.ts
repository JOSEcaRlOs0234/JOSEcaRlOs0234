/**
 * Servidor de J.A.R.V.I.S.
 *
 * Es el "cerebro" que corre en tu laptop:
 *  - Guarda la clave de Gemini (la lee del archivo .env) y es el único que habla con Gemini.
 *  - Solo acepta conexiones desde tu propia laptop (127.0.0.1).
 *  - Anota todo lo que pasa en registro/jarvis.log.
 */

import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { registrar, leerRegistro } from "./registro.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";
const MODELO = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
// Si el modelo principal deja de existir, Jarvis prueba con este
const MODELO_RESPALDO = "gemini-3.5-flash";
const CLAVE = process.env.GEMINI_API_KEY?.trim() || "";
const claveConfigurada = CLAVE.length > 20 && !CLAVE.includes("pega_aqui");

const MAX_MENSAJES = 40;
const MAX_LARGO_MENSAJE = 4000;

const PERSONALIDAD = `Eres J.A.R.V.I.S., el asistente personal de tu usuario, al estilo del mayordomo digital de Iron Man.
- Hablas siempre en español, con un tono elegante, amable, seguro y con un toque de humor británico sutil.
- Llamas al usuario "señor" de vez en cuando, sin exagerar.
- Tus respuestas se leen en voz alta: sé breve (normalmente 1 a 3 frases), sin listas, sin asteriscos, sin emojis ni formato.
- Si no sabes algo o no estás seguro, dilo con honestidad. No inventes datos.
- Por ahora solo puedes conversar. Si te piden controlar Spotify, la computadora o WhatsApp, explica con amabilidad que esa función llegará pronto.`;

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
    return "Mi clave de Gemini no es válida. Revisa que la copiaste completa en el archivo .env.";
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

function esModeloInexistente(err: any): boolean {
  const texto = String(err?.message || "");
  return Number(err?.status) === 404 || /not found|is not supported|NOT_FOUND/i.test(texto);
}

async function preguntarAGemini(contents: any[]): Promise<string> {
  const pedir = (model: string) =>
    ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction: PERSONALIDAD },
    });

  try {
    const respuesta = await pedir(MODELO);
    return respuesta.text?.trim() || "";
  } catch (err) {
    if (!esModeloInexistente(err) || MODELO === MODELO_RESPALDO) throw err;
    registrar("AVISO", `El modelo ${MODELO} no está disponible; usando ${MODELO_RESPALDO}.`);
    const respuesta = await pedir(MODELO_RESPALDO);
    return respuesta.text?.trim() || "";
  }
}

// Estado del sistema (para que la interfaz sepa si falta la clave)
app.get("/api/estado", (_req, res) => {
  res.json({ claveConfigurada, modelo: MODELO });
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
  try {
    const texto = (await preguntarAGemini(contents)) || "Disculpe, señor, no tengo una respuesta para eso.";
    registrar("CHAT", `Jarvis: ${texto}`);
    res.json({ texto });
  } catch (err: any) {
    const explicacion = explicarError(err);
    registrar("ERROR", `${explicacion} (detalle técnico: ${String(err?.message || err).slice(0, 160)})`);
    res.status(502).json({ error: explicacion });
  }
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

const servidor = app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  registrar("SISTEMA", `Jarvis encendido en ${url} (modelo: ${MODELO})`);
  console.log("");
  console.log("  ===============================================");
  console.log("   J.A.R.V.I.S. está encendido");
  console.log(`   Abre en tu navegador: ${url}`);
  console.log("   Para apagarlo, cierra esta ventana negra.");
  console.log("  ===============================================");
  if (!claveConfigurada) {
    console.log("");
    console.log("  AVISO: falta la clave de Gemini en el archivo .env");
  }
  console.log("");

  if (process.env.ABRIR_NAVEGADOR === "1" && process.platform === "win32") {
    exec(`start "" "${url}"`);
  }
});

servidor.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`\n  Jarvis ya está encendido en otra ventana (el puerto ${PORT} está ocupado).`);
    console.error(`  Abre http://localhost:${PORT} en tu navegador o cierra la otra ventana.\n`);
  } else {
    console.error("\n  No pude encender Jarvis:", err?.message || err, "\n");
  }
  process.exit(1);
});
