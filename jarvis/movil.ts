/**
 * ARES MÓVIL: usar a Ares desde el iPhone, como "control" del Ares de la laptop.
 *
 * Seguridad (tres candados):
 *  1. Ares sigue escuchando SOLO en 127.0.0.1. El iPhone llega por TAILSCALE: una red privada entre los aparatos del
 *     usuario. "tailscale serve" (en la laptop) pasa https://<laptop>.<red>.ts.net → http://127.0.0.1:3000.
 *     Nadie fuera de la red Tailscale del usuario puede llegar.
 *  2. Lo que llega por Tailscale solo puede ver la página /movil y las rutas /api/movil/... (nada más de Ares).
 *  3. Cada iPhone se VINCULA una vez con un código de 6 números que solo aparece en la pantalla de la laptop (vale
 *     10 minutos, 5 intentos). Recibe una llave larga y secreta; Ares guarda solo su huella (SHA-256).
 */

import { execFile } from "child_process";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export interface Dispositivo {
  id: string;
  nombre: string;
  huella: string; // sha256 de la llave
  creado: number;
  usado: number;
}
interface Guardado {
  activo: boolean;
  dispositivos: Dispositivo[];
}

const ARCHIVO = path.join(CARPETA_DATOS, "movil.json");

function leer(): Guardado {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return { activo: g.activo === true, dispositivos: Array.isArray(g.dispositivos) ? g.dispositivos : [] };
  } catch {
    return { activo: false, dispositivos: [] };
  }
}
function guardar(g: Guardado): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(g, null, 2), "utf8");
}

export const movilActivo = () => leer().activo;
export function cambiarActivo(activo: boolean): void {
  guardar({ ...leer(), activo });
}
export const dispositivos = () => leer().dispositivos.map(({ huella, ...d }) => d);
export function quitarDispositivo(id: string): boolean {
  const g = leer();
  const quedan = g.dispositivos.filter((d) => d.id !== id);
  guardar({ ...g, dispositivos: quedan });
  return quedan.length !== g.dispositivos.length;
}

// ------------------------------------------------------------------ vinculación

let codigo: { valor: string; vence: number; intentos: number } | null = null;

/** Código de 6 números para vincular un iPhone (vale 10 minutos). */
export function nuevoCodigo(): { codigo: string; vence: number } {
  codigo = { valor: String(randomInt(0, 1_000_000)).padStart(6, "0"), vence: Date.now() + 10 * 60_000, intentos: 0 };
  return { codigo: codigo.valor, vence: codigo.vence };
}

const huellaDe = (llave: string) => createHash("sha256").update(llave).digest("hex");

/** Cambia el código por una llave secreta (se devuelve UNA vez; Ares solo guarda su huella). */
export function vincular(valor: string, nombre: string): { llave: string; id: string } {
  if (!codigo || Date.now() > codigo.vence) throw new Error("El código ya caducó. Genera otro en la laptop (Ajustes → Ares en tu iPhone).");
  codigo.intentos++;
  if (codigo.intentos > 5) {
    codigo = null;
    throw new Error("Demasiados intentos. Genera un código nuevo en la laptop.");
  }
  const a = Buffer.from(String(valor).trim());
  const b = Buffer.from(codigo.valor);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Ese código no es correcto.");
  codigo = null;
  const llave = randomBytes(32).toString("base64url");
  const id = randomBytes(6).toString("hex");
  const g = leer();
  g.dispositivos.push({
    id,
    nombre: String(nombre || "iPhone").replace(/[<>]/g, "").slice(0, 40),
    huella: huellaDe(llave),
    creado: Date.now(),
    usado: Date.now(),
  });
  guardar({ ...g, dispositivos: g.dispositivos.slice(-10) });
  return { llave, id };
}

/** ¿La llave que manda el iPhone es de un aparato vinculado? */
export function dispositivoDe(llave: unknown): Dispositivo | null {
  if (typeof llave !== "string" || llave.length < 20) return null;
  const h = huellaDe(llave);
  const g = leer();
  const d = g.dispositivos.find((x) => x.huella === h) ?? null;
  if (d && Date.now() - d.usado > 60_000) {
    d.usado = Date.now();
    guardar(g);
  }
  return d;
}

/** ¿La petición viene por Tailscale (https://<algo>.ts.net)? */
export function vieneDeTailscale(headers: Record<string, string | string[] | undefined>): boolean {
  const valores = [headers.host, headers["x-forwarded-host"], headers.origin].flat().filter((x): x is string => typeof x === "string");
  return valores.some((v) => {
    const host = v.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
    return host.endsWith(".ts.net");
  });
}

// ------------------------------------------------------------------ Tailscale en la laptop (comandos fijos)

const RUTAS_TAILSCALE = [
  "C:\\Program Files\\Tailscale\\tailscale.exe",
  "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
  "tailscale",
];

function correrTailscale(args: string[], limiteMs = 15_000): Promise<{ codigo: number | null; salida: string }> {
  return new Promise((listo) => {
    const intentar = (i: number) => {
      if (i >= RUTAS_TAILSCALE.length) return listo({ codigo: null, salida: "NO_INSTALADO" });
      const ruta = RUTAS_TAILSCALE[i];
      if (ruta.includes("\\") && !existsSync(ruta)) return intentar(i + 1);
      // Programa fijo con argumentos fijos (nunca texto libre del usuario)
      const hijo = execFile(ruta, args, { windowsHide: true, timeout: limiteMs }, (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return intentar(i + 1);
        listo({ codigo: err ? (typeof err.code === "number" ? err.code : 1) : 0, salida: `${stdout ?? ""}${stderr ?? ""}` });
      });
      hijo.on("error", () => {});
    };
    intentar(0);
  });
}

export interface EstadoTailscale {
  instalado: boolean;
  conectado: boolean;
  direccion: string | null; // https://laptop.red.ts.net
  detalle: string;
}

export async function estadoTailscale(): Promise<EstadoTailscale> {
  const r = await correrTailscale(["status", "--json"]);
  if (r.salida === "NO_INSTALADO") return { instalado: false, conectado: false, direccion: null, detalle: "Tailscale no está instalado en la laptop." };
  try {
    const s = JSON.parse(r.salida.slice(r.salida.indexOf("{")));
    const dns = String(s?.Self?.DNSName ?? "").replace(/\.$/, "");
    const conectado = s?.BackendState === "Running";
    return {
      instalado: true,
      conectado,
      direccion: dns ? `https://${dns}` : null,
      detalle: conectado ? "Tailscale está conectado." : "Tailscale está instalado pero sin sesión: ábrelo e inicia sesión.",
    };
  } catch {
    return { instalado: true, conectado: false, direccion: null, detalle: "No pude leer el estado de Tailscale; ábrelo e inicia sesión." };
  }
}

/** Publica Ares SOLO dentro de la red Tailscale: https://<laptop>.ts.net → http://127.0.0.1:3000. */
export async function publicarEnTailscale(puerto: number): Promise<{ ok: boolean; habilitar?: string; detalle: string }> {
  const r = await correrTailscale(["serve", "--bg", "--yes", `http://127.0.0.1:${puerto}`], 25_000);
  let salida = r.salida;
  if (/unknown flag|flag provided but not defined/i.test(salida)) {
    salida = (await correrTailscale(["serve", "--bg", `http://127.0.0.1:${puerto}`], 25_000)).salida;
  }
  if (salida === "NO_INSTALADO") return { ok: false, detalle: "Tailscale no está instalado en la laptop." };
  const enlace = salida.match(/https:\/\/login\.tailscale\.com\/[^\s"]+/)?.[0];
  if (enlace) {
    return { ok: false, habilitar: enlace, detalle: "Tailscale pide encender HTTPS/Serve en tu cuenta una sola vez: abre el enlace y apriétalo." };
  }
  if (r.codigo === 0 || /available within your tailnet|serving|Available on/i.test(salida)) return { ok: true, detalle: "Ares Móvil publicado en tu red Tailscale." };
  return { ok: false, detalle: `Tailscale no pudo publicar a Ares: ${salida.trim().slice(0, 200)}` };
}

export async function quitarDeTailscale(): Promise<void> {
  await correrTailscale(["serve", "reset"]);
}
