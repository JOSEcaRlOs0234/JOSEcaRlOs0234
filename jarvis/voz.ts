/**
 * Reconocer la voz del usuario: cuando Jarvis oye ESA voz (y no la de otra persona), se abre.
 *
 * Usa Picovoice Eagle (reconocimiento de quién habla, todo dentro de la laptop, sin mandar audio a internet) con la
 * MISMA clave gratuita de Picovoice que la palabra "Jarvis". Primero se crea la "huella de voz" (perfil):
 *  - de las notas de voz que mandó el usuario (carpeta voz/, audio 16 kHz; se copian a datos/voz al iniciar), y/o
 *  - con el botón "Enséñale tu voz" (habla ~20 segundos frente a la laptop; sirve mejor porque es el mismo micrófono).
 * El perfil se guarda en datos/voz-perfil.bin. Nada de esto sube a GitHub (son datos de voz del usuario).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO_PERFIL = path.join(CARPETA_DATOS, "voz-perfil.bin");
const CARPETA_MUESTRAS = path.join(CARPETA_DATOS, "voz");
const CARPETA_PROGRAMA = path.join(path.dirname(fileURLToPath(import.meta.url)), "voz");

/** Copia las muestras de voz que vienen con el programa a la carpeta de datos (así no se pierden al actualizar). */
export function copiarMuestras(): void {
  try {
    if (!existsSync(CARPETA_PROGRAMA)) return;
    mkdirSync(CARPETA_MUESTRAS, { recursive: true });
    for (const nombre of readdirSync(CARPETA_PROGRAMA).filter((n) => n.endsWith(".pcm"))) {
      const destino = path.join(CARPETA_MUESTRAS, nombre);
      const origen = path.join(CARPETA_PROGRAMA, nombre);
      if (!existsSync(destino) || statSync(destino).size !== statSync(origen).size) copyFileSync(origen, destino);
    }
  } catch {
    // Sin muestras se puede enseñar la voz con el micrófono
  }
}

export const hayPerfil = () => existsSync(ARCHIVO_PERFIL);

export function olvidarPerfil(): void {
  rmSync(ARCHIVO_PERFIL, { force: true });
}

/** Sensibilidad 1..10 → puntaje mínimo de parecido (1 = muy estricto 0.9, 10 = muy fácil 0.45). */
export const umbralVoz = (s: number) => Math.round((0.9 - (Math.min(10, Math.max(1, s)) - 1) * 0.05) * 100) / 100;

/** Lee las muestras (audio crudo de 16 bits, 16 kHz, una sola voz). */
function muestras(): Int16Array[] {
  if (!existsSync(CARPETA_MUESTRAS)) return [];
  return readdirSync(CARPETA_MUESTRAS)
    .filter((n) => n.endsWith(".pcm"))
    .sort()
    .map((n) => {
      const b = readFileSync(path.join(CARPETA_MUESTRAS, n));
      return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2));
    });
}

/** Aprende la voz poco a poco: se le dan pedazos de audio hasta llegar a 100 %. */
export class AprendizVoz {
  private profiler: any;
  private resto = new Int16Array(0);
  porcentaje = 0;

  private constructor(profiler: any) {
    this.profiler = profiler;
  }

  static async crear(clave: string): Promise<AprendizVoz> {
    const { EagleProfiler } = await import("@picovoice/eagle-node");
    return new AprendizVoz(new EagleProfiler(clave));
  }

  /** Agrega audio (de cualquier tamaño). Devuelve el porcentaje aprendido. */
  agregar(audio: Int16Array): number {
    const largo = this.profiler.frameLength as number;
    const junto = new Int16Array(this.resto.length + audio.length);
    junto.set(this.resto);
    junto.set(audio, this.resto.length);
    let i = 0;
    for (; i + largo <= junto.length && this.porcentaje < 100; i += largo) {
      this.porcentaje = this.profiler.enroll(junto.slice(i, i + largo));
    }
    this.resto = this.porcentaje < 100 ? junto.slice(i) : new Int16Array(0);
    return this.porcentaje;
  }

  /** Termina: si llegó a 100 %, guarda el perfil y devuelve true. */
  terminar(): boolean {
    try {
      if (this.porcentaje < 100) this.porcentaje = this.profiler.flush();
      if (this.porcentaje < 100) return false;
      mkdirSync(CARPETA_DATOS, { recursive: true });
      writeFileSync(ARCHIVO_PERFIL, Buffer.from(this.profiler.export()));
      return true;
    } finally {
      this.liberar();
    }
  }

  liberar(): void {
    try {
      this.profiler?.release();
    } catch {
      // Ya estaba liberado
    }
    this.profiler = null;
  }
}

/** Crea el perfil con las notas de voz que mandó el usuario (si las hay). Devuelve el porcentaje alcanzado. */
export async function perfilDesdeMuestras(clave: string): Promise<number> {
  const lista = muestras();
  if (!lista.length) return 0;
  const aprendiz = await AprendizVoz.crear(clave);
  for (const audio of lista) aprendiz.agregar(audio);
  const listo = aprendiz.terminar();
  return listo ? 100 : aprendiz.porcentaje;
}

/** Escucha y dice si quien habla es el usuario. */
export class ReconocedorVoz {
  private eagle: any;
  private perfil: Uint8Array;
  private minimo: number;
  private resto = new Int16Array(0);
  private seguidos = 0;
  ultimoPuntaje = 0;
  umbral: number;

  private constructor(eagle: any, perfil: Uint8Array, umbral: number) {
    this.eagle = eagle;
    this.perfil = perfil;
    // Pedazos de al menos medio segundo para que el parecido sea estable
    this.minimo = Math.max(eagle.minProcessSamples ?? 0, 8000);
    this.umbral = umbral;
  }

  static async crear(clave: string, sensibilidad: number): Promise<ReconocedorVoz | null> {
    if (!hayPerfil()) return null;
    const { Eagle } = await import("@picovoice/eagle-node");
    return new ReconocedorVoz(new Eagle(clave), new Uint8Array(readFileSync(ARCHIVO_PERFIL)), umbralVoz(sensibilidad));
  }

  /**
   * Procesa audio del micrófono. Devuelve true cuando reconoce la voz del usuario en DOS pedazos seguidos
   * (así un ruido o una palabra suelta de otra persona no la abre).
   */
  procesar(audio: Int16Array): boolean {
    const junto = new Int16Array(this.resto.length + audio.length);
    junto.set(this.resto);
    junto.set(audio, this.resto.length);
    if (junto.length < this.minimo) {
      this.resto = junto;
      return false;
    }
    this.resto = new Int16Array(0);
    const puntajes = this.eagle.process(junto, this.perfil) as number[] | null;
    if (!puntajes) return false; // no había voz en ese pedazo (silencio, música suave...)
    this.ultimoPuntaje = Math.round((puntajes[0] ?? 0) * 100) / 100;
    this.seguidos = this.ultimoPuntaje >= this.umbral ? this.seguidos + 1 : 0;
    if (this.seguidos >= 2) {
      this.seguidos = 0;
      return true;
    }
    return false;
  }

  liberar(): void {
    try {
      this.eagle?.release();
    } catch {
      // Ya estaba liberado
    }
    this.eagle = null;
  }
}
