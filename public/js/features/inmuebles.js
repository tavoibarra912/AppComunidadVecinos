import { sanitizeHtml, escapeHtml } from "../html.js";
import { api } from "../api.js";
import { state, refreshState, ownerTenants, tenantsForProperty, getTenantContractStatus, propertyOwnerIds, propertyLabel, PROPERTY_TYPE_LABELS, PROPERTY_USE_LABELS, getCurrencies, hasPermission, requirePermission } from "../state.js";
import { toast, renderDocumentRecords, validateDocumentFiles, setupGenericFileDropzone, isValidCadastralRef, isValidDecimal, getLocalDateInputValue, makeSelectSearchable, showValidationErrors, fieldLabel, armarGuardia, limpiarGuardia, intentarCerrar, setFormReadonly } from "../utils.js";
import { selectLocationInForm, getLocationById, isValidPostalCode, syncPostalCode, syncCity } from "../territory.js";
import { createDataTable } from "../table.js";
import { openOwnerDetail, openOwnerEditor, addPropertyToOwnerEditor } from "./propietarios.js";
import { openTenantDetail, openTenantEditor } from "./inquilinos.js";
import { openCommunityDetail, refreshCommunityEditorAfterPropertySave } from "./comunidades.js";

const contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

function populateCurrencySelect(selected) {
  const select = document.querySelector("#owner-form")?.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach(c => select.add(new Option(c.name, c.code)));
  select.value = selected || state.settings?.monedaPorDefecto || "EUR";
}

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
const propertyFormError = document.querySelector("#property-form-error");
const propertyDocumentInput = document.querySelector("#property-document-input");
let pendingPropertyFiles = [];
const propertyDocumentList = document.querySelector("#property-document-list");
const propertyDetailDialog = document.querySelector("#property-detail-dialog");
const propertyDetailDocuments = document.querySelector("#property-detail-documents");

let propertyTable = null;

const ICON_INFO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DOCS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`;

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
// % de titularidad por propietario del inmueble en edición
let editingOwnerPercentages = {};

function populatePropertyCurrencySelect(selected) {
  const select = propertyForm.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach(currency => select.add(new Option(currency.name, currency.code)));
  select.value = selected || state.settings?.monedaPorDefecto || "EUR";
}

/** Titularidad disponible del inmueble en edición para un propietario NUEVO. */
function propertyOwnerCapacity() {
  const used = editingPropertyPeople.ownerIds.reduce(
    (sum, ownerId) => sum + (Number(editingOwnerPercentages[ownerId]) || 0), 0
  );
  return Math.max(0, Math.round((100 - used) * 10000) / 10000);
}

function switchPropertyEditorTab(tab) {
  document.querySelectorAll(".community-editor-tab[data-property-tab]").forEach(btn => {
    const active = btn.dataset.propertyTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".property-editor-pane[data-property-pane]").forEach(pane => {
    pane.hidden = pane.dataset.propertyPane !== tab;
  });
}

document.querySelectorAll(".community-editor-tab[data-property-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchPropertyEditorTab(btn.dataset.propertyTab));
});

const ICON_UNLINK_SM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_VIEW_SM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

function renderPropertyOwnersTab() {
  const listEl = document.querySelector("#property-owners-list");
  const countEl = document.querySelector("#property-owner-count");
  if (!listEl) return;
  const ownerIds = editingPropertyPeople.ownerIds;
  if (countEl) countEl.textContent = String(ownerIds.length);
  listEl.replaceChildren();
  const panel = document.querySelector("#property-owner-link-panel");
  if (panel) panel.hidden = true;

  const capacity = propertyOwnerCapacity();
  const atFullCapacity = capacity <= 0;
  // Los botones siguen habilitados: al intentar vincular se explica cómo
  // hacer lugar (bajando el % de los propietarios actuales)
  const oldNote = listEl.parentElement.querySelector(".property-owners-capacity-note");
  if (oldNote) oldNote.remove();
  if (atFullCapacity) {
    const note = document.createElement("p");
    note.className = "form-intro property-owners-capacity-note";
    note.textContent = "La titularidad de este inmueble ya suma 100%. Para agregar otro propietario, bajá primero el porcentaje de alguno de los actuales.";
    listEl.parentElement.insertBefore(note, listEl);
  }

  if (ownerIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay propietarios asociados. Asocia al menos uno antes de guardar.";
    listEl.append(empty);
    return;
  }

  ownerIds.forEach(ownerId => {
    const owner = state.owners.find(o => o.id === ownerId);
    if (!owner) return;
    const communityName = state.communities.find(c => c.id === owner.communityId)?.name || owner.communityName || "Sin comunidad";

    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";
    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${owner.name} ${owner.surname} (${owner.dni})`;
    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    sub.textContent = `Comunidad: ${communityName}`;
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
    pctInput.setAttribute("aria-label", `Porcentaje de titularidad de ${owner.name} ${owner.surname}`);
    pctInput.addEventListener("change", () => {
      let value = Number(pctInput.value.replace(",", "."));
      const previous = editingOwnerPercentages[ownerId] ?? 100;
      if (!Number.isFinite(value) || value <= 0) {
        pctInput.value = String(previous);
        toast("Un propietario vinculado debe tener un porcentaje de titularidad mayor a 0. Si no es titular, desvinculalo.");
        return;
      }
      const others = editingPropertyPeople.ownerIds
        .filter(id => id !== ownerId)
        .reduce((sum, id) => sum + (Number(editingOwnerPercentages[id]) || 0), 0);
      const maxForThis = Math.max(0, Math.round((100 - others) * 10000) / 10000);
      if (value > maxForThis) {
        value = maxForThis;
        toast(`La suma de titularidades no puede superar el 100%: máximo ${maxForThis}% para este propietario.`);
      }
      pctInput.value = String(value);
      editingOwnerPercentages[ownerId] = value;
      renderPropertyOwnersTab();
    });
    pctWrap.append(pctInput, document.createTextNode("%"));
    info.append(pctWrap);

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = iconBtn("btn-info", "Ver propietario", `Ver propietario ${owner.name} ${owner.surname}`, ICON_VIEW_SM);
    viewBtn.addEventListener("click", () => openOwnerDetail(owner.id));

    const unlinkBtn = iconBtn("btn-delete", "Desvincular propietario", `Desvincular ${owner.name} ${owner.surname}`, ICON_UNLINK_SM);
    unlinkBtn.addEventListener("click", () => {
      editingPropertyPeople.ownerIds = editingPropertyPeople.ownerIds.filter(id => id !== ownerId);
      delete editingOwnerPercentages[ownerId];
      const validTenantIds = state.owners
        .filter(o => editingPropertyPeople.ownerIds.includes(o.id))
        .flatMap(o => ownerTenants(o).map(t => t.id));
      editingPropertyPeople.tenantIds = editingPropertyPeople.tenantIds.filter(id => validTenantIds.includes(id));
      renderPropertyOwnersTab();
      renderPropertyTenantsTab();
    });

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
  if (countEl) countEl.textContent = String(tenantIds.length);
  listEl.replaceChildren();
  const panel = document.querySelector("#property-tenant-link-panel");
  if (panel) panel.hidden = true;

  if (tenantIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay inquilinos asociados. Opcional: asociá inquilinos de los propietarios vinculados.";
    listEl.append(empty);
    return;
  }

  tenantIds.forEach(tenantId => {
    const owner = state.owners.find(o => ownerTenants(o).some(t => t.id === tenantId));
    const tenant = owner ? ownerTenants(owner).find(t => t.id === tenantId) : null;
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
    sub.textContent = `Contrato ${getTenantContractStatus(tenant)} · Arrendador: ${owner.name} ${owner.surname}`;
    info.append(title, sub);

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = iconBtn("btn-info", "Ver inquilino", `Ver inquilino ${tenant.name} ${tenant.surname}`, ICON_VIEW_SM);
    viewBtn.addEventListener("click", () => openTenantDetail(owner.id, tenant.id));

    const unlinkBtn = iconBtn("btn-delete", "Desvincular inquilino", `Desvincular ${tenant.name} ${tenant.surname}`, ICON_UNLINK_SM);
    unlinkBtn.addEventListener("click", () => {
      editingPropertyPeople.tenantIds = editingPropertyPeople.tenantIds.filter(id => id !== tenantId);
      renderPropertyTenantsTab();
    });

    actions.append(viewBtn, unlinkBtn);
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
    if (propertyOwnerCapacity() <= 0) {
      select.add(new Option("La titularidad del inmueble ya alcanzó el 100%", ""));
      return;
    }
    const available = state.owners.filter(o => !editingPropertyPeople.ownerIds.includes(o.id));
    if (available.length === 0) {
      select.add(new Option("No hay más propietarios disponibles", ""));
    } else {
      select.add(new Option("Selecciona un propietario…", ""));
      const selectedCommunityId = propertyForm.elements.communityId?.value || "";
      [...available].sort((a, b) => {
        if (a.communityId === selectedCommunityId && b.communityId !== selectedCommunityId) return -1;
        if (b.communityId === selectedCommunityId && a.communityId !== selectedCommunityId) return 1;
        return a.name.localeCompare(b.name, "es");
      }).forEach(owner => {
        const comm = state.communities.find(c => c.id === owner.communityId);
        select.add(new Option(`${owner.name} ${owner.surname} (${owner.dni}) · ${comm ? comm.name : "Sin comunidad"}`, owner.id));
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
    const candidates = state.owners
      .filter(owner => editingPropertyPeople.ownerIds.includes(owner.id))
      .flatMap(owner => ownerTenants(owner).map(tenant => ({
        ...tenant,
        ownerName: `${owner.name} ${owner.surname}`
      })))
      .filter(tenant => !editingPropertyPeople.tenantIds.includes(tenant.id));
    if (candidates.length === 0) {
      select.add(new Option("No hay inquilinos disponibles de los propietarios asociados", ""));
    } else {
      select.add(new Option("Selecciona un inquilino…", ""));
      candidates.forEach(tenant => {
        select.add(new Option(`${tenant.name} ${tenant.surname} · Arrendador: ${tenant.ownerName}`, tenant.id));
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
    const capacity = propertyOwnerCapacity();
    if (capacity <= 0) {
      toast("La titularidad del inmueble ya está completa (100%). Bajá el porcentaje de algún propietario para agregar otro.");
      return;
    }
    editingPropertyPeople.ownerIds.push(ownerId);
    editingOwnerPercentages[ownerId] = capacity;
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

// Crear propietario/inquilino nuevos desde el editor de inmueble
const btnAddOwner = document.querySelector("#btn-property-add-owner");
if (btnAddOwner) {
  btnAddOwner.addEventListener("click", () => {
    const targetPropertyId = state.ui.editingPropertyId;
    closePropertyEditor();
    openOwnerEditor(null, "data");
    // nota: tras crear el propietario, el usuario lo asocia desde el panel de asociación
    if (targetPropertyId) state.ui.editingPropertyId = targetPropertyId;
  });
}

const btnAddTenant = document.querySelector("#btn-property-add-tenant");
if (btnAddTenant) {
  btnAddTenant.addEventListener("click", () => {
    const targetPropertyId = state.ui.editingPropertyId;
    const linkedOwners = editingPropertyPeople.ownerIds;
    closePropertyEditor();
    openTenantEditor(null, linkedOwners[0] || "");
    if (targetPropertyId) state.ui.editingPropertyId = targetPropertyId;
  });
}

/** Puebla el desplegable de comunidad del formulario de inmueble. */
function updatePropertyCommunitySelect(selectedId = "") {
  const select = propertyForm.elements.communityId;
  if (!select) return;
  const current = selectedId || select.value;
  select.replaceChildren(new Option("Selecciona una comunidad…", ""));
  state.communities.forEach(community => select.add(new Option(community.name, community.id)));
  if (current) select.value = current;
}

export function updatePropertyPeopleSelectors(selectedOwnerIds = [], selectedTenantIds = [], selectedOwnerPercentages = {}) {
  editingPropertyPeople.ownerIds = [...selectedOwnerIds];
  editingPropertyPeople.tenantIds = [...selectedTenantIds];
  editingOwnerPercentages = {};
  selectedOwnerIds.forEach(ownerId => {
    editingOwnerPercentages[ownerId] = Number(selectedOwnerPercentages[ownerId] ?? 100);
  });
  renderPropertyOwnersTab();
  renderPropertyTenantsTab();
  const ownerPanel = document.querySelector("#property-owner-link-panel");
  const tenantPanel = document.querySelector("#property-tenant-link-panel");
  if (ownerPanel) ownerPanel.hidden = true;
  if (tenantPanel) tenantPanel.hidden = true;
}

const ICON_FILE_DOC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

function docFileRow({ name, size, href, download = false, removeAttrs }) {
  const row = document.createElement("div");
  row.className = "doc-file-row";
  const icon = document.createElement("span");
  icon.className = "doc-file-icon";
  icon.innerHTML = sanitizeHtml(ICON_FILE_DOC);
  const info = document.createElement("div");
  info.className = "doc-file-info";
  if (href) {
    const link = document.createElement("a");
    link.className = "doc-file-name";
    link.textContent = name;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    if (download) link.download = name;
    info.append(link);
  } else {
    const nameSpan = document.createElement("span");
    nameSpan.className = "doc-file-name";
    nameSpan.textContent = name;
    info.append(nameSpan);
  }
  const sizeSpan = document.createElement("span");
  sizeSpan.className = "doc-file-size";
  sizeSpan.textContent = size;
  info.append(sizeSpan);
  const removeButton = iconBtn("btn-delete", "Quitar archivo", `Quitar ${name}`, ICON_DELETE);
  Object.entries(removeAttrs).forEach(([attr, value]) => { removeButton.dataset[attr] = value; });
  row.append(icon, info, removeButton);
  return row;
}

export function renderPropertyDocumentList() {
  propertyDocumentList.replaceChildren();
  const countEl = document.querySelector("#property-doc-count");
  if (countEl) countEl.textContent = String(state.ui.propertyDocuments.length + pendingPropertyFiles.length);
  if (state.ui.propertyDocuments.length === 0 && pendingPropertyFiles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay documentos cargados para este inmueble.";
    propertyDocumentList.append(empty);
    return;
  }

  state.ui.propertyDocuments.forEach(documentRecord => {
    propertyDocumentList.append(docFileRow({
      name: documentRecord.fileName,
      size: `${Math.ceil((documentRecord.fileSize || 0) / 1024)} KB`,
      href: documentRecord.url || documentRecord.dataUrl || "",
      download: !!documentRecord.dataUrl,
      removeAttrs: { removePropertyDocument: documentRecord.id }
    }));
  });

  pendingPropertyFiles.forEach((file, index) => {
    propertyDocumentList.append(docFileRow({
      name: `${file.name} · nuevo`,
      size: `${Math.ceil(file.size / 1024)} KB`,
      href: "",
      removeAttrs: { pendingPropertyFile: String(index) }
    }));
  });
}

export function openPropertyEditor(id = null, defaultTab = "general", readonly = false) {
  if (!requirePermission(readonly ? "property:read" : "property:manage", id || "")) return;
  state.ui.editingPropertyId = id;
  propertyForm.reset();
  propertyFormError.textContent = "";
  updatePropertyCommunitySelect();
  switchPropertyEditorTab(defaultTab);
  const property = state.properties.find(item => item.id === id);
  populatePropertyCurrencySelect(property?.currency || "EUR");
  const ownerIds = propertyOwnerIds(property);
  const tenantIds = property?.tenantIds || (property?.tenantId ? [property.tenantId] : []);
  updatePropertyPeopleSelectors(ownerIds, tenantIds, property?.ownerPercentages || {});
  state.ui.propertyDocuments = property?.documents ? property.documents.map(item => ({ ...item })) : [];
  propertyForm.elements.receiptStatus.value = property?.receiptStatus || "current";
  propertyForm.elements.propertyType.value = property?.propertyType || "";
  if (property) {
    ["communityId", "plot", "address", "cadastralRef", "registryNumber", "floor", "door", "staircase", "areaM2", "participationCoef", "propertyUse", "energyCertificate", "communityFee", "notes", "postalCode", "city", "province"]
      .forEach(key => {
        if (propertyForm.elements[key]) {
          propertyForm.elements[key].value = property[key] || "";
        }
      });
    selectLocationInForm(propertyForm, property.city, property.province);
  }
  document.querySelector("#property-dialog-title").textContent = property ? (readonly ? `Ver inmueble: ${property.plot}` : "Editar inmueble") : "Nuevo inmueble";
  setFormReadonly(propertyForm, readonly);
  renderPropertyDocumentList();
  propertyDialog.showModal();
  if (!readonly) {
    propertyForm.elements.plot.focus();
  }
}

export function closePropertyEditor() {
  propertyDialog.close();
  state.ui.editingPropertyId = null;
  state.ui.propertyDocuments = [];
}

export function visibleProperties() {
  return state.properties.filter(property => {
    if (!hasPermission("property:read", property.id)) return false;
    const propOwnerIds = propertyOwnerIds(property);
    return state.owners.some(owner => propOwnerIds.includes(owner.id));
  });
}

export function renderProperties() {
  if (!propertyTable) {
    propertyTable = createDataTable({
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
          value: property => {
            const community = state.communities.find(item => item.id === property.communityId);
            return community?.name || property.communityName || "Sin comunidad";
          },
          defaultVisible: true,
          render: property => {
            const community = state.communities.find(item => item.id === property.communityId);
            const label = community?.name || property.communityName || "Sin comunidad";
            if (!community) return label;
            const link = document.createElement("button");
            link.type = "button";
            link.className = "text-link-button";
            link.textContent = label;
            link.addEventListener("click", () => openCommunityDetail(community.id));
            return link;
          }
        },
        {
          key: "plot",
          label: "Inmueble",
          value: property => property.plot,
          defaultVisible: true,
          render: property => {
            const wrap = document.createElement("span");
            wrap.className = "community-name";
            wrap.textContent = `${property.plot || "Inmueble"} · ${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"}`;
            return wrap;
          }
        },
        { key: "address", label: "Dirección", value: property => property.address, defaultVisible: true },
        {
          key: "city",
          label: "Municipio",
          value: property => state.communities.find(item => item.id === property.communityId)?.city || "",
          defaultVisible: true
        },
        {
          key: "owners",
          label: "Propietario(s)",
          value: property => {
            const propOwnerIds = propertyOwnerIds(property);
            return state.owners.filter(item => propOwnerIds.includes(item.id)).map(o => `${o.name} ${o.surname}`).join(", ") || "Sin propietario";
          },
          render: property => {
            const propOwnerIds = propertyOwnerIds(property);
            const linkedOwners = state.owners.filter(item => propOwnerIds.includes(item.id));
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
              ownerButton.addEventListener("click", () => openOwnerDetail(owner.id));
              cell.append(ownerButton);
            });
            return cell;
          }
        },
        {
          key: "tenants",
          label: "Inquilino(s)",
          value: property => tenantsForProperty(property.id).map(item => `${item.name} ${item.surname}`).join(", ") || "Sin inquilino",
          render: property => {
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
                openTenantDetail(propertyTenant.ownerId, propertyTenant.id)
              );
              cell.append(tenantButton);
            });
            return cell;
          }
        },
        {
          key: "receipts",
          label: "Estado recibos",
          value: property => (property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente"),
          render: property => {
            const badge = document.createElement("span");
            badge.className = `status-badge ${property.receiptStatus === "pending" ? "doc-rejected" : "doc-approved"}`;
            badge.textContent = property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
            return badge;
          }
        },
        {
          key: "documents",
          label: "Documentación",
          value: property => String((property.documents || []).length)
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
          render: property => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnInfo = iconBtn("btn-info", "Ver inmueble", `Ver ${property.plot}`, ICON_INFO);
            btnInfo.addEventListener("click", () => openPropertyEditor(property.id, "general", true));
            wrap.append(btnInfo);
            if (hasPermission("property:manage")) {
              const btnDocs = iconBtn("btn-docs", "Ver documentación", `Documentación de ${property.plot}`, ICON_DOCS);
              btnDocs.addEventListener("click", () => openPropertyEditor(property.id, "docs", !hasPermission("property:manage", property.id)));
              const btnEdit = iconBtn("btn-edit", "Editar", `Editar ${property.plot}`, ICON_EDIT);
              btnEdit.addEventListener("click", () => openPropertyEditor(property.id));
              const btnDelete = iconBtn("btn-delete", "Eliminar", `Eliminar ${property.plot}`, ICON_DELETE);
              btnDelete.addEventListener("click", () => openPropertyDelete(property.id));
              wrap.append(btnDocs, btnEdit, btnDelete);
            }
            return wrap;
          }
        }
      ]
    });
  } else {
    propertyTable.refresh();
  }
}

export function openPropertyDetail(id) {
  if (!requirePermission("property:read", id)) return;
  const property = state.properties.find(item => item.id === id);
  if (!property) return;
  state.ui.viewingPropertyId = id;
  const community = state.communities.find(item => item.id === property.communityId);
  const propOwnerIds = propertyOwnerIds(property);
  const linkedOwners = state.owners.filter(o => propOwnerIds.includes(o.id));
  const linkedTenants = tenantsForProperty(property.id);

  document.querySelector("#property-detail-title").textContent = property.plot || "Ficha del inmueble";
  switchPropertyDetailTab("general");
  document.querySelector("#property-detail-label").textContent =
    `${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"} · ${property.plot || "—"}`;
  document.querySelector("#property-detail-community").textContent = community?.name || property.communityName || "—";
  document.querySelector("#property-detail-address").textContent = property.address || "—";
  document.querySelector("#property-detail-owner").textContent = linkedOwners.length
    ? linkedOwners.map(o => `${o.name} ${o.surname}`).join(", ")
    : "Sin propietario";
  document.querySelector("#property-detail-tenant").textContent = linkedTenants.length
    ? linkedTenants.map(t => `${t.name} ${t.surname}`).join(", ")
    : "Sin inquilinos";
  document.querySelector("#property-detail-receipts").textContent =
    property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
  document.querySelector("#property-detail-registry").textContent =
    [property.cadastralRef || "Sin referencia catastral", property.registryNumber ? `Finca ${property.registryNumber}` : "Sin finca registral"].join(" · ");
  document.querySelector("#property-detail-characteristics").textContent =
    [property.floor && `Planta ${property.floor}`, property.door && `Puerta ${property.door}`,
      property.areaM2 && `${property.areaM2} m²`, property.participationCoef && `${property.participationCoef}%`]
      .filter(Boolean).join(" · ") || "Sin datos adicionales";

  // Nuevos campos de inmueble (Requisito 2)
  const detailStaircase = document.querySelector("#property-detail-staircase");
  if (detailStaircase) detailStaircase.textContent = property.staircase || "—";
  const detailEnergy = document.querySelector("#property-detail-energyCertificate");
  if (detailEnergy) detailEnergy.textContent = property.energyCertificate || "Sin especificar";
  const detailFee = document.querySelector("#property-detail-communityFee");
  if (detailFee) detailFee.textContent = property.communityFee ? `${property.communityFee} €/mes` : "—";

  // Ubicación, uso y coeficiente (tabs Detalles y Financiero)
  const locationEl = document.querySelector("#property-detail-location");
  if (locationEl) {
    locationEl.textContent = [property.postalCode, property.city, property.province].filter(Boolean).join(" · ") || "—";
  }
  const useEl = document.querySelector("#property-detail-use");
  if (useEl) useEl.textContent = PROPERTY_USE_LABELS[property.propertyUse] || property.propertyUse || "—";
  const coefEl = document.querySelector("#property-detail-coef");
  if (coefEl) coefEl.textContent = property.participationCoef ? `${property.participationCoef}%` : "—";
  const notesEl = document.querySelector("#property-detail-notes");
  if (notesEl) notesEl.textContent = property.notes || "—";

  // Lista interactiva de propietarios (Requisito 7)
  const ownersListEl = document.querySelector("#property-detail-owners-list");
  if (ownersListEl) {
    ownersListEl.replaceChildren();
    linkedOwners.forEach(o => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary-button";
      btn.style.fontSize = "12px";
      btn.style.padding = "3px 8px";
      btn.textContent = `👤 ${o.name} ${o.surname}`;
      btn.onclick = () => {
        propertyDetailDialog.close();
        openOwnerDetail(o.id);
      };
      ownersListEl.append(btn);
    });
  }

  // Lista interactiva de inquilinos (Requisito 7)
  const tenantsListEl = document.querySelector("#property-detail-tenants-list");
  if (tenantsListEl) {
    tenantsListEl.replaceChildren();
    linkedTenants.forEach(t => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary-button";
      btn.style.fontSize = "12px";
      btn.style.padding = "3px 8px";
      btn.textContent = `🔑 ${t.name} ${t.surname}`;
      btn.onclick = () => {
        propertyDetailDialog.close();
        openTenantDetail(t.ownerId, t.id);
      };
      tenantsListEl.append(btn);
    });
  }

  propertyDetailDocuments.replaceChildren();
  if (!property.documents.length) {
    const empty = document.createElement("p");
    empty.textContent = "No hay documentación cargada.";
    propertyDetailDocuments.append(empty);
  } else {
    property.documents.forEach(documentRecord => {
      const link = document.createElement("a");
      link.textContent = documentRecord.fileName;
      link.href = documentRecord.url || documentRecord.dataUrl || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.download = documentRecord.fileName;
      propertyDetailDocuments.append(link);
    });
  }

  document.querySelector("#property-detail-edit-btn").hidden = !hasPermission("property:manage");
  if (!propertyDetailDialog.open) propertyDetailDialog.showModal();
}

/** Tabs de la ficha de lectura de inmueble (misma estructura que la edición). */
function switchPropertyDetailTab(tab) {
  document.querySelectorAll("#property-detail-dialog [data-pd-tab]").forEach(btn => {
    const active = btn.dataset.pdTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#property-detail-dialog [data-pd-pane]").forEach(pane => {
    pane.hidden = pane.dataset.pdPane !== tab;
  });
}

document.querySelectorAll("#property-detail-dialog [data-pd-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchPropertyDetailTab(btn.dataset.pdTab));
});


export function openPropertyDelete(id) {
  if (!requirePermission("property:delete")) return;
  const p = state.properties.find(item => item.id === id);
  if (!p) return;
  state.ui.deletingPropertyId = id;
  document.querySelector("#property-delete-message").textContent =
    `Vas a eliminar el inmueble “${p.plot}” (${p.address}). Esta acción no se puede deshacer.`;
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
document.querySelector("#close-property-dialog").addEventListener("click", () => intentarCerrar(propertyForm, propertyDialog));
document.querySelector("#cancel-property-dialog").addEventListener("click", () => intentarCerrar(propertyForm, propertyDialog));
document.querySelector("#close-property-detail-dialog").addEventListener("click", closePropertyDetail);
document.querySelector("#close-property-detail-btn").addEventListener("click", closePropertyDetail);
document.querySelector("#property-detail-edit-btn").addEventListener("click", () => {
  const targetId = state.ui.viewingPropertyId;
  closePropertyDetail();
  if (targetId) openPropertyEditor(targetId);
});
propertyDocumentList.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-property-document]");
  if (!button) return;
  state.ui.propertyDocuments = state.ui.propertyDocuments.filter(documentRecord => documentRecord.id !== button.dataset.removePropertyDocument);
  renderPropertyDocumentList();
});

// Select de comunidad con buscador integrado
if (propertyForm.elements.communityId) {
  makeSelectSearchable(propertyForm.elements.communityId, "Buscar comunidad…");
  propertyForm.elements.communityId.addEventListener("change", () => {
    renderPropertyOwnersTab();
    renderPropertyTenantsTab();
  });
}
// Selects de vinculación de propietarios e inquilinos: mismo combo buscador que comunidad
makeSelectSearchable(document.querySelector("#property-owner-link-select"), "Buscar propietario…");
makeSelectSearchable(document.querySelector("#property-tenant-link-select"), "Buscar inquilino…");

// Territorio del inmueble: CP → municipio/provincia automáticos
// Cuota de comunidad: sólo valores de dinero (dígitos, coma o punto)
const propertyFeeInput = propertyForm.elements.communityFee;
if (propertyFeeInput) {
  propertyFeeInput.addEventListener("input", () => {
    propertyFeeInput.value = propertyFeeInput.value.replace(/[^0-9.,]/g, "").slice(0, 10);
  });
}
// Superficie: sólo enteros
const propertyAreaInput = propertyForm.elements.areaM2;
if (propertyAreaInput) {
  propertyAreaInput.addEventListener("input", () => {
    propertyAreaInput.value = propertyAreaInput.value.replace(/[^0-9]/g, "").slice(0, 10);
  });
}

const propertyPostalInput = propertyForm.elements.postalCode;
const propertyCitySelect = propertyForm.elements.city;
if (propertyPostalInput) {
  propertyPostalInput.addEventListener("input", () => {
    propertyPostalInput.value = propertyPostalInput.value.replace(/\D/g, "").slice(0, 5);
    syncPostalCode(propertyPostalInput, propertyCitySelect, propertyForm.elements.province);
  });
}
if (propertyCitySelect) {
  propertyCitySelect.addEventListener("change", () => {
    syncCity(propertyCitySelect, propertyForm.elements.province, propertyPostalInput);
  });
}

// Archivos pendientes del tab Documentación
if (propertyDocumentInput) {
  setupGenericFileDropzone(document.querySelector("#property-doc-dropzone"), propertyDocumentInput);
  propertyDocumentInput.addEventListener("change", () => {
    const messages = validateDocumentFiles(propertyDocumentInput.files);
    if (messages.length) {
      toast(messages.join(" "));
      return;
    }
    pendingPropertyFiles.push(...propertyDocumentInput.files);
    propertyDocumentInput.value = "";
    renderPropertyDocumentList();
  });
  propertyDocumentList.addEventListener("click", event => {
    const pendingBtn = event.target.closest("[data-pending-property-file]");
    if (!pendingBtn) return;
    pendingPropertyFiles.splice(Number(pendingBtn.dataset.pendingPropertyFile), 1);
    renderPropertyDocumentList();
  });
}

propertyForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("property:manage")) {
    closePropertyEditor();
    return;
  }
  propertyFormError.textContent = "";

  const values = Object.fromEntries(new FormData(propertyForm));
  const community = state.communities.find(item => item.id === values.communityId);

  // Requisito 7: Asociar 1 o más propietarios y 1 o más inquilinos (tabs)
  const selectedOwnerIds = [...editingPropertyPeople.ownerIds];
  // Si el inmueble se crea desde la pestaña Inmueble de un propietario, se vincula a ese propietario
  const ownerEditorContextId = state.ui.ownerEditorPropertyContext || "";
  if (ownerEditorContextId && !selectedOwnerIds.includes(ownerEditorContextId)) {
    selectedOwnerIds.push(ownerEditorContextId);
  }
  const selectedTenantIds = [...editingPropertyPeople.tenantIds];

  const messages = [];
  if (!community) messages.push("Selecciona una comunidad existente.");
  if (selectedOwnerIds.length === 0) messages.push("Debes asociar al menos un propietario al inmueble (1 o más).");
  const linkedTenantRecords = state.owners.flatMap(owner => ownerTenants(owner)
    .filter(tenant => selectedTenantIds.includes(tenant.id))
    .map(tenant => ({ ...tenant, ownerId: owner.id })));
  if (linkedTenantRecords.length !== selectedTenantIds.length ||
      linkedTenantRecords.some(tenant => !selectedOwnerIds.includes(tenant.ownerId))) {
    messages.push("Los inquilinos asociados deben pertenecer a uno de los propietarios seleccionados.");
  }
  if (!values.address || !values.address.trim()) messages.push("La dirección es obligatoria.");
  if (!values.propertyType) messages.push("Seleccioná el tipo de inmueble.");
  if (!values.plot || !values.plot.trim()) messages.push("El identificador del inmueble es obligatorio.");
  if (!values.postalCode || !isValidPostalCode(values.postalCode)) messages.push("El código postal es obligatorio y debe ser válido en España.");
  const selectedLocation = getLocationById(values.city);
  if (!selectedLocation) {
    messages.push("Seleccioná un municipio válido del listado.");
  } else if (selectedLocation.province !== values.province) {
    messages.push("El municipio debe pertenecer a la provincia seleccionada.");
  }
  if (!["current", "pending"].includes(values.receiptStatus)) messages.push("Seleccioná un estado de recibos válido.");
  if (values.cadastralRef && !isValidCadastralRef(values.cadastralRef)) {
    messages.push("La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.");
  }
  if (values.areaM2 && !/^\d+([.,]0+)?$/.test(String(values.areaM2).trim())) {
    messages.push("La superficie debe ser un número entero (sin decimales).");
  }
  if (values.participationCoef && !isValidDecimal(values.participationCoef, 0.0001, 100)) {
    messages.push("El coeficiente debe ser un porcentaje decimal entre 0,0001 y 100.");
  }

  const selectedFiles = [...pendingPropertyFiles];
  selectedFiles.forEach(file => {
    const extension = file.name.split(".").pop().toLowerCase();
    const allowed = ["pdf", "jpg", "jpeg", "png", "webp"].includes(extension);
    if (!allowed) messages.push(`El archivo "${file.name}" debe ser PDF, JPG, PNG o WEBP.`);
    if (file.size > 15 * 1024 * 1024) messages.push(`El archivo "${file.name}" supera el límite de 15 MB.`);
  });
  if (messages.length) {
    showValidationErrors(messages, "Revisá los datos del inmueble");
    return;
  }

  const isEditing = !!state.ui.editingPropertyId;
  const propertyId = state.ui.editingPropertyId || crypto.randomUUID();
  const payload = {
    id: propertyId,
    communityId: values.communityId,
    ownerIds: selectedOwnerIds,
    ownerPercentages: Object.fromEntries(selectedOwnerIds.map(ownerId => [
      ownerId,
      Number(editingOwnerPercentages[ownerId] ?? 100)
    ])),
    tenantIds: selectedTenantIds,
    currency: values.currency || "",
    address: values.address.trim(),
    propertyType: values.propertyType,
    plot: values.plot.trim(),
    staircase: (values.staircase || "").trim(),
    energyCertificate: values.energyCertificate || "",
    communityFee: (values.communityFee || "").trim(),
    cadastralRef: (values.cadastralRef || "").trim().toUpperCase(),
    registryNumber: (values.registryNumber || "").trim(),
    floor: (values.floor || "").trim(),
    door: (values.door || "").trim(),
    areaM2: (values.areaM2 || "").trim().replace(",", "."),
    participationCoef: (values.participationCoef || "").trim().replace(",", "."),
    propertyUse: values.propertyUse || "",
    receiptStatus: values.receiptStatus,
    notes: (values.notes || "").trim(),
    postalCode: (values.postalCode || "").trim(),
    city: selectedLocation ? selectedLocation.name : "",
    province: selectedLocation ? selectedLocation.province : ""
  };

  try {
    if (isEditing) {
      await api.updateProperty(propertyId, payload);
    } else {
      await api.createProperty(payload);
    }
    if (selectedFiles.length) {
      await api.uploadDocuments(selectedFiles, "property", propertyId);
      pendingPropertyFiles = [];
      await refreshState();
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

if (propertyForm.elements.communityId) {
  propertyForm.elements.communityId.addEventListener("change", () => {
    // los paneles se recalculan al abrirlos; sólo re-renderizamos los badges
    renderPropertyOwnersTab();
    renderPropertyTenantsTab();
  });
}

