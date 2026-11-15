import { db } from "./db.js";
import { allowed, policyData } from "./security.js";
import { EDIT_CONFLICT } from "./entity-version.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Comprobar las copias que vio el formulario ANTES de sincronizar vínculos.
// Los porcentajes se guardan en la misma transacción que el propietario.
export function prepareOwnerPropertyShares(data, ownerId, user) {
  if (data.propertyShares === undefined) return () => {};
  if (!Array.isArray(data.propertyShares) || data.propertyShares.length > 1000)
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
  for (const propertyId of currentIds) {
    if (
      !data.propertyIds?.includes(propertyId) &&
      allowed(user, "property:manage", propertyId, policy) &&
      !Object.hasOwn(propertyVersions, propertyId)
    )
      throw fail(
        "Falta la versión del inmueble que quieres desvincular. Vuelve a abrir la ficha.",
        428,
      );
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
  for (const share of data.propertyShares) {
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
    percentages[ownerId] = percentage;
    if (Object.values(percentages).reduce((sum, value) => sum + value, 0) > 100.0001)
      throw fail("La suma de los porcentajes de titularidad no puede superar el 100%.");
    updates.set(property.id, percentages);
  }
  return () => {
    const update = db.prepare("UPDATE properties SET ownerPercentages=? WHERE id=?");
    for (const [id, percentages] of updates) update.run(JSON.stringify(percentages), id);
  };
}
