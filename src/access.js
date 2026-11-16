import { db } from "./db.js";
import { etiquetaPermiso } from "../public/js/permissions.js";
import { allowed, policyData, visibleData } from "./security.js";
import {
  EMBEDDED_DOCUMENT_LIMITS,
  documentLimits,
  inspectEmbeddedDocument,
  totalEmbeddedBytes,
} from "./document-policy.js";

const entities = {
  communities: "community",
  owners: "owner",
  properties: "property",
  tenants: "tenant",
};
const deny = (res, motivo) =>
  res.status(403).json({
    error: motivo || "No tienes acceso a estos datos o a esta operación.",
  });

function safeDocuments(incoming, existing, approve) {
  const limits = documentLimits();
  const entries = Object.entries(incoming || {});
  if (entries.length > limits.maxFiles)
    return { error: `El expediente admite como máximo ${limits.maxFiles} documentos.` };
  const output = {};
  for (const [key, doc] of entries) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc))
      return { error: "Los documentos deben ser objetos válidos." };
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key))
      return { error: "El identificador de un documento no es válido." };
    const previous = existing?.[key];
    const sameFile = previous?.dataUrl === doc.dataUrl && previous?.fileName === doc.fileName;
    let normalized = doc;
    if (!sameFile) {
      const checked = inspectEmbeddedDocument(doc);
      if (checked.error) return { error: checked.error };
      normalized = checked.value;
    }
    output[key] = {
      ...normalized,
      adminApproval: approve
        ? normalized.adminApproval
        : sameFile
          ? previous?.adminApproval
          : { status: "pending" },
    };
  }
  if (totalEmbeddedBytes(output) > EMBEDDED_DOCUMENT_LIMITS.maxTotalBytes)
    return { error: "El expediente supera el límite total de 50 MB." };
  return { documents: output };
}

const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeVerificationValue(channel, value) {
  return channel === "phone"
    ? String(value || "").replace(/\D/g, "")
    : String(value || "")
        .trim()
        .toLowerCase();
}

/** Busca una verificación confirmada por esta cuenta para el contacto indicado. */
function findVerifiedChallenge(user, channel, value) {
  const destino = normalizeVerificationValue(channel, value);
  if (!user?.id || !destino) return null;
  const row = db
    .prepare(
      `SELECT id, confirmedAt FROM contact_verification_challenges
       WHERE userId=? AND tipo=? AND destino=? AND confirmed=1 AND consumedAt=0
         AND confirmedAt>=?
       ORDER BY confirmedAt DESC LIMIT 1`,
    )
    .get(user.id, channel, destino, Date.now() - VERIFICATION_WINDOW_MS);
  return row
    ? { id: row.id, verifiedAt: new Date(row.confirmedAt || Date.now()).toISOString() }
    : null;
}

function consumeVerification(id) {
  db.prepare(
    "UPDATE contact_verification_challenges SET consumedAt=? WHERE id=? AND consumedAt=0",
  ).run(Date.now(), id);
}

/**
 * Los expedientes embebidos en propietarios, inquilinos y demás entidades solo
 * se devuelven con `document:read`. El fallback sin recurso cubre entidades
 * recién creadas que todavía no están en la instantánea de la política.
 */
function hideDocuments(canReadDocuments, row, fallbackId = "") {
  if (!row || typeof row !== "object" || row.documents === undefined) return row;
  if (canReadDocuments(row.id || fallbackId)) return row;
  return {
    ...row,
    documents: Array.isArray(row.documents) ? [] : {},
  };
}

function hidePayloadDocuments(canReadDocuments, payload, fallbackId = "") {
  if (Array.isArray(payload))
    return payload.map((row) => hideDocuments(canReadDocuments, row, fallbackId));
  return hideDocuments(canReadDocuments, payload, fallbackId);
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
  const canReadDocuments = (entityId) =>
    permits("document:read", entityId || "") || permits("document:read");
  const pendingVerifications = [];
  if (["GET", "HEAD"].includes(req.method)) {
    const visible = visibleData(req.user, data)[collection];
    if (id && !visible.some((row) => row.id === id)) return deny(res);
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) return send(body);
      if (Array.isArray(body))
        return send(
          hidePayloadDocuments(
            canReadDocuments,
            body
              .filter((row) => visible.some((v) => v.id === row.id))
              .map((row) =>
                collection === "owners" && !permits("owner:read", row.id)
                  ? visible.find((v) => v.id === row.id)
                  : row,
              ),
            id,
          ),
        );
      return send(
        hidePayloadDocuments(
          canReadDocuments,
          collection === "owners" && !permits("owner:read", id)
            ? visible.find((v) => v.id === id)
            : body,
          id,
        ),
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
  const ownEdit = collection === "owners" && req.method === "PUT" && permits("owner:edit", id);
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
      return res.status(400).json({ error: `El campo ${field} debe ser texto.` });
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
    return res.status(400).json({ error: "Los documentos deben ser un objeto." });
  if (req.body.userId && !db.prepare("SELECT id FROM users WHERE id = ?").get(req.body.userId))
    return res.status(400).json({ error: "La cuenta de usuario indicada no existe." });
  if (
    req.method === "POST" &&
    req.body.id &&
    data[collection].some((row) => row.id === req.body.id)
  )
    return res.status(409).json({ error: "Ya existe un registro con ese identificador." });

  // El formulario del propietario envía los flags, pero el modo de edición
  // propia los filtra antes de llegar a la ruta: se conserva la intención para
  // poder canjearla por un reto confirmado en el servidor.
  const claimedVerifications = {
    phone: !!req.body.phoneVerified,
    email: !!req.body.emailVerified,
  };
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
      version: req.body.version,
      ...Object.fromEntries(Object.entries(req.body).filter(([key]) => fields.includes(key))),
    };
    delete req.body.propertyIds;
    delete req.body.propertyId;
  }
  // Aislamiento entre comunidades: un actor solo puede crear o quitar vínculos
  // de inmuebles que gestiona. Los vínculos actuales fuera de su ámbito se
  // conservan intactos aunque el formulario no los envíe.
  if (collection === "owners" && ["POST", "PUT"].includes(req.method)) {
    const requestedPropertyIds = Array.isArray(req.body.propertyIds)
      ? req.body.propertyIds
      : req.body.propertyId
        ? [req.body.propertyId]
        : [];
    if (req.method === "PUT" && existing) {
      const currentPropertyIds = Array.isArray(existing.propertyIds) ? existing.propertyIds : [];
      const preserved = currentPropertyIds.filter(
        (propertyId) =>
          !requestedPropertyIds.includes(propertyId) && !permits("property:manage", propertyId),
      );
      if (preserved.length) {
        req.preservedPropertyIds = new Set(preserved);
        req.body.propertyIds = [...new Set([...requestedPropertyIds, ...preserved])];
        delete req.body.propertyId;
      }
    }
    const previousPropertyIds = new Set(
      req.method === "PUT" && Array.isArray(existing?.propertyIds) ? existing.propertyIds : [],
    );
    for (const propertyId of req.body.propertyIds || []) {
      if (req.preservedPropertyIds?.has(propertyId)) continue;
      if (!previousPropertyIds.has(propertyId) && !permits("property:manage", propertyId))
        return deny(res, "No tienes permiso para vincular este inmueble al propietario.");
    }
  }
  if (["owners", "tenants"].includes(collection)) {
    // Sin document:read no se acepta sobrescribir el expediente con la copia
    // redactada que devolvió la API: se conservan los documentos existentes.
    if (!canReadDocuments(id || req.body.ownerId) && existing?.documents) {
      req.body.documents =
        req.body.documents &&
        typeof req.body.documents === "object" &&
        !Array.isArray(req.body.documents)
          ? { ...existing.documents, ...req.body.documents }
          : { ...existing.documents };
    }
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
        error: "No se puede aprobar un documento sin archivo. Adjunta el documento real.",
      });
    if (
      Object.values(req.body.documents || {}).some(
        (doc) => doc?.isSample && doc.adminApproval?.status === "approved",
      )
    )
      return res.status(400).json({
        error: "Los documentos de ejemplo no se pueden aprobar. Adjunta el archivo real.",
      });
    if (
      req.body.userId !== undefined &&
      req.body.userId !== (existing?.userId || "") &&
      !permits("admin:users")
    )
      return deny(res);
    const documents = safeDocuments(
      req.body.documents ?? existing?.documents,
      existing?.documents,
      permits("document:approve", id || req.body.ownerId),
    );
    if (documents.error) return res.status(400).json({ error: documents.error });
    req.body.documents = documents.documents;
    // La verificación de contactos solo la concede el servidor: se consume un
    // reto confirmado por esta cuenta para el contacto exacto. Los flags
    // enviados por el navegador nunca se aceptan por sí solos.
    for (const channel of ["phone", "email"]) {
      const current = normalizeVerificationValue(channel, existing?.[channel]);
      const incoming = normalizeVerificationValue(
        channel,
        req.body[channel] ?? existing?.[channel],
      );
      const unchanged = !!existing && incoming === current;
      const preserved = unchanged && !!existing[`${channel}Verified`];
      if (preserved) {
        req.body[`${channel}Verified`] = true;
        req.body[`${channel}VerifiedAt`] = existing[`${channel}VerifiedAt`] || "";
        continue;
      }
      const challenge = claimedVerifications[channel]
        ? findVerifiedChallenge(req.user, channel, incoming)
        : null;
      req.body[`${channel}Verified`] = !!challenge;
      req.body[`${channel}VerifiedAt`] = challenge?.verifiedAt || "";
      if (challenge) pendingVerifications.push(challenge.id);
    }
  }
  if (req.body.communityId && !permits("community:read", req.body.communityId)) return deny(res);
  for (const ownerId of req.body.ownerIds || [])
    if (!permits("owner:read", ownerId)) return deny(res);
  for (const propertyId of req.body.propertyIds ||
    (req.body.propertyId ? [req.body.propertyId] : [])) {
    if (req.preservedPropertyIds?.has(propertyId)) continue;
    if (!permits("property:read", propertyId)) return deny(res);
  }
  for (const tenantId of req.body.tenantIds || [])
    if (!permits("tenant:read", tenantId)) return deny(res);
  if (
    collection === "tenants" &&
    req.body.ownerId &&
    !permits(req.method === "POST" ? "tenant:create" : "tenant:manage", req.body.ownerId)
  )
    return deny(res);
  const send = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400)
      for (const challengeId of pendingVerifications) consumeVerification(challengeId);
    return send(
      hidePayloadDocuments(canReadDocuments, body, id || req.body.id || req.body.ownerId || ""),
    );
  };
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
      return res.status(400).json({ error: "El propietario indicado no existe." });
    if (
      !(adminInbox
        ? permit("owner:documents:submit", ownerId) || permit("owner:manage", ownerId)
        : permit("owner_notification:send", ownerId))
    )
      return deny(res);
    if (!adminInbox && !permit("document:approve", ownerId)) req.body.type = "info";
  } else if (req.method === "PATCH") {
    const id = req.path.split("/")[2];
    if (id) {
      const row = db
        .prepare(
          `SELECT * FROM ${adminInbox ? "admin_emails" : "owner_notifications"} WHERE id = ?`,
        )
        .get(id);
      if (row && !canSee(row)) return deny(res);
    } else if (!req.body?.ownerId || !permit("owner_notification:read", req.body.ownerId))
      return deny(res);
  } else if (adminInbox && !permit("admin_notification:read")) return deny(res);
  const send = res.json.bind(res);
  res.json = (body) =>
    send(req.method === "GET" && Array.isArray(body) ? body.filter(canSee) : body);
  next();
}
