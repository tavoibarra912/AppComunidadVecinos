import { openCascadeWizard } from "./cascade-wizard.js";
import { sanitizeHtml, escapeHtml, richTextHtml } from "../html.js";
import { api } from "../api.js";
import { crearVerificadorContacto } from "../verificacion-contacto.js";
import {
  state,
  refreshState,
  ownerProperties,
  ownerTenants,
  getTenantContractStatus,
  tenantAuthorizationCatalog,
  tenantAuthorizationLabel,
  tenantAuthorizationDescription,
  PROPERTY_TYPE_LABELS,
  hasPermission,
  requirePermission,
} from "../state.js";
import {
  toast,
  isValidEmail,
  isValidDateInput,
  isValidIdentityDocument,
  formatContractDate,
  getLocalDateInputValue,
  makeSelectSearchable,
  showValidationErrors,
  armarGuardia,
  limpiarGuardia,
  intentarCerrar,
  setFormReadonly,
} from "../utils.js";
import { createDataTable } from "../table.js";
import { createExportDropdown } from "../export-client.js";
import { createRichText } from "../rich-text.js";
import { openPropertyDetail, applyEditorReturnContext } from "./inmuebles.js";
import { openOwnerDetail, openOwnerEditor } from "./propietarios.js";
import { createDocumentLibrary } from "../document-library.js";
import { ownerHasSameDocument } from "../tenant-form.js";

import { DocumentValidator, openDocViewer } from "../docs-engine.js";

// Icono de "ver" real (ojo) para los botones de acción de inquilinos.
const ICON_VIEW = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const ICON_CASCADE_DELETE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h12M13 6v3M5 6v14a1 1 0 0 0 1 1h4M7 6V4h4v2"/><path d="M8 10v7"/><path d="M15 12h7M17 10v4M12 18h10M19 16v4"/></svg>`;
const ICON_DOCS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = sanitizeHtml(svg);
  return btn;
}

const tenantContactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
};

const tenantSearch = document.querySelector("#search-tenants");
const tenantResultCount = document.querySelector("#tenant-result-count");
const newTenantBtn = document.querySelector("#new-tenant");
const tenantDialog = document.querySelector("#tenant-dialog");
const tenantForm = document.querySelector("#tenant-form");
// Observaciones con formato (mismo editor que usa la ficha de comunidad).
const tenantNotes = createRichText({
  editor: document.querySelector("#tenant-notes-editor"),
  input: tenantForm.elements.authorizationNotes,
  toolbar: document.querySelector("#tenant-notes-toolbar"),
});
const tenantFormError = document.querySelector("#tenant-form-error");
const tenantOwnerSelect = tenantForm.elements.ownerId;
const tenantPropertySelect = document.querySelector("#tenant-property-link-select");
makeSelectSearchable(tenantPropertySelect, "Buscar inmueble…");
makeSelectSearchable(document.querySelector("#tenant-user-select"), "Buscar cuenta de usuario…");
const tenantDetailDialog = document.querySelector("#tenant-detail-dialog");
const tenantDeleteDialog = document.querySelector("#tenant-delete-dialog");
const tenantDocumentLibraryHost = document.querySelector("#tenant-document-library");
const tenantDetailDocumentLibraryHost = document.querySelector("#tenant-detail-document-library");

let tenantTable = null;
let tenantEditingDocs = {};
let editingTenantPropertyId = null;
let tenantDialogReadOnly = false;

function tenantLibraryData(tenantId) {
  const tenant = state.tenants.find((item) => item.id === tenantId);
  return {
    documents: tenant?.libraryDocuments || [],
    folders: tenant?.documentFolders || [],
  };
}

async function refreshTenantLibraries() {
  await refreshState();
  tenantDocumentsLibrary?.refresh();
  tenantDetailDocumentsLibrary?.refresh();
}

const tenantDocumentsLibrary = tenantDocumentLibraryHost
  ? createDocumentLibrary({
      container: tenantDocumentLibraryHost,
      entityType: "tenant",
      category: "document",
      getEntityId: () => state.ui.editingTenantId,
      getData: () => tenantLibraryData(state.ui.editingTenantId),
      settings: () => state.settings,
      countEl: "#tenant-doc-count",
      canWrite: () =>
        !tenantDialogReadOnly &&
        !!state.ui.editingTenantId &&
        hasPermission("tenant:manage", state.ui.editingTenantId) &&
        hasPermission("document:upload", state.ui.editingTenantId),
      canDelete: () =>
        !tenantDialogReadOnly &&
        !!state.ui.editingTenantId &&
        hasPermission("document:delete", state.ui.editingTenantId),
      onChange: refreshTenantLibraries,
      emptyText: "Subí documentación adicional del inquilino y organizala en carpetas.",
    })
  : null;

const tenantDetailDocumentsLibrary = tenantDetailDocumentLibraryHost
  ? createDocumentLibrary({
      container: tenantDetailDocumentLibraryHost,
      entityType: "tenant",
      category: "document",
      getEntityId: () => state.ui.viewingTenantId,
      getData: () => tenantLibraryData(state.ui.viewingTenantId),
      settings: () => state.settings,
      countEl: "#tenant-detail-library-count",
      canWrite: () => false,
      emptyText: "No hay archivos adicionales cargados.",
    })
  : null;

const tenantPhoneVerifyStatus = document.querySelector("#tenant-phone-verify-status");
const tenantEmailVerifyStatus = document.querySelector("#tenant-email-verify-status");
function tenantSetVerifyStatus(kind, st, message) {
  const el = kind === "phone" ? tenantPhoneVerifyStatus : tenantEmailVerifyStatus;
  if (!el) return;
  el.classList.remove("is-verified", "is-error");
  if (st === "verified") el.classList.add("is-verified");
  if (st === "error") el.classList.add("is-error");
  el.textContent = message;
}

function tenantResetContactVerification(t) {
  const phone = t ? (t.phone || "").replace(/\D/g, "").slice(0, 9) : "";
  const email = t ? (t.email || "").trim().toLowerCase() : "";
  tenantContactVerify.phone = {
    value: phone,
    verified: !!(t && t.phoneVerified && t.phoneVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: t?.phoneVerifiedAt || "",
  };
  tenantContactVerify.email = {
    value: email,
    verified: !!(t && t.emailVerified && t.emailVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: t?.emailVerifiedAt || "",
  };
  tenantSetVerifyStatus(
    "phone",
    tenantContactVerify.phone.verified ? "verified" : "pending",
    tenantContactVerify.phone.verified ? "Teléfono verificado" : "Pendiente de verificación",
  );
  tenantSetVerifyStatus(
    "email",
    tenantContactVerify.email.verified ? "verified" : "pending",
    tenantContactVerify.email.verified ? "Correo verificado" : "Pendiente de verificación",
  );
}

function tenantUpdateCanalOptions() {
  const select = tenantForm.elements.notificationPreference;
  if (!select) return;
  const emailOption = select.querySelector('option[value="email"]');
  const phoneOption = select.querySelector('option[value="phone"]');
  const postalOption = select.querySelector('option[value="postal"]');
  if (emailOption) {
    const verified = tenantContactVerify.email.verified;
    emailOption.disabled = !verified;
    emailOption.textContent = verified
      ? "Correo electrónico"
      : "Correo electrónico (pendiente de verificación)";
    emailOption.style.color = verified ? "" : "#9aa7b5";
  }
  if (phoneOption) {
    const verified = tenantContactVerify.phone.verified;
    phoneOption.disabled = !verified;
    phoneOption.textContent = verified
      ? "Teléfono / Mensajería"
      : "Teléfono / Mensajería (pendiente de verificación)";
    phoneOption.style.color = verified ? "" : "#9aa7b5";
  }
  if (postalOption) postalOption.style.color = "";
  if (select.selectedOptions[0]?.disabled) select.value = "postal";
}

/**
 * El canal preferente solo está disponible si el inquilino autoriza las
 * comunicaciones de la comunidad. setFormReadonly() vuelve a habilitar los
 * controles al abrir el editor, así que este estado debe aplicarse después.
 */
function syncTenantNotificationPreference() {
  const select = tenantForm.elements.notificationPreference;
  if (!select) return;
  const checkbox = tenantForm.querySelector(
    'input[name="authorizations"][value="community_communications"]',
  );
  select.disabled = tenantDialogReadOnly || !(checkbox && checkbox.checked);
}

function tenantRecords() {
  return state.tenants
    .filter((tenant) => hasPermission("tenant:read", tenant.id))
    .map((tenant) => ({
      tenant,
      owner: state.owners.find((owner) => owner.id === tenant.ownerId) || {
        id: "",
        name: "Sin propietario",
        surname: "",
      },
      property: state.properties.find((item) => item.id === tenant.propertyId),
    }));
}

export function renderTenants() {
  if (newTenantBtn)
    newTenantBtn.hidden = state.activeRole === "owner" || !hasPermission("tenant:create");
  if (!hasPermission("tenant:read")) {
    if (tenantResultCount) tenantResultCount.textContent = "0 inquilinos";
    return;
  }
  if (!tenantTable) {
    tenantTable = createDataTable({
      addButton: document.querySelector("#new-tenant"),
      mount: document.querySelector("#inquilinos-table"),
      storageKey: "inquilinos",
      searchInput: tenantSearch,
      countEl: tenantResultCount,
      entitySingular: "inquilino",
      entityPlural: "inquilinos",
      emptyTitle: "No hay inquilinos que mostrar",
      emptyText: "Crea un inquilino o ajusta los criterios de búsqueda.",
      getRows: () => tenantRecords(),
      columns: [
        {
          key: "name",
          label: "Inquilino",
          value: ({ tenant }) => `${tenant.name} ${tenant.surname} ${tenant.documentId || ""}`,
          defaultVisible: true,
          render: ({ tenant }) => {
            const cell = document.createElement("div");
            const name = document.createElement("span");
            name.className = "community-name";
            name.textContent = `${tenant.name} ${tenant.surname}`;
            cell.append(name);
            return cell;
          },
        },
        {
          key: "owner",
          label: "Propietario",
          value: ({ owner }) => `${owner.name} ${owner.surname}`,
          defaultVisible: true,
          render: ({ owner }) => {
            const link = document.createElement("button");
            link.type = "button";
            link.className = "text-link-button";
            link.textContent = `${owner.name} ${owner.surname}`;
            link.addEventListener("click", () =>
              openOwnerEditor(owner.id, "general", { readOnly: true }),
            );
            return link;
          },
        },
        {
          key: "property",
          label: "Unidad",
          value: ({ property }) => (property ? property.plot : ""),
          defaultVisible: true,
          render: ({ property }) => {
            const span = document.createElement("span");
            span.textContent = property
              ? `${property.plot} · ${property.communityName || ""}`
              : "—";
            return span;
          },
        },
        {
          key: "contract",
          label: "Contrato",
          value: ({ tenant }) => `${tenant.contractStart} ${tenant.contractEnd}`,
          defaultVisible: true,
          render: ({ tenant }) => {
            const cell = document.createElement("div");
            const dates = document.createElement("span");
            dates.textContent = `${formatContractDate(tenant.contractStart)} – ${formatContractDate(tenant.contractEnd)}`;
            const badge = document.createElement("span");
            const status = getTenantContractStatus(tenant);
            const key = status === "Próximo" ? "proximo" : status.toLocaleLowerCase("es");
            badge.className = `status-badge tenant-contract-${key}`;
            badge.textContent = status;
            cell.append(dates, badge);
            return cell;
          },
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
          render: ({ owner, tenant }) => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnInfo = iconBtn(
              "btn-info",
              "Más info",
              `Ver información de ${tenant.name} ${tenant.surname}`,
              ICON_VIEW,
            );
            btnInfo.addEventListener("click", () => openTenantEditor(tenant.id, owner.id, true));
            wrap.append(btnInfo);
            const canManage = hasPermission("tenant:manage", tenant.id);
            const btnDocs = iconBtn(
              "btn-docs",
              canManage ? "Subir y gestionar documentación" : "Ver documentación",
              `Documentación de ${tenant.name} ${tenant.surname}`,
              ICON_DOCS,
            );
            btnDocs.addEventListener("click", () =>
              openTenantEditor(tenant.id, owner.id, !canManage, "docs"),
            );
            wrap.append(btnDocs);
            if (hasPermission("tenant:manage", owner.id)) {
              const btnEdit = iconBtn(
                "btn-edit",
                "Editar",
                `Editar inquilino ${tenant.name} ${tenant.surname}`,
                ICON_EDIT,
              );
              btnEdit.addEventListener("click", () => openTenantEditor(tenant.id, owner.id));
              wrap.append(btnEdit);
            }
            if (hasPermission("tenant:delete", owner.id)) {
              const btnDelete = iconBtn(
                "btn-delete",
                "Eliminar",
                `Eliminar inquilino ${tenant.name} ${tenant.surname}`,
                ICON_DELETE,
              );
              btnDelete.addEventListener("click", () => openTenantDelete(tenant.id, owner.id));
              wrap.append(btnDelete);
            }
            if (
              hasPermission("cascade-delete", tenant.id) &&
              hasPermission("tenant:delete", tenant.id)
            ) {
              const advanced = iconBtn(
                "btn-delete",
                "Eliminar (avanzado)",
                `Eliminar con asistente`,
                ICON_CASCADE_DELETE,
              );

              advanced.addEventListener("click", () => openCascadeWizard("tenants", tenant.id));
              wrap.append(advanced);
            }
            return wrap;
          },
        },
      ],
    });
  } else {
    tenantTable.refresh();
  }
  document.querySelector('[data-export-table="tenants"]')?.remove?.();
  const exportWrap = createExportDropdown({
    tableId: "tenants",
    getView: () => tenantTable?.getExportState(),
    getFilters: () => ({ query: tenantSearch?.value || "" }),
  });
  tenantTable.setExportControl?.(exportWrap);
}

function tenantCommunityId() {
  return (
    state.properties.find((property) => property.id === editingTenantPropertyId)?.communityId || ""
  );
}

function selectedTenantAuthorizations() {
  return [...tenantForm.querySelectorAll('input[name="authorizations"]:checked')].map(
    (input) => input.value,
  );
}

/** Pinta las autorizaciones configuradas para la comunidad del inmueble. */
function renderTenantAuthorizations(selectedValues = []) {
  const box = document.querySelector("#tenant-authorizations-list");
  if (!box) return;
  const communityId = tenantCommunityId();
  const catalog = tenantAuthorizationCatalog(communityId);
  const selected = new Set(selectedValues);
  box.replaceChildren();
  if (!catalog.length) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "Esta comunidad todavía no tiene autorizaciones configuradas.";
    box.append(empty);
    return;
  }
  for (const item of catalog) {
    const label = document.createElement("label");
    label.className = "tenant-auth-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "authorizations";
    input.value = item.id;
    input.checked = selected.has(item.id);
    const text = document.createElement("span");
    text.className = "tenant-auth-text";
    const title = document.createElement("span");
    title.className = "tenant-auth-title";
    title.textContent = item.label || "";
    text.append(title);
    if (item.description) {
      const desc = document.createElement("span");
      desc.className = "tenant-auth-desc";
      desc.textContent = item.description;
      text.append(desc);
    }
    label.append(input, text);
    box.append(label);
  }
  const hint = document.querySelector("#tenant-authorizations-hint");
  if (hint) {
    const community = state.communities.find((item) => item.id === communityId);
    hint.textContent = community
      ? `Opciones configuradas para ${community.name}. Se administran en Configuración → Inquilinos.`
      : "Las opciones se configuran por comunidad en Configuración → Inquilinos.";
  }
}

export function updateTenantPropertyOptions(ownerId, selectedPropertyId = "") {
  if (!tenantPropertySelect) return;
  tenantPropertySelect.replaceChildren(new Option("Selecciona un inmueble…", ""));
  const owner = state.owners.find((item) => item.id === ownerId);
  if (!owner) {
    tenantPropertySelect.disabled = true;
    return;
  }
  tenantPropertySelect.disabled = false;
  ownerProperties(owner).forEach((property) => {
    const communityName =
      property.communityName ||
      state.communities.find((item) => item.id === property.communityId)?.name ||
      "Sin comunidad";
    tenantPropertySelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
  });
  tenantPropertySelect.value = selectedPropertyId || "";
}

function switchTenantDialogTab(tab) {
  document.querySelectorAll("#tenant-dialog [data-tenant-tab]").forEach((btn) => {
    const active = btn.dataset.tenantTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#tenant-dialog [data-tenant-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.tenantPane !== tab;
  });
  if (tab === "docs") renderTenantDialogDocs();
  if (tab === "property") renderTenantPropertyTab();
  if (tab === "community") {
    tenantUpdateCanalOptions();
    syncTenantNotificationPreference();
  }
}

function tenantTabForField(element) {
  return element?.closest?.("[data-tenant-pane]")?.dataset.tenantPane || "general";
}

/** Control visible y enfocable de un campo (los combos usan un buscador). */
function tenantFieldFocusTarget(element) {
  if (!element) return null;
  const combo = element.closest?.(".combo-box");
  const search = combo?.querySelector(".combo-box-input");
  if (search && !search.disabled && !search.hidden) return search;
  if (!element.disabled && !element.hidden) return element;
  const label = element.closest?.("label");
  return (
    label?.querySelector("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)") ||
    null
  );
}

function clearTenantValidationMarks() {
  document.querySelectorAll("#tenant-dialog .community-editor-tab.has-error").forEach((tab) => {
    tab.classList.remove("has-error");
    tab.removeAttribute("aria-invalid");
  });
  tenantForm.querySelectorAll("label.field-error").forEach((label) => {
    label.classList.remove("field-error");
  });
  tenantForm.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
}

/**
 * Abre la primera pestaña con error, marca todas las pestañas afectadas y sus
 * campos, enfoca el primer campo inválido y mantiene el resumen habitual.
 */
function revealTenantValidationProblems(problems) {
  clearTenantValidationMarks();
  const tabs = [
    ...document.querySelectorAll("#tenant-dialog .community-editor-tab[data-tenant-tab]"),
  ];
  const problemsByTab = new Map();
  problems.forEach((problem) => {
    const tab = tenantTabForField(problem.element);
    if (!problemsByTab.has(tab)) problemsByTab.set(tab, []);
    problemsByTab.get(tab).push(problem);
  });
  tabs.forEach((tab) => {
    if (!problemsByTab.has(tab.dataset.tenantTab)) return;
    tab.classList.add("has-error");
    tab.setAttribute("aria-invalid", "true");
  });
  const firstTab = tabs.find((tab) => problemsByTab.has(tab.dataset.tenantTab))?.dataset
    .tenantTab;
  if (firstTab) switchTenantDialogTab(firstTab);

  const marked = new Set();
  problems.forEach(({ element }) => {
    if (!element || marked.has(element)) return;
    marked.add(element);
    const label = element.closest("label");
    if (!label) return;
    label.classList.add("field-error");
    element.setAttribute("aria-invalid", "true");
  });

  const firstProblem = firstTab
    ? problems.find((problem) => tenantTabForField(problem.element) === firstTab)
    : problems[0];
  const focusTarget = tenantFieldFocusTarget(firstProblem?.element);
  if (focusTarget) focusTarget.focus();
  showValidationErrors(
    problems.map((problem) => problem.message),
    "Revisa los datos del inquilino",
  );
  const summary = document.querySelector("#validation-dialog");
  if (summary?.open && focusTarget) {
    summary.addEventListener("close", () => focusTarget.focus(), { once: true });
  }
}

export function openTenantEditor(
  id = null,
  ownerId = state.ui.viewingOwnerId,
  readonly = false,
  initialTab = "general",
  initialPropertyId = "",
) {
  const permission = readonly ? "tenant:read" : id ? "tenant:manage" : "tenant:create";
  if (!requirePermission(permission, id || ownerId || "")) return;
  const tenant = id ? state.tenants.find((item) => item.id === id) : null;
  const editingOwner = state.owners.find((item) => item.id === (tenant?.ownerId || ownerId));
  if (id && !tenant) return;
  if (tenant && !readonly && !requirePermission("tenant:manage", tenant.id)) return;
  tenantDialogReadOnly = readonly;
  state.ui.viewingOwnerId = editingOwner?.id || null;
  state.ui.editingTenantId = id;
  tenantForm.dataset.editVersion = tenant?.version || "";
  tenantForm.reset();
  tenantFormError.textContent = "";
  tenantEditingDocs = tenant?.documents ? JSON.parse(JSON.stringify(tenant.documents)) : {};
  editingTenantPropertyId = tenant?.propertyId || initialPropertyId || null;
  tenantResetContactVerification(tenant);

  tenantOwnerSelect.disabled = !!tenant;
  tenantOwnerSelect.replaceChildren(new Option("Selecciona un propietario…", ""));
  state.owners
    .filter(
      (owner) =>
        hasPermission(id ? "tenant:manage" : "tenant:create", owner.id) ||
        (readonly && owner.id === editingOwner?.id),
    )
    .forEach((owner) =>
      tenantOwnerSelect.add(new Option(`${owner.name} ${owner.surname}`, owner.id)),
    );
  tenantOwnerSelect.value = editingOwner?.id || "";

  if (tenant) {
    [
      "name",
      "surname",
      "documentType",
      "documentId",
      "contractType",
      "monthlyRent",
      "deposit",
      "emergencyPhone",
      "phone",
      "email",
      "contractStart",
      "contractEnd",
      "authorizationNotes",
    ].forEach((key) => {
      if (tenantForm.elements[key]) tenantForm.elements[key].value = tenant[key] || "";
    });
  } else {
    tenantForm.elements.contractStart.value = getLocalDateInputValue();
    tenantForm.elements.documentType.value = "DNI";
  }
  tenantNotes?.setValue(tenantForm.elements.authorizationNotes.value || "");
  renderTenantAuthorizations(Array.isArray(tenant?.authorizations) ? tenant.authorizations : []);

  updateTenantPropertyOptions(tenantOwnerSelect.value, editingTenantPropertyId || "");
  renderTenantPropertyTab();
  switchTenantDialogTab(initialTab);
  // Mantiene el contador de la pestaña sincronizado aunque se abra en otra pestaña.
  renderTenantDialogDocs();
  updateTenantUserSelect(tenant?.userId || "");
  document.querySelector("#tenant-dialog-title").textContent = tenant
    ? readonly
      ? `Ver inquilino: ${tenant.name} ${tenant.surname}`
      : "Editar inquilino"
    : "Nuevo inquilino";
  setFormReadonly(tenantForm, readonly);
  tenantUpdateCanalOptions();
  syncTenantNotificationPreference();
  if (tenantForm.elements.userId)
    tenantForm.elements.userId.disabled = readonly || !hasPermission("admin:users");
  armarGuardia(tenantForm, tenantDialog);
  tenantDocumentsLibrary?.setEntity(id);
  if (!tenantDialog.open) tenantDialog.showModal();
}

/** Selector de cuenta de sistema vinculada al inquilino. */
function updateTenantUserSelect(selectedUserId = "") {
  const select = document.querySelector("#tenant-user-select");
  if (!select) return;
  const current = selectedUserId || tenantForm.elements.userId?.value || "";
  select.replaceChildren(new Option("Sin cuenta de usuario", ""));
  state.users
    .filter((user) => user.activo)
    .forEach((user) => {
      const isFree = !state.tenants.some(
        (t) => t.userId === user.id && t.id !== state.ui.editingTenantId,
      );
      const option = new Option(
        `${user.nombre || user.usuario} (${user.usuario})${isFree ? "" : " · ya vinculado"}`,
        user.id,
      );
      if (!isFree && user.id !== current) option.disabled = true;
      select.add(option);
    });
  if (current && ![...select.options].some((option) => option.value === current))
    select.add(new Option("Cuenta vinculada", current));
  if (current) select.value = current;
  select.disabled = !hasPermission("admin:users");
}

export function closeTenantEditor() {
  tenantDialog.close();
  tenantDialogReadOnly = false;
  state.ui.editingTenantId = null;
  tenantEditingDocs = {};
  editingTenantPropertyId = null;
  tenantDocumentsLibrary?.setEntity("");
}

function renderTenantPropertyTab() {
  const list = document.querySelector("#tenant-properties-list");
  if (!list) return;
  list.replaceChildren();
  const panel = document.querySelector("#tenant-property-link-panel");
  if (panel) panel.hidden = true;
  if (!editingTenantPropertyId) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "Este inquilino aún no tiene un inmueble vinculado. Asocia uno existente.";
    list.append(empty);
    return;
  }
  const property = state.properties.find((p) => p.id === editingTenantPropertyId);
  if (!property) {
    editingTenantPropertyId = null;
    renderTenantPropertyTab();
    return;
  }
  const communityName =
    property.communityName ||
    state.communities.find((c) => c.id === property.communityId)?.name ||
    "Sin comunidad";
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
  const actions = document.createElement("div");
  actions.className = "community-property-actions";
  const viewBtn = iconBtn(
    "btn-info",
    "Ver inmueble",
    `Ver inmueble ${property.plot}`,
    ICON_VIEW,
  );
  viewBtn.addEventListener("click", () => openPropertyDetail(property.id));
  const unlinkBtn = iconBtn(
    "btn-delete",
    "Desvincular",
    `Desvincular ${property.plot}`,
    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  );
  unlinkBtn.addEventListener("click", () => {
    editingTenantPropertyId = null;
    renderTenantPropertyTab();
    renderTenantAuthorizations(selectedTenantAuthorizations());
  });
  actions.append(viewBtn, unlinkBtn);
  card.append(info, actions);
  list.append(card);
}

function getFormTenantContext() {
  const property = state.properties.find((p) => p.id === editingTenantPropertyId);
  return {
    id: state.ui.editingTenantId,
    name: tenantForm.elements.name.value.trim() || "Inquilino",
    surname: tenantForm.elements.surname.value.trim() || "",
    dni: tenantForm.elements.documentId.value.trim().toUpperCase() || "00000000T",
    documentId: tenantForm.elements.documentId.value.trim().toUpperCase() || "00000000T",
    communityName: property?.communityName || "Comunidad",
    plot: property?.plot || "Inmueble",
  };
}

function renderTenantDocCard(key, ids) {
  const { cardId, badgeId, dropzoneId, resultId } = ids;
  const card = document.querySelector(cardId);
  const badge = document.querySelector(badgeId);
  const dropzone = document.querySelector(dropzoneId);
  const result = document.querySelector(resultId);
  const doc = tenantEditingDocs[key];
  const sampleBar = card.querySelector(".doc-sample-bar");
  if (doc) {
    card.classList.add("is-valid");
    if (sampleBar) sampleBar.hidden = true;
    const isApproved = doc.adminApproval?.status === "approved";
    const isRejected = doc.adminApproval?.status === "rejected";
    if (isApproved) {
      badge.className = "status-badge doc-approved";
      badge.textContent = "Aprobado por Admin";
    } else if (isRejected) {
      badge.className = "status-badge doc-rejected";
      badge.textContent = "Rechazado";
    } else {
      badge.className = "status-badge doc-pending-admin";
      badge.textContent = "Pendiente de revisión";
    }
    if (result) {
      result.hidden = false;
      result.replaceChildren();
      const header = document.createElement("div");
      header.className = "doc-validation-header";
      header.innerHTML = sanitizeHtml(`
        <div class="doc-file-meta">
          <span class="doc-validation-icon" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </span>
          <div>
            <p class="doc-file-name">${escapeHtml(doc.fileName)}</p>
            <p class="doc-file-size">${Math.round(doc.fileSize / 1024)} KB · Subido el ${escapeHtml(doc.uploadedAt)}</p>
          </div>
        </div>
        <div class="doc-file-actions">
          <button class="icon-action-btn btn-sm btn-info" type="button" data-action="view" title="Ver documento" aria-label="Ver documento">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="icon-action-btn btn-sm btn-delete" type="button" data-action="remove" title="Quitar documento" aria-label="Quitar documento">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path>
            </svg>
          </button>
        </div>
      `);
      const reviewNote = document.createElement("p");
      reviewNote.className = "form-intro";
      if (isApproved) {
        reviewNote.textContent = "Documento revisado y aprobado por el administrador.";
      } else if (isRejected) {
        const reason = doc.adminApproval?.notes ? `: “${doc.adminApproval.notes}”` : "";
        reviewNote.textContent = `El administrador ha rechazado este documento${reason}. Vuelve a subirlo para corregirlo.`;
      } else {
        reviewNote.textContent =
          "La identidad, titularidad y legibilidad requieren revisión administrativa.";
      }
      result.append(header, reviewNote);

      header.querySelector('[data-action="view"]').addEventListener("click", () => {
        openDocViewer(getFormTenantContext(), key, doc);
      });
      header.querySelector('[data-action="remove"]').addEventListener("click", () => {
        if (tenantDialogReadOnly) return;
        delete tenantEditingDocs[key];
        renderTenantDialogDocs();
      });
      header.querySelector('[data-action="remove"]').hidden = tenantDialogReadOnly;
    }
    if (dropzone) dropzone.style.display = "none";
  } else {
    card.classList.remove("is-valid");
    if (sampleBar) sampleBar.hidden = tenantDialogReadOnly;
    badge.className = "status-badge doc-none";
    badge.textContent = "Pendiente";
    if (result) {
      result.hidden = true;
      result.replaceChildren();
    }
    if (dropzone) dropzone.style.display = tenantDialogReadOnly ? "none" : "block";
  }
}

function renderTenantDialogDocs() {
  document.querySelectorAll("#tenant-tab-docs .doc-sample-bar").forEach((bar) => {
    bar.hidden = tenantDialogReadOnly;
  });
  renderTenantDocCard("dni", {
    cardId: "#tenant-card-doc-dni",
    badgeId: "#tenant-badge-doc-dni",
    dropzoneId: "#tenant-dropzone-dni",
    resultId: "#tenant-result-doc-dni",
    inputId: "#tenant-input-doc-dni",
  });
  renderTenantDocCard("contract", {
    cardId: "#tenant-card-doc-contract",
    badgeId: "#tenant-badge-doc-contract",
    dropzoneId: "#tenant-dropzone-contract",
    resultId: "#tenant-result-doc-contract",
    inputId: "#tenant-input-doc-contract",
  });
  const count = (tenantEditingDocs["dni"] ? 1 : 0) + (tenantEditingDocs["contract"] ? 1 : 0);
  const totalDocs = 2;
  const percent = Math.round((count / totalDocs) * 100);
  const statusEl = document.querySelector("#tenant-docs-summary-status");
  if (statusEl) statusEl.textContent = `${count} de ${totalDocs} documentos recibidos`;
  const subtextEl = document.querySelector("#tenant-docs-summary-subtext");
  const summaryBar = document.querySelector("#tenant-docs-summary-bar");
  const percentEl = document.querySelector("#tenant-docs-summary-percent");
  const fillEl = document.querySelector("#tenant-docs-summary-fill");
  const progressEl = document.querySelector("#tenant-docs-summary-progress");
  const countEl = document.querySelector("#tenant-docs-count");
  if (countEl) countEl.textContent = `${count}/${totalDocs}`;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (progressEl) progressEl.setAttribute("aria-valuenow", String(count));
  if (summaryBar) {
    summaryBar.classList.toggle("is-complete", count === totalDocs);
    if (count === totalDocs) {
      if (subtextEl)
        subtextEl.textContent =
          "Archivos recibidos. Al guardar se remitirá un aviso al administrador para su revisión.";
    } else {
      if (subtextEl)
        subtextEl.textContent =
          "Sube la copia del DNI y el contrato de arrendamiento para completar el expediente.";
    }
  }
  const badgeTab = document.querySelector("#tenant-tab-docs-badge");
  if (badgeTab) badgeTab.textContent = `${count}/${totalDocs}`;
}

async function handleTenantDocUpload(file, docType) {
  const badgeId = docType === "contract" ? "#tenant-badge-doc-contract" : "#tenant-badge-doc-dni";
  const badge = document.querySelector(badgeId);
  badge.className = "status-badge doc-pending-admin";
  badge.textContent = "⚡ Analizando...";
  try {
    const context = {
      name: tenantForm.elements.name.value.trim() || "Inquilino",
      surname: tenantForm.elements.surname.value.trim() || "",
      dni: tenantForm.elements.documentId.value.trim().toUpperCase() || "00000000T",
    };
    const result = await DocumentValidator.analyzeFile(
      file,
      docType === "contract" ? "contract" : "dni",
      context,
    );
    if (!result.isValid) {
      badge.className = "status-badge doc-rejected";
      badge.textContent = "Validación fallida";
      alert("Error en la validación automática:\n\n" + result.error);
      renderTenantDialogDocs();
      return;
    }
    tenantEditingDocs[docType] = result.document;
    toast(`Documento "${result.document.title}" validado automáticamente.`);
    renderTenantDialogDocs();
  } catch (err) {
    alert("Error al procesar el archivo: " + err.message);
    renderTenantDialogDocs();
  }
}

// Verificación de contacto vía el diálogo compartido (verificacion-contacto.js)
const verificadorTenant = crearVerificadorContacto({
  alEstado: (kind, estado, msg) => tenantSetVerifyStatus(kind, estado, msg),
  alVerificado: (kind, verifiedAt) => {
    tenantContactVerify[kind].verified = true;
    tenantContactVerify[kind].pending = false;
    tenantContactVerify[kind].verifiedAt = verifiedAt;
    tenantUpdateCanalOptions();
    tenantSetVerifyStatus(
      kind,
      "verified",
      kind === "phone" ? "✓ Teléfono verificado por SMS" : "✓ Correo electrónico verificado",
    );
  },
});

const tenantBtnVerifyPhone = document.querySelector("#tenant-btn-verify-phone");
if (tenantBtnVerifyPhone)
  tenantBtnVerifyPhone.addEventListener("click", () =>
    verificadorTenant.abrir("phone", () => tenantForm.elements.phone.value),
  );
const tenantBtnVerifyEmail = document.querySelector("#tenant-btn-verify-email");
if (tenantBtnVerifyEmail)
  tenantBtnVerifyEmail.addEventListener("click", () =>
    verificadorTenant.abrir("email", () => tenantForm.elements.email.value),
  );

// reset verification on input change
const tenantPhoneInput = tenantForm.elements.phone;
if (tenantPhoneInput)
  tenantPhoneInput.addEventListener("input", () => {
    const clean = (tenantPhoneInput.value || "").replace(/\D/g, "").slice(0, 9);
    tenantPhoneInput.value = clean;
    if (clean !== tenantContactVerify.phone.value) {
      tenantContactVerify.phone.verified = false;
      tenantContactVerify.phone.verifiedAt = "";
      tenantContactVerify.phone.pending = false;
      tenantContactVerify.phone.challengeId = "";
      tenantSetVerifyStatus("phone", "pending", "Pendiente de verificación");
    }
  });
const tenantOtherPhoneInput = tenantForm.elements.otherPhone;
if (tenantOtherPhoneInput)
  tenantOtherPhoneInput.addEventListener("input", () => {
    tenantOtherPhoneInput.value = (tenantOtherPhoneInput.value || "")
      .replace(/\D/g, "")
      .slice(0, 9);
  });
const tenantEmailInput = tenantForm.elements.email;
if (tenantEmailInput)
  tenantEmailInput.addEventListener("input", () => {
    const current = (tenantEmailInput.value || "").trim().toLowerCase();
    if (current !== tenantContactVerify.email.value) {
      tenantContactVerify.email.verified = false;
      tenantContactVerify.email.verifiedAt = "";
      tenantContactVerify.email.pending = false;
      tenantContactVerify.email.challengeId = "";
      tenantSetVerifyStatus("email", "pending", "Pendiente de verificación");
    }
  });

// emergency phone digits
const tenantEmergencyPhoneInput = tenantForm.elements.emergencyPhone;
if (tenantEmergencyPhoneInput)
  tenantEmergencyPhoneInput.addEventListener("input", () => {
    tenantEmergencyPhoneInput.value = (tenantEmergencyPhoneInput.value || "")
      .replace(/\D/g, "")
      .slice(0, 9);
  });

// notification channel gating by checkbox (la lista es dinámica por comunidad)
const tenantAuthorizationsList = document.querySelector("#tenant-authorizations-list");
tenantAuthorizationsList?.addEventListener("change", (event) => {
  if (event.target?.matches?.('input[name="authorizations"]')) {
    if (event.target.checked) tenantUpdateCanalOptions();
    syncTenantNotificationPreference();
  }
});

// Tabs
document.querySelectorAll("#tenant-dialog [data-tenant-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchTenantDialogTab(btn.dataset.tenantTab));
});

// Property link
const btnTenantLinkProperty = document.querySelector("#btn-tenant-link-property");
if (btnTenantLinkProperty)
  btnTenantLinkProperty.addEventListener("click", () => {
    const panel = document.querySelector("#tenant-property-link-panel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const sel = document.querySelector("#tenant-property-link-select");
      if (sel) {
        sel.replaceChildren(new Option("Selecciona un inmueble…", ""));
        const ownerId = tenantOwnerSelect.value;
        const owner = state.owners.find((o) => o.id === ownerId);
        const props = owner ? ownerProperties(owner) : state.properties;
        props.forEach((p) => {
          const cn =
            p.communityName ||
            state.communities.find((c) => c.id === p.communityId)?.name ||
            "Sin comunidad";
          sel.add(new Option(`${p.plot} · ${cn}`, p.id));
        });
        sel.value = editingTenantPropertyId || "";
      }
    }
  });
const btnTenantConfirmProperty = document.querySelector("#btn-tenant-confirm-property");
if (btnTenantConfirmProperty)
  btnTenantConfirmProperty.addEventListener("click", () => {
    const sel = document.querySelector("#tenant-property-link-select");
    if (sel && sel.value) editingTenantPropertyId = sel.value;
    const panel = document.querySelector("#tenant-property-link-panel");
    if (panel) panel.hidden = true;
    renderTenantPropertyTab();
    renderTenantAuthorizations(selectedTenantAuthorizations());
  });
const btnTenantCancelProperty = document.querySelector("#btn-tenant-cancel-property");
if (btnTenantCancelProperty)
  btnTenantCancelProperty.addEventListener("click", () => {
    const panel = document.querySelector("#tenant-property-link-panel");
    if (panel) panel.hidden = true;
  });

// Docs upload
const tenantInputDocDni = document.querySelector("#tenant-input-doc-dni");
if (tenantInputDocDni)
  tenantInputDocDni.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) handleTenantDocUpload(e.target.files[0], "dni");
  });
const tenantInputDocContract = document.querySelector("#tenant-input-doc-contract");
if (tenantInputDocContract)
  tenantInputDocContract.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) handleTenantDocUpload(e.target.files[0], "contract");
  });
const tenantDropzoneDni = document.querySelector("#tenant-dropzone-dni");
if (tenantDropzoneDni) {
  ["dragenter", "dragover"].forEach((ev) =>
    tenantDropzoneDni.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      tenantDropzoneDni.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    tenantDropzoneDni.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      tenantDropzoneDni.classList.remove("dragover");
    }),
  );
  tenantDropzoneDni.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files;
    if (f && f[0]) handleTenantDocUpload(f[0], "dni");
  });
}
const tenantDropzoneContract = document.querySelector("#tenant-dropzone-contract");
if (tenantDropzoneContract) {
  ["dragenter", "dragover"].forEach((ev) =>
    tenantDropzoneContract.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      tenantDropzoneContract.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    tenantDropzoneContract.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      tenantDropzoneContract.classList.remove("dragover");
    }),
  );
  tenantDropzoneContract.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files;
    if (f && f[0]) handleTenantDocUpload(f[0], "contract");
  });
}
const tenantBtnSampleDni = document.querySelector("#tenant-btn-sample-dni");
if (tenantBtnSampleDni)
  tenantBtnSampleDni.addEventListener("click", () => {
    const context = getFormTenantContext();
    const sample = DocumentValidator.generateSampleDocument("dni", context);
    if (!sample) return;
    const badge = document.querySelector("#tenant-badge-doc-dni");
    if (badge) {
      badge.className = "status-badge doc-pending-admin";
      badge.textContent = "⚡ Analizando...";
    }
    window.setTimeout(() => {
      tenantEditingDocs["dni"] = {
        isSample: true,
        key: "dni",
        title: "Copia de DNI / NIE / CIF",
        fileName: sample.fileName,
        fileType: sample.fileType,
        fileSize: sample.fileSize,
        uploadedAt: new Date().toLocaleString("es-ES"),
        dataUrl: sample.dataUrl,
        autoValidation: {
          status: "passed",
          legibilityScore: 98,
          legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
          typeVerified: "Documento de identidad",
          checks: [],
          verifiedAt: new Date().toISOString(),
        },
        adminApproval: { status: "pending", reviewedAt: null, reviewedBy: null, notes: "" },
      };
      toast("Documento oficial de prueba cargado y validado automáticamente.");
      renderTenantDialogDocs();
    }, 350);
  });

const tenantBtnSampleContract = document.querySelector("#tenant-btn-sample-contract");
if (tenantBtnSampleContract)
  tenantBtnSampleContract.addEventListener("click", () => {
    const owner = state.owners.find((o) => o.id === tenantOwnerSelect.value);
    const prop = state.properties.find((p) => p.id === editingTenantPropertyId);
    const context = {
      ...getFormTenantContext(),
      landlord: owner ? `${owner.name} ${owner.surname}` : "Propietario Arrendador",
      plot: prop?.plot || "Vivienda 2.º B",
      communityName: prop?.communityName || "Residencial Peñarrubia",
      monthlyRent: tenantForm.elements.monthlyRent.value.trim() || "750",
      deposit: tenantForm.elements.deposit.value.trim() || "1500",
    };
    const sample = DocumentValidator.generateSampleDocument("contract", context);
    if (!sample) return;
    const badge = document.querySelector("#tenant-badge-doc-contract");
    if (badge) {
      badge.className = "status-badge doc-pending-admin";
      badge.textContent = "⚡ Analizando...";
    }
    window.setTimeout(() => {
      tenantEditingDocs["contract"] = {
        isSample: true,
        key: "contract",
        title: "Contrato de arrendamiento",
        fileName: sample.fileName,
        fileType: sample.fileType,
        fileSize: sample.fileSize,
        uploadedAt: new Date().toLocaleString("es-ES"),
        dataUrl: sample.dataUrl,
        autoValidation: {
          status: "passed",
          legibilityScore: 97,
          legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
          typeVerified: "Contrato de arrendamiento",
          checks: [],
          verifiedAt: new Date().toISOString(),
        },
        adminApproval: { status: "pending", reviewedAt: null, reviewedBy: null, notes: "" },
      };
      toast("Documento oficial de prueba cargado y validado automáticamente.");
      renderTenantDialogDocs();
    }, 350);
  });

// Owner select change
tenantOwnerSelect.addEventListener("change", () => {
  state.ui.viewingOwnerId = tenantOwnerSelect.value || null;
  updateTenantPropertyOptions(tenantOwnerSelect.value);
  editingTenantPropertyId = null;
  renderTenantPropertyTab();
  renderTenantAuthorizations(selectedTenantAuthorizations());
});

newTenantBtn.addEventListener("click", () => openTenantEditor(null, ""));
document
  .querySelector("#close-tenant-dialog")
  .addEventListener("click", () => intentarCerrar(tenantForm, tenantDialog));
document
  .querySelector("#cancel-tenant-dialog")
  .addEventListener("click", () => intentarCerrar(tenantForm, tenantDialog));

// Submit
tenantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (tenantDialogReadOnly) return;
  tenantFormError.textContent = "";
  clearTenantValidationMarks();
  const property = state.properties.find((item) => item.id === editingTenantPropertyId);
  const selectedOwnerId = tenantOwnerSelect.value || "";
  const derivedOwnerId = property?.ownerIds?.includes(selectedOwnerId)
    ? selectedOwnerId
    : property?.ownerIds?.[0] || selectedOwnerId;
  const owner = derivedOwnerId ? state.owners.find((item) => item.id === derivedOwnerId) : null;
  if (
    !requirePermission(
      state.ui.editingTenantId ? "tenant:manage" : "tenant:create",
      state.ui.editingTenantId || owner?.id || "",
    )
  ) {
    tenantFormError.textContent = "No tienes permisos para gestionar este propietario.";
    return;
  }
  const formData = new FormData(tenantForm);
  const values = Object.fromEntries(formData);
  const phone = (values.phone || "").replace(/\D/g, "");
  const email = (values.email || "").trim().toLowerCase();
  const problems = [];
  const addProblem = (message, field) => {
    const element = typeof field === "string" ? tenantForm.elements[field] : field;
    problems.push({ message, element });
  };
  if (!(values.name || "").trim()) addProblem("El nombre es obligatorio.", "name");
  if (!(values.surname || "").trim()) addProblem("Los apellidos son obligatorios.", "surname");
  const documentType = (values.documentType || "DNI").trim().toUpperCase();
  const documentId = (values.documentId || "").trim().toUpperCase();
  if (!documentType) addProblem("El tipo de documento es obligatorio.", "documentType");
  else if (!documentId) addProblem("El DNI / NIE / CIF es obligatorio.", "documentId");
  else if (!isValidIdentityDocument(documentId, documentType))
    addProblem(
      `El ${documentType} "${documentId}" no es válido según el algoritmo oficial de España.`,
      "documentId",
    );
  if (!/^[6-9]\d{8}$/.test(phone))
    addProblem(
      "El teléfono principal debe tener 9 dígitos y comenzar por 6, 7, 8 o 9.",
      "phone",
    );
  if (!isValidEmail(email))
    addProblem("Introduce una dirección de email válida.", "email");
  if (!editingTenantPropertyId)
    addProblem("Selecciona un inmueble asociado a este inquilino.", tenantPropertySelect);
  if (!isValidDateInput(values.contractStart))
    addProblem("Indica una fecha de inicio de contrato válida.", "contractStart");
  if (values.contractEnd && !isValidDateInput(values.contractEnd))
    addProblem("Indica una fecha de fin de contrato válida.", "contractEnd");
  else if (values.contractStart && values.contractEnd && values.contractEnd < values.contractStart)
    addProblem(
      "La fecha de fin no puede ser anterior al inicio del contrato.",
      "contractEnd",
    );
  // verification checks
  // Verificación de email opcional para inquilinos (solo se valida formato)
  if (problems.length) {
    revealTenantValidationProblems(problems);
    return;
  }
  const submittedAuthorizations = formData.getAll("authorizations");
  const allowedAuthorizations = new Set(
    tenantAuthorizationCatalog(tenantCommunityId()).map((item) => item.id),
  );
  if (submittedAuthorizations.some((v) => !allowedAuthorizations.has(v))) {
    showValidationErrors(
      ["Selecciona únicamente autorizaciones disponibles para esta comunidad."],
      "Revisa las autorizaciones",
    );
    return;
  }
  const tenantId = state.ui.editingTenantId || crypto.randomUUID();
  const tenant = {
    id: tenantId,
    name: values.name.trim(),
    surname: values.surname.trim(),
    documentType,
    documentId,
    contractType: values.contractType || "vivienda_habitual",
    monthlyRent: values.monthlyRent ? values.monthlyRent.trim().replace(",", ".") : "",
    deposit: values.deposit ? values.deposit.trim().replace(",", ".") : "",
    phone,
    email,
    propertyId: editingTenantPropertyId,
    contractStart: values.contractStart,
    contractEnd: values.contractEnd || "",
    authorizations: submittedAuthorizations,
    authorizationNotes: (values.authorizationNotes || "").trim(),
    currency: values.currency || "EUR",
    phoneVerified: tenantContactVerify.phone.verified,
    phoneVerifiedAt: tenantContactVerify.phone.verifiedAt,
    emailVerified: tenantContactVerify.email.verified,
    emailVerifiedAt: tenantContactVerify.email.verifiedAt,
    // Si el canal está deshabilitado (sin autorización) no se envía en el
    // formulario: conservamos el valor guardado en lugar de imponer uno.
    notificationPreference:
      values.notificationPreference ||
      state.tenants.find((item) => item.id === tenantId)?.notificationPreference ||
      "email",
    documents: tenantEditingDocs,
  };
  const isEditing = !!state.ui.editingTenantId;
  const payload = {
    id: tenantId,
    ownerId: derivedOwnerId,
    userId: tenantForm.elements.userId?.value || "",
    ...tenant,
  };
  try {
    if (isEditing)
      await api.updateTenant(tenantId, {
        ...payload,
        version: Number(tenantForm.dataset.editVersion),
      });
    else await api.createTenant(payload);
  } catch (error) {
    tenantFormError.textContent = error.message;
    return;
  }
  await refreshState();
  limpiarGuardia(tenantForm);
  closeTenantEditor();
  applyEditorReturnContext(tenant);
  const sameOwnerDocument = !isEditing && ownerHasSameDocument(tenant.documentId, owner);
  toast(
    sameOwnerDocument
      ? "Inquilino creado. El propietario ya figura como habitante del inmueble; no es necesario un contrato consigo mismo."
      : isEditing
        ? "Inquilino actualizado."
        : "Inquilino creado.",
    sameOwnerDocument ? "info" : undefined,
  );
});

// openTenantDetail / closeTenantDetail unchanged
export function openTenantDetail(ownerId, tenantId) {
  if (!requirePermission("tenant:read", tenantId)) return;
  const owner = state.owners.find((item) => item.id === ownerId);
  const tenant = ownerTenants(owner).find((item) => item.id === tenantId);
  if (!owner || !tenant) return;
  state.ui.viewingOwnerId = owner.id;
  state.ui.viewingTenantId = tenantId;
  document.querySelector("#tenant-detail-title").textContent = `${tenant.name} ${tenant.surname}`;
  document.querySelector("#tenant-detail-owner").textContent = `${owner.name} ${owner.surname}`;
  document.querySelector("#tenant-detail-document").textContent =
    tenant.documentId || "No indicado";
  document.querySelector("#tenant-detail-phone").textContent = tenant.phone || "—";
  document.querySelector("#tenant-detail-email").textContent = tenant.email || "—";
  const property = state.properties.find((item) => item.id === tenant.propertyId);
  document.querySelector("#tenant-detail-property").textContent = property
    ? `${property.plot} · ${property.communityName || "Sin comunidad"} · ${property.address || "Sin dirección"}`
    : "Unidad no disponible";
  document.querySelector("#tenant-detail-contract-start").textContent = formatContractDate(
    tenant.contractStart,
  );
  document.querySelector("#tenant-detail-contract-end").textContent = formatContractDate(
    tenant.contractEnd,
  );
  document.querySelector("#tenant-detail-contract-status").textContent =
    getTenantContractStatus(tenant);
  const contractTypeMap = {
    vivienda_habitual: "Vivienda habitual",
    temporada: "Arrendamiento de temporada",
    comercial: "Uso distinto de vivienda (local)",
    cesion: "Cesión o comodato",
  };
  const contractTypeEl = document.querySelector("#tenant-detail-contract-type");
  if (contractTypeEl)
    contractTypeEl.textContent = contractTypeMap[tenant.contractType] || "Vivienda habitual";
  const monthlyRentEl = document.querySelector("#tenant-detail-monthly-rent");
  if (monthlyRentEl)
    monthlyRentEl.textContent = tenant.monthlyRent ? `${tenant.monthlyRent} €` : "—";
  const depositEl = document.querySelector("#tenant-detail-deposit");
  if (depositEl) depositEl.textContent = tenant.deposit ? `${tenant.deposit} €` : "—";
  const emergencyPhoneEl = document.querySelector("#tenant-detail-emergency-phone");
  if (emergencyPhoneEl) emergencyPhoneEl.textContent = tenant.emergencyPhone || "—";
  const authorizations = document.querySelector("#tenant-detail-authorizations");
  authorizations.replaceChildren();
  const tenantCommunity =
    state.properties.find((item) => item.id === tenant.propertyId)?.communityId || "";
  const labels = (Array.isArray(tenant.authorizations) ? tenant.authorizations : []).map((v) => ({
    label: tenantAuthorizationLabel(v, tenantCommunity),
    description: tenantAuthorizationDescription(v, tenantCommunity),
  }));
  if (labels.length === 0)
    labels.push({ label: "No hay autorizaciones predefinidas registradas.", description: "" });
  labels.forEach(({ label, description }) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.className = "tenant-auth-title";
    title.textContent = label;
    item.append(title);
    if (description) {
      const desc = document.createElement("span");
      desc.className = "tenant-auth-desc";
      desc.textContent = description;
      item.append(desc);
    }
    authorizations.append(item);
  });
  const tenantNotesEl = document.querySelector("#tenant-detail-authorization-notes");
  if (tenantNotesEl) {
    if (tenant.authorizationNotes)
      tenantNotesEl.innerHTML = richTextHtml(tenant.authorizationNotes);
    else tenantNotesEl.textContent = "Sin observaciones.";
  }
  const docsListEl = document.querySelector("#tenant-detail-docs-list");
  if (docsListEl) {
    docsListEl.replaceChildren();
    const docKeys = [
      { key: "dni", label: "Copia de DNI / NIE / CIF" },
      { key: "contract", label: "Contrato de arrendamiento" },
    ];
    docKeys.forEach(({ key, label }) => {
      const doc = tenant.documents?.[key];
      const card = document.createElement("div");
      card.className = `doc-upload-card ${doc ? "is-valid" : ""}`;
      const isApproved = doc?.adminApproval?.status === "approved";
      const isRejected = doc?.adminApproval?.status === "rejected";
      const badgeText = doc
        ? isApproved
          ? "Aprobado por Admin"
          : isRejected
            ? "Rechazado"
            : "Pendiente de revisión"
        : "No subido";
      const badgeClass = doc
        ? isApproved
          ? "doc-approved"
          : isRejected
            ? "doc-rejected"
            : "doc-pending-admin"
        : "doc-none";

      card.innerHTML = sanitizeHtml(`
        <div class="doc-card-header" style="margin-bottom:0;">
          <div class="doc-card-title-wrap">
            <span class="doc-card-num">${key === "dni" ? "1" : "2"}</span>
            <div>
              <h3 class="doc-card-title">${escapeHtml(label)}</h3>
              <p class="doc-card-desc">${doc ? `${escapeHtml(doc.fileName)} (${Math.round(doc.fileSize / 1024)} KB · Subido el ${escapeHtml(doc.uploadedAt)})` : "Documento pendiente de aportar por el inquilino."}</p>
            </div>
          </div>
          <span class="status-badge ${badgeClass}">${badgeText}</span>
        </div>
      `);
      if (doc) {
        const actions = document.createElement("div");
        actions.className = "doc-file-actions";
        actions.style.marginTop = "10px";
        const viewBtn = document.createElement("button");
        viewBtn.className = "icon-action-btn btn-sm btn-info";
        viewBtn.type = "button";
        viewBtn.title = `Ver ${label}`;
        viewBtn.setAttribute("aria-label", `Ver ${label}`);
        viewBtn.innerHTML = sanitizeHtml(`
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `);
        viewBtn.onclick = () => {
          openDocViewer(tenant, key, doc);
        };
        actions.append(viewBtn);
        card.append(actions);
      }
      docsListEl.append(card);
    });
    const docsCountEl = document.querySelector("#tenant-detail-docs-count");
    if (docsCountEl) {
      const uploaded = docKeys.filter(({ key }) => tenant.documents?.[key]).length;
      docsCountEl.textContent = `${uploaded}/${docKeys.length}`;
    }
  }
  const viewPropertyButton = document.querySelector("#tenant-detail-view-property");
  viewPropertyButton.hidden = !property;
  viewPropertyButton.onclick = () => {
    if (property) openPropertyDetail(property.id);
  };
  tenantDetailDocumentsLibrary?.setEntity(tenantId);
  document.querySelector("#tenant-detail-edit-btn").hidden = !hasPermission(
    "tenant:manage",
    owner.id,
  );
  if (!tenantDetailDialog.open) tenantDetailDialog.showModal();
}

// Cierre de la ficha de contratos desde la X y el botón inferior.
document
  .querySelector("#close-tenant-detail-dialog")
  ?.addEventListener("click", () => closeTenantDetail());
document
  .querySelector("#close-tenant-detail-btn")
  ?.addEventListener("click", () => closeTenantDetail());

export function closeTenantDetail() {
  tenantDetailDialog.close();
  state.ui.viewingTenantId = null;
}

export function openTenantDelete(tenantId, ownerId = state.ui.viewingOwnerId) {
  if (!requirePermission("tenant:manage", ownerId || "")) return;
  const owner = state.owners.find((item) => item.id === ownerId);
  const tenant = ownerTenants(owner).find((item) => item.id === tenantId);
  if (!owner || !tenant) return;
  state.ui.viewingOwnerId = owner.id;
  state.ui.deletingTenantId = tenantId;
  document.querySelector("#tenant-delete-message").textContent =
    `Vas a eliminar a “${tenant.name} ${tenant.surname}”. Esta acción no se puede deshacer.`;
  tenantDeleteDialog.showModal();
}

document.querySelector("#confirm-tenant-delete").addEventListener("click", async (event) => {
  event.preventDefault();
  const owner = state.owners.find((item) => item.id === state.ui.viewingOwnerId);
  if (!owner || !requirePermission("tenant:manage", owner.id)) return;
  try {
    await api.deleteTenant(state.ui.deletingTenantId);
  } catch (error) {
    toast(error.message);
    tenantDeleteDialog.close();
    state.ui.deletingTenantId = null;
    return;
  }
  await refreshState();
  tenantDeleteDialog.close();
  state.ui.deletingTenantId = null;
  if (window.location.hash.toLowerCase() === "#inquilinos") renderTenants();
  else if (state.ui.viewingOwnerId) openOwnerDetail(state.ui.viewingOwnerId);
  toast("Inquilino eliminado.");
});
