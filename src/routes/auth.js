import { Router } from "express";
import crypto from "node:crypto";
import { db, getSettings } from "../db.js";
import {
  verifyPassword,
  passwordRecord,
  findUserById,
  findUserByEmail,
  setPassword,
} from "../auth.js";
import {
  createSession,
  publicUser,
  requireSession,
  endSession,
} from "../security.js";
import { validEmail, passwordError } from "../validation.js";
import { requestRecovery, resetRecoveredPassword } from "../password-recovery.js";

const router = Router();
const attempts = new Map();
router.use((req, res, next) => {
  if (req.method !== "POST" || req.path === "/logout") return next();
  const now = Date.now();
  for (const [key, entry] of attempts)
    if (entry.until < now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
  if (entry.count >= 40)
    return res
      .status(429)
      .json({
        error: "Demasiados intentos. Volvé a intentar en unos minutos.",
      });
  entry.count++;
  attempts.set(key, entry);
  next();
});
router.get("/me", requireSession, (req, res) => res.json(publicUser(req.user)));
router.post("/logout", requireSession, (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});
router.post("/signup", (req, res) => {
  if (!getSettings().permitirRegistro)
    return res
      .status(403)
      .json({ error: "El registro de nuevas cuentas está deshabilitado." });
  const {
    nombre = "",
    apellido = "",
    usuario,
    email,
    password,
  } = req.body || {};
  if (
    typeof usuario !== "string" ||
    !/^[\p{L}\p{N}._-]{2,60}$/u.test(usuario.trim()) ||
    !validEmail(email) ||
    typeof nombre !== "string" ||
    typeof apellido !== "string"
  ) {
    return res
      .status(400)
      .json({
        error: "Indicá un usuario válido y una dirección de email válida.",
      });
  }
  const error = passwordError(password);
  if (error) return res.status(400).json({ error });
  if (
    findUserByEmail(email) ||
    db
      .prepare("SELECT id FROM users WHERE LOWER(usuario) = LOWER(?)")
      .get(usuario.trim())
  ) {
    return res
      .status(409)
      .json({ error: "El usuario o el email ya están registrados." });
  }
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id,nombre,apellido,usuario,email,rol,activo,passwordHash) VALUES (?,?,?,?,?,'user',1,?)",
  ).run(
    id,
    nombre.trim().slice(0, 60),
    apellido.trim().slice(0, 80),
    usuario.trim(),
    email.trim().toLowerCase(),
    passwordRecord(password),
  );
  const user = findUserById(id);
  createSession(user, res);
  res.status(201).json(publicUser(user));
});
router.post("/signin", (req, res) => {
  const { usuario, password } = req.body || {};
  if (
    typeof usuario !== "string" ||
    typeof password !== "string" ||
    password.length > 128
  )
    return res.status(400).json({ error: "Indicá usuario y contraseña." });
  const user = db
    .prepare(
      "SELECT * FROM users WHERE LOWER(usuario) = LOWER(?) OR LOWER(email) = LOWER(?)",
    )
    .get(usuario.trim(), usuario.trim());
  req.auditTarget = user?.id || "";
  if (!user?.activo || !verifyPassword(password, user.passwordHash))
    return res.status(401).json({ error: "Credenciales incorrectas." });
  if (!user.passwordHash.startsWith("scrypt:")) setPassword(user.id, password);
  createSession(user, res);
  req.user = user;
  res.json(publicUser(user));
});
router.post("/sso", (_req, res) =>
  res
    .status(503)
    .json({
      error:
        "El acceso con proveedores externos no está configurado. Usá usuario y contraseña.",
    }),
);
router.post("/forgot-password", (req, res, next) => {
  if (!getSettings().permitirRecuperacion)
    return res
      .status(403)
      .json({ error: "La recuperación de contraseña está deshabilitada." });
  try { res.json(requestRecovery(req.body?.email, req)); }
  catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); }
});
router.post("/reset-password", (req, res, next) => {
  if (!getSettings().permitirRecuperacion)
    return res
      .status(403)
      .json({ error: "La recuperación de contraseña está deshabilitada." });
  try { res.json(resetRecoveredPassword(req.body?.token, req.body?.password, req)); }
  catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); }
});
router.post("/change-password", requireSession, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length > 128 ||
    !verifyPassword(currentPassword, req.user.passwordHash)
  )
    return res
      .status(401)
      .json({ error: "La contraseña actual es incorrecta." });
  const error = passwordError(newPassword);
  if (error) return res.status(400).json({ error });
  setPassword(req.user.id, newPassword);
  endSession(req, res);
  res.json({ ok: true });
});
export default router;
