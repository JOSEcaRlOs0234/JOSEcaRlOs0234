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

// ------------------------------------------------------------------ sonido

/**
 * Toca un sonido (mp3) con el reproductor de Windows, sin ventanas. Se usa si la ventana de Jarvis no puede
 * sonar sola (el navegador a veces bloquea el sonido hasta que haces clic). Devuelve una función para callarlo.
 */
export function tocarSonido(ruta: string): () => void {
  if (!esWindows) return () => {};
  const hijo = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Add-Type -AssemblyName PresentationCore; $p=New-Object System.Windows.Media.MediaPlayer; " +
        "$p.Open([Uri]$env:JARVIS_SONIDO); Start-Sleep -Milliseconds 300; $p.Play(); Start-Sleep -Seconds 40",
    ],
    { env: { ...process.env, JARVIS_SONIDO: ruta }, windowsHide: true, stdio: "ignore" }
  );
  hijo.on("error", () => {});
  return () => {
    if (hijo.exitCode === null) hijo.kill();
  };
}

// ------------------------------------------------------------------ encender Jarvis para un recordatorio

const TAREA_RECORDATORIO = "Jarvis - recordatorio";

/**
 * Deja una tarea en el Programador de tareas de Windows que enciende Jarvis (escondido) a la hora indicada,
 * aunque esté apagado. Con `cuando` = null quita la tarea. Es una tarea del propio usuario: no pide administrador.
 * Si la laptop estaba suspendida a esa hora, Windows la corre en cuanto vuelve.
 */
export async function programarEncendido(cuando: number | null, lanzador: string): Promise<void> {
  if (!esWindows) return;
  if (cuando === null) {
    await powershell(
      "Unregister-ScheduledTask -TaskName $env:JARVIS_TAREA -Confirm:$false -ErrorAction SilentlyContinue",
      { JARVIS_TAREA: TAREA_RECORDATORIO }
    );
    return;
  }
  await powershell(
    "$a=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('\"' + $env:JARVIS_LANZADOR + '\" recordatorio');" +
      "$t=New-ScheduledTaskTrigger -Once -At ([DateTimeOffset]::FromUnixTimeMilliseconds([long]$env:JARVIS_CUANDO).LocalDateTime);" +
      "$s=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries " +
      "-ExecutionTimeLimit ([TimeSpan]::Zero);" +
      "Register-ScheduledTask -TaskName $env:JARVIS_TAREA -Action $a -Trigger $t -Settings $s " +
      "-Description 'Enciende J.A.R.V.I.S. para avisar un recordatorio' -Force | Out-Null",
    { JARVIS_TAREA: TAREA_RECORDATORIO, JARVIS_LANZADOR: lanzador, JARVIS_CUANDO: String(Math.round(cuando)) }
  );
}

// ------------------------------------------------------------------ configuración de Windows

/** Secciones de Configuración que Jarvis puede abrir (direcciones fijas "ms-settings:"). */
export const SECCIONES_CONFIGURACION: Record<string, string> = {
  inicio: "ms-settings:",
  wifi: "ms-settings:network-wifi",
  red: "ms-settings:network-status",
  modo_avion: "ms-settings:network-airplanemode",
  vpn: "ms-settings:network-vpn",
  bluetooth: "ms-settings:bluetooth",
  pantalla: "ms-settings:display",
  luz_nocturna: "ms-settings:nightlight",
  sonido: "ms-settings:sound",
  notificaciones: "ms-settings:notifications",
  concentracion: "ms-settings:quiethours",
  bateria: "ms-settings:batterysaver",
  energia: "ms-settings:powersleep",
  almacenamiento: "ms-settings:storagesense",
  aplicaciones: "ms-settings:appsfeatures",
  apps_al_iniciar: "ms-settings:startupapps",
  fondo_de_pantalla: "ms-settings:personalization-background",
  colores: "ms-settings:colors",
  temas: "ms-settings:themes",
  privacidad_microfono: "ms-settings:privacy-microphone",
  privacidad_camara: "ms-settings:privacy-webcam",
  actualizaciones: "ms-settings:windowsupdate",
  fecha_y_hora: "ms-settings:dateandtime",
  idioma: "ms-settings:regionlanguage",
  raton_y_touchpad: "ms-settings:mousetouchpad",
  teclado: "ms-settings:typing",
  impresoras: "ms-settings:printers",
  cuenta: "ms-settings:yourinfo",
  accesibilidad: "ms-settings:easeofaccess",
  acerca_de: "ms-settings:about",
};

/** Sube, baja o fija el brillo de la pantalla de la laptop. Devuelve el nuevo brillo (0-100). */
export async function brillo(accion: "subir" | "bajar" | "establecer", cantidad: number): Promise<number> {
  const salida = await powershell(
    "$m=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1;" +
      "$actual=[int]$m.CurrentBrightness; $n=[int]$env:JARVIS_N;" +
      "if($env:JARVIS_ACCION -eq 'subir'){$v=$actual+$n}elseif($env:JARVIS_ACCION -eq 'bajar'){$v=$actual-$n}else{$v=$n};" +
      "$v=[Math]::Max(0,[Math]::Min(100,$v));" +
      "Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1 |" +
      " Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=[uint32]1;Brightness=[byte]$v} | Out-Null; $v",
    { JARVIS_ACCION: accion, JARVIS_N: String(cantidad) }
  );
  return Number(salida.trim()) || 0;
}

/** Activa o quita el modo oscuro de Windows (apps y sistema). */
export async function modoOscuro(activar: boolean): Promise<void> {
  await powershell(
    "$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; $v=[int]$env:JARVIS_VALOR;" +
      "Set-ItemProperty -Path $p -Name AppsUseLightTheme -Value $v -Type DWord;" +
      "Set-ItemProperty -Path $p -Name SystemUsesLightTheme -Value $v -Type DWord",
    { JARVIS_VALOR: activar ? "0" : "1" }
  );
}

/** Enciende o apaga el Wi-Fi o el Bluetooth (como los botones de la barra de tareas; no pide administrador). */
export async function radio(tipo: "WiFi" | "Bluetooth", encender: boolean): Promise<void> {
  const salida = await powershell(
    "Add-Type -AssemblyName System.Runtime.WindowsRuntime;" +
      "$g=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0];" +
      "function Esperar($t,$r){ $x=$g.MakeGenericMethod($r).Invoke($null,@($t)); $x.Wait(-1) | Out-Null; $x.Result };" +
      "[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null;" +
      "[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null;" +
      "[Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null;" +
      "Esperar ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]) | Out-Null;" +
      "$radios=Esperar ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]);" +
      "$r=$radios | Where-Object { $_.Kind.ToString() -eq $env:JARVIS_TIPO } | Select-Object -First 1;" +
      "if(-not $r){ 'NO_HAY' } else { Esperar ($r.SetStateAsync([Windows.Devices.Radios.RadioState]$env:JARVIS_ESTADO)) ([Windows.Devices.Radios.RadioAccessStatus]) }",
    { JARVIS_TIPO: tipo, JARVIS_ESTADO: encender ? "On" : "Off" }
  );
  const r = salida.trim();
  if (r === "NO_HAY") throw new Error(`Esta laptop no tiene ${tipo === "WiFi" ? "Wi-Fi" : "Bluetooth"} o está desactivado en el sistema.`);
  if (r && r !== "Allowed") throw new Error("Windows no dejó cambiarlo (puede que esté bloqueado o en modo avión).");
}

/** Estado de la laptop: batería, red Wi-Fi, brillo y modo oscuro. */
export async function estadoLaptop(): Promise<Record<string, unknown>> {
  const salida = await powershell(
    "$b=Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1;" +
      "$bat=$null; if($b){ $bat=@{porcentaje=[int]$b.EstimatedChargeRemaining; conectada_a_la_corriente=([int]$b.BatteryStatus -eq 2)} };" +
      "$ssid=$null; try { $l=(netsh wlan show interfaces) | Where-Object { $_ -match '^\\s+SSID\\s+:' } | Select-Object -First 1; if($l){ $ssid=($l -split ':',2)[1].Trim() } } catch {};" +
      "$br=$null; try { $br=[int](Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch {};" +
      "$t=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -ErrorAction SilentlyContinue).AppsUseLightTheme;" +
      "@{bateria=$bat; red_wifi=$ssid; brillo=$br; modo_oscuro=($t -eq 0)} | ConvertTo-Json -Compress"
  );
  return JSON.parse(salida.trim() || "{}");
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
