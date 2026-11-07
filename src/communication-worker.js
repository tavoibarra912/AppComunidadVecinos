import { db } from "./db.js";
import {
  materialize,
  postById,
  canRead,
  phase,
} from "./communication-store.js";
import { sendMessage, destination } from "./delivery-providers.js";
import { processRecoveryMail, recoverInterruptedMail } from "./password-recovery.js";

let running = false;
export async function processCommunications(send = sendMessage) {
  if (running) return;
  running = true;
  try {
    materialize();
    const rows = db
      .prepare(
        "SELECT * FROM communication_outbox WHERE state='pending' ORDER BY createdAt LIMIT 20",
      )
      .all();
    for (const item of rows) {
      if (
        !db
          .prepare(
            "UPDATE communication_outbox SET state='sending',updatedAt=? WHERE id=? AND state='pending'",
          )
          .run(new Date().toISOString(), item.id).changes
      )
        continue;
      const post = postById(item.postId),
        user = db
          .prepare("SELECT * FROM users WHERE id=? AND activo=1")
          .get(item.userId);
      let state = "skipped",
        error = "",
        providerId = "";
      try {
        if (!post || !user || !canRead(user, post))
          error = "La cuenta ya no tiene acceso a la publicación.";
        else if (item.version !== post.version)
          error = "El aviso fue sustituido por una actualización posterior.";
        else if (
          item.kind === "reminder" &&
          Date.parse(post.startsAt) <= Date.now()
        )
          error = "El evento ya comenzó.";
        else if (
          item.kind === "publication" &&
          ["archived", "finished"].includes(phase(post))
        )
          error = "La vigencia de la publicación ya terminó.";
        else if (post.status === "cancelled" && item.kind !== "cancelled")
          error = "Publicación cancelada.";
        else {
          const to = destination(user, item.channel);
          if (!to) error = "El destinatario no habilitó este canal.";
          else {
            // No se incluye contenido privado en SMS/WhatsApp ni enlaces configurables.
            const labels = {
              publication: "Nueva publicación",
              updated: "Publicación actualizada",
              cancelled: "Publicación cancelada",
              reminder: "Recordatorio",
              minutes: "Acta disponible",
            };
            providerId = await send(
              item.channel,
              to,
              `${labels[item.kind] || "Comunicación"}: ${post.title}. Ingresá en Peñarrubia y abrí Comunicación para consultar los detalles.`,
            );
            state = "accepted";
          }
        }
      } catch (failure) {
        state = failure.status ? "failed" : "uncertain";
        error = failure.status
          ? failure.message
          : "No se pudo confirmar la respuesta del proveedor. Revisá su panel antes de reintentar para evitar duplicados.";
      }
      db.prepare(
        "UPDATE communication_outbox SET state=?,error=?,providerId=?,updatedAt=? WHERE id=?",
      ).run(
        state,
        error.slice(0, 500),
        providerId,
        new Date().toISOString(),
        item.id,
      );
    }
  } finally {
    running = false;
  }
}
export function startCommunicationWorker() {
  recoverInterruptedMail();
  // Un envío interrumpido puede haber sido aceptado: no se reenvía automáticamente.
  db.prepare(
    "UPDATE communication_outbox SET state='uncertain',error='El servidor se reinició durante el envío. Revisá el proveedor antes de reintentar.' WHERE state='sending'",
  ).run();
  const tick = () =>
    processRecoveryMail().then(() => processCommunications()).catch((error) =>
      console.error(
        "[communication-worker]",
        error.status
          ? error.message
          : "No se pudo procesar la cola de comunicaciones.",
      ),
    );
  tick();
  const timer = setInterval(tick, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
