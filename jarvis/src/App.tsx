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
import { umbralPorSensibilidad } from "../detector-aplausos.ts";

interface EstadoAplausos {
  config: { activo: boolean; sensibilidad: number; dispositivo: number };
  estado: "escuchando" | "apagado" | "sin_microfono" | "no_disponible";
  microfono: string;
  nivel: number;
  eventos: { hora: string; texto: string }[];
  activaciones: number;
  sinSonido: boolean;
  arranqueConWindows: boolean;
  activacion: number;
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

  // Modelos de Gemini disponibles
  const [modelos, setModelos] = useState<{ id: string; nombre: string }[]>([]);

  // Notificaciones
  const [notifications, setNotifications] = useState<HudNotification[]>([]);

  // Detector de aplausos en segundo plano (lo maneja el servidor)
  const [aplausos, setAplausos] = useState<EstadoAplausos | null>(null);
  const ultimaActivacionRef = useRef<number | null>(null);
  const [microfonos, setMicrofonos] = useState<string[]>([]);

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

  const addMensaje = useCallback((rol: MessageRole, texto: string, local = false) => {
    const nuevo: HudMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rol,
      texto,
      timestamp: horaActual(),
      local,
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
      if (abrirSiCambio && datos.actualizada > pizarraVistaRef.current && datos.contenido) setPizarraAbierta(true);
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

  const hablar = useCallback((texto: string) => {
    if (!vozActivaRef.current || !("speechSynthesis" in window)) {
      setEstado("reposo");
      return;
    }
    window.speechSynthesis.cancel();
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
    frase.onend = () => setEstado((prev) => (prev === "hablando" ? "reposo" : prev));
    frase.onerror = () => setEstado((prev) => (prev === "hablando" ? "reposo" : prev));
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
          hablar("Necesito su permiso, señor.");
        } else {
          addMensaje("jarvis", datos.texto);
          hablar(datos.texto);
        }
      } catch (err: any) {
        const aviso =
          err instanceof TypeError
            ? "No puedo comunicarme con mi servidor. Vuelve a abrir Jarvis desde su icono."
            : err?.message || "Ocurrió un error inesperado.";
        addMensaje("jarvis", aviso, true);
        showNotification(aviso, "error");
        setEstado("reposo");
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
      }
    },
    [addMensaje, hablar, showNotification, cargarRegistro, cargarPermisos, cargarRecuerdos, cargarPizarra]
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

  const responderPermiso = (aprobado: boolean, recordar: boolean) => {
    if (!confirmacion) return;
    const { id, descripcion } = confirmacion;
    setConfirmacion(null);
    addMensaje("usuario", `${aprobado ? "✔ Permitido" : "✖ No permitido"}: ${descripcion}`, true);
    hablarConServidor("/api/permiso", { id, aprobado, recordar });
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

  const iniciarDictado = useCallback(() => {
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
        showNotification("No escuché nada. Pulsa el botón e inténtalo otra vez.", "warning");
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
      if (textoFinal.trim()) enviarMensaje(textoFinal);
    };

    reconocimientoRef.current = rec;
    setDictando(true);
    setEstado("escuchando");
    try {
      rec.start();
    } catch {
      detenerDictado();
    }
  }, [detenerDictado, enviarMensaje, showNotification]);

  const toggleDictado = () => (dictando ? detenerDictado() : iniciarDictado());
  const iniciarDictadoRef = useRef(iniciarDictado);
  iniciarDictadoRef.current = iniciarDictado;

  // ---------------------------------------------------------------- detector de aplausos (segundo plano)

  const cargarMicrofonos = async () => {
    try {
      const r = await fetch("/api/aplausos/microfonos");
      if (r.ok) setMicrofonos((await r.json()).microfonos ?? []);
    } catch {
      // Se reintenta al abrir el menú
    }
  };

  const cambiarAplausos = async (cambios: { activo?: boolean; sensibilidad?: number; dispositivo?: number }) => {
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
    // Las voces de Windows se cargan un momento después de abrir la página
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, [comprobarServidor, cargarRegistro, cargarPermisos, cargarModelos, cargarRecuerdos, cargarPizarra]);

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
          addMensaje("jarvis", "A sus órdenes, señor. Le escucho.", true);
          // Esperar a que termine el saludo hablado antes de escuchar
          window.setTimeout(() => {
            if (!enviandoRef.current) iniciarDictadoRef.current?.();
          }, 2500);
        }
        ultimaActivacionRef.current = datos.activacion;
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
  }, [addMensaje]);

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
          <button
            type="button"
            onClick={apagarJarvis}
            className="ml-2 px-2 py-0.5 border border-[#ff3355]/50 text-[#ff3355] hover:bg-[#ff3355]/15 cursor-pointer flex items-center gap-1"
            title="Apagar a Jarvis por completo"
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

          {/* DETECTOR DE APLAUSOS (en segundo plano) */}
          <div className="hud-panel p-3 flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#00e5ff]" />
                <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                  Activar con aplausos
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
              <span>{aplausos?.config.activo ? "Detector encendido" : "Detector apagado"}</span>
            </button>

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
                {aplausos && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[#ff9933]"
                    style={{ left: `${Math.round(umbralPorSensibilidad(aplausos.config.sensibilidad) * 100)}%` }}
                    title="Un aplauso debe pasar esta línea"
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] mt-2">
                <span className="text-[#68a8d8]">SENSIBILIDAD (1 = poca, 10 = mucha)</span>
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
            </div>

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
                      e.texto.startsWith("¡Doble") ? "text-[#00f5a0] font-bold" : e.texto.startsWith("Ignorado") ? "text-[#68a8d8]" : "text-[#e2f8ff]"
                    }`}
                  >
                    {e.hora} · {e.texto}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
              Aplaude dos veces seguidas. Si no te detecta, sube la sensibilidad; si se activa solo, bájala.
              El sonido se analiza en tu laptop y no se graba.
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
        </section>

        {/* ================= CENTRO: REACTOR ================= */}
        <section className="lg:col-span-6 flex items-center justify-center min-h-[380px] relative">
          {pizarraAbierta && (
            <PizarraPanel
              pizarra={pizarra}
              onCerrar={() => setPizarraAbierta(false)}
              onBorrar={borrarPizarraManual}
              onCopiar={copiarPizarra}
            />
          )}
          {!pizarraAbierta && (
            <button
              type="button"
              onClick={() => setPizarraAbierta(true)}
              className="absolute top-2 right-2 z-20 px-2.5 py-1 text-[11px] font-hud-mono border border-[#00e5ff]/40 text-[#b8f4ff] bg-[#041226]/80 hover:bg-[#00e5ff]/15 cursor-pointer flex items-center gap-1"
              title="Ver la pizarra"
            >
              <PenLine className="w-3.5 h-3.5" /> Pizarra
            </button>
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
          <div className="hud-panel p-3 flex flex-col gap-2 flex-[2] min-h-[300px]">
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
              {messages.map((msg) => {
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
                    <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.texto}</p>
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

          {/* REGISTRO DE ACTIVIDAD */}
          <div className="hud-panel p-3 flex flex-col gap-2 flex-1 min-h-[160px]">
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
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 border-t border-[#00e5ff]/20 bg-[#030b18]/85 text-[11px] font-hud-mono text-[#68a8d8] z-20 shrink-0">
        <span>CONVERSACIÓN · MEMORIA · PIZARRA · CONTROL DE LA LAPTOP CON PERMISO</span>
        <span>Cerrar esta ventana no apaga a Jarvis: usa el botón "Apagar".</span>
      </footer>
    </div>
  );
}
