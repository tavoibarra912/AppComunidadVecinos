import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, documentFromRow, UPLOADS_DIR, getSettings } from "../db.js";
import { allowed } from "../security.js";

const router = Router();
const tables = {
  community: "communities",
  property: "properties",
  tenant: "tenants",
};
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) =>
    cb(
      null,
      `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
    ),
});
const maxBytes = () =>
  Math.min(50, Math.max(1, Number(getSettings().documentosMaxSizeMb) || 15)) *
  1024 *
  1024;
const upload = (req, res, done) =>
  multer({
    storage,
    limits: { fileSize: maxBytes(), files: 20, fields: 2, fieldSize: 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = /\.(pdf|jpe?g|png|webp)$/i.test(file.originalname);
      cb(
        ok
          ? null
          : new Error("Formato no permitido. Usá PDF, JPG, PNG o WEBP."),
        ok,
      );
    },
  }).array("files", 20)(req, res, done);
function removeFiles(files) {
  for (const file of files || [])
    try {
      fs.unlinkSync(file.path);
    } catch {}
}
function contentType(file) {
  const fd = fs.openSync(file.path, "r");
  const head = Buffer.alloc(12);
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf" && head.subarray(0, 5).toString() === "%PDF-")
    return "application/pdf";
  if (
    [".jpg", ".jpeg"].includes(ext) &&
    head[0] === 255 &&
    head[1] === 216 &&
    head[2] === 255
  )
    return "image/jpeg";
  if (
    ext === ".png" &&
    head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ext === ".webp" &&
    head.subarray(0, 4).toString() === "RIFF" &&
    head.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
export function documentPath(row) {
  if (!row.storedName || path.basename(row.storedName) !== row.storedName)
    throw new Error("Ruta de documento no válida.");
  return path.join(UPLOADS_DIR, row.storedName);
}
export function removeEntityFiles(entityType, entityId) {
  for (const row of db
    .prepare("SELECT * FROM documents WHERE entityType=? AND entityId=?")
    .all(entityType, entityId)) {
    try {
      fs.unlinkSync(documentPath(row));
    } catch {}
  }
  db.prepare("DELETE FROM documents WHERE entityType=? AND entityId=?").run(
    entityType,
    entityId,
  );
}
function hasAccess(user, row, write = false) {
  const permission = write
    ? `${row.entityType}:manage`
    : `${row.entityType}:read`;
  return (
    !!tables[row.entityType] &&
    allowed(user, permission, row.entityId) &&
    (write || allowed(user, "document:read", row.entityId))
  );
}
router.post("/", (req, res, next) =>
  upload(req, res, (error) => {
    const files = req.files || [];
    if (error) {
      removeFiles(files);
      return res.status(400).json({
        error:
          error instanceof multer.MulterError
            ? "La subida supera los límites permitidos."
            : error.message,
      });
    }
    try {
      const { entityType, entityId } = req.body || {};
      const table = tables[entityType];
      if (
        !table ||
        typeof entityId !== "string" ||
        !db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(entityId)
      ) {
        removeFiles(files);
        return res
          .status(400)
          .json({ error: "La entidad indicada no existe." });
      }
      if (!hasAccess(req.user, { entityType, entityId }, true)) {
        removeFiles(files);
        return res.status(403).json({
          error: "No tenés permiso para adjuntar documentos a este registro.",
        });
      }
      if (
        !files.length ||
        files.some((f) => f.size > maxBytes()) ||
        files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024
      ) {
        removeFiles(files);
        return res.status(400).json({
          error: `Adjuntá archivos de hasta ${maxBytes() / 1024 / 1024} MB y un máximo total de 50 MB.`,
        });
      }
      const types = files.map(contentType);
      if (types.some((t) => !t)) {
        removeFiles(files);
        return res.status(400).json({
          error:
            "El contenido de un archivo no coincide con un PDF o una imagen admitida.",
        });
      }
      const records = [];
      db.exec("BEGIN");
      try {
        files.forEach((file, i) => {
          const row = {
            id: crypto.randomUUID(),
            entityType,
            entityId,
            fileName: file.originalname,
            fileType: types[i],
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
            storedName: file.filename,
          };
          db.prepare(
            "INSERT INTO documents (id,entityType,entityId,fileName,fileType,fileSize,uploadedAt,storedName) VALUES (?,?,?,?,?,?,?,?)",
          ).run(
            row.id,
            entityType,
            entityId,
            row.fileName,
            row.fileType,
            row.fileSize,
            row.uploadedAt,
            row.storedName,
          );
          records.push(documentFromRow(row));
        });
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      res.status(201).json(records);
    } catch (e) {
      removeFiles(files);
      next(e);
    }
  }),
);
router.delete("/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  if (!hasAccess(req.user, row, true))
    return res
      .status(403)
      .json({ error: "No tenés permiso para eliminar este documento." });
  try {
    fs.unlinkSync(documentPath(row));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  db.prepare("DELETE FROM documents WHERE id=?").run(row.id);
  res.json({ ok: true });
});
router.get("/:id/download", (req, res) => {
  const row = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  if (!hasAccess(req.user, row))
    return res.status(403).json({ error: "No tenés acceso a este documento." });
  if (!fs.existsSync(documentPath(row)))
    return res.status(404).json({ error: "El archivo no está disponible." });
  res.download(documentPath(row), row.fileName);
});
export default router;
