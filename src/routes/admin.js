import { Router } from "express";
import crypto from "node:crypto";
import { db, listUsers, listRoles, getSettings, DOCUMENT_TYPES } from "../db.js";
import { publicUser } from "../security.js";
import { passwordRecord, setPassword } from "../auth.js";
import { passwordError, validEmail } from "../validation.js";
import { PERMISSIONS } from "../../public/js/permissions.js";
import { validateBrand } from "../branding.js";
import { validateFeeDefaults } from "../fees.js";
export const PERMISOS_VALIDOS = PERMISSIONS;
const router = Router();
const roleFor = (value) =>
  db
    .prepare("SELECT * FROM roles WHERE id = ? OR nombre = ?")
    .get(value, value);
const ROLE_LABELS = {
  super_admin: "superadministrador",
  administrator: "administrador general",
};
/** ¿La operación dejaría la plataforma sin ningún usuario activo del rol protegido? */
function lastAdmin(user, nextRole, active) {
  if (!user.activo || !ROLE_LABELS[user.rol]) return false;
  if (nextRole === user.rol && active) return false;
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM users WHERE rol = ? AND activo = 1 AND id <> ?",
      )
      .get(user.rol, user.id).n === 0
  );
}
function lastAdminMessage(role) {
  return `Debe quedar al menos un ${ROLE_LABELS[role] || "administrador"} activo.`;
}
/** Perfiles de propietario o inquilino vinculados a una cuenta. */
function linkedProfiles(userId) {
  const parts = [];
  if (db.prepare("SELECT 1 FROM owners WHERE userId=? LIMIT 1").get(userId))
    parts.push("propietario");
  if (db.prepare("SELECT 1 FROM tenants WHERE userId=? LIMIT 1").get(userId))
    parts.push("inquilino");
  return parts;
}
function userError(data, id) {
  if (
    typeof data.usuario !== "string" ||
    !/^[\p{L}\p{N}._-]{2,60}$/u.test(data.usuario.trim())
  )
    return "El usuario debe tener entre 2 y 60 letras, números, puntos, guiones o guiones bajos.";
  if (data.email && !validEmail(data.email)) return "El email no es válido.";
  if (
    [data.nombre, data.apellido, data.email].some(
      (v) => v !== undefined && typeof v !== "string",
    )
  )
    return "Los datos de usuario deben ser texto.";
  if (
    db
      .prepare(
        "SELECT id FROM users WHERE LOWER(usuario) = LOWER(?) AND id <> ?",
      )
      .get(data.usuario.trim(), id || "")
  )
    return "Ya existe otro usuario con ese nombre.";
  if (
    data.email &&
    db
      .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?")
      .get(data.email.trim(), id || "")
  )
    return "Ya existe otro usuario con ese email.";
  return null;
}
router.get("/users", (_req, res) => res.json(listUsers()));
router.post("/users", (req, res) => {
  const data = req.body || {};
  const error = userError(data) || passwordError(data.password);
  const role = roleFor(data.rol || "user");
  if (error || !role)
    return res
      .status(400)
      .json({ error: error || "El rol indicado no existe." });
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id,nombre,apellido,usuario,email,rol,activo,passwordHash) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    id,
    (data.nombre || "").trim(),
    (data.apellido || "").trim(),
    data.usuario.trim(),
    (data.email || "").trim().toLowerCase(),
    role.nombre,
    data.activo === false ? 0 : 1,
    passwordRecord(data.password),
  );
  res
    .status(201)
    .json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
});
router.put("/users/:id", (req, res) => {
  const existing = db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(req.params.id);
  if (!existing)
    return res.status(404).json({ error: "Usuario no encontrado." });
  const data = { ...existing, ...req.body };
  const role = roleFor(data.rol);
  const error =
    userError(data, existing.id) ||
    (req.body.password ? passwordError(req.body.password) : null);
  if (error || !role)
    return res
      .status(400)
      .json({ error: error || "El rol indicado no existe." });
  if (lastAdmin(existing, role.nombre, !!data.activo))
    return res.status(409).json({ error: lastAdminMessage(existing.rol) });
  db.prepare(
    "UPDATE users SET nombre=?,apellido=?,usuario=?,email=?,rol=?,activo=? WHERE id=?",
  ).run(
    (data.nombre || "").trim(),
    (data.apellido || "").trim(),
    data.usuario.trim(),
    (data.email || "").trim().toLowerCase(),
    role.nombre,
    data.activo ? 1 : 0,
    existing.id,
  );
  if (req.body.password) setPassword(existing.id, req.body.password);
  if (!data.activo || (data.email || "").trim().toLowerCase() !== (existing.email || "").toLowerCase()) {
    db.prepare("UPDATE users SET resetToken='',resetTokenExpira='' WHERE id=?").run(existing.id);
    db.prepare("DELETE FROM password_recovery_mail WHERE userId=?").run(existing.id);
  }
  if (!data.activo)
    db.prepare("DELETE FROM sessions WHERE userId=?").run(existing.id);
  res.json(
    publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(existing.id)),
  );
});
router.delete("/users/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  if (lastAdmin(user, "", false))
    return res.status(409).json({ error: lastAdminMessage(user.rol) });
  // Un perfil de propietario o inquilino no debe quedar huérfano: se exige
  // desvincularlo antes de eliminar la cuenta.
  const profiles = linkedProfiles(user.id);
  if (profiles.length)
    return res.status(409).json({
      error: `No se puede eliminar un usuario con perfil de ${profiles.join(" y ")} asociado. Desvinculá el perfil antes de borrar la cuenta.`,
    });
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
    for (const table of ["owners", "tenants"])
      db.prepare(`UPDATE ${table} SET userId='' WHERE userId=?`).run(user.id);
    db.prepare("UPDATE communities SET adminUserId='' WHERE adminUserId=?").run(
      user.id,
    );
    db.prepare("DELETE FROM users WHERE id=?").run(user.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json({ ok: true });
});
for (const [kind, table] of [
  ["owner", "owners"],
  ["tenant", "tenants"],
]) {
  router.put(`/users/:id/link-${kind}`, (req, res) => {
    const usuarioVinculo = db.prepare("SELECT id, usuario, rol FROM users WHERE id=?").get(req.params.id);
    if (!usuarioVinculo)
      return res.status(404).json({ error: "Usuario no encontrado." });
    // Los roles de administración de la plataforma no llevan perfiles:
    // administran todo sin ser vecinos de ninguna comunidad. Sí se permite
    // desvincular (entityId vacío) para poder limpiar vínculos heredados.
    const entityId = req.body?.[`${kind}Id`] || "";
    if (entityId && ["super_admin", "administrator"].includes(usuarioVinculo.rol))
      return res
        .status(409)
        .json({
          error:
            "Los roles de administración de la plataforma (super_admin, administrator) no se vinculan a perfiles de propietario o inquilino.",
        });
    if (typeof entityId !== "string")
      return res.status(400).json({ error: "Identificador no válido." });
    const row = entityId
      ? db.prepare(`SELECT id,userId FROM ${table} WHERE id=?`).get(entityId)
      : null;
    if (entityId && !row)
      return res.status(404).json({ error: "Perfil no encontrado." });
    if (row?.userId && row.userId !== req.params.id)
      return res
        .status(409)
        .json({ error: "Ese perfil ya está vinculado a otro usuario." });
    db.exec("BEGIN");
    try {
      db.prepare(`UPDATE ${table} SET userId='' WHERE userId=?`).run(
        req.params.id,
      );
      if (row)
        db.prepare(`UPDATE ${table} SET userId=? WHERE id=?`).run(
          req.params.id,
          row.id,
        );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ ok: true, [`${kind}Id`]: entityId });
  });
}
router.get("/roles", (_req, res) => res.json(listRoles()));
function roleError(data, id) {
  if (
    typeof data.nombre !== "string" ||
    !data.nombre.trim() ||
    data.nombre.length > 80
  )
    return "El nombre del rol es obligatorio (máximo 80 caracteres).";
  if (
    !Array.isArray(data.permisos) ||
    data.permisos.some((p) => !PERMISSIONS.includes(p))
  )
    return "Los permisos contienen valores no válidos.";
  if (
    db
      .prepare("SELECT id FROM roles WHERE LOWER(nombre)=LOWER(?) AND id<>?")
      .get(data.nombre.trim(), id || "")
  )
    return "Ya existe un rol con ese nombre.";
  return null;
}
router.post("/roles", (req, res) => {
  const data = { permisos: [], ...req.body };
  const error = roleError(data);
  if (error) return res.status(400).json({ error });
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO roles (id,nombre,descripcion,permisos,sistema) VALUES (?,?,?,?,0)",
  ).run(
    id,
    data.nombre.trim(),
    String(data.descripcion || ""),
    JSON.stringify([...new Set(data.permisos)]),
  );
  res.status(201).json(listRoles().find((r) => r.id === id));
});
router.put("/roles/:id", (req, res) => {
  const existing = listRoles().find((r) => r.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Rol no encontrado." });
  const data = { ...existing, ...req.body };
  const error = roleError(data, existing.id);
  if (error) return res.status(400).json({ error });
  if (existing.sistema && data.nombre !== existing.nombre)
    return res
      .status(409)
      .json({ error: "No se puede cambiar el nombre de un rol del sistema." });
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE roles SET nombre=?,descripcion=?,permisos=? WHERE id=?",
    ).run(
      data.nombre.trim(),
      String(data.descripcion || ""),
      JSON.stringify([...new Set(data.permisos)]),
      existing.id,
    );
    db.prepare("UPDATE users SET rol=? WHERE rol=? OR rol=?").run(
      data.nombre.trim(),
      existing.nombre,
      existing.id,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json(listRoles().find((r) => r.id === existing.id));
});
router.delete("/roles/:id", (req, res) => {
  const role = db.prepare("SELECT * FROM roles WHERE id=?").get(req.params.id);
  if (!role) return res.status(404).json({ error: "Rol no encontrado." });
  if (role.sistema)
    return res
      .status(409)
      .json({ error: "Los roles del sistema no se pueden eliminar." });
  if (
    db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE rol=? OR rol=?")
      .get(role.nombre, role.id).n
  )
    return res
      .status(409)
      .json({ error: "El rol tiene usuarios asignados. Reasignalos primero." });
  db.prepare("DELETE FROM roles WHERE id=?").run(role.id);
  res.json({ ok: true });
});
router.get("/settings", (_req, res) => res.json(getSettings()));
router.put("/settings", (req, res) => {
  const data = req.body || {};
  if (data.emailContacto && !validEmail(data.emailContacto))
    return res
      .status(400)
      .json({ error: "El email de contacto no es válido." });
  if (
    data.nombreAsociacion !== undefined &&
    (typeof data.nombreAsociacion !== "string" ||
      !data.nombreAsociacion.trim() ||
      data.nombreAsociacion.trim().length > 120)
  )
    return res
      .status(400)
      .json({ error: "El nombre de la asociación debe tener entre 1 y 120 caracteres." });
  for (const [key, min, max, message] of [
    ["documentosMaxSizeMb", 1, 50, "El límite de archivos debe estar entre 1 y 50 MB."],
    ["documentosMaxArchivos", 1, 50, "El máximo de archivos por envío debe estar entre 1 y 50."],
    ["duracionSesionHoras", 1, 720, "La duración de la sesión debe estar entre 1 y 720 horas."],
    ["otpExpiraMinutos", 1, 60, "La expiración del código OTP debe estar entre 1 y 60 minutos."],
    ["otpReenvioSegundos", 10, 600, "El reenvío del código OTP debe estar entre 10 y 600 segundos."],
    ["diasAvisoVencimientoContrato", 0, 365, "El aviso de vencimiento debe estar entre 0 y 365 días."],
    ["filasPorPagina", 5, 50, "Las filas por página deben estar entre 5 y 50."],
  ])
    if (
      data[key] !== undefined &&
      (!Number.isFinite(Number(data[key])) ||
        Number(data[key]) < min ||
        Number(data[key]) > max)
    )
      return res.status(400).json({ error: message });
  if (
    data.filasPorPagina !== undefined &&
    ![5, 10, 25, 50].includes(Number(data.filasPorPagina))
  )
    return res
      .status(400)
      .json({ error: "Las filas por página deben ser 5, 10, 25 o 50." });
  for (const key of [
    "permitirRegistro",
    "permitirRecuperacion",
    "notificacionesEmail",
    "mantenimiento",
  ])
    if (data[key] !== undefined && typeof data[key] !== "boolean")
      return res.status(400).json({ error: "La configuración booleana no es válida." });
  if (data.documentosTiposPermitidos !== undefined) {
    if (!Array.isArray(data.documentosTiposPermitidos))
      return res
        .status(400)
        .json({ error: "Los tipos de archivo permitidos no son válidos." });
    const tipos = [
      ...new Set(
        data.documentosTiposPermitidos.map((value) =>
          String(value).trim().toLowerCase().replace(/^\./, ""),
        ),
      ),
    ];
    if (
      !tipos.length ||
      tipos.some((tipo) => !DOCUMENT_TYPES.includes(tipo))
    )
      return res
        .status(400)
        .json({ error: "Elegí al menos un tipo de archivo permitido (PDF, JPG, JPEG, PNG, WebP, DOC o DOCX)." });
    data.documentosTiposPermitidos = tipos;
  }
  if (
    data.mensajeMantenimiento !== undefined &&
    (typeof data.mensajeMantenimiento !== "string" ||
      data.mensajeMantenimiento.length > 300)
  )
    return res
      .status(400)
      .json({ error: "El mensaje de mantenimiento no puede superar los 300 caracteres." });
  const brandError = validateBrand(data.marca);
  if (brandError) return res.status(400).json({ error: brandError });
  if (data.tenantAuthorizations !== undefined) {
    if (
      !data.tenantAuthorizations ||
      typeof data.tenantAuthorizations !== "object" ||
      Array.isArray(data.tenantAuthorizations)
    )
      return res
        .status(400)
        .json({ error: "Las autorizaciones de inquilinos no son válidas." });
    const normalized = {};
    for (const [communityId, list] of Object.entries(
      data.tenantAuthorizations,
    )) {
      if (!Array.isArray(list) || !list.length)
        return res.status(400).json({
          error: "Cada comunidad debe tener al menos una autorización.",
        });
      if (list.length > 50)
        return res.status(400).json({
          error: "Una comunidad no puede tener más de 50 autorizaciones.",
        });
      const ids = new Set();
      normalized[communityId] = [];
      for (const item of list) {
        const id = typeof item?.id === "string" ? item.id.trim() : "";
        const label =
          typeof item?.label === "string" ? item.label.trim() : "";
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
          return res.status(400).json({
            error: "El identificador de una autorización no es válido.",
          });
        if (ids.has(id))
          return res.status(400).json({
            error: "Hay autorizaciones duplicadas en una comunidad.",
          });
        if (!label || label.length > 80)
          return res.status(400).json({
            error: "Cada autorización debe tener un nombre de hasta 80 caracteres.",
          });
        ids.add(id);
        normalized[communityId].push({ id, label });
      }
    }
    data.tenantAuthorizations = normalized;
  }
  const current = getSettings();
  try { validateFeeDefaults(data); } catch (error) { return res.status(400).json({ error: error.message }); }
  const next = { ...current, ...data };
  if (data.marca) next.marca = { ...current.marca, ...data.marca };
  db.prepare(
    "INSERT INTO settings (id,data) VALUES ('general',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(JSON.stringify(next));
  res.json(getSettings());
});
export default router;
