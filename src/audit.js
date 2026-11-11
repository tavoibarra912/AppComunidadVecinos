import { db } from "./db.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS access_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, createdAt TEXT NOT NULL,
    actorId TEXT NOT NULL, actorName TEXT NOT NULL, action TEXT NOT NULL,
    resourceType TEXT NOT NULL, resourceId TEXT NOT NULL, outcome TEXT NOT NULL,
    method TEXT NOT NULL, route TEXT NOT NULL, ip TEXT NOT NULL, details TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS access_audit_action ON access_audit(action, id);
`);
const clean = (value, max = 200) => String(value || "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, max);
export function recordAudit({ actor, action, resourceType = "", resourceId = "", outcome = "success", req, details = {} }) {
  // Only explicitly constructed metadata is accepted; callers must never pass request bodies.
  db.prepare(`INSERT INTO access_audit
    (createdAt,actorId,actorName,action,resourceType,resourceId,outcome,method,route,ip,details)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    new Date().toISOString(), clean(actor?.id), clean(actor?.usuario), clean(action),
    clean(resourceType), clean(resourceId), clean(outcome), clean(req?.method, 10),
    clean(req?.auditRoute || req?.route?.path || "", 180), clean(req?.ip, 64), JSON.stringify(details),
  );
}
function snapshot(collection, id) {
  if (!id) return null;
  return collection === "users"
    ? db.prepare("SELECT nombre,apellido,usuario,email,rol,activo FROM users WHERE id=?").get(id) || null
    : db.prepare("SELECT nombre,descripcion,permisos FROM roles WHERE id=?").get(id) || null;
}
export function auditRequests(req, res, next) {
  const path = req.path;
  const known = new Set(["auth", "signin", "signup", "logout", "me", "forgot-password", "reset-password", "change-password", "admin", "users", "roles", "settings", "audit", "owners", "tenants", "communities", "properties", "documents", "communications", "notifications", "bootstrap", "link-owner", "link-tenant"]);
  req.auditRoute = path.split("/").map(segment => !segment || known.has(segment) ? segment : ":id").join("/");
  const mutation = /^\/admin\/(users|roles)(?:\/([^/]+))?(?:\/(link-owner|link-tenant))?$/.exec(path);
  const before = mutation ? snapshot(mutation[1], mutation[2]) : null;
  const json = res.json.bind(res);
  let recorded = false;
  function capture(body) {
    if (recorded) return;
    recorded = true;
    const status = res.statusCode;
    const base = { actor: req.user, req };
    if (path === "/auth/signin" && req.method === "POST") {
      recordAudit({ ...base, action: "login", outcome: status < 400 ? "success" : "failure", resourceType: "user", resourceId: req.auditTarget || req.user?.id || "" });
    } else if (status === 401 || status === 403) {
      recordAudit({ ...base, action: "access-denied", outcome: "denied", details: { status } });
    } else if (mutation && ["POST", "PUT", "DELETE"].includes(req.method) && status < 400) {
      const [ , collection, id, link ] = mutation;
      const resourceId = id || body?.id || "";
      recordAudit({ ...base, action: `${collection}.${link || ({ POST: "created", PUT: "updated", DELETE: "deleted" })[req.method]}`,
        resourceType: collection === "users" ? "user" : "role", resourceId,
        details: { before, after: snapshot(collection, resourceId), ...(collection === "users" && req.body?.password ? { passwordChanged: true } : {}), ...(link ? { profileId: clean(req.body?.[link === "link-owner" ? "ownerId" : "tenantId"]) } : {}) },
      });
    } else if (path === "/auth/logout" && req.method === "POST" && status < 400) {
      recordAudit({ ...base, action: "logout" });
    } else if (path === "/auth/signup" && req.method === "POST" && status < 400) {
      recordAudit({ ...base, action: "users.created", resourceType: "user", resourceId: body.id, details: { after: snapshot("users", body.id) } });
    } else if (path === "/auth/change-password" && req.method === "POST" && status < 400) {
      recordAudit({ ...base, action: "users.password-changed", resourceType: "user", resourceId: req.user.id });
    }
  }
  res.json = body => { capture(body); return json(body); };
  res.once("finish", () => capture());
  next();
}
export function listAudit(query = {}) {
  const limit = Number(query.limit ?? 25), offset = Number(query.offset ?? 0);
  const action = query.action ?? "";
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || typeof action !== "string" || action.length > 80) {
    const error = new Error("Los filtros de auditoría no son válidos.");
    error.status = 400;
    throw error;
  }
  const where = action ? " WHERE action=?" : "";
  const params = action ? [action] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM access_audit${where}`).get(...params).n;
  const items = db.prepare(`SELECT * FROM access_audit${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    .map(row => ({ ...row, details: JSON.parse(row.details) }));
  return { items, total, limit, offset };
}
