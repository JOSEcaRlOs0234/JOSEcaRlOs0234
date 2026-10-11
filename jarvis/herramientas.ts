/**
 * La LISTA PERMITIDA de cosas que Jarvis puede hacer en la laptop.
 * Gemini solo puede pedir estas acciones; cada una revisa sus datos antes de ejecutarse
 * y tiene su propio nivel de permiso. Nada fuera de esta lista se puede hacer.
 */

import { existsSync } from "fs";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as win from "./windows.ts";
import { agregarRecuerdo, borrarRecuerdo, MAX_LARGO_RECUERDO } from "./memoria.ts";
import { borrarPizarra, escribirPizarra, MAX_PIZARRA } from "./pizarra.ts";
import { buscarEnHistorial } from "./historial.ts";
import { consultarClima, consultarNoticias } from "./informacion.ts";
import { agregarRecordatorio, cancelarRecordatorio, cuandoLegible, leerRecordatorios } from "./recordatorios.ts";
import { claudeConfigurado, consultarAClaude, explicarErrorClaude } from "./consultas.ts";

// El servidor conecta aquí la búsqueda con Gemini + Google (necesita la clave y el modelo actual)
let investigador: ((pregunta: string) => Promise<string>) | null = null;
export function conectarInvestigador(f: (pregunta: string) => Promise<string>): void {
  investigador = f;
}

const CARPETA_JARVIS_APP = path.dirname(fileURLToPath(import.meta.url));

/**
 * Nivel de permiso de cada acción:
 *  - "normal": pide permiso, pero el usuario puede marcar "no volver a preguntar".
 *  - "delicada": SIEMPRE pide permiso (borrar, sobrescribir, apagar...).
 *  - "libre": no necesita permiso (no cambia nada en la laptop).
 */
export type Nivel = "libre" | "normal" | "delicada";

export interface Revisada {
  nivel: Nivel;
  // Tipo de permiso que se puede recordar (por ejemplo "abrir_programa")
  tipo: string;
  // Lo que se le muestra al usuario al pedir permiso
  descripcion: string;
  ejecutar: () => Promise<Record<string, unknown>>;
}

export class ErrorHerramienta extends Error {}

// ------------------------------------------------------------------ declaraciones para Gemini

export const DECLARACIONES = [
  {
    name: "abrir_programa",
    description:
      "Abre un programa instalado en la laptop (por ejemplo: Spotify, Chrome, Word, Bloc de notas, Calculadora, WhatsApp).",
    parametersJsonSchema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre del programa" } },
      required: ["nombre"],
    },
  },
  {
    name: "abrir_pagina_web",
    description: "Abre una página web en el navegador. Solo direcciones http o https.",
    parametersJsonSchema: {
      type: "object",
      properties: { url: { type: "string", description: "Dirección completa, por ejemplo https://www.youtube.com" } },
      required: ["url"],
    },
  },
  {
    name: "buscar_en_internet",
    description: "Abre una búsqueda de Google en el NAVEGADOR para que el usuario vea los resultados.",
    parametersJsonSchema: {
      type: "object",
      properties: { consulta: { type: "string" } },
      required: ["consulta"],
    },
  },
  {
    name: "controlar_volumen",
    description: "Sube, baja, silencia o fija el volumen de la laptop.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        accion: { type: "string", enum: ["subir", "bajar", "silenciar", "establecer"] },
        cantidad: {
          type: "integer",
          description: "Porcentaje: cuánto subir o bajar (por defecto 10), o el nivel exacto si accion=establecer.",
        },
      },
      required: ["accion"],
    },
  },
  {
    name: "listar_archivos",
    description:
      "Muestra los archivos de una carpeta del usuario. La ruta empieza con una de estas carpetas: Escritorio, Documentos, Descargas, Imagenes, Musica, Videos o Jarvis. Ejemplo: 'Documentos/Tareas'.",
    parametersJsonSchema: {
      type: "object",
      properties: { carpeta: { type: "string" } },
      required: ["carpeta"],
    },
  },
  {
    name: "leer_archivo",
    description: "Lee un archivo de texto (txt, md, csv, json...). Ruta como 'Escritorio/notas.txt'.",
    parametersJsonSchema: {
      type: "object",
      properties: { ruta: { type: "string" } },
      required: ["ruta"],
    },
  },
  {
    name: "crear_archivo",
    description:
      "Crea un archivo de texto dentro de la carpeta Documentos/Jarvis (la única carpeta donde Jarvis puede escribir).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del archivo, por ejemplo 'lista-compras.txt'" },
        contenido: { type: "string" },
        sobrescribir: { type: "boolean", description: "true si se quiere reemplazar un archivo que ya existe" },
      },
      required: ["nombre", "contenido"],
    },
  },
  {
    name: "abrir_archivo",
    description: "Abre un archivo o carpeta del usuario con su programa normal (por ejemplo un PDF o una foto).",
    parametersJsonSchema: {
      type: "object",
      properties: { ruta: { type: "string" } },
      required: ["ruta"],
    },
  },
  {
    name: "borrar_archivo",
    description: "Manda a la Papelera de reciclaje un archivo de la carpeta Documentos/Jarvis.",
    parametersJsonSchema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
    },
  },
  {
    name: "guardar_recuerdo",
    description:
      "Guarda en la memoria permanente algo sobre el usuario (su nombre, gustos, fechas importantes, pendientes). Úsalo cuando el usuario pida que recuerdes algo o comparta un dato personal útil. Una idea por recuerdo, escrita en tercera persona.",
    parametersJsonSchema: {
      type: "object",
      properties: { texto: { type: "string", description: "Por ejemplo: 'Se llama Elliott y vive en Monterrey'" } },
      required: ["texto"],
    },
  },
  {
    name: "olvidar_recuerdo",
    description: "Borra un recuerdo de la memoria cuando el usuario lo pida o cuando ya no sea cierto. Usa el [id] del recuerdo.",
    parametersJsonSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "programar_recordatorio",
    description:
      "Programa un recordatorio o alarma: Jarvis lo dirá en voz alta a la hora indicada. Usa 'minutos' para 'en X minutos/horas', o 'fecha_hora' (hora local, formato AAAA-MM-DDTHH:MM) para una hora exacta.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Qué hay que recordar, por ejemplo 'sacar la comida del horno'" },
        minutos: { type: "number", description: "Dentro de cuántos minutos (por ejemplo 20, o 90 para hora y media)" },
        fecha_hora: { type: "string", description: "Hora exacta local, por ejemplo 2026-10-12T07:00" },
      },
      required: ["texto"],
    },
  },
  {
    name: "ver_recordatorios",
    description: "Lista los recordatorios y alarmas pendientes (con su id).",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "cancelar_recordatorio",
    description: "Cancela un recordatorio pendiente por su id.",
    parametersJsonSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "consultar_clima",
    description:
      "Clima actual y pronóstico de 3 días de una ciudad. Si el usuario no dice ciudad, usa la que tengas en sus recuerdos o Monterrey.",
    parametersJsonSchema: {
      type: "object",
      properties: { ciudad: { type: "string", description: "Por ejemplo 'Monterrey' o 'Madrid, España'" } },
      required: ["ciudad"],
    },
  },
  {
    name: "consultar_noticias",
    description:
      "Titulares de noticias recientes de Google Noticias (México). Sin tema da las principales; con tema busca noticias de ese tema.",
    parametersJsonSchema: {
      type: "object",
      properties: { tema: { type: "string", description: "Opcional: 'deportes', 'tecnología', 'Rayados'..." } },
    },
  },
  {
    name: "investigar",
    description:
      "Busca información ACTUAL o que no sabes con seguridad (noticias, precios, clima, resultados, horarios, datos recientes) usando la Búsqueda de Google, y te devuelve la respuesta para que se la digas al usuario. Gratis.",
    parametersJsonSchema: {
      type: "object",
      properties: { pregunta: { type: "string" } },
      required: ["pregunta"],
    },
  },
  {
    name: "consultar_a_claude",
    description:
      "Le pregunta a Claude (otra inteligencia artificial, experta en razonamiento, programación y temas difíciles). Úsalo cuando el usuario lo pida o cuando no sepas algo y 'investigar' no fue suficiente. Cuesta unos centavos por consulta.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pregunta: { type: "string", description: "La pregunta completa, clara y con los detalles necesarios" },
        contexto: { type: "string", description: "Información de la conversación que Claude necesita (opcional)" },
      },
      required: ["pregunta"],
    },
  },
  {
    name: "escribir_en_pizarra",
    description:
      "Escribe en la pizarra que el usuario ve en pantalla. Úsala cuando pida una pizarra, apuntar algo, una lista, pasos, una explicación con estructura, una tabla o algo que convenga ver escrito. Formato: '# ' para títulos, '- ' para viñetas, '1. ' para pasos, **negritas**.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        contenido: { type: "string" },
        agregar: { type: "boolean", description: "true para añadir debajo de lo que ya hay; false (por defecto) para empezar limpia" },
      },
      required: ["contenido"],
    },
  },
  {
    name: "borrar_pizarra",
    description: "Borra todo lo que hay en la pizarra.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "buscar_en_historial",
    description:
      "Busca en TODAS las conversaciones pasadas con el usuario (desde el primer día). Úsalo cuando pregunte por algo que platicaron antes y no está en tus recuerdos.",
    parametersJsonSchema: {
      type: "object",
      properties: { palabras: { type: "string", description: "Palabras clave a buscar" } },
      required: ["palabras"],
    },
  },
  {
    name: "sistema",
    description: "Bloquear, suspender, reiniciar o apagar la laptop, o cancelar un apagado pendiente.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        accion: { type: "string", enum: ["bloquear", "suspender", "reiniciar", "apagar", "cancelar_apagado"] },
      },
      required: ["accion"],
    },
  },
];

// ------------------------------------------------------------------ utilidades

/** Minúsculas y sin acentos, para comparar nombres. */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function texto(valor: unknown, campo: string, max = 300): string {
  if (typeof valor !== "string" || !valor.trim()) throw new ErrorHerramienta(`Falta el dato "${campo}".`);
  if (valor.length > max) throw new ErrorHerramienta(`El dato "${campo}" es demasiado largo.`);
  return valor.trim();
}

function necesitaWindows(): void {
  if (!win.esWindows) throw new ErrorHerramienta("Esta acción solo funciona en Windows.");
}

const EXTENSIONES_TEXTO = new Set([
  ".txt", ".md", ".csv", ".json", ".log", ".html", ".htm", ".css", ".xml", ".yaml", ".yml", ".ini", ".srt",
]);

// Archivos que podrían ejecutar código: Jarvis nunca los abre ni los crea
const EXTENSIONES_PELIGROSAS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp",
  ".scr", ".lnk", ".hta", ".cpl", ".reg", ".jar", ".pif", ".url", ".appref-ms", ".inf", ".dll", ".sys",
]);

const NOMBRES_CARPETAS: Record<string, string> = {
  escritorio: "escritorio",
  desktop: "escritorio",
  documentos: "documentos",
  "mis documentos": "documentos",
  documents: "documentos",
  descargas: "descargas",
  downloads: "descargas",
  imagenes: "imagenes",
  fotos: "imagenes",
  pictures: "imagenes",
  musica: "musica",
  music: "musica",
  videos: "videos",
  jarvis: "jarvis",
};

/**
 * Convierte "Documentos/Tareas/x.txt" en una ruta real y comprueba que quede DENTRO
 * de las carpetas permitidas (nada de AppData, Windows, Archivos de programa, etc.).
 */
export async function resolverRuta(
  entrada: string,
  carpetas: Record<string, string>
): Promise<{ ruta: string; raiz: string; bonita: string }> {
  const limpia = entrada.trim().replace(/^["']|["']$/g, "");
  let raiz: string | undefined;
  let resto: string;

  if (path.isAbsolute(limpia) || /^[a-zA-Z]:[\\/]/.test(limpia)) {
    const absoluta = path.resolve(limpia);
    raiz = Object.values(carpetas).find((c) => estaDentro(absoluta, c));
    if (!raiz) throw new ErrorHerramienta("Solo puedo usar tus carpetas personales (Escritorio, Documentos, Descargas...).");
    resto = path.relative(raiz, absoluta);
  } else {
    const partes = limpia.split(/[\\/]+/).filter(Boolean);
    // Probar los nombres de una y dos palabras ("mis documentos")
    for (const n of [2, 1]) {
      const alias = NOMBRES_CARPETAS[normalizar(partes.slice(0, n).join(" "))];
      if (alias && partes.length >= n) {
        raiz = carpetas[alias];
        partes.splice(0, n);
        break;
      }
    }
    if (!raiz) {
      throw new ErrorHerramienta(
        "La ruta debe empezar con Escritorio, Documentos, Descargas, Imagenes, Musica, Videos o Jarvis."
      );
    }
    resto = partes.join(path.sep);
  }

  const ruta = path.resolve(raiz, resto);
  if (!estaDentro(ruta, raiz)) throw new ErrorHerramienta("Esa ruta sale de las carpetas permitidas.");

  // Revisar también la ruta "real" por si hay accesos directos de carpeta que apunten a otro lado
  if (existsSync(ruta)) {
    const real = await realpath(ruta);
    const raizReal = existsSync(raiz) ? await realpath(raiz) : raiz;
    if (!estaDentro(real, raizReal)) throw new ErrorHerramienta("Esa ruta apunta fuera de las carpetas permitidas.");
  }
  if (estaDentro(ruta, CARPETA_JARVIS_APP)) {
    throw new ErrorHerramienta("No puedo tocar los archivos del propio Jarvis.");
  }

  const nombreRaiz = Object.entries(carpetas).find(([, v]) => v === raiz)?.[0] ?? "";
  const nombreVisible =
    nombreRaiz === "jarvis" ? "Documentos\\Jarvis" : nombreRaiz.charAt(0).toUpperCase() + nombreRaiz.slice(1);
  const bonita = [nombreVisible, resto].filter(Boolean).join("\\");
  return { ruta, raiz, bonita };
}

function estaDentro(ruta: string, carpeta: string): boolean {
  const rel = path.relative(carpeta, ruta);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Ruta dentro de Documentos\\Jarvis (la única carpeta donde Jarvis puede escribir o borrar). */
async function rutaEnJarvis(nombre: string, carpetas: Record<string, string>) {
  if (/[<>:"|?*\x00-\x1f]/.test(nombre) || /(^|[\\/])\.\.([\\/]|$)/.test(nombre)) {
    throw new ErrorHerramienta("Ese nombre de archivo tiene caracteres no permitidos.");
  }
  const r = await resolverRuta(path.join("Jarvis", nombre), carpetas);
  if (!estaDentro(r.ruta, carpetas.jarvis) || r.ruta === carpetas.jarvis) {
    throw new ErrorHerramienta("Solo puedo escribir o borrar dentro de Documentos\\Jarvis.");
  }
  return r;
}

function validarUrl(entrada: string): string {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:/i.test(entrada) ? entrada : `https://${entrada}`);
  } catch {
    throw new ErrorHerramienta("Esa dirección web no es válida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErrorHerramienta("Solo puedo abrir páginas web (http o https).");
  }
  return url.toString();
}

/** Busca el programa que mejor coincide con el nombre pedido. */
export function buscarPrograma(nombre: string, lista: win.Programa[]): win.Programa | undefined {
  const buscado = normalizar(nombre);
  const conNombre = lista.map((p) => ({ p, n: normalizar(p.nombre) }));
  return (
    conNombre.find((x) => x.n === buscado)?.p ??
    conNombre.find((x) => x.n.startsWith(buscado))?.p ??
    conNombre.find((x) => x.n.split(/[^a-z0-9]+/).includes(buscado))?.p ??
    conNombre.find((x) => buscado.length >= 4 && x.n.includes(buscado))?.p
  );
}

// ------------------------------------------------------------------ revisar cada acción

/**
 * Revisa una petición de Gemini. Si los datos no son válidos lanza ErrorHerramienta.
 * Devuelve qué tan delicada es, cómo describirla al usuario y la función que la ejecuta.
 */
export async function revisar(nombre: string, args: Record<string, unknown>): Promise<Revisada> {
  switch (nombre) {
    case "abrir_programa": {
      const pedido = texto(args.nombre, "nombre", 100);
      const basico = win.PROGRAMAS_BASICOS[normalizar(pedido)];
      let programa: win.Programa | undefined;
      if (win.esWindows) {
        try {
          programa = buscarPrograma(pedido, await win.listarProgramas());
          if (!programa && !basico) programa = buscarPrograma(pedido, await win.listarProgramas(true));
        } catch {
          // Si Windows no da la lista, quedan los programas básicos
        }
      }
      if (!programa && !basico) {
        necesitaWindows();
        throw new ErrorHerramienta(`No encontré un programa llamado "${pedido}" en el menú Inicio.`);
      }
      const visible = programa?.nombre ?? pedido;
      return {
        nivel: "normal",
        tipo: "abrir_programa",
        descripcion: `Abrir el programa "${visible}"`,
        ejecutar: async () => {
          necesitaWindows();
          if (programa) win.lanzarPrograma(programa);
          else win.lanzarBasico(basico!);
          return { resultado: `Abrí ${visible}.` };
        },
      };
    }

    case "abrir_pagina_web": {
      const url = validarUrl(texto(args.url, "url", 2000));
      return {
        nivel: "normal",
        tipo: "abrir_web",
        descripcion: `Abrir la página ${url}`,
        ejecutar: async () => {
          necesitaWindows();
          await win.abrirUrl(url);
          return { resultado: `Abrí ${url}.` };
        },
      };
    }

    case "buscar_en_internet": {
      const consulta = texto(args.consulta, "consulta", 300);
      const url = `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
      return {
        nivel: "normal",
        tipo: "abrir_web",
        descripcion: `Buscar en Google: "${consulta}"`,
        ejecutar: async () => {
          necesitaWindows();
          await win.abrirUrl(url);
          return { resultado: "Abrí la búsqueda en el navegador." };
        },
      };
    }

    case "controlar_volumen": {
      const accion = args.accion;
      if (accion !== "subir" && accion !== "bajar" && accion !== "silenciar" && accion !== "establecer") {
        throw new ErrorHerramienta("Acción de volumen no válida.");
      }
      const numero = Number(args.cantidad ?? (accion === "establecer" ? 50 : 10));
      const cantidad = Math.max(0, Math.min(100, Math.round(Number.isFinite(numero) ? numero : 10)));
      const descripciones = {
        subir: `Subir el volumen ${cantidad}%`,
        bajar: `Bajar el volumen ${cantidad}%`,
        silenciar: "Silenciar / quitar silencio",
        establecer: `Poner el volumen en ${cantidad}%`,
      };
      return {
        nivel: "normal",
        tipo: "volumen",
        descripcion: descripciones[accion],
        ejecutar: async () => {
          necesitaWindows();
          await win.volumen(accion, cantidad);
          return { resultado: "Listo." };
        },
      };
    }

    case "listar_archivos": {
      const { ruta, bonita } = await resolverRuta(texto(args.carpeta, "carpeta", 500), await win.carpetasUsuario());
      return {
        nivel: "normal",
        tipo: "ver_archivos",
        descripcion: `Ver qué archivos hay en ${bonita}`,
        ejecutar: async () => {
          const entradas = await readdir(ruta, { withFileTypes: true }).catch(() => {
            throw new ErrorHerramienta("Esa carpeta no existe.");
          });
          const lista = entradas
            .filter((e) => !e.name.startsWith(".") && e.name.toLowerCase() !== "desktop.ini")
            .slice(0, 100)
            .map((e) => (e.isDirectory() ? `[carpeta] ${e.name}` : e.name));
          return { carpeta: bonita, total: entradas.length, archivos: lista };
        },
      };
    }

    case "leer_archivo": {
      const { ruta, bonita } = await resolverRuta(texto(args.ruta, "ruta", 500), await win.carpetasUsuario());
      const ext = path.extname(ruta).toLowerCase();
      if (!EXTENSIONES_TEXTO.has(ext)) {
        throw new ErrorHerramienta("Solo puedo leer archivos de texto (txt, md, csv, json...).");
      }
      if (/^\.env/i.test(path.basename(ruta))) throw new ErrorHerramienta("Ese archivo puede tener claves secretas.");
      return {
        nivel: "normal",
        tipo: "leer_archivos",
        descripcion: `Leer el archivo ${bonita}`,
        ejecutar: async () => {
          const info = await stat(ruta).catch(() => {
            throw new ErrorHerramienta("Ese archivo no existe.");
          });
          if (!info.isFile()) throw new ErrorHerramienta("Eso no es un archivo.");
          if (info.size > 200 * 1024) throw new ErrorHerramienta("El archivo es demasiado grande para leerlo.");
          const contenido = await readFile(ruta, "utf8");
          return { archivo: bonita, contenido: contenido.slice(0, 20000) };
        },
      };
    }

    case "crear_archivo": {
      const carpetas = await win.carpetasUsuario();
      const nombreArchivo = texto(args.nombre, "nombre", 150).replace(/^jarvis[\\/]+/i, "");
      const conExtension = path.extname(nombreArchivo) ? nombreArchivo : `${nombreArchivo}.txt`;
      const ext = path.extname(conExtension).toLowerCase();
      if (EXTENSIONES_PELIGROSAS.has(ext) || !EXTENSIONES_TEXTO.has(ext)) {
        throw new ErrorHerramienta("Solo puedo crear archivos de texto (txt, md, csv, json, html...).");
      }
      const contenido = typeof args.contenido === "string" ? args.contenido : "";
      if (contenido.length > 100000) throw new ErrorHerramienta("El contenido es demasiado largo.");
      const { ruta, bonita } = await rutaEnJarvis(conExtension, carpetas);
      const existe = existsSync(ruta);
      if (existe && args.sobrescribir !== true) {
        throw new ErrorHerramienta(`Ya existe ${bonita}. Pregunta al usuario si quiere reemplazarlo.`);
      }
      return {
        nivel: existe ? "delicada" : "normal",
        tipo: "crear_archivos",
        descripcion: existe ? `REEMPLAZAR el archivo ${bonita} (se pierde lo que tenía)` : `Crear el archivo ${bonita}`,
        ejecutar: async () => {
          await mkdir(path.dirname(ruta), { recursive: true });
          await writeFile(ruta, contenido, "utf8");
          return { resultado: `Guardé ${bonita}.` };
        },
      };
    }

    case "abrir_archivo": {
      const { ruta, bonita } = await resolverRuta(texto(args.ruta, "ruta", 500), await win.carpetasUsuario());
      if (EXTENSIONES_PELIGROSAS.has(path.extname(ruta).toLowerCase())) {
        throw new ErrorHerramienta("Por seguridad no abro programas ni scripts, solo documentos, fotos, música, etc.");
      }
      return {
        nivel: "normal",
        tipo: "abrir_archivos",
        descripcion: `Abrir ${bonita}`,
        ejecutar: async () => {
          necesitaWindows();
          if (!existsSync(ruta)) throw new ErrorHerramienta("Ese archivo no existe.");
          await win.abrirRuta(ruta);
          return { resultado: `Abrí ${bonita}.` };
        },
      };
    }

    case "borrar_archivo": {
      const nombreArchivo = texto(args.nombre, "nombre", 150).replace(/^jarvis[\\/]+/i, "");
      const { ruta, bonita } = await rutaEnJarvis(nombreArchivo, await win.carpetasUsuario());
      return {
        nivel: "delicada",
        tipo: "borrar_archivos",
        descripcion: `BORRAR ${bonita} (se va a la Papelera de reciclaje)`,
        ejecutar: async () => {
          necesitaWindows();
          const info = await stat(ruta).catch(() => {
            throw new ErrorHerramienta("Ese archivo no existe.");
          });
          if (!info.isFile()) throw new ErrorHerramienta("Solo puedo borrar archivos, no carpetas.");
          await win.mandarAPapelera(ruta);
          return { resultado: `Mandé ${bonita} a la Papelera.` };
        },
      };
    }

    case "sistema": {
      const accion = args.accion;
      const descripciones: Record<string, string> = {
        bloquear: "Bloquear la laptop",
        suspender: "Suspender la laptop",
        reiniciar: "REINICIAR la laptop en 60 segundos",
        apagar: "APAGAR la laptop en 60 segundos",
        cancelar_apagado: "Cancelar el apagado o reinicio pendiente",
      };
      if (typeof accion !== "string" || !(accion in descripciones)) {
        throw new ErrorHerramienta("Acción de sistema no válida.");
      }
      const a = accion as keyof typeof descripciones & Parameters<typeof win.accionSistema>[0];
      return {
        nivel: a === "cancelar_apagado" ? "libre" : "delicada",
        tipo: "sistema",
        descripcion: descripciones[a],
        ejecutar: async () => {
          necesitaWindows();
          win.accionSistema(a);
          const extra =
            a === "apagar" || a === "reiniciar" ? " Dile al usuario que puede pedir cancelarlo en el próximo minuto." : "";
          return { resultado: `Hecho: ${descripciones[a]}.${extra}` };
        },
      };
    }

    case "programar_recordatorio": {
      const que = texto(args.texto, "texto", 300);
      let cuando: number;
      if (typeof args.fecha_hora === "string" && args.fecha_hora.trim()) {
        // Hora local de la laptop (sin zona horaria = hora de aquí)
        cuando = new Date(args.fecha_hora.trim().replace(" ", "T")).getTime();
        if (!Number.isFinite(cuando)) throw new ErrorHerramienta("No entendí la fecha y hora.");
      } else {
        const minutos = Number(args.minutos);
        if (!Number.isFinite(minutos) || minutos <= 0) throw new ErrorHerramienta("Falta cuándo (minutos o fecha_hora).");
        cuando = Date.now() + minutos * 60 * 1000;
      }
      if (cuando < Date.now() - 60 * 1000) throw new ErrorHerramienta("Esa hora ya pasó.");
      if (cuando > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new ErrorHerramienta("Solo puedo programar hasta un año.");
      return {
        nivel: "libre",
        tipo: "recordatorios",
        descripcion: `Recordar "${que}" ${cuandoLegible(cuando)}`,
        ejecutar: async () => {
          const r = agregarRecordatorio(que, cuando);
          return { resultado: `Listo: te lo recordaré ${cuandoLegible(cuando)}.`, id: r.id };
        },
      };
    }

    case "ver_recordatorios":
      return {
        nivel: "libre",
        tipo: "recordatorios",
        descripcion: "Ver los recordatorios pendientes",
        ejecutar: async () => {
          const lista = leerRecordatorios();
          return lista.length
            ? { pendientes: lista.map((r) => ({ id: r.id, texto: r.texto, cuando: cuandoLegible(r.cuando) })) }
            : { resultado: "No hay recordatorios pendientes." };
        },
      };

    case "cancelar_recordatorio": {
      const id = texto(args.id, "id", 40);
      return {
        nivel: "libre",
        tipo: "recordatorios",
        descripcion: `Cancelar el recordatorio ${id}`,
        ejecutar: async () => {
          const r = cancelarRecordatorio(id);
          if (!r) throw new ErrorHerramienta("No encontré ese recordatorio.");
          return { resultado: `Cancelé: "${r.texto}".` };
        },
      };
    }

    case "consultar_clima": {
      const ciudad = texto(args.ciudad ?? "Monterrey", "ciudad", 100);
      return {
        nivel: "libre",
        tipo: "clima",
        descripcion: `Consultar el clima de ${ciudad}`,
        ejecutar: async () => {
          try {
            return await consultarClima(ciudad);
          } catch {
            throw new ErrorHerramienta("No pude consultar el clima en este momento (¿hay internet?).");
          }
        },
      };
    }

    case "consultar_noticias": {
      const tema = typeof args.tema === "string" && args.tema.trim() ? args.tema.trim().slice(0, 100) : undefined;
      return {
        nivel: "libre",
        tipo: "noticias",
        descripcion: tema ? `Buscar noticias de ${tema}` : "Ver las noticias principales",
        ejecutar: async () => {
          try {
            return await consultarNoticias(tema);
          } catch {
            throw new ErrorHerramienta("No pude consultar las noticias en este momento (¿hay internet?).");
          }
        },
      };
    }

    case "investigar": {
      const pregunta = texto(args.pregunta, "pregunta", 1000);
      return {
        nivel: "libre",
        tipo: "investigar",
        descripcion: `Investigar en internet: "${pregunta}"`,
        ejecutar: async () => {
          if (!investigador) throw new ErrorHerramienta("La búsqueda no está disponible.");
          try {
            return { respuesta: await investigador(pregunta) };
          } catch {
            throw new ErrorHerramienta("No pude buscar en internet en este momento.");
          }
        },
      };
    }

    case "consultar_a_claude": {
      const pregunta = texto(args.pregunta, "pregunta", 4000);
      const contexto = typeof args.contexto === "string" ? args.contexto.slice(0, 4000) : "";
      if (!claudeConfigurado()) {
        throw new ErrorHerramienta(
          "La conexión con Claude no está activada (falta su clave). El usuario puede activarla abriendo 'Configurar Claude.bat'."
        );
      }
      return {
        nivel: "normal",
        tipo: "consultar_claude",
        descripcion: `Consultar a Claude (cuesta unos centavos): "${pregunta.slice(0, 200)}"`,
        ejecutar: async () => {
          try {
            return { respuesta_de_claude: await consultarAClaude(pregunta, contexto) };
          } catch (err) {
            throw new ErrorHerramienta(explicarErrorClaude(err));
          }
        },
      };
    }

    case "escribir_en_pizarra": {
      const contenido = texto(args.contenido, "contenido", MAX_PIZARRA);
      const titulo = typeof args.titulo === "string" ? args.titulo.trim() : undefined;
      return {
        nivel: "libre",
        tipo: "pizarra",
        descripcion: `Escribir en la pizarra${titulo ? `: ${titulo}` : ""}`,
        ejecutar: async () => {
          escribirPizarra(titulo, contenido, args.agregar === true);
          return { resultado: "Escrito en la pizarra. El usuario ya lo está viendo; no lo leas completo, solo coméntalo brevemente." };
        },
      };
    }

    case "borrar_pizarra":
      return {
        nivel: "libre",
        tipo: "pizarra",
        descripcion: "Borrar la pizarra",
        ejecutar: async () => {
          borrarPizarra();
          return { resultado: "Pizarra borrada." };
        },
      };

    case "buscar_en_historial": {
      const palabras = texto(args.palabras, "palabras", 300);
      return {
        nivel: "libre",
        tipo: "historial",
        descripcion: `Buscar en conversaciones pasadas: "${palabras}"`,
        ejecutar: async () => {
          const encontrados = buscarEnHistorial(palabras);
          return encontrados.length
            ? { mensajes_encontrados: encontrados }
            : { resultado: "No encontré nada sobre eso en las conversaciones pasadas." };
        },
      };
    }

    case "guardar_recuerdo": {
      const recuerdo = texto(args.texto, "texto", MAX_LARGO_RECUERDO);
      return {
        // Solo cambia la memoria de Jarvis (no la laptop) y se puede borrar en el panel "Memoria"
        nivel: "libre",
        tipo: "memoria",
        descripcion: `Recordar: "${recuerdo}"`,
        ejecutar: async () => {
          const r = agregarRecuerdo(recuerdo);
          return { resultado: `Guardado en la memoria con id ${r.id}.` };
        },
      };
    }

    case "olvidar_recuerdo": {
      const id = texto(args.id, "id", 40).replace(/[\[\]]/g, "");
      return {
        nivel: "libre",
        tipo: "memoria",
        descripcion: `Olvidar el recuerdo ${id}`,
        ejecutar: async () => {
          const borrado = borrarRecuerdo(id);
          if (!borrado) throw new ErrorHerramienta("No encontré ese recuerdo.");
          return { resultado: `Olvidé: "${borrado.texto}".` };
        },
      };
    }

    default:
      throw new ErrorHerramienta(`No tengo permitido hacer "${nombre}".`);
  }
}

// Nombres legibles de los permisos que se pueden recordar
export const NOMBRES_PERMISOS: Record<string, string> = {
  abrir_programa: "Abrir programas",
  abrir_web: "Abrir páginas web y búsquedas",
  volumen: "Cambiar el volumen",
  ver_archivos: "Ver qué archivos hay en tus carpetas",
  leer_archivos: "Leer archivos de texto",
  crear_archivos: "Crear archivos en Documentos\\Jarvis",
  abrir_archivos: "Abrir documentos, fotos y carpetas",
  consultar_claude: "Consultar a Claude (cuesta unos centavos)",
};
