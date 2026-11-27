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
  trastero: "Trastero",
};

export const PROPERTY_USE_LABELS = {
  residencial: "Residencial",
  comercial: "Comercial",
  garaje: "Garaje",
  trastero: "Trastero",
  otros: "Otros",
};

export const TENANT_AUTHORIZATION_DEFS = [
  {
    id: "common_areas",
    label: "Acceso a zonas comunes",
    description:
      "Permite al inquilino usar portales, pasillos, jardines y otras zonas compartidas según las normas de la comunidad.",
  },
  {
    id: "community_communications",
    label: "Recibir comunicaciones de la comunidad",
    description:
      "Autoriza el envío de avisos, convocatorias y comunicaciones relevantes de la comunidad al inquilino.",
  },
  {
    id: "incident_management",
    label: "Gestionar incidencias de la unidad",
    description:
      "Faculta al inquilino para reportar y hacer seguimiento de averías o incidencias relacionadas con su vivienda o unidad.",
  },
  {
    id: "meeting_attendance",
    label: "Asistir a reuniones de la comunidad",
    description:
      "Permite la asistencia del inquilino a juntas o reuniones cuando la comunidad o el propietario lo autoricen.",
  },
  {
    id: "pool_access",
    label: "Uso de piscina",
    description:
      "Concede acceso a la piscina comunitaria durante el horario y condiciones establecidos.",
  },
  {
    id: "gym_access",
    label: "Uso de gimnasio",
    description: "Concede acceso al gimnasio o sala deportiva comunitaria, si existe.",
  },
  {
    id: "parking_access",
    label: "Acceso a garaje o aparcamiento",
    description:
      "Permite el uso de plazas de garaje, accesos o zonas de aparcamiento asignadas o autorizadas.",
  },
  {
    id: "storage_access",
    label: "Acceso a trasteros",
    description:
      "Autoriza el acceso a trasteros o espacios de almacenamiento vinculados a la unidad.",
  },
  {
    id: "package_reception",
    label: "Recibir paquetería",
    description:
      "Permite que el inquilino reciba paquetería o entregas en nombre de la unidad cuando aplique.",
  },
  {
    id: "key_duplicate",
    label: "Solicitar duplicado de llaves",
    description:
      "Faculta al inquilino para solicitar copias de llaves o dispositivos de acceso según el procedimiento de la comunidad.",
  },
  {
    id: "work_authorization",
    label: "Autorizar obras o reformas en la unidad",
    description:
      "Permite tramitar o autorizar obras menores o reformas en la unidad conforme a la normativa aplicable.",
  },
  {
    id: "pet_registration",
    label: "Registrar mascotas",
    description:
      "Autoriza el registro de mascotas del inquilino ante la comunidad cuando sea necesario.",
  },
  {
    id: "community_app",
    label: "Uso de la app de la comunidad",
    description:
      "Permite al inquilino utilizar las funciones de la aplicación habilitadas para residentes.",
  },
];

export const TENANT_AUTHORIZATION_LABELS = Object.fromEntries(
  TENANT_AUTHORIZATION_DEFS.map((item) => [item.id, item.label]),
);

/**
 * Catálogo inicial de autorizaciones. Cada comunidad puede personalizarlo
 * desde Configuración → Inquilinos; si no lo hace, se usa esta lista.
 */
export const DEFAULT_TENANT_AUTHORIZATIONS = TENANT_AUTHORIZATION_DEFS.map((item) => ({ ...item }));

function normalizeTenantAuthItem(item) {
  const id = String(item?.id || "").trim();
  const def = TENANT_AUTHORIZATION_DEFS.find((d) => d.id === id);
  return {
    id,
    label: String(item?.label || def?.label || "").trim(),
    description: String(item?.description ?? def?.description ?? "").trim(),
  };
}

/** Autorizaciones vigentes para una comunidad (o las predeterminadas). */
export function tenantAuthorizationCatalog(communityId = "") {
  const saved = communityId ? state.settings?.tenantAuthorizations?.[communityId] : null;
  if (!Array.isArray(saved) || !saved.length)
    return DEFAULT_TENANT_AUTHORIZATIONS.map((i) => ({ ...i }));
  return saved.map(normalizeTenantAuthItem).filter((i) => i.id);
}

/** Etiqueta visible de una autorización guardada en un inquilino. */
export function tenantAuthorizationLabel(id, communityId = "") {
  return (
    tenantAuthorizationCatalog(communityId).find((item) => item.id === id)?.label ||
    TENANT_AUTHORIZATION_LABELS[id] ||
    id
  );
}

export function tenantAuthorizationDescription(id, communityId = "") {
  return tenantAuthorizationCatalog(communityId).find((item) => item.id === id)?.description || "";
}

export const CURRENCY_CATALOG = [
  { code: "EUR", name: "Euro (EUR)" },
  { code: "USD", name: "Dólar estadounidense (USD)" },
  { code: "GBP", name: "Libra esterlina (GBP)" },
  { code: "CHF", name: "Franco suizo (CHF)" },
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
  parcels: [],
  tenants: [],
  adminEmails: [],
  ownerNotifications: [],
  users: [],
  roles: [],
  settings: {},
  loadedAt: null,
  loading: {
    bootstrap: false,
    communities: false,
    owners: false,
    properties: false,
    tenants: false,
    fees: false,
    documents: false,
  },
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
    // Contexto de retorno tras crear una entidad relacionada desde otro editor
    // (ej: un inquilino dado de alta desde la pestaña Inquilinos del inmueble).
    // Guarda a qué editor volver y qué vínculo aplicar al guardar, sin perder
    // los datos del formulario padre.
    editorReturnContext: null,
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
    ownerFilterDocStatus: "",
  },
};

let refreshing = null;
const dataListeners = new Set();

// Topic-based subscription system for granular re-renders
const topicSubscribers = new Map();

/**
 * Suscribe una función a un tema específico del estado.
 * @param {string} topic - Tema al que suscribirse (ej: "communities", "owners", "properties", "tenants", "settings", "users", "roles", "all")
 * @param {Function} fn - Función a ejecutar cuando cambie el tema
 * @returns {Function} Función para cancelar la suscripción
 */
export function subscribe(topic, fn) {
  if (!topicSubscribers.has(topic)) {
    topicSubscribers.set(topic, new Set());
  }
  topicSubscribers.get(topic).add(fn);
  return () => unsubscribe(topic, fn);
}

/** Cancela una suscripción a un tema. */
export function unsubscribe(topic, fn) {
  const subscribers = topicSubscribers.get(topic);
  if (subscribers) {
    subscribers.delete(fn);
    if (subscribers.size === 0) topicSubscribers.delete(topic);
  }
}

/** Notifica a los suscriptores de un tema específico. */
function notifyTopic(topic) {
  const subscribers = topicSubscribers.get(topic);
  if (subscribers) {
    subscribers.forEach(safeNotify);
  }
  // El tema "all" ya se notificó arriba: volver a recorrerlo lo dispararía dos veces.
  if (topic === "all") return;
  // También notificar a suscriptores de "all"
  const allSubscribers = topicSubscribers.get("all");
  if (allSubscribers) {
    allSubscribers.forEach(safeNotify);
  }
}

/**
 * Ejecuta un suscriptor sin dejar escapar errores. Varios suscriptores son
 * async (repintado de vistas): un rechazo suelto acabaría como «unhandled
 * rejection» global y se enviaría como incidencia.
 */
function safeNotify(fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") {
      result.catch((error) =>
        console.error("[state] Error en un suscriptor:", error?.message || error),
      );
    }
  } catch (error) {
    console.error("[state] Error en un suscriptor:", error?.message || error);
  }
}

/** Suscribe una función que se ejecuta cada vez que el estado se recarga desde el servidor (compatibilidad). */
export function onDataChanged(fn) {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

function notifyDataChanged() {
  dataListeners.forEach(safeNotify);
  // Notificar todos los temas
  notifyTopic("all");
}

/**
 * Recarga todo el estado desde el backend (única fuente de verdad) y
 * refresca los selectores de comunidad y las vistas suscritas.
 */
export async function refreshState() {
  if (!refreshing) {
    refreshing = (async () => {
      state.loading.bootstrap = true;
      notifyTopic("loading");
      try {
        const bootstrap = await api.getBootstrap();
        state.communities = bootstrap.communities;
        state.owners = bootstrap.owners;
        state.properties = bootstrap.properties;
        state.parcels = bootstrap.parcels || [];
        state.tenants = bootstrap.tenants;
        state.adminEmails = bootstrap.adminEmails;
        state.ownerNotifications = bootstrap.ownerNotifications;
        state.users = bootstrap.users || [];
        state.roles = bootstrap.roles || [];
        state.settings = bootstrap.settings || {};
        state.loadedAt = new Date().toISOString();
        if (bootstrap.currentUser) {
          if (!state.users.some((u) => u.id === bootstrap.currentUser.id))
            state.users.push(bootstrap.currentUser);
          setActiveUser(bootstrap.currentUser.id);
        }
        notifyDataChanged();
      } finally {
        state.loading.bootstrap = false;
        notifyTopic("loading");
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Actualiza una porción específica del estado y notifica solo a los suscriptores relevantes.
 * @param {string} key - Clave del estado a actualizar (ej: "communities", "owners", "properties", etc.)
 * @param {any} value - Nuevo valor
 */
export function setState(key, value) {
  if (key in state) {
    state[key] = value;
    notifyTopic(key);
  }
}

/**
 * Actualiza múltiples claves del estado de forma atómica y notifica a los suscriptores.
 * @param {Object} updates - Objeto con las claves y valores a actualizar
 */
export function setStateBatch(updates) {
  const changedTopics = new Set();
  for (const [key, value] of Object.entries(updates)) {
    if (key in state) {
      state[key] = value;
      changedTopics.add(key);
    }
  }
  for (const topic of changedTopics) {
    notifyTopic(topic);
  }
}

/**
 * Añade un elemento a un array del estado y notifica.
 * @param {string} key - Clave del array (ej: "communities", "owners", etc.)
 * @param {any} item - Elemento a añadir
 */
export function pushState(key, item) {
  if (Array.isArray(state[key])) {
    state[key].push(item);
    notifyTopic(key);
  }
}

/**
 * Elimina un elemento de un array del estado por ID y notifica.
 * @param {string} key - Clave del array
 * @param {string} id - ID del elemento a eliminar
 */
export function removeState(key, id) {
  if (Array.isArray(state[key])) {
    const index = state[key].findIndex((item) => item.id === id);
    if (index >= 0) {
      state[key].splice(index, 1);
      notifyTopic(key);
    }
  }
}

/**
 * Actualiza un elemento en un array del estado por ID y notifica.
 * @param {string} key - Clave del array
 * @param {string} id - ID del elemento a actualizar
 * @param {Object} updates - Propiedades a actualizar
 * @returns {boolean} True si se encontró y actualizó el elemento
 */
export function updateState(key, id, updates) {
  if (Array.isArray(state[key])) {
    const index = state[key].findIndex((item) => item.id === id);
    if (index >= 0) {
      state[key][index] = { ...state[key][index], ...updates };
      notifyTopic(key);
      return true;
    }
  }
  return false;
}

// ==========================================
// SELECTORES DERIVADOS
// ==========================================

export function getCommunityById(id) {
  return state.communities.find((item) => item.id === id) || null;
}

export function getOwnerById(id) {
  return state.owners.find((item) => item.id === id) || null;
}

export function getPropertyById(id) {
  return state.properties.find((item) => item.id === id) || null;
}

export function getTenantById(id) {
  return state.tenants.find((item) => item.id === id) || null;
}

export function ownerProperties(owner) {
  if (!owner) return [];
  const linkedIds = new Set(
    [...(Array.isArray(owner.propertyIds) ? owner.propertyIds : []), owner.propertyId].filter(
      Boolean,
    ),
  );
  return state.properties.filter(
    (property) =>
      property.ownerId === owner.id ||
      linkedIds.has(property.id) ||
      propertyOwnerIds(property).includes(owner.id),
  );
}

export function ownerTenants(owner) {
  if (!owner) return [];
  return state.tenants.filter((tenant) => tenant.ownerId === owner.id);
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
  return state.tenants.filter(
    (tenant) => tenant.propertyId === propertyId && getTenantContractStatus(tenant) === "Vigente",
  );
}

export function propertyLabel(p) {
  const type = PROPERTY_TYPE_LABELS[p.propertyType] || "Inmueble";
  return `${p.plot} · ${type} · ${p.communityName || ""}`.trim();
}

export function propertyOwnerIds(property) {
  return Array.isArray(property?.ownerIds) && property.ownerIds.length
    ? property.ownerIds
    : property?.ownerId
      ? [property.ownerId]
      : [];
}

// ==========================================
// CONTROL DE ACCESO (RBAC)
// ==========================================

// Etiquetas legibles de los roles del sistema
export const ROLE_LABELS = {
  super_admin: "Super Administrador",
  administrator: "Administrador",
  community_admin: "Administrador de Comunidad",
  user: "Usuario",
};

// LOGIN SIMULADO Y PERFILES

export function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

export function getCurrentUserRole() {
  return getCurrentUser()?.rol || "";
}

/** Perfiles del usuario: vínculos con registros del dominio. */
export function getUserProfiles(user = getCurrentUser()) {
  if (!user) return { ownerIds: [], tenantIds: [], adminCommunityIds: [] };
  return {
    ownerIds: state.owners.filter((owner) => owner.userId === user.id).map((owner) => owner.id),
    tenantIds: state.tenants
      .filter((tenant) => tenant.userId === user.id)
      .map((tenant) => tenant.id),
    adminCommunityIds: state.communities
      .filter((community) => community.adminUserId === user.id)
      .map((community) => community.id),
  };
}

/** Registro de propietario vinculado al usuario actual (perfil Propietario). */
export function getCurrentOwnerProfile() {
  const user = getCurrentUser();
  if (!user) return null;
  return state.owners.find((owner) => owner.userId === user.id) || null;
}

export function getCurrentOwnerProfileId() {
  return getCurrentOwnerProfile()?.id || "";
}

/** Comunidades visibles para el usuario según sus perfiles. */
export function userCommunityIds(user = getCurrentUser()) {
  const profiles = getUserProfiles(user);
  const ids = new Set(profiles.adminCommunityIds);
  profiles.ownerIds.forEach((ownerId) => {
    const owner = state.owners.find((o) => o.id === ownerId);
    if (owner) ownerProperties(owner).forEach((property) => ids.add(property.communityId));
  });
  profiles.tenantIds.forEach((tenantId) => {
    const tenant = state.tenants.find((x) => x.id === tenantId);
    const property = state.properties.find((x) => x.id === tenant?.propertyId);
    if (property?.communityId) ids.add(property.communityId);
  });
  return [...ids];
}

export function hasPermission(permission, resourceId = "") {
  return can(getCurrentUser(), permission, resourceId, state);
}

export function setActiveUser(userId) {
  state.currentUserId = state.users.some((u) => u.id === userId && u.activo) ? userId : null;
  const role = state.roles.find(
    (r) => r.nombre === getCurrentUser()?.rol || r.id === getCurrentUser()?.rol,
  );
  state.activeRole = role?.nombre === "user" ? "owner" : "admin";
}

export function clearSession() {
  for (const key of [
    "communities",
    "owners",
    "properties",
    "tenants",
    "adminEmails",
    "ownerNotifications",
    "users",
    "roles",
  ])
    state[key] = [];
  state.currentUserId = null;
  state.activeRole = "owner";
}

export function requirePermission(permission, resourceId = "") {
  if (hasPermission(permission, resourceId)) return true;
  toast(
    `No tienes permiso para esta acción (requiere: ${etiquetaPermiso(permission)}).`,
    "warning",
  );
  return false;
}
