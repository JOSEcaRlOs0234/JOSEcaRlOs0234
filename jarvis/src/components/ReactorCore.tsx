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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let angleOuter = 0;
    let angleMid = 0;
    let angleInner = 0;
    let sequenceStep = 0;
    let phase = 0;

    const render = () => {
      const currentEstado = stateRef.current;
      const rawVol = volumeRef.current;
      const freqs = freqRef.current;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) * 0.44;

      // Velocidades y brillo según el estado actual
      let speedMultiplier = 1;
      let glowAlpha = 0.45;
      let pulseScale = 1;

      if (currentEstado === "reposo") {
        speedMultiplier = 0.45;
        glowAlpha = 0.35 + Math.sin(phase * 1.4) * 0.08;
        pulseScale = 1 + Math.sin(phase * 1.2) * 0.008;
      } else if (currentEstado === "escuchando") {
        speedMultiplier = 1.1 + rawVol * 2.2;
        glowAlpha = 0.55 + Math.min(0.45, rawVol * 0.9);
        pulseScale = 1 + rawVol * 0.14;
      } else if (currentEstado === "pensando") {
        speedMultiplier = 4.2;
        glowAlpha = 0.78 + Math.sin(phase * 6) * 0.15;
        pulseScale = 1 + Math.sin(phase * 5) * 0.02;
      } else if (currentEstado === "hablando") {
        const voiceWave =
          (Math.sin(phase * 7) * 0.5 +
            Math.sin(phase * 13) * 0.3 +
            Math.cos(phase * 19) * 0.2 +
            1) *
          0.5;
        speedMultiplier = 1.65;
        glowAlpha = 0.65 + voiceWave * 0.3;
        pulseScale = 1 + voiceWave * 0.065;
      }

      phase += 0.035;
      angleOuter += 0.0035 * speedMultiplier;
      angleMid -= 0.006 * speedMultiplier;
      angleInner += 0.009 * speedMultiplier;
      sequenceStep = (sequenceStep + 0.32 * speedMultiplier) % 48;

      // 1. Resplandor radial de fondo del reactor
      const bgGrad = ctx.createRadialGradient(
        cx,
        cy,
        maxR * 0.08,
        cx,
        cy,
        maxR * 1.18
      );
      bgGrad.addColorStop(0, `rgba(0, 229, 255, ${0.28 * glowAlpha})`);
      bgGrad.addColorStop(0.45, `rgba(0, 128, 255, ${0.18 * glowAlpha})`);
      bgGrad.addColorStop(0.78, `rgba(0, 80, 200, ${0.08 * glowAlpha})`);
      bgGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 1.18, 0, Math.PI * 2);
      ctx.fill();

      // 2. Anillo exterior de contención con brillo neón intenso
      const outerR = maxR * 0.96 * pulseScale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleOuter * 0.5);

      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 18 * glowAlpha;
      ctx.strokeStyle = `rgba(0, 229, 255, ${0.45 + glowAlpha * 0.45})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Arcos brillantes segmentados en el borde exterior
      ctx.strokeStyle = "#b8f4ff";
      ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        const start = i * (Math.PI / 2) + 0.18;
        ctx.beginPath();
        ctx.arc(0, 0, outerR, start, start + 0.55);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Anillo de 48 segmentos rectangulares (inspirado en la imagen de referencia)
      const segRingR = maxR * 0.85 * pulseScale;
      const totalSegments = 48;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleOuter);

      for (let i = 0; i < totalSegments; i++) {
        const segAngle = (i / totalSegments) * Math.PI * 2;
        ctx.save();
        ctx.rotate(segAngle);

        // En modo "pensando", los segmentos se encienden en secuencia rápida
        const distFromHead =
          (i - Math.floor(sequenceStep) + totalSegments) % totalSegments;

        // En modo "escuchando", los segmentos reaccionan al espectro real del micrófono
        let freqBoost = 0;
        if (currentEstado === "escuchando" && freqs && freqs.length > 0) {
          const binIndex = i % Math.min(freqs.length, 48);
          freqBoost = freqs[binIndex] / 255;
        }

        let segAlpha = 0.35;
        let isWarmSegment = i % 5 === 0 || i % 7 === 0;

        if (currentEstado === "pensando") {
          if (distFromHead < 10) {
            segAlpha = 1 - distFromHead * 0.08;
            isWarmSegment = distFromHead < 4;
          } else {
            segAlpha = 0.16;
          }
        } else if (currentEstado === "escuchando") {
          segAlpha = 0.28 + Math.min(0.72, rawVol * 1.4 + freqBoost * 0.8);
        } else if (currentEstado === "hablando") {
          const wave = Math.sin(phase * 8 + i * 0.45) * 0.5 + 0.5;
          segAlpha = 0.3 + wave * 0.65;
        } else {
          // reposo
          segAlpha = 0.25 + Math.sin(phase + i * 0.3) * 0.12;
        }

        const segHeight =
          currentEstado === "escuchando"
            ? 10 + freqBoost * 12 + rawVol * 8
            : 11;

        if (isWarmSegment) {
          ctx.fillStyle = `rgba(255, 168, 185, ${segAlpha * 0.92})`;
          ctx.shadowColor = "rgba(255, 130, 160, 0.8)";
        } else {
          ctx.fillStyle = `rgba(180, 244, 255, ${segAlpha})`;
          ctx.shadowColor = "rgba(0, 229, 255, 0.85)";
        }
        ctx.shadowBlur = segAlpha > 0.6 ? 12 : 4;

        ctx.fillRect(segRingR - segHeight / 2, -3.2, segHeight, 6.4);
        ctx.restore();
      }
      ctx.restore();

      // 4. Escala graduada de precisión (ticks de 360 grados)
      const tickRingR = maxR * 0.75;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleMid * 0.4);
      for (let deg = 0; deg < 360; deg += 3) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const isMid = deg % 15 === 0;
        const len = isMajor ? 10 : isMid ? 6 : 3;
        ctx.strokeStyle = isMajor
          ? `rgba(184, 244, 255, ${0.75 * glowAlpha})`
          : `rgba(0, 195, 255, ${0.38 * glowAlpha})`;
        ctx.lineWidth = isMajor ? 1.6 : 0.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rad) * tickRingR, Math.sin(rad) * tickRingR);
        ctx.lineTo(
          Math.cos(rad) * (tickRingR - len),
          Math.sin(rad) * (tickRingR - len)
        );
        ctx.stroke();
      }
      ctx.restore();

      // 5. Anillo mecánico intermedio con sectores discontinuos
      const midR = maxR * 0.63 * (1 + (pulseScale - 1) * 0.6);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleMid);
      ctx.strokeStyle = `rgba(0, 195, 255, ${0.4 + glowAlpha * 0.4})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([26, 12, 8, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, midR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bloques de anclaje internos
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.65 * glowAlpha})`;
        ctx.lineWidth = 4;
        ctx.arc(0, 0, midR - 8, a, a + 0.24);
        ctx.stroke();
      }
      ctx.restore();

      // 6. Núcleo interior brillante triple (como el centro luminoso de la imagen)
      const coreBaseR = maxR * 0.43 * pulseScale;
      ctx.save();
      ctx.translate(cx, cy);

      // Triple anillo cian/blanco de alta energía
      const coreRings = [1.0, 0.91, 0.82];
      coreRings.forEach((factor, idx) => {
        const r = coreBaseR * factor;
        ctx.save();
        ctx.rotate(idx % 2 === 0 ? angleInner : -angleInner * 1.2);
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = idx === 0 ? 24 : 14;
        ctx.strokeStyle =
          idx === 1
            ? `rgba(220, 250, 255, ${0.85 * glowAlpha + 0.15})`
            : `rgba(0, 229, 255, ${0.75 * glowAlpha + 0.15})`;
        ctx.lineWidth = idx === 1 ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // 7. Visualización específica en el centro según el estado
      if (currentEstado === "hablando") {
        // Ondas que se mueven al ritmo de la voz (radial + oscilador central)
        ctx.save();
        const waveRadius = coreBaseR * 0.66;
        for (let w = 0; w < 3; w++) {
          ctx.beginPath();
          ctx.strokeStyle =
            w === 0
              ? "rgba(184, 244, 255, 0.95)"
              : w === 1
              ? "rgba(0, 229, 255, 0.7)"
              : "rgba(0, 136, 255, 0.5)";
          ctx.lineWidth = w === 0 ? 2.4 : 1.5;

          const points = 96;
          for (let p = 0; p <= points; p++) {
            const theta = (p / points) * Math.PI * 2;
            const mod =
              Math.sin(theta * 6 + phase * 9 + w) * 8 +
              Math.cos(theta * 10 - phase * 14) * 5;
            const rr = waveRadius * (0.72 + w * 0.1) + mod;
            const x = Math.cos(theta) * rr;
            const y = Math.sin(theta) * rr;
            if (p === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }

        // Onda sinusoidal horizontal dentro del núcleo
        const span = coreBaseR * 0.52;
        ctx.beginPath();
        ctx.strokeStyle = "#e2f8ff";
        ctx.lineWidth = 2;
        for (let x = -span; x <= span; x += 3) {
          const norm = 1 - Math.pow(x / span, 2);
          const y =
            Math.sin(x * 0.14 + phase * 15) *
            Math.cos(x * 0.05 - phase * 9) *
            22 *
            norm;
          if (x === -span) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      } else if (currentEstado === "escuchando") {
        // Anillos de presión acústica que pulsan con el micrófono real
        const numPulses = 3;
        for (let p = 0; p < numPulses; p++) {
          const r =
            coreBaseR * (0.28 + p * 0.18) * (1 + rawVol * (0.45 + p * 0.15));
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 245, 160, ${0.35 + rawVol * 0.6})`;
          ctx.lineWidth = 1.8 + rawVol * 3;
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (currentEstado === "pensando") {
        // Barrido radar de procesamiento cuántico
        ctx.save();
        ctx.rotate(phase * 3.5);
        const sweepGrad = ctx.createConicGradient(0, 0, 0);
        sweepGrad.addColorStop(0, "rgba(255, 153, 51, 0.45)");
        sweepGrad.addColorStop(0.25, "rgba(0, 229, 255, 0.15)");
        sweepGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = sweepGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coreBaseR * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Retícula técnica central
      ctx.strokeStyle = "rgba(184, 244, 255, 0.32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, coreBaseR * 0.22, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      ctx.restore();

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
      {/* Contenedor del Reactor (SVG de precisión + Canvas animado) */}
      <div className="relative w-[330px] h-[330px] sm:w-[410px] sm:h-[410px] xl:w-[470px] xl:h-[470px] flex items-center justify-center">
        {/* SVG Overlay: corchetes laterales, marcas de calibre y etiquetas MK 6 / A005 como en la imagen */}
        <svg
          viewBox="0 0 600 600"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <filter id="hudGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Arco guía izquierdo con acento ámbar y cian */}
          <path
            d="M 92 175 A 245 245 0 0 0 92 425"
            fill="none"
            stroke="rgba(0, 229, 255, 0.55)"
            strokeWidth="1.8"
            filter="url(#hudGlow)"
          />
          <path
            d="M 112 135 L 145 102"
            stroke="rgba(255, 153, 51, 0.75)"
            strokeWidth="1.5"
          />
          <path
            d="M 78 445 L 118 485 L 175 485"
            fill="none"
            stroke="rgba(255, 153, 51, 0.65)"
            strokeWidth="1.4"
          />

          {/* Arco guía derecho discontinuo */}
          <path
            d="M 508 175 A 245 245 0 0 1 508 425"
            fill="none"
            stroke="rgba(0, 229, 255, 0.45)"
            strokeWidth="1.5"
            strokeDasharray="8 6"
          />

          {/* Anclajes laterales tipo mordaza (3h y 9h) */}
          <rect
            x="46"
            y="272"
            width="14"
            height="56"
            rx="2"
            fill="none"
            stroke="#b8f4ff"
            strokeWidth="2"
            filter="url(#hudGlow)"
          />
          <rect
            x="540"
            y="272"
            width="14"
            height="56"
            rx="2"
            fill="none"
            stroke="#b8f4ff"
            strokeWidth="2"
            filter="url(#hudGlow)"
          />

          {/* Etiquetas técnicas internas inspiradas en la imagen */}
          <text
            x="162"
            y="314"
            fill="#b8f4ff"
            fontSize="13"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
            opacity="0.85"
          >
            MK 6
          </text>
          <text
            x="154"
            y="330"
            fill="#00e5ff"
            fontSize="8"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="1"
            opacity="0.65"
          >
            SYS.CORE // 04
          </text>

          <text
            x="404"
            y="314"
            fill="#b8f4ff"
            fontSize="13"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
            opacity="0.85"
          >
            A005
          </text>
          <text
            x="398"
            y="330"
            fill="#00e5ff"
            fontSize="8"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="1"
            opacity="0.65"
          >
            SYNC.NOMINAL
          </text>

          {/* Telemetría inferior del anillo */}
          <text
            x="248"
            y="574"
            fill="#00e5ff"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="2"
            opacity="0.8"
          >
            00 381 —— 2.16
          </text>
          <text
            x="88"
            y="438"
            fill="#00e5ff"
            fontSize="12"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
            opacity="0.85"
          >
            38
          </text>
        </svg>

        {/* Lienzo Canvas para las rotaciones, ondas de voz y pulso de micrófono */}
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Indicador central de estado superpuesto */}
        <div className="absolute pointer-events-none flex flex-col items-center justify-center text-center">
          <span className="font-hud-mono text-[10px] tracking-[0.28em] text-[#b8f4ff]/80">
            J.A.R.V.I.S.
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

      {/* Etiqueta de estado actual y subtítulo técnico */}
      <div className="mt-1 flex flex-col items-center gap-1 z-10">
        <div
          className={`px-3 py-0.5 border text-[11px] font-hud-mono tracking-widest uppercase ${currentMeta.badgeColor}`}
        >
          ESTADO ACTIVO: {currentMeta.title}
        </div>
        <p className="text-[11px] text-[#68a8d8] font-hud-mono">
          {currentMeta.subtitle}
        </p>
      </div>

      {/* Botones principales: hablar con Jarvis y probar su voz */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 z-10 px-2">
        <button
          type="button"
          onClick={onToggleDictado}
          className={`px-5 py-2 text-xs font-hud-mono font-bold uppercase tracking-wider border transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            dictando
              ? "bg-[#00f5a0]/25 border-[#00f5a0] text-[#00f5a0] shadow-[0_0_16px_rgba(0,245,160,0.45)]"
              : "bg-[#00e5ff]/20 border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/35 shadow-[0_0_14px_rgba(0,229,255,0.35)]"
          }`}
          title="Háblale a Jarvis con tu voz"
        >
          {dictando ? (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>Te escucho… (clic para cancelar)</span>
            </>
          ) : (
            <>
              <MicOff className="w-3.5 h-3.5" />
              <span>Hablar con Jarvis</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSimulateVoice}
          className="px-3 py-2 text-xs font-hud-mono border bg-[#051329]/75 border-[#00e5ff]/30 text-[#68a8d8] hover:border-[#00e5ff]/70 hover:text-[#e2f8ff] transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
          title="Probar respuesta hablada de Jarvis"
        >
          Probar voz
        </button>
      </div>
    </div>
  );
};
