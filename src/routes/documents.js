import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, documentFromRow, UPLOADS_DIR } from "../db.js";

const router = Router();

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).replace(".", "").toLowerCase();
    const allowed = ALLOWED_MIME.includes(file.mimetype) || ["pdf", "jpg", "jpeg", "png", "webp"].includes(extension);
    cb(allowed ? null : new Error("Tipo de archivo no permitido (PDF, JPG, PNG o WEBP)."), allowed);
  }
});

function storedPath(row) {
  return path.join(UPLOADS_DIR, row.storedName);
}

router.post("/", upload.array("files", 20), (req, res) => {
  const entityType = req.body.entityType || "";
  const entityId = req.body.entityId || "";
  const allowedEntities = ["community", "property", "tenant"];
  if (!allowedEntities.includes(entityType) || !entityId) {
    return res.status(400).json({ error: "Indica entityType (community, property o tenant) y entityId." });
  }
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "No se recibió ningún archivo." });
  }
  const insert = db.prepare(
    `INSERT INTO documents (id, entityType, entityId, fileName, fileType, fileSize, uploadedAt, storedName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const records = files.map(file => {
    const id = crypto.randomUUID();
    insert.run(
      id, entityType, entityId, file.originalname,
      file.mimetype || "application/octet-stream", file.size,
      new Date().toISOString(), file.filename
    );
    return { id, storedName: file.filename, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size, uploadedAt: new Date().toISOString() };
  });
  res.status(201).json(records.map(record => documentFromRow({
    ...record,
    entityType,
    entityId
  })));
});

router.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  db.prepare("DELETE FROM documents WHERE id = ?").run(row.id);
  fs.unlink(storedPath(row), () => {});
  res.json({ ok: true });
});

router.get("/:id/download", (req, res) => {
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!row || !fs.existsSync(storedPath(row))) {
    return res.status(404).json({ error: "Documento no encontrado." });
  }
  res.download(storedPath(row), row.fileName);
});

export default router;
