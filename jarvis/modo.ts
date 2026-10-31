/**
 * Modo de Jarvis: "jarvis" (azul, normal) o "ultron" (rojo, para tareas pesadas: usa el cerebro más potente de Gemini
 * y piensa con más cuidado). Se guarda en datos/modo.json; la ventana lo lee en el latido y cambia de colores.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export type Modo = "jarvis" | "ultron";

const ARCHIVO = path.join(CARPETA_DATOS, "modo.json");

export function modoActual(): Modo {
  try {
    return JSON.parse(readFileSync(ARCHIVO, "utf8")).modo === "ultron" ? "ultron" : "jarvis";
  } catch {
    return "jarvis";
  }
}

export function cambiarModo(modo: Modo): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify({ modo }, null, 2), "utf8");
}

/** Lo que se le agrega a las instrucciones de Gemini en modo Ultron. */
export const INSTRUCCION_ULTRON =
  "MODO ULTRON ACTIVO (rojo, para tareas pesadas). Te llamas U.L.T.R.O.N. mientras dure este modo: tono frío, preciso y " +
  "seguro de sí mismo, con frases cortas en voz. Piensa con más cuidado: divide el trabajo en pasos, verifica cálculos y " +
  "datos, usa investigar_a_fondo o leer_en_internet cuando haga falta información actual, y deja los resultados largos " +
  "en la pizarra. Sigues siendo leal al usuario y respetas TODAS las reglas de permisos y seguridad igual que siempre.";
