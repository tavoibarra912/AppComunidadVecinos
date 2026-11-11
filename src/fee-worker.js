import { db, getSettings } from "./db.js";
import {
  materializeFeeReminders,
  receiptById,
  receiptView,
  receiptConcept,
  canReadReceipt,
  feeDefaults,
} from "./fees.js";
import { sendMessage, destination } from "./delivery-providers.js";
import { recordAudit } from "./audit.js";

let running = false;
export async function processFeeNotifications(send = sendMessage) {
  if (running) return;
  running = true;
  try {
    materializeFeeReminders();
    const items = db
      .prepare(
        `SELECT m.*,e.receiptId,e.ownerId,e.kind,e.title,e.message FROM fee_mail m
      JOIN fee_events e ON e.id=m.eventId WHERE m.state='pending' ORDER BY e.createdAt LIMIT 20`,
      )
      .all();
    for (const item of items) {
      if (
        !db
          .prepare(
            "UPDATE fee_mail SET state='sending',updatedAt=? WHERE eventId=? AND state='pending'",
          )
          .run(new Date().toISOString(), item.eventId).changes
      )
        continue;
      let state = "skipped",
        error = "";
      try {
        const owner = db
          .prepare("SELECT * FROM owners WHERE id=?")
          .get(item.ownerId);
        const user = owner?.userId
          ? db
              .prepare("SELECT * FROM users WHERE id=? AND activo=1")
              .get(owner.userId)
          : null;
        const row = receiptById(item.receiptId),
          view = receiptView(row);
        const reminder = ["due", "overdue"].includes(item.kind);
        const to = user ? destination(user, "email") : "";
        if (
          !getSettings().notificacionesEmail ||
          !user ||
          !to ||
          !canReadReceipt(user, row)
        )
          error = "Canal deshabilitado o destinatario sin acceso.";
        else if (reminder && (row.cancelledAt || view.outstanding <= 0))
          error = "El recibo ya no está pendiente.";
        else if (row.cancelledAt && item.kind !== "cancelled")
          error = "Recibo anulado.";
        else {
          const templates = feeDefaults(),
            values = {
              titulo: item.title,
              mensaje: reminder
                ? `${receiptConcept(row, view.snapshot)} de ${view.snapshot.property}. Vencimiento: ${row.dueDate}. Pendiente actual: ${(view.outstanding / 100).toFixed(2)} EUR.`
                : item.message,
              comunidad: view.snapshot.community,
            };
          const fill = (text) =>
            text.replace(
              /\{\{(titulo|mensaje|comunidad)\}\}/g,
              (_, key) => values[key],
            );
          await send(
            "email",
            to,
            fill(templates.emailBody),
            undefined,
            fill(templates.emailSubject),
          );
          state = "accepted";
        }
      } catch (failure) {
        state = failure.status ? "failed" : "uncertain";
        error = failure.status
          ? failure.message
          : "Respuesta de envío no confirmada; no se reintenta automáticamente.";
      }
      db.prepare(
        "UPDATE fee_mail SET state=?,error=?,updatedAt=? WHERE eventId=?",
      ).run(state, error.slice(0, 500), new Date().toISOString(), item.eventId);
      if (["failed", "uncertain"].includes(state))
        recordAudit({
          action: "fee.mail",
          outcome: "failure",
          resourceType: "fee",
          resourceId: item.receiptId,
          details: { state, error: error.slice(0, 300) },
        });
    }
  } finally {
    running = false;
  }
}
export function recoverFeeMail() {
  db.prepare(
    "UPDATE fee_mail SET state='uncertain',error='Envío interrumpido; comprobar proveedor antes de reintentar.' WHERE state='sending'",
  ).run();
}
