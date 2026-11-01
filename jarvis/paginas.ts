/**
 * PÁGINAS WEB: "hazme una página de mi portafolio", "una página para mi negocio", "ponle color verde".
 *
 * Gemini escribe la página (un solo index.html con su diseño y sus botones) y se guarda en
 * Documentos\Jarvis\Páginas web\<nombre>. Al usuario se le muestra SOLO la página terminada, en grande, dentro de
 * Jarvis (en un marco aislado que no puede tocar a Jarvis), y se puede abrir en el navegador. El código no se muestra.
 * (La parte de programar en Python, C++, etc. se quitó en la 2.30 a pedido del usuario.)
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";
import { carpetasUsuario } from "./windows.ts";

export interface Pagina {
  id: string;
  nombre: string;
  carpeta: string;
  archivo: string;
  explicacion: string;
  creado: number;
  actualizado: number;
  versiones: number;
}

// Mismo archivo que en la 2.29 (ahí también había programas: esos ya no se muestran, pero sus archivos se quedan)
const INDICE = path.join(CARPETA_DATOS, "codigo.json");
const MAX_PAGINAS = 200;
const MAX_HTML = 400_000;

// Cambia cada vez que se crea o cambia una página (la pantalla lo usa para mostrarla sola)
let actualizada = 0;
export const paginasActualizadas = () => actualizada;

const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function leerIndice(): any[] {
  try {
    const lista = JSON.parse(readFileSync(INDICE, "utf8"));
    return Array.isArray(lista) ? lista.filter((p) => p && typeof p.id === "string" && typeof p.carpeta === "string") : [];
  } catch {
    return [];
  }
}

/** Solo las páginas web (los programas de la 2.29 se ignoran). */
export function leerPaginas(): Pagina[] {
  return leerIndice()
    .filter((p) => (p.lenguaje ?? "html") === "html")
    .sort((a, b) => b.actualizado - a.actualizado);
}

function guardarIndice(lista: any[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  const ordenada = [...lista].sort((a, b) => b.actualizado - a.actualizado).slice(0, MAX_PAGINAS);
  writeFileSync(INDICE, JSON.stringify(ordenada, null, 2), "utf8");
  actualizada = Date.now();
}

export const ultimaPagina = (): Pagina | null => leerPaginas()[0] ?? null;

/** Por id o por nombre (sin acentos, aunque sea parte del nombre). */
export function buscarPagina(texto: string): Pagina | null {
  const lista = leerPaginas();
  const porId = lista.find((p) => p.id === texto);
  if (porId) return porId;
  const t = sinAcentos(texto);
  if (!t) return null;
  return lista.find((p) => sinAcentos(p.nombre) === t) ?? lista.find((p) => sinAcentos(p.nombre).includes(t)) ?? null;
}

export async function leerHtml(p: Pagina): Promise<string> {
  try {
    return await readFile(path.join(p.carpeta, p.archivo), "utf8");
  } catch {
    return "";
  }
}

/** Nombre de carpeta seguro (sin \ / : * ? " < > |). */
function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return limpio || "Página";
}

/** Guarda una página nueva, o la nueva versión de una que ya existe (la anterior queda en "versiones"). */
export async function guardarPagina(datos: { nombre: string; html: string; explicacion: string; sobre?: Pagina | null }): Promise<Pagina> {
  if (!datos.html.trim()) throw new Error("La página salió vacía.");
  if (datos.html.length > MAX_HTML) throw new Error("La página salió demasiado grande.");
  const lista = leerIndice();
  const ahora = Date.now();
  let p: Pagina;
  const existente = datos.sobre ? lista.find((x) => x.id === datos.sobre!.id) : null;
  if (existente) {
    p = existente;
    // La versión anterior se guarda por si el cambio no le gusta al usuario
    const anterior = await leerHtml(p);
    if (anterior) {
      const carpetaVersiones = path.join(p.carpeta, "versiones");
      await mkdir(carpetaVersiones, { recursive: true });
      await writeFile(path.join(carpetaVersiones, `v${p.versiones}-${p.archivo}`), anterior, "utf8");
    }
    p.versiones += 1;
    p.explicacion = datos.explicacion;
    p.actualizado = ahora;
  } else {
    const raiz = path.join((await carpetasUsuario()).jarvis, "Páginas web");
    const base = nombreSeguro(datos.nombre);
    let carpeta = path.join(raiz, base);
    let n = 1;
    while (existsSync(carpeta)) carpeta = path.join(raiz, `${base} (${++n})`);
    p = {
      id: randomUUID(),
      nombre: path.basename(carpeta),
      carpeta,
      archivo: "index.html",
      explicacion: datos.explicacion,
      creado: ahora,
      actualizado: ahora,
      versiones: 1,
    };
    lista.push({ ...p, lenguaje: "html" });
  }
  await mkdir(p.carpeta, { recursive: true });
  await writeFile(path.join(p.carpeta, p.archivo), datos.html, "utf8");
  guardarIndice(lista);
  return p;
}

// ------------------------------------------------------------------ pedirle la página a Gemini

export const ESQUEMA_PAGINA = {
  type: "object",
  properties: {
    nombre: { type: "string", description: "Nombre corto de la página, en español (por ejemplo: Portafolio de Ana)" },
    html: { type: "string", description: "El archivo index.html COMPLETO" },
    explicacion: { type: "string", description: "1 o 2 frases sencillas: qué tiene la página" },
  },
  required: ["nombre", "html", "explicacion"],
};

export function pedidoDePagina(descripcion: string, anterior?: { nombre: string; html: string }): string {
  return (
    (anterior
      ? `Esta es la página actual "${anterior.nombre}":\n\`\`\`html\n${anterior.html.slice(0, 150_000)}\n\`\`\`\n\n` +
        `CÁMBIALA según este pedido (y conserva todo lo demás que ya funciona): ${descripcion}\n\n`
      : `Pedido del usuario: ${descripcion}\n\n`) +
    "Haz una PÁGINA WEB: un solo index.html con el CSS dentro de <style> y el JavaScript dentro de <script>. Diseño " +
    "moderno y atractivo (buena tipografía, colores armoniosos, espacios, sombras suaves, animaciones sutiles), que se " +
    "vea bien en computadora y celular, en español, con contenido de ejemplo realista (nada de \"Lorem ipsum\"). Sin " +
    "archivos externos: imágenes con SVG dentro del HTML, degradados o emojis. Que todo lo interactivo funcione. " +
    "Nada peligroso ni que pida datos personales reales."
  );
}

/** Quita las cercas ``` que a veces pone Gemini alrededor del HTML. */
export function limpiarHtml(html: string): string {
  const t = html.replace(/\r\n/g, "\n").trim();
  const m = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t) + "\n";
}
