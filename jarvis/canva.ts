/**
 * Conexión con Canva (Canva Connect API).
 *
 * El usuario crea una "integración" gratis en canva.com/developers (para su uso personal no hace falta que Canva
 * la apruebe) y pega su Client ID y Client secret en Ajustes. Luego aprieta "Conectar con Canva", entra a su cuenta
 * y da permiso (OAuth con PKCE). Las llaves de acceso se guardan solo en la laptop (datos/canva.json).
 *
 * Lo que Jarvis puede hacer: crear diseños (presentación, documento, pizarra) con el dibujo de la pizarra adentro,
 * subir dibujos a "Subidos" de Canva, buscar tus diseños y abrirlos, y descargar un diseño como PDF o PNG.
 * La API de Canva no deja escribir textos dentro de un diseño (eso es solo para cuentas Enterprise).
 */

import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const API = "https://api.canva.com/rest/v1";
const AUTORIZAR = "https://www.canva.com/api/oauth/authorize";
export const PERMISOS_CANVA = [
  "profile:read",
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "asset:read",
  "asset:write",
];
const ARCHIVO = path.join(CARPETA_DATOS, "canva.json");

interface Guardado {
  accessToken: string;
  refreshToken: string;
  expira: number; // milisegundos
  nombre?: string;
}

function credenciales() {
  const id = process.env.CANVA_CLIENT_ID?.trim() ?? "";
  const secreto = process.env.CANVA_CLIENT_SECRET?.trim() ?? "";
  return id && secreto ? { id, secreto } : null;
}

export const canvaConfigurado = () => credenciales() !== null;

function leer(): Guardado | null {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return typeof g.refreshToken === "string" && g.refreshToken ? g : null;
  } catch {
    return null;
  }
}

function guardar(g: Guardado | null): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(g ?? {}, null, 2), "utf8");
}

export function estadoCanva(): { configurado: boolean; conectado: boolean; nombre: string } {
  const g = leer();
  return { configurado: canvaConfigurado(), conectado: canvaConfigurado() && !!g, nombre: g?.nombre ?? "" };
}

export function desconectarCanva(): void {
  guardar(null);
}

export class ErrorCanva extends Error {}

// ------------------------------------------------------------------ conexión (OAuth con PKCE)

const base64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Solo puede haber un intento de conexión a la vez; caduca en 10 minutos
let pendiente: { estado: string; verificador: string; redireccion: string; vence: number } | null = null;

/** Arma la dirección de Canva donde el usuario entra y da permiso. */
export function urlParaConectar(redireccion: string): string {
  const c = credenciales();
  if (!c) throw new ErrorCanva("Primero pega el Client ID y el Client secret de tu integración de Canva.");
  const verificador = base64url(randomBytes(64));
  const estado = base64url(randomBytes(24));
  pendiente = { estado, verificador, redireccion, vence: Date.now() + 10 * 60 * 1000 };
  const reto = base64url(createHash("sha256").update(verificador).digest());
  const q = new URLSearchParams({
    code_challenge: reto,
    code_challenge_method: "s256",
    scope: PERMISOS_CANVA.join(" "),
    response_type: "code",
    client_id: c.id,
    state: estado,
    redirect_uri: redireccion,
  });
  return `${AUTORIZAR}?${q}`;
}

async function pedirToken(datos: Record<string, string>): Promise<Guardado> {
  const c = credenciales();
  if (!c) throw new ErrorCanva("Falta configurar Canva.");
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secreto}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(datos),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    if (r.status === 401 || /invalid_client/i.test(JSON.stringify(j))) {
      throw new ErrorCanva("Canva no aceptó el Client ID o el Client secret. Revísalos en tu integración.");
    }
    throw new ErrorCanva(`Canva rechazó la conexión (${j.error_description || j.error || r.status}).`);
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expira: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
}

/** Termina la conexión cuando Canva regresa al usuario a Jarvis con el código. */
export async function terminarConexion(codigo: string, estado: string): Promise<string> {
  if (!pendiente || pendiente.estado !== estado || Date.now() > pendiente.vence) {
    throw new ErrorCanva("La conexión con Canva caducó o no la pidió Jarvis. Vuelve a apretar \"Conectar con Canva\".");
  }
  const { verificador, redireccion } = pendiente;
  pendiente = null;
  const g = await pedirToken({ grant_type: "authorization_code", code: codigo, code_verifier: verificador, redirect_uri: redireccion });
  guardar(g);
  try {
    const perfil: any = await llamar("GET", "/users/me/profile");
    g.nombre = String(perfil?.profile?.display_name ?? "");
    guardar(g);
  } catch {
    // El nombre es solo para mostrarlo
  }
  return g.nombre ?? "";
}

/** Llave de acceso vigente (la renueva sola; Canva da una nueva llave de renovación cada vez). */
async function llave(): Promise<string> {
  const g = leer();
  if (!canvaConfigurado() || !g) throw new ErrorCanva("SIN_CANVA");
  if (Date.now() < g.expira - 60_000) return g.accessToken;
  let nuevo: Guardado;
  try {
    nuevo = await pedirToken({ grant_type: "refresh_token", refresh_token: g.refreshToken });
  } catch (err) {
    // Si la renovación ya no sirve (la revocaron), hay que volver a conectar
    if (err instanceof ErrorCanva && /rechazó/.test(err.message)) guardar(null);
    throw err;
  }
  guardar({ ...nuevo, nombre: g.nombre });
  return nuevo.accessToken;
}

async function llamar(metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<any> {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await llave()}`,
      ...(cuerpo !== undefined && !(cuerpo instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    body: cuerpo === undefined ? undefined : cuerpo instanceof Uint8Array ? (cuerpo as unknown as BodyInit) : JSON.stringify(cuerpo),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new ErrorCanva("Canva pidió volver a conectar la cuenta (Ajustes → Canva).");
    if (r.status === 403) throw new ErrorCanva("Canva no dio permiso para esto. Revisa que la integración tenga todos los permisos (scopes).");
    if (r.status === 429) throw new ErrorCanva("Canva está recibiendo demasiadas peticiones; intenta en un minuto.");
    throw new ErrorCanva(`Canva respondió con un error (${j?.message || j?.code || r.status}).`);
  }
  return j;
}

/** Espera a que termine un trabajo de Canva (subidas y descargas tardan unos segundos). */
async function esperarTrabajo(ruta: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    const { job } = await llamar("GET", ruta);
    if (job?.status === "success") return job;
    if (job?.status === "failed") throw new ErrorCanva(`Canva no pudo terminar (${job?.error?.message || job?.error?.code || "error"}).`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new ErrorCanva("Canva tardó demasiado.");
}

// ------------------------------------------------------------------ acciones

/** Sube una imagen (PNG) a "Subidos" de Canva y devuelve su id. */
export async function subirImagen(nombre: string, png: Uint8Array): Promise<string> {
  const { job } = await llamar("POST", "/asset-uploads", png, {
    "Content-Type": "application/octet-stream",
    "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(nombre.slice(0, 50)).toString("base64") }),
  });
  const terminado = job?.status === "success" ? job : await esperarTrabajo(`/asset-uploads/${encodeURIComponent(job.id)}`);
  const id = terminado?.asset?.id;
  if (!id) throw new ErrorCanva("Canva no devolvió la imagen subida.");
  return id;
}

export const TIPOS_DISENO: Record<string, string> = {
  presentacion: "presentation",
  documento: "doc",
  pizarra: "whiteboard",
};

export interface Diseno {
  id: string;
  titulo: string;
  editar: string;
  actualizado?: string;
}

const aDiseno = (d: any): Diseno => ({
  id: String(d.id),
  titulo: String(d.title || "(sin título)"),
  editar: String(d.urls?.edit_url || ""),
  actualizado: d.updated_at ? new Date(Number(d.updated_at) * 1000).toLocaleDateString("es-MX") : undefined,
});

/** Crea un diseño nuevo (opcionalmente con una imagen adentro) y devuelve su dirección para editarlo. */
export async function crearDiseno(tipo: string, titulo: string, imagen?: string): Promise<Diseno> {
  const { design } = await llamar("POST", "/designs", {
    design_type: { type: "preset", name: TIPOS_DISENO[tipo] ?? "presentation" },
    title: titulo.slice(0, 255),
    ...(imagen ? { asset_id: imagen } : {}),
  });
  return aDiseno(design);
}

export async function buscarDisenos(texto?: string): Promise<Diseno[]> {
  const q = new URLSearchParams({ sort_by: "modified_descending" });
  if (texto?.trim()) q.set("query", texto.trim().slice(0, 100));
  const { items } = await llamar("GET", `/designs?${q}`);
  return (Array.isArray(items) ? items : []).slice(0, 15).map(aDiseno);
}

export async function obtenerDiseno(id: string): Promise<Diseno> {
  const { design } = await llamar("GET", `/designs/${encodeURIComponent(id)}`);
  return aDiseno(design);
}

/** Pide a Canva el diseño como PDF o PNG y devuelve las direcciones de descarga (duran unas horas). */
export async function exportarDiseno(id: string, formato: "pdf" | "png"): Promise<string[]> {
  const { job } = await llamar("POST", "/exports", { design_id: id, format: { type: formato } });
  const terminado = job?.status === "success" ? job : await esperarTrabajo(`/exports/${encodeURIComponent(job.id)}`);
  const urls = (terminado?.urls ?? []).filter((u: unknown) => typeof u === "string" && /^https:\/\//.test(u));
  if (!urls.length) throw new ErrorCanva("Canva no devolvió el archivo.");
  return urls;
}

/** Traduce los errores de Canva a palabras sencillas. */
export function explicarErrorCanva(err: unknown): string {
  if (err instanceof ErrorCanva) {
    return err.message === "SIN_CANVA"
      ? "Canva no está conectado. El usuario puede conectarlo en Ajustes → Canva."
      : err.message;
  }
  const texto = String((err as any)?.message ?? err);
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(texto)) return "No me pude conectar con Canva. Revisa el internet.";
  return "Ocurrió un problema con Canva.";
}
