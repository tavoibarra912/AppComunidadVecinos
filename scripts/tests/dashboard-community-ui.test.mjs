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
const comboSource = readFileSync("public/js/utils.js", "utf8")
  .match(/export function makeSelectSearchable[\s\S]*?\r?\n}\r?\n/)[0]
  .replace("export ", "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const noop = () => {};
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
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
    calls = [],
    libraries = [];
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
    properties: [{ id: "p1", communityId: "c1", plot: "Piso 1", ownerIds: ["o1"] }],
    owners: [{ id: "o1", name: "Titular", surname: "Prueba" }],
    users: [],
    roles: [],
    tenants: [],
    settings: {},
    ui: {},
  };
  const utils = vm.runInContext(
    `(()=>{${source("public/js/utils.js")}\nreturn {setFormReadonly,isValidCommunityNif,normalizeIdentityDocument};})()`,
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
    isValidCommunityNif: utils.isValidCommunityNif,
    normalizeIdentityDocument: utils.normalizeIdentityDocument,
    createRichText: richText.createRichText,
    setupTerritory: (form) => ({
      set: (city, province, cp) => {
        form.elements.city.value = city ? "madrid-id" : "";
        form.elements.province.value = city ? "Madrid" : "";
        form.elements.postalCode.value = city ? cp || "28001" : "";
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
    createDocumentLibrary: (options) => {
      options.container.classList.add("doc-library");
      const entry = { options, entity: options.entityId || "" };
      libraries.push(entry);
      return {
        setEntity: (id) => {
          entry.entity = id || "";
        },
        refresh: noop,
        render: noop,
      };
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
  return { dom, w, state, calls, libraries };
}
test("Comunidad Ver: campos y acciones bloqueados, pestañas y documento operables", async () => {
  const f = communityFixture();
  try {
    f.w.communityUI.openCommunityEditor("c1", "details", true);
    await flush();
    const form = f.w.document.querySelector("#community-form");
    assert.ok([...form.querySelectorAll("input,select,textarea")].every((el) => el.disabled));
    assert.equal(form.querySelector('[data-community-tab="contact"]').disabled, false);
    form.querySelector('[data-community-tab="properties"]').click();
    assert.equal(f.w.document.querySelector("#community-tab-properties").hidden, false);
    assert.equal(form.querySelectorAll("#community-edit-properties-list button").length, 0);
    assert.equal(form.querySelector("#btn-community-edit-add-property").disabled, true);
    form.querySelector("#btn-community-edit-add-property").click();
    form.dispatchEvent(new f.w.Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    assert.deepEqual(f.calls, []);
    form.querySelector('[data-community-tab="docs"]').click();
    assert.equal(f.w.document.querySelector("#community-tab-docs").hidden, false);
    const documentsLibrary = f.libraries.find(
      (entry) => entry.options.container.id === "community-document-list",
    );
    assert.ok(documentsLibrary);
    assert.equal(documentsLibrary.options.canWrite(), false);
    assert.equal(documentsLibrary.entity, "c1");
    const statutesLibrary = f.libraries.find(
      (entry) => entry.options.container.id === "community-statutes-list",
    );
    assert.ok(statutesLibrary);
    assert.equal(statutesLibrary.options.canWrite(), false);
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
    assert.ok([...form.elements.constitutionYear.options].some((o) => o.value === "2005"));
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
test("Inicio: renderiza recuentos y abre acciones de registros reales", async () => {
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
    effectiveBrand: (brand) => brand,
    hasPermission: () => true,
    getCommunicationSnapshot: () => snapshot,
    navigateToSection: (hash) => calls.push(hash),
    openOwnerEditor: noop,
    openOwnerDetail: noop,
    openCommunityEditor: () => calls.push("community"),
    openCommunityDetail: () => calls.push("community-detail"),
    openTenantDetail: noop,
    openAdminInbox: noop,
    openOwnerInbox: noop,
    refreshState: async () => calls.push("refresh-state"),
    refreshCommunication: async () => calls.push("refresh-posts"),
    openCommunicationPost: (id) => calls.push(id),
    openCommunicationComposer: noop,
    api: {
      fees: async () => ({
        accessible: true,
        totals: {
          issued: 10000,
          paid: 5000,
          pending: 5000,
          overdue: 0,
          dueSoon: 0,
          credit: 0,
        },
        counts: {
          receipts: 2,
          paid: 1,
          partial: 0,
          pending: 1,
          withBalance: 1,
          overdue: 0,
          cancelled: 0,
          proofsPending: 0,
        },
        collectionRate: 50,
        nextDue: null,
        oldestOverdue: null,
        byCommunity: [],
      }),
    },
    toast: noop,
  });
  vm.runInContext(
    `let comboSequence = 0;\n${comboSource}\nwindow.makeSelectSearchable = makeSelectSearchable;`,
    dom.getInternalVMContext(),
  );
  try {
    vm.runInContext(
      `${source("public/js/features/home.js")}\nrenderHomeDashboard();`,
      dom.getInternalVMContext(),
    );
    const root = w.document.querySelector("#home-dashboard");
    await flush();
    assert.match(root.textContent, /Hola, Ana/);
    assert.match(root.textContent, /Marca real/);
    assert.match(root.textContent, /Situación de cuotas/);
    assert.match(root.textContent, /Emitido/);
    assert.match(root.textContent, /50% del emitido/);
    assert.doesNotMatch(root.textContent, /Sistema Operativo|cuotas y derechos al día/i);
    assert.equal(root.querySelector(".dashboard-metric strong").textContent, "2");
    const filter = root.querySelector("#dashboard-community");
    assert.ok(filter, "Inicio muestra el filtro por comunidad");
    assert.deepEqual(
      [...filter.options].map((option) => option.textContent),
      ["Todas las comunidades", "Comunidad A", "Comunidad B"],
    );
    filter.value = "a";
    filter.dispatchEvent(new w.Event("change", { bubbles: true }));
    await flush();
    assert.equal(root.querySelector("#dashboard-community").value, "a");
    assert.equal(root.querySelector(".dashboard-metric strong").textContent, "1");
    root.querySelector('[data-dashboard-action="post"]').click();
    await flush();
    assert.ok(calls.includes("post"));
    root.querySelector('[data-dashboard-action="refresh"]').click();
    await flush();
    assert.ok(calls.includes("refresh-state"));
    assert.ok(calls.includes("refresh-posts"));
    // El desplegable se muestra como combo con buscador: elegir una opción en
    // ese combo debe filtrar el panel, no solo asignar el valor del select.
    w.makeSelectSearchable(root.querySelector("#dashboard-community"));
    const search = root.querySelector(".dashboard-filter .combo-box-input");
    search.focus();
    search.value = "Comunidad B";
    search.dispatchEvent(new w.Event("input"));
    const comboOption = root.querySelector('.combo-box-options li[data-value="b"]');
    assert.ok(comboOption);
    comboOption.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
    await flush();
    assert.equal(root.querySelector(".dashboard-metric strong").textContent, "1");
    assert.equal(root.querySelector("#dashboard-community").value, "b");
    // La selección de una cuenta no condiciona el panel de la siguiente,
    // incluso si ambas tienen acceso a las mismas comunidades.
    state.users.push({ id: "other-admin", nombre: "Beatriz", rol: "administrator" });
    state.currentUserId = "other-admin";
    vm.runInContext("renderHomeDashboard();", dom.getInternalVMContext());
    await flush();
    assert.equal(root.querySelector("#dashboard-community").value, "");
    assert.equal(root.querySelector(".dashboard-metric strong").textContent, "2");
  } finally {
    w.close();
  }
});

test("F07 · refrescar estado no cambia la versión del formulario ni borra un conflicto", async () => {
  const f = communityFixture();
  try {
    f.state.communities[0].version = 7;
    f.w.communityUI.openCommunityEditor("c1", "details", false);
    const form = f.w.document.querySelector("#community-form");
    form.elements.name.value = "Mi edición pendiente";
    form.elements.address.value = "Calle Prueba 1";
    form.elements.email.value = "comunidad@example.test";
    form.elements.city.replaceChildren(new f.w.Option("Madrid", "madrid-id", true, true));
    form.elements.province.replaceChildren(new f.w.Option("Madrid", "Madrid", true, true));
    form.elements.postalCode.replaceChildren(new f.w.Option("28001", "28001", true, true));
    let payload;
    f.w.api = {
      updateCommunity: async (_id, data) => {
        payload = data;
        throw Object.assign(new Error("Este registro cambió mientras lo editabas."), {
          status: 409,
        });
      },
    };
    const validation = [];
    f.w.showValidationErrors = (messages) => validation.push(...messages);
    // Simula el refresh de otra pestaña o una biblioteca abierta en paralelo.
    f.state.communities = [{ ...f.state.communities[0], version: 8 }];
    form.dispatchEvent(new f.w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.deepEqual(validation, []);
    assert.equal(payload.version, 7);
    assert.equal(form.elements.name.value, "Mi edición pendiente");
    assert.equal(f.w.document.querySelector("#community-dialog").open, true);
    assert.match(
      f.w.document.querySelector("#form-error").textContent,
      /cambió mientras lo editabas/,
    );
    assert.equal(form.dataset.editVersion, "7");
  } finally {
    f.dom.window.close();
  }
});

function fillValidCommunityForm(w, form) {
  form.elements.name.value = "Comunidad Nueva";
  form.elements.nif.value = "H10000016";
  form.elements.phone.value = "612345678";
  form.elements.email.value = "comunidad@example.test";
  form.elements.address.value = "Calle Prueba 1";
  form.elements.province.replaceChildren(new w.Option("Madrid", "Madrid", true, true));
  form.elements.city.replaceChildren(new w.Option("Madrid", "madrid-id", true, true));
  form.elements.postalCode.replaceChildren(new w.Option("28001", "28001", true, true));
}

test("R-02: un error en General abre esa pestaña y enfoca el primer campo inválido", async () => {
  const f = communityFixture();
  try {
    f.w.communityUI.openCommunityEditor();
    await flush();
    const form = f.w.document.querySelector("#community-form");
    fillValidCommunityForm(f.w, form);
    form.elements.name.value = "";
    const summaries = [];
    f.w.showValidationErrors = (messages) => summaries.push(...messages);
    form.elements.president.focus();

    form.dispatchEvent(new f.w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    await flush();

    const detailsTab = form.querySelector('[data-community-tab="details"]');
    const contactTab = form.querySelector('[data-community-tab="contact"]');
    assert.equal(detailsTab.classList.contains("has-error"), true);
    assert.equal(detailsTab.getAttribute("aria-invalid"), "true");
    assert.equal(contactTab.classList.contains("has-error"), false);
    assert.equal(f.w.document.querySelector("#community-tab-details").hidden, false);
    assert.equal(f.w.document.querySelector("#community-tab-contact").hidden, true);
    assert.equal(f.w.document.activeElement, form.elements.name);
    assert.equal(form.elements.name.getAttribute("aria-invalid"), "true");
    assert.ok(summaries.some((message) => /name/.test(message)));
  } finally {
    f.dom.window.close();
  }
});

test("R-02: un error en Contacto y Domicilio abre esa pestaña y enfoca el primer campo inválido", async () => {
  const f = communityFixture();
  try {
    f.w.communityUI.openCommunityEditor();
    await flush();
    const form = f.w.document.querySelector("#community-form");
    fillValidCommunityForm(f.w, form);
    form.elements.phone.value = "";
    const summaries = [];
    f.w.showValidationErrors = (messages) => summaries.push(...messages);
    form.elements.name.focus();

    form.dispatchEvent(new f.w.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    await flush();

    const detailsTab = form.querySelector('[data-community-tab="details"]');
    const contactTab = form.querySelector('[data-community-tab="contact"]');
    assert.equal(contactTab.classList.contains("has-error"), true);
    assert.equal(contactTab.getAttribute("aria-invalid"), "true");
    assert.equal(detailsTab.classList.contains("has-error"), false);
    assert.equal(f.w.document.querySelector("#community-tab-contact").hidden, false);
    assert.equal(f.w.document.querySelector("#community-tab-details").hidden, true);
    assert.equal(f.w.document.activeElement, form.elements.phone);
    assert.equal(form.elements.phone.getAttribute("aria-invalid"), "true");
    assert.ok(summaries.some((message) => /phone/.test(message)));
  } finally {
    f.dom.window.close();
  }
});
