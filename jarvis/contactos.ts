/**
 * Contactos para WhatsApp: "comunícame con Anabel Gutiérrez" → Jarvis busca su número y abre su chat en WhatsApp.
 *
 * Jarvis NO puede leer los contactos de WhatsApp (ni conviene), así que tiene su propia libreta: el usuario le dice
 * "guarda a Anabel Gutiérrez, su número es 81 1234 5678" o los agrega en Ajustes → WhatsApp. Se guarda solo en la
 * laptop (datos/contactos.json), nunca en internet.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "contactos.json");
const MAX = 300;

export interface Contacto {
  nombre: string;
  telefono: string; // con lada de país, solo dígitos (México: 52 + 10 dígitos)
}

export function leerContactos(): Contacto[] {
  try {
    const lista = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return Array.isArray(lista) ? lista.filter((c) => c?.nombre && c?.telefono) : [];
  } catch {
    return [];
  }
}

function guardar(lista: Contacto[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  const orden = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  writeFileSync(ARCHIVO, JSON.stringify(orden.slice(0, MAX), null, 2), "utf8");
}

const sinAcentos = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Deja el teléfono como lo pide WhatsApp: solo dígitos y con lada de país (10 dígitos de México → 52...). */
export function normalizarTelefono(texto: string): string | null {
  let d = texto.replace(/[^\d+]/g, "");
  const conMas = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!conMas && d.length === 10) d = "52" + d; // número de México sin lada de país
  if (d.startsWith("521") && d.length === 13) d = "52" + d.slice(3); // formato viejo de celulares de México
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function guardarContacto(nombre: string, telefono: string): Contacto {
  const n = nombre.replace(/\s+/g, " ").trim().slice(0, 80);
  const t = normalizarTelefono(telefono);
  if (!n) throw new Error("Falta el nombre del contacto.");
  if (!t) throw new Error("Ese número no parece válido. Dímelo con sus 10 dígitos (o con lada de país si es de otro país).");
  const lista = leerContactos().filter((c) => sinAcentos(c.nombre) !== sinAcentos(n));
  const nuevo = { nombre: n, telefono: t };
  guardar([...lista, nuevo]);
  return nuevo;
}

export function borrarContacto(nombre: string): boolean {
  const lista = leerContactos();
  const queda = lista.filter((c) => sinAcentos(c.nombre) !== sinAcentos(nombre));
  if (queda.length === lista.length) return false;
  guardar(queda);
  return true;
}

/**
 * Busca a quién se refiere el usuario: primero el nombre exacto, luego los que contienen todas las palabras
 * ("Anabel" encuentra "Anabel Gutiérrez"). Devuelve todos los parecidos para poder preguntar si hay varios.
 */
export function buscarContacto(pedido: string): Contacto[] {
  const p = sinAcentos(pedido);
  if (!p) return [];
  const lista = leerContactos();
  const exacto = lista.filter((c) => sinAcentos(c.nombre) === p);
  if (exacto.length) return exacto;
  const palabras = p.split(" ").filter((w) => w.length > 1);
  return lista.filter((c) => {
    const nombre = sinAcentos(c.nombre);
    return palabras.every((w) => nombre.includes(w));
  });
}

/** Número para mostrar: +52 81 1234 5678. */
export function telefonoLegible(t: string): string {
  if (t.startsWith("52") && t.length === 12) return `+52 ${t.slice(2, 4)} ${t.slice(4, 8)} ${t.slice(8)}`;
  return `+${t}`;
}
