import { sanitizeHtml } from "../html.js";
import { api } from "../api.js";
import {
  state,
  refreshState,
  hasPermission,
  requirePermission,
  DEFAULT_TENANT_AUTHORIZATIONS,
} from "../state.js";
import {
  toast,
  showValidationErrors,
  armarGuardia,
  limpiarGuardia,
  hayCambiosSinGuardar,
  intentarCerrar,
  makeSelectSearchable,
} from "../utils.js";
import { createDataTable, aplicarFilasPorPagina } from "../table.js";
import { createExportDropdown } from "../export-client.js";
import { textosDe } from "../textos-envio.js";
import { renderAudit } from "./audit.js";
import { renderProvidersPanel } from "./communication.js";
import { applyBrand, applyPublicSettings, effectiveBrand, readInjectedBrand } from "../brand.js";
import { PERMISOS_CATALOGO } from "../permissions-catalog.js";
const ADMIN_TABS = {
  usuarios: "admin:users",
  roles: "admin:roles",
  settings: "admin:settings",
  auditoria: "audit:read",
};

// ==========================================
// PANTALLA ADMINISTRACIÓN: Usuarios / Roles / Configuración
// ==========================================

let userTable = null;
let adminTabActual = "usuarios";
let editingUserId = null;
let editingRoleId = null;
let editingRoleOriginalPermissions = [];

function puedeEditarMarcaComunidad(community) {
  return (
    hasPermission("community:brand", community.id) || hasPermission("community:edit", community.id)
  );
}

function puedeConfigurarComunidades() {
  return state.communities.some(puedeEditarMarcaComunidad);
}

export function puedeAdministrar() {
  return (
    Object.values(ADMIN_TABS).some((p) => hasPermission(p)) ||
    hasPermission("admin:providers") ||
    hasPermission("admin:branding") ||
    puedeConfigurarComunidades()
  );
}

// Cada sección de Configuración conserva su permiso y alcance propios.
function conPermisoTab(tab) {
  return (
    hasPermission(ADMIN_TABS[tab]) ||
    (tab === "settings" &&
      (hasPermission("admin:providers") ||
        hasPermission("admin:branding") ||
        puedeConfigurarComunidades()))
  );
}

function switchAdminTab(tab) {
  if (!conPermisoTab(tab)) return;
  adminTabActual = tab;
  document.querySelectorAll("#administracion [data-admin-tab]").forEach((btn) => {
    const active = btn.dataset.adminTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#administracion [data-admin-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.adminPane !== tab;
  });
  if (tab === "usuarios") renderUsers();
  if (tab === "roles") renderRoles();
  if (tab === "settings") prepararSettings();
  if (tab === "auditoria") renderAudit();
}

document.querySelectorAll("#administracion [data-admin-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab));
});

// ---------- Sub-tabs de Configuración ----------
let settingsTab = "asociacion";
let estiloTab = "aplicacion";

const SETTINGS_PANELS = {
  asociacion: "#settings-asociacion-panel",
  seguridad: "#settings-seguridad-panel",
  notificaciones: "#settings-notificaciones-panel",
  inquilinos: "#settings-inquilinos-panel",
  sistema: "#settings-sistema-panel",
  estilo: "#settings-estilo-panel",
  textos: "#settings-textos-panel",
};

// Estilos reúne el estilo global de la app y la marca de cada comunidad.
const ESTILO_PANELS = {
  aplicacion: "#settings-estilo-aplicacion",
  comunidades: "#settings-comunidades-panel",
};

function conPermisoEstiloTab(tab) {
  if (tab === "comunidades") return puedeConfigurarComunidades();
  return hasPermission("admin:settings") || hasPermission("admin:branding");
}

function conPermisoSettingsTab(tab) {
  if (tab === "proveedores") return hasPermission("admin:providers");
  if (tab === "estilo")
    return conPermisoEstiloTab("aplicacion") || conPermisoEstiloTab("comunidades");
  return Object.hasOwn(SETTINGS_PANELS, tab) && hasPermission("admin:settings");
}

function prepararEstiloTabs() {
  document.querySelectorAll("#settings-estilo-subtabs [data-estilo-tab]").forEach((btn) => {
    btn.hidden = !conPermisoEstiloTab(btn.dataset.estiloTab);
  });
  if (!conPermisoEstiloTab(estiloTab))
    estiloTab = Object.keys(ESTILO_PANELS).find(conPermisoEstiloTab) || "aplicacion";
}

function prepararSettings() {
  document.querySelectorAll("#settings-subtabs [data-settings-tab]").forEach((btn) => {
    btn.hidden = !conPermisoSettingsTab(btn.dataset.settingsTab);
  });
  prepararEstiloTabs();
  if (!conPermisoSettingsTab(settingsTab))
    settingsTab = [...Object.keys(SETTINGS_PANELS), "proveedores"].find(conPermisoSettingsTab);
  // Se vuelca el estado una sola vez al entrar: cambiar de pestaña no debe
  // descartar los cambios que la persona todavía no guardó. Un rol con solo
  // admin:branding también necesita ver la marca actual en la pestaña Estilo.
  if (
    (hasPermission("admin:settings") || hasPermission("admin:branding")) &&
    !hayCambiosSinGuardar(settingsForm)
  )
    renderSettings();
  switchSettingsTab(settingsTab);
}

async function switchSettingsTab(tab) {
  if (!conPermisoSettingsTab(tab)) return;
  settingsTab = tab;
  if (settingsForm) {
    settingsForm.hidden = tab === "proveedores";
    // La marca de comunidad tiene su propio botón y guardado: no duplicar acciones.
    const actions = settingsForm.querySelector(":scope > .dialog-actions");
    if (actions) actions.hidden = tab === "estilo" && estiloTab === "comunidades";
  }
  document.querySelectorAll("#settings-subtabs [data-settings-tab]").forEach((btn) => {
    const active = btn.dataset.settingsTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  for (const [name, selector] of Object.entries(SETTINGS_PANELS)) {
    const panel = document.querySelector(selector);
    if (panel) panel.hidden = name !== tab;
  }
  const panelProveedores = document.querySelector("#settings-proveedores-panel");
  if (panelProveedores) panelProveedores.hidden = tab !== "proveedores";
  if (tab === "proveedores" && panelProveedores) {
    panelProveedores.replaceChildren();
    try {
      await renderProvidersPanel(panelProveedores);
    } catch (error) {
      panelProveedores.innerHTML = `<p class="form-error">${error.message}</p>`;
    }
  }
  if (tab === "estilo") switchEstiloTab(estiloTab);
}

function switchEstiloTab(tab) {
  if (!conPermisoEstiloTab(tab)) return;
  estiloTab = tab;
  document.querySelectorAll("#settings-estilo-subtabs [data-estilo-tab]").forEach((btn) => {
    const active = btn.dataset.estiloTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  for (const [name, selector] of Object.entries(ESTILO_PANELS)) {
    const panel = document.querySelector(selector);
    if (panel) panel.hidden = name !== tab;
  }
  if (settingsTab === "estilo") {
    const actions = settingsForm?.querySelector(":scope > .dialog-actions");
    if (actions) actions.hidden = tab === "comunidades";
  }
  if (tab === "comunidades") initCommunitySettings();
}

document.querySelectorAll("#settings-subtabs [data-settings-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchSettingsTab(btn.dataset.settingsTab));
});

document.querySelectorAll("#settings-estilo-subtabs [data-estilo-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchEstiloTab(btn.dataset.estiloTab));
});

window.addEventListener("admin:goto-proveedores", () => {
  adminTabActual = "settings";
  settingsTab = "proveedores";
  renderAdministracion();
});

// ---------- Usuarios ----------
function renderUsers() {
  if (!puedeAdministrar()) return;
  if (!userTable) {
    userTable = createDataTable({
      addButton: document.querySelector("#new-user"),
      mount: document.querySelector("#usuarios-table"),
      searchInput: document.querySelector("#search-users"),
      entitySingular: "usuario",
      entityPlural: "usuarios",
      emptyTitle: "No hay usuarios",
      emptyText: "Crea el primer usuario de la plataforma.",
      getRows: () => state.users,
      columns: [
        {
          key: "usuario",
          label: "Usuario",
          value: (u) => u.usuario,
          defaultVisible: true,
          render: (u) => {
            const wrap = document.createElement("div");
            const name = document.createElement("span");
            name.className = "community-name";
            name.textContent = u.usuario;
            wrap.append(name);
            if (u.nombre || u.apellido) {
              const sub = document.createElement("span");
              sub.className = "community-notes";
              sub.textContent = `${u.nombre || ""} ${u.apellido || ""}`.trim();
              wrap.append(sub);
            }
            return wrap;
          },
        },
        { key: "email", label: "Email", value: (u) => u.email, defaultVisible: true },
        {
          key: "rol",
          label: "Rol",
          value: (u) => u.rol,
          defaultVisible: true,
          render: (u) => {
            const badge = document.createElement("span");
            badge.className =
              "status-badge " + (u.rol === "administrador" ? "member" : "non-member");
            badge.textContent = u.rol;
            return badge;
          },
        },
        {
          key: "activo",
          label: "Estado",
          value: (u) => (u.activo ? "Activo" : "Inactivo"),
          defaultVisible: true,
          render: (u) => {
            const badge = document.createElement("span");
            badge.className = `status-badge ${u.activo ? "doc-approved" : "doc-rejected"}`;
            badge.textContent = u.activo ? "Activo" : "Inactivo";
            return badge;
          },
        },
        {
          key: "perfiles",
          label: "Perfiles",
          value: (u) => {
            const parts = [];
            if (state.owners.some((o) => o.userId === u.id)) parts.push("Propietario");
            if (state.tenants.some((t) => t.userId === u.id)) parts.push("Inquilino");
            if (state.communities.some((c) => c.adminUserId === u.id))
              parts.push("Admin de Comunidad");
            return parts.join(", ") || "—";
          },
          defaultVisible: true,
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
          render: (u) => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnEdit = iconBtn("btn-edit", "Editar", `Editar ${u.usuario}`, ICON_EDIT);
            btnEdit.addEventListener("click", () => openUserEditor(u.id));
            const btnDelete = iconBtn(
              "btn-delete",
              "Eliminar",
              `Eliminar ${u.usuario}`,
              ICON_DELETE,
            );
            btnDelete.addEventListener("click", () => deleteUser(u.id, u.usuario));
            wrap.append(btnEdit, btnDelete);
            return wrap;
          },
        },
      ],
    });
  } else {
    userTable.refresh();
  }
  document.querySelector('[data-export-table="users"]')?.remove?.();
  const exportWrap = createExportDropdown({
    tableId: "users",
    getView: () => userTable?.getExportState(),
    getFilters: () => ({}),
  });
  userTable.setExportControl?.(exportWrap);
  void renderDeletionRequests();
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

const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

const userDialog = document.querySelector("#user-dialog");
const userForm = document.querySelector("#user-form");
const userError = document.querySelector("#user-form-error");
const userLinkedOwnerSelect = document.querySelector("#user-linked-owner");
const userLinkedTenantSelect = document.querySelector("#user-linked-tenant");
makeSelectSearchable(userLinkedOwnerSelect, "Buscar propietario…");
makeSelectSearchable(userLinkedTenantSelect, "Buscar inquilino…");

function openUserEditor(id = null) {
  if (!requirePermission("admin:users")) return;
  editingUserId = id;
  userForm.reset();
  userError.textContent = "";
  const roles = state.roles;
  const rolSelect = userForm.elements.rol;
  rolSelect.replaceChildren();
  roles.forEach((r) => rolSelect.add(new Option(r.nombre, r.nombre)));
  const u = state.users.find((item) => item.id === id);
  document.querySelector("#user-dialog-title").textContent = u
    ? `Editar usuario: ${u.usuario}`
    : "Nuevo usuario";
  if (u) {
    userForm.elements.nombre.value = u.nombre || "";
    userForm.elements.apellido.value = u.apellido || "";
    userForm.elements.usuario.value = u.usuario || "";
    userForm.elements.email.value = u.email || "";
    userForm.elements.rol.value = u.rol;
    userForm.elements.activo.checked = !!u.activo;
  } else {
    userForm.elements.activo.checked = true;
    if (roles.length) rolSelect.value = roles[0].nombre;
  }
  renderUserLinkSelects(u);
  armarGuardia(userForm, userDialog);
  userDialog.showModal();
  userForm.elements.usuario.focus();
}

/** Puebla los selects de vinculación con los registros sin cuenta asignada. */
function renderUserLinkSelects(user) {
  const isPlatformAdmin = ["super_admin", "administrator"].includes(user?.rol);
  const linkSection = document.querySelector("#user-link-section");
  const superHint = document.querySelector("#user-link-superadmin-hint");
  if (linkSection) linkSection.hidden = isPlatformAdmin;
  if (superHint) superHint.hidden = !isPlatformAdmin;
  if (isPlatformAdmin) return;

  // Vínculos actuales calculados desde los registros (no desde la cuenta)
  const linkedOwnerId = (state.owners.find((o) => o.userId === user?.id) || {}).id || "";
  const linkedTenantId = (state.tenants.find((t) => t.userId === user?.id) || {}).id || "";

  if (userLinkedOwnerSelect) {
    userLinkedOwnerSelect.replaceChildren(new Option("Sin perfil Propietario", ""));
    state.owners.forEach((owner) => {
      if (owner.userId && owner.userId !== user?.id) return; // ya vinculado a otra cuenta
      const communityName =
        owner.communityName ||
        state.communities.find((c) => c.id === owner.communityId)?.name ||
        "";
      userLinkedOwnerSelect.add(
        new Option(
          `${owner.name} ${owner.surname} (${owner.dni})${communityName ? " · " + communityName : ""}`,
          owner.id,
        ),
      );
    });
    if (linkedOwnerId) userLinkedOwnerSelect.value = linkedOwnerId;
  }

  if (userLinkedTenantSelect) {
    userLinkedTenantSelect.replaceChildren(new Option("Sin perfil Inquilino", ""));
    state.tenants.forEach((tenant) => {
      if (tenant.userId && tenant.userId !== user?.id) return;
      userLinkedTenantSelect.add(
        new Option(
          `${tenant.name} ${tenant.surname} (${tenant.documentId || "sin documento"})`,
          tenant.id,
        ),
      );
    });
    if (linkedTenantId) userLinkedTenantSelect.value = linkedTenantId;
  }
}

// Al cambiar el rol se muestran u ocultan los perfiles vinculados sin reabrir
// el diálogo (los roles de plataforma no llevan perfiles).
userForm?.elements.rol?.addEventListener("change", () => {
  const actual = state.users.find((item) => item.id === editingUserId) || { id: "" };
  renderUserLinkSelects({ ...actual, rol: userForm.elements.rol.value });
});

userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requirePermission("admin:users")) return;
  const password = userForm.elements.password.value;
  const password2 = userForm.elements.password2.value;
  if (password || password2) {
    if (password !== password2) {
      userError.textContent = "Las contraseñas no coinciden.";
      return;
    }
    if (password.length < 8) {
      userError.textContent = "La contraseña debe tener al menos 8 caracteres.";
      return;
    }
  }
  const data = {
    nombre: userForm.elements.nombre.value.trim(),
    apellido: userForm.elements.apellido.value.trim(),
    usuario: userForm.elements.usuario.value.trim(),
    email: userForm.elements.email.value.trim(),
    rol: userForm.elements.rol.value,
    activo: userForm.elements.activo.checked,
    ...(password ? { password } : {}),
  };
  if (!data.usuario) {
    userError.textContent = "El nombre de usuario es obligatorio.";
    return;
  }
  try {
    let savedUser;
    if (editingUserId) {
      savedUser = await api.updateUser(editingUserId, data);
    } else {
      savedUser = await api.createUser(data);
    }

    if (savedUser.id === state.currentUserId && (data.password || !data.activo)) {
      window.dispatchEvent(new Event("auth:expired"));
      toast("Vuelve a iniciar sesión para continuar.");
      return;
    }
    // Sincronizar vinculaciones de perfiles (Propietario / Inquilino)
    // Los roles de administración no llevan perfiles: solo se desvinculan
    // los que hubiera (el servidor rechaza intentar vincular uno nuevo).
    if (["super_admin", "administrator"].includes(data.rol)) {
      if (state.owners.some((o) => o.userId === savedUser.id))
        await api.linkOwner(savedUser.id, "");
      if (state.tenants.some((t) => t.userId === savedUser.id))
        await api.linkTenant(savedUser.id, "");
    } else {
      const currentLinkedOwnerId = state.owners.find((o) => o.userId === savedUser.id)?.id || "";
      const newOwnerId = userLinkedOwnerSelect?.value || "";
      if (newOwnerId !== currentLinkedOwnerId) {
        await api.linkOwner(savedUser.id, newOwnerId);
      }
      const currentLinkedTenantId = state.tenants.find((t) => t.userId === savedUser.id)?.id || "";
      const newTenantId = userLinkedTenantSelect?.value || "";
      if (newTenantId !== currentLinkedTenantId) {
        await api.linkTenant(savedUser.id, newTenantId);
      }
    }
  } catch (error) {
    showValidationErrors([error.message], "No se pudo guardar el usuario");
    return;
  }
  limpiarGuardia(userForm);
  userDialog.close();
  await refreshState();
  renderUsers();
  toast(editingUserId ? "Usuario actualizado." : "Usuario creado.");
  editingUserId = null;
});

async function deleteUser(id, usuario) {
  if (!requirePermission("admin:users")) return;
  const profiles = [
    state.owners.some((owner) => owner.userId === id) ? "propietario" : "",
    state.tenants.some((tenant) => tenant.userId === id) ? "inquilino" : "",
  ].filter(Boolean);
  if (profiles.length) {
    showValidationErrors(
      [
        `El usuario tiene un perfil de ${profiles.join(" y ")} asociado. Desvincula el perfil antes de borrar la cuenta.`,
      ],
      "No se puede eliminar el usuario",
    );
    return;
  }
  if (!confirm(`¿Eliminar el usuario "${usuario}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api.deleteUser(id);
  } catch (error) {
    showValidationErrors([error.message], "No se puede eliminar el usuario");
    return;
  }
  if (id === state.currentUserId) {
    window.dispatchEvent(new Event("auth:expired"));
    return;
  }
  await refreshState();
  renderUsers();
  toast(`Usuario ${usuario} eliminado.`);
}

// ---------- Solicitudes de baja (RGPD) ----------
function deletionRequestLabel(item) {
  const name = `${item.nombre || ""} ${item.apellido || ""}`.trim();
  return name || item.usuario || item.email || "Cuenta eliminada";
}

async function renderDeletionRequests() {
  const panel = document.querySelector("#deletion-requests-panel");
  const list = document.querySelector("#deletion-requests-list");
  if (!panel || !list) return;
  let requests = [];
  if (hasPermission("admin:users")) {
    try {
      requests = (await api.deletionRequests()).requests || [];
    } catch {
      // Sin la cola disponible el panel se queda oculto, igual que sin permiso.
      requests = [];
    }
  }
  list.replaceChildren(...requests.map(deletionRequestItem));
  panel.hidden = !requests.length;
}

function deletionRequestItem(item) {
  const li = document.createElement("li");
  li.className = "deletion-request";
  const info = document.createElement("div");
  info.className = "deletion-request-info";
  const title = document.createElement("strong");
  title.textContent = deletionRequestLabel(item);
  const meta = document.createElement("span");
  meta.className = "community-notes";
  meta.textContent = [
    item.usuario ? `Usuario: ${item.usuario}` : "",
    item.email,
    `Solicitada el ${new Date(item.requestedAt).toLocaleDateString("es-ES")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  info.append(title, meta);
  if (item.reason) {
    const reason = document.createElement("p");
    reason.className = "form-intro";
    reason.textContent = `Motivo: ${item.reason}`;
    info.append(reason);
  }
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "danger-button";
  approve.textContent = "Eliminar cuenta";
  approve.addEventListener("click", () => approveDeletion(item));
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "secondary-button";
  reject.textContent = "Rechazar";
  reject.addEventListener("click", () => rejectDeletion(item));
  actions.append(approve, reject);
  li.append(info, actions);
  return li;
}

const deletionApproveDialog = document.querySelector("#deletion-approve-dialog");
const deletionApproveForm = document.querySelector("#deletion-approve-form");
const deletionApproveMessage = document.querySelector("#deletion-approve-message");
const deletionApproveError = document.querySelector("#deletion-approve-error");
const deletionApproveSubmit = document.querySelector("#deletion-approve-submit");
const deletionRejectDialog = document.querySelector("#deletion-reject-dialog");
const deletionRejectForm = document.querySelector("#deletion-reject-form");
const deletionRejectMessage = document.querySelector("#deletion-reject-message");
const deletionRejectNote = document.querySelector("#deletion-reject-note");
const deletionRejectError = document.querySelector("#deletion-reject-error");
const deletionRejectSubmit = document.querySelector("#deletion-reject-submit");

// Solicitud que el diálogo abierto está revisando.
let deletionTarget = null;

function setDeletionBusy(form, submit, busy) {
  submit.disabled = busy;
  if (busy) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
}

function approveDeletion(item) {
  if (!requirePermission("admin:users")) return;
  deletionTarget = item;
  deletionApproveError.textContent = "";
  deletionApproveMessage.textContent = `¿Eliminar la cuenta de «${deletionRequestLabel(item)}»? Se cerrarán sus sesiones y se borrarán sus datos de acceso y preferencias. Los recibos, cobros y registros contables se conservan.`;
  deletionApproveDialog.showModal();
  deletionApproveForm.querySelector("[data-close-deletion-dialog]")?.focus();
}

function rejectDeletion(item) {
  if (!requirePermission("admin:users")) return;
  deletionTarget = item;
  deletionRejectError.textContent = "";
  deletionRejectMessage.textContent = `La cuenta de «${deletionRequestLabel(item)}» seguirá activa y el titular verá aquí el motivo del rechazo.`;
  deletionRejectNote.value = "";
  deletionRejectDialog.showModal();
  deletionRejectNote.focus();
}

for (const button of document.querySelectorAll("[data-close-deletion-dialog]"))
  button.addEventListener("click", () =>
    document.getElementById(button.dataset.closeDeletionDialog)?.close(),
  );
for (const dialog of [deletionApproveDialog, deletionRejectDialog])
  dialog.addEventListener("close", () => {
    deletionTarget = null;
    deletionApproveError.textContent = "";
    deletionRejectError.textContent = "";
    setDeletionBusy(deletionApproveForm, deletionApproveSubmit, false);
    setDeletionBusy(deletionRejectForm, deletionRejectSubmit, false);
  });

// Los dos diálogos se comportan igual: bloquean el botón, muestran el error en
// línea y recargan al terminar. Solo cambian la acción y lo que sigue.
function deletionFormHandler({ form, submit, errorBox, dialog, action, done }) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!deletionTarget || submit.disabled) return;
    const item = deletionTarget;
    errorBox.textContent = "";
    setDeletionBusy(form, submit, true);
    try {
      await action(item);
    } catch (error) {
      errorBox.textContent = error.message;
      setDeletionBusy(form, submit, false);
      return;
    }
    dialog.close();
    await done(item);
  });
}

deletionFormHandler({
  form: deletionApproveForm,
  submit: deletionApproveSubmit,
  errorBox: deletionApproveError,
  dialog: deletionApproveDialog,
  action: (item) => api.approveDeletionRequest(item.id),
  done: async (item) => {
    if (item.userId === state.currentUserId) {
      window.dispatchEvent(new Event("auth:expired"));
      return;
    }
    toast(`Cuenta de ${deletionRequestLabel(item)} eliminada.`);
    await refreshState();
    renderUsers();
  },
});

deletionFormHandler({
  form: deletionRejectForm,
  submit: deletionRejectSubmit,
  errorBox: deletionRejectError,
  dialog: deletionRejectDialog,
  action: (item) => api.rejectDeletionRequest(item.id, deletionRejectNote.value.trim()),
  done: async () => {
    toast("Solicitud de baja rechazada.");
    await renderDeletionRequests();
  },
});

document.querySelector("#new-user")?.addEventListener("click", () => openUserEditor());
document
  .querySelector("#close-user-dialog")
  ?.addEventListener("click", () => intentarCerrar(userForm, userDialog));
document
  .querySelector("#cancel-user-dialog")
  ?.addEventListener("click", () => intentarCerrar(userForm, userDialog));

// ---------- Roles ----------
let rolesTable = null;

function renderRoles() {
  if (!puedeAdministrar()) return;
  if (!rolesTable) {
    rolesTable = createDataTable({
      addButton: document.querySelector("#new-role"),
      mount: document.querySelector("#roles-table"),
      searchInput: document.querySelector("#search-roles"),
      entitySingular: "rol",
      entityPlural: "roles",
      emptyTitle: "No hay roles",
      emptyText: "Crea el primer rol de la plataforma.",
      getRows: () => state.roles,
      columns: [
        {
          key: "nombre",
          label: "Rol",
          value: (r) => r.nombre,
          defaultVisible: true,
          render: (r) => {
            const wrap = document.createElement("div");
            const name = document.createElement("span");
            name.className = "community-name";
            name.textContent = r.nombre;
            wrap.append(name);
            if (r.sistema) {
              const badge = document.createElement("span");
              badge.className = "status-badge doc-approved";
              badge.textContent = "Sistema";
              wrap.append(badge);
            }
            return wrap;
          },
        },
        {
          key: "descripcion",
          label: "Descripción",
          value: (r) => r.descripcion || "—",
          defaultVisible: true,
        },
        {
          key: "permisos",
          label: "Permisos",
          value: (r) => String(r.permisos.length),
          defaultVisible: true,
          render: (r) => {
            const badge = document.createElement("span");
            badge.className = "dni-badge";
            badge.textContent = `${r.permisos.length} permisos`;
            return badge;
          },
        },
        {
          key: "usuarios",
          label: "Usuarios",
          groupable: false,
          value: (r) => String(state.users.filter((u) => u.rol === r.nombre).length),
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
          render: (r) => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnEdit = iconBtn("btn-edit", "Editar rol", `Editar rol ${r.nombre}`, ICON_EDIT);
            btnEdit.addEventListener("click", () => openRoleEditor(r.id));
            wrap.append(btnEdit);
            if (!r.sistema) {
              const btnDelete = iconBtn(
                "btn-delete",
                "Eliminar rol",
                `Eliminar rol ${r.nombre}`,
                ICON_DELETE,
              );
              btnDelete.addEventListener("click", () => deleteRole(r.id, r.nombre));
              wrap.append(btnDelete);
            }
            return wrap;
          },
        },
      ],
    });
  } else {
    rolesTable.refresh();
  }
  document.querySelector('[data-export-table="roles"]')?.remove?.();
  const rolesExportWrap = createExportDropdown({
    tableId: "roles",
    getView: () => rolesTable?.getExportState(),
    getFilters: () => ({}),
  });
  rolesTable.setExportControl?.(rolesExportWrap);
}

const roleDialog = document.querySelector("#role-dialog");
const roleForm = document.querySelector("#role-form");
const roleError = document.querySelector("#role-form-error");
const rolePermissionsList = document.querySelector("#role-permissions-list");

function renderRolePermissions(selected = []) {
  if (!rolePermissionsList) return;
  rolePermissionsList.replaceChildren();
  const selectedSet = new Set(selected);
  // Agrupados por categoría para facilitar la lectura
  const grupos = [...new Set(PERMISOS_CATALOGO.map((p) => p.grupo))];
  grupos.forEach((grupo) => {
    const header = document.createElement("p");
    header.className = "form-section-title full";
    header.textContent = grupo;
    rolePermissionsList.append(header);
    PERMISOS_CATALOGO.filter((p) => p.grupo === grupo).forEach(({ key, label, hint }) => {
      const item = document.createElement("label");
      item.className = "role-permission-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = key;
      checkbox.checked = selectedSet.has(key);
      const text = document.createElement("span");
      text.className = "role-permission-text";
      const name = document.createElement("span");
      name.textContent = label;
      text.append(name);
      if (hint) {
        const help = document.createElement("span");
        help.className = "role-permission-hint";
        help.textContent = hint;
        text.append(help);
      }
      item.append(checkbox, text);
      rolePermissionsList.append(item);
    });
  });
}

function openRoleEditor(id = null) {
  if (!requirePermission("admin:roles")) return;
  editingRoleId = id;
  const role = state.roles.find((item) => item.id === id);
  editingRoleOriginalPermissions = role ? [...role.permisos] : [];
  roleForm.reset();
  roleError.textContent = "";
  document.querySelector("#role-dialog-title").textContent = role
    ? `Editar rol: ${role.nombre}`
    : "Nuevo rol";
  renderRolePermissions(role ? role.permisos : []);
  if (role) {
    roleForm.elements.nombre.value = role.nombre;
    roleForm.elements.descripcion.value = role.descripcion || "";
  }
  armarGuardia(roleForm, roleDialog);
  roleDialog.showModal();
  roleForm.elements.nombre.focus();
}

roleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requirePermission("admin:roles")) return;
  // El catálogo debe estar completo, pero si una versión anterior no conocía
  // algún permiso válido, se conserva al guardar en lugar de borrarlo en
  // silencio. Así una actualización del catálogo nunca retira capacidades.
  const catalogadas = new Set(PERMISOS_CATALOGO.map((permiso) => permiso.key));
  const preservados = editingRoleOriginalPermissions.filter((permiso) => !catalogadas.has(permiso));
  const permisos = [
    ...new Set([
      ...[...rolePermissionsList.querySelectorAll("input:checked")].map((input) => input.value),
      ...preservados,
    ]),
  ];
  const data = {
    nombre: roleForm.elements.nombre.value.trim(),
    descripcion: roleForm.elements.descripcion.value.trim(),
    permisos,
  };
  if (!data.nombre) {
    roleError.textContent = "El nombre del rol es obligatorio.";
    return;
  }
  try {
    if (editingRoleId) {
      await api.updateRole(editingRoleId, data);
    } else {
      await api.createRole(data);
    }
  } catch (error) {
    roleError.textContent = error.message;
    return;
  }
  limpiarGuardia(roleForm, roleDialog);
  roleDialog.close();
  await refreshState();
  renderRoles();
  toast(editingRoleId ? "Rol actualizado." : "Rol creado.");
  editingRoleId = null;
  editingRoleOriginalPermissions = [];
});

async function deleteRole(id, nombre) {
  if (!requirePermission("admin:roles")) return;
  if (!confirm(`¿Eliminar el rol "${nombre}"?`)) return;
  try {
    await api.deleteRole(id);
  } catch (error) {
    showValidationErrors([error.message], "No se puede eliminar el rol");
    return;
  }
  await refreshState();
  renderRoles();
  toast(`Rol ${nombre} eliminado.`);
}

document.querySelector("#new-role")?.addEventListener("click", () => openRoleEditor());
document
  .querySelector("#close-role-dialog")
  ?.addEventListener("click", () => intentarCerrar(roleForm, roleDialog));
document
  .querySelector("#cancel-role-dialog")
  ?.addEventListener("click", () => intentarCerrar(roleForm, roleDialog));

// ---------- Configuración General ----------
const settingsForm = document.querySelector("#settings-form");
const TIPOS_DOCUMENTO = ["pdf", "jpg", "jpeg", "png", "webp"];
const DENSIDADES = ["compacta", "normal", "amplia"];
const TIPOGRAFIAS_BASE = [
  { id: "inter", nombre: "Inter (predeterminada)" },
  { id: "system", nombre: "Sistema" },
  { id: "arial", nombre: "Arial" },
  { id: "verdana", nombre: "Verdana" },
  { id: "georgia", nombre: "Georgia" },
];
const TIPOGRAFIAS = TIPOGRAFIAS_BASE.map((font) => font.id);
const RESPALDOS_TIPOGRAFIA = [
  { id: "sans", nombre: "Sans serif" },
  { id: "serif", nombre: "Serif" },
  { id: "mono", nombre: "Monoespaciada" },
];
const FONT_FALLBACKS = { sans: "sans-serif", serif: "serif", mono: "monospace" };
const MAX_TIPOGRAFIAS = 4;
const MAX_FONT_BYTES = 250_000;
const CUSTOM_FONT_ID = /^custom-[a-z0-9][a-z0-9-]{7,40}$/;
const FONT_NAME = /^[\p{L}\p{N} .,'&()_-]{1,60}$/u;
const FONT_FILE_TYPES = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};
const colorValue = (value, fallback) => (/^#[0-9a-fA-F]{6}$/.test(value || "") ? value : fallback);
const numericValue = (element, fallback, min, max) => {
  if (element?.value === "" || element?.value == null) return fallback;
  const number = Number(element.value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

let marcaTipografias = [];

function savedCustomFonts() {
  const fonts = state.settings?.marca?.tipografias;
  return Array.isArray(fonts) ? fonts.filter((font) => font && typeof font.id === "string") : [];
}

function fontOptions(customFonts = []) {
  const options = TIPOGRAFIAS_BASE.map((font) => ({ ...font }));
  const seen = new Set(options.map((font) => font.id));
  for (const font of customFonts) {
    if (!font || typeof font.id !== "string" || seen.has(font.id)) continue;
    seen.add(font.id);
    options.push({
      id: font.id,
      nombre: (typeof font.nombre === "string" && font.nombre.trim()) || "Tipografía sin nombre",
    });
  }
  return options;
}

function validFontId(id, customFonts = savedCustomFonts()) {
  return TIPOGRAFIAS.includes(id) || customFonts.some((font) => font.id === id);
}

function fillFontSelect(select, selected, customFonts = []) {
  if (!select) return;
  const options = fontOptions(customFonts);
  select.replaceChildren(...options.map((font) => new Option(font.nombre, font.id)));
  select.value = options.some((font) => font.id === selected) ? selected : "inter";
}

function normalizeFontsForEditor(value) {
  return (Array.isArray(value) ? value : [])
    .filter((font) => font && typeof font.id === "string")
    .slice(0, MAX_TIPOGRAFIAS)
    .map((font) => ({
      id: font.id,
      nombre: typeof font.nombre === "string" ? font.nombre : "",
      respaldo: Object.hasOwn(FONT_FALLBACKS, font.respaldo) ? font.respaldo : "sans",
      dataUrl: typeof font.dataUrl === "string" ? font.dataUrl : "",
      fileName: typeof font.fileName === "string" ? font.fileName : "",
      fileSize: Number(font.fileSize) || 0,
    }));
}

function syncMarcaTipografiasState() {
  const field = settingsForm?.elements.marcaTipografiasState;
  if (field)
    field.value = marcaTipografias
      .map((font) => [font.id, font.nombre, font.respaldo, font.dataUrl.length].join(":"))
      .join("|");
}

function renderMarcaFontSelects() {
  if (!settingsForm) return;
  for (const name of ["marcaTipografia", "marcaTipografiaTitulos", "marcaTipografiaBotones"]) {
    const select = settingsForm.elements[name];
    if (!select) continue;
    fillFontSelect(select, select.value, marcaTipografias);
  }
}

function fontFileError(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!Object.hasOwn(FONT_FILE_TYPES, extension))
    return "Selecciona una fuente WOFF2, WOFF, TTF u OTF.";
  if (!file.size) return "El archivo de la fuente está vacío.";
  if (file.size > MAX_FONT_BYTES) return "La fuente no puede superar los 250 KB.";
  return null;
}

function readFontFile(file) {
  const error = fontFileError(file);
  if (error) return Promise.reject(new Error(error));
  const mime = FONT_FILE_TYPES[(file.name.split(".").pop() || "").toLowerCase()];
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "").split(",")[1] || "";
      if (!base64) return reject(new Error("No se pudo leer el archivo de la fuente."));
      resolve({
        dataUrl: `data:${mime};base64,${base64}`,
        fileName: file.name,
        fileSize: file.size,
      });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo de la fuente."));
    reader.readAsDataURL(file);
  });
}

function formatFontSize(bytes) {
  if (!bytes) return "";
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

function renderMarcaTipografias() {
  const list = document.querySelector("#marca-tipografias-list");
  if (!list) return;
  list.replaceChildren();
  marcaTipografias.forEach((font, index) => {
    const row = document.createElement("div");
    row.className = "custom-font-row";
    row.dataset.fontId = font.id;

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Nombre";
    const name = document.createElement("input");
    name.type = "text";
    name.value = font.nombre;
    name.maxLength = 60;
    name.placeholder = "Ej.: Trebuchet MS";
    name.setAttribute("aria-label", `Nombre de la tipografía ${index + 1}`);
    name.addEventListener("input", () => {
      font.nombre = name.value;
      renderMarcaFontSelects();
      syncMarcaTipografiasState();
      settingsForm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    nameLabel.append(name);

    const fallbackLabel = document.createElement("label");
    fallbackLabel.textContent = "Respaldo";
    const fallback = document.createElement("select");
    fallback.setAttribute("aria-label", `Respaldo de la tipografía ${index + 1}`);
    for (const option of RESPALDOS_TIPOGRAFIA) fallback.add(new Option(option.nombre, option.id));
    fallback.value = font.respaldo;
    fallback.addEventListener("change", () => {
      font.respaldo = fallback.value;
      syncMarcaTipografiasState();
      settingsForm.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fallbackLabel.append(fallback);

    const fileLabel = document.createElement("label");
    fileLabel.textContent = "Archivo (opcional)";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf";
    file.setAttribute("aria-label", `Archivo de la tipografía ${index + 1}`);
    const hint = document.createElement("p");
    hint.className = "custom-font-hint";
    const updateHint = () => {
      hint.textContent = font.dataUrl
        ? `Archivo cargado${font.fileName ? `: ${font.fileName}` : ""}${
            font.fileSize ? ` (${formatFontSize(font.fileSize)})` : ""
          }.`
        : "Sin archivo: se usará la fuente instalada en el dispositivo.";
    };
    updateHint();
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      try {
        const loaded = await readFontFile(selected);
        font.dataUrl = loaded.dataUrl;
        font.fileName = loaded.fileName;
        font.fileSize = loaded.fileSize;
        if (!font.nombre.trim()) font.nombre = selected.name.replace(/\.[^.]+$/, "").slice(0, 60);
        updateHint();
        renderMarcaFontSelects();
        syncMarcaTipografiasState();
        settingsForm.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        file.value = "";
        showValidationErrors([error.message], "Revisa la tipografía");
      }
    });
    fileLabel.append(file);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-action-btn btn-delete";
    remove.title = "Eliminar tipografía";
    remove.setAttribute("aria-label", `Eliminar tipografía ${index + 1}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      marcaTipografias.splice(index, 1);
      renderMarcaTipografias();
      settingsForm.dispatchEvent(new Event("input", { bubbles: true }));
    });

    row.append(nameLabel, fallbackLabel, fileLabel, remove, hint);
    list.append(row);
  });
  const add = document.querySelector("#marca-add-tipografia");
  if (add) add.disabled = marcaTipografias.length >= MAX_TIPOGRAFIAS;
  renderMarcaFontSelects();
  syncMarcaTipografiasState();
}

function addMarcaTipografia() {
  if (marcaTipografias.length >= MAX_TIPOGRAFIAS) return;
  marcaTipografias.push({
    id: `custom-${crypto.randomUUID()}`,
    nombre: "",
    respaldo: "sans",
    dataUrl: "",
    fileName: "",
    fileSize: 0,
  });
  renderMarcaTipografias();
  const rows = document.querySelectorAll("#marca-tipografias-list .custom-font-row");
  rows[rows.length - 1]?.querySelector('input[type="text"]')?.focus();
  settingsForm.dispatchEvent(new Event("input", { bubbles: true }));
}

function marcaTipografiaErrors() {
  if (marcaTipografias.length > MAX_TIPOGRAFIAS)
    return [`Puedes añadir como máximo ${MAX_TIPOGRAFIAS} tipografías.`];
  const errors = [];
  const ids = new Set();
  const names = new Set();
  marcaTipografias.forEach((font, index) => {
    const nombre = font.nombre.trim();
    if (!CUSTOM_FONT_ID.test(font.id))
      errors.push(`La tipografía ${index + 1} tiene un identificador no válido.`);
    else if (ids.has(font.id)) errors.push(`La tipografía ${index + 1} está duplicada.`);
    else ids.add(font.id);
    if (!nombre) errors.push(`La tipografía ${index + 1} no tiene nombre.`);
    else if (!FONT_NAME.test(nombre))
      errors.push(`El nombre de la tipografía ${index + 1} no es válido (máximo 60 caracteres).`);
    else {
      const key = nombre.toLowerCase();
      if (names.has(key)) errors.push(`La tipografía «${nombre}» está repetida.`);
      else names.add(key);
    }
    if (!Object.hasOwn(FONT_FALLBACKS, font.respaldo))
      errors.push(`El respaldo de la tipografía ${index + 1} no es válido.`);
    if (font.dataUrl && !/^data:font\/(woff2|woff|ttf|otf);base64,/.test(font.dataUrl))
      errors.push(`El archivo de la tipografía ${index + 1} no es válido.`);
  });
  return errors;
}

document.querySelector("#marca-add-tipografia")?.addEventListener("click", addMarcaTipografia);

let tenantAuthDraft = {};
let tenantAuthCommunityId = "";
let tenantAuthTouched = new Set();

function tenantAuthDefaults() {
  return DEFAULT_TENANT_AUTHORIZATIONS.map((item) => ({ ...item }));
}

function markTenantAuthTouched() {
  if (tenantAuthCommunityId) tenantAuthTouched.add(tenantAuthCommunityId);
  syncTenantAuthGuard();
}

/** Refleja solo las comunidades editadas para que el guard detecte cambios. */
function syncTenantAuthGuard() {
  const field = settingsForm?.elements.tenantAuthorizationsState;
  if (!field) return;
  field.value = JSON.stringify(
    Object.fromEntries([...tenantAuthTouched].map((id) => [id, tenantAuthDraft[id] || []])),
  );
}

function currentTenantAuthList() {
  if (!tenantAuthCommunityId) return [];
  if (!Array.isArray(tenantAuthDraft[tenantAuthCommunityId]))
    tenantAuthDraft[tenantAuthCommunityId] = tenantAuthDefaults();
  return tenantAuthDraft[tenantAuthCommunityId];
}

function renderTenantAuthorizationsEditor(focusIndex = -1) {
  const box = document.querySelector("#tenant-authorizations-editor");
  if (!box) return;
  box.replaceChildren();
  if (!tenantAuthCommunityId) {
    box.append(
      Object.assign(document.createElement("p"), {
        className: "form-intro",
        textContent: "No hay comunidades para configurar.",
      }),
    );
    return;
  }
  const list = currentTenantAuthList();
  if (!list.length)
    box.append(
      Object.assign(document.createElement("p"), {
        className: "form-intro",
        textContent:
          "Esta comunidad no tiene autorizaciones. Agrega una o restaura las predeterminadas.",
      }),
    );
  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "tenant-authorization-row";
    const fields = document.createElement("div");
    fields.className = "tenant-authorization-fields";
    const input = document.createElement("input");
    input.name = "tenantAuthorizationLabel";
    input.value = item.label || "";
    input.maxLength = 80;
    input.placeholder = "Ej.: Acceso a la piscina";
    input.setAttribute("aria-label", `Nombre de la autorización ${index + 1}`);
    input.addEventListener("input", () => {
      item.label = input.value;
      markTenantAuthTouched();
    });
    const description = document.createElement("textarea");
    description.rows = 2;
    description.maxLength = 200;
    description.value = item.description || "";
    description.placeholder = "Descripción breve: qué permite esta autorización";
    description.setAttribute("aria-label", `Descripción de la autorización ${index + 1}`);
    description.addEventListener("input", () => {
      item.description = description.value;
      markTenantAuthTouched();
    });
    fields.append(input, description);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-action-btn btn-delete";
    remove.title = "Eliminar autorización";
    remove.setAttribute("aria-label", "Eliminar autorización");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      list.splice(index, 1);
      markTenantAuthTouched();
      renderTenantAuthorizationsEditor();
    });
    row.append(fields, remove);
    box.append(row);
  });
  if (focusIndex >= 0) box.querySelectorAll("input")[focusIndex]?.focus();
}

function initTenantAuthorizations() {
  const select = document.querySelector("#tenant-authorization-community");
  if (!select) return;
  const saved = state.settings?.tenantAuthorizations;
  tenantAuthDraft =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? JSON.parse(JSON.stringify(saved))
      : {};
  tenantAuthTouched = new Set();
  syncTenantAuthGuard();
  select.replaceChildren();
  state.communities.forEach((community) => select.add(new Option(community.name, community.id)));
  tenantAuthCommunityId = state.communities[0]?.id || "";
  select.value = tenantAuthCommunityId;
  if (!select.dataset.wired) {
    select.dataset.wired = "true";
    select.addEventListener("change", () => {
      tenantAuthCommunityId = select.value;
      renderTenantAuthorizationsEditor();
    });
    document.querySelector("#add-tenant-authorization")?.addEventListener("click", () => {
      if (!tenantAuthCommunityId) return;
      const list = currentTenantAuthList();
      list.push({
        id: `custom_${crypto.randomUUID()}`,
        label: "",
        description: "",
      });
      markTenantAuthTouched();
      renderTenantAuthorizationsEditor(list.length - 1);
    });
    document.querySelector("#reset-tenant-authorizations")?.addEventListener("click", () => {
      if (!tenantAuthCommunityId) return;
      tenantAuthDraft[tenantAuthCommunityId] = tenantAuthDefaults();
      markTenantAuthTouched();
      renderTenantAuthorizationsEditor();
      toast("Se restauraron las autorizaciones predeterminadas. Guarda para aplicarlas.");
    });
  }
  renderTenantAuthorizationsEditor();
}

function tenantAuthorizationErrors() {
  const errors = [];
  for (const [communityId, list] of Object.entries(tenantAuthDraft)) {
    const communityName =
      state.communities.find((community) => community.id === communityId)?.name || communityId;
    if (!Array.isArray(list) || !list.length) {
      errors.push(
        `${communityName}: agrega al menos una autorización o restaura las predeterminadas.`,
      );
      continue;
    }
    const ids = new Set();
    list.forEach((item, index) => {
      const label = String(item?.label || "").trim();
      if (!item?.id || typeof item.id !== "string")
        errors.push(`${communityName}: la autorización ${index + 1} no es válida.`);
      else if (ids.has(item.id)) errors.push(`${communityName}: hay autorizaciones duplicadas.`);
      else ids.add(item.id);
      if (!label) errors.push(`${communityName}: la autorización ${index + 1} no tiene nombre.`);
      else if (label.length > 80)
        errors.push(`${communityName}: «${label.slice(0, 30)}…» supera los 80 caracteres.`);
      const description = String(item?.description || "").trim();
      if (description.length > 200)
        errors.push(
          `${communityName}: la descripción de «${label.slice(0, 30)}» supera los 200 caracteres.`,
        );
    });
  }
  return errors;
}

/** Solo guarda las comunidades con lista propia o con cambios en esta sesión. */
function tenantAuthorizationsPayload() {
  const saved = state.settings?.tenantAuthorizations;
  return Object.fromEntries(
    Object.entries(tenantAuthDraft)
      .filter(
        ([communityId]) =>
          tenantAuthTouched.has(communityId) || (saved && Object.hasOwn(saved, communityId)),
      )
      .map(([communityId, list]) => [
        communityId,
        (Array.isArray(list) ? list : []).map((item) => ({
          id: String(item?.id || "").trim(),
          label: String(item?.label || "").trim(),
          description: String(item?.description || "").trim(),
        })),
      ]),
  );
}

// ---------- Configuración → Comunidades (marca por comunidad) ----------
let communitySettingsId = "";
let communitySettingsUserId;
const communitySettingsDrafts = new Map();

function currentCommunitySettings() {
  return (
    state.communities.find(
      (community) => community.id === communitySettingsId && puedeEditarMarcaComunidad(community),
    ) || null
  );
}

function communityMarcaDefaults() {
  const marca = state.settings?.marca || {};
  return {
    colorPrimario: colorValue(marca.colorPrimario, "#11273e"),
    colorAcento: colorValue(marca.colorAcento, "#198b84"),
    colorFondo: colorValue(marca.colorFondo, "#f7f9fb"),
    colorSuperficie: colorValue(marca.colorSuperficie, "#ffffff"),
    colorTexto: colorValue(marca.colorTexto, "#17212b"),
    colorTextoSuave: colorValue(marca.colorTextoSuave, "#64748b"),
    colorBorde: colorValue(marca.colorBorde, "#e4e9ef"),
    tipografia: validFontId(marca.tipografia) ? marca.tipografia : "inter",
    tamanoBase: Number.isFinite(Number(marca.tamanoBase)) ? Number(marca.tamanoBase) : 14,
    radioBordes: Number.isFinite(Number(marca.radioBordes)) ? Number(marca.radioBordes) : 5,
    densidad: DENSIDADES.includes(marca.densidad) ? marca.densidad : "normal",
  };
}

function communitySettingsDraft(community) {
  let draft = communitySettingsDrafts.get(community.id);
  if (!draft || (!draft.dirty && !draft.loading && !draft.saving)) {
    // Mantener también la versión de la ficha que originó la edición.
    const { documents, statutes, documentFolders, ...payload } = community;
    draft = {
      payload,
      name: community.name || "",
      logoDataUrl: community.logoDataUrl || "",
      marca: { ...communityMarcaDefaults(), ...(community.marca || {}) },
      dirty: false,
      loading: false,
      saving: false,
      readToken: 0,
    };
    communitySettingsDrafts.set(community.id, draft);
  }
  return draft;
}

function setCommunityLogoPreview(url) {
  const preview = document.querySelector("#settings-community-logo-preview");
  if (!preview) return;
  preview.hidden = !url;
  if (url) preview.src = url;
  else preview.removeAttribute("src");
}

function renderCommunitySettings() {
  const select = document.querySelector("#settings-community-select");
  if (!select) return;
  if (communitySettingsUserId !== state.currentUserId) {
    communitySettingsDrafts.clear();
    communitySettingsId = "";
    communitySettingsUserId = state.currentUserId;
  }
  const communities = state.communities.filter(puedeEditarMarcaComunidad);
  for (const id of communitySettingsDrafts.keys()) {
    if (!communities.some((community) => community.id === id)) communitySettingsDrafts.delete(id);
  }
  const previous = communitySettingsId;
  select.replaceChildren();
  communities.forEach((community) => {
    select.add(new Option(community.name || community.id, community.id));
  });
  if (!communities.some((community) => community.id === previous))
    communitySettingsId = communities[0]?.id || "";
  select.value = communitySettingsId;
  const community = currentCommunitySettings();
  const draft = community ? communitySettingsDraft(community) : null;
  const nameInput = document.querySelector("#settings-community-name");
  if (nameInput) {
    nameInput.value = draft?.name || "";
    nameInput.disabled = !draft || draft.saving;
  }
  const logoInput = document.querySelector("#settings-community-logo");
  if (logoInput) {
    logoInput.value = "";
    logoInput.disabled = !draft || draft.saving;
  }
  setCommunityLogoPreview(draft?.logoDataUrl || "");
  const remove = document.querySelector("#settings-community-remove-logo");
  if (remove) {
    remove.hidden = !draft?.logoDataUrl && !draft?.loading;
    remove.disabled = !draft || draft.saving;
  }
  const marca = draft?.marca || {};
  const setControl = (selector, value) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.value = value;
    element.disabled = !draft || draft.saving;
  };
  setControl("#settings-community-colorPrimario", colorValue(marca.colorPrimario, "#11273e"));
  setControl("#settings-community-colorAcento", colorValue(marca.colorAcento, "#198b84"));
  setControl("#settings-community-colorFondo", colorValue(marca.colorFondo, "#f7f9fb"));
  setControl("#settings-community-colorSuperficie", colorValue(marca.colorSuperficie, "#ffffff"));
  setControl("#settings-community-colorTexto", colorValue(marca.colorTexto, "#17212b"));
  setControl("#settings-community-colorTextoSuave", colorValue(marca.colorTextoSuave, "#64748b"));
  setControl("#settings-community-colorBorde", colorValue(marca.colorBorde, "#e4e9ef"));
  const communityTipografia = validFontId(marca.tipografia) ? marca.tipografia : "inter";
  fillFontSelect(
    document.querySelector("#settings-community-tipografia"),
    communityTipografia,
    savedCustomFonts(),
  );
  setControl("#settings-community-tipografia", communityTipografia);
  setControl("#settings-community-tamanoBase", marca.tamanoBase ?? 14);
  setControl("#settings-community-radioBordes", marca.radioBordes ?? 5);
  setControl(
    "#settings-community-densidad",
    DENSIDADES.includes(marca.densidad) ? marca.densidad : "normal",
  );
  const save = document.querySelector("#settings-community-save");
  if (save) save.disabled = !draft || draft.loading || draft.saving;
  const hint = document.querySelector("#settings-community-hint");
  if (hint) {
    hint.textContent = draft?.loading
      ? "Leyendo el logo. Espera antes de guardar."
      : draft?.saving
        ? "Guardando comunidad…"
        : community
          ? `Estos datos se guardan en la ficha de ${community.name}. El estilo global sigue aplicándose a quien ve más de una comunidad.`
          : "No hay comunidades disponibles para personalizar.";
  }
}

function readCommunityLogo(file) {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
      reject(new Error("Selecciona una imagen PNG, JPG, SVG o WebP."));
      return;
    }
    if (file.size > 230_400) {
      reject(new Error("El logo no puede superar los 225 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo del logo."));
    reader.readAsDataURL(file);
  });
}

async function saveCommunitySettings() {
  const community = currentCommunitySettings();
  if (!community) {
    showValidationErrors(["Selecciona una comunidad."], "No se pudo guardar la comunidad");
    return;
  }
  const draft = communitySettingsDraft(community);
  if (draft.saving) return;
  if (draft.loading) {
    showValidationErrors(["Espera a que termine de leerse el logo."], "Revisa la comunidad");
    return;
  }
  const name = draft.name.trim();
  if (!name) {
    showValidationErrors(["El nombre de la comunidad es obligatorio."], "Revisa la comunidad");
    return;
  }
  if (name.length > 120) {
    showValidationErrors(["El nombre no puede superar los 120 caracteres."], "Revisa la comunidad");
    return;
  }
  draft.saving = true;
  renderCommunitySettings();
  try {
    const saved = await api.updateCommunity(community.id, {
      ...draft.payload,
      name,
      logoDataUrl: draft.logoDataUrl,
      marca: draft.marca,
    });
    // Limpiar solo este borrador; otros pueden contener cambios pendientes.
    communitySettingsDrafts.delete(community.id);
    Object.assign(community, saved);
    await refreshState();
    applyBrand(effectiveBrand(state.settings?.marca || readInjectedBrand(), state));
    renderCommunitySettings();
    toast("Comunidad actualizada.");
  } catch (error) {
    showValidationErrors([error.message], "No se pudo guardar la comunidad");
  } finally {
    draft.saving = false;
    renderCommunitySettings();
  }
}

function initCommunitySettings() {
  const select = document.querySelector("#settings-community-select");
  if (!select) return;
  if (!select.dataset.wired) {
    select.dataset.wired = "true";
    select.addEventListener("change", () => {
      communitySettingsId = select.value;
      renderCommunitySettings();
    });
    document
      .querySelector("#settings-community-logo")
      ?.addEventListener("change", async (event) => {
        const community = currentCommunitySettings();
        if (!community) return;
        const draft = communitySettingsDraft(community);
        if (draft.saving) return;
        const token = ++draft.readToken;
        const file = event.target.files?.[0];
        if (!file) {
          draft.loading = false;
          renderCommunitySettings();
          return;
        }
        draft.loading = true;
        renderCommunitySettings();
        try {
          const logo = await readCommunityLogo(file);
          if (communitySettingsDrafts.get(community.id) !== draft || draft.readToken !== token)
            return;
          draft.logoDataUrl = logo;
          draft.dirty = true;
        } catch (error) {
          if (communitySettingsDrafts.get(community.id) === draft && draft.readToken === token)
            showValidationErrors([error.message], `Revisa el logo de ${community.name}`);
        } finally {
          if (communitySettingsDrafts.get(community.id) === draft && draft.readToken === token) {
            draft.loading = false;
            if (communitySettingsId === community.id) renderCommunitySettings();
          }
        }
      });
    document.querySelector("#settings-community-remove-logo")?.addEventListener("click", () => {
      const community = currentCommunitySettings();
      if (!community) return;
      const draft = communitySettingsDraft(community);
      if (draft.saving) return;
      ++draft.readToken;
      draft.loading = false;
      draft.dirty = true;
      draft.logoDataUrl = "";
      renderCommunitySettings();
    });
    document.querySelector("#settings-community-name")?.addEventListener("input", (event) => {
      const community = currentCommunitySettings();
      if (!community) return;
      const draft = communitySettingsDraft(community);
      draft.name = event.target.value;
      draft.dirty = true;
    });
    const bindMarcaField = (selector, apply) => {
      const element = document.querySelector(selector);
      if (!element || element.dataset.wiredMarca) return;
      element.dataset.wiredMarca = "true";
      const eventName = element.tagName === "SELECT" ? "change" : "input";
      element.addEventListener(eventName, (event) => {
        const community = currentCommunitySettings();
        if (!community) return;
        const draft = communitySettingsDraft(community);
        if (draft.saving) return;
        apply(draft.marca, event.target);
        draft.dirty = true;
      });
    };
    for (const key of [
      "colorPrimario",
      "colorAcento",
      "colorFondo",
      "colorSuperficie",
      "colorTexto",
      "colorTextoSuave",
      "colorBorde",
    ])
      bindMarcaField(`#settings-community-${key}`, (marca, el) => {
        marca[key] = el.value;
      });
    bindMarcaField("#settings-community-tipografia", (marca, el) => {
      marca.tipografia = el.value;
    });
    bindMarcaField("#settings-community-tamanoBase", (marca, el) => {
      marca.tamanoBase = numericValue(el, 14, 12, 18);
    });
    bindMarcaField("#settings-community-radioBordes", (marca, el) => {
      marca.radioBordes = numericValue(el, 5, 0, 16);
    });
    bindMarcaField("#settings-community-densidad", (marca, el) => {
      marca.densidad = el.value;
    });
    document
      .querySelector("#settings-community-save")
      ?.addEventListener("click", saveCommunitySettings);
    document.querySelector("#settings-community-name")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveCommunitySettings();
      }
    });
  }
  renderCommunitySettings();
}

function renderSettings() {
  if (!settingsForm || !puedeAdministrar()) return;
  const s = state.settings || {};
  settingsForm.elements.nombreAsociacion.value = s.nombreAsociacion || "Asociación de Propietarios";
  settingsForm.elements.emailContacto.value = s.emailContacto || "";
  settingsForm.elements.telefonoContacto.value = s.telefonoContacto || "";
  settingsForm.elements.permitirRegistro.checked = s.permitirRegistro !== false;
  settingsForm.elements.permitirRecuperacion.checked = s.permitirRecuperacion !== false;
  settingsForm.elements.duracionSesionHoras.value = s.duracionSesionHoras ?? 8;
  settingsForm.elements.otpExpiraMinutos.value = s.otpExpiraMinutos ?? 10;
  settingsForm.elements.otpReenvioSegundos.value = s.otpReenvioSegundos ?? 60;
  settingsForm.elements.notificacionesEmail.checked = s.notificacionesEmail !== false;
  settingsForm.elements.avisosCambiosEmail.value = s.avisosCambiosEmail || "";
  settingsForm.elements.feeBeforeDays.value = s.feeBeforeDays ?? 3;
  settingsForm.elements.feeAfterDays.value = s.feeAfterDays ?? 7;
  settingsForm.elements.feeRepeatDays.value = s.feeRepeatDays ?? 0;
  settingsForm.elements.feeInternal.checked = s.feeInternal !== false;
  settingsForm.elements.feeEmail.checked = s.feeEmail === true;
  settingsForm.elements.feeEmailSubject.value = s.feeEmailSubject || "{{titulo}} · {{comunidad}}";
  settingsForm.elements.feeEmailBody.value =
    s.feeEmailBody || "{{mensaje}}\nConsulta la pestaña Financiero de la ficha del propietario.";
  settingsForm.elements.assessmentBeforeDays.value = s.assessmentBeforeDays ?? 3;
  settingsForm.elements.assessmentAfterDays.value = s.assessmentAfterDays ?? 7;
  settingsForm.elements.assessmentRepeatDays.value = s.assessmentRepeatDays ?? 0;
  settingsForm.elements.assessmentInternal.checked = s.assessmentInternal !== false;
  settingsForm.elements.assessmentEmail.checked = s.assessmentEmail === true;
  settingsForm.elements.serviceBeforeDays.value = s.serviceBeforeDays ?? 3;
  settingsForm.elements.serviceAfterDays.value = s.serviceAfterDays ?? 7;
  settingsForm.elements.serviceRepeatDays.value = s.serviceRepeatDays ?? 0;
  settingsForm.elements.serviceInternal.checked = s.serviceInternal !== false;
  settingsForm.elements.serviceEmail.checked = s.serviceEmail === true;
  settingsForm.elements.documentosMaxSizeMb.value = s.documentosMaxSizeMb ?? 15;
  settingsForm.elements.documentosMaxArchivos.value = s.documentosMaxArchivos ?? 20;
  const tipos = Array.isArray(s.documentosTiposPermitidos)
    ? s.documentosTiposPermitidos
    : TIPOS_DOCUMENTO;
  settingsForm.querySelectorAll('input[name="documentosTiposPermitidos"]').forEach((checkbox) => {
    checkbox.checked = tipos.includes(checkbox.value);
  });
  settingsForm.elements.monedaPorDefecto.value = s.monedaPorDefecto || "EUR";
  settingsForm.elements.diasAvisoVencimientoContrato.value = s.diasAvisoVencimientoContrato ?? 30;
  settingsForm.elements.filasPorPagina.value = s.filasPorPagina ?? 10;
  settingsForm.elements.mantenimiento.checked = !!s.mantenimiento;
  settingsForm.elements.mensajeMantenimiento.value = s.mensajeMantenimiento || "";
  const marca = s.marca || {};
  marcaTipografias = normalizeFontsForEditor(marca.tipografias);
  renderMarcaTipografias();
  settingsForm.elements.marcaNombre.value = marca.nombre || "Gestión de Comunidades";
  settingsForm.elements.marcaColorPrimario.value = colorValue(marca.colorPrimario, "#11273e");
  settingsForm.elements.marcaColorAcento.value = colorValue(marca.colorAcento, "#198b84");
  settingsForm.elements.marcaColorFondo.value = colorValue(marca.colorFondo, "#f7f9fb");
  settingsForm.elements.marcaColorSuperficie.value = colorValue(marca.colorSuperficie, "#ffffff");
  settingsForm.elements.marcaColorTexto.value = colorValue(marca.colorTexto, "#17212b");
  settingsForm.elements.marcaColorTextoSuave.value = colorValue(marca.colorTextoSuave, "#64748b");
  settingsForm.elements.marcaColorBorde.value = colorValue(marca.colorBorde, "#e4e9ef");
  const baseFont = validFontId(marca.tipografia, marcaTipografias) ? marca.tipografia : "inter";
  fillFontSelect(settingsForm.elements.marcaTipografia, baseFont, marcaTipografias);
  fillFontSelect(
    settingsForm.elements.marcaTipografiaTitulos,
    validFontId(marca.tipografiaTitulos, marcaTipografias) ? marca.tipografiaTitulos : baseFont,
    marcaTipografias,
  );
  fillFontSelect(
    settingsForm.elements.marcaTipografiaBotones,
    validFontId(marca.tipografiaBotones, marcaTipografias) ? marca.tipografiaBotones : baseFont,
    marcaTipografias,
  );
  settingsForm.elements.marcaTamanoBase.value = marca.tamanoBase ?? 14;
  settingsForm.elements.marcaEscalaLogo.value = marca.escalaLogo ?? 100;
  settingsForm.elements.marcaRadioBordes.value = marca.radioBordes ?? 5;
  settingsForm.elements.marcaDensidad.value = DENSIDADES.includes(marca.densidad)
    ? marca.densidad
    : "normal";
  settingsForm.elements.marcaLogo.value = "";
  const textos = textosDe(s);
  settingsForm.querySelectorAll("[data-texto]").forEach((el) => {
    el.value = textos[el.dataset.texto] ?? "";
  });
  const preview = document.querySelector("#marca-logo-preview");
  if (preview) {
    preview.hidden = !marca.logoDataUrl;
    if (marca.logoDataUrl) preview.src = marca.logoDataUrl;
    else preview.removeAttribute("src");
  }
  initTenantAuthorizations();
  armarGuardia(
    settingsForm,
    settingsForm.closest(".admin-pane") || document.querySelector("#administracion"),
  );
}

function readMarca() {
  const file = settingsForm.elements.marcaLogo.files?.[0];
  return new Promise((resolve, reject) => {
    const build = (logoDataUrl) => {
      const tipografia = settingsForm.elements.marcaTipografia.value || "inter";
      const marca = {
        nombre: settingsForm.elements.marcaNombre.value.trim(),
        colorPrimario: settingsForm.elements.marcaColorPrimario.value,
        colorAcento: settingsForm.elements.marcaColorAcento.value,
        colorFondo: settingsForm.elements.marcaColorFondo.value,
        colorSuperficie: settingsForm.elements.marcaColorSuperficie.value,
        colorTexto: settingsForm.elements.marcaColorTexto.value,
        colorTextoSuave: settingsForm.elements.marcaColorTextoSuave.value,
        colorBorde: settingsForm.elements.marcaColorBorde.value,
        tipografia,
        tipografiaTitulos: settingsForm.elements.marcaTipografiaTitulos?.value || tipografia,
        tipografiaBotones: settingsForm.elements.marcaTipografiaBotones?.value || tipografia,
        tipografias: marcaTipografias.map((font) => ({
          id: font.id,
          nombre: font.nombre.trim(),
          respaldo: font.respaldo,
          ...(font.dataUrl ? { dataUrl: font.dataUrl } : {}),
        })),
        tamanoBase: numericValue(settingsForm.elements.marcaTamanoBase, 14, 12, 18),
        escalaLogo: numericValue(settingsForm.elements.marcaEscalaLogo, 100, 100, 300),
        radioBordes: numericValue(settingsForm.elements.marcaRadioBordes, 5, 0, 16),
        densidad: settingsForm.elements.marcaDensidad.value,
      };
      if (logoDataUrl !== undefined) marca.logoDataUrl = logoDataUrl;
      resolve(marca);
    };
    if (file) {
      if (file.size > 230_400) return reject(new Error("El logo no puede superar los 225 KB."));
      const reader = new FileReader();
      reader.onload = () => build(reader.result);
      reader.onerror = () => build(undefined);
      reader.readAsDataURL(file);
    } else build(undefined);
  });
}

settingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (settingsTab === "estilo" && estiloTab === "comunidades") {
    await saveCommunitySettings();
    return;
  }
  const brandingOnly =
    settingsTab === "estilo" && !hasPermission("admin:settings") && hasPermission("admin:branding");
  if (!brandingOnly && !requirePermission("admin:settings")) return;
  const fontErrors = marcaTipografiaErrors();
  if (fontErrors.length) {
    showValidationErrors(fontErrors, "Revisa las tipografías");
    return;
  }
  if (!brandingOnly) {
    const authErrors = tenantAuthorizationErrors();
    if (authErrors.length) {
      showValidationErrors(authErrors, "Revisa las autorizaciones de inquilinos");
      return;
    }
  }
  const data = brandingOnly
    ? { marca: await readMarca() }
    : {
        nombreAsociacion: settingsForm.elements.nombreAsociacion.value.trim(),
        emailContacto: settingsForm.elements.emailContacto.value.trim(),
        telefonoContacto: settingsForm.elements.telefonoContacto.value.trim(),
        permitirRegistro: settingsForm.elements.permitirRegistro.checked,
        permitirRecuperacion: settingsForm.elements.permitirRecuperacion.checked,
        duracionSesionHoras: numericValue(settingsForm.elements.duracionSesionHoras, 8, 1, 720),
        otpExpiraMinutos: numericValue(settingsForm.elements.otpExpiraMinutos, 10, 1, 60),
        otpReenvioSegundos: numericValue(settingsForm.elements.otpReenvioSegundos, 60, 10, 600),
        textos: [...settingsForm.querySelectorAll("[data-texto]")].reduce((acc, el) => {
          acc[el.dataset.texto] = el.value;
          return acc;
        }, {}),
        notificacionesEmail: settingsForm.elements.notificacionesEmail.checked,
        avisosCambiosEmail: settingsForm.elements.avisosCambiosEmail.value.trim(),
        feeBeforeDays: Number(settingsForm.elements.feeBeforeDays.value),
        feeAfterDays: Number(settingsForm.elements.feeAfterDays.value),
        feeRepeatDays: Number(settingsForm.elements.feeRepeatDays.value),
        feeInternal: settingsForm.elements.feeInternal.checked,
        feeEmail: settingsForm.elements.feeEmail.checked,
        feeEmailSubject: settingsForm.elements.feeEmailSubject.value.trim(),
        feeEmailBody: settingsForm.elements.feeEmailBody.value.trim(),
        assessmentBeforeDays: Number(settingsForm.elements.assessmentBeforeDays.value),
        assessmentAfterDays: Number(settingsForm.elements.assessmentAfterDays.value),
        assessmentRepeatDays: Number(settingsForm.elements.assessmentRepeatDays.value),
        assessmentInternal: settingsForm.elements.assessmentInternal.checked,
        assessmentEmail: settingsForm.elements.assessmentEmail.checked,
        serviceBeforeDays: Number(settingsForm.elements.serviceBeforeDays.value),
        serviceAfterDays: Number(settingsForm.elements.serviceAfterDays.value),
        serviceRepeatDays: Number(settingsForm.elements.serviceRepeatDays.value),
        serviceInternal: settingsForm.elements.serviceInternal.checked,
        serviceEmail: settingsForm.elements.serviceEmail.checked,
        tenantAuthorizations: tenantAuthorizationsPayload(),
        documentosMaxSizeMb: numericValue(settingsForm.elements.documentosMaxSizeMb, 15, 1, 50),
        documentosMaxArchivos: numericValue(settingsForm.elements.documentosMaxArchivos, 20, 1, 50),
        documentosTiposPermitidos: [
          ...settingsForm.querySelectorAll('input[name="documentosTiposPermitidos"]:checked'),
        ].map((checkbox) => checkbox.value),
        monedaPorDefecto: settingsForm.elements.monedaPorDefecto.value || "EUR",
        diasAvisoVencimientoContrato: numericValue(
          settingsForm.elements.diasAvisoVencimientoContrato,
          30,
          0,
          365,
        ),
        filasPorPagina: Number(settingsForm.elements.filasPorPagina.value) || 10,
        mantenimiento: settingsForm.elements.mantenimiento.checked,
        mensajeMantenimiento: settingsForm.elements.mensajeMantenimiento.value.trim(),
        marca: await readMarca(),
      };
  try {
    state.settings = await api.updateSettings(data);
    applyBrand(effectiveBrand(state.settings.marca || readInjectedBrand(), state));
    applyPublicSettings(state.settings);
    aplicarFilasPorPagina(state.settings.filasPorPagina);
    limpiarGuardia(
      settingsForm,
      settingsForm.closest(".admin-pane") || document.querySelector("#administracion"),
    );
    toast(brandingOnly ? "Estilo guardado." : "Configuración guardada.");
  } catch (error) {
    showValidationErrors(
      [error.message],
      brandingOnly ? "No se pudo guardar el estilo" : "No se pudo guardar la configuración",
    );
  }
});

// ---------- Visibilidad de la pantalla ----------
export function renderAdministracion() {
  const visible = puedeAdministrar();
  const nav = document.querySelector("#nav-administracion");
  if (nav) nav.hidden = !visible;
  // Los tabs y paneles se ocultan según el permiso del rol, aunque se fuerce
  // la URL; sin ningún permiso admin la pantalla queda vacía.
  document.querySelectorAll("#administracion [data-admin-tab]").forEach((button) => {
    button.hidden = !conPermisoTab(button.dataset.adminTab);
  });
  document.querySelectorAll("#administracion [data-admin-pane]").forEach((pane) => {
    pane.hidden = !conPermisoTab(pane.dataset.adminPane);
  });
  if (!visible) return;
  if (!conPermisoTab(adminTabActual))
    adminTabActual = Object.keys(ADMIN_TABS).find(conPermisoTab) || "usuarios";
  switchAdminTab(adminTabActual);
}

export { switchAdminTab };
