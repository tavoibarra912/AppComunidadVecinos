import { execSync } from "node:child_process";
import fs from "node:fs";

// Obtener el seed.js COMPLETO del commit 62c05b0 (que funciona para tests)
const old = execSync("git show 62c05b0:src/seed.js", { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });

// Obtener seedDemoComunidades del archivo actual
const actual = fs.readFileSync("src/seed.js", "utf8");
const i5 = actual.indexOf("export function seedDemoComunidades() {");
if (i5 < 0) { console.error("seedDemoComunidades NO EN ACTUAL"); process.exit(1); }
let depth = 0, end5 = i5;
for (let i = i5; i < actual.length; i++) {
  if (actual[i] === "{") depth++;
  if (actual[i] === "}") { depth--; if (depth === 0) { end5 = i + 1; break; } }
}
const seedDemoFn = actual.slice(i5, end5);

// El commit 62c05b0 tiene seedIfEmpty + seedCommunicationsDemo que los tests necesitan
// Agregar seedDemoComunidades al final
fs.writeFileSync("src/seed.js", old + "\n\n" + seedDemoFn + "\n");
console.log("seed.js reconstruido desde 62c05b0 + seedDemoComunidades");
