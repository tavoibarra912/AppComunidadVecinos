import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/communication.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");
const flush = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const post = (id = "p1", readAt = "") => ({
  id,
  title: `Publicación ${id}`,
  body: "Aviso general",
  communityId: "c1",
  communityName: "Comunidad",
  phase: "active",
  type: "notice",
  updatedAt: "2026-11-18T12:00:00Z",
  publishAt: "2026-11-18T12:00:00Z",
  recipient: { readAt },
  audience: { mode: "all" },
  priority: "normal",
});
function fixture(t) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window,
    calls = [];
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.setInterval = () => 0;
  w.state = { currentUserId: "u1" };
  w.hasPermission = () => true;
  w.h = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  w.createExportDropdown = () => null;
  w.toast = () => {};
  w.fieldLabel = () => "";
  w.mensajeDeValidez = () => "";
  w.validateDocumentFiles = () => null;
  let rows = [post()],
    load = null;
  w.api = {
    communication: async (route, method, payload) => {
      calls.push({ route, method, payload, user: w.state.currentUserId });
      if (route === "/metadata")
        return { communities: [{ id: "c1", name: "Comunidad", canManage: false }] };
      if (route === "/posts") return load ? load() : structuredClone(rows);
      if (route === "/inbox/read-all") {
        rows = rows.map((p) => ({ ...p, recipient: { readAt: "2026-11-18T12:30:00Z" } }));
        return { readAt: "2026-11-18T12:30:00Z" };
      }
      throw new Error(`Ruta inesperada: ${route}`);
    },
  };
  w.eval(source + "\nwindow.inboxTest={refreshCommunication,getCommunicationSnapshot};");
  return {
    w,
    calls,
    badge: () => w.document.querySelector("[data-comm-unread]"),
    rows: (value) => {
      rows = value;
    },
    load: (value) => {
      load = value;
    },
    refresh: () => w.inboxTest.refreshCommunication(),
  };
}
test("comunicaciones: el contador usa los datos y se oculta al marcar todo como leído", async (t) => {
  const f = fixture(t);
  f.rows([post("p1"), post("p2"), post("p3", "leído")]);
  await f.refresh();
  assert.equal(f.badge().textContent, "2");
  assert.equal(f.badge().hidden, false);
  f.w.document.querySelector("#comm-inbox-link").click();
  await flush();
  assert.match(f.w.document.querySelector("#comm-dialog").textContent, /documentación y cuotas/);
  f.w.document.querySelector("#comm-inbox-read-all").click();
  await flush();
  assert.equal(f.badge().textContent, "0");
  assert.equal(f.badge().hidden, true);
  assert.ok(f.calls.some((c) => c.route === "/inbox/read-all" && c.method === "POST"));
});
test("comunicaciones: una respuesta anterior no restaura el contador después de leer", async (t) => {
  const f = fixture(t);
  await f.refresh();
  f.w.document.querySelector("#comm-inbox-link").click();
  await flush();
  const slow = deferred();
  f.load(() => slow.promise);
  const refreshing = f.refresh();
  f.w.document.querySelector("#comm-inbox-read-all").click();
  await flush();
  assert.equal(f.badge().hidden, true);
  slow.resolve([post()]);
  await refreshing;
  assert.equal(f.badge().hidden, true);
  assert.equal(f.badge().textContent, "0");
});
test("comunicaciones: cambiar de cuenta descarta respuestas y contadores de la anterior", async (t) => {
  const f = fixture(t);
  await f.refresh();
  const slow = deferred();
  f.load(() => slow.promise);
  const old = f.refresh();
  f.w.state.currentUserId = "u2";
  f.load(() => Promise.resolve([]));
  await f.refresh();
  assert.equal(f.badge().hidden, true);
  slow.resolve([post("antigua")]);
  await old;
  assert.equal(f.badge().hidden, true);
  assert.equal(f.w.inboxTest.getCommunicationSnapshot().posts.length, 0);
});
