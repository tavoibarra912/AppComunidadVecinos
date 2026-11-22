import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import express from "express";
import PDFDocument from "pdfkit";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "main-business-audit-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { rebuildOwnersPropertyIds } = await import("../../src/domain.js");
const { allowed } = await import("../../src/security.js");
const fees = await import("../../src/fees.js");
const insert = (table, row) =>
  db
    .prepare(
      `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
        .map(() => "?")
        .join(",")})`,
    )
    .run(...Object.values(row));
const get = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
let serial = 0;
const dni = (n) => `${n}${"TRWAGMYFPDXBNJZSQVHLCKE"[n % 23]}`;
function actor(role, permissions = []) {
  const existing = db.prepare("SELECT id FROM roles WHERE nombre=? OR id=?").get(role, role);
  if (existing)
    db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
      JSON.stringify(permissions),
      existing.id,
    );
  else insert("roles", { id: role, nombre: role, permisos: JSON.stringify(permissions) });
  const id = crypto.randomUUID(),
    token = crypto.randomBytes(32).toString("hex");
  insert("users", { id, usuario: id, rol: role, activo: 1, nombre: "Test" });
  insert("sessions", {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: id,
    expiresAt: Date.now() + 3600000,
  });
  return { ...get("users", id), token };
}
const admin = actor("super_admin");
function fixture() {
  const prefix = `audit-${++serial}-`,
    f = Object.fromEntries(["c", "o", "o2", "p", "p2"].map((k) => [k, prefix + k]));
  insert("communities", {
    id: f.c,
    name: prefix + "Comunidad",
    nif: dni(70000000 + serial),
    currency: "EUR",
    address: "Calle Prueba",
    city: "Madrid",
  });
  for (const [index, id] of [f.o, f.o2].entries())
    insert("owners", {
      id,
      name: index ? "Beatriz" : "Ana",
      surname: "Prueba",
      dni: dni(10000000 + serial * 2 + index),
      communityId: f.c,
      email: `${id}@example.test`,
      phone: "612345678",
      address: "Calle Prueba",
      city: "Madrid",
    });
  for (const id of [f.p, f.p2])
    insert("properties", {
      id,
      communityId: f.c,
      communityName: prefix + "Comunidad",
      plot: id,
      propertyType: "vivienda",
      address: "Calle Prueba",
      city: "Madrid",
      participationCoef: "50",
      ownerIds: JSON.stringify([f.o]),
      ownerPercentages: JSON.stringify({ [f.o]: 100 }),
    });
  rebuildOwnersPropertyIds();
  return f;
}
const app = express();
app.use(express.json());
app.use("/api", router);
app.use((e, _q, r, _n) => r.status(e.status || 500).json({ error: e.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
async function request(who, route, method = "GET", body) {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `penarrubia_session=${who.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
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
    amount: 10000,
    snapshot: JSON.stringify({ community: "Comunidad", property: f.p, owners }),
    createdAt: "2026-01-01",
    actorId: admin.id,
    ...extra,
  });
}
async function certificate(input) {
  const texts = [],
    original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function (text, ...args) {
    texts.push(String(text));
    return original.call(this, text, ...args);
  };
  try {
    const pdf = await fees.generateDebtCertificate({ ...input, actor: admin });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    return texts.join("\n").replaceAll("\u00a0", " ");
  } finally {
    PDFDocument.prototype.text = original;
  }
}

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("main-business-audit-"));
  fs.rmSync(directory, { recursive: true, force: true });
});
const cleanup = await import("../../src/fee-proof-cleanup.js");
const assessmentInput = (f) => ({
  name: "Derrama aprobada",
  agreement: "Acuerdo de prueba",
  purpose: "",
  totalAmount: "100.00",
  mode: "coefficient",
  propertyIds: [f.p, f.p2],
  installments: [{ amount: "100.00", dueDate: "2099-01-10" }],
});
async function cancelPurge(ids) {
  for (const id of ids) {
    assert.equal(
      (
        await request(admin, "/fees/receipts/" + id + "/cancel", "POST", {
          reason: "Corrección individual",
        })
      ).status,
      200,
    );
    assert.equal((await request(admin, "/fees/receipts/" + id + "/purge", "POST")).status, 200);
  }
}
function share(f, owners, percentages) {
  db.prepare("UPDATE properties SET ownerIds=?,ownerPercentages=? WHERE id=?").run(
    JSON.stringify(owners),
    JSON.stringify(percentages),
    f.p,
  );
  rebuildOwnersPropertyIds();
}
function localActor(f, permissions) {
  const staff = actor("community_admin", permissions);
  db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(staff.id, f.c);
  return staff;
}
async function cascade(entity, id, overrides = {}) {
  const first = await request(admin, "/" + entity + "/" + id + "/cascade-preview");
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const g = first.data;
  const p = {
    previewToken: g.previewToken,
    confirmDelete: true,
    confirmGlobalDelete: true,
    confirmSharedFinancial: true,
    confirmDeleteFinancial: true,
    actions: {
      properties: Object.fromEntries(
        g.properties.map((row) => [
          row.id,
          { action: entity === "properties" && row.id === id ? "delete_property" : "keep" },
        ]),
      ),
      owners: Object.fromEntries(
        g.owners.map((row) => [
          row.id,
          { action: entity === "owners" && row.id === id ? "delete_owner" : "keep" },
        ]),
      ),
      tenants: Object.fromEntries(g.tenants.map((row) => [row.id, { action: "keep" }])),
      finance: "delete",
      documents: "keep",
      notifications: "keep",
      posts: "keep_historical",
      user: "unlink",
      ...overrides,
    },
  };
  const reviewed = await request(admin, "/" + entity + "/" + id + "/cascade-preview", "POST", p);
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
  return request(admin, "/" + entity + "/" + id + "?cascade=true", "DELETE", {
    ...p,
    executionToken: reviewed.data.executionToken,
  });
}
test("Owner deletion: shared owner cannot mutate a foreign community and rolls back all links", async () => {
  const a = fixture(),
    b = fixture();
  share(b, [a.o], { [a.o]: 100 });
  const staff = localActor(a, ["owner:delete", "owner:read", "property:read", "property:manage"]);
  assert.equal(allowed(staff, "owner:delete", a.o), true);
  assert.equal(allowed(staff, "property:manage", b.p), false);
  const before = [get("properties", a.p), get("properties", b.p), get("owners", a.o)];
  const result = await request(staff, "/owners/" + a.o, "DELETE");
  assert.equal(result.status, 403, JSON.stringify(result));
  assert.deepEqual([get("properties", a.p), get("properties", b.p), get("owners", a.o)], before);
  assert.equal(db.isTransaction, false);
});
test("Owner deletion: requires property management even with owner delete", async () => {
  const f = fixture(),
    staff = actor("owner-delete-only", ["owner:delete", "owner:read"]);
  assert.equal((await request(staff, "/owners/" + f.o, "DELETE")).status, 403);
  assert.ok(get("owners", f.o));
});
test("Owner deletion: authorized local deletion preserves other ownership percentages", async () => {
  const f = fixture();
  share(f, [f.o, f.o2], { [f.o]: 70, [f.o2]: 30 });
  const staff = localActor(f, ["owner:delete", "owner:read", "property:manage", "property:read"]);
  const result = await request(staff, "/owners/" + f.o, "DELETE");
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(get("owners", f.o), undefined);
  assert.deepEqual(JSON.parse(get("properties", f.p).ownerPercentages), { [f.o2]: 30 });
});
test("Owner deletion: stale tenant owner reference also requires tenant management", async () => {
  const a = fixture(),
    b = fixture();
  insert("tenants", {
    id: a.p + "-tenant",
    propertyId: b.p,
    ownerId: a.o,
    name: "Contrato",
    surname: "Prueba",
  });
  const staff = localActor(a, [
    "owner:delete",
    "owner:read",
    "property:manage",
    "property:read",
    "tenant:read",
    "tenant:manage",
  ]);
  assert.equal((await request(staff, "/owners/" + a.o, "DELETE")).status, 403);
  assert.equal(get("tenants", a.p + "-tenant").ownerId, a.o);
  assert.equal((await request(admin, "/owners/" + a.o, "DELETE")).status, 200);
  assert.equal(get("tenants", a.p + "-tenant").ownerId, b.o);
});
test("Association census: owning property in another association does not grant membership or voting rights", async () => {
  const a = fixture(),
    b = fixture(),
    member = actor("user", ["community:read", "comm:participacion", "property:read", "owner:read"]);
  for (const f of [a, b])
    db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
      '{"regimen":"asociacion"}',
      f.c,
    );
  db.prepare("UPDATE owners SET isMember=1,communityId=?,userId=? WHERE id=?").run(
    a.c,
    member.id,
    a.o,
  );
  share(b, [a.o], { [a.o]: 100 });
  const create = (communityId) =>
    request(admin, "/communications/posts", "POST", {
      communityId,
      type: "notice",
      title: "Consulta de socios",
      body: "Solo socios de esta asociación",
      status: "published",
      priority: "normal",
      publishAt: new Date().toISOString(),
      audience: { mode: "owners", ownerIds: [], tenantIds: [], propertyIds: [] },
      channels: [],
      poll: {
        type: "vote",
        electorate: "owners",
        question: "¿Se aprueba?",
        options: ["Sí", "No"],
        resultsLive: true,
        closesAt: "2099-01-01T00:00:00.000Z",
      },
    });
  const foreign = await create(b.c);
  assert.equal(foreign.status, 201, JSON.stringify(foreign));
  assert.equal(
    foreign.data.recipients.some((r) => r.userId === member.id),
    false,
  );
  const vote = await request(
    member,
    "/communications/posts/" + foreign.data.id + "/ballot",
    "POST",
    { choices: [0] },
  );
  assert.ok([403, 404].includes(vote.status), JSON.stringify(vote));
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM communication_ballots WHERE postId=?").get(foreign.data.id)
      .n,
    0,
  );
  const own = await create(a.c);
  assert.equal(own.status, 201, JSON.stringify(own));
  assert.equal(
    (
      await request(member, "/communications/posts/" + own.data.id + "/ballot", "POST", {
        choices: [0],
      })
    ).status,
    201,
  );
});
test("N:M ownership: property endpoint can add a first owner link from another community", async () => {
  const a = fixture(),
    b = fixture(),
    current = (await request(admin, "/properties/" + b.p)).data;
  const result = await request(admin, "/properties/" + b.p, "PUT", {
    ...current,
    ownerIds: [b.o, a.o],
    ownerPercentages: { [b.o]: 50, [a.o]: 50 },
  });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.ok(JSON.parse(get("owners", a.o).propertyIds).includes(b.p));
  assert.ok(JSON.parse(get("owners", a.o).propertyIds).includes(a.p));
});
test("N:M ownership: foreign owner read permissions still apply", async () => {
  const a = fixture(),
    b = fixture(),
    current = (await request(admin, "/properties/" + a.p)).data;
  const staff = localActor(a, ["property:read", "property:manage", "community:read", "owner:read"]);
  assert.equal(allowed(staff, "owner:read", b.o), false);
  assert.equal(
    (
      await request(staff, "/properties/" + a.p, "PUT", {
        ...current,
        ownerIds: [a.o, b.o],
        ownerPercentages: { [a.o]: 50, [b.o]: 50 },
      })
    ).status,
    403,
  );
  assert.deepEqual(JSON.parse(get("properties", a.p).ownerIds), [a.o]);
});
function debtPolicy(f, policy = "no_consta") {
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({
      deudaCopropietarios: {
        expresion: "cuota",
        mostrarRepartoInterno: true,
        porcentajesHistoricos: policy,
      },
    }),
    f.c,
  );
}
test("Property certificate: uses each receipt historical share, consistent with owner certificate", async () => {
  const f = fixture();
  debtPolicy(f);
  share(f, [f.o, f.o2], { [f.o]: 30, [f.o2]: 70 });
  receipt(f, f.p + "-r", [
    { id: f.o, name: "Ana Prueba", percentage: 70 },
    { id: f.o2, name: "Beatriz Prueba", percentage: 30 },
  ]);
  const owner = await certificate({ communityId: f.c, ownerId: f.o }),
    property = await certificate({ communityId: f.c, propertyId: f.p });
  assert.match(owner, /Reparto interno del titular: 70 % · 70,00/);
  assert.match(property, /Ana Prueba: 70 % · 70,00/);
  assert.match(property, /Beatriz Prueba: 30 % · 30,00/);
});
test("Property certificate: missing historic shares follow no_consta, ultimo_conocido and omitir", async () => {
  const f = fixture();
  receipt(f, f.p + "-r", [{ id: f.o, name: "Ana Prueba" }]);
  debtPolicy(f);
  assert.match(
    await certificate({ communityId: f.c, propertyId: f.p }),
    /Ana Prueba: porcentaje no consta/,
  );
  debtPolicy(f, "ultimo_conocido");
  const fallback = await certificate({ communityId: f.c, propertyId: f.p });
  assert.match(fallback, /Ana Prueba: 100 % · 100,00/);
  assert.match(fallback, /porcentaje actual, no acreditado/);
  debtPolicy(f, "omitir");
  assert.doesNotMatch(
    await certificate({ communityId: f.c, propertyId: f.p }),
    /Ana Prueba:|Reparto interno de la titularidad/,
  );
});
test("Property certificate: varying historic shares and former owners are calculated receipt by receipt", async () => {
  const f = fixture();
  debtPolicy(f);
  receipt(f, f.p + "-r1", [{ id: f.o, name: "Ana Prueba", percentage: 70 }]);
  receipt(f, f.p + "-r2", [{ id: f.o, name: "Ana Prueba", percentage: 30 }], { period: "2026-02" });
  share(f, [f.o2], { [f.o2]: 100 });
  const pdf = await certificate({ communityId: f.c, propertyId: f.p });
  assert.match(
    pdf,
    /Ana Prueba \(histórico\): porcentajes históricos (70 \/ 30|30 \/ 70) % · 100,00/,
  );
  assert.match(pdf, /Beatriz Prueba: sin recibos pendientes a su nombre/);
});
test("Assessment: purging all issued receipts never reopens draft, editing or original issuance", async () => {
  const f = fixture(),
    input = assessmentInput(f),
    a = fees.saveAssessment(f.c, input, admin),
    batch = fees.previewAssessment(a.id, 1),
    issued = fees.issueAssessment(a.id, { installment: 1, token: batch.token }, admin);
  await cancelPurge(issued.ids);
  const view = fees.assessmentView(get("fee_assessments", a.id));
  assert.equal(view.canEdit, false);
  assert.equal(view.status, "purged");
  assert.ok(view.issuedAt);
  assert.equal(view.installments[0].status, "purged");
  assert.throws(
    () => fees.previewAssessment(a.id, 1),
    (e) => e.status === 409,
  );
  assert.throws(
    () =>
      fees.saveAssessment(
        f.c,
        {
          ...input,
          totalAmount: "200.00",
          installments: [{ amount: "200.00", dueDate: "2099-01-10" }],
        },
        admin,
        a.id,
      ),
    (e) => e.status === 409,
  );
  assert.equal(get("fee_assessments", a.id).totalAmount, 10000);
});
test("Assessment: purging a previous installment leaves later unissued installments issuable", async () => {
  const f = fixture(),
    input = {
      ...assessmentInput(f),
      installments: [
        { amount: "50.00", dueDate: "2099-01-10" },
        { amount: "50.00", dueDate: "2099-02-10" },
      ],
    },
    a = fees.saveAssessment(f.c, input, admin),
    batch = fees.previewAssessment(a.id, 1);
  await cancelPurge(fees.issueAssessment(a.id, { installment: 1, token: batch.token }, admin).ids);
  assert.equal(fees.assessmentView(get("fee_assessments", a.id)).totals.unissued, 5000);
  const second = fees.previewAssessment(a.id, 2);
  assert.equal(second.total, 5000);
  assert.equal(
    fees.issueAssessment(a.id, { installment: 2, token: second.token }, admin).ids.length,
    2,
  );
  assert.throws(
    () => fees.previewAssessment(a.id, 1),
    (e) => e.status === 409,
  );
});
test("Assessment migration: recovers immutable issuance from audit after all receipts were already purged", async () => {
  const f = fixture(),
    a = fees.saveAssessment(f.c, assessmentInput(f), admin);
  insert("access_audit", {
    createdAt: "2025-01-01",
    actorId: admin.id,
    actorName: "Test",
    action: "fee.assessment.issue",
    resourceType: "fee",
    resourceId: a.id,
    outcome: "success",
    method: "POST",
    route: "",
    ip: "",
    details: '{"installment":1}',
  });
  db.prepare("DELETE FROM schema_migrations WHERE id='assessment-issuance-history-v1'").run();
  db.exec("ALTER TABLE fee_assessments DROP COLUMN issuedAt");
  await import("../../src/fees.js?test-issuance-migration");
  assert.equal(get("fee_assessments", a.id).issuedAt, "2025-01-01");
  assert.equal(fees.assessmentView(get("fee_assessments", a.id)).canEdit, false);
  assert.throws(
    () => fees.previewAssessment(a.id, 1),
    (e) => e.status === 409,
  );
});
test("Cascade credit validation: cents are shown as euros without changing the balance", async () => {
  const f = fixture();
  fees.recordPayment(
    f.c,
    {
      ownerId: f.o,
      amount: "40.00",
      paidOn: "2026-01-10",
      method: "transfer",
      reference: "Crédito",
      requestId: crypto.randomUUID(),
      receiptIds: [],
    },
    admin,
  );
  const result = await cascade("owners", f.o, { finance: "keep_historical" });
  assert.equal(result.status, 409, JSON.stringify(result));
  assert.match(result.data.error, /40,00/);
  assert.doesNotMatch(result.data.error, /4000|4.000/);
  assert.ok(get("owners", f.o));
});
test("Cascade: disk failures retain a durable retry task after commit and delete on retry", async () => {
  const f = fixture(),
    r = f.p + "-r",
    diskName = crypto.randomUUID(),
    proofId = r + "-proof";
  receipt(f, r, [{ id: f.o, name: "Ana Prueba" }]);
  const dir = path.join(directory, "uploads", "fee-proofs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, diskName);
  fs.writeFileSync(file, "%PDF-synthetic");
  insert("fee_proofs", {
    id: proofId,
    receiptId: r,
    ownerId: f.o,
    fileName: "proof.pdf",
    diskName,
    mime: "application/pdf",
    createdAt: "2026-01-01",
    actorId: admin.id,
  });
  const original = fs.unlinkSync;
  fs.unlinkSync = function (target, ...args) {
    assert.equal(db.isTransaction, false);
    if (path.resolve(target) === path.resolve(file))
      throw Object.assign(new Error("Synthetic failure"), { code: "EACCES" });
    return original.call(this, target, ...args);
  };
  let result;
  try {
    result = await cascade("properties", f.p);
  } finally {
    fs.unlinkSync = original;
  }
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(get("fee_proofs", proofId), undefined);
  assert.equal(get("fee_receipts", r), undefined);
  assert.equal(fs.existsSync(file), true);
  const queued = db.prepare("SELECT * FROM fee_proof_cleanup WHERE diskName=?").get(diskName);
  assert.equal(queued.lastError, "EACCES");
  assert.equal(queued.attempts, 1);
  cleanup.processFeeProofCleanup({ now: queued.nextAttemptAt });
  assert.equal(fs.existsSync(file), false);
  assert.equal(
    db.prepare("SELECT * FROM fee_proof_cleanup WHERE diskName=?").get(diskName),
    undefined,
  );
});
test("Upload cleanup: document and service files are queued transactionally, survive rollback and retry safely", () => {
  // Simula la tabla de producción anterior a la cola de adjuntos de cascada.
  db.exec("ALTER TABLE fee_proof_cleanup DROP COLUMN relativePath");
  const dbModule = new URL("../../src/db.js", import.meta.url).href;
  const upgrade = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const {db}=await import(${JSON.stringify(dbModule)});db.close();`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(upgrade.status, 0, upgrade.stderr);
  const names = [
    "document-" + crypto.randomUUID() + ".pdf",
    "service-bills/" + crypto.randomUUID() + ".pdf",
  ];
  for (const name of names) {
    const file = path.join(directory, "uploads", name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "synthetic");
  }
  db.exec("BEGIN IMMEDIATE");
  for (const name of names) cleanup.queueUploadCleanup(name);
  db.exec("ROLLBACK");
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM fee_proof_cleanup WHERE relativePath<>''").get().n,
    0,
  );
  for (const name of names)
    assert.equal(fs.existsSync(path.join(directory, "uploads", name)), true);
  db.exec("BEGIN IMMEDIATE");
  for (const name of names) cleanup.queueUploadCleanup(name);
  db.exec("COMMIT");
  const failed = cleanup.processFeeProofCleanup({
    unlink() {
      throw Object.assign(new Error("disk"), { code: "EACCES" });
    },
  });
  assert.equal(failed.failed, 2);
  const cleanupModule = new URL("../../src/fee-proof-cleanup.js", import.meta.url).href;
  const resumed = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const {processFeeProofCleanup}=await import(${JSON.stringify(cleanupModule)});const result=processFeeProofCleanup({now:Date.now()+60000});if(result.deleted!==2)throw new Error(JSON.stringify(result));const {db}=await import(${JSON.stringify(dbModule)});db.close();`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(resumed.status, 0, resumed.stderr);
  for (const name of names)
    assert.equal(fs.existsSync(path.join(directory, "uploads", name)), false);
});

test("Acuerdos: omitir avisos conserva la configuración y enviarlos permite cambiarla", () => {
  const f = fixture(),
    input = {
      annualAmount: "120.00",
      months: 1,
      effectiveFrom: "2090-01-01",
      dueDay: 10,
      agreement: "Junta",
      mode: "coefficient",
    };
  const custom = { beforeDays: 19, afterDays: 31, repeatDays: 14, internal: false, email: true };
  const plan = fees.savePlan(f.c, { ...input, reminders: custom }, admin);
  const edited = fees.savePlan(f.c, { ...input, agreement: "Junta corregida" }, admin, plan.id);
  assert.deepEqual(edited.reminders, custom);
  assert.deepEqual(
    fees.savePlan(f.c, { ...input, reminders: { ...custom, beforeDays: 0 } }, admin, plan.id)
      .reminders,
    { ...custom, beforeDays: 0 },
  );
  assert.throws(
    () => fees.savePlan(f.c, { ...input, reminders: { email: "sí" } }, admin, plan.id),
    (e) => e.status === 400,
  );
  assert.equal(JSON.parse(get("fee_plans", plan.id).data).reminders.beforeDays, 0);
  const fresh = fees.savePlan(f.c, { ...input, effectiveFrom: "2091-01-01" }, admin);
  assert.equal(typeof fresh.reminders.internal, "boolean");
});

test("Derramas mixtas: conserva los importes fijos al editar y reparte el resto por coeficiente", () => {
  const f = fixture(),
    input = { ...assessmentInput(f), mode: "mixed", manual: { [f.p]: "20.00" } };
  const a = fees.saveAssessment(f.c, input, admin);
  assert.deepEqual(a.fixedAmounts, { [f.p]: 2000 });
  assert.deepEqual(a.allocations, { [f.p]: 2000, [f.p2]: 8000 });
  const { manual, ...withoutManual } = input;
  const edit = fees.saveAssessment(
    f.c,
    {
      ...withoutManual,
      totalAmount: "200.00",
      installments: [{ amount: "200.00", dueDate: "2099-01-10" }],
    },
    admin,
    a.id,
  );
  assert.deepEqual(edit.fixedAmounts, { [f.p]: 2000 });
  assert.deepEqual(edit.allocations, { [f.p]: 2000, [f.p2]: 18000 });
  assert.throws(
    () => fees.saveAssessment(f.c, { ...input, manual: { [f.p]: "101.00" } }, admin, a.id),
    (e) => e.status === 400,
  );
  assert.equal(get("fee_assessments", a.id).totalAmount, 20000);
});

test("Derramas mixtas heredadas: edita textos y plazos sin inferir ni recalcular el reparto", () => {
  const f = fixture(),
    input = { ...assessmentInput(f), mode: "mixed", manual: { [f.p]: "20.00" } },
    a = fees.saveAssessment(f.c, input, admin);
  const payload = JSON.parse(get("fee_assessments", a.id).data);
  delete payload.fixedAmounts;
  db.prepare("UPDATE fee_assessments SET data=? WHERE id=?").run(JSON.stringify(payload), a.id);
  db.prepare("UPDATE properties SET participationCoef='99' WHERE id=?").run(f.p2);
  const { manual, ...withoutManual } = input;
  const edited = fees.saveAssessment(
    f.c,
    { ...withoutManual, name: "Nombre corregido" },
    admin,
    a.id,
  );
  assert.deepEqual(edited.allocations, a.allocations);
  assert.equal(edited.fixedAmounts, undefined);
  assert.throws(
    () =>
      fees.saveAssessment(
        f.c,
        {
          ...withoutManual,
          totalAmount: "200.00",
          installments: [{ amount: "200.00", dueDate: "2099-01-10" }],
        },
        admin,
        a.id,
      ),
    (e) => e.status === 409,
  );
  const explicit = fees.saveAssessment(f.c, { ...input, manual: { [f.p]: "30.00" } }, admin, a.id);
  assert.deepEqual(explicit.fixedAmounts, { [f.p]: 3000 });
  assert.equal(explicit.allocations[f.p2], 7000);
});

function rectify(id) {
  const input = { reason: "Corrección de prueba" },
    preview = fees.previewReceiptRectification(id, input, admin);
  return fees.rectifyReceipt(id, { ...input, token: preview.token }, admin);
}
test("Purga individual: bloquea sucesores conservados y permite retirar la cadena desde sus hojas", async () => {
  const f = fixture(),
    id = f.p + "-chain";
  receipt(f, id, [{ id: f.o, name: "Ana" }]);
  fees.cancelReceipt(id, { reason: "Corrección" }, admin);
  const second = rectify(id);
  fees.cancelReceipt(second.id, { reason: "Otra corrección" }, admin);
  const third = rectify(second.id);
  const before = db.prepare("SELECT * FROM fee_receipts WHERE communityId=? ORDER BY id").all(f.c);
  assert.equal((await request(admin, "/fees/receipts/" + id + "/purge", "POST")).status, 409);
  assert.equal(
    (await request(admin, "/fees/receipts/" + second.id + "/purge", "POST")).status,
    409,
  );
  assert.deepEqual(
    db.prepare("SELECT * FROM fee_receipts WHERE communityId=? ORDER BY id").all(f.c),
    before,
  );
  assert.equal((await request(admin, "/fees/receipts/" + third.id + "/purge", "POST")).status, 409);
  fees.cancelReceipt(third.id, { reason: "Retirada" }, admin);
  for (const r of [third.id, second.id, id])
    assert.equal((await request(admin, "/fees/receipts/" + r + "/purge", "POST")).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM fee_receipts WHERE communityId=?").get(f.c).n, 0);
});
test("Purga de derrama: permite borrar una cadena completa anulada sin referencias colgantes", () => {
  const f = fixture(),
    a = fees.saveAssessment(f.c, assessmentInput(f), admin),
    batch = fees.previewAssessment(a.id, 1),
    issued = fees.issueAssessment(a.id, { installment: 1, token: batch.token }, admin);
  fees.cancelReceipt(issued.ids[0], { reason: "Corrección" }, admin);
  const successor = rectify(issued.ids[0]);
  assert.equal(get("fee_receipts", successor.id).assessmentId, a.id);
  fees.cancelAssessment(a.id, { reason: "Retirada completa" }, admin);
  fees.purgeAssessment(a.id, admin);
  assert.equal(get("fee_assessments", a.id), undefined);
  assert.equal(get("fee_receipts", successor.id), undefined);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM fee_receipts WHERE rectifiesReceiptId=?").get(issued.ids[0])
      .n,
    0,
  );
});
test("Purga de derrama: rechaza hijos activos o sucesores externos y revierte toda la operación", () => {
  const f = fixture(),
    a = fees.saveAssessment(f.c, assessmentInput(f), admin),
    batch = fees.previewAssessment(a.id, 1),
    issued = fees.issueAssessment(a.id, { installment: 1, token: batch.token }, admin);
  db.prepare("UPDATE fee_assessments SET cancelledAt='2026-01-01' WHERE id=?").run(a.id);
  assert.throws(
    () => fees.purgeAssessment(a.id, admin),
    (e) => e.status === 409,
  );
  assert.ok(get("fee_receipts", issued.ids[0]));
  db.prepare("UPDATE fee_receipts SET cancelledAt='2026-01-01' WHERE assessmentId=?").run(a.id);
  receipt(f, f.p + "-external", [{ id: f.o, name: "Ana" }], { rectifiesReceiptId: issued.ids[0] });
  assert.throws(
    () => fees.purgeAssessment(a.id, admin),
    (e) => e.status === 409,
  );
  assert.ok(get("fee_assessments", a.id));
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM fee_receipts WHERE assessmentId=?").get(a.id).n,
    2,
  );
  assert.equal(db.isTransaction, false);
});
test("Cascada: también rechaza una referencia de rectificación que sobreviviría al borrado", async () => {
  const f = fixture(),
    other = fixture(),
    original = f.p + "-original";
  receipt(f, original, [{ id: f.o, name: "Ana" }]);
  receipt(other, other.p + "-external", [{ id: other.o, name: "Otra titular" }], {
    rectifiesReceiptId: original,
  });
  const response = await cascade("properties", f.p);
  assert.equal(response.status, 409, JSON.stringify(response));
  assert.ok(get("properties", f.p));
  assert.ok(get("fee_receipts", original));
});
test("Moneda: las emisiones nuevas congelan EUR y las antiguas se leen sin reescribir sus snapshots", async () => {
  const f = fixture(),
    plan = fees.savePlan(
      f.c,
      {
        annualAmount: "120.00",
        months: 1,
        effectiveFrom: "2090-01-01",
        dueDay: 10,
        agreement: "Junta",
        mode: "coefficient",
      },
      admin,
    );
  const batch = fees.preview(f.c, "2090-01");
  const ordinary = fees.issue(f.c, { period: "2090-01", token: batch.token }, admin);
  const a = fees.saveAssessment(f.c, assessmentInput(f), admin),
    ap = fees.previewAssessment(a.id, 1),
    assessment = fees.issueAssessment(a.id, { installment: 1, token: ap.token }, admin);
  const services = await import("../../src/services.js");
  const s = services.saveService(
    f.c,
    {
      service: "agua",
      supplier: "Canal",
      invoiceNumber: "TEST",
      period: "2090-02",
      issueDate: "2090-02-01",
      dueDate: "2090-03-01",
      totalAmount: "100.00",
      billing: "receipts",
      method: "coefficient",
    },
    admin,
  );
  const sp = services.previewService(s.id),
    service = services.issueService(s.id, { token: sp.token }, admin);
  for (const id of [...ordinary.ids, ...assessment.ids, ...service.ids])
    assert.equal(JSON.parse(get("fee_receipts", id).snapshot).currency, "EUR");
  const legacy = f.p + "-legacy";
  receipt(f, legacy, [{ id: f.o, name: "Ana" }]);
  const raw = get("fee_receipts", legacy).snapshot;
  db.prepare("UPDATE communities SET currency='USD' WHERE id=?").run(f.c);
  assert.equal(fees.receiptView(get("fee_receipts", ordinary.ids[0])).currency, "EUR");
  assert.equal(fees.receiptView(get("fee_receipts", legacy)).currency, "USD");
  assert.equal(fees.receiptView(get("fee_receipts", legacy)).currencySource, "community");
  assert.equal(get("fee_receipts", legacy).snapshot, raw);
});

test("Moneda: rectificar un recibo heredado congela la moneda nueva sin modificar el original", () => {
  const f = fixture(),
    id = f.p + "-legacy-rectification";
  receipt(f, id, [{ id: f.o, name: "Ana" }]);
  const snapshot = get("fee_receipts", id).snapshot;
  fees.cancelReceipt(id, { reason: "Corrección" }, admin);
  const replacement = rectify(id);
  assert.equal(replacement.snapshot.currency, "EUR");
  assert.equal(get("fee_receipts", id).snapshot, snapshot);
  const { currency, ...historical } = replacement.snapshot;
  assert.deepEqual(historical, JSON.parse(snapshot));
});

test("Certificados: el gestor financiero recibe opciones mínimas de su comunidad sin depender de leer el censo", async () => {
  const f = fixture(),
    foreign = fixture(),
    staff = localActor(f, ["fee:read", "fee:manage", "community:read"]);
  receipt(f, f.p + "-historical-owner", [{ id: f.o2, name: "Titular anterior" }]);
  assert.equal(allowed(staff, "owner:read", f.o), false);
  assert.equal(allowed(staff, "property:read", f.p), false);
  const result = await request(staff, "/fees/communities/" + f.c);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(
    result.data.certificateTargets.properties.map((p) => p.id).sort(),
    [f.p, f.p2].sort(),
  );
  assert.deepEqual(
    result.data.certificateTargets.owners.map((o) => o.id).sort(),
    [f.o, f.o2].sort(),
  );
  assert.ok(
    result.data.certificateTargets.owners.every(
      (o) => JSON.stringify(Object.keys(o).sort()) === '["id","label"]',
    ),
  );
  assert.equal((await request(staff, "/fees/communities/" + foreign.c)).status, 403);
  const reader = actor("fee-read-only", ["fee:read"]);
  const read = await request(reader, "/fees/communities/" + f.c);
  assert.equal(read.status, 200);
  assert.equal(read.data.certificateTargets, null);
});
