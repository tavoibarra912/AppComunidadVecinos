import { api } from "../api.js";
import { state, refreshState, ownerProperties, ownerTenants, getTenantContractStatus, propertyLabel, propertyOwnerIds, TENANT_AUTHORIZATION_LABELS, PROPERTY_TYPE_LABELS, hasPermission, requirePermission } from "../state.js";
import { toast, isValidEmail, isValidDateInput, formatContractDate, getLocalDateInputValue, makeSelectSearchable } from "../utils.js";
import { createDataTable } from "../table.js";
import { openPropertyDetail } from "./inmuebles.js";
import { openOwnerDetail, openOwnerEditor, closeOwnerDetail } from "./propietarios.js";
import { openCommunityDetail } from "./comunidades.js";

const ICON_INFO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`;

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = svg;
  return btn;
}

const ownerDetailDialog = document.querySelector("#owner-detail-dialog");

const contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

const tenantSearch = document.querySelector("#search-tenants");
const tenantResultCount = document.querySelector("#tenant-result-count");
const newTenantBtn = document.querySelector("#new-tenant");
const tenantDialog = document.querySelector("#tenant-dialog");
const tenantForm = document.querySelector("#tenant-form");
const tenantFormError = document.querySelector("#tenant-form-error");
const tenantOwnerSelect = tenantForm.elements.ownerId;
const tenantPropertySelect = tenantForm.elements.propertyId;
makeSelectSearchable(tenantOwnerSelect, "Buscar propietario…");
makeSelectSearchable(tenantPropertySelect, "Buscar unidad…");
const tenantDetailDialog = document.querySelector("#tenant-detail-dialog");
const tenantDeleteDialog = document.querySelector("#tenant-delete-dialog");

let tenantTable = null;

function tenantRecords() {
  return state.owners.flatMap(owner => ownerTenants(owner).map(tenant => ({
    owner,
    tenant,
    property: state.properties.find(item => item.id === tenant.propertyId)
  })));
}

export function renderTenants() {
  if (!hasPermission("tenant:read")) {
    if (tenantResultCount) tenantResultCount.textContent = "0 inquilinos";
    return;
  }

  if (!tenantTable) {
    tenantTable = createDataTable({
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
            if (tenant.documentId) {
              const documentId = document.createElement("span");
              documentId.className = "community-notes";
              documentId.textContent = tenant.documentId;
              cell.append(documentId);
            }
            return cell;
          }
        },
        {
          key: "community",
          label: "Comunidad",
          value: ({ property }) => property?.communityName ||
            state.communities.find(item => item.id === property?.communityId)?.name || "Sin comunidad",
          defaultVisible: true,
          render: ({ property }) => {
            const community = state.communities.find(item => item.id === property?.communityId);
            const label = community?.name || property?.communityName || "Sin comunidad";
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
          key: "property",
          label: "Inmueble",
          value: ({ property }) => property?.plot || "Unidad no disponible",
          defaultVisible: true,
          render: ({ property }) => {
            if (!property) return "Unidad no disponible";
            const link = document.createElement("button");
            link.type = "button";
            link.className = "text-link-button";
            link.textContent = `${property.plot} · ${property.communityName || "Sin comunidad"}`;
            link.addEventListener("click", () => openPropertyDetail(property.id));
            return link;
          }
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
            link.addEventListener("click", () => openOwnerDetail(owner.id));
            return link;
          }
        },
        {
          key: "contact",
          label: "Contacto",
          value: ({ tenant }) => `${tenant.phone || ""} ${tenant.email || ""}`,
          defaultVisible: true,
          render: ({ tenant }) => {
            const cell = document.createElement("div");
            const phone = document.createElement("span");
            phone.textContent = tenant.phone || "—";
            const email = document.createElement("span");
            email.className = "community-notes";
            email.textContent = tenant.email || "—";
            cell.append(phone, email);
            return cell;
          }
        },
        {
          key: "contract",
          label: "Contrato",
          value: ({ tenant }) => `${formatContractDate(tenant.contractStart)} – ${formatContractDate(tenant.contractEnd)} ${getTenantContractStatus(tenant)}`,
          defaultVisible: true,
          render: ({ tenant }) => {
            const cell = document.createElement("div");
            const contractDates = document.createElement("span");
            contractDates.textContent = `${formatContractDate(tenant.contractStart)} – ${formatContractDate(tenant.contractEnd)}`;
            const contractBadge = document.createElement("span");
            const status = getTenantContractStatus(tenant);
            const statusKey = status === "Próximo" ? "proximo" : status.toLocaleLowerCase("es");
            contractBadge.className = `status-badge tenant-contract-${statusKey}`;
            contractBadge.textContent = status;
            cell.append(contractDates, contractBadge);
            return cell;
          }
        },
        {
          key: "auths",
          label: "Autorizaciones",
          value: ({ tenant }) => String(Array.isArray(tenant.authorizations) ? tenant.authorizations.length : 0)
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
            const btnInfo = iconBtn("btn-info", "Más info", `Ver información de ${tenant.name} ${tenant.surname}`, ICON_INFO);
            btnInfo.addEventListener("click", () => openTenantDetail(owner.id, tenant.id));
            wrap.append(btnInfo);
            if (hasPermission("tenant:manage", owner.id)) {
              const btnEdit = iconBtn("btn-edit", "Editar", `Editar inquilino ${tenant.name} ${tenant.surname}`, ICON_EDIT);
              btnEdit.addEventListener("click", () => openTenantEditor(tenant.id, owner.id));
              const btnDelete = iconBtn("btn-delete", "Eliminar", `Eliminar inquilino ${tenant.name} ${tenant.surname}`, ICON_DELETE);
              btnDelete.addEventListener("click", () => openTenantDelete(tenant.id, owner.id));
              wrap.append(btnEdit, btnDelete);
            }
            return wrap;
          }
        }
      ]
    });
  } else {
    tenantTable.refresh();
  }
}


export function updateTenantPropertyOptions(ownerId, selectedPropertyId = "") {
  const owner = state.owners.find(item => item.id === ownerId);
  tenantPropertySelect.replaceChildren(new Option("Selecciona una unidad…", ""));
  tenantPropertySelect.disabled = !owner;
  if (!owner) return;
  ownerProperties(owner).forEach(property => {
    const communityName = property.communityName ||
      state.communities.find(item => item.id === property.communityId)?.name || "Sin comunidad";
    tenantPropertySelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
  });
  tenantPropertySelect.value = selectedPropertyId;
}

export function openTenantEditor(id = null, ownerId = state.ui.viewingOwnerId) {
  if (!requirePermission("tenant:manage", ownerId || "")) return;
  const editingOwner = state.owners.find(item => item.id === ownerId);
  const tenant = ownerTenants(editingOwner).find(item => item.id === id);
  if (id && !tenant) return;
  if (tenant && !requirePermission("tenant:manage", editingOwner.id)) return;
  state.ui.viewingOwnerId = editingOwner?.id || null;
  state.ui.editingTenantId = id;
  tenantForm.reset();
  tenantFormError.textContent = "";
  tenantOwnerSelect.disabled = !!tenant;
  tenantOwnerSelect.replaceChildren(new Option("Selecciona un propietario…", ""));
  state.owners
    .filter(owner => hasPermission("tenant:manage", owner.id))
    .forEach(owner => tenantOwnerSelect.add(new Option(`${owner.name} ${owner.surname}`, owner.id)));
  tenantOwnerSelect.value = editingOwner?.id || "";
  updateTenantPropertyOptions(tenantOwnerSelect.value, tenant?.propertyId || "");

  if (tenant) {
    ["name", "surname", "documentType", "documentId", "contractType", "monthlyRent", "deposit", "emergencyPhone", "phone", "email", "contractStart", "contractEnd", "authorizationNotes"]
      .forEach(key => {
        if (tenantForm.elements[key]) tenantForm.elements[key].value = tenant[key] || "";
      });
    const authorizations = new Set(Array.isArray(tenant.authorizations) ? tenant.authorizations : []);
    Array.from(tenantForm.elements.authorizations).forEach(input => {
      input.checked = authorizations.has(input.value);
    });
  } else {
    tenantForm.elements.contractStart.value = getLocalDateInputValue();
  }

  document.querySelector("#tenant-dialog-title").textContent = tenant ? "Editar inquilino" : "Nuevo inquilino";
  tenantDialog.showModal();
}

export function closeTenantEditor() {
  tenantDialog.close();
  state.ui.editingTenantId = null;
}

export function openTenantDetail(ownerId, tenantId) {
  if (!requirePermission("tenant:read", ownerId)) return;
  const owner = state.owners.find(item => item.id === ownerId);
  const tenant = ownerTenants(owner).find(item => item.id === tenantId);
  if (!owner || !tenant) return;
  state.ui.viewingOwnerId = owner.id;
  state.ui.viewingTenantId = tenantId;

  document.querySelector("#tenant-detail-title").textContent = `${tenant.name} ${tenant.surname}`;
  document.querySelector("#tenant-detail-owner").textContent = `${owner.name} ${owner.surname}`;
  document.querySelector("#tenant-detail-document").textContent = tenant.documentId || "No indicado";
  document.querySelector("#tenant-detail-phone").textContent = tenant.phone || "—";
  document.querySelector("#tenant-detail-email").textContent = tenant.email || "—";
  const property = state.properties.find(item => item.id === tenant.propertyId);
  document.querySelector("#tenant-detail-property").textContent = property
    ? `${property.plot} · ${property.communityName || "Sin comunidad"} · ${property.address || "Sin dirección"}`
    : "Unidad no disponible";
  document.querySelector("#tenant-detail-contract-start").textContent = formatContractDate(tenant.contractStart);
  document.querySelector("#tenant-detail-contract-end").textContent = formatContractDate(tenant.contractEnd);
  document.querySelector("#tenant-detail-contract-status").textContent = getTenantContractStatus(tenant);

  // Nuevos campos de inquilino (Requisito 4)
  const contractTypeMap = {
    vivienda_habitual: "Vivienda habitual",
    temporada: "Arrendamiento de temporada",
    comercial: "Uso distinto de vivienda (local)",
    cesion: "Cesión o comodato"
  };
  const contractTypeEl = document.querySelector("#tenant-detail-contract-type");
  if (contractTypeEl) contractTypeEl.textContent = contractTypeMap[tenant.contractType] || "Vivienda habitual";
  const monthlyRentEl = document.querySelector("#tenant-detail-monthly-rent");
  if (monthlyRentEl) monthlyRentEl.textContent = tenant.monthlyRent ? `${tenant.monthlyRent} €` : "—";
  const depositEl = document.querySelector("#tenant-detail-deposit");
  if (depositEl) depositEl.textContent = tenant.deposit ? `${tenant.deposit} €` : "—";
  const emergencyPhoneEl = document.querySelector("#tenant-detail-emergency-phone");
  if (emergencyPhoneEl) emergencyPhoneEl.textContent = tenant.emergencyPhone || "—";

  const authorizations = document.querySelector("#tenant-detail-authorizations");
  authorizations.replaceChildren();
  const labels = (Array.isArray(tenant.authorizations) ? tenant.authorizations : [])
    .map(value => TENANT_AUTHORIZATION_LABELS[value] || value);
  if (labels.length === 0) labels.push("No hay autorizaciones predefinidas registradas.");
  labels.forEach(label => {
    const item = document.createElement("li");
    item.textContent = label;
    authorizations.append(item);
  });
  document.querySelector("#tenant-detail-authorization-notes").textContent =
    tenant.authorizationNotes || "Sin observaciones.";

  const viewPropertyButton = document.querySelector("#tenant-detail-view-property");
  viewPropertyButton.hidden = !property;
  viewPropertyButton.onclick = () => {
    if (property) openPropertyDetail(property.id);
  };
  document.querySelector("#tenant-detail-edit-btn").hidden = !hasPermission("tenant:manage", owner.id);
  if (!tenantDetailDialog.open) tenantDetailDialog.showModal();
}

export function closeTenantDetail() {
  tenantDetailDialog.close();
  state.ui.viewingTenantId = null;
}

export function openTenantDelete(tenantId, ownerId = state.ui.viewingOwnerId) {
  if (!requirePermission("tenant:manage", ownerId || "")) return;
  const owner = state.owners.find(item => item.id === ownerId);
  const tenant = ownerTenants(owner).find(item => item.id === tenantId);
  if (!owner || !tenant) return;
  state.ui.viewingOwnerId = owner.id;
  state.ui.deletingTenantId = tenantId;
  document.querySelector("#tenant-delete-message").textContent =
    `Vas a eliminar a “${tenant.name} ${tenant.surname}”. Esta acción no se puede deshacer.`;
  tenantDeleteDialog.showModal();
}


newTenantBtn.addEventListener("click", () => openTenantEditor(null, ""));
tenantOwnerSelect.addEventListener("change", () => {
  state.ui.viewingOwnerId = tenantOwnerSelect.value || null;
  updateTenantPropertyOptions(tenantOwnerSelect.value);
});
document.querySelector("#close-tenant-dialog").addEventListener("click", closeTenantEditor);
document.querySelector("#cancel-tenant-dialog").addEventListener("click", closeTenantEditor);
document.querySelector("#close-tenant-detail-dialog").addEventListener("click", closeTenantDetail);
document.querySelector("#close-tenant-detail-btn").addEventListener("click", closeTenantDetail);
document.querySelector("#tenant-detail-edit-btn").addEventListener("click", () => {
  const tenantId = state.ui.viewingTenantId;
  closeTenantDetail();
  if (tenantId) openTenantEditor(tenantId);
});
document.querySelector("#confirm-tenant-delete").addEventListener("click", async event => {
  event.preventDefault();
  const owner = state.owners.find(item => item.id === state.ui.viewingOwnerId);
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
  else openOwnerDetail(owner.id);
  toast("Inquilino eliminado.");
});


tenantForm.addEventListener("submit", async event => {
  event.preventDefault();
  tenantFormError.textContent = "";
  const owner = state.owners.find(item => item.id === tenantOwnerSelect.value);
  if (!owner || !requirePermission("tenant:manage", owner.id)) {
    tenantFormError.textContent = "No se encontró el propietario asociado a este inquilino.";
    return;
  }

  const formData = new FormData(tenantForm);
  const values = Object.fromEntries(formData);
  const property = ownerProperties(owner).find(item => item.id === values.propertyId);
  const phone = (values.phone || "").replace(/\D/g, "");
  const email = (values.email || "").trim().toLowerCase();
  const messages = [];

  if (!(values.name || "").trim()) messages.push("El nombre es obligatorio.");
  if (!(values.surname || "").trim()) messages.push("Los apellidos son obligatorios.");
  if (!property) messages.push("Selecciona una unidad asociada a este propietario.");
  if (!/^[6-9]\d{8}$/.test(phone)) messages.push("El teléfono debe tener 9 dígitos y comenzar por 6, 7, 8 o 9.");
  if (!isValidEmail(email)) messages.push("Introduce una dirección de email válida.");
  if (!isValidDateInput(values.contractStart)) {
    messages.push("Indica una fecha de inicio de contrato válida.");
  }
  if (values.contractEnd && !isValidDateInput(values.contractEnd)) {
    messages.push("Indica una fecha de fin de contrato válida.");
  } else if (values.contractStart && values.contractEnd && values.contractEnd < values.contractStart) {
    messages.push("La fecha de fin no puede ser anterior al inicio del contrato.");
  }
  if (messages.length) {
    tenantFormError.textContent = messages.join(" ");
    return;
  }

  const submittedAuthorizations = formData.getAll("authorizations");
  if (submittedAuthorizations.some(value => !Object.hasOwn(TENANT_AUTHORIZATION_LABELS, value))) {
    tenantFormError.textContent = "Selecciona únicamente autorizaciones disponibles.";
    return;
  }

  const tenant = {
    id: state.ui.editingTenantId || crypto.randomUUID(),
    name: values.name.trim(),
    surname: values.surname.trim(),
    documentType: values.documentType || "DNI",
    documentId: (values.documentId || "").trim().toUpperCase(),
    contractType: values.contractType || "vivienda_habitual",
    monthlyRent: values.monthlyRent ? values.monthlyRent.trim().replace(",", ".") : "",
    deposit: values.deposit ? values.deposit.trim().replace(",", ".") : "",
    emergencyPhone: values.emergencyPhone ? values.emergencyPhone.trim().replace(/\D/g, "") : "",
    phone,
    email,
    propertyId: property.id,
    contractStart: values.contractStart,
    contractEnd: values.contractEnd || "",
    authorizations: submittedAuthorizations,
    authorizationNotes: (values.authorizationNotes || "").trim()
  };
  const isEditing = !!state.ui.editingTenantId;
  const tenantId = state.ui.editingTenantId || crypto.randomUUID();
  const payload = {
    id: tenantId,
    ownerId: owner.id,
    ...tenant
  };

  try {
    if (isEditing) {
      await api.updateTenant(tenantId, payload);
    } else {
      await api.createTenant(payload);
    }
  } catch (error) {
    tenantFormError.textContent = error.message;
    return;
  }

  await refreshState();
  closeTenantEditor();
  if (ownerDetailDialog.open) openOwnerDetail(owner.id);
  toast(isEditing ? "Inquilino actualizado." : "Inquilino creado.");
});

