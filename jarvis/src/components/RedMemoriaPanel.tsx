/**
 * Panel "Red neuronal de memoria": muestra los recuerdos de Ares como neuronas (puntos que brillan) conectadas por
 * significado. Se acomodan solas con una física sencilla (se repelen y las conexiones las atraen). Al buscar algo, se
 * encienden las neuronas activadas. Clic en una neurona = ver el recuerdo y poder olvidarlo.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Plus, Search, Trash2, X } from "lucide-react";

interface NodoRed {
  id: string;
  texto: string;
  tipo: string;
  creado: number;
  usado: number;
}
interface Conexion {
  a: string;
  b: string;
  fuerza: number;
}

const COLORES: Record<string, string> = {
  dato: "#00e5ff",
  gusto: "#ff6bd5",
  estudio: "#00f5a0",
  plan: "#ffcc33",
  persona: "#ff9b54",
  tema: "#9d8cff",
};
const NOMBRES: Record<string, string> = {
  dato: "Datos",
  gusto: "Gustos",
  estudio: "Estudio",
  plan: "Planes",
  persona: "Personas",
  tema: "Temas",
};

interface Punto {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const RedMemoriaPanel: React.FC<{ onCerrar: () => void; avisar: (t: string, tipo?: "info" | "error") => void }> = ({
  onCerrar,
  avisar,
}) => {
  const [nodos, setNodos] = useState<NodoRed[]>([]);
  const [conexiones, setConexiones] = useState<Conexion[]>([]);
  const [elegido, setElegido] = useState<NodoRed | null>(null);
  const [activos, setActivos] = useState<Map<string, number>>(new Map());
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState("");
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const puntosRef = useRef(new Map<string, Punto>());
  const sobreRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/red");
      if (!r.ok) return;
      const d = await r.json();
      setNodos(d.nodos);
      setConexiones(d.conexiones);
    } catch {
      // Se reintenta al abrir otra vez
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(cargar, 15000); // por si aprendió algo mientras está abierto
    return () => window.clearInterval(id);
  }, [cargar]);

  // Física + dibujo
  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    let cuadro = 0;
    const puntos = puntosRef.current;
    for (const id of [...puntos.keys()]) if (!nodos.some((n) => n.id === id)) puntos.delete(id);

    const paso = (t: number) => {
      const ancho = lienzo.clientWidth;
      const alto = lienzo.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (lienzo.width !== ancho * dpr || lienzo.height !== alto * dpr) {
        lienzo.width = ancho * dpr;
        lienzo.height = alto * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = ancho / 2;
      const cy = alto / 2;
      for (const n of nodos) {
        if (!puntos.has(n.id)) {
          const ang = Math.random() * Math.PI * 2;
          const r = 40 + Math.random() * Math.min(ancho, alto) * 0.3;
          puntos.set(n.id, { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, vx: 0, vy: 0 });
        }
      }
      // Fuerzas: repulsión entre todos, atracción por conexiones, gravedad suave al centro
      const lista = nodos.map((n) => [n.id, puntos.get(n.id)!] as const);
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i][1];
        for (let j = i + 1; j < lista.length; j++) {
          const q = lista[j][1];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = Math.max(dx * dx + dy * dy, 80);
          const f = 900 / d2;
          p.vx += (dx / Math.sqrt(d2)) * f;
          p.vy += (dy / Math.sqrt(d2)) * f;
          q.vx -= (dx / Math.sqrt(d2)) * f;
          q.vy -= (dy / Math.sqrt(d2)) * f;
        }
        p.vx += (cx - p.x) * 0.0016;
        p.vy += (cy - p.y) * 0.0016;
      }
      for (const c of conexiones) {
        const p = puntos.get(c.a);
        const q = puntos.get(c.b);
        if (!p || !q) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 90) * 0.004 * c.fuerza;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
        q.vx -= (dx / d) * f;
        q.vy -= (dy / d) * f;
      }
      for (const [, p] of lista) {
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = Math.min(ancho - 14, Math.max(14, p.x + p.vx));
        p.y = Math.min(alto - 14, Math.max(14, p.y + p.vy));
      }

      // Dibujo
      ctx.clearRect(0, 0, ancho, alto);
      for (const c of conexiones) {
        const p = puntos.get(c.a);
        const q = puntos.get(c.b);
        if (!p || !q) continue;
        const encendida = activos.has(c.a) && activos.has(c.b);
        ctx.strokeStyle = encendida ? "rgba(255,255,255,0.75)" : `rgba(0,229,255,${0.12 + c.fuerza * 0.25})`;
        ctx.lineWidth = encendida ? 1.8 : 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        // Pulso que viaja por la conexión (como una señal entre neuronas)
        const fase = ((t / 2200 + (c.a.charCodeAt(0) % 10) / 10) % 1 + 1) % 1;
        ctx.fillStyle = encendida ? "rgba(255,255,255,0.9)" : "rgba(0,229,255,0.5)";
        ctx.beginPath();
        ctx.arc(p.x + (q.x - p.x) * fase, p.y + (q.y - p.y) * fase, encendida ? 2.4 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const n of nodos) {
        const p = puntos.get(n.id)!;
        const color = COLORES[n.tipo] ?? "#00e5ff";
        const act = activos.get(n.id) ?? 0;
        const radio = 4 + Math.min(n.usado, 10) * 0.5 + act * 6;
        const brillo = 10 + act * 25 + Math.sin(t / 600 + p.x) * 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = brillo;
        ctx.fillStyle = act ? "#ffffff" : color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (elegido?.id === n.id || sobreRef.current === n.id || act > 0.5) {
          ctx.fillStyle = "#e2f8ff";
          ctx.font = "11px 'JetBrains Mono', monospace";
          const texto = n.texto.length > 46 ? n.texto.slice(0, 45) + "…" : n.texto;
          const w = ctx.measureText(texto).width;
          // A la derecha de la neurona; si no cabe, a la izquierda (nunca encima de ella)
          const x = p.x + radio + 6 + w < ancho - 4 ? p.x + radio + 6 : Math.max(4, p.x - radio - 6 - w);
          ctx.fillStyle = "rgba(2,8,20,0.85)";
          ctx.fillRect(x - 3, p.y - 9, w + 6, 16);
          ctx.fillStyle = "#e2f8ff";
          ctx.fillText(texto, x, p.y + 3);
        }
      }
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [nodos, conexiones, activos, elegido]);

  const nodoEn = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let mejor: { id: string; d: number } | null = null;
    for (const [id, p] of puntosRef.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 14 && (!mejor || d < mejor.d)) mejor = { id, d };
    }
    return mejor?.id ?? null;
  };

  const activar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buscar.trim()) return setActivos(new Map());
    try {
      const r = await fetch("/api/red/recordar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta: buscar }),
      });
      const d = await r.json();
      const mapa = new Map<string, number>((d.activados ?? []).map((a: any) => [a.id, a.activacion]));
      setActivos(mapa);
      if (!mapa.size) avisar("No se activó ninguna neurona con eso.", "info");
    } catch {
      avisar("No pude buscar en la red de memoria.", "error");
    }
  };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    try {
      const r = await fetch("/api/red", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: nuevo }),
      });
      const d = await r.json();
      if (!r.ok) return avisar(d.error || "No pude guardarlo.", "error");
      setNodos(d.nodos);
      setConexiones(d.conexiones);
      setNuevo("");
    } catch {
      avisar("No pude guardarlo.", "error");
    }
  };

  const olvidarElegido = async () => {
    if (!elegido) return;
    try {
      const r = await fetch(`/api/red/${encodeURIComponent(elegido.id)}`, { method: "DELETE" });
      const d = await r.json();
      setNodos(d.nodos);
      setConexiones(d.conexiones);
      setElegido(null);
    } catch {
      avisar("No pude olvidarlo.", "error");
    }
  };

  return (
    <div className="absolute inset-2 z-30 flex flex-col bg-[#020c18]/95 border-2 border-[#9d8cff]/60 shadow-[0_0_32px_rgba(157,140,255,0.25)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[#9d8cff]/30">
        <div className="flex items-center gap-2 text-[#c9bfff]">
          <Brain className="w-4 h-4 shrink-0" />
          <span className="font-hud-display text-sm font-bold tracking-widest uppercase">Red neuronal de memoria</span>
          <span className="font-hud-mono text-[10px] text-[#68a8d8]">
            {nodos.length} neuronas · {conexiones.length} conexiones
          </span>
        </div>
        <button type="button" onClick={onCerrar} className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer" title="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={activar} className="flex gap-1.5 px-3 pt-2 font-hud-mono">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Activar recuerdos sobre... (ej. química, mis gustos, exámenes)"
          className="flex-1 min-w-0 bg-[#05162e] border border-[#9d8cff]/40 px-2 py-1 text-[11px] text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#9d8cff]"
        />
        <button type="submit" className="px-2 py-1 border border-[#9d8cff]/60 text-[#c9bfff] text-[11px] hover:bg-[#9d8cff]/15 cursor-pointer flex items-center gap-1">
          <Search className="w-3.5 h-3.5" /> Activar
        </button>
      </form>

      <div className="relative flex-1 min-h-0 m-3 mb-2 border border-[#9d8cff]/20 bg-[#01060f]">
        <canvas
          ref={lienzoRef}
          className="w-full h-full block cursor-pointer"
          onMouseMove={(e) => (sobreRef.current = nodoEn(e))}
          onMouseLeave={() => (sobreRef.current = null)}
          onClick={(e) => {
            const id = nodoEn(e);
            setElegido(id ? nodos.find((n) => n.id === id) ?? null : null);
          }}
        />
        {!nodos.length && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center font-hud-mono text-[11px] text-[#68a8d8]">
            Aún no hay neuronas. Platica con Ares: aprenderá solo lo importante sobre ti y aquí verás cómo crece su red.
          </div>
        )}
        {elegido && (
          <div className="absolute bottom-2 left-2 right-2 p-2 border border-[#9d8cff]/50 bg-[#05061a]/95 font-hud-mono text-[11px] text-[#e2f8ff] flex items-start gap-2">
            <span className="shrink-0 px-1.5 border text-[10px]" style={{ color: COLORES[elegido.tipo], borderColor: COLORES[elegido.tipo] }}>
              {NOMBRES[elegido.tipo] ?? elegido.tipo}
            </span>
            <span className="flex-1">
              {elegido.texto}
              <span className="block text-[10px] text-[#68a8d8]">
                Aprendido el {new Date(elegido.creado).toLocaleDateString("es-MX")} · recordado {elegido.usado} veces
              </span>
            </span>
            <button
              type="button"
              onClick={olvidarElegido}
              className="shrink-0 px-2 py-0.5 border border-[#ff5577]/50 text-[#ff8899] hover:bg-[#ff5577]/15 cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Olvidar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 font-hud-mono text-[10px] text-[#68a8d8]">
        {Object.entries(NOMBRES).map(([t, n]) => (
          <span key={t} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORES[t], boxShadow: `0 0 6px ${COLORES[t]}` }} /> {n}
          </span>
        ))}
      </div>
      <form onSubmit={agregar} className="flex gap-1.5 p-3 pt-2 font-hud-mono">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Enseñarle algo a mano (ej. Mi materia favorita es Química)"
          className="flex-1 min-w-0 bg-[#05162e] border border-[#9d8cff]/40 px-2 py-1 text-[11px] text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#9d8cff]"
        />
        <button type="submit" disabled={!nuevo.trim()} className="px-2 py-1 border border-[#9d8cff]/60 text-[#c9bfff] hover:bg-[#9d8cff]/15 cursor-pointer disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
