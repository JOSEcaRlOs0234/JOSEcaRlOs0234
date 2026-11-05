/**
 * Ajustes → "Ares en tu iPhone": activar Ares Móvil (por Tailscale), vincular el iPhone con un código/QR y ver o
 * quitar los aparatos vinculados.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

interface EstadoTailscale {
  instalado: boolean;
  conectado: boolean;
  direccion: string | null;
  detalle: string;
}
interface Dispositivo {
  id: string;
  nombre: string;
  creado: number;
  usado: number;
}

export const MovilAjustes: React.FC<{ avisar: (t: string, tipo?: "info" | "error") => void }> = ({ avisar }) => {
  const [activo, setActivo] = useState(false);
  const [tailscale, setTailscale] = useState<EstadoTailscale | null>(null);
  const [aparatos, setAparatos] = useState<Dispositivo[]>([]);
  const [habilitar, setHabilitar] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<{ codigo: string; vence: number; direccion: string | null; qr: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/movil-admin");
      const d = await r.json();
      setActivo(!!d.activo);
      setTailscale(d.tailscale);
      setAparatos(d.dispositivos ?? []);
    } catch {
      // Se reintenta al volver a abrir Ajustes
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarActivo = async (valor: boolean) => {
    setOcupado(true);
    setHabilitar(null);
    try {
      const r = await fetch("/api/movil-admin/activar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: valor }),
      });
      const d = await r.json();
      setActivo(!!d.activo);
      setTailscale(d.tailscale);
      setAparatos(d.dispositivos ?? []);
      if (d.publicar?.habilitar) setHabilitar(d.publicar.habilitar);
      if (d.publicar && !d.publicar.ok && !d.publicar.habilitar) avisar(d.publicar.detalle, "error");
      if (d.publicar?.ok) avisar("Ares Móvil está listo en tu red Tailscale.");
    } catch {
      avisar("No pude cambiar Ares Móvil.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const vincular = async () => {
    try {
      const r = await fetch("/api/movil-admin/codigo", { method: "POST" });
      setCodigo(await r.json());
    } catch {
      avisar("No pude generar el código.", "error");
    }
  };

  const quitar = async (d: Dispositivo) => {
    if (!window.confirm(`¿Quitar "${d.nombre}"? Ese iPhone ya no podrá usar a Ares hasta que lo vuelvas a vincular.`)) return;
    const r = await fetch(`/api/movil-admin/dispositivo/${encodeURIComponent(d.id)}`, { method: "DELETE" });
    setAparatos((await r.json()).dispositivos ?? []);
  };

  const listo = activo && tailscale?.conectado && tailscale.direccion;
  const paso = "text-[10px] font-hud-mono text-[#68a8d8] leading-snug";

  return (
    <div className="hud-panel p-3 flex flex-col gap-2 shrink-0">
      <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-[#00e5ff]" />
          <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">Ares en tu iPhone</h2>
        </div>
        <span className={`text-[10px] font-hud-mono ${listo ? "text-[#00f5a0]" : "text-[#68a8d8]"}`}>{listo ? "LISTO" : activo ? "FALTA ALGO" : "APAGADO"}</span>
      </div>

      <p className={paso}>
        Usa a Ares desde tu iPhone, como control de esta laptop. Va por <b>Tailscale</b>: una red privada solo entre tus aparatos
        (nadie más puede entrar). Pasos: 1) instala Tailscale en la laptop (tailscale.com/download) y en el iPhone (App Store) e
        inicia sesión con la MISMA cuenta en los dos; 2) activa la casilla; 3) "Vincular iPhone" y escanea el código con la cámara.
      </p>

      <label className="flex items-center gap-2 text-[11px] font-hud-mono text-[#e2f8ff] cursor-pointer">
        <input type="checkbox" checked={activo} disabled={ocupado} onChange={(e) => void cambiarActivo(e.target.checked)} />
        Activar Ares Móvil {ocupado ? "(un momento…)" : ""}
      </label>

      {tailscale && (
        <div className={`text-[10px] font-hud-mono ${tailscale.conectado ? "text-[#00f5a0]" : "text-[#ff9933]"}`}>
          {tailscale.detalle}
          {tailscale.direccion ? ` Dirección: ${tailscale.direccion}/movil/` : ""}
        </div>
      )}

      {habilitar && (
        <div className="flex flex-col gap-1 text-[10px] font-hud-mono text-[#ff9933]">
          Tailscale pide un permiso de una sola vez para publicar a Ares en tu red (HTTPS). Ábrelo, apriétalo y vuelve a marcar
          la casilla:
          <a href={habilitar} target="_blank" rel="noopener noreferrer" className="text-[#00e5ff] underline break-all">
            Abrir el permiso de Tailscale
          </a>
        </div>
      )}

      {listo && (
        <button
          type="button"
          onClick={() => void vincular()}
          className="self-start px-2 py-1 text-[11px] font-hud-mono border border-[#00e5ff]/40 text-[#b8f4ff] hover:bg-[#00e5ff]/15 cursor-pointer"
        >
          Vincular iPhone
        </button>
      )}

      {codigo && (
        <div className="flex flex-col items-center gap-1.5 p-2 border border-[#00e5ff]/25 rounded-md">
          {codigo.qr && <div className="w-40 h-40" dangerouslySetInnerHTML={{ __html: codigo.qr }} />}
          <div className="font-hud-mono text-2xl tracking-[0.4em] text-[#e2f8ff]">{codigo.codigo}</div>
          <div className={`${paso} text-center`}>
            Escanéalo con la cámara del iPhone (o abre {codigo.direccion?.split("?")[0]} y escribe el código). Vale 10 minutos.
            Luego en Safari: Compartir → "Agregar a inicio" para tenerlo como app.
          </div>
        </div>
      )}

      {aparatos.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-hud-mono text-[#68a8d8]">Aparatos vinculados:</div>
          {aparatos.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-[11px] font-hud-mono text-[#e2f8ff]">
              <span>
                📱 {d.nombre} · último uso {new Date(d.usado).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
              </span>
              <button type="button" onClick={() => void quitar(d)} className="text-[#ff5c7a] hover:underline cursor-pointer">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
