/**
 * Correo de Gmail: revisar, leer y mandar correos.
 *
 * Se conecta con una "contraseña de aplicación" de Google (16 letras que el usuario crea en su cuenta).
 * Se guarda solo en el .env de la laptop (GMAIL_USUARIO y GMAIL_CLAVE_APP) y se puede revocar en cualquier
 * momento desde la cuenta de Google. Jarvis NO puede borrar correos (no hay herramienta para eso).
 */

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

export const MAX_TEXTO_CORREO = 6000;

interface Cuenta {
  usuario: string;
  clave: string;
}

function cuenta(): Cuenta | null {
  const usuario = process.env.GMAIL_USUARIO?.trim() ?? "";
  const clave = (process.env.GMAIL_CLAVE_APP ?? "").replace(/\s+/g, "");
  return usuario && clave ? { usuario, clave } : null;
}

export const correoConfigurado = () => cuenta() !== null;
export const usuarioCorreo = () => cuenta()?.usuario ?? "";

export function correoValido(texto: string): boolean {
  return /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(texto.trim());
}

/** Abre una conexión con la bandeja de Gmail, hace lo que se pide y la cierra. */
async function conBandeja<T>(c: Cuenta, hacer: (imap: ImapFlow) => Promise<T>): Promise<T> {
  const imap = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: c.usuario, pass: c.clave },
    logger: false,
    socketTimeout: 30_000,
  });
  imap.on("error", () => {});
  await imap.connect();
  try {
    const candado = await imap.getMailboxLock("INBOX");
    try {
      return await hacer(imap);
    } finally {
      candado.release();
    }
  } finally {
    await imap.logout().catch(() => imap.close());
  }
}

function cuentaObligatoria(): Cuenta {
  const c = cuenta();
  if (!c) throw new Error("SIN_CORREO");
  return c;
}

/** Comprueba que el correo y la contraseña de aplicación sirven (se usa al conectar desde el panel). */
export async function probarCuenta(usuario: string, clave: string): Promise<void> {
  await conBandeja({ usuario: usuario.trim(), clave: clave.replace(/\s+/g, "") }, async () => undefined);
}

export interface ResumenCorreo {
  id: number;
  de: string;
  asunto: string;
  fecha: string;
  fechaMs?: number; // la fecha exacta (para ordenar o filtrar por días)
  leido: boolean;
}

const fechaLegible = (d?: Date | string) =>
  d ? new Date(d).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * Lista los correos más recientes de la bandeja de entrada.
 * `buscar` usa la búsqueda de Gmail (por ejemplo "from:banco", "factura", "is:important").
 */
export async function revisarCorreos(opciones: { buscar?: string; soloNoLeidos?: boolean; cantidad?: number }): Promise<ResumenCorreo[]> {
  const cantidad = Math.min(Math.max(opciones.cantidad ?? 10, 1), 20);
  return conBandeja(cuentaObligatoria(), async (imap) => {
    const criterio: Record<string, unknown> = {};
    if (opciones.soloNoLeidos) criterio.seen = false;
    if (opciones.buscar?.trim()) criterio.gmraw = opciones.buscar.trim();
    if (!Object.keys(criterio).length) criterio.all = true;
    const ids = ((await imap.search(criterio, { uid: true })) || []) as number[];
    const ultimos = ids.slice(-cantidad);
    if (!ultimos.length) return [];
    const lista: (ResumenCorreo & { orden: number })[] = [];
    for await (const m of imap.fetch(ultimos, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
      const remitente = m.envelope?.from?.[0];
      lista.push({
        id: m.uid,
        de: remitente ? (remitente.name ? `${remitente.name} <${remitente.address}>` : String(remitente.address)) : "(desconocido)",
        asunto: m.envelope?.subject || "(sin asunto)",
        fecha: fechaLegible(m.envelope?.date ?? (m.internalDate as Date | undefined)),
        fechaMs: new Date((m.envelope?.date ?? m.internalDate) as any).getTime() || undefined,
        leido: m.flags?.has("\\Seen") ?? false,
        orden: m.uid,
      });
    }
    return lista.sort((a, b) => b.orden - a.orden).map(({ orden, ...r }) => r);
  });
}

export interface CorreoCompleto extends ResumenCorreo {
  para: string;
  texto: string;
  adjuntos: string[];
  idMensaje?: string;
}

/** Lee un correo completo (solo el texto; los adjuntos solo se mencionan por nombre). */
export async function leerCorreo(id: number): Promise<CorreoCompleto | null> {
  return conBandeja(cuentaObligatoria(), async (imap) => {
    const m = await imap.fetchOne(String(id), { uid: true, source: true, flags: true }, { uid: true });
    if (!m || !m.source) return null;
    const c = await simpleParser(m.source);
    let texto = c.text?.trim() || "";
    if (!texto && typeof c.html === "string") {
      texto = c.html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    const direcciones = (v: any) => (Array.isArray(v) ? v.map((x) => x.text).join(", ") : v?.text ?? "");
    return {
      id,
      de: direcciones(c.from),
      para: direcciones(c.to),
      asunto: c.subject || "(sin asunto)",
      fecha: fechaLegible(c.date),
      leido: m.flags?.has("\\Seen") ?? false,
      texto: texto.length > MAX_TEXTO_CORREO ? texto.slice(0, MAX_TEXTO_CORREO) + "…" : texto,
      adjuntos: (c.attachments ?? []).map((a) => a.filename || "adjunto").slice(0, 20),
      idMensaje: c.messageId,
    };
  });
}

/** Manda un correo desde la cuenta del usuario. Si `respuestaA` trae un correo, se manda como respuesta a ese. */
export async function enviarCorreo(datos: {
  para: string[];
  asunto: string;
  texto: string;
  respuestaA?: CorreoCompleto | null;
}): Promise<void> {
  const c = cuentaObligatoria();
  const transporte = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: c.usuario, pass: c.clave },
  });
  await transporte.sendMail({
    from: c.usuario,
    to: datos.para.join(", "),
    subject: datos.asunto,
    text: datos.texto,
    ...(datos.respuestaA?.idMensaje ? { inReplyTo: datos.respuestaA.idMensaje, references: [datos.respuestaA.idMensaje] } : {}),
  });
}

/** Traduce los errores del correo a palabras sencillas. */
export function explicarErrorCorreo(err: unknown): string {
  const e = err as any;
  const texto = String(e?.message ?? err ?? "");
  if (texto === "SIN_CORREO") return "El correo no está conectado. El usuario puede conectarlo en el panel 'Correo (Gmail)'.";
  if (e?.authenticationFailed || e?.responseCode === 535 || /AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|535/i.test(texto + " " + (e?.responseText ?? ""))) {
    return "Google no aceptó el correo o la contraseña de aplicación. Revisa que sea la contraseña de aplicación de 16 letras (no tu contraseña normal).";
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|getaddrinfo|socket/i.test(texto)) {
    return "No me pude conectar con Gmail. Revisa el internet.";
  }
  if (/IMAP.*disabled|Web login required|Application-specific password required/i.test(texto + " " + (e?.responseText ?? ""))) {
    return "Google pide una contraseña de aplicación para este correo (la contraseña normal no sirve).";
  }
  return "Ocurrió un problema con el correo.";
}
