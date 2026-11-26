// Baja de cuenta y derecho de supresión (RGPD, art. 17).
//
// La cuenta no se borra sola: el titular pide la baja desde «Mi perfil» y la
// administración la revisa. Ese paso existe porque el histórico económico
// (recibos, cobros, actas) tiene que conservarse y porque un perfil de
// propietario o inquilino no puede quedar huérfano.
import crypto from "node:crypto";
import { db } from "./db.js";
import { recordAudit } from "./audit.js";
import { purgeIssueReports } from "./issue-reports.js";

const ROLE_LABELS = {
  super_admin: "superadministrador",
  administrator: "administrador general",
};
const REASON_LIMIT = 500;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const shortText = (value) =>
  String(value ?? "")
    .trim()
    .slice(0, REASON_LIMIT);
// Mismo hash que usa la recuperación de contraseña para limitar solicitudes.
const emailHash = (email) =>
  crypto
    .createHash("sha256")
    .update(
      String(email || "")
        .trim()
        .toLowerCase(),
    )
    .digest("hex");

/** Perfiles de propietario o inquilino vinculados a una cuenta. */
function linkedProfiles(userId) {
  const parts = [];
  if (db.prepare("SELECT 1 FROM owners WHERE userId=? LIMIT 1").get(userId))
    parts.push("propietario");
  if (db.prepare("SELECT 1 FROM tenants WHERE userId=? LIMIT 1").get(userId))
    parts.push("inquilino");
  return parts;
}

// Plazo legal de respuesta a una solicitud de derechos (RGPD, art. 12.3): un
// mes desde la solicitud, prorrogable. Se calcula sobre el calendario, no como
// 30 días fijos.
function addMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

const REQUEST_COLUMNS = `r.id,r.userId,r.reason,r.state,r.requestedAt,r.resolvedAt,
  r.resolutionNote,u.usuario,u.nombre,u.apellido,u.email`;
const REQUEST_FROM = "FROM account_deletion_requests r LEFT JOIN users u ON u.id = r.userId";

function requestFromRow(row) {
  if (!row) return null;
  const deadline = addMonth(row.requestedAt);
  return {
    id: row.id,
    userId: row.userId,
    reason: row.reason,
    state: row.state,
    requestedAt: row.requestedAt,
    deadline,
    overdue: row.state === "pending" && !!deadline && Date.parse(deadline) < Date.now(),
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
    // La cuenta puede haberse eliminado ya: el LEFT JOIN deja estos campos vacíos.
    usuario: row.usuario || "",
    nombre: row.nombre || "",
    apellido: row.apellido || "",
    email: row.email || "",
  };
}

export function latestDeletionRequest(userId) {
  return requestFromRow(
    db
      .prepare(
        `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.userId=? ORDER BY r.requestedAt DESC, r.id DESC LIMIT 1`,
      )
      .get(userId),
  );
}

/** Cola de revisión: pendientes, de la solicitud más antigua a la más reciente. */
export function listDeletionRequests() {
  return db
    .prepare(
      `SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.state='pending' ORDER BY r.requestedAt, r.id`,
    )
    .all()
    .map(requestFromRow);
}

export function requestAccountDeletion({ user, reason = "" }) {
  if (!user) throw fail("Inicia sesión para solicitar la baja.", 401);
  if (
    db
      .prepare("SELECT 1 FROM account_deletion_requests WHERE userId=? AND state='pending'")
      .get(user.id)
  )
    throw fail("Ya tienes una solicitud de baja pendiente de revisión.", 409);
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO account_deletion_requests (id,userId,reason,state,requestedAt) VALUES (?,?,?,'pending',?)",
  ).run(id, user.id, shortText(reason), nowIso());
  recordAudit({
    actor: user,
    action: "users.deletion-requested",
    resourceType: "user",
    resourceId: user.id,
  });
  return latestDeletionRequest(user.id);
}

export function cancelAccountDeletion({ user }) {
  const pending = db
    .prepare("SELECT id FROM account_deletion_requests WHERE userId=? AND state='pending'")
    .get(user.id);
  if (!pending) throw fail("No tienes ninguna solicitud de baja pendiente.", 409);
  db.prepare(
    "UPDATE account_deletion_requests SET state='cancelled',resolvedAt=?,resolvedBy=? WHERE id=?",
  ).run(nowIso(), user.id, pending.id);
  recordAudit({
    actor: user,
    action: "users.deletion-cancelled",
    resourceType: "user",
    resourceId: user.id,
  });
  return latestDeletionRequest(user.id);
}

function assertDeletable(user) {
  if (!user) throw fail("Usuario no encontrado.", 404);
  // Misma regla que el editor de usuarios: nunca dejar la plataforma sin
  // ningún administrador protegido activo.
  if (user.activo && ROLE_LABELS[user.rol]) {
    const others = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE rol=? AND activo=1 AND id<>?")
      .get(user.rol, user.id).n;
    if (!others) throw fail(`Debe quedar al menos un ${ROLE_LABELS[user.rol]} activo.`, 409);
  }
  const profiles = linkedProfiles(user.id);
  if (profiles.length)
    throw fail(
      `No se puede eliminar un usuario con perfil de ${profiles.join(" y ")} asociado. Desvincula el perfil antes de borrar la cuenta.`,
      409,
    );
}

// El acta del borrado avanzado conserva una copia de la ficha (nombre, DNI,
// contacto, IBAN) como evidencia. Al suprimir la cuenta esa copia deja de tener
// base para identificar a la persona: se anonimiza manteniendo el vínculo por
// id, los importes y las fechas del registro contable.
const ARCHIVE_PII = [
  "name",
  "surname",
  "dni",
  "email",
  "phone",
  "otherPhone",
  "address",
  "province",
  "city",
  "postalCode",
  "iban",
  "notes",
  "legalRepresentative",
  "documents",
  "userId",
  "phoneVerifiedAt",
  "emailVerifiedAt",
];
const SUPPRESSED_NAME = "Titular suprimido (RGPD)";

function collectArchivedIds(value, user, email, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectArchivedIds(item, user, email, ids);
    return ids;
  }
  if (!value || typeof value !== "object") return ids;
  if (
    ["owner", "tenant"].includes(value.type) &&
    (value.userId === user.id ||
      (!!email && String(value.email || "").trim().toLowerCase() === email))
  )
    ids.add(value.id);
  for (const item of Object.values(value)) collectArchivedIds(item, user, email, ids);
  return ids;
}

function scrubArchivedValue(value, user, ids) {
  if (Array.isArray(value)) {
    for (const item of value) scrubArchivedValue(item, user, ids);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (
    (typeof value.id === "string" && ids.has(value.id)) ||
    (value.userId && value.userId === user.id)
  )
    for (const key of ARCHIVE_PII)
      if (Object.hasOwn(value, key)) value[key] = key === "name" ? SUPPRESSED_NAME : "";
  for (const item of Object.values(value)) scrubArchivedValue(item, user, ids);
}

function anonymizeArchives(user) {
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  for (const row of db.prepare("SELECT id,data FROM cascade_archives").all()) {
    const data = JSON.parse(row.data);
    // Primero por vínculo de cuenta, que es inequívoco. Solo si la ficha se
    // archivó sin vínculo se usa el email, para no borrar la identidad de otra
    // persona que comparta dirección.
    const linked = collectArchivedIds(data, user, "");
    const ids = linked.size ? linked : collectArchivedIds(data, user, email);
    if (!ids.size) continue;
    scrubArchivedValue(data, user, ids);
    db.prepare("UPDATE cascade_archives SET data=? WHERE id=?").run(JSON.stringify(data), row.id);
  }
}

// Datos de la cuenta que desaparecen con el borrado. Los recibos, cobros,
// actas y la auditoría se conservan: son registro contable y de seguridad.
function deleteAccountRows(user) {
  db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
  db.prepare("DELETE FROM password_recovery_mail WHERE userId=?").run(user.id);
  db.prepare("DELETE FROM communication_preferences WHERE userId=?").run(user.id);
  db.prepare("DELETE FROM communication_consent_log WHERE userId=?").run(user.id);
  // Avisos que aún no habían salido no deben enviarse a una cuenta borrada.
  db.prepare("DELETE FROM communication_outbox WHERE userId=? AND state='pending'").run(user.id);
  const email = String(user.email || "").trim();
  if (email)
    db.prepare("DELETE FROM password_recovery_requests WHERE emailHash=?").run(emailHash(email));
  for (const table of ["owners", "tenants"])
    db.prepare(`UPDATE ${table} SET userId='' WHERE userId=?`).run(user.id);
  db.prepare("UPDATE communities SET adminUserId='' WHERE adminUserId=?").run(user.id);
  // El contenido sigue formando parte de la comunidad, pero deja de identificar
  // a quien lo subió o escribió. Las carpetas y documentos no se borran: son
  // documentación de la comunidad, igual que las actas.
  db.prepare("UPDATE documents SET uploadedBy='',uploadedByName='' WHERE uploadedBy=?").run(
    user.id,
  );
  db.prepare("UPDATE document_folders SET createdBy='',createdByName='' WHERE createdBy=?").run(
    user.id,
  );
  db.prepare("UPDATE communication_comments SET userId='' WHERE userId=?").run(user.id);
  // Las publicaciones siguen siendo de la comunidad, pero su autor deja de
  // estar identificado, igual que en documentos y comentarios.
  db.prepare("UPDATE communication_posts SET createdBy='' WHERE createdBy=?").run(user.id);
  // Copia de la ficha conservada en las actas de borrado avanzado.
  anonymizeArchives(user);
  db.prepare("DELETE FROM users WHERE id=?").run(user.id);
}

// El historial de reportes de error vive en Prisma Postgres y solo existe si
// DATABASE_URL está configurada. Si la purga falla no se borra la cuenta: dejar
// datos personales atrás al responder «borrado hecho» sería peor que reintentar.
async function purgeReportHistory(user, purgeReports) {
  try {
    await purgeReports(user.id);
  } catch (error) {
    console.error(`[baja] no se pudo purgar el historial de reportes: ${error.message}`);
    throw fail(
      "No se pudo borrar el historial de reportes de error de esta cuenta. Vuelve a intentarlo en unos minutos.",
      503,
    );
  }
}

function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Borra la cuenta. `request` cierra además la solicitud de baja en la misma
 * transacción y deja rastro del origen en la auditoría.
 */
async function runDeletion(
  user,
  actor,
  { origin, request = null, purgeReports = purgeIssueReports } = {},
) {
  assertDeletable(user);
  await purgeReportHistory(user, purgeReports);
  transaction(() => {
    deleteAccountRows(user);
    if (!request) return;
    // El motivo puede contener datos personales: se descarta al suprimir la cuenta.
    db.prepare(
      "UPDATE account_deletion_requests SET state='approved',resolvedAt=?,resolvedBy=?,reason='' WHERE id=?",
    ).run(nowIso(), actor?.id || "", request.id);
  });
  recordAudit({
    actor,
    action: "users.deleted",
    resourceType: "user",
    resourceId: user.id,
    details: request ? { origen: origin, solicitud: request.id } : { origen: origin },
  });
}

/** Borrado directo desde Administración → Usuarios. */
export async function deleteAccount(userId, { actor = null, purgeReports } = {}) {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  await runDeletion(user, actor, { origin: "administracion", purgeReports });
  return { ok: true };
}

/** Aprueba una solicitud: borra la cuenta y cierra la solicitud en la misma transacción. */
export async function approveDeletionRequest(id, actor, { purgeReports } = {}) {
  const request = db.prepare("SELECT * FROM account_deletion_requests WHERE id=?").get(id);
  if (!request) throw fail("Solicitud de baja no encontrada.", 404);
  if (request.state !== "pending") throw fail("La solicitud ya no está pendiente.", 409);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(request.userId);
  await runDeletion(user, actor, { origin: "baja-rgpd", request, purgeReports });
  return { ok: true };
}

/** Rechaza la solicitud sin tocar la cuenta. La nota se muestra al titular. */
export function rejectDeletionRequest(id, actor, note = "") {
  const request = db.prepare("SELECT * FROM account_deletion_requests WHERE id=?").get(id);
  if (!request) throw fail("Solicitud de baja no encontrada.", 404);
  if (request.state !== "pending") throw fail("La solicitud ya no está pendiente.", 409);
  db.prepare(
    "UPDATE account_deletion_requests SET state='rejected',resolvedAt=?,resolvedBy=?,resolutionNote=? WHERE id=?",
  ).run(nowIso(), actor?.id || "", shortText(note), request.id);
  recordAudit({
    actor,
    action: "users.deletion-rejected",
    resourceType: "user",
    resourceId: request.userId,
    details: { solicitud: request.id },
  });
  return latestDeletionRequest(request.userId);
}
