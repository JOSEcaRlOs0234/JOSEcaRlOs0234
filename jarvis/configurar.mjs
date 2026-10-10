/**
 * Asistente para guardar tu clave de Gemini en el archivo .env
 * Lo abre automáticamente "Encender Jarvis.bat" si todavía no hay clave.
 * También puedes usarlo para cambiar la clave: escribe  npm run configurar
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import readline from "readline/promises";
import { fileURLToPath } from "url";

const carpeta = path.dirname(fileURLToPath(import.meta.url));
const archivoEnv = path.join(carpeta, ".env");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("");
console.log("  ===============================================");
console.log("   Configuración de la clave de Gemini");
console.log("  ===============================================");
console.log("  1. Copia tu clave de https://aistudio.google.com/apikey");
console.log("  2. Pégala aquí con clic derecho (o Ctrl+V) y presiona Enter.");
console.log("");

let clave = "";
while (true) {
  clave = (await rl.question("  Pega tu clave: ")).trim().replace(/^["']|["']$/g, "");
  if (clave.length < 30 || /\s/.test(clave)) {
    console.log("  Esa clave parece incompleta. Cópiala de nuevo completa (sin espacios).\n");
    continue;
  }

  process.stdout.write("  Probando la clave con Google... ");
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": clave },
    });
    if (r.ok) {
      console.log("¡funciona!");
      break;
    }
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      console.log("Google dice que la clave NO es válida. Revisa que la copiaste completa.\n");
      continue;
    }
    console.log(`Google respondió con un error (${r.status}). La guardo de todos modos.`);
    break;
  } catch {
    console.log("no pude conectarme a internet para probarla. La guardo de todos modos.");
    break;
  }
}
rl.close();

// Guardar la clave conservando las demás líneas que ya existan en .env
const lineas = existsSync(archivoEnv)
  ? readFileSync(archivoEnv, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("GEMINI_API_KEY="))
  : ["# Claves secretas de Jarvis. NO compartas ni subas este archivo a internet."];
lineas.push(`GEMINI_API_KEY=${clave}`);
writeFileSync(archivoEnv, lineas.join("\r\n") + "\r\n", "utf8");

console.log("");
console.log("  Clave guardada en el archivo .env (solo vive en tu laptop).");
console.log("");
