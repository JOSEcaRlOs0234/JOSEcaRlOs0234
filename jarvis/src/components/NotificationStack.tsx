import React from "react";
import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";
import { HudNotification, NotificationType, CONFIG } from "../config";

interface NotificationStackProps {
  notifications: HudNotification[];
  onDismiss: (id: string) => void;
}

const TYPE_META: Record<
  NotificationType,
  {
    label: string;
    borderColor: string;
    glowColor: string;
    accentColor: string;
    bgTint: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  info: {
    label: "INFO",
    borderColor: "border-[#00e5ff]/70",
    glowColor: "shadow-[0_0_20px_rgba(0,229,255,0.32)]",
    accentColor: "text-[#00e5ff]",
    bgTint: "bg-[#041428]/92",
    Icon: Info,
  },
  warning: {
    label: "ALERTA",
    borderColor: "border-[#ff9933]/80",
    glowColor: "shadow-[0_0_20px_rgba(255,153,51,0.32)]",
    accentColor: "text-[#ff9933]",
    bgTint: "bg-[#1c1206]/92",
    Icon: AlertTriangle,
  },
  error: {
    label: "ERROR",
    borderColor: "border-[#ff3355]/85",
    glowColor: "shadow-[0_0_22px_rgba(255,51,85,0.4)]",
    accentColor: "text-[#ff3355]",
    bgTint: "bg-[#220710]/94",
    Icon: AlertOctagon,
  },
};

export const NotificationStack: React.FC<NotificationStackProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed top-14 right-5 z-50 flex flex-col gap-2.5 w-80 max-w-[90vw] pointer-events-none"
      aria-live="polite"
    >
      {notifications.map((notif) => {
        const meta = TYPE_META[notif.type] || TYPE_META.info;
        const IconComponent = meta.Icon;

        return (
          <div
            key={notif.id}
            className={`pointer-events-auto relative overflow-hidden border ${meta.borderColor} ${meta.bgTint} ${meta.glowColor} backdrop-blur-md px-3.5 py-2.5 transition-all duration-200`}
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
            }}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <IconComponent
                  className={`w-4 h-4 shrink-0 mt-0.5 ${meta.accentColor}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-hud-mono text-[10px] font-bold tracking-widest ${meta.accentColor}`}
                    >
                      [{meta.label}]
                    </span>
                    <span className="font-hud-mono text-[10px] text-[#68a8d8]">
                      {new Date(notif.createdAt).toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#e2f8ff] leading-snug mt-0.5 break-words">
                    {notif.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(notif.id)}
                className="text-[#68a8d8] hover:text-[#e2f8ff] p-0.5 transition-colors shrink-0 cursor-pointer"
                title="Cerrar notificación"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Barra de tiempo restante */}
            <div className="mt-2 h-[2px] w-full bg-[#00e5ff]/15 overflow-hidden">
              <div
                className={`h-full ${
                  notif.type === "error"
                    ? "bg-[#ff3355]"
                    : notif.type === "warning"
                    ? "bg-[#ff9933]"
                    : "bg-[#00e5ff]"
                }`}
                style={{
                  animation: `hudNotifProgress ${CONFIG.NOTIFICATION_DURATION_MS}ms linear forwards`,
                }}
              />
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes hudNotifProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
