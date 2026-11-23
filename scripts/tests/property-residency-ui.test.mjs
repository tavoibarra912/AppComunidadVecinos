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
  const calls = { tenantEditor: [], toasts: [], properties: [], validationErrors: [] };
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
    createDataTable: () => ({ refresh: noop }),
    createExportDropdown: noop,
    createRichText: () => ({ setValue: noop }),
    __crypto: { randomUUID: () => "property-created" },
  });

  const ui = vm.runInContext(
    `(() => { const crypto = window.__crypto; ${source}\nreturn { openPropertyEditor }; })()`,
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
    assert.equal(
      residentChoice.closest(".property-editor-pane").firstElementChild,
      residentChoice,
    );
    assert.match(residentChoice.textContent, /Ocupación del inmueble/);
    assert.match(residentChoice.textContent, /no se crea ningún contrato/);
    assert.match(residentChoice.textContent, /primer propietario/);
    assert.equal(form.querySelector('input[name="initialResident"][value="owner"]').checked, true);
    form.querySelector(`input[name="initialResident"][value="${choice}"]`).checked = true;
    form.dispatchEvent(new f.window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    return f;
  } catch (error) {
    f.dom.window.close();
    throw error;
  }
}

test("el propietario es la opción inicial y no genera automáticamente un inquilino", async () => {
  const f = await saveNewProperty("owner");
  try {
    assert.equal(f.calls.properties.length, 1);
    assert.equal(f.calls.tenantEditor.length, 0);
    f.ui.openPropertyEditor("property-created");
    assert.equal(f.window.document.querySelector("#property-initial-resident").hidden, true);
  } finally {
    f.dom.window.close();
  }
});

test("otra persona abre el alta de inquilino con propietario e inmueble preseleccionados", async () => {
  const f = await saveNewProperty("other");
  try {
    assert.equal(f.calls.properties.length, 1);
    assert.deepEqual(f.calls.tenantEditor[0], [null, "o1", false, "general", "property-created"]);
    assert.match(f.calls.toasts[f.calls.toasts.length - 1], /Inmueble creado/);
  } finally {
    f.dom.window.close();
  }
});

test("no guarda la opción de otra persona si falta permiso para crear inquilinos", async () => {
  const f = await saveNewProperty("other", false);
  try {
    assert.equal(f.calls.properties.length, 0);
    assert.deepEqual(f.calls.tenantEditor, []);
    assert.match(f.calls.validationErrors[0][0], /No tienes permiso para crear un inquilino/);
  } finally {
    f.dom.window.close();
  }
});
