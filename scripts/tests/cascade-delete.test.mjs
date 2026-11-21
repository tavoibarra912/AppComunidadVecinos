import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-cascade-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db, UPLOADS_DIR } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { rebuildOwnersPropertyIds, rebuildPropertyTenantReferences } =
  await import("../../src/domain.js");
let server, base;
const insert = (table, row) =>
  db
    .prepare(
      `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
        .map(() => "?")
        .join(",")})`,
    )
    .run(...Object.values(row));
const get = (table, id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
function account(rol, permisos = []) {
  const uid = crypto.randomUUID(),
    token = crypto.randomBytes(32).toString("hex");
  if (!db.prepare("SELECT id FROM roles WHERE nombre=?").get(rol))
    insert("roles", { id: rol, nombre: rol, permisos: JSON.stringify(permisos) });
  insert("users", { id: uid, usuario: uid, rol, activo: 1 });
  insert("sessions", {
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: uid,
    expiresAt: Date.now() + 3600000,
  });
  return { uid, token };
}
const admin = account("super_admin");
const restricted = account("restricted", [
  "owner:delete",
  "property:delete",
  "tenant:delete",
  "community:delete",
]);
async function request(route, method = "GET", body, actor = admin) {
  const response = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(actor ? { Cookie: `penarrubia_session=${actor.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
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
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-cascade-"));
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const prefix = crypto.randomUUID(),
    f = Object.fromEntries(
      [
        "c1",
        "c2",
        "target",
        "owner",
        "coowner",
        "p1",
        "p2",
        "destination",
        "t1",
        "t2",
        "r1",
        "r2",
        "payment",
        "plan",
        "assessment",
        "service",
        "post",
        "document",
      ].map((k) => [k, `${prefix}-${k}`]),
    );
  for (const id of [f.c1, f.c2, f.target])
    insert("communities", { id, name: id, nif: id, currency: "EUR" });
  for (const id of [f.owner, f.coowner])
    insert("owners", { id, name: id, surname: "Prueba", dni: id });
  for (const [id, communityId, owners] of [
    [f.p1, f.c1, [f.owner, f.coowner]],
    [f.p2, f.c2, [f.owner]],
    [f.destination, f.target, [f.coowner]],
  ])
    insert("properties", {
      id,
      communityId,
      communityName: communityId,
      plot: id,
      ownerIds: JSON.stringify(owners),
      ownerPercentages: JSON.stringify(
        Object.fromEntries(owners.map((id) => [id, 100 / owners.length])),
      ),
    });
  for (const [id, ownerId] of [
    [f.t1, f.owner],
    [f.t2, f.coowner],
  ])
    insert("tenants", {
      id,
      ownerId,
      propertyId: f.p1,
      name: id,
      surname: "Prueba",
      contractStart: "2020-01-01",
    });
  insert("fee_plans", {
    id: f.plan,
    communityId: f.c1,
    effectiveFrom: "2026-01-01",
    data: "{}",
    createdAt: "now",
    actorId: admin.uid,
  });
  for (const [id, communityId, propertyId, owners] of [
    [f.r1, f.c1, f.p1, [f.owner, f.coowner]],
    [f.r2, f.c2, f.p2, [f.owner]],
  ])
    insert("fee_receipts", {
      id,
      communityId,
      propertyId,
      planId: f.plan,
      period: "2026-01-01",
      periodEnd: "2026-01-31",
      dueDate: "2026-01-10",
      amount: 10000,
      snapshot: JSON.stringify({
        owners: owners.map((id) => ({ id, name: id })),
        community: communityId,
        property: propertyId,
      }),
      createdAt: "now",
      actorId: admin.uid,
    });
  insert("fee_payments", {
    id: f.payment,
    communityId: f.c1,
    ownerId: f.owner,
    amount: 4000,
    paidOn: "2026-01-01",
    method: "transfer",
    reference: "",
    requestId: f.payment,
    createdAt: "now",
    actorId: admin.uid,
  });
  insert("fee_allocations", { receiptId: f.r1, paymentId: f.payment, amount: 4000 });
  insert("fee_assessments", {
    id: f.assessment,
    communityId: f.c1,
    name: "Derrama",
    totalAmount: 10000,
    data: JSON.stringify({ propertyIds: [f.p1], allocations: { [f.p1]: 10000 } }),
    createdAt: "now",
    actorId: admin.uid,
  });
  insert("service_bills", {
    id: f.service,
    communityId: f.c1,
    service: "agua",
    period: "2026-01",
    issueDate: "2026-01-01",
    dueDate: "2026-01-10",
    totalAmount: 10000,
    data: JSON.stringify({ propertyIds: [f.p1] }),
    createdAt: "now",
    actorId: admin.uid,
  });
  insert("communication_posts", {
    id: f.post,
    communityId: f.c1,
    data: JSON.stringify({ title: "Publicación", communityId: f.c1 }),
    createdAt: "now",
    updatedAt: "now",
    createdBy: admin.uid,
  });
  insert("communication_comments", {
    id: `${f.post}-comment`,
    postId: f.post,
    userId: admin.uid,
    body: "Hola",
    createdAt: "now",
  });
  insert("communication_outbox", {
    id: `${f.post}-mail`,
    postId: f.post,
    userId: admin.uid,
    channel: "email",
    kind: "created",
    version: 1,
    createdAt: "now",
    updatedAt: "now",
  });
  insert("documents", {
    id: f.document,
    entityType: "property",
    entityId: f.p1,
    fileName: "prueba.txt",
    storedName: f.document,
  });
  writeFileSync(path.join(UPLOADS_DIR, f.document), "contenido");
  rebuildOwnersPropertyIds();
  rebuildPropertyTenantReferences();
  return f;
}
async function plan(collection, id) {
  const response = await request(`/${collection}/${id}/cascade-preview`);
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const p = response.data;
  return {
    previewToken: p.previewToken,
    confirmDelete: true,
    confirmGlobalDelete: true,
    confirmSharedFinancial: true,
    actions: {
      properties: Object.fromEntries(
        p.properties.map((r) => [
          r.id,
          {
            action:
              collection === "properties"
                ? "delete_property"
                : collection === "communities"
                  ? "orphan"
                  : "keep",
          },
        ]),
      ),
      owners: Object.fromEntries(
        p.owners.map((r) => [r.id, { action: collection === "owners" ? "delete_owner" : "keep" }]),
      ),
      tenants: Object.fromEntries(
        p.tenants.map((r) => [
          r.id,
          { action: collection === "tenants" ? "remove_tenant" : "keep" },
        ]),
      ),
      finance: "keep_historical",
      documents: "keep",
      notifications: "keep",
      posts: "keep_historical",
      user: "unlink",
    },
  };
}
const execute = async (collection, id, p, actor) => {
  const review = await request(`/${collection}/${id}/cascade-preview`, "POST", p, actor);
  if (review.status !== 200) return review;
  return request(
    `/${collection}/${id}?cascade=true`,
    "DELETE",
    { ...p, executionToken: review.data.executionToken },
    actor,
  );
};

test("cascada: exige sesión, permiso maestro y permisos del ámbito en preview y DELETE", async () => {
  const f = fixture();
  assert.equal(
    (await request(`/owners/${f.owner}/cascade-preview`, "GET", undefined, null)).status,
    401,
  );
  assert.equal(
    (await request(`/owners/${f.owner}/cascade-preview`, "GET", undefined, restricted)).status,
    403,
  );
  const p = await plan("owners", f.owner);
  assert.equal((await execute("owners", f.owner, p, restricted)).status, 403);
  const scoped = account("community_admin", ["cascade-delete", "community:read", "owner:delete"]);
  db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(scoped.uid, f.c1);
  assert.equal(
    (await request(`/owners/${f.owner}/cascade-preview`, "GET", undefined, scoped)).status,
    403,
  );
  assert.ok(get("owners", f.owner));
  // Un community_admin asignado debe poder revisar una ficha de socio sin
  // inmueble de su propia comunidad aunque no tenga ningún inmueble.
  const member = `${f.owner}-admin-member`;
  insert("owners", {
    id: member,
    name: "Socia",
    surname: "Del censo",
    dni: member,
    isMember: 1,
    communityId: f.c1,
  });
  const reader = account("community_admin", [
    "cascade-delete",
    "community:read",
    "owner:read",
    "owner:delete",
  ]);
  // `account` no reescribe un rol ya creado en esta prueba; se ajusta aquí
  // para comprobar el permiso real de administración de la ficha.
  db.prepare("UPDATE roles SET permisos=? WHERE nombre='community_admin'").run(
    JSON.stringify(["cascade-delete", "community:read", "owner:read", "owner:delete"]),
  );
  db.prepare("UPDATE communities SET adminUserId=? WHERE id=?").run(reader.uid, f.c1);
  assert.equal(
    (await request(`/owners/${member}/cascade-preview`, "GET", undefined, reader)).status,
    200,
  );
});
test("cascada: las cuatro vistas previas evalúan relaciones reales sin columnas inventadas", async () => {
  const f = fixture();
  for (const [type, id] of [
    ["owners", f.owner],
    ["communities", f.c1],
    ["properties", f.p1],
    ["tenants", f.t1],
  ]) {
    const r = await request(`/${type}/${id}/cascade-preview`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.previewToken, /^[a-f0-9]{64}$/);
  }
  const r = await request(`/owners/${f.owner}/cascade-preview`);
  assert.equal(r.data.owners[0].relationships.length, 2);
  assert.equal(r.data.finance.sharedReceipts, 1);
});
test("propietario: borrado global explícito, reasignación y conservación de snapshots y porcentajes", async () => {
  const f = fixture(),
    original = get("fee_receipts", f.r1).snapshot;
  const p = await plan("owners", f.owner);
  p.confirmGlobalDelete = false;
  assert.equal((await execute("owners", f.owner, p)).status, 409);
  assert.ok(get("owners", f.owner));
  p.confirmGlobalDelete = true;
  p.actions.properties[f.p1] = { action: "reassign_owner", newOwnerId: f.coowner };
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("owners", f.owner), undefined);
  assert.deepEqual(JSON.parse(get("properties", f.p1).ownerIds), [f.coowner]);
  assert.equal(JSON.parse(get("properties", f.p1).ownerPercentages)[f.coowner], 100);
  assert.equal(get("tenants", f.t1).ownerId, f.coowner);
  assert.deepEqual(JSON.parse(get("properties", f.p2).ownerIds), []);
  assert.equal(get("fee_receipts", f.r1).snapshot, original);
  assert.ok(get("fee_payments", f.payment));
  assert.ok(
    db
      .prepare("SELECT 1 FROM access_audit WHERE action='owners.cascade-deleted' AND resourceId=?")
      .get(f.owner),
  );
});
test("finanzas: borrar todo requiere casillas y limpia recibos, cobros y aplicaciones compartidas", async () => {
  const f = fixture(),
    p = await plan("owners", f.owner);
  p.actions.finance = "delete";
  assert.equal((await execute("owners", f.owner, p)).status, 400);
  p.confirmDeleteFinancial = true;
  p.confirmSharedFinancial = false;
  assert.equal((await execute("owners", f.owner, p)).status, 400);
  p.confirmSharedFinancial = true;
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  for (const id of [f.r1, f.r2]) assert.equal(get("fee_receipts", id), undefined);
  assert.equal(get("fee_payments", f.payment), undefined);
  assert.equal(
    db.prepare("SELECT 1 FROM fee_allocations WHERE paymentId=?").get(f.payment),
    undefined,
  );
});
test("crédito: la política advertir deja constancia sin bloquear la liquidación", async () => {
  const f = fixture();
  // El titular tiene inmuebles en dos comunidades: ambas deben permitir advertir.
  for (const id of [f.c1, f.c2])
    db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
      JSON.stringify({
        creditoTitular: { politica: "advertir", destinoPorDefecto: "compensacion" },
      }),
      id,
    );
  try {
    const p = await plan("owners", f.owner);
    p.actions.finance = "liquidate_final";
    const r = await execute("owners", f.owner, p);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.settlement.creditPolicy, "advertir");
    assert.equal(r.data.settlement.creditDestination, "compensacion");
    assert.equal(r.data.settlement.creditReference, "");
    // No hubo confirmación expresa: se deja constancia del destino previsto.
    assert.equal(r.data.settlement.creditSettlementConfirmed, false);
  } finally {
    for (const id of [f.c1, f.c2])
      db.prepare("UPDATE communities SET legalConfig='{}' WHERE id=?").run(id);
  }
});
test("crédito: no agrega saldo a favor de comunidades en monedas distintas", async () => {
  const f = fixture();
  db.prepare("UPDATE communities SET currency='USD' WHERE id=?").run(f.c2);
  for (const [id, communityId, amount] of [
    [f.owner + "-credit-eur", f.c1, 1000],
    [f.owner + "-credit-usd", f.c2, 1000],
  ])
    insert("fee_payments", {
      id,
      communityId,
      ownerId: f.owner,
      amount,
      paidOn: "2026-01-01",
      method: "transfer",
      reference: "",
      requestId: id,
      createdAt: "now",
      actorId: admin.uid,
    });
  const p = await plan("owners", f.owner);
  const preview = await execute("owners", f.owner, p);
  assert.equal(preview.status, 409, JSON.stringify(preview.data));
  assert.match(preview.data.error, /varias monedas/i);
});
test("crédito: no atribuye al titular el cobro aplicado por un cotitular", async () => {
  const f = fixture(),
    coPayment = `${f.payment}-coowner`;
  insert("fee_payments", {
    id: coPayment,
    communityId: f.c1,
    ownerId: f.coowner,
    amount: 3000,
    paidOn: "2026-01-02",
    method: "transfer",
    reference: "",
    requestId: coPayment,
    createdAt: "now",
    actorId: admin.uid,
  });
  insert("fee_allocations", { receiptId: f.r1, paymentId: coPayment, amount: 3000 });
  const p = await plan("owners", f.owner);
  p.actions.finance = "liquidate_final";
  const review = await request(`/owners/${f.owner}/cascade-preview`, "POST", p);
  assert.equal(review.status, 200, JSON.stringify(review.data));
  // Solo los 4.000 del titular salen de su bolsillo; los 3.000 del cotitular
  // siguen siendo crédito de este último y no se le exigen al que se borra.
  assert.equal(review.data.credit.amount, 4000);
  assert.equal(review.data.credit.currency, "EUR");
});

test("propietario: un contrato no queda sin arrendador si el inmueble pierde a su único titular", async () => {
  const f = fixture();
  insert("tenants", {
    id: `${f.t1}-p2`,
    ownerId: f.owner,
    propertyId: f.p2,
    name: "Inquilino",
    surname: "Sin relevo",
    contractStart: "2020-01-01",
  });
  rebuildPropertyTenantReferences();
  const p = await plan("owners", f.owner);
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.error, /sin arrendador/i);
  assert.ok(get("owners", f.owner));
});

test("liquidación final: perdona el pendiente y devuelve aplicaciones como crédito sin inventar pagos", async () => {
  const f = fixture(),
    p = await plan("owners", f.owner);
  p.actions.finance = "liquidate_final";
  // La política conservadora exige documentar el saldo a favor del titular.
  const blocked = await execute("owners", f.owner, p);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /saldo a favor/);
  p.confirmCreditSettlement = true;
  p.creditDestination = "devolucion";
  p.creditReference = "   ";
  const missingReference = await execute("owners", f.owner, p);
  assert.equal(missingReference.status, 400, JSON.stringify(missingReference.data));
  assert.match(missingReference.data.error, /referencia/i);
  p.creditReference = "  Acta de conciliación de 2026-11-01  ";
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.settlement.creditReference, "Acta de conciliación de 2026-11-01");
  assert.equal(r.data.settlement.forgiven, 16000);
  assert.equal(r.data.settlement.releasedCredit, 4000);
  assert.equal(r.data.settlement.creditDestination, "devolucion");
  assert.equal(r.data.settlement.creditPolicy, "bloquear");
  assert.ok(get("fee_receipts", f.r1).cancelledAt);
  assert.equal(get("fee_payments", f.payment).amount, 4000);
  assert.equal(
    db.prepare("SELECT 1 FROM fee_allocations WHERE paymentId=?").get(f.payment),
    undefined,
  );
});
test("comunidad: borrar todo incluye inquilinos, dependencias financieras y publicaciones, preservando titulares externos", async () => {
  const f = fixture(),
    p = await plan("communities", f.c1);
  p.actions.properties[f.p1].action = "delete_property";
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "remove_tenant";
  p.actions.finance = "delete";
  p.confirmDeleteFinancial = true;
  p.actions.posts = "delete";
  p.actions.documents = "delete";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  for (const [table, id] of [
    ["communities", f.c1],
    ["properties", f.p1],
    ["tenants", f.t1],
    ["fee_receipts", f.r1],
    ["fee_payments", f.payment],
    ["service_bills", f.service],
    ["fee_assessments", f.assessment],
    ["fee_plans", f.plan],
    ["communication_posts", f.post],
  ])
    assert.equal(get(table, id), undefined);
  assert.ok(get("owners", f.owner));
  assert.equal(get("owners", f.owner).communityId, f.c2);
  assert.ok(get("properties", f.p2));
  assert.ok(get("fee_receipts", f.r2));
  assert.equal(
    db.prepare("SELECT 1 FROM communication_comments WHERE postId=?").get(f.post),
    undefined,
  );
  assert.equal(existsSync(path.join(UPLOADS_DIR, f.document)), false);
});
test("comunidad: incluye y desvincula a los socios sin inmueble del censo de la asociación", async () => {
  const f = fixture(),
    member = `${f.owner}-member`;
  insert("owners", {
    id: member,
    name: "Socia",
    surname: "Sin inmueble",
    dni: member,
    isMember: 1,
    communityId: f.c1,
  });
  const preview = await request(`/communities/${f.c1}/cascade-preview`);
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.ok(preview.data.owners.some((owner) => owner.id === member));
  const p = await plan("communities", f.c1);
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(get("owners", member));
  assert.equal(get("owners", member).communityId, "");
});

test("comunidad: el borrado normal no deja socios del censo huérfanos", async () => {
  const f = fixture(),
    communityId = `${f.c1}-empty`,
    member = `${f.owner}-orphan`;
  insert("communities", { id: communityId, name: communityId, nif: communityId, currency: "EUR" });
  insert("owners", {
    id: member,
    name: "Socia",
    surname: "Sin inmueble",
    dni: member,
    isMember: 1,
    communityId,
  });
  const r = await request(`/communities/${communityId}`, "DELETE");
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.match(r.data.error, /socios o titulares/i);
  assert.ok(get("communities", communityId));
  assert.equal(get("owners", member).communityId, communityId);
});

test("inmueble: el borrado normal limpia los datos del inmueble en el titular", async () => {
  const f = fixture(),
    owner = `${f.owner}-normal-property`,
    propertyId = `${f.p1}-normal-property`;
  insert("owners", {
    id: owner,
    name: "Titular",
    surname: "Sin inmueble",
    dni: owner,
  });
  insert("properties", {
    id: propertyId,
    communityId: f.c2,
    communityName: f.c2,
    plot: propertyId,
    ownerIds: JSON.stringify([owner]),
    ownerPercentages: JSON.stringify({ [owner]: 100 }),
  });
  rebuildOwnersPropertyIds();
  const r = await request(`/properties/${propertyId}`, "DELETE");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("owners", owner).communityId, "");
  assert.equal(get("owners", owner).communityName, "");
  assert.equal(get("owners", owner).propertyId, "");
});

test("inmueble: el cambio normal de comunidad actualiza al titular", async () => {
  const f = fixture(),
    owner = `${f.owner}-normal-community`,
    propertyId = `${f.p1}-normal-community`;
  insert("owners", {
    id: owner,
    name: "Titular",
    surname: "Cambio de comunidad",
    dni: owner,
  });
  insert("properties", {
    id: propertyId,
    communityId: "",
    communityName: "",
    plot: propertyId,
    propertyType: "Vivienda",
    participationCoef: "10",
    address: "Calle de prueba 1",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28001",
    ownerIds: JSON.stringify([owner]),
    ownerPercentages: JSON.stringify({ [owner]: 100 }),
  });
  rebuildOwnersPropertyIds();
  const before = (await request(`/properties/${propertyId}`)).data;
  const r = await request(`/properties/${propertyId}`, "PUT", {
    ...before,
    communityId: f.c2,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("owners", owner).communityId, f.c2);
  assert.equal(get("owners", owner).communityName, f.c2);
});

test("inmueble: borrar el último inmueble de un socio conserva su comunidad de censo", async () => {
  const f = fixture(),
    member = `${f.owner}-member-property`,
    propertyId = `${f.p1}-member-property`;
  insert("owners", {
    id: member,
    name: "Socia",
    surname: "Con inmueble",
    dni: member,
    isMember: 1,
    communityId: f.c1,
  });
  insert("properties", {
    id: propertyId,
    communityId: f.c1,
    communityName: f.c1,
    plot: propertyId,
    ownerIds: JSON.stringify([member]),
    ownerPercentages: JSON.stringify({ [member]: 100 }),
  });
  rebuildOwnersPropertyIds();
  const p = await plan("properties", propertyId);
  const r = await execute("properties", propertyId, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("properties", propertyId), undefined);
  assert.equal(get("owners", member).communityId, f.c1);
  assert.equal(get("owners", member).isMember, 1);
});

test("inmueble: la cascada conserva el censo del socio con otro inmueble en otra comunidad", async () => {
  const f = fixture();
  db.prepare("UPDATE owners SET isMember=1,communityId=?,communityName=? WHERE id=?")
    .run(f.target, "Asociación de pertenencia", f.owner);
  const p = await plan("properties", f.p2);
  const r = await execute("properties", f.p2, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const owner = get("owners", f.owner);
  assert.equal(owner.communityId, f.target);
  assert.equal(owner.communityName, "Asociación de pertenencia");
  assert.ok(JSON.parse(owner.propertyIds).includes(f.p1));
});

test("comunidad: mover a otra comunidad sincroniza nombres, propietarios, finanzas y publicaciones", async () => {
  const f = fixture(),
    p = await plan("communities", f.c1);
  p.actions.properties[f.p1] = { action: "reassign_community", newCommunityId: f.target };
  p.actions.finance = "reassign_community";
  p.actions.posts = "reassign_community";
  const blocked = await execute("communities", f.c1, p);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /libro financiero/);
  p.confirmLedgerTransfer = true;
  // La confirmación sin referencia no basta: el documento debe identificarse.
  const missingReference = await execute("communities", f.c1, p);
  assert.equal(missingReference.status, 400, JSON.stringify(missingReference.data));
  assert.match(missingReference.data.error, /referencia/i);
  p.transferDocument = "   ";
  const blankReference = await execute("communities", f.c1, p);
  assert.equal(blankReference.status, 400, JSON.stringify(blankReference.data));
  assert.match(blankReference.data.error, /referencia/i);
  p.transferDocument = "  Acta de la junta de 2026-11-01  ";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.settlement.transferRequired, true);
  assert.equal(r.data.settlement.transferDocument, "Acta de la junta de 2026-11-01");
  assert.equal(get("properties", f.p1).communityName, f.target);
  assert.equal(get("properties", f.p1).communityId, f.target);
  assert.equal(get("fee_receipts", f.r1).communityId, f.target);
  assert.equal(get("fee_payments", f.payment).communityId, f.target);
  assert.equal(get("communication_posts", f.post).communityId, f.target);
  assert.equal(
    get("owners", f.owner).communityId,
    get("properties", get("owners", f.owner).propertyId).communityId,
  );
});
test("comunidad: liquidar el libro documenta el crédito de socios que conservan ficha", async () => {
  const f = fixture(),
    p = await plan("communities", f.c1);
  p.actions.finance = "liquidate_final";
  const review = await request(`/communities/${f.c1}/cascade-preview`, "POST", p);
  assert.equal(review.status, 200, JSON.stringify(review.data));
  assert.equal(review.data.credit.amount, 4000);
  assert.equal(review.data.requiresCreditSettlement, true);
  assert.equal((await execute("communities", f.c1, p)).status, 409);
  p.confirmCreditSettlement = true;
  p.creditDestination = "devolucion";
  p.creditReference = "Acta de conciliación del saldo";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.settlement.releasedCredit, 4000);
  assert.ok(get("owners", f.owner));
  assert.equal(
    db.prepare("SELECT 1 FROM fee_allocations WHERE paymentId=?").get(f.payment),
    undefined,
  );
});

test("comunidad: el destino del libro también puede exigir acuerdo o documento", async () => {
  const f = fixture();
  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({ regimen: "lph", traslados: { exigirDocumento: false } }),
    f.c1,
  );
  const p = await plan("communities", f.c1);
  p.actions.properties[f.p1] = { action: "reassign_community", newCommunityId: f.target };
  p.actions.finance = "reassign_community";
  const blocked = await execute("communities", f.c1, p);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /libro financiero/);
  p.confirmLedgerTransfer = true;
  p.transferDocument = "Acuerdo de la comunidad de destino";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

test("comunidad: crear destino temporal se hace en la misma transacción", async () => {
  const f = fixture(),
    p = await plan("communities", f.c1);
  p.actions.properties[f.p1].action = "create_temp_community";
  p.actions.temporaryCommunity = { name: "Destino temporal", nif: "H10000008" };
  p.actions.finance = "reassign_community";
  p.confirmLedgerTransfer = true;
  p.transferDocument = "Acuerdo de traslado a comunidad temporal";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("communities", r.data.temporaryCommunityId).name, "Destino temporal");
  assert.equal(get("properties", f.p1).communityId, r.data.temporaryCommunityId);
  assert.equal(get("fee_receipts", f.r1).communityId, r.data.temporaryCommunityId);
});
test("inmueble: exige resolver inquilinos y permite moverlos o conservarlos desvinculados", async () => {
  const f = fixture(),
    p = await plan("properties", f.p1);
  assert.equal((await execute("properties", f.p1, p)).status, 400);
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: f.destination };
  p.actions.tenants[f.t2].action = "orphan_tenant";
  const r = await execute("properties", f.p1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1).propertyId, f.destination);
  assert.equal(get("tenants", f.t1).ownerId, f.coowner);
  assert.equal(get("tenants", f.t2).propertyId, "");
  assert.equal(get("tenants", f.t2).ownerId, "");
  assert.deepEqual(JSON.parse(get("properties", f.destination).tenantIds), [f.t1]);
  assert.ok(get("fee_receipts", f.r1));
  const archive = await request(`/cascade-archives/${r.data.archiveId}`);
  assert.equal(archive.status, 200);
  assert.equal(archive.data.documents[0].id, f.document);
  assert.equal(
    (await request(`/cascade-archives/${r.data.archiveId}`, "GET", undefined, restricted)).status,
    403,
  );
  assert.equal(existsSync(path.join(UPLOADS_DIR, f.document)), true);
});
test("inquilino: mover, finalizar y borrar mantienen ambos sentidos del vínculo", async () => {
  const f = fixture();
  let p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: f.destination };
  let r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1).propertyId, f.destination);
  p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1].action = "end_contract";
  r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1).propertyId, "");
  assert.ok(get("tenants", f.t1).contractEnd);
  p = await plan("tenants", f.t1);
  r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1), undefined);
});
test("concurrencia: cambios tras el preview invalidan el plan sin borrar nada", async () => {
  const f = fixture(),
    p = await plan("owners", f.owner);
  db.prepare("UPDATE tenants SET surname='Cambio concurrente' WHERE id=?").run(f.t1);
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 409);
  assert.ok(get("owners", f.owner));
  assert.ok(get("properties", f.p1));
});
test("plan inválido: rechaza acciones desconocidas, autorreasignación y destinos que se van a borrar", async () => {
  const f = fixture(),
    p = await plan("owners", f.owner);
  p.actions.properties[f.p1] = { action: "desconocida" };
  assert.equal((await execute("owners", f.owner, p)).status, 400);
  p.actions.properties[f.p1] = { action: "reassign_owner", newOwnerId: f.owner };
  assert.equal((await execute("owners", f.owner, p)).status, 400);
  p.actions.properties[f.p1] = { action: "delete_property" };
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: f.p1 };
  assert.equal((await execute("owners", f.owner, p)).status, 400);
  assert.ok(get("owners", f.owner));
});
test("rollback: un error tardío conserva perfiles, documentos físicos, cuotas y auditoría", async () => {
  const f = fixture();
  db.prepare("UPDATE tenants SET userId=? WHERE id=?").run(admin.uid, f.t1);
  const p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "remove_tenant";
  p.actions.documents = "delete";
  p.actions.finance = "delete";
  p.confirmDeleteFinancial = true;
  p.actions.user = "delete_user";
  const r = await execute("properties", f.p1, p);
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.ok(get("properties", f.p1));
  assert.ok(get("tenants", f.t1));
  assert.ok(get("fee_receipts", f.r1));
  assert.ok(get("documents", f.document));
  assert.ok(existsSync(path.join(UPLOADS_DIR, f.document)));
  assert.equal(
    db
      .prepare(
        "SELECT 1 FROM access_audit WHERE resourceId=? AND action='properties.cascade-deleted'",
      )
      .get(f.p1),
    undefined,
  );
});
test("DELETE normal: conserva los bloqueos anteriores para cuotas e inquilinos", async () => {
  const f = fixture();
  for (const [type, id] of [
    ["owners", f.owner],
    ["properties", f.p1],
    ["communities", f.c1],
  ])
    assert.equal((await request(`/${type}/${id}`, "DELETE")).status, 409);
});

test("revisión final: valida las cuatro entidades sin ejecutar ni exigir campos de alta", async () => {
  const f = fixture();
  for (const [collection, id] of [
    ["owners", f.owner],
    ["properties", f.p1],
    ["communities", f.c1],
    ["tenants", f.t1],
  ]) {
    const p = await plan(collection, id);
    if (collection === "properties")
      p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
    const before = get(collection, id);
    const r = await request(`/${collection}/${id}/cascade-preview`, "POST", p);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(get(collection, id), before);
    assert.equal(
      (await request(`/${collection}/${id}/cascade-preview`, "POST", p, restricted)).status,
      403,
    );
  }
});

test("comunidad: el borrado global opcional de un propietario también limpia sus vínculos externos", async () => {
  const f = fixture(),
    p = await plan("communities", f.c1);
  p.actions.owners[f.owner].action = "delete_owner";
  p.confirmGlobalDelete = false;
  assert.equal((await execute("communities", f.c1, p)).status, 409);
  p.confirmGlobalDelete = true;
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("owners", f.owner), undefined);
  assert.deepEqual(JSON.parse(get("properties", f.p2).ownerIds), []);
  assert.ok(get("owners", f.coowner));
  assert.ok(get("fee_receipts", f.r2));
});

test("histórico: conserva publicaciones y adjuntos y permite descargarlos tras borrar la comunidad", async () => {
  const f = fixture(),
    fileId = `${f.post}-file`;
  insert("communication_files", {
    id: fileId,
    postId: f.post,
    name: "acta.txt",
    mime: "text/plain",
    content: Buffer.from("archivo conservado"),
    kind: "attachment",
    createdAt: "now",
    createdBy: admin.uid,
  });
  const p = await plan("communities", f.c1),
    r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const archive = await request(`/cascade-archives/${r.data.archiveId}`);
  assert.equal(archive.status, 200);
  assert.equal(archive.data.posts[0].id, f.post);
  assert.equal(archive.data.communicationFiles[0].id, fileId);
  const file = await fetch(
    base + `/cascade-archives/${r.data.archiveId}/communications/${fileId}`,
    { headers: { Cookie: `penarrubia_session=${admin.token}` } },
  );
  assert.equal(file.status, 200);
  assert.equal(await file.text(), "archivo conservado");
  const history = await request("/cascade-archives");
  assert.ok(history.data.items.some((row) => row.id === r.data.archiveId));
  assert.equal(
    db.prepare("SELECT 1 FROM communication_outbox WHERE postId=?").get(f.post),
    undefined,
  );
});

test("histórico financiero: no genera avisos para propietarios o inmuebles borrados", async () => {
  const f = fixture(),
    p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
  assert.equal((await execute("properties", f.p1, p)).status, 200);
  const { materializeFeeReminders } = await import("../../src/fees.js");
  materializeFeeReminders("2026-01-20");
  assert.equal(db.prepare("SELECT 1 FROM fee_events WHERE receiptId=?").get(f.r1), undefined);
});

test("regresión: una baja de inquilino no repara ni modifica inmuebles ajenos", async () => {
  const f = fixture();
  db.prepare(
    "UPDATE properties SET tenantIds='[\"referencia-antigua\"]',ownerPercentages='{}' WHERE id=?",
  ).run(f.p2);
  const before = get("properties", f.p2),
    ownerBefore = get("owners", f.owner);
  const p = await plan("tenants", f.t1),
    r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(get("properties", f.p2), before);
  assert.deepEqual(get("owners", f.owner), ownerBefore);
});

test("regresión: sustituir titular también transfiere el arrendador de sus contratos", async () => {
  const f = fixture(),
    replacement = `${f.owner}-nuevo`;
  insert("owners", { id: replacement, name: "Nuevo", surname: "Titular", dni: replacement });
  const p = await plan("owners", f.owner);
  p.actions.properties[f.p1] = { action: "reassign_owner", newOwnerId: replacement };
  const r = await execute("owners", f.owner, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1).ownerId, replacement);
  assert.equal(get("tenants", f.t2).ownerId, f.coowner);
});

test("regresión: revisión final detecta que cambió el destino de un traslado", async () => {
  const f = fixture(),
    independent = `${f.owner}-independiente`;
  insert("owners", { id: independent, name: "Otro", surname: "Titular", dni: independent });
  db.prepare("UPDATE properties SET ownerIds=? WHERE id=?").run(
    JSON.stringify([independent]),
    f.destination,
  );
  const p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: f.destination };
  const review = await request(`/tenants/${f.t1}/cascade-preview`, "POST", p);
  assert.equal(review.status, 200);
  p.executionToken = review.data.executionToken;
  db.prepare("UPDATE properties SET ownerIds='[]' WHERE id=?").run(f.destination);
  const r = await request(`/tenants/${f.t1}?cascade=true`, "DELETE", p);
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(get("tenants", f.t1).propertyId, f.p1);
});

test("regresión: no se finaliza un contrato cuya fecha de inicio todavía no llegó", async () => {
  const f = fixture();
  db.prepare("UPDATE tenants SET contractStart='2099-01-01' WHERE id=?").run(f.t1);
  const p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1].action = "end_contract";
  const r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 400);
  assert.equal(get("tenants", f.t1).contractEnd, "");
});

test("R8: cascada rechaza un destino sin titulares antes de mover el contrato", async () => {
  const f = fixture();
  db.prepare("UPDATE properties SET ownerIds='[]',ownerPercentages='{}' WHERE id=?").run(
    f.destination,
  );
  const tenant = get("tenants", f.t1),
    source = get("properties", f.p1);
  const p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: f.destination };
  const result = await execute("tenants", f.t1, p);
  assert.equal(result.status, 400, JSON.stringify(result.data));
  assert.match(result.data.error, /titular válido/);
  assert.deepEqual(get("tenants", f.t1), tenant);
  assert.deepEqual(get("properties", f.p1), source);
});

test("regresión: eliminar documentos requiere también el permiso document:delete", async () => {
  const f = fixture(),
    { PERMISSIONS } = await import("../../public/js/permissions.js");
  const staff = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "document:delete"),
  );
  const p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
  p.actions.documents = "delete";
  const r = await execute("properties", f.p1, p, staff);
  assert.equal(r.status, 403);
  assert.ok(get("documents", f.document));
});

test("regresión: retirar un inmueble cierra sus repartos para nuevas emisiones", async () => {
  const f = fixture(),
    p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
  const r = await execute("properties", f.p1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(get("fee_assessments", f.assessment).cancelledAt);
  assert.ok(get("service_bills", f.service).cancelledAt);
  assert.ok(get("fee_receipts", f.r1));
});

test("revisión obligatoria: no se ejecuta un DELETE con solo la evaluación inicial", async () => {
  const f = fixture(),
    p = await plan("tenants", f.t1);
  const r = await request(`/tenants/${f.t1}?cascade=true`, "DELETE", p);
  assert.equal(r.status, 428);
  assert.ok(get("tenants", f.t1));
});

test("repartos compartidos: el resumen advierte del cierre y exige confirmarlo", async () => {
  const f = fixture();
  db.prepare("UPDATE fee_assessments SET data=? WHERE id=?").run(
    JSON.stringify({ propertyIds: [f.p1, f.p2] }),
    f.assessment,
  );
  const p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
  p.confirmSharedFinancial = false;
  const review = await request(`/properties/${f.p1}/cascade-preview`, "POST", p);
  assert.equal(review.status, 200);
  assert.equal(review.data.requiresSharedFinancial, true);
  assert.ok(review.data.closedDistributions.some((r) => r.id === f.assessment && r.shared));
  assert.equal((await execute("properties", f.p1, p)).status, 400);
  assert.equal(get("fee_assessments", f.assessment).cancelledAt, "");
  p.confirmSharedFinancial = true;
  const r = await execute("properties", f.p1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(get("properties", f.p2));
  assert.ok(get("fee_assessments", f.assessment).cancelledAt);
  assert.equal(get("fee_receipts", f.r1).cancelledAt, "");
});

test("permisos: conservar finanzas no permite cerrar repartos sin fee:manage ni leerlos sin fee:read", async () => {
  const f = fixture(),
    { PERMISSIONS } = await import("../../public/js/permissions.js");
  const reader = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "fee:manage"),
  );
  const noRead = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "fee:read"),
  );
  const p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "orphan_tenant";
  assert.equal((await execute("properties", f.p1, p, reader)).status, 403);
  assert.equal(
    (await request(`/properties/${f.p1}/cascade-preview`, "GET", undefined, noRead)).status,
    403,
  );
  assert.ok(get("properties", f.p1));
});

test("comunidad sin inmuebles: admite un destino explícito para el histórico", async () => {
  const f = fixture();
  db.prepare("UPDATE properties SET communityId=?,communityName=? WHERE id=?").run(
    f.target,
    f.target,
    f.p1,
  );
  const p = await plan("communities", f.c1);
  p.actions.finance = p.actions.posts = "reassign_community";
  p.actions.destinationCommunityId = f.target;
  p.confirmLedgerTransfer = true;
  p.transferDocument = "Acuerdo de traslado del libro";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("fee_receipts", f.r1).communityId, f.target);
  assert.equal(get("communication_posts", f.post).communityId, f.target);
  assert.equal(get("communities", f.c1), undefined);
});

test("documentos embebidos: el expediente conservado se descarga sin la ficha original", async () => {
  const f = fixture();
  db.prepare("UPDATE owners SET documents=? WHERE id=?").run(
    JSON.stringify({
      dni: { fileName: "documento.txt", dataUrl: "data:text/plain;base64,Y29uc2VydmFkbw==" },
    }),
    f.owner,
  );
  const p = await plan("owners", f.owner),
    r = await execute("owners", f.owner, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const archive = await request(`/cascade-archives/${r.data.archiveId}`);
  assert.equal(archive.data.embeddedDocuments[0].fileName, "documento.txt");
  const file = archive.data.embeddedDocuments[0],
    route = base + `/cascade-archives/${r.data.archiveId}/embedded/${file.entityIndex}/${file.key}`;
  const downloaded = await fetch(route, {
    headers: { Cookie: `penarrubia_session=${admin.token}` },
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "conservado");
  assert.equal(
    (await fetch(route, { headers: { Cookie: `penarrubia_session=${restricted.token}` } })).status,
    403,
  );
});

test("auditoría: un error de base de datos al final revierte cambios y conserva archivos", async () => {
  const f = fixture(),
    p = await plan("properties", f.p1);
  p.actions.tenants[f.t1].action = p.actions.tenants[f.t2].action = "remove_tenant";
  p.actions.documents = "delete";
  p.actions.finance = "delete";
  p.confirmDeleteFinancial = true;
  db.exec(
    `CREATE TEMP TRIGGER cascade_test_failure BEFORE INSERT ON cascade_archives WHEN json_extract(NEW.data,'$.entity.id')='${f.p1}' BEGIN SELECT RAISE(ABORT,'fallo simulado de acta'); END`,
  );
  try {
    const r = await execute("properties", f.p1, p);
    assert.equal(r.status, 500);
    for (const [table, id] of [
      ["properties", f.p1],
      ["tenants", f.t1],
      ["fee_receipts", f.r1],
      ["documents", f.document],
    ])
      assert.ok(get(table, id));
    assert.ok(existsSync(path.join(UPLOADS_DIR, f.document)));
    assert.equal(
      db
        .prepare(
          "SELECT 1 FROM access_audit WHERE resourceId=? AND action='properties.cascade-deleted'",
        )
        .get(f.p1),
      undefined,
    );
  } finally {
    db.exec("DROP TRIGGER cascade_test_failure");
  }
});

test("publicaciones: borrar o trasladar exige permisos de Comunicación", async () => {
  const f = fixture(),
    { PERMISSIONS } = await import("../../public/js/permissions.js");
  const noDelete = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "comm:eliminar"),
  );
  const noPublish = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "comm:publicar"),
  );
  const p = await plan("communities", f.c1);
  p.actions.posts = "delete";
  assert.equal((await execute("communities", f.c1, p, noDelete)).status, 403);
  p.actions.posts = "reassign_community";
  p.actions.properties[f.p1] = { action: "reassign_community", newCommunityId: f.target };
  assert.equal((await execute("communities", f.c1, p, noPublish)).status, 403);
  assert.ok(get("communication_posts", f.post));
});

test("histórico: revocar permisos de lectura revoca también el acceso al acta", async () => {
  const f = fixture(),
    { PERMISSIONS } = await import("../../public/js/permissions.js"),
    role = crypto.randomUUID();
  const staff = account(role, PERMISSIONS),
    p = await plan("tenants", f.t1);
  const r = await execute("tenants", f.t1, p, staff);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    (await request(`/cascade-archives/${r.data.archiveId}`, "GET", undefined, staff)).status,
    200,
  );
  db.prepare("UPDATE roles SET permisos=? WHERE nombre=?").run(
    JSON.stringify(PERMISSIONS.filter((p) => p !== "owner:read")),
    role,
  );
  assert.equal(
    (await request(`/cascade-archives/${r.data.archiveId}`, "GET", undefined, staff)).status,
    403,
  );
});

test("cuentas: elimina sesiones y recuperaciones pendientes y protege otros perfiles", async () => {
  const f = fixture(),
    candidate = account("user");
  db.prepare("UPDATE tenants SET userId=? WHERE id=?").run(candidate.uid, f.t1);
  db.prepare("UPDATE owners SET userId=? WHERE id=?").run(candidate.uid, f.coowner);
  let p = await plan("tenants", f.t1);
  p.actions.user = "delete_user";
  assert.equal((await execute("tenants", f.t1, p)).status, 400);
  assert.ok(get("users", candidate.uid));
  db.prepare("UPDATE owners SET userId='' WHERE id=?").run(f.coowner);
  insert("password_recovery_mail", {
    id: `${f.t1}-recovery`,
    userId: candidate.uid,
    tokenHash: "test",
    payload: "{}",
    createdAt: Date.now(),
  });
  p = await plan("tenants", f.t1);
  p.actions.user = "delete_user";
  const r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(get("users", candidate.uid), undefined);
  assert.equal(db.prepare("SELECT 1 FROM sessions WHERE userId=?").get(candidate.uid), undefined);
  assert.equal(
    db.prepare("SELECT 1 FROM password_recovery_mail WHERE userId=?").get(candidate.uid),
    undefined,
  );
});

test("validación: un destino con tipo inválido devuelve 400 y conserva los datos", async () => {
  const f = fixture(),
    p = await plan("tenants", f.t1);
  p.actions.tenants[f.t1] = { action: "reassign_tenant", newPropertyId: { unexpected: true } };
  assert.equal((await execute("tenants", f.t1, p)).status, 400);
  assert.equal(get("tenants", f.t1).propertyId, f.p1);
});

test("notificaciones: conservar el buzón de administración requiere permiso de lectura", async () => {
  const f = fixture(),
    { PERMISSIONS } = await import("../../public/js/permissions.js");
  insert("admin_emails", { id: `${f.owner}-notice`, ownerId: f.owner, subject: "Privado" });
  const actor = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((p) => p !== "admin_notification:read"),
  );
  const p = await plan("owners", f.owner);
  assert.equal((await execute("owners", f.owner, p, actor)).status, 403);
  assert.ok(get("owners", f.owner));
});

test("moneda: el histórico tampoco se traslada a una comunidad temporal de otra moneda", async () => {
  const f = fixture();
  db.prepare("UPDATE properties SET currency='USD' WHERE id=?").run(f.p1);
  const p = await plan("communities", f.c1);
  p.actions.properties[f.p1].action = "create_temp_community";
  p.actions.temporaryCommunity = { name: "Temporal", nif: "H10000016" };
  p.actions.finance = "reassign_community";
  const r = await execute("communities", f.c1, p);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /monedas/);
  assert.ok(get("communities", f.c1));
});

test("relaciones: una comunidad principal desactualizada no crea vínculos entre comunidades", async () => {
  const f = fixture();
  db.prepare("UPDATE owners SET communityId=? WHERE id IN (?,?)").run(f.target, f.owner, f.coowner);
  const preview = await request(`/communities/${f.c1}/cascade-preview`);
  assert.equal(preview.status, 200);
  // coowner really owns the destination property: that is a genuine relationship.
  assert.ok(preview.data.communities.some((c) => c.id === f.target));
  db.prepare("UPDATE properties SET ownerIds='[]' WHERE id=?").run(f.destination);
  const actual = await request(`/communities/${f.c1}/cascade-preview`);
  assert.equal(actual.status, 200);
  assert.equal(
    actual.data.communities.some((c) => c.id === f.target),
    false,
  );
  const unrelated = await request(`/communities/${f.target}/cascade-preview`);
  assert.equal(unrelated.status, 200);
  assert.equal(unrelated.data.owners.length, 0);
  assert.equal(unrelated.data.communities.length, 1);
});

test("auditoría: consultar el histórico no concede permiso para borrar", async () => {
  const f = fixture(),
    p = await plan("tenants", f.t1),
    r = await execute("tenants", f.t1, p);
  assert.equal(r.status, 200);
  const { PERMISSIONS } = await import("../../public/js/permissions.js");
  const auditor = account(
    crypto.randomUUID(),
    PERMISSIONS.filter((permission) => permission !== "cascade-delete"),
  );
  assert.equal(
    (await request(`/cascade-archives/${r.data.archiveId}`, "GET", undefined, auditor)).status,
    200,
  );
  assert.equal(
    (await request(`/owners/${f.owner}/cascade-preview`, "GET", undefined, auditor)).status,
    403,
  );
});
