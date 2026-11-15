import { db } from "./db.js";

export const EDIT_CONFLICT =
  "Este registro cambió mientras lo editabas. Tus cambios siguen en el formulario. Abre de nuevo la ficha con los datos actuales antes de guardar.";

// Los cuatro CRUD son síncronos. La transacción bloquea otras conexiones entre
// comprobar la versión y guardar, y la respuesta sale solo después del COMMIT.
export function versionedUpdate(table, handler) {
  if (!["communities", "owners", "properties", "tenants"].includes(table))
    throw new Error("Entidad no válida.");
  return (req, res, next) => {
    const send = res.json;
    let body;
    let transaction = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const row = db.prepare(`SELECT version FROM ${table} WHERE id=?`).get(req.params.id);
      if (row && (!Number.isSafeInteger(req.body?.version) || req.body.version < 1)) {
        db.exec("ROLLBACK");
        transaction = false;
        return res
          .status(428)
          .json({ error: "Falta la versión del registro. Vuelve a abrir la ficha." });
      }
      if (row && req.body.version !== row.version) {
        db.exec("ROLLBACK");
        transaction = false;
        return res.status(409).json({ error: EDIT_CONFLICT, code: "EDIT_CONFLICT" });
      }
      res.json = (value) => {
        body = value;
        return res;
      };
      handler(req, res);
      db.exec(res.statusCode >= 400 ? "ROLLBACK" : "COMMIT");
      transaction = false;
      res.json = send;
      return res.json(body);
    } catch (error) {
      if (transaction) db.exec("ROLLBACK");
      res.json = send;
      if (error.status)
        return res.status(error.status).json({
          error: error.message,
          ...(error.status === 409 ? { code: "EDIT_CONFLICT" } : {}),
        });
      return next(error);
    }
  };
}
