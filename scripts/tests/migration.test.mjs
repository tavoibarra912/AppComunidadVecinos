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

test("migración: una base con documents antiguo añade columnas antes de crear el índice", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "penarrubia-doc-migration-test-"),
  );
  const dbPath = path.join(directory, "penarrubia.db");
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileType TEXT NOT NULL DEFAULT '',
      fileSize INTEGER NOT NULL DEFAULT 0,
      uploadedAt TEXT NOT NULL DEFAULT '',
      storedName TEXT NOT NULL
    );
    INSERT INTO documents (id,entityType,entityId,fileName,storedName)
    VALUES ('legacy-doc','community','com-legacy','Acta.pdf','legacy.pdf');
  `);
  legacy.close();
  const url = new URL("../../src/db.js", import.meta.url).href;
  const result = spawnSync(
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
  const check = new DatabaseSync(dbPath);
  try {
    assert.equal(result.status, 0, result.stderr);
    const columns = check
      .prepare("PRAGMA table_info(documents)")
      .all()
      .map((row) => row.name);
    assert.ok(columns.includes("folderId"));
    assert.ok(columns.includes("category"));
    assert.ok(columns.includes("uploadedBy"));
    assert.ok(columns.includes("uploadedByName"));
    const row = check
      .prepare("SELECT * FROM documents WHERE id='legacy-doc'")
      .get();
    assert.equal(row.fileName, "Acta.pdf");
    assert.equal(row.folderId, "");
    assert.equal(row.category, "document");
    assert.ok(
      check
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_documents_folder'",
        )
        .get(),
    );
  } finally {
    check.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
