import { execSync } from "node:child_process";
import fs from "node:fs";

// 1) Obtener el seed.js COMPLETO del commit 62c05b0 (que hace pasar todos los tests)
const old = execSync("git show 62c05b0:src/seed.js", { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });

// 2) Extraer seedDemoComunidades del archivo actual (la que crea las 3 comunidades demo)
const actual = fs.readFileSync("src/seed.js", "utf8");
const i5 = actual.indexOf("export function seedDemoComunidades() {");
if (i5 < 0) { console.error("seedDemoComunidades NO ENCONTRADA"); process.exit(1); }
let depth = 0, end5 = i5;
for (let i = i5; i < actual.length; i++) {
  if (actual[i] === "{") depth++;
  if (actual[i] === "}") { depth--; if (depth === 0) { end5 = i + 1; break; } }
}
const seedDemoFn = actual.slice(i5, end5);

// 3) En el commit viejo, buscar dónde termina seedCommunicationsDemo (última función)
const lastBrace = old.lastIndexOf("\n}");

// 4) El nuevo seed.js = commit viejo + seedDemoComunidades del actual
const nuevo = old.slice(0, lastBrace + 1) + "\n\n" + seedDemoFn + "\n";

// 5) Importar demo-data.json
const conImport = nuevo.replace(
  'import { validatePost } from "./communication-validation.js";',
  'import { validatePost } from "./communication-validation.js";\nimport demoData from "./demo-data.json" with { type: "json" };'
);

fs.writeFileSync("src/seed.js", conImport);
console.log("seed.js reconstruido desde 62c05b0 + seedDemoComunidades");
