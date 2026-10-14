/**
 * "Para Claude": lista de lo que le falta a Jarvis.
 *
 * Cada vez que el usuario pide algo que Jarvis todavía no sabe hacer (o una herramienta se rompe por un error del
 * programa), se anota aquí. Jarvis NO puede mandarle mensajes a Claude por su cuenta (Claude no tiene una dirección para
 * recibirlos), así que la lista se guarda en datos/faltantes.json y también en Documentos\Jarvis\Para Claude.txt:
 * el usuario la copia (botón "Copiar para Claude" en Ajustes) y se la pega a Claude para que lo construya.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "faltantes.json");
const MAX = 100;

export interface Falta {
  id: string;
  tipo: "falta" | "error";
  pedido: string; // lo que pidió el usuario
  queFalta: string; // lo que Jarvis no pudo hacer
  veces: number;
  primera: number;
  ultima: number;
}

let alCambiar: (() => void) | null = null;
/** El servidor se entera cuando hay algo nuevo (para escribir el archivo de texto y avisar). */
export function cuandoCambienFaltas(f: () => void): void {
  alCambiar = f;
}

export function leerFaltas(): Falta[] {
  try {
    const lista = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function guardar(lista: Falta[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(lista.slice(0, MAX), null, 2), "utf8");
  alCambiar?.();
}

const parecido = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Anota algo que falta. Si ya estaba anotado, solo cuenta una vez más. Devuelve true si es nuevo. */
export function anotarFalta(tipo: Falta["tipo"], pedido: string, queFalta: string): boolean {
  const lista = leerFaltas();
  const clave = parecido(queFalta);
  const ya = lista.find((f) => f.tipo === tipo && parecido(f.queFalta) === clave);
  const ahora = Date.now();
  if (ya) {
    ya.veces += 1;
    ya.ultima = ahora;
    if (pedido && !ya.pedido) ya.pedido = pedido.slice(0, 500);
    guardar([ya, ...lista.filter((f) => f !== ya)]);
    return false;
  }
  lista.unshift({
    id: ahora.toString(36) + Math.random().toString(36).slice(2, 6),
    tipo,
    pedido: pedido.slice(0, 500),
    queFalta: queFalta.slice(0, 800),
    veces: 1,
    primera: ahora,
    ultima: ahora,
  });
  guardar(lista);
  return true;
}

export function borrarFalta(id: string): boolean {
  const lista = leerFaltas();
  const queda = lista.filter((f) => f.id !== id);
  if (queda.length === lista.length) return false;
  guardar(queda);
  return true;
}

export function borrarFaltas(): void {
  guardar([]);
}

/** Texto listo para pegarle a Claude. */
export function reporteParaClaude(version: string): string {
  const lista = leerFaltas();
  if (!lista.length) return "";
  const fecha = (ms: number) => new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const bloque = (f: Falta, i: number) =>
    `${i + 1}. ${f.queFalta}\n` +
    (f.pedido ? `   Lo que pedí: "${f.pedido}"\n` : "") +
    `   Veces: ${f.veces} · Última: ${fecha(f.ultima)}`;
  const faltas = lista.filter((f) => f.tipo === "falta");
  const errores = lista.filter((f) => f.tipo === "error");
  return (
    `Hola Claude, soy Jarvis (versión ${version}). Esto es lo que me falta o me falló. ` +
    "Por favor agrégalo sin cambiar nada de lo que ya funciona:\n\n" +
    (faltas.length ? `COSAS QUE NO SÉ HACER TODAVÍA\n${faltas.map(bloque).join("\n\n")}\n\n` : "") +
    (errores.length ? `ERRORES DEL PROGRAMA\n${errores.map(bloque).join("\n\n")}\n` : "")
  ).trim();
}

/** Guarda la lista en Documentos\Jarvis\Para Claude.txt (para poder mandarla como archivo). */
export async function guardarReporte(carpetaJarvis: string, version: string): Promise<void> {
  await writeFile(path.join(carpetaJarvis, "Para Claude.txt"), reporteParaClaude(version) || "No falta nada por ahora.\n", "utf8");
}
