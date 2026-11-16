// Un origen público fijo permite usar un proxy sin confiar en Host/X-Forwarded-Host
// enviados por el cliente. No se aceptan listas, comodines ni URLs con rutas.
export function publicOrigin(value, production = process.env.NODE_ENV === "production") {
  if (!value) return "";
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && !production && url.protocol === "http:"))
  )
    throw new Error(
      "APP_PUBLIC_URL debe ser un origen HTTPS sin ruta (HTTP solo en desarrollo local).",
    );
  return url.origin;
}

export function isSameOrigin(req, configuredOrigin = "") {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.get("origin");
  return (
    req.get("sec-fetch-site") !== "cross-site" &&
    (!origin || origin === (configuredOrigin || `${req.protocol}://${req.get("host")}`))
  );
}
