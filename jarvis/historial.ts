/**
 * Historial permanente: TODO lo que se platica con Jarvis se guarda, mes por mes,
 * en datos/historial/AAAA-MM.jsonl (archivos de texto en la laptop). Jarvis puede buscar ahí
 * cuando le preguntas "¿qué te dije la semana pasada sobre...?".
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CARPETA = path.join(path.dirname(fileURLToPath(import.meta.url)), "datos", "historial");

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function guardarEnHistorial(rol: "usuario" | "jarvis", texto: string): void {
  try {
    if (!existsSync(CARPETA)) mkdirSync(CARPETA, { recursive: true });
    const ahora = new Date();
    const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    const linea = JSON.stringify({ fecha: ahora.toISOString(), rol, texto: texto.slice(0, 5000) });
    appendFileSync(path.join(CARPETA, `${mes}.jsonl`), linea + "\n", "utf8");
  } catch (err) {
    console.error("No pude guardar en el historial:", err);
  }
}

/** Busca en todas las conversaciones pasadas los mensajes que contienen las palabras buscadas. */
export function buscarEnHistorial(consulta: string, maximo = 15): { fecha: string; rol: string; texto: string }[] {
  if (!existsSync(CARPETA)) return [];
  const palabras = normalizar(consulta)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 3);
  if (!palabras.length) return [];

  const encontrados: { fecha: string; rol: string; texto: string; puntos: number }[] = [];
  // Del mes más reciente al más viejo
  const archivos = readdirSync(CARPETA).filter((a) => a.endsWith(".jsonl")).sort().reverse();
  for (const archivo of archivos) {
    const lineas = readFileSync(path.join(CARPETA, archivo), "utf8").split("\n");
    for (const linea of lineas) {
      if (!linea) continue;
      try {
        const m = JSON.parse(linea);
        const t = normalizar(String(m.texto));
        const puntos = palabras.filter((p) => t.includes(p)).length;
        if (puntos > 0) encontrados.push({ fecha: m.fecha, rol: m.rol, texto: String(m.texto).slice(0, 500), puntos });
      } catch {
        // Línea dañada: se ignora
      }
    }
  }
  return encontrados
    .sort((a, b) => b.puntos - a.puntos || b.fecha.localeCompare(a.fecha))
    .slice(0, maximo)
    .map(({ fecha, rol, texto }) => ({ fecha: fecha.slice(0, 16).replace("T", " "), rol, texto }));
}
