import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-fees-test-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
const fees = await import("../../src/fees.js");
const { processFeeNotifications } = await import("../../src/fee-worker.js");
let server,
  base,
  admin,
  owner,
  other,
  tenant,
  staff,
  issued,
  receipt1,
  receipt2,
  secondPayment,
  proofId;
const c1 = "fee-community-1",
  c2 = "fee-community-2",
  o1 = "own-seed-1";
const o2 = "fee-owner-2";
const plan = {
  annualAmount: "1200",
  months: 1,
  effectiveFrom: "2026-01-01",
  dueDay: 5,
  mode: "coefficient",
  agreement: "Junta ordinaria 2025",
  reminders: {
    beforeDays: 3,
    afterDays: 7,
    repeatDays: 0,
    internal: true,
    email: false,
  },
};
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
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      data: type.includes("application/json")
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
  db.prepare(
    "INSERT INTO owners(id,name,surname,dni,userId) VALUES(?,?,?,?,?)",
  ).run(
    o2,
    "Titular",
    "Segundo",
    "FEE-OWNER-2",
    db.prepare("SELECT id FROM users WHERE usuario='urucp2'").get().id,
  );
  const communityAdmin = db
    .prepare("SELECT * FROM users WHERE rol='community_admin' LIMIT 1")
    .get();
  db.prepare(
    "INSERT INTO communities(id,name,nif,adminUserId,currency) VALUES(?,?,?,?,?)",
  ).run(c1, "Comunidad de cuotas", "H-FEE-1", communityAdmin.id, "EUR");
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,?)",
  ).run(c2, "Otra comunidad", "H-FEE-2", "EUR");
  for (const [id, ownerId, coefficient] of [
    ["fee-property-1", o1, "25"],
    ["fee-property-2", o2, "75"],
  ])
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
    ).run(id, c1, id, JSON.stringify([ownerId]), coefficient);
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
    [staff, communityAdmin.usuario],
  ])
    await ok(request, "/auth/signin", "POST", { usuario, password: usuario });
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-fees-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("cuotas: sesión, permisos, ámbito de comunidad y exclusión de inquilinos", async () => {
  assert.equal((await client()(`/fees/communities/${c1}`)).status, 401);
  assert.equal((await tenant(`/fees/communities/${c1}`)).status, 403);
  assert.equal((await owner(`/fees/communities/${c2}`)).status, 403);
  assert.equal((await staff(`/fees/communities/${c2}`)).status, 403);
  assert.equal(
    (await staff(`/fees/communities/${c2}/plans`, "POST", plan)).status,
    403,
  );
  const data = await ok(staff, `/fees/communities/${c1}`);
  assert.equal(data.canManage, true);
  assert.equal(
    (await owner(`/fees/communities/${c1}/plans`, "POST", plan)).status,
    403,
  );
});
test("cuotas: valida importes, fechas, vencimientos y acuerdos sin guardar configuraciones inválidas", async () => {
  for (const changes of [
    { annualAmount: "-1" },
    { annualAmount: "1.001" },
    { annualAmount: "1e3" },
    { annualAmount: 0 },
    { effectiveFrom: "2026-02-30" },
    { effectiveFrom: "2026-01-02" },
    { dueDay: 31 },
    { dueDay: 1.5 },
    { months: 2 },
    { agreement: "" },
    { reminders: { beforeDays: -1 } },
  ])
    assert.equal(
      (
        await admin(`/fees/communities/${c1}/plans`, "POST", {
          ...plan,
          ...changes,
        })
      ).status,
      400,
      JSON.stringify(changes),
    );
  await ok(staff, `/fees/communities/${c1}/plans`, "POST", plan, 201);
  assert.equal(
    (await admin(`/fees/communities/${c1}/plans`, "POST", plan)).status,
    409,
  );
  assert.equal((await owner(`/fees/communities/${c1}`)).data.plans.length, 0);
});
test("cuotas: vista previa verifica el 100 %, titulares, cambios concurrentes y evita duplicados", async () => {
  db.prepare(
    "UPDATE properties SET participationCoef='24' WHERE id='fee-property-1'",
  ).run();
  assert.equal(
    (
      await admin(`/fees/communities/${c1}/preview`, "POST", {
        period: "2026-11",
      })
    ).status,
    400,
  );
  db.prepare(
    "UPDATE properties SET participationCoef='25',ownerIds='[]' WHERE id='fee-property-1'",
  ).run();
  assert.equal(
    (
      await admin(`/fees/communities/${c1}/preview`, "POST", {
        period: "2026-11",
      })
    ).status,
    400,
  );
  db.prepare("UPDATE properties SET ownerIds=? WHERE id='fee-property-1'").run(
    JSON.stringify([o1]),
  );
  const preview = await ok(staff, `/fees/communities/${c1}/preview`, "POST", {
    period: "2026-11",
  });
  assert.equal(preview.total, 10000);
  assert.deepEqual(
    preview.rows.map((r) => r.amount),
    [2500, 7500],
  );
  db.prepare(
    "UPDATE properties SET plot='Nueva referencia' WHERE id='fee-property-1'",
  ).run();
  assert.equal(
    (
      await staff(`/fees/communities/${c1}/issue`, "POST", {
        period: preview.period,
        token: preview.token,
      })
    ).status,
    409,
  );
  const fresh = await ok(staff, `/fees/communities/${c1}/preview`, "POST", {
    period: preview.period,
  });
  issued = await ok(
    staff,
    `/fees/communities/${c1}/issue`,
    "POST",
    { period: fresh.period, token: fresh.token },
    201,
  );
  assert.equal(issued.ids.length, 2);
  assert.equal(
    (
      await staff(`/fees/communities/${c1}/issue`, "POST", {
        period: fresh.period,
        token: fresh.token,
      })
    ).status,
    409,
  );
  const rows = (await ok(admin, `/fees/communities/${c1}`)).receipts;
  receipt1 = rows.find((r) => r.propertyId === "fee-property-1").id;
  receipt2 = rows.find((r) => r.propertyId === "fee-property-2").id;
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM owner_notifications WHERE feeReceiptId=?",
      )
      .get(receipt1).n,
    1,
  );
});
test("cuotas: propietario solo ve sus recibos; no puede emitir, anular ni registrar cobros", async () => {
  const data = await ok(owner, `/fees/communities/${c1}`);
  assert.equal(data.receipts.length, 1);
  assert.equal(data.receipts[0].id, receipt1);
  assert.equal((await owner(`/fees/receipts/${receipt2}`)).status, 403);
  assert.equal(
    (await owner(`/fees/receipts/${receipt1}/cancel`, "POST", { reason: "No" }))
      .status,
    403,
  );
  assert.equal(
    (await owner(`/fees/communities/${c1}/payments`, "POST", {})).status,
    403,
  );
  const personal = await ok(owner, `/fees/owners/${o1}`);
  assert.equal(personal.receipts.length, 1);
});
test("cuotas: pagos parciales, anticipos, reutilización de saldo y devolución íntegra sin duplicados", async () => {
  const payment = {
    ownerId: o1,
    amount: "10",
    paidOn: "2026-01-02",
    method: "transfer",
    reference: "parcial",
    receiptIds: [receipt1],
    requestId: crypto.randomUUID(),
  };
  await ok(staff, `/fees/communities/${c1}/payments`, "POST", payment, 201);
  assert.equal(
    (await staff(`/fees/communities/${c1}/payments`, "POST", payment)).status,
    409,
  );
  assert.equal(
    (
      await staff(`/fees/communities/${c1}/payments`, "POST", {
        ...payment,
        requestId: crypto.randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await staff(`/fees/communities/${c1}/payments`, "POST", {
        ...payment,
        amount: "2",
        receiptIds: [receipt2],
        requestId: crypto.randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (await ok(owner, `/fees/receipts/${receipt1}`)).outstanding,
    1500,
  );
  secondPayment = await ok(
    staff,
    `/fees/communities/${c1}/payments`,
    "POST",
    {
      ...payment,
      amount: "30",
      reference: "sobrante",
      requestId: crypto.randomUUID(),
    },
    201,
  );
  assert.equal(secondPayment.credit, 1500);
  const next = await ok(staff, `/fees/communities/${c1}/preview`, "POST", {
    period: "2026-12",
  });
  await ok(
    staff,
    `/fees/communities/${c1}/issue`,
    "POST",
    { period: next.period, token: next.token },
    201,
  );
  const december = (await ok(owner, `/fees/communities/${c1}`)).receipts.find(
    (r) => r.period === "2026-12",
  );
  const allocated = await ok(
    staff,
    `/fees/payments/${secondPayment.id}/allocate`,
    "POST",
    { receiptIds: [december.id] },
  );
  assert.equal(allocated.credit, 0);
  assert.equal(
    (await ok(owner, `/fees/receipts/${december.id}`)).outstanding,
    1000,
  );
  await ok(staff, `/fees/payments/${secondPayment.id}/return`, "POST", {
    reason: "Devolución bancaria",
  });
  assert.equal(
    (await ok(owner, `/fees/receipts/${receipt1}`)).outstanding,
    1500,
  );
  assert.equal(
    (await ok(owner, `/fees/receipts/${december.id}`)).outstanding,
    2500,
  );
  assert.equal(
    (
      await staff(`/fees/payments/${secondPayment.id}/return`, "POST", {
        reason: "Otra",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await staff(`/fees/receipts/${receipt1}/cancel`, "POST", {
        reason: "Prueba",
      })
    ).status,
    409,
  );
});
test("cuotas: resumen de Inicio respeta rol, ámbito y saldos pendientes", async () => {
  const staffSummary = await ok(staff, `/fees/summary?communityId=${c1}`);
  assert.equal(staffSummary.accessible, true);
  assert.equal(staffSummary.personal, false);
  assert.equal(staffSummary.totals.issued, 20000);
  assert.equal(staffSummary.totals.paid, 1000);
  assert.equal(staffSummary.totals.pending, 19000);
  assert.equal(staffSummary.counts.receipts, 4);
  assert.equal(staffSummary.byCommunity[0].id, c1);
  const ownerSummary = await ok(owner, "/fees/summary");
  assert.equal(ownerSummary.personal, true);
  assert.equal(ownerSummary.totals.issued, 5000);
  assert.equal(ownerSummary.totals.paid, 1000);
  assert.equal(ownerSummary.totals.pending, 4000);
  assert.equal(ownerSummary.counts.receipts, 2);
  assert.equal(ownerSummary.counts.partial, 1);
  assert.equal(ownerSummary.counts.withBalance, 2);
  assert.equal(ownerSummary.nextDue?.period, "2026-12");
  assert.equal((await staff(`/fees/summary?communityId=${c2}`)).status, 403);
  assert.equal((await owner(`/fees/summary?communityId=${c2}`)).status, 403);
  assert.equal((await tenant("/fees/summary")).status, 403);
});

test("cuotas: justificantes privados, contenido validado y revisión independiente del cobro", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob(["%PDF-1.4\njustificante"], { type: "application/pdf" }),
    "justificante.pdf",
  );
  proofId = (
    await ok(owner, `/fees/receipts/${receipt1}/proofs`, "POST", form, 201)
  ).id;
  assert.equal((await other(`/fees/proofs/${proofId}/download`)).status, 403);
  assert.equal(
    (await ok(owner, `/fees/proofs/${proofId}/download`)).startsWith("%PDF-"),
    true,
  );
  const before = (await ok(owner, `/fees/receipts/${receipt1}`)).paid;
  await ok(staff, `/fees/proofs/${proofId}/review`, "POST", {
    status: "accepted",
    note: "Legible; pendiente de comprobar movimiento",
  });
  assert.equal((await ok(owner, `/fees/receipts/${receipt1}`)).paid, before);
  assert.equal(
    (
      await staff(`/fees/proofs/${proofId}/review`, "POST", {
        status: "rejected",
        note: "Cambio",
      })
    ).status,
    409,
  );
  const invalid = new FormData();
  invalid.append(
    "file",
    new Blob(["<script>alert(1)</script>"], { type: "application/pdf" }),
    "falso.pdf",
  );
  assert.equal(
    (await owner(`/fees/receipts/${receipt1}/proofs`, "POST", invalid)).status,
    400,
  );
});
test("cuotas: avisos idempotentes, no avisa al pagado y anulación conserva historial", async () => {
  fees.materializeFeeReminders("2026-11-12");
  fees.materializeFeeReminders("2026-11-13");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM fee_events WHERE receiptId=? AND kind='overdue'",
      )
      .get(receipt1).n,
    1,
  );
  const row = (await ok(staff, `/fees/communities/${c1}`)).receipts.find(
    (r) => r.propertyId === "fee-property-2" && r.period === "2026-12",
  );
  await ok(staff, `/fees/receipts/${row.id}/cancel`, "POST", {
    reason: "Acuerdo rectificado",
  });
  assert.equal(
    (await ok(other, `/fees/receipts/${row.id}`)).status,
    "cancelled",
  );
  assert.equal((await ok(other, `/fees/receipts/${row.id}`)).outstanding, 0);
  fees.materializeFeeReminders("2026-12-20");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM fee_events WHERE receiptId=? AND kind='overdue'",
      )
      .get(row.id).n,
    0,
  );
  assert.ok(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM access_audit WHERE action LIKE 'fee.%'",
      )
      .get().n > 5,
  );
  let calls = 0;
  await processFeeNotifications(async () => {
    calls++;
  });
  assert.equal(calls, 0, "Email desactivado por defecto");
});
test("cuotas: protege historial y valida la configuración general", async () => {
  for (const route of [
    `/properties/fee-property-1`,
    `/owners/${o1}`,
    `/communities/${c1}`,
  ])
    assert.equal((await admin(route, "DELETE")).status, 409);
  assert.equal(
    (
      await admin(`/fees/communities/${c1}/plans`, "POST", {
        ...plan,
        effectiveFrom: "2026-12-01",
      })
    ).status,
    409,
  );
  for (const setting of [
    { feeBeforeDays: -1 },
    { feeAfterDays: 1.5 },
    { feeEmail: "yes" },
    { feeEmailBody: "" },
  ])
    assert.equal((await admin("/admin/settings", "PUT", setting)).status, 400);
  await ok(admin, "/admin/settings", "PUT", {
    feeBeforeDays: 5,
    feeEmail: false,
    assessmentBeforeDays: 6,
    assessmentEmail: true,
    serviceBeforeDays: 4,
    serviceEmail: true,
  });
  assert.equal(
    (await ok(staff, `/fees/communities/${c1}`)).plans[0].reminders.beforeDays,
    3,
    "Los acuerdos existentes no cambian",
  );
  assert.equal(fees.noticeDefaults("fee").beforeDays, 5);
  assert.equal(fees.noticeDefaults("assessment").beforeDays, 6);
  assert.equal(fees.noticeDefaults("assessment").email, true);
  assert.equal(fees.noticeDefaults("service").beforeDays, 4);
  assert.equal(fees.noticeDefaults("service").email, true);
  assert.equal(fees.reminderSettings({ reminders: {} }, "service").beforeDays, 4);
  assert.equal(
    fees.reminderSettings(
      { reminders: { beforeDays: 2, email: false } },
      "assessment",
    ).beforeDays,
    2,
  );
  await ok(admin, "/admin/settings", "PUT", {
    feeBeforeDays: 3,
    assessmentBeforeDays: 3,
    assessmentEmail: false,
    serviceBeforeDays: 3,
    serviceEmail: false,
  });
});
test("cuotas: una comunidad que no usa euros no puede configurar, previsualizar ni emitir", async () => {
  const id = "fee-community-non-eur";
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,?)",
  ).run(id, "Comunidad en dólares", "H-FEE-USD", "USD");
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run("fee-property-usd", id, "Unidad USD", JSON.stringify([o1]), "100");
  const rejected = await admin(`/fees/communities/${id}/plans`, "POST", plan);
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /euros/);
  // Aunque exista una configuración histórica, tampoco se puede emitir.
  const actor = db
    .prepare("SELECT * FROM users WHERE usuario='super_admin'")
    .get();
  db.prepare(
    "INSERT INTO fee_plans(id,communityId,effectiveFrom,data,createdAt,actorId) VALUES(?,?,?,?,?,?)",
  ).run(
    "fee-plan-usd",
    id,
    "2026-01-01",
    JSON.stringify(plan),
    new Date().toISOString(),
    actor.id,
  );
  const preview = await admin(`/fees/communities/${id}/preview`, "POST", {
    period: "2026-11",
  });
  assert.equal(preview.status, 400);
  assert.match(preview.data.error, /euros/);
  const issued = await admin(`/fees/communities/${id}/issue`, "POST", {
    period: "2026-11",
    token: "unused",
  });
  assert.equal(issued.status, 400);
  assert.match(issued.data.error, /euros/);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM fee_receipts WHERE communityId=?")
      .get(id).n,
    0,
  );
});
test("cuotas: los planes anteriores sin recordatorios usan los valores por defecto", () => {
  const id = "fee-legacy-plan",
    actor = db.prepare("SELECT * FROM users WHERE usuario='super_admin'").get();
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,'EUR')",
  ).run(id, "Comunidad con plan antiguo", "H-FEE-LEGACY");
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run("fee-legacy-property", id, "Unidad antigua", JSON.stringify([o1]), "100");
  const legacy = { ...plan };
  delete legacy.reminders;
  db.prepare(
    "INSERT INTO fee_plans(id,communityId,effectiveFrom,data,createdAt,actorId) VALUES(?,?,?,?,?,?)",
  ).run(
    "fee-legacy-config",
    id,
    "2026-01-01",
    JSON.stringify(legacy),
    new Date().toISOString(),
    actor.id,
  );
  const batch = fees.preview(id, "2026-11");
  const issued = fees.issue(
    id,
    { period: batch.period, token: batch.token },
    actor,
  );
  assert.equal(issued.ids.length, 1);
  assert.doesNotThrow(() => fees.materializeFeeReminders("2026-11-05"));
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM fee_events WHERE receiptId=? AND kind='due'",
      )
      .get(issued.ids[0]).n,
    1,
  );
});
test("cuotas: los redondeos suman el presupuesto anual y no duplican copropietarios", () => {
  const id = "fee-rounding";
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,'EUR')",
  ).run(id, "Redondeos", "H-FEE-3");
  for (let i = 0; i < 3; i++)
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
    ).run(
      `round-${i}`,
      id,
      `Unidad ${i}`,
      JSON.stringify([o1, o2]),
      ["33.3333", "33.3333", "33.3334"][i],
    );
  const actor = db
    .prepare("SELECT * FROM users WHERE usuario='super_admin'")
    .get();
  fees.savePlan(id, { ...plan, annualAmount: "100.01" }, actor);
  let total = 0;
  for (let month = 1; month <= 12; month++) {
    const batch = fees.preview(id, `2026-${String(month).padStart(2, "0")}`);
    assert.equal(batch.rows.length, 3);
    assert.equal(
      batch.rows.reduce((s, r) => s + r.amount, 0),
      batch.total,
    );
    total += batch.total;
  }
  assert.equal(total, 10001);
  fees.savePlan(
    id,
    {
      ...plan,
      annualAmount: "100.01",
      mode: "manual",
      effectiveFrom: "2027-01-01",
      manual: { "round-0": "10.01", "round-1": "20", "round-2": "70" },
    },
    actor,
  );
  const totals = [0, 0, 0];
  for (let month = 1; month <= 12; month++)
    fees
      .preview(id, `2027-${String(month).padStart(2, "0")}`)
      .rows.forEach((r, i) => (totals[i] += r.amount));
  assert.deepEqual(totals, [1001, 2000, 7000]);
});
test("cuotas: el correo respeta consentimiento, cancela recordatorios pagados y no reenvía fallos inciertos", async () => {
  const id = "fee-mail-test",
    actor = db.prepare("SELECT * FROM users WHERE usuario='super_admin'").get();
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,'EUR')",
  ).run(id, "Correo de cuotas", "H-FEE-4");
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run("fee-mail-property", id, "Unidad correo", JSON.stringify([o1]), "100");
  fees.savePlan(
    id,
    { ...plan, reminders: { ...plan.reminders, email: true } },
    actor,
  );
  const batch = fees.preview(id, "2026-11");
  const result = fees.issue(
    id,
    { period: batch.period, token: batch.token },
    actor,
  );
  const receiptId = result.ids[0],
    userId = db.prepare("SELECT userId FROM owners WHERE id=?").get(o1).userId;
  db.prepare(
    "INSERT INTO communication_preferences(userId,data) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data",
  ).run(
    userId,
    JSON.stringify({ emailEnabled: false, email: "owner@example.test" }),
  );
  let sent = 0;
  await processFeeNotifications(async () => {
    sent++;
  });
  assert.equal(sent, 0);
  db.prepare("UPDATE communication_preferences SET data=? WHERE userId=?").run(
    JSON.stringify({ emailEnabled: true, email: "owner@example.test" }),
    userId,
  );
  fees.notify(
    fees.receiptById(receiptId),
    "due",
    "paid-before-send",
    "Vence cuota",
    "Pendiente",
  );
  fees.recordPayment(
    id,
    {
      ownerId: o1,
      amount: "100",
      paidOn: "2026-01-02",
      method: "transfer",
      reference: "correo",
      requestId: crypto.randomUUID(),
      receiptIds: [receiptId],
    },
    actor,
  );
  await processFeeNotifications(async () => {
    sent++;
  });
  assert.equal(
    sent,
    1,
    "Se envía la confirmación del cobro, no el recordatorio ya pagado",
  );
  fees.notify(
    fees.receiptById(receiptId),
    "proof",
    "network-failure",
    "Justificante",
    "Revisión",
  );
  await processFeeNotifications(async () => {
    sent++;
    throw new Error("network interrupted");
  });
  const before = sent;
  await processFeeNotifications(async () => {
    sent++;
  });
  assert.equal(sent, before);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM fee_mail WHERE state='uncertain'")
      .get().n,
    1,
  );
});
test("Mis cuotas: consolida perfiles, deduplica copropiedad y revoca perfiles desvinculados", async () => {
  const actor = db
    .prepare("SELECT * FROM users WHERE usuario='super_admin'")
    .get();
  const userId = db
    .prepare("SELECT userId FROM owners WHERE id=?")
    .get(o1).userId;
  const ownCommunity = "fee-personal-all",
    extraOwner = "fee-personal-extra";
  db.prepare(
    "INSERT INTO owners(id,name,surname,dni,userId) VALUES(?,?,?,?,?)",
  ).run(extraOwner, "Perfil", "Adicional", "FEE-EXTRA", userId);
  db.prepare(
    "INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,'EUR')",
  ).run(ownCommunity, "Comunidad personal", "H-FEE-5");
  for (const [id, ids] of [
    ["personal-a", [o1, extraOwner]],
    ["personal-b", [extraOwner]],
  ])
    db.prepare(
      "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
    ).run(id, ownCommunity, id, JSON.stringify(ids), "50");
  fees.savePlan(ownCommunity, plan, actor);
  const batch = fees.preview(ownCommunity, "2026-11");
  fees.issue(ownCommunity, { period: batch.period, token: batch.token }, actor);
  const advance = fees.recordPayment(
    ownCommunity,
    {
      ownerId: extraOwner,
      amount: "5",
      paidOn: "2026-01-02",
      method: "transfer",
      reference: "anticipo",
      requestId: crypto.randomUUID(),
      receiptIds: [],
    },
    actor,
  );
  const mine = await ok(owner, "/fees/mine");
  const owned = mine.receipts.filter((r) => r.communityId === ownCommunity);
  assert.equal(owned.length, 2);
  assert.equal(new Set(owned.map((r) => r.id)).size, 2);
  assert.equal(
    mine.receipts.some((r) => r.id === receipt2),
    false,
  );
  assert.ok(mine.payments.some((p) => p.id === advance.id));
  assert.equal((await tenant("/fees/mine")).status, 403);
  db.prepare("UPDATE owners SET userId='' WHERE id=?").run(extraOwner);
  const revoked = await ok(owner, "/fees/mine");
  assert.equal(
    revoked.receipts.filter((r) => r.communityId === ownCommunity).length,
    1,
  );
  assert.equal(
    revoked.payments.some((p) => p.id === advance.id),
    false,
  );
});
