/**
 * DAY TRADING (basado en "day-trader-skill" de Jake Schincariol, licencia MIT; pasado a TypeScript para Ares).
 * Solo ANALIZA y AVISA: nunca compra ni vende. El broker de ese proyecto se dejó fuera a propósito.
 *
 *  - Reloj de la Bolsa de Nueva York (NYSE): horario 9:30–16:00, fines de semana, feriados y cierres temprano 2026–2027.
 *  - Datos: velas de 5 minutos y diarias de Yahoo Finanzas (gratis, no oficiales, pueden tener retraso).
 *  - Escáner: ruptura del rango de apertura (primeros 15 min) y setups diarios (ruptura de 20 días, bandera alcista,
 *    recupera la media de 20, sobreventa RSI < 30, rebote de sobreventa).
 *  - Plan: entrada = primer cierre de 5 min arriba del rango de apertura; stop = mitad o piso del rango (o %),
 *    objetivo = R veces el riesgo; fuera a las 15:55. Presupuesto = acciones según la pérdida máxima por operación.
 *  - Máquina del tiempo: repite el resto del día 10,000 veces con velas reales de los últimos 60 días a la misma
 *    hora, y prueba la misma regla en cada día pasado. Da las probabilidades y un veredicto honesto.
 *  - Noticias por acción (RSS de Yahoo) con etiquetas, y alertas de precio.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";

// ------------------------------------------------------------------ reloj de Nueva York

const FERIADOS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06",
  "2027-11-25", "2027-12-24",
]);
const CIERRE_TEMPRANO = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const formatoNY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
});

/** Fecha (AAAA-MM-DD), minutos desde medianoche y día de la semana en Nueva York. */
export function horaNY(ms: number): { fecha: string; minutos: number; diaSemana: string } {
  const p = Object.fromEntries(formatoNY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const hora = Number(p.hour) % 24;
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: hora * 60 + Number(p.minute), diaSemana: p.weekday };
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const aMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function diaDeBolsa(fecha: string, diaSemana: string): { abierto: boolean; cierre: number; motivo?: string } {
  if (diaSemana === "Sat" || diaSemana === "Sun") return { abierto: false, cierre: 0, motivo: "fin de semana" };
  if (FERIADOS.has(fecha)) return { abierto: false, cierre: 0, motivo: "día feriado de la bolsa de Nueva York" };
  return { abierto: true, cierre: CIERRE_TEMPRANO.has(fecha) ? aMin("13:00") : aMin("16:00") };
}

/** Estado de la bolsa ahora (en palabras) y si está abierta. */
export function estadoBolsa(ahora = Date.now()): { abierta: boolean; texto: string; ny: ReturnType<typeof horaNY> } {
  const ny = horaNY(ahora);
  const dia = diaDeBolsa(ny.fecha, ny.diaSemana);
  if (!dia.abierto) return { abierta: false, texto: `La bolsa de Nueva York está cerrada (${dia.motivo}).`, ny };
  if (ny.minutos < aMin("09:30")) return { abierta: false, texto: `La bolsa abre a las 9:30 de Nueva York (allá son las ${hhmm(ny.minutos)}).`, ny };
  if (ny.minutos >= dia.cierre) return { abierta: false, texto: `La bolsa ya cerró hoy (cierra a las ${hhmm(dia.cierre)} de Nueva York).`, ny };
  return { abierta: true, texto: `La bolsa está abierta (en Nueva York son las ${hhmm(ny.minutos)}; cierra a las ${hhmm(dia.cierre)}).`, ny };
}

// ------------------------------------------------------------------ datos

type Fetch = typeof fetch;
let pedir: Fetch = (entrada, opciones) => fetch(entrada, opciones);
/** Para las pruebas (internet simulado). */
export function usarFetchTrading(f: Fetch): void {
  pedir = f;
}
const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" };

export interface Vela {
  t: number; // inicio (ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Grafica {
  simbolo: string;
  nombre: string;
  moneda: string;
  precio: number;
  cierreAnterior: number | null;
  velas: Vela[];
}

async function chartYahoo(simbolo: string, rango: string, intervalo: string): Promise<Grafica> {
  let ultimo: unknown;
  for (const host of ["query2", "query1"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${rango}&interval=${intervalo}&includePrePost=false`;
      const r = await pedir(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(8_000) });
      if (r.status === 404) throw new Error(`No existe el símbolo ${simbolo}.`);
      if (!r.ok) throw new Error(`Yahoo respondió ${r.status}`);
      const datos: any = await r.json();
      const res = datos?.chart?.result?.[0];
      if (!res) throw new Error(datos?.chart?.error?.description || `Sin datos de ${simbolo}`);
      const q = res.indicators?.quote?.[0] ?? {};
      const velas: Vela[] = [];
      (res.timestamp ?? []).forEach((t: number, i: number) => {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if ([o, h, l, c].every((x) => typeof x === "number" && Number.isFinite(x))) {
          velas.push({ t: t * 1000, o, h, l, c, v: Number(q.volume?.[i]) || 0 });
        }
      });
      const meta = res.meta ?? {};
      return {
        simbolo,
        nombre: meta.longName || meta.shortName || simbolo,
        moneda: String(meta.currency ?? "USD"),
        precio: Number(meta.regularMarketPrice) || velas[velas.length - 1]?.c || 0,
        cierreAnterior: Number(meta.chartPreviousClose ?? meta.previousClose) || null,
        velas,
      };
    } catch (err) {
      ultimo = err;
      if (err instanceof Error && /No existe el símbolo/.test(err.message)) throw err;
    }
  }
  throw ultimo;
}

export const velas5m = (simbolo: string, rango = "60d") => chartYahoo(simbolo, rango, "5m");
export const velasDiarias = (simbolo: string) => chartYahoo(simbolo, "6mo", "1d");

/** Agrupa velas de 5 min por día de Nueva York; solo deja las de 9:30 al cierre, en la cuadrícula de 5 min. */
export interface Sesion {
  fecha: string;
  velas: Vela[]; // índice 0 = 9:30
  completa: boolean;
  cierre: number; // minutos NY
}
export function sesiones(velas: Vela[]): Sesion[] {
  const porDia = new Map<string, Vela[]>();
  for (const v of velas) {
    const ny = horaNY(v.t);
    if (ny.minutos < aMin("09:30") || ny.minutos % 5 !== 0) continue;
    const lista = porDia.get(ny.fecha) ?? [];
    lista.push(v);
    porDia.set(ny.fecha, lista);
  }
  const lista: Sesion[] = [];
  for (const [fecha, vs] of porDia) {
    const cierre = CIERRE_TEMPRANO.has(fecha) ? aMin("13:00") : aMin("16:00");
    const esperadas = (cierre - aMin("09:30")) / 5;
    const dentro = vs.filter((v) => horaNY(v.t).minutos < cierre).sort((a, b) => a.t - b.t);
    // Completa = todas las velas de 9:30 al cierre, sin huecos
    const completa =
      dentro.length === esperadas && dentro.every((v, i) => horaNY(v.t).minutos === aMin("09:30") + i * 5);
    lista.push({ fecha, velas: dentro, completa, cierre });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ------------------------------------------------------------------ rango de apertura y entrada

export interface RangoApertura {
  alto: number;
  bajo: number;
  mitad: number;
}
/** Primeros 15 minutos: velas de 9:30, 9:35 y 9:40. */
export function rangoApertura(s: Sesion): RangoApertura | null {
  const r = s.velas.slice(0, 3);
  if (r.length < 3 || horaNY(r[0].t).minutos !== aMin("09:30")) return null;
  const alto = Math.max(...r.map((v) => v.h));
  const bajo = Math.min(...r.map((v) => v.l));
  return { alto, bajo, mitad: (alto + bajo) / 2 };
}

const SIN_ENTRADAS_DESPUES = aMin("15:30");

/**
 * La entrada: la primera vela de 5 min DESPUÉS del rango que CIERRA arriba del alto del rango (una mecha no cuenta).
 * Solo velas ya cerradas (antes de `ahora`) y que cierran a las 15:30 o antes.
 */
export function buscarEntrada(s: Sesion, rango: RangoApertura, ahora = Infinity): { indice: number; precio: number; horaCierre: number } | null {
  for (let i = 3; i < s.velas.length; i++) {
    const v = s.velas[i];
    const cierreMin = horaNY(v.t).minutos + 5;
    if (v.t + 5 * 60_000 > ahora) break; // vela que todavía no cierra
    if (cierreMin > Math.min(SIN_ENTRADAS_DESPUES, s.cierre - 30)) break;
    if (v.c > rango.alto) return { indice: i, precio: v.c, horaCierre: cierreMin };
  }
  return null;
}

// ------------------------------------------------------------------ plan de salida

export type ReglaStop = "mitad" | "piso" | { pct: number };

export interface Plan {
  simbolo: string;
  fecha: string;
  entrada: number;
  indiceEntrada: number; // vela de la entrada (la siguiente es la primera que se simula)
  horaEntrada: string; // "10:15"
  stop: number;
  objetivo: number;
  riesgo: number; // por acción
  r: number;
  reglaStop: string;
  salirA: string; // "15:55"
  rango?: RangoApertura;
}

const centavoAbajo = (x: number) => Math.floor(x * 100 + 1e-9) / 100;
const centavo = (x: number) => Math.round(x * 100) / 100;
export const redondear = centavo;

export function armarPlan(datos: {
  simbolo: string;
  fecha: string;
  entrada: number;
  indiceEntrada: number;
  horaEntrada: string;
  rango?: RangoApertura;
  regla: ReglaStop;
  r: number;
  cierre?: number;
}): Plan {
  const { entrada, rango, regla } = datos;
  let stopCrudo: number;
  let nombreRegla: string;
  if (regla === "mitad" || regla === "piso") {
    if (!rango) throw new Error("Para ese stop hace falta el rango de apertura; usa un stop en porcentaje.");
    stopCrudo = regla === "mitad" ? rango.mitad : rango.bajo;
    nombreRegla = regla === "mitad" ? "mitad del rango de apertura" : "piso del rango de apertura";
  } else {
    stopCrudo = entrada * (1 - regla.pct / 100);
    nombreRegla = `${regla.pct} % abajo de la entrada`;
  }
  const stop = centavoAbajo(stopCrudo);
  if (stop >= entrada) throw new Error("El stop quedó arriba de la entrada: ese plan no tiene sentido.");
  const riesgo = centavo(entrada - stop);
  if (riesgo < entrada * 0.0005) throw new Error("El stop está demasiado pegado a la entrada: cualquier movimiento normal lo tocaría.");
  const objetivo = centavo(entrada + datos.r * riesgo);
  const cierre = datos.cierre ?? aMin("16:00");
  return {
    simbolo: datos.simbolo,
    fecha: datos.fecha,
    entrada,
    indiceEntrada: datos.indiceEntrada,
    horaEntrada: datos.horaEntrada,
    stop,
    objetivo,
    riesgo,
    r: datos.r,
    reglaStop: nombreRegla,
    salirA: hhmm(cierre - 5),
    rango,
  };
}

// ------------------------------------------------------------------ presupuesto y revisión de riesgo

export interface ConfigTrading {
  presupuesto: number; // dólares que el usuario está dispuesto a arriesgar en esto
  colchonPct: number; // % que siempre queda en efectivo
  perdidaMaxOperacion: number; // dólares
  posicionMaxPct: number;
  ordenMax: number;
  ordenMin: number;
  rrMinimo: number;
  bloqueados: string[];
}

const ARCHIVO_CONFIG = path.join(CARPETA_DATOS, "trading.json");
export const CONFIG_INICIAL: ConfigTrading = {
  presupuesto: 5000,
  colchonPct: 10,
  perdidaMaxOperacion: 50,
  posicionMaxPct: 75,
  ordenMax: 4000,
  ordenMin: 5,
  rrMinimo: 1,
  bloqueados: [],
};

export function leerConfigTrading(): ConfigTrading & { configurado: boolean } {
  try {
    return { ...CONFIG_INICIAL, ...JSON.parse(readFileSync(ARCHIVO_CONFIG, "utf8")), configurado: true };
  } catch {
    return { ...CONFIG_INICIAL, configurado: false };
  }
}

export function guardarConfigTrading(cambios: Partial<ConfigTrading>): ConfigTrading {
  const actual = leerConfigTrading();
  const nueva: ConfigTrading = { ...CONFIG_INICIAL };
  for (const k of Object.keys(CONFIG_INICIAL) as (keyof ConfigTrading)[]) {
    const v = (cambios as any)[k] ?? (actual as any)[k];
    (nueva as any)[k] = k === "bloqueados" ? (Array.isArray(v) ? v.map((x: unknown) => String(x).toUpperCase()).slice(0, 50) : []) : Number(v);
  }
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_CONFIG, JSON.stringify(nueva, null, 2), "utf8");
  return nueva;
}

export interface Tamano {
  acciones: number;
  dolares: number;
  perdidaEnStop: number;
  limites: { nombre: string; acciones: number }[];
  decide: string;
  revision: { regla: string; ok: boolean; detalle: string }[];
  pasa: boolean;
}

/** Cuántas acciones (enteras): el menor de 4 límites. Y la revisión de riesgo de esa orden. */
export function dimensionar(plan: Plan, c: ConfigTrading): Tamano {
  const limites = [
    { nombre: "pérdida máxima por operación", acciones: Math.floor(c.perdidaMaxOperacion / plan.riesgo) },
    { nombre: "tamaño máximo de posición", acciones: Math.floor((c.presupuesto * c.posicionMaxPct) / 100 / plan.entrada) },
    { nombre: "orden máxima", acciones: Math.floor(c.ordenMax / plan.entrada) },
    { nombre: "efectivo (menos el colchón)", acciones: Math.floor((c.presupuesto * (1 - c.colchonPct / 100)) / plan.entrada) },
  ];
  const menor = limites.reduce((a, b) => (b.acciones < a.acciones ? b : a));
  const acciones = Math.max(0, menor.acciones);
  const dolares = centavo(acciones * plan.entrada);
  const perdidaEnStop = centavo(acciones * plan.riesgo);
  const rr = (plan.objetivo - plan.entrada) / plan.riesgo;
  const revision = [
    { regla: "Tiene stop", ok: plan.stop < plan.entrada, detalle: `stop ${plan.stop} abajo de la entrada ${plan.entrada}` },
    { regla: "Ganancia vs. riesgo", ok: rr + 1e-9 >= c.rrMinimo, detalle: `${rr.toFixed(2)} (mínimo ${c.rrMinimo})` },
    { regla: "Pérdida máxima", ok: perdidaEnStop <= c.perdidaMaxOperacion + 1e-9, detalle: `$${perdidaEnStop} de $${c.perdidaMaxOperacion}` },
    { regla: "Orden mínima", ok: dolares >= c.ordenMin, detalle: `$${dolares} (mínimo $${c.ordenMin})` },
    { regla: "No está bloqueada", ok: !c.bloqueados.includes(plan.simbolo), detalle: plan.simbolo },
    { regla: "Al menos 1 acción", ok: acciones >= 1, detalle: `${acciones} acciones` },
  ];
  return { acciones, dolares, perdidaEnStop, limites, decide: menor.nombre, revision, pasa: revision.every((x) => x.ok) };
}

// ------------------------------------------------------------------ máquina del tiempo

/** Números al azar con semilla (misma semilla = mismos resultados). */
function azar(semilla: number): () => number {
  let a = semilla >>> 0 || 19;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ResultadoMaquina {
  replays: number;
  semilla: number;
  velasSimuladas: number;
  hasta: string;
  objetivoPrimero: number; // %
  stopPrimero: number;
  ninguno: number;
  verde: number;
  rPromedio: number;
  precioFinal: { mediana: number; p5: number; p95: number };
  bandas: { minutos: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  historia: { sesiones: number; disparos: number; objetivo: number; stop: number; ninguno: number; rPromedio: number };
  veredicto: string;
  notas: string[];
}

/**
 * Simula el resto del día. Cada vela futura se toma, al azar, de una vela REAL de un día pasado a la misma hora
 * (±2 velas), escalada al precio actual. Revisa primero el stop y luego el objetivo (si toca los dos, cuenta stop).
 */
export function maquinaDelTiempo(plan: Plan, todas: Sesion[], opciones: { replays?: number; semilla?: number; hasta?: string } = {}): ResultadoMaquina {
  const replays = Math.max(500, Math.min(20_000, opciones.replays ?? 10_000));
  const semilla = opciones.semilla ?? 19;
  const pasadas = todas.filter((s) => s.completa && s.fecha < plan.fecha && s.cierre === aMin("16:00"));
  if (pasadas.length < 20) throw new Error(`Solo hay ${pasadas.length} días completos en los datos; hacen falta al menos 20.`);
  const cierreHoy = CIERRE_TEMPRANO.has(plan.fecha) ? aMin("13:00") : aMin("16:00");
  const hastaMin = Math.min(opciones.hasta ? aMin(opciones.hasta) : cierreHoy, cierreHoy);
  const primera = plan.indiceEntrada + 1; // primera vela a simular
  const ultima = (hastaMin - aMin("09:30")) / 5 - 1; // última vela dentro del horario
  if (primera > ultima) throw new Error("Ya no quedan velas en el día después de la entrada.");

  // Las proporciones de cada vela respecto al cierre de la vela anterior
  const proporciones = pasadas.map((s) =>
    s.velas.map((v, i) => {
      const pc = i ? s.velas[i - 1].c : v.o;
      return { o: v.o / pc, h: v.h / pc, l: v.l / pc, c: v.c / pc };
    })
  );
  const rnd = azar(semilla);
  const n = ultima - primera + 1;
  const caminos: Float64Array[] = [];
  let obj = 0, stp = 0, nada = 0, verde = 0, sumaR = 0;
  const finales: number[] = [];
  for (let k = 0; k < replays; k++) {
    // El precio sigue su camino hasta la hora final (para saber dónde queda al cierre); el resultado de la
    // operación es lo que tocó PRIMERO: el stop o el objetivo.
    let precio = plan.entrada;
    let fin: "objetivo" | "stop" | null = null;
    let precioSalida = plan.entrada;
    const camino = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const idx = primera + j;
      const d = proporciones[Math.floor(rnd() * proporciones.length)];
      const desde = Math.max(1, idx - 2), hasta = Math.min(d.length - 1, idx + 2);
      const p = d[desde + Math.floor(rnd() * (hasta - desde + 1))];
      const bajo = precio * Math.min(p.l, p.o), alto = precio * Math.max(p.h, p.o);
      if (!fin) {
        if (bajo <= plan.stop) fin = "stop";
        else if (alto >= plan.objetivo) fin = "objetivo";
      }
      precio *= p.c;
      camino[j] = precio;
    }
    precioSalida = precio;
    if (k < 400) caminos.push(camino);
    let r: number;
    if (fin === "objetivo") {
      obj++;
      r = plan.r;
    } else if (fin === "stop") {
      stp++;
      r = -1;
    } else {
      nada++;
      r = (precioSalida - plan.entrada) / plan.riesgo;
    }
    if (fin === "objetivo" || (!fin && precioSalida > plan.entrada)) verde++;
    sumaR += r;
    finales.push(precioSalida);
  }
  finales.sort((a, b) => a - b);
  const pc = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  // Bandas para la gráfica (con los primeros 400 caminos)
  const bandas = Array.from({ length: n }, (_, j) => {
    const col = caminos.map((c) => c[j]).sort((a, b) => a - b);
    return { minutos: aMin("09:30") + (primera + j + 1) * 5, p5: pc(col, 0.05), p25: pc(col, 0.25), p50: pc(col, 0.5), p75: pc(col, 0.75), p95: pc(col, 0.95) };
  });

  // Historia: la misma regla en cada día pasado (lo que pasó de verdad)
  const r = plan.r;
  let disparos = 0, hObj = 0, hStop = 0, hNada = 0, hR = 0;
  for (const s of pasadas) {
    const rango = rangoApertura(s);
    if (!rango) continue;
    const e = buscarEntrada(s, rango);
    if (!e) continue;
    let stop: number;
    if (plan.reglaStop.startsWith("mitad")) stop = centavoAbajo(rango.mitad);
    else if (plan.reglaStop.startsWith("piso")) stop = centavoAbajo(rango.bajo);
    else stop = centavoAbajo(e.precio * (1 - (plan.entrada - plan.stop) / plan.entrada));
    const riesgo = e.precio - stop;
    if (riesgo <= e.precio * 0.0005) continue;
    const objetivo = centavo(e.precio + r * riesgo);
    disparos++;
    let res: number | null = null;
    let ultimoCierre = e.precio;
    for (let i = e.indice + 1; i < s.velas.length && i <= ultima; i++) {
      const v = s.velas[i];
      if (v.l <= stop) { res = -1; hStop++; break; }
      if (v.h >= objetivo) { res = r; hObj++; break; }
      ultimoCierre = v.c;
    }
    if (res === null) { hNada++; res = (ultimoCierre - e.precio) / riesgo; }
    hR += res;
  }

  const pct = (x: number) => Math.round((x / replays) * 1000) / 10;
  const resultado = {
    objetivoPrimero: pct(obj),
    stopPrimero: pct(stp),
    ninguno: pct(nada),
    verde: pct(verde),
    rPromedio: Math.round((sumaR / replays) * 1000) / 1000,
  };
  return {
    replays,
    semilla,
    velasSimuladas: n,
    hasta: hhmm(hastaMin),
    ...resultado,
    precioFinal: { mediana: centavo(pc(finales, 0.5)), p5: centavo(pc(finales, 0.05)), p95: centavo(pc(finales, 0.95)) },
    bandas,
    historia: {
      sesiones: pasadas.length,
      disparos,
      objetivo: hObj,
      stop: hStop,
      ninguno: hNada,
      rPromedio: disparos ? Math.round((hR / disparos) * 1000) / 1000 : 0,
    },
    ...veredicto(resultado, r, hhmm(hastaMin)),
  };
}

/** El veredicto: entre los replays que tocaron un lado, ¿qué tan seguido llegó primero el objetivo vs. lo que necesita? */
export function veredicto(
  x: { objetivoPrimero: number; stopPrimero: number; ninguno: number; rPromedio: number },
  r: number,
  hasta: string
): { veredicto: string; notas: string[] } {
  const tocaron = x.objetivoPrimero + x.stopPrimero;
  const notas: string[] = [];
  let texto: string;
  let inclina = 0;
  if (tocaron <= 0) {
    texto = `Ningún replay llegó al objetivo ni al stop antes de las ${hasta}.`;
  } else {
    const gana = (x.objetivoPrimero / tocaron) * 100;
    const necesita = 100 / (1 + r);
    const dif = gana - necesita;
    const base = `objetivo primero ${x.objetivoPrimero} % vs. stop primero ${x.stopPrimero} %`;
    if (Math.abs(dif) < 5) texto = r === 1 ? `Casi un volado (50/50): ${base}.` : `Cerca del punto de equilibrio: ${base} (a ${r}R necesita ganar ${necesita.toFixed(0)} % de las que tocan un lado; logró ${gana.toFixed(0)} %).`;
    else if (Math.abs(dif) < 15) texto = `${dif > 0 ? "Se inclina hacia el objetivo" : "Se inclina hacia el stop"}: ${base}.`;
    else texto = `${dif > 0 ? "Fuertemente hacia el objetivo" : "Fuertemente hacia el stop"}: ${base}.`;
    inclina = Math.abs(dif) < 5 ? 0 : Math.sign(dif);
  }
  if (x.ninguno > 40) notas.push(`${x.ninguno} % de los replays no tocaron ninguno antes de las ${hasta}; ahí decide el precio de esa hora.`);
  if (inclina !== 0 && Math.sign(x.rPromedio) !== 0 && Math.sign(x.rPromedio) !== inclina) {
    notas.push(`Ojo: el R promedio (${x.rPromedio}) va en sentido contrario, por los replays que no tocaron ningún lado.`);
  }
  return { veredicto: texto, notas };
}

// ------------------------------------------------------------------ escáner

/** Lista de acciones líquidas para escanear (rápido). El usuario puede pasar las suyas. */
export const LISTA_ESCANEO = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "NFLX", "ORCL", "CRM", "ADBE", "INTC", "QCOM",
  "MU", "PLTR", "UBER", "SHOP", "COIN", "JPM", "BAC", "WFC", "GS", "V", "MA", "PYPL", "XOM", "CVX", "KO", "PEP", "MCD",
  "WMT", "COST", "HD", "NKE", "DIS", "BA", "CAT", "GE", "LLY", "UNH", "JNJ", "PFE", "MRK", "ABBV", "T", "VZ", "SBUX",
  "SPY", "QQQ", "IWM", "SMCI", "ARM", "SNOW", "RIVN", "SOFI", "MARA", "HOOD", "DKNG",
];

/** RSI de 14 (Wilder). */
export function rsi14(c: number[]): number | null {
  if (c.length < 15) return null;
  let g = 0, p = 0;
  for (let i = 1; i <= 14; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else p -= d;
  }
  g /= 14; p /= 14;
  for (let i = 15; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * 13 + Math.max(0, d)) / 14;
    p = (p * 13 + Math.max(0, -d)) / 14;
  }
  return p === 0 ? 100 : 100 - 100 / (1 + g / p);
}

/** Setups diarios (con cierres). Devuelve los nombres de los que se cumplen. */
export function setupsDiarios(cierres: number[]): string[] {
  const n = cierres.length;
  if (n < 30) return [];
  const ultimo = cierres[n - 1];
  const hits: string[] = [];
  if (ultimo > Math.max(...cierres.slice(n - 21, n - 1))) hits.push("ruptura de 20 días");
  const antes = cierres.slice(n - 15, n - 5);
  const ultimos5 = cierres.slice(n - 5);
  if (antes.length === 10 && (antes[9] - antes[0]) / antes[0] > 0.1 && (Math.max(...ultimos5) - Math.min(...ultimos5)) / Math.min(...ultimos5) < 0.05) {
    hits.push("bandera alcista");
  }
  const media = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  if (cierres[n - 2] < media(cierres.slice(n - 21, n - 1)) && ultimo > media(cierres.slice(n - 20))) hits.push("recupera su media de 20 días");
  const rHoy = rsi14(cierres);
  const rAyer = rsi14(cierres.slice(0, -1));
  if (rHoy !== null && rHoy < 30) hits.push(`sobreventa (RSI ${rHoy.toFixed(0)})`);
  if (rAyer !== null && rAyer < 30 && ultimo > cierres[n - 2]) hits.push("rebote de sobreventa");
  return hits;
}

export interface HitEscaner {
  simbolo: string;
  precio: number;
  setups: string[];
  detalle: string;
  volumenDolares: number;
}

/** Corre una tarea por cada elemento con pocas a la vez (para no saturar a Yahoo). */
async function enParalelo<T, R>(items: T[], cuantas: number, f: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(cuantas, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = { status: "fulfilled", value: await f(items[k]) };
        } catch (reason) {
          out[k] = { status: "rejected", reason };
        }
      }
    })
  );
  return out;
}

export async function escanearDiario(simbolos: string[]): Promise<{ hits: HitEscaner[]; revisadas: number; fallaron: number }> {
  const res = await enParalelo(simbolos, 8, async (s) => {
    const g = await velasDiarias(s);
    const cierres = g.velas.map((v) => v.c);
    // Durante el día la vela de hoy está incompleta: se quita
    const hoy = horaNY(Date.now()).fecha;
    const ultima = g.velas[g.velas.length - 1];
    const completos = ultima && horaNY(ultima.t).fecha === hoy && estadoBolsa().abierta ? cierres.slice(0, -1) : cierres;
    const setups = setupsDiarios(completos);
    const v = g.velas[g.velas.length - 1];
    return { simbolo: s, precio: g.precio, setups, detalle: "", volumenDolares: v ? v.c * v.v : 0 };
  });
  const hits = res.flatMap((r) => (r.status === "fulfilled" && r.value.setups.length ? [r.value] : []));
  return {
    hits: hits.sort((a, b) => b.volumenDolares - a.volumenDolares),
    revisadas: res.filter((r) => r.status === "fulfilled").length,
    fallaron: res.filter((r) => r.status === "rejected").length,
  };
}

export async function escanearApertura(simbolos: string[], ahora = Date.now()): Promise<{ hits: HitEscaner[]; revisadas: number; fallaron: number }> {
  const res = await enParalelo(simbolos, 8, async (s) => {
    const g = await velas5m(s, "1d");
    const hoy = sesiones(g.velas).find((x) => x.fecha === horaNY(ahora).fecha);
    if (!hoy) return null;
    const rango = rangoApertura(hoy);
    if (!rango) return null;
    const e = buscarEntrada(hoy, rango, ahora);
    if (!e) return null;
    const vol = hoy.velas.slice(0, e.indice + 1).reduce((a, v) => a + v.c * v.v, 0);
    return {
      simbolo: s,
      precio: centavo(e.precio),
      setups: ["ruptura del rango de apertura"],
      detalle: `rango ${centavo(rango.bajo)}–${centavo(rango.alto)}; cerró en ${centavo(e.precio)} a las ${hhmm(e.horaCierre)} (${(((e.precio - rango.alto) / rango.alto) * 100).toFixed(2)} % arriba)`,
      volumenDolares: vol,
    };
  });
  const hits = res.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  return {
    hits: hits.sort((a, b) => b.volumenDolares - a.volumenDolares),
    revisadas: res.filter((r) => r.status === "fulfilled").length,
    fallaron: res.filter((r) => r.status === "rejected").length,
  };
}

// ------------------------------------------------------------------ noticias

const ETIQUETAS: [string, RegExp][] = [
  ["resultados", /earnings|revenue|quarter|q[1-4]\b|guidance|eps|results|profit/i],
  ["analistas", /upgrade|downgrade|price target|analyst|rating|initiat/i],
  ["legal", /lawsuit|sue|court|settle|probe|investigation|antitrust|sec charges/i],
  ["fusión/compra", /merger|acquir|acquisition|deal|buyout|takeover|stake/i],
  ["capital", /offering|buyback|dividend|split|debt|bond|raise/i],
  ["directivos", /\bceo\b|\bcfo\b|resign|appoint|steps down|executive/i],
  ["riesgo", /recall|warning|cut|layoff|miss|plunge|fraud|bankrupt/i],
  ["regulación", /fda|approval|regulat|ban|tariff|fcc|ftc/i],
  ["economía", /fed\b|inflation|rates|jobs report|cpi|recession|economy/i],
];

export interface Noticia {
  titulo: string;
  enlace: string;
  fecha: number;
  etiquetas: string[];
}

const desescapar = (t: string) =>
  t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

export function leerRss(xml: string): Noticia[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((it) => {
      const campo = (n: string) => desescapar(it.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, "i"))?.[1] ?? "");
      const titulo = campo("title");
      return {
        titulo,
        enlace: campo("link"),
        fecha: Date.parse(campo("pubDate")) || 0,
        etiquetas: ETIQUETAS.filter(([, re]) => re.test(titulo)).map(([n]) => n),
      };
    })
    .filter((n) => n.titulo && /^https?:\/\//.test(n.enlace));
}

export async function noticiasDe(simbolo: string): Promise<{ noticias: Noticia[]; cambioHoy: number | null; precio: number }> {
  const [rss, g] = await Promise.all([
    pedir(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(simbolo)}&region=US&lang=en-US`, {
      headers: NAVEGADOR,
      signal: AbortSignal.timeout(8_000),
    }).then((r) => (r.ok ? r.text() : "")),
    chartYahoo(simbolo, "5d", "1d").catch(() => null),
  ]);
  const noticias = leerRss(rss).sort((a, b) => b.fecha - a.fecha).slice(0, 8);
  const anterior = g?.velas.length && g.velas.length > 1 ? g.velas[g.velas.length - 2].c : g?.cierreAnterior ?? null;
  const cambioHoy = g && anterior ? ((g.precio - anterior) / anterior) * 100 : null;
  return { noticias, cambioHoy, precio: g?.precio ?? 0 };
}

// ------------------------------------------------------------------ alertas de precio

export interface AlertaBolsa {
  id: string;
  simbolo: string;
  tipo: "arriba" | "abajo" | "movimiento";
  precio?: number;
  pct?: number;
  creada: number;
  sonada?: number;
}

const ARCHIVO_ALERTAS = path.join(CARPETA_DATOS, "alertas-bolsa.json");
export function leerAlertas(): AlertaBolsa[] {
  try {
    const l = JSON.parse(readFileSync(ARCHIVO_ALERTAS, "utf8"));
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}
function guardarAlertas(l: AlertaBolsa[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  writeFileSync(ARCHIVO_ALERTAS, JSON.stringify(l.slice(-100), null, 2), "utf8");
}
export function agregarAlerta(a: Omit<AlertaBolsa, "id" | "creada">): AlertaBolsa {
  const nueva: AlertaBolsa = { ...a, id: Math.random().toString(36).slice(2, 9), creada: Date.now() };
  guardarAlertas([...leerAlertas(), nueva]);
  return nueva;
}
export function borrarAlerta(texto: string): number {
  const l = leerAlertas();
  const t = texto.trim().toUpperCase();
  const quedan = l.filter((a) => a.id !== texto && a.simbolo !== t && t !== "TODAS");
  guardarAlertas(quedan);
  return l.length - quedan.length;
}
export function describirAlerta(a: AlertaBolsa): string {
  if (a.tipo === "arriba") return `${a.simbolo} llegue a ${a.precio} o más`;
  if (a.tipo === "abajo") return `${a.simbolo} baje a ${a.precio} o menos`;
  return `${a.simbolo} se mueva ${a.pct} % o más en el día`;
}

let temporizador: ReturnType<typeof setInterval> | undefined;
/** Revisa las alertas cada minuto mientras la bolsa está abierta. Cada alerta suena una vez. */
export function vigilarAlertasBolsa(avisar: (texto: string) => void): void {
  clearInterval(temporizador);
  const revisar = async () => {
    if (!estadoBolsa().abierta) return;
    const pendientes = leerAlertas().filter((a) => !a.sonada);
    if (!pendientes.length) return;
    const simbolos = [...new Set(pendientes.map((a) => a.simbolo))];
    const precios = new Map<string, { precio: number; cambio: number | null }>();
    await enParalelo(simbolos, 4, async (s) => {
      const g = await chartYahoo(s, "5d", "1d");
      const anterior = g.velas.length > 1 ? g.velas[g.velas.length - 2].c : g.cierreAnterior;
      precios.set(s, { precio: g.precio, cambio: anterior ? ((g.precio - anterior) / anterior) * 100 : null });
    });
    const lista = leerAlertas();
    let cambio = false;
    for (const a of lista) {
      const p = precios.get(a.simbolo);
      if (a.sonada || !p) continue;
      const suena =
        (a.tipo === "arriba" && a.precio !== undefined && p.precio >= a.precio) ||
        (a.tipo === "abajo" && a.precio !== undefined && p.precio <= a.precio) ||
        (a.tipo === "movimiento" && a.pct !== undefined && p.cambio !== null && Math.abs(p.cambio) >= a.pct);
      if (suena) {
        a.sonada = Date.now();
        cambio = true;
        avisar(
          a.tipo === "movimiento"
            ? `Señor, ${a.simbolo} se ha movido ${p.cambio!.toFixed(1)} % hoy (está en ${p.precio}).`
            : `Señor, ${a.simbolo} ${a.tipo === "arriba" ? "subió" : "bajó"} a ${p.precio} (su alerta era ${a.precio}).`
        );
      }
    }
    if (cambio) guardarAlertas(lista);
  };
  temporizador = setInterval(() => void revisar().catch(() => {}), 60_000);
}

// ------------------------------------------------------------------ gráfica de la máquina del tiempo

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Abanico: banda 5–95 % y 25–75 %, mediana, líneas de entrada, stop y objetivo. */
export function graficaMaquina(plan: Plan, r: ResultadoMaquina): string {
  const W = 1200, H = 700, izq = 100, der = 200, arriba = 90, abajo = 70;
  const b = r.bandas;
  if (!b.length) return "";
  const minY = Math.min(plan.stop, ...b.map((x) => x.p5)) * 0.998;
  const maxY = Math.max(plan.objetivo, ...b.map((x) => x.p95)) * 1.002;
  const x = (i: number) => izq + (i / Math.max(1, b.length - 1)) * (W - izq - der);
  const y = (v: number) => arriba + (1 - (v - minY) / (maxY - minY)) * (H - arriba - abajo);
  const area = (a: keyof (typeof b)[0], c: keyof (typeof b)[0]) =>
    b.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[a] as number).toFixed(1)}`).join(" ") +
    " " + [...b].reverse().map((p, i) => `L${x(b.length - 1 - i).toFixed(1)} ${y(p[c] as number).toFixed(1)}`).join(" ") + " Z";
  const linea = (v: number, color: string, texto: string) =>
    `<line x1="${izq}" y1="${y(v).toFixed(1)}" x2="${W - der}" y2="${y(v).toFixed(1)}" stroke="${color}" stroke-width="2" stroke-dasharray="8 6"/>` +
    `<text x="${W - der + 12}" y="${(y(v) + 6).toFixed(1)}" fill="${color}" font-size="18" font-family="sans-serif">${esc(texto)}</text>`;
  const marcas = [0, Math.floor(b.length / 3), Math.floor((2 * b.length) / 3), b.length - 1]
    .map((i) => `<text x="${x(i).toFixed(1)}" y="${H - abajo + 30}" fill="#8fb4d6" font-size="17" font-family="sans-serif" text-anchor="middle">${hhmm(b[i].minutos)}</text>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#030a18"/>` +
    `<text x="${izq}" y="46" fill="#e2f8ff" font-size="28" font-family="sans-serif" font-weight="bold">${esc(`Máquina del tiempo: ${plan.simbolo} ${plan.fecha}`)}</text>` +
    `<text x="${izq}" y="74" fill="#8fb4d6" font-size="17" font-family="sans-serif">${esc(`${r.replays.toLocaleString("es-MX")} replays del resto del día · zona clara = 90 % de los casos, oscura = 50 % · semilla ${r.semilla}`)}</text>` +
    `<path d="${area("p95", "p5")}" fill="#00e5ff" fill-opacity="0.12"/>` +
    `<path d="${area("p75", "p25")}" fill="#00e5ff" fill-opacity="0.25"/>` +
    `<path d="${b.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.p50).toFixed(1)}`).join(" ")}" fill="none" stroke="#00e5ff" stroke-width="3"/>` +
    linea(plan.objetivo, "#00f5a0", `objetivo ${plan.objetivo}`) +
    linea(plan.entrada, "#e2f8ff", `entrada ${plan.entrada}`) +
    linea(plan.stop, "#ff6b81", `stop ${plan.stop}`) +
    marcas +
    `</svg>`
  );
}

export const AVISO_TRADING =
  "Esto es información y simulación, no una recomendación. El day trading hace perder dinero a la mayoría de quienes lo " +
  "practican; las simulaciones usan los últimos 60 días y no predicen noticias ni sorpresas. Ares nunca compra ni vende.";
