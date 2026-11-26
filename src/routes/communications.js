import { Router } from "express";
import crypto from "node:crypto";
import path from "node:path";
import multer from "multer";
import { db } from "../db.js";
import { recordAudit } from "../audit.js";
import { documentLimits, allowedDocumentLabels, detectContentType } from "../document-policy.js";
import { policyData, allowed } from "../security.js";
import { textosActuales, aplicarPlantilla, nombrePlataforma } from "../textos-envio.js";
import { explicitLegalRegime, legalConfigOf } from "../legal-config.js";
import {
  allPosts,
  postById,
  superAdmin,
  canPublish,
  canModerate,
  resolveAudience,
  canRead,
  phase,
  attendanceOpen,
  audit,
  getPreferences,
  recordConsentChange,
  consentHistory,
  queue,
  materialize,
  mayVote,
  ballotWeights,
  ensureVotingCensus,
  votingCoefficientProblem,
  pollOpen,
  summary,
  detail,
  problem,
  transaction,
  safeRecipient,
} from "../communication-store.js";
import { validatePost } from "../communication-validation.js";
import {
  providers,
  saveProviders,
  emailAddress,
  phoneNumber,
  sendMessage,
} from "../delivery-providers.js";

const router = Router();
const route = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((error) =>
      error.status ? res.status(error.status).json({ error: error.message }) : next(error),
    );
const adminOnly = (req) => {
  if (!allowed(req.user, "admin:providers", "", policyData()))
    throw problem("No tienes permiso para configurar los proveedores de comunicación.", 403);
};
function find(req, manage = false) {
  materialize();
  const post = postById(req.params.id);
  if (!post || !(manage ? canPublish(req.user, post.communityId) : canRead(req.user, post)))
    throw problem("Publicación no encontrada o sin acceso.", 404);
  return post;
}
const mutable = (post) => {
  if (["draft", "scheduled", "cancelled", "archived"].includes(phase(post)))
    throw problem("Esta publicación no admite nuevas respuestas.", 409);
};

router.get(
  "/providers",
  route((req, res) => {
    adminOnly(req);
    res.json(providers());
  }),
);
router.put(
  "/providers",
  route((req, res) => {
    adminOnly(req);
    const result = saveProviders(req.body);
    audit("providers", req.user.id, "providers-updated");
    res.json(result);
  }),
);
const testTimes = new Map();
router.post(
  "/providers/test",
  route(async (req, res) => {
    adminOnly(req);
    const { channel, to } = req.body || {};
    if (!["email", "sms", "whatsapp"].includes(channel)) throw problem("Canal no válido.");
    if (Date.now() - (testTimes.get(req.user.id) || 0) < 10000)
      throw problem("Espera 10 segundos antes de enviar otra prueba.", 429);
    testTimes.set(req.user.id, Date.now());
    try {
      await sendMessage(
        channel,
        to,
        aplicarPlantilla(textosActuales().pruebaTexto, { plataforma: nombrePlataforma() }),
      );
      audit("providers", req.user.id, `test-${channel}-accepted`);
      res.json({
        message:
          "El proveedor aceptó el mensaje de prueba. Revisa el destino; no implica confirmación de entrega.",
      });
    } catch (error) {
      throw problem(
        error.status
          ? error.message
          : "No se pudo enviar la prueba. Revisa el proveedor, las credenciales y la conexión.",
        502,
      );
    }
  }),
);
router.get(
  "/preferences",
  route((req, res) =>
    res.json({ ...getPreferences(req.user), history: consentHistory(req.user.id) }),
  ),
);
router.put(
  "/preferences",
  route((req, res) => {
    const b = req.body || {};
    const previous = getPreferences(req.user);
    const p = {
      email: typeof b.email === "string" ? b.email.trim() : "",
      phone: typeof b.phone === "string" ? b.phone.trim() : "",
      emailEnabled: b.emailEnabled === true,
      smsEnabled: b.smsEnabled === true,
      whatsappEnabled: b.whatsappEnabled === true,
      // Un cliente que aún no envía el campo no debe levantar la oposición.
      noContact: b.noContact === undefined ? previous.noContact === true : b.noContact === true,
    };
    if ((p.email || p.emailEnabled) && !emailAddress(p.email))
      throw problem("Indica un email válido para recibir avisos.");
    if ((p.phone || p.smsEnabled || p.whatsappEnabled) && !phoneNumber(p.phone))
      throw problem("Indica un teléfono internacional, por ejemplo +34600111222.");
    db.prepare(
      "INSERT INTO communication_preferences(userId,data) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data",
    ).run(req.user.id, JSON.stringify(p));
    // Solo se registra lo que cambió: el historial es la prueba del consentimiento.
    for (const channel of ["email", "sms", "whatsapp", "noContact"])
      if (!!previous[channel] !== !!p[channel])
        recordConsentChange(req.user.id, channel, p[channel]);
    res.json({ ...p, history: consentHistory(req.user.id) });
  }),
);
router.get(
  "/metadata",
  route((req, res) => {
    const data = policyData();
    const communities = data.communities.filter(
      (c) => canPublish(req.user, c.id, data) || canAccessCommunity(req.user, c.id, data),
    );
    res.json({
      superAdmin: superAdmin(req.user, data),
      communities: communities.map((c) => ({
        id: c.id,
        name: c.name,
        regimen: legalConfigOf(c).regimen,
        canManage: canPublish(req.user, c.id, data),
      })),
      selectors: communities
        .filter((c) => canPublish(req.user, c.id, data))
        .map((c) => {
          const { members } = resolveAudience(c.id, { mode: "all" }, data);
          return {
            communityId: c.id,
            owners: members.owners.map((o) => ({
              id: o.id,
              name: `${o.name} ${o.surname}`,
              linked: !!o.userId,
            })),
            tenants: members.tenants.map((t) => ({
              id: t.id,
              name: `${t.name} ${t.surname}`,
              linked: !!t.userId,
            })),
            properties: members.properties.map((p) => ({
              id: p.id,
              name: [p.plot, p.floor, p.door, p.address].filter(Boolean).join(" · ") || p.id,
            })),
          };
        }),
    });
  }),
);
function requireExplicitLegalRegime(communityId, action) {
  const community = db
    .prepare("SELECT id, legalConfig FROM communities WHERE id=?")
    .get(communityId);
  if (!explicitLegalRegime(community))
    throw problem(
      `Configura el régimen jurídico de la comunidad (LPH o asociación) antes de ${action}.`,
      409,
    );
}

function canAccessCommunity(user, id, data) {
  const { members } = resolveAudience(id, { mode: "all" }, data);
  return [...members.owners, ...members.tenants].some((p) => p.userId === user.id);
}
router.post(
  "/preview",
  route((req, res) => {
    const data = policyData();
    materialize();
    const existing = req.body?.id ? postById(req.body.id) : null;
    if (req.body?.id && (!existing || !canPublish(req.user, existing.communityId, data)))
      throw problem("Publicación no encontrada o sin acceso.", 404);
    const p = validatePost(req.body, existing, data);
    if (!canPublish(req.user, p.communityId, data))
      throw problem("No puedes publicar en esta comunidad.", 403);
    let { recipients, unlinked } = resolveAudience(p.communityId, p.audience, data);
    if (existing?.distributed) {
      recipients = db
        .prepare(
          "SELECT users.* FROM users JOIN communication_recipients r ON r.userId=users.id WHERE r.postId=? AND users.activo=1",
        )
        .all(existing.id)
        .filter((u) => canRead(u, existing, data));
      unlinked = [];
    }
    const config = providers();
    // Quien se ha opuesto a la comunicación externa sigue recibiendo los avisos
    // dentro de la app, pero no cuenta como destinatario de ningún canal.
    const excluded = recipients.filter((u) => getPreferences(u).noContact).length;
    res.json({
      recipients: recipients.map(safeRecipient),
      excluded,
      unlinked: unlinked.map((p) => ({ name: `${p.name} ${p.surname}` })),
      channels: Object.fromEntries(
        p.channels.map((c) => [
          c,
          {
            enabled: config[c === "email" ? "smtp" : c].enabled,
            optedIn: recipients.filter(
              (u) => !getPreferences(u).noContact && getPreferences(u)[`${c}Enabled`],
            ).length,
          },
        ]),
      ),
    });
  }),
);
router.post(
  "/inbox/read-all",
  route((req, res) => {
    const policy = policyData(),
      now = new Date().toISOString();
    const visible = allPosts().filter(
      (p) => canRead(req.user, p, policy) && !["draft", "scheduled"].includes(phase(p)),
    );
    let updated = 0;
    const postIds = [];
    transaction(() => {
      const mark = db.prepare(
        "UPDATE communication_recipients SET readAt=? WHERE postId=? AND userId=? AND readAt=''",
      );
      for (const post of visible) {
        const changes = mark.run(now, post.id, req.user.id).changes;
        updated += changes;
        if (changes) postIds.push(post.id);
      }
    });
    res.json({ ok: true, updated, postIds, readAt: now });
  }),
);
router.get(
  "/posts",
  route((req, res) => {
    materialize();
    const data = policyData();
    res.json(
      allPosts()
        .filter((p) => canRead(req.user, p, data))
        .map((p) => summary(p, req.user, data)),
    );
  }),
);
router.post(
  "/posts",
  route((req, res) => {
    const data = policyData(),
      p = validatePost(req.body, null, data);
    if (!canPublish(req.user, p.communityId, data))
      throw problem("No puedes publicar en esta comunidad.", 403);
    if (p.poll) requireExplicitLegalRegime(p.communityId, "convocar votaciones");
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    transaction(() => {
      db.prepare(
        "INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)",
      ).run(id, p.communityId, JSON.stringify(p), req.user.id, now, now);
      audit(id, req.user.id, "created");
    });
    materialize();
    res.status(201).json(detail(postById(id), req.user));
  }),
);
router.get(
  "/posts/:id",
  route((req, res) => {
    const d = detail(find(req), req.user);
    if (!allowed(req.user, "comm:participacion", d.communityId, policyData())) {
      // Sin participación: no expone comentarios ni consultas (no red social).
      d.comments = [];
      d.poll = null;
    }
    res.json(d);
  }),
);
router.put(
  "/posts/:id",
  route((req, res) => {
    const old = find(req, true),
      p = validatePost(req.body, old, policyData());
    if (req.body.version !== old.version)
      throw problem("La publicación cambió. Recárgala antes de guardar.", 409);
    // La regla de voto se congela al convocar; una consulta ya existente
    // conserva la suya aunque la comunidad cambie después de régimen.
    if (p.poll && !old.poll) requireExplicitLegalRegime(p.communityId, "convocar votaciones");
    transaction(() => {
      const comparable = (post) => {
        const { poll, ...content } = post;
        const { closed, ...pollContent } = poll || {};
        return JSON.stringify({ ...content, poll: poll ? pollContent : null });
      };
      // Compara únicamente los campos normalizados del payload, sin metadatos.
      const previous = Object.fromEntries(Object.keys(p).map((key) => [key, old[key]]));
      const contentChanged = comparable(previous) !== comparable(p);
      const onlyPollState =
        !!old.poll && !!p.poll && old.poll.closed !== p.poll.closed && !contentChanged;
      db.prepare(
        "UPDATE communication_posts SET data=?,updatedAt=?,version=version+1 WHERE id=?",
      ).run(JSON.stringify(p), new Date().toISOString(), old.id);
      if (!contentChanged)
        db.prepare(
          "UPDATE communication_outbox SET version=? WHERE postId=? AND version=? AND state IN ('pending','failed','skipped','uncertain')",
        ).run(old.version + 1, old.id, old.version);
      audit(
        old.id,
        req.user.id,
        onlyPollState
          ? p.poll.closed
            ? "poll-closed"
            : "poll-reopened"
          : !contentChanged
            ? "unchanged"
            : p.status === "cancelled"
              ? "cancelled"
              : "updated",
      );
      if (
        contentChanged &&
        db
          .prepare("SELECT 1 FROM communication_audit WHERE postId=? AND action='published'")
          .get(old.id)
      ) {
        db.prepare("UPDATE communication_recipients SET readAt='',receiptAt='' WHERE postId=?").run(
          old.id,
        );
        queue(postById(old.id), p.status === "cancelled" ? "cancelled" : "updated");
      }
    });
    materialize();
    res.json(detail(postById(old.id), req.user));
  }),
);
router.delete(
  "/posts/:id",
  route((req, res) => {
    const p = find(req);
    const data = policyData();
    const canErase =
      p.createdBy === req.user.id ||
      canModerate(req.user, p.communityId, data) ||
      allowed(req.user, "comm:eliminar", p.communityId, data);
    if (!canErase) throw problem("No puedes eliminar esta publicación.", 403);
    // Se conserva un rastro de auditoría global aunque las filas post-específicas
    // de communication_audit se borren con la publicación.
    recordAudit({
      actor: req.user,
      action: "communications.post-deleted",
      resourceType: "post",
      resourceId: p.id,
      outcome: "success",
      req,
      details: { createdBy: p.createdBy, communityId: p.communityId },
    });
    transaction(() => {
      db.prepare("DELETE FROM communication_recipients WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_comments WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_ballots WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_voting_census WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_files WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_outbox WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_audit WHERE postId=?").run(p.id);
      db.prepare("DELETE FROM communication_posts WHERE id=?").run(p.id);
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/read",
  route((req, res) => {
    const p = find(req);
    db.prepare(
      "UPDATE communication_recipients SET readAt=CASE WHEN readAt='' THEN ? ELSE readAt END WHERE postId=? AND userId=?",
    ).run(new Date().toISOString(), p.id, req.user.id);
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/receipt",
  route((req, res) => {
    const p = find(req);
    mutable(p);
    if (!p.receiptRequired) throw problem("Esta publicación no solicita confirmación.");
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "UPDATE communication_recipients SET readAt=CASE WHEN readAt='' THEN ? ELSE readAt END,receiptAt=CASE WHEN receiptAt='' THEN ? ELSE receiptAt END WHERE postId=? AND userId=?",
      )
      .run(now, now, p.id, req.user.id);
    if (!result.changes) throw problem("No eres destinatario de esta publicación.", 403);
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/comments",
  route((req, res) => {
    const p = find(req);
    mutable(p);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tienes permiso para participar en Comunicación (comentar).", 403);
    if (!p.commentsEnabled) throw problem("Los comentarios están desactivados.", 409);
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim() || body.trim().length > 3000)
      throw problem("El comentario debe tener entre 1 y 3000 caracteres.");
    const last = db
      .prepare(
        "SELECT createdAt FROM communication_comments WHERE postId=? AND userId=? ORDER BY createdAt DESC LIMIT 1",
      )
      .get(p.id, req.user.id);
    if (last && Date.now() - Date.parse(last.createdAt) < 2000)
      throw problem("Espera un momento antes de volver a comentar.", 429);
    db.prepare(
      "INSERT INTO communication_comments(id,postId,userId,body,createdAt) VALUES (?,?,?,?,?)",
    ).run(crypto.randomUUID(), p.id, req.user.id, body.trim(), new Date().toISOString());
    res.status(201).json({ ok: true });
  }),
);
router.delete(
  "/posts/:id/comments/:commentId",
  route((req, res) => {
    const p = find(req),
      comment = db
        .prepare("SELECT * FROM communication_comments WHERE id=? AND postId=?")
        .get(req.params.commentId, p.id);
    if (!comment || (comment.userId !== req.user.id && !canModerate(req.user, p.communityId)))
      throw problem("No puedes eliminar este comentario.", 403);
    transaction(() => {
      db.prepare("UPDATE communication_comments SET deleted=1,body='' WHERE id=?").run(comment.id);
      audit(p.id, req.user.id, "comment-deleted");
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/ballot",
  route((req, res) => {
    const p = find(req);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem("No tienes permiso para participar en Comunicación (votar).", 403);
    if (!mayVote(req.user, p))
      throw problem(
        "No tienes derecho a voto en esta consulta: tu perfil no pertenece al electorado o el voto está suspendido.",
        403,
      );
    if (!pollOpen(p)) throw problem("La consulta está cerrada.", 409);
    // Defensa para votaciones antiguas: se comprueba el censo congelado (o los
    // datos vivos si aún no existe) antes de aceptar el primer voto.
    const coefficientProblem = votingCoefficientProblem(p);
    if (coefficientProblem) throw problem(coefficientProblem, 409);
    const choices = req.body?.choices;
    if (
      !Array.isArray(choices) ||
      !choices.length ||
      new Set(choices).size !== choices.length ||
      (!p.poll.multiple && choices.length !== 1) ||
      choices.some((c) => !Number.isInteger(c) || c < 0 || c >= p.poll.options.length)
    )
      throw problem("Selecciona opciones válidas.");
    if (
      db
        .prepare("SELECT 1 FROM communication_ballots WHERE postId=? AND userId=?")
        .get(p.id, req.user.id)
    )
      throw problem("Ya registraste tu respuesta.", 409);
    // Las consultas anteriores sin respuestas fijan aquí su censo; las nuevas
    // ya lo guardaron al publicarse. Nunca se reparte usando titularidades vivas.
    transaction(() => {
      ensureVotingCensus(p);
      const existing = db
        .prepare(
          "SELECT userId,choices,weight,weightFrozen FROM communication_ballots WHERE postId=? ORDER BY createdAt,userId",
        )
        .all(p.id);
      const weight =
        ballotWeights(p, [...existing, { userId: req.user.id }]).weights.get(req.user.id) || 0;
      try {
        db.prepare(
          "INSERT INTO communication_ballots (postId,userId,choices,createdAt,weight,weightFrozen) VALUES (?,?,?,?,?,1)",
        ).run(p.id, req.user.id, JSON.stringify(choices), new Date().toISOString(), weight);
      } catch (error) {
        // Dos peticiones simultáneas pueden pasar la comprobación anterior; la
        // clave primaria sigue garantizando una única respuesta por cuenta.
        if (/UNIQUE constraint/.test(error.message))
          throw problem("Ya registraste tu respuesta.", 409);
        throw error;
      }
    });
    res.status(201).json({ ok: true });
  }),
);
router.post(
  "/posts/:id/rsvp",
  route((req, res) => {
    const p = find(req);
    if (!allowed(req.user, "comm:participacion", p.communityId, policyData()))
      throw problem(
        "No tienes permiso para participar en Comunicación (confirmar asistencia).",
        403,
      );
    mutable(p);
    if (p.type !== "meeting" || Date.now() >= Date.parse(p.endsAt))
      throw problem("La reunión no admite confirmaciones.", 409);
    if (!["accepted", "declined", "pending"].includes(req.body?.rsvp))
      throw problem("Respuesta no válida.");
    if (
      !db
        .prepare("UPDATE communication_recipients SET rsvp=? WHERE postId=? AND userId=?")
        .run(req.body.rsvp, p.id, req.user.id).changes
    )
      throw problem("No estás invitado a esta reunión.", 403);
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/attendance",
  route((req, res) => {
    const p = find(req, true);
    if (p.type !== "meeting" || typeof req.body?.attended !== "boolean")
      throw problem("Asistencia no válida.");
    if (!attendanceOpen(p))
      throw problem(
        "Solo se puede registrar asistencia cuando la reunión publicada ya ha comenzado y no está cancelada.",
        409,
      );
    transaction(() => {
      if (
        !db
          .prepare("UPDATE communication_recipients SET attended=? WHERE postId=? AND userId=?")
          .run(req.body.attended ? 1 : 0, p.id, req.body.userId || "").changes
      )
        throw problem("Participante no encontrado.", 404);
      audit(p.id, req.user.id, "attendance-updated");
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/posts/:id/retry",
  route((req, res) => {
    const p = find(req, true);
    const result = db
      .prepare(
        "UPDATE communication_outbox SET state='pending',error='',updatedAt=? WHERE postId=? AND state IN ('failed','skipped','uncertain')",
      )
      .run(new Date().toISOString(), p.id);
    audit(p.id, req.user.id, "delivery-retry-requested");
    res.json({ retried: result.changes });
  }),
);

// Los adjuntos de comunicación usan los mismos límites que la biblioteca
// documental: formatos y tamaño salen de Configuración general → Documentos.
// El tope absoluto del cargador evita retener archivos mayores al máximo
// configurable; el límite efectivo se comprueba después con documentLimits().
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 50 * 1024 * 1024, fields: 2, fieldSize: 100 },
}).single("file");
const uploadMessage = (limits) =>
  `Adjunta un único archivo (${allowedDocumentLabels(limits)}) de hasta ${limits.maxBytes / 1024 / 1024} MB.`;
function fileType(file, limits) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!limits.allowed.has(extension)) return "";
  return detectContentType(file.buffer, extension);
}
router.post(
  "/posts/:id/files",
  (req, res, next) => {
    try {
      find(req, true);
      next();
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.status ? error.message : "No se pudo comprobar el acceso.",
      });
    }
  },
  (req, res, next) =>
    upload(req, res, (error) =>
      error ? res.status(400).json({ error: uploadMessage(documentLimits()) }) : next(),
    ),
  route((req, res) => {
    const p = find(req, true),
      f = req.file,
      kind = req.body.kind || "attachment",
      limits = documentLimits();
    if (
      !f ||
      !["attachment", "minutes"].includes(kind) ||
      (kind === "minutes" && p.type !== "meeting")
    )
      throw problem("Archivo o tipo de documento no válido.");
    if (f.size > limits.maxBytes)
      throw problem(`El archivo supera el límite de ${limits.maxBytes / 1024 / 1024} MB.`);
    const mime = fileType(f, limits);
    if (!mime) throw problem(`Formato no permitido. Usa ${allowedDocumentLabels(limits)}.`);
    if (db.prepare("SELECT COUNT(*) n FROM communication_files WHERE postId=?").get(p.id).n >= 30)
      throw problem("Se admiten hasta 30 documentos por publicación.");
    const id = crypto.randomUUID(),
      name = f.originalname.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180);
    transaction(() => {
      db.prepare("INSERT INTO communication_files VALUES (?,?,?,?,?,?,?,?,?)").run(
        id,
        p.id,
        name,
        mime,
        f.buffer,
        kind,
        0,
        new Date().toISOString(),
        req.user.id,
      );
      audit(p.id, req.user.id, kind === "minutes" ? "minutes-uploaded" : "attachment-uploaded");
    });
    res.status(201).json({ id });
  }),
);
router.get(
  "/posts/:id/files/:fileId",
  route((req, res) => {
    const p = find(req),
      f = db
        .prepare("SELECT * FROM communication_files WHERE id=? AND postId=?")
        .get(req.params.fileId, p.id);
    if (!f || (f.kind === "minutes" && !f.final && !canPublish(req.user, p.communityId)))
      throw problem("Documento no encontrado.", 404);
    res
      .set({
        "Content-Type": f.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g, "%27")}`,
        "X-Content-Type-Options": "nosniff",
      })
      .send(Buffer.from(f.content));
  }),
);
router.post(
  "/posts/:id/files/:fileId/final",
  route((req, res) => {
    const p = find(req, true),
      f = db
        .prepare("SELECT * FROM communication_files WHERE id=? AND postId=?")
        .get(req.params.fileId, p.id);
    if (!f || f.kind !== "minutes") throw problem("Acta no encontrada.", 404);
    if (f.final) throw problem("Esta versión del acta ya está publicada.", 409);
    if (
      !db
        .prepare("SELECT 1 FROM communication_audit WHERE postId=? AND action='published'")
        .get(p.id)
    )
      throw problem("Publica la convocatoria antes de distribuir el acta.", 409);
    transaction(() => {
      db.prepare("UPDATE communication_files SET final=1 WHERE id=?").run(f.id);
      db.prepare("UPDATE communication_posts SET version=version+1,updatedAt=? WHERE id=?").run(
        new Date().toISOString(),
        p.id,
      );
      db.prepare("UPDATE communication_recipients SET readAt='' WHERE postId=?").run(p.id);
      audit(p.id, req.user.id, "minutes-published");
      queue(postById(p.id), "minutes");
    });
    res.json({ ok: true });
  }),
);
router.delete(
  "/posts/:id/files/:fileId",
  route((req, res) => {
    const p = find(req, true),
      f = db
        .prepare("SELECT final FROM communication_files WHERE id=? AND postId=?")
        .get(req.params.fileId, p.id);
    if (!f) throw problem("Documento no encontrado.", 404);
    if (f.final)
      throw problem("El acta publicada se conserva. Sube una nueva versión para corregirla.", 409);
    db.prepare("DELETE FROM communication_files WHERE id=?").run(req.params.fileId);
    audit(p.id, req.user.id, "attachment-deleted");
    res.json({ ok: true });
  }),
);

export default router;
