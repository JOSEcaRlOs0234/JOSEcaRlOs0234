import React, { useState } from "react";
import { ShieldAlert, ShieldQuestion } from "lucide-react";

export interface Confirmacion {
  id: string;
  descripcion: string;
  delicada: boolean;
  tipo: string;
  // Solo existe si se puede marcar "no volver a preguntar"
  nombreTipo?: string;
}

interface Props {
  confirmacion: Confirmacion;
  onResponder: (aprobado: boolean, recordar: boolean) => void;
}

/** Ventana que aparece cuando Jarvis quiere hacer algo en la laptop. */
export const PermisoDialog: React.FC<Props> = ({ confirmacion, onResponder }) => {
  const [recordar, setRecordar] = useState(false);
  const { delicada } = confirmacion;
  const color = delicada ? "#ff3355" : "#00e5ff";
  const Icono = delicada ? ShieldAlert : ShieldQuestion;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md bg-[#041428]/95 border-2 p-5 flex flex-col gap-4 font-hud-mono"
        style={{ borderColor: color, boxShadow: `0 0 32px ${color}55` }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2.5" style={{ color }}>
          <Icono className="w-6 h-6 shrink-0" />
          <h2 className="font-hud-display text-sm font-bold tracking-widest uppercase">
            {delicada ? "Acción delicada" : "Jarvis pide permiso"}
          </h2>
        </div>

        <p className="text-sm text-[#e2f8ff] leading-relaxed">
          Jarvis quiere:
          <br />
          <strong className="text-base block whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{confirmacion.descripcion}</strong>
        </p>

        {confirmacion.nombreTipo && (
          <label className="flex items-start gap-2 text-xs text-[#b8f4ff] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="mt-0.5 accent-[#00e5ff] cursor-pointer"
            />
            <span>
              No volver a preguntar para: <em>{confirmacion.nombreTipo}</em>
            </span>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onResponder(false, false)}
            autoFocus={delicada}
            className="py-2 border border-[#68a8d8]/60 text-[#b8f4ff] hover:bg-[#68a8d8]/15 text-sm font-bold cursor-pointer"
          >
            No permitir
          </button>
          <button
            type="button"
            onClick={() => onResponder(true, recordar)}
            className="py-2 border text-sm font-bold cursor-pointer"
            style={{ borderColor: color, color, background: `${color}22` }}
            autoFocus={!delicada}
          >
            Sí, permitir
          </button>
        </div>
      </div>
    </div>
  );
};
