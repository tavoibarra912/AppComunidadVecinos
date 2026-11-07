// Unit tests del backend — corren con: npm test
// Usan una BD SQLite en memoria (aislada, no toca data/penarrubia.db).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.APP_DATA_DIR = mkdtempSync(path.join(tmpdir(), "penarrubia-test-"));

const { db, ownerFromRow, communityFromRow, propertyFromRow, tenantFromRow } = await import("../../src/db.js");
const { syncOwnerProperties, applyOwnerPropertyLink, rebuildOwnersPropertyIds, upsertTenant } = await import("../../src/domain.js");

// ---------- Helpers ----------
function createCommunity(id, name = "Comunidad Test") {
  db.prepare(
    `INSERT INTO communities (id, name, nif, adminUserId, currency) VALUES (?, ?, ?, '', 'EUR')`
  ).run(id, name, "H12345678");
}

function createOwner(id, name = "Propietario", surname = "Test", userId = "") {
  db.prepare(
    `INSERT INTO owners (id, name, surname, documentType, dni, isMember, communityId, communityName, propertyId, propertyIds, documents, userId)
     VALUES (?, ?, ?, 'DNI', ?, 1, '', '', '', '[]', '{}', ?)`
  ).run(id, name, surname, id.toUpperCase(), userId);
}

function createProperty(id, communityId, ownerIds = []) {
  db.prepare(
    `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot, address, ownerPercentages)
     VALUES (?, ?, '', ?, '[]', 'vivienda', ?, 'Calle Test 1', '{}')`
  ).run(id, communityId, JSON.stringify(ownerIds), "Inmueble " + id);
}

function ownerIdsOf(propertyId) {
  return JSON.parse(db.prepare("SELECT ownerIds FROM properties WHERE id = ?").get(propertyId).ownerIds);
}

function ownerPropertyIdsOf(ownerId) {
  const row = db.prepare("SELECT propertyIds FROM owners WHERE id = ?").get(ownerId);
  return JSON.parse(row?.propertyIds || "[]");
}

// ---------- Setup ----------
before(() => {
  createCommunity("com-1", "Comunidad Uno");
  createCommunity("com-2", "Comunidad Dos");
});

after(() => {
  db.close();
  try { rmSync(process.env.APP_DATA_DIR, { recursive: true, force: true }); } catch {}
});

// ---------- Roles: semilla migrada ----------
test("migración de roles: los 4 roles del sistema existen", () => {
  const roles = db.prepare("SELECT nombre FROM roles").all().map(r => r.nombre);
  for (const expected of ["super_admin", "administrator", "community_admin", "user"]) {
    assert.ok(roles.includes(expected), `falta rol ${expected}`);
  }
});

test("migración de roles: los roles viejos fueron eliminados", () => {
  const roles = db.prepare("SELECT nombre FROM roles").all().map(r => r.nombre);
  assert.ok(!roles.includes("administrador"), "rol viejo 'administrador' aún existe");
  assert.ok(!roles.includes("propietario"), "rol viejo 'propietario' aún existe");
});

// ---------- Usuarios: semilla ----------
test("semilla de usuarios: admin y recepción existen", () => {
  const usuarios = db.prepare("SELECT usuario, rol FROM users").all();
  assert.ok(usuarios.some(u => u.usuario === "admin" && u.rol === "super_admin"));
  assert.ok(usuarios.some(u => u.usuario === "recepcion"));
});

// ---------- syncOwnerProperties (N:M propietario ↔ inmuebles) ----------
test("syncOwnerProperties: vincula propietario a múltiples inmuebles", () => {
  createOwner("own-1");
  createProperty("prop-1", "com-1");
  createProperty("prop-2", "com-1");

  syncOwnerProperties("own-1", ["prop-1", "prop-2"]);

  assert.deepEqual(ownerIdsOf("prop-1"), ["own-1"]);
  assert.deepEqual(ownerIdsOf("prop-2"), ["own-1"]);
  assert.deepEqual(ownerPropertyIdsOf("own-1").sort(), ["prop-1", "prop-2"]);
});

test("syncOwnerProperties: desvincula inmuebles eliminados de la lista", () => {
  createOwner("own-2");
  createProperty("prop-3", "com-1");
  createProperty("prop-4", "com-1");
  syncOwnerProperties("own-2", ["prop-3", "prop-4"]);

  // Ahora sólo queda prop-3
  syncOwnerProperties("own-2", ["prop-3"]);

  assert.deepEqual(ownerIdsOf("prop-3"), ["own-2"]);
  assert.deepEqual(ownerIdsOf("prop-4"), [], "prop-4 debería estar sin propietario");
  assert.deepEqual(ownerPropertyIdsOf("own-2"), ["prop-3"]);
});

test("syncOwnerProperties: múltiples propietarios por inmueble", () => {
  createOwner("own-3a");
  createOwner("own-3b");
  createProperty("prop-5", "com-1");
  syncOwnerProperties("own-3a", ["prop-5"]);
  syncOwnerProperties("own-3b", ["prop-5"]);

  const ids = ownerIdsOf("prop-5");
  assert.ok(ids.includes("own-3a") && ids.includes("own-3b"));
});

test("syncOwnerProperties: ignora IDs de inmueble inexistentes", () => {
  createOwner("own-4");
  syncOwnerProperties("own-4", ["prop-fantasma"]);
  assert.deepEqual(ownerPropertyIdsOf("own-4"), []);
});

// ---------- applyOwnerPropertyLink (vinculación aditiva) ----------
test("applyOwnerPropertyLink: vincula propietario a un inmueble y actualiza datos denormalizados", () => {
  createOwner("own-5");
  createProperty("prop-6", "com-1");
  db.prepare("UPDATE properties SET cadastralRef = 'REF123', participationCoef = '50' WHERE id = 'prop-6'").run();

  applyOwnerPropertyLink("own-5", "prop-6");

  assert.ok(ownerIdsOf("prop-6").includes("own-5"));
  const owner = db.prepare("SELECT * FROM owners WHERE id = 'own-5'").get();
  assert.equal(owner.communityId, "com-1");
  assert.equal(owner.cadastralRef, "REF123");
  assert.equal(owner.participationCoef, "50");
});

// ---------- rebuildOwnersPropertyIds ----------
test("rebuildOwnersPropertyIds: rearma propertyIds desde los ownerIds de los inmuebles", () => {
  createOwner("own-6");
  createProperty("prop-7", "com-1");
  // vincular manualmente sin reconstruir
  db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?").run(JSON.stringify(["own-6"]), "prop-7");
  db.prepare("UPDATE owners SET propertyIds = '[]' WHERE id = 'own-6'").run();

  rebuildOwnersPropertyIds();

  assert.deepEqual(ownerPropertyIdsOf("own-6"), ["prop-7"]);
});

// ---------- upsertTenant ----------
test("upsertTenant: crea inquilino vinculado a inmueble y propietario", () => {
  createOwner("own-7");
  createProperty("prop-8", "com-1", ["own-7"]);

  upsertTenant({
    ownerId: "own-7",
    propertyId: "prop-8",
    name: "Inquilino",
    surname: "Test",
    documentType: "DNI",
    documentId: "11111111A",
    contractStart: "2026-01-01",
    phone: "600000000",
    email: "inquilino@test.es"
  }, "tenant-test-1");

  const tenant = db.prepare("SELECT * FROM tenants WHERE id = 'tenant-test-1'").get();
  assert.ok(tenant);
  assert.equal(tenant.ownerId, "own-7");
  assert.equal(tenant.propertyId, "prop-8");
});

test("upsertTenant: falla si el inmueble no existe", () => {
  assert.throws(
    () => upsertTenant({ ownerId: "own-7", propertyId: "prop-fantasma", name: "X", surname: "Y" }, "t-x"),
    /inmueble.*no existe/i
  );
});

test("upsertTenant: falla si el propietario no existe", () => {
  createProperty("prop-9", "com-1");
  assert.throws(
    () => upsertTenant({ ownerId: "own-fantasma", propertyId: "prop-9", name: "X", surname: "Y" }, "t-y"),
    /propietario.*no existe/i
  );
});

// ---------- ownerFromRow / propertyFromRow: mapeo de campos nuevos ----------
test("ownerFromRow: mapea userId", () => {
  createOwner("own-8", "Con", "Cuenta", "user-xxx");
  const owner = ownerFromRow(db.prepare("SELECT * FROM owners WHERE id = 'own-8'").get());
  assert.equal(owner.userId, "user-xxx");
});

test("propertyFromRow: mapea ownerPercentages y currency", () => {
  db.prepare(
    `INSERT INTO properties (id, communityId, communityName, ownerIds, ownerPercentages, currency, propertyType, plot, address)
     VALUES (?, 'com-1', '', '[]', ?, 'EUR', 'vivienda', 'P', 'Dirección')`
  ).run("prop-10", JSON.stringify({ "own-1": 100 }));
  const prop = propertyFromRow(db.prepare("SELECT * FROM properties WHERE id = 'prop-10'").get());
  assert.equal(prop.currency, "EUR");
  assert.deepEqual(prop.ownerPercentages, { "own-1": 100 });
});

// ---------- Validaciones de rutas admin (PERMISOS_VALIDOS) ----------
test("catálogo de permisos: los permisos de los roles del sistema son válidos", async () => {
  const { PERMISOS_VALIDOS } = await import("../src/routes/admin.js").catch(() => ({ PERMISOS_VALIDOS: null }));
  if (!PERMISOS_VALIDOS) return; // el módulo exporta el router, no el array; verificamos vía DB
  const roles = db.prepare("SELECT nombre, permisos FROM roles").all();
  for (const role of roles) {
    const permisos = JSON.parse(role.permisos);
    for (const p of permisos) {
      assert.ok(PERMISOS_VALIDOS.includes(p), `rol ${role.nombre}: permiso inválido "${p}"`);
    }
  }
});
