/**
 * Crear documentos de Word, Excel y PowerPoint sobre un tema, con información de FUENTES CONFIABLES.
 *
 * 1. Investigación: Gemini + Búsqueda de Google, pidiendo preferir fuentes confiables (gobierno, universidades,
 *    organismos internacionales, revistas científicas, enciclopedias) y anotar de qué fuente sale cada dato.
 * 2. Estructura: Gemini arma el contenido en un formato fijo (JSON) según el tipo de archivo, citando [1], [2]...
 * 3. Archivo: se arma con docx / exceljs / pptxgenjs, con una sección o diapositiva final de "Fuentes" con enlaces,
 *    y se guarda en Documentos\Jarvis\Creados.
 */

import { mkdir } from "fs/promises";
import path from "path";
import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { writeFile } from "fs/promises";
import { carpetasUsuario } from "./windows.ts";

export type TipoDocumento = "word" | "excel" | "powerpoint";

export interface Fuente {
  titulo: string;
  url: string;
}

// ------------------------------------------------------------------ fuentes confiables

/** Dominios que se consideran confiables (se ponen primero en la lista de fuentes). */
const CONFIABLES =
  /(\.gob\.|\.gov\b|\.gov\.|\.edu\b|\.edu\.|\.ac\.|unam\.mx|tec\.mx|ipn\.mx|inegi|who\.int|un\.org|unesco|oecd|worldbank|imf\.org|cepal|nasa|noaa|nih\.gov|cdc\.gov|nature\.com|science\.org|sciencedirect|springer|wiley|scielo|redalyc|jstor|pubmed|ncbi|britannica|nationalgeographic|rae\.es|banxico|europa\.eu|ieee|acm\.org|wikipedia\.org|iea\.org|irena\.org|ipcc\.ch|fao\.org|unicef|paho\.org|iadb\.org|conahcyt|khanacademy|harvard|stanford|ox\.ac|cambridge\.org)/i;

export const esConfiable = (f: Fuente) => CONFIABLES.test(f.url) || CONFIABLES.test(f.titulo);

/**
 * Las fuentes de la Búsqueda de Google vienen como enlaces de redirección; se sigue la redirección para tener la
 * dirección real de la página (y así saber de qué sitio es). Si falla, se deja el enlace original.
 */
export async function direccionesReales(fuentes: Fuente[]): Promise<Fuente[]> {
  return Promise.all(
    fuentes.map(async (f) => {
      if (!/grounding-api-redirect|vertexaisearch/.test(f.url)) return f;
      try {
        const r = await fetch(f.url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
        const destino = r.headers.get("location");
        return destino && /^https?:\/\//.test(destino) ? { ...f, url: destino } : f;
      } catch {
        return f;
      }
    })
  );
}

/** Ordena: primero las confiables. Sin repetidos, máximo 12. */
export function ordenarFuentes(fuentes: Fuente[]): Fuente[] {
  const vistos = new Set<string>();
  const unicas = fuentes.filter((f) => {
    const clave = f.url.replace(/[?#].*$/, "");
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  return [...unicas.filter(esConfiable), ...unicas.filter((f) => !esConfiable(f))].slice(0, 12);
}

// ------------------------------------------------------------------ instrucciones para Gemini

export const INSTRUCCION_INVESTIGACION =
  "Eres un investigador riguroso. Busca en internet información actual y CONFIABLE sobre el tema: da prioridad a sitios " +
  "de gobierno (.gob, .gov), universidades (.edu), organismos internacionales (ONU, OMS, UNESCO, OCDE, Banco Mundial, " +
  "INEGI), revistas científicas y enciclopedias reconocidas. Evita blogs, foros y sitios sin autor. Escribe en español " +
  "notas DETALLADAS: datos, cifras con su año, fechas, definiciones, ejemplos y explicaciones. No inventes nada; si un " +
  "dato no está confirmado, dilo.";

export function pedidoDeEstructura(tipo: TipoDocumento, tema: string, instrucciones: string, notas: string, fuentes: Fuente[]): string {
  const lista = fuentes.map((f, i) => `[${i + 1}] ${f.titulo} — ${f.url}`).join("\n");
  const formato =
    tipo === "word"
      ? "un documento de Word completo y bien redactado (introducción, varias secciones con párrafos y viñetas, conclusión)"
      : tipo === "excel"
      ? "un libro de Excel con tablas de datos útiles (una o más hojas, con encabezados claros; números sin unidades dentro de la celda, las unidades van en el encabezado)"
      : "una presentación de PowerPoint de 8 a 12 diapositivas (puntos cortos, máximo 6 por diapositiva, y notas del orador)";
  return (
    `Con base SOLO en estas notas de investigación, prepara ${formato} sobre: "${tema}".\n` +
    (instrucciones ? `Indicaciones del usuario: ${instrucciones}\n` : "") +
    "Escribe en español, claro y correcto. Cuando uses un dato de una fuente, cítala con su número entre corchetes, " +
    "por ejemplo [1] o [2][3] (usa SOLO los números de la lista de fuentes). No inventes datos ni fuentes.\n\n" +
    `FUENTES:\n${lista || "(sin fuentes)"}\n\nNOTAS DE INVESTIGACIÓN:\n${notas.slice(0, 60_000)}`
  );
}

const lista = (items: object) => ({ type: "array", items });
const texto = { type: "string" };

export const ESQUEMAS: Record<TipoDocumento, object> = {
  word: {
    type: "object",
    properties: {
      titulo: texto,
      introduccion: texto,
      secciones: lista({
        type: "object",
        properties: { titulo: texto, parrafos: lista(texto), puntos: lista(texto) },
        required: ["titulo", "parrafos"],
      }),
      conclusion: texto,
    },
    required: ["titulo", "introduccion", "secciones", "conclusion"],
  },
  excel: {
    type: "object",
    properties: {
      titulo: texto,
      hojas: lista({
        type: "object",
        properties: { nombre: texto, descripcion: texto, columnas: lista(texto), filas: lista(lista(texto)) },
        required: ["nombre", "columnas", "filas"],
      }),
    },
    required: ["titulo", "hojas"],
  },
  powerpoint: {
    type: "object",
    properties: {
      titulo: texto,
      subtitulo: texto,
      diapositivas: lista({
        type: "object",
        properties: { titulo: texto, puntos: lista(texto), notas: texto },
        required: ["titulo", "puntos"],
      }),
    },
    required: ["titulo", "diapositivas"],
  },
};

// ------------------------------------------------------------------ armar los archivos

const t = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const nombreSeguro = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Documento";

async function rutaNueva(titulo: string, extension: string): Promise<string> {
  const carpeta = path.join((await carpetasUsuario()).jarvis, "Creados");
  await mkdir(carpeta, { recursive: true });
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}${dos(d.getMinutes())}`;
  return path.join(carpeta, `${nombreSeguro(titulo)} (${fecha}).${extension}`);
}

async function armarWord(c: any, fuentes: Fuente[], tema: string): Promise<{ archivo: string; titulo: string }> {
  const titulo = t(c.titulo, 200) || tema;
  const p = (s: string) => new Paragraph({ children: [new TextRun(s)], spacing: { after: 140 }, alignment: AlignmentType.JUSTIFIED });
  const partes: Paragraph[] = [
    new Paragraph({ text: titulo, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }), italics: true, color: "666666" })],
    }),
    new Paragraph({ text: "Introducción", heading: HeadingLevel.HEADING_1 }),
    ...t(c.introduccion).split(/\n+/).filter(Boolean).map(p),
  ];
  for (const s of arr(c.secciones)) {
    partes.push(new Paragraph({ text: t(s?.titulo, 200) || "Sección", heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }));
    partes.push(...arr(s?.parrafos).map((x) => p(t(x))).filter(Boolean));
    partes.push(...arr(s?.puntos).map((x) => new Paragraph({ children: [new TextRun(t(x))], bullet: { level: 0 } })));
  }
  partes.push(new Paragraph({ text: "Conclusión", heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }));
  partes.push(...t(c.conclusion).split(/\n+/).filter(Boolean).map(p));
  partes.push(new Paragraph({ text: "Fuentes", heading: HeadingLevel.HEADING_1, spacing: { before: 240 } }));
  fuentes.forEach((f, i) =>
    partes.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun(`[${i + 1}] ${f.titulo}. Disponible en: `),
          new ExternalHyperlink({ link: f.url, children: [new TextRun({ text: f.url, style: "Hyperlink" })] }),
        ],
      })
    )
  );
  const doc = new Document({
    creator: "J.A.R.V.I.S.",
    title: titulo,
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: partes }],
  });
  const archivo = await rutaNueva(titulo, "docx");
  await writeFile(archivo, await Packer.toBuffer(doc));
  return { archivo, titulo };
}

/** "1,234.5" o "45%" → número (para que Excel pueda sumar y graficar). */
function comoNumero(v: string): string | number {
  const limpio = v.replace(/[\s,$]/g, "");
  return /^-?\d+(\.\d+)?$/.test(limpio) && limpio.length < 16 ? Number(limpio) : v;
}

async function armarExcel(c: any, fuentes: Fuente[], tema: string): Promise<{ archivo: string; titulo: string }> {
  const titulo = t(c.titulo, 200) || tema;
  const libro = new ExcelJS.Workbook();
  libro.creator = "J.A.R.V.I.S.";
  const usados = new Set<string>();
  for (const h of arr(c.hojas).slice(0, 10)) {
    let nombre = (t(h?.nombre, 28).replace(/[\\/?*[\]:]/g, "") || "Datos").slice(0, 28);
    while (usados.has(nombre.toLowerCase())) nombre = `${nombre.slice(0, 25)} ${usados.size}`;
    usados.add(nombre.toLowerCase());
    const hoja = libro.addWorksheet(nombre);
    const columnas = arr(h?.columnas).map((x) => t(x, 100)).slice(0, 30);
    let fila = 1;
    if (t(h?.descripcion)) {
      hoja.getCell(1, 1).value = t(h.descripcion, 500);
      hoja.getCell(1, 1).font = { italic: true, color: { argb: "FF555555" } };
      fila = 3;
    }
    const encabezado = hoja.getRow(fila);
    columnas.forEach((col, i) => (encabezado.getCell(i + 1).value = col));
    encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
    encabezado.eachCell((celda) => (celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4F6C" } }));
    for (const f of arr(h?.filas).slice(0, 1000)) {
      fila++;
      arr(f).slice(0, columnas.length || 30).forEach((v, i) => (hoja.getCell(fila, i + 1).value = comoNumero(t(String(v ?? ""), 1000))));
    }
    if (columnas.length) {
      hoja.autoFilter = { from: { row: encabezado.number, column: 1 }, to: { row: fila, column: columnas.length } };
      hoja.views = [{ state: "frozen", ySplit: encabezado.number }];
      columnas.forEach((col, i) => {
        let ancho = col.length;
        hoja.getColumn(i + 1).eachCell({ includeEmpty: false }, (celda) => {
          // La descripción de arriba no cuenta para el ancho
          if (Number(celda.row) >= encabezado.number) ancho = Math.max(ancho, String(celda.value ?? "").length);
        });
        hoja.getColumn(i + 1).width = Math.min(60, Math.max(10, ancho + 2));
      });
    }
  }
  if (!usados.size) libro.addWorksheet("Datos");
  const hf = libro.addWorksheet("Fuentes");
  hf.getRow(1).values = ["#", "Fuente", "Enlace"];
  hf.getRow(1).font = { bold: true };
  fuentes.forEach((f, i) => {
    const r = hf.getRow(i + 2);
    r.values = [i + 1, f.titulo, { text: f.url, hyperlink: f.url }];
    r.getCell(3).font = { color: { argb: "FF0563C1" }, underline: true };
  });
  hf.getColumn(2).width = 50;
  hf.getColumn(3).width = 80;
  const archivo = await rutaNueva(titulo, "xlsx");
  await libro.xlsx.writeFile(archivo);
  return { archivo, titulo };
}

async function armarPowerPoint(c: any, fuentes: Fuente[], tema: string): Promise<{ archivo: string; titulo: string }> {
  const titulo = t(c.titulo, 200) || tema;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 pulgadas
  pres.title = titulo;
  const FONDO = "0B1F33";
  const ACENTO = "00B4D8";

  const portada = pres.addSlide();
  portada.background = { color: FONDO };
  portada.addShape(pres.ShapeType.rect, { x: 0, y: 3.55, w: 13.33, h: 0.06, fill: { color: ACENTO } });
  portada.addText(titulo, { x: 0.8, y: 1.6, w: 11.7, h: 1.8, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri", valign: "bottom" });
  portada.addText(t(c.subtitulo, 300) || new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }), {
    x: 0.8, y: 3.8, w: 11.7, h: 0.8, fontSize: 20, color: "BFE9F5", fontFace: "Calibri",
  });

  for (const d of arr(c.diapositivas).slice(0, 25)) {
    const s = pres.addSlide();
    s.background = { color: "FFFFFF" };
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.15, fill: { color: FONDO } });
    s.addText(t(d?.titulo, 150) || " ", { x: 0.6, y: 0.15, w: 12.1, h: 0.85, fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Calibri" });
    const puntos = arr(d?.puntos).map((x) => t(x, 400)).filter(Boolean).slice(0, 8);
    if (puntos.length) {
      s.addText(
        puntos.map((x) => ({ text: x, options: { bullet: { code: "25A0" }, paraSpaceAfter: 10 } })),
        { x: 0.8, y: 1.5, w: 11.7, h: 5.4, fontSize: puntos.length > 5 ? 18 : 22, color: "1F2D3D", fontFace: "Calibri", valign: "top" }
      );
    }
    if (t(d?.notas)) s.addNotes(t(d.notas, 3000));
  }

  const sf = pres.addSlide();
  sf.background = { color: "FFFFFF" };
  sf.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.15, fill: { color: FONDO } });
  sf.addText("Fuentes", { x: 0.6, y: 0.15, w: 12.1, h: 0.85, fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Calibri" });
  sf.addText(
    fuentes.length
      ? fuentes.map((f, i) => ({ text: `[${i + 1}] ${f.titulo}`, options: { hyperlink: { url: f.url }, breakLine: true } }))
      : [{ text: "Sin fuentes." }],
    { x: 0.8, y: 1.4, w: 11.7, h: 5.6, fontSize: fuentes.length > 8 ? 12 : 14, color: "0563C1", fontFace: "Calibri", valign: "top" }
  );

  const archivo = await rutaNueva(titulo, "pptx");
  await pres.writeFile({ fileName: archivo });
  return { archivo, titulo };
}

export function armarDocumento(tipo: TipoDocumento, contenido: any, fuentes: Fuente[], tema: string) {
  return tipo === "word"
    ? armarWord(contenido, fuentes, tema)
    : tipo === "excel"
    ? armarExcel(contenido, fuentes, tema)
    : armarPowerPoint(contenido, fuentes, tema);
}
