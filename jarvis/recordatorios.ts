/**
 * Recordatorios y alarmas: "recuérdame en 20 minutos sacar la comida", "avísame mañana a las 7".
 * Se guardan en datos/recordatorios.json (sobreviven si se apaga la laptop) y Jarvis los dice en voz alta
 * cuando llega la hora (o en cuanto se vuelve a encender, si la laptop estaba apagada).
 */

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

export interface Recordatorio {
  id: string;
  texto: string;
  cuando: number; // fecha y hora en milisegundos
}

const ARCHIVO = path.join(CARPETA_DATOS, "recordatorios.json");
const MAX_RECORDATORIOS = 100;

export function leerRecordatorios(): Recordatorio[] {
  try {
    const lista = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(lista)
      ? lista.filter((r) => r && typeof r.texto === "string" && Number.isFinite(r.cuando)).sort((a, b) => a.cuando - b.cuando)
      : [];
  } catch {
    return [];
  }
}

function guardar(lista: Recordatorio[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO, JSON.stringify(lista, null, 2), "utf8");
}

export function agregarRecordatorio(texto: string, cuando: number): Recordatorio {
  const r: Recordatorio = { id: randomUUID().slice(0, 6), texto: texto.trim().slice(0, 300), cuando };
  guardar([...leerRecordatorios(), r].slice(-MAX_RECORDATORIOS));
  return r;
}

export function cancelarRecordatorio(id: string): Recordatorio | undefined {
  const lista = leerRecordatorios();
  const r = lista.find((x) => x.id === id);
  if (r) guardar(lista.filter((x) => x.id !== id));
  return r;
}

/** Fecha legible en español: "hoy a las 18:30", "mañana a las 07:00", "sábado 12 de octubre a las 09:00". */
export function cuandoLegible(ms: number): string {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`;
  if (d.toDateString() === manana.toDateString()) return `mañana a las ${hora}`;
  return `${d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} a las ${hora}`;
}

/**
 * Revisa cada 15 segundos si ya toca algún recordatorio; cuando toca, llama `avisar` y lo borra.
 * Los que vencieron mientras la laptop estaba apagada se avisan al encender (con "se le pasó a las...").
 */
export function vigilarRecordatorios(avisar: (r: Recordatorio, atrasado: boolean) => void): void {
  const revisar = () => {
    const ahora = Date.now();
    const lista = leerRecordatorios();
    const vencidos = lista.filter((r) => r.cuando <= ahora);
    if (!vencidos.length) return;
    guardar(lista.filter((r) => r.cuando > ahora));
    for (const r of vencidos) avisar(r, ahora - r.cuando > 2 * 60 * 1000);
  };
  setTimeout(revisar, 5000);
  setInterval(revisar, 15000);
}
