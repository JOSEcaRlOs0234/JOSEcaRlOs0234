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
  // Sin viewBox el dibujo no se puede agrandar ni achicar: se arma con su ancho y alto
  const inicioSvg = svg.slice(0, svg.indexOf(">") + 1);
  if (!/\sviewBox=/i.test(inicioSvg)) {
    const ancho = Number(inicioSvg.match(/\swidth=["']?([\d.]+)/)?.[1]) || 1200;
    const alto = Number(inicioSvg.match(/\sheight=["']?([\d.]+)/)?.[1]) || 800;
    svg = svg.replace("<svg", `<svg viewBox="0 0 ${ancho} ${alto}"`);
  }
  if (!/\sxmlns=/.test(svg.slice(0, 300))) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  if (svg.includes("xlink:") && !/\sxmlns:xlink=/.test(svg.slice(0, 400))) {
    svg = svg.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return svg.length > MAX_SVG ? "" : svg;
}

export const ANCHO_DIBUJO = 1200;
export const ALTO_DIBUJO = 800;

const REGLAS_DE_DISEÑO =
  `Reglas de diseño (MUY importantes):\n` +
  `- Responde SOLO con el código <svg>...</svg>, sin explicaciones ni \`\`\`.\n` +
  `- Usa viewBox="0 0 ${ANCHO_DIBUJO} ${ALTO_DIBUJO}". TODO debe quedar dentro, con un margen de 40 por cada lado.\n` +
  `- Primero un rectángulo de fondo oscuro (#041226) que cubra todo. Colores claros y con buen contraste: ` +
  `#e2f8ff (texto), #00e5ff, #00f5a0, #ffd84d, #ff9933, #ff5c7a, #c084fc. Puedes usar <defs> con degradados ` +
  `(linearGradient, radialGradient) y un brillo suave (filter con feGaussianBlur) para que se vea profesional.\n` +
  `- Textos en español con font-family="Segoe UI, Arial, sans-serif". Título arriba y centrado (tamaño 32 a 36, ` +
  `máximo 40 letras). Etiquetas de 16 a 22. Calcula el ancho de cada texto (cada letra mide ~0.55 × el tamaño) y ` +
  `asegúrate de que NO se salga del dibujo ni se encime con otras cosas. Si es largo, pártelo en varias líneas con <tspan>.\n` +
  `- Usa text-anchor="middle" para textos centrados. Deja espacio entre elementos; nada amontonado.\n` +
  `- Si hay varias partes (por ejemplo varios modelos, etapas o tipos), acomódalas en una cuadrícula ordenada ` +
  `(columnas o filas), cada una con su recuadro, su dibujo y su nombre debajo.\n` +
  `- Que sea correcto y detallado: si es ciencia, respeta cómo es en realidad (formas, partes, flechas de procesos) ` +
  `y pon etiquetas con flechas o líneas que señalen cada parte. Agrega una leyenda si usas colores con significado.\n` +
  `- Figuras permitidas: rect, circle, ellipse, line, polyline, polygon, path, text, tspan, g, defs, marker. ` +
  `No uses imágenes, scripts, enlaces ni foreignObject.`;

/** Instrucciones para que Gemini dibuje. */
export function pedidoDeDibujo(descripcion: string): string {
  return (
    `Eres un ilustrador experto en diagramas educativos claros y bonitos. Dibuja en formato SVG: ${descripcion}\n\n` +
    `Antes de escribir el código, piensa la distribución: qué va en cada zona y cuánto espacio necesita cada texto.\n\n` +
    REGLAS_DE_DISEÑO
  );
}

/** Instrucciones para revisar y mejorar un dibujo ya hecho. */
export function pedidoDeRevision(descripcion: string, svg: string, problemas: string[]): string {
  return (
    `Este es un dibujo SVG que se hizo para: ${descripcion}\n\n${svg}\n\n` +
    `Revísalo como un diseñador exigente y devuelve una versión CORREGIDA y MEJORADA. Revisa: textos que se salen ` +
    `del dibujo o están cortados, textos encimados, partes amontonadas o espacios vacíos, errores en el contenido ` +
    `(que sea correcto), que cada parte tenga su etiqueta, y que se vea profesional.\n` +
    (problemas.length ? `Problemas ya detectados que DEBES arreglar:\n- ${problemas.join("\n- ")}\n` : "") +
    `\n` +
    REGLAS_DE_DISEÑO
  );
}

/**
 * Revisión automática sencilla: calcula más o menos el ancho de cada texto y avisa si se sale del dibujo.
 * (No es perfecta: los textos girados o movidos con transform no se revisan.)
 */
export function problemasDeTexto(svg: string): string[] {
  const vb = svg.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  const ancho = Number(vb?.[1]) || ANCHO_DIBUJO;
  const alto = Number(vb?.[2]) || ALTO_DIBUJO;
  const problemas: string[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const attrs = m[1];
    if (/transform=/.test(attrs)) continue;
    const num = (nombre: string) => {
      const v = attrs.match(new RegExp(`\\s${nombre}=["']?(-?[\\d.]+)`));
      return v ? Number(v[1]) : undefined;
    };
    const x = num("x");
    const y = num("y");
    if (x === undefined) continue;
    const tam = num("font-size") ?? (Number(attrs.match(/font-size:\s*([\d.]+)/)?.[1]) || 16);
    // Si tiene varias líneas (tspan), cuenta la más larga
    const lineas = m[2].includes("<tspan") ? [...m[2].matchAll(/<tspan[^>]*>([^<]*)/g)].map((t) => t[1]) : [m[2].replace(/<[^>]+>/g, "")];
    const letras = Math.max(0, ...lineas.map((l) => l.trim().length));
    if (!letras) continue;
    const w = letras * tam * 0.55;
    const ancla = attrs.match(/text-anchor=["']?(\w+)/)?.[1] ?? "start";
    const izq = ancla === "middle" ? x - w / 2 : ancla === "end" ? x - w : x;
    const der = izq + w;
    const texto = lineas.join(" ").trim().slice(0, 40);
    if (izq < 0) problemas.push(`El texto "${texto}" se sale por la izquierda.`);
    if (der > ancho) problemas.push(`El texto "${texto}" se sale por la derecha (mide ~${Math.round(w)} y termina en ${Math.round(der)}, el ancho es ${ancho}).`);
    if (y !== undefined && (y < tam * 0.8 || y > alto)) problemas.push(`El texto "${texto}" se sale por arriba o por abajo.`);
    if (problemas.length >= 12) break;
  }
  return problemas;
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
