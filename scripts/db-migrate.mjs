// Aplica en orden alfabético los archivos SQL de db/migrations/.
//
// Uso: node --env-file=.env scripts/db-migrate.mjs
// Las migraciones ya aplicadas se registran en schema_migrations; el script
// nunca borra ni trunca datos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresPool } from "../src/postgres.js";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "migrations",
);

async function migrate() {
  const pool = postgresPool();
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (await pool.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
  );
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      count += 1;
      console.log(`[db-migrate] aplicada ${file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(`[db-migrate] ${count} migración(es) aplicadas de ${files.length} archivo(s)`);
}

migrate()
  .then(() => postgresPool().end())
  .catch((error) => {
    console.error(`[db-migrate] ${error.message}`);
    process.exitCode = 1;
  });
