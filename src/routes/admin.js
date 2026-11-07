import { Router } from "express";
import crypto from "node:crypto";
import { db, listUsers, listRoles, getSettings } from "../db.js";

const router = Router();

const PERMISOS_VALIDOS = [
  "community:read", "community:create", "community:manage", "community:delete",
  "owner:read", "owner:manage", "owner:edit", "owner:delete", "owner:documents:submit",
  "property:read", "property:manage", "property:delete",
  "tenant:read", "tenant:manage", "tenant:delete",
  "document:read", "document:approve", "document:delete",
  "reports:read", "audit:read",
  "admin:users", "admin:roles", "admin:settings",
  "admin_notification:read", "owner_notification:read"
];

// ---------- Usuarios ----------
router.get("/users", (_req, res) => {
  res.json(listUsers());
});

router.post("/users", (req, res) => {
  const data = req.body || {};
  if (!data.usuario || !String(data.usuario).trim()) {
    return res.status(400).json({ error: "El nombre de usuario es obligatorio." });
  }
  const exists = db.prepare("SELECT id FROM users WHERE LOWER(usuario) = LOWER(?)").get(String(data.usuario).trim());
  if (exists) {
    return res.status(409).json({ error: "Ya existe un usuario con ese nombre de usuario." });
  }
  const rol = data.rol || "consulta";
  if (!db.prepare("SELECT id FROM roles WHERE id = ?").get(rol) && !db.prepare("SELECT id FROM roles WHERE nombre = ?").get(rol)) {
    return res.status(400).json({ error: "El rol indicado no existe." });
  }
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, (data.nombre || "").trim(), (data.apellido || "").trim(),
    String(data.usuario).trim(), (data.email || "").trim(), rol, data.activo === false ? 0 : 1
  );
  res.status(201).json(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
});

router.put("/users/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Usuario no encontrado." });
  const data = req.body || {};
  const usuario = String(data.usuario ?? existing.usuario).trim();
  const dup = db.prepare("SELECT id FROM users WHERE LOWER(usuario) = LOWER(?) AND id <> ?").get(usuario, existing.id);
  if (dup) return res.status(409).json({ error: "Ya existe otro usuario con ese nombre de usuario." });
  db.prepare(
    `UPDATE users SET nombre = ?, apellido = ?, usuario = ?, email = ?, rol = ?, activo = ? WHERE id = ?`
  ).run(
    (data.nombre ?? existing.nombre).trim(), (data.apellido ?? existing.apellido).trim(),
    usuario, (data.email ?? existing.email).trim(),
    data.rol ?? existing.rol,
    (data.activo ?? !!existing.activo) ? 1 : 0,
    existing.id
  );
  res.json(db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id));
});

router.delete("/users/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Usuario no encontrado." });
  const admins = db.prepare("SELECT COUNT(*) AS total FROM users WHERE rol = 'administrador' AND activo = 1 AND id <> ?").get(existing.id).total;
  if (existing.rol === "administrador" && existing.activo && admins === 0) {
    return res.status(409).json({ error: "No se puede eliminar el último administrador activo." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

// ---------- Vinculación de perfiles (usuario ↔ propietario / inquilino) ----------
// Vincula un registro de propietario a la cuenta (o lo desvincula con ownerId vacío).
router.put("/users/:id/link-owner", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  const ownerId = (req.body?.ownerId || "").trim();
  if (!ownerId) {
    db.prepare("UPDATE owners SET userId = '' WHERE userId = ?").run(user.id);
    return res.json({ ok: true, ownerId: "" });
  }
  const owner = db.prepare("SELECT id, userId FROM owners WHERE id = ?").get(ownerId);
  if (!owner) return res.status(404).json({ error: "Registro de propietario no encontrado." });
  if (owner.userId && owner.userId !== user.id) {
    return res.status(409).json({ error: "Ese registro de propietario ya está vinculado a otro usuario." });
  }
  db.prepare("UPDATE owners SET userId = ? WHERE id = ?").run(user.id, ownerId);
  res.json({ ok: true, ownerId });
});

// Vincula un registro de inquilino a la cuenta (o lo desvincula con tenantId vacío).
router.put("/users/:id/link-tenant", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  const tenantId = (req.body?.tenantId || "").trim();
  if (!tenantId) {
    db.prepare("UPDATE tenants SET userId = '' WHERE userId = ?").run(user.id);
    return res.json({ ok: true, tenantId: "" });
  }
  const tenant = db.prepare("SELECT id, userId FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) return res.status(404).json({ error: "Registro de inquilino no encontrado." });
  if (tenant.userId && tenant.userId !== user.id) {
    return res.status(409).json({ error: "Ese registro de inquilino ya está vinculado a otro usuario." });
  }
  db.prepare("UPDATE tenants SET userId = ? WHERE id = ?").run(user.id, tenantId);
  res.json({ ok: true, tenantId });
});

// ---------- Roles ----------
router.get("/roles", (_req, res) => {
  res.json(listRoles());
});

function validarPermisos(permisos) {
  if (!Array.isArray(permisos)) return "Los permisos deben ser una lista.";
  const invalidos = permisos.filter(p => !PERMISOS_VALIDOS.includes(p));
  if (invalidos.length > 0) return `Permisos desconocidos: ${invalidos.join(", ")}.`;
  return null;
}

router.post("/roles", (req, res) => {
  const data = req.body || {};
  if (!data.nombre || !String(data.nombre).trim()) {
    return res.status(400).json({ error: "El nombre del rol es obligatorio." });
  }
  const errorPermisos = validarPermisos(data.permisos || []);
  if (errorPermisos) return res.status(400).json({ error: errorPermisos });
  const id = data.id || crypto.randomUUID();
  db.prepare(
    `INSERT INTO roles (id, nombre, descripcion, permisos, sistema) VALUES (?, ?, ?, ?, 0)`
  ).run(id, String(data.nombre).trim(), (data.descripcion || "").trim(), JSON.stringify(data.permisos || []));
  res.status(201).json(db.prepare("SELECT * FROM roles WHERE id = ?").get(id));
});

router.put("/roles/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rol no encontrado." });
  const data = req.body || {};
  const permisos = data.permisos ?? JSON.parse(existing.permisos);
  const errorPermisos = validarPermisos(permisos);
  if (errorPermisos) return res.status(400).json({ error: errorPermisos });
  db.prepare(
    `UPDATE roles SET nombre = ?, descripcion = ?, permisos = ? WHERE id = ?`
  ).run(
    String(data.nombre ?? existing.nombre).trim(),
    (data.descripcion ?? existing.descripcion).trim(),
    JSON.stringify(permisos),
    existing.id
  );
  res.json(db.prepare("SELECT * FROM roles WHERE id = ?").get(existing.id));
});

router.delete("/roles/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM roles WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rol no encontrado." });
  if (existing.sistema) {
    return res.status(409).json({ error: "Los roles del sistema no se pueden eliminar." });
  }
  const enUso = db.prepare("SELECT COUNT(*) AS total FROM users WHERE rol = ?").get(existing.nombre).total;
  if (enUso > 0) {
    return res.status(409).json({ error: `El rol está asignado a ${enUso} usuario(s). Reasignalos primero.` });
  }
  db.prepare("DELETE FROM roles WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

// ---------- Configuración general ----------
router.get("/settings", (_req, res) => {
  res.json(getSettings());
});

router.put("/settings", (req, res) => {
  const data = req.body || {};
  db.prepare(
    `INSERT INTO settings (id, data) VALUES ('general', ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`
  ).run(JSON.stringify(data));
  res.json(getSettings());
});

export default router;
