/**
 * Modo clase: Jarvis escucha la clase en silencio y al final hace un documento de Word con el resumen.
 *
 * - La VENTANA graba el micrófono (16 kHz, mono) y cada 3 minutos manda un pedazo de audio (WAV) al servidor.
 * - El servidor convierte cada pedazo en texto con Gemini mientras la clase sigue (así al final no tarda tanto).
 * - Al terminar ("Jarvis, termina la clase" o el botón), se pide a Gemini un resumen ordenado y se arma el Word en
 *   Documentos\Jarvis\Clases. El audio NO se guarda: solo el texto (si un pedazo no se pudo pasar a texto, se guarda
 *   un momento en la carpeta de datos para reintentarlo y luego se borra).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { CARPETA_DATOS } from "./ubicacion.mjs";
import { carpetasUsuario } from "./windows.ts";

const CARPETA = path.join(CARPETA_DATOS, "clases");
const MAX_HORAS = 4;
const MAX_AUDIO = 30 * 1024 * 1024;

export interface Trozo {
  n: number;
  inicioSeg: number; // segundo de la clase en que empieza
  texto: string | null; // null = todavía no se pasa a texto
  intentos: number;
}

export interface Clase {
  id: string;
  materia: string;
  inicio: number;
  fin?: number;
  estado: "escuchando" | "procesando" | "listo" | "error";
  trozos: Trozo[];
  archivo?: string;
  error?: string;
}

/** Funciones de IA que conecta el servidor (usan Gemini con los modelos de respaldo). */
export interface IAClase {
  transcribir: (wav: Buffer) => Promise<string>;
  resumir: (transcripcion: string, materia: string) => Promise<Resumen>;
}

export interface Resumen {
  titulo: string;
  resumen: string;
  temas: { titulo: string; puntos: string[] }[];
  conceptos: { termino: string; definicion: string }[];
  formulas: { formula: string; explicacion: string }[];
  tareas: string[];
  preguntas: { pregunta: string; respuesta: string }[];
}

let clase: Clase | null = null;
let ia: IAClase | null = null;
let cola: Promise<void> = Promise.resolve();
let alTerminar: ((c: Clase) => void) | null = null;

export function conectarIAClase(f: IAClase, avisar: (c: Clase) => void): void {
  ia = f;
  alTerminar = avisar;
}

const archivoClase = (id: string) => path.join(CARPETA, `${id}.json`);
const archivoAudio = (id: string, n: number) => path.join(CARPETA, `${id}-${n}.wav`);

function guardar(): void {
  if (!clase) return;
  if (!existsSync(CARPETA)) mkdirSync(CARPETA, { recursive: true });
  writeFileSync(archivoClase(clase.id), JSON.stringify(clase, null, 2), "utf8");
}

/** Estado que ve la ventana (va en el latido). */
export function estadoClase() {
  if (!clase) return null;
  return {
    id: clase.id,
    materia: clase.materia,
    inicio: clase.inicio,
    estado: clase.estado,
    trozos: clase.trozos.length,
    pendientes: clase.trozos.filter((t) => t.texto === null).length,
    archivo: clase.archivo,
    error: clase.error,
  };
}

export const claseActiva = () => clase?.estado === "escuchando";

export function iniciarClase(materia: string): Clase {
  if (clase?.estado === "escuchando") return clase;
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  clase = {
    id: `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`,
    materia: materia.trim().slice(0, 80) || "Clase",
    inicio: Date.now(),
    estado: "escuchando",
    trozos: [],
  };
  guardar();
  return clase;
}

/** Un pedazo de audio que mandó la ventana. Se pasa a texto en orden, sin hacer esperar a la ventana. */
export function recibirAudio(id: string, n: number, inicioSeg: number, wav: Buffer): void {
  if (!clase || clase.id !== id) throw new Error("No hay una clase con ese número.");
  if (clase.estado !== "escuchando" && clase.estado !== "procesando") throw new Error("La clase ya terminó.");
  if (wav.length > MAX_AUDIO || wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new Error("Audio no válido.");
  }
  if (clase.trozos.some((t) => t.n === n)) return; // repetido
  const trozo: Trozo = { n, inicioSeg, texto: null, intentos: 0 };
  clase.trozos.push(trozo);
  clase.trozos.sort((a, b) => a.n - b.n);
  // Se guarda un momento por si falla y hay que reintentar
  writeFileSync(archivoAudio(id, n), wav);
  guardar();
  const c = clase;
  cola = cola.then(() => transcribirTrozo(c, trozo)).catch(() => {});
  // Seguridad: si se olvidó terminar, se termina sola después de varias horas
  if (Date.now() - c.inicio > MAX_HORAS * 3600 * 1000) void terminarClase();
}

async function transcribirTrozo(c: Clase, t: Trozo): Promise<void> {
  if (t.texto !== null || !ia) return;
  const ruta = archivoAudio(c.id, t.n);
  if (!existsSync(ruta)) {
    t.texto = "";
    return;
  }
  t.intentos++;
  try {
    t.texto = (await ia.transcribir(readFileSync(ruta))).trim();
    rmSync(ruta, { force: true });
  } catch {
    // Se reintenta al terminar la clase
  }
  if (clase === c) guardar();
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Termina la clase: pasa a texto lo que falte, hace el resumen y el Word. No espera: el estado se ve en el latido. */
export async function terminarClase(): Promise<void> {
  if (!clase || clase.estado !== "escuchando") return;
  const c = clase;
  c.estado = "procesando";
  c.fin = Date.now();
  guardar();
  try {
    // La ventana manda el último pedazo al detenerse; se le dan unos segundos
    await espera(4000);
    await cola;
    // Reintentar los pedazos que fallaron (por ejemplo por el límite gratuito de Gemini)
    for (let vuelta = 0; vuelta < 4 && c.trozos.some((t) => t.texto === null); vuelta++) {
      if (vuelta > 0) await espera(30_000);
      for (const t of c.trozos) if (t.texto === null) await transcribirTrozo(c, t);
    }
    const transcripcion = textoCompleto(c);
    if (!transcripcion.trim()) throw new Error("No se escuchó nada de la clase (revisa el micrófono).");
    if (!ia) throw new Error("La IA no está disponible.");
    let resumen: Resumen | null = null;
    for (let intento = 0; intento < 3 && !resumen; intento++) {
      try {
        resumen = await ia.resumir(transcripcion, c.materia);
      } catch (err) {
        if (intento === 2) throw err;
        await espera(30_000);
      }
    }
    c.archivo = await crearWord(c, resumen!, transcripcion);
    c.estado = "listo";
  } catch (err) {
    c.estado = "error";
    c.error = err instanceof Error ? err.message : "No pude hacer el resumen.";
  }
  guardar();
  alTerminar?.(c);
}

const minSeg = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function textoCompleto(c: Clase): string {
  return c.trozos
    .filter((t) => t.texto)
    .map((t) => `[${minSeg(t.inicioSeg)}] ${t.texto}`)
    .join("\n\n");
}

/** Arma el documento de Word con el resumen y la transcripción completa. Devuelve la ruta para mostrar. */
async function crearWord(c: Clase, r: Resumen, transcripcion: string): Promise<string> {
  const fecha = new Date(c.inicio);
  const fechaTexto = fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const minutos = Math.max(1, Math.round(((c.fin ?? Date.now()) - c.inicio) / 60000));
  const p = (texto: string, opciones: Record<string, unknown> = {}) => new Paragraph({ children: [new TextRun(texto)], ...opciones });
  const titulo = (texto: string) => new Paragraph({ text: texto, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } });
  const subtitulo = (texto: string) => new Paragraph({ text: texto, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } });
  const vineta = (texto: string, nivel = 0) => new Paragraph({ children: [new TextRun(texto)], bullet: { level: nivel } });
  const negritaY = (a: string, b: string) =>
    new Paragraph({ children: [new TextRun({ text: a, bold: true }), new TextRun(b)], bullet: { level: 0 } });

  const partes: Paragraph[] = [
    new Paragraph({ text: r.titulo || `Resumen de ${c.materia}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${c.materia} · ${fechaTexto} · ${minutos} min`, italics: true, color: "666666" })],
      spacing: { after: 300 },
    }),
    titulo("Resumen"),
    ...r.resumen.split(/\n+/).filter(Boolean).map((t) => p(t, { spacing: { after: 120 } })),
  ];
  if (r.temas.length) {
    partes.push(titulo("Temas de la clase"));
    for (const t of r.temas) {
      partes.push(subtitulo(t.titulo));
      partes.push(...t.puntos.map((x) => vineta(x)));
    }
  }
  if (r.conceptos.length) {
    partes.push(titulo("Conceptos clave"));
    partes.push(...r.conceptos.map((x) => negritaY(`${x.termino}: `, x.definicion)));
  }
  if (r.formulas.length) {
    partes.push(titulo("Fórmulas"));
    for (const f of r.formulas) {
      partes.push(new Paragraph({ children: [new TextRun({ text: f.formula, bold: true, font: "Cambria Math", size: 26 })], alignment: AlignmentType.CENTER, spacing: { before: 120 } }));
      partes.push(p(f.explicacion, { spacing: { after: 120 } }));
    }
  }
  if (r.tareas.length) {
    partes.push(titulo("Tareas, fechas y avisos"));
    partes.push(...r.tareas.map((x) => vineta(x)));
  }
  if (r.preguntas.length) {
    partes.push(titulo("Preguntas de repaso"));
    r.preguntas.forEach((q, i) => {
      partes.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${q.pregunta}`, bold: true })], spacing: { before: 120 } }));
      partes.push(p(`Respuesta: ${q.respuesta}`));
    });
  }
  partes.push(titulo("Transcripción completa"));
  partes.push(...transcripcion.split(/\n+/).filter(Boolean).map((t) => new Paragraph({ children: [new TextRun({ text: t, size: 20 })], spacing: { after: 80 } })));

  const doc = new Document({
    creator: "J.A.R.V.I.S.",
    title: r.titulo || c.materia,
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: partes }],
  });
  const carpeta = path.join((await carpetasUsuario()).jarvis, "Clases");
  await mkdir(carpeta, { recursive: true });
  const seguro = c.materia.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 50) || "Clase";
  const nombre = `Clase ${seguro} ${c.id}.docx`;
  await writeFile(path.join(carpeta, nombre), await Packer.toBuffer(doc));
  return path.join(carpeta, nombre);
}

/** Instrucciones para pasar el audio a texto. */
export const PEDIDO_TRANSCRIPCION =
  "Este audio es un pedazo de una clase (probablemente en español). Transcríbelo palabra por palabra, en el idioma " +
  "en que se habla. No resumas ni inventes. Si una parte no se entiende escribe [inaudible]. Si no se habla nada, " +
  "responde exactamente: [silencio]. Responde solo con la transcripción.";

/** Instrucciones para el resumen. */
export function pedidoDeResumen(transcripcion: string, materia: string): string {
  return (
    `Eres un excelente estudiante que toma apuntes. Esta es la transcripción de una clase de "${materia}" ` +
    "(puede tener errores de audio; corrígelos con sentido común, sin inventar temas que no se dieron). " +
    "Haz los apuntes en español, claros y completos para estudiar: un resumen de 1 a 3 párrafos, los temas con sus " +
    "puntos importantes, conceptos clave con definición, fórmulas (escritas con símbolos normales como x², √, π, ½, " +
    "≤, sin LaTeX; revisa que sean correctas), tareas/fechas/avisos que mencionó el profesor y 5 preguntas de repaso " +
    "con su respuesta. Si algo no aplica, deja la lista vacía.\n\nTRANSCRIPCIÓN:\n" +
    transcripcion.slice(0, 400_000)
  );
}

export const ESQUEMA_RESUMEN = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    resumen: { type: "string" },
    temas: {
      type: "array",
      items: { type: "object", properties: { titulo: { type: "string" }, puntos: { type: "array", items: { type: "string" } } }, required: ["titulo", "puntos"] },
    },
    conceptos: {
      type: "array",
      items: { type: "object", properties: { termino: { type: "string" }, definicion: { type: "string" } }, required: ["termino", "definicion"] },
    },
    formulas: {
      type: "array",
      items: { type: "object", properties: { formula: { type: "string" }, explicacion: { type: "string" } }, required: ["formula", "explicacion"] },
    },
    tareas: { type: "array", items: { type: "string" } },
    preguntas: {
      type: "array",
      items: { type: "object", properties: { pregunta: { type: "string" }, respuesta: { type: "string" } }, required: ["pregunta", "respuesta"] },
    },
  },
  required: ["titulo", "resumen", "temas", "conceptos", "formulas", "tareas", "preguntas"],
};

/** Revisa que el resumen tenga la forma esperada (por si el modelo se equivoca en algo). */
export function normalizarResumen(datos: any, materia: string): Resumen {
  const lista = (v: any) => (Array.isArray(v) ? v : []);
  const t = (v: any) => (typeof v === "string" ? v.trim() : "");
  return {
    titulo: t(datos?.titulo) || `Apuntes de ${materia}`,
    resumen: t(datos?.resumen) || "Sin resumen.",
    temas: lista(datos?.temas).map((x: any) => ({ titulo: t(x?.titulo) || "Tema", puntos: lista(x?.puntos).map(t).filter(Boolean) })),
    conceptos: lista(datos?.conceptos).map((x: any) => ({ termino: t(x?.termino), definicion: t(x?.definicion) })).filter((x) => x.termino),
    formulas: lista(datos?.formulas).map((x: any) => ({ formula: t(x?.formula), explicacion: t(x?.explicacion) })).filter((x) => x.formula),
    tareas: lista(datos?.tareas).map(t).filter(Boolean),
    preguntas: lista(datos?.preguntas).map((x: any) => ({ pregunta: t(x?.pregunta), respuesta: t(x?.respuesta) })).filter((x) => x.pregunta),
  };
}
