import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";

const directory = mkdtempSync(
  path.join(tmpdir(), "penarrubia-assessments-test-"),
);
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
// Simula una base anterior a las derramas, con recibos e índice ordinario.
db.exec(`CREATE TABLE fee_receipts (
  id TEXT PRIMARY KEY, communityId TEXT NOT NULL, propertyId TEXT NOT NULL,
  planId TEXT NOT NULL, period TEXT NOT NULL, periodEnd TEXT NOT NULL,
  dueDate TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
  snapshot TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
  cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='';`);
db.prepare("INSERT INTO fee_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
  "legacy-receipt",
  "legacy-community",
  "legacy-property",
  "legacy-plan",
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
const { default: router } = await import("../../src/routes/index.js");
const { processFeeNotifications } = await import("../../src/fee-worker.js");
const actor = db
  .prepare("SELECT * FROM users WHERE usuario='super_admin'")
  .get();
const manager = db
  .prepare("SELECT * FROM users WHERE rol='community_admin' LIMIT 1")
  .get();
const o1 = "own-seed-1",
  o2 = "assessment-owner-2";
db.prepare(
  "INSERT INTO owners(id,name,surname,dni,userId) VALUES(?,?,?,?,?)",
).run(
  o2,
  "Titular",
  "Segundo",
  "ASSESSMENT-OWNER-2",
  db.prepare("SELECT id FROM users WHERE usuario='urucp2'").get().id,
);
const defaults = {
  name: "Rehabilitación de fachada",
  purpose: "Reparar el revestimiento",
  agreement: "Junta extraordinaria",
  totalAmount: "200",
  mode: "coefficient",
  installments: [
    { amount: "80", dueDate: "2030-12-10" },
    { amount: "120", dueDate: "2031-01-10" },
  ],
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
function community() {
  const id = `assessment-community-${++sequence}`;
  db.prepare(
    "INSERT INTO communities(id,name,nif,adminUserId,currency) VALUES(?,?,?,?,?)",
  ).run(
    id,
    `Derramas ${sequence}`,
    `ASSESSMENT-${sequence}`,
    manager.id,
    "EUR",
  );
  const properties = [1, 2].map((n) => `${id}-p${n}`);
  for (const [index, propertyId] of properties.entries())
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
    ).run(
      propertyId,
      id,
      `Unidad ${index + 1}`,
      JSON.stringify([index ? o2 : o1]),
      index ? "75" : "25",
    );
  return { id, properties };
}
function create(changes = {}) {
  const c = community();
  return {
    ...c,
    assessment: fees.saveAssessment(c.id, { ...defaults, ...changes }, actor),
  };
}
function issue(id, installment = 1) {
  const batch = fees.previewAssessment(id, installment);
  return fees.issueAssessment(id, { installment, token: batch.token }, actor);
}
function detail(id) {
  return fees.assessmentDetail(fees.assessmentById(id));
}
function payment(communityId, ownerId, amount, receiptIds) {
  return fees.recordPayment(
    communityId,
    {
      ownerId,
      amount,
      receiptIds,
      paidOn: "2026-01-02",
      method: "transfer",
      reference: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
    actor,
  );
}
function client() {
  let cookie = "";
  return async (route, method = "GET", body) => {
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
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return {
      status: response.status,
      data: (response.headers.get("content-type") || "").includes(
        "application/json",
      )
        ? await response.json()
        : await response.text(),
    };
  };
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
  assert.ok(
    path.basename(directory).startsWith("penarrubia-assessments-test-"),
  );
  rmSync(directory, { recursive: true, force: true });
});

test("derramas: migra el esquema anterior conservando recibos e índices independientes; reinicio idempotente", async () => {
  assert.equal(fees.receiptById("legacy-receipt").amount, 10000);
  assert.equal(fees.receiptById("legacy-receipt").assessmentId, "");
  assert.equal(fees.receiptById("legacy-receipt").installment, 0);
  const indexes = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE name IN ('fee_receipts_period','fee_receipts_assessment')",
    )
    .all();
  assert.equal(indexes.length, 2);
  assert.match(
    indexes.find((x) => x.name === "fee_receipts_period").sql,
    /assessmentId=''/,
  );
  assert.match(
    indexes.find((x) => x.name === "fee_receipts_assessment").sql,
    /assessmentId<>''/,
  );
  await import("../../src/fees.js?restart-test");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM schema_migrations WHERE id='extraordinary-fees-v1'",
      )
      .get().n,
    1,
  );
  assert.equal(fees.receiptById("legacy-receipt").amount, 10000);
});

test("derramas API: exige sesión, gestión y comunidad asignada en todas las operaciones", async () => {
  const c = community(),
    route = `/fees/communities/${c.id}/assessments`;
  assert.equal((await client()(route)).status, 401);
  for (const request of [owner, tenant]) {
    assert.equal((await request(route)).status, 403);
    assert.equal((await request(route, "POST", defaults)).status, 403);
  }
  const a = await ok(staff, route, "POST", defaults, 201);
  assert.equal((await ok(staff, route)).length, 1);
  assert.equal(
    (await ok(owner, `/fees/communities/${c.id}`)).assessments.length,
    0,
  );
  for (const request of [owner, tenant])
    for (const [suffix, method, body] of [
      ["", "GET"],
      ["", "PUT", defaults],
      ["/preview", "POST", { installment: 1 }],
      ["/issue", "POST", { installment: 1 }],
      ["/cancel", "POST", { reason: "Prueba" }],
    ])
      assert.equal(
        (await request(`/fees/assessments/${a.id}${suffix}`, method, body))
          .status,
        403,
      );
  db.prepare("UPDATE communities SET adminUserId='' WHERE id=?").run(c.id);
  assert.equal((await staff(route)).status, 403);
  assert.equal((await staff(`/fees/assessments/${a.id}`)).status, 403);
});

test("derramas: valida importes, selección, acuerdos, reparto y vencimientos antes de guardar", async () => {
  const c = community(),
    route = `/fees/communities/${c.id}/assessments`;
  for (const change of [
    { name: "" },
    { name: "x".repeat(121) },
    { agreement: "" },
    { totalAmount: "-1" },
    { totalAmount: "1.001" },
    { mode: "other" },
    { propertyIds: [] },
    { propertyIds: [c.properties[0], c.properties[0]] },
    { propertyIds: ["foreign"] },
    { propertyIds: "invalid" },
    {
      mode: "manual",
      manual: { [c.properties[0]]: "20", [c.properties[1]]: "30" },
    },
    { installments: [] },
    { installments: [{ amount: "200", dueDate: "2030-02-30" }] },
    {
      installments: [
        { amount: "0.01", dueDate: "2030-12-10" },
        { amount: "199.99", dueDate: "2031-01-10" },
      ],
    },
    {
      installments: [
        { amount: "100", dueDate: "2030-12-10" },
        { amount: "100", dueDate: "2030-12-10" },
      ],
    },
    { reminders: { beforeDays: -1 } },
    { reminders: { internal: "yes" } },
  ])
    assert.equal(
      (await admin(route, "POST", { ...defaults, ...change })).status,
      400,
      JSON.stringify(change),
    );
  db.prepare("UPDATE properties SET participationCoef='24' WHERE id=?").run(
    c.properties[0],
  );
  assert.equal((await admin(route, "POST", defaults)).status, 400);
  assert.equal(fees.assessments(c.id).length, 0);
});

test("derramas: congela inmuebles, coeficientes e importes aunque cambien el censo y los coeficientes", () => {
  const c = create();
  const original = fees.previewAssessment(c.assessment.id, 1);
  assert.deepEqual(
    original.rows.map((r) => r.amount),
    [2000, 6000],
  );
  db.prepare("UPDATE properties SET participationCoef='10' WHERE id=?").run(
    c.properties[0],
  );
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run(`${c.id}-new`, c.id, "Alta posterior", JSON.stringify([o1]), "15");
  const frozen = fees.previewAssessment(c.assessment.id, 1);
  assert.deepEqual(frozen.rows, original.rows);
  assert.equal(frozen.token, original.token);
  issue(c.assessment.id);
  assert.equal(detail(c.assessment.id).receipts.length, 2);
});

test("derramas: selección manual, copropiedad y redondeos conservan los totales por inmueble y plazo", () => {
  const c = community();
  db.prepare("UPDATE properties SET ownerIds=? WHERE id=?").run(
    JSON.stringify([o1, o2]),
    c.properties[0],
  );
  const a = fees.saveAssessment(
    c.id,
    {
      ...defaults,
      totalAmount: "100.01",
      mode: "manual",
      manual: { [c.properties[0]]: "33.33", [c.properties[1]]: "66.68" },
      installments: [
        { amount: "33.33", dueDate: "2030-12-10" },
        { amount: "33.33", dueDate: "2031-01-10" },
        { amount: "33.35", dueDate: "2031-02-10" },
      ],
    },
    actor,
  );
  for (let n = 1; n <= 3; n++) {
    const batch = fees.previewAssessment(a.id, n);
    assert.equal(
      batch.rows.reduce((sum, row) => sum + row.amount, 0),
      batch.total,
    );
    issue(a.id, n);
  }
  const rows = detail(a.id).receipts;
  assert.equal(rows.length, 6);
  for (const id of c.properties)
    assert.equal(
      rows
        .filter((r) => r.propertyId === id)
        .reduce((sum, r) => sum + r.amount, 0),
      a.allocations[id],
    );
  const subset = fees.saveAssessment(
    c.id,
    { ...defaults, propertyIds: [c.properties[0]] },
    actor,
  );
  assert.equal(fees.previewAssessment(subset.id, 1).rows[0].amount, 8000);
  assert.equal(fees.previewAssessment(subset.id, 1).rows.length, 1);
});

test("derramas API: borrador editable, vista previa obsoleta, emisión única y convivencia con cuotas ordinarias", async () => {
  const c = create(),
    route = `/fees/assessments/${c.assessment.id}`;
  const edited = await ok(staff, route, "PUT", {
    ...defaults,
    name: "Nuevo nombre",
  });
  assert.equal(edited.canEdit, true);
  const batch = await ok(staff, `${route}/preview`, "POST", { installment: 1 });
  db.prepare(
    "UPDATE properties SET plot='Referencia actualizada' WHERE id=?",
  ).run(c.properties[0]);
  assert.equal(
    (
      await staff(`${route}/issue`, "POST", {
        installment: 1,
        token: batch.token,
      })
    ).status,
    409,
  );
  const fresh = await ok(staff, `${route}/preview`, "POST", { installment: 1 });
  await ok(
    staff,
    `${route}/issue`,
    "POST",
    { installment: 1, token: fresh.token },
    201,
  );
  assert.equal(
    (
      await staff(`${route}/issue`, "POST", {
        installment: 1,
        token: fresh.token,
      })
    ).status,
    409,
  );
  assert.equal((await staff(route, "PUT", defaults)).status, 409);
  fees.savePlan(
    c.id,
    {
      annualAmount: "1200",
      months: 1,
      effectiveFrom: "2030-01-01",
      dueDay: 5,
      mode: "coefficient",
      agreement: "Ordinario",
    },
    actor,
  );
  const ordinary = fees.preview(c.id, "2030-12");
  fees.issue(c.id, { period: ordinary.period, token: ordinary.token }, actor);
  const second = fees.saveAssessment(c.id, defaults, actor);
  issue(second.id);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM fee_receipts WHERE communityId=? AND period='2030-12'",
      )
      .get(c.id).n,
    6,
  );
  const a = await ok(staff, route);
  assert.equal(a.canEdit, false);
  assert.equal(a.status, "active");
});

test("derramas: anula plazos pendientes sin crear recibos, conserva motivo y bloquea emisión y edición", async () => {
  const c = create(),
    route = `/fees/assessments/${c.assessment.id}`;
  const old = fees.previewAssessment(c.assessment.id, 2);
  const a = await ok(staff, `${route}/cancel`, "POST", {
    installment: 2,
    reason: "Acuerdo revocado",
  });
  assert.equal(a.installments[1].status, "cancelled");
  assert.equal(a.installments[1].cancellationReason, "Acuerdo revocado");
  assert.equal(a.totals.unissued, 8000);
  assert.equal(a.totals.cancelled, 12000);
  assert.equal(a.canEdit, false);
  assert.equal(detail(a.id).receipts.length, 0);
  assert.equal(
    (await staff(`${route}/preview`, "POST", { installment: 2 })).status,
    409,
  );
  assert.equal(
    (
      await staff(`${route}/issue`, "POST", {
        installment: 2,
        token: old.token,
      })
    ).status,
    409,
  );
  assert.equal((await staff(route, "PUT", defaults)).status, 409);
  assert.equal(
    (await staff(`${route}/cancel`, "POST", { installment: 2, reason: "Otra" }))
      .status,
    409,
  );
  const cancelled = await ok(staff, `${route}/cancel`, "POST", {
    installment: 1,
    reason: "Cancelar el resto",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.totals.cancelled, 20000);
  assert.equal(cancelled.totals.unissued, 0);
});

test("derramas: anular recibos emitidos nunca devuelve el borrador ni permite reemitir el plazo", async () => {
  const c = create(),
    route = `/fees/assessments/${c.assessment.id}`;
  issue(c.assessment.id);
  const a = await ok(staff, `${route}/cancel`, "POST", {
    installment: 1,
    reason: "Anular primer plazo",
  });
  assert.equal(a.status, "active");
  assert.equal(a.canEdit, false);
  assert.equal(a.totals.unissued, 12000);
  assert.equal(a.totals.cancelled, 8000);
  assert.equal((await staff(route, "PUT", defaults)).status, 409);
  assert.equal(
    (await staff(`${route}/preview`, "POST", { installment: 1 })).status,
    409,
  );
  issue(a.id, 2);
  assert.deepEqual(
    detail(a.id)
      .receipts.filter((r) => r.installment === 2)
      .map((r) => r.amount),
    [3000, 9000],
  );
  const legacy = create();
  const emitted = issue(legacy.assessment.id);
  for (const id of emitted.ids)
    fees.cancelReceipt(id, { reason: "Anulación individual" }, actor);
  assert.equal(detail(legacy.assessment.id).canEdit, false);
  assert.throws(
    () => fees.saveAssessment(legacy.id, defaults, actor, legacy.assessment.id),
    { status: 409 },
  );
  assert.throws(() => fees.previewAssessment(legacy.assessment.id, 1), {
    status: 409,
  });
});

test("derramas: cobros parciales bloquean anulación atómicamente; saldo y devolución se comparten con ordinarias", () => {
  const c = create();
  issue(c.assessment.id);
  issue(c.assessment.id, 2);
  const rows = detail(c.assessment.id).receipts;
  const first = rows.find(
    (r) => r.propertyId === c.properties[0] && r.installment === 1,
  );
  const second = rows.find(
    (r) => r.propertyId === c.properties[0] && r.installment === 2,
  );
  const partial = payment(c.id, o1, "5", [first.id]);
  assert.equal(detail(c.assessment.id).installments[0].status, "partial");
  assert.throws(
    () =>
      fees.cancelAssessment(c.assessment.id, { reason: "Bloqueada" }, actor),
    { status: 409 },
  );
  assert.ok(detail(c.assessment.id).receipts.every((r) => !r.cancelledAt));
  assert.ok(detail(c.assessment.id).installments.every((r) => !r.cancelledAt));
  fees.savePlan(
    c.id,
    {
      annualAmount: "1200",
      months: 1,
      effectiveFrom: "2030-01-01",
      dueDay: 5,
      mode: "coefficient",
      agreement: "Ordinario",
    },
    actor,
  );
  const preview = fees.preview(c.id, "2030-12");
  const ordinary = fees.issue(
    c.id,
    { period: preview.period, token: preview.token },
    actor,
  ).ids[0];
  const paid = payment(c.id, o1, "45", [ordinary, first.id]);
  assert.equal(paid.credit, 500);
  fees.allocateCredit(paid.id, { receiptIds: [second.id] }, actor);
  assert.equal(fees.receiptView(fees.receiptById(second.id)).outstanding, 2500);
  fees.reversePayment(paid.id, { reason: "Devuelto" }, actor);
  assert.equal(fees.receiptView(fees.receiptById(ordinary)).outstanding, 2500);
  assert.equal(fees.receiptView(fees.receiptById(first.id)).paid, 500);
  assert.equal(fees.receiptView(fees.receiptById(second.id)).outstanding, 3000);
  fees.reversePayment(partial.id, { reason: "Devuelto" }, actor);
  const cancelled = fees.cancelAssessment(
    c.assessment.id,
    { reason: "Anulación íntegra" },
    actor,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.totals.outstanding, 0);
  assert.equal(cancelled.totals.unissued, 0);
  assert.equal(cancelled.totals.cancelled, 20000);
});

test("derramas: el estado cobrada excluye plazos anulados y no confunde cobrado con todo emitido", () => {
  const c = create();
  issue(c.assessment.id);
  for (const r of detail(c.assessment.id).receipts)
    payment(c.id, r.snapshot.owners[0].id, (r.amount / 100).toFixed(2), [r.id]);
  assert.equal(detail(c.assessment.id).status, "active");
  const a = fees.cancelAssessment(
    c.assessment.id,
    { installment: 2, reason: "No se necesita" },
    actor,
  );
  assert.equal(a.status, "collected");
  assert.equal(a.totals.paid, 8000);
  assert.throws(
    () => fees.cancelAssessment(a.id, { reason: "Con cobros" }, actor),
    { status: 409 },
  );
});

test("derramas API: recibos propios, justificantes privados, avisos y resumen de Inicio reutilizan el libro", async () => {
  const c = create();
  const issued = issue(c.assessment.id);
  const first = detail(c.assessment.id).receipts[0],
    second = detail(c.assessment.id).receipts[1];
  const mine = await ok(owner, "/fees/mine");
  assert.equal(
    mine.receipts.filter((r) => r.assessmentId === c.assessment.id).length,
    1,
  );
  assert.equal((await owner(`/fees/receipts/${second.id}`)).status, 403);
  assert.equal((await tenant(`/fees/receipts/${first.id}`)).status, 403);
  const receipt = await ok(owner, `/fees/receipts/${first.id}`);
  assert.equal(receipt.kind, "assessment");
  assert.match(receipt.concept, /Derrama.*fachada.*1\/2/);
  assert.equal(receipt.snapshot.assessmentPurpose, defaults.purpose);
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.4\njustificante"], { type: "application/pdf" }),
    "justificante.pdf",
  );
  const proof = await ok(
    owner,
    `/fees/receipts/${first.id}/proofs`,
    "POST",
    form,
    201,
  );
  assert.equal((await other(`/fees/proofs/${proof.id}/download`)).status, 403);
  await ok(staff, `/fees/proofs/${proof.id}/review`, "POST", {
    status: "accepted",
    note: "Comprobar en el banco",
  });
  assert.equal((await ok(owner, `/fees/receipts/${first.id}`)).paid, 0);
  const summary = await ok(owner, `/fees/summary?communityId=${c.id}`);
  assert.equal(summary.totals.pending, 2000);
  assert.equal(summary.nextDue.kind, "assessment");
  assert.match(summary.nextDue.concept, /Derrama/);
  fees.materializeFeeReminders("2030-12-08");
  fees.materializeFeeReminders("2030-12-09");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM fee_events WHERE receiptId=? AND kind='due'",
      )
      .get(issued.ids[0]).n,
    1,
  );
  assert.match(
    db
      .prepare(
        "SELECT message FROM owner_notifications WHERE feeReceiptId=? AND title LIKE 'Próximo%' LIMIT 1",
      )
      .get(first.id).message,
    /Derrama.*fachada/,
  );
  assert.equal((await admin(`/communities/${c.id}`, "DELETE")).status, 409);
});

test("derramas: recordatorios email usan su configuración, consentimiento y concepto; omiten pagados", async () => {
  const c = create({
    propertyIds: undefined,
    reminders: { ...defaults.reminders, email: true },
  });
  issue(c.assessment.id);
  const row = detail(c.assessment.id).receipts[0];
  for (const [id, enabled] of [
    [o1, true],
    [o2, false],
  ]) {
    const userId = db
      .prepare("SELECT userId FROM owners WHERE id=?")
      .get(id).userId;
    db.prepare(
      "INSERT INTO communication_preferences(userId,data) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data",
    ).run(
      userId,
      JSON.stringify({ emailEnabled: enabled, email: `${id}@example.test` }),
    );
  }
  const sent = [];
  await processFeeNotifications(async (_channel, _to, body) => sent.push(body));
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Derrama.*fachada.*1\/2/);
  fees.materializeFeeReminders("2030-12-08");
  await processFeeNotifications(async (_channel, _to, body) => sent.push(body));
  assert.equal(sent.length, 2);
  assert.match(sent[1], /Derrama.*fachada.*Pendiente actual/);
  fees.notify(
    fees.receiptById(row.id),
    "due",
    "paid-before-mail",
    "Vence derrama",
    "Pendiente",
  );
  payment(c.id, o1, "20", [row.id]);
  await processFeeNotifications(async (_channel, _to, body) => sent.push(body));
  assert.equal(
    sent.length,
    3,
    "Solo la confirmación del cobro, sin reclamar un recibo pagado",
  );
});

test("derramas API: EUR obligatorio al crear, previsualizar y emitir; conserva comunidades con borradores", async () => {
  const c = create(),
    route = `/fees/assessments/${c.assessment.id}`;
  assert.equal((await admin(`/communities/${c.id}`, "DELETE")).status, 409);
  const batch = fees.previewAssessment(c.assessment.id, 1);
  db.prepare("UPDATE communities SET currency='USD' WHERE id=?").run(c.id);
  for (const [url, body] of [
    [`/fees/communities/${c.id}/assessments`, defaults],
    [`${route}/preview`, { installment: 1 }],
    [`${route}/issue`, { installment: 1, token: batch.token }],
  ]) {
    const response = await admin(url, "POST", body);
    assert.equal(response.status, 400);
    assert.match(response.data.error, /euros/);
  }
  assert.equal(detail(c.assessment.id).receipts.length, 0);
});

test("derramas API: protege los inmuebles del reparto antes de emitir y permite liberarlos al anular el borrador", async () => {
  const c = create(),
    destination = community();
  const property = await ok(admin, `/properties/${c.properties[0]}`);
  assert.equal(
    (await admin(`/properties/${property.id}`, "DELETE")).status,
    409,
  );
  assert.equal(
    (
      await admin(`/properties/${property.id}`, "PUT", {
        ...property,
        propertyType: "Parcela",
        communityId: destination.id,
      })
    ).status,
    409,
  );
  fees.cancelAssessment(
    c.assessment.id,
    { reason: "Descartar borrador" },
    actor,
  );
  await ok(admin, `/properties/${property.id}`, "DELETE");
});
