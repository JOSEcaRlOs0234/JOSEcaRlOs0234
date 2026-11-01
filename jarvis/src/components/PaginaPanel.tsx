/**
 * Panel "Página web": muestra la página terminada que hizo Jarvis, en grande, SIN código.
 * La página va en un marco AISLADO (sandbox sin "allow-same-origin"): no puede leer ni tocar nada de Jarvis ni hablar
 * con su servidor. Botones: abrir en el navegador, abrir la carpeta, hacer pequeño/grande, elegir otra página.
 */

import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, FolderOpen, Globe, Maximize2, Minimize2, X } from "lucide-react";

interface Pagina {
  id: string;
  nombre: string;
  explicacion: string;
  actualizado: number;
  versiones?: number;
}

export const PaginaPanel: React.FC<{
  refrescar: number;
  onCerrar: () => void;
  avisar: (t: string, tipo?: "info" | "error") => void;
}> = ({ refrescar, onCerrar, avisar }) => {
  const [lista, setLista] = useState<Pagina[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [actual, setActual] = useState<{ pagina: Pagina; html: string } | null>(null);
  const [grande, setGrande] = useState(true);
  // La pantalla se vuelve a dibujar cada segundo (reloj): avisar se guarda aparte para no recargar el panel por eso
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  // Lista de páginas; al cambiar algo (Jarvis hizo o cambió una), se muestra la más reciente
  useEffect(() => {
    let vivo = true;
    fetch("/api/paginas")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setLista(d.paginas ?? []);
        if (d.paginas?.[0]) setElegida(d.paginas[0].id);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [refrescar]);

  useEffect(() => {
    if (!elegida) return;
    let vivo = true;
    fetch(`/api/paginas/${encodeURIComponent(elegida)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (vivo) setActual(d);
      })
      .catch((err) => avisarRef.current(err?.message || "No pude abrir la página.", "error"));
    return () => {
      vivo = false;
    };
  }, [elegida, refrescar]);

  const abrir = async (que: "navegador" | "carpeta") => {
    if (!actual) return;
    await fetch(`/api/paginas/${encodeURIComponent(actual.pagina.id)}/abrir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ que }),
    }).catch(() => avisarRef.current("No pude abrirla.", "error"));
  };

  const boton =
    "px-2 py-1 border border-[#ffb347]/50 text-[#ffd9a0] text-[11px] hover:bg-[#ffb347]/15 cursor-pointer flex items-center gap-1";

  return (
    <div
      className={`${grande ? "fixed inset-3 z-[55]" : "absolute inset-2 z-30"} flex flex-col bg-[#020c18] border-2 border-[#ffb347]/60 shadow-[0_0_32px_rgba(255,179,71,0.25)]`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#ffb347]/30">
        <div className="flex items-center gap-2 min-w-0 text-[#ffd9a0]">
          <Globe className="w-4 h-4 shrink-0" />
          <span className="font-hud-display text-sm font-bold tracking-widest uppercase shrink-0">Página web</span>
          {lista.length > 1 ? (
            <select
              value={elegida ?? ""}
              onChange={(e) => setElegida(e.target.value)}
              className="min-w-0 max-w-[18rem] bg-[#05162e] border border-[#ffb347]/40 px-1.5 py-0.5 font-hud-mono text-[11px] text-[#e2f8ff] focus:outline-none"
              title="Páginas hechas por Jarvis"
            >
              {lista.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          ) : (
            actual && <span className="font-hud-mono text-[11px] text-[#e2f8ff] truncate">{actual.pagina.nombre}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 font-hud-mono">
          {actual && (
            <>
              <button type="button" onClick={() => abrir("navegador")} className={boton}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en el navegador
              </button>
              <button type="button" onClick={() => abrir("carpeta")} className={boton} title="Abrir la carpeta donde se guardó">
                <FolderOpen className="w-3.5 h-3.5" /> Carpeta
              </button>
            </>
          )}
          <button type="button" onClick={() => setGrande((g) => !g)} className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer" title={grande ? "Hacer pequeño" : "Pantalla grande"}>
            {grande ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={onCerrar} className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!actual ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center font-hud-mono text-[11px] text-[#68a8d8]">
          Aún no hay páginas. Pídele a Jarvis, por ejemplo: "hazme una página web de mi portafolio".
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 m-2 border border-[#ffb347]/20 bg-white overflow-hidden">
          <iframe
            key={`${actual.pagina.id}-${actual.pagina.actualizado}`}
            title={`Vista de ${actual.pagina.nombre}`}
            srcDoc={actual.html}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="w-full h-full block bg-white"
          />
        </div>
      )}
    </div>
  );
};
