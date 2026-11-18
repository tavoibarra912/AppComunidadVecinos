import { prepareOwnerPropertyShares } from "../owner-property-shares.js";
import { versionedUpdate } from "../entity-version.js";
import { Router } from "express";
import crypto from "node:crypto";
import { db, ownerFromRow } from "../db.js";
import {
  applyOwnerPropertyLink,
  syncOwnerProperties,
  rebuildOwnersPropertyIds,
} from "../domain.js";
import { contactError, bankAccountError, identityDocumentError } from "../validation.js";
import { entityRequiredError, trimEntityFields } from "../entity-validation.js";
import { avisarCambioOwner } from "../avisos-cambios.js";
import { requireCascadeDelete } from "../access.js";
import { recordAudit } from "../audit.js";

const router = Router();
router.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    const data = req.body || {};
    const error = contactError(data) || bankAccountError(data);
    if (error) return res.status(400).json({ error });
    if (data.documentType !== undefined) {
      data.documentType = String(data.documentType || "DNI")
        .trim()
        .toUpperCase();
    }
    if (data.dni !== undefined) {
      data.dni = String(data.dni || "")
        .trim()
        .toUpperCase();
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
  const notificationPreference =
    data.notificationPreference ?? existing.notificationPreference ?? "email";
  return {
    votingRights: votingRights === "suspended" ? "suspended" : "active",
    legalRepresentative: String(data.legalRepresentative ?? existing.legalRepresentative ?? "")
      .trim()
      .slice(0, 100),
    notificationPreference: ["email", "postal", "phone"].includes(notificationPreference)
      ? notificationPreference
      : "email",
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
  trimEntityFields("owner", data);
  const errorObligatorio = entityRequiredError("owner", data, { exigirAusentes: false });
  if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
  if (db.prepare("SELECT id FROM owners WHERE UPPER(dni) = UPPER(?)").get(String(data.dni))) {
    return res
      .status(409)
      .json({ error: "Ya existe otro propietario registrado con ese documento." });
  }
  const id = data.id || crypto.randomUUID();
  const lph = ownerLphFields(data);

  db.exec("BEGIN");
  try {
    const saveShares = prepareOwnerPropertyShares(data, id, req.user);
    db.prepare(
      `INSERT INTO owners (id, name, surname, documentType, dni, isMember, phone, otherPhone, email,
         phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt, address, province, city, postalCode,
         iban, currency, votingRights, legalRepresentative, notificationPreference, notes, documents, userId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.name,
      data.surname,
      data.documentType || "DNI",
      String(data.dni).toUpperCase(),
      data.isMember ? 1 : 0,
      data.phone || "",
      data.otherPhone || "",
      data.email || "",
      data.phoneVerified ? 1 : 0,
      data.phoneVerifiedAt || "",
      data.emailVerified ? 1 : 0,
      data.emailVerifiedAt || "",
      data.address || "",
      data.province || "",
      data.city || "",
      data.postalCode || "",
      data.iban || "",
      data.currency || "EUR",
      lph.votingRights,
      lph.legalRepresentative,
      lph.notificationPreference,
      data.notes || "",
      JSON.stringify(data.documents || {}),
      data.userId || "",
    );
    const propertyIds = Array.isArray(data.propertyIds)
      ? data.propertyIds
      : data.propertyId
        ? [data.propertyId]
        : [];
    propertyIds.forEach((propertyId) => applyOwnerPropertyLink(id, propertyId));
    saveShares();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }

  res.status(201).json(findOwner(id));
});

router.put(
  "/:id",
  versionedUpdate("owners", (req, res) => {
    const existing = findOwner(req.params.id);
    if (!existing) return res.status(404).json({ error: "Propietario no encontrado." });
    const data = req.body || {};
    trimEntityFields("owner", data);
    const errorObligatorio = entityRequiredError("owner", data, { exigirAusentes: false });
    if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
    const dniOwner = db
      .prepare("SELECT id FROM owners WHERE UPPER(dni) = UPPER(?) AND id <> ?")
      .get(String(data.dni), existing.id);
    if (dniOwner) {
      return res
        .status(409)
        .json({ error: "Ya existe otro propietario registrado con ese documento." });
    }

    const lph = ownerLphFields(data, existing);
    db.exec("SAVEPOINT entity_update");
    try {
      const saveShares = prepareOwnerPropertyShares(data, existing.id, req.user);
      db.prepare(
        `UPDATE owners SET name = ?, surname = ?, documentType = ?, dni = ?, isMember = ?, phone = ?, otherPhone = ?,
         email = ?, phoneVerified = ?, phoneVerifiedAt = ?, emailVerified = ?, emailVerifiedAt = ?, address = ?,
         province = ?, city = ?, postalCode = ?, iban = ?, currency = ?, votingRights = ?,
         legalRepresentative = ?, notificationPreference = ?, notes = ?, documents = ?, userId = ?
       WHERE id = ?`,
      ).run(
        data.name,
        data.surname,
        data.documentType || "DNI",
        String(data.dni).toUpperCase(),
        data.isMember ? 1 : 0,
        data.phone || "",
        data.otherPhone || "",
        data.email || "",
        data.phoneVerified ? 1 : 0,
        data.phoneVerifiedAt || "",
        data.emailVerified ? 1 : 0,
        data.emailVerifiedAt || "",
        data.address || "",
        data.province || "",
        data.city || "",
        data.postalCode || "",
        data.iban || "",
        data.currency || "EUR",
        lph.votingRights,
        lph.legalRepresentative,
        lph.notificationPreference,
        data.notes || "",
        JSON.stringify(data.documents || existing.documents),
        data.userId !== undefined ? data.userId : existing.userId || "",
        existing.id,
      );
      const propertyIds = Array.isArray(data.propertyIds)
        ? data.propertyIds
        : data.propertyId
          ? [data.propertyId]
          : null;
      if (propertyIds) {
        syncOwnerProperties(existing.id, propertyIds);
      } else if (data.propertyId) {
        applyOwnerPropertyLink(existing.id, data.propertyId);
      }
      saveShares();
      db.exec("RELEASE entity_update");
    } catch (error) {
      db.exec("ROLLBACK TO entity_update");
      throw error;
    }

    const actualizado = findOwner(existing.id);
    // Aviso por email de los cambios (configurable; no bloquea el guardado).
    res.once("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300)
        avisarCambioOwner(existing, actualizado, req.user).catch((error) =>
          console.error("[avisos] error notificando cambios de propietario:", error.message),
        );
    });

    res.json(actualizado);
  }),
);

/**
 * Devuelve el árbol de dependencias de un propietario y las acciones
 * disponibles para el borrado en cascada. Requiere permiso cascade-delete.
 */
router.get(
  "/:id/cascade-preview",
  requireCascadeDelete,
  (req, res) => {
    const owner = findOwner(req.params.id);
    if (!owner) return res.status(404).json({ error: "Propietario no encontrado." });

    const today = new Date().toISOString().slice(0, 10);
    const isActiveContract = (t) =>
      (!t.contractStart || t.contractStart <= today) &&
      (!t.contractEnd || t.contractEnd >= today);

    const linkedProperties = db
      .prepare(
        "SELECT id, plot, communityId, communityName, ownerIds FROM properties WHERE ownerIds LIKE ?",
      )
      .all(`%"${owner.id}"%`)
      .map((p) => {
        const ownerIds = JSON.parse(p.ownerIds || "[]");
        const tenants = db
          .prepare(
            "SELECT id, name, surname, contractStart, contractEnd, propertyId, ownerId FROM tenants WHERE propertyId = ?",
          )
          .all(p.id);
        return {
          id: p.id,
          plot: p.plot,
          communityId: p.communityId,
          communityName: p.communityName,
          ownerCount: ownerIds.length,
          isSoleOwner: ownerIds.length === 1,
          tenants: tenants.map((t) => ({
            id: t.id,
            name: `${t.name} ${t.surname}`,
            contractActive: isActiveContract(t),
            ownerId: t.ownerId,
          })),
          hasActiveTenants: tenants.some(isActiveContract),
        };
      });

    const communityIds = new Set(
      linkedProperties.map((p) => p.communityId).filter(Boolean),
    );
    const otherCommunities = [];
    for (const communityId of communityIds) {
      const community = db
        .prepare("SELECT id, name FROM communities WHERE id = ?")
        .get(communityId);
      if (community) {
        otherCommunities.push({
          communityId: community.id,
          communityName: community.name,
          propertyCount: linkedProperties.filter(
            (p) => p.communityId === community.id,
          ).length,
        });
      }
    }

    let feeReceiptsCount = 0;
    let feeReceiptsSample = [];
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get()) {
      const receipts = db
        .prepare("SELECT id, period, amount, snapshot FROM fee_receipts")
        .all();
      const afectados = receipts.filter((r) => {
        try {
          const snapshot = JSON.parse(r.snapshot || "{}");
          return (
            Array.isArray(snapshot.owners) &&
            snapshot.owners.some((o) => o.id === owner.id)
          );
        } catch {
          return false;
        }
      });
      feeReceiptsCount = afectados.length;
      feeReceiptsSample = afectados.slice(0, 5).map((r) => ({
        id: r.id,
        period: r.period,
        amount: r.amount,
      }));
    }

    let feePaymentsCount = 0;
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_payments'").get()) {
      feePaymentsCount = db
        .prepare("SELECT COUNT(*) n FROM fee_payments WHERE ownerId = ?")
        .get(owner.id).n;
    }

    let notificationsCount = 0;
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='owner_notifications'").get()) {
      notificationsCount = db
        .prepare("SELECT COUNT(*) n FROM owner_notifications WHERE ownerId = ?")
        .get(owner.id).n;
    }
    let adminEmailsCount = 0;
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='admin_emails'").get()) {
      adminEmailsCount = db
        .prepare("SELECT COUNT(*) n FROM admin_emails WHERE ownerId = ?")
        .get(owner.id).n;
    }

    let documentsCount = 0;
    try {
      documentsCount = Object.keys(JSON.parse(owner.documents || "{}")).length;
    } catch {
      documentsCount = 0;
    }

    res.json({
      owner: {
        id: owner.id,
        name: `${owner.name} ${owner.surname}`,
        dni: owner.dni,
        communityId: owner.communityId,
        userId: owner.userId,
      },
      dependencies: {
        properties: linkedProperties,
        feeReceiptsCount,
        feeReceiptsSample,
        feePaymentsCount,
        notificationsCount,
        adminEmailsCount,
        documentsCount,
        otherCommunities,
        hasOtherCommunities: otherCommunities.length > 0,
      },
      availableActions: {
        properties: ["reassign_owner", "orphan", "delete_property"],
        tenants: ["reassign_tenant", "remove_tenant", "orphan_tenant"],
        fee_receipts: ["keep_historical", "liquidate_final"],
        fee_payments: ["keep_historical"],
        notifications: ["delete", "keep"],
        documents: ["delete", "keep"],
        user: ["unlink", "delete_user"],
      },
    });
  },
);

router.delete(
  "/:id",
  (req, res, next) => {
    if (req.query.cascade === "true") {
      return requireCascadeDelete(req, res, next);
    }
    next();
  },
  (req, res) => {
    if (req.query.cascade !== "true") {
      return deleteOwnerNormal(req, res);
    }
    return deleteOwnerCascade(req, res);
  },
);

function deleteOwnerNormal(req, res) {
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get() &&
    (db
      .prepare("SELECT snapshot FROM fee_receipts")
      .all()
      .some((r) => JSON.parse(r.snapshot).owners.some((o) => o.id === req.params.id)) ||
      db.prepare("SELECT 1 FROM fee_payments WHERE ownerId=?").get(req.params.id))
  )
    return res
      .status(409)
      .json({ error: "No se puede eliminar un propietario con historial de cuotas o cobros." });
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
  const vinculados = db
    .prepare("SELECT id, ownerIds FROM properties WHERE ownerIds LIKE ?")
    .all(`%"${existing.id}"%`);
  db.exec("BEGIN");
  try {
    // Referencias antiguas: si un inquilino sigue apuntando a este propietario
    // pero ya no está en un inmueble suyo, se reasigna a otro copropietario o
    // se deja sin titular. Así una desvinculación previa no bloquea el borrado.
    const updateTenantOwner = db.prepare("UPDATE tenants SET ownerId = ? WHERE id = ?");
    for (const tenant of db
      .prepare("SELECT id, propertyId FROM tenants WHERE ownerId = ?")
      .all(existing.id)) {
      const property = db
        .prepare("SELECT ownerIds FROM properties WHERE id = ?")
        .get(tenant.propertyId);
      const restantes = property
        ? JSON.parse(property.ownerIds || "[]").filter((id) => id !== existing.id)
        : [];
      updateTenantOwner.run(restantes[0] || "", tenant.id);
    }
    const update = db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?");
    for (const p of vinculados) {
      const restantes = JSON.parse(p.ownerIds || "[]").filter((id) => id !== existing.id);
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
}

function deleteOwnerCascade(req, res) {
  const owner = findOwner(req.params.id);
  if (!owner) return res.status(404).json({ error: "Propietario no encontrado." });

  const body = req.body || {};
  const actions = body.actions || {};
  const confirmGlobal = body.confirmGlobalDelete === true;

  // F06: si el propietario tiene propiedades en múltiples comunidades,
  // exigir confirmación explícita de borrado global.
  const ownerCommunityIds = new Set();
  const allProperties = db
    .prepare("SELECT id, communityId FROM properties WHERE ownerIds LIKE ?")
    .all(`%"${owner.id}"%`);
  for (const p of allProperties) {
    if (p.communityId) ownerCommunityIds.add(p.communityId);
  }
  if (ownerCommunityIds.size > 1 && !confirmGlobal) {
    return res.status(409).json({
      error:
        "Este propietario tiene inmuebles en varias comunidades. Confirma el borrado global en todas ellas.",
      otherCommunities: Array.from(ownerCommunityIds),
    });
  }

  db.exec("BEGIN");
  try {
    // --- Acciones sobre propiedades vinculadas ---
    const propertyActions = actions.properties || {};
    const vinculados = db
      .prepare("SELECT id, ownerIds FROM properties WHERE ownerIds LIKE ?")
      .all(`%\"${owner.id}\"%`);

    for (const p of vinculados) {
      const action = propertyActions[p.id] || { action: "orphan" };
      const ownerIds = JSON.parse(p.ownerIds || "[]");
      const restantes = ownerIds.filter((id) => id !== owner.id);

      if (action.action === "reassign_owner") {
        if (!action.newOwnerId)
          throw new Error(`Falta newOwnerId para reasignar propiedad ${p.id}`);
        const target = db
          .prepare("SELECT id FROM owners WHERE id = ?")
          .get(action.newOwnerId);
        if (!target)
          throw new Error(`El propietario destino ${action.newOwnerId} no existe`);
        db.prepare(
          "UPDATE properties SET ownerIds = ? WHERE id = ?",
        ).run(JSON.stringify([...restantes, action.newOwnerId]), p.id);
      } else if (action.action === "delete_property") {
        const inquilinos = db
          .prepare("SELECT COUNT(*) n FROM tenants WHERE propertyId = ?")
          .get(p.id).n;
        if (inquilinos > 0) {
          throw new Error(
            `No se puede borrar la propiedad ${p.plot}: tiene inquilinos asociados.`,
          );
        }
        db.prepare("DELETE FROM properties WHERE id = ?").run(p.id);
      } else {
        // orphan: quitar del ownerIds
        db.prepare("UPDATE properties SET ownerIds = ? WHERE id = ?").run(
          JSON.stringify(restantes),
          p.id,
        );
      }
    }

    // --- Acciones sobre inquilinos vinculados a este propietario ---
    const tenantActions = actions.tenants || {};
    const tenantOwnerRefs = db
      .prepare("SELECT id, propertyId, ownerId FROM tenants WHERE ownerId = ?")
      .all(owner.id);
    for (const t of tenantOwnerRefs) {
      const action = tenantActions[t.id] || { action: "orphan_tenant" };
      if (action.action === "reassign_tenant") {
        if (!action.newPropertyId)
          throw new Error(`Falta newPropertyId para reasignar inquilino ${t.id}`);
        db.prepare(
          "UPDATE tenants SET propertyId = ?, ownerId = '' WHERE id = ?",
        ).run(action.newPropertyId, t.id);
      } else if (action.action === "remove_tenant") {
        db.prepare("DELETE FROM tenants WHERE id = ?").run(t.id);
      } else {
        db.prepare("UPDATE tenants SET ownerId = '' WHERE id = ?").run(t.id);
      }
    }

    // Inquilinos en propiedades vinculadas que tengan ownerId directo
    for (const p of vinculados) {
      const tenantsInProperty = db
        .prepare("SELECT id FROM tenants WHERE propertyId = ? AND ownerId = ?")
        .all(p.id, owner.id);
      for (const t of tenantsInProperty) {
        const action = tenantActions[t.id] || { action: "orphan_tenant" };
        if (action.action === "reassign_tenant") {
          if (!action.newPropertyId)
            throw new Error(`Falta newPropertyId para reasignar inquilino ${t.id}`);
          db.prepare(
            "UPDATE tenants SET propertyId = ?, ownerId = '' WHERE id = ?",
          ).run(action.newPropertyId, t.id);
        } else if (action.action === "remove_tenant") {
          db.prepare("DELETE FROM tenants WHERE id = ?").run(t.id);
        } else {
          db.prepare("UPDATE tenants SET ownerId = '' WHERE id = ?").run(t.id);
        }
      }
    }

    rebuildOwnersPropertyIds();

    // --- fee_receipts: nunca borrar, solo keep_historical o liquidate_final ---
    const feeReceiptsAction = actions.fee_receipts || "keep_historical";
    if (feeReceiptsAction === "liquidate_final") {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get()) {
        const receipts = db
          .prepare("SELECT id FROM fee_receipts WHERE cancelledAt = ''")
          .all();
        const now = new Date().toISOString();
        for (const r of receipts) {
          try {
            const snapshot = JSON.parse(
              db
                .prepare("SELECT snapshot FROM fee_receipts WHERE id = ?")
                .get(r.id).snapshot,
            );
            if (
              Array.isArray(snapshot.owners) &&
              snapshot.owners.some((o) => o.id === owner.id)
            ) {
              db.prepare(
                "UPDATE fee_receipts SET cancelledAt = ?, cancellationReason = 'liquidacion_final_cascade_delete' WHERE id = ?",
              ).run(now, r.id);
            }
          } catch {
            // ignorar receipts sin snapshot parseable
          }
        }
      }
    }
    // keep_historical: no tocar

    // --- fee_payments: nunca borrar (keep_historical por defecto) ---

    // --- Notificaciones ---
    const notificationsAction = actions.notifications || "delete";
    if (notificationsAction === "delete") {
      db.prepare("DELETE FROM owner_notifications WHERE ownerId = ?").run(
        owner.id,
      );
      db.prepare("DELETE FROM admin_emails WHERE ownerId = ?").run(owner.id);
    }

    // --- Documentos del expediente ---
    const documentsAction = actions.documents || "delete";
    if (documentsAction === "delete") {
      db.prepare("UPDATE owners SET documents = '{}' WHERE id = ?").run(
        owner.id,
      );
    }

    // --- Usuario vinculado ---
    const userAction = actions.user || "unlink";
    if (userAction === "unlink") {
      db.prepare("UPDATE owners SET userId = '' WHERE id = ?").run(owner.id);
    } else if (userAction === "delete_user") {
      const otherOwners = db
        .prepare("SELECT COUNT(*) n FROM owners WHERE userId = ?")
        .get(owner.userId).n;
      if (otherOwners > 0) {
        throw new Error(
          "No se puede borrar el usuario: tiene otros perfiles de propietario asociados.",
        );
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(owner.userId);
    }

    // --- Borrar el propietario ---
    db.prepare("DELETE FROM owners WHERE id = ?").run(owner.id);
    db.exec("COMMIT");

    // Auditoría
    recordAudit({
      actor: req.user,
      action: "owners.cascade-deleted",
      resourceType: "owner",
      resourceId: owner.id,
      outcome: "success",
      req,
      details: {
        name: owner.name,
        dni: owner.dni,
        communities: Array.from(ownerCommunityIds),
        actions,
      },
    });

    res.json({
      ok: true,
      message: "Propietario eliminado con acciones en cascada aplicadas.",
      ownerId: owner.id,
    });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export default router;
