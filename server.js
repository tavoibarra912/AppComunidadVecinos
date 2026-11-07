import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import apiRouter from "./src/routes/index.js";
import { seedIfEmpty } from "./src/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`[server] No se encontró el directorio público: ${PUBLIC_DIR}`);
  process.exit(1);
}

seedIfEmpty();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "60mb" }));

app.use("/api", apiRouter);

app.use(express.static(PUBLIC_DIR));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("[server] Error no controlado:", error.message);
  res.status(500).json({ error: "Error interno del servidor." });
});

app.listen(PORT, () => {
  console.log(`[server] AppComunidadVecinos escuchando en http://localhost:${PORT}`);
  console.log("[server] Documentación de la API: GET /api/bootstrap, /api/health");
});
