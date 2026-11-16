import { Router } from "express";
import { readFileSync } from "node:fs";
import multer from "multer";
import path from "node:path";
import { detectContentType } from "../document-policy.js";
import {
  GithubIssueError,
  ISSUE_ATTACHMENT_EXTENSIONS,
  ISSUE_MAX_FILES,
  ISSUE_MAX_FILE_BYTES,
  ISSUE_MAX_TOTAL_BYTES,
  createGithubIssueClient,
  githubIssuesConfig,
} from "../github-issues.js";

const router = Router();
const APP_VERSION = (() => {
  try {
    return String(
      JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
    );
  } catch {
    return "";
  }
})();

const ALLOWED_LABELS = "PNG, JPG, WebP o PDF";
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REPORTS = 5;
const recentReports = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ISSUE_MAX_FILE_BYTES,
    files: ISSUE_MAX_FILES,
    fields: 12,
    fieldSize: 4096,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowed = ISSUE_ATTACHMENT_EXTENSIONS.includes(extension);
    callback(allowed ? null : new Error(`Formato no permitido. Usa ${ALLOWED_LABELS}.`), allowed);
  },
}).array("files", ISSUE_MAX_FILES);

function receiveAttachments(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `Cada adjunto puede ocupar como máximo ${ISSUE_MAX_FILE_BYTES / 1024 / 1024} MB.`,
        });
      }
      if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          error: `Puedes adjuntar como máximo ${ISSUE_MAX_FILES} archivos.`,
        });
      }
      return res.status(400).json({ error: "No se pudieron leer los adjuntos enviados." });
    }
    return res
      .status(400)
      .json({ error: error.message || `No se pudieron leer los adjuntos. Usa ${ALLOWED_LABELS}.` });
  });
}

function readText(value) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function textError(value, label, { min = 0, max }) {
  if (value.length < min)
    return min <= 1
      ? `${label} es obligatorio.`
      : `${label} debe tener al menos ${min} caracteres.`;
  if (value.length > max) return `${label} no puede superar los ${max} caracteres.`;
  return "";
}

function consumeQuota(userId) {
  const now = Date.now();
  for (const [id, entry] of recentReports) {
    if (entry.until <= now) recentReports.delete(id);
  }
  const entry = recentReports.get(userId);
  if (entry && entry.count >= RATE_MAX_REPORTS) {
    return Math.max(1, Math.ceil((entry.until - now) / 1000));
  }
  if (!entry) {
    recentReports.set(userId, { count: 1, until: now + RATE_WINDOW_MS });
  } else {
    entry.count += 1;
  }
  return 0;
}

function inspectFiles(files) {
  const normalized = [];
  let total = 0;
  for (const file of files || []) {
    const name = readText(file.originalname).slice(0, 255);
    const extension = path.extname(name).toLowerCase();
    if (!ISSUE_ATTACHMENT_EXTENSIONS.includes(extension)) {
      return { error: `Formato no permitido. Usa ${ALLOWED_LABELS}.` };
    }
    if (!file.buffer?.length) return { error: `El archivo «${name}» está vacío.` };
    const contentType = detectContentType(file.buffer, extension);
    if (!contentType) {
      return {
        error: `El contenido de «${name}» no corresponde a un ${extension.slice(1)} válido.`,
      };
    }
    total += file.buffer.length;
    if (total > ISSUE_MAX_TOTAL_BYTES) {
      return { error: "Los adjuntos superan el límite total de 15 MB." };
    }
    normalized.push({ name, buffer: file.buffer, contentType });
  }
  return { files: normalized };
}

router.get("/", (_req, res) => {
  const config = githubIssuesConfig();
  res.json({
    enabled: config.enabled,
    repository: config.repository,
    label: config.label,
  });
});

router.post(
  "/",
  (req, res, next) => {
    if (!githubIssuesConfig().enabled) {
      return res.status(503).json({
        error:
          "El envío de reportes todavía no está configurado en este servidor. Avisa al administrador.",
        code: "not_configured",
      });
    }
    return next();
  },
  receiveAttachments,
  async (req, res, next) => {
    try {
      const title = readText(req.body?.title);
      const description = readText(req.body?.description);
      const steps = readText(req.body?.steps);
      const affected = readText(req.body?.affected);
      const screen = readText(req.body?.screen);
      const userAgent = readText(req.body?.userAgent);
      const language = readText(req.body?.language);
      const viewport = readText(req.body?.viewport);
      const validation =
        textError(title, "El título", { min: 5, max: 140 }) ||
        textError(description, "La descripción", { min: 20, max: 5000 }) ||
        textError(steps, "Los pasos para reproducir", { max: 3000 }) ||
        textError(affected, "La comunidad o unidad", { max: 200 }) ||
        textError(screen, "La pantalla", { max: 500 }) ||
        textError(userAgent, "El navegador", { max: 300 }) ||
        textError(language, "El idioma", { max: 60 }) ||
        textError(viewport, "La resolución", { max: 60 });
      if (validation) return res.status(400).json({ error: validation });

      const inspected = inspectFiles(req.files);
      if (inspected.error) return res.status(400).json({ error: inspected.error });

      const retryAfter = consumeQuota(req.user.id);
      if (retryAfter) {
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: "Has enviado varios reportes seguidos. Espera unos minutos antes de enviar otro.",
        });
      }

      const client = createGithubIssueClient({ config: githubIssuesConfig() });
      const result = await client.createReport({
        title,
        description,
        steps,
        affected,
        files: inspected.files,
        appVersion: APP_VERSION,
        context: {
          username: req.user.usuario,
          role: req.user.rol,
          date: new Date().toISOString(),
          screen,
          userAgent,
          language,
          viewport,
        },
      });
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof GithubIssueError) {
        console.error(`[issues] ${error.kind}: ${error.message}`);
        if ([401, 403].includes(error.status)) {
          return res.status(503).json({
            error:
              "El servicio de reportes no está autorizado en GitHub. Avisa al administrador de la plataforma.",
          });
        }
        return res.status(502).json({
          error: "No se pudo crear el issue en GitHub. Inténtalo de nuevo en unos minutos.",
        });
      }
      return next(error);
    }
  },
);

export default router;
