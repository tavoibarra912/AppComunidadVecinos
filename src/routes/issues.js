import { Router } from "express";
import { readFileSync } from "node:fs";
import multer from "multer";
import path from "node:path";
import { allowedDocumentLabels, detectContentType, documentLimits } from "../document-policy.js";
import { GithubIssueError, createGithubIssueClient, githubIssuesConfig } from "../github-issues.js";
import { richTextToPlainText, sanitizeRichText } from "../rich-text.js";

const router = Router();
const APP_VERSION = (() => {
  try {
    return String(
      JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version,
    );
  } catch {
    return "";
  }
})();

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REPORTS = 5;
const MAX_ISSUE_TOTAL_BYTES = 50 * 1024 * 1024;
const recentReports = new Map();

function attachmentLimits() {
  const limits = documentLimits();
  return {
    ...limits,
    maxTotalBytes: Math.min(limits.maxBytes * limits.maxFiles, MAX_ISSUE_TOTAL_BYTES),
  };
}

function megabytes(bytes) {
  const value = bytes / 1024 / 1024;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function allowedLabels(limits) {
  return allowedDocumentLabels(limits) || "PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX";
}

function receiveAttachments(req, res, next) {
  const limits = attachmentLimits();
  const labels = allowedLabels(limits);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: limits.maxBytes,
      files: limits.maxFiles,
      fields: 12,
      // Los límites visibles se validan abajo; el HTML y los caracteres UTF-8
      // necesitan más bytes que el texto mostrado en los editores.
      fieldSize: 64 * 1024,
    },
    fileFilter: (_req, file, callback) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const allowed = limits.allowed.has(extension);
      callback(allowed ? null : new Error(`Formato no permitido. Usa ${labels}.`), allowed);
    },
  }).array("files", limits.maxFiles);

  upload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `Cada adjunto puede ocupar como máximo ${megabytes(limits.maxBytes)} MB.`,
        });
      }
      if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          error: `Puedes adjuntar como máximo ${limits.maxFiles} ${
            limits.maxFiles === 1 ? "archivo" : "archivos"
          }.`,
        });
      }
      return res.status(400).json({ error: "No se pudieron leer los adjuntos enviados." });
    }
    return res
      .status(400)
      .json({ error: error.message || `No se pudieron leer los adjuntos. Usa ${labels}.` });
  });
}

function readText(value) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function textError(value, label, { min = 0, max, empty } = {}) {
  if (!value && min > 0) return empty || `${label} es obligatorio.`;
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

function inspectFiles(files, limits) {
  const normalized = [];
  let total = 0;
  const labels = allowedLabels(limits);
  for (const file of files || []) {
    const name = readText(file.originalname).slice(0, 255);
    const extension = path.extname(name).toLowerCase();
    if (!limits.allowed.has(extension)) {
      return { error: `Formato no permitido. Usa ${labels}.` };
    }
    if (!file.buffer?.length) return { error: `El archivo «${name}» está vacío.` };
    if (file.buffer.length > limits.maxBytes) {
      return {
        error: `El archivo «${name}» supera el límite de ${megabytes(limits.maxBytes)} MB.`,
      };
    }
    const contentType = detectContentType(file.buffer, extension);
    if (!contentType) {
      return {
        error: `El contenido de «${name}» no corresponde a un ${extension.slice(1)} válido.`,
      };
    }
    total += file.buffer.length;
    if (total > limits.maxTotalBytes) {
      return {
        error: `Los adjuntos superan el límite total de ${megabytes(limits.maxTotalBytes)} MB.`,
      };
    }
    normalized.push({ name, buffer: file.buffer, contentType });
  }
  return { files: normalized };
}

router.get("/", (_req, res) => {
  const config = githubIssuesConfig();
  const limits = attachmentLimits();
  res.json({
    enabled: config.enabled,
    repository: config.repository,
    label: config.label,
    attachments: {
      maxFiles: limits.maxFiles,
      maxBytes: limits.maxBytes,
      maxTotalBytes: limits.maxTotalBytes,
      allowed: [...limits.allowed].map((extension) => extension.replace(/^\./, "")),
      labels: allowedLabels(limits),
    },
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
      const description = sanitizeRichText(readText(req.body?.description), {
        maxLength: 20000,
      });
      const descriptionText = richTextToPlainText(description, { maxLength: 20000 });
      const steps = sanitizeRichText(readText(req.body?.steps), { maxLength: 15000 });
      const stepsText = richTextToPlainText(steps, { maxLength: 15000 });
      const screen = readText(req.body?.screen);
      const userAgent = readText(req.body?.userAgent);
      const language = readText(req.body?.language);
      const viewport = readText(req.body?.viewport);
      const validation =
        textError(title, "El título", { min: 5, max: 140 }) ||
        textError(descriptionText, "La descripción", {
          min: 20,
          max: 5000,
          empty: "La descripción es obligatoria.",
        }) ||
        textError(stepsText, "Los pasos para reproducir", { max: 3000 }) ||
        textError(screen, "La pantalla", { max: 500 }) ||
        textError(userAgent, "El navegador", { max: 300 }) ||
        textError(language, "El idioma", { max: 60 }) ||
        textError(viewport, "La resolución", { max: 60 });
      if (validation) return res.status(400).json({ error: validation });

      const limits = attachmentLimits();
      const inspected = inspectFiles(req.files, limits);
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
