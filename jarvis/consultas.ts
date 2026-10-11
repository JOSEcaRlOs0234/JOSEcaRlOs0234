/**
 * Cuando Jarvis no sabe algo:
 *  1. buscarEnInternet: Gemini con Búsqueda de Google (gratis, usa la misma clave de Gemini).
 *  2. consultarAClaude: le pregunta a Claude (de Anthropic). Es opcional, necesita su propia clave
 *     (ANTHROPIC_API_KEY en .env) y cada consulta cuesta unos centavos, por eso siempre pide permiso.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

const MODELO_CLAUDE = "claude-opus-5-5";

export function claudeConfigurado(): boolean {
  const clave = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return clave.startsWith("sk-ant-") && clave.length > 30;
}

/** Busca información actual en internet con Gemini + Búsqueda de Google. */
export async function buscarEnInternet(ai: GoogleGenAI, modelo: string, pregunta: string): Promise<string> {
  const respuesta = await ai.models.generateContent({
    model: modelo,
    contents: pregunta,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        "Responde en español, breve y con datos concretos y actuales encontrados en la búsqueda. Si no encuentras la respuesta, dilo.",
    },
  });
  return respuesta.text?.trim() || "No encontré información sobre eso.";
}

export interface Informe {
  resumen: string; // 1 o 2 frases para decir en voz alta
  informe: string; // texto completo para la pizarra (con títulos y viñetas)
  fuentes: { titulo: string; url: string }[];
}

/**
 * Investigación a fondo: busca en Google y arma un informe completo y ordenado, con las páginas de donde salió.
 * El modelo y la búsqueda son los mismos que "investigar" (gratis con la clave de Gemini), pero pide más detalle.
 */
export async function investigarAFondo(ai: GoogleGenAI, modelo: string, tema: string): Promise<Informe> {
  const respuesta = await ai.models.generateContent({
    model: modelo,
    contents: `Investiga a fondo y explícame: ${tema}`,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        "Eres un investigador que explica en español claro, para alguien sin conocimientos previos. Busca en internet " +
        "información actual y confiable. Responde EXACTAMENTE así:\n" +
        "RESUMEN: (1 o 2 frases con lo más importante)\n" +
        "Después, un informe ordenado con títulos que empiecen con '## ', viñetas con '- ', pasos con '1. ' y " +
        "**negritas** para lo clave. Organízalo en estas secciones (las que apliquen): Qué es, Cómo funciona, Partes o " +
        "tipos, Historia o contexto, Datos y cifras actuales, Ejemplos, Ventajas y desventajas, Curiosidades y Resumen. " +
        "Explica a profundidad pero con palabras sencillas, con ejemplos de la vida diaria. Incluye datos concretos " +
        "(fechas, cifras, nombres). Entre 600 y 1000 palabras. No inventes: si algo no está claro, dilo.",
    },
  });
  const texto = respuesta.text?.trim() || "";
  const coincidencia = texto.match(/^\s*RESUMEN:\s*(.+)$/im);
  const resumen = coincidencia?.[1]?.trim() || texto.split("\n").find((l) => l.trim())?.trim() || "No encontré información.";
  const informe = texto.replace(/^\s*RESUMEN:.*$/im, "").trim();

  // Páginas consultadas por la búsqueda de Google (sin repetir)
  const fuentes: Informe["fuentes"] = [];
  for (const trozo of (respuesta.candidates?.[0] as any)?.groundingMetadata?.groundingChunks ?? []) {
    const url = trozo?.web?.uri;
    if (typeof url === "string" && /^https?:\/\//.test(url) && !fuentes.some((f) => f.url === url)) {
      fuentes.push({ titulo: String(trozo.web.title || new URL(url).hostname).slice(0, 80), url });
    }
    if (fuentes.length >= 8) break;
  }
  return { resumen, informe: informe || resumen, fuentes };
}

let cliente: Anthropic | null = null;

/** Le hace una pregunta a Claude. Claude puede buscar en internet si lo necesita. */
export async function consultarAClaude(pregunta: string, contexto: string): Promise<string> {
  if (!claudeConfigurado()) {
    throw new Error("SIN_CLAVE_CLAUDE");
  }
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: 120_000 });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: contexto ? `${pregunta}\n\nContexto: ${contexto}` : pregunta },
  ];

  // Con búsqueda web, Claude puede pausar ("pause_turn"); se le deja continuar unas veces
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const respuesta = await cliente.beta.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: 16000,
      // Si Claude declina por seguridad, Anthropic reintenta automáticamente con otro modelo
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system:
        "Eres un experto al que consulta J.A.R.V.I.S., un asistente personal en español. " +
        "Responde en español, claro y directo, en un máximo de 6 frases, porque tu respuesta se leerá en voz alta. " +
        "Si necesitas información actual, busca en internet. Si no estás seguro, dilo.",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages,
    });

    if (respuesta.stop_reason === "refusal") {
      return "Claude prefirió no responder esa pregunta.";
    }
    if (respuesta.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: respuesta.content });
      continue;
    }
    const texto = respuesta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return texto || "Claude no dio una respuesta.";
  }
  return "Claude tardó demasiado en responder.";
}

/** Traduce los errores de Claude a palabras sencillas. */
export function explicarErrorClaude(err: unknown): string {
  if (err instanceof Error && err.message === "SIN_CLAVE_CLAUDE") {
    return "La conexión con Claude no está configurada (falta su clave). Dile al usuario que puede activarla con 'Configurar Claude'.";
  }
  if (err instanceof Anthropic.AuthenticationError) return "La clave de Claude no es válida.";
  if (err instanceof Anthropic.PermissionDeniedError) return "La clave de Claude no tiene permiso para esto.";
  if (err instanceof Anthropic.RateLimitError) return "Claude está ocupado o se acabó el saldo de la cuenta. Intenta más tarde.";
  if (err instanceof Anthropic.BadRequestError && /credit|balance/i.test(err.message)) {
    return "La cuenta de Claude no tiene saldo. Hay que agregar crédito en console.anthropic.com.";
  }
  if (err instanceof Anthropic.APIConnectionError) return "No me pude conectar con Claude. Revisa el internet.";
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return "Los servidores de Claude tienen un problema temporal.";
  return "No pude consultar a Claude.";
}
