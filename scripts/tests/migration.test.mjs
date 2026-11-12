import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("migración: SSO no recibe contraseñas predecibles y revoca las antiguas", async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "penarrubia-migration-test-"),
  );
  process.env.APP_DATA_DIR = directory;
  process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
  const { db } = await import("../../src/db.js");
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = crypto
    .createHash("sha256")
    .update(`${salt}:sso-legacy`)
    .digest("hex");
  db.prepare(
    "INSERT INTO users (id,usuario,rol,ssoProvider,passwordHash) VALUES ('sso-legacy','sso-legacy','user','gmail',?)",
  ).run(`${salt}:${hash}`);
  db.prepare(
    "INSERT INTO users (id,usuario,rol,ssoProvider) VALUES ('sso-empty','sso-empty','user','outlook')",
  ).run();
  db.prepare(
    "INSERT INTO sessions (tokenHash,userId,expiresAt) VALUES ('old-session','sso-legacy',?)",
  ).run(Date.now() + 100000);
  db.close();
  const url = new URL("../../src/db.js", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const {db}=await import(${JSON.stringify(url)});db.close();`,
    ],
    { env: { ...process.env, APP_DATA_DIR: directory }, encoding: "utf8" },
  );
  const check = new DatabaseSync(path.join(directory, "penarrubia.db"));
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      check.prepare("SELECT passwordHash FROM users WHERE id='sso-empty'").get()
        .passwordHash,
      "",
    );
    assert.equal(
      check
        .prepare("SELECT passwordHash FROM users WHERE id='sso-legacy'")
        .get().passwordHash,
      "",
    );
    assert.equal(
      check
        .prepare("SELECT COUNT(*) AS n FROM sessions WHERE userId='sso-legacy'")
        .get().n,
      0,
    );
  } finally {
    check.close();
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(
      path.basename(directory).startsWith("penarrubia-migration-test-"),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
test("migracion: corrige los NIF heredados de las comunidades demo sin tocar los validos", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "penarrubia-community-nif-test-"),
  );
  const dbPath = path.join(directory, "penarrubia.db");
  const url = new URL("../../src/db.js", import.meta.url).href;
  const runDb = () =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {db}=await import(${JSON.stringify(url)});db.close();`,
      ],
      {
        env: {
          ...process.env,
          APP_DATA_DIR: directory,
          APP_UPLOADS_DIR: path.join(directory, "uploads"),
        },
        encoding: "utf8",
      },
    );
  const first = runDb();
  assert.equal(first.status, 0, first.stderr);
  const setup = new DatabaseSync(dbPath);
  setup
    .prepare("INSERT INTO communities (id,name,nif) VALUES (?,?,?)")
    .run("com-seed-1", "Comunidad demo 1", "H28654321");
  setup
    .prepare("INSERT INTO communities (id,name,nif) VALUES (?,?,?)")
    .run("com-seed-2", "Comunidad demo 2", "H19456789");
  setup.prepare("DELETE FROM schema_migrations WHERE id='community-nif-v1'").run();
  setup.close();
  const second = runDb();
  assert.equal(second.status, 0, second.stderr);
  const check = new DatabaseSync(dbPath);
  try {
    assert.equal(
      check.prepare("SELECT nif FROM communities WHERE id='com-seed-1'").get().nif,
      "H28654325",
    );
    assert.equal(
      check.prepare("SELECT nif FROM communities WHERE id='com-seed-2'").get().nif,
      "H19456789",
    );
    assert.ok(
      check
        .prepare("SELECT id FROM schema_migrations WHERE id='community-nif-v1'")
        .get(),
    );
  } finally {
    check.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migración: adapta al español de España las publicaciones demo no editadas", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "penarrubia-spanish-copy-test-"),
  );
  const dbPath = path.join(directory, "penarrubia.db");
  const storeUrl = new URL("../../src/communication-store.js", import.meta.url).href;
  const runStore = () =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(storeUrl)});`,
      ],
      {
        env: {
          ...process.env,
          APP_DATA_DIR: directory,
          APP_UPLOADS_DIR: path.join(directory, "uploads"),
        },
        encoding: "utf8",
      },
    );

  const first = runStore();
  assert.equal(first.status, 0, first.stderr);
  const setup = new DatabaseSync(dbPath);
  const oldBody =
    "Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscribite hasta el jueves respondiendo a este aviso.";
  const oldPost = {
    title: "Torneo de pádel entre vecinos",
    body: oldBody,
  };
  const insert = setup.prepare(
    "INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)",
  );
  insert.run("demo-post", "com-demo", JSON.stringify(oldPost), "user-admin", "", "");
  insert.run(
    "custom-post",
    "com-demo",
    JSON.stringify({ title: "Publicación personalizada", body: oldBody }),
    "user-admin",
    "",
    "",
  );
  setup
    .prepare("DELETE FROM schema_migrations WHERE id='spanish-demo-copy-v1'")
    .run();
  setup.close();

  const second = runStore();
  assert.equal(second.status, 0, second.stderr);
  const check = new DatabaseSync(dbPath);
  try {
    const migrated = JSON.parse(
      check.prepare("SELECT data FROM communication_posts WHERE id='demo-post'").get().data,
    );
    assert.equal(migrated.title, "Torneo de pádel entre vecinos");
    assert.equal(
      migrated.body,
      "Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscríbete antes del jueves respondiendo a este aviso.",
    );

    const custom = JSON.parse(
      check.prepare("SELECT data FROM communication_posts WHERE id='custom-post'").get().data,
    );
    assert.equal(custom.body, oldBody);
    assert.ok(
      check
        .prepare("SELECT id FROM schema_migrations WHERE id='spanish-demo-copy-v1'")
        .get(),
    );
  } finally {
    check.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
