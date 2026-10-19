/**
 * Canvas del Tec (Experiencia 21): avisa cuando aparece una tarea nueva.
 *
 * Usa el "calendario" de Canvas (Calendario → "Fuente del calendario" / "Calendar Feed"): una dirección privada .ics con
 * las tareas y fechas de entrega de todas las materias del alumno. No necesita contraseña ni llaves especiales y solo se
 * puede LEER (Jarvis no puede entregar ni cambiar nada en Canvas). La dirección se guarda en el .env (CANVAS_ICS_URL)
 * porque es privada. Las tareas ya vistas se guardan en datos/canvas-tareas.json para avisar solo de las nuevas.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "canvas-tareas.json");
const CADA_MS = 20 * 60 * 1000;

export interface TareaCanvas {
  id: string;
  titulo: string;
  materia: string;
  entrega: number | null; // fecha de entrega en ms (null si no tiene)
  todoElDia: boolean;
  url?: string;
}

interface Guardado {
  vistas: string[];
  ultimaRevision?: number;
  error?: string;
}

function leer(): Guardado {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return { vistas: Array.isArray(g.vistas) ? g.vistas : [], ultimaRevision: g.ultimaRevision, error: g.error };
  } catch {
    return { vistas: [] };
  }
}

function guardar(g: Guardado): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify({ ...g, vistas: g.vistas.slice(-3000) }, null, 2), "utf8");
}

export const canvasConfigurado = () => !!process.env.CANVAS_ICS_URL?.trim();

/** ¿Parece una dirección de calendario de Canvas? */
export function urlCanvasValida(url: string): boolean {
  try {
    const u = new URL(url.trim().replace(/^webcal:/i, "https:"));
    return u.protocol === "https:" && /\/feeds\/calendars\/.+\.ics$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ leer el calendario (.ics)

function desescapar(t: string): string {
  return t.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

function fechaIcs(valor: string, parametros: string): { ms: number | null; todoElDia: boolean } {
  const soloFecha = /VALUE=DATE(?!-)/i.test(parametros) || /^\d{8}$/.test(valor);
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return { ms: null, todoElDia: false };
  const [, a, mes, d, h = "23", mi = "59", s = "00", z] = m;
  if (soloFecha) return { ms: new Date(+a, +mes - 1, +d, 23, 59).getTime(), todoElDia: true };
  const ms = z ? Date.UTC(+a, +mes - 1, +d, +h, +mi, +s) : new Date(+a, +mes - 1, +d, +h, +mi, +s).getTime();
  return { ms, todoElDia: false };
}

/** Saca las tareas (y eventos) del archivo .ics de Canvas. */
export function leerIcs(texto: string): TareaCanvas[] {
  // Las líneas largas vienen partidas: las que empiezan con espacio continúan la anterior
  const lineas = texto.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const tareas: TareaCanvas[] = [];
  let actual: Record<string, { valor: string; parametros: string }> | null = null;
  for (const linea of lineas) {
    if (linea === "BEGIN:VEVENT") actual = {};
    else if (linea === "END:VEVENT" && actual) {
      const uid = actual.UID?.valor;
      const resumen = desescapar(actual.SUMMARY?.valor ?? "");
      if (uid && resumen) {
        // Canvas pone la materia entre corchetes al final: "Tarea 3 [Física I (Gpo 101)]"
        const m = resumen.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        const fecha = actual.DTSTART ? fechaIcs(actual.DTSTART.valor, actual.DTSTART.parametros) : { ms: null, todoElDia: false };
        tareas.push({
          id: uid,
          titulo: (m ? m[1] : resumen).slice(0, 200),
          materia: (m ? m[2] : "").slice(0, 120),
          entrega: fecha.ms,
          todoElDia: fecha.todoElDia,
          url: actual.URL?.valor && /^https:\/\//.test(actual.URL.valor) ? actual.URL.valor : undefined,
        });
      }
      actual = null;
    } else if (actual) {
      const i = linea.indexOf(":");
      if (i > 0) {
        const [nombre, ...params] = linea.slice(0, i).split(";");
        actual[nombre.toUpperCase()] = { valor: linea.slice(i + 1), parametros: params.join(";") };
      }
    }
  }
  return tareas;
}

/** ¿Es una tarea (y no un evento de calendario como una clase o junta)? Canvas marca las tareas en su id. */
export const esTarea = (t: TareaCanvas) => /assignment|quiz|discussion/i.test(t.id) || !/calendar-event/i.test(t.id);

export async function descargarTareas(url = process.env.CANVAS_ICS_URL ?? ""): Promise<TareaCanvas[]> {
  const r = await fetch(url.trim().replace(/^webcal:/i, "https:"), { signal: AbortSignal.timeout(30_000) });
  if (r.status === 401 || r.status === 403 || r.status === 404) {
    throw new Error("Canvas no reconoció la dirección del calendario. Cópiala otra vez desde Canvas.");
  }
  if (!r.ok) throw new Error(`Canvas no respondió (${r.status}).`);
  const texto = await r.text();
  if (!texto.includes("BEGIN:VCALENDAR")) throw new Error("Esa dirección no es un calendario de Canvas.");
  return leerIcs(texto);
}

/** Fecha legible: "jueves 15 de octubre a las 23:59". */
export function entregaLegible(t: TareaCanvas): string {
  if (!t.entrega) return "sin fecha de entrega";
  const d = new Date(t.entrega);
  const dia = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return t.todoElDia ? dia : `${dia} a las ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

// ------------------------------------------------------------------ vigilar tareas nuevas

let temporizador: ReturnType<typeof setInterval> | undefined;

/**
 * Revisa el calendario y llama `avisar` con las tareas NUEVAS que aún no se entregan. La primera vez solo memoriza
 * las que ya había (para no avisar de golpe todas las del semestre).
 */
export async function revisarTareasNuevas(avisar: (nuevas: TareaCanvas[]) => void): Promise<number> {
  if (!canvasConfigurado()) return 0;
  const g = leer();
  try {
    const tareas = (await descargarTareas()).filter(esTarea);
    const primeraVez = !g.ultimaRevision;
    const vistas = new Set(g.vistas);
    const nuevas = tareas.filter((t) => !vistas.has(t.id) && (t.entrega === null || t.entrega > Date.now()));
    for (const t of tareas) vistas.add(t.id);
    guardar({ vistas: [...vistas], ultimaRevision: Date.now() });
    if (!primeraVez && nuevas.length) avisar(nuevas.sort((a, b) => (a.entrega ?? Infinity) - (b.entrega ?? Infinity)));
    return primeraVez ? 0 : nuevas.length;
  } catch (err) {
    guardar({ ...g, error: err instanceof Error ? err.message : "Error al revisar Canvas" });
    throw err;
  }
}

export function vigilarCanvas(avisar: (nuevas: TareaCanvas[]) => void, alFallar: (e: unknown) => void): void {
  clearInterval(temporizador);
  const revisar = () => revisarTareasNuevas(avisar).catch(alFallar);
  setTimeout(revisar, 60_000);
  temporizador = setInterval(revisar, CADA_MS);
}

/** Olvida las tareas vistas (al cambiar de dirección), para que la siguiente revisión vuelva a memorizar. */
export function reiniciarCanvas(): void {
  guardar({ vistas: [] });
}

export function estadoCanvas() {
  const g = leer();
  return { configurado: canvasConfigurado(), ultimaRevision: g.ultimaRevision ?? null, error: g.error ?? null };
}
