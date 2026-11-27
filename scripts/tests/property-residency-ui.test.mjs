import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/inmuebles.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function|const |let )/g, "");
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
const noop = () => {};

function fixture(tenantCreateAllowed = true) {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" });
  const { window: w } = dom;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const state = {
    communities: [{ id: "c1", name: "Comunidad" }],
    owners: [
      {
        id: "o1",
        name: "Ana",
        surname: "Prueba",
        dni: "12345678Z",
        communityId: "c1",
      },
    ],
    properties: [],
    tenants: [],
    settings: {},
    ui: { editingPropertyId: null, viewingOwnerId: null, ownerEditorPropertyContext: null },
  };
  const calls = {
    tenantEditor: [],
    toasts: [],
    properties: [],
    validationErrors: [],
    notifications: [],
    tableColumns: null,
  };
  const ownerProperties = (owner) =>
    state.properties.filter((property) => property.ownerIds.includes(owner.id));
  const ownerTenants = (owner) => owner.tenants || [];

  Object.assign(w, {
    state,
    api: {
      createProperty: async (payload) => {
        calls.properties.push(payload);
        state.properties.push({ ...payload });
      },
      updateProperty: noop,
    },
    refreshState: noop,
    openTenantEditor: (...args) => calls.tenantEditor.push(args),
    openTenantDetail: noop,
    openOwnerDetail: noop,
    openOwnerEditor: noop,
    addPropertyToOwnerEditor: noop,
    openCommunityEditor: noop,
    refreshCommunityEditorAfterPropertySave: noop,
    openCascadeWizard: noop,
    openCommunicationComposer: (...args) => calls.notifications.push(args),
    sanitizeHtml: (value) => value,
    richTextHtml: (value) => value,
    ownerProperties,
    ownerTenants,
    tenantsForProperty: () => [],
    getTenantContractStatus: () => "vigente",
    propertyOwnerIds: (property) => property?.ownerIds || [],
    PROPERTY_TYPE_LABELS: { vivienda: "Vivienda" },
    PROPERTY_USE_LABELS: {},
    getCurrencies: () => [{ code: "EUR", name: "Euro" }],
    hasPermission: (permission) => permission !== "tenant:create" || tenantCreateAllowed,
    requirePermission: () => true,
    toast: (message) => calls.toasts.push(message),
    isValidCadastralRef: () => true,
    normalizeCadastralReference: (value) =>
      String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s.\-]/g, ""),
    cadastralReferenceProblem: () => "",
    isValidDecimal: () => true,
    makeSelectSearchable: noop,
    showValidationErrors: (messages) => calls.validationErrors.push(messages),
    limpiarGuardia: noop,
    intentarCerrar: noop,
    setFormReadonly: noop,
    createDocumentLibrary: () => ({ setEntity: noop, refresh: noop, render: noop }),
    setupTerritory: () => ({ set: noop, reset: noop }),
    getLocationById: (id) => (id ? { name: "Sevilla", province: "Sevilla" } : null),
    isValidPostalCode: () => true,
    createDataTable: (options) => {
      calls.tableColumns = options.columns;
      return { refresh: noop };
    },
    createExportDropdown: noop,
    createRichText: () => ({ setValue: noop }),
    __crypto: { randomUUID: () => "property-created" },
  });

  const ui = vm.runInContext(
    `(() => { const crypto = window.__crypto; ${source}\nreturn { openPropertyEditor, openPropertyDetail, renderProperties }; })()`,
    dom.getInternalVMContext(),
  );
  return { dom, window: w, state, calls, ui };
}

function fillRequiredPropertyFields(form, document) {
  form.elements.plot.value = "Piso 1";
  form.elements.communityId.value = "c1";
  form.elements.propertyType.value = "vivienda";
  form.elements.address.value = "Calle Mayor, 1";
  form.elements.participationCoef.value = "100";
  for (const [name, value] of [
    ["province", "Sevilla"],
    ["city", "sevilla"],
    ["postalCode", "41001"],
  ]) {
    const select = form.elements[name];
    select.replaceChildren(new document.defaultView.Option(value, value));
    select.disabled = false;
    select.value = value;
  }
  document.querySelector("#btn-property-link-owner").click();
  document.querySelector("#property-owner-link-select").value = "o1";
  document.querySelector("#btn-property-confirm-owner").click();
}

async function saveNewProperty(choice, tenantCreateAllowed = true) {
  const f = fixture(tenantCreateAllowed);
  const { document } = f.window;
  try {
    f.ui.openPropertyEditor();
    const form = document.querySelector("#property-form");
    fillRequiredPropertyFields(form, document);
    const residentChoice = document.querySelector("#property-initial-resident");
    assert.equal(residentChoice.hidden, false);
    assert.equal(residentChoice.closest(".property-editor-pane").dataset.propertyPane, "owners");
    assert.equal(residentChoice.closest(".property-editor-pane").firstElementChild, residentChoice);
    assert.match(residentChoice.textContent, /Ocupación del inmueble/);
    assert.match(residentChoice.textContent, /No se crea ningún contrato/);
    assert.doesNotMatch(residentChoice.textContent, /primer propietario/);
    assert.equal(form.querySelector('input[name="initialResident"][value="owner"]').checked, true);
    const tenantsTab = document.querySelector('.community-editor-tab[data-property-tab="tenants"]');
    assert.equal(tenantsTab.disabled, true);
    const radio = form.querySelector(`input[name="initialResident"][value="${choice}"]`);
    radio.checked = true;
    radio.dispatchEvent(new f.window.Event("change", { bubbles: true }));
    assert.equal(tenantsTab.disabled, choice !== "other");
    form.dispatchEvent(new f.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    return f;
  } catch (error) {
    f.dom.window.close();
    throw error;
  }
}

test("el propietario es la opción inicial y deshabilita la pestaña Inquilinos", async () => {
  const f = await saveNewProperty("owner");
  try {
    assert.equal(f.calls.properties.length, 1);
    assert.equal(f.calls.tenantEditor.length, 0);
    f.ui.openPropertyEditor("property-created");
    // La sección de ocupación sigue visible al editar un inmueble existente.
    assert.equal(f.window.document.querySelector("#property-initial-resident").hidden, false);
    const tenantsTab = f.window.document.querySelector(
      '.community-editor-tab[data-property-tab="tenants"]',
    );
    // Sin inquilinos vinculados, "Vive el propietario" deshabilita la pestaña Inquilinos.
    assert.equal(tenantsTab.disabled, true);
  } finally {
    f.dom.window.close();
  }
});

test("otra persona habilita la pestaña Inquilinos sin abrir el alta de inquilino", async () => {
  const f = await saveNewProperty("other");
  try {
    assert.equal(f.calls.properties.length, 1);
    assert.deepEqual(f.calls.tenantEditor, []);
    assert.equal(f.calls.toasts[f.calls.toasts.length - 1], "Inmueble creado.");
  } finally {
    f.dom.window.close();
  }
});

test("elegir otra persona no exige permiso de inquilinos porque no crea ninguno", async () => {
  const f = await saveNewProperty("other", false);
  try {
    assert.equal(f.calls.properties.length, 1);
    assert.deepEqual(f.calls.validationErrors, []);
    assert.deepEqual(f.calls.tenantEditor, []);
  } finally {
    f.dom.window.close();
  }
});

test("el alta ocupada por el propietario marca al titular como residente y principal", async () => {
  const f = await saveNewProperty("owner");
  try {
    const payload = f.calls.properties[0];
    assert.equal(payload.occupancy, "owner");
    assert.equal(JSON.stringify(payload.residentOwnerIds), JSON.stringify(["o1"]));
    assert.equal(payload.primaryResidentId, "o1");
  } finally {
    f.dom.window.close();
  }
});

test("el alta puede reutilizar una parcela y completa la referencia catastral", async () => {
  const f = fixture();
  const reference = "28055A013000540001WL";
  f.state.parcels = [{ id: "parcel-1", communityId: "c1", cadastralRef: reference }];
  try {
    f.ui.openPropertyEditor();
    const { document } = f.window;
    const form = document.querySelector("#property-form");
    fillRequiredPropertyFields(form, document);
    form.elements.communityId.dispatchEvent(new f.window.Event("change", { bubbles: true }));
    const select = form.elements.parcelId;
    assert.equal(select.options.length, 2);
    select.value = "parcel-1";
    select.dispatchEvent(new f.window.Event("change", { bubbles: true }));
    assert.equal(form.elements.cadastralRef.value, reference);
    assert.equal(form.elements.cadastralRef.readOnly, true);
    form.dispatchEvent(new f.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(f.calls.properties.length, 1);
    assert.equal(f.calls.properties[0].parcelId, "parcel-1");
    assert.equal(f.calls.properties[0].cadastralRef, reference);
  } finally {
    f.dom.window.close();
  }
});

test("el alta sin ocupante se guarda como vacía y viaja en el payload", async () => {
  const f = await saveNewProperty("vacant");
  try {
    const payload = f.calls.properties[0];
    assert.equal(payload.occupancy, "vacant");
    assert.equal(JSON.stringify(payload.residentOwnerIds), "[]");
    assert.equal(payload.primaryResidentId, "");
    assert.deepEqual(f.calls.validationErrors, []);
  } finally {
    f.dom.window.close();
  }
});

test("la residencia es opcional y desmarcarla no inventa residentes", async () => {
  const f = fixture();
  const { document } = f.window;
  try {
    f.ui.openPropertyEditor();
    const form = document.querySelector("#property-form");
    fillRequiredPropertyFields(form, document);
    const checkbox = document.querySelector(
      "#property-owners-list .property-resident-toggle input[type=checkbox]",
    );
    assert.equal(checkbox.checked, true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new f.window.Event("change", { bubbles: true }));
    form.dispatchEvent(new f.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    assert.equal(f.calls.properties.length, 1);
    const payload = f.calls.properties[0];
    assert.equal(payload.occupancy, "owner");
    assert.equal(JSON.stringify(payload.residentOwnerIds), "[]");
    assert.equal(payload.primaryResidentId, "");
    assert.deepEqual(f.calls.validationErrors, []);
  } finally {
    f.dom.window.close();
  }
});

test("el aviso del inmueble reutiliza Comunicación con la comunidad y el inmueble precargados", async () => {
  const f = fixture();
  const { document } = f.window;
  try {
    f.ui.openPropertyEditor();
    assert.equal(document.querySelector("#btn-property-notify").hidden, true);
    f.state.properties.push({
      id: "p1",
      version: 1,
      communityId: "c1",
      communityName: "Comunidad",
      plot: "Piso 1",
      propertyType: "vivienda",
      address: "Calle Mayor, 1",
      participationCoef: "100",
      ownerIds: ["o1"],
      ownerPercentages: { o1: 100 },
      tenantIds: [],
      occupancy: "owner",
      residentOwnerIds: ["o1"],
      primaryResidentId: "o1",
      documents: [],
    });
    f.ui.openPropertyEditor("p1");
    const notify = document.querySelector("#btn-property-notify");
    assert.equal(notify.hidden, false);
    notify.click();
    await flush();
    assert.equal(
      JSON.stringify(f.calls.notifications.at(-1)),
      JSON.stringify([
        {
          communityId: "c1",
          title: "Aviso del inmueble Piso 1",
          audienceMode: "selected",
          propertyIds: ["p1"],
          includeResidents: false,
        },
      ]),
    );
  } finally {
    f.dom.window.close();
  }
});

function detailProperty(id, extra) {
  return {
    id,
    communityId: "c1",
    plot: "Piso 1",
    propertyType: "vivienda",
    address: "Calle Mayor, 1",
    ownerIds: ["o1"],
    tenantIds: [],
    documents: [],
    ...extra,
  };
}

test("la ficha de lectura muestra la ocupación y el contacto principal declarados", () => {
  const f = fixture();
  const { document } = f.window;
  try {
    f.state.tenants.push({ id: "t1", name: "Luis", surname: "Inquilino" });
    f.state.properties.push(
      detailProperty("p-owner", {
        occupancy: "owner",
        residentOwnerIds: ["o1"],
        primaryResidentId: "o1",
      }),
      detailProperty("p-tenant", {
        occupancy: "tenant",
        tenantIds: ["t1"],
        primaryResidentId: "t1",
      }),
      detailProperty("p-vacant", { occupancy: "vacant", primaryResidentId: "" }),
    );
    const occupancy = () => document.querySelector("#property-detail-occupancy").textContent;
    const contact = () => document.querySelector("#property-detail-primary-resident").textContent;
    f.ui.openPropertyDetail("p-owner");
    assert.equal(occupancy(), "Vive el propietario");
    assert.equal(contact(), "Ana Prueba");
    f.ui.openPropertyDetail("p-tenant");
    assert.equal(occupancy(), "Vive otra persona");
    assert.equal(contact(), "Luis Inquilino");
    f.ui.openPropertyDetail("p-vacant");
    assert.equal(occupancy(), "Sin ocupante");
    assert.equal(contact(), "Sin contacto declarado");
  } finally {
    f.dom.window.close();
  }
});

test("el editor marca al contacto principal en la tarjeta del residente", () => {
  const f = fixture();
  const { document } = f.window;
  try {
    f.state.properties.push(
      detailProperty("p-owner", {
        occupancy: "owner",
        residentOwnerIds: ["o1"],
        primaryResidentId: "o1",
      }),
    );
    f.ui.openPropertyEditor("p-owner");
    const cards = [...document.querySelectorAll("#property-owners-list .community-property-sub")];
    assert.equal(cards.length, 1);
    assert.match(cards[0].textContent, /Reside/);
    assert.match(cards[0].textContent, /Contacto principal/);
  } finally {
    f.dom.window.close();
  }
});

test("la grilla de inmuebles añade Ocupación con el contacto principal debajo", () => {
  const f = fixture();
  try {
    f.state.properties.push(
      detailProperty("p-owner", {
        occupancy: "owner",
        residentOwnerIds: ["o1"],
        primaryResidentId: "o1",
      }),
      detailProperty("p-vacant", { occupancy: "vacant", primaryResidentId: "" }),
    );
    f.ui.renderProperties();
    const column = f.calls.tableColumns.find((item) => item.key === "occupancy");
    assert.equal(column.label, "Ocupación");
    assert.equal(column.defaultVisible, true);
    const [owner, vacant] = f.state.properties;
    assert.equal(column.value(owner), "Vive el propietario · Ana Prueba");
    const ownerCell = column.render(owner);
    assert.match(ownerCell.textContent, /Vive el propietario/);
    assert.match(ownerCell.textContent, /Ana Prueba/);
    assert.match(ownerCell.querySelector(".status-badge").className, /doc-approved/);
    const vacantCell = column.render(vacant);
    assert.equal(vacantCell.textContent, "Sin ocupante");
    assert.equal(vacantCell.querySelector("small"), null);
    assert.match(vacantCell.querySelector(".status-badge").className, /doc-pending-admin/);
  } finally {
    f.dom.window.close();
  }
});
