import { Router } from "express";
import crypto from "node:crypto";
import { db, communityFromRow, listDocuments } from "../db.js";
import { contactError, communityFinanceError, communityNifError } from "../validation.js";
import { removeEntityFiles } from "./documents.js";

const router = Router();
router.use((req, res, next) => {
  if (["POST", "PUT"].includes(req.method)) {
    const data = req.body || {};
    data.nif = String(data.nif || "").trim().toUpperCase();
    const error = contactError(data) || communityFinanceError(data) || communityNifError(data.nif);
    if (error) return res.status(400).json({ error });
    for (const key of ["constitutionYear", "reserveFund"]) if (data[key] !== undefined) data[key] = String(data[key] ?? "").trim();
    if (data.adminUserId) {
      const account = db.prepare("SELECT rol FROM users WHERE id = ? AND activo = 1").get(data.adminUserId);
      const role = account && db.prepare("SELECT nombre, permisos FROM roles WHERE id = ? OR nombre = ?").get(account.rol, account.rol);
      if (!role || role.nombre !== "super_admin" && !JSON.parse(role.permisos).includes("community:manage")) return res.status(400).json({ error: "La cuenta asignada debe tener permisos de administración de comunidades." });
    }
  }
  next();
});

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
  if (!data.name || !data.nif) {
    return res.status(400).json({ error: "El nombre y el NIF de la comunidad son obligatorios." });
  }
  if (db.prepare("SELECT id FROM communities WHERE UPPER(nif) = UPPER(?)").get(data.nif)) {
    return res.status(409).json({ error: "Ya existe una comunidad con ese NIF." });
  }
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO communities (id, name, nif, phone, otherPhone, address, city, province, postalCode, email, iban, president, administrator, constitutionYear, reserveFund, notes, documents, currency, adminUserId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.name, data.nif, data.phone || "", data.otherPhone || "", data.address || "",
    data.city || "", data.province || "", data.postalCode || "", data.email || "",
    data.iban || "", data.president || "", data.administrator || "",
    data.constitutionYear || "", data.reserveFund || "", data.notes || "",
    JSON.stringify(Array.isArray(data.documents) ? data.documents : []),
    data.currency || "",
    data.adminUserId || ""
  );
  res.status(201).json(findCommunity(id));
});

router.put("/:id", (req, res) => {
  const existing = findCommunity(req.params.id);
  if (!existing) return res.status(404).json({ error: "Comunidad no encontrada." });
  const data = req.body || {};
  if (!data.name || !data.nif) {
    return res.status(400).json({ error: "El nombre y el NIF de la comunidad son obligatorios." });
  }
  const nifOwner = db.prepare("SELECT id FROM communities WHERE UPPER(nif) = UPPER(?) AND id <> ?").get(data.nif, existing.id);
  if (nifOwner) {
    return res.status(409).json({ error: "Ya existe otra comunidad con ese NIF." });
  }
  db.prepare(
    `UPDATE communities SET name = ?, nif = ?, phone = ?, otherPhone = ?, address = ?, city = ?,
       province = ?, postalCode = ?, email = ?, iban = ?, president = ?, administrator = ?,
       constitutionYear = ?, reserveFund = ?, notes = ?, documents = ?, currency = ?, adminUserId = ? WHERE id = ?`
  ).run(
    data.name, data.nif, data.phone || "", data.otherPhone || "", data.address || "",
    data.city || "", data.province || "", data.postalCode || "", data.email || "",
    data.iban || "", data.president || "", data.administrator || "",
    data.constitutionYear || "", data.reserveFund || "", data.notes || "",
    JSON.stringify(Array.isArray(data.documents) ? data.documents : existing.documents),
    data.currency || "",
    data.adminUserId !== undefined ? data.adminUserId : (existing.adminUserId || ""),
    existing.id
  );
  res.json(findCommunity(existing.id));
});

router.delete("/:id", (req, res) => {
  const existing = findCommunity(req.params.id);
  if (!existing) return res.status(404).json({ error: "Comunidad no encontrada." });
  const properties = db.prepare("SELECT COUNT(*) AS total FROM properties WHERE communityId = ?").get(existing.id).total;
  if (properties > 0) {
    return res.status(409).json({ error: "No se puede eliminar una comunidad con inmuebles asociados." });
  }
  removeEntityFiles("community", existing.id);
  db.prepare("DELETE FROM communities WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

export default router;
