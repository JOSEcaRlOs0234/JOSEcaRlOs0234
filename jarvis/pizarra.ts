/**
 * Pizarra de Jarvis: un tablero donde Jarvis escribe cuando se lo pides
 * (listas, explicaciones, pasos, resúmenes...). Se guarda en datos/pizarra.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export interface Pizarra {
  titulo: string;
  contenido: string;
  actualizada: number;
}

const ARCHIVO = path.join(CARPETA_DATOS, "pizarra.json");
export const MAX_PIZARRA = 20000;

export function leerPizarra(): Pizarra {
  try {
    const p = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    if (typeof p.contenido === "string") return { titulo: String(p.titulo ?? ""), contenido: p.contenido, actualizada: Number(p.actualizada) || 0 };
  } catch {
    // Pizarra vacía
  }
  return { titulo: "", contenido: "", actualizada: 0 };
}

export function escribirPizarra(titulo: string | undefined, contenido: string, agregar: boolean): Pizarra {
  const actual = leerPizarra();
  const nueva: Pizarra = {
    titulo: (titulo ?? (agregar ? actual.titulo : "")).slice(0, 120),
    contenido: (agregar && actual.contenido ? `${actual.contenido}\n\n${contenido}` : contenido).slice(-MAX_PIZARRA),
    actualizada: Date.now(),
  };
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(nueva, null, 2), "utf8");
  return nueva;
}

export function borrarPizarra(): Pizarra {
  return escribirPizarra("", "", false);
}
