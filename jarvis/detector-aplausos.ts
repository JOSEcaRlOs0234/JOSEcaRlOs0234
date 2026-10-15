/**
 * El "oído" de Jarvis: analiza el sonido del micrófono, pedacito por pedacito,
 * y avisa cuando escucha DOS aplausos seguidos.
 *
 * Cómo distingue un aplauso de otros ruidos:
 *  - Empieza de golpe (sube muy rápido desde el silencio).
 *  - Es corto (dura menos de ~0.15 s). Un portazo, una voz o música duran más.
 *  - Es "agudo" (mucho sonido de alta frecuencia). Un portazo o un golpe en la mesa es grave.
 *  - Deben ser exactamente dos, con 0.12 a 0.8 s entre ellos, y después silencio
 *    (si hay un tercer golpe, como alguien tocando la puerta, se ignora).
 *
 * Solo se analizan niveles de volumen: el audio no se graba ni se envía a ningún lado.
 */

export type EventoAplauso =
  | { tipo: "aplauso"; fuerza: number }
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "activado" }
  | { tipo: "aprendido"; numero: number }
  | { tipo: "calibrado"; maxLargo: number; minAgudos: number; sensibilidad: number };

/** Lo que el detector aprendió de los aplausos del usuario. */
export interface Calibracion {
  maxLargo: number; // milisegundos que puede durar un aplauso
  minAgudos: number; // qué tan "agudo" debe sonar como mínimo
}

// En una laptop real los aplausos midieron ~84 ms y agudos 0.22; portazos y golpes graves miden ~0.05–0.10
export const CALIBRACION_INICIAL: Calibracion = { maxLargo: 250, minAgudos: 0.15 };
const APLAUSOS_PARA_APRENDER = 3;

const MS_POR_MUESTRA = 1000 / 16000;

/** Sensibilidad 1 (poco sensible) a 10 (muy sensible) → volumen mínimo de un aplauso (0 a 1). */
export function umbralPorSensibilidad(sensibilidad: number): number {
  const s = Math.min(10, Math.max(1, Math.round(sensibilidad)));
  // Los micrófonos de laptop pueden captar muy bajito (aplausos de 0.05), por eso el 10 llega a 0.01
  return 0.25 * Math.pow(0.7, s - 1); // s=1: 0.25 · s=5: 0.06 · s=10: 0.01
}

export class DetectorAplausos {
  sensibilidad = 5;
  calibracion: Calibracion = { ...CALIBRACION_INICIAL };
  private aprendidos: { largo: number; agudos: number; pico: number }[] | null = null;

  private fondo = 0.003; // ruido de fondo del cuarto (se ajusta solo)
  private previos: number[] = []; // volumen de los últimos pedacitos (para ver si subió de golpe)
  private evento: { inicio: number; pico: number; agudos: number[]; ultimoFuerte: number } | null = null;
  private aplausos: { t: number; pico: number }[] = [];
  private pausaHasta = 0;
  nivel = 0; // volumen actual, para el medidor de la pantalla

  constructor(private avisar: (e: EventoAplauso) => void) {}

  /** Empieza a aprender cómo suenan los aplausos del usuario (debe aplaudir 3 veces, despacio). */
  aprender(): void {
    this.aprendidos = [];
    this.aplausos = [];
  }

  get aprendiendo(): boolean {
    return this.aprendidos !== null;
  }

  private terminarAprendizaje(): void {
    const lista = this.aprendidos ?? [];
    this.aprendidos = null;
    // Dejar margen (un poco más largo y menos agudo que lo escuchado). Aprender solo AFLOJA las reglas
    // para aceptar los aplausos del usuario; nunca las hace más estrictas que las de fábrica.
    const largoAprendido = Math.max(...lista.map((x) => x.largo)) * 1.4 + 40;
    const agudosAprendidos = Math.min(...lista.map((x) => x.agudos)) * 0.7;
    const maxLargo = Math.round(Math.min(450, Math.max(CALIBRACION_INICIAL.maxLargo, largoAprendido)));
    const minAgudos =
      Math.round(Math.max(0.08, Math.min(CALIBRACION_INICIAL.minAgudos, agudosAprendidos)) * 100) / 100;
    this.calibracion = { maxLargo, minAgudos };
    // Sensibilidad: la más baja con la que el aplauso más suave todavía pasa con margen (pico × 0.6)
    const picoMin = Math.min(...lista.map((x) => x.pico));
    let sensibilidad = 10;
    for (let s = 1; s <= 10; s++) {
      if (umbralPorSensibilidad(s) <= picoMin * 0.6) {
        sensibilidad = s;
        break;
      }
    }
    this.sensibilidad = sensibilidad;
    this.avisar({ tipo: "calibrado", maxLargo, minAgudos, sensibilidad });
  }

  /** Pausa la detección (por ejemplo mientras Jarvis habla). */
  pausar(ms: number, ahora: number): void {
    this.pausaHasta = Math.max(this.pausaHasta, ahora + ms);
    this.evento = null;
    this.aplausos = [];
  }

  /** Procesa un pedacito de audio (16 kHz, enteros de 16 bits). `ahora` en milisegundos. */
  procesar(muestras: Int16Array, ahora: number): void {
    const n = muestras.length;
    let suma = 0;
    let sumaDif = 0;
    let pico = 0;
    for (let i = 0; i < n; i++) {
      const x = muestras[i] / 32768;
      suma += x * x;
      const abs = Math.abs(x);
      if (abs > pico) pico = abs;
      if (i > 0) {
        const d = x - muestras[i - 1] / 32768;
        sumaDif += d * d;
      }
    }
    const rms = Math.sqrt(suma / n);
    // Proporción de agudos: ruido blanco ≈ 1.4; sonidos graves (portazo, golpe) ≈ 0.1–0.5
    const agudos = rms > 0 ? Math.sqrt(sumaDif / Math.max(1, n - 1)) / rms : 0;
    this.nivel = pico;

    const duracion = n * MS_POR_MUESTRA;
    const pausado = ahora < this.pausaHasta;
    // Mientras aprende, escuchar con la máxima sensibilidad para no perder ningún aplauso
    const umbral = Math.max(umbralPorSensibilidad(this.aprendidos ? 10 : this.sensibilidad), this.fondo * 12);

    if (this.evento) {
      // Hay un sonido fuerte en curso: ver cuánto dura
      const e = this.evento;
      if (pico > e.pico) e.pico = pico;
      if (e.agudos.length < 3) e.agudos.push(agudos);
      if (rms > Math.max(e.pico * 0.2, this.fondo * 4)) e.ultimoFuerte = ahora;
      const largo = ahora - e.inicio;
      if (ahora - e.ultimoFuerte > 40 || largo > 600) {
        this.evento = null;
        this.terminarEvento(e, largo, ahora);
      }
    } else if (!pausado && pico >= umbral) {
      const antes = this.previos.length ? Math.max(...this.previos) : 0;
      // Subida de golpe: el pedacito anterior era mucho más bajo
      if (rms > antes * 3 + 0.002) {
        this.evento = { inicio: ahora, pico, agudos: [agudos], ultimoFuerte: ahora };
      }
    }

    // Ajustar el ruido de fondo solo en momentos tranquilos
    if (!this.evento && pico < umbral * 0.5) {
      this.fondo = this.fondo * 0.98 + rms * 0.02;
    }

    this.previos.push(rms);
    if (this.previos.length > 3) this.previos.shift();

    // Revisar si ya pasó el tiempo de espera después del segundo aplauso
    this.revisarSecuencia(ahora, duracion);
  }

  private terminarEvento(e: { inicio: number; pico: number; agudos: number[] }, largo: number, ahora: number): void {
    const agudosPromedio = e.agudos.reduce((a, b) => a + b, 0) / e.agudos.length;
    const datos = `${Math.round(largo)} ms, agudos ${agudosPromedio.toFixed(2)}`;

    // Modo "enseñarle mis aplausos": guardar cómo suena cada golpe, sin decidir nada
    if (this.aprendidos) {
      if (largo <= 600) {
        this.aprendidos.push({ largo, agudos: agudosPromedio, pico: e.pico });
        this.avisar({ tipo: "aprendido", numero: this.aprendidos.length });
      }
      if (this.aprendidos.length >= APLAUSOS_PARA_APRENDER) this.terminarAprendizaje();
      return;
    }

    if (largo > this.calibracion.maxLargo) {
      this.avisar({ tipo: "ignorado", motivo: `sonido largo (voz, música o portazo) · ${datos}` });
      this.aplausos = [];
      return;
    }
    if (agudosPromedio < this.calibracion.minAgudos) {
      this.avisar({ tipo: "ignorado", motivo: `golpe grave (puerta, mesa, pasos) · ${datos}` });
      this.aplausos = [];
      return;
    }
    this.avisar({ tipo: "aplauso", fuerza: Math.round(e.pico * 100) / 100 });
    this.aplausos.push({ t: e.inicio, pico: e.pico });

    if (this.aplausos.length === 2) {
      const [a, b] = this.aplausos;
      const separacion = b.t - a.t;
      const parecidos = Math.max(a.pico, b.pico) / Math.min(a.pico, b.pico) < 4;
      if (separacion < 120 || separacion > 800 || !parecidos) {
        // No forman pareja: el segundo puede ser el primero de una nueva pareja
        this.aplausos = [b];
      }
    } else if (this.aplausos.length > 2) {
      this.avisar({ tipo: "ignorado", motivo: "más de dos golpes (¿alguien tocando la puerta?)" });
      this.aplausos = [];
      this.pausaHasta = Math.max(this.pausaHasta, ahora + 800);
    }
  }

  private revisarSecuencia(ahora: number, _duracion: number): void {
    if (!this.aplausos.length || this.evento) return;
    const ultimo = this.aplausos[this.aplausos.length - 1];
    // Esperar medio segundo de calma para asegurar que no viene un tercer golpe
    if (ahora - ultimo.t < 500) return;
    if (this.aplausos.length === 2) {
      this.avisar({ tipo: "activado" });
      this.pausaHasta = ahora + 4000;
    } else {
      this.avisar({ tipo: "ignorado", motivo: "un solo aplauso o golpe" });
    }
    this.aplausos = [];
  }
}
