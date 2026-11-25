import { openCascadeWizard } from "./cascade-wizard.js";
import { sanitizeHtml, richTextHtml } from "../html.js";
import { api } from "../api.js";
import {
  state,
  refreshState,
  ownerProperties,
  ownerTenants,
  tenantsForProperty,
  getTenantContractStatus,
  propertyOwnerIds,
  PROPERTY_TYPE_LABELS,
  PROPERTY_USE_LABELS,
  getCurrencies,
  hasPermission,
  requirePermission,
} from "../state.js";
import {
  toast,
  isValidCadastralRef,
  isValidDecimal,
  makeSelectSearchable,
  showValidationErrors,
  limpiarGuardia,
  intentarCerrar,
  setFormReadonly,
} from "../utils.js";
import { createDocumentLibrary } from "../document-library.js";
import { setupTerritory, getLocationById, isValidPostalCode } from "../territory.js";
import { createDataTable } from "../table.js";
import { createExportDropdown } from "../export-client.js";
import { createRichText } from "../rich-text.js";
import { openOwnerDetail, openOwnerEditor, addPropertyToOwnerEditor } from "./propietarios.js";
import { openTenantDetail, openTenantEditor } from "./inquilinos.js";
import { openCommunityEditor, refreshCommunityEditorAfterPropertySave } from "./comunidades.js";
import { openCommunicationComposer } from "./communication.js";

// Diálogo de eliminación de Inmuebles
const propertyDeleteDialog = document.querySelector("#property-delete-dialog");
const confirmPropertyDeleteBtn = document.querySelector("#confirm-property-delete");
const cancelPropertyDeleteBtn = document.querySelector("#cancel-property-delete-btn");

// Elementos de Inmuebles
const newPropertyBtn = document.querySelector("#new-property");
const propertySearch = document.querySelector("#search-properties");
const propertyResultCount = document.querySelector("#property-result-count");
const propertyDialog = document.querySelector("#property-dialog");
const propertyForm = document.querySelector("#property-form");
// Control territorial unificado: municipio → provincia → código postal.
const propertyTerritory = setupTerritory(propertyForm);
// Observaciones con formato (mismo editor que usa la ficha de comunidad).
const propertyNotes = createRichText({
  editor: document.querySelector("#property-notes-editor"),
  input: propertyForm.elements.notes,
  toolbar: document.querySelector("#property-notes-toolbar"),
});
const propertyFormError = document.querySelector("#property-form-error");
const propertyInitialResidentStep = document.querySelector("#property-initial-resident");
const propertyDocumentList = document.querySelector("#property-document-list");
const propertyDetailDialog = document.querySelector("#property-detail-dialog");
const propertyDetailDocuments = document.querySelector("#property-detail-documents");

let propertyTable = null;

const ICON_INFO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DOCS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const ICON_CASCADE_DELETE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h12M13 6v3M5 6v14a1 1 0 0 0 1 1h4M7 6V4h4v2"/><path d="M8 10v7"/><path d="M15 12h7M17 10v4M12 18h10M19 16v4"/></svg>`;

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = sanitizeHtml(svg);
  return btn;
}

// Estado en edición del formulario de inmueble (tabs Propietarios/Inquilinos)
const editingPropertyPeople = { ownerIds: [], tenantIds: [] };
let initialPropertyTenantIds = [];
// % de titularidad por propietario del inmueble en edición
let editingOwnerPercentages = {};
// El editor de inmueble se abre en modo lectura desde «Ver inmueble».
let propertyDialogReadOnly = false;
// Ocupación del inmueble en edición: owner | tenant | vacant.
let editingOccupancy = "owner";
// Copropietarios que residen realmente en el inmueble (subconjunto de ownerIds).
let editingResidentOwnerIds = [];
// Contacto principal de los avisos del inmueble (propietario o inquilino).
let editingPrimaryResidentId = "";

function selectedPropertyCommunityId() {
  return propertyForm.elements.communityId?.value || "";
}

function normalizeCadastralRef(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Comunidades conocidas de un propietario (principal + inmuebles vinculados). */
function ownerCommunityIds(owner) {
  const ids = new Set();
  if (owner?.communityId) ids.add(owner.communityId);
  ownerProperties(owner).forEach((property) => {
    if (property.communityId) ids.add(property.communityId);
  });
  return ids;
}

/**
 * Un propietario pertenece a la comunidad si tiene algún inmueble en ella.
 * Los propietarios todavía sin comunidad (altas nuevas) se pueden asociar.
 */
function ownerBelongsToCommunity(owner, communityId) {
  if (!communityId || !owner) return false;
  const ids = ownerCommunityIds(owner);
  return ids.size === 0 || ids.has(communityId);
}

/**
 * Un inquilino pertenece a la comunidad del inmueble donde tiene el contrato.
 * Si aún no tiene inmueble, podrá vincularse al inmueble seleccionado.
 */
function tenantBelongsToCommunity(tenant, communityId) {
  if (!communityId || !tenant) return false;
  if (!tenant.propertyId) return true;
  const property = state.properties.find((item) => item.id === tenant.propertyId);
  return !property || property.communityId === communityId;
}

/** Quita del editor las personas que dejan de pertenecer a la comunidad. */
function prunePropertyPeopleForCommunity(communityId) {
  if (!communityId) return 0;
  const validOwnerIds = editingPropertyPeople.ownerIds.filter((ownerId) => {
    const owner = state.owners.find((item) => item.id === ownerId);
    return owner && ownerBelongsToCommunity(owner, communityId);
  });
  const removedOwners = editingPropertyPeople.ownerIds.length - validOwnerIds.length;
  editingPropertyPeople.ownerIds = validOwnerIds;
  Object.keys(editingOwnerPercentages).forEach((ownerId) => {
    if (!validOwnerIds.includes(ownerId)) delete editingOwnerPercentages[ownerId];
  });

  const validTenantIds = editingPropertyPeople.tenantIds.filter((tenantId) => {
    const owner = state.owners.find((item) =>
      ownerTenants(item).some((tenant) => tenant.id === tenantId),
    );
    const tenant = owner ? ownerTenants(owner).find((item) => item.id === tenantId) : null;
    return (
      tenant &&
      validOwnerIds.includes(tenant.ownerId) &&
      tenantBelongsToCommunity(tenant, communityId)
    );
  });
  const removedTenants = editingPropertyPeople.tenantIds.length - validTenantIds.length;
  editingPropertyPeople.tenantIds = validTenantIds;
  return removedOwners + removedTenants;
}

function handlePropertyCommunityChange() {
  const removed = prunePropertyPeopleForCommunity(selectedPropertyCommunityId());
  renderPropertyOwnersTab();
  renderPropertyTenantsTab();
  if (removed > 0) {
    toast(
      "Se quitaron los propietarios o inquilinos que no pertenecían a la comunidad seleccionada.",
    );
  }
}

/**
 * El coeficiente es un porcentaje: se descartan letras y símbolos y solo se
 * admite un separador decimal con hasta cuatro decimales.
 */
function sanitizeCoefficientInput() {
  const input = propertyForm.elements.participationCoef;
  if (!input) return;
  const cleaned = input.value.replace(/[^\d.,]/g, "");
  const separatorIndex = cleaned.search(/[.,]/);
  let value = cleaned;
  if (separatorIndex !== -1) {
    const integer = cleaned.slice(0, separatorIndex).replace(/[^\d]/g, "");
    const decimals = cleaned
      .slice(separatorIndex + 1)
      .replace(/[^\d]/g, "")
      .slice(0, 4);
    value = `${integer}${cleaned[separatorIndex]}${decimals}`;
  }
  if (value !== input.value) input.value = value;
}

propertyForm.elements.participationCoef?.addEventListener("input", sanitizeCoefficientInput);

function populatePropertyCurrencySelect(selected) {
  const select = propertyForm.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach((currency) => select.add(new Option(currency.name, currency.code)));
  select.value = selected || state.settings?.monedaPorDefecto || "EUR";
}

/** Titularidad disponible del inmueble en edición para un propietario NUEVO. */
function propertyOwnerCapacity() {
  const used = editingPropertyPeople.ownerIds.reduce(
    (sum, ownerId) => sum + (Number(editingOwnerPercentages[ownerId]) || 0),
    0,
  );
  return Math.max(0, Math.round((100 - used) * 10000) / 10000);
}

function switchPropertyEditorTab(tab) {
  document.querySelectorAll(".community-editor-tab[data-property-tab]").forEach((btn) => {
    const active = btn.dataset.propertyTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".property-editor-pane[data-property-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.propertyPane !== tab;
  });
}

document.querySelectorAll(".community-editor-tab[data-property-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchPropertyEditorTab(btn.dataset.propertyTab));
});

/**
 * La pestaña Inquilinos solo tiene sentido cuando el inmueble lo ocupa otra persona: si vive
 * el propietario no hay contrato que asociar. En inmuebles ya creados la pregunta no se
 * muestra, así que la pestaña queda siempre disponible.
 */
function syncPropertyResidencyTab() {
  const tab = document.querySelector('.community-editor-tab[data-property-tab="tenants"]');
  if (!tab) return;
  const asksResident = !!propertyInitialResidentStep && !propertyInitialResidentStep.hidden;
  // Solo hay contratos que asociar cuando el inmueble lo ocupa otra persona.
  const disabled = asksResident && editingOccupancy !== "tenant";
  tab.disabled = disabled;
  tab.setAttribute("aria-disabled", String(disabled));
  tab.title = disabled ? "Marca «Vive otra persona» para asociar inquilinos al inmueble." : "";
  if (disabled && tab.classList.contains("active")) switchPropertyEditorTab("owners");
}

propertyForm.addEventListener("change", (event) => {
  if (event.target?.matches?.('input[name="initialResident"]'))
    setPropertyOccupancy(event.target.value);
});

/**
 * La ocupación se marca sobre las personas ya vinculadas al inmueble: los
 * propietarios de la pestaña Propietarios o los inquilinos de la pestaña
 * Inquilinos. No crea listas ni fichas nuevas.
 */
function setPropertyOccupancy(value) {
  editingOccupancy = value === "other" ? "tenant" : value === "vacant" ? "vacant" : "owner";
  if (editingOccupancy === "owner") {
    // Con un único titular no hay ambigüedad; con varios, no se inventa que
    // todos residen: se conservan las marcas y el usuario decide quién habita.
    const owners = editingPropertyPeople.ownerIds;
    const kept = editingResidentOwnerIds.filter((ownerId) => owners.includes(ownerId));
    editingResidentOwnerIds = kept.length ? kept : owners.length === 1 ? [owners[0]] : [];
    if (!editingResidentOwnerIds.includes(editingPrimaryResidentId))
      editingPrimaryResidentId = editingResidentOwnerIds[0] || "";
  } else {
    editingResidentOwnerIds = [];
    editingPrimaryResidentId =
      editingOccupancy === "tenant" ? editingPropertyPeople.tenantIds[0] || "" : "";
  }
  renderPropertyOwnersTab();
  renderPropertyTenantsTab();
  syncPropertyResidencyTab();
}

const ICON_UNLINK_SM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
// Icono de "ver" real (ojo) para los botones de acción de inmuebles.
const ICON_VIEW = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

/**
 * El permiso específico permite guardar un inmueble sin titulares; el resto de
 * roles debe asociar al menos un propietario. Un inmueble heredado que ya no
 * tiene titulares también puede guardarse para poder repararlo.
 */
function propertyOwnerAssignmentOptional() {
  if (hasPermission("property:create:unassigned")) return true;
  const editing = state.properties.find((property) => property.id === state.ui.editingPropertyId);
  return !!editing && propertyOwnerIds(editing).length === 0;
}

/** Ajusta los textos de obligatoriedad de titulares al permiso del usuario. */
function syncPropertyOwnerRequirement() {
  const optional = propertyOwnerAssignmentOptional();
  const intro = document.querySelector("#property-form-intro");
  if (intro)
    intro.textContent = optional
      ? "La comunidad y la dirección son obligatorios. Puedes guardar el inmueble sin propietarios y asignarlos más adelante; los inquilinos y documentos son opcionales."
      : "La comunidad, al menos un propietario y la dirección son obligatorios. Los inquilinos y documentos son opcionales.";
  const requirement = document.querySelector("#property-owners-requirement");
  if (requirement)
    requirement.textContent = optional
      ? "Asocia propietarios existentes, crea nuevos o desvincula los que ya no correspondan. Con tu permiso, el inmueble puede guardarse sin titulares."
      : "Asocia propietarios existentes, crea nuevos o desvincula los que ya no correspondan. Debe quedar al menos uno asociado.";
}

function renderPropertyOwnersTab() {
  const listEl = document.querySelector("#property-owners-list");
  const countEl = document.querySelector("#property-owner-count");
  if (!listEl) return;
  const ownerIds = editingPropertyPeople.ownerIds;
  // Un titular desvinculado deja de ser residente sin conservar marcas huérfanas.
  editingResidentOwnerIds = editingResidentOwnerIds.filter((id) => ownerIds.includes(id));
  if (
    editingPrimaryResidentId &&
    ![...editingResidentOwnerIds, ...editingPropertyPeople.tenantIds].includes(
      editingPrimaryResidentId,
    )
  )
    editingPrimaryResidentId = editingResidentOwnerIds[0] || "";
  if (countEl) countEl.textContent = String(ownerIds.length);
  listEl.replaceChildren();
  const panel = document.querySelector("#property-owner-link-panel");
  if (panel) panel.hidden = true;

  const capacity = propertyOwnerCapacity();
  const atFullCapacity = capacity <= 0;
  // Los botones siguen habilitados: al intentar vincular se explica cómo
  // hacer lugar (bajando el % de los propietarios actuales)
  for (const note of listEl.parentElement.querySelectorAll(".property-owners-capacity-note"))
    note.remove();
  const assigned =
    Math.round(
      ownerIds.reduce((sum, ownerId) => sum + (Number(editingOwnerPercentages[ownerId]) || 0), 0) *
        10000,
    ) / 10000;
  // La titularidad parcial es válida, pero debe verse: el porcentaje sin
  // asignar no se reparte entre los titulares ni cambia la cuota del inmueble.
  if (ownerIds.length && assigned > 0 && assigned < 100) {
    const note = document.createElement("p");
    note.className = "form-intro property-owners-capacity-note";
    note.textContent = `Titularidad asignada: ${assigned}%. Queda ${
      Math.round((100 - assigned) * 10000) / 10000
    }% sin asignar. El porcentaje restante no se reparte automáticamente entre los titulares.`;
    listEl.parentElement.insertBefore(note, listEl);
  }
  if (atFullCapacity) {
    const note = document.createElement("p");
    note.className = "form-intro property-owners-capacity-note";
    note.textContent =
      "La titularidad de este inmueble ya suma 100%. Para agregar otro propietario, baja primero el porcentaje de alguno de los actuales.";
    listEl.parentElement.insertBefore(note, listEl);
  }

  if (ownerIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = propertyOwnerAssignmentOptional()
      ? "No hay propietarios asociados. Puedes guardar el inmueble sin titulares y asignarlos más adelante."
      : "No hay propietarios asociados. Asocia al menos uno antes de guardar.";
    listEl.append(empty);
    return;
  }

  ownerIds.forEach((ownerId) => {
    const owner = state.owners.find((o) => o.id === ownerId);
    if (!owner) return;
    const communityName =
      state.communities.find((c) => c.id === owner.communityId)?.name ||
      owner.communityName ||
      "Sin comunidad";

    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";
    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${owner.name} ${owner.surname} (${owner.dni})`;
    const isResident = editingOccupancy === "owner" && editingResidentOwnerIds.includes(ownerId);
    const isPrimary = editingOccupancy === "owner" && editingPrimaryResidentId === ownerId;
    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    sub.textContent = `Comunidad: ${communityName}${isResident ? " · Reside" : ""}${isPrimary ? " · Contacto principal" : ""}`;
    info.append(title, sub);

    const pctWrap = document.createElement("label");
    pctWrap.className = "owner-property-pct";
    const pctInput = document.createElement("input");
    pctInput.type = "number";
    pctInput.min = "0";
    pctInput.max = "100";
    pctInput.step = "0.0001";
    pctInput.inputMode = "decimal";
    pctInput.value = String(editingOwnerPercentages[ownerId] ?? 100);
    pctInput.title = "Porcentaje de titularidad de este propietario sobre el inmueble";
    pctInput.setAttribute(
      "aria-label",
      `Porcentaje de titularidad de ${owner.name} ${owner.surname}`,
    );
    pctInput.disabled = propertyDialogReadOnly;
    pctInput.addEventListener("change", () => {
      let value = Number(pctInput.value.replace(",", "."));
      const previous = editingOwnerPercentages[ownerId] ?? 100;
      if (!Number.isFinite(value) || value <= 0) {
        pctInput.value = String(previous);
        toast(
          "Un propietario vinculado debe tener un porcentaje de titularidad mayor a 0. Si no es titular, desvinculalo.",
        );
        return;
      }
      const others = editingPropertyPeople.ownerIds
        .filter((id) => id !== ownerId)
        .reduce((sum, id) => sum + (Number(editingOwnerPercentages[id]) || 0), 0);
      const maxForThis = Math.max(0, Math.round((100 - others) * 10000) / 10000);
      if (value > maxForThis) {
        value = maxForThis;
        toast(
          `La suma de titularidades no puede superar el 100%: máximo ${maxForThis}% para este propietario.`,
        );
      }
      pctInput.value = String(value);
      editingOwnerPercentages[ownerId] = value;
      renderPropertyOwnersTab();
    });
    pctWrap.append(pctInput, document.createTextNode("%"));
    info.append(pctWrap);

    let residentToggle = null;
    if (!propertyDialogReadOnly && editingOccupancy === "owner") {
      residentToggle = document.createElement("label");
      residentToggle.className = "property-resident-toggle";
      const residentInput = document.createElement("input");
      residentInput.type = "checkbox";
      residentInput.checked = isResident;
      residentInput.setAttribute(
        "aria-label",
        `${owner.name} ${owner.surname} reside en el inmueble`,
      );
      residentInput.addEventListener("change", () => {
        if (residentInput.checked) {
          editingResidentOwnerIds = [...new Set([...editingResidentOwnerIds, ownerId])];
          if (!editingResidentOwnerIds.includes(editingPrimaryResidentId))
            editingPrimaryResidentId = ownerId;
        } else {
          editingResidentOwnerIds = editingResidentOwnerIds.filter((id) => id !== ownerId);
          if (editingPrimaryResidentId === ownerId)
            editingPrimaryResidentId = editingResidentOwnerIds[0] || "";
        }
        renderPropertyOwnersTab();
      });
      residentToggle.append(
        residentInput,
        document.createTextNode("Este propietario vive en el inmueble"),
      );

      if (isResident && editingResidentOwnerIds.length > 1) {
        const primaryToggle = document.createElement("label");
        primaryToggle.className = "property-resident-toggle";
        const primaryInput = document.createElement("input");
        primaryInput.type = "radio";
        primaryInput.name = "propertyPrimaryResident";
        primaryInput.checked = editingPrimaryResidentId === ownerId;
        primaryInput.setAttribute(
          "aria-label",
          `${owner.name} ${owner.surname} es el contacto principal`,
        );
        primaryInput.addEventListener("change", () => {
          editingPrimaryResidentId = ownerId;
          renderPropertyOwnersTab();
        });
        primaryToggle.append(primaryInput, document.createTextNode("Contacto principal"));
        info.append(primaryToggle);
      }
    }

    if (propertyDialogReadOnly) {
      card.append(info);
      listEl.append(card);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = iconBtn(
      "btn-info",
      "Ver propietario",
      `Ver propietario ${owner.name} ${owner.surname}`,
      ICON_VIEW,
    );
    viewBtn.addEventListener("click", () => openOwnerDetail(owner.id));

    const unlinkBtn = iconBtn(
      "btn-delete",
      "Desvincular propietario",
      `Desvincular ${owner.name} ${owner.surname}`,
      ICON_UNLINK_SM,
    );
    unlinkBtn.addEventListener("click", () => {
      editingPropertyPeople.ownerIds = editingPropertyPeople.ownerIds.filter(
        (id) => id !== ownerId,
      );
      delete editingOwnerPercentages[ownerId];
      editingResidentOwnerIds = editingResidentOwnerIds.filter((id) => id !== ownerId);
      if (editingPrimaryResidentId === ownerId)
        editingPrimaryResidentId = editingResidentOwnerIds[0] || "";
      const validTenantIds = state.owners
        .filter((o) => editingPropertyPeople.ownerIds.includes(o.id))
        .flatMap((o) => ownerTenants(o).map((t) => t.id));
      editingPropertyPeople.tenantIds = editingPropertyPeople.tenantIds.filter((id) =>
        validTenantIds.includes(id),
      );
      renderPropertyOwnersTab();
      renderPropertyTenantsTab();
    });

    if (residentToggle) actions.append(residentToggle);
    actions.append(viewBtn, unlinkBtn);
    card.append(info, actions);
    listEl.append(card);
  });
}

function renderPropertyTenantsTab() {
  const listEl = document.querySelector("#property-tenants-list");
  const countEl = document.querySelector("#property-tenant-count");
  if (!listEl) return;
  const tenantIds = editingPropertyPeople.tenantIds;
  if (
    editingOccupancy === "tenant" &&
    editingPrimaryResidentId &&
    !tenantIds.includes(editingPrimaryResidentId) &&
    !editingResidentOwnerIds.includes(editingPrimaryResidentId)
  )
    editingPrimaryResidentId = tenantIds[0] || "";
  if (countEl) countEl.textContent = String(tenantIds.length);
  listEl.replaceChildren();
  const panel = document.querySelector("#property-tenant-link-panel");
  if (panel) panel.hidden = true;

  if (tenantIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent =
      "No hay inquilinos asociados. Opcional: asocia inquilinos de los propietarios vinculados.";
    listEl.append(empty);
    return;
  }

  tenantIds.forEach((tenantId) => {
    const owner = state.owners.find((o) => ownerTenants(o).some((t) => t.id === tenantId));
    const tenant = owner ? ownerTenants(owner).find((t) => t.id === tenantId) : null;
    if (!tenant) return;

    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";
    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${tenant.name} ${tenant.surname}`;
    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    sub.textContent = `Contrato ${getTenantContractStatus(tenant)} · Arrendador: ${owner.name} ${owner.surname}${editingOccupancy === "tenant" ? " · Reside" : ""}${editingOccupancy === "tenant" && editingPrimaryResidentId === tenantId ? " · Contacto principal" : ""}`;
    info.append(title, sub);

    if (!propertyDialogReadOnly && editingOccupancy === "tenant" && tenantIds.length > 1) {
      const primaryToggle = document.createElement("label");
      primaryToggle.className = "property-resident-toggle";
      const primaryInput = document.createElement("input");
      primaryInput.type = "radio";
      primaryInput.name = "propertyPrimaryResident";
      primaryInput.checked = editingPrimaryResidentId === tenantId;
      primaryInput.setAttribute(
        "aria-label",
        `${tenant.name} ${tenant.surname} es el contacto principal`,
      );
      primaryInput.addEventListener("change", () => {
        editingPrimaryResidentId = tenantId;
        renderPropertyTenantsTab();
      });
      primaryToggle.append(primaryInput, document.createTextNode("Contacto principal"));
      info.append(primaryToggle);
    }

    if (propertyDialogReadOnly) {
      card.append(info);
      listEl.append(card);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = iconBtn(
      "btn-info",
      "Ver inquilino",
      `Ver inquilino ${tenant.name} ${tenant.surname}`,
      ICON_VIEW,
    );
    viewBtn.addEventListener("click", () => openTenantDetail(owner.id, tenant.id));

    const unlinkBtn = iconBtn(
      "btn-delete",
      "Desvincular inquilino",
      `Desvincular ${tenant.name} ${tenant.surname}`,
      ICON_UNLINK_SM,
    );
    unlinkBtn.addEventListener("click", () => {
      if (!requirePermission("tenant:manage", tenantId)) return;
      editingPropertyPeople.tenantIds = editingPropertyPeople.tenantIds.filter(
        (id) => id !== tenantId,
      );
      if (editingPrimaryResidentId === tenantId)
        editingPrimaryResidentId = editingPropertyPeople.tenantIds[0] || "";
      renderPropertyTenantsTab();
    });

    actions.append(viewBtn);
    if (hasPermission("tenant:manage", tenantId)) actions.append(unlinkBtn);
    card.append(info, actions);
    listEl.append(card);
  });
}

function openPropertyOwnerLinkPanel() {
  const panel = document.querySelector("#property-owner-link-panel");
  const select = document.querySelector("#property-owner-link-select");
  if (!panel || !select) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    select.replaceChildren();
    const selectedCommunityId = selectedPropertyCommunityId();
    if (!selectedCommunityId) {
      select.add(new Option("Selecciona primero la comunidad del inmueble", ""));
      return;
    }
    if (propertyOwnerCapacity() <= 0) {
      select.add(new Option("La titularidad del inmueble ya alcanzó el 100%", ""));
      return;
    }
    const available = state.owners.filter(
      (owner) =>
        !editingPropertyPeople.ownerIds.includes(owner.id) &&
        ownerBelongsToCommunity(owner, selectedCommunityId),
    );
    if (available.length === 0) {
      select.add(new Option("No hay propietarios disponibles en esta comunidad", ""));
    } else {
      select.add(new Option("Selecciona un propietario…", ""));
      [...available]
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .forEach((owner) => {
          const comm = state.communities.find((c) => c.id === owner.communityId);
          select.add(
            new Option(
              `${owner.name} ${owner.surname} (${owner.dni}) · ${comm ? comm.name : "Sin comunidad"}`,
              owner.id,
            ),
          );
        });
    }
  }
}

function openPropertyTenantLinkPanel() {
  const panel = document.querySelector("#property-tenant-link-panel");
  const select = document.querySelector("#property-tenant-link-select");
  if (!panel || !select) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    select.replaceChildren();
    const selectedCommunityId = selectedPropertyCommunityId();
    if (!selectedCommunityId) {
      select.add(new Option("Selecciona primero la comunidad del inmueble", ""));
      return;
    }
    const candidates = state.owners
      .filter(
        (owner) =>
          editingPropertyPeople.ownerIds.includes(owner.id) &&
          ownerBelongsToCommunity(owner, selectedCommunityId),
      )
      .flatMap((owner) =>
        ownerTenants(owner).map((tenant) => ({
          ...tenant,
          ownerName: `${owner.name} ${owner.surname}`,
        })),
      )
      .filter(
        (tenant) =>
          !editingPropertyPeople.tenantIds.includes(tenant.id) &&
          hasPermission("tenant:manage", tenant.id) &&
          (!tenant.propertyId ||
            tenant.propertyId === state.ui.editingPropertyId ||
            hasPermission("property:manage", tenant.propertyId)) &&
          tenantBelongsToCommunity(tenant, selectedCommunityId),
      );
    if (candidates.length === 0) {
      select.add(new Option("No hay inquilinos disponibles en esta comunidad", ""));
    } else {
      select.add(new Option("Selecciona un inquilino…", ""));
      candidates.forEach((tenant) => {
        select.add(
          new Option(
            `${tenant.name} ${tenant.surname} · Arrendador: ${tenant.ownerName}`,
            tenant.id,
          ),
        );
      });
    }
  }
}

const btnLinkOwner = document.querySelector("#btn-property-link-owner");
if (btnLinkOwner) btnLinkOwner.addEventListener("click", openPropertyOwnerLinkPanel);
const btnLinkTenant = document.querySelector("#btn-property-link-tenant");
if (btnLinkTenant) btnLinkTenant.addEventListener("click", openPropertyTenantLinkPanel);

const btnConfirmOwner = document.querySelector("#btn-property-confirm-owner");
if (btnConfirmOwner) {
  btnConfirmOwner.addEventListener("click", () => {
    const ownerId = document.querySelector("#property-owner-link-select")?.value;
    if (!ownerId) {
      toast("Selecciona un propietario.");
      return;
    }
    const owner = state.owners.find((item) => item.id === ownerId);
    if (!ownerBelongsToCommunity(owner, selectedPropertyCommunityId())) {
      toast("El propietario seleccionado no pertenece a la comunidad del inmueble.");
      return;
    }
    const capacity = propertyOwnerCapacity();
    if (capacity <= 0) {
      toast(
        "La titularidad del inmueble ya está completa (100%). Baja el porcentaje de algún propietario para agregar otro.",
      );
      return;
    }
    editingPropertyPeople.ownerIds.push(ownerId);
    editingOwnerPercentages[ownerId] = capacity;
    // Al dar de alta un inmueble ocupado por el propietario, el primer titular
    // pasa a ser el residente por defecto; se puede desmarcar o cambiar luego.
    if (editingOccupancy === "owner" && editingResidentOwnerIds.length === 0) {
      editingResidentOwnerIds = [ownerId];
      editingPrimaryResidentId = ownerId;
    }
    const panel = document.querySelector("#property-owner-link-panel");
    if (panel) panel.hidden = true;
    renderPropertyOwnersTab();
    if (propertyOwnerCapacity() <= 0) {
      toast("Propietario agregado. La titularidad del inmueble quedó completa (100%).");
    }
  });
}

const btnCancelOwner = document.querySelector("#btn-property-cancel-owner");
if (btnCancelOwner) {
  btnCancelOwner.addEventListener("click", () => {
    const panel = document.querySelector("#property-owner-link-panel");
    if (panel) panel.hidden = true;
  });
}

const btnConfirmTenant = document.querySelector("#btn-property-confirm-tenant");
if (btnConfirmTenant) {
  btnConfirmTenant.addEventListener("click", () => {
    const tenantId = document.querySelector("#property-tenant-link-select")?.value;
    if (!tenantId) {
      toast("Selecciona un inquilino.");
      return;
    }
    if (!requirePermission("tenant:manage", tenantId)) return;
    const owner = state.owners.find((item) =>
      ownerTenants(item).some((tenant) => tenant.id === tenantId),
    );
    const tenant = owner ? ownerTenants(owner).find((item) => item.id === tenantId) : null;
    if (!tenant || !tenantBelongsToCommunity(tenant, selectedPropertyCommunityId())) {
      toast("El inquilino seleccionado no pertenece a la comunidad del inmueble.");
      return;
    }
    editingPropertyPeople.tenantIds.push(tenantId);
    const panel = document.querySelector("#property-tenant-link-panel");
    if (panel) panel.hidden = true;
    renderPropertyTenantsTab();
  });
}

const btnCancelTenant = document.querySelector("#btn-property-cancel-tenant");
if (btnCancelTenant) {
  btnCancelTenant.addEventListener("click", () => {
    const panel = document.querySelector("#property-tenant-link-panel");
    if (panel) panel.hidden = true;
  });
}

// Crear propietario/inquilino nuevos desde el editor de inmueble.
// No se cierra el editor de inmueble: se conserva lo ya editado y la alta
// relacionada se abre apilada encima. Al guardar la entidad relacionada se
// vuelve al editor de inmueble con el vínculo ya hecho (inquilino) o listo
// para asociar desde el panel (propietario).
const btnAddOwner = document.querySelector("#btn-property-add-owner");
if (btnAddOwner) {
  btnAddOwner.addEventListener("click", () => {
    openOwnerEditor(null, "data");
    // nota: tras crear el propietario, el usuario lo asocia desde el panel de asociación
  });
}

const btnAddTenant = document.querySelector("#btn-property-add-tenant");
if (btnAddTenant) {
  btnAddTenant.addEventListener("click", () => {
    const targetPropertyId = state.ui.editingPropertyId;
    const linkedOwners = editingPropertyPeople.ownerIds;
    state.ui.editorReturnContext = {
      kind: "property-tenant",
      propertyId: targetPropertyId,
    };
    openTenantEditor(null, linkedOwners[0] || "", false, "general", targetPropertyId);
  });
}

/** Puebla el desplegable de comunidad del formulario de inmueble. */
function updatePropertyCommunitySelect(selectedId = "") {
  const select = propertyForm.elements.communityId;
  if (!select) return;
  const current = selectedId || select.value;
  select.replaceChildren(new Option("Selecciona una comunidad…", ""));
  state.communities.forEach((community) => select.add(new Option(community.name, community.id)));
  if (current) select.value = current;
}

export function updatePropertyPeopleSelectors(
  selectedOwnerIds = [],
  selectedTenantIds = [],
  selectedOwnerPercentages = {},
) {
  editingPropertyPeople.ownerIds = [...selectedOwnerIds];
  editingPropertyPeople.tenantIds = [...selectedTenantIds];
  editingOwnerPercentages = {};
  selectedOwnerIds.forEach((ownerId) => {
    editingOwnerPercentages[ownerId] = Number(selectedOwnerPercentages[ownerId] ?? 100);
  });
  renderPropertyOwnersTab();
  renderPropertyTenantsTab();
  const ownerPanel = document.querySelector("#property-owner-link-panel");
  const tenantPanel = document.querySelector("#property-tenant-link-panel");
  if (ownerPanel) ownerPanel.hidden = true;
  if (tenantPanel) tenantPanel.hidden = true;
}

const propertyDocumentsLibrary = propertyDocumentList
  ? createDocumentLibrary({
      container: propertyDocumentList,
      entityType: "property",
      category: "document",
      getEntityId: () => state.ui.editingPropertyId,
      getData: () => {
        const property = state.properties.find((item) => item.id === state.ui.editingPropertyId);
        return {
          documents: property?.documents || [],
          folders: property?.documentFolders || [],
        };
      },
      settings: () => state.settings,
      countEl: "#property-doc-count",
      canWrite: () =>
        !propertyDialogReadOnly &&
        !!state.ui.editingPropertyId &&
        hasPermission("property:manage", state.ui.editingPropertyId) &&
        hasPermission("document:upload", state.ui.editingPropertyId),
      onChange: refreshPropertyLibraries,
      emptyText:
        "Subí escrituras, certificados energéticos u otros archivos y organizalos en carpetas.",
    })
  : null;

const propertyDetailDocumentsLibrary = propertyDetailDocuments
  ? createDocumentLibrary({
      container: propertyDetailDocuments,
      entityType: "property",
      category: "document",
      getEntityId: () => state.ui.viewingPropertyId,
      getData: () => {
        const property = state.properties.find((item) => item.id === state.ui.viewingPropertyId);
        return {
          documents: property?.documents || [],
          folders: property?.documentFolders || [],
        };
      },
      settings: () => state.settings,
      countEl: "#property-detail-doc-count",
      canWrite: () => false,
      emptyText: "No hay documentación cargada.",
    })
  : null;

async function refreshPropertyLibraries() {
  await refreshState();
  propertyDocumentsLibrary?.refresh();
  propertyDetailDocumentsLibrary?.refresh();
}

/** Oculta todo lo que implique modificar o navegar desde el inmueble. */
function applyPropertyEditorReadOnly(readonly) {
  [
    "#btn-property-add-owner",
    "#btn-property-link-owner",
    "#btn-property-add-tenant",
    "#btn-property-link-tenant",
  ].forEach((selector) => {
    const button = document.querySelector(selector);
    if (button) button.hidden = readonly;
  });
  ["#property-owner-link-panel", "#property-tenant-link-panel"].forEach((selector) => {
    const panel = document.querySelector(selector);
    if (panel) panel.hidden = true;
  });
  const notifyBtn = document.querySelector("#btn-property-notify");
  if (notifyBtn) {
    const communityId =
      state.properties.find((item) => item.id === state.ui.editingPropertyId)?.communityId || "";
    notifyBtn.hidden =
      readonly || !state.ui.editingPropertyId || !hasPermission("comm:publicar", communityId);
  }
}

export function openPropertyEditor(id = null, defaultTab = "general", readonly = false) {
  if (
    !requirePermission(
      readonly ? "property:read" : id ? "property:manage" : "property:create",
      id || "",
    )
  )
    return;
  propertyDialogReadOnly = readonly;
  state.ui.editingPropertyId = id;
  propertyForm.dataset.editVersion = state.properties.find((item) => item.id === id)?.version || "";
  propertyForm.reset();
  propertyFormError.textContent = "";
  updatePropertyCommunitySelect();
  switchPropertyEditorTab(defaultTab);
  const property = state.properties.find((item) => item.id === id);
  // La pestaña Inquilinos depende de la ocupación ya al abrir el formulario,
  // antes de pintar las tarjetas de personas.
  editingOccupancy =
    property?.occupancy ||
    ((property?.tenantIds || (property?.tenantId ? [property.tenantId] : [])).length
      ? "tenant"
      : "owner");
  if (propertyInitialResidentStep) {
    // La sección de ocupación siempre está accesible al editar o crear,
    // salvo en modo solo lectura (no hay nada que cambiar).
    propertyInitialResidentStep.hidden = readonly;
  }
  syncPropertyResidencyTab();
  populatePropertyCurrencySelect(property?.currency || "EUR");
  const ownerIds = propertyOwnerIds(property);
  const tenantIds = property?.tenantIds || (property?.tenantId ? [property.tenantId] : []);
  initialPropertyTenantIds = [...tenantIds];
  updatePropertyPeopleSelectors(ownerIds, tenantIds, property?.ownerPercentages || {});
  // La ocupación se guarda en el inmueble; en fichas antiguas se deduce de los
  // contratos vigentes para no inventar un residente que nadie declaró.
  editingOccupancy = property?.occupancy || (tenantIds.length ? "tenant" : "owner");
  if (propertyForm.elements.initialResident) {
    propertyForm.elements.initialResident.value =
      editingOccupancy === "tenant" ? "other" : editingOccupancy === "vacant" ? "vacant" : "owner";
  }
  editingResidentOwnerIds =
    editingOccupancy === "owner" ? [...(property?.residentOwnerIds || [])] : [];
  editingPrimaryResidentId =
    editingOccupancy === "owner"
      ? property?.primaryResidentId || editingResidentOwnerIds[0] || ""
      : editingOccupancy === "tenant"
        ? property?.primaryResidentId || tenantIds[0] || ""
        : "";
  renderPropertyOwnersTab();
  renderPropertyTenantsTab();
  syncPropertyResidencyTab();
  syncPropertyOwnerRequirement();
  propertyForm.elements.receiptStatus.value = property?.receiptStatus || "current";
  propertyForm.elements.receiptStatus.closest("label").hidden = !!property?.hasFeeReceipts;
  propertyForm.elements.communityFee.closest("label").hidden = !!property?.hasFeeReceipts;
  let ledgerHint = propertyForm.querySelector("[data-fee-ledger-hint]");
  if (!ledgerHint) {
    ledgerHint = document.createElement("p");
    ledgerHint.dataset.feeLedgerHint = "";
    ledgerHint.className = "form-intro full";
  }
  // El aviso se lee antes que los importes: queda arriba de Moneda y Coeficiente.
  propertyForm.querySelector('[data-property-pane="finance"] .form-grid')?.prepend(ledgerHint);
  ledgerHint.hidden = !property?.hasFeeReceipts;
  ledgerHint.textContent =
    "La cuota y el estado de los pagos se calculan a partir de los recibos. Gestiona los cobros desde el menú Cuotas, seleccionando la comunidad.";
  propertyForm.elements.propertyType.value = property?.propertyType || "";
  if (property) {
    [
      "communityId",
      "plot",
      "address",
      "cadastralRef",
      "registryNumber",
      "floor",
      "door",
      "staircase",
      "areaM2",
      "participationCoef",
      "propertyUse",
      "energyCertificate",
      "communityFee",
      "notes",
    ].forEach((key) => {
      if (propertyForm.elements[key]) {
        propertyForm.elements[key].value = property[key] || "";
      }
    });
    propertyTerritory?.set(property.city, property.province, property.postalCode);
  }
  propertyNotes?.setValue(propertyForm.elements.notes.value || "");
  document.querySelector("#property-dialog-title").textContent = property
    ? readonly
      ? `Ver inmueble: ${property.plot}`
      : "Editar inmueble"
    : "Nuevo inmueble";
  setFormReadonly(propertyForm, readonly);
  applyPropertyEditorReadOnly(readonly);
  propertyDocumentsLibrary?.setEntity(state.ui.editingPropertyId);
  propertyDialog.showModal();
  if (!readonly) {
    propertyForm.elements.plot.focus();
  }
}

export function closePropertyEditor() {
  propertyDialog.close();
  propertyDialogReadOnly = false;
  state.ui.editingPropertyId = null;
  propertyDocumentsLibrary?.setEntity("");
}

/**
 * Aplica el contexto de retorno tras crear una entidad relacionada desde el
 * editor de inmuebles (por ejemplo, un inquilino dado de alta desde la pestaña
 * Inquilinos).
 *
 * Si hay un contexto pendiente y coincide con el inmueble que aún se está
 * editando, vincula la entidad creada a ese inmueble y refresca la pestaña
 * correspondiente, de modo que al volver al formulario del inmueble el vínculo
 * ya quede reflejado sin haber cerrado ni perdido los datos del padre.
 * Devuelve true si se aplicó el vínculo.
 */
export function applyEditorReturnContext(savedChild) {
  const ctx = state.ui.editorReturnContext;
  state.ui.editorReturnContext = null;
  if (!ctx || !savedChild || !savedChild.id) return false;
  if (ctx.kind !== "property-tenant" || !ctx.propertyId) return false;
  // Solo aplica si seguimos editando el mismo inmueble que originó la alta
  if (state.ui.editingPropertyId !== ctx.propertyId) return false;
  const property = state.properties.find((p) => p.id === ctx.propertyId);
  if (!property) return false;
  const tenant = state.tenants.find((t) => t.id === savedChild.id) || savedChild;
  const owner = state.owners.find((o) => ownerTenants(o).some((t) => t.id === tenant.id));
  if (
    !owner ||
    !editingPropertyPeople.ownerIds.includes(owner.id) ||
    !tenantBelongsToCommunity(tenant, property.communityId)
  ) {
    return false;
  }
  if (!editingPropertyPeople.tenantIds.includes(tenant.id)) {
    editingPropertyPeople.tenantIds.push(tenant.id);
  }
  renderPropertyTenantsTab();
  return true;
}

export function visibleProperties() {
  return state.properties.filter((property) => hasPermission("property:read", property.id));
}

const PROPERTY_OCCUPANCY_LABELS = {
  owner: "Vive el propietario",
  tenant: "Vive otra persona",
  vacant: "Sin ocupante",
};

function propertyOccupancyLabel(property) {
  return PROPERTY_OCCUPANCY_LABELS[property?.occupancy] || "Sin especificar";
}

/** Nombre del contacto principal, sea propietario residente o inquilino. */
function propertyResidentName(id) {
  if (!id) return "";
  const owner = state.owners.find((item) => item.id === id);
  if (owner) return `${owner.name} ${owner.surname}`.trim();
  const tenant = state.tenants.find((item) => item.id === id);
  return tenant ? `${tenant.name} ${tenant.surname}`.trim() : "";
}

export function renderProperties() {
  if (newPropertyBtn) newPropertyBtn.hidden = !hasPermission("property:create");
  if (!propertyTable) {
    propertyTable = createDataTable({
      addButton: document.querySelector("#new-property"),
      mount: document.querySelector("#inmuebles-table"),
      storageKey: "inmuebles",
      searchInput: propertySearch,
      countEl: propertyResultCount,
      entitySingular: "inmueble",
      entityPlural: "inmuebles",
      emptyTitle: "No hay inmuebles que mostrar",
      emptyText: "Crea un inmueble o cambia los criterios de búsqueda.",
      getRows: () => visibleProperties(),
      columns: [
        {
          key: "community",
          label: "Comunidad",
          value: (property) => {
            const community = state.communities.find((item) => item.id === property.communityId);
            return community?.name || property.communityName || "Sin comunidad";
          },
          defaultVisible: true,
          render: (property) => {
            const community = state.communities.find((item) => item.id === property.communityId);
            const label = community?.name || property.communityName || "Sin comunidad";
            if (!community) return label;
            const link = document.createElement("button");
            link.type = "button";
            link.className = "text-link-button";
            link.textContent = label;
            link.addEventListener("click", () =>
              openCommunityEditor(community.id, "details", true),
            );
            return link;
          },
        },
        {
          key: "plot",
          label: "Inmueble",
          value: (property) => property.plot,
          defaultVisible: true,
          render: (property) => {
            const wrap = document.createElement("span");
            wrap.className = "community-name";
            wrap.textContent = `${property.plot || "Inmueble"} · ${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"}`;
            return wrap;
          },
        },
        {
          key: "address",
          label: "Dirección",
          value: (property) => property.address,
          defaultVisible: true,
        },
        {
          key: "city",
          label: "Municipio",
          value: (property) =>
            state.communities.find((item) => item.id === property.communityId)?.city || "",
          defaultVisible: true,
        },
        {
          key: "owners",
          label: "Propietario(s)",
          value: (property) => {
            const propOwnerIds = propertyOwnerIds(property);
            return (
              state.owners
                .filter((item) => propOwnerIds.includes(item.id))
                .map((o) => `${o.name} ${o.surname}`)
                .join(", ") || "Sin propietario"
            );
          },
          render: (property) => {
            const propOwnerIds = propertyOwnerIds(property);
            const linkedOwners = state.owners.filter((item) => propOwnerIds.includes(item.id));
            const cell = document.createElement("div");
            if (linkedOwners.length === 0) {
              cell.textContent = "Sin propietario";
              return cell;
            }
            linkedOwners.forEach((owner, idx) => {
              if (idx > 0) cell.append(", ");
              const ownerButton = document.createElement("button");
              ownerButton.type = "button";
              ownerButton.className = "text-link-button";
              ownerButton.textContent = `${owner.name} ${owner.surname}`;
              ownerButton.addEventListener("click", () =>
                openOwnerEditor(owner.id, "general", { readOnly: true }),
              );
              cell.append(ownerButton);
            });
            return cell;
          },
        },
        {
          key: "tenants",
          label: "Inquilino(s)",
          value: (property) =>
            tenantsForProperty(property.id)
              .map((item) => `${item.name} ${item.surname}`)
              .join(", ") || "Sin inquilino",
          render: (property) => {
            const linkedTenants = tenantsForProperty(property.id);
            const cell = document.createElement("div");
            if (linkedTenants.length === 0) {
              cell.textContent = "Sin inquilino";
              return cell;
            }
            linkedTenants.forEach((propertyTenant, idx) => {
              if (idx > 0) cell.append(", ");
              const tenantButton = document.createElement("button");
              tenantButton.type = "button";
              tenantButton.className = "text-link-button";
              tenantButton.textContent = `${propertyTenant.name} ${propertyTenant.surname}`;
              tenantButton.addEventListener("click", () =>
                openTenantEditor(propertyTenant.id, propertyTenant.ownerId, true),
              );
              cell.append(tenantButton);
            });
            return cell;
          },
        },
        {
          key: "occupancy",
          label: "Ocupación",
          value: (property) => {
            const contact = propertyResidentName(property.primaryResidentId);
            return [propertyOccupancyLabel(property), contact].filter(Boolean).join(" · ");
          },
          defaultVisible: true,
          render: (property) => {
            const wrap = document.createElement("div");
            wrap.className = "property-occupancy-cell";
            const badge = document.createElement("span");
            badge.className = `status-badge ${property.occupancy === "vacant" ? "doc-pending-admin" : "doc-approved"}`;
            badge.textContent = propertyOccupancyLabel(property);
            wrap.append(badge);
            const contact = propertyResidentName(property.primaryResidentId);
            if (contact) {
              const name = document.createElement("small");
              name.className = "community-property-sub";
              name.textContent = contact;
              wrap.append(name);
            }
            return wrap;
          },
        },
        {
          key: "receipts",
          label: "Estado recibos",
          value: (property) =>
            property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente",
          render: (property) => {
            const badge = document.createElement("span");
            badge.className = `status-badge ${property.receiptStatus === "pending" ? "doc-rejected" : "doc-approved"}`;
            badge.textContent =
              property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
            return badge;
          },
        },
        {
          key: "documents",
          label: "Documentación",
          value: (property) => String((property.documents || []).length),
        },
        {
          key: "actions",
          label: "Acciones",
          srOnlyLabel: true,
          defaultVisible: true,
          hideable: false,
          groupable: false,
          sortable: false,
          value: () => "",
          render: (property) => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnInfo = iconBtn("btn-info", "Ver inmueble", `Ver ${property.plot}`, ICON_VIEW);
            btnInfo.addEventListener("click", () =>
              openPropertyEditor(property.id, "general", true),
            );
            wrap.append(btnInfo);
            if (hasPermission("property:read", property.id)) {
              const btnDocs = iconBtn(
                "btn-docs",
                "Ver documentación",
                `Documentación de ${property.plot}`,
                ICON_DOCS,
              );
              btnDocs.addEventListener("click", () =>
                openPropertyEditor(
                  property.id,
                  "docs",
                  !hasPermission("property:manage", property.id),
                ),
              );
              wrap.append(btnDocs);
            }
            if (hasPermission("property:manage", property.id)) {
              const btnEdit = iconBtn("btn-edit", "Editar", `Editar ${property.plot}`, ICON_EDIT);
              btnEdit.addEventListener("click", () => openPropertyEditor(property.id));
              wrap.append(btnEdit);
            }
            if (hasPermission("property:delete", property.id)) {
              const btnDelete = iconBtn(
                "btn-delete",
                "Eliminar",
                `Eliminar ${property.plot}`,
                ICON_DELETE,
              );
              btnDelete.addEventListener("click", () => openPropertyDelete(property.id));
              wrap.append(btnDelete);
            }
            if (
              hasPermission("cascade-delete", property.id) &&
              hasPermission("property:delete", property.id)
            ) {
              const advanced = iconBtn(
                "btn-delete",
                "Eliminar (avanzado)",
                `Eliminar con asistente`,
                ICON_CASCADE_DELETE,
              );

              advanced.addEventListener("click", () =>
                openCascadeWizard("properties", property.id),
              );
              wrap.append(advanced);
            }
            return wrap;
          },
        },
      ],
    });
  } else {
    propertyTable.refresh();
  }
  document.querySelector('[data-export-table="properties"]')?.remove?.();
  const exportWrap = createExportDropdown({
    tableId: "properties",
    getView: () => {
      const view = propertyTable?.getExportState();
      if (!view?.columns?.length) return view;
      // La grilla muestra el contacto principal dentro de la columna Ocupación:
      // la exportación lo conserva como columna propia para no perderlo.
      const index = view.columns.indexOf("occupancy");
      if (index === -1 || view.columns.includes("primaryResident")) return view;
      const columns = [...view.columns];
      columns.splice(index + 1, 0, "primaryResident");
      return { ...view, columns };
    },
    getFilters: () => ({ query: propertySearch?.value || "" }),
  });
  propertyTable.setExportControl?.(exportWrap);
}

export function openPropertyDetail(id) {
  if (!requirePermission("property:read", id)) return;
  const property = state.properties.find((item) => item.id === id);
  if (!property) return;
  state.ui.viewingPropertyId = id;
  const community = state.communities.find((item) => item.id === property.communityId);
  const propOwnerIds = propertyOwnerIds(property);
  const linkedOwners = state.owners.filter((o) => propOwnerIds.includes(o.id));
  const linkedTenants = tenantsForProperty(property.id);
  const residentOwnerIds = new Set(
    property.occupancy === "owner" ? property.residentOwnerIds || [] : [],
  );

  document.querySelector("#property-detail-title").textContent =
    property.plot || "Ficha del inmueble";
  switchPropertyDetailTab("general");
  document.querySelector("#property-detail-label").textContent =
    `${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"} · ${property.plot || "—"}`;
  document.querySelector("#property-detail-community").textContent =
    community?.name || property.communityName || "—";
  document.querySelector("#property-detail-occupancy").textContent =
    propertyOccupancyLabel(property);
  document.querySelector("#property-detail-primary-resident").textContent =
    propertyResidentName(property.primaryResidentId) || "Sin contacto declarado";
  document.querySelector("#property-detail-address").textContent = property.address || "—";
  document.querySelector("#property-detail-owner").textContent = linkedOwners.length
    ? linkedOwners.map((o) => `${o.name} ${o.surname}`).join(", ")
    : "Sin propietario";
  document.querySelector("#property-detail-tenant").textContent = linkedTenants.length
    ? linkedTenants.map((t) => `${t.name} ${t.surname}`).join(", ")
    : "Sin inquilinos";
  document.querySelector("#property-detail-receipts").textContent =
    property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
  document.querySelector("#property-detail-registry").textContent = [
    property.cadastralRef || "Sin referencia catastral",
    property.registryNumber ? `Finca ${property.registryNumber}` : "Sin finca registral",
  ].join(" · ");
  document.querySelector("#property-detail-characteristics").textContent =
    [
      property.floor && `Planta ${property.floor}`,
      property.door && `Puerta ${property.door}`,
      property.areaM2 && `${property.areaM2} m²`,
      property.participationCoef && `${property.participationCoef}%`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sin datos adicionales";

  // Nuevos campos de inmueble (Requisito 2)
  const detailStaircase = document.querySelector("#property-detail-staircase");
  if (detailStaircase) detailStaircase.textContent = property.staircase || "—";
  const detailEnergy = document.querySelector("#property-detail-energyCertificate");
  if (detailEnergy) detailEnergy.textContent = property.energyCertificate || "Sin especificar";
  const detailFee = document.querySelector("#property-detail-communityFee");
  if (detailFee)
    detailFee.textContent = property.communityFee ? `${property.communityFee} €/mes` : "—";

  // Ubicación, uso y coeficiente (tabs Detalles y Financiero)
  const locationEl = document.querySelector("#property-detail-location");
  if (locationEl) {
    locationEl.textContent =
      [property.postalCode, property.city, property.province].filter(Boolean).join(" · ") || "—";
  }
  const useEl = document.querySelector("#property-detail-use");
  if (useEl)
    useEl.textContent = PROPERTY_USE_LABELS[property.propertyUse] || property.propertyUse || "—";
  const coefEl = document.querySelector("#property-detail-coef");
  if (coefEl)
    coefEl.textContent = property.participationCoef ? `${property.participationCoef}%` : "—";
  const notesEl = document.querySelector("#property-detail-notes");
  if (notesEl) {
    if (property.notes) notesEl.innerHTML = richTextHtml(property.notes);
    else notesEl.textContent = "—";
  }

  // Lista interactiva de propietarios (Requisito 7)
  const ownersListEl = document.querySelector("#property-detail-owners-list");
  if (ownersListEl) {
    ownersListEl.replaceChildren();
    linkedOwners.forEach((o) => {
      const badge = document.createElement("span");
      badge.className = "status-badge";
      badge.textContent = `👤 ${o.name} ${o.surname}${residentOwnerIds.has(o.id) ? " · Reside" : ""}`;
      ownersListEl.append(badge);
    });
  }

  // Lista interactiva de inquilinos (Requisito 7)
  const tenantsListEl = document.querySelector("#property-detail-tenants-list");
  if (tenantsListEl) {
    tenantsListEl.replaceChildren();
    linkedTenants.forEach((t) => {
      const badge = document.createElement("span");
      badge.className = "status-badge";
      badge.textContent = `🔑 ${t.name} ${t.surname}${property.occupancy === "tenant" ? " · Reside" : ""}`;
      tenantsListEl.append(badge);
    });
  }

  propertyDetailDocumentsLibrary?.setEntity(id);

  document.querySelector("#property-detail-edit-btn").hidden = !hasPermission("property:manage");
  if (!propertyDetailDialog.open) propertyDetailDialog.showModal();
}

/** Tabs de la ficha de lectura de inmueble (misma estructura que la edición). */
function switchPropertyDetailTab(tab) {
  document.querySelectorAll("#property-detail-dialog [data-pd-tab]").forEach((btn) => {
    const active = btn.dataset.pdTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#property-detail-dialog [data-pd-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pdPane !== tab;
  });
}

document.querySelectorAll("#property-detail-dialog [data-pd-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchPropertyDetailTab(btn.dataset.pdTab));
});

export function openPropertyDelete(id) {
  if (!requirePermission("property:delete")) return;
  const p = state.properties.find((item) => item.id === id);
  if (!p) return;
  const inquilinos = tenantsForProperty(id);
  if (inquilinos.length > 0) {
    toast(
      `No se puede eliminar “${p.plot}”: tiene ${inquilinos.length === 1 ? "un contrato vigente" : `${inquilinos.length} contratos vigentes`}. Finaliza o desvincula el contrato antes de eliminarlo.`,
    );
    return;
  }
  // Los contratos finalizados no bloquean el borrado: se conservan sin inmueble.
  const historicos = state.tenants.filter(
    (tenant) => tenant.propertyId === id && getTenantContractStatus(tenant) !== "Vigente",
  );
  state.ui.deletingPropertyId = id;
  document.querySelector("#property-delete-message").textContent =
    `Vas a eliminar el inmueble “${p.plot}” (${p.address}).` +
    (historicos.length
      ? " Sus contratos finalizados se conservarán desvinculados del inmueble."
      : "") +
    " Esta acción no se puede deshacer.";
  propertyDeleteDialog.showModal();
}

export function closePropertyDelete() {
  propertyDeleteDialog.close();
  state.ui.deletingPropertyId = null;
}

export function closePropertyDetail() {
  propertyDetailDialog.close();
  state.ui.viewingPropertyId = null;
}

newPropertyBtn.addEventListener("click", () => openPropertyEditor());
document
  .querySelector("#close-property-dialog")
  .addEventListener("click", () => intentarCerrar(propertyForm, propertyDialog));
document
  .querySelector("#cancel-property-dialog")
  .addEventListener("click", () => intentarCerrar(propertyForm, propertyDialog));
document
  .querySelector("#close-property-detail-dialog")
  .addEventListener("click", closePropertyDetail);
document.querySelector("#close-property-detail-btn").addEventListener("click", closePropertyDetail);
document.querySelector("#property-detail-edit-btn").addEventListener("click", () => {
  const targetId = state.ui.viewingPropertyId;
  closePropertyDetail();
  if (targetId) openPropertyEditor(targetId);
});

// Aviso del inmueble: se apoya en el compositor de Comunicación, que ya sabe
// dirigirse a los propietarios del inmueble (y, si se pide, a sus residentes).
document.querySelector("#btn-property-notify")?.addEventListener("click", async () => {
  const propertyId = state.ui.editingPropertyId;
  const property = state.properties.find((item) => item.id === propertyId);
  if (!property) return;
  await openCommunicationComposer({
    communityId: property.communityId,
    title: `Aviso del inmueble ${property.plot}`,
    audienceMode: "selected",
    propertyIds: [property.id],
    includeResidents: false,
  });
});

// Select de comunidad con buscador integrado
if (propertyForm.elements.communityId) {
  makeSelectSearchable(propertyForm.elements.communityId, "Buscar comunidad…");
  propertyForm.elements.communityId.addEventListener("change", handlePropertyCommunityChange);
}
// Selects de vinculación de propietarios e inquilinos: mismo combo buscador que comunidad
makeSelectSearchable(document.querySelector("#property-owner-link-select"), "Buscar propietario…");
makeSelectSearchable(document.querySelector("#property-tenant-link-select"), "Buscar inquilino…");

// Territorio del inmueble: CP → municipio/provincia automáticos
// Cuota de comunidad: solo valores de dinero (dígitos, coma o punto)
const propertyFeeInput = propertyForm.elements.communityFee;
if (propertyFeeInput) {
  propertyFeeInput.addEventListener("input", () => {
    propertyFeeInput.value = propertyFeeInput.value.replace(/[^0-9.,]/g, "").slice(0, 10);
  });
}
// Superficie: solo enteros
const propertyAreaInput = propertyForm.elements.areaM2;
if (propertyAreaInput) {
  propertyAreaInput.addEventListener("input", () => {
    propertyAreaInput.value = propertyAreaInput.value.replace(/[^0-9]/g, "").slice(0, 10);
  });
}

// La sincronización municipio/provincia/código postal la gestiona
// territory.js (setupTerritory): búsqueda, autocompletado y validación.

propertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (propertyDialogReadOnly) return;
  if (
    !requirePermission(
      state.ui.editingPropertyId ? "property:manage" : "property:create",
      state.ui.editingPropertyId || "",
    )
  ) {
    return;
  }
  propertyFormError.textContent = "";

  const values = Object.fromEntries(new FormData(propertyForm));
  const community = state.communities.find((item) => item.id === values.communityId);

  // Requisito 7: Asociar 1 o más propietarios y 1 o más inquilinos (tabs)
  const selectedOwnerIds = [...editingPropertyPeople.ownerIds];
  // Si el inmueble se crea desde la pestaña Inmueble de un propietario, se vincula a ese propietario
  const ownerEditorContextId = state.ui.ownerEditorPropertyContext || "";
  if (ownerEditorContextId && !selectedOwnerIds.includes(ownerEditorContextId)) {
    selectedOwnerIds.push(ownerEditorContextId);
  }
  const selectedTenantIds = [...editingPropertyPeople.tenantIds];
  // La residencia solo admite titulares del inmueble o contratos vigentes.
  const residentOwnerIds =
    editingOccupancy === "owner"
      ? editingResidentOwnerIds.filter((ownerId) => selectedOwnerIds.includes(ownerId))
      : [];
  const primaryResidentId =
    editingOccupancy === "owner"
      ? residentOwnerIds.includes(editingPrimaryResidentId)
        ? editingPrimaryResidentId
        : residentOwnerIds[0] || ""
      : editingOccupancy === "tenant"
        ? selectedTenantIds.includes(editingPrimaryResidentId)
          ? editingPrimaryResidentId
          : selectedTenantIds[0] || ""
        : "";
  const cadastralRef = normalizeCadastralRef(values.cadastralRef);
  const participationCoef = String(values.participationCoef || "")
    .trim()
    .replace(",", ".");

  const messages = [];
  if (!community) messages.push("Selecciona una comunidad existente.");
  if (selectedOwnerIds.length === 0 && !propertyOwnerAssignmentOptional())
    messages.push("Debes asociar al menos un propietario al inmueble (1 o más).");
  const linkedTenantRecords = state.owners.flatMap((owner) =>
    ownerTenants(owner)
      .filter((tenant) => selectedTenantIds.includes(tenant.id))
      .map((tenant) => ({ ...tenant, ownerId: owner.id })),
  );
  if (
    linkedTenantRecords.length !== selectedTenantIds.length ||
    linkedTenantRecords.some((tenant) => !selectedOwnerIds.includes(tenant.ownerId))
  ) {
    messages.push(
      "Los inquilinos asociados deben pertenecer a uno de los propietarios seleccionados.",
    );
  }
  if (community) {
    const invalidOwnerEntry = selectedOwnerIds
      .map((ownerId) => ({ ownerId, owner: state.owners.find((owner) => owner.id === ownerId) }))
      .find(({ owner }) => !owner || !ownerBelongsToCommunity(owner, community.id));
    if (invalidOwnerEntry) {
      messages.push(
        invalidOwnerEntry.owner
          ? `El propietario ${invalidOwnerEntry.owner.name} ${invalidOwnerEntry.owner.surname} no pertenece a la comunidad del inmueble.`
          : "Uno de los propietarios seleccionados ya no existe.",
      );
    }
    if (linkedTenantRecords.some((tenant) => !tenantBelongsToCommunity(tenant, community.id))) {
      messages.push("Los inquilinos asociados deben pertenecer a la comunidad del inmueble.");
    }
  }
  if (editingOccupancy === "owner") {
    if (selectedOwnerIds.length === 0)
      messages.push("Asocia al menos un propietario o marca el inmueble como «Sin ocupante».");
    else if (selectedTenantIds.length)
      messages.push(
        "Un inmueble ocupado por el propietario no puede tener inquilinos vinculados. Desvincúlalos o elige «Vive otra persona».",
      );
  } else if (editingOccupancy === "vacant" && selectedTenantIds.length) {
    messages.push(
      "Un inmueble sin ocupante no puede tener inquilinos vinculados. Desvincúlalos primero.",
    );
  }
  if (!values.address || !values.address.trim()) messages.push("La dirección es obligatoria.");
  if (!values.propertyType) messages.push("Selecciona el tipo de inmueble.");
  if (!values.plot || !values.plot.trim())
    messages.push("El identificador del inmueble es obligatorio.");
  if (!values.postalCode || !isValidPostalCode(values.postalCode))
    messages.push("El código postal es obligatorio y debe ser válido en España.");
  const selectedLocation = getLocationById(values.city);
  if (!selectedLocation) {
    messages.push("Selecciona un municipio válido del listado.");
  } else if (selectedLocation.province !== values.province) {
    messages.push("El municipio debe pertenecer a la provincia seleccionada.");
  }
  if (!["current", "pending"].includes(values.receiptStatus))
    messages.push("Selecciona un estado de recibos válido.");
  if (cadastralRef) {
    if (!isValidCadastralRef(cadastralRef)) {
      messages.push("La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.");
    } else {
      const duplicate = state.properties.find(
        (property) =>
          property.id !== state.ui.editingPropertyId &&
          normalizeCadastralRef(property.cadastralRef) === cadastralRef,
      );
      if (duplicate) {
        messages.push(
          `Ya existe el inmueble "${duplicate.plot}" con la misma referencia catastral.`,
        );
      }
    }
  }
  if (values.areaM2 && !/^\d+([.,]0+)?$/.test(String(values.areaM2).trim())) {
    messages.push("La superficie debe ser un número entero (sin decimales).");
  }
  if (!participationCoef) {
    messages.push("El coeficiente de participación es obligatorio.");
  } else if (!isValidDecimal(participationCoef, 0.0001, 100)) {
    messages.push("El coeficiente debe ser un porcentaje decimal entre 0,0001 y 100.");
  }

  if (messages.length) {
    showValidationErrors(messages, "Revisa los datos del inmueble");
    return;
  }

  const isEditing = !!state.ui.editingPropertyId;
  const propertyId = state.ui.editingPropertyId || crypto.randomUUID();
  const payload = {
    id: propertyId,
    communityId: values.communityId,
    ownerIds: selectedOwnerIds,
    ownerPercentages: Object.fromEntries(
      selectedOwnerIds.map((ownerId) => [ownerId, Number(editingOwnerPercentages[ownerId] ?? 100)]),
    ),
    linkTenantIds: selectedTenantIds.filter((id) => !initialPropertyTenantIds.includes(id)),
    unlinkTenantIds: initialPropertyTenantIds.filter((id) => !selectedTenantIds.includes(id)),
    currency: values.currency || "",
    occupancy: editingOccupancy,
    residentOwnerIds,
    primaryResidentId,
    address: values.address.trim(),
    propertyType: values.propertyType,
    plot: values.plot.trim(),
    staircase: (values.staircase || "").trim(),
    energyCertificate: values.energyCertificate || "",
    communityFee: (values.communityFee || "").trim(),
    cadastralRef,
    registryNumber: (values.registryNumber || "").trim(),
    floor: (values.floor || "").trim(),
    door: (values.door || "").trim(),
    areaM2: (values.areaM2 || "").trim().replace(",", "."),
    participationCoef,
    propertyUse: values.propertyUse || "",
    receiptStatus: values.receiptStatus,
    notes: (values.notes || "").trim(),
    postalCode: (values.postalCode || "").trim(),
    city: selectedLocation ? selectedLocation.name : "",
    province: selectedLocation ? selectedLocation.province : "",
  };

  try {
    if (isEditing) {
      await api.updateProperty(propertyId, {
        ...payload,
        version: Number(propertyForm.dataset.editVersion),
      });
    } else {
      await api.createProperty(payload);
    }
  } catch (error) {
    propertyFormError.textContent = error.message;
    return;
  }

  limpiarGuardia(propertyForm);

  await refreshState();
  // Si se creó desde la pestaña Inmueble del editor de propietario, actualizar sus badges
  if (ownerEditorContextId) {
    addPropertyToOwnerEditor(ownerEditorContextId, propertyId);
    state.ui.ownerEditorPropertyContext = null;
  }
  // Si se creó desde el tab Inmuebles vinculados del editor de comunidad, refrescar su lista
  refreshCommunityEditorAfterPropertySave();
  if (state.ui.viewingOwnerId) openOwnerDetail(state.ui.viewingOwnerId);
  closePropertyEditor();
  toast(isEditing ? "Inmueble actualizado." : "Inmueble creado.");
});

// --- Eliminación de inmuebles (API) ---
if (confirmPropertyDeleteBtn) {
  confirmPropertyDeleteBtn.addEventListener("click", async () => {
    if (!state.ui.deletingPropertyId) return;
    try {
      await api.deleteProperty(state.ui.deletingPropertyId);
    } catch (error) {
      toast(error.message);
      closePropertyDelete();
      return;
    }
    await refreshState();
    closePropertyDelete();
    toast("Inmueble eliminado con éxito.");
  });
}

if (cancelPropertyDeleteBtn) {
  cancelPropertyDeleteBtn.addEventListener("click", closePropertyDelete);
}
