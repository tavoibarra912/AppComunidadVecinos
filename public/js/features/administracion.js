import { sanitizeHtml, escapeHtml } from "../html.js";
import { api } from "../api.js";
import { state, refreshState, hasPermission, requirePermission } from "../state.js";
import { toast, showValidationErrors, armarGuardia, limpiarGuardia, intentarCerrar } from "../utils.js";
import { createDataTable } from "../table.js";
import { renderAudit } from "./audit.js";
import { applyBrand } from "../brand.js";
const ADMIN_TABS = { usuarios: "admin:users", roles: "admin:roles", settings: "admin:settings", auditoria: "audit:read" };

// ==========================================
// PANTALLA ADMINISTRACIÓN: Usuarios / Roles / Configuración
// ==========================================

const PERMISOS_CATALOGO = [
  { key: "community:read", label: "Ver comunidades", grupo: "Comunidades" },
  { key: "community:create", label: "Crear comunidades", grupo: "Comunidades" },
  { key: "community:manage", label: "Administrar comunidades", grupo: "Comunidades" },
  { key: "community:delete", label: "Eliminar comunidades", grupo: "Comunidades" },
  { key: "owner:read", label: "Ver propietarios", grupo: "Propietarios" },
  { key: "owner:manage", label: "Gestionar propietarios", grupo: "Propietarios" },
  { key: "owner:edit", label: "Editar su propio perfil", grupo: "Propietarios" },
  { key: "owner:delete", label: "Eliminar propietarios", grupo: "Propietarios" },
  { key: "owner:documents:submit", label: "Subir documentación propia", grupo: "Propietarios" },
  { key: "property:read", label: "Ver inmuebles", grupo: "Inmuebles" },
  { key: "property:manage", label: "Gestionar inmuebles", grupo: "Inmuebles" },
  { key: "property:delete", label: "Eliminar inmuebles", grupo: "Inmuebles" },
  { key: "tenant:read", label: "Ver inquilinos", grupo: "Inquilinos" },
  { key: "tenant:manage", label: "Gestionar inquilinos", grupo: "Inquilinos" },
  { key: "tenant:delete", label: "Eliminar inquilinos", grupo: "Inquilinos" },
  { key: "document:read", label: "Ver documentos", grupo: "Documentación" },
  { key: "document:approve", label: "Aprobar documentación", grupo: "Documentación" },
  { key: "document:delete", label: "Eliminar documentos", grupo: "Documentación" },
  { key: "reports:read", label: "Ver reportes", grupo: "Reportes y auditoría" },
  { key: "audit:read", label: "Ver auditoría", grupo: "Reportes y auditoría" },
  { key: "admin:users", label: "Administrar usuarios", grupo: "Sistema" },
  { key: "admin:roles", label: "Administrar roles", grupo: "Sistema" },
  { key: "admin:settings", label: "Administrar configuración", grupo: "Sistema" },
  { key: "admin_notification:read", label: "Ver buzón del administrador", grupo: "Notificaciones" },
  { key: "owner_notification:read", label: "Ver su buzón de avisos", grupo: "Notificaciones" }
];

let userTable = null;
let adminTabActual = "usuarios";
let editingUserId = null;
let editingRoleId = null;
let dirtySnapshot = "";

function puedeAdministrar() {
  return Object.values(ADMIN_TABS).some(p => hasPermission(p));
}

function switchAdminTab(tab) {
  const permissions = ADMIN_TABS;
  if (!hasPermission(permissions[tab])) return;
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
  if (tab === "auditoria") renderAudit();
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
          key: "perfiles",
          label: "Perfiles",
          value: u => {
            const parts = [];
            if (state.owners.some(o => o.userId === u.id)) parts.push("Propietario");
            if (state.tenants.some(t => t.userId === u.id)) parts.push("Inquilino");
            if (state.communities.some(c => c.adminUserId === u.id)) parts.push("Admin de Comunidad");
            return parts.join(", ") || "—";
          },
          defaultVisible: true
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
  renderUserLinkSelects(u);
  armarGuardia(userForm, userDialog);
  userDialog.showModal();
  userForm.elements.usuario.focus();
}

/** Puebla los selects de vinculación con los registros sin cuenta asignada. */
function renderUserLinkSelects(user) {
  const isSuperAdmin = user?.rol === "super_admin";
  const linkSection = document.querySelector("#user-link-section");
  const superHint = document.querySelector("#user-link-superadmin-hint");
  if (linkSection) linkSection.hidden = isSuperAdmin;
  if (superHint) superHint.hidden = !isSuperAdmin;
  if (isSuperAdmin) return;

  // Vínculos actuales calculados desde los registros (no desde la cuenta)
  const linkedOwnerId = (state.owners.find(o => o.userId === user?.id) || {}).id || "";
  const linkedTenantId = (state.tenants.find(t => t.userId === user?.id) || {}).id || "";

  if (userLinkedOwnerSelect) {
    userLinkedOwnerSelect.replaceChildren(new Option("Sin perfil Propietario", ""));
    state.owners.forEach(owner => {
      if (owner.userId && owner.userId !== user?.id) return; // ya vinculado a otra cuenta
      const communityName = owner.communityName ||
        state.communities.find(c => c.id === owner.communityId)?.name || "";
      userLinkedOwnerSelect.add(new Option(
        `${owner.name} ${owner.surname} (${owner.dni})${communityName ? " · " + communityName : ""}`,
        owner.id
      ));
    });
    if (linkedOwnerId) userLinkedOwnerSelect.value = linkedOwnerId;
  }

  if (userLinkedTenantSelect) {
    userLinkedTenantSelect.replaceChildren(new Option("Sin perfil Inquilino", ""));
    state.tenants.forEach(tenant => {
      if (tenant.userId && tenant.userId !== user?.id) return;
      userLinkedTenantSelect.add(new Option(
        `${tenant.name} ${tenant.surname} (${tenant.documentId || "sin documento"})`,
        tenant.id
      ));
    });
    if (linkedTenantId) userLinkedTenantSelect.value = linkedTenantId;
  }
}

const ICON_USER_SAVE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path></svg>`;

userForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requirePermission("admin:users")) return;
  if (!data.usuario) {
    userError.textContent = "El nombre de usuario es obligatorio.";
    return;
  }
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
    ...(password ? { password } : {})
  };
  try {
    let savedUser;
    if (editingUserId) {
      savedUser = await api.updateUser(editingUserId, data);
    } else {
      savedUser = await api.createUser(data);
    }

    if (savedUser.id === state.currentUserId && (data.password || !data.activo)) {
      window.dispatchEvent(new Event("auth:expired")); toast("Volvé a iniciar sesión para continuar."); return;
    }
    // Sincronizar vinculaciones de perfiles (Propietario / Inquilino)
    // Super Admin no lleva perfiles vinculados: desvincular si los tuviera
    if (data.rol === "super_admin") {
      await api.linkOwner(savedUser.id, "");
      await api.linkTenant(savedUser.id, "");
    } else {
      const currentLinkedOwnerId = state.owners.find(o => o.userId === savedUser.id)?.id || "";
      const newOwnerId = userLinkedOwnerSelect?.value || "";
      if (newOwnerId !== currentLinkedOwnerId) {
        await api.linkOwner(savedUser.id, newOwnerId);
      }
      const currentLinkedTenantId = state.tenants.find(t => t.userId === savedUser.id)?.id || "";
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
  if (!confirm(`¿Eliminar el usuario "${usuario}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api.deleteUser(id);
  } catch (error) {
    showValidationErrors([error.message], "No se puede eliminar el usuario");
    return;
  }
  if (id === state.currentUserId) { window.dispatchEvent(new Event("auth:expired")); return; }
  await refreshState();
  renderUsers();
  toast(`Usuario ${usuario} eliminado.`);
}

document.querySelector("#new-user")?.addEventListener("click", () => openUserEditor());
document.querySelector("#close-user-dialog")?.addEventListener("click", () => intentarCerrar(userForm, userDialog));
document.querySelector("#cancel-user-dialog")?.addEventListener("click", () => intentarCerrar(userForm, userDialog));

// ---------- Roles ----------
let rolesTable = null;

function renderRoles() {
  if (!puedeAdministrar()) return;
  if (!rolesTable) {
    rolesTable = createDataTable({
      mount: document.querySelector("#roles-table"),
      entitySingular: "rol",
      entityPlural: "roles",
      emptyTitle: "No hay roles",
      emptyText: "Creá el primer rol de la plataforma.",
      getRows: () => state.roles,
      columns: [
        {
          key: "nombre",
          label: "Rol",
          value: r => r.nombre,
          defaultVisible: true,
          render: r => {
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
          }
        },
        { key: "descripcion", label: "Descripción", value: r => r.descripcion || "—", defaultVisible: true },
        {
          key: "permisos",
          label: "Permisos",
          value: r => String(r.permisos.length),
          defaultVisible: true,
          render: r => {
            const badge = document.createElement("span");
            badge.className = "dni-badge";
            badge.textContent = `${r.permisos.length} permisos`;
            return badge;
          }
        },
        {
          key: "usuarios",
          label: "Usuarios",
          groupable: false,
          value: r => String(state.users.filter(u => u.rol === r.nombre).length)
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
          render: r => {
            const wrap = document.createElement("div");
            wrap.className = "row-actions";
            const btnEdit = iconBtn("btn-edit", "Editar rol", `Editar rol ${r.nombre}`, ICON_EDIT);
            btnEdit.addEventListener("click", () => openRoleEditor(r.id));
            wrap.append(btnEdit);
            if (!r.sistema) {
              const btnDelete = iconBtn("btn-delete", "Eliminar rol", `Eliminar rol ${r.nombre}`, ICON_DELETE);
              btnDelete.addEventListener("click", () => deleteRole(r.id, r.nombre));
              wrap.append(btnDelete);
            }
            return wrap;
          }
        }
      ]
    });
  } else {
    rolesTable.refresh();
  }
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
  const grupos = [...new Set(PERMISOS_CATALOGO.map(p => p.grupo))];
  grupos.forEach(grupo => {
    const header = document.createElement("p");
    header.className = "form-section-title full";
    header.textContent = grupo;
    rolePermissionsList.append(header);
    PERMISOS_CATALOGO.filter(p => p.grupo === grupo).forEach(({ key, label }) => {
      const item = document.createElement("label");
      item.className = "role-permission-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = key;
      checkbox.checked = selectedSet.has(key);
      item.append(checkbox, document.createTextNode(" " + label));
      rolePermissionsList.append(item);
    });
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
  settingsForm.elements.documentosMaxSizeMb.value = s.documentosMaxSizeMb ?? 15;
  settingsForm.elements.monedaPorDefecto.value = s.monedaPorDefecto || "EUR";
  settingsForm.elements.diasAvisoVencimientoContrato.value = s.diasAvisoVencimientoContrato ?? 30;
  settingsForm.elements.filasPorPagina.value = s.filasPorPagina ?? 10;
  settingsForm.elements.mantenimiento.checked = !!s.mantenimiento;
  const marca = s.marca || {};
  settingsForm.elements.marcaNombre.value = marca.nombre || "Peñarrubia";
  settingsForm.elements.marcaColorPrimario.value = /^#[0-9a-fA-F]{6}$/.test(marca.colorPrimario || "") ? marca.colorPrimario : "#11273e";
  settingsForm.elements.marcaColorAcento.value = /^#[0-9a-fA-F]{6}$/.test(marca.colorAcento || "") ? marca.colorAcento : "#198b84";
  settingsForm.elements.marcaQuitarLogo.checked = false;
  settingsForm.elements.marcaLogo.value = "";
  const preview = document.querySelector("#marca-logo-preview");
  if (preview) {
    preview.hidden = !marca.logoDataUrl;
    if (marca.logoDataUrl) preview.src = marca.logoDataUrl;
    else preview.removeAttribute("src");
  }
  armarGuardia(settingsForm, settingsForm.closest(".admin-pane") || document.querySelector("#administracion"));
}

function readMarca() {
  const file = settingsForm.elements.marcaLogo.files?.[0];
  return new Promise((resolve, reject) => {
    const build = logoDataUrl => {
      const marca = {
        nombre: settingsForm.elements.marcaNombre.value.trim(),
        colorPrimario: settingsForm.elements.marcaColorPrimario.value,
        colorAcento: settingsForm.elements.marcaColorAcento.value
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
    } else if (settingsForm.elements.marcaQuitarLogo.checked) build("");
    else build(undefined);
  });
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
    notificacionesEmail: settingsForm.elements.notificacionesEmail.checked,
    documentosMaxSizeMb: Number(settingsForm.elements.documentosMaxSizeMb.value) || 15,
    monedaPorDefecto: settingsForm.elements.monedaPorDefecto.value || "EUR",
    diasAvisoVencimientoContrato: Number(settingsForm.elements.diasAvisoVencimientoContrato.value) || 30,
    filasPorPagina: Number(settingsForm.elements.filasPorPagina.value) || 10,
    mantenimiento: settingsForm.elements.mantenimiento.checked,
    marca: await readMarca()
  };
  try {
    state.settings = await api.updateSettings(data);
    applyBrand(state.settings.marca);
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
  const permissions = ADMIN_TABS;
  document.querySelectorAll("#administracion [data-admin-tab]").forEach(button => { button.hidden = !hasPermission(permissions[button.dataset.adminTab]); });
  if (!hasPermission(permissions[adminTabActual])) adminTabActual = Object.keys(permissions).find(tab => hasPermission(permissions[tab]));
  switchAdminTab(adminTabActual);
}

export { switchAdminTab };
