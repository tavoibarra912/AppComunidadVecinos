// Métricas de registros autorizados recibidos del servidor. Sin importes ni tendencias estimadas.
const requiredDocuments = ["dni", "bankReceipt", "propertyDeed"];
export function hasDocumentFile(doc) {
  return !!(
    doc &&
    !doc.isSample &&
    doc.fileName &&
    (doc.id || doc.url || doc.dataUrl || doc.storedName)
  );
}
export function ownerDocumentState(owner) {
  const docs = requiredDocuments.map((key) => owner.documents?.[key]);
  const files = docs.filter(hasDocumentFile);
  if (!files.length) return "none";
  if (files.some((doc) => doc.adminApproval?.status === "rejected"))
    return "rejected";
  if (files.length !== requiredDocuments.length) return "incomplete";
  return files.every((doc) => doc.adminApproval?.status === "approved")
    ? "approved"
    : "pending";
}
export function dashboardData(
  data,
  snapshot = null,
  communityId = "",
  now = new Date(),
) {
  const user = data.users.find((u) => u.id === data.currentUserId);
  const role = data.roles.find(
    (r) => r.id === user?.rol || r.nombre === user?.rol,
  );
  const personal =
    role?.nombre === "user" ||
    user?.rol === "user" ||
    data.activeRole === "owner";
  const ownOwners = user ? data.owners.filter((o) => o.userId === user.id) : [];
  const ownOwnerIds = new Set(ownOwners.map((o) => o.id));
  const ownTenants = user
    ? data.tenants.filter((t) => t.userId === user.id)
    : [];
  const availableProperties = !user
    ? []
    : personal
      ? data.properties.filter(
          (p) =>
            p.ownerIds?.some((id) => ownOwnerIds.has(id)) ||
            ownTenants.some((t) => t.propertyId === p.id),
        )
      : data.properties;
  const availableCommunityIds = new Set(
    availableProperties.map((p) => p.communityId),
  );
  const availableCommunities = !user
    ? []
    : data.communities.filter(
        (c) => !personal || availableCommunityIds.has(c.id),
      );
  const communities = availableCommunities.filter(
    (c) => !communityId || c.id === communityId,
  );
  const properties = availableProperties.filter(
    (p) => !communityId || p.communityId === communityId,
  );
  const propertyIds = new Set(properties.map((p) => p.id));
  const linkedOwnerIds = new Set(properties.flatMap((p) => p.ownerIds || []));
  const owners = (!user ? [] : personal ? ownOwners : data.owners).filter(
    (o) => !communityId || linkedOwnerIds.has(o.id),
  );
  const ownerIds = new Set(owners.map((o) => o.id));
  const tenants = (!user ? [] : data.tenants).filter(
    (t) =>
      propertyIds.has(t.propertyId) ||
      (!communityId && personal && t.userId === user.id),
  );
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const validDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const contracts = { active: 0, upcoming: 0, ended: 0, unknown: 0 };
  for (const t of tenants)
    contracts[
      !validDate(t.contractStart) ||
      (t.contractEnd &&
        (!validDate(t.contractEnd) || t.contractEnd < t.contractStart))
        ? "unknown"
        : t.contractStart > today
          ? "upcoming"
          : t.contractEnd && t.contractEnd < today
            ? "ended"
            : "active"
    ]++;
  const docOwners = owners.filter(
    (o) => o.documents && typeof o.documents === "object",
  );
  const ownerStates = {
    approved: 0,
    pending: 0,
    incomplete: 0,
    rejected: 0,
    none: 0,
  };
  for (const owner of docOwners) ownerStates[ownerDocumentState(owner)]++;
  const tenantDocuments = tenants
    .flatMap((t) => Object.values(t.documents || {}))
    .filter(hasDocumentFile);
  const documentChart = docOwners.length
    ? [
        { key: "approved", label: "Aprobados", value: ownerStates.approved },
        { key: "pending", label: "En revisión", value: ownerStates.pending },
        {
          key: "incomplete",
          label: "Incompletos",
          value: ownerStates.incomplete,
        },
        {
          key: "rejected",
          label: "Requieren corrección",
          value: ownerStates.rejected,
        },
        { key: "none", label: "Sin documentos", value: ownerStates.none },
      ]
    : [
        {
          key: "approved",
          label: "Aprobados",
          value: tenantDocuments.filter(
            (d) => d.adminApproval?.status === "approved",
          ).length,
        },
        {
          key: "pending",
          label: "En revisión",
          value: tenantDocuments.filter(
            (d) => !["approved", "rejected"].includes(d.adminApproval?.status),
          ).length,
        },
        {
          key: "rejected",
          label: "Requieren corrección",
          value: tenantDocuments.filter(
            (d) => d.adminApproval?.status === "rejected",
          ).length,
        },
      ];
  const typeLabels = {
    vivienda: "Viviendas",
    parcela: "Parcelas",
    local: "Locales",
    garaje: "Garajes",
    trastero: "Trasteros",
  };
  const propertyTypes = Object.entries(typeLabels).map(([key, label]) => ({
    key,
    label,
    value: properties.filter((p) => p.propertyType === key).length,
  }));
  const other = properties.filter(
    (p) => !(p.propertyType in typeLabels),
  ).length;
  if (other)
    propertyTypes.push({
      key: "other",
      label: "Otros / sin clasificar",
      value: other,
    });
  const posts = ((user && snapshot?.posts) || []).filter(
    (p) =>
      (!personal || p.recipient?.userId === user.id) &&
      (!communityId || p.communityId === communityId) &&
      availableCommunities.some((c) => c.id === p.communityId),
  );
  const published = posts.filter(
    (p) => !["draft", "scheduled"].includes(p.phase),
  );
  const unreadPosts = published.filter(
    (p) => p.recipient?.userId === user?.id && !p.recipient.readAt,
  ).length;
  const ownerNotifications = (user ? data.ownerNotifications : []).filter((n) =>
    ownerIds.has(n.ownerId),
  );
  const adminNotifications = (user ? data.adminEmails : []).filter(
    (n) => !communityId || linkedOwnerIds.has(n.ownerId),
  );
  const agenda = published
    .filter(
      (p) =>
        ["event", "meeting"].includes(p.type) &&
        !["cancelled", "archived", "finished"].includes(p.phase) &&
        Date.parse(p.endsAt || p.startsAt) >= now.getTime(),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 5);
  const recent = [...published]
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.publishAt) -
        Date.parse(a.updatedAt || a.publishAt),
    )
    .slice(0, 3);
  return {
    user,
    personal,
    availableCommunities,
    communities,
    properties,
    owners,
    tenants,
    ownTenants,
    ownOwners,
    contracts,
    ownerStates,
    documentChart,
    propertyTypes,
    docOwners,
    tenantDocuments,
    unreadPosts,
    ownerUnread: ownerNotifications.filter((n) => !n.read).length,
    adminUnread: adminNotifications.filter((n) => !n.read).length,
    agenda,
    recent,
    snapshotReady: !!snapshot,
    publishedCount: published.length,
  };
}
