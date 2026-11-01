import React, { useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { ReactorState } from "../config";

interface ReactorCoreProps {
  estado: ReactorState;
  dictando: boolean;
  micVolume: number; // 0.0 a 1.0 (volumen real del micrófono vía Web Audio API)
  frequencyData: Uint8Array | null;
  onToggleDictado: () => void;
  onSimulateVoice: () => void;
}

const STATE_LABELS: Record<
  ReactorState,
  { title: string; subtitle: string; badgeColor: string }
> = {
  reposo: {
    title: "REPOSO",
    subtitle: "Esperando tus órdenes",
    badgeColor: "text-[#68a8d8] border-[#00e5ff]/30 bg-[#05152a]/80",
  },
  escuchando: {
    title: "ESCUCHANDO",
    subtitle: "Te estoy escuchando",
    badgeColor: "text-[#00f5a0] border-[#00f5a0]/60 bg-[#04241e]/85",
  },
  pensando: {
    title: "PENSANDO",
    subtitle: "Pensando la respuesta",
    badgeColor: "text-[#ff9933] border-[#ff9933]/60 bg-[#261505]/85",
  },
  hablando: {
    title: "HABLANDO",
    subtitle: "Respondiendo en voz alta",
    badgeColor: "text-[#00e5ff] border-[#00e5ff]/80 bg-[#052242]/90",
  },
};

export const ReactorCore: React.FC<ReactorCoreProps> = ({
  estado,
  dictando,
  micVolume,
  frequencyData,
  onToggleDictado,
  onSimulateVoice,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<ReactorState>(estado);
  const volumeRef = useRef<number>(micVolume);
  const freqRef = useRef<Uint8Array | null>(frequencyData);

  useEffect(() => {
    stateRef.current = estado;
  }, [estado]);

  useEffect(() => {
    volumeRef.current = micVolume;
  }, [micVolume]);

  useEffect(() => {
    freqRef.current = frequencyData;
  }, [frequencyData]);

  // "Portal de luz": un centro oscuro rodeado de miles de rayos de luz que salen hacia afuera (como un salto al
  // hiperespacio). Reacciona al estado: reposo = lento; escuchando = se agita con tu voz; pensando = rápido y girando;
  // hablando = el anillo late con la voz.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    interface Rayo {
      angulo: number;
      r: number; // distancia al centro, relativa al anillo (1 = borde del centro oscuro)
      velocidad: number;
      largo: number;
      grosor: number;
      brillo: number;
      color: number; // 0 = azul, 1 = blanco
    }
    const TOTAL = 1500;
    const nuevoRayo = (alInicio: boolean): Rayo => ({
      angulo: Math.random() * Math.PI * 2,
      r: alInicio ? 1 + Math.random() * 1.2 : 0.97 + Math.random() * 0.06,
      velocidad: 0.002 + Math.random() * 0.006,
      largo: 0.06 + Math.random() * 0.3,
      grosor: 0.4 + Math.random() * 1.3,
      brillo: 0.35 + Math.random() * 0.65,
      color: Math.random() < 0.42 ? 1 : 0,
    });
    const rayos: Rayo[] = Array.from({ length: TOTAL }, () => nuevoRayo(true));

    let animationFrameId: number;
    let fase = 0;
    let giro = 0;
    let volSuave = 0;

    const render = () => {
      const currentEstado = stateRef.current;
      volSuave += (volumeRef.current - volSuave) * 0.2;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const base = Math.min(width, height) * 0.25; // radio del centro oscuro
      const maxR = Math.min(width, height) * 0.5;

      // Cómo se mueve según el estado
      let velocidad = 1;
      let brillo = 0.75;
      let latido = 1;
      let giroVel = 0.0006;
      if (currentEstado === "reposo") {
        velocidad = 0.55;
        brillo = 0.62 + Math.sin(fase * 1.3) * 0.08;
        latido = 1 + Math.sin(fase * 1.1) * 0.012;
      } else if (currentEstado === "escuchando") {
        velocidad = 1.1 + volSuave * 4;
        brillo = 0.8 + Math.min(0.2, volSuave);
        latido = 1 + volSuave * 0.18;
        giroVel = 0.0015;
      } else if (currentEstado === "pensando") {
        velocidad = 3.2;
        brillo = 0.9 + Math.sin(fase * 6) * 0.1;
        latido = 0.94 + Math.sin(fase * 5) * 0.025;
        giroVel = 0.012;
      } else if (currentEstado === "hablando") {
        const onda = (Math.sin(fase * 7) * 0.5 + Math.sin(fase * 13) * 0.3 + Math.cos(fase * 19) * 0.2 + 1) * 0.5;
        velocidad = 1.6 + onda;
        brillo = 0.8 + onda * 0.2;
        latido = 1 + onda * 0.08;
        giroVel = 0.003;
      }
      fase += 0.035;
      giro += giroVel;

      // Borde del centro oscuro: un poco irregular y "vivo", como en la imagen
      const bordeEn = (a: number) =>
        base * latido * (1 + 0.022 * Math.sin(2 * a + fase * 0.5) + 0.016 * Math.sin(5 * a - fase * 0.45) + 0.01 * Math.sin(11 * a + fase));

      // Bruma azul de fondo
      const bruma = ctx.createRadialGradient(cx, cy, base * 0.8, cx, cy, maxR);
      bruma.addColorStop(0, `rgba(40,120,255,${0.32 * brillo})`);
      bruma.addColorStop(0.35, `rgba(20,70,180,${0.16 * brillo})`);
      bruma.addColorStop(1, "rgba(0,10,30,0)");
      ctx.fillStyle = bruma;
      ctx.fillRect(0, 0, width, height);

      // Rayos de luz (se suman entre sí para brillar más donde se juntan)
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const rayo of rayos) {
        rayo.r += rayo.velocidad * velocidad * (0.6 + rayo.r * 0.6);
        const a = rayo.angulo + giro;
        const borde = bordeEn(rayo.angulo);
        const r1 = borde * rayo.r;
        const r2 = r1 + base * rayo.largo * (0.7 + velocidad * 0.35) * rayo.r;
        if (r1 > maxR) {
          Object.assign(rayo, nuevoRayo(false));
          continue;
        }
        // Brillan más cerca del anillo y se desvanecen al alejarse
        const lejos = Math.min(1, Math.max(0, (r1 - borde) / (maxR - borde)));
        const alfa = Math.min(1, rayo.brillo * brillo * 1.25 * (1 - lejos) ** 1.4 * Math.min(1, (rayo.r - 0.96) * 12));
        if (alfa <= 0.01) continue;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ctx.strokeStyle = rayo.color ? `rgba(230,242,255,${alfa})` : `rgba(100,175,255,${alfa})`;
        ctx.lineWidth = rayo.grosor * (1 - lejos * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx + cos * r1, cy + sin * r1);
        ctx.lineTo(cx + cos * Math.min(r2, maxR), cy + sin * Math.min(r2, maxR));
        ctx.stroke();
      }

      // Resplandor suave pegado al borde (sin línea marcada, como en la imagen)
      const resplandor = ctx.createRadialGradient(cx, cy, base * latido * 0.92, cx, cy, base * latido * 1.45);
      resplandor.addColorStop(0, "rgba(120,180,255,0)");
      resplandor.addColorStop(0.18, `rgba(150,200,255,${0.38 * brillo})`);
      resplandor.addColorStop(0.5, `rgba(60,130,255,${0.14 * brillo})`);
      resplandor.addColorStop(1, "rgba(20,60,160,0)");
      ctx.fillStyle = resplandor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      // Centro oscuro (con un leve degradado hacia el borde)
      const centro = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * latido * 1.05);
      centro.addColorStop(0, "#01030a");
      centro.addColorStop(0.86, "#020611");
      centro.addColorStop(1, "rgba(2,8,20,0.6)");
      ctx.fillStyle = centro;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const r = bordeEn(a) * 0.99;
        const x = cx + Math.cos(a + giro) * r;
        const y = cy + Math.sin(a + giro) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const currentMeta = STATE_LABELS[estado];
  const dbValue =
    micVolume > 0.001
      ? Math.max(-60, Math.round(20 * Math.log10(micVolume)))
      : -60;

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full select-none">
      {/* Contenedor del portal de luz */}
      <div className="relative w-[330px] h-[330px] sm:w-[410px] sm:h-[410px] xl:w-[470px] xl:h-[470px] flex items-center justify-center">
        {/* Lienzo con el portal de luz */}
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Indicador central de estado superpuesto */}
        <div className="absolute pointer-events-none flex flex-col items-center justify-center text-center">
          <span className="font-hud-mono text-[10px] tracking-[0.28em] text-[#b8f4ff]/80">
            A.R.E.S.
          </span>
          <span className="font-hud-display text-xs sm:text-sm font-bold tracking-[0.22em] text-[#e2f8ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] mt-0.5">
            {currentMeta.title}
          </span>
          {estado === "escuchando" && (
            <span className="font-hud-mono text-[10px] text-[#00f5a0] mt-1">
              {Math.round(micVolume * 100)}% ({dbValue} dB)
            </span>
          )}
        </div>
      </div>

      {/* Botones principales: hablar con Jarvis y probar su voz */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 z-10 px-2">
        <button
          type="button"
          onClick={onToggleDictado}
          className={`px-5 py-2 rounded-full text-xs font-hud-mono font-semibold uppercase tracking-wider border transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            dictando
              ? "bg-[#00f5a0]/15 border-[#00f5a0]/70 text-[#00f5a0]"
              : "bg-[#00e5ff]/10 border-[#00e5ff]/50 text-[#e2f8ff] hover:bg-[#00e5ff]/20"
          }`}
          title="Háblale a Ares con tu voz"
        >
          {dictando ? (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>Te escucho… (clic para cancelar)</span>
            </>
          ) : (
            <>
              <MicOff className="w-3.5 h-3.5" />
              <span>Hablar con Ares</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSimulateVoice}
          className="px-3 py-2 rounded-full text-xs font-hud-mono text-[#68a8d8] hover:text-[#e2f8ff] hover:bg-[#00e5ff]/10 transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
          title="Probar respuesta hablada de Ares"
        >
          Probar voz
        </button>
      </div>
    </div>
  );
};
