/**
 * PROGRAMAR y CREAR PÁGINAS WEB: "hazme una página de mi portafolio", "programa en C++ una calculadora",
 * "haz en Python un juego de adivinar el número y muéstrame el resultado".
 *
 * - Gemini escribe el código (un solo archivo, comentado en español) y se guarda en Documentos\Jarvis\Programas\<proyecto>.
 * - Páginas web: se ven DENTRO de Jarvis (panel "Código", en un marco aislado que no puede tocar a Jarvis) y se
 *   pueden abrir en el navegador.
 * - Resultado de un programa:
 *     · Python se puede correr en la NUBE de Google (ejecución de código de Gemini): gratis y no toca la laptop.
 *     · Cualquier lenguaje se puede correr EN LA LAPTOP con el compilador que el usuario tenga instalado, pero SOLO con
 *       su permiso cada vez (acción delicada: se le muestra el código antes). Corre en la carpeta del proyecto, con
 *       tiempo límite y SIN las claves de Jarvis en el entorno.
 */

import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { CARPETA_DATOS } from "./ubicacion.mjs";
import { carpetasUsuario, esWindows, pathActual } from "./windows.ts";

// ------------------------------------------------------------------ lenguajes

export interface Lenguaje {
  id: string;
  nombre: string;
  archivo: string; // nombre del archivo principal
  alias: string[];
  web?: boolean;
  // Cómo instalarlo en Windows si no está (se le dice al usuario)
  instalar?: string;
  // Reglas extra para que Gemini escriba código que sí corra
  reglas?: string;
}

export const LENGUAJES: Lenguaje[] = [
  {
    id: "html", nombre: "Página web (HTML, CSS y JavaScript)", archivo: "index.html", web: true,
    alias: ["html", "web", "pagina", "pagina web", "sitio", "sitio web", "css", "landing", "html5"],
  },
  {
    id: "python", nombre: "Python", archivo: "programa.py", alias: ["python", "py", "python3"],
    instalar: 'Python: en PowerShell "winget install Python.Python.3.13" o desde python.org/downloads (marca "Add python.exe to PATH").',
  },
  {
    id: "cpp", nombre: "C++", archivo: "programa.cpp", alias: ["c++", "cpp", "cplusplus", "c plus plus", "c mas mas"],
    instalar: 'C++: en PowerShell "winget install BrechtSanders.WinLibs.POSIX.UCRT" (instala g++).',
    reglas: "Usa C++17 estándar (sin librerías de Windows ni conio.h) para que compile con g++.",
  },
  {
    id: "c", nombre: "C", archivo: "programa.c", alias: ["c", "lenguaje c", "ansi c"],
    instalar: 'C: en PowerShell "winget install BrechtSanders.WinLibs.POSIX.UCRT" (instala gcc).',
    reglas: "Usa C estándar (C11) para que compile con gcc.",
  },
  {
    id: "java", nombre: "Java", archivo: "Main.java", alias: ["java"],
    instalar: 'Java: en PowerShell "winget install EclipseAdoptium.Temurin.21.JDK".',
    reglas: "La clase principal se llama Main (public class Main) y todo va en un solo archivo.",
  },
  {
    id: "csharp", nombre: "C#", archivo: "programa.cs", alias: ["c#", "csharp", "c sharp", "cs", ".net", "dotnet"],
    instalar: 'C#: en PowerShell "winget install Microsoft.DotNet.SDK.10".',
    reglas: "Usa instrucciones de nivel superior (sin Main explícito) en un solo archivo, compatible con .NET 10 (dotnet run programa.cs).",
  },
  {
    id: "javascript", nombre: "JavaScript (Node.js)", archivo: "programa.mjs",
    alias: ["javascript", "js", "node", "nodejs", "node.js"],
    reglas: "Es para Node.js (consola), módulo ES. Para leer del teclado usa readline/promises.",
  },
  {
    id: "typescript", nombre: "TypeScript", archivo: "programa.ts", alias: ["typescript", "ts"],
    reglas: "Se corre con Node.js quitando los tipos: NO uses enum, namespace ni decoradores. Módulo ES.",
  },
  {
    id: "go", nombre: "Go", archivo: "main.go", alias: ["go", "golang"],
    instalar: 'Go: en PowerShell "winget install GoLang.Go".', reglas: "package main con func main().",
  },
  {
    id: "rust", nombre: "Rust", archivo: "main.rs", alias: ["rust", "rs"],
    instalar: 'Rust: en PowerShell "winget install Rustlang.Rustup" (y luego reinicia la laptop).',
    reglas: "Solo la librería estándar (sin crates externos).",
  },
  { id: "php", nombre: "PHP", archivo: "programa.php", alias: ["php"], instalar: 'PHP: en PowerShell "winget install PHP.PHP.8.4".' },
  {
    id: "ruby", nombre: "Ruby", archivo: "programa.rb", alias: ["ruby", "rb"],
    instalar: 'Ruby: en PowerShell "winget install RubyInstallerTeam.Ruby.3.4".',
  },
  { id: "r", nombre: "R", archivo: "programa.R", alias: ["r", "rstats", "lenguaje r"], instalar: 'R: en PowerShell "winget install RProject.R".' },
  { id: "lua", nombre: "Lua", archivo: "programa.lua", alias: ["lua"], instalar: 'Lua: en PowerShell "winget install DEVCOM.Lua".' },
  { id: "kotlin", nombre: "Kotlin", archivo: "Main.kt", alias: ["kotlin", "kt"] },
  { id: "swift", nombre: "Swift", archivo: "main.swift", alias: ["swift"] },
  { id: "sql", nombre: "SQL", archivo: "consulta.sql", alias: ["sql", "mysql", "postgres", "postgresql", "sqlite"] },
  { id: "bash", nombre: "Bash", archivo: "script.sh", alias: ["bash", "shell", "sh"] },
  { id: "powershell", nombre: "PowerShell", archivo: "script.ps1", alias: ["powershell", "ps1"] },
  { id: "matlab", nombre: "MATLAB / Octave", archivo: "programa.m", alias: ["matlab", "octave"] },
  { id: "arduino", nombre: "Arduino", archivo: "programa.ino", alias: ["arduino", "ino"] },
  { id: "assembly", nombre: "Ensamblador", archivo: "programa.asm", alias: ["ensamblador", "assembly", "asm"] },
];

const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** "C++", "c plus plus", "Python 3" → el lenguaje. null si no se conoce. */
export function lenguajeDe(texto: string): Lenguaje | null {
  const t = sinAcentos(texto).replace(/\s*\d+(\.\d+)*$/, "");
  return LENGUAJES.find((l) => l.id === t || l.alias.includes(t)) ?? null;
}

// ------------------------------------------------------------------ proyectos guardados

export interface Resultado {
  donde: "nube" | "laptop";
  ok: boolean;
  salida: string;
  comando?: string;
  segundos: number;
  imagenes?: string[]; // gráficas que salieron (archivos dentro de la carpeta del proyecto)
  sigueAbierto?: boolean; // programas con ventana propia (juegos, tkinter...)
  fecha: number;
}

export interface Proyecto {
  id: string;
  nombre: string;
  lenguaje: string;
  carpeta: string;
  archivo: string;
  explicacion: string;
  entradaEjemplo: string;
  creado: number;
  actualizado: number;
  versiones: number;
  resultado?: Resultado;
}

const INDICE = path.join(CARPETA_DATOS, "codigo.json");
const MAX_PROYECTOS = 200;
export const MAX_CODIGO = 400_000;

// Cambia cada vez que se crea o corre algo (la pantalla lo usa para abrir el panel de código)
let actualizada = 0;
export const codigoActualizado = () => actualizada;

export function leerProyectos(): Proyecto[] {
  try {
    const lista = JSON.parse(readFileSync(INDICE, "utf8"));
    return Array.isArray(lista) ? lista.filter((p) => p && typeof p.id === "string" && typeof p.carpeta === "string") : [];
  } catch {
    return [];
  }
}

function guardarProyectos(lista: Proyecto[]): void {
  if (!existsSync(CARPETA_DATOS)) mkdirSync(CARPETA_DATOS, { recursive: true });
  const ordenada = [...lista].sort((a, b) => b.actualizado - a.actualizado).slice(0, MAX_PROYECTOS);
  writeFileSync(INDICE, JSON.stringify(ordenada, null, 2), "utf8");
  actualizada = Date.now();
}

export const ultimoProyecto = (): Proyecto | null =>
  leerProyectos().sort((a, b) => b.actualizado - a.actualizado)[0] ?? null;

/** Por id o por nombre (sin acentos, aunque sea parte del nombre). */
export function buscarProyecto(texto: string): Proyecto | null {
  const lista = leerProyectos();
  const porId = lista.find((p) => p.id === texto);
  if (porId) return porId;
  const t = sinAcentos(texto);
  if (!t) return null;
  return lista.find((p) => sinAcentos(p.nombre) === t) ?? lista.find((p) => sinAcentos(p.nombre).includes(t)) ?? null;
}

export async function leerCodigo(p: Proyecto): Promise<string> {
  try {
    return await readFile(path.join(p.carpeta, p.archivo), "utf8");
  } catch {
    return "";
  }
}

/** Nombre de carpeta seguro: "Calculadora de IMC" → "Calculadora de IMC" (sin \ / : * ? " < > |). */
function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return limpio || "Proyecto";
}

/** Guarda un programa nuevo, o la nueva versión de uno que ya existe (la anterior queda en "versiones"). */
export async function guardarProyecto(datos: {
  lenguaje: Lenguaje;
  nombre: string;
  codigo: string;
  explicacion: string;
  entradaEjemplo?: string;
  sobre?: Proyecto | null;
}): Promise<Proyecto> {
  if (!datos.codigo.trim()) throw new Error("El código salió vacío.");
  if (datos.codigo.length > MAX_CODIGO) throw new Error("El código salió demasiado largo.");
  const lista = leerProyectos();
  const ahora = Date.now();
  let p: Proyecto;
  if (datos.sobre && lista.some((x) => x.id === datos.sobre!.id) && datos.sobre.lenguaje === datos.lenguaje.id) {
    p = lista.find((x) => x.id === datos.sobre!.id)!;
    // La versión anterior se guarda por si el cambio no le gusta al usuario
    const anterior = await leerCodigo(p);
    if (anterior) {
      const carpetaVersiones = path.join(p.carpeta, "versiones");
      await mkdir(carpetaVersiones, { recursive: true });
      await writeFile(path.join(carpetaVersiones, `v${p.versiones}-${p.archivo}`), anterior, "utf8");
    }
    p.versiones += 1;
    p.explicacion = datos.explicacion;
    p.entradaEjemplo = datos.entradaEjemplo ?? "";
    p.actualizado = ahora;
    delete p.resultado;
  } else {
    // Carpeta sin acentos ni ñ: algunos compiladores fallan con letras especiales en la ruta
    const raiz = path.join((await carpetasUsuario()).jarvis, "Programas");
    const visible = nombreSeguro(datos.nombre);
    const base = nombreSeguro(visible.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_"));
    let carpeta = path.join(raiz, base);
    let n = 1;
    while (existsSync(carpeta)) carpeta = path.join(raiz, `${base} (${++n})`);
    p = {
      id: randomUUID(),
      nombre: n > 1 ? `${visible} (${n})` : visible,
      lenguaje: datos.lenguaje.id,
      carpeta,
      archivo: datos.lenguaje.archivo,
      explicacion: datos.explicacion,
      entradaEjemplo: datos.entradaEjemplo ?? "",
      creado: ahora,
      actualizado: ahora,
      versiones: 1,
    };
    lista.push(p);
  }
  await mkdir(p.carpeta, { recursive: true });
  await writeFile(path.join(p.carpeta, p.archivo), datos.codigo, "utf8");
  guardarProyectos(lista);
  return p;
}

export function guardarResultado(id: string, r: Resultado): Proyecto | null {
  const lista = leerProyectos();
  const p = lista.find((x) => x.id === id);
  if (!p) return null;
  p.resultado = r;
  p.actualizado = Date.now();
  guardarProyectos(lista);
  return p;
}

/** Guarda una gráfica que salió al correr el programa en la nube. Devuelve el nombre del archivo. */
export async function guardarImagen(p: Proyecto, n: number, datos: Buffer, tipo: string): Promise<string> {
  const nombre = `grafica-${n}.${tipo.includes("jpeg") ? "jpg" : "png"}`;
  await writeFile(path.join(p.carpeta, nombre), datos);
  return nombre;
}

// ------------------------------------------------------------------ pedirle el código a Gemini

export const ESQUEMA_CODIGO = {
  type: "object",
  properties: {
    nombre: { type: "string", description: "Nombre corto del proyecto, en español (por ejemplo: Calculadora de IMC)" },
    codigo: { type: "string", description: "El código COMPLETO del archivo" },
    explicacion: { type: "string", description: "2 a 4 frases sencillas: qué hace y cómo se usa" },
    entrada_ejemplo: {
      type: "string",
      description: "Si el programa lee datos del teclado: lo que se escribiría, una respuesta por línea. Si no, vacío.",
    },
  },
  required: ["nombre", "codigo", "explicacion"],
};

export function pedidoDeCodigo(l: Lenguaje, descripcion: string, anterior?: { nombre: string; codigo: string }): string {
  const comun =
    "REGLAS: Todo en UN solo archivo, completo y listo para usarse (nada de \"aquí va tu código\"). Comentarios y textos " +
    "en español, claros para un principiante. Nada peligroso: no borres ni muevas archivos, no cambies la configuración " +
    "de la computadora, no descargues ni instales nada, no uses la red salvo que el pedido lo necesite.";
  const reglasWeb =
    "Es una PÁGINA WEB: un solo index.html con el CSS dentro de <style> y el JavaScript dentro de <script>. Diseño " +
    "moderno y atractivo (buena tipografía, colores armoniosos, espacios, sombras suaves, animaciones sutiles), que se " +
    "vea bien en computadora y celular, en español, con contenido de ejemplo realista (nada de \"Lorem ipsum\"). Sin " +
    "archivos externos: imágenes con SVG dentro del HTML, degradados o emojis. Que todo lo interactivo funcione.";
  const reglasPrograma =
    `Es un programa de ${l.nombre}. ${l.reglas ?? ""} Que al correrlo en la consola MUESTRE resultados claros ` +
    "(con print/printf). Si necesita datos del usuario, léelos del teclado y pon en entrada_ejemplo lo que se escribiría; " +
    "si es una demostración, mejor usa datos de ejemplo dentro del código para que se vea el resultado sin escribir nada.";
  return (
    (anterior
      ? `Este es el código actual del proyecto "${anterior.nombre}":\n\`\`\`\n${anterior.codigo.slice(0, 150_000)}\n\`\`\`\n\n` +
        `CÁMBIALO según este pedido (y conserva todo lo demás que ya funciona): ${descripcion}\n\n`
      : `Pedido del usuario: ${descripcion}\n\n`) +
    (l.web ? reglasWeb : reglasPrograma) +
    "\n" +
    comun
  );
}

/** Quita las cercas ``` que a veces pone Gemini alrededor del código. */
export function limpiarCodigo(codigo: string): string {
  const t = codigo.replace(/\r\n/g, "\n").trim();
  const m = t.match(/^```[\w+#.-]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t) + "\n";
}

// ------------------------------------------------------------------ correr en la laptop

/** Programas que abren su propia ventana (juegos, tkinter, gráficas): se dejan abiertos y visibles. */
export function tieneVentana(codigo: string, lenguaje: string): boolean {
  if (lenguaje === "python") return /\b(import\s+(tkinter|turtle|pygame|pyglet|arcade)|from\s+(tkinter|turtle|pygame)\b|plt\.show\(|\.mainloop\()/.test(codigo);
  if (lenguaje === "java") return /\b(javax\.swing|java\.awt|javafx)\b/.test(codigo);
  if (lenguaje === "csharp") return /System\.Windows\.Forms/.test(codigo);
  return false;
}

export class FaltaPrograma extends Error {
  constructor(public lenguaje: Lenguaje) {
    super(`No encontré ${lenguaje.nombre} instalado en la laptop.${lenguaje.instalar ? ` Para instalarlo: ${lenguaje.instalar}` : ""}`);
  }
}

type Plan = string[][]; // pasos: [programa, ...argumentos]

function planes(l: Lenguaje, archivo: string, exe: string): Plan[] {
  const node = process.execPath; // Node.js siempre está: es con lo que corre Jarvis
  switch (l.id) {
    case "python":
      return esWindows ? [[["py", "-3", "-X", "utf8", archivo]], [["python", "-X", "utf8", archivo]], [["python3", archivo]]] : [[["python3", archivo]], [["python", archivo]]];
    case "javascript":
      return [[[node, archivo]]];
    case "typescript":
      return [[[node, "--experimental-strip-types", "--no-warnings", archivo]]];
    case "cpp":
      return [
        [["g++", "-std=c++17", "-O2", archivo, "-o", exe], [exe]],
        [["clang++", "-std=c++17", "-O2", archivo, "-o", exe], [exe]],
      ];
    case "c":
      return [
        [["gcc", "-std=c11", "-O2", archivo, "-o", exe, "-lm"], [exe]],
        [["clang", "-std=c11", "-O2", archivo, "-o", exe], [exe]],
      ];
    case "java":
      return [[["java", archivo]]];
    case "csharp":
      return [[["dotnet", "run", archivo]]];
    case "go":
      return [[["go", "run", archivo]]];
    case "rust":
      return [[["rustc", "-O", archivo, "-o", exe], [exe]]];
    case "php":
      return [[["php", archivo]]];
    case "ruby":
      return [[["ruby", archivo]]];
    case "r":
      return [[["Rscript", archivo]]];
    case "lua":
      return [[["lua", archivo]], [["lua54", archivo]]];
    default:
      return [];
  }
}

export const sePuedeCorrer = (lenguaje: string) => {
  const l = LENGUAJES.find((x) => x.id === lenguaje);
  return !!l && !l.web && planes(l, "x", "x").length > 0;
};

// El programa NUNCA recibe las claves de Jarvis (Gemini, Gmail, Canva, Picovoice...)
const SECRETO = /KEY|TOKEN|SECRET|CLAVE|PASS|GEMINI|ANTHROPIC|GMAIL|CANVA|CANVAS|PICOVOICE|CLAUDE|JARVIS/i;

async function entornoLimpio(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRETO.test(k)) env[k] = v;
  const p = await pathActual();
  if (esWindows) env.Path = p;
  else env.PATH = p;
  env.PYTHONIOENCODING = "utf-8";
  env.PYTHONUTF8 = "1";
  return env;
}

const MAX_SALIDA = 30_000;

interface Paso {
  codigo: number | null;
  salida: string;
  noExiste: boolean;
  tiempoAgotado: boolean;
  sigueAbierto: boolean;
}

function correrPaso(
  [programa, ...args]: string[],
  carpeta: string,
  env: NodeJS.ProcessEnv,
  entrada: string,
  limiteMs: number,
  ventana: boolean
): Promise<Paso> {
  return new Promise((listo) => {
    let salida = "";
    let terminado = false;
    // Sin shell: el programa y sus argumentos van separados (nunca se arma un comando de texto).
    // Los programas con ventana (juegos, tkinter) se abren visibles; los de consola, sin ventana negra.
    const hijo = spawn(programa, args, { cwd: carpeta, env, windowsHide: !ventana, stdio: ["pipe", "pipe", "pipe"] });
    const agregar = (d: Buffer) => {
      if (salida.length < MAX_SALIDA) salida += d.toString("utf8");
    };
    hijo.stdout.on("data", agregar);
    hijo.stderr.on("data", agregar);
    hijo.stdin.on("error", () => {});
    hijo.stdin.end(entrada ? (entrada.endsWith("\n") ? entrada : entrada + "\n") : "");
    const fin = (p: Partial<Paso>) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      listo({ codigo: null, salida: salida.slice(0, MAX_SALIDA), noExiste: false, tiempoAgotado: false, sigueAbierto: false, ...p });
    };
    const reloj = setTimeout(() => {
      if (ventana) {
        // Un juego o ventana sigue abierto: se deja así (se cierra solo a los 30 min por si se olvida)
        setTimeout(() => matar(hijo.pid), 30 * 60_000).unref();
        fin({ sigueAbierto: true });
      } else {
        matar(hijo.pid);
        fin({ tiempoAgotado: true });
      }
    }, limiteMs);
    hijo.on("error", (err: NodeJS.ErrnoException) => fin({ noExiste: err.code === "ENOENT" }));
    hijo.on("close", (codigo) => {
      // En Windows, "python" sin instalar es un atajo que manda a la Tienda (código 9009)
      const atajoTienda = esWindows && codigo === 9009;
      fin({ codigo, noExiste: atajoTienda });
    });
  });
}

function matar(pid: number | undefined): void {
  if (!pid) return;
  if (esWindows) {
    // /T también cierra lo que el programa haya abierto (por ejemplo "go run" → el programa compilado)
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Ya había terminado
    }
  }
}

/** Corre el programa en la laptop con el compilador que haya. Lanza FaltaPrograma si no hay ninguno. */
export async function correrEnLaptop(p: Proyecto, entrada = ""): Promise<Resultado> {
  const l = LENGUAJES.find((x) => x.id === p.lenguaje);
  if (!l || l.web) throw new Error("Este proyecto no es un programa que se pueda correr.");
  const codigo = await leerCodigo(p);
  if (!codigo) throw new Error("No encontré el archivo del programa (¿lo movieron o borraron?).");
  const ventana = tieneVentana(codigo, l.id);
  const exe = path.join(p.carpeta, esWindows ? "programa.exe" : "programa");
  const env = await entornoLimpio();
  const inicio = Date.now();
  for (const plan of planes(l, p.archivo, exe)) {
    let salida = "";
    let faltó = false;
    let ok = true;
    let sigueAbierto = false;
    for (let i = 0; i < plan.length; i++) {
      const ultimo = i === plan.length - 1;
      // Compilar puede tardar; "go run", "dotnet run" y "java" compilan y corren en el mismo paso
      const limite = !ultimo || ["csharp", "go"].includes(l.id) ? 120_000 : l.id === "java" ? 60_000 : 20_000;
      const paso = await correrPaso(plan[i], p.carpeta, env, ultimo ? entrada : "", limite, ultimo && ventana);
      if (paso.noExiste) {
        faltó = true;
        break;
      }
      salida += paso.salida;
      if (paso.sigueAbierto) {
        sigueAbierto = true;
        break;
      }
      if (paso.tiempoAgotado) {
        salida += `\n[Se detuvo: tardó más de ${Math.round(limite / 1000)} s. ¿Espera algo del teclado o tiene un ciclo infinito?]`;
        ok = false;
        break;
      }
      if (paso.codigo !== 0) {
        if (!ultimo) salida = `[No compiló]\n${salida}`;
        else salida += `\n[Terminó con error (código ${paso.codigo})]`;
        ok = false;
        break;
      }
    }
    if (faltó) continue;
    return {
      donde: "laptop",
      ok,
      salida: salida.trim() || (sigueAbierto ? "" : "(El programa no mostró nada)"),
      comando: plan.map((paso) => paso.map((a) => path.basename(a)).join(" ")).join(" → "),
      segundos: Math.round((Date.now() - inicio) / 100) / 10,
      sigueAbierto,
      fecha: Date.now(),
    };
  }
  throw new FaltaPrograma(l);
}
