/**
 * Acciones reales sobre Windows.
 * Nunca se ejecuta texto libre: cada función lanza un programa fijo con datos ya revisados.
 * Los datos variables se pasan a PowerShell como variables de entorno, no dentro del comando.
 */

import { execFile, spawn } from "child_process";
import os from "os";
import path from "path";

export const esWindows = process.platform === "win32";

function powershell(script: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + script,
      ],
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.toString().trim() || err.message));
        else resolve(stdout.toString());
      }
    );
  });
}

/** Abre algo con Windows (programa, página web, archivo o carpeta) sin pasar por la consola. */
function abrirConExplorer(destino: string): void {
  // OJO: sin `windowsHide`. Si se pone, Windows le pasa la orden "escondido" al programa que se abre
  // (por ejemplo el navegador) y se abre invisible. explorer.exe no muestra ventana negra de todos modos.
  const hijo = spawn("explorer.exe", [destino], { detached: true, stdio: "ignore" });
  hijo.on("error", () => {});
  hijo.unref();
}

// ------------------------------------------------------------------ programas instalados

export interface Programa {
  nombre: string;
  id: string;
}

let programasCache: { lista: Programa[]; fecha: number } | null = null;

/** Lista los programas del menú Inicio (incluye apps de la Microsoft Store como Spotify o WhatsApp). */
export async function listarProgramas(forzar = false): Promise<Programa[]> {
  if (!esWindows) return [];
  if (!forzar && programasCache && Date.now() - programasCache.fecha < 10 * 60 * 1000) {
    return programasCache.lista;
  }
  const salida = await powershell("Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress");
  const datos = JSON.parse(salida.trim() || "[]");
  const lista: Programa[] = (Array.isArray(datos) ? datos : [datos])
    .filter((p: any) => p?.Name && p?.AppID)
    .map((p: any) => ({ nombre: String(p.Name), id: String(p.AppID) }));
  programasCache = { lista, fecha: Date.now() };
  return lista;
}

export function lanzarPrograma(programa: Programa): void {
  abrirConExplorer(`shell:AppsFolder\\${programa.id}`);
}

// Programas básicos de Windows por si no aparecen en el menú Inicio
export const PROGRAMAS_BASICOS: Record<string, string> = {
  "bloc de notas": "notepad.exe",
  notepad: "notepad.exe",
  calculadora: "calc.exe",
  paint: "mspaint.exe",
  "explorador de archivos": "explorer.exe",
  explorador: "explorer.exe",
  "administrador de tareas": "taskmgr.exe",
  configuracion: "ms-settings:",
};

export function lanzarBasico(destino: string): void {
  if (destino.endsWith(":")) abrirConExplorer(destino);
  else {
    const hijo = spawn(destino, [], { detached: true, stdio: "ignore" });
    hijo.on("error", () => {});
    hijo.unref();
  }
}

// ------------------------------------------------------------------ web, archivos

/**
 * Abre una página o un archivo con su programa normal y en una ventana VISIBLE (Start-Process = "doble clic").
 * El destino va como variable de entorno, nunca dentro del comando. Si PowerShell falla, se intenta con explorer.
 */
async function abrirVisible(destino: string): Promise<void> {
  try {
    await powershell("Start-Process -FilePath $env:JARVIS_DESTINO -WindowStyle Normal", { JARVIS_DESTINO: destino });
  } catch {
    abrirConExplorer(destino);
  }
}

export function abrirUrl(url: string): Promise<void> {
  return abrirVisible(url);
}

export function abrirRuta(ruta: string): Promise<void> {
  return abrirVisible(ruta);
}

/** Manda un archivo a la Papelera de reciclaje (se puede recuperar). */
export async function mandarAPapelera(ruta: string): Promise<void> {
  await powershell(
    "Add-Type -AssemblyName Microsoft.VisualBasic;" +
      "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:JARVIS_RUTA,'OnlyErrorDialogs','SendToRecycleBin')",
    { JARVIS_RUTA: ruta }
  );
}

// ------------------------------------------------------------------ carpetas del usuario

export interface CarpetasUsuario {
  [alias: string]: string;
}

let carpetasCache: CarpetasUsuario | null = null;

/** Ubicación real de Escritorio, Documentos, etc. (pueden estar dentro de OneDrive). */
export async function carpetasUsuario(): Promise<CarpetasUsuario> {
  if (carpetasCache) return carpetasCache;
  const casa = os.homedir();
  const base: CarpetasUsuario = {
    escritorio: path.join(casa, "Desktop"),
    documentos: path.join(casa, "Documents"),
    descargas: path.join(casa, "Downloads"),
    imagenes: path.join(casa, "Pictures"),
    musica: path.join(casa, "Music"),
    videos: path.join(casa, "Videos"),
  };
  if (esWindows) {
    try {
      const salida = await powershell(
        "$f=[Environment];@{escritorio=$f::GetFolderPath('Desktop');documentos=$f::GetFolderPath('MyDocuments');" +
          "imagenes=$f::GetFolderPath('MyPictures');musica=$f::GetFolderPath('MyMusic');videos=$f::GetFolderPath('MyVideos')}" +
          " | ConvertTo-Json -Compress"
      );
      const reales = JSON.parse(salida.trim());
      for (const [k, v] of Object.entries(reales)) if (typeof v === "string" && v) base[k] = v;
    } catch {
      // Se usan las ubicaciones normales
    }
  }
  base.jarvis = path.join(base.documentos, "Jarvis");
  carpetasCache = base;
  return base;
}

// ------------------------------------------------------------------ volumen y sistema

// Teclas especiales de Windows: 173 silenciar, 174 bajar, 175 subir (cada toque = 2 %)
function teclas(codigo: number, veces: number): Promise<string> {
  return powershell("$w=New-Object -ComObject WScript.Shell; for($i=0;$i -lt [int]$env:JARVIS_N;$i++){$w.SendKeys([char][int]$env:JARVIS_K)}", {
    JARVIS_N: String(veces),
    JARVIS_K: String(codigo),
  });
}

export async function volumen(accion: "subir" | "bajar" | "silenciar" | "establecer", cantidad: number): Promise<void> {
  if (accion === "silenciar") await teclas(173, 1);
  else if (accion === "subir") await teclas(175, Math.ceil(cantidad / 2));
  else if (accion === "bajar") await teclas(174, Math.ceil(cantidad / 2));
  else {
    await teclas(174, 50); // primero hasta 0 %
    if (cantidad > 0) await teclas(175, Math.round(cantidad / 2));
  }
}

export function accionSistema(accion: "bloquear" | "suspender" | "reiniciar" | "apagar" | "cancelar_apagado"): void {
  const comandos: Record<string, [string, string[]]> = {
    bloquear: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
    suspender: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    // 60 segundos de espera para poder arrepentirse
    reiniciar: ["shutdown.exe", ["/r", "/t", "60"]],
    apagar: ["shutdown.exe", ["/s", "/t", "60"]],
    cancelar_apagado: ["shutdown.exe", ["/a"]],
  };
  const [programa, args] = comandos[accion];
  const hijo = spawn(programa, args, { detached: true, stdio: "ignore", windowsHide: true });
  hijo.on("error", () => {});
  hijo.unref();
}
