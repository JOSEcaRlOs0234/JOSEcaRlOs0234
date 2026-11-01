/**
 * Música en YouTube: Ares busca la canción, la abre en el navegador y la controla con las "teclas multimedia"
 * de Windows (las mismas de play/pausa del teclado), así funciona aunque la ventana de YouTube no esté enfrente.
 *
 * No necesita cuenta ni clave: la búsqueda lee la página pública de resultados de YouTube y toma el primer video.
 * Si YouTube cambia su página y no se puede leer, se abre la búsqueda para que el usuario elija.
 */

export interface VideoYoutube {
  id: string;
  titulo: string;
  canal: string;
}

const ID_VALIDO = /^[A-Za-z0-9_-]{11}$/;

/** Busca dentro de los datos de YouTube los "videoRenderer" (videos normales; no shorts ni anuncios). */
function videosDeDatos(nodo: unknown, lista: VideoYoutube[], profundidad = 0): void {
  if (!nodo || typeof nodo !== "object" || lista.length >= 10 || profundidad > 40) return;
  if (Array.isArray(nodo)) {
    for (const n of nodo) videosDeDatos(n, lista, profundidad + 1);
    return;
  }
  const v = (nodo as any).videoRenderer;
  if (v && typeof v.videoId === "string" && ID_VALIDO.test(v.videoId)) {
    const texto = (t: any) => (t?.runs ?? []).map((r: any) => r?.text ?? "").join("") || t?.simpleText || "";
    lista.push({ id: v.videoId, titulo: texto(v.title).slice(0, 200), canal: texto(v.ownerText ?? v.longBylineText).slice(0, 120) });
    return;
  }
  for (const valor of Object.values(nodo as object)) videosDeDatos(valor, lista, profundidad + 1);
}

/** Saca los videos de la página de resultados de YouTube. */
export function videosDePagina(html: string): VideoYoutube[] {
  const lista: VideoYoutube[] = [];
  const inicio = html.search(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/);
  if (inicio >= 0) {
    const desde = html.indexOf("{", inicio);
    const hasta = html.indexOf(";</script>", desde);
    try {
      videosDeDatos(JSON.parse(html.slice(desde, hasta > 0 ? hasta : undefined)), lista);
    } catch {
      // Se intenta con el plan B
    }
  }
  if (!lista.length) {
    // Plan B: buscar los videos directamente en el texto
    for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"[\s\S]{0,4000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
      let titulo = m[2];
      try {
        titulo = JSON.parse(`"${m[2]}"`);
      } catch {
        // se deja como venía
      }
      lista.push({ id: m[1], titulo, canal: "" });
      if (lista.length >= 10) break;
    }
  }
  return lista;
}

export const urlDeBusqueda = (consulta: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}`;

/** Busca en YouTube y devuelve los primeros videos (vacío si no se pudo leer la página). */
export async function buscarEnYoutube(consulta: string): Promise<VideoYoutube[]> {
  const r = await fetch(urlDeBusqueda(consulta), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
      // Evita la página de "Antes de ir a YouTube" (aviso de cookies)
      Cookie: "SOCS=CAI; CONSENT=YES+1",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`YouTube respondió con un error (${r.status}).`);
  return videosDePagina(await r.text());
}

/**
 * Dirección para reproducir. Con `mix` usa la "mezcla" automática de YouTube (sigue poniendo canciones parecidas sin
 * parar), ideal para "pon música de un artista"; sin `mix` es la canción sola (YouTube igual sigue con la siguiente).
 */
export function urlParaReproducir(id: string, mix: boolean): string {
  if (!ID_VALIDO.test(id)) throw new Error("Video no válido.");
  return mix ? `https://www.youtube.com/watch?v=${id}&list=RD${id}` : `https://www.youtube.com/watch?v=${id}`;
}
