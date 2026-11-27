import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareCandidate } from "../prepare-production-candidate.mjs";

test("candidata: conserva contraseñas iniciales y personalizadas sin rotarlas", async (t) => {
  const source = await fs.mkdtemp(path.join(os.tmpdir(), "candidate-passwords-"));
  const privateRoot = fileURLToPath(new URL("../../.deploy-private/", import.meta.url));
  const output = path.join(privateRoot, `candidate-passwords-${crypto.randomUUID()}`);
  t.after(async () => {
    assert.equal(path.dirname(source), path.resolve(os.tmpdir()));
    assert.equal(path.dirname(output), path.resolve(privateRoot));
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(output, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(source, "data"));
  await fs.mkdir(path.join(source, "uploads"));
  await fs.writeFile(path.join(source, "data/provider-key"), crypto.randomBytes(32));
  const visualsFile = path.join(source, "visuals.json");
  await fs.writeFile(visualsFile, JSON.stringify({ marca: { colorPrimario: "#123456" } }));
  const original = new DatabaseSync(path.join(source, "data/penarrubia.db"));
  for (const table of [
    "communities",
    "owners",
    "properties",
    "documents",
    "fee_receipts",
    "fee_payments",
    "schema_migrations",
    "sessions",
    "password_recovery_requests",
    "password_recovery_mail",
  ])
    original.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY)`);
  original.exec(
    "CREATE TABLE settings(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE users(id TEXT PRIMARY KEY,usuario TEXT,activo INTEGER,passwordHash TEXT,resetToken TEXT,resetTokenExpira TEXT)",
  );
  original
    .prepare("INSERT INTO settings VALUES('general',?)")
    .run(JSON.stringify({ nombreAsociacion: "Censo", marca: { nombre: "Censo" } }));
  for (const [usuario, password] of [
    ["super_admin", "super_admin"],
    ["12345678z", "12345678z12345678"],
    ["87654321x", "MiClavePersonalElegida"],
  ]) {
    const salt = crypto.randomBytes(16).toString("hex");
    original
      .prepare("INSERT INTO users VALUES(?,?,1,?,'old-reset','old-expiry')")
      .run(
        usuario,
        usuario,
        `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`,
      );
  }
  const before = original.prepare("SELECT usuario,passwordHash FROM users ORDER BY usuario").all();
  original.close();
  const result = await prepareCandidate({ sourceDir: source, visualsFile, outputDir: output });
  assert.equal(result.credentialsRotated, 0);
  assert.equal(result.credentialsPreserved, 3);
  const candidate = new DatabaseSync(path.join(output, "data/penarrubia.db"), { readOnly: true });
  assert.deepEqual(
    candidate.prepare("SELECT usuario,passwordHash FROM users ORDER BY usuario").all(),
    before,
  );
  assert.equal(
    candidate
      .prepare("SELECT COUNT(*) AS n FROM users WHERE resetToken<>'' OR resetTokenExpira<>''")
      .get().n,
    0,
  );
  candidate.close();
  const access = JSON.parse(
    await fs.readFile(path.join(output, "accesos-produccion.json"), "utf8"),
  );
  assert.equal(access.find((u) => u.usuario === "super_admin").password, "super_admin");
  assert.equal(access.find((u) => u.usuario === "12345678z").password, "12345678z12345678");
  assert.equal(access.find((u) => u.usuario === "87654321x").password, undefined);
});
