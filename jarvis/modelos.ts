/**
 * Modelos de Gemini: Jarvis le pregunta a Google cuáles existen (con la misma clave sirven todos),
 * recuerda el que elegiste y, si uno falla o llega a su límite, prueba con otro.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export interface Modelo {
  id: string;
  nombre: string;
  descripcion: string;
}

const ARCHIVO_CONFIG = path.join(CARPETA_DATOS, "modelo.json");

// Modelos que no sirven para platicar (voz en vivo, imágenes, video, embeddings...)
const NO_SIRVEN = /embedding|tts|image|imagen|veo|live|audio|transcribe|robotics|computer-use|aqa|learnlm|native/i;

// Orden de respaldo si el elegido falla
const RESPALDOS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"];

const ID_VALIDO = /^[a-z0-9][a-z0-9.\-]{2,80}$/;

let cache: { lista: Modelo[]; fecha: number } | null = null;

/** Pregunta a Google la lista de modelos de Gemini que puede usar tu clave. */
export async function listarModelos(clave: string): Promise<Modelo[]> {
  if (cache && Date.now() - cache.fecha < 60 * 60 * 1000) return cache.lista;

  const lista: Modelo[] = [];
  let pagina = "";
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pagina) url.searchParams.set("pageToken", pagina);
    const r = await fetch(url, { headers: { "x-goog-api-key": clave } });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "");
      throw Object.assign(new Error(`No pude listar los modelos (${r.status}): ${detalle.slice(0, 300)}`), { status: r.status });
    }
    const datos: any = await r.json();
    for (const m of datos.models ?? []) {
      const id = String(m.name ?? "").replace(/^models\//, "");
      const metodos: string[] = m.supportedGenerationMethods ?? m.supportedActions ?? [];
      if (!id.startsWith("gemini") || NO_SIRVEN.test(id) || !metodos.includes("generateContent")) continue;
      lista.push({ id, nombre: m.displayName || id, descripcion: m.description || "" });
    }
    pagina = datos.nextPageToken ?? "";
    if (!pagina) break;
  }

  // Los más nuevos primero (gemini-3.8 antes que gemini-2.5)
  lista.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  cache = { lista, fecha: Date.now() };
  return lista;
}

export function idValido(id: unknown): id is string {
  return typeof id === "string" && ID_VALIDO.test(id);
}

/** El modelo elegido por el usuario (o el del archivo .env, o el de siempre). */
export function modeloElegido(porDefecto: string): string {
  try {
    const { modelo } = JSON.parse(readFileSync(ARCHIVO_CONFIG, "utf8"));
    if (idValido(modelo)) return modelo;
  } catch {
    // Todavía no se ha elegido ninguno
  }
  return porDefecto;
}

export function guardarModelo(id: string): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_CONFIG, JSON.stringify({ modelo: id }, null, 2), "utf8");
}

/** Lista de modelos a probar en orden: el elegido y luego los de respaldo. */
export function ordenDePrueba(elegido: string): string[] {
  return [elegido, ...RESPALDOS.filter((m) => m !== elegido)];
}
