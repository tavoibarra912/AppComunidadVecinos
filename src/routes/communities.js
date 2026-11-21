import { versionedUpdate } from "../entity-version.js";
import { Router } from "express";
import crypto from "node:crypto";
import { db, communityFromRow, listDocuments, hasCommunityFinancialActivity } from "../db.js";
import {
  contactError,
  bankAccountError,
  communityFinanceError,
  communityNifError,
  normalizeIdentityDocument,
} from "../validation.js";
import { removeEntityFiles } from "./documents.js";
import { sanitizeRichText } from "../rich-text.js";
import { entityRequiredError, trimEntityFields } from "../entity-validation.js";
import { validateBrand } from "../branding.js";
import { legalConfigFromValue, mergeLegalConfig, validateLegalConfig } from "../legal-config.js";
import { registerCascadeRoutes } from "../cascade-delete.js";

const router = Router();
registerCascadeRoutes(router, "communities");
function validateCommunityData(data) {
  if (data.currency !== undefined && typeof data.currency !== "string")
    return "La moneda debe ser texto.";
  if (data.currency !== undefined) {
    data.currency = data.currency.trim().toUpperCase();
    if (data.currency && !/^[A-Z]{3}$/.test(data.currency))
      return "La moneda debe ser un código ISO de tres letras (por ejemplo, EUR o USD).";
  }
  data.nif = normalizeIdentityDocument(data.nif);
  const error =
    contactError(data) ||
    bankAccountError(data) ||
    communityFinanceError(data) ||
    communityNifError(data.nif);
  if (error) return error;
  if (data.notes !== undefined) data.notes = sanitizeRichText(data.notes);
  if (data.logoDataUrl !== undefined) {
    const logo = data.logoDataUrl;
    const LOGO = /^data:image\/(png|jpeg|svg\+xml|webp);base64,/;
    if (logo !== "" && (typeof logo !== "string" || logo.length > 230_400 || !LOGO.test(logo)))
      return "El logo de la comunidad debe ser una imagen PNG, JPG, SVG o WebP de menos de 225 KB.";
    data.logoDataUrl = logo === "" ? "" : logo;
  }
  if (data.marca !== undefined) {
    const marcaError = validateBrand(data.marca);
    if (marcaError) return marcaError;
    data.marca =
      data.marca && typeof data.marca === "object" && !Array.isArray(data.marca) ? data.marca : {};
  }
  if (data.legalConfig !== undefined) {
    const legalError = validateLegalConfig(data.legalConfig);
    if (legalError) return legalError;
    data.legalConfig = legalConfigFromValue(data.legalConfig);
  }
  for (const key of ["constitutionYear", "reserveFund"])
    if (data[key] !== undefined) data[key] = String(data[key] ?? "").trim();
  if (data.adminUserId) {
    const account = db
      .prepare("SELECT rol FROM users WHERE id = ? AND activo = 1")
      .get(data.adminUserId);
    const role =
      account &&
      db
        .prepare("SELECT nombre, permisos FROM roles WHERE id = ? OR nombre = ?")
        .get(account.rol, account.rol);
    if (
      !role ||
      (role.nombre !== "super_admin" && !JSON.parse(role.permisos).includes("community:manage"))
    )
      return "La cuenta asignada debe tener permisos de administración de comunidades.";
  }
  return null;
}

function findCommunity(id) {
  const row = db.prepare("SELECT * FROM communities WHERE id = ?").get(id);
  return row ? communityFromRow(row) : null;
}

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM communities ORDER BY name").all().map(communityFromRow));
});

router.get("/:id", (req, res) => {
  const community = findCommunity(req.params.id);
  if (!community) return res.status(404).json({ error: "Comunidad no encontrada." });
  res.json({ ...community, documents: listDocuments("community", community.id) });
});

router.post("/", (req, res) => {
  const data = req.body || {};
  trimEntityFields("community", data);
  const errorObligatorio = entityRequiredError("community", data) || validateCommunityData(data);
  if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
  if (db.prepare("SELECT id FROM communities WHERE UPPER(nif) = UPPER(?)").get(data.nif)) {
    return res.status(409).json({ error: "Ya existe una comunidad con ese NIF." });
  }
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO communities (id, name, nif, phone, otherPhone, address, city, province, postalCode, email, iban, president, administrator, constitutionYear, reserveFund, notes, documents, currency, adminUserId, logoDataUrl, marca, legalConfig)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.name,
    data.nif,
    data.phone || "",
    data.otherPhone || "",
    data.address || "",
    data.city || "",
    data.province || "",
    data.postalCode || "",
    data.email || "",
    data.iban || "",
    data.president || "",
    data.administrator || "",
    data.constitutionYear || "",
    data.reserveFund || "",
    data.notes || "",
    JSON.stringify(Array.isArray(data.documents) ? data.documents : []),
    data.currency || "",
    data.adminUserId || "",
    data.logoDataUrl || "",
    data.marca ? JSON.stringify(data.marca) : "{}",
    JSON.stringify(legalConfigFromValue(data.legalConfig)),
  );
  res.status(201).json(findCommunity(id));
});

router.put(
  "/:id",
  versionedUpdate("communities", (req, res) => {
    const existing = findCommunity(req.params.id);
    if (!existing) return res.status(404).json({ error: "Comunidad no encontrada." });
    const data = { ...existing, ...req.body };
    if (req.body.legalConfig !== undefined) {
      // Se valida el parche recibido antes de normalizarlo: si no, un valor
      // desconocido se convertiría silenciosamente en el predeterminado.
      const legalError = validateLegalConfig(req.body.legalConfig);
      if (legalError) return res.status(400).json({ error: legalError });
      data.legalConfig = mergeLegalConfig(existing.legalConfig, req.body.legalConfig);
    }
    trimEntityFields("community", data);
    const errorObligatorio = entityRequiredError("community", data) || validateCommunityData(data);
    if (errorObligatorio) return res.status(400).json({ error: errorObligatorio });
    const previousCurrency = String(existing.currency || "EUR")
      .trim()
      .toUpperCase();
    const nextCurrency = data.currency || "EUR";
    if (
      nextCurrency !== "EUR" &&
      nextCurrency !== previousCurrency &&
      hasCommunityFinancialActivity(existing.id)
    )
      return res.status(409).json({
        code: "COMMUNITY_CURRENCY_LOCKED",
        error:
          "Esta comunidad tiene actividad financiera registrada en euros. No se puede cambiar a otra moneda. Los importes históricos no se convierten ni se reetiquetan.",
      });
    const nifOwner = db
      .prepare("SELECT id FROM communities WHERE UPPER(nif) = UPPER(?) AND id <> ?")
      .get(data.nif, existing.id);
    if (nifOwner) {
      return res.status(409).json({ error: "Ya existe otra comunidad con ese NIF." });
    }
    db.prepare(
      `UPDATE communities SET name = ?, nif = ?, phone = ?, otherPhone = ?, address = ?, city = ?,
       province = ?, postalCode = ?, email = ?, iban = ?, president = ?, administrator = ?,
       constitutionYear = ?, reserveFund = ?, notes = ?, documents = ?, currency = ?, adminUserId = ?, logoDataUrl = ?, marca = ?, legalConfig = ? WHERE id = ?`,
    ).run(
      data.name,
      data.nif,
      data.phone || "",
      data.otherPhone || "",
      data.address || "",
      data.city || "",
      data.province || "",
      data.postalCode || "",
      data.email || "",
      data.iban || "",
      data.president || "",
      data.administrator || "",
      data.constitutionYear || "",
      data.reserveFund || "",
      data.notes || "",
      JSON.stringify(Array.isArray(data.documents) ? data.documents : existing.documents),
      data.currency || "",
      data.adminUserId !== undefined ? data.adminUserId : existing.adminUserId || "",
      data.logoDataUrl !== undefined ? data.logoDataUrl : existing.logoDataUrl || "",
      data.marca !== undefined
        ? JSON.stringify({ ...(existing.marca || {}), ...data.marca })
        : JSON.stringify(existing.marca || {}),
      JSON.stringify(legalConfigFromValue(data.legalConfig ?? existing.legalConfig)),
      existing.id,
    );
    res.json(findCommunity(existing.id));
  }),
);

router.delete("/:id", deleteCommunityNormal);

function deleteCommunityNormal(req, res) {
  const feeTables = [
    "fee_plans",
    "fee_receipts",
    "fee_payments",
    "fee_assessments",
    "service_bills",
  ].filter((table) => db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table));
  if (
    feeTables.some((table) =>
      db.prepare(`SELECT 1 FROM ${table} WHERE communityId=? LIMIT 1`).get(req.params.id),
    )
  )
    return res.status(409).json({
      error:
        "No se puede eliminar una comunidad con historial de cuotas, derramas, servicios o cobros.",
    });
  const existing = findCommunity(req.params.id);
  if (!existing) return res.status(404).json({ error: "Comunidad no encontrada." });
  const properties = db
    .prepare("SELECT COUNT(*) AS total FROM properties WHERE communityId = ?")
    .get(existing.id).total;
  if (properties > 0) {
    return res
      .status(409)
      .json({ error: "No se puede eliminar una comunidad con inmuebles asociados." });
  }
  // Una asociación puede tener socios sin inmueble que solo existen por su
  // comunidad de censo; el borrado normal no debe dejar esas fichas huérfanas.
  const linkedOwners = db
    .prepare("SELECT COUNT(*) AS total FROM owners WHERE communityId = ?")
    .get(existing.id).total;
  if (linkedOwners > 0) {
    return res.status(409).json({
      error:
        "No se puede eliminar una comunidad con socios o titulares vinculados. Usa el borrado avanzado para desvincularlos.",
    });
  }
  removeEntityFiles("community", existing.id);
  db.prepare("DELETE FROM communities WHERE id = ?").run(existing.id);
  res.json({ ok: true });
}

export default router;
