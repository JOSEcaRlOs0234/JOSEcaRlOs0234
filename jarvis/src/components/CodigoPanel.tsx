/**
 * Panel "Código": lo que Jarvis programó.
 *  - Vista: las páginas web se ven aquí mismo, en un marco AISLADO (sandbox sin "allow-same-origin": la página no
 *    puede leer ni tocar nada de Jarvis ni hablar con su servidor).
 *  - Código: con números de línea y colores, botón para copiarlo.
 *  - Resultado: lo que imprimió el programa (en la nube de Google o en la laptop) y sus gráficas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Code2, Copy, ExternalLink, FolderOpen, Maximize2, Minimize2, Play, X } from "lucide-react";

interface Resultado {
  donde: "nube" | "laptop";
  ok: boolean;
  salida: string;
  comando?: string;
  segundos: number;
  imagenes?: string[];
  sigueAbierto?: boolean;
  fecha: number;
}
interface Proyecto {
  id: string;
  nombre: string;
  lenguaje: string;
  archivo: string;
  carpeta: string;
  explicacion: string;
  entradaEjemplo: string;
  actualizado: number;
  versiones: number;
  resultado?: Resultado;
}
interface Detalle {
  proyecto: Proyecto;
  nombreLenguaje: string;
  web: boolean;
  sePuedeCorrer: boolean;
  codigo: string;
}
type Pestana = "vista" | "codigo" | "resultado";

// ------------------------------------------------------------------ colores del código (sin HTML: solo <span>)

const PALABRAS = new Set(
  (
    "if else elif for while do return def class import from as in is not and or try except finally catch throw throws " +
    "new delete public private protected static void int float double char bool boolean long short unsigned const let " +
    "var function fn func struct enum interface extends implements package namespace using include define true false " +
    "True False None null nullptr undefined this self super break continue switch case default lambda yield async " +
    "await with match impl mut pub use mod echo print printf println cout cin endl std string String auto val fun " +
    "end then local elseif begin module require select where insert update create table into values"
  ).split(" ")
);

function colorear(codigo: string, lenguaje: string): React.ReactNode[] {
  const comentarioGato = ["python", "ruby", "r", "bash", "powershell"].includes(lenguaje);
  const comentarioGuion = ["lua", "sql"].includes(lenguaje);
  const partes =
    new RegExp(
      String.raw`(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*` +
        (comentarioGato ? String.raw`|#[^\n]*` : "") +
        (comentarioGuion ? String.raw`|--[^\n]*` : "") +
        String.raw`)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` +
        "`(?:\\\\.|[^`\\\\])*`" +
        String.raw`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)`,
      "g"
    );
  const salida: React.ReactNode[] = [];
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = partes.exec(codigo))) {
    if (m.index > ultimo) salida.push(codigo.slice(ultimo, m.index));
    const [t, comentario, cadena, numero, palabra] = m;
    const color = comentario
      ? "#5f8fb0"
      : cadena
        ? "#00f5a0"
        : numero
          ? "#ffcc33"
          : palabra && PALABRAS.has(palabra)
            ? "#ff7edb"
            : null;
    salida.push(
      color ? (
        <span key={n++} style={{ color, fontStyle: comentario ? "italic" : undefined }}>
          {t}
        </span>
      ) : (
        t
      )
    );
    ultimo = m.index + t.length;
  }
  if (ultimo < codigo.length) salida.push(codigo.slice(ultimo));
  return salida;
}

// ------------------------------------------------------------------ panel

export const CodigoPanel: React.FC<{
  refrescar: number;
  onCerrar: () => void;
  avisar: (t: string, tipo?: "info" | "error") => void;
}> = ({ refrescar, onCerrar, avisar }) => {
  const [lista, setLista] = useState<{ id: string; nombre: string; lenguaje: string }[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [pestana, setPestana] = useState<Pestana>("codigo");
  const [grande, setGrande] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [entrada, setEntrada] = useState("");
  // La pantalla se vuelve a dibujar cada segundo (reloj): avisar se guarda aparte para no recargar el panel por eso
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  // Lista de proyectos; al cambiar algo (Jarvis programó o corrió algo), se muestra el más reciente
  useEffect(() => {
    let vivo = true;
    fetch("/api/codigo")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setLista(d.proyectos ?? []);
        if (d.proyectos?.[0]) setElegido(d.proyectos[0].id);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [refrescar]);

  const cargar = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/codigo/${encodeURIComponent(id)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetalle(d);
      setEntrada(d.proyecto.entradaEjemplo ?? "");
      setPestana(d.web ? "vista" : d.proyecto.resultado ? "resultado" : "codigo");
      // Las páginas web se muestran en grande de una vez (sin código)
      if (d.web) setGrande(true);
    } catch (err: any) {
      avisarRef.current(err?.message || "No pude abrir el proyecto.", "error");
    }
  }, []);

  useEffect(() => {
    if (elegido) void cargar(elegido);
  }, [elegido, refrescar, cargar]);

  const coloreado = useMemo(
    () => (detalle ? colorear(detalle.codigo, detalle.proyecto.lenguaje) : null),
    [detalle?.codigo, detalle?.proyecto.lenguaje]
  );

  const copiar = async () => {
    if (!detalle) return;
    try {
      await navigator.clipboard.writeText(detalle.codigo);
      avisarRef.current("Código copiado.");
    } catch {
      avisarRef.current("No pude copiar el código.", "error");
    }
  };

  const abrir = async (que: "carpeta" | "navegador") => {
    if (!detalle) return;
    await fetch(`/api/codigo/${encodeURIComponent(detalle.proyecto.id)}/abrir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ que }),
    }).catch(() => avisarRef.current("No pude abrirlo.", "error"));
  };

  const correr = async () => {
    if (!detalle || corriendo) return;
    if (!window.confirm(`¿Correr "${detalle.proyecto.nombre}" (${detalle.nombreLenguaje}) en tu laptop?\n\nLo escribió Jarvis; córrelo solo si estás de acuerdo.`)) return;
    setCorriendo(true);
    setPestana("resultado");
    try {
      const r = await fetch(`/api/codigo/${encodeURIComponent(detalle.proyecto.id)}/ejecutar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetalle((x) => (x ? { ...x, proyecto: d.proyecto } : x));
    } catch (err: any) {
      avisarRef.current(err?.message || "No pude correr el programa.", "error");
    } finally {
      setCorriendo(false);
    }
  };

  const p = detalle?.proyecto;
  const r = p?.resultado;
  const lineas = detalle ? detalle.codigo.replace(/\n$/, "").split("\n").length : 0;
  // En las páginas web solo se ve la página (el usuario no quiere ver el código)
  const pestanas: [Pestana, string][] = detalle?.web ? [] : [["codigo", "Código"], ["resultado", "Resultado"]];
  const boton =
    "px-2 py-1 border border-[#ffb347]/50 text-[#ffd9a0] text-[11px] hover:bg-[#ffb347]/15 cursor-pointer flex items-center gap-1 disabled:opacity-40";

  return (
    <div
      className={`${grande ? "fixed inset-3 z-[55]" : "absolute inset-2 z-30"} flex flex-col bg-[#020c18]/97 border-2 border-[#ffb347]/60 shadow-[0_0_32px_rgba(255,179,71,0.25)]`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#ffb347]/30">
        <div className="flex items-center gap-2 min-w-0 text-[#ffd9a0]">
          <Code2 className="w-4 h-4 shrink-0" />
          <span className="font-hud-display text-sm font-bold tracking-widest uppercase shrink-0">
            {detalle?.web ? "Página web" : "Código"}
          </span>
          {lista.length > 0 && (
            <select
              value={elegido ?? ""}
              onChange={(e) => setElegido(e.target.value)}
              className="min-w-0 max-w-[16rem] bg-[#05162e] border border-[#ffb347]/40 px-1.5 py-0.5 font-hud-mono text-[11px] text-[#e2f8ff] focus:outline-none"
              title="Proyectos hechos por Jarvis"
            >
              {lista.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          )}
          {detalle && !detalle.web && <span className="font-hud-mono text-[10px] text-[#68a8d8] truncate">{detalle.nombreLenguaje}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setGrande((g) => !g)} className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer" title={grande ? "Hacer pequeño" : "Pantalla grande"}>
            {grande ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={onCerrar} className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer" title="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!detalle ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center font-hud-mono text-[11px] text-[#68a8d8]">
          Aún no hay proyectos. Pídele a Jarvis, por ejemplo: "hazme una página web de mi portafolio" o "programa en C++
          una calculadora y muéstrame el resultado".
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 font-hud-mono">
            {pestanas.map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPestana(id)}
                className={`px-2.5 py-1 text-[11px] border cursor-pointer ${pestana === id ? "border-[#ffb347] text-[#ffb347] bg-[#ffb347]/10" : "border-[#ffb347]/25 text-[#b8d8ee] hover:bg-[#ffb347]/10"}`}
              >
                {texto}
              </button>
            ))}
            <span className="flex-1" />
            {!detalle.web && (
              <button type="button" onClick={copiar} className={boton} title="Copiar el código">
                <Copy className="w-3.5 h-3.5" /> Copiar
              </button>
            )}
            <button type="button" onClick={() => abrir("carpeta")} className={boton} title={p?.carpeta}>
              <FolderOpen className="w-3.5 h-3.5" /> Carpeta
            </button>
            {detalle.web && (
              <button type="button" onClick={() => abrir("navegador")} className={boton}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en el navegador
              </button>
            )}
            {detalle.sePuedeCorrer && (
              <button type="button" onClick={correr} disabled={corriendo} className={boton} title="Corre el programa en tu laptop (pide confirmación)">
                <Play className="w-3.5 h-3.5" /> {corriendo ? "Corriendo..." : "Correr en mi laptop"}
              </button>
            )}
          </div>

          {p?.explicacion && <div className="px-3 pt-1.5 text-[11px] text-[#b8d8ee] leading-snug">{p.explicacion}</div>}

          <div className="relative flex-1 min-h-0 m-3 mt-2 border border-[#ffb347]/20 bg-[#01060f] overflow-hidden">
            {pestana === "vista" && detalle.web && (
              <iframe
                key={`${p?.id}-${p?.versiones}`}
                title={`Vista de ${p?.nombre}`}
                srcDoc={detalle.codigo}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="w-full h-full block bg-white"
              />
            )}

            {pestana === "codigo" && (
              <div className="absolute inset-0 overflow-auto">
                <div className="flex font-mono text-[12px] leading-[1.45] min-w-max">
                  <pre className="select-none text-right pr-3 pl-2 py-2 text-[#3d6688] border-r border-[#ffb347]/15">
                    {Array.from({ length: lineas }, (_, i) => i + 1).join("\n")}
                  </pre>
                  <pre className="px-3 py-2 text-[#e2f8ff] whitespace-pre" style={{ fontVariantLigatures: "none" }}>{coloreado}</pre>
                </div>
              </div>
            )}

            {pestana === "resultado" && (
              <div className="absolute inset-0 overflow-auto p-3 font-mono text-[12px]">
                {detalle.sePuedeCorrer && (
                  <div className="mb-2 font-hud-mono">
                    <div className="text-[10px] text-[#68a8d8] mb-1">Lo que se le escribe al programa (una respuesta por línea; opcional):</div>
                    <textarea
                      value={entrada}
                      onChange={(e) => setEntrada(e.target.value)}
                      rows={2}
                      className="w-full bg-[#05162e] border border-[#ffb347]/30 px-2 py-1 text-[11px] text-[#e2f8ff] focus:outline-none focus:border-[#ffb347]"
                    />
                  </div>
                )}
                {corriendo ? (
                  <div className="text-[#ffd9a0] animate-pulse">Corriendo el programa...</div>
                ) : r ? (
                  <>
                    <div className={`font-hud-mono text-[10px] mb-1.5 ${r.ok ? "text-[#00f5a0]" : "text-[#ff6b81]"}`}>
                      {r.sigueAbierto ? "▶ Abrió su propia ventana" : r.ok ? "✓ Corrió bien" : "✗ Marcó error"} ·{" "}
                      {r.donde === "nube" ? "en la nube de Google" : "en tu laptop"}
                      {r.comando ? ` · ${r.comando}` : ""} · {r.segundos} s
                    </div>
                    <pre className="whitespace-pre-wrap text-[#e2f8ff] bg-black/40 border border-white/10 p-2">{r.salida}</pre>
                    {r.imagenes?.map((img) => (
                      <img
                        key={img}
                        src={`/api/codigo/${encodeURIComponent(p!.id)}/imagen/${encodeURIComponent(img)}?t=${r.fecha}`}
                        alt="Gráfica del programa"
                        className="mt-2 max-w-full bg-white"
                      />
                    ))}
                  </>
                ) : (
                  <div className="text-[#68a8d8] font-hud-mono text-[11px]">
                    {detalle.sePuedeCorrer
                      ? 'Todavía no se ha corrido. Dile a Jarvis "muéstrame el resultado" o usa "Correr en mi laptop".'
                      : `${detalle.nombreLenguaje} no se puede correr desde Jarvis; el archivo quedó guardado en la carpeta.`}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
