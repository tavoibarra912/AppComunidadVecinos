import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Obtener seed.js del commit 62c05b0 (que tiene seedIfEmpty y seedCommunicationsDemo)
const old = execSync("git show 62c05b0:src/seed.js", { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });

const i1 = old.indexOf("export function seedIfEmpty() {");
const i2 = old.indexOf("export function createSeedDocsDemo(");
if (i1 < 0 || i2 < 0) { console.error("NO EN OLD"); process.exit(1); }
const funciones = old.slice(i1, i2);

let t = fs.readFileSync("src/seed.js", "utf8");
const ancla = "export function seedPlataforma() {";
t = t.replace(ancla, funciones + "\n" + ancla);
fs.writeFileSync("src/seed.js", t);
console.log("OK");
