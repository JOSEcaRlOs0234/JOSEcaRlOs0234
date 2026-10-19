/**
 * Dónde guarda Jarvis tus cosas (clave, memoria, historial, permisos, registro).
 *
 * Antes se guardaban dentro de la carpeta de Jarvis, y cada vez que se extraía una actualización en otra carpeta
 * se "perdían" (pedía la clave otra vez). Ahora viven en un lugar fijo de la laptop:
 *   Windows:  C:\Users\<tú>\AppData\Local\Jarvis
 * Así no importa en qué carpeta esté el programa.
 *
 * La primera vez, si hay datos en la carpeta del programa o en otras copias de Jarvis (C:\Jarvis, Descargas,
 * Escritorio), se copian a ese lugar fijo.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

export const CARPETA_APP = path.dirname(fileURLToPath(import.meta.url));

export const CARPETA_DATOS =
  process.env.JARVIS_DATOS ||
  (process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Jarvis")
    : path.join(os.homedir(), ".jarvis"));

export const ARCHIVO_ENV = path.join(CARPETA_DATOS, ".env");
export const CARPETA_REGISTRO = path.join(CARPETA_DATOS, "registro");

/** Otras carpetas donde puede haber una copia vieja de Jarvis con datos. */
function copiasViejas() {
  const casa = os.homedir();
  const candidatas = [CARPETA_APP, "C:\\Jarvis\\jarvis", path.join(casa, "Desktop", "jarvis")];
  for (const base of [path.join(casa, "Downloads"), path.join(casa, "Descargas"), "C:\\Jarvis"]) {
    try {
      for (const nombre of readdirSync(base)) {
        const carpeta = path.join(base, nombre);
        candidatas.push(path.join(carpeta, "jarvis"), carpeta);
      }
    } catch {
      // Esa carpeta no existe
    }
  }
  return [...new Set(candidatas)].filter((c) => {
    try {
      return existsSync(path.join(c, "package.json")) && existsSync(path.join(c, ".env"));
    } catch {
      return false;
    }
  });
}

/** Si el lugar fijo todavía no tiene la clave, traer los datos de la copia más reciente de Jarvis. */
export function prepararDatos() {
  mkdirSync(CARPETA_DATOS, { recursive: true });
  if (existsSync(ARCHIVO_ENV)) return;

  const copias = copiasViejas().sort(
    (a, b) => statSync(path.join(b, ".env")).mtimeMs - statSync(path.join(a, ".env")).mtimeMs
  );
  for (const copia of copias) {
    try {
      // La copia más reciente primero; las demás solo llenan lo que falte (no reemplazan)
      if (!existsSync(ARCHIVO_ENV)) cpSync(path.join(copia, ".env"), ARCHIVO_ENV);
      for (const carpeta of ["datos", "registro"]) {
        const origen = path.join(copia, carpeta);
        if (existsSync(origen)) {
          cpSync(origen, carpeta === "datos" ? CARPETA_DATOS : CARPETA_REGISTRO, {
            recursive: true,
            force: false,
            errorOnExist: false,
            // El marcador del icono del Escritorio es de cada copia del programa
            filter: (archivo) => !archivo.endsWith("acceso-directo.txt"),
          });
        }
      }
    } catch {
      // Si una copia no se puede leer, se intenta con la siguiente
    }
  }
}
