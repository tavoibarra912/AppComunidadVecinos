import { api } from "./api.js";

// ==========================================
// CONSTANTES DE DOMINIO
// ==========================================

export const CURRENT_OWNER_ID = "own-seed-1"; // Carlos Ruiz Mendoza (modo Propietario)

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
      notifyDataChanged();
      refreshing = null;
    })();
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

export const ROLE_PERMISSIONS = {
  admin: new Set([
    "community:read", "community:manage",
    "owner:read", "owner:manage", "owner:documents:submit",
    "property:read", "property:manage",
    "tenant:read", "tenant:manage", "tenant_grant:manage",
    "document:approve", "admin_notification:read"
  ]),
  owner: new Set([
    "community:read", "owner:read", "owner:edit", "owner:documents:submit",
    "property:read", "tenant:read", "tenant:manage", "tenant_grant:manage",
    "owner_notification:read"
  ])
};

export function hasPermission(permission, resourceId = "") {
  const permissions = ROLE_PERMISSIONS[state.activeRole];
  if (!permissions || !permissions.has(permission)) return false;
  if (state.activeRole === "admin") return true;

  const currentOwner = owners.find(owner => owner.id === CURRENT_OWNER_ID);
  if (!currentOwner) return false;
  const legacyCommunityIds = currentOwner.communityId
    ? []
    : state.communities
      .filter(community => community.name === currentOwner.communityName)
      .map(community => community.id);

  switch (permission) {
    case "community:read":
      return state.communities.some(community =>
        community.id === resourceId &&
        (community.id === currentOwner.communityId ||
          legacyCommunityIds.length === 1 && legacyCommunityIds[0] === community.id ||
          ownerProperties(currentOwner).some(property => property.communityId === community.id))
      );
    case "owner:read":
    case "owner:edit":
    case "owner:documents:submit":
    case "tenant:read":
    case "tenant:manage":
    case "tenant_grant:manage":
      return resourceId === CURRENT_OWNER_ID;
    case "property:read":
      return ownerProperties(currentOwner).some(property => property.id === resourceId);
    case "owner_notification:read":
      return resourceId === CURRENT_OWNER_ID;
    default:
      return false;
  }
}

export function requirePermission(permission, resourceId = "") {
  if (hasPermission(permission, resourceId)) return true;
  const toastEl = document.querySelector("#toast");
  if (toastEl) {
    toastEl.textContent = "No tienes permiso para realizar esta acción.";
    toastEl.classList.add("visible");
    window.setTimeout(() => toastEl.classList.remove("visible"), 2800);
  }
  return false;
}
