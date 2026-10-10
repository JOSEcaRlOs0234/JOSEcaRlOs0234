import React from "react";
import { Copy, Eraser, PenLine, X } from "lucide-react";

export interface PizarraDatos {
  titulo: string;
  contenido: string;
  actualizada: number;
}

interface Props {
  pizarra: PizarraDatos;
  onCerrar: () => void;
  onBorrar: () => void;
  onCopiar: () => void;
}

/** Convierte **negritas** en texto resaltado (sin usar HTML, para que sea seguro). */
function conNegritas(texto: string): React.ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
      <strong key={i} className="text-[#00f5a0]">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{parte}</React.Fragment>
    )
  );
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

/** La pizarra de Jarvis: aparece sobre el reactor cuando Jarvis escribe algo. */
export const PizarraPanel: React.FC<Props> = ({ pizarra, onCerrar, onBorrar, onCopiar }) => (
  <div className="absolute inset-2 z-30 flex flex-col bg-[#020c18]/95 border-2 border-[#00e5ff]/70 shadow-[0_0_32px_rgba(0,229,255,0.3)]">
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#00e5ff]/30">
      <div className="flex items-center gap-2 min-w-0 text-[#00e5ff]">
        <PenLine className="w-4 h-4 shrink-0" />
        <span className="font-hud-display text-sm font-bold tracking-widest uppercase truncate">
          {pizarra.titulo || "Pizarra"}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0 font-hud-mono text-[11px]">
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
    <div className="flex-1 overflow-y-auto px-6 py-4 text-[15px] leading-relaxed text-[#e2f8ff] select-text">
      {pizarra.contenido ? (
        <Contenido texto={pizarra.contenido} />
      ) : (
        <p className="text-[#68a8d8] font-hud-mono text-sm">
          La pizarra está vacía. Pídele a Jarvis: &ldquo;escribe en la pizarra...&rdquo;
        </p>
      )}
    </div>
  </div>
);
