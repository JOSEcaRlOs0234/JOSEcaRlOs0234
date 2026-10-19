/**
 * Cámara: Jarvis "mira" pidiéndole una foto a su ventana (la ventana usa la cámara de la laptop con permiso del
 * navegador). La foto se analiza con Gemini y, solo si el usuario lo pide, se guarda en Documentos\Jarvis\Fotos.
 * Nunca graba video ni mira a escondidas: cada foto pasa por la lista permitida y su permiso.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { carpetasUsuario } from "./windows.ts";

const ESPERA_MS = 25_000;
const MAX_FOTO = 8 * 1024 * 1024;

let pedido: { id: number; resolver: (jpeg: Buffer) => void; rechazar: (e: Error) => void } | null = null;
let siguiente = 1;

/** Número de la foto que la ventana debe tomar ahora (0 = ninguna). Va en el latido GET /api/aplausos. */
export const fotoPedida = () => pedido?.id ?? 0;

/** Le pide una foto a la ventana de Jarvis y espera a que llegue. */
export function pedirFoto(): Promise<Buffer> {
  pedido?.rechazar(new Error("Se pidió otra foto."));
  return new Promise((resolver, rechazar) => {
    const id = siguiente++;
    const vence = setTimeout(() => {
      if (pedido?.id === id) pedido = null;
      rechazar(new Error("SIN_VENTANA"));
    }, ESPERA_MS);
    pedido = {
      id,
      resolver: (jpeg) => {
        clearTimeout(vence);
        resolver(jpeg);
      },
      rechazar: (e) => {
        clearTimeout(vence);
        rechazar(e);
      },
    };
  });
}

/** La ventana manda la foto (imagen JPEG en formato data URL). */
export function recibirFoto(id: number, dataUrl: unknown): void {
  if (!pedido || pedido.id !== id) throw new Error("Esa foto ya no se esperaba.");
  const prefijo = "data:image/jpeg;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefijo)) throw new Error("No es una foto JPEG.");
  const datos = Buffer.from(dataUrl.slice(prefijo.length), "base64");
  // Firma de JPEG: FF D8 FF
  if (datos.length > MAX_FOTO || datos[0] !== 0xff || datos[1] !== 0xd8 || datos[2] !== 0xff) {
    throw new Error("La foto está dañada o es demasiado grande.");
  }
  const p = pedido;
  pedido = null;
  p.resolver(datos);
}

/** La ventana avisa que no pudo usar la cámara (sin permiso, sin cámara...). */
export function fallaFoto(id: number, motivo: string): void {
  if (!pedido || pedido.id !== id) return;
  const p = pedido;
  pedido = null;
  p.rechazar(new Error(motivo.slice(0, 200) || "No pude usar la cámara."));
}

/** Guarda una foto en Documentos\Jarvis\Fotos y devuelve dónde quedó. */
export async function guardarFoto(jpeg: Buffer): Promise<string> {
  const carpeta = path.join((await carpetasUsuario()).jarvis, "Fotos");
  await mkdir(carpeta, { recursive: true });
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const nombre = `foto-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}.jpg`;
  await writeFile(path.join(carpeta, nombre), jpeg);
  return `Documentos\\Jarvis\\Fotos\\${nombre}`;
}

/** Instrucciones para que Gemini describa la foto. */
export function pedidoDeVista(pregunta: string): string {
  return (
    `Esta es una foto que acaba de tomar la cámara de la laptop del usuario. Él pregunta: "${pregunta}".\n` +
    "Responde en español, claro y concreto: qué se ve y lo que pregunta. Si hay texto, léelo. Si es un ejercicio o " +
    "problema, explícalo y resuélvelo paso a paso. Si algo no se distingue bien (está borroso u oscuro), dilo y " +
    "sugiere acercarlo o mejorar la luz. No inventes lo que no se ve. No digas quién es una persona por su cara."
  );
}
