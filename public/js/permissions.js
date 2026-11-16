// Política compartida por el servidor y la interfaz. No depende del DOM.
export const PERMISSIONS = [
  "community:read",
  "community:create",
  "community:edit",
  "community:manage",
  "community:delete",
  "fee:read",
  "fee:manage",
  "owner:read",
  "owner:create",
  "owner:manage",
  "owner:edit",
  "owner:delete",
  "owner:documents:submit",
  "property:read",
  "property:create",
  "property:manage",
  "property:delete",
  "tenant:read",
  "tenant:create",
  "tenant:manage",
  "tenant:delete",
  "tenant:history:read",
  "document:read",
  "document:upload",
  "document:approve",
  "document:delete",
  "reports:read",
  "audit:read",
  "admin:users",
  "admin:roles",
  "comm:participacion",
  "comm:publicar",
  "comm:moderar",
  "admin:settings",
  "admin:providers",
  "admin_notification:read",
  "owner_notification:read",
  "owner_notification:send",
];

/** Fecha local en formato ISO (YYYY-MM-DD), sin conversiones UTC. */
export function localDateISO(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Pertenencia vigente por contrato: ni antes del inicio ni después del fin. */
export function isTenantContractActive(tenant, today = localDateISO()) {
  return (
    !!tenant &&
    (!tenant.contractStart || tenant.contractStart <= today) &&
    (!tenant.contractEnd || tenant.contractEnd >= today)
  );
}

/** Contrato ya finalizado (conserva historial propio, no pertenencia). */
export function isTenantContractEnded(tenant, today = localDateISO()) {
  return !!tenant?.contractEnd && tenant.contractEnd < today;
}

export function can(user, permission, resourceId = "", data) {
  if (!user?.activo || !PERMISSIONS.includes(permission)) return false;
  return createPermissionChecker(user, data)(permission, resourceId);
}

// Una instantánea se usa durante una petición. No se guarda estado global:
// el siguiente bootstrap reconstruye los permisos y ve todos los cambios.
export function createPermissionChecker(user, data) {
  if (!user?.activo) return () => false;
  const { owners = [], tenants = [], properties = [], communities = [], roles = [] } = data;
  const role = roles.find((r) => r.id === user.rol || r.nombre === user.rol);
  if (!role) return () => false;
  if (role.nombre === "super_admin") return (permission) => PERMISSIONS.includes(permission);
  const permissions = new Set(role.permisos || []);
  if (!["user", "community_admin"].includes(role.nombre))
    return (permission) => PERMISSIONS.includes(permission) && permissions.has(permission);
  const today = localDateISO();
  const ownersById = new Map(owners.map((o) => [o.id, o]));
  const tenantsById = new Map(tenants.map((t) => [t.id, t]));
  const propertiesById = new Map(properties.map((p) => [p.id, p]));
  const communityIds = new Set(communities.map((c) => c.id));
  const ownOwners = new Set(owners.filter((o) => o.userId === user.id).map((o) => o.id));
  const ownTenantProfiles = tenants.filter((t) => t.userId === user.id);
  const ownTenants = ownTenantProfiles.filter((t) => isTenantContractActive(t, today));
  const tenantHistory = permissions.has("tenant:history:read");
  const formerOwnTenants = tenantHistory
    ? ownTenantProfiles.filter((t) => isTenantContractEnded(t, today))
    : [];
  const activeTenantIds = new Set(ownTenants.map((t) => t.id));
  const formerTenantIds = new Set(formerOwnTenants.map((t) => t.id));
  const ownedProperties = properties.filter((p) => p.ownerIds?.some((id) => ownOwners.has(id)));
  const ownedPropertyIds = new Set(ownedProperties.map((p) => p.id));
  const ownedCommunityIds = new Set(ownedProperties.map((p) => p.communityId));
  const assigned = new Set(communities.filter((c) => c.adminUserId === user.id).map((c) => c.id));
  const ownCommunities = new Set([
    ...ownedCommunityIds,
    ...ownTenants.map((t) => propertiesById.get(t.propertyId)?.communityId),
  ]);
  const readablePropertyIds = new Set([
    ...ownedPropertyIds,
    ...ownTenants.map((t) => t.propertyId),
  ]);
  const readableTenantIds = new Set([
    ...activeTenantIds,
    ...formerTenantIds,
    ...tenants.filter((t) => readablePropertyIds.has(t.propertyId)).map((t) => t.id),
  ]);
  const ownerCommunities = new Map();
  for (const property of properties)
    for (const ownerId of property.ownerIds || []) {
      if (!ownerCommunities.has(ownerId)) ownerCommunities.set(ownerId, new Set());
      ownerCommunities.get(ownerId).add(property.communityId);
    }
  return (permission, resourceId = "") => {
    if (!PERMISSIONS.includes(permission) || !permissions.has(permission)) return false;
    if (permission === "audit:read" || permission === "admin:providers")
      return !["user", "community_admin"].includes(role.nombre);
    const owner = ownersById.get(resourceId);
    const tenant = tenantsById.get(resourceId);
    const property = propertiesById.get(resourceId);
    if (role.nombre === "user") {
      switch (permission) {
        case "fee:read":
          return resourceId
            ? ownOwners.has(resourceId) || ownedCommunityIds.has(resourceId)
            : ownOwners.size > 0;
        case "community:read":
        case "comm:participacion":
        case "comm:publicar":
        case "comm:moderar":
          return resourceId ? ownCommunities.has(resourceId) : ownCommunities.size > 0;
        case "owner:read":
        case "owner:edit":
        case "owner:documents:submit":
        case "owner_notification:read":
          return resourceId ? ownOwners.has(resourceId) : ownOwners.size > 0;
        case "property:read":
          return resourceId ? readablePropertyIds.has(resourceId) : readablePropertyIds.size > 0;
        case "tenant:read":
          if (!resourceId)
            return ownOwners.size > 0 || activeTenantIds.size > 0 || formerTenantIds.size > 0;
          return (
            ownOwners.has(resourceId) ||
            (!!tenant &&
              (ownOwners.has(tenant.ownerId) ||
                activeTenantIds.has(tenant.id) ||
                formerTenantIds.has(tenant.id)))
          );
        case "tenant:manage":
        case "tenant:delete":
          return resourceId
            ? ownOwners.has(resourceId) || (!!tenant && ownOwners.has(tenant.ownerId))
            : ownOwners.size > 0;
        case "document:read":
          return resourceId
            ? ownOwners.has(resourceId) ||
                ownCommunities.has(resourceId) ||
                readablePropertyIds.has(resourceId) ||
                readableTenantIds.has(resourceId)
            : ownOwners.size > 0 || activeTenantIds.size > 0 || formerTenantIds.size > 0;
        case "document:upload":
          return ownOwners.size > 0 || activeTenantIds.size > 0;
        default:
          return false;
      }
    }
    if (role.nombre !== "community_admin") return true;
    if (permission.startsWith("admin:")) return false;
    if (!resourceId) return assigned.size > 0;
    if (communityIds.has(resourceId)) return assigned.has(resourceId);
    if (owner) return [...(ownerCommunities.get(owner.id) || [])].some((id) => assigned.has(id));
    if (property) return assigned.has(property.communityId);
    if (tenant) return assigned.has(propertiesById.get(tenant.propertyId)?.communityId);
    return false;
  };
}

// Etiquetas legibles para los mensajes de «permiso insuficiente».
const ETIQUETAS_PERMISO = {
  "fee:read": "consultar cuotas propias o de comunidades asignadas",
  "fee:manage": "gestionar cuotas de comunidades asignadas",
  "community:read": "ver comunidades",
  "community:create": "crear comunidades",
  "community:edit": "editar comunidades",
  "community:manage": "administrar comunidades",
  "community:delete": "eliminar comunidades",
  "owner:read": "ver propietarios",
  "owner:create": "crear propietarios",
  "owner:manage": "administrar propietarios",
  "owner:edit": "editar propietarios",
  "owner:delete": "eliminar propietarios",
  "owner:documents:submit": "subir documentación propia",
  "property:read": "ver inmuebles",
  "property:create": "crear inmuebles",
  "property:manage": "administrar inmuebles",
  "property:delete": "eliminar inmuebles",
  "tenant:read": "ver inquilinos",
  "tenant:create": "crear inquilinos",
  "tenant:manage": "administrar inquilinos",
  "tenant:delete": "eliminar inquilinos",
  "tenant:history:read": "conservar el historial propio como antiguo inquilino",
  "document:read": "ver documentos",
  "document:upload": "subir documentos",
  "document:approve": "aprobar documentos",
  "document:delete": "eliminar documentos",
  "reports:read": "ver reportes",
  "audit:read": "ver la auditoría",
  "admin:users": "administrar usuarios",
  "admin:roles": "administrar roles",
  "admin:settings": "administrar la configuración",
  "admin:providers": "configurar proveedores de comunicación",
  "comm:participacion": "participar en Comunicación (comentar, votar y confirmar)",
  "comm:publicar": "publicar en Comunicación",
  "comm:moderar": "moderar Comunicación",
  "admin_notification:read": "ver el buzón del administrador",
  "owner_notification:read": "ver el buzón de avisos",
  "owner_notification:send": "enviar avisos a propietarios",
};

export function etiquetaPermiso(permission) {
  return ETIQUETAS_PERMISO[permission] || permission;
}
