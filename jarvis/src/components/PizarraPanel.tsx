import React, { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Copy, Eraser, Image as ImageIcon, PenLine, Save, Trash2, Undo2, X } from "lucide-react";

export interface PizarraDatos {
  titulo: string;
  contenido: string;
  actualizada: number;
  // Dibujo de Jarvis (SVG ya limpiado por el servidor)
  dibujo?: string;
}

interface Props {
  pizarra: PizarraDatos;
  onCerrar: () => void;
  onBorrar: () => void;
  onCopiar: () => void;
  /** Guarda un dibujo hecho a mano (PNG en formato data URL). Devuelve un texto de dónde quedó. */
  onGuardarDibujo: (png: string) => Promise<void>;
}

const enlaceSvg = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Convierte **negritas** y [enlaces](https://...) en texto resaltado (sin usar HTML, para que sea seguro). */
function conNegritas(texto: string): React.ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return (
        <strong key={i} className="text-[#00f5a0]">
          {parte.slice(2, -2)}
        </strong>
      );
    }
    const enlace = parte.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (enlace) {
      return (
        <a
          key={i}
          href={enlace[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00e5ff] underline hover:text-[#e2f8ff]"
          title={enlace[2]}
        >
          {enlace[1]}
        </a>
      );
    }
    return <React.Fragment key={i}>{parte}</React.Fragment>;
  });
}

/** Dibuja el contenido: títulos (#), viñetas (- o *), pasos (1.) y párrafos. */
function Contenido({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("\n").map((linea, i) => {
        const l = linea.trimEnd();
        if (!l.trim()) return <div key={i} className="h-3" />;
        const titulo = l.match(/^(#{1,3})\s+(.*)$/);
        if (titulo) {
          const tam = titulo[1].length === 1 ? "text-2xl" : titulo[1].length === 2 ? "text-xl" : "text-lg";
          return (
            <div key={i} className={`${tam} font-bold text-[#00e5ff] mt-2 mb-1`}>
              {conNegritas(titulo[2])}
            </div>
          );
        }
        const vineta = l.match(/^\s*[-*•]\s+(.*)$/);
        if (vineta) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-[#00e5ff]">•</span>
              <span>{conNegritas(vineta[1])}</span>
            </div>
          );
        }
        const paso = l.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (paso) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-[#00e5ff] font-bold min-w-[1.5em] text-right">{paso[1]}.</span>
              <span>{conNegritas(paso[2])}</span>
            </div>
          );
        }
        return <p key={i}>{conNegritas(l)}</p>;
      })}
    </>
  );
}

// ------------------------------------------------------------------ dibujo a mano

const ANCHO = 1600;
const ALTO = 1000;
const FONDO = "#041226";
const COLORES = ["#e2f8ff", "#00e5ff", "#00f5a0", "#ffd84d", "#ff9933", "#ff3355", "#c084fc"];
const GROSORES = [
  { nombre: "Fino", px: 3 },
  { nombre: "Medio", px: 7 },
  { nombre: "Grueso", px: 16 },
];

// Lo que llevas dibujado se conserva aunque cierres la pizarra (mientras la ventana siga abierta)
let dibujoGuardadoEnMemoria: string | null = null;

function Lienzo({ fondoSvg, onGuardar }: { fondoSvg?: string; onGuardar: (png: string) => Promise<void> }) {
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const trazandoRef = useRef<{ x: number; y: number } | null>(null);
  const historialRef = useRef<ImageData[]>([]);
  const [color, setColor] = useState(COLORES[1]);
  const [grosor, setGrosor] = useState(GROSORES[1].px);
  const [borrador, setBorrador] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const ctx = () => lienzoRef.current?.getContext("2d") ?? null;

  const recordarDibujo = () => {
    try {
      dibujoGuardadoEnMemoria = lienzoRef.current?.toDataURL("image/png") ?? null;
    } catch {
      dibujoGuardadoEnMemoria = null;
    }
  };

  const pintarFondo = useCallback(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = FONDO;
    c.fillRect(0, 0, ANCHO, ALTO);
  }, []);

  // Al abrir: recuperar lo que llevabas dibujado
  useEffect(() => {
    pintarFondo();
    if (dibujoGuardadoEnMemoria) {
      const img = new Image();
      img.onload = () => ctx()?.drawImage(img, 0, 0, ANCHO, ALTO);
      img.src = dibujoGuardadoEnMemoria;
    }
  }, [pintarFondo]);

  const guardarPaso = () => {
    const c = ctx();
    if (!c) return;
    historialRef.current.push(c.getImageData(0, 0, ANCHO, ALTO));
    if (historialRef.current.length > 25) historialRef.current.shift();
  };

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ANCHO, y: ((e.clientY - r.top) / r.height) * ALTO };
  };

  const trazo = (desde: { x: number; y: number }, hasta: { x: number; y: number }) => {
    const c = ctx();
    if (!c) return;
    c.strokeStyle = borrador ? FONDO : color;
    c.lineWidth = borrador ? grosor * 3 : grosor;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(desde.x, desde.y);
    c.lineTo(hasta.x, hasta.y);
    c.stroke();
  };

  const alBajar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    guardarPaso();
    const p = punto(e);
    trazandoRef.current = p;
    trazo(p, { x: p.x + 0.01, y: p.y });
  };

  const alMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!trazandoRef.current) return;
    const p = punto(e);
    trazo(trazandoRef.current, p);
    trazandoRef.current = p;
  };

  const alSoltar = () => {
    if (!trazandoRef.current) return;
    trazandoRef.current = null;
    recordarDibujo();
  };

  const deshacer = () => {
    const anterior = historialRef.current.pop();
    if (anterior) {
      ctx()?.putImageData(anterior, 0, 0);
      recordarDibujo();
    }
  };

  const limpiar = () => {
    guardarPaso();
    pintarFondo();
    dibujoGuardadoEnMemoria = null;
  };

  const usarDibujoDeJarvis = () => {
    if (!fondoSvg) return;
    const img = new Image();
    img.onload = () => {
      guardarPaso();
      pintarFondo();
      // El dibujo de Jarvis es de 800×600: se centra sin deformarlo
      const escala = Math.min(ANCHO / (img.width || 800), ALTO / (img.height || 600));
      const w = (img.width || 800) * escala;
      const h = (img.height || 600) * escala;
      ctx()?.drawImage(img, (ANCHO - w) / 2, (ALTO - h) / 2, w, h);
      recordarDibujo();
    };
    img.src = enlaceSvg(fondoSvg);
  };

  const guardar = async () => {
    let png = "";
    try {
      png = lienzoRef.current?.toDataURL("image/png") ?? "";
    } catch {
      png = "";
    }
    if (!png) return;
    setGuardando(true);
    try {
      await onGuardar(png);
    } finally {
      setGuardando(false);
    }
  };

  const boton =
    "px-2 py-1 border border-[#00e5ff]/40 text-[#b8f4ff] hover:bg-[#00e5ff]/15 cursor-pointer flex items-center gap-1 disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 font-hud-mono text-[11px]">
        {COLORES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setBorrador(false);
            }}
            className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
              !borrador && color === c ? "border-white scale-110" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
            title="Color"
            aria-label={`Color ${c}`}
          />
        ))}
        <span className="w-px h-5 bg-[#00e5ff]/30 mx-1" />
        {GROSORES.map((g) => (
          <button
            key={g.px}
            type="button"
            onClick={() => setGrosor(g.px)}
            className={`${boton} ${grosor === g.px ? "bg-[#00e5ff]/25 border-[#00e5ff]" : ""}`}
          >
            {g.nombre}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBorrador((b) => !b)}
          className={`${boton} ${borrador ? "bg-[#ff9933]/25 border-[#ff9933] text-[#ff9933]" : ""}`}
          title="Borrador"
        >
          <Eraser className="w-3.5 h-3.5" /> Borrador
        </button>
        <button type="button" onClick={deshacer} className={boton} title="Deshacer el último trazo">
          <Undo2 className="w-3.5 h-3.5" /> Deshacer
        </button>
        <button type="button" onClick={limpiar} className={boton} title="Dejar el lienzo en blanco">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar
        </button>
        {fondoSvg && (
          <button type="button" onClick={usarDibujoDeJarvis} className={boton} title="Pintar encima del dibujo de Jarvis">
            <ImageIcon className="w-3.5 h-3.5" /> Usar dibujo de Jarvis
          </button>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="px-2 py-1 border border-[#00f5a0] text-[#00f5a0] bg-[#00f5a0]/10 hover:bg-[#00f5a0]/25 cursor-pointer flex items-center gap-1 disabled:opacity-40"
          title="Guardar como imagen en Documentos\Jarvis\Dibujos"
        >
          <Save className="w-3.5 h-3.5" /> {guardando ? "Guardando..." : "Guardar imagen"}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <canvas
          ref={lienzoRef}
          width={ANCHO}
          height={ALTO}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onPointerLeave={alSoltar}
          className="max-w-full max-h-full border border-[#00e5ff]/40 cursor-crosshair"
          style={{ aspectRatio: `${ANCHO} / ${ALTO}`, touchAction: "none" }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ panel

/** La pizarra de Jarvis: aparece sobre el reactor cuando Jarvis escribe o dibuja algo. También puedes dibujar tú. */
export const PizarraPanel: React.FC<Props> = ({ pizarra, onCerrar, onBorrar, onCopiar, onGuardarDibujo }) => {
  const [aMano, setAMano] = useState(false);
  const [grande, setGrande] = useState(false);
  const vacia = !pizarra.contenido && !pizarra.dibujo;

  return (
    <div className="absolute inset-2 z-30 flex flex-col bg-[#020c18]/95 border-2 border-[#00e5ff]/70 shadow-[0_0_32px_rgba(0,229,255,0.3)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#00e5ff]/30">
        <div className="flex items-center gap-2 min-w-0 text-[#00e5ff]">
          <PenLine className="w-4 h-4 shrink-0" />
          <span className="font-hud-display text-sm font-bold tracking-widest uppercase truncate">
            {aMano ? "Dibujo a mano" : pizarra.titulo || "Pizarra"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 font-hud-mono text-[11px]">
          <button
            type="button"
            onClick={() => setAMano((v) => !v)}
            className={`px-2 py-1 border cursor-pointer flex items-center gap-1 ${
              aMano
                ? "border-[#00f5a0] text-[#00f5a0] bg-[#00f5a0]/10 hover:bg-[#00f5a0]/20"
                : "border-[#00e5ff]/40 text-[#b8f4ff] hover:bg-[#00e5ff]/15"
            }`}
            title={aMano ? "Volver a lo que escribió Jarvis" : "Dibujar tú con el ratón o el dedo"}
          >
            <Brush className="w-3.5 h-3.5" /> {aMano ? "Ver pizarra" : "Dibujar yo"}
          </button>
          {!aMano && (
            <>
              <button
                type="button"
                onClick={onCopiar}
                className="px-2 py-1 border border-[#00e5ff]/40 text-[#b8f4ff] hover:bg-[#00e5ff]/15 cursor-pointer flex items-center gap-1"
                title="Copiar el texto"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar
              </button>
              <button
                type="button"
                onClick={onBorrar}
                className="px-2 py-1 border border-[#ff9933]/50 text-[#ff9933] hover:bg-[#ff9933]/15 cursor-pointer flex items-center gap-1"
                title="Borrar la pizarra"
              >
                <Eraser className="w-3.5 h-3.5" /> Borrar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer"
            title="Cerrar (no se borra)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {grande && pizarra.dibujo && (
        // Dibujo en pantalla completa; clic en cualquier parte para cerrarlo
        <div
          className="fixed inset-0 z-50 bg-[#020c18]/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setGrande(false)}
          title="Clic para cerrar"
        >
          <img
            src={enlaceSvg(pizarra.dibujo)}
            alt={pizarra.titulo || "Dibujo de Jarvis"}
            className="w-full h-full object-contain"
          />
        </div>
      )}
      {aMano ? (
        <div className="flex-1 min-h-0 p-3">
          <Lienzo fondoSvg={pizarra.dibujo} onGuardar={onGuardarDibujo} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4 text-[15px] leading-relaxed text-[#e2f8ff] select-text">
          {pizarra.dibujo && (
            <img
              src={enlaceSvg(pizarra.dibujo)}
              alt={pizarra.titulo || "Dibujo de Jarvis"}
              onClick={() => setGrande(true)}
              title="Clic para verlo en grande"
              className="w-full max-h-[70vh] object-contain mb-3 border border-[#00e5ff]/20 cursor-zoom-in"
            />
          )}
          {pizarra.contenido && <Contenido texto={pizarra.contenido} />}
          {vacia && (
            <p className="text-[#68a8d8] font-hud-mono text-sm">
              La pizarra está vacía. Pídele a Jarvis: &ldquo;escribe en la pizarra...&rdquo;, &ldquo;dibújame un
              diagrama de...&rdquo; o &ldquo;investiga a fondo sobre...&rdquo;. También puedes dibujar tú con &ldquo;Dibujar
              yo&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
