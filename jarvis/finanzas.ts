/**
 * FINANZAS: "¿cómo va la bolsa?", "¿a cuánto está Apple / el dólar / el bitcoin?", "¿qué ETF me conviene y dónde lo
 * compro?".
 *
 * Precios reales sin clave: Yahoo Finanzas (gráfica pública v8/finance/chart) y, si falla, Stooq (CSV histórico).
 * Con la historia de precios se calcula: cambio de hoy, 1 mes, en el año, 1 año, 5 años (anual), qué tanto sube y baja
 * (volatilidad) y su peor caída. Es INFORMACIÓN para que el usuario decida, no asesoría personalizada.
 */

// ------------------------------------------------------------------ nombres comunes → símbolo

export const SIMBOLOS: Record<string, string> = {
  // Índices
  "s&p 500": "^GSPC", "s&p500": "^GSPC", "sp500": "^GSPC", "s&p": "^GSPC",
  nasdaq: "^IXIC", "dow jones": "^DJI", dow: "^DJI",
  ipc: "^MXX", "bolsa mexicana": "^MXX", bmv: "^MXX", "s&p/bmv ipc": "^MXX",
  // Monedas y materias primas
  dolar: "MXN=X", "dolar peso": "MXN=X", "tipo de cambio": "MXN=X", "usd": "MXN=X", euro: "EURMXN=X",
  oro: "GC=F", plata: "SI=F", petroleo: "CL=F",
  // Cripto
  bitcoin: "BTC-USD", btc: "BTC-USD", ethereum: "ETH-USD", eth: "ETH-USD", solana: "SOL-USD",
  // Empresas de EE. UU.
  apple: "AAPL", tesla: "TSLA", nvidia: "NVDA", microsoft: "MSFT", amazon: "AMZN", google: "GOOGL", alphabet: "GOOGL",
  meta: "META", facebook: "META", netflix: "NFLX", "coca cola": "KO", "coca-cola": "KO", disney: "DIS",
  mcdonalds: "MCD", walmart: "WMT", amd: "AMD", intel: "INTC", berkshire: "BRK-B",
  // Empresas de México
  bimbo: "BIMBOA.MX", walmex: "WALMEX.MX", femsa: "FEMSAUBD.MX", cemex: "CEMEXCPO.MX", "america movil": "AMXB.MX",
  telcel: "AMXB.MX", banorte: "GFNORTEO.MX", "grupo mexico": "GMEXICOB.MX", televisa: "TLEVISACPO.MX",
  // ETF del IPC
  naftrac: "NAFTRACISHRS.MX",
};

/** Lo que se ve en el panorama de "¿cómo va la bolsa?". */
export const PANORAMA = ["^GSPC", "^IXIC", "^DJI", "^MXX", "MXN=X", "BTC-USD"];

const NOMBRES: Record<string, string> = {
  "^GSPC": "S&P 500 (EE. UU.)",
  "^IXIC": "Nasdaq (tecnología, EE. UU.)",
  "^DJI": "Dow Jones (EE. UU.)",
  "^MXX": "IPC (Bolsa Mexicana)",
  "MXN=X": "Dólar en pesos",
  "EURMXN=X": "Euro en pesos",
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "GC=F": "Oro (onza)",
  "CL=F": "Petróleo (barril)",
};

const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** "Apple" → "AAPL", "voo" → "VOO", "el dólar" → "MXN=X". null si no parece un símbolo. */
export function simboloDe(texto: string): string | null {
  const t = sinAcentos(texto).replace(/^(el|la|los|las|de|del)\s+/, "").replace(/\s+(stock|accion|acciones|etf)$/, "");
  if (SIMBOLOS[t]) return SIMBOLOS[t];
  const s = texto.trim().toUpperCase();
  return /^[\^A-Z0-9][A-Z0-9.\-=^]{0,14}$/.test(s) ? s : null;
}

// ------------------------------------------------------------------ ETFs conocidos (datos que casi no cambian)

export interface InfoEtf {
  nombre: string;
  costo: string; // gasto anual (expense ratio) aproximado
  que_tiene: string;
  riesgo: "bajo" | "medio" | "medio-alto" | "alto";
}

export const ETFS: Record<string, InfoEtf> = {
  VOO: { nombre: "Vanguard S&P 500", costo: "0.03 %", que_tiene: "Las 500 empresas más grandes de EE. UU.", riesgo: "medio" },
  IVV: { nombre: "iShares Core S&P 500", costo: "0.03 %", que_tiene: "Las 500 empresas más grandes de EE. UU.", riesgo: "medio" },
  SPY: { nombre: "SPDR S&P 500", costo: "0.09 %", que_tiene: "Las 500 empresas más grandes de EE. UU. (el más antiguo)", riesgo: "medio" },
  VTI: { nombre: "Vanguard Total Stock Market", costo: "0.03 %", que_tiene: "Casi todas las empresas de EE. UU. (grandes, medianas y chicas)", riesgo: "medio" },
  QQQ: { nombre: "Invesco QQQ (Nasdaq-100)", costo: "0.20 %", que_tiene: "Las 100 empresas grandes del Nasdaq, mucha tecnología", riesgo: "medio-alto" },
  VT: { nombre: "Vanguard Total World", costo: "0.06 %", que_tiene: "Empresas de todo el mundo (EE. UU. y otros países)", riesgo: "medio" },
  VXUS: { nombre: "Vanguard Total International", costo: "0.05 %", que_tiene: "Empresas de todo el mundo FUERA de EE. UU.", riesgo: "medio" },
  SCHD: { nombre: "Schwab US Dividend Equity", costo: "0.06 %", que_tiene: "Empresas de EE. UU. que pagan buenos dividendos", riesgo: "medio" },
  VYM: { nombre: "Vanguard High Dividend Yield", costo: "0.06 %", que_tiene: "Empresas de EE. UU. con dividendos altos", riesgo: "medio" },
  BND: { nombre: "Vanguard Total Bond Market", costo: "0.03 %", que_tiene: "Bonos (deuda) de EE. UU.: sube y baja mucho menos", riesgo: "bajo" },
  GLD: { nombre: "SPDR Gold Shares", costo: "0.40 %", que_tiene: "Oro físico", riesgo: "medio" },
  "NAFTRACISHRS.MX": { nombre: "NAFTRAC (iShares IPC)", costo: "≈0.25 %", que_tiene: "Las 35 empresas más grandes de la Bolsa Mexicana", riesgo: "medio" },
  ACWI: { nombre: "iShares MSCI ACWI", costo: "0.32 %", que_tiene: "Empresas grandes y medianas de todo el mundo", riesgo: "medio" },
};

/** Los que se comparan si el usuario no dice cuáles. */
export const ETFS_POPULARES = ["VOO", "VTI", "QQQ", "VT", "SCHD", "VXUS", "BND", "NAFTRACISHRS.MX"];

// ------------------------------------------------------------------ descargar precios

export interface Serie {
  simbolo: string;
  nombre: string;
  moneda: string;
  precio: number;
  anterior: number | null; // cierre del día anterior
  tiempos: number[]; // ms
  cierres: number[];
  fuente: "Yahoo Finanzas" | "Stooq";
}

type Fetch = typeof fetch;
let pedir: Fetch = (entrada, opciones) => fetch(entrada, opciones);
/** Para las pruebas (internet simulado). */
export function usarFetch(f: Fetch): void {
  pedir = f;
}

const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" };

async function deYahoo(simbolo: string, rango: string, intervalo: string): Promise<Serie> {
  let ultimoError: unknown;
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${rango}&interval=${intervalo}&includePrePost=false`;
      const r = await pedir(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(12_000) });
      if (r.status === 404) throw new Error(`No existe el símbolo ${simbolo}.`);
      if (!r.ok) throw new Error(`Yahoo respondió ${r.status}`);
      const datos: any = await r.json();
      const res = datos?.chart?.result?.[0];
      if (!res) throw new Error(datos?.chart?.error?.description || `Sin datos de ${simbolo}`);
      const tiempos: number[] = [];
      const cierres: number[] = [];
      const brutos: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
      (res.timestamp ?? []).forEach((t: number, i: number) => {
        const c = brutos[i];
        if (typeof c === "number" && Number.isFinite(c)) {
          tiempos.push(t * 1000);
          cierres.push(c);
        }
      });
      if (!cierres.length) throw new Error(`Sin precios de ${simbolo}`);
      const meta = res.meta ?? {};
      const precio = Number(meta.regularMarketPrice) || cierres[cierres.length - 1];
      const anterior = intervalo === "1d" && cierres.length > 1 ? cierres[cierres.length - 2] : Number(meta.previousClose) || null;
      return {
        simbolo,
        nombre: NOMBRES[simbolo] || ETFS[simbolo]?.nombre || meta.longName || meta.shortName || simbolo,
        moneda: String(meta.currency ?? ""),
        precio,
        anterior,
        tiempos,
        cierres,
        fuente: "Yahoo Finanzas",
      };
    } catch (err) {
      ultimoError = err;
      if (err instanceof Error && /No existe el símbolo/.test(err.message)) throw err;
    }
  }
  throw ultimoError;
}

/** Símbolo de Yahoo → símbolo de Stooq (respaldo). null si Stooq no lo tiene. */
export function aStooq(simbolo: string): string | null {
  const fijos: Record<string, string> = {
    "^GSPC": "^spx", "^IXIC": "^ndq", "^DJI": "^dji", "MXN=X": "usdmxn", "EURMXN=X": "eurmxn",
    "BTC-USD": "btcusd", "ETH-USD": "ethusd", "GC=F": "xauusd",
  };
  if (fijos[simbolo]) return fijos[simbolo];
  if (/[=^]|\.MX$|-USD$/.test(simbolo)) return null;
  return `${simbolo.toLowerCase().replace("-", ".")}.us`;
}

async function deStooq(simbolo: string): Promise<Serie> {
  const s = aStooq(simbolo);
  if (!s) throw new Error(`El respaldo no tiene ${simbolo}`);
  const r = await pedir(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`, { headers: NAVEGADOR, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`Stooq respondió ${r.status}`);
  const lineas = (await r.text()).trim().split(/\r?\n/);
  if (!/^Date,/i.test(lineas[0] ?? "")) throw new Error(`Sin datos de ${simbolo}`);
  const tiempos: number[] = [];
  const cierres: number[] = [];
  for (const l of lineas.slice(1)) {
    const [fecha, , , , cierre] = l.split(",");
    const c = Number(cierre);
    const t = Date.parse(`${fecha}T21:00:00Z`);
    if (Number.isFinite(c) && Number.isFinite(t)) {
      tiempos.push(t);
      cierres.push(c);
    }
  }
  if (!cierres.length) throw new Error(`Sin precios de ${simbolo}`);
  // Solo los últimos ~6 años
  const desde = Date.now() - 6.2 * 365 * 86400_000;
  const i0 = Math.max(0, tiempos.findIndex((t) => t >= desde));
  return {
    simbolo,
    nombre: NOMBRES[simbolo] || ETFS[simbolo]?.nombre || simbolo,
    moneda: simbolo === "MXN=X" || simbolo === "EURMXN=X" ? "MXN" : "USD",
    precio: cierres[cierres.length - 1],
    anterior: cierres.length > 1 ? cierres[cierres.length - 2] : null,
    tiempos: tiempos.slice(i0),
    cierres: cierres.slice(i0),
    fuente: "Stooq",
  };
}

/** Historia de precios: `largo` = 5 años (semanal) para comparar ETFs; si no, 1 año (diario). */
export async function historia(simbolo: string, largo = false): Promise<Serie> {
  try {
    return largo ? await deYahoo(simbolo, "5y", "1wk") : await deYahoo(simbolo, "1y", "1d");
  } catch (err) {
    if (err instanceof Error && /No existe el símbolo/.test(err.message)) throw err;
    try {
      return await deStooq(simbolo);
    } catch {
      throw err;
    }
  }
}

// ------------------------------------------------------------------ cálculos

/** Cambio en % desde el precio de hace `dias` días (o null si no hay historia suficiente). */
function cambioDesde(s: Serie, desdeMs: number): number | null {
  if (!s.tiempos.length || s.tiempos[0] > desdeMs + 5 * 86400_000) return null;
  let i = s.tiempos.findIndex((t) => t >= desdeMs);
  if (i < 0) return null;
  if (i > 0 && desdeMs - s.tiempos[i - 1] < s.tiempos[i] - desdeMs) i -= 1;
  const base = s.cierres[i];
  return base ? ((s.precio - base) / base) * 100 : null;
}

export interface Metricas {
  hoy: number | null;
  mes: number | null;
  anio: number | null; // en lo que va del año
  doceMeses: number | null;
  cincoAniosAnual: number | null; // rendimiento promedio por año en 5 años
  volatilidad: number | null; // % anual (qué tanto sube y baja)
  peorCaida: number | null; // % (máxima caída desde un pico)
}

export function metricas(s: Serie, ahora = Date.now()): Metricas {
  const dia = 86400_000;
  const inicioAnio = new Date(new Date(ahora).getFullYear(), 0, 1).getTime() - dia;
  const cinco = cambioDesde(s, ahora - 5 * 365 * dia);
  // Volatilidad con los cambios entre puntos (diarios o semanales) del último año
  const ultimoAnio = s.tiempos.map((t, i) => [t, s.cierres[i]] as const).filter(([t]) => t >= ahora - 366 * dia);
  let volatilidad: number | null = null;
  if (ultimoAnio.length > 10) {
    const rend: number[] = [];
    for (let i = 1; i < ultimoAnio.length; i++) rend.push(Math.log(ultimoAnio[i][1] / ultimoAnio[i - 1][1]));
    const media = rend.reduce((a, b) => a + b, 0) / rend.length;
    const varianza = rend.reduce((a, b) => a + (b - media) ** 2, 0) / (rend.length - 1);
    const pasoDias = (ultimoAnio[ultimoAnio.length - 1][0] - ultimoAnio[0][0]) / dia / (ultimoAnio.length - 1);
    const porAnio = pasoDias > 3 ? 52 : 252;
    volatilidad = Math.sqrt(varianza * porAnio) * 100;
  }
  let pico = -Infinity;
  let peor = 0;
  for (const c of s.cierres) {
    pico = Math.max(pico, c);
    peor = Math.min(peor, (c - pico) / pico);
  }
  return {
    hoy: s.anterior ? ((s.precio - s.anterior) / s.anterior) * 100 : null,
    mes: cambioDesde(s, ahora - 30 * dia),
    anio: cambioDesde(s, inicioAnio),
    doceMeses: cambioDesde(s, ahora - 365 * dia),
    cincoAniosAnual: cinco === null ? null : (Math.pow(1 + cinco / 100, 1 / 5) - 1) * 100,
    volatilidad,
    peorCaida: s.cierres.length > 1 ? peor * 100 : null,
  };
}

// ------------------------------------------------------------------ texto

export const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "▲ +" : "▼ "}${v.toFixed(2)} %`);
export const pctSimple = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)} %`);
export function precioLegible(s: Serie): string {
  const n = s.precio;
  const dec = n >= 1000 ? 0 : n >= 10 ? 2 : 4;
  const num = n.toLocaleString("es-MX", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (s.simbolo.startsWith("^")) return `${num} puntos`;
  return `${num} ${s.moneda === "MXN" ? "pesos" : s.moneda === "USD" ? "dólares" : s.moneda}`.trim();
}

export const AVISO =
  "Esto es información para que tú decidas, no una recomendación personal de inversión. Los rendimientos pasados no " +
  "garantizan los futuros: el dinero invertido en bolsa puede bajar. Antes de invertir revisa comisiones, impuestos y " +
  "que la casa de bolsa esté autorizada por la CNBV.";

export const PREGUNTA_DONDE_COMPRAR =
  "¿Dónde y cómo puede una persona en México comprar ETFs como VOO, QQQ o VT en pesos? Lista las casas de bolsa y apps " +
  "mexicanas autorizadas por la CNBV con acceso al SIC (Sistema Internacional de Cotizaciones) (por ejemplo GBM, " +
  "Bursanet, Kuspit, Actinver, Banorte, Monex u otras vigentes), con su comisión por operación, monto mínimo para " +
  "empezar, si permiten fracciones y cualquier costo de custodia, con datos ACTUALES de este año. Menciona también la " +
  "opción de brokers internacionales y sus diferencias (formulario W-8BEN, impuestos, tipo de cambio). Incluye cómo se " +
  "pagan impuestos en México por ganancias en el SIC (ISR del 10 % sobre la ganancia) y la retención de dividendos. " +
  "Responde en español, claro y breve, para un principiante.";

// ------------------------------------------------------------------ gráfica (SVG para la pizarra)

const COLORES = ["#00e5ff", "#ffb347", "#00f5a0", "#ff6bd5", "#9d8cff", "#ff5c5c", "#f5f56b", "#7ec8ff", "#c0ff6b", "#ff9b54"];

// Nombres cortos para la leyenda de la gráfica
const LEYENDA: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones", "^MXX": "IPC México", "MXN=X": "Dólar", "EURMXN=X": "Euro",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "GC=F": "Oro", "SI=F": "Plata", "CL=F": "Petróleo",
};

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Gráfica de líneas: cada serie empieza en `base` (por ejemplo 10,000 pesos invertidos o 0 %) y muestra cómo creció.
 * `modo` "dinero" = valor de `base` invertidos; "porcentaje" = cambio en % desde el inicio.
 */
export function graficaSvg(series: Serie[], titulo: string, modo: "dinero" | "porcentaje", base = 10_000): string {
  const W = 1200, H = 760, izq = 110, der = 250, arriba = 90, abajo = 80;
  const validas = series.filter((s) => s.cierres.length > 1);
  if (!validas.length) return "";
  // Todas empiezan en la misma fecha (la más reciente de los inicios)
  const inicio = Math.max(...validas.map((s) => s.tiempos[0]));
  const fin = Math.max(...validas.map((s) => s.tiempos[s.tiempos.length - 1]));
  const lineas = validas.map((s) => {
    const i0 = Math.max(0, s.tiempos.findIndex((t) => t >= inicio));
    const c0 = s.cierres[i0];
    const puntos = s.tiempos.slice(i0).map((t, k) => {
      const factor = s.cierres[i0 + k] / c0;
      return [t, modo === "dinero" ? base * factor : (factor - 1) * 100] as const;
    });
    return { s, puntos };
  });
  const valores = lineas.flatMap((l) => l.puntos.map((p) => p[1]));
  let min = Math.min(...valores, modo === "dinero" ? base : 0);
  let max = Math.max(...valores, modo === "dinero" ? base : 0);
  // Marcas "redondas" en el eje (por ejemplo 10,000 · 15,000 · 20,000)
  const crudo = (max - min) / 5 || 1;
  const potencia = Math.pow(10, Math.floor(Math.log10(crudo)));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= crudo) ?? crudo;
  min = Math.floor(min / paso) * paso;
  max = Math.ceil(max / paso) * paso;
  const marcasY = Math.round((max - min) / paso);
  const x = (t: number) => izq + ((t - inicio) / Math.max(1, fin - inicio)) * (W - izq - der);
  const y = (v: number) => arriba + (1 - (v - min) / (max - min)) * (H - arriba - abajo);
  const etiqueta = (v: number) =>
    modo === "dinero" ? `$${Math.round(v).toLocaleString("es-MX")}` : `${v >= 0 ? "+" : ""}${v.toFixed(0)} %`;

  const partes: string[] = [];
  partes.push(`<rect width="${W}" height="${H}" fill="#030a18"/>`);
  partes.push(`<text x="${izq}" y="48" fill="#e2f8ff" font-size="30" font-family="sans-serif" font-weight="bold">${escapar(titulo)}</text>`);
  // Cuadrícula horizontal con 6 marcas
  for (let i = 0; i <= marcasY; i++) {
    const v = min + paso * i;
    const yy = y(v);
    partes.push(`<line x1="${izq}" y1="${yy.toFixed(1)}" x2="${W - der}" y2="${yy.toFixed(1)}" stroke="#1d3350" stroke-width="1"/>`);
    partes.push(`<text x="${izq - 12}" y="${(yy + 6).toFixed(1)}" fill="#8fb4d6" font-size="17" font-family="sans-serif" text-anchor="end">${escapar(etiqueta(v))}</text>`);
  }
  // Línea de partida (lo invertido / 0 %)
  const yBase = y(modo === "dinero" ? base : 0);
  partes.push(`<line x1="${izq}" y1="${yBase.toFixed(1)}" x2="${W - der}" y2="${yBase.toFixed(1)}" stroke="#8fb4d6" stroke-width="1.5" stroke-dasharray="6 6"/>`);
  // Años (o meses) en el eje de abajo
  const dias = (fin - inicio) / 86400_000;
  // Varios años: una marca cada 1 de enero; un año o menos: 6 marcas con mes y año
  const marcasX: number[] = [];
  if (dias > 500) {
    for (let a = new Date(inicio).getFullYear() + 1; a <= new Date(fin).getFullYear(); a++) marcasX.push(new Date(a, 0, 1).getTime());
  } else {
    for (let i = 0; i <= 6; i++) marcasX.push(inicio + ((fin - inicio) * i) / 6);
  }
  for (const t of marcasX) {
    const f = new Date(t);
    const texto = dias > 500 ? String(f.getFullYear()) : f.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
    partes.push(`<text x="${x(t).toFixed(1)}" y="${H - abajo + 32}" fill="#8fb4d6" font-size="17" font-family="sans-serif" text-anchor="middle">${escapar(texto)}</text>`);
  }
  // Líneas
  const ordenadas = [...lineas].sort((a, b) => b.puntos[b.puntos.length - 1][1] - a.puntos[a.puntos.length - 1][1]);
  ordenadas.forEach((l, i) => {
    const color = COLORES[lineas.indexOf(l) % COLORES.length];
    const d = l.puntos.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
    partes.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`);
    // Leyenda a la derecha, de mayor a menor valor final
    const final = l.puntos[l.puntos.length - 1][1];
    const ly = arriba + 10 + i * 56;
    const nombre = (LEYENDA[l.s.simbolo] ?? l.s.simbolo.replace("ISHRS.MX", "").replace(".MX", "")).slice(0, 13);
    partes.push(`<rect x="${W - der + 24}" y="${ly}" width="18" height="18" rx="3" fill="${color}"/>`);
    partes.push(`<text x="${W - der + 50}" y="${ly + 15}" fill="#e2f8ff" font-size="20" font-family="sans-serif" font-weight="bold">${escapar(nombre)}</text>`);
    partes.push(`<text x="${W - der + 50}" y="${ly + 40}" fill="${color}" font-size="18" font-family="sans-serif">${escapar(etiqueta(final))}</text>`);
  });
  const nota =
    modo === "dinero"
      ? `Si hubieras invertido $${base.toLocaleString("es-MX")} al inicio (sin contar comisiones ni el tipo de cambio)`
      : "Cambio desde el inicio del periodo";
  partes.push(`<text x="${izq}" y="74" fill="#8fb4d6" font-size="18" font-family="sans-serif">${escapar(nota)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${partes.join("")}</svg>`;
}

// ------------------------------------------------------------------ análisis: ¿cuál es mejor... para qué?

export interface Fila {
  s: Serie;
  m: Metricas;
}

const corto = (s: Serie) => s.simbolo.replace("ISHRS.MX", "");

/** Análisis con reglas claras sobre los datos reales (no opiniones inventadas). Devuelve texto para la pizarra y para la voz. */
export function analisisEtfs(filas: Fila[]): { texto: string; resumen: string } {
  const con = (f: (x: Fila) => number | null) => filas.filter((x) => f(x) !== null) as Fila[];
  const mejorPor = (f: (x: Fila) => number | null, mayor = true) => {
    const lista = con(f).sort((a, b) => (mayor ? f(b)! - f(a)! : f(a)! - f(b)!));
    return lista[0] ?? null;
  };
  const costoNum = (x: Fila) => {
    const c = ETFS[x.s.simbolo]?.costo;
    const n = c ? Number(c.replace(/[^\d.]/g, "")) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  // Equilibrio ganancia/riesgo: rendimiento anual de 5 años ÷ qué tanto sube y baja
  const equilibrio = (x: Fila) =>
    x.m.cincoAniosAnual !== null && x.m.volatilidad ? x.m.cincoAniosAnual / x.m.volatilidad : null;

  const ganador = mejorPor((x) => x.m.cincoAniosAnual);
  const estable = mejorPor((x) => x.m.volatilidad, false);
  const balance = mejorPor(equilibrio);
  const barato = mejorPor(costoNum, false);
  const ultimoAnio = mejorPor((x) => x.m.doceMeses);
  const caida = mejorPor((x) => x.m.peorCaida); // la caída menos profunda

  const lineas: string[] = [];
  if (ganador) lineas.push(`- **El que más creció (5 años):** ${corto(ganador.s)}, ${pctSimple(ganador.m.cincoAniosAnual)} por año en promedio.`);
  if (ultimoAnio) lineas.push(`- **El mejor del último año:** ${corto(ultimoAnio.s)}, ${pctSimple(ultimoAnio.m.doceMeses)}.`);
  if (estable) lineas.push(`- **El más estable (sube y baja menos):** ${corto(estable.s)}, ±${estable.m.volatilidad!.toFixed(0)} % al año.`);
  if (caida) lineas.push(`- **El que menos cayó en su peor momento:** ${corto(caida.s)}, ${pctSimple(caida.m.peorCaida)}.`);
  if (balance) lineas.push(`- **Mejor equilibrio entre ganancia y riesgo:** ${corto(balance.s)} (gana más por cada punto de riesgo).`);
  if (barato) {
    const empatados = filas.filter((x) => costoNum(x) === costoNum(barato)).map((x) => corto(x.s));
    lineas.push(`- **El más barato de mantener:** ${empatados.join(", ")}, costo anual ${ETFS[barato.s.simbolo]?.costo}.`);
  }

  // Para quién es cada uno (según lo que tiene adentro y sus números)
  const perfiles: string[] = [];
  const hay = (s: string) => filas.find((x) => x.s.simbolo === s);
  const amplios = ["VOO", "IVV", "SPY", "VTI", "VT", "ACWI"].map(hay).filter(Boolean) as Fila[];
  const mejorAmplio = amplios.sort((a, b) => (equilibrio(b) ?? -9) - (equilibrio(a) ?? -9))[0];
  if (mejorAmplio) perfiles.push(`- **Largo plazo (5+ años), simple y barato:** un índice amplio como ${corto(mejorAmplio.s)}${amplios.length > 1 ? ` (entre ${amplios.map((a) => corto(a.s)).join(", ")}, es el de mejor equilibrio en estos datos)` : ""}.`);
  if (hay("QQQ")) perfiles.push("- **Más crecimiento aceptando más sube y baja:** QQQ (mucha tecnología; en las bajadas cae más).");
  if (hay("VT") || hay("VXUS") || hay("ACWI")) perfiles.push(`- **Diversificar fuera de EE. UU.:** ${["VT", "VXUS", "ACWI"].filter(hay).join(" o ")}.`);
  if (hay("SCHD") || hay("VYM")) perfiles.push(`- **Recibir dividendos (pagos periódicos):** ${["SCHD", "VYM"].filter(hay).join(" o ")}.`);
  if (hay("BND")) perfiles.push("- **Poco riesgo / dinero que necesitarás pronto:** BND (bonos), gana menos pero se mueve poco.");
  if (hay("NAFTRACISHRS.MX")) perfiles.push("- **Invertir en México y en pesos (sin riesgo del dólar):** NAFTRAC.");

  const texto =
    "## Análisis: ¿cuál es mejor?\n" +
    lineas.join("\n") +
    (perfiles.length ? "\n\n## Depende de para qué lo quieras\n" + perfiles.join("\n") : "") +
    "\n\nNo hay un ETF \"mejor\" para todos: depende de tu plazo y de cuánto riesgo aguantes. Muchas personas combinan " +
    "uno amplio y barato como base con otros en menor cantidad.";
  const resumen = [
    ganador && `el que más creció fue ${corto(ganador.s)}`,
    estable && `el más estable ${corto(estable.s)}`,
    balance && `el de mejor equilibrio entre ganancia y riesgo ${corto(balance.s)}`,
    barato && `el más barato ${corto(barato.s)}`,
  ]
    .filter(Boolean)
    .join(", ");
  return { texto, resumen };
}
