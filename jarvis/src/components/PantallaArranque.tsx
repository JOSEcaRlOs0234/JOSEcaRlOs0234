/**
 * Pantalla de arranque: al abrir la ventana se ve una secuencia de "inicializando sistemas" con barra de carga y, al
 * final, cuánto tardó Jarvis en estar listo. La duración se elige en Ajustes (apagada, rápida, normal o cinemática).
 * Un clic la salta. No detiene nada: Jarvis ya funciona por detrás mientras se ve.
 */

import React, { useEffect, useRef, useState } from "react";

export type DuracionArranque = "apagada" | "instantanea" | "rapida" | "normal" | "cinematica";

export const DURACIONES: Record<DuracionArranque, { nombre: string; ms: number }> = {
  apagada: { nombre: "Apagada", ms: 0 },
  instantanea: { nombre: "Instantánea (1 s)", ms: 650 },
  rapida: { nombre: "Rápida (2 s)", ms: 2000 },
  normal: { nombre: "Normal (4 s)", ms: 4000 },
  cinematica: { nombre: "Cinemática (8 s)", ms: 8000 },
};

// Clave nueva en la 2.30: así todos empiezan con la pantalla de 1 segundo (antes la normal era de 4 s)
const CLAVE = "jarvis_arranque2";

export function leerDuracionArranque(): DuracionArranque {
  try {
    const v = localStorage.getItem(CLAVE) as DuracionArranque | null;
    return v && v in DURACIONES ? v : "instantanea";
  } catch {
    return "instantanea";
  }
}

export function guardarDuracionArranque(d: DuracionArranque): void {
  try {
    localStorage.setItem(CLAVE, d);
  } catch {
    // Sin almacenamiento se usa la de siempre
  }
}

const SISTEMAS = [
  "Núcleo de inteligencia artificial",
  "Conexión con Gemini",
  "Memoria y recuerdos",
  "Oído (micrófono)",
  "Voz",
  "Lista de acciones permitidas",
  "Registro de actividad",
  "Interfaz holográfica",
];

export function PantallaArranque({ duracion, alTerminar }: { duracion: number; alTerminar: () => void }) {
  const [avance, setAvance] = useState(0);
  const [listo, setListo] = useState<{ segundos: string; version: string; gemini: boolean } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const terminadoRef = useRef(false);

  const terminar = () => {
    if (terminadoRef.current) return;
    terminadoRef.current = true;
    setSaliendo(true);
    window.setTimeout(alTerminar, 200);
  };

  // Tiempo de inicio real: desde que se abrió la ventana hasta que el servidor de Jarvis contesta
  useEffect(() => {
    let vivo = true;
    fetch("/api/estado")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setListo({ segundos: (performance.now() / 1000).toFixed(1), version: String(d?.version ?? ""), gemini: !!d?.claveConfigurada });
      })
      .catch(() => vivo && setListo({ segundos: (performance.now() / 1000).toFixed(1), version: "", gemini: false }));
    return () => {
      vivo = false;
    };
  }, []);

  // Barra de carga que dura lo elegido; al final se queda un momento mostrando el tiempo de inicio
  useEffect(() => {
    const inicio = performance.now();
    let cuadro = 0;
    const paso = () => {
      const p = Math.min(1, (performance.now() - inicio) / duracion);
      setAvance(p);
      if (p < 1) cuadro = requestAnimationFrame(paso);
      // Al final se queda un momento mostrando el tiempo de inicio (muy poco en la instantánea)
      else window.setTimeout(terminar, duracion <= 1000 ? 150 : 900);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duracion]);

  const color = "#00e5ff";
  const nombre = "J.A.R.V.I.S.";
  const visibles = Math.floor(avance * SISTEMAS.length);

  return (
    <div
      onClick={terminar}
      title="Clic para saltar"
      className="fixed inset-0 z-[60] flex items-center justify-center cursor-pointer select-none transition-opacity duration-200"
      style={{
        opacity: saliendo ? 0 : 1,
        background: "radial-gradient(circle at 50% 45%, rgba(0,70,140,0.55), #02060d 70%), #02060d",
      }}
    >
      <div className="w-[min(560px,90vw)] flex flex-col items-center gap-5 font-hud-mono">
        {/* Anillo giratorio con el porcentaje */}
        <div className="relative w-40 h-40">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: "6s" }}>
            <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="1" />
            <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="2" strokeDasharray="40 250" strokeLinecap="round" />
            <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 6" />
          </svg>
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="30"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${avance * 188.5} 188.5`}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold" style={{ color }}>
            {Math.round(avance * 100)}%
          </div>
        </div>

        <div className="font-hud-display text-3xl font-bold tracking-[0.35em]" style={{ color, textShadow: `0 0 18px ${color}` }}>
          {nombre}
        </div>

        {/* Sistemas que se van encendiendo */}
        <div className="w-full text-[12px] leading-relaxed min-h-[11rem]">
          {SISTEMAS.slice(0, visibles).map((s) => (
            <div key={s} className="flex justify-between gap-3 text-[#b8d8ee]">
              <span>&gt; {s}</span>
              <span style={{ color }}>
                {s === "Conexión con Gemini" && listo && !listo.gemini ? "SIN CLAVE" : "EN LÍNEA"}
              </span>
            </div>
          ))}
        </div>

        <div className="w-full h-1 bg-white/10 overflow-hidden">
          <div className="h-full" style={{ width: `${avance * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>

        <div className="text-[12px] h-5" style={{ color }}>
          {avance >= 1 && listo
            ? `Sistemas en línea · tiempo de inicio ${listo.segundos} s${listo.version ? ` · v${listo.version}` : ""}`
            : "Inicializando sistemas..."}
        </div>
        <div className="text-[10px] text-white/30">Clic para saltar</div>
      </div>
    </div>
  );
}
