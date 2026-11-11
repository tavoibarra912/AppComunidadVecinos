import { db } from "./db.js";

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

function propertyOwnerIds(property) {
  return Array.isArray(property.ownerIds) ? property.ownerIds : JSON.parse(property.ownerIds || "[]");
}

function propertyTenantIds(property) {
  return Array.isArray(property.tenantIds) ? property.tenantIds : JSON.parse(property.tenantIds || "[]");
}

/**
 * Vincula el inmueble al propietario (modelo multi-propietario: aditivo).
 * El propietario pasa a figurar entre los ownerIds del inmueble y se
 * rearmalas relaciones propertyIds de todos los propietarios.
 */
export function applyOwnerPropertyLink(ownerId, linkedPropertyId) {
  const linked = db.prepare("SELECT * FROM properties WHERE id = ?").get(linkedPropertyId);
  if (!linked) throw new Error("El inmueble seleccionado no existe.");

  const ownerIds = propertyOwnerIds(linked);
  if (!ownerIds.includes(ownerId)) {
    ownerIds.push(ownerId);
    db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?").run(JSON.stringify(ownerIds), linkedPropertyId);
  }

  const community = db.prepare("SELECT name FROM communities WHERE id = ?").get(linked.communityId);
  db.prepare(
    `UPDATE owners SET
       communityId = ?, communityName = ?, plot = ?, propertyType = ?,
       cadastralRef = ?, registryNumber = ?, floor = ?, door = ?,
       areaM2 = ?, participationCoef = ?, propertyUse = ?
     WHERE id = ?`
  ).run(
    linked.communityId,
    linked.communityName || community?.name || "",
    linked.plot || "",
    linked.propertyType || "",
    linked.cadastralRef || "",
    linked.registryNumber || "",
    linked.floor || "",
    linked.door || "",
    linked.areaM2 || "",
    linked.participationCoef || "",
    linked.propertyUse || "",
    ownerId
  );

  rebuildOwnersPropertyIds();
}

/**
 * Sincroniza la lista completa de inmuebles de un propietario (modelo N:M):
 * añade los vínculos nuevos, elimina los que ya no corresponden y
 * renormaliza los campos desnormalizados de la comunidad/inmueble principal.
 */
export function syncOwnerProperties(ownerId, propertyIds = []) {
  const desired = [...new Set(propertyIds)].filter(id =>
    db.prepare("SELECT id FROM properties WHERE id = ?").get(id)
  );
  const current = db.prepare("SELECT id FROM properties WHERE ownerIds LIKE ?")
    .all(`%"${ownerId}"%`)
    .map(row => row.id);

  for (const propId of current) {
    if (desired.includes(propId)) continue;
    const row = db.prepare("SELECT ownerIds FROM properties WHERE id = ?").get(propId);
    const ids = JSON.parse(row.ownerIds || "[]").filter(x => x !== ownerId);
    db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?").run(JSON.stringify(ids), propId);
    // Si el propietario desvinculado era el titular del contrato de algún
    // inquilino, se reasigna a otro copropietario del inmueble (o se deja sin
    // titular si el inmueble queda sin propietarios) para no dejar referencias
    // huérfanas que impidan eliminar el perfil.
    db.prepare(
      "UPDATE tenants SET ownerId = ? WHERE propertyId = ? AND ownerId = ?"
    ).run(ids[0] || "", propId, ownerId);
  }

  for (const propId of desired) {
    if (current.includes(propId)) continue;
    const row = db.prepare("SELECT ownerIds FROM properties WHERE id = ?").get(propId);
    const ids = JSON.parse(row.ownerIds || "[]");
    if (!ids.includes(ownerId)) ids.push(ownerId);
    db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?").run(JSON.stringify(ids), propId);
  }

  const primaryId = desired[0] || "";
  if (primaryId) {
    const linked = db.prepare("SELECT * FROM properties WHERE id = ?").get(primaryId);
    const community = db.prepare("SELECT name FROM communities WHERE id = ?").get(linked.communityId);
    db.prepare(
      `UPDATE owners SET
         communityId = ?, communityName = ?, plot = ?, propertyType = ?,
         cadastralRef = ?, registryNumber = ?, floor = ?, door = ?,
         areaM2 = ?, participationCoef = ?, propertyUse = ?
       WHERE id = ?`
    ).run(
      linked.communityId,
      linked.communityName || community?.name || "",
      linked.plot || "",
      linked.propertyType || "",
      linked.cadastralRef || "",
      linked.registryNumber || "",
      linked.floor || "",
      linked.door || "",
      linked.areaM2 || "",
      linked.participationCoef || "",
      linked.propertyUse || "",
      ownerId
    );
  } else {
    db.prepare(
      `UPDATE owners SET
         communityId = '', communityName = '', plot = '', propertyType = '',
         cadastralRef = '', registryNumber = '', floor = '', door = '',
         areaM2 = '', participationCoef = '', propertyUse = ''
       WHERE id = ?`
    ).run(ownerId);
  }

  rebuildOwnersPropertyIds();
}

/**
 * Rearma propertyIds de todos los propietarios a partir de los ownerIds
 * de cada inmueble (relación N:M).
 */
export function rebuildOwnersPropertyIds() {
  for (const property of db.prepare("SELECT id, ownerIds, ownerPercentages FROM properties").all()) {
    const ids = propertyOwnerIds(property);
    const saved = JSON.parse(property.ownerPercentages || "{}");
    const valid = ids.every(id => Number(saved[id]) > 0) && ids.reduce((sum, id) => sum + Number(saved[id] || 0), 0) <= 100.0001;
    const percentages = Object.fromEntries(ids.map((id, index) => [id, valid ? Number(saved[id]) : index === ids.length - 1 ? 100 - Math.round(10000 / ids.length) / 100 * (ids.length - 1) : Math.round(10000 / ids.length) / 100]));
    db.prepare("UPDATE properties SET ownerPercentages = ? WHERE id = ?").run(JSON.stringify(percentages), property.id);
  }
  const owners = db.prepare("SELECT id, propertyId FROM owners").all();
  const update = db.prepare("UPDATE owners SET propertyIds = ?, propertyId = ? WHERE id = ?");
  for (const owner of owners) {
    const linkedIds = db.prepare("SELECT id FROM properties WHERE ownerIds LIKE ?")
      .all(`%"${owner.id}"%`)
      .map(row => row.id);
    const mainId = linkedIds.includes(owner.propertyId) ? owner.propertyId : (linkedIds[0] || "");
    update.run(JSON.stringify(linkedIds), mainId, owner.id);
  }

  // Limpieza: propietarios sin inmuebles pierden la referencia primaria
  db.prepare("UPDATE owners SET propertyId = '' WHERE propertyId <> '' AND NOT EXISTS (SELECT 1 FROM properties WHERE id = owners.propertyId)").run();
}

/**
 * Sincroniza la referencia del inquilino vigente en los tenantIds de los
 * inmuebles (equivalente a syncPropertyTenantReferences del frontend).
 */
export function syncPropertyTenantReferences(tenantId) {
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) return;
  const status = getTenantContractStatus(tenant);

  const properties = db.prepare("SELECT id, tenantIds FROM properties").all();
  for (const property of properties) {
    const tenantIds = propertyTenantIds(property);
    const isLinked = property.id === tenant.propertyId && status === "Vigente";
    const hasReference = tenantIds.includes(tenantId);
    if (hasReference && !isLinked) {
      db.prepare("UPDATE properties SET tenantIds = ? WHERE id = ?")
        .run(JSON.stringify(tenantIds.filter(id => id !== tenantId)), property.id);
    } else if (isLinked && !hasReference) {
      tenantIds.push(tenantId);
      db.prepare("UPDATE properties SET tenantIds = ? WHERE id = ?")
        .run(JSON.stringify(tenantIds), property.id);
    }
  }
}

/**
 * Guarda o actualiza un inquilino. El propietario se conserva explícitamente
 * (modelo multi-inquilino por inmueble) y se sincronizan las referencias.
 */
export function upsertTenant(payload, tenantId) {
  const property = db.prepare("SELECT * FROM properties WHERE id = ?").get(payload.propertyId);
  if (!property) throw new Error("El inmueble seleccionado no existe.");
  if (payload.ownerId && !db.prepare("SELECT id FROM owners WHERE id = ?").get(payload.ownerId)) {
    throw new Error("El propietario seleccionado no existe.");
  }

  const existing = tenantId ? db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId) : null;
  const userId = payload.userId !== undefined ? payload.userId : (existing?.userId || "");
  const ownerIds = propertyOwnerIds(property);
  if (!payload.ownerId) payload = { ...payload, ownerId: existing?.ownerId || ownerIds[0] || "" };
  if (!ownerIds.includes(payload.ownerId)) throw new Error("El propietario debe ser titular del inmueble seleccionado.");

  if (existing) {
    db.prepare(
      `UPDATE tenants SET
         ownerId = ?, propertyId = ?, name = ?, surname = ?, documentType = ?, documentId = ?,
         contractType = ?, monthlyRent = ?, deposit = ?, emergencyPhone = ?,
         phone = ?, email = ?, contractStart = ?, contractEnd = ?,
         authorizations = ?, authorizationNotes = ?,
         phoneVerified = ?, phoneVerifiedAt = ?, emailVerified = ?, emailVerifiedAt = ?,
         notificationPreference = ?, currency = ?, documents = ?, userId = ?
       WHERE id = ?`
    ).run(
      payload.ownerId, payload.propertyId, payload.name, payload.surname, payload.documentType || "DNI", payload.documentId || "",
      payload.contractType || "vivienda_habitual", payload.monthlyRent || "", payload.deposit || "", payload.emergencyPhone || "",
      payload.phone, payload.email, payload.contractStart, payload.contractEnd || "",
      JSON.stringify(Array.isArray(payload.authorizations) ? payload.authorizations : []),
      payload.authorizationNotes || "",
      payload.phoneVerified ? 1 : 0, payload.phoneVerifiedAt || "",
      payload.emailVerified ? 1 : 0, payload.emailVerifiedAt || "",
      payload.notificationPreference || "email",
      payload.currency || "EUR",
      JSON.stringify(payload.documents || {}),
      userId,
      tenantId
    );
  } else {
    db.prepare(
      `INSERT INTO tenants (id, ownerId, propertyId, name, surname, documentType, documentId,
        contractType, monthlyRent, deposit, emergencyPhone, phone, email,
        contractStart, contractEnd, authorizations, authorizationNotes,
        phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt,
        notificationPreference, currency, documents, userId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      tenantId, payload.ownerId, payload.propertyId, payload.name, payload.surname, payload.documentType || "DNI", payload.documentId || "",
      payload.contractType || "vivienda_habitual", payload.monthlyRent || "", payload.deposit || "", payload.emergencyPhone || "",
      payload.phone, payload.email, payload.contractStart, payload.contractEnd || "",
      JSON.stringify(Array.isArray(payload.authorizations) ? payload.authorizations : []),
      payload.authorizationNotes || "",
      payload.phoneVerified ? 1 : 0, payload.phoneVerifiedAt || "",
      payload.emailVerified ? 1 : 0, payload.emailVerifiedAt || "",
      payload.notificationPreference || "email",
      payload.currency || "EUR",
      JSON.stringify(payload.documents || {}),
      userId
    );
  }

  syncPropertyTenantReferences(tenantId);
  return payload.ownerId;
}

/** Reconstruye índices derivados y repara vínculos antiguos que sean inequívocos. */
export function rebuildPropertyTenantReferences() {
  const tenants = db.prepare("SELECT * FROM tenants").all();
  for (const property of db.prepare("SELECT * FROM properties").all()) {
    const linked = tenants.filter(t => t.propertyId === property.id);
    const owners = propertyOwnerIds(property);
    if (owners.length === 1) {
      db.prepare("UPDATE tenants SET ownerId = ? WHERE propertyId = ? AND ownerId = ''").run(owners[0], property.id);
    }
    // Repara referencias antiguas: un inquilino no puede seguir vinculado a
    // un propietario que ya no es titular del inmueble donde está alquilado.
    for (const tenant of linked) {
      if (tenant.ownerId && !owners.includes(tenant.ownerId)) {
        const nextOwnerId = owners[0] || "";
        db.prepare("UPDATE tenants SET ownerId = ? WHERE id = ?").run(nextOwnerId, tenant.id);
        tenant.ownerId = nextOwnerId;
      }
    }
    db.prepare("UPDATE properties SET tenantIds = ? WHERE id = ?").run(
      JSON.stringify(linked.filter(t => getTenantContractStatus(t) === "Vigente").map(t => t.id)), property.id
    );
  }
}
