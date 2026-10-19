/**
 * Calificaciones de Canvas del Tec (Experiencia 21): avisa cuando le califican algo al usuario.
 *
 * El calendario (.ics) no trae calificaciones, así que esto usa la API de Canvas con un "token de acceso" que el usuario
 * crea en Canvas (Cuenta → Configuración → "+ Nuevo token de acceso"). Se guarda solo en el .env (CANVAS_TOKEN).
 * Jarvis SOLO LEE: este archivo únicamente hace peticiones GET a tres direcciones fijas de la API (su perfil, sus
 * materias y sus entregas calificadas). Nunca entrega, cambia ni borra nada en Canvas.
 * Las calificaciones ya vistas se guardan en datos/canvas-calificaciones.json para avisar solo de las nuevas.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "canvas-calificaciones.json");
const CADA_MS = 30 * 60 * 1000;
const SITIO_PREDETERMINADO = "https://experiencia21.tec.mx";

export interface Calificacion {
  id: string; // entrega + fecha de calificación (si la vuelven a calificar, cuenta como nueva)
  tarea: string;
  materia: string;
  calificacion: string; // "95/100", "A", "Completo"...
  calificadaEl: number;
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

export const calificacionesConfiguradas = () => !!process.env.CANVAS_TOKEN?.trim();

/** El sitio de Canvas: el mismo del calendario (si está), si no Experiencia 21. */
export function sitioCanvas(): string {
  try {
    const ics = process.env.CANVAS_ICS_URL?.trim();
    if (ics) return new URL(ics.replace(/^webcal:/i, "https:")).origin;
  } catch {
    // se usa el predeterminado
  }
  return SITIO_PREDETERMINADO;
}

/** Petición de SOLO LECTURA a la API de Canvas (sigue las páginas, máximo `paginas`). */
async function pedir(ruta: string, token: string, paginas = 1): Promise<any[] | any> {
  let url: string | null = `${sitioCanvas()}/api/v1/${ruta}`;
  const todo: any[] = [];
  for (let i = 0; i < paginas && url; i++) {
    const r = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {
      throw new Error("No me pude conectar a Canvas (¿hay internet?).");
    });
    if (r.status === 401) throw new Error("Canvas no aceptó el token (puede que haya caducado o esté mal copiado).");
    if (r.status === 403) throw new Error("Canvas no me deja ver eso con este token.");
    if (!r.ok) throw new Error(`Canvas respondió con un error (${r.status}).`);
    const datos = await r.json();
    if (!Array.isArray(datos)) return datos;
    todo.push(...datos);
    // Canvas pone la siguiente página en el encabezado Link; solo se sigue si es del mismo sitio
    const siguiente = r.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    url = siguiente && siguiente.startsWith(`${sitioCanvas()}/api/v1/`) ? siguiente : null;
  }
  return todo;
}

/** Revisa que el token sirva. Devuelve el nombre del alumno. */
export async function probarToken(token: string): Promise<string> {
  const yo = await pedir("users/self", token);
  return String(yo?.short_name || yo?.name || "alumno");
}

function textoCalificacion(s: any): string {
  const puntos = s?.assignment?.points_possible;
  if (typeof s?.score === "number" && typeof puntos === "number" && puntos > 0) {
    const redondo = (n: number) => (Math.round(n * 100) / 100).toString();
    return `${redondo(s.score)}/${redondo(puntos)}`;
  }
  if (s?.grade === "complete") return "Completo";
  if (s?.grade === "incomplete") return "Incompleto";
  return String(s?.grade ?? s?.score ?? "");
}

/** Las calificaciones más recientes del usuario (ya publicadas por el profesor). */
export async function descargarCalificaciones(token = process.env.CANVAS_TOKEN?.trim() ?? ""): Promise<Calificacion[]> {
  if (!token) throw new Error("Falta el token de Canvas.");
  const [materias, entregas] = await Promise.all([
    pedir("courses?enrollment_state=active&per_page=100", token, 2),
    pedir(
      "users/self/graded_submissions?include[]=assignment&only_current_enrollment=true&only_published_assignments=true&per_page=50",
      token,
      2
    ),
  ]);
  const nombres = new Map<number, string>();
  for (const m of Array.isArray(materias) ? materias : []) nombres.set(m.id, String(m.name ?? m.course_code ?? ""));
  return (Array.isArray(entregas) ? entregas : [])
    .filter((s) => s?.graded_at && (s.score !== null && s.score !== undefined || s.grade) && s.workflow_state === "graded")
    .map((s) => ({
      id: `${s.id}-${s.graded_at}`,
      tarea: String(s.assignment?.name ?? "Tarea").slice(0, 200),
      materia: (nombres.get(s.assignment?.course_id) ?? "").slice(0, 120),
      calificacion: textoCalificacion(s),
      calificadaEl: Date.parse(s.graded_at) || Date.now(),
      url: typeof s.assignment?.html_url === "string" && s.assignment.html_url.startsWith(sitioCanvas()) ? s.assignment.html_url : undefined,
    }))
    .sort((a, b) => b.calificadaEl - a.calificadaEl);
}

let temporizador: ReturnType<typeof setInterval> | undefined;

/** Avisa de las calificaciones NUEVAS. La primera vez solo memoriza las que ya había. */
export async function revisarCalificacionesNuevas(avisar: (nuevas: Calificacion[]) => void): Promise<number> {
  if (!calificacionesConfiguradas()) return 0;
  const g = leer();
  try {
    const todas = await descargarCalificaciones();
    const primeraVez = !g.ultimaRevision;
    const vistas = new Set(g.vistas);
    const nuevas = todas.filter((c) => !vistas.has(c.id));
    for (const c of todas) vistas.add(c.id);
    guardar({ vistas: [...vistas], ultimaRevision: Date.now() });
    if (!primeraVez && nuevas.length) avisar(nuevas);
    return primeraVez ? 0 : nuevas.length;
  } catch (err) {
    guardar({ ...g, error: err instanceof Error ? err.message : "Error al revisar calificaciones" });
    throw err;
  }
}

export function vigilarCalificaciones(avisar: (nuevas: Calificacion[]) => void, alFallar: (e: unknown) => void): void {
  clearInterval(temporizador);
  const revisar = () => revisarCalificacionesNuevas(avisar).catch(alFallar);
  setTimeout(revisar, 90_000);
  temporizador = setInterval(revisar, CADA_MS);
}

export function reiniciarCalificaciones(): void {
  guardar({ vistas: [] });
}

export function estadoCalificaciones() {
  const g = leer();
  return { configurado: calificacionesConfiguradas(), ultimaRevision: g.ultimaRevision ?? null, error: g.error ?? null };
}

/** Fecha corta: "martes 14 de octubre". */
export const fechaLegible = (ms: number) =>
  new Date(ms).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
