import { db } from "./db.js";
import { allowed, policyData } from "./security.js";
import { EDIT_CONFLICT } from "./entity-version.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Comprobar las copias que vio el formulario ANTES de sincronizar vínculos.
// Los porcentajes se guardan en la misma transacción que el propietario.
export function prepareOwnerPropertyShares(data, ownerId, user) {
  if (data.propertyIds === undefined && data.propertyId)
    data = { ...data, propertyIds: [data.propertyId] };
  if (
    data.propertyShares !== undefined &&
    (!Array.isArray(data.propertyShares) || data.propertyShares.length > 1000)
  )
    throw fail("La lista de titularidades no es válida.");
  const policy = policyData();
  const propertyVersions = data.propertyVersions || {};
  if (
    typeof propertyVersions !== "object" ||
    Array.isArray(propertyVersions) ||
    Object.keys(propertyVersions).length > 1000
  )
    throw fail("Las versiones de los inmuebles no son válidas.");
  const currentIds = policy.properties.filter((p) => p.ownerIds.includes(ownerId)).map((p) => p.id);
  const requestedIds = data.propertyIds || currentIds;
  const additions = requestedIds.filter((id) => !currentIds.includes(id));
  for (const id of additions)
    if (!data.propertyShares?.some((share) => share?.propertyId === id))
      throw fail(
        "Indica el porcentaje explícito y la versión de cada inmueble que quieres vincular.",
      );
  for (const propertyId of currentIds) {
    if (
      !requestedIds.includes(propertyId) &&
      allowed(user, "property:manage", propertyId, policy) &&
      !Object.hasOwn(propertyVersions, propertyId)
    )
      throw fail(
        "Falta la versión del inmueble que quieres desvincular. Vuelve a abrir la ficha.",
        428,
      );
    if (!requestedIds.includes(propertyId)) {
      const property = policy.properties.find((p) => p.id === propertyId);
      const remaining = property.ownerIds.filter((id) => id !== ownerId);
      const tenants = policy.tenants.filter((tenant) => tenant.propertyId === propertyId);
      if (!remaining.length && tenants.length)
        throw fail("No se puede quitar el último titular de un inmueble con contratos vinculados.");
      for (const tenant of tenants.filter((tenant) => tenant.ownerId === ownerId))
        if (!allowed(user, "tenant:manage", tenant.id, policy))
          throw fail("No tienes permiso para reasignar los contratos de este propietario.", 403);
    }
  }
  for (const [propertyId, version] of Object.entries(propertyVersions)) {
    if (!allowed(user, "property:manage", propertyId, policy))
      throw fail("No tienes permiso para modificar este vínculo.", 403);
    if (!currentIds.includes(propertyId) && !data.propertyIds?.includes(propertyId))
      throw fail("La versión debe corresponder a un inmueble vinculado.");
    if (
      !Number.isSafeInteger(version) ||
      policy.properties.find((p) => p.id === propertyId)?.version !== version
    )
      throw fail(EDIT_CONFLICT, 409);
  }
  const updates = new Map();
  for (const share of data.propertyShares || []) {
    if (!share || typeof share.propertyId !== "string" || updates.has(share.propertyId))
      throw fail("La titularidad no es válida.");
    if (!allowed(user, "property:manage", share.propertyId, policy))
      throw fail("No tienes permiso para modificar la titularidad de este inmueble.", 403);
    const property = db.prepare("SELECT * FROM properties WHERE id=?").get(share.propertyId);
    if (!property) throw fail("El inmueble seleccionado no existe.");
    if (!Number.isSafeInteger(share.version) || share.version !== property.version)
      throw fail(EDIT_CONFLICT, 409);
    if (!data.propertyIds?.includes(share.propertyId))
      throw fail("La titularidad debe corresponder a un inmueble vinculado.");
    const percentage = share.percentage;
    if (
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      percentage <= 0 ||
      percentage > 100
    )
      throw fail("El porcentaje de titularidad debe estar entre 0 y 100.");
    const ownerIds = JSON.parse(property.ownerIds);
    const saved = JSON.parse(property.ownerPercentages);
    const percentages = Object.fromEntries(
      ownerIds.filter((id) => id !== ownerId).map((id) => [id, Number(saved[id] || 0)]),
    );
    if (Object.values(percentages).some((value) => !Number.isFinite(value) || value <= 0))
      throw fail(
        "Completa explícitamente los porcentajes de los titulares actuales antes de añadir otro.",
      );
    percentages[ownerId] = percentage;
    if (Object.values(percentages).reduce((sum, value) => sum + value, 0) > 100.0001)
      throw fail("La suma de los porcentajes de titularidad no puede superar el 100%.");
    updates.set(property.id, percentages);
  }
  const residences = data.propertyResidencies ?? [];
  if (!Array.isArray(residences) || residences.length > 1000)
    throw fail("La lista de residencias no es válida.");
  const residenceUpdates = new Map();
  for (const entry of residences) {
    if (
      !entry ||
      typeof entry.propertyId !== "string" ||
      typeof entry.resides !== "boolean" ||
      residenceUpdates.has(entry.propertyId)
    )
      throw fail("La residencia indicada no es válida.");
    const property = policy.properties.find((item) => item.id === entry.propertyId);
    if (!property || !requestedIds.includes(property.id))
      throw fail("La residencia debe corresponder a un inmueble vinculado.");
    if (!allowed(user, "property:manage", property.id, policy))
      throw fail("No tienes permiso para modificar la residencia en este inmueble.", 403);
    if (!Number.isSafeInteger(entry.version) || entry.version !== property.version)
      throw fail(EDIT_CONFLICT, 409);
    if (entry.resides && property.occupancy === "tenant")
      throw fail(
        "Este inmueble tiene un inquilino. Revisa su ocupación desde Inmuebles antes de marcar al propietario como residente.",
      );
    residenceUpdates.set(property.id, entry.resides);
  }
  return () => {
    const update = db.prepare("UPDATE properties SET ownerPercentages=? WHERE id=?");
    for (const [id, percentages] of updates) update.run(JSON.stringify(percentages), id);
    for (const [id, resides] of residenceUpdates) {
      const property = db.prepare("SELECT * FROM properties WHERE id=?").get(id);
      const residents = JSON.parse(property.residentOwnerIds || "[]").filter(
        (id) => id !== ownerId,
      );
      if (resides) residents.push(ownerId);
      const primary = residents.includes(property.primaryResidentId)
        ? property.primaryResidentId
        : residents[0] || "";
      db.prepare(
        "UPDATE properties SET occupancy=?, residentOwnerIds=?, primaryResidentId=? WHERE id=?",
      ).run(
        resides ? "owner" : property.occupancy,
        JSON.stringify(residents),
        property.occupancy === "tenant" ? property.primaryResidentId : primary,
        id,
      );
    }
  };
}
