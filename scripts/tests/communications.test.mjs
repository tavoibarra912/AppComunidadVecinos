import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-comms-test-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
db.prepare("UPDATE tenants SET contractStart='',contractEnd=''").run();
const { default: router } = await import("../../src/routes/index.js");
const { materialize, postById, queue, getPreferences } =
  await import("../../src/communication-store.js");
const { providers, seal, unseal, sendMessage, smtpTransport } =
  await import("../../src/delivery-providers.js");
const { processCommunications } =
  await import("../../src/communication-worker.js");
const { passwordRecord } = await import("../../src/auth.js");
let server, base, admin, owner, tenant, stranger, scoped;
const user = (name) =>
  db.prepare("SELECT * FROM users WHERE usuario=?").get(name);
const communityId = "com-seed-1";
const now = () => new Date().toISOString();
const later = (hours = 24) =>
  new Date(Date.now() + hours * 3600000).toISOString();
function client() {
  let cookie = "";
  return async (route, method = "GET", body, raw = false) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return {
      status: response.status,
      data: raw ? await response.text() : await response.json(),
      headers: response.headers,
    };
  };
}
const payload = (extra = {}) => ({
  communityId,
  type: "notice",
  title: "Corte de agua",
  body: "El viernes se realizará mantenimiento.",
  priority: "normal",
  status: "published",
  publishAt: now(),
  startsAt: "",
  endsAt: "",
  archiveAt: "",
  audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
  channels: [],
  commentsEnabled: true,
  receiptRequired: true,
  reminderMinutes: 0,
  pinned: false,
  poll: null,
  meeting: null,
  ...extra,
});
async function create(extra = {}, who = admin) {
  const r = await who("/communications/posts", "POST", payload(extra));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function update(post, changes = {}) {
  return admin(`/communications/posts/${post.id}`, "PUT", {
    ...post,
    ...changes,
  });
}
before(async () => {
  const app = express();
  app.use(express.json({ limit: "60mb" }));
  app.use("/api", router);
  app.use((error, _req, res, _next) =>
    res.status(500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = client();
  owner = client();
  tenant = client();
  stranger = client();
  scoped = client();
  for (const [c, name] of [
    [admin, "super_admin"],
    [owner, "carlos"],
    [tenant, "laura"],
  ])
    assert.equal(
      (await c("/auth/signin", "POST", { usuario: name, password: name }))
        .status,
      200,
    );
  assert.equal(
    (
      await stranger("/auth/signup", "POST", {
        nombre: "Sin vínculo",
        usuario: "sin-vinculo",
        email: "sin-vinculo@example.test",
        password: "test-password-new",
      })
    ).status,
    201,
  );
  db.prepare(
    "INSERT INTO users(id,nombre,usuario,email,rol,activo,passwordHash) VALUES (?,?,?,?,?,1,?)",
  ).run(
    "comms-scoped",
    "Admin Comunidad",
    "comms-scoped",
    "scoped@example.test",
    "community_admin",
    passwordRecord("test-password-scoped"),
  );
  db.prepare(
    "UPDATE communities SET adminUserId='comms-scoped' WHERE id=?",
  ).run(communityId);
  assert.equal(
    (
      await scoped("/auth/signin", "POST", {
        usuario: "comms-scoped",
        password: "test-password-scoped",
      })
    ).status,
    200,
  );
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-comms-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("comunicación: requiere sesión y un usuario nuevo no adopta otra comunidad", async () => {
  assert.equal((await client()("/communications/posts")).status, 401);
  assert.deepEqual((await stranger("/communications/posts")).data, []);
  assert.deepEqual(
    (await stranger("/communications/metadata")).data.communities,
    [],
  );
  assert.equal(
    (await owner("/communications/posts", "POST", payload())).status,
    403,
  );
});
test("publicación general llega a propietarios e inquilinos sin filtrar participantes ni contactos", async () => {
  const p = await create();
  assert.ok(p.recipients.some((r) => r.userId === user("carlos").id));
  assert.ok(p.recipients.some((r) => r.userId === user("laura").id));
  assert.equal((await stranger(`/communications/posts/${p.id}`)).status, 404);
  for (const c of [owner, tenant]) {
    const r = await c(`/communications/posts/${p.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.canManage, false);
    assert.equal(r.data.recipients, undefined);
    assert.equal(r.data.deliveries, undefined);
    assert.equal(r.data.history, undefined);
    assert.equal(JSON.stringify(r.data).includes("passwordHash"), false);
  }
});
test("destinatarios seleccionados: deduplica cuentas y no avisa a otros residentes", async () => {
  const p = await create({
    audience: {
      mode: "selected",
      ownerIds: ["own-seed-1"],
      tenantIds: [],
      propertyIds: ["prop-seed-1"],
    },
  });
  assert.equal(
    p.recipients.filter((r) => r.userId === user("carlos").id).length,
    1,
  );
  assert.equal((await owner(`/communications/posts/${p.id}`)).status, 200);
  assert.equal((await tenant(`/communications/posts/${p.id}`)).status, 200);
  const personal = await create({
    audience: {
      mode: "selected",
      ownerIds: ["own-seed-1"],
      tenantIds: [],
      propertyIds: [],
    },
  });
  assert.equal(
    (await tenant(`/communications/posts/${personal.id}`)).status,
    404,
  );
});
test("borradores y programaciones no son visibles antes de distribuir; programación editable", async () => {
  const draft = await create({ status: "draft" });
  assert.equal((await owner(`/communications/posts/${draft.id}`)).status, 404);
  assert.equal(draft.recipients.length, 0);
  const scheduled = await create({ publishAt: later(4) });
  assert.equal(scheduled.phase, "scheduled");
  assert.equal(
    (await owner(`/communications/posts/${scheduled.id}`)).status,
    404,
  );
  const moved = await update(scheduled, { publishAt: later(3) });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  const sent = await update(moved.data, { publishAt: now() });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.distributed, true);
  assert.equal(
    (await owner(`/communications/posts/${scheduled.id}`)).status,
    200,
  );
});
test("vista previa avisa de perfiles sin cuenta y consentimiento externo", async () => {
  const r = await admin(
    "/communications/preview",
    "POST",
    payload({ channels: ["sms"] }),
  );
  assert.equal(r.status, 200);
  assert.ok(r.data.recipients.length >= 2);
  assert.ok(r.data.unlinked.length > 0);
  assert.deepEqual(r.data.channels.sms, { enabled: false, optedIn: 0 });
  assert.ok(
    r.data.recipients.every(
      (u) => Object.keys(u).sort().join(",") === "id,name",
    ),
  );
});
test("servidor valida fechas, audiencia, enlaces y comunidad ajena", async () => {
  for (const change of [
    { type: "other" },
    { type: "event", startsAt: later(2), endsAt: later(1) },
    { archiveAt: "no-fecha" },
    { audience: { mode: "selected", ownerIds: ["own-seed-3"] } },
    {
      type: "meeting",
      startsAt: later(),
      endsAt: later(25),
      meeting: { agenda: "Prueba", url: "javascript:alert(1)" },
    },
    { channels: ["telegram"] },
    {
      poll: {
        type: "survey",
        question: "Pregunta",
        options: ["Sí", "sí"],
        electorate: "recipients",
        closesAt: later(),
      },
    },
  ])
    assert.equal(
      (await admin("/communications/posts", "POST", payload(change))).status,
      400,
    );
  assert.equal(
    (
      await scoped(
        "/communications/posts",
        "POST",
        payload({ communityId: "com-seed-2" }),
      )
    ).status,
    403,
  );
  assert.equal((await scoped("/communications/providers")).status, 403);
  assert.equal(
    (
      await scoped(
        "/communications/posts",
        "POST",
        payload({ title: "Aviso de mi comunidad" }),
      )
    ).status,
    201,
  );
});
test("lectura y confirmación se registran por destinatario y por separado", async () => {
  const p = await create();
  assert.equal(
    (await owner(`/communications/posts/${p.id}/read`, "POST", {})).status,
    200,
  );
  let detail = (await admin(`/communications/posts/${p.id}`)).data;
  const mine = detail.recipients.find((r) => r.userId === user("carlos").id);
  assert.ok(mine.readAt);
  assert.equal(mine.receiptAt, "");
  assert.equal(
    (await owner(`/communications/posts/${p.id}/receipt`, "POST", {})).status,
    200,
  );
  detail = (await admin(`/communications/posts/${p.id}`)).data;
  assert.ok(
    detail.recipients.find((r) => r.userId === user("carlos").id).receiptAt,
  );
  assert.equal(
    detail.recipients.find((r) => r.userId === user("laura").id).readAt,
    "",
  );
});
test("comentarios: texto literal, eliminación propia o moderación y bloqueo por estado", async () => {
  const p = await create();
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/comments`, "POST", {
        body: '<img src=x onerror="alert(1)">',
      })
    ).status,
    201,
  );
  let r = (await owner(`/communications/posts/${p.id}`)).data;
  assert.match(r.comments[0].body, /<img/);
  const id = r.comments[0].id;
  assert.equal(
    (await tenant(`/communications/posts/${p.id}/comments/${id}`, "DELETE"))
      .status,
    403,
  );
  assert.equal(
    (await owner(`/communications/posts/${p.id}/comments/${id}`, "DELETE"))
      .status,
    200,
  );
  r = (await owner(`/communications/posts/${p.id}`)).data;
  assert.equal(r.comments[0].body, "Comentario eliminado");
  const disabled = await create({ commentsEnabled: false });
  assert.equal(
    (
      await owner(`/communications/posts/${disabled.id}/comments`, "POST", {
        body: "Hola",
      })
    ).status,
    409,
  );
  const cancelled = await update(
    (await admin(`/communications/posts/${p.id}`)).data,
    { status: "cancelled" },
  );
  assert.equal(cancelled.status, 200);
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/comments`, "POST", {
        body: "Hola",
      })
    ).status,
    409,
  );
});
const poll = (extra) => ({
  type: "vote",
  question: "¿Aprobamos la propuesta?",
  options: ["Sí", "No", "Abstención"],
  electorate: "owners",
  multiple: false,
  resultsLive: false,
  closesAt: later(),
  closed: false,
  ...extra,
});
test("votaciones: electorado, una respuesta, opciones válidas y resultados reservados", async () => {
  const p = await create({ poll: poll() });
  assert.equal(
    (
      await tenant(`/communications/posts/${p.id}/ballot`, "POST", {
        choices: [0],
      })
    ).status,
    403,
  );
  for (const choices of [[99], [0, 1], [0, 0], [], ["0"]])
    assert.equal(
      (await owner(`/communications/posts/${p.id}/ballot`, "POST", { choices }))
        .status,
      400,
    );
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/ballot`, "POST", {
        choices: [0],
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/ballot`, "POST", {
        choices: [1],
      })
    ).status,
    409,
  );
  let d = (await owner(`/communications/posts/${p.id}`)).data;
  assert.deepEqual(d.ballot, [0]);
  assert.equal(d.pollResults, null);
  const changed = await update(
    (await admin(`/communications/posts/${p.id}`)).data,
    { poll: poll({ options: ["A", "B"] }) },
  );
  assert.equal(changed.status, 400);
  const old = (await admin(`/communications/posts/${p.id}`)).data;
  const closed = await update(old, { poll: { ...old.poll, closed: true } });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  d = (await tenant(`/communications/posts/${p.id}`)).data;
  assert.deepEqual(d.pollResults, { total: 1, counts: [1, 0, 0] });
  assert.deepEqual(d.ballot, []);
  assert.equal(d.ballots, undefined);
});
test("encuestas permiten respuesta múltiple de inquilinos y cierre por fecha", async () => {
  const p = await create({
    poll: poll({
      type: "survey",
      electorate: "recipients",
      multiple: true,
      resultsLive: true,
    }),
  });
  assert.equal(
    (
      await tenant(`/communications/posts/${p.id}/ballot`, "POST", {
        choices: [0, 2],
      })
    ).status,
    201,
  );
  assert.deepEqual(
    (await owner(`/communications/posts/${p.id}`)).data.pollResults,
    { total: 1, counts: [1, 0, 1] },
  );
  const data = postById(p.id);
  data.poll.closesAt = new Date(Date.now() - 1000).toISOString();
  db.prepare("UPDATE communication_posts SET data=? WHERE id=?").run(
    JSON.stringify(data),
    p.id,
  );
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/ballot`, "POST", {
        choices: [1],
      })
    ).status,
    409,
  );
});
test("reuniones conservan invitación, confirmación y asistencia real por separado", async () => {
  const p = await create({
    type: "meeting",
    startsAt: later(),
    endsAt: later(25),
    meeting: {
      location: "Salón",
      url: "",
      agenda: "1. Presupuesto\n2. Mantenimiento",
      tasks: [
        {
          title: "Pedir presupuesto",
          responsible: "Administración",
          dueAt: later(48),
          done: false,
        },
      ],
    },
  });
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/rsvp`, "POST", {
        rsvp: "accepted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await owner(`/communications/posts/${p.id}/attendance`, "POST", {
        userId: user("laura").id,
        attended: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await admin(`/communications/posts/${p.id}/attendance`, "POST", {
        userId: user("carlos").id,
        attended: true,
      })
    ).status,
    200,
  );
  const r = (await admin(`/communications/posts/${p.id}`)).data.recipients.find(
    (r) => r.userId === user("carlos").id,
  );
  assert.equal(r.rsvp, "accepted");
  assert.equal(r.attended, 1);
});
function fileForm(
  kind = "minutes",
  content = "%PDF-1.4\nActa de prueba",
  name = "acta.pdf",
) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", new Blob([content], { type: "application/pdf" }), name);
  return form;
}
test("actas: borradores privados, publicación explícita y versiones conservadas", async () => {
  const p = await create({
    type: "meeting",
    startsAt: later(),
    endsAt: later(25),
    meeting: { location: "Salón", agenda: "Orden del día", tasks: [] },
    channels: ["email"],
  });
  assert.equal(
    (await owner(`/communications/posts/${p.id}/files`, "POST", fileForm()))
      .status,
    404,
  );
  assert.equal(
    (
      await admin(
        `/communications/posts/${p.id}/files`,
        "POST",
        fileForm("minutes", "archivo falso"),
      )
    ).status,
    400,
  );
  const uploaded = await admin(
    `/communications/posts/${p.id}/files`,
    "POST",
    fileForm(),
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const id = uploaded.data.id;
  assert.equal(
    (await owner(`/communications/posts/${p.id}`)).data.files.length,
    0,
  );
  assert.equal(
    (await owner(`/communications/posts/${p.id}/files/${id}`)).status,
    404,
  );
  assert.equal(
    (await admin(`/communications/posts/${p.id}/files/${id}/final`, "POST", {}))
      .status,
    200,
  );
  const visible = (await owner(`/communications/posts/${p.id}`)).data;
  assert.equal(visible.files[0].final, 1);
  const downloaded = await owner(
    `/communications/posts/${p.id}/files/${id}`,
    "GET",
    undefined,
    true,
  );
  assert.match(downloaded.data, /%PDF/);
  assert.match(downloaded.headers.get("content-disposition"), /^attachment/);
  assert.equal(
    (await stranger(`/communications/posts/${p.id}/files/${id}`)).status,
    404,
  );
  assert.equal(
    (await admin(`/communications/posts/${p.id}/files/${id}`, "DELETE")).status,
    409,
  );
  assert.ok(
    db
      .prepare(
        "SELECT 1 FROM communication_outbox WHERE postId=? AND kind='minutes'",
      )
      .get(p.id),
  );
});
test("ediciones concurrentes no sobrescriben cambios y no pueden alterar destinatarios enviados", async () => {
  const p = await create();
  const first = await update(p, { title: "Título corregido" });
  assert.equal(first.status, 200);
  assert.equal((await update(p, { title: "Cambio viejo" })).status, 409);
  assert.equal(
    (
      await update(first.data, {
        audience: {
          mode: "owners",
          ownerIds: [],
          tenantIds: [],
          propertyIds: [],
        },
      })
    ).status,
    400,
  );
  assert.equal((await update(first.data, { status: "draft" })).status, 400);
});
test("proveedores: solo superadmin, secretos cifrados y respuestas enmascaradas", async () => {
  assert.equal((await owner("/communications/providers")).status, 403);
  const config = (await admin("/communications/providers")).data;
  config.smtp = {
    ...config.smtp,
    enabled: true,
    host: "smtp.example.test",
    user: "mailer",
    password: "smtp-secret-test",
    from: "comunidad@example.test",
  };
  config.sms = {
    ...config.sms,
    enabled: true,
    accountSid: `AC${"a".repeat(32)}`,
    token: "sms-secret-test",
    from: "+34600111222",
  };
  config.whatsapp = {
    ...config.whatsapp,
    enabled: true,
    accountSid: `AC${"b".repeat(32)}`,
    token: "wa-secret-test",
    from: "+34600111223",
    contentSid: `HX${"c".repeat(32)}`,
  };
  const saved = await admin("/communications/providers", "PUT", config);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.smtp.hasSecret, true);
  assert.equal(saved.data.smtp.password, undefined);
  assert.equal(saved.data.sms.token, undefined);
  const stored = db
    .prepare("SELECT data FROM communication_providers")
    .get().data;
  assert.equal(stored.includes("smtp-secret-test"), false);
  assert.equal(stored.includes("wa-secret-test"), false);
  assert.equal(providers(false).smtp.password, "smtp-secret-test");
  assert.equal(unseal(seal("test")), "test");
  const preserved = await admin("/communications/providers", "PUT", saved.data);
  assert.equal(preserved.status, 200);
  assert.equal(providers(false).smtp.password, "smtp-secret-test");
  const invalid = structuredClone(saved.data);
  invalid.smtp.from = "mal\r\nBcc: other@example.test";
  assert.equal(
    (await admin("/communications/providers", "PUT", invalid)).status,
    400,
  );
  const clear = structuredClone(saved.data);
  clear.smtp.enabled = false;
  clear.smtp.clearSecret = true;
  assert.equal(
    (await admin("/communications/providers", "PUT", clear)).status,
    200,
  );
  assert.equal(providers().smtp.hasSecret, false);
  const b = (await owner("/bootstrap")).data;
  assert.equal(JSON.stringify(b).includes("smtp-secret-test"), false);
});
test("canales externos requieren consentimiento y validan email y teléfono", async () => {
  assert.equal(getPreferences(user("carlos")).smsEnabled, false);
  assert.equal(
    (
      await owner("/communications/preferences", "PUT", {
        phone: "612345678",
        smsEnabled: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await owner("/communications/preferences", "PUT", {
        email: "bad",
        emailEnabled: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await owner("/communications/preferences", "PUT", {
        phone: "+34600111222",
        email: "carlos@example.test",
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await tenant("/communications/preferences")).data.smsEnabled,
    false,
  );
});
test("cola persistente respeta consentimiento, deduplica y distingue aceptación de entrega", async () => {
  db.prepare("DELETE FROM communication_outbox").run();
  const p = await create({ channels: ["sms"] });
  queue(postById(p.id));
  queue(postById(p.id));
  const count = db
    .prepare("SELECT COUNT(*) n FROM communication_outbox WHERE postId=?")
    .get(p.id).n;
  assert.equal(count, p.recipients.length);
  const sent = [];
  await processCommunications(async (channel, to, message) => {
    sent.push({ channel, to, message });
    return "SM-test";
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "+34600111222");
  assert.equal(sent[0].message.includes("mantenimiento"), false);
  const rows = db
    .prepare("SELECT * FROM communication_outbox WHERE postId=?")
    .all(p.id);
  assert.equal(rows.filter((r) => r.state === "accepted").length, 1);
  assert.ok(rows.some((r) => r.state === "skipped"));
  await processCommunications(async () => {
    assert.fail("No debe reenviar aceptados");
  });
});
test("cola no envía revisiones antiguas y los fallos de red quedan inciertos sin reenvío automático", async () => {
  db.prepare("DELETE FROM communication_outbox").run();
  const p = await create({ channels: ["sms"] });
  const updated = await update(p, { title: "Actualizado" });
  assert.equal(updated.status, 200);
  let attempts = 0;
  await processCommunications(async () => {
    attempts++;
    throw new Error("network-secret-internal");
  });
  assert.equal(attempts, 1);
  const rows = db
    .prepare("SELECT * FROM communication_outbox WHERE postId=?")
    .all(p.id);
  assert.ok(rows.some((r) => r.state === "uncertain"));
  assert.equal(JSON.stringify(rows).includes("network-secret-internal"), false);
  await processCommunications(async () =>
    assert.fail("No debe reintentar sin intervención"),
  );
});
test("recordatorios se generan una sola vez dentro de la ventana", async () => {
  const p = await create({
    type: "event",
    startsAt: later(1),
    endsAt: later(2),
    reminderMinutes: 120,
    channels: ["sms"],
  });
  materialize();
  materialize();
  const rows = db
    .prepare(
      "SELECT * FROM communication_outbox WHERE postId=? AND kind='reminder'",
    )
    .all(p.id);
  assert.equal(rows.length, p.recipients.length);
});
test("desvincular un perfil revoca también documentos y publicaciones históricas", async () => {
  const p = await create({
    audience: { mode: "owners", ownerIds: [], tenantIds: [], propertyIds: [] },
  });
  assert.equal((await owner(`/communications/posts/${p.id}`)).status, 200);
  const id = user("carlos").id;
  db.prepare("UPDATE owners SET userId='' WHERE userId=?").run(id);
  assert.equal((await owner(`/communications/posts/${p.id}`)).status, 404);
  db.prepare("UPDATE owners SET userId=? WHERE id='own-seed-1'").run(id);
});
test("vistas previas de una actualización conservan el destinatario original", async () => {
  const p = await create({
    audience: { mode: "owners", ownerIds: [], tenantIds: [], propertyIds: [] },
  });
  const before = p.recipients.map((r) => r.userId).sort();
  db.prepare("UPDATE owners SET userId=? WHERE id='own-seed-2'").run(
    user("sin-vinculo").id,
  );
  try {
    const preview = await admin("/communications/preview", "POST", {
      ...p,
      title: "Actualizar aviso",
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.deepEqual(preview.data.recipients.map((r) => r.id).sort(), before);
    assert.equal((await stranger(`/communications/posts/${p.id}`)).status, 404);
  } finally {
    db.prepare("UPDATE owners SET userId='' WHERE id='own-seed-2'").run();
  }
});
test("el vencimiento del contrato revoca el acceso del inquilino", async () => {
  const p = await create();
  const id = user("laura").id;
  db.prepare("UPDATE tenants SET contractEnd='2020-01-01' WHERE userId=?").run(
    id,
  );
  try {
    assert.equal((await tenant(`/communications/posts/${p.id}`)).status, 404);
  } finally {
    db.prepare("UPDATE tenants SET contractEnd='' WHERE userId=?").run(id);
  }
});
test("una selección histórica sigue editable al eliminar el perfil destinatario", async () => {
  const p = await create({
    audience: {
      mode: "selected",
      ownerIds: ["own-seed-2"],
      tenantIds: [],
      propertyIds: [],
    },
  });
  // Retirar la propiedad del ámbito reproduce el efecto de un perfil que ya no pertenece a la comunidad.
  const row = db
    .prepare("SELECT ownerIds FROM properties WHERE id='prop-seed-2'")
    .get();
  db.prepare(
    "UPDATE properties SET ownerIds='[]' WHERE id='prop-seed-2'",
  ).run();
  try {
    const r = await update(p, { body: "Actualización histórica" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  } finally {
    db.prepare("UPDATE properties SET ownerIds=? WHERE id='prop-seed-2'").run(
      row.ownerIds,
    );
  }
});
test("no se envían recordatorios vencidos ni publicaciones ya archivadas", async () => {
  db.prepare("DELETE FROM communication_outbox").run();
  const p = await create({ channels: ["sms"], title: "Archivado: no enviar" });
  const saved = postById(p.id);
  saved.archiveAt = new Date(Date.now() - 1000).toISOString();
  db.prepare("UPDATE communication_posts SET data=? WHERE id=?").run(
    JSON.stringify(saved),
    p.id,
  );
  await processCommunications(async (_channel, _to, message) => {
    assert.equal(message.includes("Archivado: no enviar"), false);
    return "SM-other";
  });
  assert.ok(
    db
      .prepare("SELECT * FROM communication_outbox WHERE postId=?")
      .all(p.id)
      .every((r) => r.state === "skipped"),
  );
});
test("Twilio usa plantilla WhatsApp y no confunde rechazo con aceptación", async () => {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), {
      status: 201,
    });
  };
  const config = {
    whatsapp: {
      enabled: true,
      accountSid: `AC${"d".repeat(32)}`,
      token: "not-a-real-token",
      from: "+34600111222",
      contentSid: `HX${"e".repeat(32)}`,
    },
  };
  try {
    assert.equal(
      await sendMessage("whatsapp", "+34600111223", "Texto de prueba", config),
      "SM123",
    );
    assert.match(calls[0].url, /^https:\/\/api.twilio.com\//);
    assert.equal(calls[0].options.body.get("To"), "whatsapp:+34600111223");
    assert.equal(calls[0].options.body.has("Body"), false);
    assert.deepEqual(
      JSON.parse(calls[0].options.body.get("ContentVariables")),
      { 1: "Texto de prueba" },
    );
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 63016 }), { status: 400 });
    await assert.rejects(
      () => sendMessage("whatsapp", "+34600111223", "Texto", config),
      /63016/,
    );
  } finally {
    globalThis.fetch = original;
  }
  const transport = smtpTransport({
    host: "smtp.example.test",
    port: 587,
    secure: false,
    user: "u",
    password: "p",
  });
  assert.equal(transport.options.requireTLS, true);
  assert.equal(transport.options.disableFileAccess, true);
  transport.close();
});
