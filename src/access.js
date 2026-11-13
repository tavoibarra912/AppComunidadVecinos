import { db } from "./db.js";
import { etiquetaPermiso } from "../public/js/permissions.js";
import { allowed, policyData, visibleData } from "./security.js";

const entities = {
  communities: "community",
  owners: "owner",
  properties: "property",
  tenants: "tenant",
};
const deny = (res, motivo) =>
  res
    .status(403)
    .json({
      error:
        motivo || "No tienes acceso a estos datos o a esta operación.",
    });

function safeDocuments(incoming, existing, approve) {
  const output = {};
  for (const [key, doc] of Object.entries(incoming || {})) {
    if (!doc || typeof doc !== "object") continue;
    const previous = existing?.[key];
    const sameFile =
      previous?.dataUrl === doc.dataUrl && previous?.fileName === doc.fileName;
    output[key] = {
      ...doc,
      adminApproval: approve
        ? doc.adminApproval
        : sameFile
          ? previous?.adminApproval
          : { status: "pending" },
    };
  }
  return output;
}

export function resourceAccess(req, res, next) {
  let parts;
  try {
    parts = req.path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return res.status(400).json({ error: "Ruta no válida." });
  }
  const [collection, id] = parts;
  const entity = entities[collection];
  if (!entity || parts.length > 2) return next();
  const data = policyData();
  const permits = (p, resource = "") => allowed(req.user, p, resource, data);
  const existing = id ? data[collection].find((row) => row.id === id) : null;
  if (id && !existing) return next(); // La ruta devuelve 404.
  if (["GET", "HEAD"].includes(req.method)) {
    const visible = visibleData(req.user)[collection];
    if (id && !visible.some((row) => row.id === id)) return deny(res);
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) return send(body);
      if (Array.isArray(body))
        return send(
          body
            .filter((row) => visible.some((v) => v.id === row.id))
            .map((row) =>
              collection === "owners" && !permits("owner:read", row.id)
                ? visible.find((v) => v.id === row.id)
                : row,
            ),
        );
      return send(
        collection === "owners" && !permits("owner:read", id)
          ? visible.find((v) => v.id === id)
          : body,
      );
    };
    return next();
  }
  const permission =
    req.method === "DELETE"
      ? `${entity}:delete`
      : req.method === "POST"
        ? `${entity}:create`
        : collection === "communities"
          ? "community:edit"
          : `${entity}:manage`;
  const ownEdit =
    collection === "owners" &&
    req.method === "PUT" &&
    permits("owner:edit", id);
  if (!permits(permission, id || req.body?.ownerId || "") && !ownEdit)
    return deny(
      res,
      `No tienes permiso para esta operación (requiere: ${etiquetaPermiso(permission)}).`,
    );
  if (req.method === "DELETE") return next();
  if (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
    return res.status(400).json({ error: "Los datos deben ser un objeto." });
  for (const field of [
    "name",
    "surname",
    "dni",
    "nif",
    "email",
    "phone",
    "address",
    "plot",
    "propertyType",
    "userId",
    "communityId",
    "ownerId",
    "propertyId",
    "contractStart",
    "contractEnd",
  ]) {
    if (req.body[field] !== undefined && typeof req.body[field] !== "string")
      return res
        .status(400)
        .json({ error: `El campo ${field} debe ser texto.` });
  }
  for (const field of ["ownerIds", "tenantIds", "propertyIds"]) {
    if (
      req.body[field] !== undefined &&
      (!Array.isArray(req.body[field]) ||
        req.body[field].length > 1000 ||
        req.body[field].some((id) => typeof id !== "string"))
    )
      return res.status(400).json({ error: `La lista ${field} no es válida.` });
  }
  if (
    ["owners", "tenants"].includes(collection) &&
    req.body.documents !== undefined &&
    (!req.body.documents ||
      typeof req.body.documents !== "object" ||
      Array.isArray(req.body.documents))
  )
    return res
      .status(400)
      .json({ error: "Los documentos deben ser un objeto." });
  if (
    req.body.userId &&
    !db.prepare("SELECT id FROM users WHERE id = ?").get(req.body.userId)
  )
    return res
      .status(400)
      .json({ error: "La cuenta de usuario indicada no existe." });
  if (
    req.method === "POST" &&
    req.body.id &&
    data[collection].some((row) => row.id === req.body.id)
  )
    return res
      .status(409)
      .json({ error: "Ya existe un registro con ese identificador." });

  if (ownEdit && !permits("owner:manage", id)) {
    const fields = [
      "name",
      "surname",
      "documentType",
      "dni",
      "phone",
      "otherPhone",
      "email",
      "address",
      "province",
      "city",
      "postalCode",
      "iban",
      "currency",
      "notes",
      "documents",
    ];
    req.body = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(req.body).filter(([key]) => fields.includes(key)),
      ),
    };
    delete req.body.propertyIds;
    delete req.body.propertyId;
  }
  if (["owners", "tenants"].includes(collection)) {
    if (
      Object.entries(req.body.documents || {}).some(
        ([key, doc]) =>
          doc?.adminApproval?.status === "approved" &&
          existing?.documents?.[key]?.adminApproval?.status !== "approved" &&
          !doc.dataUrl &&
          !doc.url,
      ) &&
      permits("document:approve", id || req.body.ownerId)
    )
      return res.status(400).json({
        error:
          "No se puede aprobar un documento sin archivo. Adjunta el documento real.",
      });
    if (
      Object.values(req.body.documents || {}).some(
        (doc) => doc?.isSample && doc.adminApproval?.status === "approved",
      )
    )
      return res.status(400).json({
        error:
          "Los documentos de ejemplo no se pueden aprobar. Adjunta el archivo real.",
      });
    if (
      req.body.userId !== undefined &&
      req.body.userId !== (existing?.userId || "") &&
      !permits("admin:users")
    )
      return deny(res);
    req.body.documents = safeDocuments(
      req.body.documents ?? existing?.documents,
      existing?.documents,
      permits("document:approve", id || req.body.ownerId),
    );
    for (const channel of ["phone", "email"]) {
      const unchanged = existing && req.body[channel] === existing[channel];
      req.body[`${channel}Verified`] =
        !!unchanged && !!existing[`${channel}Verified`];
      req.body[`${channel}VerifiedAt`] = unchanged
        ? existing[`${channel}VerifiedAt`]
        : "";
    }
  }
  if (req.body.communityId && !permits("community:read", req.body.communityId))
    return deny(res);
  for (const ownerId of req.body.ownerIds || [])
    if (!permits("owner:read", ownerId)) return deny(res);
  for (const propertyId of req.body.propertyIds ||
    (req.body.propertyId ? [req.body.propertyId] : [])) {
    if (!permits("property:read", propertyId)) return deny(res);
  }
  for (const tenantId of req.body.tenantIds || [])
    if (!permits("tenant:read", tenantId)) return deny(res);
  if (
    collection === "tenants" &&
    req.body.ownerId &&
    !permits("tenant:manage", req.body.ownerId)
  )
    return deny(res);
  next();
}

export function notificationAccess(req, res, next) {
  const adminInbox = req.path.startsWith("/admin-emails");
  const data = policyData();
  const permit = (p, id = "") => allowed(req.user, p, id, data);
  const canSee = (row) =>
    adminInbox
      ? permit("admin_notification:read") && permit("owner:read", row.ownerId)
      : permit("owner_notification:read", row.ownerId);
  if (req.method === "POST") {
    const ownerId = req.body?.ownerId;
    if (!ownerId || !data.owners.some((o) => o.id === ownerId))
      return res
        .status(400)
        .json({ error: "El propietario indicado no existe." });
    if (
      !(adminInbox
        ? permit("owner:documents:submit", ownerId) ||
          permit("owner:manage", ownerId)
        : permit("owner_notification:send", ownerId))
    )
      return deny(res);
    if (!adminInbox && !permit("document:approve", ownerId))
      req.body.type = "info";
  } else if (req.method === "PATCH") {
    const id = req.path.split("/")[2];
    if (id) {
      const row = db
        .prepare(
          `SELECT * FROM ${adminInbox ? "admin_emails" : "owner_notifications"} WHERE id = ?`,
        )
        .get(id);
      if (row && !canSee(row)) return deny(res);
    } else if (
      !req.body?.ownerId ||
      !permit("owner_notification:read", req.body.ownerId)
    )
      return deny(res);
  } else if (adminInbox && !permit("admin_notification:read")) return deny(res);
  const send = res.json.bind(res);
  res.json = (body) =>
    send(
      req.method === "GET" && Array.isArray(body) ? body.filter(canSee) : body,
    );
  next();
}
