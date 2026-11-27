// Se ejecuta únicamente sobre una copia aislada, antes de arrancar una release.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const digest = (rows) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
    .digest("hex");

export function verifyComposeConfig(config, appRoot, expectedImage) {
  const api = config.services?.api;
  const fail = () => {
    throw new Error(
      "Compose altera el montaje o arranque protegido de producción. Deploy bloqueado.",
    );
  };
  if (!api || api.image !== expectedImage || api.command || api.entrypoint) fail();
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    APP_DATA_DIR: "/app/data",
    APP_UPLOADS_DIR: "/app/uploads",
    APP_REQUIRE_EXISTING_DB: "true",
    APP_DEMO_DATA: "false",
    APP_DEMO_PROFILES: "false",
  }))
    if (api.environment?.[key] !== value) fail();
  if (api.volumes?.length !== 2) fail();
  for (const name of ["data", "uploads"]) {
    const volume = api.volumes.find((volume) => volume.target === `/app/${name}`);
    if (
      !volume ||
      volume.type !== "bind" ||
      volume.source !== path.join(appRoot, name) ||
      volume.bind?.create_host_path !== false
    )
      fail();
  }
}

function readSnapshot(file, reference) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("La base existente debe ser un archivo regular.");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("La base no supera las comprobaciones de integridad. Deploy bloqueado.");
    const users = db.prepare("SELECT id,usuario,passwordHash FROM users").all();
    if (!users.length)
      throw new Error(
        "La base existente no contiene usuarios; no se inicializa durante un deploy.",
      );
    const tables =
      reference?.tables ||
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations'",
        )
        .all()
        .map(({ name }) => ({
          name,
          columns: db
            .prepare(`PRAGMA table_info(${quote(name)})`)
            .all()
            .map(({ name }) => name),
        }));
    return {
      identity: `${stat.dev}:${stat.ino}`,
      users: users.length,
      credentials: digest(users),
      tables: tables.map(({ name, columns }) => ({
        name,
        columns,
        digest: digest(
          db.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(name)}`).all(),
        ),
      })),
    };
  } finally {
    db.close();
  }
}

export async function verifyExistingData({ dataDir, loadDatabase }) {
  const file = path.join(dataDir, "penarrubia.db");
  const before = readSnapshot(file);
  let loaded;
  try {
    loaded = await loadDatabase();
    const after = readSnapshot(file, before);
    if (before.identity !== after.identity)
      throw new Error("El arranque reemplaza el archivo de base de datos. Deploy bloqueado.");
    if (before.credentials !== after.credentials)
      throw new Error("El arranque cambia cuentas o contraseñas existentes. Deploy bloqueado.");
    for (let i = 0; i < before.tables.length; i++) {
      if (before.tables[i].digest !== after.tables[i].digest)
        throw new Error(
          `El arranque modifica datos existentes (${before.tables[i].name}). Requiere una migración autorizada aparte.`,
        );
    }
    return { status: "ok", preservedUsers: after.users, protectedTables: after.tables.length };
  } finally {
    loaded?.db?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyComposeConfig(
    JSON.parse(fs.readFileSync("/deploy-compose.json", "utf8")),
    process.env.PRODUCTION_APP_ROOT,
    process.env.EXPECTED_IMAGE,
  );
  const result = await verifyExistingData({
    dataDir: process.env.APP_DATA_DIR,
    loadDatabase: () => import(pathToFileURL(path.resolve("src/db.js")).href),
  });
  console.log(JSON.stringify(result));
}
