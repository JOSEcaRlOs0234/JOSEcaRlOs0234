/**
 * Dibujos:
 *  - Jarvis dibuja diagramas y esquemas como SVG (un formato de dibujo hecho con figuras), que se muestra en la pizarra.
 *  - Lo que tú dibujas con el ratón en la pizarra se guarda como imagen PNG en Documentos\Jarvis\Dibujos.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { carpetasUsuario } from "./windows.ts";

const MAX_SVG = 300 * 1024;
const MAX_PNG = 8 * 1024 * 1024;

/**
 * Deja solo un dibujo SVG seguro: sin programas (<script>), sin acciones (onclick...), sin cargar cosas de internet.
 * Devuelve "" si no hay un SVG válido.
 */
export function limpiarSvg(texto: string): string {
  const inicio = texto.indexOf("<svg");
  const fin = texto.lastIndexOf("</svg>");
  if (inicio < 0 || fin < inicio) return "";
  let svg = texto.slice(inicio, fin + "</svg>".length);
  svg = svg
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[\s\S]*?\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(iframe|object|embed|audio|video|image)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Enlaces solo internos (#algo); nada de http:, javascript:, data:
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  if (!/\sxmlns=/.test(svg.slice(0, 300))) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  if (svg.includes("xlink:") && !/\sxmlns:xlink=/.test(svg.slice(0, 400))) {
    svg = svg.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return svg.length > MAX_SVG ? "" : svg;
}

/** Instrucciones para que Gemini dibuje. */
export function pedidoDeDibujo(descripcion: string): string {
  return (
    `Dibuja en formato SVG: ${descripcion}\n\n` +
    "Reglas: responde SOLO con el código <svg>...</svg>, sin explicaciones ni ```. Usa viewBox=\"0 0 800 600\", " +
    "fondo oscuro (#041226) y líneas y textos claros (#e2f8ff, #00e5ff, #00f5a0, #ff9933). Si es un diagrama o esquema, " +
    "pon etiquetas en español con font-family=\"sans-serif\" y tamaño legible (16 a 22). Usa figuras simples " +
    "(rect, circle, ellipse, line, polyline, polygon, path, text). No uses imágenes, scripts ni enlaces."
  );
}

/** Guarda en Documentos\Jarvis\Dibujos un dibujo hecho a mano (imagen PNG en formato data URL). */
export async function guardarDibujoPng(dataUrl: string): Promise<string> {
  const prefijo = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefijo)) throw new Error("No es una imagen PNG.");
  const base64 = dataUrl.slice(prefijo.length);
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Imagen dañada.");
  const datos = Buffer.from(base64, "base64");
  if (datos.length > MAX_PNG) throw new Error("La imagen es demasiado grande.");
  // Firma de PNG: los primeros 8 bytes siempre son estos
  if (!datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("No es una imagen PNG.");
  }
  const carpeta = path.join((await carpetasUsuario()).jarvis, "Dibujos");
  await mkdir(carpeta, { recursive: true });
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const nombre = `dibujo-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}.png`;
  await writeFile(path.join(carpeta, nombre), datos);
  return `Documentos\\Jarvis\\Dibujos\\${nombre}`;
}
