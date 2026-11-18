import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const source = readFileSync("public/js/features/cascade-wizard.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/export /g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t, permitted = true) {
  const dom = new JSDOM('<button id="new-owner">Nuevo propietario</button>', {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window,
    requests = [],
    messages = [],
    listeners = [];
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const data = {
    collection: "owners",
    entity: { id: "o1", name: "<img src=x onerror=alert(1)>" },
    previewToken: "preview",
    properties: [
      { id: "p1", name: "Parcela 1", communityName: "Comunidad A", ownerIds: ["o1"], tenants: [] },
    ],
    owners: [
      {
        id: "o1",
        name: "Ana",
        userId: "",
        relationships: [
          { id: "p1", name: "Parcela 1", communityId: "c1", communityName: "Comunidad A" },
          { id: "p2", name: "Parcela 2", communityId: "c2", communityName: "Comunidad B" },
        ],
        finance: { receipts: 2, payments: 1 },
      },
    ],
    tenants: [],
    communities: [
      { id: "c1", name: "Comunidad A" },
      { id: "c2", name: "Comunidad B" },
    ],
    finance: { receipts: 2, payments: 1, sharedReceipts: 1 },
    documents: 0,
    notifications: 0,
    posts: 0,
  };
  w.state = {
    owners: [
      { id: "o1", name: "Ana", surname: "Vecina" },
      { id: "o2", name: "Luis", surname: "Vecino" },
    ],
    properties: [{ id: "p1", plot: "Parcela 1" }],
    communities: [],
  };
  w.api = {
    cascadePreview: async () => data,
    cascadeReview: async (_type, _id, body) => ({
      executionToken: "revision-firmada",
      finance: data.finance,
      requiresGlobalDelete: true,
      requiresSharedFinancial: ["delete", "liquidate_final"].includes(body.actions.finance),
      otherReceiptsAffected: 0,
    }),
    cascadeDelete: async (type, id, body) => {
      requests.push(JSON.parse(JSON.stringify({ type, id, body })));
      return { ok: true, archiveId: "archive", settlement: { cancelledReceipts: 0 } };
    },
    cascadeArchives: async () => ({ items: [], nextOffset: null }),
  };
  w.hasPermission = () => permitted;
  w.toast = (message) => messages.push(message);
  w.refreshState = async () => {};
  w.onDataChanged = (listener) => listeners.push(listener);
  w.eval(source + "\nwindow.openWizard = openCascadeWizard;");
  const next = async () => {
    w.document.querySelector("#cascade-next").click();
    await flush();
  };
  const checkAll = () => {
    for (const input of w.document.querySelectorAll(".cascade-check input")) {
      input.checked = true;
      input.dispatchEvent(new w.Event("change"));
    }
  };
  const select = (label, value) => {
    const field = [...w.document.querySelectorAll(".cascade-field")].find(
      (node) => node.querySelector("span").textContent === label,
    );
    assert.ok(field, label);
    const input = field.querySelector("select");
    input.value = value;
    input.dispatchEvent(new w.Event("change"));
  };
  return { w, data, next, checkAll, select, requests, messages, listeners };
}
test("wizard: respeta el permiso y evita abrir dos asistentes simultáneos", async (t) => {
  const denied = fixture(t, false);
  await denied.w.openWizard("owners", "o1");
  assert.equal(denied.w.document.querySelector("dialog"), null);
  assert.equal(denied.messages.length, 1);
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.w.openWizard("owners", "o1");
  assert.equal(f.w.document.querySelectorAll("dialog").length, 1);
});
test("wizard: cinco pasos, nombres escapados, borrado financiero y global solo tras confirmar", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.next();
  assert.match(f.w.document.body.textContent, /Comunidad B/);
  assert.equal(f.w.document.querySelector("img"), null);
  await f.next();
  f.select("Cuotas, pagos, derramas y servicios afectados", "delete");
  await f.next();
  assert.match(f.w.document.querySelector(".cascade-progress").textContent, /Paso 4/);
  await f.next();
  assert.equal(f.requests.length, 0);
  assert.match(f.w.document.querySelector("[role=alert]").textContent, /Confirma/);
  f.checkAll();
  await f.next();
  assert.equal(f.requests.length, 1);
  const payload = f.requests[0].body;
  assert.equal(payload.actions.finance, "delete");
  assert.equal(payload.confirmDeleteFinancial, true);
  assert.equal(payload.confirmGlobalDelete, true);
  assert.equal(payload.confirmSharedFinancial, true);
  assert.equal(payload.previewToken, "preview");
  assert.equal(payload.executionToken, "revision-firmada");
  assert.match(f.w.document.querySelector(".cascade-progress").textContent, /Paso 5/);
});
test("wizard: volver y cambiar una acción invalida las confirmaciones", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.next();
  await f.next();
  await f.next();
  f.checkAll();
  f.w.document.querySelector("#cascade-back").click();
  f.select("Documentos de los perfiles eliminados", "delete");
  await f.next();
  assert.ok(
    [...f.w.document.querySelectorAll(".cascade-check input")].every((input) => !input.checked),
  );
  await f.next();
  assert.equal(f.requests.length, 0);
});
test("wizard: preview obsoleto obliga a evaluar de nuevo y no ejecuta el borrado", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.next();
  await f.next();
  await f.next();
  f.checkAll();
  f.w.api.cascadeDelete = async () => {
    throw Object.assign(new Error("Las dependencias cambiaron"), {
      status: 409,
      code: "CASCADE_STALE",
    });
  };
  await f.next();
  assert.match(f.w.document.querySelector(".cascade-progress").textContent, /Paso 1/);
  assert.match(f.w.document.querySelector("[role=alert]").textContent, /cambiaron/);
  assert.equal(f.requests.length, 0);
});
test("wizard: conserva resultado exitoso aunque falle refrescar las vistas y ofrece histórico persistente", async (t) => {
  const f = fixture(t);
  assert.equal(f.w.document.querySelector("#new-owner-cascade-history"), null);
  await f.w.openWizard("owners", "o1");
  await f.next();
  await f.next();
  await f.next();
  f.checkAll();
  f.w.refreshState = async () => {
    throw new Error("red");
  };
  await f.next();
  assert.match(f.w.document.body.textContent, /Operación completada/);
  assert.equal(f.requests.length, 1);
  assert.match(f.messages[0], /Operación guardada/);
});

test("wizard: un conflicto de datos no elimina las opciones elegidas", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.next();
  await f.next();
  f.select("Documentos de los perfiles eliminados", "delete");
  f.w.api.cascadeReview = async () => {
    throw Object.assign(new Error("NIF duplicado"), { status: 409 });
  };
  await f.next();
  assert.match(f.w.document.querySelector(".cascade-progress").textContent, /Paso 3/);
  assert.match(f.w.document.querySelector("[role=alert]").textContent, /NIF duplicado/);
  const label = [...f.w.document.querySelectorAll(".cascade-field")].find((n) =>
    n.textContent.includes("Documentos de los perfiles eliminados"),
  );
  assert.equal(label.querySelector("select").value, "delete");
});

test("wizard: informa y exige confirmar el cierre de repartos aunque se conserve el histórico", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  await f.next();
  await f.next();
  f.w.api.cascadeReview = async () => ({
    executionToken: "reparto",
    finance: f.data.finance,
    requiresGlobalDelete: false,
    requiresSharedFinancial: true,
    closedDistributions: [{ name: "Reforma cubierta", shared: true }],
  });
  await f.next();
  assert.match(f.w.document.body.textContent, /Reforma cubierta/);
  assert.match(f.w.document.body.textContent, /recibos ya emitidos conservan/);
  assert.ok(
    [...f.w.document.querySelectorAll(".cascade-check")].some((n) =>
      n.textContent.includes("repartos compartidos"),
    ),
  );
  await f.next();
  assert.equal(f.requests.length, 0);
});

test("wizard: cerrar y navegar usan iconos y conservan sus nombres accesibles", async (t) => {
  const f = fixture(t);
  await f.w.openWizard("owners", "o1");
  for (const id of ["cascade-close", "cascade-back", "cascade-next"]) {
    const button = f.w.document.getElementById(id);
    assert.equal(button.textContent.trim(), "");
    assert.ok(button.querySelector("svg"));
    assert.ok(button.getAttribute("aria-label"));
  }
  assert.equal(
    f.w.document.querySelector("#cascade-next").getAttribute("aria-label"),
    "Evaluar dependencias",
  );
  await f.next();
  assert.equal(f.w.document.querySelector("#cascade-next").getAttribute("aria-label"), "Continuar");
});

test("auditoría: el histórico y las actas se consultan dentro del panel", async (t) => {
  const f = fixture(t);
  f.w.eval("window.renderHistory = renderCascadeArchiveHistory;");
  const host = f.w.document.createElement("div");
  host.id = "audit-cascade-history";
  f.w.document.body.append(host);
  f.w.URL.createObjectURL = () => "blob:acta";
  f.w.URL.revokeObjectURL = () => {};
  f.w.api.cascadeArchives = async () => ({
    items: [
      { id: "acta", createdAt: "2026-11-18T10:00:00Z", entity: { name: "Propietario de prueba" } },
    ],
    nextOffset: null,
  });
  f.w.api.cascadeArchive = async () => ({
    entity: { name: "Propietario de prueba" },
    createdAt: "2026-11-18T10:00:00Z",
    actions: {
      finance: "keep_historical",
      documents: "keep",
      notifications: "keep",
      user: "unlink",
    },
    settlement: { cancelledReceipts: 0 },
    documents: [{ id: "documento", fileName: "Acta.pdf" }],
  });
  await f.w.renderHistory(host);
  host.querySelector("button").click();
  await flush();
  assert.match(host.textContent, /Propietario de prueba/);
  assert.ok(host.querySelector('a[href="/api/cascade-archives/acta/files/documento"]'));
  assert.equal(f.w.document.querySelector("#cascade-archives-dialog"), null);
  const html = new JSDOM(readFileSync("public/index.html", "utf8"));
  assert.ok(
    html.window.document.querySelector('[data-admin-pane="auditoria"] #audit-cascade-history'),
  );
  html.window.close();
});
