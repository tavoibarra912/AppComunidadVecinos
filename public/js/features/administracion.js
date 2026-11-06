import { api } from "../api.js";
import { state, refreshState, hasPermission, requirePermission } from "../state.js";
import { toast, showValidationErrors, armarGuardia, limpiarGuardia, intentarCerrar } from "../utils.js";
import { createDataTable } from "../table.js";

// ==========================================
// PANTALLA ADMINISTRACIÓN: Usuarios / Roles / Configuración
// ==========================================

const PERMISOS_CATALOGO = [
  { key: "community:read", label: "Ver comunidades" },
  { key: "community:manage", label: "Gestionar comunidades" },
  { key: "owner:read", label: "Ver propietarios" },
  { key: "owner:manage", label: "Gestionar propietarios" },
  { key: "owner:edit", label: "Editar su propio perfil" },
  { key: "owner:documents:submit", label: "Subir documentación propia" },
  { key: "property:read", label: "Ver inmuebles" },
  { key: "property:manage", label: "Gestionar inmuebles" },
  { key: "tenant:read", label: "Ver inquilinos" },
  { key: "tenant:manage", label: "Gestionar inquilinos" },
  { key: "document:approve", label: "Aprobar documentación" },
  { key: "admin:users", label: "Administrar usuarios" },
  { key: "admin:roles", label: "Administrar roles" },
  { key: "admin:settings", label: "Administrar configuración" },
  { key: "admin_notification:read", label: "Ver buzón del administrador" },
  { key: "owner_notification:read", label: "Ver su buzón de avisos" }
];

let userTable = null;
let adminTabActual = "usuarios";
let editingUserId = null;
let editingRoleId = null;
let dirtySnapshot = "";

function puedeAdministrar() {
  return state.activeRole === "admin" || hasPermission("admin:users");
}

function switchAdminTab(tab) {
  adminTabActual = tab;
  document.querySelectorAll("#administracion [data-admin-tab]").forEach(btn => {
    const active = btn.dataset.adminTab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("#administracion [data-admin-pane]").forEach(pane => {
    pane.hidden = pane.dataset.adminPane !== tab;
  });
  if (tab === "usuarios") renderUsers();
  if (tab === "roles") renderRoles();
  if (tab === "settings") renderSettings();
}

document.querySelectorAll("#administracion [data-admin-tab]").forEach(btn => {
  btn.addEventListener("click", () => switchAdminTab(btn.dataset.adminTab));
});

// ---------- Usuarios ----------
function renderUsers() {
  if (!puedeAdministrar()) return;
  if (!userTable) {
    userTable = createDataTable({
      mount: document.querySelector("#usuarios-table"),
      entitySingular: "usuario",
      entityPlural: "usuarios",
      emptyTitle: "No hay usuarios",
      emptyText: "Creá el primer usuario de la plataforma.",
      getRows: () => state.users,
      columns: [
        {
          key: "usuario",
          label: "Usuario",
          value: u => u.usuario,
          defaultVisible: true,
          render: u => {
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
          }
        },
        { key: "email", label: "Email", value: u => u.email, defaultVisible: true },
        {
          key: "rol",
          label: "Rol",
          value: u => u.rol,
          defaultVisible: true,
          render: u => {
            const badge = document.createElement("span");
            badge.className = "status-badge " + (u.rol === "administrador" ? "member" : "non-member");
            badge.textContent = u.rol;
            return badge;
          }
        },
        {
          key: "activo",
          label: "Estado",
          value: u => (u.activo ? "Activo" : "Inactivo"),
          defaultVisible: true,
          render: u => {
            const badge = document.createElement("span");
            badge.className = `status-badge ${u.activo ? "doc-approved" : "doc-rejected"}`;
            badge.textContent = u.activo ? "Activo" : "Inactivo";
            return badge;
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
          render: u => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnEdit = iconBtn("btn-edit", "Editar", `Editar ${u.usuario}`, ICON_EDIT);
            btnEdit.addEventListener("click", () => openUserEditor(u.id));
            const btnDelete = iconBtn("btn-delete", "Eliminar", `Eliminar ${u.usuario}`, ICON_DELETE);
            btnDelete.addEventListener("click", () => deleteUser(u.id, u.usuario));
            wrap.append(btnEdit, btnDelete);
            return wrap;
          }
        }
      ]
    });
  } else {
    userTable.refresh();
  }
}

function iconBtn(className, title, ariaLabel, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-action-btn ${className}`;
  btn.title = title;
  btn.setAttribute("aria-label", ariaLabel);
  btn.innerHTML = svg;
  return btn;
}

const ICON_EDIT = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const ICON_DELETE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

const userDialog = document.querySelector("#user-dialog");
const userForm = document.querySelector("#user-form");
const userError = document.querySelector("#user-form-error");

function openUserEditor(id = null) {
  if (!requirePermission("admin:users")) return;
  editingUserId = id;
  userForm.reset();
  userError.textContent = "";
  const roles = state.roles;
  const rolSelect = userForm.elements.rol;
  rolSelect.replaceChildren();
  roles.forEach(r => rolSelect.add(new Option(r.nombre, r.nombre)));
  const u = state.users.find(item => item.id === id);
  document.querySelector("#user-dialog-title").textContent = u ? `Editar usuario: ${u.usuario}` : "Nuevo usuario";
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
  armarGuardia(userForm, userDialog);
  userDialog.showModal();
  userForm.elements.usuario.focus();
}

const ICON_USER_SAVE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path></svg>`;

userForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("admin:users")) return;
  const data = {
    nombre: userForm.elements.nombre.value.trim(),
    apellido: userForm.elements.apellido.value.trim(),
    usuario: userForm.elements.usuario.value.trim(),
    email: userForm.elements.email.value.trim(),
    rol: userForm.elements.rol.value,
    activo: userForm.elements.activo.checked
  };
  if (!data.usuario) {
    userError.textContent = "El nombre de usuario es obligatorio.";
    return;
  }
  try {
    if (editingUserId) {
      await api.updateUser(editingUserId, data);
    } else {
      await api.createUser(data);
    }
  } catch (error) {
    userError.textContent = error.message;
    return;
  }
  limpiarGuardia(userForm, userDialog);
  userDialog.close();
  await refreshState();
  renderUsers();
  toast(editingUserId ? "Usuario actualizado." : "Usuario creado.");
  editingUserId = null;
});

async function deleteUser(id, usuario) {
  if (!requirePermission("admin:users")) return;
  if (!confirm(`¿Eliminar el usuario "${usuario}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api.deleteUser(id);
  } catch (error) {
    showValidationErrors([error.message], "No se puede eliminar el usuario");
    return;
  }
  await refreshState();
  renderUsers();
  toast(`Usuario ${usuario} eliminado.`);
}

document.querySelector("#new-user")?.addEventListener("click", () => openUserEditor());
document.querySelector("#close-user-dialog")?.addEventListener("click", () => intentarCerrar(userForm, userDialog));
document.querySelector("#cancel-user-dialog")?.addEventListener("click", () => intentarCerrar(userForm, userDialog));

// ---------- Roles ----------
function renderRoles() {
  if (!puedeAdministrar()) return;
  const listEl = document.querySelector("#roles-list");
  if (!listEl) return;
  listEl.replaceChildren();
  state.roles.forEach(role => {
    const card = document.createElement("div");
    card.className = "community-property-card";
    const info = document.createElement("div");
    info.className = "community-property-info";
    const title = document.createElement("span");
    title.className = "community-property-title";
    title.textContent = role.nombre + (role.sistema ? " (sistema)" : "");
    const usuarios = state.users.filter(u => u.rol === role.nombre).length;
    const sub = document.createElement("span");
    sub.className = "community-property-sub";
    sub.textContent = `${role.descripcion || "Sin descripción"} · ${role.permisos.length} permisos · ${usuarios} usuario(s)`;
    info.append(title, sub);

    const actions = document.createElement("div");
    actions.className = "community-property-actions";
    const btnEdit = iconBtn("btn-edit", "Editar rol", `Editar rol ${role.nombre}`, ICON_EDIT);
    btnEdit.addEventListener("click", () => openRoleEditor(role.id));
    actions.append(btnEdit);
    if (!role.sistema) {
      const btnDelete = iconBtn("btn-delete", "Eliminar rol", `Eliminar rol ${role.nombre}`, ICON_DELETE);
      btnDelete.addEventListener("click", () => deleteRole(role.id, role.nombre));
      actions.append(btnDelete);
    }
    card.append(info, actions);
    listEl.append(card);
  });
}

const roleDialog = document.querySelector("#role-dialog");
const roleForm = document.querySelector("#role-form");
const roleError = document.querySelector("#role-form-error");
const rolePermissionsList = document.querySelector("#role-permissions-list");

function renderRolePermissions(selected = []) {
  if (!rolePermissionsList) return;
  rolePermissionsList.replaceChildren();
  const selectedSet = new Set(selected);
  PERMISOS_CATALOGO.forEach(({ key, label }) => {
    const item = document.createElement("label");
    item.className = "role-permission-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = selectedSet.has(key);
    item.append(checkbox, document.createTextNode(" " + label));
    rolePermissionsList.append(item);
  });
}

function openRoleEditor(id = null) {
  if (!requirePermission("admin:roles")) return;
  editingRoleId = id;
  roleForm.reset();
  roleError.textContent = "";
  const role = state.roles.find(item => item.id === id);
  document.querySelector("#role-dialog-title").textContent = role ? `Editar rol: ${role.nombre}` : "Nuevo rol";
  renderRolePermissions(role ? role.permisos : []);
  if (role) {
    roleForm.elements.nombre.value = role.nombre;
    roleForm.elements.descripcion.value = role.descripcion || "";
  }
  armarGuardia(roleForm, roleDialog);
  roleDialog.showModal();
  roleForm.elements.nombre.focus();
}

roleForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("admin:roles")) return;
  const permisos = [...rolePermissionsList.querySelectorAll("input:checked")].map(input => input.value);
  const data = {
    nombre: roleForm.elements.nombre.value.trim(),
    descripcion: roleForm.elements.descripcion.value.trim(),
    permisos
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
document.querySelector("#close-role-dialog")?.addEventListener("click", () => intentarCerrar(roleForm, roleDialog));
document.querySelector("#cancel-role-dialog")?.addEventListener("click", () => intentarCerrar(roleForm, roleDialog));

// ---------- Configuración General ----------
const settingsForm = document.querySelector("#settings-form");

function renderSettings() {
  if (!settingsForm || !puedeAdministrar()) return;
  const s = state.settings || {};
  settingsForm.elements.nombreAsociacion.value = s.nombreAsociacion || "";
  settingsForm.elements.emailContacto.value = s.emailContacto || "";
  settingsForm.elements.telefonoContacto.value = s.telefonoContacto || "";
  settingsForm.elements.otpExpiraMinutos.value = s.otpExpiraMinutos ?? 10;
  settingsForm.elements.otpReenvioSegundos.value = s.otpReenvioSegundos ?? 60;
  settingsForm.elements.notificacionesEmail.checked = s.notificacionesEmail !== false;
  armarGuardia(settingsForm, settingsForm.closest(".admin-pane") || document.querySelector("#administracion"));
}

settingsForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("admin:settings")) return;
  const data = {
    nombreAsociacion: settingsForm.elements.nombreAsociacion.value.trim(),
    emailContacto: settingsForm.elements.emailContacto.value.trim(),
    telefonoContacto: settingsForm.elements.telefonoContacto.value.trim(),
    otpExpiraMinutos: Number(settingsForm.elements.otpExpiraMinutos.value) || 10,
    otpReenvioSegundos: Number(settingsForm.elements.otpReenvioSegundos.value) || 60,
    notificacionesEmail: settingsForm.elements.notificacionesEmail.checked
  };
  try {
    state.settings = await api.updateSettings(data);
    limpiarGuardia(settingsForm, settingsForm.closest(".admin-pane") || document.querySelector("#administracion"));
    toast("Configuración guardada.");
  } catch (error) {
    showValidationErrors([error.message], "No se pudo guardar la configuración");
  }
});

// ---------- Visibilidad de la pantalla ----------
export function renderAdministracion() {
  const visible = puedeAdministrar();
  const nav = document.querySelector("#nav-administracion");
  if (nav) nav.hidden = !visible;
  if (!visible) return;
  if (adminTabActual === "usuarios") renderUsers();
}

export { switchAdminTab };
