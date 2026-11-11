// Datos de presentación derivados únicamente de la sesión y sus vínculos reales.
export function accountView(data, roleLabels = {}) {
  const user =
    data.users.find((item) => item.id === data.currentUserId) || null;
  const displayName = user
    ? `${user.nombre || ""} ${user.apellido || ""}`.trim() || user.usuario
    : "";
  const role = data.roles.find(
    (item) => item.id === user?.rol || item.nombre === user?.rol,
  );
  const owners = user
    ? data.owners.filter((item) => item.userId === user.id)
    : [];
  const tenants = user
    ? data.tenants.filter((item) => item.userId === user.id)
    : [];
  const ownerIds = new Set(owners.map((item) => item.id));
  const propertyIds = new Set(tenants.map((item) => item.propertyId));
  const communityIds = new Set(
    data.properties
      .filter(
        (item) =>
          item.ownerIds?.some((id) => ownerIds.has(id)) ||
          propertyIds.has(item.id),
      )
      .map((item) => item.communityId),
  );
  for (const community of data.communities)
    if (user && community.adminUserId === user.id)
      communityIds.add(community.id);
  const communities = data.communities.filter((item) =>
    communityIds.has(item.id),
  );
  const hasProfile = owners.length > 0 || tenants.length > 0;
  let communityTitle = "Perfil pendiente de vinculación";
  let communityMessage =
    "Tu cuenta todavía no está vinculada a un propietario o inquilino. Pedile a un administrador que vincule tu perfil para acceder a tu comunidad.";
  if (communities.length) {
    communityTitle =
      owners.length && tenants.length
        ? "Propietario e inquilino"
        : owners.length
          ? "Perfil de propietario"
          : tenants.length
            ? "Perfil de inquilino"
            : "Administración de comunidad";
    communityMessage =
      "Estas son las comunidades vinculadas a tu perfil. Podés consultar sus datos en modo de lectura.";
  } else if (hasProfile) {
    communityTitle = "Sin comunidad asignada";
    communityMessage =
      "Tu perfil está vinculado a tu cuenta, pero aún no tiene una comunidad asignada. Pedile a un administrador que revise el vínculo de tus inmuebles.";
  }
  return {
    user,
    displayName,
    roleLabel: roleLabels[role?.nombre] || role?.nombre || user?.rol || "",
    owners,
    tenants,
    communities,
    hasProfile,
    communityTitle,
    communityMessage,
  };
}
