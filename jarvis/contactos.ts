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
const MAX = 3000;

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
  const contienen = lista.filter((c) => {
    const nombre = sinAcentos(c.nombre);
    return palabras.every((w) => nombre.includes(w));
  });
  if (contienen.length) return contienen;
  // Perdona errores de escritura ("Gutierrrez", "Gutierez", "Anabell"): cada palabra pedida debe parecerse mucho a
  // alguna palabra del nombre (1 letra distinta en palabras cortas, 2 en largas). Se quedan los más parecidos.
  const parecidos = lista
    .map((c) => {
      const del = sinAcentos(c.nombre).split(" ");
      let total = 0;
      for (const w of palabras) {
        const mejor = Math.min(...del.map((x) => distancia(w, x)));
        if (mejor > (w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0)) return null;
        total += mejor;
      }
      return { c, total };
    })
    .filter((x): x is { c: Contacto; total: number } => x !== null);
  const menor = Math.min(...parecidos.map((x) => x.total));
  return parecidos.filter((x) => x.total === menor).map((x) => x.c);
}

/** Cuántas letras hay que cambiar, poner o quitar para pasar de una palabra a otra (distancia de Levenshtein). */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[b.length];
}

/** Número para mostrar: +52 81 1234 5678. */
export function telefonoLegible(t: string): string {
  if (t.startsWith("52") && t.length === 12) return `+52 ${t.slice(2, 4)} ${t.slice(4, 8)} ${t.slice(8)}`;
  return `+${t}`;
}

// ------------------------------------------------------------------ importar todos los contactos del celular

/** Lee un archivo de contactos: vCard (.vcf, de Google Contactos o iPhone) o CSV (de Google Contactos u Outlook). */
export function leerArchivoContactos(texto: string): Contacto[] {
  const limpio = texto.replace(/^\uFEFF/, "");
  return /BEGIN:VCARD/i.test(limpio) ? leerVcard(limpio) : leerCsv(limpio);
}

function decodificarQP(t: string): string {
  // "Quoted-printable" (lo usan algunos celulares viejos para acentos): =C3=A1 → á
  const bytes = t.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  try {
    return Buffer.from(bytes, "latin1").toString("utf8");
  } catch {
    return t;
  }
}

function leerVcard(texto: string): Contacto[] {
  const lineas = texto.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const salida: Contacto[] = [];
  let nombre = "";
  let n = "";
  let telefonos: { valor: string; celular: boolean }[] = [];
  for (const linea of lineas) {
    const i = linea.indexOf(":");
    const clave = (i > 0 ? linea.slice(0, i) : linea).toUpperCase();
    let valor = i > 0 ? linea.slice(i + 1) : "";
    if (/ENCODING=QUOTED-PRINTABLE/.test(clave)) valor = decodificarQP(valor);
    if (clave === "BEGIN" || clave.startsWith("BEGIN")) {
      nombre = "";
      n = "";
      telefonos = [];
    } else if (clave.startsWith("FN")) nombre = valor.replace(/\\,/g, ",").trim();
    else if (clave === "N" || clave.startsWith("N;")) {
      const [apellido = "", nom = ""] = valor.split(";");
      n = `${nom} ${apellido}`.trim();
    } else if (clave.startsWith("TEL") || /\.TEL/.test(clave)) {
      telefonos.push({ valor, celular: /CELL|MOBILE|IPHONE/.test(clave) });
    } else if (clave.startsWith("END")) {
      const elegido = telefonos.find((t) => t.celular) ?? telefonos[0];
      const tel = elegido ? normalizarTelefono(elegido.valor) : null;
      const quien = (nombre || n).trim();
      if (quien && tel) salida.push({ nombre: quien.slice(0, 80), telefono: tel });
    }
  }
  return salida;
}

function filasCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim()));
}

function leerCsv(texto: string): Contacto[] {
  const [encabezado, ...filas] = filasCsv(texto);
  if (!encabezado) return [];
  const col = (re: RegExp) => encabezado.findIndex((h) => re.test(h.trim()));
  const iNombre = col(/^(name|nombre|display name|nombre completo)$/i);
  const iPrimer = col(/^(first name|given name|nombre de pila)$/i);
  const iMedio = col(/^(middle name|additional name|segundo nombre)$/i);
  const iApellido = col(/^(last name|family name|apellidos?)$/i);
  // Columnas de teléfono: primero las de celular
  const telefonos = encabezado
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(({ h }) => /phone.*value|mobile phone|primary phone|home phone|business phone|tel[eé]fono|celular|^phone$/i.test(h))
    .sort((a, b) => Number(/mobile|celular|cell/i.test(b.h)) - Number(/mobile|celular|cell/i.test(a.h)));
  const salida: Contacto[] = [];
  for (const f of filas) {
    const nombre = (
      (iNombre >= 0 && f[iNombre]?.trim()) ||
      [iPrimer, iMedio, iApellido].map((i) => (i >= 0 ? f[i]?.trim() : "")).filter(Boolean).join(" ")
    ).trim();
    // Google junta varios números con " ::: "
    const crudo = telefonos.map(({ i }) => f[i] ?? "").find((v) => v.trim()) ?? "";
    const tel = normalizarTelefono(crudo.split(":::")[0]);
    if (nombre && tel) salida.push({ nombre: nombre.slice(0, 80), telefono: tel });
  }
  return salida;
}

/** Junta los contactos importados con los que ya había (los nuevos reemplazan a los del mismo nombre). */
export function importarContactos(nuevos: Contacto[]): { agregados: number; total: number } {
  const porNombre = new Map(leerContactos().map((c) => [sinAcentos(c.nombre), c]));
  let agregados = 0;
  for (const c of nuevos) {
    const clave = sinAcentos(c.nombre);
    if (!clave) continue;
    if (!porNombre.has(clave)) agregados++;
    porNombre.set(clave, c);
  }
  const lista = [...porNombre.values()];
  guardar(lista);
  return { agregados, total: Math.min(lista.length, MAX) };
}
