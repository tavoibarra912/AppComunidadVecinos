import { sanitizeHtml, escapeHtml, richTextHtml, htmlToText } from "../html.js";
import { api } from "../api.js";
import { state, refreshState, requirePermission, hasPermission, propertyOwnerIds, ownerProperties, PROPERTY_TYPE_LABELS, getCurrencies } from "../state.js";
import { toast, validateDocumentFiles, setupGenericFileDropzone, makeSelectSearchable, showValidationErrors, fieldLabel, mensajeDeValidez, maskIbanField, armarGuardia, limpiarGuardia, intentarCerrar, setFormReadonly, isValidCommunityNif } from "../utils.js";
import { syncPostalCode, syncCity, selectLocationInForm, getLocationById, isValidPostalCode } from "../territory.js";
import { createDataTable } from "../table.js";
import { openPropertyDetail, openPropertyEditor } from "./inmuebles.js";
import { DocumentValidator, openDocViewer } from "../docs-engine.js";
import { crearVerificadorContacto } from "../verificacion-contacto.js";
import { createRichText } from "../rich-text.js";

let editingCommunityId = null;
let deletingCommunityId = null;
let communityTable = null;
let pendingCommunityFiles = [];
let communityReadonly = false;

const ICON_INFO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const ICON_DOCS = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`;

function populateCommunityCurrencySelect(selected) {
  const select = communityForm.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach(currency => select.add(new Option(currency.name, currency.code)));
  select.value = selected || state.settings?.monedaPorDefecto || "EUR";
}

/** Selector de Administrador de Comunidad (usuario del sistema). */
function updateCommunityAdminSelect(selectedUserId = "") {
  const select = communityForm.elements.adminUserId;
  if (!select) return;
  const current = selectedUserId || select.value;
  select.replaceChildren(new Option("Sin administrador asignado", ""));
  state.users.filter(user => user.activo && (user.rol === "super_admin" || state.roles.find(role => role.nombre === user.rol || role.id === user.rol)?.permisos.includes("community:manage"))).forEach(user => {
    const label = `${user.nombre || user.usuario} ${user.apellido || ""} (${user.usuario})`.trim();
    select.add(new Option(label, user.id));
  });
  if (current && ![...select.options].some(option => option.value === current)) select.add(new Option("Administrador asignado", current));
  if (current) select.value = current;
  // Al asignar un usuario, precarga el campo Administrador de fincas
  select.removeEventListener("change", onAdminUserChange);
  select.addEventListener("change", onAdminUserChange);
}

function onAdminUserChange() {
  const user = state.users.find(u => u.id === communityForm.elements.adminUserId.value);
  if (user && !communityForm.elements.administrator.value) {
    communityForm.elements.administrator.value = `${user.nombre || ""} ${user.apellido || ""}`.trim();
  }
  if (!communityForm.elements.adminUserId.value) return;
}

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = sanitizeHtml(svg);
  return btn;
}

// Elementos de Comunidades
const newCommunityBtn = document.querySelector("#new-community");
const communityCount = document.querySelector("#result-count");
const communitySearch = document.querySelector("#search");
const communityForm = document.querySelector("#community-form");
const communityDialog = document.querySelector("#community-dialog");
const communityDeleteDialog = document.querySelector("#delete-dialog");
const communityError = document.querySelector("#form-error");
const communityNotes = createRichText({
  editor: document.querySelector("#community-notes-editor"),
  input: communityForm.elements.notes,
  toolbar: document.querySelector("#community-notes-toolbar")
});
function applyCommunityReadonly() {
  if (!communityReadonly) return;
  communityForm.querySelectorAll("input,select,textarea,button,a,[tabindex],[role=combobox],[role=button],[contenteditable]").forEach(element => {
    const allowed = element.matches("button[data-community-tab],#close-dialog") || (element.matches('[data-action="view"]') && element.closest("#community-tab-docs"));
    if (!allowed && "disabled" in element && !element.disabled) { if (element.matches("button")) element.dataset.communityReadonlyDisabled = "true"; element.disabled = true; }
    if (!allowed && element.hasAttribute("contenteditable")) {
      if (!element.dataset.communityReadonlyEditable) element.dataset.communityReadonlyEditable = element.getAttribute("contenteditable") || "true";
      element.setAttribute("contenteditable", "false");
      element.setAttribute("aria-readonly", "true");
    }
    if (!allowed && !("disabled" in element)) {
      if (!element.dataset.communityReadonlyProxy) element.dataset.communityReadonlyProxy = JSON.stringify({ tabindex: element.getAttribute("tabindex"), ariaDisabled: element.getAttribute("aria-disabled"), href: element.getAttribute("href") });
      element.tabIndex = -1;
      element.setAttribute("aria-disabled", "true");
      if (element.matches("a")) element.removeAttribute("href");
    }
  });
}
new MutationObserver(applyCommunityReadonly).observe(communityForm, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
communityForm.addEventListener("click", event => {
  if (!communityReadonly) return;
  const allowed = event.target.closest('button[data-community-tab],#close-dialog,#community-tab-docs [data-action="view"]');
  if (!allowed) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);
makeSelectSearchable(communityForm.elements.adminUserId, "Buscar administrador…");

const communityDetailDialog = document.querySelector("#detail-dialog");
const closeDetailDialog = document.querySelector("#close-detail-dialog");
const closeDetailBtn = document.querySelector("#close-detail-btn");
const detailEditBtn = document.querySelector("#detail-edit-btn");
const detailOwnersCount = document.querySelector("#detail-owners-count");
const detailItemPhone = document.querySelector("#detail-item-phone");
const detailItemOtherPhone = document.querySelector("#detail-item-otherPhone");
const detailItemEmail = document.querySelector("#detail-item-email");

export function visibleCommunities() {
  return state.communities.filter(community => hasPermission("community:read", community.id));
}

export function renderCommunities() {
  // Crear comunidades: sólo Super Admin y Admin General
  if (newCommunityBtn) newCommunityBtn.hidden = !hasPermission("community:create");
  if (!communityTable) {
    communityTable = createDataTable({
      mount: document.querySelector("#comunidades-table"),
      storageKey: "comunidades",
      searchInput: communitySearch,
      countEl: communityCount,
      entitySingular: "comunidad",
      entityPlural: "comunidades",
      emptyTitle: state.activeRole === "owner" && state.communities.length === 0 ? "Sin comunidad asignada" : "No hay comunidades que mostrar",
      emptyText: state.activeRole === "owner" && state.communities.length === 0 ? "Un administrador debe vincular tu perfil a un inmueble o comunidad para que aparezca aquí." : "No hay resultados. Revisá los criterios de búsqueda.",
      getRows: () => visibleCommunities(),
      columns: [
        {
          key: "name",
          label: "Comunidad",
          value: community => community.name,
          defaultVisible: true,
          render: community => {
            const wrap = document.createElement("div");
            const name = document.createElement("span");
            name.className = "community-name";
            name.textContent = community.name;
            wrap.append(name);
            if (community.notes) {
              const notes = document.createElement("span");
              notes.className = "community-notes";
              notes.textContent = htmlToText(community.notes);
              wrap.append(notes);
            }
            return wrap;
          }
        },
        {
          key: "nif",
          label: "NIF",
          value: community => community.nif,
          render: community => {
            const badge = document.createElement("span");
            badge.className = "dni-badge";
            badge.textContent = community.nif;
            return badge;
          }
        },
        { key: "address", label: "Dirección", value: community => community.address, defaultVisible: true },
        { key: "city", label: "Municipio", value: community => community.city, defaultVisible: true },
        { key: "province", label: "Provincia", value: community => community.province },
        { key: "postalCode", label: "C. Postal", value: community => community.postalCode },
        { key: "email", label: "Email", value: community => community.email, defaultVisible: true },
        { key: "phone", label: "Teléfono", value: community => community.phone },
        {
          key: "properties",
          label: "Inmuebles",
          groupable: false,
          value: community => String(state.properties.filter(property => property.communityId === community.id).length)
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
          render: community => {
            const isOwner = state.activeRole === "owner";
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnInfo = iconBtn("btn-info", isOwner ? "Ver datos de mi comunidad" : "Ver comunidad", `Ver ${community.name}`, ICON_INFO);
            btnInfo.addEventListener("click", () => openCommunityEditor(community.id, "details", true));
            wrap.append(btnInfo);
            if (!isOwner) {
              if (hasPermission("document:read", community.id)) {
                const btnDocs = iconBtn("btn-docs", "Ver documentación", `Documentación de ${community.name}`, ICON_DOCS);
                btnDocs.addEventListener("click", () => openCommunityEditor(community.id, "docs", !hasPermission("community:edit", community.id)));
                wrap.append(btnDocs);
              }
              if (hasPermission("community:edit", community.id)) {
                const btnEdit = iconBtn("btn-edit", "Editar", `Editar ${community.name}`, ICON_EDIT);
                btnEdit.addEventListener("click", () => openCommunityEditor(community.id));
                wrap.append(btnEdit);
              }
              if (hasPermission("community:delete", community.id)) {
                const btnDelete = iconBtn("btn-delete", "Eliminar", `Eliminar ${community.name}`, ICON_DELETE);
                btnDelete.addEventListener("click", () => openCommunityDelete(community.id));
                wrap.append(btnDelete);
              }
            }
            return wrap;
          }
        }
      ]
    });
  } else {
    communityTable.refresh();
  }
}

export function openCommunityEditor(id = null, defaultTab = "details", readonly = false) {
  if (!requirePermission(id ? (readonly ? "community:read" : "community:edit") : "community:create", id || "")) return;
  editingCommunityId = id;
  communityReadonly = readonly;
  // Los controles dinámicos de una apertura anterior también recuperan su estado.
  communityForm.querySelectorAll("button[data-community-readonly-disabled]").forEach(button => { button.disabled = false; delete button.dataset.communityReadonlyDisabled; });
  communityForm.querySelectorAll("[data-community-readonly-proxy]").forEach(element => {
    const previous = JSON.parse(element.dataset.communityReadonlyProxy);
    for (const [key, attr] of [["tabindex", "tabindex"], ["ariaDisabled", "aria-disabled"], ["href", "href"]]) {
      if (previous[key] === null) element.removeAttribute(attr); else element.setAttribute(attr, previous[key]);
    }
    delete element.dataset.communityReadonlyProxy;
  });
  communityForm.querySelectorAll("[data-community-readonly-editable]").forEach(element => {
    element.setAttribute("contenteditable", element.dataset.communityReadonlyEditable);
    element.removeAttribute("aria-readonly");
    delete element.dataset.communityReadonlyEditable;
  });
  communityForm.reset();
  communityError.textContent = "";
  pendingCommunityFiles = [];
  communityContactVerify.phone.verified = false;
  communityContactVerify.email.verified = false;
  communitySetVerifyStatus("phone", "pending", "Pendiente de verificación");
  communitySetVerifyStatus("email", "pending", "Pendiente de verificación");
  const c = state.communities.find(item => item.id === id);
  const yearSelect = communityForm.elements.constitutionYear;
  yearSelect.replaceChildren(new Option("Sin especificar", ""));
  for (let year = new Date().getFullYear(); year >= 1000; year--) yearSelect.add(new Option(String(year), String(year)));
  if (c?.constitutionYear && ![...yearSelect.options].some(o => o.value === String(c.constitutionYear))) yearSelect.add(new Option(`Revisar: ${c.constitutionYear}`, c.constitutionYear));
  document.querySelector("#dialog-title").textContent = c ? (readonly ? "Ver comunidad" : "Editar comunidad") : "Nueva comunidad";

  switchCommunityEditorTab(defaultTab);
  setFormReadonly(communityForm, readonly);

  if (c) {
    Object.entries(c).forEach(([key, value]) => {
      if (communityForm.elements[key] && key !== "city") {
        communityForm.elements[key].value = value ?? "";
      }
    });
    selectLocationInForm(communityForm, c.city, c.province);
    renderCommunityEditorProperties(c);
  } else {
    const countEl = document.querySelector("#community-edit-property-count");
    if (countEl) countEl.textContent = "0";
    const tabEl = document.querySelector("#community-properties-tab");
    if (tabEl) tabEl.textContent = "Inmuebles (0)";
    const listEl = document.querySelector("#community-edit-properties-list");
    if (listEl) listEl.replaceChildren();
    const panel = document.querySelector("#community-edit-link-panel");
    if (panel) panel.hidden = true;
  }
  communityNotes?.setValue(c?.notes || "");
  renderCommunityDocumentList(c);
  populateCommunityCurrencySelect(c?.currency || "EUR");
  updateCommunityAdminSelect(c?.adminUserId || "");
  applyCommunityReadonly();
  armarGuardia(communityForm, communityDialog);
  communityDialog.showModal();
  if (!readonly) communityForm.elements.name.focus();
}

function switchCommunityEditorTab(tab) {
  document.querySelectorAll(".community-editor-tab[data-community-tab]").forEach(btn => {
    const active = btn.dataset.communityTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".community-editor-pane[data-community-pane]").forEach(pane => {
    pane.hidden = pane.dataset.communityPane !== tab;
  });
}

/** Lista de inmuebles vinculados dentro del diálogo de EDICIÓN (tab Inmuebles). */
function renderCommunityEditorProperties(c) {
  const commProps = state.properties.filter(p => p.communityId === c.id);
  const countEl = document.querySelector("#community-edit-property-count");
  if (countEl) countEl.textContent = String(commProps.length);
  const tabEl = document.querySelector("#community-properties-tab");
  if (tabEl) tabEl.textContent = `Inmuebles (${commProps.length})`;

  const listEl = document.querySelector("#community-edit-properties-list");
  if (!listEl) return;
  listEl.replaceChildren();
  const panel = document.querySelector("#community-edit-link-panel");
  if (panel) panel.hidden = true;

  if (commProps.length === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "form-intro";
    emptyP.textContent = "Esta comunidad aún no tiene inmuebles asociados. Puedes crear uno nuevo o asociar existentes.";
    listEl.append(emptyP);
    return;
  }

  commProps.forEach(prop => {
    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";

    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${prop.plot || "Inmueble"} (${PROPERTY_TYPE_LABELS[prop.propertyType] || "Unidad"})`;

    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    const propOwners = propertyOwnerIds(prop)
      .map(oid => state.owners.find(o => o.id === oid))
      .filter(Boolean)
      .map(o => `${o.name} ${o.surname}`)
      .join(", ");
    sub.textContent = `Propietario(s): ${propOwners || "Sin propietario"} · ${prop.address || ""}`;
    info.append(title, sub);

    if (communityReadonly) { card.append(info); listEl.append(card); return; }

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "icon-action-btn btn-info";
    viewBtn.title = "Ver inmueble";
    viewBtn.innerHTML = sanitizeHtml(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`);
    viewBtn.addEventListener("click", () => {
      communityDialog.close();
      openPropertyDetail(prop.id);
    });

    const docsBtn = document.createElement("button");
    docsBtn.type = "button";
    docsBtn.className = "icon-action-btn btn-docs";
    docsBtn.title = "Documentación del inmueble";
    docsBtn.innerHTML = sanitizeHtml(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>`);
    docsBtn.addEventListener("click", () => {
      communityDialog.close();
      openPropertyEditor(prop.id, "docs", !hasPermission("property:manage", prop.id));
    });

    const unlinkBtn = document.createElement("button");
    unlinkBtn.type = "button";
    unlinkBtn.className = "icon-action-btn btn-delete";
    unlinkBtn.title = "Desvincular de esta comunidad";
    unlinkBtn.innerHTML = sanitizeHtml(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"> <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`);
    unlinkBtn.addEventListener("click", async () => {
      try {
        await api.updateProperty(prop.id, { ...prop, communityId: "", communityName: "" });
      } catch (error) {
        toast(error.message);
        return;
      }
      await refreshState();
      const comm = state.communities.find(item => item.id === c.id);
      if (comm) renderCommunityEditorProperties(comm);
      toast(`Inmueble ${prop.plot} desvinculado de la comunidad.`);
    });

    actions.append(viewBtn, docsBtn, unlinkBtn);
    card.append(info, actions);
    listEl.append(card);
  });
}

// --- Tabs del editor de comunidad ---
document.querySelectorAll(".community-editor-tab[data-community-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchCommunityEditorTab(btn.dataset.communityTab));
});

// --- Crear nuevo inmueble desde el editor de comunidad ---
const btnEditAddProp = document.querySelector("#btn-community-edit-add-property");
if (btnEditAddProp) {
  btnEditAddProp.addEventListener("click", async () => {
    const communityId = await ensureCommunitySavedForProperties();
    if (!communityId) return;
    // El diálogo de comunidad queda abierto debajo; al guardar el inmueble se refresca el tab
    state.ui.communityEditorPropertyContext = communityId;
    openPropertyEditor(null);
    if (propertyFormSelector()) propertyFormSelector().value = communityId;
  });
}

function propertyFormSelector() {
  return document.querySelector("#property-form")?.elements.communityId;
}

/** Refresca el tab de inmuebles del editor de comunidad tras guardar un inmueble. */
export function refreshCommunityEditorAfterPropertySave() {
  const commId = state.ui.communityEditorPropertyContext;
  if (!commId || !communityDialog.open) return;
  state.ui.communityEditorPropertyContext = null;
  const comm = state.communities.find(item => item.id === commId);
  if (comm) renderCommunityEditorProperties(comm);
}

// --- Asociar inmueble existente desde el editor de comunidad ---
const btnEditLinkProp = document.querySelector("#btn-community-edit-link-property");
const editLinkPanel = document.querySelector("#community-edit-link-panel");
const editLinkSelect = document.querySelector("#community-edit-link-property-select");
if (editLinkSelect) makeSelectSearchable(editLinkSelect, "Buscar inmueble…");
if (btnEditLinkProp) {
  btnEditLinkProp.addEventListener("click", async () => {
    const communityId = await ensureCommunitySavedForProperties();
    if (!communityId || !editLinkPanel) return;
    const isHidden = editLinkPanel.hidden;
    editLinkPanel.hidden = !isHidden;
    if (isHidden && editLinkSelect) {
      editLinkSelect.replaceChildren();
      const otherProps = state.properties.filter(p => p.communityId !== communityId);
      if (otherProps.length === 0) {
        editLinkSelect.add(new Option("No hay inmuebles disponibles de otras comunidades", ""));
      } else {
        editLinkSelect.add(new Option("Selecciona un inmueble para reasignar…", ""));
        otherProps.forEach(p => {
          const currComm = state.communities.find(c => c.id === p.communityId);
          editLinkSelect.add(new Option(`${p.plot} · ${p.address} (${currComm ? currComm.name : "Sin comunidad"})`, p.id));
        });
      }
    }
  });
}

const btnEditConfirmLink = document.querySelector("#btn-community-edit-confirm-link");
if (btnEditConfirmLink) {
  btnEditConfirmLink.addEventListener("click", async () => {
    const propId = editLinkSelect?.value;
    if (!propId) {
      toast("Selecciona un inmueble para asociar.");
      return;
    }
    const prop = state.properties.find(p => p.id === propId);
    const comm = state.communities.find(c => c.id === editingCommunityId);
    if (prop && comm) {
      try {
        await api.updateProperty(prop.id, { ...prop, communityId: comm.id, communityName: comm.name });
      } catch (error) {
        toast(error.message);
        return;
      }
      await refreshState();
      renderCommunityEditorProperties(comm);
      toast(`Inmueble ${prop.plot} asociado con éxito a ${comm.name}.`);
    }
  });
}

const btnEditCancelLink = document.querySelector("#btn-community-edit-cancel-link");
if (btnEditCancelLink) {
  btnEditCancelLink.addEventListener("click", () => {
    if (editLinkPanel) editLinkPanel.hidden = true;
  });
}

// --- Tab Documentación de la comunidad ---
// Verificación de contacto de la comunidad (mismo diálogo compartido que inquilinos)
const communityContactVerify = { phone: { value: "", verified: false }, email: { value: "", verified: false } };

function communitySetVerifyStatus(kind, estado, msg) {
  const span = document.querySelector(kind === "phone" ? "#community-phone-verify-status" : "#community-email-verify-status");
  if (!span) return;
  span.textContent = msg || "Pendiente de verificación";
  span.dataset.estado = estado;
  span.style.color = estado === "verified" ? "#15803d" : estado === "error" ? "#b91c1c" : "";
}

const verificadorCommunity = crearVerificadorContacto({
  alEstado: (kind, estado, msg) => communitySetVerifyStatus(kind, estado, msg),
  alVerificado: kind => {
    communityContactVerify[kind].verified = true;
    communitySetVerifyStatus(kind, "verified", kind === "phone" ? "✓ Teléfono verificado por SMS" : "✓ Correo electrónico verificado");
  }
});

document.querySelector("#community-btn-verify-phone")?.addEventListener("click", () => verificadorCommunity.abrir("phone", () => communityForm.elements.phone.value));
document.querySelector("#community-btn-verify-email")?.addEventListener("click", () => verificadorCommunity.abrir("email", () => communityForm.elements.email.value));
communityForm.elements.phone?.addEventListener("input", e => {
  communityContactVerify.phone.verified = false;
  verificadorCommunity.cambiarValor("phone", e.target.value);
});
communityForm.elements.email?.addEventListener("input", e => {
  communityContactVerify.email.verified = false;
  verificadorCommunity.cambiarValor("email", e.target.value);
});

const communityDocumentInput = document.querySelector("#community-document-input");
const communityDocumentList = document.querySelector("#community-document-list");

function getFormCommunityContext() {
  return {
    id: editingCommunityId,
    name: communityForm.elements.name.value.trim() || "Comunidad de Propietarios",
    nif: communityForm.elements.nif.value.trim() || "H12345674",
    communityName: communityForm.elements.name.value.trim() || "Comunidad de Propietarios"
  };
}

function docFileCard({ name, size, doc, isPending, removeAttrs, entityContext }) {
  const card = document.createElement("div");
  card.className = "doc-upload-card is-valid";
  const header = document.createElement("div");
  header.className = "doc-validation-header";
  header.style.marginBottom = "0";
  header.style.paddingBottom = "0";
  header.style.borderBottom = "none";
  header.innerHTML = sanitizeHtml(`
    <div class="doc-file-meta">
      <span class="doc-file-icon">📄</span>
      <div>
        <p class="doc-file-name">${escapeHtml(name)}</p>
        <p class="doc-file-size">${escapeHtml(size)}${isPending ? " · Nuevo (pendiente de guardar)" : (doc?.uploadedAt ? ` · Subido el ${escapeHtml(doc.uploadedAt)}` : "")}</p>
      </div>
    </div>
    <div class="doc-file-actions">
      <button class="btn-doc-action" type="button" data-action="view">👁️ Ver</button>
      <button class="btn-doc-action danger" type="button" data-action="remove">🗑️ Quitar</button>
    </div>
  `);

  header.querySelector('[data-action="view"]').addEventListener("click", () => {
    openDocViewer(entityContext, doc?.id || name, doc || { fileName: name, fileSize: 0, url: "", dataUrl: doc?.dataUrl });
  });

  const removeBtn = header.querySelector('[data-action="remove"]');
  Object.entries(removeAttrs).forEach(([attr, value]) => { removeBtn.dataset[attr] = value; });

  card.append(header);
  return card;
}

function renderCommunityDocumentList(c) {
  if (!communityDocumentList) return;
  const community = c || state.communities.find(item => item.id === editingCommunityId);
  const existing = community ? community.documents || [] : [];
  const totalCount = existing.length + pendingCommunityFiles.length;
  const countEl = document.querySelector("#community-doc-count");
  if (countEl) countEl.textContent = String(totalCount);

  const statusEl = document.querySelector("#community-docs-summary-status");
  const subtextEl = document.querySelector("#community-docs-summary-subtext");
  const summaryBar = document.querySelector("#community-docs-summary-bar");
  if (statusEl) statusEl.textContent = `${totalCount} ${totalCount === 1 ? "documento adjunto" : "documentos adjuntos"}`;
  if (summaryBar) {
    if (totalCount > 0) {
      if (subtextEl) subtextEl.textContent = "Archivos listos. Al pulsar Guardar se sincronizarán con el servidor.";
      summaryBar.style.background = "#f0fdf4";
      summaryBar.style.borderColor = "#86efac";
    } else {
      if (subtextEl) subtextEl.textContent = "Adjunta la documentación oficial para archivar en el expediente de la comunidad.";
      summaryBar.style.background = "#f1f5f9";
      summaryBar.style.borderColor = "#e2e8f0";
    }
  }

  communityDocumentList.replaceChildren();

  if (totalCount === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay documentos cargados para esta comunidad.";
    communityDocumentList.append(empty);
    return;
  }

  const context = getFormCommunityContext();

  existing.forEach(doc => {
    communityDocumentList.append(docFileCard({
      name: doc.fileName,
      size: `${Math.ceil((doc.fileSize || 0) / 1024)} KB`,
      doc,
      isPending: false,
      removeAttrs: { communityDocumentId: doc.id },
      entityContext: context
    }));
  });

  pendingCommunityFiles.forEach((file, index) => {
    communityDocumentList.append(docFileCard({
      name: file.name,
      size: `${Math.ceil(file.size / 1024)} KB`,
      doc: {
        fileName: file.name,
        fileSize: file.size,
        dataUrl: file.dataUrl,
        fileType: file.type || "application/pdf"
      },
      isPending: true,
      removeAttrs: { pendingCommunityFile: String(index) },
      entityContext: context
    }));
  });
}

const btnSampleCommunityDoc = document.querySelector("#btn-sample-community-doc");
if (btnSampleCommunityDoc) {
  btnSampleCommunityDoc.addEventListener("click", () => {
    const context = getFormCommunityContext();
    const sample = DocumentValidator.generateSampleDocument("communityMinute", context);
    if (!sample) return;
    const svgText = decodeURIComponent(sample.dataUrl.split(",")[1]);
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const file = new File([blob], sample.fileName, { type: "image/svg+xml" });
    file.dataUrl = sample.dataUrl;
    pendingCommunityFiles.push(file);
    toast("Documento oficial de prueba cargado y validado automáticamente.");
    renderCommunityDocumentList();
  });
}

if (communityDocumentInput) {
  setupGenericFileDropzone(document.querySelector("#community-doc-dropzone"), communityDocumentInput);
  communityDocumentInput.addEventListener("change", () => {
    const messages = validateDocumentFiles(communityDocumentInput.files);
    if (messages.length) {
      toast(messages.join(" "));
      return;
    }
    pendingCommunityFiles.push(...communityDocumentInput.files);
    communityDocumentInput.value = "";
    renderCommunityDocumentList();
  });
}

if (communityDocumentList) {
  communityDocumentList.addEventListener("click", async event => {
    const removeBtn = event.target.closest("[data-community-document-id]");
    if (removeBtn) {
      try {
        await api.deleteDocument(removeBtn.dataset.communityDocumentId);
      } catch (error) {
        toast(error.message);
        return;
      }
      await refreshState();
      renderCommunityDocumentList();
      toast("Documento eliminado.");
      return;
    }
    const pendingBtn = event.target.closest("[data-pending-community-file]");
    if (pendingBtn) {
      pendingCommunityFiles.splice(Number(pendingBtn.dataset.pendingCommunityFile), 1);
      renderCommunityDocumentList();
    }
  });
}

export function closeCommunityEditor() {
  communityDialog.close();
  editingCommunityId = null;
  state.ui.communityEditorPropertyContext = null;
}

export function openCommunityDetail(id) {
  if (!requirePermission("community:read", id)) return;
  const c = state.communities.find(item => item.id === id);
  if (!c) return;
  state.ui.viewingCommunityId = id;
  switchCommunityDetailTab("general");

  const communityPropertyIds = new Set(
    state.properties.filter(property => property.communityId === c.id).map(property => property.id)
  );
  const linkedOwners = state.owners.filter(owner =>
    owner.communityId === c.id ||
    owner.communityName === c.name ||
    ownerProperties(owner).some(property => communityPropertyIds.has(property.id))
  );
  const isOwner = state.activeRole === "owner";

  document.querySelector("#detail-name").textContent = c.name || "—";
  document.querySelector("#detail-nif").textContent = c.nif || "—";
  document.querySelector("#detail-phone").textContent = c.phone || "—";
  document.querySelector("#detail-otherPhone").textContent = c.otherPhone || "—";
  document.querySelector("#detail-address").textContent = c.address || "—";
  document.querySelector("#detail-city").textContent = c.city || "—";
  document.querySelector("#detail-province").textContent = c.province || "—";
  document.querySelector("#detail-postalCode").textContent = c.postalCode || "—";
  document.querySelector("#detail-email").textContent = c.email || "—";
  document.querySelector("#detail-notes").innerHTML = c.notes
    ? richTextHtml(c.notes)
    : "Sin observaciones registradas.";
  detailOwnersCount.textContent = `${linkedOwners.length} ${linkedOwners.length === 1 ? "propietario" : "propietarios"}`;

  // Nuevos campos de comunidad (Requisito 1)
  const detailIban = document.querySelector("#detail-iban");
  if (detailIban) detailIban.textContent = c.iban || "—";
  const detailPresident = document.querySelector("#detail-president");
  if (detailPresident) detailPresident.textContent = c.president || "—";
  const detailAdministrator = document.querySelector("#detail-administrator");
  if (detailAdministrator) detailAdministrator.textContent = c.administrator || "—";
  const detailConstYear = document.querySelector("#detail-constitutionYear");
  if (detailConstYear) detailConstYear.textContent = c.constitutionYear || "—";
  const detailReserve = document.querySelector("#detail-reserveFund");
  if (detailReserve) detailReserve.textContent = c.reserveFund ? `${c.reserveFund} €` : "—";

  // Inmuebles vinculados a la comunidad (1-n) (Requisito 5)
  renderCommunityPropertiesSection(c);
  renderCommunityDetailDocs(c);

  // Ocultar datos de contacto y botón de edición en modo propietario
  if (detailItemPhone) detailItemPhone.style.display = isOwner ? "none" : "";
  if (detailItemOtherPhone) detailItemOtherPhone.style.display = isOwner ? "none" : "";
  if (detailItemEmail) detailItemEmail.style.display = isOwner ? "none" : "";
  if (detailEditBtn) detailEditBtn.hidden = true;

  communityDetailDialog.showModal();
}

/** Tabs de la ficha de lectura de comunidad (misma estructura que la edición). */
function switchCommunityDetailTab(tab) {
  document.querySelectorAll("#detail-dialog [data-cd-tab]").forEach(btn => {
    const active = btn.dataset.cdTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#detail-dialog [data-cd-pane]").forEach(pane => {
    pane.hidden = pane.dataset.cdPane !== tab;
  });
}

function renderCommunityDetailDocs(c) {
  const listEl = document.querySelector("#community-detail-docs");
  if (!listEl) return;
  const countEl = document.querySelector("#community-detail-doc-count");
  const docs = c.documents || [];
  if (countEl) countEl.textContent = String(docs.length);
  listEl.replaceChildren();
  if (docs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay documentos cargados para esta comunidad.";
    listEl.append(empty);
    return;
  }
  docs.forEach(doc => {
    const row = document.createElement("div");
    row.className = "doc-file-row";
    const icon = document.createElement("span");
    icon.className = "doc-file-icon";
    icon.innerHTML = sanitizeHtml(`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`);
    const info = document.createElement("div");
    info.className = "doc-file-info";
    const link = document.createElement("a");
    link.className = "doc-file-name";
    link.textContent = doc.fileName;
    if (doc.url) { link.href = doc.url; link.target = "_blank"; link.rel = "noopener"; }
    const size = document.createElement("span");
    size.className = "doc-file-size";
    size.textContent = `${Math.ceil((doc.fileSize || 0) / 1024)} KB`;
    info.append(link, size);
    row.append(icon, info);
    listEl.append(row);
  });
}

// Tabs de la ficha de comunidad (sólo lectura)
document.querySelectorAll("#detail-dialog [data-cd-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchCommunityDetailTab(btn.dataset.cdTab));
});

export function renderCommunityPropertiesSection(c) {
  const commProps = state.properties.filter(p => p.communityId === c.id);
  const propCountEl = document.querySelector("#community-detail-prop-count");
  if (propCountEl) propCountEl.textContent = commProps.length;

  const propListEl = document.querySelector("#community-properties-list");
  if (!propListEl) return;
  propListEl.replaceChildren();

  if (commProps.length === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "form-intro";
    emptyP.textContent = "Esta comunidad aún no tiene inmuebles asociados. Usa «Editar comunidad» para crearlos o asociarlos.";
    propListEl.append(emptyP);
    return;
  }

  commProps.forEach(prop => {
    const card = document.createElement("div");
    card.className = "community-property-card";

    const info = document.createElement("div");
    info.className = "community-property-info";

    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = `${prop.plot || "Inmueble"} (${PROPERTY_TYPE_LABELS[prop.propertyType] || "Unidad"}) · ${prop.address || ""}`;

    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    const propOwnerIds = propertyOwnerIds(prop);
    const propOwners = state.owners.filter(o => propOwnerIds.includes(o.id)).map(o => `${o.name} ${o.surname}`).join(", ");
    sub.textContent = `Propietario(s): ${propOwners || "Sin propietario"} | Coef: ${prop.participationCoef || "—"}% | Cuota: ${prop.communityFee ? prop.communityFee + " €" : "—"}`;
    info.append(title, sub);

    const actions = document.createElement("div");
    actions.className = "community-property-actions";

    card.append(info);
    propListEl.append(card);
  });
}

export function closeCommunityDetail() {
  communityDetailDialog.close();
  state.ui.viewingCommunityId = null;
}

export function openCommunityDelete(id) {
  if (!requirePermission("community:delete")) return;
  const c = state.communities.find(item => item.id === id);
  if (!c) return;
  deletingCommunityId = id;
  document.querySelector("#delete-message").textContent = `Vas a eliminar “${c.name}”. Esta acción no se puede deshacer.`;
  communityDeleteDialog.showModal();
}

export function validateCommunityFields() {
  const nifInput = communityForm.elements.nif;
  const phoneInput = communityForm.elements.phone;
  const otherPhoneInput = communityForm.elements.otherPhone;
  const emailInput = communityForm.elements.email;
  const postalCodeInput = communityForm.elements.postalCode;

  const nif = nifInput.value.trim().toUpperCase();
  const phone = phoneInput.value.trim();
  const otherPhone = otherPhoneInput.value.trim();
  const email = emailInput.value.trim();
  const postalCode = postalCodeInput.value.trim();

  nifInput.value = nif;
  phoneInput.value = phone;
  otherPhoneInput.value = otherPhone;
  emailInput.value = email;

  nifInput.setCustomValidity(isValidCommunityNif(nif) ? "" : "El NIF debe ser un CIF válido de comunidad: H + 7 dígitos + dígito o letra de control (ejemplo: H12345674).");
  phoneInput.setCustomValidity(/^\d{9}$/.test(phone) ? "" : "El teléfono principal debe contener 9 dígitos numéricos.");
  otherPhoneInput.setCustomValidity(!otherPhone || /^\d{9}$/.test(otherPhone) ? "" : "El teléfono secundario debe contener 9 dígitos numéricos.");
  emailInput.setCustomValidity(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Introduce una dirección de email válida.");
  postalCodeInput.setCustomValidity(/^\d{5}$/.test(postalCode) && isValidPostalCode(postalCode) ? "" : "El código postal debe contener 5 dígitos y corresponder a un código postal de España.");
  const year = communityForm.elements.constitutionYear;
  year.setCustomValidity(!year.value || /^\d{4}$/.test(year.value) && Number(year.value) >= 1000 && Number(year.value) <= new Date().getFullYear() ? "" : "Seleccioná un año de constitución válido.");
}

communityForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("community:edit")) {
    closeCommunityEditor();
    return;
  }
  const wasEditing = !!editingCommunityId;
  const savedId = await persistCommunityDraft();
  if (!savedId) return;
  limpiarGuardia(communityForm);
  closeCommunityEditor();
  toast(wasEditing ? "Comunidad actualizada." : "Comunidad creada.");
});

/**
 * Valida y persiste la comunidad del diálogo (creación o edición).
 * Devuelve el id si tuvo éxito; null si hubo errores de validación.
 */
async function persistCommunityDraft() {
  if (communityReadonly) return null;
  validateCommunityFields();

  const citySelect = communityForm.elements.city;
  const provinceSelect = communityForm.elements.province;
  const selectedLocation = getLocationById(citySelect.value);

  const messages = [];
  [...communityForm.elements].forEach(element => {
    if (element.willValidate && !element.checkValidity()) {
      messages.push(`${fieldLabel(element)}: ${mensajeDeValidez(element)}.`);
    }
  });
  if (!selectedLocation) {
    messages.push("Municipio: seleccioná un municipio válido del listado.");
  } else if (selectedLocation.province !== provinceSelect.value) {
    messages.push("Municipio: debe pertenecer a la provincia seleccionada.");
  }
  if (state.communities.some(c => c.nif === (communityForm.elements.nif.value || "").trim().toUpperCase() && c.id !== editingCommunityId)) {
    messages.push("NIF: ya existe una comunidad registrada con ese NIF.");
  }

  if (messages.length > 0) {
    showValidationErrors(messages, "Revisá los datos de la comunidad");
    return null;
  }

  communityNotes?.sync();
  const data = Object.fromEntries(new FormData(communityForm));
  ["name", "nif", "address", "phone", "otherPhone", "postalCode", "email", "iban", "president", "administrator", "constitutionYear", "reserveFund", "currency", "adminUserId"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });
  data.city = selectedLocation.name;
  data.province = provinceSelect.value;

  const isEditing = !!editingCommunityId;
  const communityId = editingCommunityId || crypto.randomUUID();
  try {
    if (isEditing) {
      await api.updateCommunity(communityId, data);
    } else {
      await api.createCommunity({ ...data, id: communityId });
    }
  } catch (error) {
    communityError.textContent = error.message;
    return null;
  }

  await refreshState();
  if (pendingCommunityFiles.length > 0) {
    try {
      await api.uploadDocuments(pendingCommunityFiles, "community", communityId);
      pendingCommunityFiles = [];
      await refreshState();
    } catch (error) {
      toast(error.message);
    }
  }
  editingCommunityId = communityId;
  return communityId;
}

/**
 * Garantiza que la comunidad exista antes de asociar/crear inmuebles desde
 * el diálogo en modo "Nueva comunidad": la guarda automáticamente.
 */
async function ensureCommunitySavedForProperties() {
  if (editingCommunityId) return editingCommunityId;
  const id = await persistCommunityDraft();
  if (id) {
    const saved = state.communities.find(item => item.id === id);
    renderCommunityEditorProperties(saved);
    renderCommunityDocumentList(saved);
    toast("Comunidad guardada. Ahora podés asociar inmuebles.");
    switchCommunityEditorTab("properties");
  }
  return id;
}

// --- Comunidades ---
const comNifInput = communityForm.elements.nif;
const comPhoneInput = communityForm.elements.phone;
const comOtherPhoneInput = communityForm.elements.otherPhone;
const comPostalCodeInput = communityForm.elements.postalCode;
const comCitySelect = communityForm.elements.city;

comNifInput.addEventListener("input", () => {
  comNifInput.value = comNifInput.value.toUpperCase();
  comNifInput.setCustomValidity("");
});

[comPhoneInput, comOtherPhoneInput].forEach(inp => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "");
    inp.setCustomValidity("");
  });
});

communityForm.elements.email.addEventListener("input", () => {
  communityForm.elements.email.setCustomValidity("");
});

comPostalCodeInput.addEventListener("input", () => {
  comPostalCodeInput.value = comPostalCodeInput.value.replace(/\D/g, "").slice(0, 5);
  comPostalCodeInput.setCustomValidity("");
  syncPostalCode(comPostalCodeInput, comCitySelect, communityForm.elements.province);
});

comCitySelect.addEventListener("change", () => {
  syncCity(comCitySelect, communityForm.elements.province, comPostalCodeInput);
});

communityForm.elements.iban.addEventListener("input", () => {
  maskIbanField(communityForm.elements.iban);
});
const reserveFundInput = communityForm.elements.reserveFund;
reserveFundInput.addEventListener("keydown", event => { if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault(); });
reserveFundInput.addEventListener("beforeinput", event => { if (event.data && /[^\d.,]/.test(event.data)) event.preventDefault(); });
reserveFundInput.addEventListener("paste", event => {
  event.preventDefault();
  if (communityReadonly) return;
  const value = event.clipboardData.getData("text").trim();
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(value)) { toast("El fondo de reserva solo admite números y hasta dos decimales."); return; }
  reserveFundInput.value = value.replace(",", ".");
  reserveFundInput.dispatchEvent(new Event("input", { bubbles: true }));
});

document.querySelector("#new-community").addEventListener("click", () => openCommunityEditor());
document.querySelector("#close-dialog").addEventListener("click", () => communityReadonly ? closeCommunityEditor() : intentarCerrar(communityForm, communityDialog));
document.querySelector("#cancel-dialog").addEventListener("click", () => intentarCerrar(communityForm, communityDialog));

closeDetailDialog.addEventListener("click", closeCommunityDetail);
closeDetailBtn.addEventListener("click", closeCommunityDetail);
detailEditBtn.addEventListener("click", () => {
  const targetId = state.ui.viewingCommunityId;
  closeCommunityDetail();
  if (targetId) openCommunityEditor(targetId);
});

document.querySelector("#confirm-delete").addEventListener("click", async () => {
  if (!requirePermission("community:delete")) {
    communityDeleteDialog.close();
    deletingCommunityId = null;
    return;
  }
  if (state.properties.some(property => property.communityId === deletingCommunityId)) {
    toast("No se puede eliminar esta comunidad mientras tenga inmuebles asociados.");
    deletingCommunityId = null;
    communityDeleteDialog.close();
    return;
  }
  try {
    await api.deleteCommunity(deletingCommunityId);
  } catch (error) {
    toast(error.message);
    communityDeleteDialog.close();
    deletingCommunityId = null;
    return;
  }
  await refreshState();
  toast("Comunidad eliminada.");
  deletingCommunityId = null;
  communityDeleteDialog.close();
});

// --- Asociación de inmuebles a la comunidad (tab de edición) ---
// (los botones del diálogo de consulta se eliminaron: la vista es sólo lectura)

