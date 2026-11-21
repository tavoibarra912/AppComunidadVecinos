import fs from "node:fs";
import path from "node:path";
import { db, UPLOADS_DIR } from "./db.js";

// Se registra en la misma transacción que elimina la fila del justificante.
export function queueFeeProofCleanup(diskName) {
  if (!db.isTransaction)
    throw new Error("La limpieza debe encolarse dentro de la transacción de purga.");
  db.prepare(
    "INSERT INTO fee_proof_cleanup(diskName,createdAt) VALUES(?,?) ON CONFLICT(diskName) DO NOTHING",
  ).run(diskName, new Date().toISOString());
}

// La cola sobrevive a reinicios. ENOENT es éxito: permite repetir un borrado
// aunque el proceso se interrumpiera entre eliminar el archivo y cerrar la tarea.
export function processFeeProofCleanup({
  now = Date.now(),
  limit = 20,
  unlink = fs.unlinkSync,
} = {}) {
  if (db.isTransaction)
    throw new Error("Los archivos solo se eliminan después de confirmar la transacción.");
  const tasks = db
    .prepare(
      "SELECT * FROM fee_proof_cleanup WHERE nextAttemptAt<=? ORDER BY nextAttemptAt,createdAt,diskName LIMIT ?",
    )
    .all(now, limit);
  const root = path.resolve(UPLOADS_DIR, "fee-proofs");
  let deleted = 0,
    failed = 0;
  for (const task of tasks) {
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(task.diskName))
        throw Object.assign(new Error("Nombre de archivo no válido."), { code: "INVALID_PATH" });
      const target = path.resolve(root, task.diskName);
      if (path.dirname(target) !== root)
        throw Object.assign(new Error("Archivo fuera del directorio de justificantes."), {
          code: "INVALID_PATH",
        });
      if (db.prepare("SELECT 1 FROM fee_proofs WHERE diskName=? LIMIT 1").get(task.diskName))
        throw Object.assign(new Error("El archivo sigue vinculado a otro justificante."), {
          code: "FILE_IN_USE",
        });
      try {
        unlink(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      db.prepare("DELETE FROM fee_proof_cleanup WHERE diskName=?").run(task.diskName);
      deleted++;
    } catch (error) {
      const code = String(error.code || "DELETE_FAILED").slice(0, 100);
      const retryAt = now + Math.min(3600000, 30000 * 2 ** Math.min(task.attempts, 7));
      db.prepare(
        "UPDATE fee_proof_cleanup SET attempts=attempts+1,nextAttemptAt=?,lastAttemptAt=?,lastError=? WHERE diskName=?",
      ).run(retryAt, new Date(now).toISOString(), code, task.diskName);
      console.error("[fee-proof-cleanup] Eliminación pendiente:", task.diskName, code);
      failed++;
    }
  }
  return {
    deleted,
    failed,
    pending: db.prepare("SELECT COUNT(*) n FROM fee_proof_cleanup").get().n,
  };
}
