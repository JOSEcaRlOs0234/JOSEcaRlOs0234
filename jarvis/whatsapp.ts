/**
 * Avisos de WhatsApp: dice DE QUIÉN llegó un mensaje, pero NUNCA lee el mensaje.
 *
 * Jarvis no se conecta a WhatsApp (así no hay ningún riesgo de bloqueo del número). Solo revisa las notificaciones de
 * Windows que deja la app de WhatsApp (o WhatsApp Web) en la base de notificaciones del usuario
 * (%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db). De cada notificación se toma solo el TÍTULO
 * (el nombre del contacto o del grupo); el texto del mensaje se ignora y no se guarda en ningún lado.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "whatsapp.json");
const COPIA = path.join(CARPETA_DATOS, "tmp-notificaciones");
const CADA_MS = 8000;

export interface ConfigWhatsapp {
  activo: boolean;
  voz: boolean;
}

interface Guardado extends ConfigWhatsapp {
  ultimoId: number; // última notificación revisada (para avisar solo de las nuevas)
  recientes: { de: string; hora: number }[];
}

let estado: { funcionando: boolean; error: string | null } = { funcionando: false, error: null };

function leer(): Guardado {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return {
      activo: g.activo !== false,
      voz: g.voz !== false,
      ultimoId: Number(g.ultimoId) || 0,
      recientes: Array.isArray(g.recientes) ? g.recientes : [],
    };
  } catch {
    return { activo: true, voz: true, ultimoId: 0, recientes: [] };
  }
}

function guardar(g: Guardado): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify({ ...g, recientes: g.recientes.slice(-50) }, null, 2), "utf8");
}

export function estadoWhatsapp() {
  const g = leer();
  return { activo: g.activo, voz: g.voz, ...estado };
}

export function cambiarConfigWhatsapp(c: Partial<ConfigWhatsapp>): void {
  const g = leer();
  if (typeof c.activo === "boolean") g.activo = c.activo;
  if (typeof c.voz === "boolean") g.voz = c.voz;
  guardar(g);
}

/** Quién escribió en las últimas horas (solo nombres y horas). */
export function mensajesRecientes(horas: number): { de: string; hora: number }[] {
  const desde = Date.now() - horas * 3600_000;
  return leer().recientes.filter((r) => r.hora >= desde);
}

const RUTA_BASE = () =>
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Microsoft", "Windows", "Notifications", "wpndatabase.db");

const entidades = (t: string) =>
  t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Saca SOLO el título de la notificación (quién escribe). El resto del contenido no se toca. */
export function remitente(payload: string): string {
  const m = payload.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i);
  const titulo = entidades((m?.[1] ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  // Quitar adornos que a veces pone WhatsApp ("~ Juan", "Juan (2 mensajes)")
  return titulo.replace(/^~\s*/, "").replace(/\s*\(\d+\s+mensajes?\)\s*$/i, "").slice(0, 80);
}

/** Lee las notificaciones nuevas de WhatsApp (de una copia de la base, para no estorbarle a Windows). */
async function notificacionesNuevas(desdeId: number): Promise<{ id: number; de: string; hora: number }[]> {
  const origen = RUTA_BASE();
  if (!existsSync(origen)) throw new Error("No encontré las notificaciones de Windows.");
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    throw new Error("Esta versión de Node.js es vieja para leer avisos; instala la más reciente desde nodejs.org.");
  }
  mkdirSync(COPIA, { recursive: true });
  const copia = path.join(COPIA, "wpn.db");
  for (const ext of ["-wal", "-shm"]) rmSync(copia + ext, { force: true });
  copyFileSync(origen, copia);
  if (existsSync(origen + "-wal")) copyFileSync(origen + "-wal", copia + "-wal");
  const db = new sqlite.DatabaseSync(copia);
  try {
    const consulta = db.prepare(
        "SELECT n.Id AS id, n.ArrivalTime AS llegada, n.Payload AS payload FROM Notification n " +
          "JOIN NotificationHandler h ON n.HandlerId = h.RecordId " +
          "WHERE n.Id > ? AND n.Type = 'toast' AND (h.PrimaryId LIKE '%WhatsApp%' OR CAST(n.Payload AS TEXT) LIKE '%web.whatsapp.com%') " +
          "ORDER BY n.Id LIMIT 200"
    );
    // La hora de Windows es un número muy grande: se lee como BigInt para no perder precisión
    consulta.setReadBigInts(true);
    const filas = consulta.all(desdeId) as { id: bigint; llegada: bigint | null; payload: Uint8Array | string }[];
    return filas
      .map((f) => {
        const xml = typeof f.payload === "string" ? f.payload : Buffer.from(f.payload).toString("utf8");
        // ArrivalTime viene en "FILETIME" de Windows (centenas de nanosegundos desde 1601)
        const ft = typeof f.llegada === "bigint" ? f.llegada : BigInt(f.llegada ?? 0);
        const hora = ft > 10n ** 16n ? Number(ft / 10_000n) - 11_644_473_600_000 : Date.now();
        return { id: Number(f.id), de: remitente(xml), hora };
      })
      .filter((f) => f.de);
  } finally {
    db.close();
    // La copia tiene los avisos completos de Windows: se borra en cuanto se leen los nombres
    for (const ext of ["", "-wal", "-shm"]) rmSync(copia + ext, { force: true });
  }
}

/** Número de la notificación más nueva (para empezar a contar desde ahora). */
async function ultimoIdActual(): Promise<number> {
  const todas = await notificacionesNuevas(0);
  return todas.reduce((m, f) => Math.max(m, f.id), 0);
}

let temporizador: ReturnType<typeof setInterval> | undefined;
let revisando = false;

/**
 * Revisa cada 8 segundos. La primera vez solo marca hasta dónde hay (no avisa de mensajes viejos).
 * `avisar` recibe los nombres de quienes escribieron (agrupados: "Mamá (3)").
 */
export function vigilarWhatsapp(avisar: (remitentes: { de: string; cuantos: number }[]) => void, esWindows: boolean): void {
  if (!esWindows) return;
  clearInterval(temporizador);
  const revisar = async () => {
    if (revisando) return;
    revisando = true;
    try {
      const g = leer();
      if (!g.activo) {
        estado = { funcionando: false, error: null };
        return;
      }
      if (!g.ultimoId) {
        g.ultimoId = await ultimoIdActual();
        if (!g.ultimoId) g.ultimoId = 1;
        guardar(g);
        estado = { funcionando: true, error: null };
        return;
      }
      const nuevas = await notificacionesNuevas(g.ultimoId);
      estado = { funcionando: true, error: null };
      if (!nuevas.length) return;
      g.ultimoId = Math.max(g.ultimoId, ...nuevas.map((n) => n.id));
      g.recientes.push(...nuevas.map((n) => ({ de: n.de, hora: n.hora })));
      guardar(g);
      const conteo = new Map<string, number>();
      for (const n of nuevas) conteo.set(n.de, (conteo.get(n.de) ?? 0) + 1);
      avisar([...conteo].map(([de, cuantos]) => ({ de, cuantos })));
    } catch (err) {
      estado = { funcionando: false, error: err instanceof Error ? err.message : "No pude revisar los avisos." };
    } finally {
      revisando = false;
    }
  };
  setTimeout(revisar, 5000);
  temporizador = setInterval(revisar, CADA_MS);
}
