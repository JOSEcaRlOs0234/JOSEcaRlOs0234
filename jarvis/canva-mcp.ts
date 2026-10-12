/**
 * Edición DENTRO de Canva, con el servidor oficial "Canva MCP" (mcp.canva.com/mcp).
 *
 * La API normal de Canva (canva.ts) no deja escribir dentro de un diseño; Canva MCP sí: buscar diseños, leer su
 * contenido, cambiar textos e imágenes (con "transacciones de edición": empezar → cambiar → guardar) y generar diseños.
 * Usa la MISMA app de Canva Developers (mismo Client ID y Client secret), con "Canva MCP" encendido, y la misma
 * dirección de regreso. Las herramientas se leen del servidor y se le ofrecen a Gemini tal cual (con nombre "canva_ed_...").
 */

import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const URL_MCP = new URL(process.env.CANVA_MCP_URL || "https://mcp.canva.com/mcp");
const ARCHIVO = path.join(CARPETA_DATOS, "canva-mcp.json");
export const PREFIJO = "canva_ed_";

interface Guardado {
  tokens?: OAuthTokens;
}

function leer(): Guardado {
  try {
    return JSON.parse(readFileSync(ARCHIVO, "utf8")) ?? {};
  } catch {
    return {};
  }
}

function guardar(g: Guardado): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(g, null, 2), "utf8");
}

/** Le dice al SDK de MCP quién es Jarvis (las llaves de la app de Canva) y dónde guardar el permiso. */
class Proveedor implements OAuthClientProvider {
  urlParaAutorizar: URL | null = null;
  estado = "";
  private verificador = "";

  constructor(private redireccion: string) {}

  get redirectUrl() {
    return this.redireccion;
  }

  get clientMetadata() {
    return {
      client_name: "Jarvis",
      redirect_uris: [this.redireccion],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    };
  }

  state() {
    this.estado = randomBytes(24).toString("base64url");
    return this.estado;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const id = process.env.CANVA_CLIENT_ID?.trim();
    const secreto = process.env.CANVA_CLIENT_SECRET?.trim();
    return id && secreto ? { client_id: id, client_secret: secreto } : undefined;
  }

  tokens() {
    return leer().tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    guardar({ ...leer(), tokens });
  }

  // No abre nada por su cuenta: la dirección se le da a la interfaz para que la abra el usuario
  redirectToAuthorization(url: URL) {
    this.urlParaAutorizar = url;
  }

  saveCodeVerifier(v: string) {
    this.verificador = v;
  }

  codeVerifier() {
    return this.verificador;
  }
}

interface Herramienta {
  nombre: string; // nombre en Canva MCP (por ejemplo "start-editing-transaction")
  descripcion: string;
  esquema: Record<string, unknown>;
  soloLectura: boolean;
  destructiva: boolean;
}

let cliente: Client | null = null;
let herramientas: Herramienta[] = [];
let proveedor: Proveedor | null = null;
let transportePendiente: StreamableHTTPClientTransport | null = null;
let pendienteVence = 0;
let ultimoError = "";

export function estadoCanvaMcp() {
  return { conectado: !!cliente, herramientas: herramientas.length, error: ultimoError };
}

/** Nombre que ve Gemini (solo letras, números y _). */
export const nombreParaGemini = (nombre: string) => (PREFIJO + nombre.replace(/[^a-zA-Z0-9_]/g, "_")).slice(0, 64);

async function cargarHerramientas(c: Client): Promise<void> {
  const lista: Herramienta[] = [];
  let cursor: string | undefined;
  do {
    const r = await c.listTools(cursor ? { cursor } : undefined);
    for (const t of r.tools) {
      const { $schema, ...esquema } = (t.inputSchema ?? { type: "object" }) as Record<string, unknown>;
      lista.push({
        nombre: t.name,
        descripcion: String(t.description ?? t.name).slice(0, 1500),
        esquema,
        soloLectura: t.annotations?.readOnlyHint === true,
        destructiva: t.annotations?.destructiveHint === true,
      });
    }
    cursor = r.nextCursor;
  } while (cursor && lista.length < 200);
  herramientas = lista;
}

function nuevoTransporte(redireccion: string) {
  proveedor = new Proveedor(redireccion);
  return new StreamableHTTPClientTransport(URL_MCP, { authProvider: proveedor });
}

/**
 * Se conecta a Canva MCP. Si ya hay permiso guardado, queda listo y devuelve {conectado:true}.
 * Si falta el permiso, devuelve la dirección de Canva donde el usuario debe apretar "Permitir".
 */
export async function conectarCanvaMcp(redireccion: string): Promise<{ conectado: true } | { url: string }> {
  if (!process.env.CANVA_CLIENT_ID || !process.env.CANVA_CLIENT_SECRET) {
    throw new Error("Primero guarda las llaves de tu app de Canva (Ajustes → Canva).");
  }
  const transporte = nuevoTransporte(redireccion);
  const c = new Client({ name: "jarvis", version: "1.0.0" });
  try {
    await c.connect(transporte);
    await cargarHerramientas(c);
    cliente = c;
    ultimoError = "";
    return { conectado: true };
  } catch (err) {
    if (err instanceof UnauthorizedError && proveedor?.urlParaAutorizar) {
      transportePendiente = transporte;
      pendienteVence = Date.now() + 10 * 60 * 1000;
      return { url: proveedor.urlParaAutorizar.toString() };
    }
    ultimoError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** ¿Este regreso de Canva (state) es de la conexión de edición? */
export const esRegresoDeMcp = (estado: string) => !!proveedor && !!transportePendiente && proveedor.estado === estado;

/** Termina el permiso cuando Canva regresa con el código, y se conecta. */
export async function terminarCanvaMcp(codigo: string, redireccion: string): Promise<void> {
  if (!transportePendiente || Date.now() > pendienteVence) throw new Error("La conexión caducó; vuelve a intentarlo.");
  const t = transportePendiente;
  transportePendiente = null;
  await t.finishAuth(codigo);
  const r = await conectarCanvaMcp(redireccion);
  if (!("conectado" in r)) throw new Error("Canva no guardó el permiso; vuelve a intentarlo.");
}

/** Al encender Jarvis: si ya había permiso, se reconecta solo (sin abrir nada). */
export async function reconectarCanvaMcp(redireccion: string): Promise<void> {
  if (!leer().tokens) return;
  try {
    await conectarCanvaMcp(redireccion);
  } catch {
    // Se queda desconectado; el usuario puede reconectar en Ajustes
  }
}

export function desconectarCanvaMcp(): void {
  void cliente?.close().catch(() => {});
  cliente = null;
  herramientas = [];
  guardar({});
}

/** Declaraciones para Gemini (se agregan a la lista permitida de Jarvis). */
export function declaracionesCanvaMcp() {
  return herramientas.map((h) => ({
    name: nombreParaGemini(h.nombre),
    description: `[Canva, edición] ${h.descripcion}`,
    parametersJsonSchema: h.esquema,
  }));
}

export function buscarHerramienta(nombreGemini: string): Herramienta | undefined {
  return herramientas.find((h) => nombreParaGemini(h.nombre) === nombreGemini);
}

/** Llama una herramienta de Canva MCP y devuelve su respuesta como texto. */
export async function llamarCanvaMcp(h: Herramienta, args: Record<string, unknown>): Promise<string> {
  if (!cliente) throw new Error("La edición de Canva no está conectada (Ajustes → Canva).");
  const r: any = await cliente.callTool({ name: h.nombre, arguments: args });
  const texto = (Array.isArray(r?.content) ? r.content : [])
    .map((p: any) => (p?.type === "text" ? p.text : p?.type === "resource" ? p.resource?.text ?? "" : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 30_000);
  if (r?.isError) throw new Error(texto || "Canva respondió con un error.");
  return texto || (r?.structuredContent ? JSON.stringify(r.structuredContent).slice(0, 30_000) : "Hecho.");
}
