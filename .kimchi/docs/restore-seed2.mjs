import { execSync } from "node:child_process";
import fs from "node:fs";

// Obtener el seed.js del commit que tiene las funciones que los tests necesitan
const old = execSync("git show 62c05b0:src/seed.js", { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });

// Extraer desde seedIfEmpty hasta el final del archivo (incluye seedCommunicationsDemo)
const i1 = old.indexOf("export function seedIfEmpty() {");
if (i1 < 0) { console.error("seedIfEmpty NO EN OLD"); process.exit(1); }
const funciones = old.slice(i1);

// Insertar al final del archivo actual (antes de nada que pueda romper)
let t = fs.readFileSync("src/seed.js", "utf8");
// quitar seedDemoComunidades duplicado si existe (está en la parte nueva)
const idx = t.indexOf("export function seedDemoComunidades() {");
if (idx > 0) {
  // encontrar el cierre
  let depth = 0, end = idx;
  for (let i = idx; i < t.length; i++) {
    if (t[i] === "{") depth++;
    if (t[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  // extraer seedDemoComunidades para volver a agregarla después
  const seedDemoFn = t.slice(idx, end);
  t = t.slice(0, idx) + t.slice(end);
  t = t + "\n\n" + funciones + "\n\n" + seedDemoFn;
} else {
  t = t + "\n\n" + funciones;
}

fs.writeFileSync("src/seed.js", t);
console.log("OK");
