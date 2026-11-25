import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import PDFDocument from "pdfkit";

const directory = mkdtempSync(path.join(tmpdir(), "pen-property-transfer-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { rebuildOwnersPropertyIds } = await import("../../src/domain.js");

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
const admin = account("super_admin");
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
  assert.ok(path.basename(directory).startsWith("pen-property-transfer-"));
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
  const prefix = `transfer-${++serial}-`;
  const f = Object.fromEntries(
    ["c", "c2", "o", "o2", "p", "other"].map((key) => [key, prefix + key]),
  );
  for (const [id, name, nif] of [
    [f.c, "Comunidad de origen", dni(71000000 + serial)],
    [f.c2, "Comunidad de destino", dni(72000000 + serial)],
  ])
    insert("communities", {
      id,
      name,
      nif,
      currency: "EUR",
      address: "Calle de prueba",
      city: "Madrid",
      legalConfig: JSON.stringify({ regimen: "lph" }),
    });
  for (const [id, name, communityId, offset] of [
    [f.o, "Ana", f.c, 1],
    [f.o2, "Beatriz", f.c, 2],
  ])
    insert("owners", {
      id,
      name,
      surname: "Prueba",
      dni: dni(10000000 + serial * 3 + offset),
      communityId,
      email: `${id}@example.test`,
      phone: "612345678",
      address: "Calle de prueba",
      city: "Madrid",
    });
  for (const [id, communityId, name, plot, ownerId, coef] of [
    [f.p, f.c, "Comunidad de origen", "Parcela 1", f.o, "50"],
    [f.other, f.c2, "Comunidad de destino", "Parcela ajena", f.o2, "50"],
  ])
    insert("properties", {
      id,
      communityId,
      communityName: name,
      plot,
      propertyType: "vivienda",
      address: "Calle de prueba",
      city: "Madrid",
      participationCoef: coef,
      ownerIds: JSON.stringify([ownerId]),
      ownerPercentages: JSON.stringify({ [ownerId]: 100 }),
    });
  rebuildOwnersPropertyIds();
  return f;
}
function receipt(f, id, owners, extra = {}) {
  insert("fee_receipts", {
    id,
    communityId: f.c,
    propertyId: f.p,
    planId: "",
    period: "2026-01",
    periodEnd: "2026-01-31",
    dueDate: "2026-01-10",
    amount: 4250,
    snapshot: JSON.stringify({
      community: "Comunidad de origen",
      property: "Parcela 1",
      owners,
    }),
    createdAt: "2026-01-01",
    actorId: admin.id,
    ...extra,
  });
}
function payment(f, id, ownerId, amount, allocations) {
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
  });
  for (const [receiptId, allocated] of allocations)
    insert("fee_allocations", { paymentId: id, receiptId, amount: allocated });
}
async function pdf(route) {
  const texts = [];
  const original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (text, ...args) {
    texts.push(String(text));
    return original.call(this, text, ...args);
  };
  try {
    const result = await request(admin, route);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.subarray(0, 5).toString(), "%PDF-");
    return texts.join("\n").replaceAll("\u00a0", " ");
  } finally {
    PDFDocument.prototype.text = original;
  }
}
async function property(f) {
  const result = await request(admin, `/properties/${f.p}`);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}

test("A-01: el certificado de origen conserva la deuda tras trasladar el inmueble y el de destino no la oculta", async () => {
  const f = fixture(),
    r = f.p + "-receipt";
  receipt(f, r, [{ id: f.o, name: "Ana Prueba", percentage: 100 }]);
  payment(f, r + "-payment", f.o, 1000, [[r, 1000]]);

  const moved = await request(admin, `/properties/${f.p}`, "PUT", {
    ...(await property(f)),
    communityId: f.c2,
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.communityId, f.c2);
  // El traslado no reescribe el libro financiero: el recibo sigue en origen.
  assert.equal(row("fee_receipts", r).communityId, f.c);
  assert.equal(row("fee_receipts", r).amount, 4250);

  const origin = await pdf(`/fees/communities/${f.c}/debt-certificate?propertyId=${f.p}`);
  assert.match(origin, /Total pendiente: 32,50 €/);
  assert.match(origin, /Total pagado \(histórico\): 10,00 €/);
  assert.match(origin, /pertenece actualmente a otra comunidad/);
  assert.match(origin, /recoge el historial de recibos emitidos en esta comunidad/);

  const destination = await pdf(`/fees/communities/${f.c2}/debt-certificate?propertyId=${f.p}`);
  assert.match(destination, /No hay recibos pendientes de pago\./);
  assert.match(
    destination,
    /Su historial financiero consta en la comunidad de origen: Comunidad de origen\./,
  );

  // Un inmueble de otra comunidad sin recibos en origen sigue fuera de su ámbito.
  const foreign = await request(
    admin,
    `/fees/communities/${f.c}/debt-certificate?propertyId=${f.other}`,
  );
  assert.equal(foreign.status, 404);
  assert.match(foreign.data.error, /Inmueble no encontrado/);

  const audit = db
    .prepare("SELECT * FROM access_audit WHERE action='property.community-changed' AND resourceId=?")
    .get(f.p);
  assert.ok(audit, "el traslado debe quedar auditado");
  const details = JSON.parse(audit.details);
  assert.equal(details.fromCommunityId, f.c);
  assert.equal(details.toCommunityId, f.c2);
  assert.equal(details.receiptsKeptInOrigin, 1);
});

test("A-03: la titularidad parcial se conserva y se avisa del porcentaje sin asignar", async () => {
  const f = fixture();
  let result = await request(admin, `/properties/${f.p}`, "PUT", {
    version: (await property(f)).version,
    ownerIds: [f.o, f.o2],
    ownerPercentages: { [f.o]: 60, [f.o2]: 30 },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(JSON.parse(row("properties", f.p).ownerPercentages), {
    [f.o]: 60,
    [f.o2]: 30,
  });
  const text = await pdf(`/fees/communities/${f.c}/debt-certificate?propertyId=${f.p}`);
  assert.match(text, /Titularidad asignada: 90 %\. Queda 10 % sin asignar/);
  assert.match(text, /la cuota del inmueble no se redistribuye/);

  // La política no cambia: la suma de porcentajes nunca puede superar el 100 %.
  result = await request(admin, `/properties/${f.p}`, "PUT", {
    version: result.data.version,
    ownerIds: [f.o, f.o2],
    ownerPercentages: { [f.o]: 60, [f.o2]: 50 },
  });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /no puede superar el 100%/);
  assert.deepEqual(JSON.parse(row("properties", f.p).ownerPercentages), {
    [f.o]: 60,
    [f.o2]: 30,
  });
});
