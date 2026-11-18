import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import express from "express";
const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-export-test-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { exportDataset, previewDataset, getExportableInventory } =
  await import("../../src/export-service.js");
const { EXPORT_INVENTORY } = await import("../../src/export-inventory.js");
const { generateCsv, generateXlsx } = await import("../../src/export-generators.js");
const { default: router } = await import("../../src/routes/index.js");
const admin = db.prepare("SELECT * FROM users WHERE usuario='super_admin'").get();
const app = express();
app.use(express.json());
app.use("/api", router);
app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(directory), tmpdir());
  rmSync(directory, { recursive: true, force: true });
});
const input = (tableId = "communities", extra = {}) => ({ user: admin, tableId, ...extra });

test("exportación: inventario define permisos, ámbito, columnas, formatos y límites por formato", () => {
  const inventory = getExportableInventory(admin);
  assert.ok(inventory.length >= 18);
  for (const item of inventory) {
    assert.ok(item.readPermission && item.exportPermission && item.scope && item.source);
    assert.ok(item.columns.length);
    for (const format of item.formats) {
      assert.ok(
        item.limits[format].rows > 0 && item.limits[format].bytes > 0 && item.limits[format].ms > 0,
      );
    }
  }
});
test("exportación: CSV, XLSX y PDF reales con las mismas filas y columnas elegidas en su orden", async () => {
  const rows = previewDataset(input()).rows;
  const ids = rows
    .slice(0, 2)
    .reverse()
    .map((r) => r.id);
  for (const format of ["csv", "xlsx", "pdf"]) {
    const result = await exportDataset(
      input("communities", { format, itemIds: ids, columns: ["nif", "name"] }),
    );
    assert.equal(result.rowCount, 2);
    if (format === "csv") {
      const text = result.buffer.toString("utf8");
      assert.ok(text.indexOf(rows[1].name) < text.indexOf(rows[0].name));
      assert.match(text, /"NIF";"Comunidad"/);
    }
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(result.buffer);
      assert.equal(wb.getWorksheet("Datos").getCell("A2").value, rows[1].nif);
      assert.equal(wb.getWorksheet("Datos").getCell("B3").value, rows[0].name);
      assert.ok(wb.getWorksheet("Metadatos"));
    }
    if (format === "pdf") {
      assert.equal(result.buffer.subarray(0, 5).toString(), "%PDF-");
      assert.equal(
        (result.buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
        1,
        "El pie no debe crear una página vacía",
      );
      assert.match(result.buffer.toString("latin1"), /%%EOF/);
    }
  }
});
test("exportación: selección vacía, inválida, columnas desconocidas, filtros y orden se rechazan", async () => {
  await assert.rejects(exportDataset(input("communities", { itemIds: [] })), { status: 422 });
  for (const extra of [
    { filters: null },
    { filters: { inventado: "x" } },
    { sort: { key: "no", dir: "asc" } },
    { sort: { key: "name", dir: "up" } },
    { columns: ["passwordHash"] },
    { columns: [] },
    { itemIds: ["x", "x"] },
  ])
    await assert.rejects(exportDataset(input("communities", extra)), { status: 400 });
  await assert.rejects(exportDataset(input("__proto__")), { status: 404 });
  await assert.rejects(exportDataset(input("communities", { itemIds: ["fuera-de-ambito"] })), {
    status: 409,
  });
});
test("exportación: lectura no concede exportación y los permisos revocados se aplican a la siguiente petición", async () => {
  db.prepare("INSERT INTO roles(id,nombre,permisos) VALUES(?,?,?)").run(
    "export-reader",
    "export-reader",
    JSON.stringify(["community:read"]),
  );
  const reader = { ...admin, id: "export-reader", rol: "export-reader" };
  assert.ok(previewDataset(input("communities", { user: reader })).rows.length);
  assert.equal(getExportableInventory(reader).length, 0);
  await assert.rejects(exportDataset(input("communities", { user: reader })), { status: 403 });
  db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
    JSON.stringify(["community:read", "export:read", "community:export"]),
    "export-reader",
  );
  await exportDataset(input("communities", { user: reader }));
  db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
    JSON.stringify(["community:read"]),
    "export-reader",
  );
  await assert.rejects(exportDataset(input("communities", { user: reader })), { status: 403 });
});
test("exportación: administrador local solo exporta comunidades asignadas y documentos con lectura", async () => {
  const local = db.prepare("SELECT * FROM users WHERE rol='community_admin' LIMIT 1").get();
  const visible = previewDataset(input("communities", { user: local })).rows;
  assert.ok(visible.length);
  const assigned = db
    .prepare("SELECT id FROM communities WHERE adminUserId=?")
    .all(local.id)
    .map((c) => c.id);
  assert.ok(visible.every((c) => assigned.includes(c.id)));
  const other = db.prepare("SELECT id FROM communities WHERE adminUserId<>? LIMIT 1").get(local.id);
  await assert.rejects(
    exportDataset(input("communities", { user: local, filters: { communityId: other.id } })),
    { status: 403 },
  );
  await assert.rejects(exportDataset(input("communities", { user: local, itemIds: [other.id] })), {
    status: 409,
  });
});
test("exportación: comunicaciones respetan audiencia y borradores privados", () => {
  const owner = db.prepare("SELECT * FROM users WHERE usuario='urucp1'").get();
  const role = db.prepare("SELECT * FROM roles WHERE nombre='user'").get();
  const original = role.permisos;
  const cid = db
    .prepare("SELECT communityId FROM properties WHERE ownerIds LIKE '%own-seed-1%' LIMIT 1")
    .get().communityId;
  for (const [id, status] of [
    ["export-visible", "published"],
    ["export-hidden", "draft"],
  ])
    db.prepare(
      "INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES(?,?,?,?,?,?)",
    ).run(
      id,
      cid,
      JSON.stringify({
        title: id,
        type: "notice",
        body: "Texto",
        status,
        publishAt: "2020-01-01",
        audience: { mode: "all" },
      }),
      admin.id,
      "2020-01-01",
      "2020-01-01",
    );
  db.prepare("INSERT INTO communication_recipients(postId,userId) VALUES(?,?)").run(
    "export-visible",
    owner.id,
  );
  db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
    JSON.stringify([...JSON.parse(original), "export:read", "comm:export"]),
    role.id,
  );
  try {
    const data = previewDataset(input("communications", { user: owner }));
    const { canRead, allPosts } = communication;
    const readable = new Set(
      allPosts()
        .filter((p) => canRead(owner, p))
        .map((p) => p.id),
    );
    assert.ok(data.rows.every((r) => readable.has(r.id)));
    assert.ok(data.rows.some((r) => r.id === "export-visible"));
    assert.ok(!data.rows.some((r) => r.id === "export-hidden"));
  } finally {
    db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(original, role.id);
  }
});
const communication = await import("../../src/communication-store.js");
test("exportación: límites de filas, tamaño y tiempo no entregan archivos parciales y se auditan", async () => {
  const entry = EXPORT_INVENTORY.communities,
    limit = entry.limits.csv,
    original = { ...limit };
  try {
    limit.rows = 1;
    await assert.rejects(exportDataset(input()), { status: 413 });
    limit.rows = original.rows;
    limit.bytes = 1;
    await assert.rejects(exportDataset(input()), { status: 413 });
    limit.bytes = original.bytes;
    limit.ms = 1;
    await assert.rejects(exportDataset(input()), { status: 413 });
  } finally {
    Object.assign(limit, original);
  }
  const saved = entry.fetchData;
  try {
    entry.fetchData = () => {
      throw new Error("fallo de dependencia");
    };
    await assert.rejects(exportDataset(input()), { status: 502 });
  } finally {
    entry.fetchData = saved;
  }
  const audit = db
    .prepare("SELECT * FROM access_audit WHERE action='export' ORDER BY id DESC LIMIT 1")
    .get();
  assert.equal(audit.outcome, "failure");
  assert.ok(!JSON.stringify(audit).includes("fallo de dependencia"));
  assert.ok(!readdirSync(directory).some((name) => /\.(pdf|xlsx|csv)$/.test(name)));
});
test("generadores: CSV protege fórmulas y metadatos multilínea; XLSX conserva números, fechas y literales", async () => {
  const data = {
    dataset: { title: "Prueba", source: "Prueba" },
    rows: [{ text: "\t=1+1", number: 12.345, date: "2026-11-18" }],
    columns: [
      { key: "text", label: "Texto" },
      { key: "number", label: "Número", type: "number" },
      { key: "date", label: "Fecha", type: "date" },
    ],
    metadata: {
      userName: 'Una persona\n=HYPERLINK("x")',
      userRole: "test",
      generatedAt: "2026-11-18",
    },
  };
  const csv = (await generateCsv(data)).toString("utf8");
  assert.ok(csv.includes('"\'\t=1+1"'));
  assert.ok(csv.includes('"Una persona\n=HYPERLINK(""x"")"'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await generateXlsx(data));
  assert.equal(wb.getWorksheet("Datos").getCell("A2").value, "\t=1+1");
  assert.equal(wb.getWorksheet("Datos").getCell("B2").value, 12.345);
  assert.ok(wb.getWorksheet("Datos").getCell("C2").value instanceof Date);
});
test("API de exportación: exige sesión y origen válido y descarga con no-store", async () => {
  assert.equal((await fetch(base + "/export/inventory")).status, 401);
  const login = await fetch(base + "/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "super_admin", password: "super_admin" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await fetch(base + "/export/communities", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://ajeno.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  const response = await fetch(base + "/export/communities", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ format: "csv", columns: ["name"] }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-disposition"), /attachment/);
});

test("finanzas: usa céntimos, cobros aplicados y repartos reales sin inventar estados de reclamación", async () => {
  const fees = await import("../../src/fees.js"),
    services = await import("../../src/services.js");
  db.prepare("INSERT INTO communities(id,name,nif,currency) VALUES(?,?,?,?)").run(
    "export-c",
    "Comunidad financiera",
    "H-EXPORT",
    "EUR",
  );
  db.prepare(
    "INSERT INTO properties(id,communityId,plot,ownerIds,participationCoef) VALUES(?,?,?,?,?)",
  ).run("export-p", "export-c", "Unidad exportable", JSON.stringify(["own-seed-1"]), "100");
  const snapshot = {
    property: "Unidad exportable",
    community: "Comunidad financiera",
    owners: [{ id: "own-seed-1", name: "Titular" }],
    months: 1,
    agreement: "Junta",
  };
  db.prepare(
    "INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "export-r",
    "export-c",
    "export-p",
    "plan",
    "2020-01",
    "2020-01-31",
    "2020-01-05",
    12345,
    JSON.stringify(snapshot),
    "2020-01-01",
    admin.id,
  );
  db.prepare(
    "INSERT INTO fee_payments(id,communityId,ownerId,amount,paidOn,method,reference,requestId,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "export-pay",
    "export-c",
    "own-seed-1",
    2345,
    "2020-01-02",
    "transfer",
    "REF",
    "export-pay",
    "2020-01-02",
    admin.id,
  );
  db.prepare("INSERT INTO fee_allocations(paymentId,receiptId,amount) VALUES(?,?,?)").run(
    "export-pay",
    "export-r",
    2345,
  );
  let receipt = previewDataset(input("receipts")).rows.find((r) => r.id === "export-r");
  assert.equal(receipt.amount, 123.45);
  assert.equal(receipt.paid, 23.45);
  assert.equal(receipt.outstanding, 100);
  const financial = previewDataset(input("report_financial")).rows.find(
    (r) => r.communityName === "Comunidad financiera",
  );
  assert.equal(financial.issuedTotal, 123.45);
  assert.equal(financial.paidTotal, 23.45);
  assert.equal(financial.pendingTotal, 100);
  const arrears = previewDataset(input("report_arrears")).rows.find(
    (r) => r.communityName === "Comunidad financiera",
  );
  assert.equal(arrears.debtTotal, 100);
  assert.equal(arrears.status, "Vencido");
  fees.savePlan(
    "export-c",
    {
      annualAmount: "1200",
      months: 1,
      effectiveFrom: "2026-01-01",
      dueDay: 5,
      mode: "coefficient",
      agreement: "Junta",
    },
    admin,
  );
  fees.saveAssessment(
    "export-c",
    {
      name: "Obra",
      purpose: "Reparación",
      agreement: "Junta",
      totalAmount: "200",
      mode: "coefficient",
      installments: [{ amount: "200", dueDate: "2030-12-10" }],
    },
    admin,
  );
  services.saveService(
    "export-c",
    {
      service: "agua",
      supplier: "Proveedor",
      invoiceNumber: "TEST",
      period: "2030-01",
      issueDate: "2030-01-10",
      dueDate: "2030-02-10",
      totalAmount: "200",
      billing: "receipts",
      method: "coefficient",
    },
    admin,
  );
  const { createFolder } = await import("../../src/document-library.js");
  createFolder({
    entityType: "community",
    entityId: "export-c",
    name: "Documentación",
    user: admin,
  });
  for (const tableId of [
    "communities",
    "communications",
    "properties",
    "owners",
    "tenants",
    "users",
    "roles",
    "documents",
    "audit",
    "receipts",
    "payments",
    "plans",
    "assessments",
    "services",
    "assessment_installments",
    "service_breakdown",
    "receipt_payments",
    "report_financial",
    "report_arrears",
    "report_services",
    "report_comparison",
  ]) {
    const data = previewDataset(input(tableId));
    assert.ok(data.rows.length, tableId);
    for (const format of ["csv", "xlsx", "pdf"]) {
      const file = await exportDataset(input(tableId, { format, itemIds: [data.rows[0].id] }));
      assert.ok(file.buffer.length > 20, tableId + " " + format);
    }
  }
});
