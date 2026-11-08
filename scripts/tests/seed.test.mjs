import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.APP_DATA_DIR = mkdtempSync(path.join(tmpdir(), "penarrubia-seed-test-"));
process.env.APP_UPLOADS_DIR = path.join(process.env.APP_DATA_DIR, "uploads");
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
const { verifyPassword } = await import("../../src/auth.js");

after(() => {
  db.close();
  rmSync(process.env.APP_DATA_DIR, { recursive: true, force: true });
});

test("arranque desde cero: siembra sin duplicar roles y crea perfiles con contraseña", () => {
  assert.equal(seedIfEmpty(), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM roles").get().n, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM communities").get().n, 7);
  for (const usuario of ["super_admin", "recepcion", "carlos", "laura", "gestor.olivos"]) {
    const user = db.prepare("SELECT * FROM users WHERE usuario = ?").get(usuario);
    assert.ok(user, `falta la cuenta ${usuario}`);
    assert.ok(verifyPassword(usuario, user.passwordHash), `contraseña demo inválida: ${usuario}`);
  }
  assert.equal(db.prepare("SELECT userId FROM owners WHERE id = 'own-seed-1'").get().userId, "user-carlos");
  assert.equal(db.prepare("SELECT userId FROM tenants WHERE id = 'tenant-seed-1'").get().userId, "user-laura");
  assert.equal(db.prepare("SELECT ownerId FROM tenants WHERE id = 'tenant-seed-1'").get().ownerId, "own-seed-1");
  assert.equal(db.prepare("SELECT adminUserId FROM communities WHERE id = 'com-seed-1'").get().adminUserId, "user-admin-comunidad");
});

test("reinicio: preserva los datos y las contraseñas existentes", () => {
  db.prepare("UPDATE communities SET name = 'Nombre editado' WHERE id = 'com-seed-1'").run();
  const hash = db.prepare("SELECT passwordHash FROM users WHERE usuario = 'super_admin'").get().passwordHash;
  assert.equal(seedIfEmpty(), false);
  assert.equal(db.prepare("SELECT name FROM communities WHERE id = 'com-seed-1'").get().name, "Nombre editado");
  assert.equal(db.prepare("SELECT passwordHash FROM users WHERE usuario = 'super_admin'").get().passwordHash, hash);
});
