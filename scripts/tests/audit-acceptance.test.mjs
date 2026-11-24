import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

import { PERMISSIONS } from "../../public/js/permissions.js";
import { PERMISOS_CATALOGO } from "../../public/js/permissions-catalog.js";
import {
  ownerPropertyEditingLocked,
  ownershipChanged,
  ownerSavedMessage,
} from "../../public/js/owner-self-service.js";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-audit-acceptance-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";

const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
const { materialize } = await import("../../src/communication-store.js");

let server;
let base;
let admin;
let owner;

const AUDITED_PERMISSIONS = [
  "fee:purge",
  "export:read",
  "community:export",
  "property:export",
  "owner:export",
  "tenant:export",
  "fee:export",
  "document:export",
  "comm:export",
  "audit:export",
  "reports:export",
  "admin:export",
];

function client() {
  let cookie = "";
  return async (route, method = "GET", body) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  };
}

const now = () => new Date().toISOString();
const later = (hours = 48) => new Date(Date.now() + hours * 3600000).toISOString();

function pollPayload(extra = {}) {
  return {
    communityId: "com-seed-1",
    type: "notice",
    title: "Votación de aceptación",
    body: "Consulta de prueba de la auditoría.",
    priority: "normal",
    status: "published",
    publishAt: now(),
    startsAt: "",
    endsAt: "",
    archiveAt: "",
    audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
    channels: [],
    commentsEnabled: false,
    receiptRequired: false,
    reminderMinutes: 0,
    pinned: false,
    meeting: null,
    poll: {
      type: "vote",
      electorate: "owners",
      question: "¿Apruebas la propuesta?",
      options: ["Sí", "No"],
      multiple: false,
      resultsLive: true,
      closesAt: later(),
      closed: false,
    },
    ...extra,
  };
}

function setCoefficients(values) {
  const update = db.prepare("UPDATE properties SET participationCoef=? WHERE id=?");
  for (const [id, value] of values) update.run(value, id);
}

function balancedCoefficients(properties) {
  const unit = Math.floor(1000000 / properties.length);
  let remaining = 1000000;
  return properties.map((property, index) => {
    const weight =
      index === properties.length - 1
        ? remaining
        : Math.min(unit, remaining - (properties.length - index - 1));
    remaining -= weight;
    return [property.id, (weight / 10000).toFixed(4)];
  });
}

before(async () => {
  const app = express();
  app.use(express.json({ limit: "60mb" }));
  app.use("/api", router);
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = client();
  owner = client();
  assert.equal(
    (await admin("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" }))
      .status,
    200,
  );
  assert.equal(
    (await owner("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" })).status,
    200,
  );
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.ok(path.basename(directory).startsWith("penarrubia-audit-acceptance-"));
  rmSync(directory, { recursive: true, force: true });
});

test("H-01: el catálogo de roles cubre todos los permisos del sistema sin duplicados", () => {
  const keys = PERMISOS_CATALOGO.map((permission) => permission.key);
  assert.equal(new Set(keys).size, keys.length, "el catálogo no debe repetir permisos");
  assert.equal(keys.length, PERMISSIONS.length, "el catálogo debe cubrir la política completa");
  for (const permission of PERMISSIONS)
    assert.ok(keys.includes(permission), `falta en el catálogo: ${permission}`);
});

test("H-01: guardar un rol conserva los 12 permisos antes invisibles", async () => {
  const created = await admin("/admin/roles", "POST", {
    nombre: "Aceptación exportaciones",
    descripcion: "Rol temporal de la prueba de aceptación",
    permisos: AUDITED_PERMISSIONS,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.deepEqual([...created.data.permisos].sort(), [...AUDITED_PERMISSIONS].sort());

  const saved = await admin(`/admin/roles/${created.data.id}`, "PUT", {
    ...created.data,
    permisos: [...AUDITED_PERMISSIONS, "owner:read"],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  for (const permission of AUDITED_PERMISSIONS)
    assert.ok(saved.data.permisos.includes(permission), `se perdió ${permission}`);

  // El guardado de la interfaz envía exactamente las casillas del catálogo.
  const fromUi = await admin(`/admin/roles/${created.data.id}`, "PUT", {
    ...saved.data,
    permisos: PERMISOS_CATALOGO.map((permission) => permission.key),
  });
  assert.equal(fromUi.status, 200, JSON.stringify(fromUi.data));
  assert.equal(fromUi.data.permisos.length, PERMISSIONS.length);
  for (const permission of PERMISSIONS)
    assert.ok(fromUi.data.permisos.includes(permission), `el guardado perdió ${permission}`);

  assert.equal((await admin(`/admin/roles/${created.data.id}`, "DELETE")).status, 200);
});

test("R-01: una votación por coeficiente no se crea con el censo incompleto", async () => {
  const properties = db
    .prepare("SELECT id, participationCoef FROM properties WHERE communityId=? ORDER BY id")
    .all("com-seed-1");
  assert.ok(properties.length >= 2);
  const original = properties.map((property) => [property.id, property.participationCoef]);
  const balanced = balancedCoefficients(properties);
  setCoefficients(balanced);

  try {
    setCoefficients([[properties[0].id, "0.0000"]]);
    const incomplete = await admin("/communications/posts", "POST", pollPayload());
    assert.equal(incomplete.status, 400, JSON.stringify(incomplete.data));
    assert.match(incomplete.data.error, /coeficiente válido|coeficientes suman/i);

    setCoefficients(balanced);
    const complete = await admin(
      "/communications/posts",
      "POST",
      pollPayload({ title: "Votación con censo completo" }),
    );
    assert.equal(complete.status, 201, JSON.stringify(complete.data));
    assert.equal(complete.data.poll.type, "vote");
    assert.match(complete.data.pollRule, /coeficiente/i);

    const ballot = await owner(`/communications/posts/${complete.data.id}/ballot`, "POST", {
      choices: [0],
    });
    assert.equal(ballot.status, 201, JSON.stringify(ballot.data));
  } finally {
    setCoefficients(original);
  }
});

test("H-02: el autoservicio bloquea la titularidad y no confirma un cambio inexistente", async () => {
  assert.equal(ownerPropertyEditingLocked({ activeRole: "owner" }), true);
  assert.equal(ownerPropertyEditingLocked({ activeRole: "admin" }), false);
  assert.equal(ownerPropertyEditingLocked({ readOnly: true, activeRole: "admin" }), true);
  assert.equal(
    ownershipChanged({
      originalIds: ["prop-seed-1"],
      currentIds: ["prop-seed-1"],
      originalPercentages: { "prop-seed-1": 100 },
      currentPercentages: { "prop-seed-1": 50 },
    }),
    true,
  );
  assert.equal(
    ownershipChanged({
      originalIds: ["prop-seed-1"],
      currentIds: ["prop-seed-1"],
      originalPercentages: { "prop-seed-1": 100 },
      currentPercentages: { "prop-seed-1": 100 },
    }),
    false,
  );
  assert.equal(
    ownerSavedMessage({ isEditing: true, isOwner: true }),
    "Datos personales actualizados.",
  );
  assert.equal(ownerSavedMessage({ isEditing: true, isOwner: false }), "Propietario actualizado.");

  const property = (await admin("/properties/prop-seed-1")).data;
  const before = (await owner("/owners/own-seed-1")).data;
  const changed = await owner("/owners/own-seed-1", "PUT", {
    ...before,
    propertyIds: ["prop-seed-2"],
    propertyShares: [{ propertyId: "prop-seed-2", percentage: 50 }],
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const after = (await admin("/properties/prop-seed-1")).data;
  assert.deepEqual(after.ownerPercentages, property.ownerPercentages);
});
