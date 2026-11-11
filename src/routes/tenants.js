import { Router } from "express";
import crypto from "node:crypto";
import { db, tenantFromRow } from "../db.js";
import { upsertTenant } from "../domain.js";
import { contactError, dateError, identityDocumentError } from "../validation.js";
import { removeEntityFiles } from "./documents.js";

const router = Router();
router.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    const data = req.body || {};
    const error = contactError(data);
    if (error) return res.status(400).json({ error });
    if (data.documentType !== undefined) {
      data.documentType = String(data.documentType || "DNI").trim().toUpperCase();
    }
    if (data.documentId !== undefined) {
      data.documentId = String(data.documentId || "").trim().toUpperCase();
      if (data.documentId) {
        const documentError = identityDocumentError(data.documentId, data.documentType || "DNI");
        if (documentError) return res.status(400).json({ error: documentError });
      }
    }
    if (dateError(data.contractStart) || data.contractEnd && dateError(data.contractEnd)) return res.status(400).json({ error: "Las fechas del contrato no son válidas." });
    if (data.contractEnd && data.contractEnd < data.contractStart) return res.status(400).json({ error: "El fin de contrato no puede ser anterior al inicio." });
  }
  next();
});

function findTenant(id) {
  const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
  return row ? tenantFromRow(row) : null;
}

function tenantPayload(tenant) {
  return tenant;
}

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM tenants ORDER BY surname, name").all().map(tenantFromRow).map(tenantPayload));
});

router.get("/:id", (req, res) => {
  const tenant = findTenant(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Inquilino no encontrado." });
  res.json(tenantPayload(tenant));
});

router.post("/", (req, res) => {
  const data = req.body || {};
  if (!data.name || !data.surname) {
    return res.status(400).json({ error: "El nombre y los apellidos del inquilino son obligatorios." });
  }
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

router.put("/:id", (req, res) => {
  const existing = findTenant(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inquilino no encontrado." });
  const data = req.body || {};
  if (!data.name || !data.surname) {
    return res.status(400).json({ error: "El nombre y los apellidos del inquilino son obligatorios." });
  }
  try {
    db.exec("BEGIN");
    upsertTenant(data, existing.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return res.status(400).json({ error: error.message });
  }
  res.json(tenantPayload(findTenant(existing.id)));
});

router.delete("/:id", (req, res) => {
  const existing = findTenant(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inquilino no encontrado." });
  db.exec("BEGIN");
  try {
    for (const property of db.prepare("SELECT id, tenantIds FROM properties").all()) {
      const ids = JSON.parse(property.tenantIds || "[]").filter(id => id !== existing.id);
      db.prepare("UPDATE properties SET tenantIds = ? WHERE id = ?").run(JSON.stringify(ids), property.id);
    }
    removeEntityFiles("tenant", existing.id);
    db.prepare("DELETE FROM tenants WHERE id = ?").run(existing.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

export default router;
