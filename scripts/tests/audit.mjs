// Auditoría estática: cada nombre usado debe estar importado o declarado.
// Cruza los exports de los módulos compartidos contra los usos de cada feature.
import fs from "node:fs";
import path from "node:path";

const ROOT = "public/js";
const problems = [];

function read(p) { return fs.readFileSync(p, "utf8"); }
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    m[1].split(",").forEach(part => {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    });
  }
  return names;
}
function importsOf(src) {
  const map = new Map(); // nombre -> módulo
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    m[1].split(",").forEach(part => {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) map.set(name, m[2]);
    });
  }
  return map;
}
function topLevelDeclarations(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
  return names;
}

// 1. Cargar exports de todos los módulos
const moduleExports = new Map(); // ruta relativa -> Set
const files = [];
const walk = dir => fs.readdirSync(dir).forEach(f => {
  const p = path.join(dir, f);
  if (fs.statSync(p).isDirectory()) walk(p);
  else if (f.endsWith(".js")) files.push(p.replaceAll("\\", "/"));
});
walk(ROOT);

for (const file of files) {
  const rel = file.replace(ROOT + "/", "");
  moduleExports.set("./" + rel, exportsOf(read(file)));
  moduleExports.set("./" + rel.replace("features/", ""), exportsOf(read(file)));
}

// 2. Por cada feature + main: verificar usos vs imports + declaraciones locales
const KNOWN_GLOBALS = new Set(["document", "window", "console", "localStorage", "fetch", "setTimeout", "crypto",
  "Number", "String", "Boolean", "Array", "Object", "JSON", "Math", "Date", "Promise", "Intl", "isNaN",
  "FormData", "File", "DataTransfer", "Option", "CustomEvent", "Event", "confirm", "alert", "parseInt",
  "parseFloat", "isNaN", "structuredClone", "WebSocket", "process"]);

for (const file of files) {
  if (file.includes("/features/")) continue;
  continue;
}
for (const file of files.filter(f => f.includes("/features/") || f.endsWith("main.js"))) {
  const src = read(file);
  const imports = importsOf(src);
  const declared = topLevelDeclarations(src);
  const sharedNames = [...moduleExports.values()].flatMap(s => [...s]);

  // Usos de nombres que parecen funciones de los módulos compartidos
  const used = new Set();
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]{2,})\s*\(/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]{2,})\b/g)) used.add(m[1]);

  for (const name of used) {
    if (imports.has(name) || declared.has(name) || KNOWN_GLOBALS.has(name)) continue;
    // ¿es un export de algún módulo compartido?
    const available = [...moduleExports.entries()].filter(([, names]) => names.has(name));
    if (available.length === 0) continue;
    // ¿el módulo que lo exporta está importado en este archivo (aunque sea sin ese nombre)?
    const importedModules = [...imports.values()];
    const wouldComeFrom = available.filter(([mod]) => importedModules.some(im => mod.endsWith(im.replace("./", "").replace("../", "")) || true));
    // Reportar solo si viene de un módulo compartido y NO está importado
    problems.push(`${path.basename(file)}: usa "${name}" (export de ${available[0][0]}) sin importarlo`);
  }
}

// 3. IDs referenciados desde JS vs HTML (revisado, versión rápida)
const html = fs.readFileSync("public/index.html", "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
let allJs = files.map(f => read(f)).join("\n");
const jsFiles = files;
const idRefs = new Set();
for (const f of jsFiles) {
  const src = read(f);
  for (const m of src.matchAll(/querySelector(?:All)?\("#([a-zA-Z0-9_-]+)"/g)) idRefs.add(m[1]);
}
const dynamicPrefixes = ["home-owner-btn", "hq-", "btn-detail-approve", "btn-detail-reject", "btn-detail-reopen", "btn-detail-subir-docs", "property-combo-option", "pager-"];
const missingIds = [...idRefs].filter(id => !htmlIds.has(id) && !dynamicPrefixes.some(p => id.startsWith(p)));
missingIds.forEach(id => problems.push(`ID "#${id}" referenciado en JS pero no existe en index.html`));

// 4. addEventListener sobre consts que pudieron quedar null por IDs eliminados
for (const f of jsFiles) {
  const src = read(f);
  // const X = document.querySelector("#id") donde el id no existe + X.addEventListener SIN guard
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*document\.querySelector\("#([a-zA-Z0-9_-]+)"\)/g)) {
    const [, varName, id] = m;
    if (htmlIds.has(id)) continue;
    // buscar uso directo sin guard
    const usage = new RegExp(`(?<![?.\\w])${varName}\\.(addEventListener|classList|value|disabled|hidden|textContent)`, "g");
    const bare = src.split("\n").filter(line => usage.test(line) && !line.includes(`if (${varName})`) && !line.includes("?") && !line.includes(`querySelector`));
    if (bare.length > 0) {
      problems.push(`${path.basename(f)}: "${varName}" apunta a #${id} (inexistente) y se usa sin guard (${bare.length} uso/s)`);
    }
  }
}

if (problems.length === 0) {
  console.log("AUDITORÍA LIMPIA: sin problemas detectados");
} else {
  console.log(`PROBLEMAS (${problems.length}):`);
  problems.forEach(p => console.log("  - " + p));
  process.exit(1);
}
