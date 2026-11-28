import crypto from "node:crypto";
import { db } from "./db.js";
import { normalizeCadastralReference } from "./cadastral-reference.js";

/**
 * Finca matriz de una o varias unidades. La derivamos siempre de la referencia
 * catastral: una misma referencia dentro de una comunidad es la misma parcela.
 */
export function findParcel(id) {
  return id ? db.prepare("SELECT * FROM parcels WHERE id = ?").get(id) || null : null;
}

export function findParcelByReference(communityId, cadastralRef) {
  const reference = normalizeCadastralReference(cadastralRef);
  if (!reference) return null;
  return (
    db
      .prepare("SELECT * FROM parcels WHERE communityId = ? AND cadastralRef = ?")
      .get(communityId || "", reference) || null
  );
}

export function findOrCreateParcel({ communityId = "", cadastralRef, name = "" } = {}) {
  const reference = normalizeCadastralReference(cadastralRef);
  if (!reference) return null;
  const existing = findParcelByReference(communityId, reference);
  if (existing) return existing;
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO parcels (id, communityId, cadastralRef, name) VALUES (?, ?, ?, ?)",
  ).run(id, communityId || "", reference, String(name || "").trim());
  return findParcel(id);
}

/** Referencia catastral ya usada por una parcela de otra comunidad. */
export function cadastralReferenceInOtherCommunity(communityId, cadastralRef, excludePropertyId = "") {
  const reference = normalizeCadastralReference(cadastralRef);
  if (!reference || !communityId) return null;
  const parcel = db
    .prepare(
      `SELECT id, name AS plot, communityId FROM parcels
       WHERE cadastralRef = ? AND communityId <> '' AND communityId <> ?
       ORDER BY id LIMIT 1`,
    )
    .get(reference, communityId);
  if (
    parcel &&
    db
      .prepare("SELECT 1 FROM properties WHERE parcelId = ? AND id <> ? LIMIT 1")
      .get(parcel.id, excludePropertyId)
  )
    return parcel;
  return (
    db
      .prepare(
        `SELECT id, plot, communityId FROM properties
         WHERE UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) = ?
           AND communityId <> '' AND communityId <> ? AND id <> ?
         ORDER BY id LIMIT 1`,
      )
      .get(reference, communityId, excludePropertyId) || null
  );
}

/**
 * Reconstruye las parcelas a partir de las referencias ya guardadas. Se usa
 * después de sembrar datos y en scripts locales; la migración de arranque hace
 * lo mismo para bases existentes.
 */
export function backfillParcels() {
  const rows = db
    .prepare("SELECT id, communityId, cadastralRef, parcelId FROM properties")
    .all();
  const parcelByKey = new Map();
  const update = db.prepare("UPDATE properties SET cadastralRef = ?, parcelId = ? WHERE id = ?");
  for (const row of rows) {
    const cadastralRef = normalizeCadastralReference(row.cadastralRef);
    if (!cadastralRef) {
      if (row.cadastralRef || row.parcelId) update.run("", "", row.id);
      continue;
    }
    const communityId = row.communityId || "";
    const key = `${communityId}\u0000${cadastralRef}`;
    let parcel = parcelByKey.get(key);
    if (!parcel) {
      parcel = findOrCreateParcel({ communityId, cadastralRef });
      parcelByKey.set(key, parcel);
    }
    update.run(cadastralRef, parcel.id, row.id);
  }
  cleanupOrphanParcels();
}

/** Elimina parcelas que se quedaron sin unidades tras un cambio o borrado. */
export function cleanupOrphanParcels() {
  db.prepare(
    `DELETE FROM parcels
     WHERE NOT EXISTS (SELECT 1 FROM properties WHERE properties.parcelId = parcels.id)`,
  ).run();
}
