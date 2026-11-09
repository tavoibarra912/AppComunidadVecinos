import fs from "node:fs";

const archivo = "src/seed.js";
let t = fs.readFileSync(archivo, "utf8");

const ancla = `    console.log(\`[seed] Base de datos inicializada con datos de demo (\${communitySeeds.length} comunidades, \${ownerSeeds.length} propietarios, \${propertySeeds.length} inmuebles, \${tenantSeeds.length} inquilinos).\`);
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
`;

if (!t.includes(ancla)) { console.error("ANCLA NO ENCONTRADA"); process.exit(1); }

const funcion = ancla + `
// Publicaciones de demostración para explorar Comunicación: avisos, eventos,
// reuniones y consultas en distintos tipos, estados y prioridades.
// No se ejecuta con NODE_ENV=test (los tests traen sus propios escenarios).
export function seedCommunicationsDemo() {
  if (process.env.NODE_ENV === "test") return false;
  if (db.prepare("SELECT COUNT(*) AS total FROM communication_posts").get().total > 0) return false;
  const data = {
    communities: listCommunities(),
    owners: listOwners(),
    properties: listProperties(),
    tenants: listTenants(),
    roles: listRoles(),
  };
  if (!data.communities.some(c => c.id === "com-seed-1")) return false;

  const HORA = 3600000;
  const DIA = 24 * HORA;
  const ahora = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const base = {
    communityId: "com-seed-1",
    audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
    channels: [],
    pinned: false,
    commentsEnabled: true,
    receiptRequired: false,
    priority: "normal",
    status: "published",
    reminderMinutes: 0,
  };

  const definiciones = [
    { ...base, type: "notice", priority: "urgent", pinned: true, publishAt: iso(ahora - 2 * HORA),
      title: "Fuga de agua en el garaje: corte preventivo del suministro",
      body: "Detectamos una fuga en la bajante del garaje. Fontanero 24 h cortó el suministro de la zona a las 8:30. Previsión de reparación hoy mismo. Pedimos disculpas por las molestias." },
    { ...base, type: "notice", publishAt: iso(ahora - 10 * DIA), receiptRequired: true, channels: ["email"],
      title: "Corte de agua programado el jueves de 9 a 13 h",
      body: "Por trabajos de mantenimiento de la red municipal, no habrá agua en todo el edificio el jueves de 9:00 a 13:00. Cerrá las llaves de paso antes de salir." },
    { ...base, type: "notice", publishAt: iso(ahora - 3 * DIA),
      title: "Nueva normativa de reciclaje y horarios de basura",
      body: "A partir del lunes: orgánico lunes, miércoles y viernes a partir de las 20:00; envases martes y jueves; vidrio al contenedor del portal B cuando quieras. Bolsas cerradas siempre." },
    { ...base, type: "notice", publishAt: iso(ahora - 40 * DIA), archiveAt: iso(ahora - 5 * DIA),
      title: "Resultados de las Olimpiadas Deportivas 2026",
      body: "Ya están los resultados y las fotos de las Olimpiadas. Ganó el equipo de la escalera B por segundo año consecutivo. ¡Gracias a los 46 participantes!" },
    { ...base, type: "notice", status: "cancelled", publishAt: iso(ahora - 1 * DIA),
      title: "Quedada en el parque cancelada por lluvia",
      body: "Por el pronóstico de lluvia del sábado, cancelamos la quedada del parque. La reprogramaremos cuando mejore el tiempo." },
    { ...base, type: "notice", status: "published", publishAt: iso(ahora + 1 * DIA),
      title: "Mantenimiento de ascensores la próxima semana",
      body: "El martes y el miércoles el ascensor principal estará fuera de servicio de 9:00 a 12:00 por revisión semestral. Usen el ascensor secundario." },
    { ...base, type: "notice", status: "draft", priority: "important", commentsEnabled: false,
      title: "Comunicado: reforma de la azotea (borrador)",
      body: "Borrador del comunicado sobre la impermeabilización de la azotea: presupuesto de tres empresas, plazos y realojo de los tendales. Falta aprobarlo en junta." },
    { ...base, type: "event", publishAt: iso(ahora - 2 * DIA), startsAt: iso(ahora + 5 * DIA + 10 * HORA), endsAt: iso(ahora + 5 * DIA + 13 * HORA), reminderMinutes: 1440,
      title: "Torneo de pádel entre vecinos",
      body: "Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscribite hasta el jueves respondiendo a este aviso." },
    { ...base, type: "event", publishAt: iso(ahora - 16 * DIA), startsAt: iso(ahora - 14 * DIA + 21 * HORA), endsAt: iso(ahora - 14 * DIA + 23 * HORA + 30 * 60000),
      title: "Cine en el patio: noche de verano",
      body: "Proyección al aire libre de una clásico del cine español. Traé silla plegable y algo rico para compartir." },
    { ...base, type: "event", publishAt: iso(ahora - 4 * DIA), startsAt: iso(ahora + 10 * DIA + 9 * HORA), endsAt: iso(ahora + 10 * DIA + 10 * HORA), receiptRequired: true, reminderMinutes: 30,
      title: "Clases de yoga gratuitas en el jardín",
      body: "Profesora voluntaria del edificio da clase de hatha yoga para principiantes. Traé toalla y ropa cómoda. Confirmá asistencia (botón de confirmación)." },
    { ...base, communityId: "com-seed-2", type: "event", publishAt: iso(ahora - 6 * DIA), startsAt: iso(ahora + 12 * DIA + 11 * HORA), endsAt: iso(ahora + 12 * DIA + 15 * HORA),
      title: "Mercado solidario de segunda mano",
      body: "Traé lo que ya no uses y llevate lo que te guste. Lo recaudado va para la reforma del jardín de infancia del barrio." },
    { ...base, type: "meeting", publishAt: iso(ahora - 7 * DIA), startsAt: iso(ahora + 20 * DIA + 18 * HORA), endsAt: iso(ahora + 20 * DIA + 19 * HORA + 30 * 60000), receiptRequired: true, reminderMinutes: 60,
      title: "Junta general de propietarios — 2.º trimestre",
      body: "Convocatoria de la junta general. Si no podés asistir, delegá tu voto respondiendo a este aviso.",
      meeting: { location: "Salón social del edificio", url: "", agenda: "1. Lectura y aprobación del acta anterior.\\n2. Cuentas del ejercicio y presupuesto del próximo.\\n3. Contratación del nuevo jardinero.\\n4. Ruegos y preguntas.",
        tasks: [ { title: "Preparar acta y lista de asistencia", responsible: "Administración", dueAt: iso(ahora + 21 * DIA), done: false }, { title: "Reservar el salón y sillas extra", responsible: "Carlos Ruiz", dueAt: iso(ahora + 15 * DIA), done: true } ] } },
    { ...base, type: "meeting", publishAt: iso(ahora - 18 * DIA), startsAt: iso(ahora - 14 * DIA + 18 * HORA), endsAt: iso(ahora - 14 * DIA + 19 * HORA + 30 * 60000),
      title: "Reunión informativa de mayo",
      body: "Reunión para contar el estado de las cuentas y las obras pendientes de la comunidad.",
      meeting: { location: "Salón social del edificio", url: "", agenda: "1. Estado de las cuentas.\\n2. Obras pendientes: azotea y portero automático.",
        tasks: [ { title: "Pedir tres presupuestos del fontanero", responsible: "Administración", dueAt: iso(ahora - 10 * DIA), done: true } ] } },
    { ...base, type: "notice", publishAt: iso(ahora - 2 * DIA),
      title: "¿Renovamos el contrato de la empresa de jardinería?",
      body: "El contrato de jardinería vence el mes próximo. Votá para que la junta tenga mandato claro en la negociación.",
      poll: { type: "vote", question: "¿Renovamos el contrato de la empresa de jardinería por un año más?", options: ["Sí, renovar", "No, buscar otra empresa", "Abstenerse"], electorate: "owners", multiple: false, resultsLive: true, closesAt: iso(ahora + 7 * DIA), closed: false } },
    { ...base, type: "notice", publishAt: iso(ahora - 5 * DIA), channels: ["email"],
      title: "Encuesta: ¿qué actividades querés en el centro social?",
      body: "El centro social reabre el mes próximo y queremos programarlo con ustedes. Elegí las actividades que te interesan (podés marcar varias).",
      poll: { type: "survey", question: "¿Qué actividades te gustaría en el centro social?", options: ["Yoga", "Pilates", "Taller de ajedrez", "Cine-forum"], electorate: "recipients", multiple: true, resultsLive: true, closesAt: iso(ahora + 14 * DIA), closed: false } },
  ];

  const insert = db.prepare("INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)");
  const ids = {};
  db.exec("BEGIN");
  try {
    for (const def of definiciones) {
      const p = validatePost(def, null, data);
      const id = crypto.randomUUID();
      const creado = p.publishAt < new Date(ahora - 60 * DIA).toISOString() ? p.publishAt : new Date(Math.min(Date.parse(p.publishAt), ahora - 3600000)).toISOString();
      insert.run(id, p.communityId, JSON.stringify(p), "user-admin", creado, creado);
      if (p.status !== "draft" && Date.parse(p.publishAt) <= ahora) audit(id, "user-admin", "published");
      ids[def.title] = id;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  materialize();

  // Interacciones de demostración: votos, comentarios y confirmaciones.
  const destinatarios = titulo =>
    db.prepare("SELECT userId FROM communication_recipients WHERE postId=?").all(ids[titulo]).map(r => r.userId);
  const insertBola = db.prepare("INSERT INTO communication_ballots VALUES (?,?,?,?)");
  const votos = {
    [definiciones[13].title]: [[0], [1], [2]],
    [definiciones[14].title]: [[0, 2], [1], [0], [3]],
  };
  for (const [titulo, lista] of Object.entries(votos)) {
    const usuarios = destinatarios(titulo);
    lista.forEach((choices, i) => {
      const userId = usuarios[i % Math.max(usuarios.length, 1)];
      if (userId) insertBola.run(ids[titulo], userId, JSON.stringify(choices), new Date(ahora - 1 * DIA).toISOString());
    });
  }

  const insertComentario = db.prepare("INSERT INTO communication_comments VALUES (?,?,?,?,?,0)");
  insertComentario.run(crypto.randomUUID(), ids["Fuga de agua en el garaje: corte preventivo del suministro"], "user-admin", "Ya está cortado el agua. Aviso cuando se restablezca.", new Date(ahora - 1 * HORA).toISOString());
  insertComentario.run(crypto.randomUUID(), ids["Torneo de pádel entre vecinos"], "user-admin", "Apúntame con mi pareja. Nivel: moderado.", new Date(ahora - 1 * DIA).toISOString());

  const rsvps = [
    ["Junta general de propietarios — 2.º trimestre", "yes", "maybe"],
    ["Reunión informativa de mayo", "yes", "no"],
  ];
  for (const [titulo, primero, segundo] of rsvps) {
    const usuarios = destinatarios(titulo);
    if (usuarios[0]) db.prepare("UPDATE communication_recipients SET rsvp=? WHERE postId=? AND userId=?").run(primero, ids[titulo], usuarios[0]);
    if (usuarios[1]) db.prepare("UPDATE communication_recipients SET rsvp=? WHERE postId=? AND userId=?").run(segundo, ids[titulo], usuarios[1]);
  }
  const reunionPasada = destinatarios("Reunión informativa de mayo");
  if (reunionPasada[0]) db.prepare("UPDATE communication_recipients SET attended=1 WHERE postId=? AND userId=?").run(ids["Reunión informativa de mayo"], reunionPasada[0]);

  console.log(\`[seed] Comunicaciones de demostración cargadas (\${definiciones.length} publicaciones).\`);
  return true;
}
`;

t = t.replace(ancla, funcion);
fs.writeFileSync(archivo, t);
console.log("OK");
