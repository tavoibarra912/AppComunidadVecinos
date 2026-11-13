import crypto from "node:crypto";
import {
  db,
  getSettings,
  listCommunities,
  listOwners,
  listProperties,
  listTenants,
  listRoles,
  listUsers,
} from "./db.js";
import { can } from "../public/js/permissions.js";

const COOKIE = "penarrubia_session";
const digest = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export function policyData() {
  return {
    communities: listCommunities(),
    owners: listOwners(),
    properties: listProperties(),
    tenants: listTenants(),
    roles: listRoles(),
  };
}
export function allowed(
  user,
  permission,
  resourceId = "",
  data = policyData(),
) {
  return can(user, permission, resourceId, data);
}
export function publicUser(user) {
  const { passwordHash, resetToken, resetTokenExpira, ssoId, ...safe } = user;
  return { ...safe, activo: !!user.activo };
}
export function createSession(user, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const configuredHours = Number(getSettings().duracionSesionHoras);
  const hours = Number.isFinite(configuredHours)
    ? Math.min(720, Math.max(1, configuredHours))
    : 8;
  const maxAge = hours * 60 * 60 * 1000;
  db.prepare("DELETE FROM sessions WHERE expiresAt < ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, ?)",
  ).run(digest(token), user.id, Date.now() + maxAge);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}
export function sessionUser(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  req.sessionHash = digest(token);
  const row = db
    .prepare(
      "SELECT users.* FROM sessions JOIN users ON users.id = sessions.userId WHERE sessions.tokenHash = ? AND sessions.expiresAt > ? AND users.activo = 1",
    )
    .get(req.sessionHash, Date.now());
  return row || null;
}
export function endSession(req, res) {
  if (req.sessionHash)
    db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(req.sessionHash);
  res.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
export function requireSession(req, res, next) {
  req.user = sessionUser(req);
  if (!req.user)
    return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}
export function sameOrigin(req, res, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== `${req.protocol}://${req.get("host")}`)
    ) {
      return res
        .status(403)
        .json({ error: "Origen de la petición no permitido." });
    }
  }
  next();
}
export function requirePermission(permission) {
  return (req, res, next) =>
    allowed(req.user, permission)
      ? next()
      : res
          .status(403)
          .json({ error: "No tienes permiso para esta operación." });
}

export function visibleData(user) {
  const data = policyData();
  const permits = (p, id) => allowed(user, p, id, data);
  const tenants = data.tenants.filter((t) => permits("tenant:read", t.id));
  return {
    communities: data.communities.filter((c) =>
      permits("community:read", c.id),
    ),
    owners: data.owners.flatMap((o) =>
      permits("owner:read", o.id)
        ? [o]
        : tenants.some((t) => t.userId === user.id && t.ownerId === o.id)
          ? [{ id: o.id, name: o.name, surname: o.surname, propertyIds: [] }]
          : [],
    ),
    properties: data.properties.filter((p) => permits("property:read", p.id)),
    tenants,
    users: permits("admin:users") ? listUsers() : [publicUser(user)],
    roles:
      permits("admin:roles") || permits("admin:users")
        ? data.roles
        : data.roles.filter((r) => r.nombre === user.rol || r.id === user.rol),
  };
}
