import crypto from "node:crypto";
import { db, getSettings } from "./db.js";
import { allowed, policyData, publicUser } from "./security.js";
import { getLocalDateInputValue } from "./domain.js";
import { isTenantContractActive } from "../public/js/permissions.js";
import { MAJORITIES, legalConfigOf, votingRuleLabel } from "./legal-config.js";

const ASSOCIATION_MAJORITIES = {
  simple: "Mayoría simple de socios",
  absoluta: "Mayoría absoluta de socios",
  tres_quintos: "Tres quintos de socios",
  unanimidad: "Unanimidad de socios",
};

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
    "Junta general de propietarios — 2.º trimestre\u0000Convocatoria de la junta general. Si no puedes asistir, delega tu voto respondiendo a este aviso.",
    {
      title: "Junta general de propietarios — 2.º trimestre",
      body: "Convocatoria de la junta general. Si no puedes asistir, delega tu voto respondiendo a este aviso.",
    },
  ],
  [
    "Encuesta: ¿qué actividades quieres en el centro social?\u0000El centro social reabre el mes próximo y queremos programarlo con ustedes. Elige las actividades que te interesan (puedes marcar varias).",
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
    "Bienvenida a la nueva plataforma de la comunidad\u0000Estrenamos plataforma para gestionar todo: pagos, documentos, incidencias y comunicación. Mis canales permite elegir cómo quieres recibir los avisos.",
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
    const update = db.prepare(
      "UPDATE communication_posts SET data = ?, version = version + 1 WHERE id = ?",
    );
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
      (r) => (r.id === user.rol || r.nombre === user.rol) && r.nombre === "super_admin",
    )
  );
}
export function manages(user, communityId, data = policyData()) {
  return allowed(user, "community:manage", communityId, data);
}
export function canPublish(user, communityId, data = policyData()) {
  return manages(user, communityId, data) || allowed(user, "comm:publicar", communityId, data);
}
export function canModerate(user, communityId, data = policyData()) {
  return manages(user, communityId, data) || allowed(user, "comm:moderar", communityId, data);
}
export function postById(id) {
  const row = db.prepare("SELECT * FROM communication_posts WHERE id=?").get(id);
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
          .prepare("SELECT 1 FROM communication_audit WHERE postId=? AND action='published'")
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
  const properties = data.properties.filter((p) => p.communityId === communityId);
  const association =
    legalConfigOf(data.communities.find((c) => c.id === communityId)).regimen === "asociacion";
  // En una asociación el censo son los socios, tengan o no inmueble. En una
  // comunidad LPH los perfiles de propietario se derivan de sus inmuebles.
  const owners = data.owners.filter((o) =>
    association
      ? o.isMember && o.communityId === communityId
      : properties.some((p) => p.ownerIds.includes(o.id)),
  );
  const today = getLocalDateInputValue();
  const tenants = data.tenants.filter(
    (t) => properties.some((p) => p.id === t.propertyId) && isTenantContractActive(t, today),
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
          (p) => audience.propertyIds.includes(p.id) && p.ownerIds.includes(o.id),
        ),
    );
    tenants = tenants.filter(
      // Un aviso dirigido a inmuebles va solo a sus propietarios; incluir a los
      // residentes es una decisión explícita del autor.
      (t) =>
        audience.tenantIds.includes(t.id) ||
        (audience.includeResidents === true && audience.propertyIds.includes(t.propertyId)),
    );
  }
  const ids = new Set([...owners, ...tenants].map((p) => p.userId).filter(Boolean));
  // La administración recibe las publicaciones generales, sin convertirse en votante propietario.
  const users = db.prepare("SELECT * FROM users WHERE activo=1").all();
  if (audience.mode === "all")
    for (const user of users) if (canPublish(user, communityId, data)) ids.add(user.id);
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
  if (!post || !data.communities.some((c) => c.id === post.communityId)) return false;
  if (canPublish(user, post.communityId, data)) return true;
  return (
    post.status !== "draft" &&
    new Date(post.publishAt).getTime() <= Date.now() &&
    isMember(user, post.communityId, data) &&
    !!db
      .prepare("SELECT 1 FROM communication_recipients WHERE postId=? AND userId=?")
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
export function attendanceOpen(post, now = Date.now()) {
  return (
    post.type === "meeting" &&
    post.status === "published" &&
    Date.parse(post.publishAt) <= now &&
    Date.parse(post.startsAt) <= now
  );
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
  const row = db.prepare("SELECT data FROM communication_preferences WHERE userId=?").get(user.id);
  return row
    ? { noContact: false, ...JSON.parse(row.data) }
    : {
        email: user.email || "",
        phone: "",
        emailEnabled: false,
        smsEnabled: false,
        whatsappEnabled: false,
        // Oposición (art. 21): prevalece sobre cualquier canal externo.
        noContact: false,
      };
}
// Trazabilidad del consentimiento (art. 7.1): qué canal, cuándo y con qué
// origen cambió. El estado actual solo no basta para demostrar el consentimiento.
export function recordConsentChange(userId, channel, enabled) {
  db.prepare(
    "INSERT INTO communication_consent_log (id,userId,channel,enabled,at,origin) VALUES (?,?,?,?,?,?)",
  ).run(
    crypto.randomUUID(),
    userId,
    channel,
    enabled ? 1 : 0,
    new Date().toISOString(),
    "autoservicio",
  );
}
export function consentHistory(userId, limit = 50) {
  return db
    .prepare(
      "SELECT channel,enabled,at,origin FROM communication_consent_log WHERE userId=? ORDER BY at DESC,id DESC LIMIT ?",
    )
    .all(userId, limit)
    .map((row) => ({ channel: row.channel, enabled: !!row.enabled, at: row.at, origin: row.origin }));
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
      ).run(crypto.randomUUID(), post.id, r.userId, channel, kind, post.version, now, now);
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
      .prepare("SELECT 1 FROM communication_audit WHERE postId=? AND action='published'")
      .get(post.id);
    if (!marker && post.status !== "cancelled")
      transaction(() => {
        const { recipients } = resolveAudience(post.communityId, post.audience, data);
        for (const user of recipients)
          db.prepare(
            "INSERT OR IGNORE INTO communication_recipients(postId,userId) VALUES (?,?)",
          ).run(post.id, user.id);
        ensureVotingCensus(post);
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
    .prepare("SELECT 1 FROM communication_recipients WHERE postId=? AND userId=?")
    .get(post.id, user.id);
  if (!invited) return false;
  if (post.poll.electorate !== "owners") return true;
  const owners = profiles(post.communityId, data).owners.filter((o) => o.userId === user.id);
  const census = votingCensus(post);
  if (census && !census.owners.some((owner) => owner.userId === user.id)) return false;
  // Si cualquiera de sus fichas está suspendida, la cuenta no vota: la vista
  // y la ruta deben aplicar el mismo criterio, también con varias fichas.
  return owners.length > 0 && !owners.some((o) => o.votingRights === "suspended");
}
export function pollOpen(post, now = Date.now()) {
  return (
    !!post.poll &&
    !post.poll.closed &&
    Date.parse(post.poll.closesAt) > now &&
    !["draft", "scheduled", "cancelled", "archived"].includes(phase(post, now))
  );
}
export function pollRule(post) {
  const stored = post.poll?.votingRule;
  if (stored?.censo) return stored;
  const association =
    legalConfigOf(
      db.prepare("SELECT legalConfig FROM communities WHERE id=?").get(post.communityId),
    ).regimen === "asociacion";
  const base = stored || {
    unidad: "cuenta",
    copropiedad: "representante",
    mayoriaOrdinaria: "simple",
  };
  // Consultas creadas antes de congelar el censo: se interpretan según el
  // régimen actual de la comunidad sin reescribir su regla guardada.
  return association
    ? {
        ...base,
        unidad: base.unidad === "cuenta" ? "cuenta" : "propietario",
        copropiedad: "representante",
        censo: "socios",
      }
    : { ...base, censo: "propietarios" };
}
const parseList = (value) => {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
};
const parseObject = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
};
function votingCensus(post) {
  if (!post.id) return null;
  const saved = db
    .prepare("SELECT data FROM communication_voting_census WHERE postId=?")
    .get(post.id);
  return saved ? JSON.parse(saved.data) : null;
}

/**
 * Una votación ponderada por coeficiente solo puede abrirse si el censo que
 * se usará para el reparto tiene coeficientes completos. Se comprueba el
 * censo congelado si existe; si la consulta es nueva o antigua, los datos
 * vivos. Devuelve el mensaje de error o una cadena vacía.
 */
export function votingCoefficientProblem(post) {
  const rule = pollRule(post);
  if (
    post?.poll?.type !== "vote" ||
    post.poll.electorate !== "owners" ||
    rule.unidad !== "coeficiente" ||
    rule.censo === "socios"
  )
    return "";
  const census = votingCensus(post);
  const properties =
    census?.properties ||
    db
      .prepare("SELECT plot,participationCoef FROM properties WHERE communityId=?")
      .all(post.communityId);
  if (!properties.length)
    return "No se puede abrir la votación por coeficiente: la comunidad no tiene inmuebles con coeficiente de participación.";
  const invalid = properties.filter((property) => {
    const coefficient = Number(property.participationCoef);
    return !Number.isFinite(coefficient) || coefficient <= 0 || coefficient > 100;
  });
  if (invalid.length) {
    const names = invalid
      .map((property) => property.plot)
      .filter(Boolean)
      .slice(0, 3);
    const detalle = names.length
      ? ` (${names.join(", ")}${invalid.length > names.length ? "…" : ""})`
      : "";
    return `No se puede abrir la votación por coeficiente: hay ${invalid.length === 1 ? "un inmueble" : `${invalid.length} inmuebles`} sin coeficiente válido${detalle}. Corrige los coeficientes antes de continuar.`;
  }
  const sum = properties.reduce(
    (total, property) => total + Math.round(Number(property.participationCoef) * 10000),
    0,
  );
  if (sum !== 1000000)
    return `No se puede abrir la votación por coeficiente: los coeficientes suman ${(sum / 10000).toFixed(4).replace(".", ",")} % y deben sumar 100 %. Corrige los coeficientes de la comunidad antes de continuar.`;
  return "";
}

// Se guarda aparte de la publicación para no exponer el censo en su DTO público.
export function ensureVotingCensus(post) {
  const rule = pollRule(post);
  if (
    post.poll?.type !== "vote" ||
    post.poll.electorate !== "owners" ||
    rule.unidad === "cuenta" ||
    rule.censo === "socios" ||
    votingCensus(post)
  )
    return;
  // No es posible reconstruir un censo histórico a partir del peso agregado
  // de votos anteriores. No se mezclan con un nuevo reparto de titularidad.
  if (db.prepare("SELECT 1 FROM communication_ballots WHERE postId=?").get(post.id))
    throw problem(
      "Esta votación no tiene un censo congelado. Ciérrala y crea otra para admitir nuevas respuestas.",
      409,
    );
  const properties = db
    .prepare(
      "SELECT ownerIds,ownerPercentages,participationCoef FROM properties WHERE communityId=?",
    )
    .all(post.communityId);
  const ownerIds = new Set(properties.flatMap((property) => parseList(property.ownerIds)));
  const owners = db
    .prepare("SELECT id,userId,communityId FROM owners")
    .all()
    .filter((owner) => ownerIds.has(owner.id));
  db.prepare("INSERT INTO communication_voting_census(postId,data,createdAt) VALUES (?,?,?)").run(
    post.id,
    JSON.stringify({ owners, properties }),
    new Date().toISOString(),
  );
}
/**
 * Peso de cada respuesta según la regla congelada en la consulta. Las
 * encuestas informativas y las consultas antiguas sin regla siguen contando
 * una respuesta por cuenta. En votaciones LPH se pondera por identidad,
 * inmueble o coeficiente, sin duplicar la copropiedad representada.
 */
export function ballotWeights(post, ballots) {
  const rule = pollRule(post);
  const perAccount = new Map(ballots.map((ballot) => [ballot.userId, 1]));
  // El peso guardado al votar manda; los votos anteriores a esta columna
  // (weight=0) se calculan con la regla vigente como hasta ahora.
  const stored = new Map(
    ballots
      .filter((ballot) => Number(ballot.weightFrozen) === 1)
      .map((ballot) => [ballot.userId, Number(ballot.weight) || 0]),
  );
  const withStored = (map) => {
    for (const [userId, weight] of stored) if (map.has(userId)) map.set(userId, weight);
    return map;
  };
  // Solo las votaciones de propietarios usan el censo LPH. Las consultas
  // abiertas a destinatarios y las encuestas informativas cuentan por cuenta:
  // la etiqueta debe reflejarlo aunque la regla congelada hable de coeficientes.
  if (post.poll.type !== "vote" || post.poll.electorate !== "owners")
    return {
      weights: withStored(perAccount),
      weighted: false,
      rule: { ...rule, unidad: "cuenta", censo: undefined },
    };
  if (rule.unidad === "cuenta") return { weights: withStored(perAccount), weighted: false, rule };
  // Sin respuestas todavía se muestra la regla prevista, no una equivalencia.
  if (!ballots.length) return { weights: perAccount, weighted: false, rule };
  if (rule.censo === "socios")
    // Una persona socia, un voto: la cuenta computa una sola vez aunque tenga
    // varios registros de socio vinculados. No se aplican coeficientes.
    return { weights: withStored(perAccount), weighted: false, rule };
  const weights = new Map(perAccount);
  const census = votingCensus(post);
  const owners = census?.owners || db.prepare("SELECT id,userId,communityId FROM owners").all();
  const properties =
    census?.properties ||
    db
      .prepare(
        "SELECT ownerIds,ownerPercentages,participationCoef FROM properties WHERE communityId=?",
      )
      .all(post.communityId);
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const communityOwnerIds = new Set(properties.flatMap((p) => parseList(p.ownerIds)));
  for (const userId of weights.keys()) weights.set(userId, 0);
  if (rule.unidad === "propietario") {
    // Solo computa identidades del censo de esta comunidad, no perfiles del
    // mismo usuario en otras comunidades.
    for (const ballot of ballots) {
      const count = owners.filter(
        (owner) =>
          owner.userId === ballot.userId &&
          (owner.communityId === post.communityId || communityOwnerIds.has(owner.id)),
      ).length;
      weights.set(ballot.userId, count || 1);
    }
    return { weights: withStored(weights), weighted: true, rule };
  }
  for (const property of properties) {
    const voters = new Map();
    for (const ownerId of parseList(property.ownerIds)) {
      const owner = ownerById.get(ownerId);
      if (!owner?.userId || !weights.has(owner.userId)) continue;
      if (!voters.has(owner.userId)) voters.set(owner.userId, []);
      voters.get(owner.userId).push(ownerId);
    }
    if (!voters.size) continue;
    const coefficient = Number(property.participationCoef);
    // Un coeficiente ausente nunca debe convertirse en un voto con peso 1.
    // La validación de la consulta lo impide; este cero es la última defensa
    // para datos históricos incoherentes.
    const value =
      rule.unidad === "coeficiente"
        ? Number.isFinite(coefficient) && coefficient > 0
          ? coefficient
          : 0
        : 1;
    if (rule.copropiedad === "todos") {
      // Cada cotitular computa su cuota; si no consta, se reparte por igual.
      const shares = parseObject(property.ownerPercentages);
      const candidates = [...voters.entries()];
      const allOwnerIds = parseList(property.ownerIds);
      const known = allOwnerIds.filter((id) => Number(shares[id]) > 0);
      const totalKnown = known.reduce((sum, id) => sum + Number(shares[id]), 0);
      // Si faltan porcentajes, se reparte el 100 % restante por igual entre
      // las cuotas desconocidas; no se deja a nadie con peso cero por un dato
      // ausente. Si los porcentajes conocidos ya superan el 100 %, el dato es
      // incoherente y se usa el reparto igualitario entre cotitulares.
      const missingShare =
        known.length && totalKnown <= 100
          ? (100 - totalKnown) / (allOwnerIds.length - known.length || 1)
          : 0;
      for (const [userId, ownerIds] of candidates) {
        const share = known.length
          ? totalKnown > 100
            ? ownerIds.length / allOwnerIds.length
            : ownerIds.reduce(
                (sum, id) => sum + (Number(shares[id]) > 0 ? Number(shares[id]) : missingShare),
                0,
              ) / 100
          : ownerIds.length / allOwnerIds.length;
        weights.set(userId, weights.get(userId) + value * share);
      }
    } else {
      // Representante común: el inmueble computa una sola vez.
      const voter = ballots.map((ballot) => ballot.userId).find((userId) => voters.has(userId));
      if (voter) weights.set(voter, weights.get(voter) + value);
    }
  }
  // Si el censo no aporta ningún peso (por ejemplo, una asociación sin
  // coeficientes), no se anulan los votos: se computan por cuenta.
  if (!census && ![...weights.values()].some((value) => value > 0))
    return { weights: withStored(perAccount), weighted: false, rule };
  return { weights: withStored(weights), weighted: true, rule };
}
const roundWeight = (value) => Math.round(value * 100) / 100;

function representationNotice(post, user, ballots) {
  const rule = pollRule(post);
  if (
    post.poll.type !== "vote" ||
    post.poll.electorate !== "owners" ||
    rule.censo === "socios" ||
    !["inmueble", "coeficiente"].includes(rule.unidad) ||
    rule.copropiedad !== "representante"
  )
    return "";
  const census = votingCensus(post);
  if (!census) return "";
  const owners = new Map(census.owners.map((owner) => [owner.id, owner.userId]));
  const represented = census.properties.some((property) => {
    const users = new Set(
      parseList(property.ownerIds)
        .map((id) => owners.get(id))
        .filter(Boolean),
    );
    if (!users.has(user.id)) return false;
    const first = ballots.find((ballot) => users.has(ballot.userId));
    return first && first.userId !== user.id;
  });
  return represented
    ? "Otro cotitular ya respondió por uno o varios de tus inmuebles. Tu respuesta queda registrada, pero no añade peso por esos inmuebles, que computan una sola vez."
    : "";
}

export function summary(post, user, data = policyData()) {
  const manager = canPublish(user, post.communityId, data);
  const mine = db
    .prepare("SELECT * FROM communication_recipients WHERE postId=? AND userId=?")
    .get(post.id, user.id);
  return {
    ...post,
    phase: phase(post),
    canManage: manager,
    canRecordAttendance: manager && attendanceOpen(post),
    canModerate: canModerate(user, post.communityId, data),
    recipient: mine || null,
    canVote: mayVote(user, post, data),
    votingSuspended:
      !!post.poll &&
      post.poll.electorate === "owners" &&
      votingSuspended(user, post.communityId, data),
    pollOpen: pollOpen(post),
    communityName: data.communities.find((c) => c.id === post.communityId)?.name || "",
    recipientCount: manager
      ? db.prepare("SELECT COUNT(*) n FROM communication_recipients WHERE postId=?").get(post.id).n
      : undefined,
  };
}
export function detail(post, user) {
  const result = summary(post, user);
  result.canDelete =
    post.createdBy === user.id ||
    result.canModerate ||
    allowed(user, "comm:eliminar", post.communityId);
  const users = db.prepare("SELECT id,nombre,apellido,usuario FROM users").all();
  const name = (id) => {
    const u = users.find((u) => u.id === id);
    return u ? `${u.nombre} ${u.apellido}`.trim() || u.usuario : "Cuenta eliminada";
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
        "SELECT userId,choices,weight,weightFrozen FROM communication_ballots WHERE postId=? ORDER BY createdAt,userId",
      )
      .all(post.id);
    const { weights, weighted, rule } = ballotWeights(post, ballots);
    const choices = new Map(
      ballots.map((ballot) => [ballot.userId, JSON.parse(ballot.choices || "[]")]),
    );
    result.ballot = choices.get(user.id) || [];
    result.representationNotice =
      allowed(user, "comm:participacion", post.communityId) && mayVote(user, post)
        ? representationNotice(post, user, ballots)
        : "";
    result.pollRule = votingRuleLabel(rule);
    // La mayoría solo se muestra en votaciones; en encuestas no decide nada.
    // Se toma la regla congelada de la consulta, no la versión que fuerza el
    // cómputo por cuenta para un electorado abierto: en una asociación la
    // mayoría sigue siendo de socios, aunque voten también destinatarios.
    const majorityRule = pollRule(post);
    result.pollMajority =
      post.poll.type === "vote"
        ? (majorityRule.censo === "socios"
            ? ASSOCIATION_MAJORITIES[majorityRule.mayoriaOrdinaria]
            : null) ||
          MAJORITIES[majorityRule.mayoriaOrdinaria] ||
          ""
        : "";
    result.pollResults =
      !pollOpen(post) || post.poll.resultsLive
        ? {
            total: roundWeight([...weights.values()].reduce((sum, value) => sum + value, 0)),
            counts: post.poll.options.map((_, index) =>
              roundWeight(
                ballots.reduce(
                  (sum, ballot) =>
                    sum +
                    (choices.get(ballot.userId)?.includes(index)
                      ? weights.get(ballot.userId) || 0
                      : 0),
                  0,
                ),
              ),
            ),
            ballots: ballots.length,
            weighted,
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
