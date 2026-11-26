import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-deletion-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
process.env.APP_PUBLIC_URL = "http://localhost:3000";
// Las pruebas no hablan con Postgres: la purga del historial se inyecta.
delete process.env.DATABASE_URL;
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
const { deleteAccount, approveDeletionRequest } = await import("../../src/account-deletion.js");

const app = express();
app.use("/api", router);
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));

// Express real sobre objetos HTTP en memoria: misma tubería que producción sin red.
function request(url, method = "GET", body, cookie = "", headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, done) {
        done();
      },
    });
    const req = new IncomingMessage(socket);
    req.url = `/api${url}`;
    req.method = method;
    req.headers = { host: "localhost:3000", cookie, ...headers };
    req.body = body;
    const res = new ServerResponse(req);
    res.end = (chunk) => {
      try {
        res.emit("finish");
        resolve({
          status: res.statusCode,
          data: chunk ? JSON.parse(String(chunk)) : null,
          cookie: String(res.getHeader("set-cookie") || "").split(";")[0],
        });
      } catch (error) {
        reject(error);
      }
      socket.destroy();
      return res;
    };
    app.handle(req, res, (error) => reject(error || new Error("Ruta sin respuesta")));
  });
}

const signin = (usuario) =>
  request("/auth/signin", "POST", { usuario, password: usuario }).then((res) => {
    assert.equal(res.status, 200, `No se pudo iniciar sesión como ${usuario}`);
    return res.cookie;
  });
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const userId = (usuario) => db.prepare("SELECT id FROM users WHERE usuario=?").get(usuario)?.id;
const userRow = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);
const requestRow = (id) => db.prepare("SELECT * FROM account_deletion_requests WHERE id=?").get(id);
const createUser = async (admin, usuario) => {
  const created = await request(
    "/admin/users",
    "POST",
    {
      nombre: "Cuenta",
      apellido: usuario,
      usuario,
      email: `${usuario}@example.test`,
      rol: "user",
      password: "clave-de-prueba-123",
    },
    admin,
  );
  assert.equal(created.status, 201, `No se pudo crear ${usuario}`);
  return created.data.id;
};

after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("la baja exige la contraseña actual y no registra solicitudes con credenciales erróneas", async () => {
  const cookie = await signin("urusp1");
  const empty = await request("/auth/deletion-request", "POST", {}, cookie);
  assert.equal(empty.status, 401);
  const wrong = await request("/auth/deletion-request", "POST", { password: "otra-cosa" }, cookie);
  assert.equal(wrong.status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM account_deletion_requests").get().n, 0);
});

test("un titular solicita la baja, la ve pendiente y la administración la recibe", async () => {
  const cookie = await signin("urusp1");
  const created = await request(
    "/auth/deletion-request",
    "POST",
    { password: "urusp1", reason: "Ya no uso la plataforma" },
    cookie,
  );
  assert.equal(created.status, 201);
  assert.equal(created.data.request.state, "pending");
  assert.equal(created.data.request.reason, "Ya no uso la plataforma");

  const own = await request("/auth/deletion-request", undefined, undefined, cookie);
  assert.equal(own.status, 200);
  assert.equal(own.data.request.state, "pending");

  const duplicate = await request("/auth/deletion-request", "POST", { password: "urusp1" }, cookie);
  assert.equal(duplicate.status, 409);

  // Gestión de usuarios: por defecto solo el superadministrador tiene admin:users.
  const admin = await signin("super_admin");
  const queue = await request("/admin/users/deletion-requests", undefined, undefined, admin);
  assert.equal(queue.status, 200);
  assert.equal(queue.data.requests.length, 1);
  const item = queue.data.requests[0];
  assert.equal(item.state, "pending");
  assert.equal(item.usuario, "urusp1");
  assert.equal(item.reason, "Ya no uso la plataforma");
  assert.equal(item.userId, userId("urusp1"));
});

test("el titular puede cancelar su solicitud y volver a enviarla", async () => {
  const cookie = await signin("urusp1");
  const cancelled = await request("/auth/deletion-request", "DELETE", undefined, cookie);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.request.state, "cancelled");

  const again = await request("/auth/deletion-request", "POST", { password: "urusp1" }, cookie);
  assert.equal(again.status, 201);
  assert.equal(again.data.request.state, "pending");
});

test("la administración rechaza con una nota que el titular puede leer", async () => {
  const admin = await signin("super_admin");
  const cookie = await signin("urusp1");
  const pending = await request("/auth/deletion-request", undefined, undefined, cookie);
  const rejected = await request(
    `/admin/users/deletion-requests/${pending.data.request.id}/reject`,
    "POST",
    { note: "Falta desvincular la ficha de propietario" },
    admin,
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.request.state, "rejected");

  const own = await request("/auth/deletion-request", undefined, undefined, cookie);
  assert.equal(own.data.request.state, "rejected");
  assert.equal(own.data.request.resolutionNote, "Falta desvincular la ficha de propietario");
  // La cuenta sigue activa y puede seguir iniciando sesión.
  assert.ok(userRow("user-urusp1").activo);
  await signin("urusp1");
});

test("no se puede aprobar la baja de una cuenta con perfil de propietario", async () => {
  const admin = await signin("super_admin");
  const cookie = await signin("urucp1");
  const created = await request("/auth/deletion-request", "POST", { password: "urucp1" }, cookie);
  assert.equal(created.status, 201);
  const blocked = await request(
    `/admin/users/deletion-requests/${created.data.request.id}/approve`,
    "POST",
    undefined,
    admin,
  );
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /perfil de propietario/);
  assert.ok(userRow("user-urucp1"));
  assert.equal(requestRow(created.data.request.id).state, "pending");
});

test("no se puede aprobar la baja del último superadministrador", async () => {
  const cookie = await signin("super_admin");
  const created = await request(
    "/auth/deletion-request",
    "POST",
    { password: "super_admin" },
    cookie,
  );
  assert.equal(created.status, 201);
  const blocked = await request(
    `/admin/users/deletion-requests/${created.data.request.id}/approve`,
    "POST",
    undefined,
    cookie,
  );
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /al menos un superadministrador activo/);
  assert.ok(userRow(userId("super_admin")));
});

test("la cola de bajas exige el permiso de usuarios", async () => {
  const cookie = await signin("urucp1");
  const list = await request("/admin/users/deletion-requests", undefined, undefined, cookie);
  assert.equal(list.status, 403);
  // El administrador general tampoco gestiona cuentas: solo admin:users puede.
  const general = await signin("admin");
  const denied = await request("/admin/users/deletion-requests", undefined, undefined, general);
  assert.equal(denied.status, 403);
  const pending = db
    .prepare("SELECT id FROM account_deletion_requests WHERE state='pending' LIMIT 1")
    .get();
  const approve = await request(
    `/admin/users/deletion-requests/${pending.id}/approve`,
    "POST",
    undefined,
    cookie,
  );
  assert.equal(approve.status, 403);
});

test("aprobar la baja elimina la cuenta, sus sesiones y sus datos de recuperación", async () => {
  const cookie = await signin("urusp1");
  const email = userRow("user-urusp1").email;
  // Restos de otras funciones que también contienen datos de la cuenta.
  db.prepare(
    "INSERT INTO password_recovery_mail (id,userId,tokenHash,payload,state,createdAt) VALUES ('mail-1',?,?,'{}','pending',?)",
  ).run("user-urusp1", sha256("token"), Date.now());
  db.prepare(
    "INSERT INTO password_recovery_requests (emailHash,requestedAt) VALUES (?,?) ON CONFLICT(emailHash) DO UPDATE SET requestedAt=excluded.requestedAt",
  ).run(sha256(email.trim().toLowerCase()), Date.now());

  const created = await request(
    "/auth/deletion-request",
    "POST",
    { password: "urusp1", reason: "Baja definitiva" },
    cookie,
  );
  assert.equal(created.status, 201);

  const admin = await signin("super_admin");
  const approved = await request(
    `/admin/users/deletion-requests/${created.data.request.id}/approve`,
    "POST",
    undefined,
    admin,
  );
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.data, { ok: true });

  assert.equal(userRow("user-urusp1"), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE userId='user-urusp1'").get().n, 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM password_recovery_mail WHERE userId='user-urusp1'").get().n,
    0,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM password_recovery_requests WHERE emailHash=?")
      .get(sha256(email.trim().toLowerCase())).n,
    0,
  );
  const resolved = requestRow(created.data.request.id);
  assert.equal(resolved.state, "approved");
  assert.equal(resolved.reason, "");

  const expired = await request("/auth/me", undefined, undefined, cookie);
  assert.equal(expired.status, 401);
  // El borrado queda en la auditoría de seguridad.
  const audit = db
    .prepare("SELECT * FROM access_audit WHERE action='users.deleted' AND resourceId=?")
    .all("user-urusp1");
  assert.ok(audit.length >= 1);
});

test("el borrado directo desde Administración → Usuarios sigue funcionando", async () => {
  const admin = await signin("super_admin");
  const created = await request(
    "/admin/users",
    "POST",
    {
      nombre: "Cuenta",
      apellido: "Temporal",
      usuario: "temporal",
      email: "temporal@example.test",
      rol: "user",
      password: "clave-temporal-123",
    },
    admin,
  );
  assert.equal(created.status, 201);
  const removed = await request(`/admin/users/${created.data.id}`, "DELETE", undefined, admin);
  assert.equal(removed.status, 200);
  assert.equal(userRow(created.data.id), undefined);

  // La cuenta inicial de superadministrador no puede quedar huérfana: sigue
  // protegida por la regla del último administrador activo.
  const protectedAdmin = await request(
    `/admin/users/${userId("super_admin")}`,
    "DELETE",
    undefined,
    admin,
  );
  assert.equal(protectedAdmin.status, 409);
});

test("la solicitud de baja entra en el limitador de intentos por cuenta", async () => {
  const cookie = await signin("urucp1");
  for (let attempt = 0; attempt < 15; attempt++) {
    const wrong = await request(
      "/auth/deletion-request",
      "POST",
      { password: "incorrecta" },
      cookie,
    );
    assert.equal(wrong.status, 401);
  }
  // Ni siquiera con la contraseña correcta se puede seguir probando.
  const blocked = await request("/auth/deletion-request", "POST", { password: "urucp1" }, cookie);
  assert.equal(blocked.status, 429);
  // El límite es de la cuenta, no del origen: otra cuenta todavía puede intentar.
  const other = await signin("admin");
  const allowed = await request(
    "/auth/deletion-request",
    "POST",
    { password: "incorrecta" },
    other,
  );
  assert.equal(allowed.status, 401);
});

test("la baja anonimiza la autoría de documentos, carpetas y comentarios", async () => {
  const admin = await signin("super_admin");
  const id = await createUser(admin, "anonimizado");
  db.prepare(
    "INSERT INTO documents (id,entityType,entityId,folderId,category,fileName,fileType,fileSize,uploadedAt,uploadedBy,uploadedByName,storedName) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "doc-anon",
    "community",
    "com-1",
    "",
    "document",
    "acta.pdf",
    "application/pdf",
    10,
    "2026-01-01T00:00:00.000Z",
    id,
    "Cuenta anonimizado",
    "guardado.pdf",
  );
  db.prepare(
    "INSERT INTO document_folders (id,entityType,entityId,parentId,name,nameKey,icon,category,createdAt,createdBy,createdByName) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "folder-anon",
    "community",
    "com-1",
    "",
    "Carpeta",
    "carpeta",
    "folder",
    "document",
    "2026-01-01T00:00:00.000Z",
    id,
    "Cuenta anonimizado",
  );
  db.prepare(
    "INSERT INTO communication_comments (id,postId,userId,body,createdAt,deleted) VALUES (?,?,?,?,?,0)",
  ).run("comment-anon", "post-1", id, "Comentario con datos", "2026-01-01T00:00:00.000Z");

  const removed = await request(`/admin/users/${id}`, "DELETE", undefined, admin);
  assert.equal(removed.status, 200);

  // El contenido queda, la identidad de quien lo aportó no.
  assert.deepEqual(
    { ...db.prepare("SELECT uploadedBy,uploadedByName FROM documents WHERE id='doc-anon'").get() },
    { uploadedBy: "", uploadedByName: "" },
  );
  assert.deepEqual(
    {
      ...db
        .prepare("SELECT createdBy,createdByName FROM document_folders WHERE id='folder-anon'")
        .get(),
    },
    { createdBy: "", createdByName: "" },
  );
  const comment = db
    .prepare("SELECT userId,body FROM communication_comments WHERE id='comment-anon'")
    .get();
  assert.equal(comment.userId, "");
  assert.equal(comment.body, "Comentario con datos");
  assert.equal(userRow(id), undefined);
});

test("la baja purga el historial de reportes y no borra la cuenta si la purga falla", async () => {
  const admin = await signin("super_admin");
  const actor = { id: userId("super_admin"), usuario: "super_admin" };
  const purged = [];
  const requested = await createUser(admin, "purgado");

  await deleteAccount(requested, {
    actor,
    purgeReports: async (userId) => purged.push(userId),
  });
  assert.deepEqual(purged, [requested], "La purga recibe el id de la cuenta");
  assert.equal(userRow(requested), undefined);

  const untouched = await createUser(admin, "sinpurga");
  await assert.rejects(
    () =>
      deleteAccount(untouched, {
        actor,
        purgeReports: async () => {
          throw new Error("Postgres no responde");
        },
      }),
    (error) => error.status === 503 && /historial de reportes/.test(error.message),
  );
  assert.ok(userRow(untouched), "La cuenta no se borra si el historial sigue ahí");
});

test("aprobar la baja purga el historial y deja la solicitud pendiente si falla", async () => {
  const admin = await signin("super_admin");
  const actor = { id: userId("super_admin"), usuario: "super_admin" };
  const id = await createUser(admin, "aprobacion");
  db.prepare(
    "INSERT INTO account_deletion_requests (id,userId,reason,state,requestedAt) VALUES (?,?,?,'pending',?)",
  ).run("req-falla", id, "", new Date().toISOString());

  const purged = [];
  await assert.rejects(
    () =>
      approveDeletionRequest("req-falla", actor, {
        purgeReports: async () => {
          purged.push("llamada");
          throw new Error("Postgres no responde");
        },
      }),
    (error) => error.status === 503,
  );
  assert.deepEqual(purged, ["llamada"]);
  assert.ok(userRow(id));
  assert.equal(requestRow("req-falla").state, "pending");

  // Con la purga resuelta, la aprobación sigue su curso.
  await approveDeletionRequest("req-falla", actor, { purgeReports: async () => {} });
  assert.equal(userRow(id), undefined);
  assert.equal(requestRow("req-falla").state, "approved");
});

test("acceso y portabilidad: la descarga propia no incluye datos de terceros", async () => {
  const admin = await signin("super_admin");
  const id = await createUser(admin, "midata1");
  const session = await request("/auth/signin", "POST", {
    usuario: "midata1",
    password: "clave-de-prueba-123",
  });
  assert.equal(session.status, 200, "No se pudo iniciar sesión como midata1");
  const cookie = session.cookie;
  db.prepare(
    "INSERT INTO owners (id,name,surname,dni,email,phone,userId) VALUES (?,?,?,?,?,?,?)",
  ).run("midata-owner", "Propia", "Persona", "11111111H", "urusp1@example.test", "+34600111222", id);
  db.prepare("INSERT INTO owners (id,name,surname,dni,email) VALUES (?,?,?,?,?)").run(
    "midata-other",
    "Ajena",
    "Persona",
    "22222222J",
    "ajena@example.test",
  );
  const download = await request("/auth/my-data", undefined, undefined, cookie);
  assert.equal(download.status, 200, JSON.stringify(download.data));
  assert.equal(download.data.cuenta.id, id);
  assert.ok(download.data.fichas.propietario.some((row) => row.id === "midata-owner"));
  assert.equal(JSON.stringify(download.data).includes("ajena@example.test"), false);
  assert.ok(
    db
      .prepare("SELECT COUNT(*) n FROM access_audit WHERE action='users.data-exported' AND resourceId=?")
      .get(id).n >= 1,
  );
  assert.equal((await request("/auth/my-data")).status, 401);
});

test("la baja anonimiza la ficha conservada en el acta de borrado avanzado", async () => {
  const admin = await signin("super_admin");
  const id = await createUser(admin, "archivo-rgpd");
  const email = "archivo-rgpd@example.test";
  db.prepare(
    "INSERT INTO owners (id,name,surname,dni,email,phone,address,iban,userId) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run("archive-owner", "Copia", "Archivada", "33333333P", email, "600111222", "Calle 1", "ES001", id);
  const archive = {
    entity: { id: "archive-owner", name: "Copia Archivada" },
    entities: [
      {
        type: "owner",
        id: "archive-owner",
        name: "Copia",
        surname: "Archivada",
        dni: "33333333P",
        email,
        phone: "600111222",
        address: "Calle 1",
        iban: "ES001",
        userId: id,
      },
      {
        type: "owner",
        id: "archive-other",
        name: "Otra",
        surname: "Persona",
        dni: "44444444D",
        email: "otra@example.test",
      },
    ],
    affected: {
      owners: [
        { id: "archive-owner", name: "Copia Archivada" },
        { id: "archive-other", name: "Otra Persona" },
      ],
    },
    financial: {
      receipts: [
        {
          id: "receipt-1",
          amount: 1000,
          snapshot: { owners: [{ id: "archive-owner", name: "Copia", dni: "33333333P" }] },
        },
      ],
    },
  };
  db.prepare(
    "INSERT INTO cascade_archives (id,createdAt,actorId,communityIds,data) VALUES (?,?,?,?,?)",
  ).run(
    "archive-rgpd",
    new Date().toISOString(),
    userId("super_admin"),
    "[]",
    JSON.stringify(archive),
  );
  db.prepare(
    "INSERT INTO communication_posts (id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)",
  ).run("post-rgpd", "", "{}", id, "now", "now");
  // La ficha debe estar desvinculada para poder suprimir la cuenta.
  db.prepare("UPDATE owners SET userId='' WHERE id='archive-owner'").run();

  await deleteAccount(id, {
    actor: { id: userId("super_admin"), usuario: "super_admin" },
    purgeReports: async () => {},
  });
  const data = JSON.parse(
    db.prepare("SELECT data FROM cascade_archives WHERE id='archive-rgpd'").get().data,
  );
  assert.equal(data.entities[0].name, "Titular suprimido (RGPD)");
  for (const field of ["dni", "email", "phone", "address", "iban", "userId"])
    assert.equal(data.entities[0][field], "", field);
  assert.equal(data.affected.owners[0].name, "Titular suprimido (RGPD)");
  assert.equal(data.financial.receipts[0].snapshot.owners[0].name, "Titular suprimido (RGPD)");
  assert.equal(data.financial.receipts[0].amount, 1000);
  assert.equal(data.entities[1].dni, "44444444D");
  assert.equal(data.affected.owners[1].name, "Otra Persona");
  assert.equal(
    db.prepare("SELECT createdBy FROM communication_posts WHERE id='post-rgpd'").get().createdBy,
    "",
  );
});

test("la solicitud de baja expone el plazo de un mes y marca las vencidas", async () => {
  const admin = await signin("super_admin");
  const id = await createUser(admin, "plazo-rgpd");
  const signinBody = await request("/auth/signin", "POST", {
    usuario: "plazo-rgpd",
    password: "clave-de-prueba-123",
  });
  assert.equal(signinBody.status, 200);
  const cookie = signinBody.cookie;
  const created = await request(
    "/auth/deletion-request",
    "POST",
    { password: "clave-de-prueba-123" },
    cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const pending = created.data.request;
  const days = (Date.parse(pending.deadline) - Date.parse(pending.requestedAt)) / 86400000;
  assert.ok(days >= 28 && days <= 31, `plazo de ${days} días`);
  assert.equal(pending.overdue, false);
  db.prepare("UPDATE account_deletion_requests SET requestedAt='2026-01-05T00:00:00.000Z' WHERE id=?").run(
    pending.id,
  );
  const again = await request("/auth/deletion-request", undefined, undefined, cookie);
  assert.equal(again.data.request.overdue, true);
  assert.equal(again.data.request.state, "pending");
  db.prepare("UPDATE account_deletion_requests SET state='cancelled' WHERE id=?").run(pending.id);
  assert.equal(userRow(id) !== undefined, true);
});
