// Conexión compartida a Prisma Postgres.
//
// La URL llega por DATABASE_URL (en el archivo .env, ignorado por git) y nunca
// se escribe en el código. Sin DATABASE_URL la aplicación funciona igual: solo
// el historial de «Reportar un error» queda desactivado.
import pg from "pg";

const POOL_KEY = Symbol.for("app-comunidad-vecinos.postgres.pool");

export function postgresConfigured() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

/** Un único Pool por proceso, reutilizado entre importaciones y en --watch. */
export function postgresPool() {
  if (!postgresConfigured()) {
    throw Object.assign(new Error("Postgres no está configurado en este servidor."), {
      status: 503,
    });
  }
  if (!globalThis[POOL_KEY]) {
    globalThis[POOL_KEY] = new pg.Pool({
      connectionString: String(process.env.DATABASE_URL).trim(),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
    // Un error del pool no debe tumbar el servidor Express.
    globalThis[POOL_KEY].on("error", (error) => {
      console.error(`[postgres] error en el pool: ${error.message}`);
    });
  }
  return globalThis[POOL_KEY];
}
