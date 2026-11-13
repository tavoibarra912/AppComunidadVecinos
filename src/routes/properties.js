import { Router } from "express";
import crypto from "node:crypto";
import { db, propertyFromRow, listDocuments } from "../db.js";
import { rebuildOwnersPropertyIds, rebuildPropertyTenantReferences } from "../domain.js";
import { removeEntityFiles } from "./documents.js";

const router = Router();

function findProperty(id) {
  const row = db.prepare("SELECT * FROM properties WHERE id = ?").get(id);
  return row ? propertyFromRow(row) : null;
}

function hasAssessment(propertyId) {
  const assessment =
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_assessments'").get() &&
    db.prepare(`SELECT 1 FROM fee_assessments a, json_each(a.data, '$.propertyIds') p
      WHERE a.cancelledAt='' AND p.value=? LIMIT 1`).get(propertyId);
  if (assessment) return true;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='service_bills'").get())
    return false;
  return db.prepare(`SELECT 1 FROM service_bills s, json_each(s.data, '$.propertyIds') p
      WHERE s.cancelledAt='' AND p.value=? LIMIT 1`).get(propertyId);
}

function propertyPayload(property) {
  return { ...property, documents: listDocuments("property", property.id) };
}

function normalizeCadastralRef(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeParticipationCoef(value) {
  return String(value ?? "").trim().replace(",", ".");
}

/** Comunidades en las que el propietario ya tiene algún inmueble. */
function ownerCommunityIds(ownerId) {
  const ids = new Set();
  const owner = db.prepare("SELECT communityId FROM owners WHERE id = ?").get(ownerId);
  if (owner?.communityId) ids.add(owner.communityId);
  db.prepare("SELECT DISTINCT communityId FROM properties WHERE ownerIds LIKE ? AND communityId <> ''")
    .all(`%"${ownerId}"%`)
    .forEach(row => ids.add(row.communityId));
  return ids;
}

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM properties ORDER BY plot").all().map(propertyFromRow).map(propertyPayload));
});

router.get("/:id", (req, res) => {
  const property = findProperty(req.params.id);
  if (!property) return res.status(404).json({ error: "Inmueble no encontrado." });
  res.json(propertyPayload(property));
});

function validatePropertyPayload(data, { requireOwners = true, excludeId = "" } = {}) {
  if (!data.plot || !data.propertyType) {
    return "Tipo e identificador del inmueble son obligatorios.";
  }
  let community = null;
  if (data.communityId) {
    community = db.prepare("SELECT id, name FROM communities WHERE id = ?").get(data.communityId);
    if (!community) return "La comunidad indicada no existe.";
  }
  const ownerIds = Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [];
  // Los inmuebles heredados pueden no tener propietario; al actualizarlos
  // (por ejemplo, para asociarlos a una comunidad) no hay que bloquear el guardado.
  if (requireOwners && ownerIds.length === 0) {
    return "Selecciona al menos un propietario para el inmueble.";
  }
  for (const ownerId of ownerIds) {
    if (!db.prepare("SELECT id FROM owners WHERE id = ?").get(ownerId)) {
      return "Uno de los propietarios seleccionados ya no existe.";
    }
    if (community) {
      const knownCommunities = ownerCommunityIds(ownerId);
      // Los propietarios de alta nueva aún no tienen comunidad: se permiten
      // para poder crear su primer inmueble.
      if (knownCommunities.size > 0 && !knownCommunities.has(community.id)) {
        return "Todos los propietarios deben pertenecer a la comunidad del inmueble.";
      }
    }
  }
  for (const tenantId of data.tenantIds || []) {
    const tenant = db.prepare(
      `SELECT t.id, t.propertyId, p.communityId AS propertyCommunityId
       FROM tenants t LEFT JOIN properties p ON p.id = t.propertyId
       WHERE t.id = ?`
    ).get(tenantId);
    if (!tenant) return "Uno de los inquilinos seleccionados no existe.";
    if (community && tenant.propertyId && tenant.propertyCommunityId &&
        tenant.propertyCommunityId !== community.id) {
      return "Todos los inquilinos deben pertenecer a la comunidad del inmueble.";
    }
  }

  const cadastralRef = normalizeCadastralRef(data.cadastralRef);
  if (cadastralRef) {
    if (!/^[A-Z0-9]{20}$/.test(cadastralRef)) {
      return "La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.";
    }
    const duplicate = db.prepare(
      "SELECT id FROM properties WHERE UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) = ? AND id <> ?"
    ).get(cadastralRef, excludeId);
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
  if (!Number.isFinite(participationNumber) || participationNumber < 0.0001 || participationNumber > 100) {
    return "El coeficiente de participación debe ser un porcentaje decimal entre 0,0001 y 100.";
  }

  return normalizeOwnerPercentages(data).error || null;
}

/**
 * Completa los porcentajes de titularidad que falten.
 * Los inmuebles antiguos guardaron `ownerPercentages` vacío aunque tuvieran
 * propietarios; en ese caso se reparte el 100% disponible entre ellos
 * (100% si solo hay uno) en lugar de rechazar cualquier actualización.
 */
function normalizeOwnerPercentages(data) {
  const ownerIds = Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : [];
  const input = data.ownerPercentages && typeof data.ownerPercentages === "object" ? data.ownerPercentages : {};
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
      return { error: "El porcentaje de titularidad de cada propietario debe estar entre 0 y 100." };
    }
    percentages[ownerId] = pct;
    total += pct;
  }

  if (total > 100.0001) {
    return { error: "La suma de los porcentajes de titularidad no puede superar el 100%." };
  }

  if (missing.length > 0) {
    const remaining = 100 - total;
    const share = Math.round((remaining / missing.length) * 10000) / 10000;
    if (share <= 0) {
      return { error: "No queda porcentaje de titularidad disponible para el resto de propietarios." };
    }
    missing.forEach(ownerId => {
      percentages[ownerId] = share;
    });
  }

  return { percentages };
}

function storeProperty(id, data, community) {
  const ownerIds = JSON.stringify(Array.isArray(data.ownerIds) ? data.ownerIds.filter(Boolean) : []);
  const tenantIds = JSON.stringify(Array.isArray(data.tenantIds) ? data.tenantIds.filter(Boolean) : []);
  const ownerPercentages = JSON.stringify(normalizeOwnerPercentages(data).percentages || {});
  return db.prepare(
    `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot, address, staircase, energyCertificate, communityFee, cadastralRef,
       registryNumber, floor, door, areaM2, participationCoef, propertyUse, receiptStatus, notes, postalCode, city, province, currency, ownerPercentages)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       ownerPercentages = excluded.ownerPercentages`
  ).run(
    id, community ? community.id : "", community ? community.name : "", ownerIds, tenantIds, data.propertyType, data.plot, data.address || "",
    data.staircase || "", data.energyCertificate || "", data.communityFee || "",
    normalizeCadastralRef(data.cadastralRef), data.registryNumber || "", data.floor || "", data.door || "",
    data.areaM2 || "", normalizeParticipationCoef(data.participationCoef), data.propertyUse || "",
    data.receiptStatus === "pending" ? "pending" : "current",
    data.notes || "", data.postalCode || "", data.city || "", data.province || "",
    data.currency || "", ownerPercentages
  );
}

/** Sincroniza los inquilinos del inmueble: los tenantIds pasan a apuntar al inmueble. */
function syncTenantsForProperty(propertyId, tenantIds) {
  db.prepare("UPDATE tenants SET propertyId = '' WHERE propertyId = ? AND id NOT IN (SELECT j.value FROM json_each(?) j)")
    .run(propertyId, JSON.stringify(tenantIds));
  const owners = JSON.parse(db.prepare("SELECT ownerIds FROM properties WHERE id = ?").get(propertyId).ownerIds || "[]");
  const setTenant = db.prepare("UPDATE tenants SET propertyId = ?, ownerId = CASE WHEN ownerId IN (SELECT value FROM json_each(?)) THEN ownerId ELSE ? END WHERE id = ?");
  for (const tenantId of tenantIds) {
    setTenant.run(propertyId, JSON.stringify(owners), owners[0] || "", tenantId);
  }
  rebuildPropertyTenantReferences();
}

router.post("/", (req, res) => {
  const data = req.body || {};
  const id = data.id || crypto.randomUUID();
  const error = validatePropertyPayload(data, { excludeId: id });
  if (error) return res.status(400).json({ error });
  const community = db.prepare("SELECT id, name FROM communities WHERE id = ?").get(data.communityId);

  db.exec("BEGIN");
  try {
    storeProperty(id, data, community);
    syncTenantsForProperty(id, Array.isArray(data.tenantIds) ? data.tenantIds.filter(Boolean) : []);
    rebuildOwnersPropertyIds();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.status(201).json(propertyPayload(findProperty(id)));
});

router.put("/:id", (req, res) => {
  const existing = findProperty(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inmueble no encontrado." });
  const data = req.body || {};
  if ((data.communityId || "") !== existing.communityId && hasAssessment(existing.id))
    return res.status(409).json({ error: "No se puede cambiar de comunidad un inmueble incluido en una derrama o servicio vigente. Anulá primero el reparto." });
  const error = validatePropertyPayload(data, { requireOwners: false, excludeId: existing.id });
  if (error) return res.status(400).json({ error });
  const community = db.prepare("SELECT id, name FROM communities WHERE id = ?").get(data.communityId);

  db.exec("BEGIN");
  try {
    storeProperty(existing.id, data, community);
    syncTenantsForProperty(existing.id, Array.isArray(data.tenantIds) ? data.tenantIds.filter(Boolean) : []);
    rebuildOwnersPropertyIds();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.json(propertyPayload(findProperty(existing.id)));
});

router.delete("/:id", (req, res) => {
  if (hasAssessment(req.params.id))
    return res.status(409).json({ error: "No se puede eliminar un inmueble incluido en una derrama o servicio vigente. Anulá primero el reparto." });
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get() && db.prepare("SELECT 1 FROM fee_receipts WHERE propertyId=?").get(req.params.id))
    return res.status(409).json({ error: "No se puede eliminar un inmueble con historial de cuotas." });
  const existing = findProperty(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inmueble no encontrado." });
  const inquilinos = db.prepare("SELECT COUNT(*) AS n FROM tenants WHERE propertyId = ?").get(existing.id).n;
  if (inquilinos > 0)
    return res.status(409).json({
      error: `No se puede eliminar el inmueble: tiene ${inquilinos === 1 ? "un inquilino asociado" : "inquilinos asociados"}. Desvincula primero al inquilino.`,
    });
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE tenants SET propertyId = '' WHERE propertyId = ?").run(existing.id);
    removeEntityFiles("property", existing.id);
    db.prepare("DELETE FROM properties WHERE id = ?").run(existing.id);
    rebuildOwnersPropertyIds();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

export { normalizeOwnerPercentages };
export default router;
