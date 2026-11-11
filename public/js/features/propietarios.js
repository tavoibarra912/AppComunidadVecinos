import { sanitizeHtml, escapeHtml } from "../html.js";

import { api } from "../api.js";
import { mountFeeShortcut } from "./fees.js";
import { state, refreshState, getCurrentOwnerProfileId, ownerProperties, ownerTenants, getTenantContractStatus, propertyOwnerIds, getCurrencies, PROPERTY_TYPE_LABELS, hasPermission, requirePermission } from "../state.js";
import { toast, digitsOnly, digitsIban, formatPhone, formatIban, maskIbanField, isValidIdentityDocument, detectDocumentType, isValidIban, isValidPhone, isValidEmail, makeSelectSearchable, showValidationErrors, intentarCerrar } from "../utils.js";
import { setupTerritory, getLocationById, isValidPostalCode } from "../territory.js";
import { createDataTable } from "../table.js";
import { editingDocs, renderOwnerDialogDocs, openDocViewer as engineOpenDocViewer } from "../docs-engine.js";
import { getOwnerDocStatus, getDocBadgeClass, getDocBadgeText, addOwnerNotification, sendAdminEmailNotification, openAdminEmail } from "./notificaciones.js";
import { openTenantEditor, openTenantDetail, openTenantDelete } from "./inquilinos.js";
import { openPropertyDetail, openPropertyEditor } from "./inmuebles.js";
import { openCommunityEditor } from "./comunidades.js";

let ownerTable = null;
// Inmuebles asociados en el editor de propietario (modelo N:M) + % de titularidad por inmueble
let editingOwnerProperties = [];
let editingOwnerPropertyPercentages = {};

const ICON_INFO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const ICON_DOCS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;
const ICON_UNLINK_SM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_VIEW_SM = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = sanitizeHtml(svg);
  return btn;
}

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

// Elementos de Propietarios
const ownerCount = document.querySelector("#owner-result-count");
const ownerSearch = document.querySelector("#search-owners");
const ownerForm = document.querySelector("#owner-form");
const ownerDialog = document.querySelector("#owner-dialog");
const ownerDeleteDialog = document.querySelector("#owner-delete-dialog");
const ownerError = document.querySelector("#owner-form-error");
const ownerValidationDialog = document.querySelector("#owner-validation-dialog");
const ownerValidationList = document.querySelector("#owner-validation-list");
// Control territorial unificado: municipio → provincia → código postal.
const ownerTerritory = setupTerritory(ownerForm);
const phoneVerifyStatus = document.querySelector("#phone-verify-status");
const emailVerifyStatus = document.querySelector("#email-verify-status");

const ownerDetailDialog = document.querySelector("#owner-detail-dialog");
const closeOwnerDetailDialog = document.querySelector("#close-owner-detail-dialog");
const closeOwnerDetailBtn = document.querySelector("#close-owner-detail-btn");
const ownerDetailEditBtn = document.querySelector("#owner-detail-edit-btn");
const ownerDetailDocsGrid = document.querySelector("#owner-detail-docs-grid");
const ownerDetailApprovalPanel = document.querySelector("#owner-detail-approval-panel");
const ownerDetailPropertyCommunity = document.querySelector("#owner-detail-property-community");
const ownerDetailPropertySelect = document.querySelector("#owner-detail-property-select");
const ownerDetailPropertyCount = document.querySelector("#owner-detail-property-count");
const ownerDetailViewPropertyBtn = document.querySelector("#owner-detail-view-property");
const ownerDetailTenantList = document.querySelector("#owner-detail-tenant-list");
const ownerDetailTenantEmpty = document.querySelector("#owner-detail-tenant-empty");

// El diálogo de edición se reutiliza en modo lectura para «Ver» propietario.
let ownerDialogReadOnly = false;

// Pestañas del Formulario de Propietario (5 tabs)
const ownerTabsRoot = document.querySelectorAll(".community-editor-tab[data-owner-tab]");
const ownerPanesRoot = document.querySelectorAll(".community-editor-pane[data-owner-pane]");
const tabDocsBadge = document.querySelector("#tab-docs-badge");
const ownerPropertiesList = document.querySelector("#owner-properties-list");
const ownerPropertyCount = document.querySelector("#owner-property-count");
const ownerPropertyLinkPanel = document.querySelector("#owner-property-link-panel");
const ownerPropertyLinkSelect = document.querySelector("#owner-property-link-select");

// Diálogos de Documentación y Aprobación
const docSuccessDialog = document.querySelector("#doc-success-dialog");
const closeDocSuccessBtn = document.querySelector("#close-doc-success-btn");
const btnViewAdminEmail = document.querySelector("#btn-view-admin-email");

const docViewerDialog = document.querySelector("#doc-viewer-dialog");
const closeDocViewerDialog = document.querySelector("#close-doc-viewer-dialog");
const closeDocViewerBtn = document.querySelector("#close-doc-viewer-btn");

const docRejectDialog = document.querySelector("#doc-reject-dialog");
const docRejectForm = document.querySelector("#doc-reject-form");
const closeDocRejectDialog = document.querySelector("#close-doc-reject-dialog");
const cancelDocRejectBtn = document.querySelector("#cancel-doc-reject-btn");
const docRejectReason = document.querySelector("#doc-reject-reason");

export function visibleOwners() {
  return state.owners.filter(owner => hasPermission("owner:read", owner.id));
}

function ownerCommunityNames(owner) {
  const linked = ownerProperties(owner);
  const names = [...new Set(linked.map(property =>
    property.communityName || state.communities.find(community => community.id === property.communityId)?.name || ""
  ).filter(Boolean))];
  if (names.length === 0 && owner.communityName) names.push(owner.communityName);
  return names;
}

export function renderOwners() {
  const newOwnerBtn = document.querySelector("#new-owner");
  if (newOwnerBtn) newOwnerBtn.hidden = state.activeRole === "owner" || !hasPermission("owner:create");
  if (!ownerTable) {
    ownerTable = createDataTable({
      mount: document.querySelector("#propietarios-table"),
      storageKey: "propietarios",
      searchInput: ownerSearch,
      countEl: ownerCount,
      entitySingular: "propietario",
      entityPlural: "propietarios",
      emptyTitle: "No hay propietarios que mostrar",
      emptyText: "Crea un propietario o ajusta los criterios de búsqueda.",
      getRows: () => visibleOwners(),
      columns: [
        {
          key: "community",
          label: "Comunidad",
          value: owner => ownerCommunityNames(owner).join(", ") || "Sin comunidad",
          defaultVisible: true,
          render: owner => {
            const names = ownerCommunityNames(owner);
            const cell = document.createElement("div");
            if (names.length === 0) {
              cell.textContent = "Sin comunidad";
              return cell;
            }
            names.forEach((name, idx) => {
              if (idx > 0) cell.append(", ");
              const community = state.communities.find(item => item.name === name);
              if (!community) {
                cell.append(name);
                return;
              }
              const link = document.createElement("button");
              link.type = "button";
              link.className = "text-link-button";
              link.textContent = name;
              link.addEventListener("click", () => openCommunityEditor(community.id, "details", true));
              cell.append(link);
            });
            return cell;
          }
        },
        {
          key: "properties",
          label: "Inmueble",
          value: owner => ownerProperties(owner).map(property => property.plot).join(", ") || "Sin inmuebles",
          defaultVisible: true,
          render: owner => {
            const linkedProperties = ownerProperties(owner);
            const cell = document.createElement("div");
            if (linkedProperties.length === 0) {
              cell.textContent = "Sin inmuebles";
              return cell;
            }
            linkedProperties.forEach((property, idx) => {
              if (idx > 0) cell.append(", ");
              const link = document.createElement("button");
              link.type = "button";
              link.className = "text-link-button";
              link.textContent = property.plot || "Inmueble";
              link.addEventListener("click", () => openPropertyEditor(property.id, "general", true));
              cell.append(link);
            });
            return cell;
          }
        },
        {
          key: "name",
          label: "Propietario",
          value: owner => `${owner.name} ${owner.surname}`,
          defaultVisible: true,
          render: owner => {
            const wrap = document.createElement("div");
            const name = document.createElement("span");
            name.className = "community-name";
            name.textContent = `${owner.name} ${owner.surname}`;
            wrap.append(name);
            if (owner.notes) {
              const notes = document.createElement("span");
              notes.className = "community-notes";
              notes.textContent = owner.notes;
              wrap.append(notes);
            }
            return wrap;
          }
        },
        {
          key: "dni",
          label: "DNI / NIE / CIF",
          value: owner => owner.dni,
          render: owner => {
            const badge = document.createElement("span");
            badge.className = "dni-badge";
            badge.textContent = owner.dni;
            return badge;
          }
        },
        { key: "address", label: "Dirección", value: owner => owner.address, defaultVisible: true },
        { key: "city", label: "Municipio", value: owner => owner.city, defaultVisible: true },
        {
          key: "member",
          label: "Condición",
          value: owner => (owner.isMember ? "Asociado" : "No asociado"),
          render: owner => {
            const badge = document.createElement("span");
            badge.className = `status-badge ${owner.isMember ? "member" : "non-member"}`;
            badge.textContent = owner.isMember ? "Asociado" : "No asociado";
            return badge;
          }
        },
        {
          key: "docs",
          label: "Documentación",
          value: owner => getDocBadgeText(getOwnerDocStatus(owner), owner),
          render: owner => {
            const docStatus = getOwnerDocStatus(owner);
            const badge = document.createElement("span");
            badge.className = `status-badge ${getDocBadgeClass(docStatus)}`;
            badge.textContent = getDocBadgeText(docStatus, owner);
            return badge;
          }
        },
        {
          key: "contact",
          label: "Contacto",
          value: owner => `${owner.phone || ""} ${owner.email || ""}`,
          render: owner => {
            const cell = document.createElement("div");
            const phoneSpan = document.createElement("span");
            phoneSpan.textContent = owner.phone ? formatPhone(owner.phone) : "—";
            cell.append(phoneSpan);
            if (owner.email) {
              const emailSpan = document.createElement("span");
              emailSpan.className = "community-notes";
              emailSpan.textContent = owner.email;
              cell.append(emailSpan);
            }
            return cell;
          }
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
          render: owner => {
            const isOwner = state.activeRole === "owner";
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnInfo = iconBtn("btn-info", isOwner ? "Ver mi expediente y documentos" : "Más info y aprobación", `Ficha detallada de ${owner.name} ${owner.surname}`, ICON_INFO);
            btnInfo.addEventListener("click", () => openOwnerDetail(owner.id));
            wrap.append(btnInfo);
            const canEdit = hasPermission(isOwner ? "owner:edit" : "owner:manage", owner.id);
            if (canEdit) {
              const btnDocs = iconBtn("btn-docs", isOwner ? "Gestionar / subir mi documentación" : "Subir y gestionar documentación", `Documentación de ${owner.name} ${owner.surname}`, ICON_DOCS);
              btnDocs.addEventListener("click", () => openOwnerEditor(owner.id, "docs"));
              const btnEdit = iconBtn("btn-edit", isOwner ? "Editar mis datos personales" : "Editar datos personales", `Editar ${owner.name} ${owner.surname}`, ICON_EDIT);
              btnEdit.addEventListener("click", () => openOwnerEditor(owner.id, "general"));
              wrap.append(btnDocs, btnEdit);
            }
            if (!isOwner && hasPermission("owner:delete", owner.id)) {
              const btnDelete = iconBtn("btn-delete", "Eliminar", `Eliminar ${owner.name} ${owner.surname}`, ICON_DELETE);
              btnDelete.addEventListener("click", () => openOwnerDelete(owner.id));
              wrap.append(btnDelete);
            }
            return wrap;
          }
        }
      ]
    });
  } else {
    ownerTable.refresh();
  }
}


export function switchOwnerDialogTab(tab) {
  ownerTabsRoot.forEach(btn => {
    const active = btn.dataset.ownerTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  ownerPanesRoot.forEach(pane => {
    pane.hidden = pane.dataset.ownerPane !== tab;
  });
  if (tab === "docs") {
    renderOwnerDialogDocs();
  }
  if (tab === "property") {
    renderOwnerPropertiesTab();
  }
}

/** Pestaña que contiene un campo determinado (para saltar al validar). */
function ownerTabForField(name) {
  const field = ownerForm.elements[name];
  const pane = field ? field.closest("[data-owner-pane]") : null;
  return pane ? pane.dataset.ownerPane : "general";
}

// --- Pestaña Inmueble: badges como en comunidad (mismo UX) ---
function renderOwnerPropertiesTab() {
  if (!ownerPropertiesList) return;
  if (ownerPropertyCount) ownerPropertyCount.textContent = String(editingOwnerProperties.length);
  ownerPropertiesList.replaceChildren();
  if (ownerPropertyLinkPanel) ownerPropertyLinkPanel.hidden = true;

  if (editingOwnerProperties.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = ownerDialogReadOnly
      ? "Este propietario aún no tiene inmuebles asociados."
      : "Este propietario aún no tiene inmuebles asociados. Asocia uno existente o crea uno nuevo.";
    ownerPropertiesList.append(empty);
    return;
  }

  editingOwnerProperties.forEach(propertyId => {
    const property = state.properties.find(item => item.id === propertyId);
    if (!property) return;
    const communityName = property.communityName ||
      state.communities.find(community => community.id === property.communityId)?.name || "Sin comunidad";
    const capacity = ownerPropertyCapacity(property);
    const currentPct = editingOwnerPropertyPercentages[propertyId] ?? capacity;

    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";
    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${property.plot || "Inmueble"} (${PROPERTY_TYPE_LABELS[property.propertyType] || "Unidad"})`;
    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    sub.textContent = `${communityName} · ${property.address || "Sin dirección"}`;
    info.append(title, sub);

    const pctWrap = document.createElement("label");
    pctWrap.className = "owner-property-pct";
    const pctInput = document.createElement("input");
    pctInput.type = "number";
    pctInput.min = "0";
    pctInput.max = "100";
    pctInput.step = "0.0001";
    pctInput.inputMode = "decimal";
    pctInput.value = String(currentPct);
    pctInput.title = "Porcentaje de titularidad de este propietario sobre el inmueble";
    pctInput.setAttribute("aria-label", `Porcentaje de titularidad en ${property.plot}`);
    pctInput.readOnly = ownerDialogReadOnly;
    pctInput.addEventListener("change", () => {
      if (ownerDialogReadOnly) return;
      let value = Number(pctInput.value.replace(",", "."));
      const previous = editingOwnerPropertyPercentages[propertyId] ?? capacity;
      if (!Number.isFinite(value) || value <= 0) {
        pctInput.value = String(previous);
        toast("Un propietario vinculado debe tener un porcentaje de titularidad mayor a 0. Si no es titular, desvinculalo.");
        return;
      }
      if (value > capacity) {
        value = capacity;
        toast(`El inmueble "${property.plot}" tiene ${capacity}% de titularidad disponible para este propietario.`);
      }
      pctInput.value = String(value);
      editingOwnerPropertyPercentages[propertyId] = value;
    });
    pctWrap.append(pctInput, document.createTextNode("%"));
    info.append(pctWrap);

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = iconBtn("btn-info", "Ver inmueble", `Ver inmueble ${property.plot}`, ICON_VIEW_SM);
    viewBtn.addEventListener("click", () => openPropertyDetail(property.id));

    actions.append(viewBtn);
    if (!ownerDialogReadOnly) {
      const unlinkBtn = iconBtn("btn-delete", "Desvincular de este propietario", `Desvincular ${property.plot}`, ICON_UNLINK_SM);
      unlinkBtn.addEventListener("click", () => {
        editingOwnerProperties = editingOwnerProperties.filter(id => id !== propertyId);
        delete editingOwnerPropertyPercentages[propertyId];
        renderOwnerPropertiesTab();
      });
      actions.append(unlinkBtn);
    }
    card.append(info, actions);
    ownerPropertiesList.append(card);
  });
}

/**
 * Titularidad disponible de un inmueble para el propietario en edición:
 * 100% menos lo que ya tienen los DEMÁS propietarios vinculados.
 */
function ownerPropertyCapacity(property) {
  const usedByOthers = propertyOwnerIds(property)
    .filter(ownerId => ownerId !== state.ui.editingOwnerId)
    .reduce((sum, ownerId) => sum + (Number(property.ownerPercentages?.[ownerId]) || 0), 0);
  return Math.max(0, Math.round((100 - usedByOthers) * 10000) / 10000);
}

function openOwnerPropertyLinkPanel() {
  if (!ownerPropertyLinkPanel || !ownerPropertyLinkSelect) return;
  ownerPropertyLinkPanel.hidden = !ownerPropertyLinkPanel.hidden;
  if (!ownerPropertyLinkPanel.hidden) {
    ownerPropertyLinkSelect.replaceChildren();
    const available = state.properties
      .filter(property => !editingOwnerProperties.includes(property.id))
      .filter(property => ownerPropertyCapacity(property) > 0);
    const blocked = state.properties
      .filter(property => !editingOwnerProperties.includes(property.id))
      .filter(property => ownerPropertyCapacity(property) <= 0).length;
    if (available.length === 0) {
      ownerPropertyLinkSelect.add(new Option(
        blocked > 0
          ? "Los inmuebles disponibles ya alcanzaron el 100% de titularidad"
          : "No hay más inmuebles disponibles",
        ""
      ));
    } else {
      ownerPropertyLinkSelect.add(new Option("Selecciona un inmueble…", ""));
      [...available].sort((a, b) => (a.plot || "").localeCompare(b.plot || "", "es")).forEach(property => {
        const communityName = property.communityName ||
          state.communities.find(community => community.id === property.communityId)?.name || "Sin comunidad";
        ownerPropertyLinkSelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
      });
    }
  }
}

/** Llamado desde inmuebles.js cuando se guarda un inmueble creado desde esta pestaña. */
export function addPropertyToOwnerEditor(ownerId, propertyId) {
  if (state.ui.editingOwnerId !== ownerId) return;
  if (!editingOwnerProperties.includes(propertyId)) {
    editingOwnerProperties.push(propertyId);
  }
  renderOwnerPropertiesTab();
}


export function clearOwnerFieldErrors() {
  ownerForm.querySelectorAll("label.field-error").forEach(label => {
    label.classList.remove("field-error");
    label.querySelectorAll("[aria-invalid='true']").forEach(field => field.removeAttribute("aria-invalid"));
  });
  ownerError.textContent = "";
}

export function markOwnerFieldError(name) {
  const el = ownerForm.elements[name];
  const label = el ? el.closest("label") : null;
  if (label) {
    label.classList.add("field-error");
    el.setAttribute("aria-invalid", "true");
  }
}

export function setVerifyStatus(kind, state, message) {
  const statusEl = kind === "phone" ? phoneVerifyStatus : emailVerifyStatus;
  statusEl.classList.remove("is-verified", "is-error");
  if (state === "verified") statusEl.classList.add("is-verified");
  if (state === "error") statusEl.classList.add("is-error");
  statusEl.textContent = message;
}

export function resetContactVerification(o) {
  const phone = o ? digitsOnly(o.phone, 9) : "";
  const email = o ? (o.email || "").trim().toLowerCase() : "";
  contactVerify.phone = {
    value: phone,
    verified: !!(o && o.phoneVerified && o.phoneVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: o?.phoneVerifiedAt || ""
  };
  contactVerify.email = {
    value: email,
    verified: !!(o && o.emailVerified && o.emailVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: o?.emailVerifiedAt || ""
  };
  setVerifyStatus("phone", contactVerify.phone.verified ? "verified" : "pending",
    contactVerify.phone.verified ? "Teléfono verificado" : "Pendiente de verificación");
  setVerifyStatus("email", contactVerify.email.verified ? "verified" : "pending",
    contactVerify.email.verified ? "Correo verificado" : "Pendiente de verificación");
}

export function propertiesForCommunity(communityId) {
  return state.properties.filter(p => !communityId || p.communityId === communityId);
}

export function openOwnerEditor(id = null, defaultTab = "general", { readOnly = false } = {}) {
  const isOwner = state.activeRole === "owner";
  if (isOwner) {
    id = getCurrentOwnerProfileId();
  }
  const permission = readOnly ? "owner:read" : isOwner ? "owner:edit" : id ? "owner:manage" : "owner:create";
  if (!requirePermission(permission, id || "")) return;
  ownerDialogReadOnly = readOnly;
  state.ui.editingOwnerId = id;
  ownerForm.reset();
  clearOwnerFieldErrors();
  populateCurrencySelect("EUR");

  const o = state.owners.find(item => item.id === id);
  if (readOnly) {
    document.querySelector("#owner-dialog-title").textContent = "Ficha del propietario";
    ownerForm.elements.isMember.disabled = true;
  } else if (isOwner) {
    document.querySelector("#owner-dialog-title").textContent = "Editar mi perfil de propietario";
    ownerForm.elements.isMember.disabled = true;
  } else {
    document.querySelector("#owner-dialog-title").textContent = o ? "Editar propietario" : "Nuevo propietario";
    ownerForm.elements.isMember.disabled = false;
  }

  if (o) {
    Object.entries(o).forEach(([key, value]) => {
      if (ownerForm.elements[key] && key !== "city" && key !== "postalCode" && key !== "province" && key !== "phone" && key !== "otherPhone" && key !== "iban") {
        if (key === "isMember") {
          ownerForm.elements[key].value = String(value);
        } else {
          ownerForm.elements[key].value = value || "";
        }
      }
    });
    ownerForm.elements.phone.value = formatPhone(o.phone);
    ownerForm.elements.otherPhone.value = formatPhone(o.otherPhone);
    ownerForm.elements.iban.value = o.iban ? formatIban(o.iban) : "";
    ownerForm.elements.documentType.value = o.documentType || detectDocumentType(o.dni);
    populateCurrencySelect(o.currency || "EUR");
    ownerTerritory?.set(o.city, o.province, o.postalCode);
    editingDocs.current = o.documents ? JSON.parse(JSON.stringify(o.documents)) : {};
    editingOwnerProperties = ownerProperties(o).map(property => property.id);
    editingOwnerPropertyPercentages = {};
    ownerProperties(o).forEach(property => {
      editingOwnerPropertyPercentages[property.id] = property.ownerPercentages?.[o.id] ?? 100;
    });
    updateOwnerCommunitySelect(o.communityId || "");
  } else {
    editingDocs.current = {};
    editingOwnerProperties = [];
    editingOwnerPropertyPercentages = {};
    updateOwnerCommunitySelect("");
    ownerTerritory?.reset();
  }

  if (tabDocsBadge) tabDocsBadge.textContent = `${["dni", "bankReceipt", "propertyDeed"].filter(key => editingDocs.current[key]).length}/3`;
  updateOwnerUserSelect(o ? o.userId || "" : "");
  updateCommunityTabGating();
  updateCanalOptions();

  // Si el último inmueble guardado en el editor de inmueble quedó pendiente de vincular
  if (state.ui.ownerEditorPropertyContext && state.ui.ownerEditorPropertyContext !== id) {
    state.ui.ownerEditorPropertyContext = null;
  }

  resetContactVerification(o);
  applyOwnerDialogReadOnly(readOnly);
  switchOwnerDialogTab(defaultTab);
  if (!ownerDialog.open) ownerDialog.showModal();
  mountFeeShortcut(document.querySelector("#owner-editor-fees"), "owner", id);
  if (defaultTab === "general" && !readOnly) {
    ownerForm.elements.name.focus();
  }
}

/** Selector de cuenta de sistema vinculada al propietario. */
function updateOwnerUserSelect(selectedUserId = "") {
  const select = document.querySelector("#owner-user-select");
  if (!select) return;
  const current = selectedUserId || ownerForm.elements.userId?.value || "";
  select.replaceChildren(new Option("Sin cuenta de usuario", ""));
  state.users.filter(user => user.activo).forEach(user => {
    const isFree = !state.owners.some(o => o.userId === user.id && o.id !== state.ui.editingOwnerId);
    const label = `${user.nombre || user.usuario} (${user.usuario})${isFree ? "" : " · ya vinculado"}`;
    const option = new Option(label, user.id);
    if (!isFree && user.id !== current) option.disabled = true;
    select.add(option);
  });
  if (current && ![...select.options].some(option => option.value === current)) select.add(new Option("Cuenta vinculada", current));
  if (current) select.value = current;
  select.disabled = !hasPermission("admin:users");
}

export function closeOwnerEditor() {
  applyOwnerDialogReadOnly(false);
  ownerDialog.close();
  if (ownerDialogReadOnly) {
    state.ui.viewingOwnerId = null;
  }
  ownerDialogReadOnly = false;
  state.ui.editingOwnerId = null;
  state.ui.ownerEditorPropertyContext = null;
}

/**
 * Aplica o quita el modo lectura al diálogo de propietario.
 * Reutiliza el mismo formulario y las mismas pestañas que la edición.
 */
function applyOwnerDialogReadOnly(readOnly) {
  ownerDialog.classList.toggle("is-readonly", readOnly);
  ownerForm.querySelectorAll("input, select, textarea").forEach(control => {
    if (control.closest(".fee-panel")) return;
    if (readOnly) {
      if (control.dataset.readonlyWasDisabled === undefined) {
        control.dataset.readonlyWasDisabled = control.disabled ? "1" : "0";
      }
      if (control.dataset.readonlyWasReadOnly === undefined) {
        control.dataset.readonlyWasReadOnly = control.readOnly ? "1" : "0";
      }
      const isChoice = control.tagName === "SELECT" || ["file", "checkbox", "radio"].includes(control.type) || control.classList.contains("combo-box-input");
      if (isChoice) {
        control.disabled = true;
      } else {
        control.readOnly = true;
      }
      return;
    }
    if (control.dataset.readonlyWasDisabled !== undefined) {
      control.disabled = control.dataset.readonlyWasDisabled === "1";
      delete control.dataset.readonlyWasDisabled;
    }
    if (control.dataset.readonlyWasReadOnly !== undefined) {
      control.readOnly = control.dataset.readonlyWasReadOnly === "1";
      delete control.dataset.readonlyWasReadOnly;
    }
  });

  const saveBtn = document.querySelector("#btn-save-owner");
  const editBtn = document.querySelector("#owner-readonly-edit-btn");
  const note = document.querySelector("#owner-readonly-note");
  const cancelBtn = document.querySelector("#cancel-owner-dialog");
  if (saveBtn) saveBtn.hidden = readOnly;
  if (editBtn) editBtn.hidden = !readOnly;
  if (note) note.hidden = !readOnly;
  if (cancelBtn) {
    cancelBtn.title = readOnly ? "Cerrar" : "Cancelar";
    cancelBtn.setAttribute("aria-label", readOnly ? "Cerrar" : "Cancelar");
  }
  if (readOnly && ownerPropertyLinkPanel) ownerPropertyLinkPanel.hidden = true;
  if (ownerForm.elements.userId) ownerForm.elements.userId.disabled = readOnly || !hasPermission("admin:users");
}

/** Selector único de comunidad del tab Comunidad. */
function updateOwnerCommunitySelect(selectedId = "") {
  const select = ownerForm.elements.communityId;
  if (!select) return;
  const current = selectedId || select.value;
  select.replaceChildren(new Option("Selecciona una comunidad…", ""));
  state.communities.forEach(community => select.add(new Option(community.name, community.id)));
  if (current) select.value = current;
}

/** Condición de asociado: habilita/deshabilita los controles LPH del tab Comunidad. */
function updateCommunityTabGating() {
  const isMember = ownerForm.elements.isMember?.value === "true";
  ["votingRights", "legalRepresentative", "notificationPreference"].forEach(name => {
    const field = ownerForm.elements[name];
    if (!field) return;
    field.disabled = !isMember;
    field.closest("label")?.classList.toggle("field-locked", !isMember);
  });
}

/** Opciones del canal habilitadas sólo con el contacto correspondiente verificado. */
function updateCanalOptions() {
  const select = ownerForm.elements.notificationPreference;
  if (!select) return;
  const emailOption = select.querySelector('option[value="email"]');
  const phoneOption = select.querySelector('option[value="phone"]');
  const postalOption = select.querySelector('option[value="postal"]');
  if (emailOption) {
    const verified = contactVerify.email.verified;
    emailOption.disabled = !verified;
    emailOption.textContent = verified ? "Correo electrónico" : "Correo electrónico (pendiente de verificación)";
    emailOption.style.color = verified ? "" : "#9aa7b5";
  }
  if (phoneOption) {
    const verified = contactVerify.phone.verified;
    phoneOption.disabled = !verified;
    phoneOption.textContent = verified ? "Teléfono / Mensajería" : "Teléfono / Mensajería (pendiente de verificación)";
    phoneOption.style.color = verified ? "" : "#9aa7b5";
  }
  if (postalOption) postalOption.style.color = "";
  if (select.selectedOptions[0]?.disabled) select.value = "postal";
}


export function openOwnerDetail(id) {
  if (!requirePermission("owner:read", id)) return;
  const o = state.owners.find(item => item.id === id);
  if (!o) return;
  state.ui.viewingOwnerId = id;
  // «Ver» abre el mismo diálogo de edición, pero en modo lectura.
  openOwnerEditor(id, "general", { readOnly: true });
}

export function renderOwnerPropertySelectors(owner) {
  const linkedProperties = ownerProperties(owner);
  const communityIds = [...new Set(linkedProperties.map(property => property.communityId))];
  const currentCommunity = ownerDetailPropertyCommunity.value;
  ownerDetailPropertyCommunity.replaceChildren(new Option("Todas las comunidades", ""));
  state.communities
    .filter(community => communityIds.includes(community.id))
    .forEach(community => ownerDetailPropertyCommunity.add(new Option(community.name, community.id)));
  if (communityIds.includes(currentCommunity)) ownerDetailPropertyCommunity.value = currentCommunity;

  const selectedCommunity = ownerDetailPropertyCommunity.value;
  const availableProperties = linkedProperties.filter(property =>
    !selectedCommunity || property.communityId === selectedCommunity
  );
  ownerDetailPropertySelect.replaceChildren();
  if (availableProperties.length === 0) {
    ownerDetailPropertySelect.add(new Option("No hay inmuebles asociados", ""));
    ownerDetailPropertySelect.disabled = true;
    ownerDetailViewPropertyBtn.disabled = true;
  } else {
    availableProperties.forEach(property => {
      const communityName = property.communityName ||
        state.communities.find(community => community.id === property.communityId)?.name || "Sin comunidad";
      ownerDetailPropertySelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
    });
    ownerDetailPropertySelect.disabled = false;
    ownerDetailViewPropertyBtn.disabled = false;
  }
  ownerDetailPropertyCount.textContent = `${linkedProperties.length} ${linkedProperties.length === 1 ? "inmueble" : "inmuebles"}`;
}

export function renderOwnerTenants(owner) {
  const tenants = ownerTenants(owner);
  const linkedProperties = ownerProperties(owner);
  const canManageTenants = hasPermission("tenant:manage", owner.id);
  const canDeleteTenants = hasPermission("tenant:delete", owner.id);
  ownerDetailTenantList.replaceChildren();
  ownerDetailTenantEmpty.hidden = tenants.length > 0;
  ownerDetailTenantEmpty.textContent = linkedProperties.length
    ? "Este propietario todavía no tiene inquilinos registrados."
    : "Asocia primero una unidad a este propietario para poder crear un inquilino.";

  tenants.forEach(tenant => {
    const property = linkedProperties.find(item => item.id === tenant.propertyId);
    const card = document.createElement("article");
    card.className = "tenant-card";

    const content = document.createElement("div");
    const name = document.createElement("h4");
    name.textContent = `${tenant.name} ${tenant.surname}`;
    const details = document.createElement("p");
    details.textContent = `${property ? property.plot : "Unidad no disponible"} · Contrato ${getTenantContractStatus(tenant).toLocaleLowerCase("es")}`;
    content.append(name, details);

    const actions = document.createElement("div");
    actions.className = "tenant-card-actions";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "icon-action-btn btn-info";
    viewButton.dataset.tenantAction = "view";
    viewButton.dataset.tenantId = tenant.id;
    viewButton.title = "Ver información";
    viewButton.setAttribute("aria-label", `Ver información de ${tenant.name} ${tenant.surname}`);
    viewButton.innerHTML = sanitizeHtml(`
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `);
    actions.append(viewButton);

    if (canManageTenants) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "icon-action-btn btn-edit";
      editButton.dataset.tenantAction = "edit";
      editButton.dataset.tenantId = tenant.id;
      editButton.title = "Editar";
      editButton.setAttribute("aria-label", `Editar inquilino ${tenant.name} ${tenant.surname}`);
      editButton.innerHTML = sanitizeHtml(`
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          <path d="m15 5 4 4"></path>
        </svg>
      `);
      actions.append(editButton);
    }
    if (canDeleteTenants) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "icon-action-btn btn-delete";
      deleteButton.dataset.tenantAction = "delete";
      deleteButton.dataset.tenantId = tenant.id;
      deleteButton.title = "Eliminar";
      deleteButton.setAttribute("aria-label", `Eliminar inquilino ${tenant.name} ${tenant.surname}`);
      deleteButton.innerHTML = sanitizeHtml(`
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      `);
      actions.append(deleteButton);
    }

    card.append(content, actions);
    ownerDetailTenantList.append(card);
  });
}


export function renderDetailDocsGrid(o) {
  ownerDetailDocsGrid.replaceChildren();
  const docs = o.documents || {};
  const docKeys = [
    { key: "dni", title: "Copia de DNI (ambas caras)" },
    { key: "bankReceipt", title: "Recibo bancario o certificado de titularidad" },
    { key: "propertyDeed", title: "Copia de la escritura del inmueble" }
  ];

  docKeys.forEach(({ key, title }) => {
    const doc = docs[key];
    const card = document.createElement("div");
    card.className = `detail-doc-card ${doc ? (doc.adminApproval?.status === "approved" ? "approved" : "pending") : ""}`;

    if (doc) {
      const isApproved = doc.adminApproval?.status === "approved";
      const isRejected = doc.adminApproval?.status === "rejected";
      let approvalBadge = '<span class="status-badge doc-pending-admin">⏳ Pendiente aprobación</span>';
      if (isApproved) approvalBadge = '<span class="status-badge doc-approved">✓ Aprobado por Admin</span>';
      if (isRejected) approvalBadge = '<span class="status-badge doc-rejected">✗ Rechazado</span>';

      card.innerHTML = sanitizeHtml(`
        <div class="detail-doc-card-top">
          <div>
            <h4 class="detail-doc-name">${title}</h4>
            <p class="detail-doc-sub">${escapeHtml(doc.fileName)} (${Math.round(doc.fileSize / 1024)} KB)</p>
          </div>
          ${approvalBadge}
        </div>
        <div class="detail-doc-metrics">
          <strong>Revisión:</strong> Pendiente de evaluación administrativa · Subido el ${escapeHtml(doc.uploadedAt)}
        </div>
        <div class="detail-doc-actions">
          <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="view-doc" data-key="${key}">👁️ Ver documento</button>
          <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="replace-doc" data-key="${key}">🔄 Cambiar</button>
        </div>
      `);

      card.querySelector('[data-action="view-doc"]').addEventListener("click", () => {
        openDocViewer(o, key, doc);
      });
      card.querySelector('[data-action="replace-doc"]').addEventListener("click", () => {
        closeOwnerDetail();
        openOwnerEditor(o.id, "docs");
      });
    } else {
      card.innerHTML = sanitizeHtml(`
        <div class="detail-doc-card-top">
          <div>
            <h4 class="detail-doc-name">${title}</h4>
            <p class="detail-doc-sub">No aportado por el propietario</p>
          </div>
          <span class="status-badge doc-none">No subido</span>
        </div>
        <div class="detail-doc-metrics" style="color: #64748b;">
          El asociado todavía no ha subido este documento a la plataforma.
        </div>
        <div class="detail-doc-actions">
          <button class="primary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="upload-doc" data-key="${key}">+ Subir documento</button>
        </div>
      `);
      card.querySelector('[data-action="upload-doc"]').addEventListener("click", () => {
        closeOwnerDetail();
        openOwnerEditor(o.id, "docs");
      });
    }

    ownerDetailDocsGrid.append(card);
  });
}

export function renderDetailApprovalPanel(o, docStatus) {
  ownerDetailApprovalPanel.replaceChildren();

  // En modo Propietario: sólo información de estado para el usuario (sin controles administrativos)
  if (state.activeRole === "owner") {
    if (docStatus === "approved") {
      ownerDetailApprovalPanel.className = "admin-approval-panel approved-box";
      ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4 style="color: #15803d;">✓ Expediente Documental Aprobado Oficialmente</h4>
            <p>Toda tu documentación reglamentaria ha sido verificada y formalmente <strong>convalidada por el Administrador</strong>. Tu perfil de asociado está al día.</p>
          </div>
        </div>
      `);
    } else if (docStatus === "pending_admin") {
      ownerDetailApprovalPanel.className = "admin-approval-panel pending-box";
      ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4>⏳ Documentación en Revisión por el Administrador</h4>
            <p>Tus documentos se han recibido y están pendientes de revisión. El Administrador ha sido notificado y resolverá la aprobación de tu expediente en breve.</p>
          </div>
        </div>
      `);
    } else if (docStatus === "rejected") {
      const reason = o.documents?.dni?.adminApproval?.notes || "Documentación no conforme o incompleta.";
      ownerDetailApprovalPanel.className = "admin-approval-panel rejected-box";
      ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4 style="color: #b91c1c;">⚠️ Requerimiento de Subsanación</h4>
            <p>El Administrador solicita correcciones en tu documentación: <em>“${escapeHtml(reason)}”</em>. Por favor, pulsa en 'Editar propietario' para volver a adjuntar los archivos requeridos.</p>
          </div>
        </div>
      `);
    } else {
      ownerDetailApprovalPanel.className = "admin-approval-panel";
      ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4>⚠️ Documentación Obligatoria Pendiente</h4>
            <p>Por favor, sube la copia de tu DNI (ambas caras), recibo bancario y escritura para que el Administrador pueda convalidar tu expediente.</p>
          </div>
        </div>
      `);
    }
    ownerDetailEditBtn.title = "Editar mis datos";
    ownerDetailEditBtn.setAttribute("aria-label", "Editar mis datos");
    return;
  }

  // En modo Administrador: controles completos de verificación, convalidación y rechazo
  ownerDetailEditBtn.title = "Editar propietario";
  ownerDetailEditBtn.setAttribute("aria-label", "Editar propietario");

  if (docStatus === "pending_admin") {
    ownerDetailApprovalPanel.className = "admin-approval-panel pending-box";
    ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4>Resolución Administrativa de Expediente:</h4>
          <p>La documentación está <strong>pendiente de revisión administrativa</strong>. Como Administrador, verifique el expediente y apruebe o solicite subsanación.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="btn-reject-danger" type="button" id="btn-detail-reject">
            ❌ Rechazar / Requerir
          </button>
          <button class="btn-approve-success" type="button" id="btn-detail-approve">
            ✅ Aprobar Documentación Oficial
          </button>
        </div>
      </div>
    `);

    ownerDetailApprovalPanel.querySelector("#btn-detail-approve").addEventListener("click", () => {
      if (confirm(`¿Aprobar formalmente toda la documentación aportada por ${o.name} ${o.surname}?`)) {
        approveAllOwnerDocs(o.id);
      }
    });

    ownerDetailApprovalPanel.querySelector("#btn-detail-reject").addEventListener("click", () => {
      openDocRejectDialog(o.id);
    });

  } else if (docStatus === "approved") {
    const firstDoc = o.documents?.dni;
    const reviewedDate = firstDoc?.adminApproval?.reviewedAt || new Date().toLocaleDateString("es-ES");
    const reviewedBy = firstDoc?.adminApproval?.reviewedBy || "Administrador";

    ownerDetailApprovalPanel.className = "admin-approval-panel approved-box";
    ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4 style="color: #15803d;">✓ Documentación Aprobada Formalmente</h4>
          <p>Expediente revisado y verificado con éxito por <strong>${escapeHtml(reviewedBy)}</strong> el ${escapeHtml(reviewedDate)}. El asociado dispone de su documentación debidamente convalidada.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="secondary-button" style="font-size: 12px;" type="button" id="btn-detail-reopen">Reabrir para revisión</button>
        </div>
      </div>
    `);

    ownerDetailApprovalPanel.querySelector("#btn-detail-reopen").addEventListener("click", () => {
      if (confirm("¿Deseas volver a marcar la documentación como pendiente de revisión?")) {
        reopenOwnerDocs(o.id);
      }
    });

  } else if (docStatus === "rejected") {
    const reason = o.documents?.dni?.adminApproval?.notes || "Documentación no conforme o incompleta.";
    ownerDetailApprovalPanel.className = "admin-approval-panel rejected-box";
    ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4 style="color: #b91c1c;">✗ Documentación Rechazada / Pendiente de Subsanación</h4>
          <p>Motivo indicado al propietario: <em>“${escapeHtml(reason)}”</em></p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="primary-button" style="font-size: 12px;" type="button" id="btn-detail-reopen">Revisar de nuevo</button>
        </div>
      </div>
    `);

    ownerDetailApprovalPanel.querySelector("#btn-detail-reopen").addEventListener("click", () => {
      reopenOwnerDocs(o.id);
    });

  } else {
    ownerDetailApprovalPanel.className = "admin-approval-panel";
    ownerDetailApprovalPanel.innerHTML = sanitizeHtml(`
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4>Expediente en curso:</h4>
          <p>El propietario aún no ha completado la subida de los tres documentos requeridos.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="primary-button" style="font-size: 12px;" type="button" id="btn-detail-subir-docs">Subir documentación</button>
        </div>
      </div>
    `);

    ownerDetailApprovalPanel.querySelector("#btn-detail-subir-docs").addEventListener("click", () => {
      closeOwnerDetail();
      openOwnerEditor(o.id, "docs");
    });
  }
}

async function applyOwnerDocsResolution(ownerId, resolution) {
  const owner = state.owners.find(o => o.id === ownerId);
  if (!owner) return;
  const newDocs = { ...owner.documents };
  ["dni", "bankReceipt", "propertyDeed"].forEach(k => {
    if (newDocs[k]) {
      newDocs[k] = { ...newDocs[k], adminApproval: resolution };
    }
  });
  try {
    await api.updateOwner(ownerId, { ...owner, documents: newDocs });
  } catch (error) {
    toast(error.message);
    return;
  }
  await refreshState();
}

export async function approveAllOwnerDocs(ownerId) {
  if (!requirePermission("document:approve")) return;
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  await applyOwnerDocsResolution(ownerId, {
    status: "approved",
    reviewedAt: dateStr,
    reviewedBy: "Administrador",
    notes: "Aprobado conforme a los requisitos de la asociación."
  });

  // Notificar al buzón personal del propietario
  addOwnerNotification({
    ownerId,
    title: "Documentación oficial convalidada",
    type: "success",
    message: "El Administrador ha verificado y aprobado formalmente toda tu documentación (DNI, domiciliación bancaria y escritura). Tu expediente está al corriente."
  });

  openOwnerDetail(ownerId);
  toast("¡Documentación aprobada formalmente por el Administrador!");
}

export async function reopenOwnerDocs(ownerId) {
  if (!requirePermission("document:approve")) return;
  await applyOwnerDocsResolution(ownerId, {
    status: "pending",
    reviewedAt: null,
    reviewedBy: null,
    notes: ""
  });
  openOwnerDetail(ownerId);
  toast("Expediente reabierto para revisión.");
}

export function openDocRejectDialog(ownerId) {
  if (!requirePermission("document:approve")) return;
  docRejectReason.value = "";
  docRejectDialog.showModal();

  docRejectForm.onsubmit = async e => {
    e.preventDefault();
    if (!requirePermission("document:approve")) {
      docRejectDialog.close();
      return;
    }
    const reason = docRejectReason.value.trim();
    if (!reason) return;

    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    await applyOwnerDocsResolution(ownerId, {
      status: "rejected",
      reviewedAt: dateStr,
      reviewedBy: "Administrador",
      notes: reason
    });

    // Notificar al buzón personal del propietario
    addOwnerNotification({
      ownerId,
      title: "Requerimiento de subsanación documental",
      type: "warning",
      message: `El Administrador ha revisado tu documentación y solicita subsanación: “${reason}”. Por favor, accede a tu perfil y vuelve a adjuntar los documentos solicitados.`
    });

    docRejectDialog.close();
    openOwnerDetail(ownerId);
    toast("Documentación rechazada. Se ha solicitado subsanación al propietario.");
  };
}

export function openDocViewer(owner, docKey, docObj = null) {
  const doc = docObj || (owner?.documents && owner.documents[docKey]);
  if (!doc) return;
  engineOpenDocViewer(owner, docKey, doc);
}

export function closeOwnerDetail() {
  if (ownerDialogReadOnly && ownerDialog.open) {
    closeOwnerEditor();
  }
  ownerDetailDialog.close();
  state.ui.viewingOwnerId = null;
}

/** Tabs de la ficha de lectura de propietario (misma estructura que la edición). */
function switchOwnerDetailTab(tab) {
  document.querySelectorAll("#owner-detail-dialog [data-od-tab]").forEach(btn => {
    const active = btn.dataset.odTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#owner-detail-dialog [data-od-pane]").forEach(pane => {
    pane.hidden = pane.dataset.odPane !== tab;
  });
}

document.querySelectorAll("#owner-detail-dialog [data-od-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchOwnerDetailTab(btn.dataset.odTab));
});

export function openOwnerDelete(id) {
  if (!requirePermission("owner:delete", id)) return;
  const o = state.owners.find(item => item.id === id);
  if (!o) return;
  const conInquilino = ownerProperties(o).filter(property =>
    state.tenants.some(tenant => tenant.propertyId === property.id)
  );
  if (conInquilino.length > 0) {
    toast(`No se puede eliminar a “${o.name} ${o.surname}”: el inmueble “${conInquilino[0].plot}” tiene un inquilino asociado. Desvinculá primero al inquilino.`);
    return;
  }
  state.ui.deletingOwnerId = id;
  document.querySelector("#owner-delete-message").textContent = `Vas a eliminar a “${o.name} ${o.surname}”. Esta acción no se puede deshacer.`;
  ownerDeleteDialog.showModal();
}


export function collectOwnerErrors() {
  const errors = [];
  const marks = [];
  const el = name => ownerForm.elements[name];

  // 1. Identificación
  const nameVal = (el("name")?.value || "").trim();
  if (!nameVal) { errors.push("El nombre es obligatorio."); marks.push("name"); }

  const surnameVal = (el("surname")?.value || "").trim();
  if (!surnameVal) { errors.push("Los apellidos son obligatorios."); marks.push("surname"); }

  const docType = el("documentType")?.value || "DNI";
  const dniVal = (el("dni")?.value || "").trim().toUpperCase();
  if (!dniVal) {
    errors.push("El " + docType + " es obligatorio.");
    marks.push("dni");
  } else if (!isValidIdentityDocument(dniVal, docType)) {
    errors.push(`El ${docType} "${dniVal}" no es válido según algoritmo oficial.`);
    marks.push("dni");
  } else if (state.owners.some(o => (o.dni || "").trim().toUpperCase() === dniVal && o.id !== state.ui.editingOwnerId)) {
    errors.push("Ya existe otro propietario registrado con el documento " + dniVal + ".");
    marks.push("dni");
  }

  // 2. Inmuebles asociados (pestaña Inmueble, modelo N:M)
  const invalidPropertyIds = editingOwnerProperties.filter(propertyId => !state.properties.find(property => property.id === propertyId));
  if (invalidPropertyIds.length > 0) {
    errors.push("Alguno de los inmuebles asociados ya no existe. Revísalos en la pestaña Inmueble.");
    marks.push("__tab:property");
  }

  // 3. Contacto y verificación
  const phoneVal = digitsOnly(el("phone")?.value || "", 9);
  if (!phoneVal || !isValidPhone(phoneVal)) {
    errors.push("El teléfono principal es obligatorio y debe ser un número español válido de 9 dígitos.");
    marks.push("phone");

  }

  const otherPhoneVal = digitsOnly(el("otherPhone")?.value || "", 9);
  if (el("otherPhone")?.value.trim() && !isValidPhone(otherPhoneVal)) {
    errors.push("El teléfono secundario debe ser un número español válido de 9 dígitos.");
    marks.push("otherPhone");
  }

  // Email opcional: sólo se valida formato (y su verificación habilita el canal de correo)
  const emailVal = (el("email")?.value || "").trim();
  if (!emailVal) {
    errors.push("El email es obligatorio.");
    marks.push("email");
  } else if (!isValidEmail(emailVal)) {
    errors.push("El email no tiene un formato válido (ejemplo: usuario@dominio.es).");
    marks.push("email");
  }

  // 4. Dirección y territorio
  const addressVal = (el("address")?.value || "").trim();
  if (!addressVal) {
    errors.push("La dirección es obligatoria.");
    marks.push("address");
  }

  const provVal = el("province")?.value;
  if (!provVal) {
    errors.push("La provincia es obligatoria.");
    marks.push("province");
  }

  const cityVal = el("city")?.value;
  const selectedLocation = getLocationById(cityVal);
  if (!cityVal || !selectedLocation) {
    errors.push("Debes seleccionar un municipio válido.");
    marks.push("city");
  } else if (selectedLocation.province !== provVal) {
    errors.push("El municipio debe pertenecer a la provincia seleccionada.");
    marks.push("province", "city");
  }

  const cpVal = el("postalCode")?.value;
  if (!cpVal || !isValidPostalCode(cpVal) || !selectedLocation?.postalCodes.includes(cpVal)) {
    errors.push("El código postal debe ser válido para el municipio seleccionado.");
    marks.push("postalCode");
  }

  // 5. Domiciliación e IBAN
  const ibanVal = digitsIban(el("iban")?.value || "");
  if (ibanVal && !isValidIban(ibanVal)) {
    errors.push("El IBAN debe tener formato español y superar la validación de control (ES + 22 dígitos).");
    marks.push("iban");
  }

  return { errors, marks, selectedLocation };
}

ownerForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (ownerDialogReadOnly) return;
  if (!requirePermission(state.activeRole === "owner" ? "owner:edit" : "owner:manage", state.ui.editingOwnerId || "")) {
    closeOwnerEditor();
    return;
  }
  clearOwnerFieldErrors();

  const { errors, marks, selectedLocation } = collectOwnerErrors();

  if (errors.length > 0) {
    const tabMark = marks.find(mark => typeof mark === "string" && mark.startsWith("__tab:"));
    if (tabMark) {
      switchOwnerDialogTab(tabMark.slice(6));
    } else {
      switchOwnerDialogTab(ownerTabForField(marks[0] || "name"));
    }
    marks.filter(mark => !String(mark).startsWith("__tab:")).forEach(markOwnerFieldError);

    if (ownerValidationList && ownerValidationDialog) {
      ownerValidationList.replaceChildren();
      errors.forEach(errText => {
        const li = document.createElement("li");
        li.textContent = errText;
        ownerValidationList.append(li);
      });
      ownerValidationDialog.showModal();
    } else {
      alert("Corrige los siguientes errores:\n\n" + errors.join("\n"));
    }
    return;
  }

  const formData = new FormData(ownerForm);
  const data = Object.fromEntries(formData);

  ["name", "surname", "dni", "phone", "otherPhone", "email", "address", "postalCode", "iban", "notes"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });

  data.dni = data.dni.toUpperCase();
  data.isMember = ownerForm.elements.isMember.value === "true";
  data.phone = digitsOnly(data.phone, 9);
  data.otherPhone = digitsOnly(data.otherPhone, 9);
  data.email = data.email.toLowerCase();
  data.iban = digitsIban(data.iban);
  data.city = selectedLocation.name;
  data.province = ownerForm.elements.province.value;

  const isEditing = !!state.ui.editingOwnerId;
  data.id = state.ui.editingOwnerId || crypto.randomUUID();

  // Asignar documentación validada y relacionada sólo y únicamente para este usuario
  data.documents = editingDocs.current;

  const docKeys = ["dni", "bankReceipt", "propertyDeed"];
  const uploadedCount = docKeys.filter(k => !!editingDocs.current[k]).length;
  const previousDocs = state.owners.find(owner => owner.id === state.ui.editingOwnerId)?.documents || {};
  const isCompleteDocs = uploadedCount === 3 && JSON.stringify(previousDocs) !== JSON.stringify(editingDocs.current);

  // El backend resuelve la vinculación N:M de los inmuebles (pestaña Inmueble)
  data.propertyIds = editingOwnerProperties.slice();
  data.userId = ownerForm.elements.userId?.value || "";
  data.phoneVerified = contactVerify.phone.verified;
  data.phoneVerifiedAt = contactVerify.phone.verifiedAt;
  data.emailVerified = contactVerify.email.verified;
  data.emailVerifiedAt = contactVerify.email.verifiedAt;

  try {
    if (isEditing) {
      await api.updateOwner(data.id, data);
    } else {
      await api.createOwner(data);
    }
  } catch (error) {
    ownerError.textContent = error.message;
    return;
  }

  await refreshState();

  // Sincronizar el % de titularidad del propietario en cada inmueble asociado
  for (const propertyId of editingOwnerProperties) {
    const property = state.properties.find(item => item.id === propertyId);
    if (!property || !hasPermission("property:manage", property.id)) continue;
    const ownerIds = [...new Set([...propertyOwnerIds(property), data.id])];
    const ownerPercentages = {
      ...(property.ownerPercentages || {}),
      [data.id]: Number(editingOwnerPropertyPercentages[propertyId] ?? 100)
    };
    try {
      await api.updateProperty(propertyId, { ...property, ownerIds, ownerPercentages });
    } catch (error) {
      toast(`No se pudo actualizar la titularidad en "${property.plot}": ${error.message}`);
    }
  }
  await refreshState();

  closeOwnerEditor();
  toast(isEditing ? "Propietario actualizado." : "Propietario creado.");

  // Si se han subido y validado los documentos requeridos:
  if (isCompleteDocs) {
    // 1. Remitir aviso por correo electrónico al Administrador
    let emailSent;
    try { emailSent = await sendAdminEmailNotification(data, editingDocs.current); } catch (error) { toast(`Los datos se guardaron; el aviso no pudo enviarse: ${error.message}`); return; }

    // 2. Notificar en el buzón personal del propietario
    addOwnerNotification({
      ownerId: data.id,
      title: "Documentación enviada para aprobación",
      type: "info",
      message: "Tus documentos se han recibido y están pendientes de revisión administrativa."
    });

    // 3. Mostrar mensaje emergente al usuario confirmando el proceso completado con éxito
    document.querySelector("#success-audit-dni").textContent = `Documentación recibida: pendiente de revisión administrativa.`;
    document.querySelector("#success-audit-bank").textContent = `Documentación recibida: pendiente de revisión administrativa.`;
    document.querySelector("#success-audit-deed").textContent = `Documentación recibida: pendiente de revisión administrativa.`;

    if (btnViewAdminEmail) {
      btnViewAdminEmail.style.display = state.activeRole === "owner" ? "none" : "";
      btnViewAdminEmail.onclick = () => {
        docSuccessDialog.close();
        openAdminEmail(emailSent.id);
      };
    }

    docSuccessDialog.showModal();
  }
});


// --- Propietarios ---
const ownDniInput = ownerForm.elements.dni;
const ownPhoneInput = ownerForm.elements.phone;
const ownOtherPhoneInput = ownerForm.elements.otherPhone;
const ownIbanInput = ownerForm.elements.iban;

ownDniInput.addEventListener("input", () => {
  ownDniInput.value = ownDniInput.value.toUpperCase();
  ownDniInput.setCustomValidity("");
});

[ownPhoneInput, ownOtherPhoneInput].forEach(inp => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "");
    inp.setCustomValidity("");
  });
});

ownIbanInput.addEventListener("input", () => {
  ownIbanInput.value = ownIbanInput.value.toUpperCase();
  ownIbanInput.setCustomValidity("");
});

ownerForm.elements.email.addEventListener("input", () => {
  ownerForm.elements.email.setCustomValidity("");
});


document.querySelector("#new-owner").addEventListener("click", () => openOwnerEditor(null, "general"));
document.querySelector("#close-owner-dialog").addEventListener("click", () => intentarCerrar(ownerForm, ownerDialog));
document.querySelector("#cancel-owner-dialog").addEventListener("click", () => intentarCerrar(ownerForm, ownerDialog));

// Cierre nativo del diálogo (Esc): restaura el modo lectura y el estado.
ownerDialog.addEventListener("close", () => {
  applyOwnerDialogReadOnly(false);
  if (ownerDialogReadOnly) state.ui.viewingOwnerId = null;
  ownerDialogReadOnly = false;
  state.ui.editingOwnerId = null;
  state.ui.ownerEditorPropertyContext = null;
});

closeOwnerDetailDialog.addEventListener("click", closeOwnerDetail);
closeOwnerDetailBtn.addEventListener("click", closeOwnerDetail);
ownerDetailEditBtn.addEventListener("click", () => {
  const targetId = state.ui.viewingOwnerId;
  closeOwnerDetail();
  if (targetId) openOwnerEditor(targetId, "general");
});
const ownerReadonlyEditBtn = document.querySelector("#owner-readonly-edit-btn");
if (ownerReadonlyEditBtn) {
  ownerReadonlyEditBtn.addEventListener("click", () => {
    const targetId = state.ui.editingOwnerId;
    if (!targetId) return;
    const activeTab = document.querySelector("#owner-dialog .community-editor-tab.active")?.dataset.ownerTab || "general";
    closeOwnerEditor();
    openOwnerEditor(targetId, activeTab);
  });
}
ownerDetailTenantList.addEventListener("click", event => {
  const button = event.target.closest("[data-tenant-action]");
  if (!button) return;
  const tenantId = button.dataset.tenantId;
  if (button.dataset.tenantAction === "view") {
    openTenantDetail(state.ui.viewingOwnerId, tenantId);
  } else if (button.dataset.tenantAction === "edit") {
    openTenantEditor(tenantId);
  } else if (button.dataset.tenantAction === "delete") {
    openTenantDelete(tenantId);
  }
});

ownerDetailPropertyCommunity.addEventListener("change", () => {
  const owner = state.owners.find(item => item.id === state.ui.viewingOwnerId);
  if (owner) renderOwnerPropertySelectors(owner);
});
ownerDetailViewPropertyBtn.addEventListener("click", () => {
  if (ownerDetailPropertySelect.value) openPropertyDetail(ownerDetailPropertySelect.value);
});

document.querySelector("#confirm-owner-delete").addEventListener("click", async () => {
  if (!requirePermission("owner:delete", state.ui.deletingOwnerId || "")) {
    ownerDeleteDialog.close();
    state.ui.deletingOwnerId = null;
    return;
  }
  try {
    await api.deleteOwner(state.ui.deletingOwnerId);
  } catch (error) {
    toast(error.message);
    ownerDeleteDialog.close();
    state.ui.deletingOwnerId = null;
    return;
  }
  await refreshState();
  toast("Propietario eliminado.");
  state.ui.deletingOwnerId = null;
  ownerDeleteDialog.close();
});

// Condición de asociado habilita/deshabilita los controles LPH
ownerForm.elements.isMember?.addEventListener("change", updateCommunityTabGating);

// Pestañas del Formulario de Propietario (6 tabs)
ownerTabsRoot.forEach(btn => {
  btn.addEventListener("click", () => switchOwnerDialogTab(btn.dataset.ownerTab));
});

// --- Pestaña Inmueble: asociar existente / crear nuevo ---
if (ownerPropertyLinkSelect) makeSelectSearchable(ownerPropertyLinkSelect, "Buscar inmueble…");
makeSelectSearchable(document.querySelector("#owner-user-select"), "Buscar cuenta de usuario…");
makeSelectSearchable(ownerDetailPropertySelect, "Buscar inmueble…");
const btnOwnerAddProperty = document.querySelector("#btn-owner-add-property");
if (btnOwnerAddProperty) {
  btnOwnerAddProperty.addEventListener("click", () => {
    // Abre el editor de inmueble sobre el editor de propietario; al guardar se vincula aquí
    if (state.ui.editingOwnerId) {
      state.ui.ownerEditorPropertyContext = state.ui.editingOwnerId;
    }
    openPropertyEditor(null);
  });
}
const btnOwnerLinkProperty = document.querySelector("#btn-owner-link-property");
if (btnOwnerLinkProperty) {
  btnOwnerLinkProperty.addEventListener("click", openOwnerPropertyLinkPanel);
}
const btnOwnerConfirmProperty = document.querySelector("#btn-owner-confirm-property");
if (btnOwnerConfirmProperty) {
  btnOwnerConfirmProperty.addEventListener("click", () => {
    const propertyId = ownerPropertyLinkSelect?.value;
    if (!propertyId) {
      toast("Selecciona un inmueble para asociar.");
      return;
    }
    if (editingOwnerProperties.includes(propertyId)) {
      toast("Ese inmueble ya está asociado a este propietario.");
      return;
    }
    const property = state.properties.find(item => item.id === propertyId);
    const capacity = property ? ownerPropertyCapacity(property) : 0;
    if (capacity <= 0) {
      toast(`No se puede asociar el inmueble "${property?.plot}": ya alcanzó el 100% de titularidad entre sus propietarios.`);
      showValidationErrors([
        `El inmueble "${property?.plot}" ya alcanzó el 100% de titularidad entre sus propietarios, por lo que no se puede vincular a este propietario.`
      ], "No se puede vincular el inmueble");
      return;
    }
    editingOwnerProperties.push(propertyId);
    // Por defecto, el propietario toma la titularidad disponible
    editingOwnerPropertyPercentages[propertyId] = capacity;
    renderOwnerPropertiesTab();
    if (capacity <= 0) {
      toast(`La titularidad de "${property.plot}" llegó al 100%: no se pueden agregar más propietarios.`);
    }
  });
}
const btnOwnerCancelProperty = document.querySelector("#btn-owner-cancel-property");
if (btnOwnerCancelProperty) {
  btnOwnerCancelProperty.addEventListener("click", () => {
    if (ownerPropertyLinkPanel) ownerPropertyLinkPanel.hidden = true;
  });
}

// Diálogo de Éxito al usuario
closeDocSuccessBtn.addEventListener("click", () => docSuccessDialog.close());


// Visor de Documento
if (closeDocViewerDialog) closeDocViewerDialog.addEventListener("click", () => docViewerDialog.close());
if (closeDocViewerBtn) closeDocViewerBtn.addEventListener("click", () => docViewerDialog.close());

// Diálogo de Rechazo
if (closeDocRejectDialog) closeDocRejectDialog.addEventListener("click", () => docRejectDialog.close());
if (cancelDocRejectBtn) cancelDocRejectBtn.addEventListener("click", () => docRejectDialog.close());

// ==========================================
// LISTENERS DE VERIFICACIÓN, COMBOS Y MÁSCARAS
// ==========================================

// Cierre de modal de validación en bloque
const closeOwnerValidationBtn = document.querySelector("#close-owner-validation-btn");
const closeOwnerValidationDialogBtn = document.querySelector("#close-owner-validation-dialog");
[closeOwnerValidationBtn, closeOwnerValidationDialogBtn].forEach(button => {
  if (button && ownerValidationDialog) {
    button.addEventListener("click", () => ownerValidationDialog.close());
  }
});

// 1. Verificación de Teléfono / Email mediante diálogo modal (OTP)
const verificationDialog = document.querySelector("#verification-dialog");
const verificationTitle = document.querySelector("#verification-title");
const verificationDesc = document.querySelector("#verification-desc");
const verificationTarget = document.querySelector("#verification-target");
const verificationDemo = document.querySelector("#verification-demo");
const verificationDemoCode = document.querySelector("#verification-demo-code");
const verificationCodeInput = document.querySelector("#verification-code-input");
const verificationError = document.querySelector("#verification-error");
const verificationResendBtn = document.querySelector("#verification-resend-btn");
const verificationConfirmBtn = document.querySelector("#verification-confirm-btn");
const closeVerificationDialogBtn = document.querySelector("#close-verification-dialog");

let verificationKind = "phone"; // "phone" | "email"

const RESEND_LABEL = "Reenviar código";
let reenvioTimer = 0;

/** Restaura el botón de reenvío (sin cuenta atrás). */
function detenerCuentaAtras() {
  if (reenvioTimer) { clearInterval(reenvioTimer); reenvioTimer = 0; }
  if (verificationResendBtn) { verificationResendBtn.disabled = false; verificationResendBtn.textContent = RESEND_LABEL; }
}

/** Deshabilita el reenvío durante el cooldown informado por el servidor. */
function iniciarCuentaAtras(segundos) {
  detenerCuentaAtras();
  if (!verificationResendBtn || !Number.isFinite(segundos) || segundos <= 0) return;
  let restante = Math.ceil(segundos);
  verificationResendBtn.disabled = true;
  verificationResendBtn.textContent = `${RESEND_LABEL} (${restante}s)`;
  reenvioTimer = setInterval(() => {
    restante -= 1;
    if (restante <= 0) { detenerCuentaAtras(); return; }
    verificationResendBtn.textContent = `${RESEND_LABEL} (${restante}s)`;
  }, 1000);
}

const VERIFICATION_TEXTS = {
  phone: {
    title: "Verificar teléfono",
    desc: "Enviaremos un código de 6 dígitos por SMS al número indicado. El código caduca en pocos minutos y es de un solo uso; el botón de reenvío se reactiva cuando corresponda.",
    label: "Teléfono",
    value: () => digitsOnly(ownPhoneInput?.value || "", 9),
    isValid: value => isValidPhone(value),
    send: value => api.contact.sendPhoneCode(value),
    confirm: (challengeId, code) => api.contact.confirmPhone(challengeId, code)
  },
  email: {
    title: "Verificar email",
    desc: "Enviaremos un código de 6 dígitos por correo electrónico a la dirección indicada. El código caduca en pocos minutos y es de un solo uso; el botón de reenvío se reactiva cuando corresponda.",
    label: "Email",
    value: () => (ownerForm.elements.email?.value || "").trim().toLowerCase(),
    isValid: value => isValidEmail(value),
    send: value => api.contact.sendEmailCode(value),
    confirm: (challengeId, code) => api.contact.confirmEmail(challengeId, code)
  }
};

function setVerificationError(message) {
  if (verificationError) verificationError.textContent = message || "";
}

async function sendVerificationCode() {
  const config = VERIFICATION_TEXTS[verificationKind];
  const value = config.value();
  if (!config.isValid(value)) {
    const message = `Introduce un ${config.label.toLowerCase()} válido antes de solicitar el código.`;
    setVerificationError(message);
    setVerifyStatus(verificationKind, "error", message);
    return false;
  }
  setVerificationError("");
  verificationResendBtn.disabled = true;
  try {
    const res = await config.send(value);
    if (!res.challengeId) {
      throw new Error("El servicio de verificación no devolvió el identificador del reto.");
    }
    Object.assign(contactVerify[verificationKind], {
      pending: true,
      value,
      challengeId: res.challengeId,
      verified: false,
      verifiedAt: ""
    });
    setVerifyStatus(verificationKind, "pending", `Código enviado${res.maskedDestination ? ` a ${res.maskedDestination}` : ""}.`);
    if (res.devCode && verificationDemo && verificationDemoCode) {
      verificationDemo.hidden = false;
      verificationDemoCode.textContent = res.devCode;
    }
    // El cooldown real lo fija el servidor (otpReenvioSegundos).
    iniciarCuentaAtras(res.reenvioSegundos);
    return true;
  } catch (error) {
    contactVerify[verificationKind].challengeId = "";
    const message = error instanceof Error ? error.message : String(error);
    setVerificationError(message);
    setVerifyStatus(verificationKind, "error", message);
    // El envío falló y no se consumió el cooldown: reenvío disponible ya.
    verificationResendBtn.disabled = false;
    return false;
  }
}

function openVerificationDialog(kind) {
  if (!verificationDialog) return;
  verificationKind = kind;
  detenerCuentaAtras();
  const config = VERIFICATION_TEXTS[kind];
  const value = config.value();
  if (!config.isValid(value)) {
    const message = `Introduce un ${config.label.toLowerCase()} válido antes de verificar.`;
    setVerifyStatus(kind, "error", message);
    return;
  }
  verificationTitle.textContent = config.title;
  verificationDesc.textContent = config.desc;
  verificationTarget.textContent = `${config.label}: ${kind === "phone" ? formatPhone(value) : value}`;
  verificationDemo.hidden = true;
  verificationCodeInput.value = "";
  setVerificationError("");
  verificationDialog.showModal();
  sendVerificationCode().then(sent => {
    if (sent) verificationCodeInput.focus();
  });
}

if (verificationResendBtn) {
  verificationResendBtn.addEventListener("click", async () => {
    await sendVerificationCode();
    verificationCodeInput.focus();
  });
}

if (verificationConfirmBtn) {
  verificationConfirmBtn.addEventListener("click", async () => {
    const config = VERIFICATION_TEXTS[verificationKind];
    const code = verificationCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      setVerificationError("Introduce el código de 6 dígitos recibido.");
      return;
    }
    if (!contactVerify[verificationKind].pending || !contactVerify[verificationKind].challengeId ||
        contactVerify[verificationKind].value !== config.value()) {
      setVerificationError("Solicita un código nuevo para el valor actual.");
      return;
    }
    verificationConfirmBtn.disabled = true;
    try {
      const res = await config.confirm(contactVerify[verificationKind].challengeId, code);
      if (res.verified !== true || !res.verifiedAt) {
        throw new Error("El código de verificación no es válido.");
      }
      contactVerify[verificationKind].verified = true;
      contactVerify[verificationKind].pending = false;
      contactVerify[verificationKind].verifiedAt = res.verifiedAt;
      updateCanalOptions();
      setVerifyStatus(verificationKind, "verified",
        verificationKind === "phone" ? "✓ Teléfono verificado por SMS" : "✓ Correo electrónico verificado");
      toast(verificationKind === "phone" ? "Teléfono verificado correctamente." : "Correo electrónico verificado con éxito.");
      verificationDialog.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVerificationError(message);
      setVerifyStatus(verificationKind, "error", message);
    } finally {
      verificationConfirmBtn.disabled = false;
    }
  });
}

[closeVerificationDialogBtn].forEach(button => {
  if (button) button.addEventListener("click", () => verificationDialog.close());
});
verificationDialog?.addEventListener("close", () => detenerCuentaAtras());
verificationDialog?.addEventListener("click", event => {
  if (event.target === verificationDialog) verificationDialog.close();
});

const btnVerifyPhone = document.querySelector("#btn-verify-phone");
if (btnVerifyPhone) {
  btnVerifyPhone.addEventListener("click", () => openVerificationDialog("phone"));
}
const btnVerifyEmail = document.querySelector("#btn-verify-email");
if (btnVerifyEmail) {
  btnVerifyEmail.addEventListener("click", () => openVerificationDialog("email"));
}

// Reset de estado verificado si el usuario cambia el teléfono o el email
if (ownPhoneInput) {
  ownPhoneInput.addEventListener("input", () => {
    const clean = digitsOnly(ownPhoneInput.value, 9);
    ownPhoneInput.value = formatPhone(ownPhoneInput.value);
    if (clean !== contactVerify.phone.value) {
      contactVerify.phone.verified = false;
      contactVerify.phone.verifiedAt = "";
      contactVerify.phone.pending = false;
      contactVerify.phone.challengeId = "";
      setVerifyStatus("phone", "pending", "Pendiente de verificación");
    }
  });
}

if (ownOtherPhoneInput) {
  ownOtherPhoneInput.addEventListener("input", () => {
    ownOtherPhoneInput.value = formatPhone(ownOtherPhoneInput.value);
  });
}

if (ownerForm.elements.email) {
  ownerForm.elements.email.addEventListener("input", () => {
    const current = (ownerForm.elements.email.value || "").trim().toLowerCase();
    if (current !== contactVerify.email.value) {
      contactVerify.email.verified = false;
      contactVerify.email.verifiedAt = "";
      contactVerify.email.pending = false;
      contactVerify.email.challengeId = "";
      setVerifyStatus("email", "pending", "Pendiente de verificación");
    }
  });
}

// 3. Máscara de IBAN
if (ownIbanInput) {
  ownIbanInput.addEventListener("input", () => {
    maskIbanField(ownIbanInput);
  });
}

// 4. Máscara de Referencia Catastral (20 caracteres alfanuméricos)
if (ownerForm.elements.cadastralRef) {
  ownerForm.elements.cadastralRef.addEventListener("input", () => {
    ownerForm.elements.cadastralRef.value = ownerForm.elements.cadastralRef.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  });
}

// 5. La dependencia Provincia → Municipio → Código Postal (con búsqueda y
//    autocompletado bidireccional) la gestiona territory.js (setupTerritory).

