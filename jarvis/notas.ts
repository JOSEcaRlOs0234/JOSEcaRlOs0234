/**
 * Notas de Jarvis: "anota que mañana tengo examen", "apunta la receta", "¿qué notas tengo?".
 * A diferencia de la memoria (datos cortos sobre ti), las notas pueden ser largas y tienen título.
 * Se guardan en datos/notas.json, en la laptop.
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export interface Nota {
  id: string;
  titulo: string;
  texto: string;
  fecha: string; // AAAA-MM-DD HH:MM
}

const ARCHIVO = path.join(CARPETA_DATOS, "notas.json");
const MAX_NOTAS = 500;
export const MAX_LARGO_NOTA = 5000;

// Cambia cada vez que se agrega o borra una nota (la pantalla lo usa para abrir el panel de notas)
let actualizada = 0;
export const notasActualizadas = () => actualizada;

export function leerNotas(): Nota[] {
  try {
    const lista = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(lista) ? lista.filter((n) => n && typeof n.id === "string" && typeof n.texto === "string") : [];
  } catch {
    return [];
  }
}

function guardar(lista: Nota[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(lista, null, 2), "utf8");
  actualizada = Date.now();
}

function ahoraTexto(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function agregarNota(texto: string, titulo?: string): Nota {
  const limpio = texto.trim().slice(0, MAX_LARGO_NOTA);
  const nota: Nota = {
    id: randomUUID().slice(0, 6),
    titulo: (titulo?.trim() || limpio.split("\n")[0].slice(0, 60)).slice(0, 100),
    texto: limpio,
    fecha: ahoraTexto(),
  };
  // Las más nuevas primero
  guardar([nota, ...leerNotas()].slice(0, MAX_NOTAS));
  return nota;
}

export function borrarNota(id: string): Nota | undefined {
  const lista = leerNotas();
  const nota = lista.find((n) => n.id === id);
  if (nota) guardar(lista.filter((n) => n.id !== id));
  return nota;
}

/** Busca notas que contengan las palabras (sin importar acentos ni mayúsculas). */
export function buscarNotas(consulta?: string): Nota[] {
  const lista = leerNotas();
  if (!consulta?.trim()) return lista;
  const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const palabras = sinAcentos(consulta).split(/\s+/).filter((p) => p.length >= 3);
  if (!palabras.length) return lista;
  return lista.filter((n) => {
    const t = sinAcentos(`${n.titulo} ${n.texto}`);
    return palabras.some((p) => t.includes(p));
  });
}
