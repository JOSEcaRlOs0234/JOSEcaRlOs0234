import { CONFIG, WeatherData } from "../config";

export interface GeoCityResult {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

const WMO_CODES_ES: Record<number, string> = {
  0: "Cielo despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla atmosférica",
  48: "Niebla de escarcha",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna densa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  71: "Nevada ligera",
  73: "Nevada moderada",
  75: "Nevada intensa",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos fuertes",
  95: "Tormenta eléctrica",
  96: "Tormenta con granizo",
  99: "Tormenta severa",
};

export function getWeatherDescription(code: number): string {
  return WMO_CODES_ES[code] || "Condición estable";
}

/**
 * Busca coordenadas de una ciudad por nombre usando Open-Meteo Geocoding API.
 */
export async function searchCityCoordinates(
  query: string
): Promise<GeoCityResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const url = `${CONFIG.OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(
    cleanQuery
  )}&count=5&language=es&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo Geocoding error (${res.status})`);
  }

  const data = await res.json();
  if (!data.results || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item: any) => ({
    name: item.name,
    country: item.country_code || item.country || "",
    admin1: item.admin1,
    latitude: item.latitude,
    longitude: item.longitude,
  }));
}

/**
 * Obtiene el clima actual en tiempo real desde Open-Meteo.
 */
export async function fetchWeatherByCoords(
  cityName: string,
  latitude: number,
  longitude: number
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    timezone: "auto",
  });

  const url = `${CONFIG.OPEN_METEO_WEATHER_URL}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Open-Meteo API falló con código ${res.status}`);
  }

  const data = await res.json();
  const current = data.current;
  if (!current) {
    throw new Error("Respuesta meteorológica incompleta de Open-Meteo");
  }

  const code = Number(current.weather_code ?? 0);

  return {
    city: cityName,
    temperature: Math.round(Number(current.temperature_2m ?? 0) * 10) / 10,
    apparentTemperature:
      Math.round(Number(current.apparent_temperature ?? 0) * 10) / 10,
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    windSpeed: Math.round(Number(current.wind_speed_10m ?? 0) * 10) / 10,
    weatherCode: code,
    description: getWeatherDescription(code),
    updatedAt: new Date().toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
