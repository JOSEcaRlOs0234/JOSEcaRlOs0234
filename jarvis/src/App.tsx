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
  const [messages, setMessages] = useState<HudMessage[]>([MENSAJE_INICIAL]);
  const messagesRef = useRef<HudMessage[]>([MENSAJE_INICIAL]);
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

  // Notificaciones
  const [notifications, setNotifications] = useState<HudNotification[]>([]);

  // Micrófono para el detector de aplausos
  const [micActive, setMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [micDenegado, setMicDenegado] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRafRef = useRef<number | null>(null);

  // Detector de doble aplauso
  const [umbralAplauso, setUmbralAplauso] = useState<number>(() => {
    const v = parseFloat(leerPreferencia("jarvis_umbral_aplauso", String(CONFIG.UMBRAL_APLAUSO)));
    return !Number.isNaN(v) && v >= 0.05 && v <= 0.95 ? v : CONFIG.UMBRAL_APLAUSO;
  });
  const [avisoAplauso, setAvisoAplauso] = useState("Pulsa \"Encender micrófono\" para probar el detector.");
  const umbralRef = useRef(umbralAplauso);
  const estadoRef = useRef<ReactorState>(estado);
  const ultimoPicoMsRef = useRef(0);
  const ultimaActivacionMsRef = useRef(0);
  const enPicoRef = useRef(false);

  useEffect(() => {
    umbralRef.current = umbralAplauso;
  }, [umbralAplauso]);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
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

  const comprobarServidor = useCallback(async () => {
    try {
      const r = await fetch("/api/estado");
      if (!r.ok) throw new Error();
      setServidor(await r.json());
    } catch {
      setServidor("sin_conexion");
    }
  }, []);

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

  const enviarMensaje = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      if (!limpio || enviandoRef.current) return;

      enviandoRef.current = true;
      setEnviando(true);
      addMensaje("usuario", limpio);
      setEstado("pensando");

      // Solo se manda a Gemini la conversación real (sin avisos locales)
      const historial = messagesRef.current
        .filter((m) => !m.local)
        .map((m) => ({ rol: m.rol, texto: m.texto }));

      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial }),
        });
        const datos = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
        addMensaje("jarvis", datos.texto);
        hablar(datos.texto);
      } catch (err: any) {
        const aviso =
          err instanceof TypeError
            ? "No puedo comunicarme con mi servidor. ¿Sigue abierta la ventana negra de Jarvis?"
            : err?.message || "Ocurrió un error inesperado.";
        addMensaje("jarvis", aviso, true);
        showNotification(aviso, "error");
        setEstado("reposo");
      } finally {
        enviandoRef.current = false;
        setEnviando(false);
        cargarRegistro();
      }
    },
    [addMensaje, hablar, showNotification, cargarRegistro]
  );

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

  // ---------------------------------------------------------------- detector de aplausos (navegador)

  const detenerMicrofono = useCallback(() => {
    if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current);
    audioRafRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    enPicoRef.current = false;
    ultimoPicoMsRef.current = 0;
    setMicActive(false);
    setMicVolume(0);
    setFrequencyData(null);
    setAvisoAplauso("Micrófono apagado.");
  }, []);

  const detectarDobleAplauso = useCallback(
    (volumen: number) => {
      // Mientras Jarvis piensa o habla no se cuentan aplausos
      if (estadoRef.current === "hablando" || estadoRef.current === "pensando") return;

      const ahora = performance.now();
      if (ultimaActivacionMsRef.current > 0 && ahora - ultimaActivacionMsRef.current < CONFIG.PAUSA_TRAS_ACTIVAR_MS) {
        return;
      }

      const umbral = umbralRef.current;
      if (volumen >= umbral && !enPicoRef.current) {
        enPicoRef.current = true;
        const diferencia = ahora - ultimoPicoMsRef.current;
        if (
          ultimoPicoMsRef.current > 0 &&
          diferencia >= CONFIG.INTERVALO_APLAUSOS.MIN_MS &&
          diferencia <= CONFIG.INTERVALO_APLAUSOS.MAX_MS
        ) {
          ultimaActivacionMsRef.current = ahora;
          ultimoPicoMsRef.current = 0;
          setAvisoAplauso("¡Doble aplauso detectado!");
          const saludo = "A sus órdenes, señor.";
          addMensaje("jarvis", saludo, true);
          hablar(saludo);
        } else {
          ultimoPicoMsRef.current = ahora;
          setAvisoAplauso(`Primer aplauso (${volumen.toFixed(2)}). Esperando el segundo...`);
        }
      } else if (volumen < umbral * 0.65) {
        enPicoRef.current = false;
      }
    },
    [addMensaje, hablar]
  );

  const medirVolumen = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const tiempo = new Uint8Array(analyser.fftSize);
    const frecuencias = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(tiempo);
    analyser.getByteFrequencyData(frecuencias);

    let suma = 0;
    for (let i = 0; i < tiempo.length; i++) {
      const n = (tiempo[i] - 128) / 128;
      suma += n * n;
    }
    const volumen = Math.min(1, Math.sqrt(suma / tiempo.length) * 3.8);
    setMicVolume(volumen);
    setFrequencyData(frecuencias);
    detectarDobleAplauso(volumen);
    audioRafRef.current = requestAnimationFrame(medirVolumen);
  }, [detectarDobleAplauso]);

  const iniciarMicrofono = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.35;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      audioRafRef.current = requestAnimationFrame(medirVolumen);
      setMicActive(true);
      setMicDenegado(false);
      setAvisoAplauso("Escuchando aplausos. Aplaude dos veces seguidas.");
    } catch (err: any) {
      setMicDenegado(true);
      setMicActive(false);
      const msg =
        err?.name === "NotAllowedError"
          ? "No diste permiso para usar el micrófono."
          : "No pude usar el micrófono.";
      setAvisoAplauso(msg);
      showNotification(msg, "error");
    }
  }, [medirVolumen, showNotification]);

  const cambiarUmbral = (valor: number) => {
    setUmbralAplauso(valor);
    guardarPreferencia("jarvis_umbral_aplauso", String(valor));
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
    // Las voces de Windows se cargan un momento después de abrir la página
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, [comprobarServidor, cargarRegistro]);

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
    return () => {
      detenerMicrofono();
      detenerDictado();
    };
  }, [detenerMicrofono, detenerDictado]);

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
      ? { texto: `Clave de Gemini lista · ${servidor.modelo}`, color: "text-[#00f5a0]" }
      : { texto: "Falta la clave de Gemini", color: "text-[#ff9933]" };

  return (
    <div className="hud-viewport-bg relative w-screen h-screen overflow-hidden flex flex-col justify-between p-2.5 sm:p-4 text-[#e2f8ff]">
      <NotificationStack notifications={notifications} onDismiss={dismissNotification} />

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
            onClick={comprobarServidor}
            className="p-1 text-[#00e5ff] hover:bg-[#00e5ff]/15 cursor-pointer"
            title="Volver a comprobar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
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

          {/* DETECTOR DE DOBLE APLAUSO (versión de prueba en el navegador) */}
          <div className="hud-panel p-3 flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-[#00e5ff]/20 pb-1.5">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#00e5ff]" />
                <h2 className="font-hud-display text-xs font-bold tracking-wider uppercase text-[#e2f8ff]">
                  Detector de aplausos
                </h2>
              </div>
              <span className="font-hud-mono text-[10px] text-[#00e5ff]">{micActive ? "ACTIVO" : "APAGADO"}</span>
            </div>

            <button
              type="button"
              onClick={() => (micActive ? detenerMicrofono() : iniciarMicrofono())}
              className={`w-full py-2 px-3 text-xs font-hud-display font-bold uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                micActive
                  ? "bg-[#00f5a0]/20 border-[#00f5a0] text-[#00f5a0]"
                  : "bg-[#00e5ff]/25 border-[#00e5ff] text-[#e2f8ff] hover:bg-[#00e5ff]/40"
              }`}
            >
              {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span>{micActive ? "Apagar micrófono" : "Encender micrófono"}</span>
            </button>

            <div
              className={`p-2 border text-[11px] font-hud-mono leading-snug ${
                avisoAplauso.startsWith("¡Doble")
                  ? "bg-[#042b22]/90 border-[#00f5a0] text-[#00f5a0] font-bold"
                  : micDenegado
                  ? "bg-[#260710]/90 border-[#ff3355] text-[#ffb8c6]"
                  : "bg-[#041226]/90 border-[#00e5ff]/30 text-[#b8f4ff]"
              }`}
            >
              {avisoAplauso}
            </div>

            <div className="bg-[#041226]/80 border border-[#00e5ff]/20 p-2 font-hud-mono">
              <div className="flex items-center justify-between text-[10px] text-[#68a8d8]">
                <span>VOLUMEN</span>
                <span className={micVolume >= umbralAplauso ? "text-[#00f5a0] font-bold" : "text-[#e2f8ff]"}>
                  {Math.round(micVolume * 100)}%
                </span>
              </div>
              <div className="relative mt-1.5 h-3 w-full bg-[#020813] border border-[#00e5ff]/30 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    micVolume >= umbralAplauso ? "bg-[#00f5a0]" : "bg-[#00e5ff]"
                  }`}
                  style={{ width: `${Math.min(100, Math.round(micVolume * 100))}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#ff9933]"
                  style={{ left: `${Math.min(100, Math.round(umbralAplauso * 100))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] mt-2">
                <span className="text-[#68a8d8]">SENSIBILIDAD (más a la derecha = menos sensible)</span>
                <span className="text-[#00e5ff] font-bold">{umbralAplauso.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.01"
                value={umbralAplauso}
                onChange={(e) => cambiarUmbral(parseFloat(e.target.value))}
                className="w-full mt-1.5 accent-[#00e5ff] cursor-pointer"
              />
            </div>
            <p className="text-[10px] font-hud-mono text-[#68a8d8] leading-snug">
              Versión de prueba: solo funciona con esta página abierta. En la Fase 3 funcionará en segundo plano.
            </p>
          </div>
        </section>

        {/* ================= CENTRO: REACTOR ================= */}
        <section className="lg:col-span-6 flex items-center justify-center min-h-[380px] relative">
          <ReactorCore
            estado={estado}
            dictando={dictando}
            micVolume={micVolume}
            frequencyData={frequencyData}
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
        <span>FASE 1 · CONVERSACIÓN</span>
        <span>Para apagar a Jarvis, cierra la ventana negra.</span>
      </footer>
    </div>
  );
}
