import { versionedUpdate } from "../entity-version.js";
import { Router } from "express";
import crypto from "node:crypto";
import {
  db,
  propertyFromRow,
  listProperties,
  listDocuments,
  normalizePropertyResidency,
} from "../db.js";
import { entityRequiredError, trimEntityFields } from "../entity-validation.js";
import {
  rebuildOwnersPropertyIds,
  syncOwnerProperties,
  syncPropertyTenantReferences,
} from "../domain.js";
import { allowed, policyData } from "../security.js";
import { isTenantContractActive } from "../../public/js/permissions.js";
import { removeEntityFiles } from "./documents.js";
import { registerCascadeRoutes } from "../cascade-delete.js";

const router = Router();
registerCascadeRoutes(router, "properties");

function findProperty(id) {
  const row = db.prepare("SELECT * FROM properties WHERE id = ?").get(id);
  return row ? propertyFromRow(row) : null;
}

function hasAssessment(propertyId) {
  const assessment =
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_assessments'").get() &&
    db
      .prepare(
        `SELECT 1 FROM fee_assessments a, json_each(a.data, '$.propertyIds') p
      WHERE a.cancelledAt='' AND p.value=? LIMIT 1`,
      )
      .get(propertyId);
  if (assessment) return true;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='service_bills'").get()) return false;
  return db
    .prepare(
      `SELECT 1 FROM service_bills s, json_each(s.data, '$.propertyIds') p
      WHERE s.cancelledAt='' AND p.value=? LIMIT 1`,
    )
    .get(propertyId);
}

function propertyPayload(property) {
  return { ...property, documents: listDocuments("property", property.id) };
}

function normalizeCadastralRef(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeParticipationCoef(value) {
  return String(value ?? "")
    .trim()
    .replace(",", ".");
}

router.get("/", (req, res) => {
  res.json(listProperties().map(propertyPayload));
});

router.get("/:id", (req, res) => {
  const property = findProperty(req.params.id);
  if (!property) return res.status(404).json({ error: "Inmueble no encontrado." });
  res.json(propertyPayload(property));
});

function validatePropertyPayload(
  data,
  { requireOwners = true, excludeId = "", existing = null, occupancyProvided = false } = {},
) {
  trimEntityFields("property", data);
  const errorObligatorio = entityRequiredError("property", data);
  if (errorObligatorio) return errorObligatorio;
  let community = null;
  if (data.communityId) {
    community = db.prepare("SELECT id, name FROM communities WHERE id = ?").get(data.communityId);
    if (!community) return "La comunidad indicada no existe.";
  }
  const ownerIds = Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [];
  if (
    data.ownerPercentages !== undefined &&
    (!data.ownerPercentages ||
      typeof data.ownerPercentages !== "object" ||
      Array.isArray(data.ownerPercentages))
  )
    return "Los porcentajes de titularidad deben ser un objeto válido.";
  // Los inmuebles heredados pueden no tener propietario; al actualizarlos
  // (por ejemplo, para asociarlos a una comunidad) no hay que bloquear el guardado.
  if (requireOwners && ownerIds.length === 0) {
    return "Selecciona al menos un propietario para el inmueble.";
  }
  if (
    !ownerIds.length &&
    (data.linkTenantIds?.length ||
      (data.tenantIds || []).some((id) => !(existing?.tenantIds || []).includes(id)))
  )
    return "No se pueden vincular contratos a un inmueble sin titulares.";
  for (const ownerId of ownerIds) {
    if (!db.prepare("SELECT id FROM owners WHERE id = ?").get(ownerId)) {
      return "Uno de los propietarios seleccionados ya no existe.";
    }
  }
  for (const tenantId of [...(data.tenantIds || []), ...(data.linkTenantIds || [])]) {
    const tenant = db
      .prepare(
        `SELECT t.id, t.propertyId, p.communityId AS propertyCommunityId
       FROM tenants t LEFT JOIN properties p ON p.id = t.propertyId
       WHERE t.id = ?`,
      )
      .get(tenantId);
    if (!tenant) return "Uno de los inquilinos seleccionados no existe.";
    if (
      community &&
      tenant.propertyId &&
      tenant.propertyCommunityId &&
      tenant.propertyCommunityId !== community.id
    ) {
      return "Todos los inquilinos deben pertenecer a la comunidad del inmueble.";
    }
  }

  const cadastralRef = normalizeCadastralRef(data.cadastralRef);
  if (cadastralRef) {
    if (!/^[A-Z0-9]{20}$/.test(cadastralRef)) {
      return "La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.";
    }
    const duplicate = db
      .prepare(
        "SELECT id FROM properties WHERE UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) = ? AND id <> ?",
      )
      .get(cadastralRef, excludeId);
    if (duplicate) return "Ya existe otro inmueble con la misma referencia catastral.";
  }

  const participationCoef = normalizeParticipationCoef(data.participationCoef);
  if (!participationCoef) {
    return "El coeficiente de participación es obligatorio.";
  }
  if (!/^\d+(?:\.\d{1,4})?$/.test(participationCoef)) {
    return "El coeficiente de participación debe ser un porcentaje decimal entre 0,0001 y 100.";
  }
  const participationNumber = Number(participationCoef);
  if (
    !Number.isFinite(participationNumber) ||
    participationNumber < 0.0001 ||
    participationNumber > 100
  ) {
    return "El coeficiente de participación debe ser un porcentaje decimal entre 0,0001 y 100.";
  }

  const residencyError = validatePropertyResidency(data, ownerIds, existing, occupancyProvided);
  if (residencyError) return residencyError;

  const ownershipChanged =
    !existing ||
    existing.ownerIds.length !== ownerIds.length ||
    existing.ownerIds.some((id) => !ownerIds.includes(id));
  return normalizeOwnerPercentages(data, { requireAll: ownershipChanged }).error || null;
}

const OCCUPANCY_VALUES = new Set(["owner", "tenant", "vacant"]);

/**
 * La ocupación decide a quién se dirigen los avisos, pero no altera la
 * titularidad ni el cobro. Se valida contra los vínculos que quedarán tras
 * guardar, no contra los que había antes.
 */
function validatePropertyResidency(data, ownerIds, existing, occupancyProvided = false) {
  const occupancy = data.occupancy || "";
  if (occupancy && !OCCUPANCY_VALUES.has(occupancy))
    return "La ocupación del inmueble no es válida.";
  const residentOwnerIds = Array.isArray(data.residentOwnerIds)
    ? [...new Set(data.residentOwnerIds.filter(Boolean))]
    : [];
  if (residentOwnerIds.some((ownerId) => !ownerIds.includes(ownerId)))
    return "Solo los propietarios del inmueble pueden constar como residentes.";

  const activeTenantIds = new Set(existing?.tenantIds || []);
  for (const tenantId of data.unlinkTenantIds || []) activeTenantIds.delete(tenantId);
  for (const tenantId of data.linkTenantIds || []) activeTenantIds.add(tenantId);
  if (data.unlinkTenantIds === undefined && Array.isArray(data.tenantIds)) {
    activeTenantIds.clear();
    for (const tenantId of data.tenantIds) activeTenantIds.add(tenantId);
  }

  // Un cliente anterior puede vincular un contrato sin enviar la ocupación.
  // En ese caso no se contradice su intención: la ocupación se deriva al guardar.
  if (!occupancyProvided) return null;

  if (occupancy === "owner") {
    // Las fichas heredadas no declaran residente; se respeta ese estado hasta
    // que el usuario lo marque desde la ficha del propietario.
    if (activeTenantIds.size)
      return "Un inmueble ocupado por el propietario no puede tener inquilinos vinculados.";
  }
  if (occupancy === "tenant") {
    if (residentOwnerIds.length)
      return "Si vive otra persona, ningún propietario puede constar como residente.";
  }
  if (occupancy === "vacant") {
    if (residentOwnerIds.length || activeTenantIds.size)
      return "Un inmueble sin ocupante no puede tener residentes ni inquilinos vinculados.";
  }
  const primaryResidentId = data.primaryResidentId || "";
  if (
    primaryResidentId &&
    ![...residentOwnerIds, ...activeTenantIds].includes(primaryResidentId)
  )
    return "El contacto principal debe ser uno de los residentes del inmueble.";
  return null;
}

/**
 * Conserva los porcentajes conocidos. Un cambio de titulares requiere todos
 * sus porcentajes explícitos; una ficha heredada puede repararse por separado.
 */
function normalizeOwnerPercentages(data, { requireAll = false } = {}) {
  const ownerIds = Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [];
  const input =
    data.ownerPercentages && typeof data.ownerPercentages === "object" ? data.ownerPercentages : {};
  const percentages = {};
  const missing = [];
  let total = 0;

  for (const ownerId of ownerIds) {
    const raw = input[ownerId];
    if (raw === undefined || raw === null || raw === "") {
      missing.push(ownerId);
      continue;
    }
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return {
        error: "El porcentaje de titularidad de cada propietario debe estar entre 0 y 100.",
      };
    }
    percentages[ownerId] = pct;
    total += pct;
  }

  if (total > 100.0001) {
    return { error: "La suma de los porcentajes de titularidad no puede superar el 100%." };
  }

  if (missing.length > 0) {
    if (requireAll)
      return {
        error:
          "Indica explícitamente el porcentaje de cada titular antes de cambiar la titularidad.",
      };
  }

  return { percentages };
}

function storeProperty(id, data, community) {
  const ownerIds = JSON.stringify(
    Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [],
  );
  // La ocupación es un índice derivado, nunca una orden de desvincular contratos.
  const tenantIds = JSON.stringify(
    db
      .prepare("SELECT * FROM tenants WHERE propertyId = ?")
      .all(id)
      .filter((tenant) => isTenantContractActive(tenant))
      .map((tenant) => tenant.id),
  );
  const ownerPercentages = JSON.stringify(normalizeOwnerPercentages(data).percentages || {});
  const tenantIdList = JSON.parse(tenantIds);
  // Con contratos vigentes la ocupación real es del inquilino, aunque un
  // cliente anterior no la haya enviado; nunca se guarda un estado imposible.
  const residency = normalizePropertyResidency({
    occupancy: data.occupancy || "",
    ownerIds: Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [],
    tenantIds: tenantIdList,
    residentOwnerIds: Array.isArray(data.residentOwnerIds) ? data.residentOwnerIds : [],
    primaryResidentId: data.primaryResidentId || "",
  });
  const { occupancy } = residency;
  const residentOwnerIds = JSON.stringify(residency.residentOwnerIds);
  const primaryResidentId = residency.primaryResidentId;
  return db
    .prepare(
      `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot, address, staircase, energyCertificate, communityFee, cadastralRef,
       registryNumber, floor, door, areaM2, participationCoef, propertyUse, receiptStatus, notes, postalCode, city, province, currency, ownerPercentages,
       occupancy, residentOwnerIds, primaryResidentId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       communityId = excluded.communityId,
       communityName = excluded.communityName,
       ownerIds = excluded.ownerIds,
       tenantIds = excluded.tenantIds,
       propertyType = excluded.propertyType,
       plot = excluded.plot,
       address = excluded.address,
       staircase = excluded.staircase,
       energyCertificate = excluded.energyCertificate,
       communityFee = excluded.communityFee,
       cadastralRef = excluded.cadastralRef,
       registryNumber = excluded.registryNumber,
       floor = excluded.floor,
       door = excluded.door,
       areaM2 = excluded.areaM2,
       participationCoef = excluded.participationCoef,
       propertyUse = excluded.propertyUse,
       receiptStatus = excluded.receiptStatus,
       notes = excluded.notes,
       postalCode = excluded.postalCode,
       city = excluded.city,
       province = excluded.province,
       currency = excluded.currency,
       ownerPercentages = excluded.ownerPercentages,
       occupancy = excluded.occupancy,
       residentOwnerIds = excluded.residentOwnerIds,
       primaryResidentId = excluded.primaryResidentId`,
    )
    .run(
      id,
      community ? community.id : "",
      community ? community.name : "",
      ownerIds,
      tenantIds,
      data.propertyType,
      data.plot,
      data.address || "",
      data.staircase || "",
      data.energyCertificate || "",
      data.communityFee || "",
      normalizeCadastralRef(data.cadastralRef),
      data.registryNumber || "",
      data.floor || "",
      data.door || "",
      data.areaM2 || "",
      normalizeParticipationCoef(data.participationCoef),
      data.propertyUse || "",
      data.receiptStatus === "pending" ? "pending" : "current",
      data.notes || "",
      data.postalCode || "",
      data.city || "",
      data.province || "",
      data.currency || "",
      ownerPercentages,
      occupancy,
      residentOwnerIds,
      primaryResidentId,
    );
}

function tenantLinkChanges(propertyId, data, existing, actor) {
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  const explicit = data.linkTenantIds !== undefined || data.unlinkTenantIds !== undefined;
  const selected = new Set(data.tenantIds || []);
  // Compatibilidad con clientes anteriores: solo las diferencias respecto al
  // índice que leyeron son órdenes. Los contratos fuera del índice se conservan.
  const previous = new Set(existing?.tenantIds || []);
  const links = new Set(
    explicit ? data.linkTenantIds || [] : [...selected].filter((id) => !previous.has(id)),
  );
  const unlinks = new Set(
    explicit
      ? data.unlinkTenantIds || []
      : data.tenantIds === undefined
        ? []
        : [...previous].filter((id) => !selected.has(id)),
  );
  const owners = data.ownerIds || [];
  // Un cambio real de titularidad puede requerir reasignar el arrendador.
  // No se aprovecha un guardado ordinario para reparar contratos antiguos.
  const ownershipChanged =
    existing &&
    (existing.ownerIds.length !== new Set(owners).size ||
      existing.ownerIds.some((id) => !owners.includes(id)));
  const reassignments = ownershipChanged
    ? db
        .prepare("SELECT * FROM tenants WHERE propertyId = ?")
        .all(propertyId)
        .filter((tenant) => !owners.includes(tenant.ownerId))
        .map((tenant) => tenant.id)
    : [];
  const policy = policyData();
  const changes = [];
  for (const id of new Set([...links, ...unlinks, ...reassignments])) {
    if (links.has(id) && unlinks.has(id))
      fail("No se puede vincular y desvincular el mismo inquilino.");
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
    if (!tenant) fail("Uno de los inquilinos seleccionados no existe.");
    if (unlinks.has(id) && tenant.propertyId !== propertyId)
      fail("El inquilino que se quiere desvincular no pertenece al inmueble.");
    const nextPropertyId = unlinks.has(id) ? "" : propertyId;
    const nextOwnerId =
      !unlinks.has(id) && !owners.includes(tenant.ownerId) ? owners[0] || "" : tenant.ownerId;
    if (tenant.propertyId === nextPropertyId && tenant.ownerId === nextOwnerId) continue;
    if (
      !allowed(actor, "tenant:manage", id, policy) ||
      (tenant.propertyId &&
        tenant.propertyId !== propertyId &&
        !allowed(actor, "property:manage", tenant.propertyId, policy))
    )
      fail(
        "No tienes permiso para modificar los inquilinos afectados o su inmueble de origen.",
        403,
      );
    changes.push({ id, propertyId: nextPropertyId, ownerId: nextOwnerId });
  }
  return changes;
}

function applyTenantLinkChanges(changes) {
  for (const tenant of changes) {
    db.prepare("UPDATE tenants SET propertyId = ?, ownerId = ? WHERE id = ?").run(
      tenant.propertyId,
      tenant.ownerId,
      tenant.id,
    );
    syncPropertyTenantReferences(tenant.id);
  }
}

/** Recalcula la comunidad, planta y coeficiente denormalizados de los titulares. */
function syncAffectedOwners(ownerIds) {
  for (const ownerId of new Set(ownerIds)) {
    const remaining = db
      .prepare("SELECT id FROM properties WHERE ownerIds LIKE ? ORDER BY id")
      .all(`%"${ownerId}"%`)
      .map((row) => row.id);
    syncOwnerProperties(ownerId, remaining);
  }
}

router.post("/", (req, res) => {
  const data = req.body || {};
  const id = data.id || crypto.randomUUID();
  // Solo el permiso específico permite crear un inmueble sin titulares; el
  // resto de roles debe asociar al menos un propietario.
  const requireOwners = !allowed(
    req.user,
    "property:create:unassigned",
    data.communityId || "",
    policyData(),
  );
  const error = validatePropertyPayload(data, {
    excludeId: id,
    requireOwners,
    occupancyProvided: data.occupancy !== undefined,
  });
  if (error) return res.status(400).json({ error });
  const community = db
    .prepare("SELECT id, name FROM communities WHERE id = ?")
    .get(data.communityId);

  db.exec("BEGIN IMMEDIATE");
  try {
    const changes = tenantLinkChanges(id, data, null, req.user);
    // Los contratos se mueven antes de guardar para que la ocupación refleje
    // quién queda realmente en el inmueble.
    applyTenantLinkChanges(changes);
    storeProperty(id, data, community);
    syncAffectedOwners(Array.isArray(data.ownerIds) ? data.ownerIds : []);
    rebuildOwnersPropertyIds();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  res.status(201).json(propertyPayload(findProperty(id)));
});

router.put(
  "/:id",
  versionedUpdate("properties", (req, res) => {
    const existing = findProperty(req.params.id);
    if (!existing) return res.status(404).json({ error: "Inmueble no encontrado." });
    const data = { ...existing, ...req.body };
    if (
      req.body.ownerPercentages &&
      typeof req.body.ownerPercentages === "object" &&
      !Array.isArray(req.body.ownerPercentages)
    )
      data.ownerPercentages = { ...existing.ownerPercentages, ...req.body.ownerPercentages };
    if ((data.communityId || "") !== existing.communityId && hasAssessment(existing.id))
      return res.status(409).json({
        error:
          "No se puede cambiar de comunidad un inmueble incluido en una derrama o servicio vigente. Anulá primero el reparto.",
      });
    const error = validatePropertyPayload(data, {
      requireOwners: existing.ownerIds.length > 0,
      excludeId: existing.id,
      existing,
      occupancyProvided: Object.prototype.hasOwnProperty.call(req.body || {}, "occupancy"),
    });
    if (error) return res.status(400).json({ error });
    const community = db
      .prepare("SELECT id, name FROM communities WHERE id = ?")
      .get(data.communityId);

    db.exec("SAVEPOINT entity_update");
    try {
      const changes = tenantLinkChanges(existing.id, data, existing, req.user);
      applyTenantLinkChanges(changes);
      storeProperty(existing.id, data, community);
      const affectedOwners = [
        ...(Array.isArray(existing.ownerIds) ? existing.ownerIds : []),
        ...(Array.isArray(data.ownerIds) ? data.ownerIds : []),
      ];
      syncAffectedOwners(affectedOwners);
      rebuildOwnersPropertyIds();
      db.exec("RELEASE entity_update");
    } catch (error) {
      db.exec("ROLLBACK TO entity_update");
      throw error;
    }

    res.json(propertyPayload(findProperty(existing.id)));
  }),
);

router.delete("/:id", deletePropertyNormal);

function deletePropertyNormal(req, res) {
  if (hasAssessment(req.params.id))
    return res.status(409).json({
      error:
        "No se puede eliminar un inmueble incluido en una derrama o servicio vigente. Anulá primero el reparto.",
    });
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get() &&
    db.prepare("SELECT 1 FROM fee_receipts WHERE propertyId=?").get(req.params.id)
  )
    return res
      .status(409)
      .json({ error: "No se puede eliminar un inmueble con historial de cuotas." });
  const existing = findProperty(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inmueble no encontrado." });
  // Solo los contratos vigentes impiden el borrado; los finalizados se
  // conservan desvinculados, igual que los ve la interfaz.
  const vigentes = db
    .prepare("SELECT * FROM tenants WHERE propertyId = ?")
    .all(existing.id)
    .filter((tenant) => isTenantContractActive(tenant));
  if (vigentes.length > 0)
    return res.status(409).json({
      error: `No se puede eliminar el inmueble: tiene ${
        vigentes.length === 1 ? "un contrato vigente" : `${vigentes.length} contratos vigentes`
      }. Finaliza o desvincula el contrato antes de eliminarlo.`,
    });
  const affectedOwnerIds = Array.isArray(existing.ownerIds)
    ? existing.ownerIds
    : JSON.parse(existing.ownerIds || "[]");
  db.exec("BEGIN");
  try {
    // Los contratos históricos se conservan sin inmueble: mantienen su ficha y
    // sus fechas como historial, pero dejan de apuntar al inmueble borrado.
    db.prepare("UPDATE tenants SET propertyId = '' WHERE propertyId = ?").run(existing.id);
    removeEntityFiles("property", existing.id);
    db.prepare("DELETE FROM properties WHERE id = ?").run(existing.id);
    // Tras borrar el inmueble hay que renormalizar los datos del titular: si
    // era su último inmueble, no debe conservar comunidad, planta o coeficiente
    // del inmueble desaparecido; si era un socio sin inmueble, conserva su censo.
    for (const ownerId of affectedOwnerIds) {
      const remaining = db
        .prepare("SELECT id FROM properties WHERE ownerIds LIKE ? ORDER BY id")
        .all(`%"${ownerId}"%`)
        .map((row) => row.id);
      syncOwnerProperties(ownerId, remaining);
    }
    rebuildOwnersPropertyIds();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
}

export { normalizeOwnerPercentages };
export default router;
