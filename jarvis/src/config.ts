/**
 * Configuración de la interfaz de J.A.R.V.I.S.
 * Aquí NO hay claves: la clave de Gemini vive solo en el archivo .env y la usa el servidor.
 */

export const CONFIG = {
  // Clima (Open-Meteo, no necesita clave)
  OPEN_METEO_WEATHER_URL: "https://api.open-meteo.com/v1/forecast",
  OPEN_METEO_GEOCODING_URL: "https://geocoding-api.open-meteo.com/v1/search",

  DEFAULT_LOCATION: {
    name: "Monterrey, MX",
    latitude: 25.6866,
    longitude: -100.3161,
  },

  // Duración de las notificaciones flotantes (ms)
  NOTIFICATION_DURATION_MS: 4500,

} as const;

export type ReactorState = "reposo" | "escuchando" | "pensando" | "hablando";
export type MessageRole = "usuario" | "jarvis";
export type NotificationType = "info" | "warning" | "error";

export interface HudMessage {
  id: string;
  rol: MessageRole;
  texto: string;
  timestamp: string;
  // Mensajes que no se mandan a Gemini (saludo inicial, avisos de error)
  local?: boolean;
}

export interface WeatherData {
  city: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  updatedAt: string;
}

export interface HudNotification {
  id: string;
  message: string;
  type: NotificationType;
  createdAt: number;
}
