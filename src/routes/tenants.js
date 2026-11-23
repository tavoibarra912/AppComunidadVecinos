import { versionedUpdate } from "../entity-version.js";
import { Router } from "express";
import crypto from "node:crypto";
import { db, tenantFromRow } from "../db.js";
import { normalizeStoredResidency, upsertTenant } from "../domain.js";
import { contactError, dateError, identityDocumentError } from "../validation.js";
import { entityRequiredError, trimEntityFields } from "../entity-validation.js";
import { removeEntityFiles } from "./documents.js";
import { registerCascadeRoutes } from "../cascade-delete.js";

const router = Router();
registerCascadeRoutes(router, "tenants");
function validateTenantData(data) {
  const error = contactError(data);
  if (error) return error;
  if (data.documentType !== undefined) {
    data.documentType = String(data.documentType || "DNI")
      .trim()
      .toUpperCase();
  }
  if (data.documentId !== undefined) {
    data.documentId = String(data.documentId || "")
      .trim()
      .toUpperCase();
    if (data.documentId) {
      const documentError = identityDocumentError(data.documentId, data.documentType || "DNI");
      if (documentError) return documentError;
    }
  }
  if (dateError(data.contractStart) || (data.contractEnd && dateError(data.contractEnd)))
    return "Las fechas del contrato no son válidas.";
  if (data.contractEnd && data.contractEnd < data.contractStart)
    return "El fin de contrato no puede ser anterior al inicio.";
  return null;
}

function findTenant(id) {
  const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
  return row ? tenantFromRow(row) : null;
}

function tenantPayload(tenant) {
  return tenant;
}

router.get("/", (req, res) => {
  res.json(
    db
      .prepare("SELECT * FROM tenants ORDER BY surname, name")
      .all()
      .map(tenantFromRow)
      .map(tenantPayload),
  );
});

router.get("/:id", (req, res) => {
  const tenant = findTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Inquilino no encontrado." });
  res.json(tenantPayload(tenant));
});

router.post("/", (req, res) => {
  const data = req.body || {};
  trimEntityFields("tenant", data);
  const errorObligatorio = entityRequiredError("tenant", data) || validateTenantData(data);
  if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
  const id = data.id || crypto.randomUUID();
  try {
    db.exec("BEGIN");
    upsertTenant(data, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(tenantPayload(findTenant(id)));
});

router.put(
  "/:id",
  versionedUpdate("tenants", (req, res) => {
    const existing = findTenant(req.params.id);
    if (!existing) return res.status(404).json({ error: "Inquilino no encontrado." });
    const data = { ...existing, ...req.body };
    trimEntityFields("tenant", data);
    const errorObligatorio = entityRequiredError("tenant", data) || validateTenantData(data);
    if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
    try {
      db.exec("SAVEPOINT entity_update");
      upsertTenant(data, existing.id);
      db.exec("RELEASE entity_update");
    } catch (error) {
      db.exec("ROLLBACK TO entity_update");
      return res.status(400).json({ error: error.message });
    }
    res.json(tenantPayload(findTenant(existing.id)));
  }),
);

router.delete("/:id", (req, res) => {
  const existing = findTenant(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inquilino no encontrado." });
  db.exec("BEGIN");
  try {
    const affectedProperties = db
      .prepare("SELECT id FROM properties WHERE tenantIds LIKE ?")
      .all(`%"${existing.id}"%`)
      .map((property) => property.id);
    removeEntityFiles("tenant", existing.id);
    db.prepare("DELETE FROM tenants WHERE id = ?").run(existing.id);
    // Sin el contrato, el inmueble recupera ocupación y contacto coherentes.
    for (const propertyId of affectedProperties) normalizeStoredResidency(propertyId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

export default router;
