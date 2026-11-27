import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { verifyExistingData, verifyComposeConfig } from "../../deploy/verify-existing-data.mjs";

test("protección: Compose mantiene los directorios del servidor y no crea rutas vacías", () => {
  const appRoot = path.resolve(os.tmpdir(), "production-app");
  const api = {
    image: "comunidad:checked",
    environment: {
      NODE_ENV: "production",
      APP_DATA_DIR: "/app/data",
      APP_UPLOADS_DIR: "/app/uploads",
      APP_REQUIRE_EXISTING_DB: "true",
      APP_DEMO_DATA: "false",
      APP_DEMO_PROFILES: "false",
    },
    volumes: ["data", "uploads"].map((name) => ({
      type: "bind",
      source: path.join(appRoot, name),
      target: `/app/${name}`,
      bind: { create_host_path: false },
    })),
  };
  const config = { services: { api } };
  assert.doesNotThrow(() => verifyComposeConfig(config, appRoot, api.image));
  for (const corrupt of [
    (copy) => {
      copy.services.api.volumes[0].source += "-local-copy";
    },
    (copy) => {
      delete copy.services.api.environment.APP_REQUIRE_EXISTING_DB;
    },
    (copy) => {
      copy.services.api.command = "replace-db";
    },
    (copy) => {
      copy.services.api.volumes[0].bind.create_host_path = true;
    },
  ]) {
    const copy = structuredClone(config);
    corrupt(copy);
    assert.throws(() => verifyComposeConfig(copy, appRoot, api.image), /Compose altera/);
  }
});

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "production-data-guard-"));
  t.after(async () => {
    assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir()));
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const file = path.join(dataDir, "penarrubia.db");
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,usuario TEXT,passwordHash TEXT); INSERT INTO users VALUES('u1','super_admin','original-hash'); CREATE TABLE owners(id TEXT PRIMARY KEY,name TEXT); INSERT INTO owners VALUES('o1','Propietario existente'); CREATE TABLE schema_migrations(id TEXT PRIMARY KEY)",
  );
  db.close();
  const load = (sql) => async () => {
    const db = new DatabaseSync(file);
    db.exec(sql);
    return { db };
  };
  return { file, dataDir, load };
}

test("protección: permite columnas y tablas nuevas conservando datos y contraseñas", async (t) => {
  const f = await fixture(t);
  const result = await verifyExistingData({
    dataDir: f.dataDir,
    loadDatabase: f.load(
      "ALTER TABLE owners ADD COLUMN extra TEXT DEFAULT ''; CREATE TABLE new_feature(id TEXT); INSERT INTO schema_migrations VALUES('new-column')",
    ),
  });
  assert.equal(result.preservedUsers, 1);
  assert.equal(result.status, "ok");
});

test("protección: bloquea cambios de contraseñas durante el arranque", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    verifyExistingData({
      dataDir: f.dataDir,
      loadDatabase: f.load("UPDATE users SET passwordHash='rotated-hash'"),
    }),
    /contraseñas/,
  );
});

test("protección: bloquea el reemplazo del archivo incluso con datos idénticos", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    verifyExistingData({
      dataDir: f.dataDir,
      loadDatabase: async () => {
        await fs.rename(f.file, f.file + ".previous");
        await fs.copyFile(f.file + ".previous", f.file);
      },
    }),
    /reemplaza/,
  );
});

test("protección: bloquea borrar registros o alterar valores existentes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    verifyExistingData({
      dataDir: f.dataDir,
      loadDatabase: f.load("UPDATE owners SET name='censo reimportado'"),
    }),
    /datos existentes/,
  );
  await assert.rejects(
    verifyExistingData({ dataDir: f.dataDir, loadDatabase: f.load("DELETE FROM owners") }),
    /datos existentes/,
  );
});

test("protección: rechaza una base ausente sin crear archivos", async (t) => {
  const f = await fixture(t);
  const missing = path.join(f.dataDir, "missing");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(new URL("../../src/db.js", import.meta.url).href)})`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_REQUIRE_EXISTING_DB: "true",
        APP_DATA_DIR: missing,
        APP_UPLOADS_DIR: path.join(f.dataDir, "uploads"),
        APP_ADMIN_PASSWORD: "NoInicializarAunqueExistaClave123",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Falta la base de producción existente/);
  await assert.rejects(fs.stat(missing), /ENOENT/);
});
