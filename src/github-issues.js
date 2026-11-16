import crypto from "node:crypto";
import path from "node:path";

export const DEFAULT_ISSUE_LABEL = "User-Detected-Issue";
export const DEFAULT_ATTACHMENTS_BRANCH = "main";
export const DEFAULT_REPOSITORY = "tavoibarra912/AppComunidadVecinos";

export const ISSUE_ATTACHMENT_EXTENSIONS = Object.freeze([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
]);
export const ISSUE_MAX_FILES = 5;
export const ISSUE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ISSUE_MAX_TOTAL_BYTES = 15 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BRANCH = /^[A-Za-z0-9._-]+$/;

export class GithubIssueError extends Error {
  constructor(message, { status = 0, kind = "api", cause } = {}) {
    super(message, { cause });
    this.name = "GithubIssueError";
    this.status = status;
    this.kind = kind;
  }
}

/**
 * Configuración de la integración con GitHub. El token solo vive en el
 * servidor: nunca se envía al navegador ni se guarda en la base de datos.
 */
export function githubIssuesConfig(env = process.env) {
  const token = String(env.GITHUB_ISSUES_TOKEN || "").trim();
  const repository = String(env.GITHUB_ISSUES_REPO || DEFAULT_REPOSITORY).trim();
  const label = String(env.GITHUB_ISSUES_LABEL || DEFAULT_ISSUE_LABEL).trim();
  const requestedBranch = String(
    env.GITHUB_ISSUES_ATTACHMENTS_BRANCH || DEFAULT_ATTACHMENTS_BRANCH,
  ).trim();
  // Las instalaciones anteriores no deben recrear la rama de adjuntos retirada.
  const attachmentsBranch =
    requestedBranch !== "issue-attachments" && SAFE_BRANCH.test(requestedBranch)
      ? requestedBranch
      : DEFAULT_ATTACHMENTS_BRANCH;
  const apiUrl = String(env.GITHUB_ISSUES_API_URL || "https://api.github.com")
    .trim()
    .replace(/\/+$/, "");
  const rawUrl = String(env.GITHUB_ISSUES_RAW_URL || "https://raw.githubusercontent.com")
    .trim()
    .replace(/\/+$/, "");
  return {
    token,
    repository,
    label,
    attachmentsBranch,
    apiUrl,
    rawUrl,
    enabled: Boolean(token && label && SAFE_REPOSITORY.test(repository) && apiUrl && rawUrl),
  };
}

const labelChecks = new Map();
const branchChecks = new Map();

function once(map, key, factory) {
  if (!map.has(key)) {
    const pending = Promise.resolve().then(factory);
    pending.catch(() => map.delete(key));
    map.set(key, pending);
  }
  return map.get(key);
}

function inline(value, max = 300) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function codeSpan(value, max = 300) {
  const text = inline(value, max).replace(/`/g, "'");
  return text ? `\`${text}\`` : "—";
}

function markdownLabel(value) {
  return inline(value, 180).replace(/[[\]]/g, "(") || "adjunto";
}

function attachmentBlock(file) {
  const label = markdownLabel(file.name);
  return IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase())
    ? `![${label}](${file.rawUrl})`
    : `- [${label}](${file.rawUrl})`;
}

/** Cuerpo del issue, con el contexto técnico que se usa para reproducir fallos. */
export function buildIssueBody({ description, steps = "", context = {}, attachments = [] }) {
  const parts = [
    "### Descripción",
    String(description || "").trim(),
    "",
    "### Pasos para reproducir",
    String(steps || "").trim() || "_No indicados._",
    "",
    "### Contexto técnico",
    `- **Usuario:** ${codeSpan(context.username, 120)}`,
    `- **Rol:** ${codeSpan(context.role, 120)}`,
    `- **Fecha:** ${codeSpan(context.date, 80)}`,
    `- **Pantalla:** ${codeSpan(context.screen, 500)}`,
    `- **Navegador:** ${codeSpan(context.userAgent, 300)}`,
    `- **Idioma:** ${codeSpan(context.language, 60)}`,
    `- **Resolución:** ${codeSpan(context.viewport, 60)}`,
    `- **Versión de la aplicación:** ${codeSpan(context.appVersion, 60)}`,
  ];
  if (attachments.length) {
    parts.push("", "### Adjuntos", ...attachments.map(attachmentBlock));
  }
  parts.push(
    "",
    "---",
    "_Reporte enviado desde la aplicación por un usuario con sesión iniciada._",
  );
  return parts.join("\n");
}

/**
 * Cliente mínimo de la API REST de GitHub. Crea la etiqueta y la rama de
 * adjuntos una sola vez por proceso, sube los archivos como commits a esa rama
 * y crea el issue con enlaces al contenido subido.
 */
export function createGithubIssueClient({
  config = githubIssuesConfig(),
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  log = console,
} = {}) {
  if (!config.enabled) {
    throw new GithubIssueError("La integración con GitHub no está configurada.", {
      kind: "config",
    });
  }
  const repoPath = `/repos/${config.repository}`;

  async function request(method, apiPath, body) {
    let response;
    try {
      response = await fetchImpl(`${config.apiUrl}${apiPath}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AppComunidadVecinos-Issue-Reporter",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw new GithubIssueError("No se pudo conectar con GitHub.", {
        kind: "network",
        cause: error,
      });
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail = inline(data?.message, 300) || `HTTP ${response.status}`;
      throw new GithubIssueError(`GitHub respondió ${response.status}: ${detail}`, {
        status: response.status,
        kind: "api",
      });
    }
    return data;
  }

  function ensureLabel() {
    const key = `${config.apiUrl}|${config.repository}|${config.label}`;
    return once(labelChecks, key, async () => {
      try {
        await request("GET", `${repoPath}/labels/${encodeURIComponent(config.label)}`);
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      try {
        await request("POST", `${repoPath}/labels`, {
          name: config.label,
          color: "d73a4a",
          description: "Incidencia detectada por un usuario desde la aplicación",
        });
      } catch (error) {
        // 422: otra petición la creó entre la comprobación y el alta.
        if (error.status !== 422) throw error;
      }
    });
  }

  function ensureAttachmentsBranch() {
    const key = `${config.apiUrl}|${config.repository}|${config.attachmentsBranch}`;
    return once(branchChecks, key, async () => {
      try {
        await request(
          "GET",
          `${repoPath}/git/ref/heads/${encodeURIComponent(config.attachmentsBranch)}`,
        );
        return;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      const repository = await request("GET", repoPath);
      const baseBranch = String(repository?.default_branch || "").trim();
      if (!baseBranch) {
        throw new GithubIssueError("GitHub no indicó la rama principal del repositorio.");
      }
      const base = await request(
        "GET",
        `${repoPath}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
      );
      const sha = String(base?.object?.sha || "").trim();
      if (!sha)
        throw new GithubIssueError("GitHub no devolvió la referencia de la rama principal.");
      try {
        await request("POST", `${repoPath}/git/refs`, {
          ref: `refs/heads/${config.attachmentsBranch}`,
          sha,
        });
      } catch (error) {
        if (error.status !== 422) throw error;
      }
    });
  }

  async function uploadAttachment(file, branch = config.attachmentsBranch) {
    const extension = path.extname(file.name || "").toLowerCase();
    const day = now().toISOString().slice(0, 10);
    const storedPath = `reportes/${day}/${crypto.randomUUID()}${extension}`;
    const result = await request("PUT", `${repoPath}/contents/${storedPath}`, {
      message: `chore(issues): adjunto de reporte (${inline(file.name, 80) || "archivo"})`,
      content: file.buffer.toString("base64"),
      branch,
    });
    return {
      name: file.name,
      path: storedPath,
      sha: String(result?.content?.sha || ""),
      branch,
      rawUrl: `${config.rawUrl}/${config.repository}/${config.attachmentsBranch}/${storedPath}`,
    };
  }

  async function removeAttachment(file) {
    if (!file.sha) return;
    try {
      await request("DELETE", `${repoPath}/contents/${file.path}`, {
        message: `chore(issues): retirar adjunto no publicado (${inline(file.name, 80) || "archivo"})`,
        sha: file.sha,
        branch: file.branch || config.attachmentsBranch,
      });
    } catch (error) {
      log.warn?.(`[issues] No se pudo retirar el adjunto ${file.path}: ${error.message}`);
    }
  }

  async function createReport({
    title,
    description,
    steps,
    context = {},
    files = [],
    appVersion = "",
  }) {
    await ensureLabel();
    if (files.length) await ensureAttachmentsBranch();
    const uploaded = [];
    let temporaryBranch = "";
    let pullNumber = 0;
    let merged = false;
    try {
      for (const file of files) {
        try {
          uploaded.push(await uploadAttachment(file, temporaryBranch || config.attachmentsBranch));
        } catch (error) {
          // main puede exigir PR: se respeta su protección y no se conserva
          // una segunda rama como almacenamiento de adjuntos.
          if (
            temporaryBranch ||
            uploaded.length ||
            config.attachmentsBranch !== "main" ||
            ![403, 409, 422].includes(error.status) ||
            !/protected branch|pull request|GH006|GH013/i.test(error.message)
          )
            throw error;
          const base = await request("GET", `${repoPath}/git/ref/heads/main`);
          const branch = `report-upload-${crypto.randomUUID()}`;
          await request("POST", `${repoPath}/git/refs`, {
            ref: `refs/heads/${branch}`,
            sha: base.object.sha,
          });
          temporaryBranch = branch;
          uploaded.push(await uploadAttachment(file, temporaryBranch));
        }
      }
      if (temporaryBranch) {
        const head = await request("GET", `${repoPath}/git/ref/heads/${temporaryBranch}`);
        const pull = await request("POST", `${repoPath}/pulls`, {
          title: `chore(issues): adjuntos de ${inline(title, 80)}`,
          body: "Integra los adjuntos del formulario de reportes en main y elimina la rama temporal al terminar.",
          head: temporaryBranch,
          base: "main",
        });
        pullNumber = Number(pull.number);
        if (!Number.isInteger(pullNumber) || pullNumber < 1) {
          throw new GithubIssueError("GitHub no devolvió la PR de los adjuntos.");
        }
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const result = await request("PUT", `${repoPath}/pulls/${pullNumber}/merge`, {
              sha: head.object.sha,
              merge_method: "merge",
            });
            if (!result.merged)
              throw new GithubIssueError("GitHub no confirmó la integración de los adjuntos.");
            merged = true;
            break;
          } catch (error) {
            if (![405, 409].includes(error.status) || attempt === 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          }
        }
        await request("DELETE", `${repoPath}/git/refs/heads/${temporaryBranch}`);
        temporaryBranch = "";
        for (const file of uploaded) file.branch = "main";
      }
      const body = buildIssueBody({
        description,
        steps,
        context: { ...context, appVersion },
        attachments: uploaded,
      });
      const issue = await request("POST", `${repoPath}/issues`, {
        title,
        body,
        labels: [config.label],
      });
      const number = Number(issue?.number);
      const url = String(issue?.html_url || "");
      if (!Number.isInteger(number) || number <= 0 || !/^https?:\/\//.test(url)) {
        throw new GithubIssueError("GitHub no devolvió los datos del issue creado.");
      }
      return { number, url, attachments: uploaded.length };
    } catch (error) {
      if (!temporaryBranch) await Promise.allSettled(uploaded.map(removeAttachment));
      throw error;
    } finally {
      if (temporaryBranch) {
        if (pullNumber && !merged) {
          await request("PATCH", `${repoPath}/pulls/${pullNumber}`, { state: "closed" }).catch(
            (error) => {
              log.warn?.(`[issues] No se pudo cerrar la PR temporal: ${error.message}`);
            },
          );
        }
        await request("DELETE", `${repoPath}/git/refs/heads/${temporaryBranch}`).catch((error) => {
          log.warn?.(`[issues] No se pudo retirar la rama temporal: ${error.message}`);
        });
      }
    }
  }

  return { createReport };
}
