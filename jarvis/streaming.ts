/**
 * SERIES Y PELÍCULAS: "pon VisionQuest en Disney+", "quiero ver Stranger Things", "¿dónde puedo ver X?".
 * Abre en el navegador la BÚSQUEDA del título dentro del servicio (Disney+, Netflix, Prime Video...), con la sesión que el
 * usuario ya tiene abierta. Jarvis no inicia sesión ni maneja contraseñas: el usuario elige el título y le da "Reproducir"
 * (Disney+ y los demás no dejan que otros programas le den play solos). Después, pausar/seguir = teclas multimedia.
 */

export const SERVICIOS: Record<string, { nombre: string; busqueda: (t: string) => string }> = {
  disney: { nombre: "Disney+", busqueda: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}` },
  netflix: { nombre: "Netflix", busqueda: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}` },
  prime: { nombre: "Prime Video", busqueda: (t) => `https://www.primevideo.com/search/ref=atv_nb_sug?phrase=${encodeURIComponent(t)}` },
  max: { nombre: "Max", busqueda: (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}` },
  appletv: { nombre: "Apple TV", busqueda: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}` },
  youtube: { nombre: "YouTube", busqueda: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}` },
  // Si no sabe en cuál está: JustWatch dice en qué servicio de México se puede ver
  no_se: { nombre: "JustWatch (dónde verlo en México)", busqueda: (t) => `https://www.justwatch.com/mx/buscar?q=${encodeURIComponent(t)}` },
};

const ALIAS: Record<string, string> = {
  "disney+": "disney", "disney plus": "disney", disneyplus: "disney", star: "disney", "star+": "disney",
  "prime video": "prime", amazon: "prime", "amazon prime": "prime", primevideo: "prime",
  hbo: "max", "hbo max": "max", "apple tv+": "appletv", "apple tv": "appletv", apple: "appletv",
  "no se": "no_se", "no sé": "no_se", cualquiera: "no_se", "": "no_se",
};

/** "Disney Plus" → "disney". Si no se reconoce, "no_se" (buscar dónde se puede ver). */
export function servicioDe(texto: string): string {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  if (SERVICIOS[t]) return t;
  return ALIAS[t] ?? (Object.keys(SERVICIOS).find((k) => t.includes(k)) || "no_se");
}
