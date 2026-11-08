// Política compartida por el servidor y la interfaz. No depende del DOM.
export const PERMISSIONS = [
  "community:read",
  "community:create",
  "community:manage",
  "community:delete",
  "owner:read",
  "owner:manage",
  "owner:edit",
  "owner:delete",
  "owner:documents:submit",
  "property:read",
  "property:manage",
  "property:delete",
  "tenant:read",
  "tenant:manage",
  "tenant:delete",
  "document:read",
  "document:approve",
  "document:delete",
  "reports:read",
  "audit:read",
  "admin:users",
  "admin:roles",
  "admin:settings",
  "admin:providers",
  "admin_notification:read",
  "owner_notification:read",
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
  const entity = permission.split(":")[0];
  const owner = owners.find((o) => o.id === resourceId);
  const tenant = tenants.find((t) => t.id === resourceId);
  const property = properties.find((p) => p.id === resourceId);

  if (role.nombre === "user") {
    if (!role.permisos?.includes(permission)) return false;
    switch (permission) {
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
      case "document:read":
        return ownOwners.length > 0 || ownTenants.length > 0;
      default:
        return false;
    }
  }

  if (!role.permisos?.includes(permission)) return false;
  if (role.nombre !== "community_admin") return true;
  if (permission.startsWith("admin:")) return false;
  if (!resourceId) return assigned.length > 0;
  let communityIds;
  if (entity === "community" || communities.some((c) => c.id === resourceId))
    communityIds = [resourceId];
  else if (entity === "owner" || owner)
    communityIds = properties
      .filter((p) => p.ownerIds?.includes(resourceId))
      .map((p) => p.communityId);
  else if (entity === "property" || property)
    communityIds = [property?.communityId];
  else if (entity === "tenant" || tenant)
    communityIds = [
      properties.find((p) => p.id === tenant?.propertyId)?.communityId,
    ];
  else return false;
  return communityIds.some((id) => assigned.includes(id));
}
