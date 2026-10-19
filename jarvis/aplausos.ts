/**
 * Escucha el micrófono en segundo plano (mientras Jarvis está encendido) y, al oír la palabra "Jarvis"
 * (con Porcupine, sin internet) o dos aplausos, saluda en voz alta y abre la ventana de Jarvis.
 * También maneja el "arranque con Windows" (un acceso directo en la carpeta Inicio de Windows).
 */

import { execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Calibracion, CALIBRACION_INICIAL, DetectorAplausos, EventoAplauso } from "./detector-aplausos.ts";
import { CARPETA_DATOS } from "./ubicacion.mjs";

const CARPETA_APP = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO_CONFIG = path.join(CARPETA_DATOS, "aplausos.json");
const esWindows = process.platform === "win32";

export interface ConfigAplausos {
  activo: boolean;
  sensibilidad: number;
  // Formas de despertar a Jarvis
  usarPalabra: boolean; // decir "Jarvis" (necesita la clave gratuita de Picovoice)
  usarAplausos: boolean; // doble aplauso
  sensibilidadPalabra: number; // 1 a 10
  // Micrófono a usar: -1 = el predeterminado de Windows; 0, 1, 2... = uno de la lista
  dispositivo: number;
  // Nombre de ese micrófono (los números pueden cambiar si conectas audífonos)
  nombreDispositivo: string;
  // true si el usuario lo eligió a mano (entonces Jarvis no lo cambia solo)
  microfonoManual: boolean;
  // Cómo suenan los aplausos del usuario (botón "Enseñarle mis aplausos")
  calibracion: Calibracion;
  // Ya se configuró el arranque con Windows la primera vez (para no volver a crearlo si el usuario lo quitó)
  arranqueConfigurado: boolean;
}

export interface EstadoAplausos {
  config: ConfigAplausos;
  estado: "escuchando" | "apagado" | "sin_microfono" | "no_disponible" | "buscando";
  microfono: string;
  nivel: number;
  eventos: { hora: string; texto: string }[];
  activaciones: number;
  aprendiendo: boolean;
  // Estado de la palabra "Jarvis": activa, sin clave, con error (clave mala, sin internet la 1.ª vez...) o apagada
  palabra: "activa" | "sin_clave" | "error" | "apagada";
  errorPalabra: string;
  sinSonido: boolean;
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
  private pausaPalabraHasta = 0;
  private porcupine: any = null;
  private estadoPalabra: EstadoAplausos["palabra"] = "apagada";
  private errorPalabra = "";
  private inicioEscucha = 0;
  private yaBusque = false;
  private ultimoSonido = 0;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  config: ConfigAplausos;

  constructor(
    private alActivarse: () => void,
    private registrar: (tipo: string, mensaje: string) => void
  ) {
    this.config = this.leerConfig();
    this.detector = new DetectorAplausos((e) => this.alEvento(e));
    this.detector.sensibilidad = this.config.sensibilidad;
    this.detector.calibracion = { ...CALIBRACION_INICIAL, ...this.config.calibracion };
  }

  private leerConfig(): ConfigAplausos {
    const base: ConfigAplausos = {
      activo: true,
      sensibilidad: 5,
      usarPalabra: true,
      usarAplausos: true,
      sensibilidadPalabra: 6,
      dispositivo: -1,
      nombreDispositivo: "",
      microfonoManual: false,
      calibracion: { ...CALIBRACION_INICIAL },
      arranqueConfigurado: false,
    };
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
    else if (e.tipo === "aprendido") this.anotar(`Aprendiendo: aplauso ${e.numero} de 3`);
    else if (e.tipo === "calibrado") {
      this.config.calibracion = { maxLargo: e.maxLargo, minAgudos: e.minAgudos };
      this.config.sensibilidad = e.sensibilidad;
      this.guardarConfig();
      this.anotar(`¡Listo! Ya aprendí cómo suenan tus aplausos (sensibilidad ${e.sensibilidad})`);
      this.registrar("APLAUSOS", `Aprendí los aplausos del usuario (hasta ${e.maxLargo} ms, agudos ≥ ${e.minAgudos}).`);
    } else {
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
    // Si se guardó el nombre del micrófono, buscar su número actual (cambia al conectar o quitar aparatos)
    if (this.config.nombreDispositivo) {
      try {
        const indice = (PvRecorder.getAvailableDevices() as string[]).indexOf(this.config.nombreDispositivo);
        if (indice >= 0) this.config.dispositivo = indice;
      } catch {
        // Se usa el número guardado
      }
    }
    if (!this.config.usarPalabra && !this.config.usarAplausos) {
      this.estado = "apagado";
      return;
    }
    await this.prepararPalabra();
    try {
      // Porcupine pide pedacitos de 512 muestras (32 ms); solo aplausos usa 256 (16 ms). -1 = micrófono predeterminado
      const largo = this.porcupine?.frameLength ?? 256;
      this.grabadora = new PvRecorder(largo, this.config.dispositivo);
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
    this.inicioEscucha = performance.now();
    this.ultimoSonido = 0;
    this.estado = "escuchando";
    const formas = [this.porcupine ? 'la palabra "Jarvis"' : "", this.config.usarAplausos ? "aplausos" : ""].filter(Boolean);
    this.registrar("APLAUSOS", `Escuchando ${formas.join(" y ")} con: ${this.microfono || "micrófono predeterminado"}`);
    void this.bucle();
  }

  private async bucle(): Promise<void> {
    let fallos = 0;
    while (this.corriendo && this.grabadora) {
      try {
        const pedazo: Int16Array = await this.grabadora.read();
        const ahora = performance.now();
        // ¿Llega sonido de verdad? Si Windows bloquea el micrófono, solo llegan ceros
        if (pedazo.some((x) => x !== 0)) this.ultimoSonido = ahora;
        // ¿Dijeron "Jarvis"?
        if (this.porcupine && this.porcupine.process(pedazo) >= 0 && ahora > this.pausaPalabraHasta) {
          this.pausaPalabraHasta = ahora + 8000;
          this.detector.pausar(8000, ahora);
          this.activaciones++;
          this.anotar('¡Escuché "Jarvis"! Activado');
          this.registrar("APLAUSOS", 'Palabra "Jarvis" detectada: Jarvis activado.');
          this.alActivarse();
        }
        // Aplausos: el detector trabaja con pedacitos de 256 muestras
        if (this.config.usarAplausos) {
          for (let i = 0; i < pedazo.length; i += 256) {
            this.detector.procesar(pedazo.subarray(i, i + 256), ahora + (i / 16000) * 1000);
          }
        }
        // 3 segundos de puro silencio: este micrófono no sirve; buscar otro que sí oiga (una vez por encendido)
        if (!this.ultimoSonido && ahora - this.inicioEscucha > 3000 && !this.yaBusque && !this.config.microfonoManual) {
          this.yaBusque = true;
          void this.buscarMicrofono();
          return;
        }
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
    try {
      this.porcupine?.release();
    } catch {
      // Ya estaba liberado
    }
    this.porcupine = null;
    this.estado = "apagado";
  }

  /** Prueba cada micrófono de la laptop y se queda con el primero que de verdad manda sonido. */
  private async buscarMicrofono(): Promise<void> {
    const anterior = this.config.dispositivo;
    this.detener();
    this.estado = "buscando";
    this.anotar("El micrófono no manda sonido: probando los demás...");
    this.registrar("APLAUSOS", "El micrófono no manda sonido; probando los demás micrófonos.");

    let PvRecorder: any;
    let lista: string[] = [];
    try {
      ({ PvRecorder } = await import("@picovoice/pvrecorder-node"));
      lista = PvRecorder.getAvailableDevices();
    } catch {
      // Sin lista no se puede buscar
    }

    for (let i = 0; i < lista.length; i++) {
      if (!this.config.activo) return;
      let prueba: any = null;
      try {
        prueba = new PvRecorder(256, i);
        prueba.start();
        let conSonido = 0;
        // Escuchar ~1.2 segundos: un micrófono real siempre capta algo de ruido del cuarto
        for (let f = 0; f < 75; f++) {
          const pedazo: Int16Array = await prueba.read();
          if (pedazo.some((x) => Math.abs(x) > 2)) conSonido++;
        }
        prueba.release();
        prueba = null;
        if (conSonido > 10) {
          this.config.dispositivo = i;
          this.config.nombreDispositivo = lista[i];
          this.guardarConfig();
          this.anotar(`Micrófono elegido solo: ${lista[i]}`);
          this.registrar("APLAUSOS", `Elegí automáticamente el micrófono: ${lista[i]}`);
          await this.iniciar();
          return;
        }
      } catch {
        try {
          prueba?.release();
        } catch {
          // Nada que liberar
        }
      }
    }

    // Ninguno mandó sonido: volver al de antes y dejar el aviso en pantalla
    this.config.dispositivo = anterior;
    this.anotar("Ningún micrófono mandó sonido. ¿Está silenciado o tapado?");
    this.registrar("ERROR", "Ningún micrófono mandó sonido para los aplausos.");
    await this.iniciar();
  }

  /** Botón "Enseñarle mis aplausos": las próximas 3 palmadas se usan para aprender. */
  aprender(): void {
    this.detector.aprender();
    this.anotar("Aplaude 3 veces, despacio (uno cada segundo)...");
  }

  /** Volver a las reglas de fábrica. */
  restablecerCalibracion(): void {
    this.config.calibracion = { ...CALIBRACION_INICIAL };
    this.detector.calibracion = { ...CALIBRACION_INICIAL };
    this.guardarConfig();
    this.anotar("Reglas de aplausos de fábrica restablecidas");
  }

  /** Prepara Porcupine para oír "Jarvis" (si está activado y hay clave). */
  private async prepararPalabra(): Promise<void> {
    this.porcupine = null;
    if (!this.config.usarPalabra) {
      this.estadoPalabra = "apagada";
      return;
    }
    const clave = process.env.PICOVOICE_ACCESS_KEY?.trim();
    if (!clave) {
      this.estadoPalabra = "sin_clave";
      return;
    }
    try {
      this.porcupine = await crearPorcupine(clave, this.config.sensibilidadPalabra);
      this.estadoPalabra = "activa";
      this.errorPalabra = "";
    } catch (err) {
      this.estadoPalabra = "error";
      this.errorPalabra = explicarErrorPorcupine(err);
      this.registrar("ERROR", `No pude activar la palabra "Jarvis": ${this.errorPalabra}`);
    }
  }

  /** Reinicia la escucha (por ejemplo, después de guardar la clave de Picovoice). */
  async reiniciar(): Promise<void> {
    this.detener();
    await this.iniciar();
  }

  /** Pausa la detección unos segundos (mientras Jarvis habla por las bocinas). */
  pausar(ms: number): void {
    this.detector.pausar(ms, performance.now());
  }

  /** Lista de micrófonos que ve Windows. */
  async listarMicrofonos(): Promise<string[]> {
    try {
      const { PvRecorder } = await import("@picovoice/pvrecorder-node");
      return PvRecorder.getAvailableDevices();
    } catch {
      return [];
    }
  }

  async cambiarConfig(cambios: {
    activo?: boolean;
    sensibilidad?: number;
    dispositivo?: number;
    usarPalabra?: boolean;
    usarAplausos?: boolean;
    sensibilidadPalabra?: number;
  }): Promise<void> {
    let reiniciar = false;
    if (typeof cambios.usarPalabra === "boolean" && cambios.usarPalabra !== this.config.usarPalabra) {
      this.config.usarPalabra = cambios.usarPalabra;
      reiniciar = true;
    }
    if (typeof cambios.usarAplausos === "boolean" && cambios.usarAplausos !== this.config.usarAplausos) {
      this.config.usarAplausos = cambios.usarAplausos;
      reiniciar = true;
    }
    if (typeof cambios.sensibilidadPalabra === "number" && Number.isFinite(cambios.sensibilidadPalabra)) {
      const s = Math.min(10, Math.max(1, Math.round(cambios.sensibilidadPalabra)));
      if (s !== this.config.sensibilidadPalabra) {
        this.config.sensibilidadPalabra = s;
        reiniciar = true;
      }
    }
    if (reiniciar) {
      this.guardarConfig();
      await this.reiniciar();
    }
    if (typeof cambios.dispositivo === "number" && Number.isInteger(cambios.dispositivo) && cambios.dispositivo >= -1) {
      if (cambios.dispositivo !== this.config.dispositivo || !this.config.microfonoManual) {
        const lista = await this.listarMicrofonos();
        this.config.dispositivo = cambios.dispositivo;
        this.config.nombreDispositivo = lista[cambios.dispositivo] ?? "";
        // Elegir "Predeterminado" vuelve al modo automático
        this.config.microfonoManual = cambios.dispositivo !== -1;
        this.yaBusque = false;
        this.guardarConfig();
        this.detener();
        this.registrar("APLAUSOS", `Micrófono cambiado (número ${cambios.dispositivo}).`);
        await this.iniciar();
      }
    }
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
      aprendiendo: this.detector.aprendiendo,
      palabra: this.config.usarPalabra ? this.estadoPalabra : "apagada",
      errorPalabra: this.errorPalabra,
      // Escuchando hace más de 4 segundos y solo llegan ceros: Windows no deja oír o es el micrófono equivocado
      sinSonido:
        this.estado === "escuchando" &&
        performance.now() - this.inicioEscucha > 4000 &&
        performance.now() - this.ultimoSonido > 4000,
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
  async cambiarArranque(activar: boolean, silencioso = false): Promise<void> {
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
    if (!silencioso) {
      this.registrar("APLAUSOS", activar ? "Jarvis arrancará solo al prender la laptop." : "Jarvis ya no arrancará solo.");
    }
  }

  /** La primera vez deja activado el arranque con Windows (lo pidió el usuario); después lo mantiene al día. */
  async configurarArranqueInicial(): Promise<void> {
    if (!esWindows) return;
    // Si ya existe, rehacerlo para que apunte a ESTA carpeta (por si Jarvis se actualizó en otra carpeta)
    if (this.config.arranqueConfigurado) {
      if (this.arranqueConWindows()) await this.cambiarArranque(true, true).catch(() => undefined);
      return;
    }
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

// ------------------------------------------------------------------ Porcupine ("Jarvis")

/** Sensibilidad 1..10 → 0.3..0.85 (más alta = lo oye más fácil, pero puede activarse con palabras parecidas). */
function sensibilidadPorcupine(s: number): number {
  return Math.round((0.3 + ((Math.min(10, Math.max(1, s)) - 1) * 0.55) / 9) * 100) / 100;
}

/** Crea el detector de la palabra "Jarvis". Lanza error si la clave no sirve. */
export async function crearPorcupine(clave: string, sensibilidad: number): Promise<any> {
  const { Porcupine, BuiltinKeyword, getBuiltinKeywordPath } = await import("@picovoice/porcupine-node");
  return new Porcupine(clave, [getBuiltinKeywordPath(BuiltinKeyword.JARVIS)], [sensibilidadPorcupine(sensibilidad)]);
}

/** Traduce los errores de Picovoice a palabras sencillas. */
export function explicarErrorPorcupine(err: any): string {
  const nombre = String(err?.constructor?.name ?? "");
  const texto = String(err?.message ?? err ?? "");
  if (/ActivationLimitReached/i.test(nombre)) return "Tu clave de Picovoice llegó a su límite de uso.";
  if (/ActivationThrottled/i.test(nombre)) return "Picovoice pide esperar un momento; intenta en unos minutos.";
  if (/ActivationRefused|Key|InvalidArgument/i.test(nombre) || /AccessKey/i.test(texto)) {
    return "La clave de Picovoice no es válida. Revisa que la copiaste completa.";
  }
  if (/Activation/i.test(nombre) || /network|connect/i.test(texto)) {
    return "No pude comprobar la clave de Picovoice (¿hay internet?).";
  }
  return "Ocurrió un error al preparar la palabra \"Jarvis\".";
}
