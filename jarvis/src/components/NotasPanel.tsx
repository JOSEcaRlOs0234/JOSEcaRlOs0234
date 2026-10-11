import React, { useState } from "react";
import { Copy, Plus, Search, StickyNote, X } from "lucide-react";

export interface Nota {
  id: string;
  titulo: string;
  texto: string;
  fecha: string;
}

interface Props {
  notas: Nota[];
  onCerrar: () => void;
  onAgregar: (texto: string, titulo: string) => Promise<void>;
  onBorrar: (nota: Nota) => void;
  onCopiar: (nota: Nota) => void;
}

const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Las notas de Jarvis: aparecen sobre el reactor cuando Jarvis anota algo. */
export const NotasPanel: React.FC<Props> = ({ notas, onCerrar, onAgregar, onBorrar, onCopiar }) => {
  const [buscar, setBuscar] = useState("");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);

  const filtro = sinAcentos(buscar.trim());
  const visibles = filtro ? notas.filter((n) => sinAcentos(`${n.titulo} ${n.texto}`).includes(filtro)) : notas;

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    await onAgregar(texto, titulo);
    setTexto("");
    setTitulo("");
    setEscribiendo(false);
  };

  return (
    <div className="absolute inset-2 z-30 flex flex-col bg-[#020c18]/95 border-2 border-[#00f5a0]/60 shadow-[0_0_32px_rgba(0,245,160,0.25)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#00f5a0]/30">
        <div className="flex items-center gap-2 text-[#00f5a0]">
          <StickyNote className="w-4 h-4 shrink-0" />
          <span className="font-hud-display text-sm font-bold tracking-widest uppercase">Notas</span>
          <span className="font-hud-mono text-[10px] text-[#68a8d8]">{notas.length}</span>
        </div>
        <div className="flex items-center gap-1 font-hud-mono text-[11px]">
          <button
            type="button"
            onClick={() => setEscribiendo((v) => !v)}
            className="px-2 py-1 border border-[#00f5a0]/60 text-[#00f5a0] hover:bg-[#00f5a0]/15 cursor-pointer flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva nota
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {escribiendo && (
        <form onSubmit={agregar} className="flex flex-col gap-1.5 px-4 py-3 border-b border-[#00f5a0]/20">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={100}
            placeholder="Título (opcional)"
            className="bg-[#05162e] border border-[#00f5a0]/40 px-2 py-1 text-[13px] text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00f5a0]"
          />
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={5000}
            rows={4}
            autoFocus
            placeholder="Escribe tu nota..."
            className="bg-[#05162e] border border-[#00f5a0]/40 px-2 py-1 text-[13px] text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00f5a0] resize-y"
          />
          <button
            type="submit"
            disabled={!texto.trim()}
            className="self-end px-3 py-1 text-[12px] font-hud-mono bg-[#00f5a0]/15 border border-[#00f5a0] text-[#e2f8ff] cursor-pointer disabled:opacity-40"
          >
            Guardar nota
          </button>
        </form>
      )}

      {notas.length > 3 && (
        <div className="px-4 pt-3 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-[#68a8d8]" />
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar en las notas..."
            className="flex-1 bg-[#05162e] border border-[#00e5ff]/30 px-2 py-1 text-[12px] font-hud-mono text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {notas.length === 0 ? (
          <p className="text-[#68a8d8] font-hud-mono text-sm">
            Aún no hay notas. Dile a Jarvis: &ldquo;anota que mañana tengo junta a las 10&rdquo; o usa &ldquo;Nueva
            nota&rdquo;.
          </p>
        ) : visibles.length === 0 ? (
          <p className="text-[#68a8d8] font-hud-mono text-sm">Ninguna nota coincide.</p>
        ) : (
          visibles.map((n) => (
            <div key={n.id} className="bg-[#041226]/80 border border-[#00f5a0]/25 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-[#00f5a0] break-words">{n.titulo}</div>
                  <div className="text-[10px] font-hud-mono text-[#68a8d8]">{n.fecha}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCopiar(n)}
                    className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer"
                    title="Copiar la nota"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onBorrar(n)}
                    className="p-1 text-[#ff9933] hover:text-[#ff3355] cursor-pointer"
                    title="Borrar la nota"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {n.texto.trim() !== n.titulo.trim() && (
                <p className="mt-1 text-[13px] text-[#e2f8ff] whitespace-pre-wrap break-words select-text">{n.texto}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
