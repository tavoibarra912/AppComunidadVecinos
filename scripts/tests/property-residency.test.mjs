import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "pen-property-residency-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { rebuildOwnersPropertyIds, rebuildPropertyTenantReferences, syncPropertyTenantReferences } =
  await import("../../src/domain.js");
const { resolveAudience } = await import("../../src/communication-store.js");
const { policyData } = await import("../../src/security.js");

const insert = (table, row) =>
  db
    .prepare(
      `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
        .map(() => "?")
        .join(",")})`,
    )
    .run(...Object.values(row));
const row = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
const dni = (value) => `${value}${"TRWAGMYFPDXBNJZSQVHLCKE"[value % 23]}`;

function account(role, permissions = []) {
  const existing = db.prepare("SELECT id FROM roles WHERE id=? OR nombre=?").get(role, role);
  if (!existing) insert("roles", { id: role, nombre: role, permisos: JSON.stringify(permissions) });
  const id = crypto.randomUUID();
  insert("users", { id, usuario: id, rol: role, activo: 1 });
  const token = crypto.randomBytes(32).toString("hex");
  insert("sessions", {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: id,
    expiresAt: Date.now() + 3600000,
  });
  return { ...row("users", id), token };
}

const admin = account("super_admin");
let server, base, serial = 0;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

async function request(route, method = "GET", body) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `penarrubia_session=${admin.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

function fixture() {
  const prefix = `residency-${++serial}-`;
  const f = Object.fromEntries(
    ["c", "o", "o2", "p", "p2", "t"].map((key) => [key, prefix + key]),
  );
  insert("communities", {
    id: f.c,
    name: "Comunidad de prueba",
    nif: dni(70000000 + serial),
    currency: "EUR",
    address: "Calle de prueba",
    city: "Madrid",
  });
  for (const [id, name, offset] of [
    [f.o, "Ana", 0],
    [f.o2, "Beatriz", 1],
  ])
    insert("owners", {
      id,
      name,
      surname: "Prueba",
      dni: dni(10000000 + serial * 5 + offset),
      communityId: f.c,
      email: `${id}@example.test`,
      phone: "612345678",
      address: "Calle de prueba",
      city: "Madrid",
    });
  for (const id of [f.p, f.p2])
    insert("properties", {
      id,
      communityId: f.c,
      communityName: "Comunidad de prueba",
      plot: id,
      propertyType: "vivienda",
      address: "Calle de prueba",
      city: "Madrid",
      postalCode: "28001",
      province: "Madrid",
      participationCoef: "50",
      ownerIds: JSON.stringify([f.o, f.o2]),
      ownerPercentages: JSON.stringify({ [f.o]: 60, [f.o2]: 40 }),
    });
  insert("tenants", {
    id: f.t,
    propertyId: f.p2,
    ownerId: f.o,
    name: "Inquilino",
    surname: "Prueba",
    documentId: dni(20000000 + serial),
    phone: "612345678",
    email: `${f.t}@example.test`,
    contractStart: "2020-01-01",
  });
  rebuildOwnersPropertyIds();
  rebuildPropertyTenantReferences();
  return f;
}

const propertyInput = (f, extra = {}) => ({
  id: `${f.p}-new`,
  communityId: f.c,
  ownerIds: [f.o, f.o2],
  ownerPercentages: { [f.o]: 60, [f.o2]: 40 },
  plot: "Nuevo",
  propertyType: "vivienda",
  address: "Calle de prueba",
  city: "Madrid",
  province: "Madrid",
  postalCode: "28001",
  participationCoef: "50",
  ...extra,
});

test("la ocupación por el propietario se guarda con sus residentes y contacto principal", async () => {
  const f = fixture();
  const created = await request("/properties", "POST", propertyInput(f, {
    occupancy: "owner",
    residentOwnerIds: [f.o2],
    primaryResidentId: f.o2,
  }));
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.occupancy, "owner");
  assert.deepEqual(created.data.residentOwnerIds, [f.o2]);
  assert.equal(created.data.primaryResidentId, f.o2);
  assert.equal(row("properties", `${f.p}-new`).occupancy, "owner");
});

test("no se admite como residente a quien no es titular ni un principal ajeno", async () => {
  const f = fixture();
  const external = `${f.o2}-external`;
  insert("owners", {
    id: external,
    name: "Carlos",
    surname: "Ajeno",
    dni: dni(30000000 + serial),
    communityId: f.c,
  });
  for (const extra of [
    { occupancy: "owner", residentOwnerIds: [external], primaryResidentId: external },
    { occupancy: "owner", residentOwnerIds: [f.o], primaryResidentId: external },
  ]) {
    const result = await request("/properties", "POST", propertyInput(f, extra));
    assert.equal(result.status, 400, JSON.stringify(result.data));
    assert.equal(row("properties", `${f.p}-new`), undefined);
  }
});

test("un inmueble con inquilinos no puede declararse ocupado por el propietario", async () => {
  const f = fixture();
  const result = await request("/properties", "POST", propertyInput(f, {
    id: `${f.p2}-conflict`,
    occupancy: "owner",
    residentOwnerIds: [f.o],
    linkTenantIds: [f.t],
  }));
  assert.equal(result.status, 400);
  assert.match(result.data.error, /inquilinos vinculados/i);
  assert.equal(row("properties", `${f.p2}-conflict`), undefined);
});

test("«Sin ocupante» exige dejar de ser residente y no admite inquilinos", async () => {
  const f = fixture();
  const withTenant = await request("/properties", "POST", propertyInput(f, {
    id: `${f.p2}-vacant`,
    occupancy: "vacant",
    linkTenantIds: [f.t],
    residentOwnerIds: [],
  }));
  assert.equal(withTenant.status, 400);
  const withResident = await request("/properties", "POST", propertyInput(f, {
    id: `${f.p2}-vacant`,
    occupancy: "vacant",
    residentOwnerIds: [f.o],
  }));
  assert.equal(withResident.status, 400);
});

test("cambiar a «Vive otra persona» limpia residentes y deja el contrato como principal", async () => {
  const f = fixture();
  const current = (await request(`/properties/${f.p2}`)).data;
  // El inquilino está vigente: la ficha heredada se deduce como ocupada por otra persona.
  assert.equal(current.occupancy, "tenant");
  assert.deepEqual(current.tenantIds, [f.t]);
  const saved = await request(`/properties/${f.p2}`, "PUT", {
    ...current,
    version: current.version,
    occupancy: "tenant",
    residentOwnerIds: [],
    primaryResidentId: f.t,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.occupancy, "tenant");
  assert.deepEqual(saved.data.residentOwnerIds, []);
  assert.equal(saved.data.primaryResidentId, f.t);
});

test("desvincular al residente o al inquilino principal no deja referencias huérfanas", async () => {
  const f = fixture();
  const current = (await request(`/properties/${f.p2}`)).data;
  const vacant = await request(`/properties/${f.p2}`, "PUT", {
    ...current,
    version: current.version,
    occupancy: "vacant",
    residentOwnerIds: [],
    primaryResidentId: "",
    unlinkTenantIds: [f.t],
  });
  assert.equal(vacant.status, 200, JSON.stringify(vacant.data));
  assert.equal(vacant.data.occupancy, "vacant");
  assert.deepEqual(vacant.data.tenantIds, []);
  assert.equal(vacant.data.primaryResidentId, "");
});

test("una ficha antigua sin ocupación se deduce y no inventa residentes", async () => {
  const f = fixture();
  const legacy = (await request(`/properties/${f.p}`)).data;
  assert.equal(legacy.occupancy, "owner");
  assert.deepEqual(legacy.residentOwnerIds, []);
  // Aunque la base conserve una marca antigua de alguien que ya no es titular,
  // la API no la devuelve.
  db.prepare("UPDATE properties SET residentOwnerIds=?, occupancy='owner' WHERE id=?").run(
    JSON.stringify([f.o, "owner-que-no-existe"]),
    f.p,
  );
  const filtered = (await request(`/properties/${f.p}`)).data;
  assert.deepEqual(filtered.residentOwnerIds, [f.o]);
});

test("vincular un inquilino vigente deja el inmueble ocupado por otra persona", async () => {
  const f = fixture();
  assert.equal((await request(`/properties/${f.p}`)).data.occupancy, "owner");
  // Un cliente anterior mueve el contrato sin enviar la ocupación: el índice se
  // deriva igualmente y el inmueble no queda «ocupado por el propietario».
  db.prepare("UPDATE tenants SET propertyId=? WHERE id=?").run(f.p, f.t);
  syncPropertyTenantReferences(f.t);
  assert.equal(row("properties", f.p).occupancy, "tenant");
  assert.deepEqual(JSON.parse(row("properties", f.p).tenantIds), [f.t]);
  const property = (await request(`/properties/${f.p}`)).data;
  assert.equal(property.occupancy, "tenant");
  assert.deepEqual(property.residentOwnerIds, []);
  assert.equal(row("properties", f.p2).occupancy, "owner");
});

test("un contrato vencido deja de ocupar y libera el contacto principal", async () => {
  const f = fixture();
  const current = (await request(`/properties/${f.p2}`)).data;
  const saved = await request(`/properties/${f.p2}`, "PUT", {
    ...current,
    version: current.version,
    occupancy: "tenant",
    residentOwnerIds: [],
    primaryResidentId: f.t,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  db.prepare("UPDATE tenants SET contractEnd='2021-01-01' WHERE id=?").run(f.t);
  // La lectura no hereda el estado guardado: el contrato vencido ya no ocupa.
  db.prepare("UPDATE properties SET occupancy='tenant', tenantIds=?, primaryResidentId=? WHERE id=?")
    .run(JSON.stringify([f.t]), f.t, f.p2);
  const read = (await request(`/properties/${f.p2}`)).data;
  assert.equal(read.occupancy, "owner");
  assert.deepEqual(read.tenantIds, []);
  assert.equal(read.primaryResidentId, "");
  // Y el guardado corrige también la fila almacenada.
  syncPropertyTenantReferences(f.t);
  assert.equal(row("properties", f.p2).occupancy, "owner");
  assert.deepEqual(JSON.parse(row("properties", f.p2).tenantIds), []);
});

test("los avisos por inmueble van solo a los propietarios salvo que se incluyan residentes", async () => {
  const f = fixture();
  const ownerUser = account("owner-role");
  const tenantUser = account("tenant-role");
  db.prepare("UPDATE owners SET userId=? WHERE id=?").run(ownerUser.id, f.o);
  db.prepare("UPDATE tenants SET userId=? WHERE id=?").run(tenantUser.id, f.t);
  const data = policyData();
  const base = { mode: "selected", ownerIds: [], tenantIds: [], propertyIds: [f.p2] };
  const ownersOnly = resolveAudience(f.c, base, data);
  assert.ok(ownersOnly.recipients.some((u) => u.id === ownerUser.id));
  assert.ok(!ownersOnly.recipients.some((u) => u.id === tenantUser.id));
  const withResidents = resolveAudience(f.c, { ...base, includeResidents: true }, data);
  assert.ok(withResidents.recipients.some((u) => u.id === tenantUser.id));
});

test("la residencia declarada es opcional aunque el inmueble lo ocupe el propietario", async () => {
  const f = fixture();
  const created = await request("/properties", "POST", propertyInput(f, {
    occupancy: "owner",
    residentOwnerIds: [],
    primaryResidentId: "",
  }));
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.occupancy, "owner");
  assert.deepEqual(created.data.residentOwnerIds, []);
  assert.equal(created.data.primaryResidentId, "");
});

test("un inmueble con un contrato vigente no se puede borrar", async () => {
  const f = fixture();
  const blocked = await request(`/properties/${f.p2}`, "DELETE");
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /contrato vigente/i);
  assert.ok(row("properties", f.p2));
});

test("un inmueble con solo contratos históricos se borra conservando la ficha", async () => {
  const f = fixture();
  db.prepare("UPDATE tenants SET contractEnd='2021-01-01' WHERE id=?").run(f.t);
  syncPropertyTenantReferences(f.t);
  const deleted = await request(`/properties/${f.p2}`, "DELETE");
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal(row("properties", f.p2), undefined);
  assert.equal(row("tenants", f.t).propertyId, "");
  assert.equal(row("tenants", f.t).contractEnd, "2021-01-01");
});
