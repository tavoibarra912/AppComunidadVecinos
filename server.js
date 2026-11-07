import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import apiRouter from "./src/routes/index.js";
import { seedIfEmpty } from "./src/seed.js";
import { rebuildPropertyTenantReferences } from "./src/domain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`[server] No se encontró el directorio público: ${PUBLIC_DIR}`);
  process.exit(1);
}

if (process.env.NODE_ENV !== "production") seedIfEmpty();
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

app.use(express.static(PUBLIC_DIR));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("[server] Error no controlado:", error.message);
  const status = error.status === 413 ? 413 : error.type === "entity.parse.failed" ? 400 : 500;
  res.status(status).json({ error: status === 413 ? "La petición supera el tamaño permitido." : status === 400 ? "El JSON enviado no es válido." : "Error interno del servidor." });
});

app.listen(PORT, HOST, () => {
  console.log(`[server] AppComunidadVecinos escuchando en http://localhost:${PORT}`);
  console.log("[server] Documentación de la API: GET /api/bootstrap, /api/health");
});
