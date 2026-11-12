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

export function can(user, permission, resourceId = "", data) {
  if (!user?.activo || !PERMISSIONS.includes(permission)) return false;
  const {
    owners = [],
    tenants = [],
    properties = [],
    communities = [],
    roles = [],
  } = data;
  const role = roles.find((r) => r.id === user.rol || r.nombre === user.rol);
  if (!role) return false;
  if (role.nombre === "super_admin") return true;
  // The global security history is not a community-scoped resource.
  // Permisos globales: nunca para roles de comunidad o usuario final.
  if (permission === "audit:read" || permission === "admin:providers") return !["user", "community_admin"].includes(role.nombre) && !!role.permisos?.includes(permission);
  const ownOwners = owners.filter((o) => o.userId === user.id).map((o) => o.id);
  const ownTenants = tenants.filter((t) => t.userId === user.id);
  const ownedProperties = properties.filter((p) =>
    p.ownerIds?.some((id) => ownOwners.includes(id)),
  );
  const assigned = communities
    .filter((c) => c.adminUserId === user.id)
    .map((c) => c.id);
  const ownCommunities = new Set([
    ...ownedProperties.map((p) => p.communityId),
    ...ownTenants.map(
      (t) => properties.find((p) => p.id === t.propertyId)?.communityId,
    ),
  ]);
  const owner = owners.find((o) => o.id === resourceId);
  const tenant = tenants.find((t) => t.id === resourceId);
  const property = properties.find((p) => p.id === resourceId);

  if (role.nombre === "user") {
    if (!role.permisos?.includes(permission)) return false;
    switch (permission) {
      case "fee:read":
        return resourceId ? ownOwners.includes(resourceId) || ownedProperties.some(p => p.communityId === resourceId) : ownOwners.length > 0;
      case "community:read":
        return resourceId
          ? ownCommunities.has(resourceId)
          : ownCommunities.size > 0;
      case "owner:read":
      case "owner:edit":
      case "owner:documents:submit":
      case "owner_notification:read":
        return resourceId
          ? ownOwners.includes(resourceId)
          : ownOwners.length > 0;
      case "comm:participacion":
      case "comm:publicar":
      case "comm:moderar":
        return resourceId ? ownCommunities.has(resourceId) : ownCommunities.size > 0;
      case "property:read":
        return resourceId
          ? ownedProperties.some((p) => p.id === resourceId) ||
              ownTenants.some((t) => t.propertyId === resourceId)
          : ownedProperties.length > 0 || ownTenants.length > 0;
      case "tenant:read":
        return resourceId
          ? ownOwners.includes(resourceId) ||
              (!!tenant &&
                (ownOwners.includes(tenant.ownerId) ||
                  tenant.userId === user.id))
          : ownOwners.length > 0 || ownTenants.length > 0;
      case "tenant:manage":
      case "tenant:delete":
        return resourceId
          ? ownOwners.includes(resourceId) ||
              (!!tenant && ownOwners.includes(tenant.ownerId))
          : ownOwners.length > 0;
      case "document:read": {
        const readablePropertyIds = new Set([
          ...ownedProperties.map((p) => p.id),
          ...ownTenants.map((t) => t.propertyId),
        ]);
        const readableTenantIds = new Set([
          ...ownTenants.map((t) => t.id),
          ...tenants
            .filter((t) => readablePropertyIds.has(t.propertyId))
            .map((t) => t.id),
        ]);
        return resourceId
          ? ownCommunities.has(resourceId) ||
              readablePropertyIds.has(resourceId) ||
              readableTenantIds.has(resourceId)
          : ownOwners.length > 0 || ownTenants.length > 0;
      }
      case "document:upload":
        return ownOwners.length > 0 || ownTenants.length > 0;
      default:
        return false;
    }
  }

  if (!role.permisos?.includes(permission)) return false;
  if (role.nombre !== "community_admin") return true;
  if (permission.startsWith("admin:")) return false;
  if (!resourceId) return assigned.length > 0;
  // El identificador puede ser de una comunidad, un propietario, un inmueble,
  // un inquilino o una entidad documental. Se resuelve su comunidad para
  // aplicar el ámbito del administrador de comunidad.
  let communityIds;
  if (communities.some((c) => c.id === resourceId)) communityIds = [resourceId];
  else if (owner)
    communityIds = properties
      .filter((p) => p.ownerIds?.includes(owner.id))
      .map((p) => p.communityId);
  else if (property) communityIds = [property.communityId];
  else if (tenant)
    communityIds = [
      properties.find((p) => p.id === tenant.propertyId)?.communityId,
    ];
  else return false;
  return communityIds.some((id) => assigned.includes(id));
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
