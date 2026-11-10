import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.APP_DATA_DIR = mkdtempSync(path.join(tmpdir(), "penarrubia-identifiers-test-"));
process.env.APP_UPLOADS_DIR = path.join(process.env.APP_DATA_DIR, "uploads");
const { db } = await import("../../src/db.js");
const { seedIfEmpty, seedDemoComunidades } = await import("../../src/seed.js");
const { isValidIdentityDocument, isValidIban, isValidCommunityNif } = await import(
  "../../public/js/utils.js"
);

after(() => {
  db.close();
  rmSync(process.env.APP_DATA_DIR, { recursive: true, force: true });
});

const IDENTITY_TOKEN = /(?<![A-Z0-9])(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z])(?![A-Z0-9])/g;

function identityProblems() {
  const problems = [];
  const owners = db
    .prepare("SELECT id, documentType, dni, iban, documents FROM owners")
    .all();
  for (const owner of owners) {
    if (!isValidIdentityDocument(owner.dni, owner.documentType)) {
      problems.push(`propietario ${owner.id}: ${owner.documentType} ${owner.dni}`);
    }
    if (owner.iban && !isValidIban(owner.iban)) {
      problems.push(`propietario ${owner.id}: IBAN ${owner.iban}`);
    }
    for (const token of String(owner.documents || "").match(IDENTITY_TOKEN) || []) {
      const type = /^[XYZ]/.test(token) ? "NIE" : "DNI";
      if (!isValidIdentityDocument(token, type)) {
        problems.push(`documentos de ${owner.id}: ${token}`);
      }
    }
  }
  for (const tenant of db
    .prepare("SELECT id, documentType, documentId FROM tenants")
    .all()) {
    if (!isValidIdentityDocument(tenant.documentId, tenant.documentType)) {
      problems.push(`inquilino ${tenant.id}: ${tenant.documentType} ${tenant.documentId}`);
    }
  }
  for (const community of db.prepare("SELECT id, nif, iban FROM communities").all()) {
    if (!isValidCommunityNif(community.nif)) {
      problems.push(`comunidad ${community.id}: NIF ${community.nif}`);
    }
    if (community.iban && !isValidIban(community.iban)) {
      problems.push(`comunidad ${community.id}: IBAN ${community.iban}`);
    }
  }
  return problems;
}

test("semilla: todos los DNI, NIE, NIF e IBAN cumplen el formato oficial", () => {
  assert.equal(seedIfEmpty(), true);
  assert.deepEqual(identityProblems(), []);
});

test("demo extendido: se ejecuta y sus identificadores también son válidos", () => {
  assert.equal(seedDemoComunidades(), true);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM communities WHERE id LIKE 'com-demo-%'").get().n,
    3,
  );
  assert.deepEqual(identityProblems(), []);
});
