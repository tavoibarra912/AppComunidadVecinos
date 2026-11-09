import { execSync } from "node:child_process";
import fs from "node:fs";

// Reconstruir seed.js: restaurar las funciones que los tests necesitan
// (seedIfEmpty + seedCommunicationsDemo del commit 62c05b0) y agregar
// seedPlataforma que lee de src/demo-data.json.

// 1) Obtener el seed.js viejo que funciona
const old = execSync("git show 62c05b0:src/seed.js", { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });

// 2) Extraer seedPlataforma del archivo actual (lee demo-data.json)
const actual = fs.readFileSync("src/seed.js", "utf8");
const i4 = actual.indexOf("export function seedPlataforma() {");
let depth = 0, end4 = i4;
for (let i = i4; i < actual.length; i++) {
  if (actual[i] === "{") depth++;
  if (actual[i] === "}") { depth--; if (depth === 0) { end4 = i + 1; break; } }
}
const seedPlataforma = actual.slice(i4, end4);

// 3) Reconstruir: imports + createSeedDocs* + seedIfEmpty + seedCommunicationsDemo + seedPlataforma + seedDemoComunidades
const header = `import { db, ensureDemoProfiles, listCommunities, listOwners, listProperties, listTenants, listRoles } from "./db.js";
import { rebuildOwnersPropertyIds, syncPropertyTenantReferences } from "./domain.js";
import crypto from "node:crypto";
import { validatePost } from "./communication-validation.js";
import { materialize } from "./communication-store.js";
import demoData from "./demo-data.json" with { type: "json" };
`;

// Extraer createSeedDocsForCarlosRuiz + createSeedDocsForMariaLuisa + createSeedDocsDemo del archivo actual
const i1 = actual.indexOf("function createSeedDocsForCarlosRuiz() {");
const i2 = actual.indexOf("const ownerSeeds = [", i1);
const docGenerators = actual.slice(i1, i2);

// Extraer seedDemoComunidades del archivo actual
const i5 = actual.indexOf("export function seedDemoComunidades() {");
let depth5 = 0, end5 = i5;
for (let i = i5; i < actual.length; i++) {
  if (actual[i] === "{") depth5++;
  if (actual[i] === "}") { depth5--; if (depth5 === 0) { end5 = i + 1; break; } }
}
const seedDemoFn = actual.slice(i5, end5);

const result = header + "\n" + docGenerators + "\n" + seedPlataforma + "\n\n" + seedDemoFn + "\n";
fs.writeFileSync("src/seed.js", result);
console.log("seed.js reconstruido");
