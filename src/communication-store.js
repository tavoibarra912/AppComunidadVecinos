import crypto from "node:crypto";
import { db, getSettings } from "./db.js";
import { allowed, policyData, publicUser } from "./security.js";
import { getLocalDateInputValue } from "./domain.js";

db.exec(`
CREATE TABLE IF NOT EXISTS communication_posts (
 id TEXT PRIMARY KEY, communityId TEXT NOT NULL, data TEXT NOT NULL,
 createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_communication_community ON communication_posts(communityId);
CREATE TABLE IF NOT EXISTS communication_recipients (
 postId TEXT NOT NULL, userId TEXT NOT NULL, readAt TEXT NOT NULL DEFAULT '', receiptAt TEXT NOT NULL DEFAULT '',
 rsvp TEXT NOT NULL DEFAULT 'pending', attended INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(postId,userId)
);
CREATE TABLE IF NOT EXISTS communication_comments (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, body TEXT NOT NULL,
 createdAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS communication_ballots (
 postId TEXT NOT NULL, userId TEXT NOT NULL, choices TEXT NOT NULL, createdAt TEXT NOT NULL,
 PRIMARY KEY(postId,userId)
);
CREATE TABLE IF NOT EXISTS communication_files (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL,
 kind TEXT NOT NULL, final INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, createdBy TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS communication_audit (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, action TEXT NOT NULL, createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS communication_preferences (userId TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_providers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS communication_outbox (
 id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, channel TEXT NOT NULL, kind TEXT NOT NULL,
 version INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '',
 providerId TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 UNIQUE(postId,userId,channel,kind,version)
);
`);

const spanishDemoCopy = new Map([
  [
    "Torneo de pádel entre vecinos\u0000Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscribite hasta el jueves respondiendo a este aviso.",
    {
      title: "Torneo de pádel entre vecinos",
      body: "Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscríbete antes del jueves respondiendo a este aviso.",
    },
  ],
  [
    "Clases de yoga gratuitas en el jardín\u0000Profesora voluntaria del edificio da clase de hatha yoga para principiantes. Traé toalla y ropa cómoda. Confirmá asistencia (botón de confirmación).",
    {
      title: "Clases de yoga gratuitas en el jardín",
      body: "Profesora voluntaria del edificio da clase de hatha yoga para principiantes. Trae toalla y ropa cómoda. Confirma tu asistencia (botón de confirmación).",
    },
  ],
  [
    "Mercado solidario de segunda mano\u0000Traé lo que ya no uses y llevate lo que te guste. Lo recaudado va para la reforma del jardín de infancia del barrio.",
    {
      title: "Mercado solidario de segunda mano",
      body: "Trae lo que ya no uses y llévate lo que te guste. Lo recaudado se destinará a la reforma de la escuela infantil del barrio.",
    },
  ],
  [
    "Junta general de propietarios — 2.º trimestre\u0000Convocatoria de la junta general. Si no podés asistir, delegá tu voto respondiendo a este aviso.",
    {
      title: "Junta general de propietarios — 2.º trimestre",
      body: "Convocatoria de la junta general. Si no puedes asistir, delega tu voto respondiendo a este aviso.",
    },
  ],
  [
    "Encuesta: ¿qué actividades querés en el centro social?\u0000El centro social reabre el mes próximo y queremos programarlo con ustedes. Elegí las actividades que te interesan (podés marcar varias).",
    {
      title: "Encuesta: ¿qué actividades te gustaría hacer en el centro social?",
      body: "El centro social reabre el mes próximo y queremos organizar el programa entre todos. Elige las actividades que te interesan (puedes marcar varias).",
    },
  ],
  [
    "¿Renovamos el contrato de la empresa de jardinería?\u0000El contrato de jardinería vence el mes próximo. Votá para que la junta tenga mandato claro en la negociación.",
    {
      title: "¿Renovamos el contrato de la empresa de jardinería?",
      body: "El contrato de jardinería vence el mes próximo. Vota para que la junta tenga mandato claro en la negociación.",
    },
  ],
  [
    "Corte de agua programado el jueves de 9 a 13 h\u0000Por trabajos de mantenimiento de la red municipal, no habrá agua en todo el edificio el jueves de 9:00 a 13:00. Cerrá las llaves de paso antes de salir.",
    {
      title: "Corte de agua programado el jueves de 9 a 13 h",
      body: "Por trabajos de mantenimiento de la red municipal, no habrá agua en todo el edificio el jueves de 9:00 a 13:00. Cierra las llaves de paso antes de salir.",
    },
  ],
  [
    "Encuesta: horario de la piscina\u0000Votá el horario de la piscina.",
    {
      title: "Encuesta: horario de la piscina",
      body: "Vota el horario de la piscina.",
      oldQuestion: "¿Qué horario preferís?",
      question: "¿Qué horario prefieres?",
    },
  ],
  [
    "Bienvenida a la nueva plataforma de la comunidad\u0000Estrenamos plataforma para gestionar todo: pagos, documentos, incidencias y comunicación. Mis canales permite elegir cómo querés recibir los avisos.",
    {
      title: "Bienvenida a la nueva plataforma de la comunidad",
      body: "Estrenamos plataforma para gestionar todo: pagos, documentos, incidencias y comunicación. Mis canales permite elegir cómo quieres recibir los avisos.",
    },
  ],
  [
    "Cena de vecinos en el jardín\u0000Cena de convivencia del sábado en el jardín. Cada uno trae algo para compartir. Inscribite respondiendo a este aviso.",
    {
      title: "Cena de vecinos en el jardín",
      body: "Cena de convivencia del sábado en el jardín. Cada uno trae algo para compartir. Inscríbete respondiendo a este aviso.",
    },
  ],
  [
    "Encuesta: horario de la piscina en verano\u0000Definamos juntos el horario de la piscina para el verano. Votá hasta el cierre de la consulta.",
    {
      title: "Encuesta: horario de la piscina en verano",
      body: "Definamos juntos el horario de la piscina para el verano. Vota hasta el cierre de la consulta.",
      oldQuestion: "¿Qué horario preferís para la piscina en verano?",
      question: "¿Qué horario prefieres para la piscina en verano?",
    },
  ],
  [
    "Taller de reciclaje\u0000Taller práctico de reciclaje doméstico en el hall.",
    {
      title: "Taller de reciclaje",
      body: "Taller práctico de reciclaje doméstico en el vestíbulo.",
    },
  ],
  [
    "Taller de reciclaje para el edificio\u0000Taller práctico de reciclaje doméstico en el hall. Plazas limitadas.",
    {
      title: "Taller de reciclaje para el edificio",
      body: "Taller práctico de reciclaje doméstico en el vestíbulo. Plazas limitadas.",
    },
  ],
]);

if (!db.prepare("SELECT id FROM schema_migrations WHERE id = 'spanish-demo-copy-v1'").get()) {
  db.exec("BEGIN");
  try {
    const update = db.prepare("UPDATE communication_posts SET data = ?, version = version + 1 WHERE id = ?");
    for (const row of db.prepare("SELECT id, data FROM communication_posts").all()) {
      const post = JSON.parse(row.data);
      const correction = spanishDemoCopy.get(`${post.title}\u0000${post.body}`);
      if (!correction) continue;
      post.title = correction.title;
      post.body = correction.body;
      if (correction.oldQuestion && post.poll?.question === correction.oldQuestion) {
        post.poll.question = correction.question;
      }
      update.run(JSON.stringify(post), row.id);
    }
    db.prepare("INSERT INTO schema_migrations (id) VALUES ('spanish-demo-copy-v1')").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function superAdmin(user, data = policyData()) {
  return (
    !!user?.activo &&
    data.roles.some(
      (r) =>
        (r.id === user.rol || r.nombre === user.rol) &&
        r.nombre === "super_admin",
    )
  );
}
export function manages(user, communityId, data = policyData()) {
  return allowed(user, "community:manage", communityId, data);
}
export function canPublish(user, communityId, data = policyData()) {
  return (
    manages(user, communityId, data) ||
    allowed(user, "comm:publicar", communityId, data)
  );
}
export function canModerate(user, communityId, data = policyData()) {
  return (
    manages(user, communityId, data) ||
    allowed(user, "comm:moderar", communityId, data)
  );
}
export function postById(id) {
  const row = db
    .prepare("SELECT * FROM communication_posts WHERE id=?")
    .get(id);
  return row
    ? {
        ...JSON.parse(row.data),
        id: row.id,
        communityId: row.communityId,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
        distributed: !!db
          .prepare(
            "SELECT 1 FROM communication_audit WHERE postId=? AND action='published'",
          )
          .get(id),
      }
    : null;
}
export function allPosts() {
  return db
    .prepare("SELECT id FROM communication_posts ORDER BY updatedAt DESC")
    .all()
    .map((r) => postById(r.id));
}
export function profiles(communityId, data = policyData()) {
  const properties = data.properties.filter(
    (p) => p.communityId === communityId,
  );
  const owners = data.owners.filter((o) =>
    properties.some((p) => p.ownerIds.includes(o.id)),
  );
  const today = getLocalDateInputValue();
  const tenants = data.tenants.filter(
    (t) =>
      properties.some((p) => p.id === t.propertyId) &&
      (!t.contractStart || t.contractStart <= today) &&
      (!t.contractEnd || t.contractEnd >= today),
  );
  return { properties, owners, tenants };
}
export function resolveAudience(communityId, audience, data = policyData()) {
  const members = profiles(communityId, data);
  let owners = members.owners,
    tenants = members.tenants;
  if (audience.mode === "owners") tenants = [];
  if (audience.mode === "tenants") owners = [];
  if (audience.mode === "selected") {
    owners = owners.filter(
      (o) =>
        audience.ownerIds.includes(o.id) ||
        members.properties.some(
          (p) =>
            audience.propertyIds.includes(p.id) && p.ownerIds.includes(o.id),
        ),
    );
    tenants = tenants.filter(
      (t) =>
        audience.tenantIds.includes(t.id) ||
        audience.propertyIds.includes(t.propertyId),
    );
  }
  const ids = new Set(
    [...owners, ...tenants].map((p) => p.userId).filter(Boolean),
  );
  // La administración recibe las publicaciones generales, sin convertirse en votante propietario.
  const users = db.prepare("SELECT * FROM users WHERE activo=1").all();
  if (audience.mode === "all")
    for (const user of users)
      if (canPublish(user, communityId, data)) ids.add(user.id);
  const recipients = users.filter((u) => ids.has(u.id));
  const unlinked = [...owners, ...tenants].filter(
    (p) => !recipients.some((u) => u.id === p.userId),
  );
  return { recipients, unlinked, members };
}
export function isMember(user, communityId, data = policyData()) {
  const members = profiles(communityId, data);
  return (
    allowed(user, "community:read", communityId, data) &&
    [...members.owners, ...members.tenants].some((p) => p.userId === user.id)
  );
}
export function canRead(user, post, data = policyData()) {
  if (!post || !data.communities.some((c) => c.id === post.communityId))
    return false;
  if (canPublish(user, post.communityId, data)) return true;
  return (
    post.status !== "draft" &&
    new Date(post.publishAt).getTime() <= Date.now() &&
    isMember(user, post.communityId, data) &&
    !!db
      .prepare(
        "SELECT 1 FROM communication_recipients WHERE postId=? AND userId=?",
      )
      .get(post.id, user.id)
  );
}
export function phase(post, now = Date.now()) {
  if (post.status === "draft") return "draft";
  if (post.status === "cancelled") return "cancelled";
  if (Date.parse(post.publishAt) > now) return "scheduled";
  if (post.archiveAt && Date.parse(post.archiveAt) <= now) return "archived";
  if (post.endsAt && Date.parse(post.endsAt) <= now) return "finished";
  if (post.startsAt && Date.parse(post.startsAt) > now) return "upcoming";
  return "active";
}
export function audit(postId, userId, action) {
  db.prepare("INSERT INTO communication_audit VALUES (?,?,?,?,?)").run(
    crypto.randomUUID(),
    postId,
    userId,
    action,
    new Date().toISOString(),
  );
}
export function getPreferences(user) {
  const row = db
    .prepare("SELECT data FROM communication_preferences WHERE userId=?")
    .get(user.id);
  return row
    ? JSON.parse(row.data)
    : {
        email: user.email || "",
        phone: "",
        emailEnabled: false,
        smsEnabled: false,
        whatsappEnabled: false,
      };
}
export function queue(post, kind = "publication") {
  const now = new Date().toISOString();
  const emailEnabled = getSettings().notificacionesEmail !== false;
  for (const r of db
    .prepare("SELECT userId FROM communication_recipients WHERE postId=?")
    .all(post.id)) {
    for (const channel of post.channels) {
      if (channel === "email" && !emailEnabled) continue;
      db.prepare(
        "INSERT OR IGNORE INTO communication_outbox (id,postId,userId,channel,kind,version,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        crypto.randomUUID(),
        post.id,
        r.userId,
        channel,
        kind,
        post.version,
        now,
        now,
      );
    }
  }
}
export function materialize(now = Date.now()) {
  const data = policyData();
  for (const post of allPosts()) {
    if (
      post.status === "draft" ||
      Date.parse(post.publishAt) > now ||
      !data.communities.some((c) => c.id === post.communityId)
    )
      continue;
    // Una instantánea por publicación: no se envían avisos históricos a vecinos nuevos.
    const marker = db
      .prepare(
        "SELECT 1 FROM communication_audit WHERE postId=? AND action='published'",
      )
      .get(post.id);
    if (!marker && post.status !== "cancelled")
      transaction(() => {
        const { recipients } = resolveAudience(
          post.communityId,
          post.audience,
          data,
        );
        for (const user of recipients)
          db.prepare(
            "INSERT OR IGNORE INTO communication_recipients(postId,userId) VALUES (?,?)",
          ).run(post.id, user.id);
        audit(post.id, post.createdBy, "published");
        queue(post);
      });
    if (
      post.reminderMinutes &&
      post.startsAt &&
      ["active", "upcoming"].includes(phase(post, now)) &&
      now >= Date.parse(post.startsAt) - post.reminderMinutes * 60000 &&
      now < Date.parse(post.startsAt)
    )
      queue(post, "reminder");
  }
}
export function votingSuspended(user, communityId, data = policyData()) {
  return profiles(communityId, data).owners.some(
    (o) => o.userId === user.id && o.votingRights === "suspended",
  );
}
export function mayVote(user, post, data = policyData()) {
  if (!post.poll || !canRead(user, post, data)) return false;
  const invited = db
    .prepare(
      "SELECT 1 FROM communication_recipients WHERE postId=? AND userId=?",
    )
    .get(post.id, user.id);
  if (!invited) return false;
  if (post.poll.electorate !== "owners") return true;
  return profiles(post.communityId, data).owners.some(
    (o) => o.userId === user.id && o.votingRights !== "suspended",
  );
}
export function pollOpen(post, now = Date.now()) {
  return (
    !!post.poll &&
    !post.poll.closed &&
    Date.parse(post.poll.closesAt) > now &&
    !["draft", "scheduled", "cancelled", "archived"].includes(phase(post, now))
  );
}
export function summary(post, user, data = policyData()) {
  const manager = canPublish(user, post.communityId, data);
  const mine = db
    .prepare(
      "SELECT * FROM communication_recipients WHERE postId=? AND userId=?",
    )
    .get(post.id, user.id);
  return {
    ...post,
    phase: phase(post),
    canManage: manager,
    canModerate: canModerate(user, post.communityId, data),
    recipient: mine || null,
    canVote: mayVote(user, post, data),
    votingSuspended:
      !!post.poll &&
      post.poll.electorate === "owners" &&
      votingSuspended(user, post.communityId, data),
    pollOpen: pollOpen(post),
    communityName:
      data.communities.find((c) => c.id === post.communityId)?.name || "",
    recipientCount: manager
      ? db
          .prepare(
            "SELECT COUNT(*) n FROM communication_recipients WHERE postId=?",
          )
          .get(post.id).n
      : undefined,
  };
}
export function detail(post, user) {
  const result = summary(post, user);
  const users = db
    .prepare("SELECT id,nombre,apellido,usuario FROM users")
    .all();
  const name = (id) => {
    const u = users.find((u) => u.id === id);
    return u
      ? `${u.nombre} ${u.apellido}`.trim() || u.usuario
      : "Cuenta eliminada";
  };
  result.comments = db
    .prepare(
      "SELECT id,userId,body,createdAt,deleted FROM communication_comments WHERE postId=? ORDER BY createdAt",
    )
    .all(post.id)
    .map((c) => ({
      ...c,
      body: c.deleted ? "Comentario eliminado" : c.body,
      author: name(c.userId),
      canDelete: !c.deleted && (c.userId === user.id || result.canModerate),
    }));
  result.files = db
    .prepare(
      "SELECT id,name,mime,length(content) size,kind,final,createdAt FROM communication_files WHERE postId=? ORDER BY createdAt DESC",
    )
    .all(post.id)
    .filter((f) => f.kind !== "minutes" || f.final || result.canManage);
  if (post.poll) {
    const ballots = db
      .prepare(
        "SELECT userId,choices FROM communication_ballots WHERE postId=?",
      )
      .all(post.id);
    result.ballot = JSON.parse(
      ballots.find((b) => b.userId === user.id)?.choices || "[]",
    );
    result.pollResults =
      !pollOpen(post) || post.poll.resultsLive
        ? {
            total: ballots.length,
            counts: post.poll.options.map(
              (_, i) =>
                ballots.filter((b) => JSON.parse(b.choices).includes(i)).length,
            ),
          }
        : null;
  }
  if (result.canManage) {
    result.recipients = db
      .prepare("SELECT * FROM communication_recipients WHERE postId=?")
      .all(post.id)
      .map((r) => ({ ...r, name: name(r.userId) }));
    result.deliveries = db
      .prepare(
        "SELECT id,userId,channel,kind,state,error,updatedAt FROM communication_outbox WHERE postId=? ORDER BY createdAt DESC",
      )
      .all(post.id)
      .map((r) => ({ ...r, name: name(r.userId) }));
    result.history = db
      .prepare(
        "SELECT action,userId,createdAt FROM communication_audit WHERE postId=? ORDER BY createdAt DESC",
      )
      .all(post.id)
      .map((r) => ({ ...r, name: name(r.userId) }));
  }
  // Nunca se devuelven emails, teléfonos ni votos ajenos desde el detalle.
  return result;
}
export function safeRecipient(user) {
  const safe = publicUser(user);
  return {
    id: safe.id,
    name: `${safe.nombre} ${safe.apellido}`.trim() || safe.usuario,
  };
}
