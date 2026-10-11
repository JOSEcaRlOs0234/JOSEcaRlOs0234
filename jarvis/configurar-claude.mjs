/**
 * Guarda la clave de Claude (Anthropic) en el archivo .env para que Jarvis pueda consultarle
 * cuando no sepa algo. Lo abre "Configurar Claude.bat".
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import readline from "readline/promises";
import { ARCHIVO_ENV, prepararDatos } from "./ubicacion.mjs";

prepararDatos();
const archivoEnv = ARCHIVO_ENV;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("");
console.log("  ===============================================");
console.log("   Conectar a Jarvis con Claude");
console.log("  ===============================================");
console.log("  1. Crea tu clave en https://console.anthropic.com/settings/keys");
console.log("  2. Pégala aquí con clic derecho (o Ctrl+V) y presiona Enter.");
console.log("     (Para cancelar, cierra esta ventana.)");
console.log("");

let clave = "";
while (true) {
  clave = (await rl.question("  Pega tu clave de Claude: ")).trim().replace(/^["']|["']$/g, "");
  if (!clave.startsWith("sk-ant-") || clave.length < 30 || /\s/.test(clave)) {
    console.log("  Esa clave no parece de Claude (debe empezar con sk-ant-). Cópiala de nuevo completa.\n");
    continue;
  }
  process.stdout.write("  Probando la clave con Anthropic... ");
  try {
    // Listar modelos no cuesta nada y confirma que la clave sirve
    await new Anthropic({ apiKey: clave }).models.list({ limit: 1 });
    console.log("¡funciona!");
    break;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.log("Anthropic dice que la clave NO es válida. Revisa que la copiaste completa.\n");
      continue;
    }
    if (err instanceof Anthropic.APIConnectionError) {
      console.log("no pude conectarme a internet para probarla. La guardo de todos modos.");
      break;
    }
    console.log(`respondió con un error (${err?.status ?? "?"}). La guardo de todos modos.`);
    break;
  }
}
rl.close();

const lineas = existsSync(archivoEnv)
  ? readFileSync(archivoEnv, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("ANTHROPIC_API_KEY="))
  : ["# Claves secretas de Jarvis. NO compartas ni subas este archivo a internet."];
lineas.push(`ANTHROPIC_API_KEY=${clave}`);
writeFileSync(archivoEnv, lineas.join("\r\n") + "\r\n", "utf8");

console.log("");
console.log("  Clave de Claude guardada en el archivo .env (solo vive en tu laptop).");
console.log("  Vuelve a abrir Jarvis para que la use.");
console.log("");
