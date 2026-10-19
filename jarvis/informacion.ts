/**
 * Información del mundo sin claves ni costo:
 *  - Clima: Open-Meteo (https://open-meteo.com)
 *  - Noticias: titulares de Google Noticias (RSS público)
 */

const CODIGOS_CLIMA: Record<number, string> = {
  0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado",
  45: "niebla", 48: "niebla con escarcha", 51: "llovizna ligera", 53: "llovizna", 55: "llovizna intensa",
  61: "lluvia ligera", 63: "lluvia", 65: "lluvia fuerte", 71: "nevada ligera", 73: "nevada", 75: "nevada fuerte",
  80: "chubascos ligeros", 81: "chubascos", 82: "chubascos fuertes", 95: "tormenta eléctrica",
  96: "tormenta con granizo", 99: "tormenta fuerte con granizo",
};

const describir = (codigo: number) => CODIGOS_CLIMA[codigo] ?? "condición variable";

async function pedirJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

/** Clima actual y de los próximos 3 días en una ciudad. */
export async function consultarClima(ciudad: string): Promise<Record<string, unknown>> {
  const geo = await pedirJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es&format=json`
  );
  const lugar = geo.results?.[0];
  if (!lugar) return { error: `No encontré la ciudad "${ciudad}".` };

  const params = new URLSearchParams({
    latitude: String(lugar.latitude),
    longitude: String(lugar.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "3",
  });
  const d = await pedirJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const actual = d.current ?? {};
  const dias = (d.daily?.time ?? []).map((fecha: string, i: number) => ({
    fecha,
    cielo: describir(d.daily.weather_code[i]),
    maxima: `${Math.round(d.daily.temperature_2m_max[i])}°C`,
    minima: `${Math.round(d.daily.temperature_2m_min[i])}°C`,
    probabilidad_lluvia: `${d.daily.precipitation_probability_max?.[i] ?? "?"}%`,
  }));
  return {
    lugar: [lugar.name, lugar.admin1, lugar.country].filter(Boolean).join(", "),
    ahora: {
      temperatura: `${Math.round(actual.temperature_2m)}°C`,
      sensacion: `${Math.round(actual.apparent_temperature)}°C`,
      cielo: describir(actual.weather_code),
      humedad: `${actual.relative_humidity_2m}%`,
      viento: `${Math.round(actual.wind_speed_10m)} km/h`,
    },
    proximos_dias: dias,
  };
}

function limpiarXml(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Titulares recientes de Google Noticias (de México), en general o sobre un tema. */
export async function consultarNoticias(tema?: string): Promise<Record<string, unknown>> {
  const region = "hl=es-419&gl=MX&ceid=MX:es-419";
  const url = tema
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(tema)}+when:7d&${region}`
    : `https://news.google.com/rss?${region}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  const xml = await r.text();

  const noticias = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(([, item]) => {
    const campo = (nombre: string) => limpiarXml(item.match(new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`))?.[1] ?? "");
    const fuente = campo("source");
    // Google pone " - Fuente" al final del título
    const titulo = fuente ? campo("title").replace(new RegExp(`\\s+-\\s+${fuente.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : campo("title");
    const fecha = new Date(campo("pubDate"));
    return {
      titulo,
      fuente,
      fecha: Number.isNaN(fecha.getTime()) ? "" : fecha.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }),
    };
  });
  return noticias.length ? { tema: tema ?? "principales de México", noticias } : { error: "No encontré noticias sobre eso." };
}
