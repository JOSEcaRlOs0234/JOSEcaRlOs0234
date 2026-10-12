/**
 * Pantalla principal de J.A.R.V.I.S.
 * Columna izquierda: reloj, clima y detector de aplausos.
 * Centro: el reactor animado.
 * Columna derecha: la conversación con Jarvis y el registro de actividad.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Wifi,
  CloudSun,
  MessageSquare,
  Send,
  MapPin,
  Radio,
  ScrollText,
  Volume2,
  VolumeX,
  RefreshCw,
  ShieldCheck,
  Power,
  X,
  Brain,
  Plus,
  RotateCcw,
  PenLine,
  StickyNote,
  Settings,
  Palette,
} from "lucide-react";
import {
  CONFIG,
  ReactorState,
  MessageRole,
  NotificationType,
  HudMessage,
  WeatherData,
  HudNotification,
} from "./config";
import {
  fetchWeatherByCoords,
  searchCityCoordinates,
  GeoCityResult,
} from "./services/weatherService";
import { ReactorCore } from "./components/ReactorCore";
import { NotificationStack } from "./components/NotificationStack";
import { PermisoDialog, Confirmacion } from "./components/PermisoDialog";
import paquete from "../package.json";
import { PizarraPanel, PizarraDatos } from "./components/PizarraPanel";
import { NotasPanel, Nota } from "./components/NotasPanel";
import { formulasEnPalabras, TextoConFormulas } from "./components/Formulas";
import { umbralPorSensibilidad } from "../detector-aplausos.ts";

interface EstadoAplausos {
  config: {
    activo: boolean;
    sensibilidad: number;
    dispositivo: number;
    usarPalabra: boolean;
    usarAplausos: boolean;
    sensibilidadPalabra: number;
  };
  estado: "escuchando" | "apagado" | "sin_microfono" | "no_disponible" | "buscando";
  microfono: string;
  nivel: number;
  eventos: { hora: string; texto: string }[];
  activaciones: number;
  aprendiendo: boolean;
  palabra: "activa" | "sin_clave" | "error" | "apagada";
  errorPalabra: string;
  sinSonido: boolean;
  arranqueConWindows: boolean;
  activacion: number;
  avisos?: { id: number; texto: string }[];
  pedirFoto?: number;
}

const horaActual = () =>
  new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const leerPreferencia = (clave: string, porDefecto: string) => {
  try {
    return localStorage.getItem(clave) ?? porDefecto;
  } catch {
    return porDefecto;
  }
};

const guardarPreferencia = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Si el navegador no deja guardar, no pasa nada
  }
};

/** Elige la voz en español más parecida a Jarvis que tenga la computadora. */
function elegirVoz(): SpeechSynthesisVoice | undefined {
  const voces = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("es"));
  const preferidas = ["jorge", "raul", "raúl", "pablo", "alvaro", "álvaro", "diego", "jarvis"];
  const puntuar = (v: SpeechSynthesisVoice) => {
    const nombre = v.name.toLowerCase();
    let p = 0;
    if (preferidas.some((n) => nombre.includes(n))) p += 4;
    if (nombre.includes("natural") || nombre.includes("online")) p += 2;
    if (v.lang.toLowerCase() === "es-mx") p += 1;
    return p;
  };
  return [...voces].sort((a, b) => puntuar(b) - puntuar(a))[0];
}

/** Minúsculas y sin acentos ("Sí" → "si"), para entender respuestas habladas. */
const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Frases con las que el usuario termina la conversación por voz
const DESPEDIDA = /^(muchas gracias|gracias|eso es todo|es todo|adios|nada mas|hasta luego|ya no|ya esta|descansa|duermete|duerme)\b/;

// Sonido de entrada: se toca una vez cada vez que se abre la ventana de Jarvis
let intro: HTMLAudioElement | null = null;
let introEnWindows = false;

function tocarIntro(): void {
  try {
    // Solo una vez por ventana (no al recargar)
    if (sessionStorage.getItem("jarvis_intro")) return;
    sessionStorage.setItem("jarvis_intro", "1");
  } catch {
    // Sin sessionStorage se toca igual
  }
  const audio = new Audio("/api/sonido-intro");
  audio.volume = 0.85;
  intro = audio;
  audio.onended = () => {
    if (intro === audio) intro = null;
  };
  audio.play().catch((err) => {
    if (intro === audio) intro = null;
    // El navegador no deja sonar sin un clic: que lo toque Windows
    if (err?.name === "NotAllowedError") {
      introEnWindows = true;
      fetch("/api/sonido-intro/tocar", { method: "POST" }).catch(() => {});
    }
  });
}

/** Baja el sonido de entrada poco a poco (cuando Jarvis va a hablar o a escuchar). */
function callarIntro(): void {
  if (introEnWindows) {
    introEnWindows = false;
    fetch("/api/sonido-intro/parar", { method: "POST" }).catch(() => {});
  }
  const audio = intro;
  if (!audio) return;
  intro = null;
  const paso = audio.volume / 12;
  const id = window.setInterval(() => {
    if (audio.volume - paso <= 0.01) {
      audio.pause();
      clearInterval(id);
    } else audio.volume -= paso;
  }, 80);
}

/** Toma una foto con la cámara de la laptop (la enciende solo un momento y la apaga). Devuelve un JPEG en data URL. */
async function tomarFotoConCamara(): Promise<string> {
  const flujo = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = flujo;
    await video.play();
    // Un momento para que la cámara ajuste la luz
    await new Promise((r) => setTimeout(r, 900));
    const lienzo = document.createElement("canvas");
    lienzo.width = video.videoWidth || 1280;
    lienzo.height = video.videoHeight || 720;
    lienzo.getContext("2d")!.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL("image/jpeg", 0.85);
  } finally {
    flujo.getTracks().forEach((t) => t.stop());
  }
}

/** Tono corto "bip-bip" de que Jarvis te está escuchando. */
function tono(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.12);
    vol.gain.setValueAtTime(0.0001, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    window.setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Sin sonido no pasa nada
  }
}

function saludoCorto(): string {
  const h = new Date().getHours();
  return `${h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"}, señor. ¿En qué le ayudo?`;
}

// Pedido automático (no se muestra) la primera vez que se despierta a Jarvis cada día
const PEDIDO_RESUMEN =
  "(Mensaje automático: el usuario acaba de despertar a Jarvis por primera vez hoy.) Salúdalo según la hora y dale un " +
  "resumen hablado y breve del día: el clima de hoy (consultar_clima con su ciudad si la conoces, si no Monterrey), " +
  "2 o 3 titulares importantes (consultar_noticias) y sus recordatorios de hoy si hay. Termina preguntando en qué le ayudas.";

const MENSAJE_INICIAL: HudMessage = {
  id: "msg-inicio",
  rol: "jarvis",
  texto: "Sistemas en línea. Escríbame o pulse \"Hablar con Jarvis\" para conversar, señor.",
  timestamp: horaActual(),
  local: true,
};

const CLAVE_CONVERSACION = "jarvis_conversacion";

/** La conversación se guarda en esta ventana para que no se pierda al cerrarla. */
function conversacionGuardada(): HudMessage[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_CONVERSACION) || "[]");
    if (Array.isArray(lista) && lista.length) return lista;
  } catch {
    // Si no se puede leer, se empieza de nuevo
  }
  return [MENSAJE_INICIAL];
}

export default function App() {
  const [estado, setEstado] = useState<ReactorState>("reposo");
  const [now, setNow] = useState<Date>(() => new Date());

  // Clima
  const [locationConfig, setLocationConfig] = useState<{ name: string; latitude: number; longitude: number }>(
    CONFIG.DEFAULT_LOCATION
  );
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<GeoCityResult[]>([]);
  const [showCitySearch, setShowCitySearch] = useState(false);

  // Conversación
  const [messages, setMessages] = useState<HudMessage[]>(conversacionGuardada);
  const messagesRef = useRef<HudMessage[]>(messages);
  const [inputMessage, setInputMessage] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Voz de Jarvis (hablar) y dictado (escucharte)
  const [vozActiva, setVozActiva] = useState(() => leerPreferencia("jarvis_voz", "si") === "si");
  const vozActivaRef = useRef(vozActiva);
  const [dictando, setDictando] = useState(false);
  const [textoParcial, setTextoParcial] = useState("");
  const reconocimientoRef = useRef<any>(null);

  // Estado del servidor y registro
  const [servidor, setServidor] = useState<{ claveConfigurada: boolean; modelo: string } | "sin_conexion" | null>(
    null
  );
  const [registro, setRegistro] = useState<string[]>([]);

  // Permisos: pregunta pendiente y permisos recordados
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [permisos, setPermisos] = useState<{ tipo: string; nombre: string }[]>([]);

  // Memoria permanente de Jarvis
  const [recuerdos, setRecuerdos] = useState<{ id: string; texto: string; fecha: string }[]>([]);
  const [nuevoRecuerdo, setNuevoRecuerdo] = useState("");

  // Pizarra
  const [pizarra, setPizarra] = useState<PizarraDatos>({ titulo: "", contenido: "", actualizada: 0 });
  const [pizarraAbierta, setPizarraAbierta] = useState(false);
  const pizarraVistaRef = useRef(0);

  // Cajón de Ajustes
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);

  // Canva
  const [canva, setCanva] = useState<{
    configurado: boolean;
    conectado: boolean;
    nombre: string;
    edicion?: { conectado: boolean; herramientas: number };
  }>({
    configurado: false,
    conectado: false,
    nombre: "",
  });
  const [canvaLlaves, setCanvaLlaves] = useState({ clientId: "", clientSecret: "" });
  const [canvaEsperando, setCanvaEsperando] = useState(false);
  const canvaEsperandoEdicionRef = useRef(false);

  // Notas
  const [notas, setNotas] = useState<Nota[]>([]);
  const [notasAbiertas, setNotasAbiertas] = useState(false);
  const notasVistaRef = useRef(0);

  // Modelos de Gemini disponibles
  const [modelos, setModelos] = useState<{ id: string; nombre: string }[]>([]);

  // Notificaciones
  const [notifications, setNotifications] = useState<HudNotification[]>([]);

  // Detector de aplausos en segundo plano (lo maneja el servidor)
  const [aplausos, setAplausos] = useState<EstadoAplausos | null>(null);
  const ultimaActivacionRef = useRef<number | null>(null);
  const ultimoAvisoRef = useRef<number | null>(null);
  // Cámara: última foto pedida por Jarvis y la miniatura que se muestra un momento
  const ultimaFotoRef = useRef(0);
  const [fotoReciente, setFotoReciente] = useState<string | null>(null);
  // Si la ventana se abrió sola por un recordatorio (?aviso=N): mostrarlo (Windows ya lo dijo en voz alta)
  const avisoInicialRef = useRef<number | null>(
    (() => {
      const n = Number(new URLSearchParams(window.location.search).get("aviso"));
      return Number.isInteger(n) && n > 0 ? n : null;
    })()
  );
  const [microfonos, setMicrofonos] = useState<string[]>([]);
  const [clavePalabra, setClavePalabra] = useState("");
  const [guardandoClave, setGuardandoClave] = useState(false);

  useEffect(() => {
    vozActivaRef.current = vozActiva;
  }, [vozActiva]);

  // ---------------------------------------------------------------- utilidades

  const showNotification = useCallback((message: string, type: NotificationType = "info") => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotifications((prev) => [...prev.slice(-4), { id, message, type, createdAt: Date.now() }]);
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, CONFIG.NOTIFICATION_DURATION_MS);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addMensaje = useCallback((rol: MessageRole, texto: string, local = false, oculto = false) => {
    const nuevo: HudMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rol,
      texto,
      timestamp: horaActual(),
      local,
      oculto,
    };
    messagesRef.current = [...messagesRef.current, nuevo];
    setMessages(messagesRef.current);
  }, []);

  const cargarRegistro = useCallback(async () => {
    try {
      const r = await fetch("/api/registro");
      if (r.ok) setRegistro((await r.json()).lineas ?? []);
    } catch {
      // Si el servidor no responde, lo indica el panel de estado
    }
  }, []);

  const cargarPermisos = useCallback(async () => {
    try {
      const r = await fetch("/api/permisos");
      if (r.ok) setPermisos((await r.json()).permisos ?? []);
    } catch {
      // Se reintenta en la próxima acción
    }
  }, []);

  const quitarPermiso = async (tipo: string) => {
    try {
      const r = await fetch(`/api/permisos/${encodeURIComponent(tipo)}`, { method: "DELETE" });
      if (r.ok) setPermisos((await r.json()).permisos ?? []);
      showNotification("Listo: volveré a pedir permiso para eso.", "info");
    } catch {
      showNotification("No pude quitar el permiso.", "error");
    }
    cargarRegistro();
  };

  const apagarJarvis = async () => {
    if (!window.confirm("¿Apagar a Jarvis? Para volver a usarlo, abre el icono de Jarvis.")) return;
    try {
      await fetch("/api/apagar", { method: "POST" });
    } catch {
      // El servidor se apaga y corta la conexión
    }
    setServidor("sin_conexion");
    window.close();
  };

  const cargarRecuerdos = useCallback(async () => {
    try {
      const r = await fetch("/api/recuerdos");
      if (r.ok) setRecuerdos((await r.json()).recuerdos ?? []);
    } catch {
      // Se reintenta en la próxima conversación
    }
  }, []);

  const agregarRecuerdoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = nuevoRecuerdo.trim();
    if (!texto) return;
    setNuevoRecuerdo("");
    try {
      const r = await fetch("/api/recuerdos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (r.ok) setRecuerdos((await r.json()).recuerdos ?? []);
    } catch {
      showNotification("No pude guardar el recuerdo.", "error");
    }
    cargarRegistro();
  };

  const borrarRecuerdo = async (id: string) => {
    try {
      const r = await fetch(`/api/recuerdos/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) setRecuerdos((await r.json()).recuerdos ?? []);
    } catch {
      showNotification("No pude borrar el recuerdo.", "error");
    }
    cargarRegistro();
  };

  /** Lee la pizarra; si Jarvis escribió algo nuevo, la abre. */
  const cargarPizarra = useCallback(async (abrirSiCambio: boolean) => {
    try {
      const r = await fetch("/api/pizarra");
      if (!r.ok) return;
      const datos: PizarraDatos = await r.json();
      setPizarra(datos);
      if (abrirSiCambio && datos.actualizada > pizarraVistaRef.current && (datos.contenido || datos.dibujo)) {
        setPizarraAbierta(true);
        setNotasAbiertas(false);
      }
      pizarraVistaRef.current = datos.actualizada;
    } catch {
      // Se reintenta en la próxima conversación
    }
  }, []);

  const borrarPizarraManual = async () => {
    if (!window.confirm("¿Borrar todo lo que hay en la pizarra?")) return;
    try {
      const r = await fetch("/api/pizarra", { method: "DELETE" });
      if (r.ok) {
        const datos = await r.json();
        setPizarra(datos);
        pizarraVistaRef.current = datos.actualizada;
      }
    } catch {
      showNotification("No pude borrar la pizarra.", "error");
    }
  };

  /** Lee las notas; si Jarvis anotó algo nuevo, abre el panel de notas. */
  const cargarNotas = useCallback(async (abrirSiCambio: boolean) => {
    try {
      const r = await fetch("/api/notas");
      if (!r.ok) return;
      const datos: { notas: Nota[]; actualizada: number } = await r.json();
      setNotas(datos.notas ?? []);
      if (abrirSiCambio && datos.actualizada > notasVistaRef.current && datos.notas?.length) {
        setNotasAbiertas(true);
        setPizarraAbierta(false);
      }
      notasVistaRef.current = datos.actualizada;
    } catch {
      // Se reintenta en la próxima conversación
    }
  }, []);

  const agregarNotaManual = async (texto: string, titulo: string) => {
    try {
      const r = await fetch("/api/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, titulo }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      setNotas(datos.notas ?? []);
      notasVistaRef.current = datos.actualizada;
    } catch (err: any) {
      showNotification(err?.message || "No pude guardar la nota.", "error");
    }
  };

  const borrarNotaManual = async (nota: Nota) => {
    if (!window.confirm(`¿Borrar la nota "${nota.titulo}"?`)) return;
    try {
      const r = await fetch(`/api/notas/${encodeURIComponent(nota.id)}`, { method: "DELETE" });
      if (r.ok) {
        const datos = await r.json();
        setNotas(datos.notas ?? []);
        notasVistaRef.current = datos.actualizada;
      }
    } catch {
      showNotification("No pude borrar la nota.", "error");
    }
  };

  const copiarNota = async (nota: Nota) => {
    try {
      await navigator.clipboard.writeText(nota.texto);
      showNotification("Nota copiada.", "info");
    } catch {
      showNotification("No pude copiar la nota.", "error");
    }
  };

  const cargarCanva = useCallback(async () => {
    try {
      const r = await fetch("/api/canva");
      if (r.ok) {
        const datos = await r.json();
        setCanva(datos);
        if (datos.conectado && (!canvaEsperandoEdicionRef.current || datos.edicion?.conectado)) {
          setCanvaEsperando(false);
          canvaEsperandoEdicionRef.current = false;
        }
      }
    } catch {
      // Se reintenta al abrir Ajustes
    }
  }, []);

  const guardarLlavesCanva = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch("/api/canva/credenciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canvaLlaves),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      setCanva(datos);
      setCanvaLlaves({ clientId: "", clientSecret: "" });
      showNotification("Llaves de Canva guardadas. Ahora aprieta \"Conectar con Canva\".", "info");
    } catch (err: any) {
      showNotification(err?.message || "No pude guardar las llaves de Canva.", "error");
    }
  };

  const conectarCanva = async () => {
    try {
      const r = await fetch("/api/canva/conectar", { method: "POST" });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      window.open(datos.url, "_blank", "noopener");
      setCanvaEsperando(true);
    } catch (err: any) {
      showNotification(err?.message || "No pude abrir Canva.", "error");
    }
  };

  /** Activa la edición dentro de Canva (Canva MCP): abre Canva para dar permiso, si hace falta. */
  const conectarEdicionCanva = async () => {
    try {
      const r = await fetch("/api/canva/edicion/conectar", { method: "POST" });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      if (datos.url) {
        window.open(datos.url, "_blank", "noopener");
        canvaEsperandoEdicionRef.current = true;
        setCanvaEsperando(true);
      } else {
        showNotification("Edición de Canva activada.", "info");
        cargarCanva();
      }
    } catch (err: any) {
      showNotification(err?.message || "No pude activar la edición de Canva.", "error");
    }
  };

  const desconectarCanva = async () => {
    if (!window.confirm("¿Desconectar tu cuenta de Canva de Jarvis?")) return;
    try {
      const r = await fetch("/api/canva", { method: "DELETE" });
      if (r.ok) setCanva(await r.json());
    } catch {
      showNotification("No pude desconectar Canva.", "error");
    }
  };

  // Mientras se espera que des permiso en Canva, revisar cada 3 segundos si ya quedó
  useEffect(() => {
    if (!canvaEsperando) return;
    const id = window.setInterval(cargarCanva, 3000);
    const fin = window.setTimeout(() => setCanvaEsperando(false), 10 * 60 * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(fin);
    };
  }, [canvaEsperando, cargarCanva]);

  useEffect(() => {
    if (ajustesAbiertos) cargarCanva();
  }, [ajustesAbiertos, cargarCanva]);

  /** Guarda en Documentos\Jarvis\Dibujos lo que dibujaste a mano en la pizarra. */
  const guardarDibujo = async (png: string) => {
    try {
      const r = await fetch("/api/dibujos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ png }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      showNotification(`Dibujo guardado en ${datos.ruta}`, "info");
    } catch (err: any) {
      showNotification(err?.message || "No pude guardar el dibujo.", "error");
    }
  };

  const copiarPizarra = async () => {
    try {
      await navigator.clipboard.writeText([pizarra.titulo, pizarra.contenido].filter(Boolean).join("\n\n"));
      showNotification("Texto de la pizarra copiado.", "info");
    } catch {
      showNotification("No pude copiar el texto.", "error");
    }
  };

  const nuevaConversacion = () => {
    if (enviandoRef.current) return;
    if (!window.confirm("¿Empezar una conversación nueva? Jarvis conserva su memoria, solo se borra este chat.")) return;
    messagesRef.current = [{ ...MENSAJE_INICIAL, timestamp: horaActual() }];
    setMessages(messagesRef.current);
  };

  const cargarModelos = useCallback(async () => {
    try {
      const r = await fetch("/api/modelos");
      const datos = await r.json();
      setModelos(datos.modelos ?? []);
    } catch {
      setModelos([]);
    }
  }, []);

  const cambiarModelo = async (id: string) => {
    try {
      const r = await fetch("/api/modelo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      setServidor((prev) => (prev && prev !== "sin_conexion" ? { ...prev, modelo: datos.modelo } : prev));
      showNotification(`Ahora uso el modelo ${datos.modelo}.`, "info");
    } catch (err: any) {
      showNotification(err?.message || "No pude cambiar el modelo.", "error");
    }
    cargarRegistro();
  };

  const comprobarServidor = useCallback(async () => {
    try {
      const r = await fetch("/api/estado");
      if (!r.ok) throw new Error();
      const datos = await r.json();
      setServidor(datos);
      if (datos.version !== paquete.version) {
        showNotification(
          "Sigue encendida una versión vieja de Jarvis. Usa \"Apagar\" y vuelve a abrirlo con su icono.",
          "warning"
        );
      }
    } catch {
      setServidor("sin_conexion");
    }
  }, [showNotification]);

  // ---------------------------------------------------------------- voz de Jarvis

  /** Dice un texto en voz alta. `alTerminar` se llama cuando termina de hablar (para seguir escuchando). */
  const hablar = useCallback((texto: string, alTerminar?: () => void) => {
    const terminar = () => {
      setEstado((prev) => (prev === "hablando" ? "reposo" : prev));
      alTerminar?.();
    };
    callarIntro();
    if (!vozActivaRef.current || !("speechSynthesis" in window)) {
      setEstado("reposo");
      alTerminar?.();
      return;
    }
    window.speechSynthesis.cancel();
    // Las fórmulas se dicen con palabras ("a entre b", "al cuadrado"), no con símbolos
    texto = formulasEnPalabras(texto);
    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = "es-MX";
    frase.rate = 1;
    frase.pitch = 0.85;
    const voz = elegirVoz();
    if (voz) {
      frase.voice = voz;
      frase.lang = voz.lang;
    }
    frase.onstart = () => setEstado("hablando");
    frase.onend = terminar;
    frase.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        // El navegador no deja hablar sin un clic (por ejemplo, al abrirse solo): que hable Windows
        fetch("/api/decir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto }),
        })
          .catch(() => {})
          .finally(terminar);
        return;
      }
      // "interrupted"/"canceled": alguien la calló a propósito; no seguir escuchando automáticamente
      setEstado((prev) => (prev === "hablando" ? "reposo" : prev));
    };
    setEstado("hablando");
    window.speechSynthesis.speak(frase);
  }, []);

  const cambiarVoz = () => {
    const nueva = !vozActiva;
    setVozActiva(nueva);
    guardarPreferencia("jarvis_voz", nueva ? "si" : "no");
    if (!nueva && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setEstado("reposo");
    }
  };

  // ---------------------------------------------------------------- conversación

  /**
   * Manda algo al servidor (un mensaje nuevo o una respuesta de permiso) y procesa lo que conteste:
   * una respuesta de Jarvis, o una nueva pregunta de permiso.
   */
  // Modo conversación: después de cada respuesta Jarvis vuelve a escuchar, hasta que el usuario se despide o calla
  const conversacionRef = useRef(false);
  const [conversando, setConversando] = useState(false);
  const fijarConversacion = (activa: boolean) => {
    conversacionRef.current = activa;
    setConversando(activa);
  };
  const escucharSiguienteRef = useRef<() => void>(() => {});
  const pedirPermisoPorVozRef = useRef<(c: Confirmacion) => void>(() => {});

  const hablarConServidor = useCallback(
    async (url: string, cuerpo: unknown) => {
      enviandoRef.current = true;
      setEnviando(true);
      setEstado("pensando");
      let esperaPermiso = false;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const datos = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
        if (datos.confirmacion) {
          esperaPermiso = true;
          setConfirmacion(datos.confirmacion);
          if (conversacionRef.current) pedirPermisoPorVozRef.current(datos.confirmacion);
          else hablar("Necesito su permiso, señor.");
        } else {
          addMensaje("jarvis", datos.texto);
          // Al terminar de hablar, si estamos platicando, volver a escuchar
          hablar(datos.texto, () => escucharSiguienteRef.current());
        }
      } catch (err: any) {
        const aviso =
          err instanceof TypeError
            ? "No puedo comunicarme con mi servidor. Vuelve a abrir Jarvis desde su icono."
            : err?.message || "Ocurrió un error inesperado.";
        addMensaje("jarvis", aviso, true);
        showNotification(aviso, "error");
        setEstado("reposo");
        fijarConversacion(false);
      } finally {
        // Mientras se espera el permiso, no se pueden mandar mensajes nuevos
        if (!esperaPermiso) {
          enviandoRef.current = false;
          setEnviando(false);
        }
        cargarRegistro();
        cargarPermisos();
        cargarRecuerdos();
        cargarPizarra(true);
        cargarNotas(true);
      }
    },
    [addMensaje, hablar, showNotification, cargarRegistro, cargarPermisos, cargarRecuerdos, cargarPizarra, cargarNotas]
  );

  const enviarMensaje = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      if (!limpio || enviandoRef.current) return;
      addMensaje("usuario", limpio);
      // Solo se manda a Gemini la conversación real (sin avisos locales)
      const historial = messagesRef.current.filter((m) => !m.local).map((m) => ({ rol: m.rol, texto: m.texto }));
      await hablarConServidor("/api/chat", { mensajes: historial });
    },
    [addMensaje, hablarConServidor]
  );

  /** Manda a Gemini un pedido que no se muestra en el chat (por ejemplo, el resumen del día). */
  const enviarOculto = useCallback(
    async (texto: string) => {
      if (enviandoRef.current) return;
      addMensaje("usuario", texto, false, true);
      const historial = messagesRef.current.filter((m) => !m.local).map((m) => ({ rol: m.rol, texto: m.texto }));
      await hablarConServidor("/api/chat", { mensajes: historial });
    },
    [addMensaje, hablarConServidor]
  );

  const responderPermisoCon = (conf: Confirmacion, aprobado: boolean, recordar: boolean) => {
    setConfirmacion(null);
    try {
      reconocimientoRef.current?.abort();
    } catch {
      // No estaba escuchando
    }
    addMensaje("usuario", `${aprobado ? "✔ Permitido" : "✖ No permitido"}: ${conf.descripcion}`, true);
    hablarConServidor("/api/permiso", { id: conf.id, aprobado, recordar });
  };

  const responderPermiso = (aprobado: boolean, recordar: boolean) => {
    if (confirmacion) responderPermisoCon(confirmacion, aprobado, recordar);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const texto = inputMessage;
    setInputMessage("");
    enviarMensaje(texto);
  };

  // ---------------------------------------------------------------- dictado (hablarle a Jarvis)

  const detenerDictado = useCallback(() => {
    try {
      reconocimientoRef.current?.abort();
    } catch {
      // Ya estaba detenido
    }
    reconocimientoRef.current = null;
    setDictando(false);
    setTextoParcial("");
  }, []);

  /** Escucha una frase. `alTexto` recibe lo que dijo; `alNada` se llama si no dijo nada. */
  const escuchar = useCallback((alTexto: (t: string) => void, alNada?: () => void) => {
    if (reconocimientoRef.current) return;
    callarIntro();
    const Reconocimiento = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Reconocimiento) {
      showNotification("Este navegador no puede escuchar tu voz. Usa Google Chrome o Microsoft Edge.", "warning");
      return;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    const rec = new Reconocimiento();
    rec.lang = "es-MX";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let textoFinal = "";
    rec.onresult = (event: any) => {
      let parcial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) textoFinal += t;
        else parcial += t;
      }
      setTextoParcial(parcial || textoFinal);
    };
    rec.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showNotification("No tengo permiso para usar el micrófono. Dale \"Permitir\" en el navegador.", "error");
      } else if (event.error === "no-speech") {
        // En conversación, quedarse callado es la forma normal de terminar
        if (!conversacionRef.current) showNotification("No escuché nada. Pulsa el botón e inténtalo otra vez.", "warning");
      } else if (event.error === "network") {
        showNotification("El reconocimiento de voz necesita internet.", "error");
      } else if (event.error !== "aborted") {
        showNotification(`Problema con el micrófono (${event.error}).`, "warning");
      }
    };
    rec.onend = () => {
      reconocimientoRef.current = null;
      setDictando(false);
      setTextoParcial("");
      setEstado((prev) => (prev === "escuchando" ? "reposo" : prev));
      if (textoFinal.trim()) alTexto(textoFinal.trim());
      else alNada?.();
    };

    reconocimientoRef.current = rec;
    setDictando(true);
    setEstado("escuchando");
    try {
      rec.start();
    } catch {
      detenerDictado();
    }
  }, [detenerDictado, showNotification]);

  /** Lo que el usuario dijo en la conversación: si se despide, Jarvis contesta y deja de escuchar. */
  const porVoz = useCallback(
    (texto: string) => {
      if (DESPEDIDA.test(normalizar(texto))) fijarConversacion(false);
      enviarMensaje(texto);
    },
    [enviarMensaje]
  );

  /** Seguir escuchando (modo conversación). Si el usuario se queda callado, la conversación termina. */
  const escucharSiguiente = useCallback(() => {
    if (!conversacionRef.current || enviandoRef.current) return;
    escuchar(porVoz, () => fijarConversacion(false));
  }, [escuchar, porVoz]);
  escucharSiguienteRef.current = escucharSiguiente;

  /** Pedir permiso con la voz: "sí"/"no" (o "confirmo" en acciones delicadas). Los botones siguen funcionando. */
  const pedirPermisoPorVoz = useCallback(
    (conf: Confirmacion) => {
      const frase = conf.delicada
        ? `Esto es delicado, señor: ${conf.descripcion}. Si lo autoriza, diga: confirmo.`
        : `Necesito su permiso para: ${conf.descripcion}. ¿Lo autorizo?`;
      hablar(frase, () =>
        escuchar((t) => {
          const n = normalizar(t);
          const no = /\b(no|cancela|cancelar|negativo|mejor no|detente|alto)\b/.test(n);
          const si = conf.delicada
            ? /\bconfirm/.test(n)
            : /\b(si|claro|adelante|hazlo|autorizo|dale|ok|okay|confirmo|de acuerdo|esta bien|por favor)\b/.test(n);
          if (no) responderPermisoCon(conf, false, false);
          else if (si) responderPermisoCon(conf, true, false);
          else hablar("No le entendí, señor. Use los botones de la pantalla, por favor.");
        })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escuchar, hablar]
  );
  pedirPermisoPorVozRef.current = pedirPermisoPorVoz;

  /** Botón "Hablar con Jarvis": empieza una conversación. */
  const iniciarDictado = useCallback(() => {
    fijarConversacion(true);
    escuchar(porVoz, () => fijarConversacion(false));
  }, [escuchar, porVoz]);

  /** Despertar a Jarvis (por la palabra "Jarvis", aplausos o al abrirse solo). */
  const despertar = useCallback(
    (alAbrirse: boolean) => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      detenerDictado();
      fijarConversacion(true);
      const hoy = new Date().toDateString();
      if (leerPreferencia("jarvis_resumen_dia", "") !== hoy) {
        // Primera vez del día: saludo con clima, noticias y recordatorios
        guardarPreferencia("jarvis_resumen_dia", hoy);
        tono();
        enviarOculto(PEDIDO_RESUMEN);
      } else if (alAbrirse) {
        const t = saludoCorto();
        addMensaje("jarvis", t, true);
        hablar(t, () => escucharSiguienteRef.current());
      } else {
        tono();
        addMensaje("jarvis", "¿Sí, señor?", true);
        window.setTimeout(() => escucharSiguienteRef.current(), 350);
      }
    },
    [addMensaje, detenerDictado, enviarOculto, hablar]
  );
  const despertarRef = useRef(despertar);
  despertarRef.current = despertar;
  const hablarRef = useRef(hablar);
  hablarRef.current = hablar;

  const toggleDictado = () => {
    if (dictando) {
      fijarConversacion(false);
      detenerDictado();
    } else iniciarDictado();
  };

  // ---------------------------------------------------------------- detector de aplausos (segundo plano)

  const cargarMicrofonos = async () => {
    try {
      const r = await fetch("/api/aplausos/microfonos");
      if (r.ok) setMicrofonos((await r.json()).microfonos ?? []);
    } catch {
      // Se reintenta al abrir el menú
    }
  };

  const cambiarAplausos = async (cambios: {
    activo?: boolean;
    sensibilidad?: number;
    dispositivo?: number;
    usarPalabra?: boolean;
    usarAplausos?: boolean;
    sensibilidadPalabra?: number;
  }) => {
    try {
      const r = await fetch("/api/aplausos/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (r.ok) setAplausos(await r.json());
    } catch {
      showNotification("No pude cambiar el detector de aplausos.", "error");
    }
  };

  const guardarClavePalabra = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoClave(true);
    try {
      const r = await fetch("/api/palabra/clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: clavePalabra }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      setAplausos(datos);
      setClavePalabra("");
      showNotification('¡Listo! Ahora di "Jarvis" para despertarlo.', "info");
    } catch (err: any) {
      showNotification(err?.message || "No pude guardar la clave.", "error");
    } finally {
      setGuardandoClave(false);
    }
  };

  const ensenarAplausos = async (accion: "aprender" | "restablecer") => {
    try {
      const r = await fetch("/api/aplausos/aprender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (r.ok) setAplausos(await r.json());
    } catch {
      showNotification("No pude hablar con el detector de aplausos.", "error");
    }
  };

  const cambiarArranque = async (activo: boolean) => {
    try {
      const r = await fetch("/api/aplausos/arranque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error);
      setAplausos((prev) => (prev ? { ...prev, arranqueConWindows: datos.arranqueConWindows } : prev));
      showNotification(activo ? "Jarvis se encenderá solo al prender la laptop." : "Jarvis ya no se encenderá solo.", "info");
    } catch (err: any) {
      showNotification(err?.message || "No pude cambiar el arranque con Windows.", "error");
    }
  };

  // ---------------------------------------------------------------- clima

  const loadWeather = useCallback(
    async (name: string, lat: number, lon: number) => {
      setWeatherLoading(true);
      try {
        setWeather(await fetchWeatherByCoords(name, lat, lon));
      } catch {
        showNotification("No pude obtener el clima.", "warning");
      } finally {
        setWeatherLoading(false);
      }
    },
    [showNotification]
  );

  const handleSearchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    try {
      const results = await searchCityCoordinates(cityQuery);
      setCityResults(results);
      if (results.length === 0) showNotification(`No encontré "${cityQuery}".`, "warning");
    } catch {
      showNotification("No pude buscar la ciudad.", "warning");
    }
  };

  const handleSelectCity = (city: GeoCityResult) => {
    const label = `${city.name}${city.country ? `, ${city.country}` : ""}`;
    setLocationConfig({ name: label, latitude: city.latitude, longitude: city.longitude });
    setCityResults([]);
    setCityQuery("");
    setShowCitySearch(false);
  };

  // ---------------------------------------------------------------- efectos

  useEffect(() => {
    comprobarServidor();
    cargarRegistro();
    cargarPermisos();
    cargarModelos();
    cargarRecuerdos();
    cargarPizarra(false);
    cargarNotas(false);
    // Las voces de Windows se cargan un momento después de abrir la página
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, [comprobarServidor, cargarRegistro, cargarPermisos, cargarModelos, cargarRecuerdos, cargarPizarra, cargarNotas]);

  // Guardar la conversación (las últimas 60 líneas) para que siga al volver a abrir Jarvis
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(messages.slice(-60)));
    } catch {
      // Si el navegador no deja guardar, no pasa nada
    }
  }, [messages]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, textoParcial]);

  useEffect(() => {
    loadWeather(locationConfig.name, locationConfig.latitude, locationConfig.longitude);
  }, [locationConfig, loadWeather]);

  useEffect(() => {
    return () => detenerDictado();
  }, [detenerDictado]);

  // Preguntar al servidor por el detector de aplausos (y avisarle si esta ventana está a la vista).
  // Si hubo un doble aplauso con la ventana abierta, Jarvis se pone a escuchar.
  useEffect(() => {
    let vivo = true;
    const preguntar = async () => {
      try {
        const visible = document.visibilityState === "visible" ? "1" : "0";
        const r = await fetch(`/api/aplausos?visible=${visible}`);
        if (!r.ok || !vivo) return;
        const datos: EstadoAplausos = await r.json();
        setAplausos(datos);
        if (ultimaActivacionRef.current !== null && datos.activacion > ultimaActivacionRef.current) {
          // Dijeron "Jarvis" (o aplaudieron) con esta ventana a la vista: bip y a escuchar
          if (document.visibilityState === "visible" && !enviandoRef.current) despertarRef.current(false);
        }
        ultimaActivacionRef.current = datos.activacion;

        // Jarvis pidió mirar con la cámara: tomar la foto y mandársela
        if (datos.pedirFoto && datos.pedirFoto !== ultimaFotoRef.current) {
          const id = datos.pedirFoto;
          ultimaFotoRef.current = id;
          showNotification("📷 Jarvis está mirando por la cámara", "info");
          tomarFotoConCamara()
            .then(async (jpeg) => {
              setFotoReciente(jpeg);
              window.setTimeout(() => setFotoReciente((f) => (f === jpeg ? null : f)), 6000);
              await fetch("/api/camara/foto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, jpeg }),
              });
            })
            .catch((err) => {
              const motivo =
                err?.name === "NotAllowedError"
                  ? "No hay permiso para usar la cámara. Hay que permitirla en la ventana de Jarvis (icono de la cámara arriba) y en Configuración de Windows → Privacidad → Cámara."
                  : err?.name === "NotFoundError"
                  ? "No encontré ninguna cámara en la laptop."
                  : err?.name === "NotReadableError"
                  ? "La cámara la está usando otro programa (cierra Zoom, Teams, etc.)."
                  : "No pude usar la cámara.";
              showNotification(motivo, "error");
              fetch("/api/camara/error", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, motivo }),
              }).catch(() => {});
            });
        }

        // Recordatorios que llegaron a su hora
        const avisos = datos.avisos ?? [];
        const maxId = avisos.reduce((m, a) => Math.max(m, a.id), 0);
        let yaDichoHasta = 0;
        if (ultimoAvisoRef.current === null) {
          const inicial = avisoInicialRef.current;
          ultimoAvisoRef.current = inicial !== null && inicial <= maxId ? inicial - 1 : maxId;
          yaDichoHasta = maxId;
          if (inicial !== null) window.history.replaceState(null, "", "/");
        }
        for (const a of avisos.filter((x) => x.id > (ultimoAvisoRef.current ?? 0))) {
          addMensaje("jarvis", `⏰ ${a.texto}`, true);
          showNotification(a.texto, "warning");
          if (document.visibilityState === "visible" && a.id > yaDichoHasta) hablarRef.current(a.texto);
        }
        ultimoAvisoRef.current = Math.max(ultimoAvisoRef.current ?? 0, maxId);
      } catch {
        // Servidor apagado: lo indica la barra superior
      }
    };
    preguntar();
    cargarMicrofonos();
    const id = window.setInterval(preguntar, 300);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [addMensaje, showNotification]);

  // Sonido de entrada al abrir la ventana (no cuando se abre sola por un recordatorio: ese lo está diciendo Windows)
  useEffect(() => {
    if (avisoInicialRef.current === null) tocarIntro();
  }, []);

  // Si la ventana se abrió sola porque dijeron "Jarvis" (?despertar=1): saludar y escuchar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("despertar") !== "1") return;
    window.history.replaceState(null, "", "/");
    // Si suena la entrada, se deja escuchar unos segundos antes de saludar
    const id = window.setTimeout(() => despertarRef.current(true), intro || introEnWindows ? 3500 : 900);
    return () => clearTimeout(id);
  }, []);

  // ---------------------------------------------------------------- pantalla

  const formattedTime = now.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const formattedDate = now.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const estadoServidor =
    servidor === null
      ? { texto: "Conectando...", color: "text-[#68a8d8]" }
      : servidor === "sin_conexion"
      ? { texto: "Servidor apagado", color: "text-[#ff3355]" }
      : servidor.claveConfigurada
      ? { texto: "Gemini listo", color: "text-[#00f5a0]" }
      : { texto: "Falta la clave de Gemini", color: "text-[#ff9933]" };

  return (
    <div className="hud-viewport-bg relative w-screen h-screen overflow-hidden flex flex-col justify-between p-2.5 sm:p-4 text-[#e2f8ff]">
      <NotificationStack notifications={notifications} onDismiss={dismissNotification} />
      {confirmacion && <PermisoDialog confirmacion={confirmacion} onResponder={responderPermiso} />}

      {/* AJUSTES (cajón lateral): todo lo de configuración, para que la pantalla principal quede limpia */}
      {ajustesAbiertos && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#020c18]/60 backdrop-blur-[2px]" onClick={() => setAjustesAbiertos(false)} />
          <aside className="relative w-full max-w-[420px] h-full overflow-y-auto bg-[#030d1c] border-l border-[#00e5ff]/40 shadow-[0_0_40px_rgba(0,229,255,0.2)] p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-[#00e5ff]/25">
              <div className="flex items-center gap-2 text-[#00e5ff]">
                <Settings className="w-4 h-4" />
                <span className="font-hud-display text-sm font-bold tracking-widest uppercase">Ajustes</span>
              </div>
              <button
                type="button"
                onClick={() => setAjustesAbiertos(false)}
                className="p-1 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* MODELO DE GEMINI */}
            <div className="hud-panel p-3 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
                <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">Cerebro (Gemini)</h2>
                <span className={`font-hud-mono text-[10px] ${estadoServidor.color}`}>● {estadoServidor.texto}</span>
              </div>
              <div className="flex items-center gap-2 font-hud-mono text-xs">
              {servidor && servidor !== "sin_conexion" && servidor.claveConfigurada && (
                <select
                  value={servidor.modelo}
                  onChange={(e) => cambiarModelo(e.target.value)}
                  onFocus={() => modelos.length === 0 && cargarModelos()}
                  className="max-w-[220px] bg-[#05162e] border border-[#00e5ff]/40 px-1.5 py-0.5 text-[11px] text-[#e2f8ff] focus:outline-none focus:border-[#00e5ff] cursor-pointer"
                  title="Elige qué modelo de Gemini usa Jarvis"
                >
                  {!modelos.some((m) => m.id === servidor.modelo) && (
                    <option value={servidor.modelo}>{servidor.modelo}</option>
                  )}
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.id})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={comprobarServidor}
                className="p-1 text-[#00e5ff] hover:bg-[#00e5ff]/15 cursor-pointer"
                title="Volver a comprobar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              </div>
            </div>

              {/* DETECTOR DE APLAUSOS (en segundo plano) */}
              <div className="hud-panel p-3 flex flex-col gap-2.5 shrink-0">
                <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-[#00e5ff]" />
                    <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                      Despertar a Jarvis
                    </h2>
                  </div>
                  <span
                    className={`font-hud-mono text-[10px] ${
                      aplausos?.estado === "escuchando" ? "text-[#00f5a0]" : aplausos?.estado === "apagado" ? "text-[#68a8d8]" : "text-[#ff9933]"
                    }`}
                  >
                    {!aplausos
                      ? "..."
                      : aplausos.estado === "escuchando"
                      ? "● ESCUCHANDO"
                      : aplausos.estado === "apagado"
                      ? "APAGADO"
                      : aplausos.estado === "sin_microfono"
                      ? "SIN MICRÓFONO"
                      : aplausos.estado === "buscando"
                      ? "BUSCANDO MICRÓFONO..."
                      : "NO DISPONIBLE"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => cambiarAplausos({ activo: !aplausos?.config.activo })}
                  disabled={!aplausos}
                  className={`w-full py-2 px-3 text-xs font-hud-display font-bold uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    aplausos?.config.activo
                      ? "bg-[#00f5a0]/20 border-[#00f5a0] text-[#00f5a0]"
                      : "bg-[#00e5ff]/25 border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/40"
                  }`}
                >
                  {aplausos?.config.activo ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span>{aplausos?.config.activo ? "Oído encendido" : "Oído apagado"}</span>
                </button>

                {/* PALABRA "JARVIS" */}
                <div className="bg-[#041226]/80 border border-[#00e5ff]/30 p-2 flex flex-col gap-1.5 font-hud-mono">
                  <label className="flex items-center gap-2 text-[11px] text-[#e2f8ff] font-bold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!aplausos?.config.usarPalabra}
                      disabled={!aplausos}
                      onChange={(e) => cambiarAplausos({ usarPalabra: e.target.checked })}
                      className="accent-[#00e5ff] cursor-pointer"
                    />
                    🗣️ Al decir &ldquo;Jarvis&rdquo;
                    {aplausos?.palabra === "activa" && <span className="ml-auto text-[10px] text-[#00f5a0]">● LISTO</span>}
                  </label>
                  {aplausos?.config.usarPalabra && (aplausos.palabra === "sin_clave" || aplausos.palabra === "error") && (
                    <div className="flex flex-col gap-1.5">
                      {aplausos.palabra === "error" ? (
                        <p className="text-[10px] text-[#ffb8c6] leading-snug">⚠ {aplausos.errorPalabra}</p>
                      ) : (
                        <p className="text-[10px] text-[#b8f4ff] leading-snug">
                          Necesita una clave gratuita de Picovoice. Sácala en{" "}
                          <a href="https://console.picovoice.ai/" target="_blank" rel="noopener noreferrer" className="text-[#00e5ff] underline">
                            console.picovoice.ai
                          </a> y pégala aquí:
                        </p>
                      )}
                      <form onSubmit={guardarClavePalabra} className="flex gap-1.5">
                        <input
                          type="password"
                          value={clavePalabra}
                          onChange={(e) => setClavePalabra(e.target.value)}
                          placeholder="Pega la clave (AccessKey)"
                          autoComplete="off"
                          className="flex-1 min-w-0 bg-[#05162e] border border-[#00e5ff]/40 px-2 py-1 text-[11px] text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
                        />
                        <button
                          type="submit"
                          disabled={guardandoClave || !clavePalabra.trim()}
                          className="px-2 py-1 bg-[#00e5ff]/20 border border-[#00e5ff] text-[11px] text-[#e2f8ff] cursor-pointer disabled:opacity-40"
                        >
                          {guardandoClave ? "Probando..." : "Guardar"}
                        </button>
                      </form>
                    </div>
                  )}
                  {aplausos?.config.usarPalabra && aplausos.palabra === "activa" && (
                    <>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#68a8d8]">QUÉ TAN FÁCIL TE OYE (1 a 10)</span>
                        <span className="text-[#00e5ff] font-bold">{aplausos.config.sensibilidadPalabra}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={aplausos.config.sensibilidadPalabra}
                        onChange={(e) => cambiarAplausos({ sensibilidadPalabra: Number(e.target.value) })}
                        className="w-full accent-[#00e5ff] cursor-pointer"
                      />
                    </>
                  )}
                </div>

                <label className="flex items-center gap-2 text-[11px] font-hud-mono text-[#e2f8ff] font-bold cursor-pointer select-none px-2">
                  <input
                    type="checkbox"
                    checked={!!aplausos?.config.usarAplausos}
                    disabled={!aplausos}
                    onChange={(e) => cambiarAplausos({ usarAplausos: e.target.checked })}
                    className="accent-[#00e5ff] cursor-pointer"
                  />
                  👏 Con doble aplauso
                </label>

                {aplausos?.sinSonido && (
                  <div className="p-2 border border-[#ff9933] bg-[#241505]/90 text-[11px] font-hud-mono text-[#ffcc99] leading-snug">
                    ⚠ No llega sonido del micrófono. Revisa que Windows permita usar el micrófono a las aplicaciones de
                    escritorio, o elige otro micrófono aquí abajo.
                  </div>
                )}

                <div className="flex flex-col gap-1 font-hud-mono">
                  <span className="text-[10px] text-[#68a8d8]">MICRÓFONO</span>
                  <select
                    value={aplausos?.config.dispositivo ?? -1}
                    disabled={!aplausos}
                    onFocus={cargarMicrofonos}
                    onChange={(e) => cambiarAplausos({ dispositivo: Number(e.target.value) })}
                    className="w-full bg-[#05162e] border border-[#00e5ff]/40 px-1.5 py-1 text-[11px] text-[#e2f8ff] focus:outline-none focus:border-[#00e5ff] cursor-pointer"
                  >
                    <option value={-1}>Predeterminado de Windows{aplausos?.config.dispositivo === -1 && aplausos.microfono ? ` (${aplausos.microfono})` : ""}</option>
                    {microfonos.map((m, i) => (
                      <option key={`${i}-${m}`} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#041226]/80 border border-[#00e5ff]/20 p-2 font-hud-mono">
                  <div className="flex items-center justify-between text-[10px] text-[#68a8d8]">
                    <span>VOLUMEN DEL MICRÓFONO</span>
                    <span className="text-[#e2f8ff]">{Math.round((aplausos?.nivel ?? 0) * 100)}%</span>
                  </div>
                  <div className="relative mt-1.5 h-3 w-full bg-[#020813] border border-[#00e5ff]/30 overflow-hidden">
                    <div
                      className="h-full bg-[#00e5ff] transition-all duration-100"
                      style={{ width: `${Math.min(100, Math.round((aplausos?.nivel ?? 0) * 100))}%` }}
                    />
                    {aplausos?.config.usarAplausos && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-[#ff9933]"
                        style={{ left: `${Math.round(umbralPorSensibilidad(aplausos.config.sensibilidad) * 100)}%` }}
                        title="Un aplauso debe pasar esta línea"
                      />
                    )}
                  </div>
                  {aplausos?.config.usarAplausos && (
                  <>
                  <div className="flex items-center justify-between text-[10px] mt-2">
                    <span className="text-[#68a8d8]">SENSIBILIDAD DE APLAUSOS (1 = poca, 10 = mucha)</span>
                    <span className="text-[#00e5ff] font-bold">{aplausos?.config.sensibilidad ?? "-"}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={aplausos?.config.sensibilidad ?? 5}
                    disabled={!aplausos}
                    onChange={(e) => cambiarAplausos({ sensibilidad: Number(e.target.value) })}
                    className="w-full mt-1.5 accent-[#00e5ff] cursor-pointer"
                  />
                  </>
                  )}
                </div>

                {aplausos?.config.usarAplausos && (
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <button
                    type="button"
                    onClick={() => ensenarAplausos("aprender")}
                    disabled={!aplausos || aplausos.estado !== "escuchando" || aplausos.aprendiendo}
                    className={`px-2 py-1.5 text-[11px] font-hud-mono font-bold border cursor-pointer disabled:cursor-not-allowed ${
                      aplausos?.aprendiendo
                        ? "border-[#ff9933] text-[#ff9933] bg-[#ff9933]/15 animate-pulse"
                        : "border-[#00e5ff] text-[#e2f8ff] bg-[#00e5ff]/15 hover:bg-[#00e5ff]/30 disabled:opacity-40"
                    }`}
                  >
                    {aplausos?.aprendiendo ? "👏 Aplaude 3 veces, despacio..." : "👏 Enseñarle mis aplausos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => ensenarAplausos("restablecer")}
                    disabled={!aplausos}
                    className="px-2 py-1.5 text-[10px] font-hud-mono border border-[#68a8d8]/40 text-[#68a8d8] hover:text-[#e2f8ff] cursor-pointer"
                    title="Volver a las reglas de fábrica"
                  >
                    Reiniciar
                  </button>
                </div>
                )}

                <label className="flex items-center gap-2 text-[11px] font-hud-mono text-[#b8f4ff] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!aplausos?.arranqueConWindows}
                    disabled={!aplausos}
                    onChange={(e) => cambiarArranque(e.target.checked)}
                    className="accent-[#00e5ff] cursor-pointer"
                  />
                  Encender Jarvis solo al prender la laptop
                </label>

                {aplausos && aplausos.eventos.length > 0 && (
                  <div className="bg-[#041226]/80 border border-[#00e5ff]/20 p-2 max-h-28 overflow-y-auto flex flex-col gap-0.5">
                    {aplausos.eventos.map((e, i) => (
                      <div
                        key={`${e.hora}-${i}`}
                        className={`text-[10px] font-hud-mono leading-snug ${
                          e.texto.startsWith("¡Doble") || e.texto.startsWith("¡Escuché") ? "text-[#00f5a0] font-bold" : e.texto.startsWith("Ignorado") ? "text-[#68a8d8]" : "text-[#e2f8ff]"
                        }`}
                      >
                        {e.hora} · {e.texto}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
                  Di &ldquo;Jarvis&rdquo; (o aplaude dos veces) y te contesta. El sonido se analiza en tu laptop, sin
                  internet, y no se graba.
                </p>
              </div>

              {/* PERMISOS RECORDADOS */}
              <div className="hud-panel p-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 border-b border-[#00e5ff]/20 pb-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#00e5ff]" />
                  <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                    Permisos sin preguntar
                  </h2>
                </div>
                {permisos.length === 0 ? (
                  <p className="text-[11px] font-hud-mono text-[#68a8d8] leading-snug">
                    Jarvis te pide permiso antes de cada acción en tu laptop.
                  </p>
                ) : (
                  permisos.map((p) => (
                    <div
                      key={p.tipo}
                      className="flex items-center justify-between gap-2 text-[11px] font-hud-mono text-[#b8f4ff] bg-[#041226]/80 border border-[#00e5ff]/20 px-2 py-1"
                    >
                      <span>{p.nombre}</span>
                      <button
                        type="button"
                        onClick={() => quitarPermiso(p.tipo)}
                        className="text-[#ff9933] hover:text-[#ff3355] cursor-pointer"
                        title="Volver a pedir permiso para esto"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
                  Borrar archivos, reemplazarlos o apagar la laptop siempre piden permiso.
                </p>
              </div>

              {/* MEMORIA DE JARVIS */}
              <div className="hud-panel p-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[#00e5ff]" />
                    <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                      Memoria de Jarvis
                    </h2>
                  </div>
                  <span className="font-hud-mono text-[10px] text-[#00e5ff]">{recuerdos.length}</span>
                </div>
                {recuerdos.length === 0 ? (
                  <p className="text-[11px] font-hud-mono text-[#68a8d8] leading-snug">
                    Dile por ejemplo: &ldquo;Recuerda que me llamo...&rdquo; y lo guardará aquí.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
                    {[...recuerdos].reverse().map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-2 text-[11px] text-[#e2f8ff] bg-[#041226]/80 border border-[#00e5ff]/20 px-2 py-1"
                      >
                        <span className="leading-snug break-words">{r.texto}</span>
                        <button
                          type="button"
                          onClick={() => borrarRecuerdo(r.id)}
                          className="text-[#ff9933] hover:text-[#ff3355] cursor-pointer shrink-0 mt-0.5"
                          title="Olvidar esto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={agregarRecuerdoManual} className="flex gap-1.5">
                  <input
                    type="text"
                    value={nuevoRecuerdo}
                    onChange={(e) => setNuevoRecuerdo(e.target.value)}
                    maxLength={300}
                    placeholder="Agregar un recuerdo..."
                    className="flex-1 min-w-0 bg-[#05162e] border border-[#00e5ff]/40 px-2 py-1 text-[11px] font-hud-mono text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
                  />
                  <button
                    type="submit"
                    disabled={!nuevoRecuerdo.trim()}
                    className="px-2 py-1 bg-[#00e5ff]/20 border border-[#00e5ff] text-[#e2f8ff] cursor-pointer disabled:opacity-40"
                    title="Guardar recuerdo"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

              {/* CANVA */}
              <div className="hud-panel p-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#00e5ff]" />
                    <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">Canva</h2>
                  </div>
                  <span className={`font-hud-mono text-[10px] ${canva.conectado ? "text-[#00f5a0]" : "text-[#68a8d8]"}`}>
                    {canva.conectado ? "CONECTADO" : canvaEsperando ? "ESPERANDO PERMISO..." : "SIN CONECTAR"}
                  </span>
                </div>
                {canva.conectado ? (
                  <>
                    <p className="text-[11px] font-hud-mono text-[#e2f8ff]">
                      {canva.nombre ? `Cuenta: ${canva.nombre}` : "Cuenta conectada"}
                    </p>
                    <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
                      Dile: &ldquo;haz una presentación en Canva sobre...&rdquo;, &ldquo;pasa el dibujo a Canva&rdquo; o
                      &ldquo;descarga mi diseño de ... en PDF&rdquo;.
                    </p>
                    <div className="flex items-center justify-between gap-2 border-t border-[#00e5ff]/15 pt-2">
                      <span className="text-[11px] font-hud-mono text-[#b8f4ff]">Editar dentro de los diseños</span>
                      {canva.edicion?.conectado ? (
                        <span className="text-[10px] font-hud-mono text-[#00f5a0]">ACTIVADA</span>
                      ) : (
                        <button
                          type="button"
                          onClick={conectarEdicionCanva}
                          className="px-2 py-1 text-[11px] font-hud-mono bg-[#00e5ff]/20 border border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/35 cursor-pointer"
                        >
                          {canvaEsperando ? "Volver a abrir" : "Activar edición"}
                        </button>
                      )}
                    </div>
                    {canva.edicion?.conectado && (
                      <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
                        Dile: &ldquo;en mi diseño de ... cambia el título por ...&rdquo; o &ldquo;crea un póster sobre ...&rdquo;.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={desconectarCanva}
                      className="self-start px-2 py-1 text-[11px] font-hud-mono border border-[#ff9933]/50 text-[#ff9933] hover:bg-[#ff9933]/15 cursor-pointer"
                    >
                      Desconectar
                    </button>
                  </>
                ) : (
                  <>
                    {canva.configurado && (
                      <button
                        type="button"
                        onClick={conectarCanva}
                        className="px-2 py-1.5 text-[11px] font-hud-mono bg-[#00e5ff]/20 border border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/35 cursor-pointer"
                      >
                        {canvaEsperando ? "Volver a abrir Canva" : "Conectar con Canva"}
                      </button>
                    )}
                    <form onSubmit={guardarLlavesCanva} className="flex flex-col gap-1.5">
                      <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
                        {canva.configurado
                          ? "Llaves guardadas. Si necesitas cambiarlas, pégalas de nuevo:"
                          : "Pega las llaves de tu integración (se crean en canva.com/developers):"}
                      </p>
                      <input
                        type="text"
                        value={canvaLlaves.clientId}
                        onChange={(e) => setCanvaLlaves((l) => ({ ...l, clientId: e.target.value }))}
                        placeholder="Client ID"
                        autoComplete="off"
                        className="bg-[#05162e] border border-[#00e5ff]/40 px-2 py-1 text-[11px] font-hud-mono text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
                      />
                      <input
                        type="password"
                        value={canvaLlaves.clientSecret}
                        onChange={(e) => setCanvaLlaves((l) => ({ ...l, clientSecret: e.target.value }))}
                        placeholder="Client secret"
                        autoComplete="off"
                        className="bg-[#05162e] border border-[#00e5ff]/40 px-2 py-1 text-[11px] font-hud-mono text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
                      />
                      <button
                        type="submit"
                        disabled={!canvaLlaves.clientId.trim() || !canvaLlaves.clientSecret.trim()}
                        className="px-2 py-1 text-[11px] font-hud-mono border border-[#00e5ff]/50 text-[#b8f4ff] hover:bg-[#00e5ff]/15 cursor-pointer disabled:opacity-40"
                      >
                        Guardar llaves
                      </button>
                    </form>
                  </>
                )}
              </div>

              {/* REGISTRO DE ACTIVIDAD */}
              <div className="hud-panel p-3 flex flex-col gap-2 h-72 shrink-0">
                <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-[#00e5ff]" />
                    <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                      Registro de actividad
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={cargarRegistro}
                    className="p-1 text-[#00e5ff] hover:bg-[#00e5ff]/15 cursor-pointer"
                    title="Actualizar"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto flex flex-col-reverse gap-1 pr-1">
                  {registro.length === 0 ? (
                    <div className="text-[11px] font-hud-mono text-[#68a8d8]">Sin actividad todavía.</div>
                  ) : (
                    [...registro].reverse().map((linea, i) => (
                      <div
                        key={`${i}-${linea}`}
                        className={`text-[10px] font-hud-mono leading-snug break-words ${
                          linea.includes("| ERROR") || linea.includes("| SEGURIDAD")
                            ? "text-[#ffb8c6]"
                            : "text-[#68a8d8]"
                        }`}
                      >
                        {linea}
                      </div>
                    ))
                  )}
                </div>
              </div>
          </aside>
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <header className="flex items-center justify-between gap-4 px-3 py-1.5 border-b border-[#00e5ff]/25 bg-[#041022]/80 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Radio className="w-4 h-4 text-[#00e5ff] shrink-0" />
          <span className="font-hud-display font-bold tracking-[0.22em] text-sm sm:text-base text-[#e2f8ff] whitespace-nowrap">
            J.A.R.V.I.S.
          </span>
          <span className="hidden md:inline-block text-[#68a8d8] font-hud-mono text-xs">
            · ASISTENTE PERSONAL
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-hud-mono text-xs">
          <span className={estadoServidor.color}>● {estadoServidor.texto}</span>
          <button
            type="button"
            onClick={() => setAjustesAbiertos(true)}
            className="ml-1 px-2 py-0.5 border border-[#00e5ff]/40 text-[#b8f4ff] hover:bg-[#00e5ff]/15 cursor-pointer flex items-center gap-1"
            title="Ajustes: despertar, permisos, memoria, modelo y registro"
          >
            <Settings className="w-3.5 h-3.5" />
            Ajustes
          </button>
          <button
            type="button"
            onClick={apagarJarvis}
            className="ml-1 px-2 py-0.5 border border-[#ff3355]/50 text-[#ff3355] hover:bg-[#ff3355]/15 cursor-pointer flex items-center gap-1"
            title="Apagar a Jarvis por completo (cerrar la ventana no lo apaga)"
          >
            <Power className="w-3.5 h-3.5" />
            Apagar
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 py-2.5 overflow-y-auto lg:overflow-hidden items-stretch">
        {/* ================= COLUMNA IZQUIERDA ================= */}
        <section className="lg:col-span-3 flex flex-col gap-2.5 min-h-0 overflow-y-auto pr-0.5">
          {/* RELOJ + CLIMA */}
          <div className="hud-panel p-3 flex flex-col gap-2.5 shrink-0">
            <div className="flex items-start justify-between gap-2 border-b border-[#00e5ff]/20 pb-2">
              <div>
                <div className="font-hud-mono text-xl sm:text-2xl font-bold tracking-wider text-[#e2f8ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.45)]">
                  {formattedTime}
                </div>
                <div className="text-[11px] font-hud-mono text-[#68a8d8] capitalize">{formattedDate}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowCitySearch((prev) => !prev)}
                className="px-2 py-1 text-[10px] font-hud-mono border border-[#00e5ff]/35 text-[#00e5ff] hover:bg-[#00e5ff]/15 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                title="Cambiar ciudad"
              >
                <MapPin className="w-3 h-3" />
                Ciudad
              </button>
            </div>

            {showCitySearch && (
              <div className="bg-[#030c1a]/90 border border-[#00e5ff]/30 p-2 flex flex-col gap-1.5">
                <form onSubmit={handleSearchCity} className="flex gap-1.5">
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Ej. Guadalajara, CDMX..."
                    className="flex-1 min-w-0 bg-[#05162e] border border-[#00e5ff]/40 px-2 py-1 text-xs font-hud-mono text-[#e2f8ff] focus:outline-none focus:border-[#00e5ff]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-[#00e5ff]/20 border border-[#00e5ff] text-xs font-hud-mono text-[#e2f8ff] hover:bg-[#00e5ff]/35 cursor-pointer"
                  >
                    Buscar
                  </button>
                </form>
                {cityResults.map((c, idx) => (
                  <button
                    key={`${c.latitude}-${c.longitude}-${idx}`}
                    type="button"
                    onClick={() => handleSelectCity(c)}
                    className="text-left text-xs font-hud-mono px-2 py-1 hover:bg-[#00e5ff]/20 text-[#b8f4ff] cursor-pointer truncate"
                  >
                    {c.name}
                    {c.admin1 ? `, ${c.admin1}` : ""} ({c.country})
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-hud-mono text-[#00e5ff]">
                  <CloudSun className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate font-semibold">{weather ? weather.city : locationConfig.name}</span>
                </div>
                <p className="text-xs text-[#b8f4ff] mt-0.5">
                  {weatherLoading ? "Consultando el clima..." : weather ? weather.description : "Sin datos del clima"}
                </p>
                {weather && (
                  <p className="text-[11px] font-hud-mono text-[#68a8d8] mt-0.5">
                    Humedad {weather.humidity}% · Viento {weather.windSpeed} km/h
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-hud-mono text-2xl font-bold text-[#e2f8ff]">
                  {weather ? `${weather.temperature}°C` : "--°C"}
                </div>
                <div className="text-[10px] font-hud-mono text-[#68a8d8]">
                  Sensación {weather ? `${weather.apparentTemperature}°C` : "--"}
                </div>
              </div>
            </div>
          </div>

          {/* ESTADO (resumen; los detalles están en Ajustes) */}
          <div className="hud-panel p-3 flex flex-col gap-1.5 shrink-0">
            {[
              {
                icono: <Wifi className="w-3.5 h-3.5" />,
                nombre: "Despertar",
                valor: !aplausos
                  ? "..."
                  : !aplausos.config.activo
                  ? "Oído apagado"
                  : aplausos.palabra === "activa"
                  ? 'Di "Jarvis"'
                  : aplausos.config.usarAplausos
                  ? "Doble aplauso"
                  : "Falta configurar",
                bien: !!aplausos?.config.activo && (aplausos.palabra === "activa" || aplausos.config.usarAplausos),
              },
              { icono: <Brain className="w-3.5 h-3.5" />, nombre: "Memoria", valor: `${recuerdos.length} recuerdos`, bien: true },
              {
                icono: <ShieldCheck className="w-3.5 h-3.5" />,
                nombre: "Permisos",
                valor: permisos.length ? `${permisos.length} sin preguntar` : "Siempre pregunta",
                bien: true,
              },
            ].map((fila) => (
              <button
                key={fila.nombre}
                type="button"
                onClick={() => setAjustesAbiertos(true)}
                className="flex items-center justify-between gap-2 px-1 py-1 text-[11px] font-hud-mono hover:bg-[#00e5ff]/10 cursor-pointer"
                title="Ver en Ajustes"
              >
                <span className="flex items-center gap-2 text-[#b8f4ff]">
                  <span className="text-[#00e5ff]">{fila.icono}</span>
                  {fila.nombre}
                </span>
                <span className={fila.bien ? "text-[#00f5a0]" : "text-[#ff9933]"}>{fila.valor}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ================= CENTRO: REACTOR ================= */}
        <section className="lg:col-span-6 flex items-center justify-center min-h-[380px] relative">
          {pizarraAbierta && (
            <PizarraPanel
              pizarra={pizarra}
              onCerrar={() => setPizarraAbierta(false)}
              onBorrar={borrarPizarraManual}
              onCopiar={copiarPizarra}
              onGuardarDibujo={guardarDibujo}
            />
          )}
          {fotoReciente && (
            <div className="absolute bottom-2 left-2 z-40 border-2 border-[#00e5ff] bg-[#020c18] p-1 shadow-[0_0_20px_rgba(0,229,255,0.4)]">
              <img src={fotoReciente} alt="Lo que vio Jarvis" className="w-56 h-auto block" />
              <div className="text-[10px] font-hud-mono text-[#00e5ff] text-center pt-0.5">📷 Lo que vio Jarvis</div>
            </div>
          )}
          {notasAbiertas && !pizarraAbierta && (
            <NotasPanel
              notas={notas}
              onCerrar={() => setNotasAbiertas(false)}
              onAgregar={agregarNotaManual}
              onBorrar={borrarNotaManual}
              onCopiar={copiarNota}
            />
          )}
          {!pizarraAbierta && !notasAbiertas && (
            <div className="absolute top-2 right-2 z-20 flex gap-1.5">
              <button
                type="button"
                onClick={() => setNotasAbiertas(true)}
                className="px-2.5 py-1 text-[11px] font-hud-mono border border-[#00f5a0]/40 text-[#b8f4ff] bg-[#041226]/80 hover:bg-[#00f5a0]/15 cursor-pointer flex items-center gap-1"
                title="Ver las notas"
              >
                <StickyNote className="w-3.5 h-3.5" /> Notas{notas.length ? ` (${notas.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setPizarraAbierta(true)}
                className="px-2.5 py-1 text-[11px] font-hud-mono border border-[#00e5ff]/40 text-[#b8f4ff] bg-[#041226]/80 hover:bg-[#00e5ff]/15 cursor-pointer flex items-center gap-1"
                title="Ver la pizarra (y dibujar)"
              >
                <PenLine className="w-3.5 h-3.5" /> Pizarra
              </button>
            </div>
          )}
          <ReactorCore
            estado={estado}
            dictando={dictando}
            micVolume={aplausos?.nivel ?? 0}
            frequencyData={null}
            onToggleDictado={toggleDictado}
            onSimulateVoice={() => {
              const frase = "Todos los sistemas operan con normalidad, señor.";
              addMensaje("jarvis", frase, true);
              if (!vozActiva) showNotification("La voz está apagada. Actívala en el panel de conversación.", "warning");
              hablar(frase);
            }}
          />
        </section>

        {/* ================= COLUMNA DERECHA ================= */}
        <section className="lg:col-span-3 flex flex-col gap-2.5 min-h-0 overflow-y-auto pl-0.5">
          {/* CONVERSACIÓN */}
          <div className="hud-panel p-3 flex flex-col gap-2 flex-1 min-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#00e5ff]" />
                <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                  Conversación
                </h2>
              </div>
              <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={nuevaConversacion}
                className="p-1 text-[#68a8d8] hover:text-[#00e5ff] cursor-pointer"
                title="Nueva conversación (la memoria se conserva)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={cambiarVoz}
                className={`px-2 py-0.5 text-[10px] font-hud-mono border cursor-pointer flex items-center gap-1 ${
                  vozActiva ? "border-[#00e5ff] text-[#00e5ff]" : "border-[#68a8d8]/40 text-[#68a8d8]"
                }`}
                title="Encender o apagar la voz de Jarvis"
              >
                {vozActiva ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {vozActiva ? "Voz encendida" : "Voz apagada"}
              </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
              {messages.filter((m) => !m.oculto).map((msg) => {
                const isJarvis = msg.rol === "jarvis";
                return (
                  <div
                    key={msg.id}
                    className={`p-2 border text-xs ${
                      isJarvis
                        ? "bg-[#051b38]/85 border-[#00e5ff]/45 text-[#e2f8ff]"
                        : "bg-[#041020]/85 border-[#68a8d8]/35 text-[#b8f4ff] ml-3"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-hud-mono mb-0.5">
                      <span className={isJarvis ? "text-[#00e5ff] font-bold" : "text-[#00f5a0] font-bold"}>
                        {isJarvis ? "J.A.R.V.I.S." : "TÚ"}
                      </span>
                      <span className="text-[#68a8d8]">{msg.timestamp}</span>
                    </div>
                    <p className="leading-relaxed break-words whitespace-pre-wrap">
                      <TextoConFormulas texto={msg.texto} />
                    </p>
                  </div>
                );
              })}
              {textoParcial && (
                <div className="p-2 border border-dashed border-[#00f5a0]/60 bg-[#04241e]/50 text-xs font-hud-mono text-[#00f5a0]">
                  Escuchando: &ldquo;{textoParcial}...&rdquo;
                </div>
              )}
              {enviando && (
                <div className="text-[11px] font-hud-mono text-[#ff9933] animate-pulse">Jarvis está pensando...</div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            {conversando && (
              <div className="flex items-center justify-between gap-2 px-2 py-1 border border-[#00f5a0]/50 bg-[#04241e]/60 text-[10px] font-hud-mono text-[#00f5a0]">
                <span>🗣️ Conversación activa · di &ldquo;gracias&rdquo; para terminar</span>
                <button
                  type="button"
                  onClick={() => {
                    fijarConversacion(false);
                    detenerDictado();
                  }}
                  className="underline hover:text-[#e2f8ff] cursor-pointer"
                >
                  Terminar
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Escríbele a Jarvis..."
                maxLength={4000}
                className="flex-1 min-w-0 bg-[#030e21] border border-[#00e5ff]/40 px-2.5 py-1.5 text-xs font-hud-mono text-[#e2f8ff] placeholder-[#68a8d8]/60 focus:outline-none focus:border-[#00e5ff]"
              />
              <button
                type="submit"
                disabled={enviando || !inputMessage.trim()}
                className="px-3 py-1.5 bg-[#00e5ff]/20 border border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/35 transition-colors cursor-pointer flex items-center gap-1 text-xs font-hud-mono shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </form>
          </div>

        </section>
      </main>


    </div>
  );
}
