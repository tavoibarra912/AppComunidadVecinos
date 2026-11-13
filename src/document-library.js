import crypto from "node:crypto";
import path from "node:path";
import {
  db,
  documentFolderFromRow,
  documentFromRow,
  listDocumentFolders,
} from "./db.js";

export const DOCUMENT_CATEGORIES = Object.freeze(["document", "statutes"]);
export const DOCUMENT_ENTITY_TABLES = Object.freeze({
  community: "communities",
  property: "properties",
  tenant: "tenants",
});
export const MAX_FOLDER_DEPTH = 5;

export function normalizeEntityType(value) {
  const entityType = String(value || "").trim().toLowerCase();
  return DOCUMENT_ENTITY_TABLES[entityType] ? entityType : "";
}

export function normalizeCategory(value) {
  const category = String(value || "document").trim().toLowerCase();
  return DOCUMENT_CATEGORIES.includes(category) ? category : "";
}

export function entityExists(entityType, entityId) {
  const table = DOCUMENT_ENTITY_TABLES[entityType];
  return !!(
    table &&
    typeof entityId === "string" &&
    entityId &&
    db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(entityId)
  );
}

/** Clave de comparación: minúsculas y sin acentos, para evitar duplicados. */
export function normalizeNameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function sanitizeFolderName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "El nombre de la carpeta es obligatorio." };
  if ([...name].length > 120)
    return { error: "El nombre de la carpeta no puede superar los 120 caracteres." };
  if (name === "." || name === "..")
    return { error: "El nombre de la carpeta no es válido." };
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name))
    return {
      error: 'El nombre de la carpeta no puede contener \\ / : * ? " < > |.',
    };
  return { name };
}

export function sanitizeDocumentName(value, currentName) {
  let name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "El nombre del documento es obligatorio." };
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name))
    return {
      error: 'El nombre del documento no puede contener \\ / : * ? " < > |.',
    };
  const currentExtension = path.extname(currentName || "").toLowerCase();
  const nextExtension = path.extname(name).toLowerCase();
  if (currentExtension && !nextExtension) name += currentExtension;
  else if (currentExtension && nextExtension !== currentExtension)
    return {
      error: `El documento debe conservar la extensión ${currentExtension}.`,
    };
  if ([...name].length > 180)
    return { error: "El nombre del documento no puede superar los 180 caracteres." };
  return { name };
}

export function uploaderFromUser(user) {
  return {
    id: user?.id || "",
    name:
      `${user?.nombre || ""} ${user?.apellido || ""}`.trim() ||
      user?.usuario ||
      "Usuario",
  };
}

export function getFolder(entityType, entityId, folderId) {
  if (!folderId) return null;
  const row = db
    .prepare(
      "SELECT * FROM document_folders WHERE id = ? AND entityType = ? AND entityId = ?",
    )
    .get(folderId, entityType, entityId);
  return row ? documentFolderFromRow(row) : null;
}

export function getFolderRow(entityType, entityId, folderId) {
  if (!folderId) return null;
  return (
    db
      .prepare(
        "SELECT * FROM document_folders WHERE id = ? AND entityType = ? AND entityId = ?",
      )
      .get(folderId, entityType, entityId) || null
  );
}

export function listFolders(entityType, entityId) {
  return listDocumentFolders(entityType, entityId);
}

export function folderPath(entityType, entityId, folderId) {
  const pathRows = [];
  const visited = new Set();
  let current = getFolderRow(entityType, entityId, folderId);
  while (current) {
    if (visited.has(current.id))
      throw Object.assign(new Error("La jerarquía de carpetas no es válida."), {
        status: 400,
      });
    visited.add(current.id);
    pathRows.unshift(documentFolderFromRow(current));
    current = current.parentId
      ? getFolderRow(entityType, entityId, current.parentId)
      : null;
  }
  return pathRows;
}

export function folderDepth(entityType, entityId, folderId) {
  return folderPath(entityType, entityId, folderId).length;
}

function folderRowDepth(row) {
  return folderPath(row.entityType, row.entityId, row.id).length;
}

export function folderDescendantIds(entityType, entityId, folderId) {
  const all = listDocumentFolders(entityType, entityId);
  const descendants = [];
  let frontier = [folderId];
  const visited = new Set(frontier);
  while (frontier.length) {
    const next = [];
    for (const parentId of frontier) {
      for (const folder of all) {
        if (folder.parentId !== parentId || visited.has(folder.id)) continue;
        visited.add(folder.id);
        next.push(folder.id);
        descendants.push(folder.id);
      }
    }
    frontier = next;
  }
  return descendants;
}

export function folderSubtreeHeight(entityType, entityId, folderId) {
  const all = listDocumentFolders(entityType, entityId);
  let height = 0;
  let frontier = [folderId];
  while (frontier.length) {
    height += 1;
    const next = [];
    for (const parentId of frontier) {
      for (const folder of all) {
        if (folder.parentId === parentId) next.push(folder.id);
      }
    }
    frontier = next;
  }
  return height;
}

function documentRowsInFolder(entityType, entityId, folderId, category = "") {
  return category
    ? db
        .prepare(
          "SELECT * FROM documents WHERE entityType = ? AND entityId = ? AND folderId = ? AND category = ?",
        )
        .all(entityType, entityId, folderId, category)
    : db
        .prepare(
          "SELECT * FROM documents WHERE entityType = ? AND entityId = ? AND folderId = ?",
        )
        .all(entityType, entityId, folderId);
}

export function findNameConflict({
  entityType,
  entityId,
  folderId = "",
  nameKey,
  category = "document",
  excludeDocumentId = "",
  excludeFolderId = "",
}) {
  const documents = documentRowsInFolder(
    entityType,
    entityId,
    folderId,
    category,
  );
  if (
    documents.some(
      (row) =>
        row.id !== excludeDocumentId &&
        normalizeNameKey(row.fileName) === nameKey,
    )
  )
    return "Ya existe un documento con ese nombre en esta carpeta.";
  if (category === "document") {
    const folder = db
      .prepare(
        "SELECT id FROM document_folders WHERE entityType = ? AND entityId = ? AND parentId = ? AND nameKey = ? AND id <> ?",
      )
      .get(entityType, entityId, folderId, nameKey, excludeFolderId);
    if (folder) return "Ya existe una carpeta con ese nombre en esta ubicación.";
  }
  return "";
}

export function createFolder({
  entityType,
  entityId,
  parentId = "",
  name,
  user,
}) {
  const sanitized = sanitizeFolderName(name);
  if (sanitized.error)
    throw Object.assign(new Error(sanitized.error), { status: 400 });
  const parent = parentId
    ? getFolderRow(entityType, entityId, parentId)
    : null;
  if (parentId && !parent)
    throw Object.assign(new Error("La carpeta de destino no existe."), {
      status: 400,
    });
  const depth = parent ? folderRowDepth(parent) + 1 : 1;
  if (depth > MAX_FOLDER_DEPTH)
    throw Object.assign(
      new Error(`La estructura admite un máximo de ${MAX_FOLDER_DEPTH} niveles de carpetas.`),
      { status: 400 },
    );
  const nameKey = normalizeNameKey(sanitized.name);
  const conflict = findNameConflict({
    entityType,
    entityId,
    folderId: parentId,
    nameKey,
    category: "document",
  });
  if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
  const userInfo = uploaderFromUser(user);
  const row = {
    id: crypto.randomUUID(),
    entityType,
    entityId,
    parentId,
    name: sanitized.name,
    nameKey,
    createdAt: new Date().toISOString(),
    createdBy: userInfo.id,
    createdByName: userInfo.name,
  };
  try {
    db.prepare(
      "INSERT INTO document_folders (id,entityType,entityId,parentId,name,nameKey,createdAt,createdBy,createdByName) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      row.id,
      row.entityType,
      row.entityId,
      row.parentId,
      row.name,
      row.nameKey,
      row.createdAt,
      row.createdBy,
      row.createdByName,
    );
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE"))
      throw Object.assign(
        new Error("Ya existe una carpeta con ese nombre en esta ubicación."),
        { status: 409 },
      );
    throw error;
  }
  return documentFolderFromRow(row);
}

export function updateFolder({
  entityType,
  entityId,
  folderId,
  name,
  parentId,
  user,
}) {
  const current = getFolderRow(entityType, entityId, folderId);
  if (!current)
    throw Object.assign(new Error("Carpeta no encontrada."), { status: 404 });
  let nextName = current.name;
  if (name !== undefined) {
    const sanitized = sanitizeFolderName(name);
    if (sanitized.error)
      throw Object.assign(new Error(sanitized.error), { status: 400 });
    nextName = sanitized.name;
  }
  if (parentId !== undefined) {
    const nextParentId = String(parentId || "");
    if (nextParentId === current.id)
      throw Object.assign(
        new Error("No podés mover una carpeta dentro de sí misma."),
        { status: 400 },
      );
    if (
      nextParentId &&
      folderDescendantIds(entityType, entityId, current.id).includes(
        nextParentId,
      )
    )
      throw Object.assign(
        new Error("No podés mover una carpeta dentro de una subcarpeta suya."),
        { status: 400 },
      );
    const parent = nextParentId
      ? getFolderRow(entityType, entityId, nextParentId)
      : null;
    if (nextParentId && !parent)
      throw Object.assign(new Error("La carpeta de destino no existe."), {
        status: 400,
      });
    const targetDepth = parent ? folderRowDepth(parent) + 1 : 1;
    const height = folderSubtreeHeight(entityType, entityId, current.id);
    if (targetDepth + height - 1 > MAX_FOLDER_DEPTH)
      throw Object.assign(
        new Error(`La estructura admite un máximo de ${MAX_FOLDER_DEPTH} niveles de carpetas.`),
        { status: 400 },
      );
  }
  const nextParentId =
    parentId === undefined ? current.parentId : String(parentId || "");
  const nameKey = normalizeNameKey(nextName);
  const conflict = findNameConflict({
    entityType,
    entityId,
    folderId: nextParentId,
    nameKey,
    category: "document",
    excludeFolderId: current.id,
  });
  if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
  try {
    db.prepare(
      "UPDATE document_folders SET parentId = ?, name = ?, nameKey = ? WHERE id = ?",
    ).run(nextParentId, nextName, nameKey, current.id);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE"))
      throw Object.assign(
        new Error("Ya existe una carpeta con ese nombre en esta ubicación."),
        { status: 409 },
      );
    throw error;
  }
  return documentFolderFromRow(
    db.prepare("SELECT * FROM document_folders WHERE id = ?").get(current.id),
  );
}

export function deleteFolderCascade({ entityType, entityId, folderId }) {
  const current = getFolderRow(entityType, entityId, folderId);
  if (!current)
    throw Object.assign(new Error("Carpeta no encontrada."), { status: 404 });
  const folderIds = [
    current.id,
    ...folderDescendantIds(entityType, entityId, current.id),
  ];
  const placeholders = folderIds.map(() => "?").join(",");
  const documents = db
    .prepare(
      `SELECT * FROM documents WHERE entityType = ? AND entityId = ? AND folderId IN (${placeholders})`,
    )
    .all(entityType, entityId, ...folderIds);
  db.exec("BEGIN");
  try {
    db.prepare(
      `DELETE FROM documents WHERE entityType = ? AND entityId = ? AND folderId IN (${placeholders})`,
    ).run(entityType, entityId, ...folderIds);
    db.prepare(
      `DELETE FROM document_folders WHERE entityType = ? AND entityId = ? AND id IN (${folderIds.map(() => "?").join(",")})`,
    ).run(entityType, entityId, ...folderIds);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    deletedFolders: folderIds.length,
    deletedDocuments: documents.length,
    storedNames: documents.map((row) => row.storedName).filter(Boolean),
  };
}

export function moveDocumentToFolder({
  entityType,
  entityId,
  documentId,
  folderId,
}) {
  const document = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND entityType = ? AND entityId = ?",
    )
    .get(documentId, entityType, entityId);
  if (!document)
    throw Object.assign(new Error("Documento no encontrado."), { status: 404 });
  if (document.category === "statutes" && folderId)
    throw Object.assign(
      new Error("Los estatutos no se organizan en carpetas."),
      { status: 400 },
    );
  if (folderId && !getFolderRow(entityType, entityId, folderId))
    throw Object.assign(new Error("La carpeta de destino no existe."), {
      status: 400,
    });
  const nameKey = normalizeNameKey(document.fileName);
  const conflict = findNameConflict({
    entityType,
    entityId,
    folderId: folderId || "",
    nameKey,
    category: document.category,
    excludeDocumentId: document.id,
  });
  if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
  db.prepare("UPDATE documents SET folderId = ? WHERE id = ?").run(
    folderId || "",
    document.id,
  );
  return documentFromRow(
    db.prepare("SELECT * FROM documents WHERE id = ?").get(document.id),
  );
}

export function renameDocument({
  entityType,
  entityId,
  documentId,
  name,
}) {
  const document = db
    .prepare(
      "SELECT * FROM documents WHERE id = ? AND entityType = ? AND entityId = ?",
    )
    .get(documentId, entityType, entityId);
  if (!document)
    throw Object.assign(new Error("Documento no encontrado."), { status: 404 });
  const sanitized = sanitizeDocumentName(name, document.fileName);
  if (sanitized.error)
    throw Object.assign(new Error(sanitized.error), { status: 400 });
  const nameKey = normalizeNameKey(sanitized.name);
  const conflict = findNameConflict({
    entityType,
    entityId,
    folderId: document.folderId || "",
    nameKey,
    category: document.category,
    excludeDocumentId: document.id,
  });
  if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
  db.prepare("UPDATE documents SET fileName = ? WHERE id = ?").run(
    sanitized.name,
    document.id,
  );
  return documentFromRow(
    db.prepare("SELECT * FROM documents WHERE id = ?").get(document.id),
  );
}

export function folderNameConflictForDocumentTarget({
  entityType,
  entityId,
  folderId,
  fileName,
  category,
  excludeDocumentId = "",
}) {
  return findNameConflict({
    entityType,
    entityId,
    folderId,
    nameKey: normalizeNameKey(fileName),
    category,
    excludeDocumentId,
  });
}
