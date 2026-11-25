import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "pen-explicit-regime-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { default: router } = await import("../../src/routes/index.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();

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
  base;
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
  assert.ok(path.basename(directory).startsWith("pen-explicit-regime-"));
  rmSync(directory, { recursive: true, force: true });
});
async function request(route, method = "GET", body) {
  const response = await fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `penarrubia_session=${admin.token}` },
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
  const id = `legacy-${crypto.randomUUID()}`;
  const communityId = `${id}-c`,
    ownerId = `${id}-o`,
    propertyId = `${id}-p`;
  // Comunidad heredada sin régimen declarado: simula una fila que no pasó por
  // la migración (no debe certificar ni convocar votaciones con un LPH supuesto).
  insert("communities", {
    id: communityId,
    name: "Comunidad sin régimen",
    nif: dni(73000000 + Math.floor(Math.random() * 100000)),
    currency: "EUR",
    address: "Calle de prueba",
    city: "Madrid",
  });
  insert("owners", {
    id: ownerId,
    name: "Ana",
    surname: "Prueba",
    dni: dni(11000000 + Math.floor(Math.random() * 100000)),
    communityId,
    email: `${ownerId}@example.test`,
    phone: "612345678",
    address: "Calle de prueba",
    city: "Madrid",
  });
  insert("properties", {
    id: propertyId,
    communityId,
    communityName: "Comunidad sin régimen",
    plot: "Parcela 1",
    propertyType: "vivienda",
    address: "Calle de prueba",
    city: "Madrid",
    participationCoef: "100",
    ownerIds: JSON.stringify([ownerId]),
    ownerPercentages: JSON.stringify({ [ownerId]: 100 }),
  });
  return { communityId, propertyId };
}
const pollPayload = (communityId) => ({
  communityId,
  type: "notice",
  title: "Consulta",
  body: "Aprobación de la propuesta",
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

test("A-02: los datos demo declaran su régimen y las filas heredadas lo tienen migrado", () => {
  const seeded = JSON.parse(
    db.prepare("SELECT legalConfig FROM communities WHERE id='com-seed-1'").get().legalConfig,
  );
  assert.equal(seeded.regimen, "lph");
  const migration = db
    .prepare("SELECT 1 FROM schema_migrations WHERE id='explicit-legal-regime-v1'")
    .get();
  assert.ok(migration, "la migración de régimen explícito debe haber quedado registrada");
});

test("A-02: sin régimen no se emiten certificados ni se convocan votaciones", async () => {
  const f = fixture();
  const certificateRoute = `/fees/communities/${f.communityId}/debt-certificate?propertyId=${f.propertyId}`;
  let result = await request(certificateRoute);
  assert.equal(result.status, 409, JSON.stringify(result.data));
  assert.match(result.data.error, /régimen jurídico/i);

  result = await request("/communications/posts", "POST", pollPayload(f.communityId));
  assert.equal(result.status, 409, JSON.stringify(result.data));
  assert.match(result.data.error, /régimen jurídico/i);

  db.prepare("UPDATE communities SET legalConfig=? WHERE id=?").run(
    JSON.stringify({ regimen: "lph" }),
    f.communityId,
  );
  result = await request(certificateRoute);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.subarray(0, 5).toString(), "%PDF-");
  result = await request("/communications/posts", "POST", pollPayload(f.communityId));
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.poll.votingRule.censo, "propietarios");
});
