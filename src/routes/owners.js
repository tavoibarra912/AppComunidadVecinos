import { Router } from "express";
import crypto from "node:crypto";
import { db, ownerFromRow } from "../db.js";
import { applyOwnerPropertyLink, syncOwnerProperties } from "../domain.js";
import { contactError } from "../validation.js";

const router = Router();
router.use((req, res, next) => {
  const error = ["POST", "PUT"].includes(req.method) && contactError(req.body || {});
  if (error) return res.status(400).json({ error });
  next();
});

function findOwner(id) {
  const row = db.prepare("SELECT * FROM owners WHERE id = ?").get(id);
  return row ? ownerFromRow(row) : null;
}

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM owners ORDER BY surname, name").all().map(ownerFromRow));
});

router.get("/:id", (req, res) => {
  const owner = findOwner(req.params.id);
  if (!owner) return res.status(404).json({ error: "Propietario no encontrado." });
  res.json(owner);
});

router.post("/", (req, res) => {
  const data = req.body || {};
  if (!data.name || !data.surname || !data.dni || !data.email) {
    return res.status(400).json({ error: "Nombre, apellidos, documento y email son obligatorios." });
  }
  if (db.prepare("SELECT id FROM owners WHERE UPPER(dni) = UPPER(?)").get(String(data.dni))) {
    return res.status(409).json({ error: "Ya existe otro propietario registrado con ese documento." });
  }
  const id = data.id || crypto.randomUUID();

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO owners (id, name, surname, documentType, dni, isMember, phone, otherPhone, email,
         phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt, address, province, city, postalCode,
         iban, currency, notes, documents, userId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.name, data.surname, data.documentType || "DNI", String(data.dni).toUpperCase(),
      data.isMember ? 1 : 0, data.phone || "", data.otherPhone || "", data.email || "",
      data.phoneVerified ? 1 : 0, data.phoneVerifiedAt || "", data.emailVerified ? 1 : 0, data.emailVerifiedAt || "",
      data.address || "", data.province || "", data.city || "", data.postalCode || "",
      data.iban || "", data.currency || "EUR", data.notes || "",
      JSON.stringify(data.documents || {}),
      data.userId || ""
    );
    const propertyIds = Array.isArray(data.propertyIds)
      ? data.propertyIds
      : (data.propertyId ? [data.propertyId] : []);
    propertyIds.forEach(propertyId => applyOwnerPropertyLink(id, propertyId));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.status(201).json(findOwner(id));
});

router.put("/:id", (req, res) => {
  const existing = findOwner(req.params.id);
  if (!existing) return res.status(404).json({ error: "Propietario no encontrado." });
  const data = req.body || {};
  if (!data.name || !data.surname || !data.dni || !data.email) {
    return res.status(400).json({ error: "Nombre, apellidos, documento y email son obligatorios." });
  }
  const dniOwner = db.prepare("SELECT id FROM owners WHERE UPPER(dni) = UPPER(?) AND id <> ?").get(String(data.dni), existing.id);
  if (dniOwner) {
    return res.status(409).json({ error: "Ya existe otro propietario registrado con ese documento." });
  }

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE owners SET name = ?, surname = ?, documentType = ?, dni = ?, isMember = ?, phone = ?, otherPhone = ?,
         email = ?, phoneVerified = ?, phoneVerifiedAt = ?, emailVerified = ?, emailVerifiedAt = ?, address = ?,
         province = ?, city = ?, postalCode = ?, iban = ?, currency = ?, notes = ?, documents = ?, userId = ?
       WHERE id = ?`
    ).run(
      data.name, data.surname, data.documentType || "DNI", String(data.dni).toUpperCase(),
      data.isMember ? 1 : 0, data.phone || "", data.otherPhone || "", data.email || "",
      data.phoneVerified ? 1 : 0, data.phoneVerifiedAt || "", data.emailVerified ? 1 : 0, data.emailVerifiedAt || "",
      data.address || "", data.province || "", data.city || "", data.postalCode || "",
      data.iban || "", data.currency || "EUR", data.notes || "",
      JSON.stringify(data.documents || existing.documents),
      data.userId !== undefined ? data.userId : (existing.userId || ""),
      existing.id
    );
    const propertyIds = Array.isArray(data.propertyIds)
      ? data.propertyIds
      : (data.propertyId ? [data.propertyId] : null);
    if (propertyIds) {
      syncOwnerProperties(existing.id, propertyIds);
    } else if (data.propertyId) {
      applyOwnerPropertyLink(existing.id, data.propertyId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.json(findOwner(existing.id));
});

router.delete("/:id", (req, res) => {
  const existing = findOwner(req.params.id);
  if (!existing) return res.status(404).json({ error: "Propietario no encontrado." });
  const properties = db.prepare("SELECT COUNT(*) AS total FROM properties WHERE ownerIds LIKE ?")
    .get(`%"${existing.id}"%`).total;
  if (properties > 0) {
    return res.status(409).json({ error: "Reasigna los inmuebles antes de eliminar a este propietario." });
  }
  const tenants = db.prepare("SELECT COUNT(*) AS total FROM tenants WHERE ownerId = ?").get(existing.id).total;
  if (tenants > 0) {
    return res.status(409).json({ error: "Elimina los inquilinos asociados antes de eliminar a este propietario." });
  }
  db.prepare("DELETE FROM owner_notifications WHERE ownerId = ?").run(existing.id);
  db.prepare("DELETE FROM admin_emails WHERE ownerId = ?").run(existing.id);
  db.prepare("DELETE FROM owners WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

export default router;
