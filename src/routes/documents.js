import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  documentFromRow,
  documentFolderFromRow,
  UPLOADS_DIR,
  getSettings,
  listDocuments,
} from "../db.js";
import { allowed } from "../security.js";
import {
  DOCUMENT_ENTITY_TABLES,
  createFolder,
  deleteFolderCascade,
  entityExists,
  findNameConflict,
  folderDescendantIds,
  getFolderRow,
  listFolders,
  moveDocumentToFolder,
  normalizeCategory,
  normalizeEntityType,
  normalizeNameKey,
  renameDocument,
  updateFolder,
  uploaderFromUser,
} from "../document-library.js";

const router = Router();
const tables = DOCUMENT_ENTITY_TABLES;
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
const maxFiles = () =>
  Math.min(50, Math.max(1, Number(getSettings().documentosMaxArchivos) || 20));
const allowedExtensions = () =>
  new Set(
    getSettings().documentosTiposPermitidos.map(
      (tipo) => `.${String(tipo).toLowerCase()}`,
    ),
  );
const allowedLabels = () =>
  [...allowedExtensions()]
    .map((extension) => extension.slice(1).toUpperCase())
    .join(", ");
const upload = (req, res, done) =>
  multer({
    storage,
    limits: {
      fileSize: maxBytes(),
      files: maxFiles(),
      fields: 6,
      fieldSize: 2048,
    },
    fileFilter: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const ok = allowedExtensions().has(extension);
      cb(
        ok
          ? null
          : new Error(
              `Formato no permitido. Usa ${allowedLabels() || "PDF, JPG, JPEG, PNG, WebP, DOC o DOCX"}.`,
            ),
        ok,
      );
    },
  }).array("files", maxFiles())(req, res, done);
const uploadSingle = (req, res, done) =>
  multer({
    storage,
    limits: { fileSize: maxBytes(), files: 1, fields: 4, fieldSize: 2048 },
    fileFilter: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const ok = allowedExtensions().has(extension);
      cb(
        ok
          ? null
          : new Error(
              `Formato no permitido. Usá ${allowedLabels() || "PDF, JPG, JPEG, PNG, WebP, DOC o DOCX"}.`,
            ),
        ok,
      );
    },
  }).single("file")(req, res, done);
function removeFiles(files) {
  for (const file of files || [])
    try {
      fs.unlinkSync(file.path);
    } catch {}
}
function removeStoredFiles(storedNames) {
  for (const storedName of storedNames || []) {
    try {
      fs.unlinkSync(documentPath({ storedName }));
    } catch {}
  }
}
function contentType(file) {
  const fd = fs.openSync(file.path, "r");
  const head = Buffer.alloc(65536);
  let length = 0;
  try {
    length = fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sample = head.subarray(0, length);
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".pdf" && sample.subarray(0, 5).toString() === "%PDF-")
    return "application/pdf";
  if (
    [".jpg", ".jpeg"].includes(ext) &&
    sample[0] === 255 &&
    sample[1] === 216 &&
    sample[2] === 255
  )
    return "image/jpeg";
  if (
    ext === ".png" &&
    sample.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ext === ".webp" &&
    sample.subarray(0, 4).toString() === "RIFF" &&
    sample.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (
    ext === ".doc" &&
    sample
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  )
    return "application/msword";
  if (
    ext === ".docx" &&
    sample.subarray(0, 4).toString() === "PK\u0003\u0004" &&
    sample.includes("[Content_Types].xml")
  )
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
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
  db.prepare(
    "DELETE FROM document_folders WHERE entityType=? AND entityId=?",
  ).run(entityType, entityId);
}
function canRead(user, entityType, entityId) {
  return (
    !!tables[entityType] &&
    allowed(user, `${entityType}:read`, entityId) &&
    allowed(user, "document:read", entityId)
  );
}
function canWrite(user, entityType, entityId) {
  return !!tables[entityType] && allowed(user, `${entityType}:manage`, entityId);
}
function permissionFor(action) {
  return action === "delete" ? "document:delete" : "document:upload";
}
function deny(res, message = "No tenés permiso para esta operación.") {
  return res.status(403).json({ error: message });
}
function sendServiceError(res, error) {
  if (error?.status)
    return res.status(error.status).json({ error: error.message });
  throw error;
}
function targetFromBody(body) {
  const entityType = normalizeEntityType(body?.entityType);
  const entityId = String(body?.entityId || "");
  const category = normalizeCategory(body?.category);
  const folderId = String(body?.folderId || "");
  return { entityType, entityId, category, folderId };
}
function validateTarget(res, { entityType, entityId, category, folderId }) {
  if (!entityType || !entityId)
    return res.status(400).json({ error: "La entidad indicada no es válida." });
  if (!category)
    return res.status(400).json({ error: "La categoría documental no es válida." });
  if (category === "statutes" && entityType !== "community")
    return res
      .status(400)
      .json({ error: "Los estatutos solo están disponibles para comunidades." });
  if (!entityExists(entityType, entityId))
    return res.status(400).json({ error: "La entidad indicada no existe." });
  if (category === "statutes" && folderId)
    return res
      .status(400)
      .json({ error: "Los estatutos no se organizan en carpetas." });
  if (folderId && !getFolderRow(entityType, entityId, folderId))
    return res
      .status(400)
      .json({ error: "La carpeta de destino no existe." });
  return null;
}
function validateFiles(res, files) {
  if (
    !files.length ||
    files.some((f) => f.size > maxBytes()) ||
    files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024
  ) {
    removeFiles(files);
    res.status(400).json({
      error: `Adjuntá archivos de hasta ${maxBytes() / 1024 / 1024} MB y un máximo total de 50 MB.`,
    });
    return false;
  }
  return true;
}
function uploadRecord({
  entityType,
  entityId,
  category,
  folderId,
  file,
  fileType,
  user,
}) {
  const uploader = uploaderFromUser(user);
  const row = {
    id: crypto.randomUUID(),
    entityType,
    entityId,
    folderId,
    category,
    fileName: file.originalname,
    fileType,
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploader.id,
    uploadedByName: uploader.name,
    storedName: file.filename,
  };
  db.prepare(
    "INSERT INTO documents (id,entityType,entityId,folderId,category,fileName,fileType,fileSize,uploadedAt,uploadedBy,uploadedByName,storedName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    row.id,
    row.entityType,
    row.entityId,
    row.folderId,
    row.category,
    row.fileName,
    row.fileType,
    row.fileSize,
    row.uploadedAt,
    row.uploadedBy,
    row.uploadedByName,
    row.storedName,
  );
  return documentFromRow(row);
}

router.get("/", (req, res) => {
  const target = targetFromBody(req.query);
  const error = validateTarget(res, { ...target, folderId: "" });
  if (error) return error;
  if (!canRead(req.user, target.entityType, target.entityId))
    return deny(res, "No tenés acceso a la documentación de este registro.");
  res.json({
    documents: listDocuments(
      target.entityType,
      target.entityId,
      target.category,
    ),
    folders:
      target.category === "document"
        ? listFolders(target.entityType, target.entityId)
        : [],
  });
});

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
      const target = targetFromBody(req.body);
      const validation = validateTarget(res, target);
      if (validation) {
        removeFiles(files);
        return validation;
      }
      if (!canWrite(req.user, target.entityType, target.entityId)) {
        removeFiles(files);
        return deny(
          res,
          "No tienes permiso para adjuntar documentos a este registro.",
        );
      }
      if (
        !allowed(
          req.user,
          permissionFor("upload"),
          target.entityId,
        )
      ) {
        removeFiles(files);
        return deny(res, "No tienes permiso para subir documentos.");
      }
      if (!validateFiles(res, files)) return;
      const types = files.map(contentType);
      if (types.some((type) => !type)) {
        removeFiles(files);
        return res.status(400).json({
          error:
            "El contenido de un archivo no coincide con un PDF, una imagen o un documento de Word admitido.",
        });
      }
      const nameKeys = new Set();
      for (const file of files) {
        const nameKey = normalizeNameKey(file.originalname);
        if (nameKeys.has(nameKey)) {
          removeFiles(files);
          return res.status(409).json({
            error: "Hay dos archivos con el mismo nombre en la subida.",
          });
        }
        nameKeys.add(nameKey);
        const conflict = findNameConflict({
          entityType: target.entityType,
          entityId: target.entityId,
          folderId: target.folderId,
          nameKey,
          category: target.category,
        });
        if (conflict) {
          removeFiles(files);
          return res.status(409).json({ error: conflict });
        }
      }
      const records = [];
      db.exec("BEGIN");
      try {
        files.forEach((file, i) => {
          records.push(
            uploadRecord({
              ...target,
              file,
              fileType: types[i],
              user: req.user,
            }),
          );
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

router.post("/folders", (req, res, next) => {
  try {
    const target = targetFromBody(req.body);
    const validation = validateTarget(res, { ...target, folderId: "" });
    if (validation) return validation;
    if (target.category !== "document")
      return res
        .status(400)
        .json({ error: "Los estatutos no se organizan en carpetas." });
    if (!canWrite(req.user, target.entityType, target.entityId))
      return deny(res, "No tenés permiso para crear carpetas en este registro.");
    if (!allowed(req.user, permissionFor("upload"), target.entityId))
      return deny(res, "No tenés permiso para gestionar documentos.");
    const parentId = String(req.body?.parentId || "");
    if (parentId && !getFolderRow(target.entityType, target.entityId, parentId))
      return res
        .status(400)
        .json({ error: "La carpeta de destino no existe." });
    const folder = createFolder({
      entityType: target.entityType,
      entityId: target.entityId,
      parentId,
      name: req.body?.name,
      user: req.user,
    });
    res.status(201).json(folder);
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.patch("/folders/:id", (req, res, next) => {
  try {
    const row = db
      .prepare("SELECT * FROM document_folders WHERE id=?")
      .get(req.params.id);
    if (!row)
      return res.status(404).json({ error: "Carpeta no encontrada." });
    if (!canWrite(req.user, row.entityType, row.entityId))
      return deny(res, "No tenés permiso para editar carpetas en este registro.");
    if (!allowed(req.user, permissionFor("upload"), row.entityId))
      return deny(res, "No tenés permiso para gestionar documentos.");
    if (req.body?.name === undefined && req.body?.parentId === undefined)
      return res
        .status(400)
        .json({ error: "Indicá el nuevo nombre o la carpeta de destino." });
    const folder = updateFolder({
      entityType: row.entityType,
      entityId: row.entityId,
      folderId: row.id,
      name: req.body?.name,
      parentId:
        req.body?.parentId === undefined
          ? undefined
          : String(req.body.parentId || ""),
      user: req.user,
    });
    res.json(folder);
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.delete("/folders/:id", (req, res, next) => {
  try {
    const row = db
      .prepare("SELECT * FROM document_folders WHERE id=?")
      .get(req.params.id);
    if (!row)
      return res.status(404).json({ error: "Carpeta no encontrada." });
    if (!canWrite(req.user, row.entityType, row.entityId))
      return deny(
        res,
        "No tenés permiso para eliminar carpetas en este registro.",
      );
    if (!allowed(req.user, permissionFor("delete"), row.entityId))
      return deny(res, "No tenés permiso para eliminar documentos.");
    const folderIds = [
      row.id,
      ...folderDescendantIds(row.entityType, row.entityId, row.id),
    ];
    const placeholders = folderIds.map(() => "?").join(",");
    const documentCount = db
      .prepare(
        `SELECT COUNT(*) AS total FROM documents WHERE entityType=? AND entityId=? AND folderId IN (${placeholders})`,
      )
      .get(row.entityType, row.entityId, ...folderIds).total;
    const confirmed =
      req.query.confirm === "1" || req.body?.confirm === true;
    if (!confirmed)
      return res.status(409).json({
        error: "La carpeta contiene elementos. Confirmá el borrado en cascada.",
        requiresConfirmation: true,
        counts: { folders: folderIds.length, documents: documentCount },
      });
    const result = deleteFolderCascade({
      entityType: row.entityType,
      entityId: row.entityId,
      folderId: row.id,
    });
    removeStoredFiles(result.storedNames);
    res.json({
      ok: true,
      deletedFolders: result.deletedFolders,
      deletedDocuments: result.deletedDocuments,
    });
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.patch("/:id", (req, res, next) => {
  try {
    const row = db.prepare("SELECT * FROM documents WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Documento no encontrado." });
    if (!canWrite(req.user, row.entityType, row.entityId))
      return deny(
        res,
        "No tenés permiso para editar documentos de este registro.",
      );
    if (!allowed(req.user, permissionFor("upload"), row.entityId))
      return deny(res, "No tenés permiso para gestionar documentos.");
    if (req.body?.name === undefined && req.body?.folderId === undefined)
      return res
        .status(400)
        .json({ error: "Indicá el nuevo nombre o la carpeta de destino." });
    let document = documentFromRow(row);
    if (req.body?.name !== undefined)
      document = renameDocument({
        entityType: row.entityType,
        entityId: row.entityId,
        documentId: row.id,
        name: req.body.name,
      });
    if (req.body?.folderId !== undefined)
      document = moveDocumentToFolder({
        entityType: row.entityType,
        entityId: row.entityId,
        documentId: row.id,
        folderId: String(req.body.folderId || ""),
      });
    res.json(document);
  } catch (error) {
    sendServiceError(res, error);
  }
});

router.post("/:id/replace", (req, res, next) =>
  uploadSingle(req, res, (error) => {
    const file = req.file ? [req.file] : [];
    if (error) {
      removeFiles(file);
      return res.status(400).json({
        error:
          error instanceof multer.MulterError
            ? "La subida supera los límites permitidos."
            : error.message,
      });
    }
    try {
      const row = db
        .prepare("SELECT * FROM documents WHERE id=?")
        .get(req.params.id);
      if (!row) {
        removeFiles(file);
        return res.status(404).json({ error: "Documento no encontrado." });
      }
      if (!canWrite(req.user, row.entityType, row.entityId)) {
        removeFiles(file);
        return deny(
          res,
          "No tenés permiso para reemplazar documentos de este registro.",
        );
      }
      if (!allowed(req.user, permissionFor("upload"), row.entityId)) {
        removeFiles(file);
        return deny(res, "No tenés permiso para reemplazar documentos.");
      }
      if (!file.length || !validateFiles(res, file)) return;
      const fileType = contentType(file[0]);
      if (!fileType) {
        removeFiles(file);
        return res.status(400).json({
          error:
            "El contenido del archivo no coincide con un PDF, una imagen o un documento de Word admitido.",
        });
      }
      const conflict = findNameConflict({
        entityType: row.entityType,
        entityId: row.entityId,
        folderId: row.folderId || "",
        nameKey: normalizeNameKey(file[0].originalname),
        category: row.category || "document",
        excludeDocumentId: row.id,
      });
      if (conflict) {
        removeFiles(file);
        return res.status(409).json({ error: conflict });
      }
      const uploader = uploaderFromUser(req.user);
      db.prepare(
        "UPDATE documents SET fileName=?, fileType=?, fileSize=?, uploadedAt=?, uploadedBy=?, uploadedByName=?, storedName=? WHERE id=?",
      ).run(
        file[0].originalname,
        fileType,
        file[0].size,
        new Date().toISOString(),
        uploader.id,
        uploader.name,
        file[0].filename,
        row.id,
      );
      if (row.storedName && row.storedName !== file[0].filename)
        removeStoredFiles([row.storedName]);
      res.json(
        documentFromRow(
          db.prepare("SELECT * FROM documents WHERE id=?").get(row.id),
        ),
      );
    } catch (e) {
      removeFiles(file);
      next(e);
    }
  }),
);

router.delete("/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  if (!canWrite(req.user, row.entityType, row.entityId))
    return deny(
      res,
      "No tienes permiso para eliminar documentos de este registro.",
    );
  if (!allowed(req.user, permissionFor("delete"), row.entityId))
    return deny(res, "No tienes permiso para eliminar documentos.");
  removeStoredFiles([row.storedName]);
  db.prepare("DELETE FROM documents WHERE id=?").run(row.id);
  res.json({ ok: true });
});

router.get("/:id/download", (req, res) => {
  const row = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  if (!canRead(req.user, row.entityType, row.entityId))
    return deny(res, "No tienes acceso a este documento.");
  if (!fs.existsSync(documentPath(row)))
    return res.status(404).json({ error: "El archivo no está disponible." });
  res.download(documentPath(row), row.fileName);
});

router.get("/:id/preview", (req, res) => {
  const row = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Documento no encontrado." });
  if (!canRead(req.user, row.entityType, row.entityId))
    return deny(res, "No tenés acceso a este documento.");
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      row.fileType,
    )
  )
    return res
      .status(415)
      .json({ error: "Este formato no admite vista previa. Descargalo para abrirlo." });
  if (!fs.existsSync(documentPath(row)))
    return res.status(404).json({ error: "El archivo no está disponible." });
  res.setHeader("Content-Type", row.fileType);
  res.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
  );
  res.sendFile(documentPath(row));
});

export default router;
