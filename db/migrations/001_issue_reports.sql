-- Archivo de los reportes enviados desde «Reportar un error».
-- El issue de GitHub sigue siendo la vía de aviso al equipo; esta tabla guarda
-- una copia consultable por el propio usuario desde la aplicación.
CREATE TABLE IF NOT EXISTS issue_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '',
  screen TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  viewport TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  github_issue_number INTEGER,
  github_issue_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_user_created
  ON issue_reports (user_id, created_at DESC);
