import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";

const directory = mkdtempSync(
  path.join(tmpdir(), "penarrubia-services-test-"),
);
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
// Simula una base anterior a los servicios, con recibos e índice ordinario.
db.exec(`CREATE TABLE fee_receipts (
  id TEXT PRIMARY KEY, communityId TEXT NOT NULL, propertyId TEXT NOT NULL,
  planId TEXT NOT NULL, period TEXT NOT NULL, periodEnd TEXT NOT NULL,
  dueDate TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
  snapshot TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
  cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='';`);
db.prepare("INSERT INTO fee_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
  "legacy-service-receipt",
  "legacy-service-community",
  "legacy-service-property",
  "legacy-service-plan",
  "2030-12",
  "2030-12-31",
  "2030-12-10",
  10000,
  JSON.stringify({
    property: "Unidad antigua",
    community: "Histórica",
    owners: [],
  }),
  "2026-01-01",
  "legacy-actor",
  "",
  "",
);
const fees = await import("../../src/fees.js");
const services = await import("../../src/services.js");
const { default: router } = await import("../../src/routes/index.js");
const actor = db
  .prepare("SELECT * FROM users WHERE usuario='super_admin'")
  .get();
const manager = db
  .prepare("SELECT * FROM users WHERE rol='community_admin' LIMIT 1")
  .get();
const owner1 = "own-seed-1",
  owner2 = "service-owner-2";
db.prepare(
  "INSERT INTO owners(id,name,surname,dni,userId) VALUES(?,?,?,?,?)",
).run(
  owner2,
  "Titular",
  "Servicios",
  "SERVICE-OWNER-2",
  db.prepare("SELECT id FROM users WHERE usuario='urucp2'").get().id,
);
const defaults = {
  service: "agua",
  supplier: "Canal de Isabel II",
  invoiceNumber: "AGUA-2030-01",
  period: "2030-01",
  issueDate: "2030-01-10",
  dueDate: "2030-02-10",
  totalAmount: "200",
  billing: "receipts",
  method: "coefficient",
  legalBasis: "",
  notes: "",
  reminders: {
    beforeDays: 3,
    afterDays: 7,
    repeatDays: 0,
    internal: true,
    email: false,
  },
};
let sequence = 0,
  server,
  base,
  admin,
  owner,
  other,
  tenant,
  staff;
function community(coefficients = ["25", "75"]) {
  const id = `service-community-${++sequence}`;
  db.prepare(
    "INSERT INTO communities(id,name,nif,adminUserId,currency) VALUES(?,?,?,?,?)",
  ).run(
    id,
    `Servicios ${sequence}`,
    `SERVICE-${sequence}`,
    manager.id,
    "EUR",
  );
  const properties = coefficients.map((_, index) => `${id}-p${index + 1}`);
  for (const [index, propertyId] of properties.entries())
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
    ).run(
      propertyId,
      id,
      `Unidad ${index + 1}`,
      JSON.stringify([index % 2 ? owner2 : owner1]),
      coefficients[index],
    );
  return { id, properties };
}
function create(changes = {}) {
  const c = community(changes.coefficients);
  const input = { ...defaults, ...changes };
  delete input.coefficients;
  return {
    ...c,
    service: services.saveService(c.id, input, actor),
  };
}
function preview(id) {
  return services.previewService(id);
}
function issue(id) {
  const batch = preview(id);
  return services.issueService(id, { token: batch.token }, actor);
}
function detail(id) {
  return services.serviceDetail(services.serviceBillById(id));
}
function payment(communityId, ownerId, amount, receiptIds) {
  return fees.recordPayment(
    communityId,
    {
      ownerId,
      amount,
      receiptIds,
      paidOn: new Date().toISOString().slice(0, 10),
      method: "transfer",
      reference: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
    actor,
  );
}
function client() {
  let cookie = "";
  async function request(route, method = "GET", body) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie")) {
      cookie = response.headers.get("set-cookie").split(";")[0];
      request.cookie = cookie;
    }
    return {
      status: response.status,
      data: (response.headers.get("content-type") || "").includes(
        "application/json",
      )
        ? await response.json()
        : await response.text(),
    };
  }
  return request;
}
async function ok(request, route, method = "GET", body, expected = 200) {
  const result = await request(route, method, body);
  assert.equal(result.status, expected, JSON.stringify(result.data));
  return result.data;
}
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((error, _req, res, _next) =>
    res.status(500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  [admin, owner, other, tenant, staff] = Array.from({ length: 5 }, client);
  for (const [request, usuario] of [
    [admin, "super_admin"],
    [owner, "urucp1"],
    [other, "urucp2"],
    [tenant, "uruci1"],
    [staff, manager.usuario],
  ])
    await ok(request, "/auth/signin", "POST", { usuario, password: usuario });
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-services-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("servicios: migra recibos anteriores, crea índices independientes y es idempotente", async () => {
  assert.equal(
    fees.receiptById("legacy-service-receipt").serviceBillId,
    "",
  );
  const indexes = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE name IN ('fee_receipts_period','fee_receipts_assessment','fee_receipts_service')",
    )
    .all();
  assert.equal(indexes.length, 3);
  assert.match(
    indexes.find((x) => x.name === "fee_receipts_period").sql,
    /serviceBillId=''/,
  );
  assert.match(
    indexes.find((x) => x.name === "fee_receipts_service").sql,
    /serviceBillId<>''/,
  );
  await import("../../src/services.js?restart-test");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM schema_migrations WHERE id='service-bills-v1'",
      )
      .get().n,
    1,
  );
  assert.equal(
    fees.receiptById("legacy-service-receipt").amount,
    10000,
  );
});

test("servicios API: exige sesión, gestión y comunidad asignada en todas las operaciones", async () => {
  const c = community(),
    route = `/fees/communities/${c.id}/services`;
  assert.equal((await client()(route)).status, 401);
  for (const request of [owner, tenant]) {
    assert.equal((await request(route)).status, 403);
    assert.equal((await request(route, "POST", defaults)).status, 403);
  }
  const service = await ok(staff, route, "POST", defaults, 201);
  assert.equal((await ok(staff, route)).services.length, 1);
  assert.equal(
    (await ok(owner, `/fees/communities/${c.id}`)).services.length,
    0,
  );
  for (const request of [owner, tenant])
    for (const [suffix, method, body] of [
      ["", "GET"],
      ["", "PUT", defaults],
      ["/preview", "POST"],
      ["/issue", "POST"],
      ["/cancel", "POST", { reason: "Prueba" }],
    ])
      assert.equal(
        (await request(`/fees/services/${service.id}${suffix}`, method, body))
          .status,
        403,
      );
  db.prepare("UPDATE communities SET adminUserId='' WHERE id=?").run(c.id);
  assert.equal((await staff(route)).status, 403);
  assert.equal((await staff(`/fees/services/${service.id}`)).status, 403);
});

test("servicios: valida factura, reparto, selección y lecturas antes de guardar", () => {
  const c = community(["50", "50"]);
  const invalid = [
    [{ service: "internet" }, /suministro/i],
    [{ period: "2030-13" }, /periodo/i],
    [{ issueDate: "2030-02-30" }, /fecha de factura/i],
    [{ dueDate: "2030-01-09" }, /vencimiento/i],
    [{ totalAmount: "0" }, /importe/i],
    [{ billing: "loan" }, /facturación/i],
    [{ method: "equal" }, /criterio/i],
    [{ propertyIds: [] }, /al menos un inmueble/i],
    [{ propertyIds: [c.properties[0], c.properties[0]] }, /duplicados/i],
    [{ propertyIds: [c.properties[0], "other-community"] }, /otra comunidad/i],
    [{ method: "manual" }, /Importe de Unidad 1/i],
    [{ method: "mixed" }, /parte variable/i],
    [
      {
        method: "reading",
        readings: {
          [c.properties[0]]: { previous: "10", current: "5" },
          [c.properties[1]]: { previous: "0", current: "5" },
        },
      },
      /no puede ser menor/i,
    ],
    [
      {
        method: "reading",
        readings: {
          [c.properties[0]]: { previous: "10", current: "10" },
          [c.properties[1]]: { previous: "5", current: "5" },
        },
      },
      /No hay inmuebles con consumo/i,
    ],
  ];
  for (const [change, pattern] of invalid)
    assert.throws(
      () =>
        services.saveService(
          c.id,
          {
            ...defaults,
            ...change,
          },
          actor,
        ),
      pattern,
    );
  assert.equal(services.services(c.id).length, 0);
  const odd = community(["20", "70"]);
  assert.throws(
    () => services.saveService(odd.id, defaults, actor),
    /Deben sumar 100/i,
  );
});

test("servicios: reparte por coeficiente, congela el reparto, emite recibos y cobra", () => {
  const c = create();
  assert.deepEqual(c.service.allocations, {
    [c.properties[0]]: 5000,
    [c.properties[1]]: 15000,
  });
  assert.equal(c.service.status, "draft");
  assert.equal(c.service.canEdit, true);
  const batch = preview(c.service.id);
  assert.deepEqual(
    batch.rows.map((row) => row.amount),
    [5000, 15000],
  );
  assert.match(batch.token, /^[a-f0-9]{64}$/);

  // Cambiar el censo o los coeficientes no altera el reparto congelado.
  db.prepare("UPDATE properties SET participationCoef='10' WHERE id=?").run(
    c.properties[0],
  );
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run(
    `${c.id}-new`,
    c.id,
    "Alta posterior",
    JSON.stringify([owner2]),
    "15",
  );
  const same = preview(c.service.id);
  assert.deepEqual(
    same.rows.map((row) => row.amount),
    [5000, 15000],
  );
  assert.equal(same.token, batch.token);

  const result = issue(c.service.id);
  assert.equal(result.ids.length, 2);
  assert.equal(result.total, 20000);
  const frozen = detail(c.service.id);
  assert.equal(frozen.status, "issued");
  assert.equal(frozen.receipts.length, 2);
  assert.equal(frozen.receipts[0].kind, "service");
  assert.equal(frozen.receipts[0].serviceBillId, c.service.id);
  assert.equal(
    frozen.receipts[0].concept,
    "Servicio de Agua · 2030-01",
  );
  assert.equal(frozen.totals.issued, 20000);
  assert.equal(frozen.totals.outstanding, 20000);
  assert.throws(() => issue(c.service.id), /ya fue emitido/i);
  assert.throws(
    () => services.saveService(c.id, defaults, actor, c.service.id),
    /ya fue emitido/i,
  );

  const first = detail(c.service.id).receipts.find(
    (receipt) => receipt.propertyId === c.properties[0],
  );
  const paid = payment(c.id, owner1, "50", [first.id]);
  const paymentNotice = db
    .prepare(
      "SELECT message FROM owner_notifications WHERE feeReceiptId=? AND title='Cobro registrado' ORDER BY timestamp DESC LIMIT 1",
    )
    .get(first.id);
  assert.match(paymentNotice.message, /para el servicio de Agua · 2030-01/);
  assert.doesNotMatch(paymentNotice.message, /servicio servicio/i);
  const partial = detail(c.service.id);
  assert.equal(partial.status, "partial");
  assert.equal(partial.totals.paid, 5000);
  assert.throws(
    () => services.cancelService(c.service.id, { reason: "Prueba" }, actor),
    /Revertí primero los cobros/i,
  );
  fees.reversePayment(paid.id, { reason: "Devolución de prueba" }, actor);
  const returnNotice = db
    .prepare(
      "SELECT message FROM owner_notifications WHERE feeReceiptId=? AND title='Devolución de cobro' ORDER BY timestamp DESC LIMIT 1",
    )
    .get(first.id);
  assert.match(returnNotice.message, /aplicado sobre el servicio de Agua/);
  assert.doesNotMatch(returnNotice.message, /a el servicio|servicio servicio/i);
  const cancelled = services.cancelService(
    c.service.id,
    { reason: "Factura duplicada" },
    actor,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.receipts.every((receipt) => receipt.cancelledAt), true);
  assert.equal(cancelled.totals.outstanding, 0);
  const cancelNotice = db
    .prepare(
      "SELECT message FROM owner_notifications WHERE feeReceiptId=? AND title='Servicio anulado' ORDER BY timestamp DESC LIMIT 1",
    )
    .get(first.id);
  assert.match(cancelNotice.message, /Se anuló el servicio de Agua · 2030-01/);
  assert.doesNotMatch(cancelNotice.message, /servicio servicio/i);
});

test("servicios: reparte por lecturas, omite consumos cero y conserva la última lectura", () => {
  const c = community(["50", "30", "20"]);
  const service = services.saveService(
    c.id,
    {
      ...defaults,
      totalAmount: "100",
      method: "reading",
      readings: {
        [c.properties[0]]: { previous: "100", current: "120" },
        [c.properties[1]]: { previous: "10", current: "40" },
        [c.properties[2]]: { previous: "5", current: "5" },
      },
    },
    actor,
  );
  assert.deepEqual(service.allocations, {
    [c.properties[0]]: 4000,
    [c.properties[1]]: 6000,
  });
  assert.equal(service.omitted.length, 1);
  assert.equal(service.omitted[0].propertyId, c.properties[2]);
  assert.match(service.warnings.join(" "), /sin consumo/i);
  const batch = preview(service.id);
  assert.equal(batch.rows.length, 2);
  assert.equal(batch.total, 10000);
  issue(service.id);
  const stored = detail(service.id);
  assert.equal(stored.receipts.length, 2);
  assert.equal(
    stored.receipts.find((r) => r.propertyId === c.properties[0]).snapshot
      .serviceReadingConsumption,
    20000,
  );
  const meters = services.lastServiceReadings(c.id);
  assert.equal(meters.agua[c.properties[0]].reading, 120000);
  assert.equal(meters.agua[c.properties[1]].reading, 40000);
  assert.equal(meters.agua[c.properties[2]].reading, 5000);
  // La lectura anterior de un nuevo borrador se propone desde la anterior.
  const next = services.saveService(
    c.id,
    {
      ...defaults,
      period: "2030-02",
      issueDate: "2030-02-10",
      dueDate: "2030-03-10",
      totalAmount: "100",
      method: "reading",
      readings: {
        [c.properties[0]]: { previous: "120", current: "125" },
        [c.properties[1]]: { previous: "40", current: "45" },
      },
      propertyIds: [c.properties[0], c.properties[1]],
    },
    actor,
  );
  assert.equal(next.readings[c.properties[0]].previous, 120000);
  assert.equal(
    services.lastServiceReadings(c.id).agua[c.properties[0]].reading,
    120000,
  );
});

test("servicios: reparto mixto separa parte fija y variable y avisa por calefacción centralizada", () => {
  const c = community(["25", "75"]);
  const service = services.saveService(
    c.id,
    {
      ...defaults,
      totalAmount: "100",
      method: "mixed",
      variableShare: "50",
      centralHeating: true,
      readings: {
        [c.properties[0]]: { previous: "0", current: "10" },
        [c.properties[1]]: { previous: "0", current: "30" },
      },
    },
    actor,
  );
  assert.equal(service.allocations[c.properties[0]], 2500);
  assert.equal(service.allocations[c.properties[1]], 7500);
  const rows = new Map(
    service.breakdown.map((row) => [row.propertyId, row]),
  );
  assert.equal(rows.get(c.properties[0]).fixed, 1250);
  assert.equal(rows.get(c.properties[0]).variable, 1250);
  assert.equal(rows.get(c.properties[1]).fixed, 3750);
  assert.equal(rows.get(c.properties[1]).variable, 3750);
  assert.match(service.warnings.join(" "), /RD 736\/2020/);
  assert.match(service.warnings.join(" "), /base legal/i);
  const withoutVariable = services.saveService(
    c.id,
    {
      ...defaults,
      totalAmount: "100",
      method: "mixed",
      variableShare: "50",
      readings: {
        [c.properties[0]]: { previous: "0", current: "10" },
        [c.properties[1]]: { previous: "0", current: "0" },
      },
    },
    actor,
  );
  assert.equal(withoutVariable.allocations[c.properties[0]], 6250);
  assert.equal(withoutVariable.allocations[c.properties[1]], 3750);
  assert.match(withoutVariable.warnings.join(" "), /solo paga la parte fija/i);
});

test("servicios: acepta importes manuales y renombra coeficientes al elegir un subconjunto", () => {
  const c = community(["20", "30", "50"]);
  assert.throws(
    () =>
      services.saveService(
        c.id,
        {
          ...defaults,
          method: "manual",
          manual: {
            [c.properties[0]]: "50",
            [c.properties[1]]: "50",
            [c.properties[2]]: "50",
          },
        },
        actor,
      ),
    /coincidir con el total/i,
  );
  const manual = services.saveService(
    c.id,
    {
      ...defaults,
      method: "manual",
      legalBasis: "Acuerdo de Junta de 2030",
      manual: {
        [c.properties[0]]: "50",
        [c.properties[1]]: "50",
        [c.properties[2]]: "100",
      },
    },
    actor,
  );
  assert.deepEqual(manual.allocations, {
    [c.properties[0]]: 5000,
    [c.properties[1]]: 5000,
    [c.properties[2]]: 10000,
  });
  assert.doesNotMatch(manual.warnings.join(" "), /base legal/i);

  const subset = services.saveService(
    c.id,
    {
      ...defaults,
      totalAmount: "100",
      propertyIds: [c.properties[0]],
    },
    actor,
  );
  assert.equal(subset.subset, true);
  assert.equal(subset.allocations[c.properties[0]], 10000);
  assert.equal(subset.effectiveCoefficients[c.properties[0]], 100);
  const batch = preview(subset.id);
  assert.equal(batch.rows.length, 1);
  assert.equal(batch.rows[0].snapshot.coefficient, 100);
});

test("servicios: el modo informativo no crea recibos ni deuda", () => {
  const c = create({ billing: "informative" });
  assert.equal(c.service.billing, "informative");
  issue(c.service.id);
  const stored = detail(c.service.id);
  assert.equal(stored.status, "informative");
  assert.equal(stored.receipts.length, 0);
  assert.equal(stored.totals.issued, 0);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM fee_receipts WHERE serviceBillId=?",
      )
      .get(c.service.id).n,
    0,
  );
  assert.equal(
    services.cancelService(c.service.id, { reason: "Sin efecto" }, actor)
      .status,
    "cancelled",
  );
});

test("servicios: el reparto informativo se ve en Mis cuotas y solo para sus propietarios", async () => {
  const c = create({ billing: "informative" });
  issue(c.service.id);
  const mine = await ok(owner, "/fees/mine");
  const entry = mine.informativeServices.find((s) => s.id === c.service.id);
  assert.ok(entry, "el reparto informativo aparece en Mis cuotas");
  assert.equal(entry.concept, "Servicio de Agua · 2030-01");
  assert.equal(entry.totalAmount, 20000);
  assert.equal(entry.properties.length, 1);
  assert.equal(entry.properties[0].propertyId, c.properties[0]);
  assert.equal(entry.properties[0].coefficient, 25);
  assert.equal(entry.properties[0].amount, 5000);
  assert.equal(
    mine.receipts.some((r) => r.serviceBillId === c.service.id),
    false,
  );
  const otherMine = await ok(other, "/fees/mine");
  const otherEntry = otherMine.informativeServices.find(
    (s) => s.id === c.service.id,
  );
  assert.ok(otherEntry, "el copropietario también ve el reparto informativo");
  assert.equal(otherEntry.properties[0].propertyId, c.properties[1]);
  assert.equal(otherEntry.properties[0].amount, 15000);
  const tenantMine = await tenant("/fees/mine");
  assert.equal(tenantMine.status, 403);
  const communityView = await ok(owner, `/fees/communities/${c.id}`);
  assert.equal(communityView.informativeServices.length, 1);
  assert.equal(communityView.informativeServices[0].id, c.service.id);
  assert.equal(
    communityView.informativeServices[0].properties[0].amount,
    5000,
  );
});

test("servicios: adjunta la factura, descarga y protege los justificantes emitidos", async () => {
  const c = community(),
    route = `/fees/communities/${c.id}/services`;
  const service = await ok(staff, route, "POST", defaults, 201);
  const bad = new FormData();
  bad.append("file", new Blob(["no es una factura"]), "factura.txt");
  assert.equal(
    (await staff(`/fees/services/${service.id}/attachments`, "POST", bad))
      .status,
    400,
  );
  const pdf = Buffer.from("%PDF-1.4\nfactura de prueba\n%%EOF");
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "factura.pdf");
  const attachment = await ok(
    staff,
    `/fees/services/${service.id}/attachments`,
    "POST",
    form,
    201,
  );
  assert.equal(attachment.fileName, "factura.pdf");
  const anonymous = await fetch(
    `${base}/fees/service-attachments/${attachment.id}/download`,
  );
  assert.equal(anonymous.status, 401);
  const result = await fetch(
    `${base}/fees/service-attachments/${attachment.id}/download`,
    { headers: { Cookie: staff.cookie || "" } },
  );
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /application\/pdf/);
  assert.match(await result.text(), /factura de prueba/);
  await ok(
    staff,
    `/fees/service-attachments/${attachment.id}`,
    "DELETE",
  );
  const second = new FormData();
  second.append("file", new Blob([pdf], { type: "application/pdf" }), "factura.pdf");
  await ok(
    staff,
    `/fees/services/${service.id}/attachments`,
    "POST",
    second,
    201,
  );
  await ok(staff, `/fees/services/${service.id}/issue`, "POST", {
    token: preview(service.id).token,
  }, 201);
  const receipts = db
    .prepare(
      "SELECT * FROM fee_receipts WHERE serviceBillId=? ORDER BY propertyId",
    )
    .all(service.id);
  const ownerReceipt = receipts.find(
    (receipt) => receipt.propertyId === c.properties[0],
  );
  const latest = services.serviceDetail(services.serviceBillById(service.id))
    .attachments[0];
  const receiptDetail = await ok(
    owner,
    `/fees/receipts/${ownerReceipt.id}`,
  );
  assert.equal(receiptDetail.serviceAttachments.length, 1);
  assert.equal(receiptDetail.serviceAttachments[0].id, latest.id);
  const ownerDownload = await fetch(
    `${base}/fees/service-attachments/${latest.id}/download`,
    { headers: { Cookie: owner.cookie || "" } },
  );
  assert.equal(ownerDownload.status, 200);
  const tenantDownload = await fetch(
    `${base}/fees/service-attachments/${latest.id}/download`,
    { headers: { Cookie: tenant.cookie || "" } },
  );
  assert.equal(tenantDownload.status, 403);
  assert.equal(
    (
      await staff(
        `/fees/service-attachments/${attachment.id}`,
        "DELETE",
      )
    ).status,
    404,
  );
  assert.equal(
    (await staff(`/fees/service-attachments/${latest.id}`, "DELETE")).status,
    409,
  );
});

test("servicios: sin pestaña de avisos conserva los recordatorios guardados y no los copia en los nuevos", () => {
  const c = community(),
    withReminders = services.saveService(
      c.id,
      { ...defaults, reminders: { ...defaults.reminders, beforeDays: 12 } },
      actor,
    );
  assert.equal(withReminders.reminders.beforeDays, 12);
  const withoutReminders = { ...defaults };
  delete withoutReminders.reminders;
  const edited = services.saveService(
    c.id,
    withoutReminders,
    actor,
    withReminders.id,
  );
  assert.equal(edited.reminders.beforeDays, 12);
  const fresh = services.saveService(c.id, withoutReminders, actor);
  assert.deepEqual(fresh.reminders, {});
});

test("servicios: fotos de contadores se guardan por inmueble y sobreviven a la emisión", async () => {
  const c = community(),
    route = `/fees/communities/${c.id}/services`,
    service = await ok(staff, route, "POST", defaults, 201);
  const bad = new FormData();
  bad.append("file", new Blob(["no es una foto"]), "contador.txt");
  assert.equal(
    (
      await staff(
        `/fees/services/${service.id}/reading-photos/${c.properties[0]}`,
        "POST",
        bad,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await staff(
        `/fees/services/${service.id}/reading-photos/otro-inmueble`,
        "POST",
        new FormData(),
      )
    ).status,
    400,
  );
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "contador.png");
  const photo = await ok(
    staff,
    `/fees/services/${service.id}/reading-photos/${c.properties[0]}`,
    "POST",
    form,
    201,
  );
  assert.equal(photo.kind, "reading");
  assert.equal(photo.propertyId, c.properties[0]);
  const saved = detail(service.id);
  assert.equal(
    saved.attachments.filter((item) => item.kind === "reading").length,
    1,
  );
  assert.equal(saved.attachmentCount, 0, "las fotos no cuentan como facturas");
  const download = await fetch(
    `${base}/fees/service-attachments/${photo.id}/download`,
    { headers: { Cookie: staff.cookie || "" } },
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type"), /image\/png/);
  await ok(staff, `/fees/services/${service.id}/issue`, "POST", {
    token: preview(service.id).token,
  }, 201);
  assert.equal(
    (await staff(`/fees/service-attachments/${photo.id}`, "DELETE")).status,
    200,
  );
  assert.equal(detail(service.id).attachments.length, 0);
});

test("servicios: no permite borrar ni mover inmuebles incluidos en un reparto vigente", async () => {
  const c = create();
  const property = c.properties[0];
  assert.equal((await admin(`/properties/${property}`, "DELETE")).status, 409);
  assert.equal(
    (
      await admin(`/properties/${property}`, "PUT", {
        communityId: `${c.id}-otra`,
        plot: "Unidad 1",
        participationCoef: "25",
        ownerIds: [owner1],
      })
    ).status,
    409,
  );
});
