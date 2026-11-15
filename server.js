import express from "express";
import { createGzip, createBrotliCompress } from "node:zlib";
import { promises as fsp } from "node:fs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import apiRouter from "./src/routes/index.js";

import { rebuildPropertyTenantReferences } from "./src/domain.js";
import { startCommunicationWorker } from "./src/communication-worker.js";
import { renderIndex } from "./src/branding.js";
import { getSettings } from "./src/db.js";
import { seedIfEmpty } from "./src/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`[server] No se encontró el directorio público: ${PUBLIC_DIR}`);
  process.exit(1);
}

// El entorno demo arranca con un censo completo sin sobrescribir bases existentes.
if (process.env.NODE_ENV !== "production") seedIfEmpty();
rebuildPropertyTenantReferences();

const app = express();
app.disable("x-powered-by");
// Solo direcciones/redes explícitas del proxy; las cabeceras del cliente no
// determinan su IP salvo que la conexión llegue desde un proxy de confianza.
if (process.env.TRUST_PROXY?.trim())
  app.set(
    "trust proxy",
    process.env.TRUST_PROXY.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  next();
});
app.use(express.json({ limit: "60mb" }));

app.use("/api", apiRouter);
app.get("/vendor/dompurify.mjs", (_req, res) =>
  res.sendFile(path.join(__dirname, "node_modules/dompurify/dist/purify.es.mjs")),
);

// La página principal llega con la marca embebida (nombre, colores, logo):
// no es un endpoint público y la CSP no permite scripts inline.
app.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(renderIndex(path.join(PUBLIC_DIR, "index.html"), getSettings()));
});
// Compresión gzip/brotli de los estáticos pesados (por encima de 200 KB).
// Los archivos pequeños se sirven sin transformar. Nunca se siguen rutas fuera
// de PUBLIC_DIR y el Content-Type se mantiene por extensión.
const comprimidos = new Map();
const MIME_ESTATICOS = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
function staticHeaders(res, filePath) {
  if (/\.(?:m?js|css)$/i.test(filePath))
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
}
async function archivoComprimido(filePath, brotli, version) {
  const key = brotli ? filePath + ".br" : filePath + ".gz";
  const cached = comprimidos.get(key);
  if (cached?.version === version) return cached.data;
  try {
    const data = await fsp.readFile(filePath);
    const out = await new Promise((resolve, reject) => {
      const stream = brotli ? createBrotliCompress() : createGzip({ level: 6 });
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      stream.end(data);
    });
    comprimidos.set(key, { version, data: out });
    return out;
  } catch {
    return null;
  }
}
app.use(async (req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) return next();
  try {
    const ruta = req.path.split("?")[0];
    const filePath = path.normalize(path.join(PUBLIC_DIR, ruta));
    if (!filePath.startsWith(path.normalize(PUBLIC_DIR) + path.sep)) return next();
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size < 200 * 1024) return next();
    res.vary("Accept-Encoding");
    const encoding = req.acceptsEncodings("br", "gzip", "identity");
    if (!encoding) return res.status(406).end();
    if (encoding === "identity") return next();
    const data = await archivoComprimido(
      filePath,
      encoding === "br",
      `${stat.mtimeMs}:${stat.size}`,
    );
    if (!data) return next();
    const ext = path.extname(filePath).toLowerCase();
    res.set("Content-Encoding", encoding);
    res.set("Content-Type", MIME_ESTATICOS[ext] || "application/octet-stream");
    staticHeaders(res, filePath);
    res.send(data);
  } catch {
    next();
  }
});
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: staticHeaders,
  }),
);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("[server] Error no controlado:", error.message);
  const status = error.status === 413 ? 413 : error.type === "entity.parse.failed" ? 400 : 500;
  res.status(status).json({
    error:
      status === 413
        ? "La petición supera el tamaño permitido."
        : status === 400
          ? "El JSON enviado no es válido."
          : "Error interno del servidor.",
  });
});

app.listen(PORT, HOST, () => {
  startCommunicationWorker();
  console.log(`[server] AppComunidadVecinos escuchando en http://localhost:${PORT}`);
  console.log("[server] Documentación de la API: GET /api/bootstrap, /api/health");
});
