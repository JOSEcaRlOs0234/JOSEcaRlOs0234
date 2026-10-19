// Revisa que estén instaladas todas las piezas de package.json (sale con 1 si falta alguna)
const fs = require("fs");
const path = require("path");
const p = require("./package.json");
const faltan = Object.keys({ ...p.dependencies }).filter((d) => !fs.existsSync(path.join(__dirname, "node_modules", d)));
process.exit(faltan.length ? 1 : 0);
