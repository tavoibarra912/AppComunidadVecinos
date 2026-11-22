import { db } from "./db.js";

// Valida el lote completo antes de borrar: una rectificación que sobrevive
// debe seguir apuntando a su recibo original. La transacción evita carreras.
export function validateReceiptDeletion(ids, { requireCancelled = false } = {}) {
  if (!db.isTransaction) throw new Error("El borrado de recibos requiere una transacción.");
  if (!ids.length) return;
  const batch = JSON.stringify([...new Set(ids)]);
  if (
    requireCancelled &&
    db
      .prepare(
        "SELECT 1 FROM fee_receipts WHERE id IN (SELECT value FROM json_each(?)) AND cancelledAt='' LIMIT 1",
      )
      .get(batch)
  )
    throw Object.assign(new Error("Solo se pueden purgar recibos anulados."), { status: 409 });
  if (
    db
      .prepare(
        `SELECT 1 FROM fee_receipts WHERE rectifiesReceiptId IN (SELECT value FROM json_each(?))
    AND id NOT IN (SELECT value FROM json_each(?)) LIMIT 1`,
      )
      .get(batch, batch)
  )
    throw Object.assign(
      new Error(
        "No se puede borrar un recibo con una rectificación que se conserva. Debe mantenerse la cadena de recibos.",
      ),
      { status: 409 },
    );
}
