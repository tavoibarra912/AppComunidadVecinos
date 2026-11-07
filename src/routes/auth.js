import { Router } from "express";
import {
  hashPassword, newSalt, verifyPassword, newResetToken, resetTokenExpiry,
  findUserByEmail, findUserById, findUserBySso, findUserByResetToken,
  setPassword, simulateSsoLogin
} from "../auth.js";
import { db } from "../db.js";

const router = Router();

const SSO_PROVIDERS = ["gmail", "outlook", "facebook", "instagram"];

function userPublic(user) {
  const owner = db.prepare("SELECT id FROM owners WHERE userId = ?").get(user.id);
  const tenants = db.prepare("SELECT id FROM tenants WHERE userId = ?").all(user.id);
  const adminCommunities = db.prepare("SELECT id, name FROM communities WHERE adminUserId = ?").all(user.id);
  return {
    id: user.id,
    nombre: user.nombre,
    apellido: user.apellido,
    usuario: user.usuario,
    email: user.email,
    rol: user.rol,
    activo: !!user.activo,
    ssoProvider: user.ssoProvider || "",
    ownerId: owner?.id || "",
    tenantIds: tenants.map(t => t.id),
    adminCommunityIds: adminCommunities.map(c => c.id)
  };
}

// POST /api/auth/signup — alta con rol menos permisivo (user)
router.post("/signup", (req, res) => {
  const { nombre, apellido, usuario, email, password } = req.body || {};
  if (!email || !usuario || !password) {
    return res.status(400).json({ error: "Usuario, email y contraseña son obligatorios." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese email." });
  }
  const dupUsuario = db.prepare("SELECT id FROM users WHERE LOWER(usuario) = LOWER(?)").get(String(usuario).trim());
  if (dupUsuario) {
    return res.status(409).json({ error: "Ya existe un usuario con ese nombre de usuario." });
  }
  const salt = newSalt();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo, passwordHash)
     VALUES (?, ?, ?, ?, ?, 'user', 1, ?)`
  ).run(
    id, (nombre || "").trim(), (apellido || "").trim(), String(usuario).trim(),
    String(email).trim().toLowerCase(),
    `${salt}:${hashPassword(password, salt)}`
  );
  res.status(201).json(userPublic(findUserById(id)));
});

// POST /api/auth/signin — login con usuario/email + contraseña
router.post("/signin", (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }
  const user = db.prepare(
    "SELECT * FROM users WHERE LOWER(usuario) = LOWER(?) OR LOWER(email) = LOWER(?)"
  ).get(String(usuario).trim().toLowerCase(), String(usuario).trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Credenciales incorrectas." });
  }
  if (!user.activo) {
    return res.status(403).json({ error: "La cuenta está desactivada." });
  }
  // Cuentas SSO sin contraseña: deben usar SSO o reset
  if (user.ssoProvider && !user.passwordHash) {
    return res.status(400).json({ error: `Esta cuenta usa ${user.ssoProvider}. Iniciá sesión con ese proveedor.` });
  }
  if (!user.passwordHash) {
    return res.status(400).json({ error: "Esta cuenta no tiene contraseña configurada." });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Credenciales incorrectas." });
  }
  res.json(userPublic(user));
});

// POST /api/auth/sso — login simulado con proveedor SSO
router.post("/sso", (req, res) => {
  const { provider, email, nombre, apellido } = req.body || {};
  if (!SSO_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "Proveedor SSO no soportado." });
  }
  if (!email) {
    return res.status(400).json({ error: "El email es obligatorio para el SSO simulado." });
  }
  try {
    const { user, creado } = simulateSsoLogin(provider, email, nombre, apellido);
    if (!user.activo) return res.status(403).json({ error: "La cuenta está desactivada." });
    res.json({ ...userPublic(user), creado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/auth/forgot-password — genera token y lo "envía" (simulado: lo devuelve)
router.post("/forgot-password", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Indicá tu email." });
  const user = findUserByEmail(email);
  // Respuesta idéntica exista o no la cuenta (no filtrar emails)
  if (!user) {
    return res.json({ ok: true, mensaje: "Si el email está registrado recibirás instrucciones." });
  }
  const token = newResetToken();
  db.prepare("UPDATE users SET resetToken = ?, resetTokenExpira = ? WHERE id = ?")
    .run(token, resetTokenExpiry(), user.id);
  res.json({ ok: true, mensaje: "Si el email está registrado recibirás instrucciones.", token });
});

// POST /api/auth/reset-password — cambia la contraseña con el token
router.post("/reset-password", (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: "Token y contraseña son obligatorios." });
  if (password.length < 8) return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  const user = findUserByResetToken(token);
  if (!user) return res.status(400).json({ error: "El token es inválido o expiró." });
  setPassword(user.id, password);
  res.json({ ok: true });
});

// POST /api/auth/change-password — cambiar contraseña estando logueado
router.post("/change-password", (req, res) => {
  const { userId, currentPassword, newPassword } = req.body || {};
  const user = findUserById(userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
  if (user.passwordHash) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta." });
    }
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
  }
  setPassword(user.id, newPassword);
  res.json({ ok: true });
});

export default router;
