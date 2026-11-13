import { Router } from "express";
import crypto from "node:crypto";
import { db, ownerFromRow } from "../db.js";
import { applyOwnerPropertyLink, syncOwnerProperties, rebuildOwnersPropertyIds } from "../domain.js";
import { contactError, identityDocumentError } from "../validation.js";
import { avisarCambioOwner } from "../avisos-cambios.js";

const router = Router();
router.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    const data = req.body || {};
    const error = contactError(data);
    if (error) return res.status(400).json({ error });
    if (data.documentType !== undefined) {
      data.documentType = String(data.documentType || "DNI").trim().toUpperCase();
    }
    if (data.dni !== undefined) {
      data.dni = String(data.dni || "").trim().toUpperCase();
      const documentError = identityDocumentError(data.dni, data.documentType || "DNI");
      if (documentError) return res.status(400).json({ error: documentError });
    }
  }
  next();
});

function findOwner(id) {
  const row = db.prepare("SELECT * FROM owners WHERE id = ?").get(id);
  return row ? ownerFromRow(row) : null;
}

/** Campos LPH que no dependen del inmueble: se normalizan antes de guardar. */
function ownerLphFields(data, existing = {}) {
  const votingRights = data.votingRights ?? existing.votingRights ?? "active";
  const notificationPreference = data.notificationPreference ?? existing.notificationPreference ?? "email";
  return {
    votingRights: votingRights === "suspended" ? "suspended" : "active",
    legalRepresentative: String(data.legalRepresentative ?? existing.legalRepresentative ?? "").trim().slice(0, 100),
    notificationPreference: ["email", "postal", "phone"].includes(notificationPreference) ? notificationPreference : "email",
  };
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
  const lph = ownerLphFields(data);

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO owners (id, name, surname, documentType, dni, isMember, phone, otherPhone, email,
         phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt, address, province, city, postalCode,
         iban, currency, votingRights, legalRepresentative, notificationPreference, notes, documents, userId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.name, data.surname, data.documentType || "DNI", String(data.dni).toUpperCase(),
      data.isMember ? 1 : 0, data.phone || "", data.otherPhone || "", data.email || "",
      data.phoneVerified ? 1 : 0, data.phoneVerifiedAt || "", data.emailVerified ? 1 : 0, data.emailVerifiedAt || "",
      data.address || "", data.province || "", data.city || "", data.postalCode || "",
      data.iban || "", data.currency || "EUR", lph.votingRights, lph.legalRepresentative, lph.notificationPreference,
      data.notes || "", JSON.stringify(data.documents || {}),
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

  const lph = ownerLphFields(data, existing);
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE owners SET name = ?, surname = ?, documentType = ?, dni = ?, isMember = ?, phone = ?, otherPhone = ?,
         email = ?, phoneVerified = ?, phoneVerifiedAt = ?, emailVerified = ?, emailVerifiedAt = ?, address = ?,
         province = ?, city = ?, postalCode = ?, iban = ?, currency = ?, votingRights = ?,
         legalRepresentative = ?, notificationPreference = ?, notes = ?, documents = ?, userId = ?
       WHERE id = ?`
    ).run(
      data.name, data.surname, data.documentType || "DNI", String(data.dni).toUpperCase(),
      data.isMember ? 1 : 0, data.phone || "", data.otherPhone || "", data.email || "",
      data.phoneVerified ? 1 : 0, data.phoneVerifiedAt || "", data.emailVerified ? 1 : 0, data.emailVerifiedAt || "",
      data.address || "", data.province || "", data.city || "", data.postalCode || "",
      data.iban || "", data.currency || "EUR", lph.votingRights, lph.legalRepresentative, lph.notificationPreference,
      data.notes || "", JSON.stringify(data.documents || existing.documents),
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

  const actualizado = findOwner(existing.id);
  // Aviso por email de los cambios (configurable; no bloquea el guardado).
  avisarCambioOwner(existing, actualizado, req.user).catch(error =>
    console.error("[avisos] error notificando cambios de propietario:", error.message),
  );

  res.json(actualizado);
});

router.delete("/:id", (req, res) => {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get() &&
      (db.prepare("SELECT snapshot FROM fee_receipts").all().some(r => JSON.parse(r.snapshot).owners.some(o => o.id === req.params.id)) ||
       db.prepare("SELECT 1 FROM fee_payments WHERE ownerId=?").get(req.params.id)))
    return res.status(409).json({ error: "No se puede eliminar un propietario con historial de cuotas o cobros." });
  const existing = findOwner(req.params.id);
  if (!existing) return res.status(404).json({ error: "Propietario no encontrado." });
  // Inmuebles del propietario que tienen inquilino asociado: no se puede eliminar.
  const conInquilino = db
    .prepare(
      `SELECT p.plot FROM properties p
       WHERE p.ownerIds LIKE ?
         AND EXISTS (SELECT 1 FROM tenants t WHERE t.propertyId = p.id)`,
    )
    .all(`%"${existing.id}"%`);
  if (conInquilino.length > 0) {
    return res.status(409).json({
      error: `No se puede eliminar el propietario: el inmueble «${conInquilino[0].plot}» tiene un inquilino asociado. Desvincula primero al inquilino.`,
    });
  }
  // Inmuebles sin inquilino: se desvincula al propietario (no se borran los inmuebles).
  const vinculados = db.prepare("SELECT id, ownerIds FROM properties WHERE ownerIds LIKE ?").all(`%"${existing.id}"%`);
  db.exec("BEGIN");
  try {
    // Referencias antiguas: si un inquilino sigue apuntando a este propietario
    // pero ya no está en un inmueble suyo, se reasigna a otro copropietario o
    // se deja sin titular. Así una desvinculación previa no bloquea el borrado.
    const updateTenantOwner = db.prepare("UPDATE tenants SET ownerId = ? WHERE id = ?");
    for (const tenant of db.prepare("SELECT id, propertyId FROM tenants WHERE ownerId = ?").all(existing.id)) {
      const property = db.prepare("SELECT ownerIds FROM properties WHERE id = ?").get(tenant.propertyId);
      const restantes = property
        ? JSON.parse(property.ownerIds || "[]").filter(id => id !== existing.id)
        : [];
      updateTenantOwner.run(restantes[0] || "", tenant.id);
    }
    const update = db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?");
    for (const p of vinculados) {
      const restantes = JSON.parse(p.ownerIds || "[]").filter(id => id !== existing.id);
      update.run(JSON.stringify(restantes), p.id);
    }
    rebuildOwnersPropertyIds();
    db.prepare("DELETE FROM owner_notifications WHERE ownerId = ?").run(existing.id);
    db.prepare("DELETE FROM admin_emails WHERE ownerId = ?").run(existing.id);
    db.prepare("DELETE FROM owners WHERE id = ?").run(existing.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

export default router;
