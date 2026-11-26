import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "../..");
const directories = [];
after(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

// Cada caso arranca un proceso limpio: db.js y seed.js memorizan el entorno y
// la base al importarse, igual que en un arranque real del servidor.
function runSeed({ marker = false, env = {} } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-demo-guard-"));
  directories.push(directory);
  const data = path.join(directory, "data");
  mkdirSync(data, { recursive: true });
  if (marker) {
    const db = new DatabaseSync(path.join(data, "penarrubia.db"));
    db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run("production-database-v1");
    db.close();
  }
  const script = `
    const seed = await import(${JSON.stringify(pathToFileURL(path.join(root, "src/seed.js")).href)});
    const { db } = await import(${JSON.stringify(pathToFileURL(path.join(root, "src/db.js")).href)});
    process.stdout.write(JSON.stringify({
      seeded: seed.seedIfEmpty(),
      communities: db.prepare("SELECT COUNT(*) AS n FROM communities").get().n,
      users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      APP_DATA_DIR: data,
      APP_UPLOADS_DIR: path.join(directory, "uploads"),
      ...env,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  // El seed escribe su propio log; el resumen del hijo es la última línea.
  return JSON.parse(result.stdout.trim().split(/\r?\n/).pop());
}

test("una base marcada como producción no recibe censo ni cuentas demo en local", () => {
  assert.deepEqual(runSeed({ marker: true }), { seeded: false, communities: 0, users: 1 });
});

test("APP_DEMO_DATA=false desactiva el censo y las cuentas demo también en local", () => {
  assert.deepEqual(runSeed({ env: { APP_DEMO_DATA: "false" } }), {
    seeded: false,
    communities: 0,
    users: 1,
  });
  const enabled = runSeed();
  assert.equal(enabled.seeded, true);
  assert.equal(enabled.communities, 7);
  assert.ok(enabled.users > 1);
});
