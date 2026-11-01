/**
 * Red neuronal de memoria de Jarvis.
 *
 * Cada cosa que Jarvis aprende del usuario es un NODO ("neurona"). Una red neuronal de Google (embeddings de Gemini,
 * gratis con la misma clave) convierte cada recuerdo en un vector que representa su SIGNIFICADO; los nodos con
 * significado parecido quedan CONECTADOS. Para recordar, se activan los nodos más parecidos a lo que se habla y la
 * activación se "propaga" a sus vecinos (como en el cerebro): así Jarvis recuerda cosas relacionadas aunque no se
 * usen las mismas palabras.
 *
 * Aprende solo: después de platicar, revisa lo hablado y guarda los datos útiles sobre el usuario (nunca contraseñas,
 * números de tarjeta ni cosas así). Todo vive en la laptop (datos/red-memoria.json) y se puede ver y borrar en el panel.
 * Si los embeddings no funcionan (sin internet o límite), la red sigue funcionando con búsqueda por palabras.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const ARCHIVO = path.join(CARPETA_DATOS, "red-memoria.json");
const MAX_NODOS = 800;
const MAX_LARGO = 300;
const UMBRAL_CONEXION = 0.62; // parecido mínimo para conectar dos nodos
const UMBRAL_REPETIDO = 0.95; // tan parecido que es el mismo recuerdo

export type TipoNodo = "dato" | "gusto" | "estudio" | "plan" | "persona" | "tema";
export const TIPOS: TipoNodo[] = ["dato", "gusto", "estudio", "plan", "persona", "tema"];

export interface Nodo {
  id: string;
  texto: string;
  tipo: TipoNodo;
  creado: number;
  usado: number; // cuántas veces se ha recordado (las neuronas usadas "brillan" más)
  vector?: number[];
}

interface Guardado {
  nodos: Nodo[];
  sembrado?: boolean; // ya se pasaron los recuerdos viejos a la red
}

// ------------------------------------------------------------------ cerebro (lo conecta el servidor)

let incrustar: ((textos: string[]) => Promise<number[][]>) | null = null;
let extraer: ((conversacion: string) => Promise<{ texto: string; tipo: string }[]>) | null = null;
let alAprender: ((nuevos: Nodo[]) => void) | null = null;

export function conectarRed(f: {
  incrustar: (textos: string[]) => Promise<number[][]>;
  extraer: (conversacion: string) => Promise<{ texto: string; tipo: string }[]>;
  alAprender?: (nuevos: Nodo[]) => void;
}): void {
  incrustar = f.incrustar;
  extraer = f.extraer;
  alAprender = f.alAprender ?? null;
}

// ------------------------------------------------------------------ guardar y leer

function leer(): Guardado {
  try {
    const g = JSON.parse(readFileSync(ARCHIVO, "utf8"));
    return { nodos: Array.isArray(g.nodos) ? g.nodos : [], sembrado: g.sembrado === true };
  } catch {
    return { nodos: [] };
  }
}

function guardar(g: Guardado): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  // Si se llena, se olvidan primero los menos usados y más viejos
  if (g.nodos.length > MAX_NODOS) {
    g.nodos = [...g.nodos].sort((a, b) => b.usado - a.usado || b.creado - a.creado).slice(0, MAX_NODOS);
  }
  const redondear = (v?: number[]) => v?.map((x) => Math.round(x * 10000) / 10000);
  writeFileSync(ARCHIVO, JSON.stringify({ ...g, nodos: g.nodos.map((n) => ({ ...n, vector: redondear(n.vector) })) }), "utf8");
}

// ------------------------------------------------------------------ matemáticas de la red

export function parecido(a?: number[], b?: number[]): number {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let p = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    p += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? p / Math.sqrt(na * nb) : 0;
}

const palabras = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

/** Parecido por palabras (plan B cuando no hay vectores). */
function parecidoPalabras(a: string, b: string): number {
  const A = palabras(a);
  const B = palabras(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / Math.sqrt(A.size * B.size);
}

const similitud = (a: Nodo, b: { texto: string; vector?: number[] }) =>
  a.vector && b.vector ? parecido(a.vector, b.vector) : parecidoPalabras(a.texto, b.texto);

/** Conexiones de la red: cada nodo con sus vecinos más parecidos (máximo 4 por nodo). */
export function conexiones(nodos: Nodo[]): { a: string; b: string; fuerza: number }[] {
  const lista: { a: string; b: string; fuerza: number }[] = [];
  const vistos = new Set<string>();
  // El umbral se adapta a la red: con muchas neuronas solo se conectan el 20 % de parejas más parecidas
  // (los embeddings reales dan parecidos altos aun entre temas distintos)
  let umbral = UMBRAL_CONEXION;
  const conVector = nodos.filter((n) => n.vector);
  if (conVector.length >= 8) {
    const todos: number[] = [];
    for (let i = 0; i < conVector.length; i++)
      for (let j = i + 1; j < conVector.length; j++) todos.push(parecido(conVector[i].vector, conVector[j].vector));
    todos.sort((a, b) => a - b);
    umbral = Math.max(UMBRAL_CONEXION, todos[Math.floor(todos.length * 0.8)] ?? UMBRAL_CONEXION);
  }
  for (const n of nodos) {
    const vecinos = nodos
      .filter((m) => m.id !== n.id)
      .map((m) => ({ m, s: similitud(n, m) }))
      .filter((x) => x.s >= (n.vector && x.m.vector ? umbral : 0.34))
      .sort((x, y) => y.s - x.s)
      .slice(0, 4);
    for (const { m, s } of vecinos) {
      const clave = [n.id, m.id].sort().join("|");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push({ a: n.id, b: m.id, fuerza: Math.round(s * 100) / 100 });
    }
  }
  return lista;
}

async function vectorDe(texto: string): Promise<number[] | undefined> {
  if (!incrustar) return undefined;
  try {
    return (await incrustar([texto]))[0];
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ aprender y olvidar

/** Agrega un nodo (o refuerza uno igual que ya existía). Devuelve el nodo y si es nuevo. */
export async function aprender(texto: string, tipo: string = "dato"): Promise<{ nodo: Nodo; nuevo: boolean } | null> {
  const t = texto.replace(/\s+/g, " ").trim().slice(0, MAX_LARGO);
  if (t.length < 4) return null;
  const vector = await vectorDe(t);
  const g = leer();
  const igual = g.nodos
    .map((n) => ({ n, s: similitud(n, { texto: t, vector }) }))
    .sort((a, b) => b.s - a.s)[0];
  if (igual && igual.s >= (vector && igual.n.vector ? UMBRAL_REPETIDO : 0.9)) {
    // Ya lo sabía: se refuerza (y se queda con la versión más nueva del texto)
    igual.n.texto = t;
    igual.n.usado += 1;
    if (vector) igual.n.vector = vector;
    guardar(g);
    return { nodo: igual.n, nuevo: false };
  }
  const nodo: Nodo = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    texto: t,
    tipo: (TIPOS as string[]).includes(tipo) ? (tipo as TipoNodo) : "dato",
    creado: Date.now(),
    usado: 0,
    vector,
  };
  g.nodos.push(nodo);
  guardar(g);
  return { nodo, nuevo: true };
}

export function olvidar(id: string): Nodo | undefined {
  const g = leer();
  const nodo = g.nodos.find((n) => n.id === id);
  if (!nodo) return undefined;
  guardar({ ...g, nodos: g.nodos.filter((n) => n.id !== id) });
  return nodo;
}

export function olvidarTodo(): void {
  guardar({ nodos: [], sembrado: true });
}

/** La primera vez, los recuerdos que Jarvis ya tenía pasan a ser neuronas de la red. */
export async function sembrar(recuerdos: string[]): Promise<void> {
  const g = leer();
  if (g.sembrado) return;
  guardar({ ...g, sembrado: true });
  for (const r of recuerdos) await aprender(r, "dato");
}

/** Vuelve a calcular los vectores que falten (por ejemplo, si se guardaron sin internet). */
export async function completarVectores(): Promise<number> {
  if (!incrustar) return 0;
  const g = leer();
  const faltan = g.nodos.filter((n) => !n.vector).slice(0, 50);
  if (!faltan.length) return 0;
  try {
    const vectores = await incrustar(faltan.map((n) => n.texto));
    faltan.forEach((n, i) => (n.vector = vectores[i]));
    guardar(g);
    return faltan.length;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------ recordar (activación que se propaga)

export interface Recordado {
  id: string;
  texto: string;
  tipo: TipoNodo;
  activacion: number;
}

/**
 * Activa los nodos parecidos a la consulta y propaga la activación a sus vecinos (la mitad de fuerte).
 * Devuelve los más activos.
 */
export async function recordar(consulta: string, cuantos = 6, marcarUsados = true): Promise<Recordado[]> {
  const g = leer();
  if (!g.nodos.length || !consulta.trim()) return [];
  const vector = await vectorDe(consulta.slice(0, 2000));
  const base = new Map<string, number>();
  for (const n of g.nodos) base.set(n.id, similitud(n, { texto: consulta, vector }));
  const activacion = new Map(base);
  for (const { a, b, fuerza } of conexiones(g.nodos)) {
    activacion.set(a, Math.max(activacion.get(a) ?? 0, (base.get(b) ?? 0) * fuerza * 0.5));
    activacion.set(b, Math.max(activacion.get(b) ?? 0, (base.get(a) ?? 0) * fuerza * 0.5));
  }
  const minimo = vector ? 0.58 : 0.2;
  const elegidos = g.nodos
    .map((n) => ({ n, act: activacion.get(n.id) ?? 0 }))
    .filter((x) => x.act >= minimo)
    .sort((x, y) => y.act - x.act)
    .slice(0, cuantos);
  if (marcarUsados && elegidos.length) {
    for (const { n } of elegidos) n.usado += 1;
    guardar(g);
  }
  return elegidos.map(({ n, act }) => ({ id: n.id, texto: n.texto, tipo: n.tipo, activacion: Math.round(act * 100) / 100 }));
}

/** Texto para las instrucciones de Gemini con los recuerdos activados por lo que se está hablando. */
export async function recuerdosRelacionados(consulta: string): Promise<string> {
  try {
    const r = await recordar(consulta, 6);
    return r.length
      ? "RED DE MEMORIA (recuerdos tuyos sobre el usuario relacionados con lo que se habla; úsalos con naturalidad, " +
          "sin recitarlos):\n" +
          r.map((x) => `- ${x.texto}`).join("\n")
      : "";
  } catch {
    return "";
  }
}

// ------------------------------------------------------------------ aprendizaje automático

let pendientes: string[] = [];
let temporizador: ReturnType<typeof setTimeout> | undefined;
let aprendiendo = false;

/**
 * Después de cada respuesta se anota el intercambio. Cada 4 intercambios (o tras 2 minutos sin hablar) Jarvis revisa lo
 * platicado y guarda lo importante. Se hace por tandas para no gastar el límite gratuito de Gemini.
 */
export function anotarIntercambio(usuario: string, jarvis: string): void {
  if (!extraer || usuario.trim().length < 12) return;
  pendientes.push(`USUARIO: ${usuario.slice(0, 1500)}\nJARVIS: ${jarvis.slice(0, 800)}`);
  clearTimeout(temporizador);
  if (pendientes.length >= 4) void procesarPendientes();
  else temporizador = setTimeout(() => void procesarPendientes(), 2 * 60 * 1000);
}

export async function procesarPendientes(): Promise<Nodo[]> {
  if (aprendiendo || !extraer || !pendientes.length) return [];
  aprendiendo = true;
  const lote = pendientes.join("\n\n");
  pendientes = [];
  const nuevos: Nodo[] = [];
  try {
    const datos = await extraer(lote);
    for (const d of datos.slice(0, 6)) {
      const r = await aprender(d.texto, d.tipo);
      if (r?.nuevo) nuevos.push(r.nodo);
    }
    if (nuevos.length) alAprender?.(nuevos);
  } catch {
    // Si falla (límite o sin internet), se pierde solo esta tanda
  } finally {
    aprendiendo = false;
  }
  return nuevos;
}

/** Instrucciones para que Gemini saque los datos que vale la pena recordar de una plática. */
export const PEDIDO_EXTRAER =
  "Eres la memoria de un asistente personal. De la conversación de abajo, saca SOLO datos sobre el USUARIO que sirvan " +
  "para ayudarlo en el futuro: quién es, qué estudia y sus materias, sus gustos, sus planes y fechas (exámenes, " +
  "entregas, viajes), personas importantes para él y temas que le interesan. Cada dato en una frase corta y completa " +
  "en tercera persona (por ejemplo: 'Tiene examen de Química Analítica el viernes 14 de noviembre'). NO guardes: " +
  "contraseñas, claves, números de tarjeta o de cuenta, direcciones exactas, datos de salud íntimos, ni nada de " +
  "otras personas que no sea su relación con el usuario. NO guardes lo que solo fue una pregunta de cultura general " +
  "sin relación con él. Si no hay nada útil, devuelve una lista vacía. Tipo: dato | gusto | estudio | plan | persona | tema.";

export const ESQUEMA_EXTRAER = {
  type: "object",
  properties: {
    recuerdos: {
      type: "array",
      items: {
        type: "object",
        properties: { texto: { type: "string" }, tipo: { type: "string", enum: TIPOS } },
        required: ["texto", "tipo"],
      },
    },
  },
  required: ["recuerdos"],
};

// ------------------------------------------------------------------ para el panel

export function estadoRed() {
  const g = leer();
  return {
    nodos: g.nodos.map(({ vector, ...n }) => ({ ...n, conVector: !!vector })),
    conexiones: conexiones(g.nodos),
  };
}
