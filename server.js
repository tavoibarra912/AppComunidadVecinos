import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import apiRouter from "./src/routes/index.js";

import { rebuildPropertyTenantReferences } from "./src/domain.js";
import { startCommunicationWorker } from "./src/communication-worker.js";
import { renderIndex } from "./src/branding.js";
import { getSettings } from "./src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`[server] No se encontró el directorio público: ${PUBLIC_DIR}`);
  process.exit(1);
}

// seedDemoComunidades() pausado — se ejecuta manualmente con
// node scripts/seed-demo-comunidades.mjs cuando se necesite.
// if (process.env.NODE_ENV !== "production") {
//   seedDemoComunidades();
// }
rebuildPropertyTenantReferences();

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: "60mb" }));

app.use("/api", apiRouter);
app.get("/vendor/dompurify.mjs", (_req, res) => res.sendFile(path.join(__dirname, "node_modules/dompurify/dist/purify.es.mjs")));

// La página principal llega con la marca embebida (nombre, colores, logo):
// no es un endpoint público y la CSP no permite scripts inline.
app.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(renderIndex(path.join(PUBLIC_DIR, "index.html"), getSettings()));
});
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    // JS/CSS siempre revalidan: nunca más módulos viejos cacheados.
    if (/.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  },
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("[server] Error no controlado:", error.message);
  const status = error.status === 413 ? 413 : error.type === "entity.parse.failed" ? 400 : 500;
  res.status(status).json({ error: status === 413 ? "La petición supera el tamaño permitido." : status === 400 ? "El JSON enviado no es válido." : "Error interno del servidor." });
});

app.listen(PORT, HOST, () => {
  startCommunicationWorker();
  console.log(`[server] AppComunidadVecinos escuchando en http://localhost:${PORT}`);
  console.log("[server] Documentación de la API: GET /api/bootstrap, /api/health");
});
