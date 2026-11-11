import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { dashboardData } from "../../public/js/dashboard-data.js";

const html = readFileSync("public/index.html", "utf8");
const source = (file) =>
  readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/\bexport (?=(async )?function|const |let )/g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const noop = () => {};
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function domFixture() {
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  return dom;
}
function communityFixture() {
  const dom = domFixture(),
    w = dom.window,
    calls = [];
  const state = {
    communities: [
      {
        id: "c1",
        name: "Comunidad",
        nif: "H12345674",
        phone: "612345678",
        otherPhone: "623456789",
        constitutionYear: "1996",
        reserveFund: "3500.25",
        documents: [
          {
            id: "doc",
            fileName: "acta.pdf",
            url: "/api/documents/doc/download",
          },
        ],
      },
    ],
    properties: [
      { id: "p1", communityId: "c1", plot: "Piso 1", ownerIds: ["o1"] },
    ],
    owners: [{ id: "o1", name: "Titular", surname: "Prueba" }],
    users: [],
    roles: [],
    tenants: [],
    settings: {},
    ui: {},
  };
  const utils = vm.runInContext(
    `(()=>{${source("public/js/utils.js")}\nreturn {setFormReadonly};})()`,
    dom.getInternalVMContext(),
  );
  const richText = vm.runInContext(
    `(()=>{${source("public/js/rich-text.js")}\nreturn {createRichText};})()`,
    dom.getInternalVMContext(),
  );
  Object.assign(w, {
    mountFeeShortcut: noop,
    state,
    sanitizeHtml: (value) => value,
    escapeHtml,
    api: new Proxy(
      {},
      {
        get: (_t, key) => async () => {
          calls.push(key);
          return {};
        },
      },
    ),
    refreshState: async () => {},
    requirePermission: () => true,
    hasPermission: () => true,
    propertyOwnerIds: (p) => p.ownerIds,
    ownerProperties: () => [],
    PROPERTY_TYPE_LABELS: { vivienda: "Vivienda" },
    getCurrencies: () => [{ code: "EUR", name: "Euro" }],
    toast: noop,
    validateDocumentFiles: () => [],
    setupGenericFileDropzone: noop,
    getLocalDateInputValue: () => "2026-11-09",
    makeSelectSearchable: noop,
    showValidationErrors: noop,
    fieldLabel: (el) => el.name,
    mensajeDeValidez: () => "Inválido",
    maskIbanField: noop,
    armarGuardia: noop,
    limpiarGuardia: noop,
    intentarCerrar: (_f, dialog) => dialog.close(),
    setFormReadonly: utils.setFormReadonly,
    createRichText: richText.createRichText,
    setupTerritory: (form) => ({
      set: (city, province, cp) => {
        form.elements.city.value = city ? "madrid-id" : "";
        form.elements.province.value = city ? "Madrid" : "";
        form.elements.postalCode.value = city ? (cp || "28001") : "";
      },
      reset: () => {
        form.elements.city.value = "";
        form.elements.province.value = "";
        form.elements.postalCode.value = "";
      },
      location: () => ({ name: "Madrid", province: "Madrid", postalCodes: ["28001"] }),
    }),
    getLocationById: () => ({ name: "Madrid", province: "Madrid" }),
    isValidPostalCode: () => true,
    createDataTable: () => ({ refresh: noop }),
    openPropertyDetail: () => calls.push("property-detail"),
    openPropertyEditor: () => calls.push("property-editor"),
    updatePropertyPeopleSelectors: noop,
    DocumentValidator: {
      generateSampleDocument: () => {
        calls.push("sample");
        return null;
      },
    },
    openDocViewer: () => calls.push("view-document"),
    crearVerificadorContacto: () => ({
      abrir: () => calls.push("verify"),
      cambiarValor: noop,
    }),
  });
  vm.runInContext(
    `${source("public/js/features/comunidades.js")}\nwindow.communityUI={openCommunityEditor,closeCommunityEditor};`,
    dom.getInternalVMContext(),
  );
  return { dom, w, state, calls };
}
test("Comunidad Ver: campos y acciones bloqueados, pestañas y documento operables", async () => {
  const f = communityFixture();
  try {
    f.w.communityUI.openCommunityEditor("c1", "details", true);
    await flush();
    const form = f.w.document.querySelector("#community-form");
    assert.ok(
      [...form.querySelectorAll("input,select,textarea")].every(
        (el) => el.disabled,
      ),
    );
    assert.equal(
      form.querySelector('[data-community-tab="contact"]').disabled,
      false,
    );
    form.querySelector('[data-community-tab="properties"]').click();
    assert.equal(
      f.w.document.querySelector("#community-tab-properties").hidden,
      false,
    );
    assert.equal(
      form.querySelectorAll("#community-edit-properties-list button").length,
      0,
    );
    assert.equal(
      form.querySelector("#btn-community-edit-add-property").disabled,
      true,
    );
    form.querySelector("#btn-community-edit-add-property").click();
    form.dispatchEvent(
      new f.w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await flush();
    assert.deepEqual(f.calls, []);
    form.querySelector('[data-community-tab="docs"]').click();
    const view = form.querySelector('[data-action="view"]');
    assert.equal(view.disabled, false);
    view.click();
    assert.deepEqual(f.calls, ["view-document"]);
    form.querySelector("#close-dialog").click();
    assert.equal(f.w.document.querySelector("#community-dialog").open, false);
  } finally {
    f.dom.window.close();
  }
});
test("Comunidad Ver: nuevos controles también quedan bloqueados y Editar recupera el formulario", async () => {
  const f = communityFixture();
  try {
    f.w.communityUI.openCommunityEditor("c1", "details", true);
    await flush();
    const form = f.w.document.querySelector("#community-form"),
      dynamic = f.w.document.createElement("button");
    dynamic.type = "button";
    form.append(dynamic);
    const proxy = f.w.document.createElement("div");
    proxy.setAttribute("role", "button");
    proxy.tabIndex = 0;
    proxy.addEventListener("click", () => f.calls.push("proxy"));
    form.append(proxy);
    form.elements.city.disabled = false;
    await flush();
    assert.equal(dynamic.disabled, true);
    assert.equal(proxy.tabIndex, -1);
    proxy.click();
    assert.deepEqual(f.calls, []);
    assert.equal(form.elements.city.disabled, true);
    f.w.communityUI.closeCommunityEditor();
    f.w.communityUI.openCommunityEditor("c1", "details", false);
    await flush();
    assert.equal(dynamic.disabled, false);
    assert.equal(proxy.tabIndex, 0);
    assert.equal(proxy.hasAttribute("aria-disabled"), false);
    assert.equal(form.elements.name.disabled, false);
    assert.equal(form.elements.constitutionYear.value, "1996");
    assert.equal(form.elements.reserveFund.value, "3500.25");
    assert.ok(
      [...form.elements.constitutionYear.options].some(
        (o) => o.value === String(new Date().getFullYear()),
      ),
    );
    assert.ok(
      [...form.elements.constitutionYear.options].some(
        (o) => o.value === "2005",
      ),
    );
    assert.ok(form.querySelector("#community-edit-properties-list button"));
    const money = form.elements.reserveFund;
    assert.equal(money.type, "number");
    money.value = "12.345";
    assert.equal(money.checkValidity(), false);
    const key = new f.w.KeyboardEvent("keydown", {
      key: "e",
      cancelable: true,
    });
    money.dispatchEvent(key);
    assert.equal(key.defaultPrevented, true);
    const paste = new f.w.Event("paste", { cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "3500,25" },
    });
    money.dispatchEvent(paste);
    assert.equal(money.value, "3500.25");
    assert.equal(money.checkValidity(), true);
  } finally {
    f.dom.window.close();
  }
});
test("Inicio: renderiza recuentos, cambia ámbito y abre acciones de registros reales", async () => {
  const dom = domFixture(),
    w = dom.window,
    calls = [];
  const state = {
    currentUserId: "me",
    activeRole: "admin",
    loadedAt: new Date().toISOString(),
    users: [{ id: "me", nombre: "Ana", rol: "administrator" }],
    roles: [{ nombre: "administrator" }],
    communities: [
      { id: "a", name: "Comunidad A" },
      { id: "b", name: "Comunidad B" },
    ],
    properties: [
      {
        id: "p1",
        communityId: "a",
        ownerIds: ["o1"],
        propertyType: "vivienda",
      },
      { id: "p2", communityId: "b", ownerIds: ["o2"], propertyType: "garaje" },
    ],
    owners: [
      { id: "o1", documents: {} },
      { id: "o2", documents: {} },
    ],
    tenants: [],
    adminEmails: [],
    ownerNotifications: [],
  };
  const snapshot = {
    posts: [
      {
        id: "post",
        communityId: "a",
        communityName: "Comunidad A",
        title: "Reunión real",
        type: "meeting",
        phase: "upcoming",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        publishAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recipient: { userId: "me", readAt: "" },
      },
    ],
  };
  Object.assign(w, {
    state,
    dashboardData,
    h: escapeHtml,
    readInjectedBrand: () => ({ nombre: "Marca real" }),
    hasPermission: () => true,
    getCommunicationSnapshot: () => snapshot,
    navigateToSection: (hash) => calls.push(hash),
    openOwnerEditor: noop,
    openOwnerDetail: noop,
    openCommunityEditor: () => calls.push("community"),
    openTenantDetail: noop,
    openAdminInbox: noop,
    openOwnerInbox: noop,
    refreshState: async () => calls.push("refresh-state"),
    refreshCommunication: async () => calls.push("refresh-posts"),
    openCommunicationPost: (id) => calls.push(id),
    openCommunicationComposer: noop,
    toast: noop,
  });
  try {
    vm.runInContext(
      `${source("public/js/features/home.js")}\nrenderHomeDashboard();`,
      dom.getInternalVMContext(),
    );
    const root = w.document.querySelector("#home-dashboard");
    assert.match(root.textContent, /Hola, Ana/);
    assert.match(root.textContent, /Marca real/);
    assert.doesNotMatch(
      root.textContent,
      /Sistema Operativo|cuotas y derechos al día/i,
    );
    assert.equal(
      root.querySelector(".dashboard-metric strong").textContent,
      "2",
    );
    const select = root.querySelector("#dashboard-community");
    select.value = "a";
    select.dispatchEvent(new w.Event("change", { bubbles: true }));
    assert.equal(
      root.querySelector(".dashboard-metric strong").textContent,
      "1",
    );
    assert.equal(root.querySelector(".dashboard-bar strong").textContent, "1");
    root.querySelector('[data-dashboard-action="post"]').click();
    await flush();
    assert.ok(calls.includes("post"));
    root.querySelector('[data-dashboard-action="refresh"]').click();
    await flush();
    assert.ok(calls.includes("refresh-state"));
    assert.ok(calls.includes("refresh-posts"));
  } finally {
    w.close();
  }
});
