import { problem, profiles } from "./communication-store.js";

const text = (value, max, label, required = false) => {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw problem(`${label}: completa un texto de hasta ${max} caracteres.`);
  return value.trim();
};
function date(value, label, required = false) {
  if (!value && !required) return "";
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw problem(`${label}: indica una fecha válida.`);
  return new Date(value).toISOString();
}
function ids(value = []) {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((v) => typeof v !== "string" || v.length > 100)
  )
    throw problem("La selección de destinatarios no es válida.");
  return [...new Set(value)];
}
export function validatePost(input, existing, data) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw problem("La publicación debe ser un objeto.");
  const p = {
    communityId: text(input.communityId, 100, "Comunidad", true),
    type: input.type,
    title: text(input.title, 180, "Título", true),
    body: text(input.body, 20000, "Contenido", true),
    status: input.status,
    publishAt: date(
      input.publishAt || new Date().toISOString(),
      "Publicación",
      true,
    ),
    startsAt: date(input.startsAt, "Inicio", input.type !== "notice"),
    endsAt: date(input.endsAt, "Fin", input.type !== "notice"),
    archiveAt: date(input.archiveAt, "Archivo"),
    pinned: input.pinned === true,
    priority: input.priority,
    commentsEnabled: input.commentsEnabled === true,
    receiptRequired: input.receiptRequired === true,
    channels: input.channels || [],
    reminderMinutes: Number(input.reminderMinutes || 0),
    audience: input.audience,
    meeting: null,
    poll: null,
  };
  if (
    !["notice", "event", "meeting"].includes(p.type) ||
    !["draft", "published", "cancelled"].includes(p.status) ||
    !["normal", "important", "urgent"].includes(p.priority)
  )
    throw problem("Tipo, estado o prioridad no válidos.");
  if (!data.communities.some((c) => c.id === p.communityId))
    throw problem("La comunidad no existe.");
  if (existing && existing.communityId !== p.communityId)
    throw problem("No se puede cambiar la comunidad de una publicación.");
  if (existing?.distributed && p.status === "draft")
    throw problem("Una publicación enviada no puede volver a borrador.");
  if (existing && existing.distributed && p.publishAt !== existing.publishAt)
    throw problem(
      "No se puede reprogramar una publicación enviada; cancélala y crea otra.",
    );
  if (p.endsAt && (!p.startsAt || p.endsAt <= p.startsAt))
    throw problem("El fin debe ser posterior al inicio.");
  if (p.archiveAt && p.archiveAt <= p.publishAt)
    throw problem("El archivo debe ser posterior a la publicación.");
  if (p.archiveAt && p.endsAt && p.archiveAt < p.endsAt)
    throw problem("El archivo debe ser igual o posterior al fin del evento.");
  if (p.endsAt && p.publishAt > p.endsAt)
    throw problem("La publicación debe ser anterior al fin del evento.");
  if (
    !Number.isInteger(p.reminderMinutes) ||
    p.reminderMinutes < 0 ||
    p.reminderMinutes > 43200 ||
    (p.reminderMinutes && !p.startsAt)
  )
    throw problem(
      "El recordatorio necesita una fecha de inicio y entre 1 y 43200 minutos de antelación.",
    );
  if (
    !Array.isArray(p.channels) ||
    p.channels.some((c) => !["email", "sms", "whatsapp"].includes(c))
  )
    throw problem("Canales no válidos.");
  p.channels = [...new Set(p.channels)];
  const a = p.audience;
  if (!a || !["all", "owners", "tenants", "selected"].includes(a.mode))
    throw problem("Selecciona los destinatarios.");
  p.audience = {
    mode: a.mode,
    ownerIds: ids(a.ownerIds),
    tenantIds: ids(a.tenantIds),
    propertyIds: ids(a.propertyIds),
  };
  const members = profiles(p.communityId, data);
  for (const [field, rows] of [
    ["ownerIds", members.owners],
    ["tenantIds", members.tenants],
    ["propertyIds", members.properties],
  ]) {
    if (
      !existing?.distributed &&
      p.audience[field].some((id) => !rows.some((r) => r.id === id))
    )
      throw problem(
        "Todos los destinatarios deben pertenecer a esta comunidad.",
      );
  }
  if (
    a.mode === "selected" &&
    ![
      ...p.audience.ownerIds,
      ...p.audience.tenantIds,
      ...p.audience.propertyIds,
    ].length
  )
    throw problem("Selecciona al menos un destinatario o inmueble.");
  if (
    existing &&
    existing.distributed &&
    JSON.stringify(p.audience) !== JSON.stringify(existing.audience)
  )
    throw problem(
      "Los destinatarios quedan fijados al publicar. Crea otra publicación para cambiar el grupo.",
    );
  if (p.type === "meeting") {
    const m = input.meeting || {};
    p.meeting = {
      location: text(m.location || "", 300, "Lugar"),
      url: text(m.url || "", 1000, "Enlace"),
      agenda: text(m.agenda || "", 10000, "Orden del día", true),
      tasks: [],
    };
    if (p.meeting.url) {
      let u;
      try {
        u = new URL(p.meeting.url);
      } catch {
        throw problem("El enlace de reunión no es válido.");
      }
      if (u.protocol !== "https:")
        throw problem("El enlace de reunión debe utilizar HTTPS.");
    }
    if (!p.meeting.location && !p.meeting.url)
      throw problem("Indica un lugar o enlace para la reunión.");
    if (!Array.isArray(m.tasks || []) || (m.tasks || []).length > 50)
      throw problem("Se admiten hasta 50 acuerdos o tareas.");
    p.meeting.tasks = (m.tasks || []).map((t) => ({
      title: text(t.title, 300, "Tarea", true),
      responsible: text(t.responsible || "", 180, "Responsable"),
      dueAt: date(t.dueAt, "Vencimiento"),
      done: t.done === true,
    }));
  }
  if (input.poll) {
    const v = input.poll;
    if (
      !["survey", "vote"].includes(v.type) ||
      !["recipients", "owners"].includes(v.electorate)
    )
      throw problem("Tipo de consulta o electorado no válido.");
    if (
      !Array.isArray(v.options) ||
      v.options.length < 2 ||
      v.options.length > 12
    )
      throw problem("La consulta necesita entre 2 y 12 opciones.");
    const options = v.options.map((o) => text(o, 180, "Opción", true));
    if (
      new Set(options.map((o) => o.toLocaleLowerCase())).size !== options.length
    )
      throw problem("Las opciones deben ser diferentes.");
    p.poll = {
      type: v.type,
      question: text(v.question, 500, "Pregunta", true),
      options,
      electorate: v.electorate,
      multiple: v.multiple === true,
      resultsLive: v.resultsLive === true,
      closesAt: date(v.closesAt, "Cierre de consulta", true),
      closed: v.closed === true,
    };
    if (p.poll.closesAt <= p.publishAt)
      throw problem(
        "El cierre de consulta debe ser posterior a su publicación.",
      );
    if (p.archiveAt && p.poll.closesAt > p.archiveAt)
      throw problem(
        "La consulta debe cerrar antes de archivar la publicación.",
      );
  }
  if (existing?.distributed) {
    const withoutClosed = (poll) =>
      poll ? { ...poll, closed: undefined } : null;
    if (
      JSON.stringify(withoutClosed(p.poll)) !==
      JSON.stringify(withoutClosed(existing.poll))
    )
      throw problem(
        "La pregunta, las opciones y las reglas quedan fijadas al publicar. Solo puedes cerrar o reabrir la consulta.",
      );
    if (existing.type !== p.type)
      throw problem("No se puede cambiar el tipo después de publicar.");
  }
  return p;
}
