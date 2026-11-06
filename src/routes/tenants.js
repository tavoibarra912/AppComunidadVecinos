import { Router } from "express";
import crypto from "node:crypto";
import { db, tenantFromRow, listDocuments } from "../db.js";
import { upsertTenant } from "../domain.js";

const router = Router();

function findTenant(id) {
  const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
  return row ? tenantFromRow(row) : null;
}

function tenantPayload(tenant) {
  return { ...tenant, documents: listDocuments("tenant", tenant.id) };
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
    upsertTenant(data, id);
  } catch (error) {
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
    upsertTenant(data, existing.id);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json(tenantPayload(findTenant(existing.id)));
});

router.delete("/:id", (req, res) => {
  const existing = findTenant(req.params.id);
  if (!existing) return res.status(404).json({ error: "Inquilino no encontrado." });
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE properties SET tenantRecordId = '' WHERE tenantRecordId = ?").run(existing.id);
    db.prepare("DELETE FROM documents WHERE entityType = 'tenant' AND entityId = ?").run(existing.id);
    db.prepare("DELETE FROM tenants WHERE id = ?").run(existing.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

export default router;
