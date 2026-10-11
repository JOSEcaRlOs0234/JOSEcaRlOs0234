/**
 * Escucha el micrófono en segundo plano (mientras Jarvis está encendido) y, al oír dos aplausos,
 * saluda en voz alta y abre la ventana de Jarvis.
 * También maneja el "arranque con Windows" (un acceso directo en la carpeta Inicio de Windows).
 */

import { execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DetectorAplausos, EventoAplauso } from "./detector-aplausos.ts";

const CARPETA_APP = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO_CONFIG = path.join(CARPETA_APP, "datos", "aplausos.json");
const esWindows = process.platform === "win32";

export interface ConfigAplausos {
  activo: boolean;
  sensibilidad: number;
  // Ya se configuró el arranque con Windows la primera vez (para no volver a crearlo si el usuario lo quitó)
  arranqueConfigurado: boolean;
}

export interface EstadoAplausos {
  config: ConfigAplausos;
  estado: "escuchando" | "apagado" | "sin_microfono" | "no_disponible";
  microfono: string;
  nivel: number;
  eventos: { hora: string; texto: string }[];
  activaciones: number;
  arranqueConWindows: boolean;
}

function powershell(script: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 60000 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr?.toString() || err.message)) : resolve(stdout.toString()))
    );
  });
}

export class OidoDeJarvis {
  private detector: DetectorAplausos;
  private grabadora: any = null;
  private corriendo = false;
  private estado: EstadoAplausos["estado"] = "apagado";
  private microfono = "";
  private eventos: EstadoAplausos["eventos"] = [];
  private activaciones = 0;
  private reintentando = false;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  config: ConfigAplausos;

  constructor(
    private alActivarse: () => void,
    private registrar: (tipo: string, mensaje: string) => void
  ) {
    this.config = this.leerConfig();
    this.detector = new DetectorAplausos((e) => this.alEvento(e));
    this.detector.sensibilidad = this.config.sensibilidad;
  }

  private leerConfig(): ConfigAplausos {
    const base: ConfigAplausos = { activo: true, sensibilidad: 5, arranqueConfigurado: false };
    try {
      return { ...base, ...JSON.parse(readFileSync(ARCHIVO_CONFIG, "utf8")) };
    } catch {
      return base;
    }
  }

  private guardarConfig(): void {
    mkdirSync(path.dirname(ARCHIVO_CONFIG), { recursive: true });
    writeFileSync(ARCHIVO_CONFIG, JSON.stringify(this.config, null, 2), "utf8");
  }

  private anotar(texto: string): void {
    const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.eventos = [{ hora, texto }, ...this.eventos].slice(0, 12);
  }

  private alEvento(e: EventoAplauso): void {
    if (e.tipo === "aplauso") this.anotar(`Aplauso (fuerza ${e.fuerza})`);
    else if (e.tipo === "ignorado") this.anotar(`Ignorado: ${e.motivo}`);
    else {
      this.activaciones++;
      this.anotar("¡Doble aplauso! Jarvis activado");
      this.registrar("APLAUSOS", "Doble aplauso detectado: Jarvis activado.");
      this.alActivarse();
    }
  }

  /** Empieza a escuchar el micrófono (si está activado en la configuración). */
  async iniciar(): Promise<void> {
    if (!this.config.activo || this.corriendo) return;
    let PvRecorder: any;
    try {
      ({ PvRecorder } = await import("@picovoice/pvrecorder-node"));
    } catch {
      this.estado = "no_disponible";
      this.registrar("AVISO", "No está instalada la pieza para escuchar el micrófono (pvrecorder).");
      return;
    }
    try {
      // 256 muestras a 16 kHz = pedacitos de 16 milisegundos; -1 = micrófono predeterminado de Windows
      this.grabadora = new PvRecorder(256, -1);
      this.grabadora.start();
      this.microfono = this.grabadora.getSelectedDevice?.() ?? "";
    } catch (err: any) {
      this.estado = "sin_microfono";
      this.grabadora = null;
      // Avisar solo la primera vez; luego reintentar en silencio (al prender la laptop el micrófono tarda en estar listo)
      if (!this.reintentando) {
        this.registrar("ERROR", `No pude usar el micrófono para los aplausos: ${String(err?.message ?? err).slice(0, 200)}`);
      }
      this.reintentando = true;
      clearTimeout(this.temporizador);
      this.temporizador = setTimeout(() => void this.iniciar(), 15000);
      return;
    }
    this.corriendo = true;
    this.reintentando = false;
    this.estado = "escuchando";
    this.registrar("APLAUSOS", `Escuchando aplausos con: ${this.microfono || "micrófono predeterminado"}`);
    void this.bucle();
  }

  private async bucle(): Promise<void> {
    let fallos = 0;
    while (this.corriendo && this.grabadora) {
      try {
        const pedazo: Int16Array = await this.grabadora.read();
        this.detector.procesar(pedazo, performance.now());
        fallos = 0;
      } catch (err: any) {
        // Por ejemplo, si se desconectan los audífonos: reintentar unas veces
        if (++fallos > 20) {
          this.registrar("ERROR", `Se perdió el micrófono de los aplausos: ${String(err?.message ?? err).slice(0, 200)}`);
          this.detener();
          this.estado = "sin_microfono";
          this.temporizador = setTimeout(() => void this.iniciar(), 10000);
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  detener(): void {
    clearTimeout(this.temporizador);
    this.corriendo = false;
    try {
      this.grabadora?.release();
    } catch {
      // Ya estaba liberada
    }
    this.grabadora = null;
    this.estado = "apagado";
  }

  /** Pausa la detección unos segundos (mientras Jarvis habla por las bocinas). */
  pausar(ms: number): void {
    this.detector.pausar(ms, performance.now());
  }

  async cambiarConfig(cambios: { activo?: boolean; sensibilidad?: number }): Promise<void> {
    if (typeof cambios.sensibilidad === "number" && Number.isFinite(cambios.sensibilidad)) {
      this.config.sensibilidad = Math.min(10, Math.max(1, Math.round(cambios.sensibilidad)));
      this.detector.sensibilidad = this.config.sensibilidad;
    }
    if (typeof cambios.activo === "boolean" && cambios.activo !== this.config.activo) {
      this.config.activo = cambios.activo;
      if (cambios.activo) {
        this.guardarConfig();
        await this.iniciar();
      } else this.detener();
      this.registrar("APLAUSOS", cambios.activo ? "Detector de aplausos encendido." : "Detector de aplausos apagado.");
    }
    this.guardarConfig();
  }

  estadoActual(): Omit<EstadoAplausos, "arranqueConWindows"> {
    return {
      config: this.config,
      estado: this.estado,
      microfono: this.microfono,
      nivel: Math.round(this.detector.nivel * 100) / 100,
      eventos: this.eventos,
      activaciones: this.activaciones,
    };
  }

  // ---------------------------------------------------------------- arranque con Windows

  private rutaAccesoInicio(): string {
    const appdata = process.env.APPDATA ?? "";
    return path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Jarvis (aplausos).lnk");
  }

  arranqueConWindows(): boolean {
    return esWindows && existsSync(this.rutaAccesoInicio());
  }

  /** Crea o quita el acceso directo que enciende a Jarvis (en segundo plano) al prender la laptop. */
  async cambiarArranque(activar: boolean): Promise<void> {
    if (!esWindows) throw new Error("Solo funciona en Windows.");
    const datos = {
      JARVIS_ACCESO: this.rutaAccesoInicio(),
      JARVIS_VBS: path.join(CARPETA_APP, "Jarvis.vbs"),
      JARVIS_CARPETA: CARPETA_APP,
      JARVIS_ICONO: path.join(CARPETA_APP, "jarvis.ico"),
    };
    if (activar) {
      await powershell(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:JARVIS_ACCESO);" +
          "$s.TargetPath=(Join-Path $env:WINDIR 'System32\\wscript.exe');" +
          "$s.Arguments='\"' + $env:JARVIS_VBS + '\" fondo';" +
          "$s.WorkingDirectory=$env:JARVIS_CARPETA; $s.IconLocation=$env:JARVIS_ICONO;" +
          "$s.Description='Enciende J.A.R.V.I.S. en segundo plano para escuchar aplausos'; $s.Save()",
        datos
      );
    } else {
      await powershell("Remove-Item -LiteralPath $env:JARVIS_ACCESO -ErrorAction SilentlyContinue", datos);
    }
    this.config.arranqueConfigurado = true;
    this.guardarConfig();
    this.registrar("APLAUSOS", activar ? "Jarvis arrancará solo al prender la laptop." : "Jarvis ya no arrancará solo.");
  }

  /** La primera vez, deja activado el arranque con Windows (lo pidió el usuario). */
  async configurarArranqueInicial(): Promise<void> {
    if (!esWindows || this.config.arranqueConfigurado) return;
    try {
      await this.cambiarArranque(true);
    } catch (err: any) {
      this.registrar("ERROR", `No pude configurar el arranque con Windows: ${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
}

/** Dice un texto en voz alta con las voces de Windows (sin abrir ninguna ventana). */
export function decirEnVoz(texto: string): Promise<void> {
  if (!esWindows) return Promise.resolve();
  return powershell(
    "Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer;" +
      "$v=$s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es*' } | Select-Object -First 1;" +
      "if($v){ $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate=0; $s.Speak($env:JARVIS_TEXTO)",
    { JARVIS_TEXTO: texto }
  ).then(
    () => undefined,
    () => undefined
  );
}

/** Saludo según la hora del día. */
export function saludo(): string {
  const h = new Date().getHours();
  const parte = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  return `${parte}, señor. A sus órdenes.`;
}
