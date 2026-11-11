import { db } from "./db.js";
import {
  materialize,
  postById,
  canRead,
  phase,
} from "./communication-store.js";
import { sendMessage, destination } from "./delivery-providers.js";
import { processRecoveryMail, recoverInterruptedMail } from "./password-recovery.js";
import { textosActuales, aplicarPlantilla, nombrePlataforma } from "./textos-envio.js";
import { processFeeNotifications, recoverFeeMail } from "./fee-worker.js";

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
            const textos = textosActuales();
            const comunidad = db.prepare("SELECT name FROM communities WHERE id=?").get(post.communityId)?.name || "";
            const valores = {
              titulo: post.title,
              texto: post.body,
              plataforma: nombrePlataforma(),
              comunidad,
              fecha: post.startsAt ? new Date(post.startsAt).toLocaleString("es-ES") : "",
            };
            let texto;
            let asunto;
            if (item.kind === "reminder") {
              texto = aplicarPlantilla(textos.recordatorioTexto, valores);
              asunto = aplicarPlantilla(textos.emailRecordatorioAsunto, valores);
            } else if (item.channel === "email") {
              asunto = aplicarPlantilla(textos.emailAvisoAsunto, valores);
              texto = aplicarPlantilla(textos.emailAvisoCuerpo, valores);
            } else if (item.channel === "whatsapp") {
              texto = aplicarPlantilla(textos.whatsappAviso, valores);
            } else {
              texto = aplicarPlantilla(textos.smsAviso, valores);
            }
            if (item.kind === "updated") texto = `Actualización. ${texto}`;
            if (item.kind === "cancelled") texto = `Cancelado. ${texto}`;
            if (item.kind === "minutes") texto = `Acta disponible. ${texto}`;
            providerId = await send(item.channel, to, texto, undefined, asunto);
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
  recoverFeeMail();
  recoverInterruptedMail();
  // Un envío interrumpido puede haber sido aceptado: no se reenvía automáticamente.
  db.prepare(
    "UPDATE communication_outbox SET state='uncertain',error='El servidor se reinició durante el envío. Revisá el proveedor antes de reintentar.' WHERE state='sending'",
  ).run();
  const tick = () =>
    processRecoveryMail().then(() => processCommunications()).then(() => processFeeNotifications()).catch((error) =>
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
