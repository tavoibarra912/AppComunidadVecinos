import { can, etiquetaPermiso } from "./permissions.js";
import { toast } from "./utils.js";
import { api } from "./api.js";

// ==========================================
// CONSTANTES DE DOMINIO
// ==========================================

export const CURRENT_OWNER_ID = "own-seed-1"; // DEPRECATED: usar getCurrentOwnerProfileId() (perfil Propietario del usuario simulado)

export const PROPERTY_TYPE_LABELS = {
  parcela: "Parcela",
  vivienda: "Vivienda",
  local: "Local",
  garaje: "Plaza de garaje",
  trastero: "Trastero"
};

export const PROPERTY_USE_LABELS = {
  residencial: "Residencial",
  comercial: "Comercial",
  garaje: "Garaje",
  trastero: "Trastero",
  otros: "Otros"
};

export const TENANT_AUTHORIZATION_LABELS = {
  common_areas: "Acceso a zonas comunes",
  community_communications: "Recibir comunicaciones de la comunidad",
  incident_management: "Gestionar incidencias de la unidad"
};

export const CURRENCY_CATALOG = [
  { code: "EUR", name: "Euro (EUR)" },
  { code: "USD", name: "Dólar estadounidense (USD)" },
  { code: "GBP", name: "Libra esterlina (GBP)" },
  { code: "CHF", name: "Franco suizo (CHF)" }
];

let currenciesCache = null;

export function getCurrencies() {
  if (currenciesCache) return currenciesCache;
  currenciesCache = CURRENCY_CATALOG.slice();
  return currenciesCache;
}

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================

export const state = {
  communities: [],
  owners: [],
  properties: [],
  tenants: [],
  adminEmails: [],
  ownerNotifications: [],
  users: [],
  roles: [],
  settings: {},
  loadedAt: null,
  currentUserId: null,
  activeRole: "admin",
  // Estado de sesión compartido entre módulos (diálogos en edición/visualización)
  ui: {
    editingOwnerId: null,
    deletingOwnerId: null,
    viewingOwnerId: null,
    editingTenantId: null,
    viewingTenantId: null,
    deletingTenantId: null,
    editingPropertyId: null,
    // Inmueble creado desde la pestaña Inmueble del editor de propietario:
    // guarda el ownerId para vincularlo automáticamente al guardar el inmueble
    ownerEditorPropertyContext: null,
    // Inmueble creado desde el tab Inmuebles vinculados del editor de comunidad
    communityEditorPropertyContext: null,
    viewingPropertyId: null,
    propertyDocuments: [],
    tenantDocuments: [],
    viewingCommunityId: null,
    deletingPropertyId: null,
    viewingPropertyDoc: null,
    ownerCurrentPage: 1,
    ownerPageSize: 5,
    ownerFilterCommunity: "",
    ownerPropertyCommunityFilter: "",
    ownerFilterMember: "",
    ownerFilterDocStatus: ""
  }
};

let refreshing = null;
const dataListeners = new Set();

/** Suscribe una función que se ejecuta cada vez que el estado se recarga desde el servidor. */
export function onDataChanged(fn) {
  dataListeners.add(fn);
}

function notifyDataChanged() {
  dataListeners.forEach(fn => fn());
}

/**
 * Recarga todo el estado desde el backend (única fuente de verdad) y
 * refresca los selectores de comunidad y las vistas suscritas.
 */
export async function refreshState() {
  if (!refreshing) {
    refreshing = (async () => {
      const bootstrap = await api.getBootstrap();
      state.communities = bootstrap.communities;
      state.owners = bootstrap.owners;
      state.properties = bootstrap.properties;
      state.tenants = bootstrap.tenants;
      state.adminEmails = bootstrap.adminEmails;
      state.ownerNotifications = bootstrap.ownerNotifications;
      state.users = bootstrap.users || [];
      state.roles = bootstrap.roles || [];
      state.settings = bootstrap.settings || {};
      state.loadedAt = new Date().toISOString();
      if (bootstrap.currentUser) {
        if (!state.users.some(u => u.id === bootstrap.currentUser.id)) state.users.push(bootstrap.currentUser);
        setActiveUser(bootstrap.currentUser.id);
      }
      notifyDataChanged();
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// ==========================================
// SELECTORES DERIVADOS
// ==========================================

export function getCommunityById(id) {
  return state.communities.find(item => item.id === id) || null;
}

export function getOwnerById(id) {
  return state.owners.find(item => item.id === id) || null;
}

export function getPropertyById(id) {
  return state.properties.find(item => item.id === id) || null;
}

export function getTenantById(id) {
  return state.tenants.find(item => item.id === id) || null;
}

export function ownerProperties(owner) {
  if (!owner) return [];
  const linkedIds = new Set([
    ...(Array.isArray(owner.propertyIds) ? owner.propertyIds : []),
    owner.propertyId
  ].filter(Boolean));
  return state.properties.filter(property =>
    property.ownerId === owner.id || linkedIds.has(property.id)
  );
}

export function ownerTenants(owner) {
  if (!owner) return [];
  return state.tenants.filter(tenant => tenant.ownerId === owner.id);
}

export function getLocalDateInputValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getTenantContractStatus(tenant) {
  const today = getLocalDateInputValue();
  if (tenant.contractStart > today) return "Próximo";
  if (tenant.contractEnd && tenant.contractEnd < today) return "Finalizado";
  return "Vigente";
}

export function tenantsForProperty(propertyId) {
  return state.tenants.filter(tenant =>
    tenant.propertyId === propertyId && getTenantContractStatus(tenant) === "Vigente"
  );
}

export function propertyLabel(p) {
  const type = PROPERTY_TYPE_LABELS[p.propertyType] || "Inmueble";
  return `${p.plot} · ${type} · ${p.communityName || ""}`.trim();
}

export function propertyOwnerIds(property) {
  return Array.isArray(property?.ownerIds) && property.ownerIds.length
    ? property.ownerIds
    : (property?.ownerId ? [property.ownerId] : []);
}

// ==========================================
// CONTROL DE ACCESO (RBAC)
// ==========================================

// Etiquetas legibles de los roles del sistema
export const ROLE_LABELS = {
  super_admin: "Super Administrador",
  administrator: "Administrador",
  community_admin: "Administrador de Comunidad",
  user: "Usuario"
};

// LOGIN SIMULADO Y PERFILES

export function getCurrentUser() {
  return state.users.find(user => user.id === state.currentUserId) || null;
}

export function getCurrentUserRole() {
  return getCurrentUser()?.rol || "";
}

/** Perfiles del usuario: vínculos con registros del dominio. */
export function getUserProfiles(user = getCurrentUser()) {
  if (!user) return { ownerIds: [], tenantIds: [], adminCommunityIds: [] };
  return {
    ownerIds: state.owners.filter(owner => owner.userId === user.id).map(owner => owner.id),
    tenantIds: state.tenants.filter(tenant => tenant.userId === user.id).map(tenant => tenant.id),
    adminCommunityIds: state.communities.filter(community => community.adminUserId === user.id).map(community => community.id)
  };
}

/** Registro de propietario vinculado al usuario actual (perfil Propietario). */
export function getCurrentOwnerProfile() {
  const user = getCurrentUser();
  if (!user) return null;
  return state.owners.find(owner => owner.userId === user.id) || null;
}

export function getCurrentOwnerProfileId() {
  return getCurrentOwnerProfile()?.id || "";
}

/** Comunidades visibles para el usuario según sus perfiles. */
export function userCommunityIds(user = getCurrentUser()) {
  const profiles = getUserProfiles(user);
  const ids = new Set(profiles.adminCommunityIds);
  profiles.ownerIds.forEach(ownerId => {
    const owner = state.owners.find(o => o.id === ownerId);
    if (owner) ownerProperties(owner).forEach(property => ids.add(property.communityId));
  });
  profiles.tenantIds.forEach(tenantId => {
    const tenant = state.tenants.find(x => x.id === tenantId);
    const property = state.properties.find(x => x.id === tenant?.propertyId);
    if (property?.communityId) ids.add(property.communityId);
  });
  return [...ids];
}

export function hasPermission(permission, resourceId = "") {
  return can(getCurrentUser(), permission, resourceId, state);
}

export function setActiveUser(userId) {
  state.currentUserId = state.users.some(u => u.id === userId && u.activo) ? userId : null;
  const role = state.roles.find(r => r.nombre === getCurrentUser()?.rol || r.id === getCurrentUser()?.rol);
  state.activeRole = role?.nombre === "user" ? "owner" : "admin";
}

export function clearSession() {
  for (const key of ["communities", "owners", "properties", "tenants", "adminEmails", "ownerNotifications", "users", "roles"]) state[key] = [];
  state.currentUserId = null;
  state.activeRole = "owner";
}

export function requirePermission(permission, resourceId = "") {
  if (hasPermission(permission, resourceId)) return true;
  toast(`No tenés permiso para esta acción (requiere: ${etiquetaPermiso(permission)}).`, "warning");
  return false;
}
