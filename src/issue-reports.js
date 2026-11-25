// Historial de «Reportar un error» en Prisma Postgres.
//
// El reporte se sigue enviando a GitHub (src/github-issues.js), que es lo que
// avisa al equipo; aquí queda además una copia consultable por quien lo envió.
// Si DATABASE_URL no está configurada, el envío funciona igual y el historial
// aparece como no disponible en el formulario.
import crypto from "node:crypto";
import { postgresConfigured, postgresPool } from "./postgres.js";

const HISTORY_LIMIT = 10;

function reportFromRow(row) {
  if (!row) return null;
  const issueNumber = row.github_issue_number;
  return {
    id: row.id,
    title: row.title,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    githubIssueNumber:
      issueNumber === null || issueNumber === undefined ? null : Number(issueNumber),
    githubIssueUrl: row.github_issue_url || "",
  };
}

export function issueHistoryEnabled() {
  return postgresConfigured();
}

/** Guarda una copia del reporte que ya se creó en GitHub. */
export async function saveIssueReport({
  userId,
  username = "",
  title,
  description,
  steps = "",
  screen = "",
  userAgent = "",
  language = "",
  viewport = "",
  appVersion = "",
  githubIssueNumber = null,
  githubIssueUrl = "",
}) {
  if (!postgresConfigured()) return null;
  const { rows } = await postgresPool().query(
    `INSERT INTO issue_reports (
       id, user_id, username, title, description, steps, screen, user_agent,
       language, viewport, app_version, github_issue_number, github_issue_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, title, created_at, github_issue_number, github_issue_url`,
    [
      crypto.randomUUID(),
      userId,
      username,
      title,
      description,
      steps,
      screen,
      userAgent,
      language,
      viewport,
      appVersion,
      githubIssueNumber,
      githubIssueUrl,
    ],
  );
  return reportFromRow(rows[0]);
}

/**
 * Borra el historial de reportes de una cuenta al ejercer el derecho de
 * supresión. No es un dato contable: se elimina, no se anonimiza.
 *
 * Sin la migración aplicada la tabla no existe y no hay nada que borrar: se
 * avisa y se sigue, porque un despliegue sin migrar no debe bloquear la baja.
 */
export async function purgeIssueReports(userId, { pool = postgresPool } = {}) {
  if (!postgresConfigured()) return 0;
  try {
    const result = await pool().query("DELETE FROM issue_reports WHERE user_id = $1", [userId]);
    return result?.rowCount || 0;
  } catch (error) {
    // 42P01 = undefined_table en PostgreSQL.
    if (error?.code !== "42P01") throw error;
    console.warn("[issues] la tabla issue_reports no existe; no hay historial que borrar.");
    return 0;
  }
}

/** Historial de la propia cuenta, del reporte más reciente al más antiguo. */
export async function listIssueReportsForUser(userId, { limit = HISTORY_LIMIT } = {}) {
  if (!postgresConfigured()) return [];
  const { rows } = await postgresPool().query(
    `SELECT id, title, created_at, github_issue_number, github_issue_url
       FROM issue_reports
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(reportFromRow);
}
