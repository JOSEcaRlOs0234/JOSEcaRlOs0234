/**
 * El agente: conversa con Gemini y, cuando Gemini quiere hacer algo en la laptop,
 * revisa la acción, pide permiso al usuario si hace falta, la ejecuta y le cuenta el resultado a Gemini.
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { ErrorHerramienta, NOMBRES_PERMISOS, Revisada, revisar } from "./herramientas.ts";
import { registrar } from "./registro.ts";
import { CARPETA_DATOS } from "./ubicacion.mjs";

/** Función que le pregunta a Gemini; recibe la conversación y devuelve su respuesta. */
export type PreguntarModelo = (contents: any[]) => Promise<{ content: any; texto: string; llamadas: Llamada[] }>;

export interface Llamada {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Confirmacion {
  id: string;
  descripcion: string;
  delicada: boolean;
  tipo: string;
  nombreTipo?: string;
}

export type Resultado = { texto: string } | { confirmacion: Confirmacion };

interface Pendiente {
  contents: any[];
  llamadas: Llamada[];
  respuestas: any[];
  indice: number;
  revisada: Revisada;
  creado: number;
  vueltas: number;
}

const MAX_VUELTAS = 6;
const CADUCA_MS = 5 * 60 * 1000;

// ------------------------------------------------------------------ permisos recordados

const ARCHIVO_PERMISOS = path.join(CARPETA_DATOS, "permisos.json");

function leerPermisos(): Set<string> {
  try {
    const lista = JSON.parse(readFileSync(ARCHIVO_PERMISOS, "utf8"));
    return new Set((Array.isArray(lista) ? lista : []).filter((t) => t in NOMBRES_PERMISOS));
  } catch {
    return new Set();
  }
}

function guardarPermisos(permisos: Set<string>): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_PERMISOS, JSON.stringify([...permisos], null, 2), "utf8");
}

export function permisosRecordados(): { tipo: string; nombre: string }[] {
  return [...leerPermisos()].map((tipo) => ({ tipo, nombre: NOMBRES_PERMISOS[tipo] }));
}

export function olvidarPermiso(tipo: string): void {
  const permisos = leerPermisos();
  permisos.delete(tipo);
  guardarPermisos(permisos);
  registrar("PERMISO", `Se quitó el permiso permanente: ${NOMBRES_PERMISOS[tipo] ?? tipo}`);
}

// ------------------------------------------------------------------ el agente

export class Agente {
  private pendientes = new Map<string, Pendiente>();

  constructor(private preguntar: PreguntarModelo) {}

  /** Nueva conversación del usuario. */
  async conversar(contents: any[]): Promise<Resultado> {
    return this.avanzar(contents, 0);
  }

  /** El usuario respondió a una pregunta de permiso. */
  async responderPermiso(id: string, aprobado: boolean, recordar: boolean): Promise<Resultado> {
    this.limpiarViejos();
    const p = this.pendientes.get(id);
    if (!p) throw new ErrorHerramienta("Esa pregunta de permiso ya caducó. Vuelve a pedírmelo.");
    this.pendientes.delete(id);

    const llamada = p.llamadas[p.indice];
    if (aprobado) {
      registrar("PERMISO", `Aprobado: ${p.revisada.descripcion}`);
      if (recordar && p.revisada.nivel === "normal" && p.revisada.tipo in NOMBRES_PERMISOS) {
        const permisos = leerPermisos();
        permisos.add(p.revisada.tipo);
        guardarPermisos(permisos);
        registrar("PERMISO", `Ya no preguntaré para: ${NOMBRES_PERMISOS[p.revisada.tipo]}`);
      }
      p.respuestas.push(await this.ejecutar(llamada, p.revisada));
    } else {
      registrar("PERMISO", `Rechazado: ${p.revisada.descripcion}`);
      p.respuestas.push(respuesta(llamada, { error: "El usuario NO dio permiso. No lo intentes de nuevo." }));
    }
    return this.seguirLlamadas(p.contents, p.llamadas, p.respuestas, p.indice + 1, p.vueltas);
  }

  private async avanzar(contents: any[], vueltas: number): Promise<Resultado> {
    if (vueltas >= MAX_VUELTAS) {
      return { texto: "He hecho varias acciones seguidas y me detuve por seguridad. ¿Qué más necesita, señor?" };
    }
    const r = await this.preguntar(contents);
    if (!r.llamadas.length) return { texto: r.texto };
    contents.push(r.content);
    return this.seguirLlamadas(contents, r.llamadas, [], 0, vueltas);
  }

  /** Procesa las acciones que pidió Gemini, una por una, pausando cuando hay que pedir permiso. */
  private async seguirLlamadas(
    contents: any[],
    llamadas: Llamada[],
    respuestas: any[],
    desde: number,
    vueltas: number
  ): Promise<Resultado> {
    for (let i = desde; i < llamadas.length; i++) {
      const llamada = llamadas[i];
      let revisada: Revisada;
      try {
        revisada = await revisar(llamada.name, llamada.args ?? {});
      } catch (err) {
        const motivo = err instanceof ErrorHerramienta ? err.message : "No se pudo revisar la acción.";
        registrar("ACCION", `Rechazada por las reglas: ${llamada.name} → ${motivo}`);
        respuestas.push(respuesta(llamada, { error: motivo }));
        continue;
      }

      const recordado = revisada.nivel === "normal" && leerPermisos().has(revisada.tipo);
      if (revisada.nivel === "libre" || recordado) {
        respuestas.push(await this.ejecutar(llamada, revisada));
        continue;
      }

      // Hay que preguntarle al usuario: se guarda todo y se pausa
      const id = randomUUID();
      this.pendientes.set(id, { contents, llamadas, respuestas, indice: i, revisada, creado: Date.now(), vueltas });
      registrar("PERMISO", `Pidiendo permiso: ${revisada.descripcion}`);
      return {
        confirmacion: {
          id,
          descripcion: revisada.descripcion,
          delicada: revisada.nivel === "delicada",
          tipo: revisada.tipo,
          nombreTipo: revisada.nivel === "normal" ? NOMBRES_PERMISOS[revisada.tipo] : undefined,
        },
      };
    }

    contents.push({ role: "user", parts: respuestas });
    return this.avanzar(contents, vueltas + 1);
  }

  private async ejecutar(llamada: Llamada, revisada: Revisada): Promise<any> {
    try {
      const resultado = await revisada.ejecutar();
      registrar("ACCION", `Hecho: ${revisada.descripcion}`);
      return respuesta(llamada, resultado);
    } catch (err: any) {
      const motivo = err instanceof ErrorHerramienta ? err.message : "Falló al ejecutarse.";
      registrar("ERROR", `Falló: ${revisada.descripcion} → ${motivo} ${err instanceof ErrorHerramienta ? "" : String(err?.message ?? err).slice(0, 200)}`);
      return respuesta(llamada, { error: motivo });
    }
  }

  private limpiarViejos(): void {
    const ahora = Date.now();
    for (const [id, p] of this.pendientes) if (ahora - p.creado > CADUCA_MS) this.pendientes.delete(id);
  }
}

function respuesta(llamada: Llamada, contenido: Record<string, unknown>) {
  return { functionResponse: { ...(llamada.id ? { id: llamada.id } : {}), name: llamada.name, response: contenido } };
}
