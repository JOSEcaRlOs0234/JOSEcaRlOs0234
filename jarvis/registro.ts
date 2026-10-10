/**
 * Registro de actividad de Jarvis.
 * Cada cosa que hace Jarvis se anota con fecha y hora en registro/jarvis.log
 * (un archivo de texto normal que puedes abrir con el Bloc de notas).
 */

import { appendFileSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const CARPETA = path.join(path.dirname(fileURLToPath(import.meta.url)), "registro");
const ARCHIVO = path.join(CARPETA, "jarvis.log");
const MAX_LARGO = 500;

mkdirSync(CARPETA, { recursive: true });

function fechaHora(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(
    d.getMinutes()
  )}:${dos(d.getSeconds())}`;
}

/** Anota una línea en el registro. tipo: SISTEMA, CHAT, ERROR, SEGURIDAD... */
export function registrar(tipo: string, mensaje: string): void {
  let limpio = mensaje.replace(/\s+/g, " ").trim();
  if (limpio.length > MAX_LARGO) limpio = limpio.slice(0, MAX_LARGO) + "…";
  const linea = `${fechaHora()} | ${tipo.padEnd(9)} | ${limpio}\n`;
  try {
    appendFileSync(ARCHIVO, linea, "utf8");
  } catch (err) {
    console.error("No pude escribir en el registro:", err);
  }
}

/** Devuelve las últimas líneas del registro. */
export async function leerRegistro(cuantas: number): Promise<string[]> {
  try {
    const contenido = await readFile(ARCHIVO, "utf8");
    return contenido.trimEnd().split("\n").slice(-cuantas);
  } catch {
    return [];
  }
}
