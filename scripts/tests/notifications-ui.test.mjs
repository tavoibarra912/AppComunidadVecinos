import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/notificaciones.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

test("avisos: el propietario ve y marca todo lo de todos sus perfiles", async () => {
  const dom = new JSDOM(html, {
      url: "http://localhost/",
      runScripts: "outside-only",
    }),
    w = dom.window,
    ownIds = ["o1", "o2"],
    calls = [],
    notifications = [
      {
        id: "n1",
        ownerId: "o1",
        title: "Aviso del primer perfil",
        message: "Pendiente",
        type: "info",
        read: false,
        timestamp: 3,
        date: "03/11/2026",
      },
      {
        id: "n2",
        ownerId: "o2",
        title: "Aviso del segundo perfil",
        message: "Pendiente",
        type: "info",
        read: false,
        timestamp: 2,
        date: "02/11/2026",
      },
      {
        id: "n3",
        ownerId: "o3",
        title: "Aviso de otra persona",
        message: "No debe mostrarse",
        type: "info",
        read: false,
        timestamp: 1,
        date: "01/11/2026",
      },
    ];
  Object.assign(w, {
    state: {
      owners: [
        { id: "o1", userId: "u1" },
        { id: "o2", userId: "u1" },
        { id: "o3", userId: "u2" },
      ],
      ownerNotifications: notifications,
      adminEmails: [],
      settings: {},
    },
    getCurrentOwnerProfileId: () => "o1",
    hasPermission: (permission, resourceId = "") =>
      permission === "owner_notification:read" &&
      (!resourceId || ownIds.includes(resourceId)),
    requirePermission: () => true,
    escapeHtml: (value) =>
      String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character],
      ),
    api: {
      markAllOwnerNotificationsRead: async (ownerId) => {
        calls.push(ownerId);
      },
    },
    toast: () => {},
    openOwnerDetail: () => {},
  });
  vm.runInContext(
    source + "\nwindow.notifTest={updateInboxBadge,renderOwnerInbox};",
    dom.getInternalVMContext(),
  );
  try {
    w.notifTest.updateInboxBadge();
    assert.equal(w.document.querySelector("#inbox-badge-count").textContent, "2");
    assert.equal(w.document.querySelector("#owner-tab-count").textContent, "2");
    assert.equal(
      w.document.querySelector("#inbox-badge-count").hidden,
      false,
    );
    w.notifTest.renderOwnerInbox();
    const cards = [
      ...w.document.querySelectorAll(
        "#owner-inbox-list [data-notification-id]",
      ),
    ];
    assert.deepEqual(
      cards.map((card) => card.dataset.notificationId).sort(),
      ["n1", "n2"],
    );
    assert.match(w.document.querySelector("#owner-inbox-list").textContent, /primer perfil/);
    assert.match(w.document.querySelector("#owner-inbox-list").textContent, /segundo perfil/);
    assert.doesNotMatch(w.document.querySelector("#owner-inbox-list").textContent, /otra persona/);
    const bulk = w.document.querySelector("#mark-all-owner-notifs-read-btn");
    assert.equal(bulk.querySelector("span").textContent, "Marcar 2 como leídos");
    bulk.click();
    await flush();
    assert.deepEqual(calls.sort(), ["o1", "o2"]);
    assert.deepEqual(
      notifications.filter((n) => ownIds.includes(n.ownerId)).map((n) => n.read),
      [true, true],
    );
    assert.equal(notifications.find((n) => n.id === "n3").read, false);
    assert.equal(
      w.document.querySelector("#owner-inbox-feedback").textContent,
      "2 avisos marcados como leídos.",
    );
    assert.equal(w.document.querySelector("#inbox-badge-count").hidden, true);
  } finally {
    dom.window.close();
  }
});
