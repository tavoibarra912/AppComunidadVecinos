import { createHash } from "node:crypto";

const WINDOW = 15 * 60_000;
const hash = (value) => createHash("sha256").update(value).digest("hex");

// Cuotas independientes por operación + origen + identidad. Solo signin y
// cambios de contraseña fallidos consumen intentos; los accesos válidos no.
export function createAuthRateLimit({ now = Date.now, maxEntries = 20_000 } = {}) {
  const entries = new Map();
  function active(key, time) {
    const entry = entries.get(key);
    if (entry && entry.until > time) return entry;
    entries.delete(key);
    return null;
  }
  function record(key, time, window = WINDOW) {
    for (const [id, entry] of entries) if (entry.until <= time) entries.delete(id);
    if (!entries.has(key) && entries.size >= maxEntries)
      entries.delete(entries.keys().next().value);
    const entry = active(key, time) || { count: 0, until: time + window };
    entry.count++;
    entries.set(key, entry);
  }
  return (req, res, next) => {
    if (req.method !== "POST") return next();
    // Express admite mayúsculas y barra final en estas rutas.
    const operation = req.path.toLowerCase().replace(/\/+$/, "");
    const rules = {
      "/signin": [15, req.body?.usuario, true],
      "/signup": [20, "", false],
      "/forgot-password": [5, req.body?.email, false],
      "/reset-password": [15, req.body?.token, true],
      "/change-password": [15, req.user?.id || "", true],
      "/deletion-request": [15, req.user?.id || "", true],
    };
    const rule = rules[operation];
    if (!rule) return next();
    const [limit, identity, failuresOnly] = rule;
    const normalized =
      typeof identity === "string" ? identity.trim().toLowerCase().slice(0, 512) : "";
    const key = hash(`${operation}:${req.ip}:${normalized}`);
    const time = now();
    // Tope elevado contra barridos de contraseñas, independiente de otras
    // operaciones. Nunca cuenta accesos correctos de una comunidad tras NAT.
    const sprayKey = hash(`spray:${operation}:${req.ip}`);
    const pair = active(key, time);
    const spray = operation === "/signin" ? active(sprayKey, time) : null;
    if ((pair?.count || 0) >= limit || (spray?.count || 0) >= 500) {
      const until = Math.max(
        pair?.count >= limit ? pair.until : 0,
        spray?.count >= 500 ? spray.until : 0,
      );
      res.set("Retry-After", String(Math.max(1, Math.ceil((until - time) / 1000))));
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Vuelve a intentar en unos minutos." });
    }
    if (!failuresOnly) record(key, time);
    else
      res.once("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) entries.delete(key);
        else if (res.statusCode === 400 || res.statusCode === 401) {
          record(key, now());
          if (operation === "/signin") record(sprayKey, now(), 60_000);
        }
      });
    next();
  };
}
