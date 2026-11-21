import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs, { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import PDFDocument from "pdfkit";

const directory = mkdtempSync(path.join(tmpdir(), "pen-property-contracts-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { rebuildOwnersPropertyIds, rebuildPropertyTenantReferences } =
  await import("../../src/domain.js");
const { allowed } = await import("../../src/security.js");
const { generateDebtCertificate } = await import("../../src/fees.js");
const fees = await import("../../src/fees.js");
const services = await import("../../src/services.js");
const { processFeeProofCleanup } = await import("../../src/fee-proof-cleanup.js");
const { processFeeNotifications } = await import("../../src/fee-worker.js");
const insert = (table, row) =>
  db
    .prepare(
      `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
        .map(() => "?")
        .join(",")})`,
    )
    .run(...Object.values(row));
const row = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
function account(role, permissions = []) {
  const existing = db.prepare("SELECT id FROM roles WHERE id=? OR nombre=?").get(role, role);
  if (!existing) insert("roles", { id: role, nombre: role, permisos: JSON.stringify(permissions) });
  else
    db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
      JSON.stringify(permissions),
      existing.id,
    );
  const id = crypto.randomUUID(),
    token = crypto.randomBytes(32).toString("hex");
  insert("users", { id, usuario: id, rol: role, activo: 1 });
  insert("sessions", {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: id,
    expiresAt: Date.now() + 3600000,
  });
  return { ...row("users", id), token };
}
const readPermissions = ["property:read", "community:read", "owner:read", "tenant:read"];
const admin = account("super_admin");
const limited = account("property-only", [
  "property:manage",
  "property:create",
  ...readPermissions,
]);
const creator = account("property-creator", [
  "property:create",
  "tenant:manage",
  ...readPermissions,
]);
let server,
  base,
  serial = 0;
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
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("pen-property-contracts-"));
  rmSync(directory, { recursive: true, force: true });
});
async function request(actor, route, method = "GET", body) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `penarrubia_session=${actor.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: response.headers.get("content-type")?.includes("application/pdf")
      ? Buffer.from(await response.arrayBuffer())
      : await response.json(),
  };
}
const dni = (value) => `${value}${"TRWAGMYFPDXBNJZSQVHLCKE"[value % 23]}`;
function fixture() {
  const prefix = `contracts-${++serial}-`;
  const f = Object.fromEntries(
    ["c", "o", "o2", "old", "p", "p2", "t"].map((key) => [key, prefix + key]),
  );
  insert("communities", {
    id: f.c,
    name: "Comunidad de prueba",
    nif: dni(70000000 + serial),
    currency: "EUR",
    address: "Calle de prueba",
    city: "Madrid",
  });
  for (const [id, name] of [
    [f.o, "Ana"],
    [f.o2, "Beatriz"],
    [f.old, "Titular anterior"],
  ])
    insert("owners", {
      id,
      name,
      surname: "Prueba",
      dni: dni(10000000 + serial * 3 + [f.o, f.o2, f.old].indexOf(id)),
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
      participationCoef: "50",
      ownerIds: JSON.stringify([f.o]),
      ownerPercentages: JSON.stringify({ [f.o]: 100 }),
    });
  insert("tenants", {
    id: f.t,
    propertyId: f.p,
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
async function property(f) {
  const result = await request(admin, `/properties/${f.p}`);
  assert.equal(result.status, 200);
  return result.data;
}

for (const [label, dates] of [
  ["finalizado", { contractEnd: "2021-12-31" }],
  ["futuro", { contractStart: "2099-01-01" }],
])
  test(`R2: guardar solo notas conserva el contrato ${label} y su ámbito local`, async () => {
    const f = fixture();
    db.prepare(`UPDATE tenants SET ${Object.keys(dates)[0]}=? WHERE id=?`).run(
      Object.values(dates)[0],
      f.t,
    );
    rebuildPropertyTenantReferences();
    const staff = account("community_admin", ["property:manage", ...readPermissions]);
    db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(staff.id, f.c);
    assert.equal(allowed(staff, "tenant:read", f.t), true);
    assert.equal(allowed(staff, "tenant:manage", f.t), false);
    const before = row("tenants", f.t);
    const current = await property(f);
    assert.deepEqual(current.tenantIds, []);
    const result = await request(staff, `/properties/${f.p}`, "PUT", {
      ...current,
      notes: "Nota nueva",
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(row("tenants", f.t), before);
    assert.equal(allowed(staff, "tenant:read", f.t), true);
  });

test("R2: guardar notas no repara ni escribe contratos vigentes o ajenos", async () => {
  const f = fixture(),
    other = fixture();
  db.prepare("UPDATE tenants SET ownerId='' WHERE id IN (?,?)").run(f.t, other.t);
  const before = db.prepare("SELECT * FROM tenants ORDER BY id").all();
  for (const mode of ["legacy", "omitted", "explicit"]) {
    const current = await property(f);
    if (mode === "omitted") delete current.tenantIds;
    if (mode === "explicit") Object.assign(current, { linkTenantIds: [], unlinkTenantIds: [] });
    const result = await request(limited, `/properties/${f.p}`, "PUT", {
      ...current,
      notes: "Otra nota",
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  }
  assert.deepEqual(db.prepare("SELECT * FROM tenants ORDER BY id").all(), before);
});

test("R3: quitar o mover contratos exige tenant:manage y no guarda cambios parciales", async () => {
  const f = fixture(),
    source = fixture();
  // Mantener los dos inmuebles en la misma comunidad para probar permisos, no validación geográfica.
  db.prepare("UPDATE properties SET communityId=?, ownerIds=? WHERE id=?").run(
    f.c,
    JSON.stringify([f.o]),
    source.p,
  );
  db.prepare("UPDATE tenants SET ownerId=? WHERE id=?").run(f.o, source.t);
  assert.equal(allowed(limited, "tenant:manage", f.t), false);
  for (const changes of [
    { tenantIds: [] },
    { unlinkTenantIds: [f.t] },
    { linkTenantIds: [source.t] },
    { tenantIds: [source.t] },
  ]) {
    const current = await property(f),
      before = row("properties", f.p);
    const tenantsBefore = db.prepare("SELECT * FROM tenants ORDER BY id").all();
    const result = await request(limited, `/properties/${f.p}`, "PUT", {
      ...current,
      ...changes,
      notes: "No guardar",
    });
    assert.equal(result.status, 403, JSON.stringify(result.data));
    assert.deepEqual(row("properties", f.p), before);
    assert.deepEqual(db.prepare("SELECT * FROM tenants ORDER BY id").all(), tenantsBefore);
  }
});

test("R3: crear un inmueble con contratos comprueba gestión del inquilino y del origen", async () => {
  const f = fixture(),
    current = await property(f),
    id = f.p + "-new";
  assert.equal(allowed(creator, "tenant:manage", f.t), true);
  assert.equal(allowed(creator, "property:manage", f.p), false);
  const input = { ...current, id, linkTenantIds: [f.t] };
  for (const actor of [limited, creator]) {
    const before = row("tenants", f.t);
    const result = await request(actor, "/properties", "POST", input);
    assert.equal(result.status, 403, JSON.stringify(result.data));
    assert.equal(row("properties", id), undefined);
    assert.deepEqual(row("tenants", f.t), before);
  }
});

test("R3: cambiar titularidad comprueba los contratos que necesitan otro arrendador", async () => {
  const f = fixture(),
    current = await property(f);
  const input = { ...current, ownerIds: [f.o2], ownerPercentages: { [f.o2]: 100 } };
  const before = row("tenants", f.t);
  const denied = await request(limited, `/properties/${f.p}`, "PUT", input);
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  assert.deepEqual(row("tenants", f.t), before);
  assert.deepEqual((await property(f)).ownerIds, [f.o]);
  const result = await request(admin, `/properties/${f.p}`, "PUT", input);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(row("tenants", f.t).ownerId, f.o2);
  assert.equal(row("tenants", f.t).propertyId, f.p);
});

test("R3: las órdenes autorizadas mueven y desvinculan solo los contratos seleccionados", async () => {
  const f = fixture();
  const ended = f.t + "-ended";
  insert("tenants", {
    id: ended,
    propertyId: f.p,
    ownerId: f.o,
    name: "Histórico",
    surname: "Prueba",
    contractEnd: "2021-12-31",
  });
  let current = (await request(admin, `/properties/${f.p2}`)).data;
  let result = await request(admin, `/properties/${f.p2}`, "PUT", {
    ...current,
    linkTenantIds: [f.t],
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(row("tenants", f.t).propertyId, f.p2);
  assert.deepEqual((await property(f)).tenantIds, []);
  assert.deepEqual(result.data.tenantIds, [f.t]);
  assert.equal(row("tenants", ended).propertyId, f.p);
  current = result.data;
  result = await request(admin, `/properties/${f.p2}`, "PUT", {
    ...current,
    unlinkTenantIds: [f.t],
  });
  assert.equal(result.status, 200);
  assert.equal(row("tenants", f.t).propertyId, "");
  assert.equal(row("tenants", ended).propertyId, f.p);
  current = await property(f);
  result = await request(admin, `/properties/${f.p}`, "PUT", {
    ...current,
    unlinkTenantIds: [ended],
  });
  assert.equal(result.status, 200);
  assert.equal(row("tenants", ended).propertyId, "");
});

function receipt(f, id, propertyId, owners, extra = {}) {
  insert("fee_receipts", {
    id,
    communityId: f.c,
    propertyId,
    planId: "",
    period: "2026-01",
    periodEnd: "2026-01-31",
    dueDate: "2026-01-10",
    amount: 10000,
    snapshot: JSON.stringify({ community: "Comunidad de prueba", property: propertyId, owners }),
    createdAt: "2026-01-01",
    actorId: admin.id,
    ...extra,
  });
}
function payment(f, id, ownerId, amount, allocations, extra = {}) {
  insert("fee_payments", {
    id,
    communityId: f.c,
    ownerId,
    amount,
    paidOn: "2026-01-10",
    method: "transfer",
    reference: id,
    requestId: id,
    createdAt: "2026-01-10",
    actorId: admin.id,
    ...extra,
  });
  for (const [receiptId, amount] of allocations)
    insert("fee_allocations", { paymentId: id, receiptId, amount });
}
async function certificate(input) {
  const texts = [],
    original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (text, ...args) {
    texts.push(String(text));
    return original.call(this, text, ...args);
  };
  try {
    const pdf = await generateDebtCertificate({ ...input, actor: admin });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    // Permite revisión visual manual sin dejar artefactos de prueba en el repositorio.
    if (process.env.CERTIFICATE_PREVIEW_PATH) {
      const destination = process.env.CERTIFICATE_PREVIEW_PATH.replace(/\.pdf$/, "");
      writeFileSync(`${destination}-${input.propertyId ? "property" : "owner"}.pdf`, pdf);
    }
    return texts.join("\n").replaceAll("\u00a0", " ");
  } finally {
    PDFDocument.prototype.text = original;
  }
}

test("R4: certificado real por inmueble identifica al titular y muestra 30 pagados / 70 pendientes", async () => {
  const f = fixture(),
    r = f.p + "-receipt";
  receipt(f, r, f.p, [{ id: f.o, name: "Ana Prueba" }]);
  payment(f, r + "-payment", f.o, 3000, [[r, 3000]]);
  const text = await certificate({ communityId: f.c, propertyId: f.p });
  assert.match(text, /Nombre: Ana Prueba/);
  assert.match(text, /Porcentaje de titularidad actual: 100 %/);
  assert.match(text, /Total pendiente: 70,00 €/);
  assert.match(text, /Total pagado \(histórico\): 30,00 €/);
});

test("R4: el certificado respeta la moneda de la comunidad", async () => {
  const f = fixture(),
    r = f.p + "-receipt";
  db.prepare("UPDATE communities SET currency='USD' WHERE id=?").run(f.c);
  receipt(f, r, f.p, [{ id: f.o, name: "Ana Prueba" }]);
  const text = await certificate({ communityId: f.c, propertyId: f.p });
  assert.match(text, /Total pendiente: 100,00 US\$/);
  assert.doesNotMatch(text, /100,00 €/);
});

test("R4: copropietarios e históricos, varios inmuebles, crédito y cobros anulados", async () => {
  const f = fixture();
  db.prepare("UPDATE properties SET ownerIds=? WHERE id=?").run(JSON.stringify([f.o, f.o2]), f.p);
  const r = f.p + "-receipt",
    r2 = f.p2 + "-receipt",
    old = r + "-old",
    cancelled = r + "-cancelled";
  receipt(f, r, f.p, [
    { id: f.o, name: "Ana Prueba" },
    { id: f.o2, name: "Beatriz Prueba" },
  ]);
  receipt(f, r2, f.p2, [{ id: f.o, name: "Ana Prueba" }]);
  receipt(f, old, f.p, [{ id: f.old, name: "Nombre histórico conservado" }], {
    period: "2025-01",
    amount: 5000,
  });
  receipt(f, cancelled, f.p, [{ id: f.o, name: "Ana Prueba" }], { cancelledAt: "2026-01-11" });
  payment(f, r + "-split", f.o, 12000, [
    [r, 3000],
    [r2, 4000],
  ]); // 50 euros de crédito.
  payment(f, r + "-coowner", f.o2, 2000, [[r, 2000]]);
  payment(f, r + "-former", f.old, 1000, [[old, 1000]]);
  payment(f, r + "-reversed", f.o, 1000, [[r, 1000]], { reversedAt: "2026-01-12" });
  payment(f, r + "-cancelled", f.o, 10000, [[cancelled, 10000]]);
  db.prepare("DELETE FROM owners WHERE id=?").run(f.old);
  const text = await certificate({ communityId: f.c, propertyId: f.p });
  for (const name of ["Ana Prueba", "Beatriz Prueba"])
    assert.match(text, new RegExp(`Nombre: ${name}`));
  assert.match(text, /Nombre \(histórico\): Nombre histórico conservado/);
  assert.match(text, /Total pendiente: 90,00 €/);
  assert.match(text, /Total pagado \(histórico\): 60,00 €/);
  assert.doesNotMatch(text, /Saldo a favor sin asignar: /);
  const ownerText = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(ownerText, /Total pagado \(histórico\): 70,00 €/);
  assert.match(ownerText, /Saldo a favor sin asignar: 50,00 €/);
});

test("R4: la configuración jurídica decide la expresión de la deuda y el porcentaje histórico", async () => {
  const f = fixture(),
    r = f.p + "-receipt";
  receipt(f, r, f.p, [{ id: f.o, name: "Ana Prueba" }]);
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({
      deudaCopropietarios: {
        expresion: "cuota",
        mostrarRepartoInterno: true,
        porcentajesHistoricos: "no_consta",
      },
    }),
    f.c,
  );
  const missing = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(missing, /Total pendiente imputable: 0,00 €/);
  assert.match(missing, /Deuda del inmueble \(referencia\): 100,00 €/);
  assert.match(missing, /porcentaje no consta/i);
  assert.match(missing, /Régimen: comunidad de propietarios/);
  // El porcentaje acreditado al emitir manda; el actual no lo sustituye.
  db.prepare("UPDATE fee_receipts SET snapshot=? WHERE id=?").run(
    JSON.stringify({
      community: "Comunidad de prueba",
      property: f.p,
      owners: [{ id: f.o, name: "Ana Prueba", percentage: 70 }],
    }),
    r,
  );
  db.prepare("UPDATE properties SET ownerPercentages=? WHERE id=?").run(
    JSON.stringify({ [f.o]: 30 }),
    f.p,
  );
  const saved = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(saved, /70 % · 70,00 €/);
  assert.match(saved, /Total pendiente imputable: 70,00 €/);
  // Con «último conocido» se usa el porcentaje actual, avisando de que no acredita el histórico.
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({
      deudaCopropietarios: {
        expresion: "cuota",
        mostrarRepartoInterno: false,
        porcentajesHistoricos: "ultimo_conocido",
      },
    }),
    f.c,
  );
  db.prepare("UPDATE fee_receipts SET snapshot=? WHERE id=?").run(
    JSON.stringify({ community: "Comunidad de prueba", property: f.p, owners: [{ id: f.o, name: "Ana Prueba" }] }),
    r,
  );
  const current = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(current, /Total pendiente imputable: 30,00 €/);
  assert.doesNotMatch(current, /Reparto interno del titular/);
  assert.match(current, /porcentaje actual, no acreditado al emitir/);
  // En asociaciones el pie no invoca la LPH.
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({ regimen: "asociacion" }),
    f.c,
  );
  const association = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(association, /Régimen: asociación/);
  assert.doesNotMatch(association, /artículo 9.1.e de la LPH/);
  // «Omitir» prevalece sobre la casilla de mostrar reparto interno.
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({
      deudaCopropietarios: {
        expresion: "cuota",
        mostrarRepartoInterno: true,
        porcentajesHistoricos: "omitir",
      },
    }),
    f.c,
  );
  const omitted = await certificate({ communityId: f.c, ownerId: f.o });
  assert.doesNotMatch(omitted, /Reparto interno del titular/);
  assert.doesNotMatch(omitted, /Reparto interno del titular: porcentaje no consta/);
});

test("R5: propietario con inmuebles en una comunidad secundaria obtiene su certificado", async () => {
  const f = fixture(),
    secondary = fixture(),
    r = secondary.p + "-receipt";
  db.prepare("UPDATE properties SET ownerIds=? WHERE id=?").run(JSON.stringify([f.o]), secondary.p);
  receipt(secondary, r, secondary.p, [{ id: f.o, name: "Ana Prueba" }]);
  assert.equal(row("owners", f.o).communityId, f.c);
  const text = await certificate({ communityId: secondary.c, ownerId: f.o });
  assert.match(text, new RegExp(`Inmueble: ${secondary.p}`));
  assert.match(text, /Total pendiente: 100,00 €/);
  const staff = account("community_admin", ["fee:read", "fee:manage", "community:read"]);
  db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(staff.id, secondary.c);
  const result = await request(
    staff,
    `/fees/communities/${secondary.c}/debt-certificate?ownerId=${f.o}`,
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.subarray(0, 5).toString(), "%PDF-");
  assert.equal(
    (await request(staff, `/fees/communities/${f.c}/debt-certificate?ownerId=${f.o}`)).status,
    403,
  );
});

test("R5: certificado global del propietario identifica y desglosa todos sus inmuebles", async () => {
  const f = fixture(),
    other = fixture();
  receipt(f, f.p + "-receipt", f.p, [{ id: f.o, name: "Ana Prueba" }]);
  receipt(f, f.p2 + "-receipt", f.p2, [{ id: f.o, name: "Ana Prueba" }], { amount: 20000 });
  receipt(other, other.p + "-receipt", other.p, [{ id: f.o, name: "Ana Prueba" }], {
    amount: 90000,
  });
  const text = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(text, new RegExp(`Inmueble: ${f.p}\\nPendiente del inmueble: 100,00 €`));
  assert.match(text, new RegExp(`Inmueble: ${f.p2}\\nPendiente del inmueble: 200,00 €`));
  assert.match(text, /Total pendiente: 300,00 €/);
  assert.doesNotMatch(text, new RegExp(other.p));
});

test("R5: la pertenencia histórica y el nombre del inmueble proceden de los recibos", async () => {
  const f = fixture(),
    primary = fixture();
  receipt(f, f.p + "-receipt", f.p, [{ id: f.o, name: "Ana histórica" }], {
    snapshot: JSON.stringify({
      community: "Comunidad histórica",
      property: "Vivienda histórica",
      owners: [{ id: f.o, name: "Ana histórica" }],
    }),
  });
  db.prepare("UPDATE owners SET communityId=? WHERE id=?").run(primary.c, f.o);
  db.prepare("UPDATE properties SET ownerIds='[]' WHERE id IN (?,?)").run(f.p, f.p2);
  const text = await certificate({ communityId: f.c, ownerId: f.o });
  assert.match(text, /Inmueble: Vivienda histórica/);
  assert.match(text, /Total pendiente: 100,00 €/);
  assert.equal(
    (await request(admin, `/fees/communities/${f.c}/debt-certificate?ownerId=${f.o}`)).status,
    200,
  );
});

test("R5: un propietario sin pertenencia real recibe 404 sin interrumpir la API", async () => {
  const f = fixture(),
    unrelated = fixture();
  // Ni siquiera el campo primario por sí solo acredita pertenencia.
  db.prepare("UPDATE owners SET communityId=? WHERE id=?").run(unrelated.c, f.o);
  const result = await request(
    admin,
    `/fees/communities/${unrelated.c}/debt-certificate?ownerId=${f.o}`,
  );
  assert.equal(result.status, 404);
  assert.match(result.data.error, /inmuebles ni historial/);
  assert.equal((await property(f)).id, f.p);
  const ambiguous = await request(
    admin,
    `/fees/communities/${f.c}/debt-certificate?ownerId=${f.o}&propertyId=${f.p}`,
  );
  assert.equal(ambiguous.status, 400);
});

const requiredFields = {
  communities: ["name", "nif", "address", "city"],
  owners: ["name", "surname", "dni", "email", "phone", "address", "city"],
  properties: ["plot", "propertyType", "address", "city"],
  tenants: ["name", "surname", "documentId", "phone", "email"],
};
function validInput(collection, f) {
  const common = {
    name: "Nombre nuevo",
    surname: "Apellido",
    address: "Calle completa",
    city: "Madrid",
    email: "nuevo@example.test",
    phone: "612345678",
  };
  return {
    communities: {
      name: common.name,
      nif: dni(50000000 + serial),
      address: common.address,
      city: common.city,
    },
    owners: { ...common, dni: dni(40000000 + serial) },
    properties: {
      communityId: f.c,
      ownerIds: [f.o],
      ownerPercentages: { [f.o]: 100 },
      participationCoef: "25",
      plot: "Vivienda nueva",
      propertyType: "vivienda",
      address: common.address,
      city: common.city,
    },
    tenants: {
      ...common,
      documentId: dni(30000000 + serial),
      propertyId: f.p,
      ownerId: f.o,
      contractStart: "2020-01-01",
    },
  }[collection];
}
for (const collection of Object.keys(requiredFields)) {
  test(`R6: las altas de ${collection} rechazan cada obligatorio omitido, nulo o vacío sin persistir`, async () => {
    const f = fixture(),
      complete = validInput(collection, f);
    const before = db.prepare(`SELECT COUNT(*) n FROM ${collection}`).get().n;
    for (const field of requiredFields[collection]) {
      for (const value of [undefined, null, "", "   "]) {
        const input = { ...complete, [field]: value };
        if (value === undefined) delete input[field];
        const result = await request(admin, `/${collection}`, "POST", input);
        assert.equal(result.status, 400, `${collection}.${field}: ${JSON.stringify(result.data)}`);
        assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${collection}`).get().n, before);
      }
    }
    const result = await request(admin, `/${collection}`, "POST", complete);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${collection}`).get().n, before + 1);
  });

  test(`R6: editar parcialmente ${collection} conserva los campos omitidos y valida el resultado`, async () => {
    const f = fixture(),
      id = { communities: f.c, owners: f.o, properties: f.p, tenants: f.t }[collection];
    const before = row(collection, id);
    const changes = collection === "tenants" ? { monthlyRent: "500" } : { notes: "Nota parcial" };
    let result = await request(admin, `/${collection}/${id}`, "PUT", {
      version: before.version,
      ...changes,
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    for (const field of requiredFields[collection])
      assert.equal(row(collection, id)[field], before[field]);
    for (const [field, value] of Object.entries(changes))
      assert.equal(row(collection, id)[field], value);
    if (collection === "owners")
      assert.deepEqual(result.data.propertyIds.sort(), [f.p, f.p2].sort());
    const saved = row(collection, id),
      mandatory = requiredFields[collection].at(-1);
    result = await request(admin, `/${collection}/${id}`, "PUT", {
      version: saved.version,
      [mandatory]: " ",
    });
    assert.equal(result.status, 400);
    assert.deepEqual(row(collection, id), saved);
    db.prepare(`UPDATE ${collection} SET ${mandatory}='' WHERE id=?`).run(id);
    const incomplete = row(collection, id);
    result = await request(admin, `/${collection}/${id}`, "PUT", {
      version: incomplete.version,
      notes: "No guardar",
    });
    assert.equal(result.status, 400);
    assert.deepEqual(row(collection, id), incomplete);
    result = await request(admin, `/${collection}/${id}`, "PUT", {
      version: incomplete.version,
      [mandatory]: before[mandatory],
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  });
}

test("R6: la edición parcial de un propietario local conserva todos sus inmuebles", async () => {
  const f = fixture(),
    other = fixture();
  db.prepare("UPDATE properties SET communityId=? WHERE id=?").run(other.c, f.p2);
  rebuildOwnersPropertyIds();
  const staff = account("community_admin", [
    "owner:manage",
    "owner:read",
    "property:read",
    "property:manage",
    "community:read",
  ]);
  db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(staff.id, f.c);
  const before = row("owners", f.o);
  const propertiesBefore = db.prepare("SELECT * FROM properties ORDER BY id").all();
  const result = await request(staff, `/owners/${f.o}`, "PUT", {
    version: before.version,
    notes: "Nota local",
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(row("owners", f.o).propertyIds, before.propertyIds);
  assert.deepEqual(db.prepare("SELECT * FROM properties ORDER BY id").all(), propertiesBefore);
});

test("R6: las ediciones parciales validan documento y fechas contra los campos conservados", async () => {
  const f = fixture(),
    owner = row("owners", f.o);
  let result = await request(admin, `/owners/${f.o}`, "PUT", {
    version: owner.version,
    documentType: "NIE",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(row("owners", f.o), owner);
  db.prepare("UPDATE tenants SET contractEnd='2030-01-01' WHERE id=?").run(f.t);
  const tenant = row("tenants", f.t);
  result = await request(admin, `/tenants/${f.t}`, "PUT", {
    version: tenant.version,
    contractStart: "2031-01-01",
  });
  assert.equal(result.status, 400);
  assert.deepEqual(row("tenants", f.t), tenant);
});

const cancel = (id) => fees.cancelReceipt(id, { reason: "Rectificar datos del recibo" }, admin);
function correction(id, changes = {}) {
  const input = { reason: "Rectificación individual revisada", ...changes };
  const batch = fees.previewReceiptRectification(id, input, admin);
  return fees.rectifyReceipt(id, { ...input, token: batch.token }, admin);
}
function ordinary(f) {
  fees.savePlan(
    f.c,
    {
      annualAmount: "1200",
      months: 1,
      effectiveFrom: "2026-01-01",
      dueDay: 5,
      mode: "coefficient",
      agreement: "Junta de prueba",
    },
    admin,
  );
  const batch = fees.preview(f.c, "2026-01");
  return fees.issue(f.c, { period: batch.period, token: batch.token }, admin).ids;
}
function assessment(f) {
  const parent = fees.saveAssessment(
    f.c,
    {
      name: "Derrama de prueba",
      purpose: "Reparación",
      agreement: "Junta de prueba",
      totalAmount: "200",
      mode: "coefficient",
      propertyIds: [f.p, f.p2],
      installments: [{ amount: "200", dueDate: "2021-01-10" }],
    },
    admin,
  );
  const batch = fees.previewAssessment(parent.id, 1);
  const ids = fees.issueAssessment(parent.id, { installment: 1, token: batch.token }, admin).ids;
  return { parent, ids };
}
function service(f) {
  const parent = services.saveService(
    f.c,
    {
      service: "agua",
      supplier: "Proveedor",
      invoiceNumber: f.p,
      period: "2021-01",
      issueDate: "2021-01-01",
      dueDate: "2021-01-10",
      totalAmount: "200",
      billing: "receipts",
      method: "coefficient",
      propertyIds: [f.p, f.p2],
    },
    admin,
  );
  const batch = services.previewService(parent.id);
  const ids = services.issueService(parent.id, { token: batch.token }, admin).ids;
  return { parent, ids };
}

test("R7: rectifica solo la cuota anulada, conserva pagos hermanos y registra la cadena", async () => {
  const f = fixture(),
    [first, sibling] = ordinary(f);
  payment(f, first + "-payment", f.o, 2000, [[sibling, 2000]]);
  const siblingBefore = row("fee_receipts", sibling),
    allocationsBefore = db
      .prepare("SELECT * FROM fee_allocations ORDER BY paymentId,receiptId")
      .all();
  cancel(first);
  const original = row("fee_receipts", first),
    input = { amount: "40", dueDate: "2099-01-10", reason: "Importe individual corregido" };
  const route = `/fees/receipts/${first}`;
  const denied = await request(limited, route + "/rectification/preview", "POST", input);
  assert.equal(denied.status, 403);
  const batch = await request(admin, route + "/rectification/preview", "POST", input);
  assert.equal(batch.status, 200, JSON.stringify(batch.data));
  const stale = await request(admin, route + "/rectify", "POST", {
    ...input,
    amount: "45",
    token: batch.data.token,
  });
  assert.equal(stale.status, 409);
  const created = await request(admin, route + "/rectify", "POST", {
    ...input,
    token: batch.data.token,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.amount, 4000);
  assert.equal(created.data.rectifiesReceiptId, first);
  assert.deepEqual(row("fee_receipts", first), original);
  assert.deepEqual(row("fee_receipts", sibling), siblingBefore);
  assert.deepEqual(
    db.prepare("SELECT * FROM fee_allocations ORDER BY paymentId,receiptId").all(),
    allocationsBefore,
  );
  assert.equal(fees.receiptView(original).rectifiedBy, created.data.id);
  assert.equal(fees.receiptView(original).canRectify, false);
  assert.equal(
    (await request(admin, route + "/rectify", "POST", { ...input, token: batch.data.token }))
      .status,
    409,
  );
  assert.ok(
    db
      .prepare("SELECT 1 FROM access_audit WHERE action='fee.rectify' AND resourceId=?")
      .get(created.data.id),
  );
  cancel(created.data.id);
  const next = correction(created.data.id);
  assert.equal(next.rectifiesReceiptId, created.data.id);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM fee_receipts WHERE communityId=? AND cancelledAt=''")
      .get(f.c).n,
    2,
  );
});

test("R7: un plazo con todos sus recibos anulados puede rectificarse sin emitir el lote", () => {
  const f = fixture(),
    { parent, ids } = assessment(f);
  for (const id of ids) cancel(id);
  let detail = fees.assessmentDetail(fees.assessmentById(parent.id));
  assert.equal(detail.status, "rectification");
  assert.equal(detail.installments[0].status, "rectification");
  assert.equal(detail.totals.outstanding, 0);
  const created = correction(ids[0], { dueDate: "2099-01-10" });
  assert.equal(created.amount, 10000);
  assert.throws(() => correction(ids[1], { amount: "101" }), /reparto aprobado/);
  assert.equal(fees.assessmentDetail(fees.assessmentById(parent.id)).status, "rectification");
  correction(ids[1], { dueDate: "2099-01-10" });
  detail = fees.assessmentDetail(fees.assessmentById(parent.id));
  assert.equal(detail.status, "active");
  assert.equal(detail.installments[0].status, "issued");
  assert.equal(detail.installments[0].overdue, false);
  assert.equal(detail.totals.issued, 20000);
  assert.equal(detail.receipts.filter((r) => !r.cancelledAt).length, 2);
});

test("R7: anular el plazo tras anular sus recibos es posible y revoca la rectificación", () => {
  const f = fixture(),
    { parent, ids } = assessment(f);
  for (const id of ids) cancel(id);
  const input = { reason: "Rectificación antes de anular plazo" },
    batch = fees.previewReceiptRectification(ids[0], input, admin);
  const cancelled = fees.cancelAssessment(
    parent.id,
    { installment: 1, reason: "Se descarta el plazo completo" },
    admin,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.throws(() => fees.rectifyReceipt(ids[0], { ...input, token: batch.token }, admin), {
    status: 409,
  });
  assert.equal(fees.receiptView(row("fee_receipts", ids[0])).canRectify, false);
});

test("R7: servicio sin recibos activos requiere rectificación y recupera un estado coherente", () => {
  const f = fixture(),
    { parent, ids } = service(f);
  for (const id of ids) cancel(id);
  let detail = services.serviceDetail(services.serviceBillById(parent.id));
  assert.equal(detail.status, "rectification");
  assert.equal(detail.totals.outstanding, 0);
  assert.equal(detail.needsRectification, true);
  assert.equal(detail.canEdit, false); // El reparto emitido conserva su histórico.
  const first = correction(ids[0], { dueDate: "2099-01-10" });
  const before = row("fee_receipts", first.id);
  correction(ids[1], { dueDate: "2099-01-10" });
  detail = services.serviceDetail(services.serviceBillById(parent.id));
  assert.equal(detail.status, "issued");
  assert.equal(detail.totals.issued, 20000);
  assert.equal(detail.needsRectification, false);
  assert.deepEqual(row("fee_receipts", first.id), before);
  assert.equal(detail.receipts.filter((r) => !r.cancelledAt).length, 2);
});

test("R7: no rectifica recibos activos, solapados ni de un servicio anulado", () => {
  const f = fixture(),
    ids = ordinary(f);
  assert.throws(() => correction(ids[0]), { status: 409 });
  cancel(ids[0]);
  const old = row("fee_receipts", ids[0]);
  receipt(f, old.id + "-overlap", old.propertyId, [{ id: f.o, name: "Ana Prueba" }], {
    period: "2025-12",
    periodEnd: "2026-02-28",
  });
  assert.throws(() => correction(ids[0]), /solapa/);
  const s = service(f);
  services.cancelService(s.parent.id, { reason: "Factura sin efecto" }, admin);
  assert.throws(() => correction(s.ids[0]), { status: 409 });
});

test("R8: no permite quitar el último titular ni asociar contratos a un inmueble heredado vacío", async () => {
  const f = fixture(),
    current = await property(f),
    tenantBefore = row("tenants", f.t);
  const result = await request(admin, `/properties/${f.p}`, "PUT", {
    ...current,
    ownerIds: [],
    ownerPercentages: {},
  });
  assert.equal(result.status, 400);
  assert.deepEqual((await property(f)).ownerIds, current.ownerIds);
  assert.deepEqual(row("tenants", f.t), tenantBefore);
  db.prepare("UPDATE properties SET ownerIds='[]', ownerPercentages='{}' WHERE id=?").run(f.p2);
  const legacy = (await request(admin, `/properties/${f.p2}`)).data;
  assert.equal(
    (
      await request(admin, `/properties/${f.p2}`, "PUT", {
        version: legacy.version,
        linkTenantIds: [f.t],
      })
    ).status,
    400,
  );
  const saved = await request(admin, `/properties/${f.p2}`, "PUT", {
    version: legacy.version,
    notes: "Ficha heredada por reparar",
  });
  assert.equal(saved.status, 200);
  const repaired = await request(admin, `/properties/${f.p2}`, "PUT", {
    version: saved.data.version,
    ownerIds: [f.o],
    ownerPercentages: { [f.o]: 100 },
  });
  assert.equal(repaired.status, 200, JSON.stringify(repaired.data));
});

test("R9: añadir un titular exige porcentaje explícito y conserva el 60/30 existente", async () => {
  const f = fixture(),
    current = await property(f);
  let result = await request(admin, `/properties/${f.p}`, "PUT", {
    ...current,
    ownerIds: [f.o, f.o2],
    ownerPercentages: { [f.o]: 60, [f.o2]: 30 },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const before = row("properties", f.p),
    ownerBefore = row("owners", f.old);
  result = await request(admin, `/owners/${f.old}`, "PUT", {
    version: ownerBefore.version,
    propertyIds: [f.p],
  });
  assert.equal(result.status, 400);
  assert.deepEqual(row("properties", f.p), before);
  assert.deepEqual(row("owners", f.old), ownerBefore);
  result = await request(admin, `/owners/${f.old}`, "PUT", {
    version: ownerBefore.version,
    propertyIds: [f.p],
    propertyShares: [{ propertyId: f.p, percentage: 10, version: before.version }],
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(JSON.parse(row("properties", f.p).ownerPercentages), {
    [f.o]: 60,
    [f.o2]: 30,
    [f.old]: 10,
  });
});

test("R9: altas incompletas y porcentajes ausentes no cambian fichas ni reparan inmuebles ajenos", async () => {
  const f = fixture();
  db.prepare("UPDATE properties SET ownerPercentages='{}' WHERE id=?").run(f.p2);
  const untouched = row("properties", f.p2);
  const input = validInput("owners", f),
    beforeCount = db.prepare("SELECT COUNT(*) n FROM owners").get().n;
  let result = await request(admin, "/owners", "POST", { ...input, propertyIds: [f.p] });
  assert.equal(result.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM owners").get().n, beforeCount);
  const current = await property(f);
  result = await request(admin, `/properties/${f.p}`, "PUT", {
    version: current.version,
    ownerIds: [f.o, f.o2],
  });
  assert.equal(result.status, 400);
  assert.deepEqual((await property(f)).ownerIds, [f.o]);
  result = await request(admin, `/properties/${f.p}`, "PUT", {
    version: current.version,
    notes: "Solo observaciones",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(row("properties", f.p2), untouched);
});

test("R10: el cambio incompatible de moneda es atómico y las emisiones EUR siguen disponibles", async () => {
  const f = fixture();
  ordinary(f);
  const before = row("communities", f.c),
    receipts = db.prepare("SELECT * FROM fee_receipts WHERE communityId=? ORDER BY id").all(f.c);
  assert.equal((await request(admin, `/communities/${f.c}`)).data.hasFinancialActivity, true);
  const result = await request(admin, `/communities/${f.c}`, "PUT", {
    version: before.version,
    currency: "USD",
    notes: "No guardar",
  });
  assert.equal(result.status, 409, JSON.stringify(result.data));
  assert.equal(result.data.code, "COMMUNITY_CURRENCY_LOCKED");
  assert.deepEqual(row("communities", f.c), before);
  assert.deepEqual(
    db.prepare("SELECT * FROM fee_receipts WHERE communityId=? ORDER BY id").all(f.c),
    receipts,
  );
  assert.equal(fees.preview(f.c, "2026-02").rows.length, 2);
});

for (const activity of ["plan", "payment", "assessment", "service", "cancelled-receipt"]) {
  test(`R10: actividad ${activity} por sí sola impide pasar a otra moneda`, async () => {
    const f = fixture();
    const common = {
      id: f.c + "-activity",
      communityId: f.c,
      createdAt: "2026-01-01",
      actorId: admin.id,
    };
    if (activity === "plan")
      insert("fee_plans", { ...common, effectiveFrom: "2026-01-01", data: "{}" });
    if (activity === "payment") payment(f, common.id, f.o, 1000, []);
    if (activity === "assessment")
      insert("fee_assessments", {
        ...common,
        name: "Derrama borrador",
        totalAmount: 1000,
        data: '{"installments":[]}',
      });
    if (activity === "service")
      insert("service_bills", {
        ...common,
        service: "agua",
        period: "2026-01",
        issueDate: "2026-01-01",
        dueDate: "2026-01-10",
        totalAmount: 1000,
        data: "{}",
      });
    if (activity === "cancelled-receipt")
      receipt(f, common.id, f.p, [{ id: f.o, name: "Ana" }], { cancelledAt: "2026-01-02" });
    const current = row("communities", f.c);
    const result = await request(admin, `/communities/${f.c}`, "PUT", {
      version: current.version,
      currency: "GBP",
    });
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.deepEqual(row("communities", f.c), current);
  });
}

test("R10: rechaza códigos de moneda que no son ISO de tres letras", async () => {
  const f = fixture();
  const current = row("communities", f.c);
  for (const currency of ["US", "US$", "EURO"]) {
    const result = await request(admin, `/communities/${f.c}`, "PUT", {
      version: current.version,
      currency,
    });
    assert.equal(result.status, 400, `${currency}: ${JSON.stringify(result.data)}`);
    assert.match(result.data.error, /ISO/i);
  }
  assert.equal(row("communities", f.c).currency, current.currency);
});

test("R10: admite moneda sin actividad y permite restaurar EUR sin convertir el histórico", async () => {
  const f = fixture();
  let result = await request(admin, `/communities/${f.c}`, "PUT", {
    version: row("communities", f.c).version,
    currency: " usd ",
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.currency, "USD");
  assert.equal(result.data.hasFinancialActivity, false);
  // Simula una ficha que quedó incoherente con versiones anteriores.
  const id = f.p + "-historic";
  receipt(f, id, f.p, [{ id: f.o, name: "Ana" }]);
  const original = row("fee_receipts", id);
  result = await request(admin, `/communities/${f.c}`, "PUT", {
    version: result.data.version,
    notes: "Nota sobre ficha heredada",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.currency, "USD");
  result = await request(admin, `/communities/${f.c}`, "PUT", {
    version: result.data.version,
    currency: "eur",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.currency, "EUR");
  assert.deepEqual(row("fee_receipts", id), original);
});

function proofFile(f, receiptId, { diskName = crypto.randomUUID(), write = true } = {}) {
  const proofDirectory = path.join(directory, "uploads", "fee-proofs");
  mkdirSync(proofDirectory, { recursive: true });
  const file = path.join(proofDirectory, diskName);
  if (write) writeFileSync(file, "%PDF-1.4 synthetic proof");
  const id = crypto.randomUUID();
  insert("fee_proofs", {
    id,
    receiptId,
    ownerId: f.o,
    fileName: "justificante.pdf",
    diskName,
    mime: "application/pdf",
    createdAt: "2026-01-01",
    actorId: admin.id,
  });
  fees.adminNotice(row("fee_receipts", receiptId), f.o, "Justificante sintético");
  return { id, diskName, file };
}

test("R11: purga recibo, avisos y justificante físico sin tocar los de otros recibos", async () => {
  const f = fixture(),
    [first, sibling] = ordinary(f);
  const proof = proofFile(f, first),
    otherProof = proofFile(f, sibling);
  cancel(first);
  const event = db.prepare("SELECT id FROM fee_events WHERE receiptId=? LIMIT 1").get(first);
  insert("fee_mail", { eventId: event.id, updatedAt: "2026-01-01" });
  const siblingBefore = row("fee_receipts", sibling);
  const result = await request(admin, `/fees/receipts/${first}/purge`, "POST", {});
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.cleanup.failed, 0);
  assert.equal(row("fee_receipts", first), undefined);
  for (const [table, column] of [
    ["fee_proofs", "receiptId"],
    ["fee_events", "receiptId"],
    ["fee_allocations", "receiptId"],
    ["owner_notifications", "feeReceiptId"],
    ["admin_emails", "feeReceiptId"],
  ])
    assert.equal(
      db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(first).n,
      0,
      table,
    );
  assert.equal(db.prepare("SELECT 1 FROM fee_mail WHERE eventId=?").get(event.id), undefined);
  assert.equal(existsSync(proof.file), false);
  assert.equal(existsSync(otherProof.file), true);
  assert.ok(row("fee_proofs", otherProof.id));
  assert.deepEqual(row("fee_receipts", sibling), siblingBefore);
  assert.ok(db.prepare("SELECT 1 FROM owner_notifications WHERE feeReceiptId=?").get(sibling));
});

test("R11: un rollback de purga conserva el archivo, sus registros y las notificaciones", () => {
  const f = fixture(),
    [first] = ordinary(f),
    proof = proofFile(f, first);
  cancel(first);
  const receiptBefore = row("fee_receipts", first),
    proofBefore = row("fee_proofs", proof.id);
  const notifications = db
    .prepare("SELECT * FROM owner_notifications WHERE feeReceiptId=? ORDER BY id")
    .all(first);
  db.exec(`CREATE TEMP TRIGGER fail_receipt_purge BEFORE DELETE ON fee_receipts WHEN OLD.id='${first}'
    BEGIN SELECT RAISE(ABORT, 'rollback sintético'); END`);
  try {
    assert.throws(() => fees.purgeReceipt(first, admin), /rollback sintético/);
    assert.deepEqual(row("fee_receipts", first), receiptBefore);
    assert.deepEqual(row("fee_proofs", proof.id), proofBefore);
    assert.deepEqual(
      db.prepare("SELECT * FROM owner_notifications WHERE feeReceiptId=? ORDER BY id").all(first),
      notifications,
    );
    assert.equal(
      db.prepare("SELECT 1 FROM fee_proof_cleanup WHERE diskName=?").get(proof.diskName),
      undefined,
    );
    assert.equal(existsSync(proof.file), true);
  } finally {
    db.exec("DROP TRIGGER fail_receipt_purge");
  }
});

test("R11: los fallos de disco quedan persistidos y el worker los reintenta", async (t) => {
  const f = fixture(),
    [first] = ordinary(f),
    proof = proofFile(f, first);
  cancel(first);
  const originalUnlink = fs.unlinkSync;
  t.mock.method(fs, "unlinkSync", (file) => {
    if (file === proof.file) {
      assert.equal(db.isTransaction, false);
      throw Object.assign(new Error("Disco ocupado"), { code: "EACCES" });
    }
    return originalUnlink(file);
  });
  const cleanup = fees.purgeReceipt(first, admin);
  t.mock.restoreAll();
  assert.equal(cleanup.failed, 1);
  assert.equal(row("fee_receipts", first), undefined);
  assert.equal(existsSync(proof.file), true);
  const connection = new DatabaseSync(
    db
      .prepare("PRAGMA database_list")
      .all()
      .find((item) => item.name === "main").file,
  );
  try {
    const pending = connection
      .prepare("SELECT * FROM fee_proof_cleanup WHERE diskName=?")
      .get(proof.diskName);
    assert.equal(pending.attempts, 1);
    assert.equal(pending.lastError, "EACCES");
    assert.ok(pending.nextAttemptAt > Date.now());
  } finally {
    connection.close();
  }
  assert.throws(() => fees.transaction(() => processFeeProofCleanup()), /después de confirmar/);
  db.prepare("UPDATE fee_proof_cleanup SET nextAttemptAt=0 WHERE diskName=?").run(proof.diskName);
  await processFeeNotifications(async () => {
    throw new Error("Este test no debe enviar correo");
  });
  assert.equal(existsSync(proof.file), false);
  assert.equal(
    db.prepare("SELECT 1 FROM fee_proof_cleanup WHERE diskName=?").get(proof.diskName),
    undefined,
  );
});

test("R11: la purga de derramas limpia las dependencias de todos sus recibos", async () => {
  const f = fixture(),
    a = assessment(f);
  const proofs = a.ids.map((id) => proofFile(f, id));
  fees.cancelAssessment(a.parent.id, { reason: "Derrama anulada para purgar" }, admin);
  const result = await request(admin, `/fees/assessments/${a.parent.id}/purge`, "POST", {});
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.cleanup.failed, 0);
  assert.equal(row("fee_assessments", a.parent.id), undefined);
  for (const id of a.ids) {
    assert.equal(row("fee_receipts", id), undefined);
    assert.equal(
      db.prepare("SELECT 1 FROM owner_notifications WHERE feeReceiptId=?").get(id),
      undefined,
    );
    assert.equal(db.prepare("SELECT 1 FROM admin_emails WHERE feeReceiptId=?").get(id), undefined);
  }
  for (const proof of proofs) assert.equal(existsSync(proof.file), false);
});

test("R11: archivo ausente es idempotente y una ruta fuera de justificantes queda detectada", () => {
  const f = fixture(),
    [first, second] = ordinary(f);
  proofFile(f, first, { write: false });
  cancel(first);
  assert.equal(fees.purgeReceipt(first, admin).failed, 0);
  const outside = path.join(directory, "uploads", "sentinel.pdf");
  writeFileSync(outside, "No se debe eliminar");
  const invalid = proofFile(f, second, { diskName: "../sentinel.pdf", write: false });
  cancel(second);
  const cleanup = fees.purgeReceipt(second, admin);
  assert.equal(cleanup.failed, 1);
  assert.equal(existsSync(outside), true);
  assert.equal(
    db.prepare("SELECT lastError FROM fee_proof_cleanup WHERE diskName=?").get(invalid.diskName)
      .lastError,
    "INVALID_PATH",
  );
});
