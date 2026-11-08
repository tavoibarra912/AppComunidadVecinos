import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-security-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
process.env.APP_PUBLIC_URL = "http://localhost:3000";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
const { requestRecovery, resetRecoveredPassword, processRecoveryMail, recoverInterruptedMail, recoveryUrl } = await import("../../src/password-recovery.js");
const { providers, saveProviders, unseal } = await import("../../src/delivery-providers.js");
const { verifyPassword, passwordRecord } = await import("../../src/auth.js");
const { can } = await import("../../public/js/permissions.js");
const app = express();
app.use("/api", router);
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
// Real Express dispatch and HTTP objects, without listen(), sockets or network.
function request(url, method = "GET", body, cookie = "", headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
    const req = new IncomingMessage(socket);
    req.url = `/api${url}`;
    req.method = method;
    req.headers = { host: "localhost:3000", cookie, ...headers };
    req.body = body;
    const res = new ServerResponse(req);
    res.end = chunk => {
      try {
        res.emit("finish");
        resolve({ status: res.statusCode, data: chunk ? JSON.parse(String(chunk)) : null, cookie: String(res.getHeader("set-cookie") || "").split(";")[0] });
      } catch (error) { reject(error); }
      socket.destroy();
      return res;
    };
    app.handle(req, res, error => reject(error || new Error("Ruta sin respuesta")));
  });
}
const login = name => request("/auth/signin", "POST", { usuario: name, password: name });
const clearRequests = () => db.prepare("DELETE FROM password_recovery_requests").run();
const user = () => db.prepare("SELECT * FROM users WHERE id='user-carlos'").get();
function enableSmtp() {
  const config = providers();
  config.smtp = { ...config.smtp, enabled: true, host: "smtp.example.test", port: 587, user: "test", password: "fake-secret", from: "noreply@example.test" };
  config.sms.provider = config.whatsapp.provider = "twilio";
  saveProviders(config);
}
function pendingToken() {
  const mail = db.prepare("SELECT * FROM password_recovery_mail WHERE userId='user-carlos'").get();
  return { mail, token: new URL(JSON.parse(unseal(mail.payload)).url).hash.slice("#reset-password=".length) };
}
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test("auditoría: login, denegaciones, cambios de usuarios y roles sin secretos", async () => {
  assert.equal((await request("/auth/signin", "POST", { usuario: "super_admin", password: "secret-wrong-password" })).status, 401);
  const admin = await login("super_admin");
  assert.equal(admin.status, 200);
  assert.equal((await request("/audit")).status, 401);
  const owner = await login("carlos");
  assert.equal((await request("/audit", "GET", undefined, owner.cookie)).status, 403);
  const created = await request("/admin/users", "POST", { usuario: "audit-test", email: "audit@example.test", rol: "user", password: "secret-new-password" }, admin.cookie);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal((await request(`/admin/users/${created.data.id}`, "PUT", { rol: "administrator", password: "another-secret-password" }, admin.cookie)).status, 200);
  const role = await request("/admin/roles", "POST", { nombre: "Auditor", permisos: ["audit:read"] }, admin.cookie);
  assert.equal(role.status, 201);
  assert.equal((await request(`/admin/roles/${role.data.id}`, "PUT", { descripcion: "Historial" }, admin.cookie)).status, 200);
  assert.equal((await request(`/admin/roles/${role.data.id}`, "DELETE", undefined, admin.cookie)).status, 200);
  assert.equal((await request(`/admin/users/${created.data.id}`, "DELETE", undefined, admin.cookie)).status, 200);
  const result = await request("/audit?limit=100", "GET", undefined, admin.cookie);
  assert.equal(result.status, 200);
  for (const action of ["login", "access-denied", "users.created", "users.updated", "users.deleted", "roles.created", "roles.updated", "roles.deleted"]) assert.ok(result.data.items.some(item => item.action === action), action);
  assert.ok(result.data.items.some(item => item.action === "login" && item.outcome === "failure"));
  assert.ok(result.data.items.some(item => item.action === "login" && item.actorId === "user-admin" && item.outcome === "success"));
  const change = result.data.items.find(item => item.action === "users.updated");
  assert.equal(change.details.before.rol, "user");
  assert.equal(change.details.after.rol, "administrator");
  assert.equal(change.details.passwordChanged, true);
  assert.doesNotMatch(JSON.stringify(result.data), /secret-|passwordHash|resetToken|penarrubia_session/);
  assert.equal((await request("/audit?limit=101", "GET", undefined, admin.cookie)).status, 400);
  const page = await request("/audit?limit=1&offset=1&action=login", "GET", undefined, admin.cookie);
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.items[0].action, "login");
  await request("/auth/logout", "POST", {}, owner.cookie);
  assert.ok(db.prepare("SELECT id FROM access_audit WHERE action='logout'").get());
});
test("auditoría: permiso explícito global, nunca por administrar una comunidad", () => {
  const data = { roles: [{ nombre: "Auditor", permisos: ["audit:read"] }, { nombre: "community_admin", permisos: ["audit:read"] }, { nombre: "user", permisos: ["audit:read"] }], communities: [{ id: "com", adminUserId: "u" }] };
  assert.equal(can({ id: "u", activo: true, rol: "Auditor" }, "audit:read", "", data), true);
  for (const rol of ["community_admin", "user"]) assert.equal(can({ id: "u", activo: true, rol }, "audit:read", "", data), false);
});
test("recuperación: configuración ausente e inputs inválidos no aparentan envío", async () => {
  assert.equal((await request("/auth/forgot-password", "POST", { email: "invalid" })).status, 400);
  const sinConfig = await request("/auth/forgot-password", "POST", { email: user().email });
  assert.equal(sinConfig.status, 200);
  assert.ok(sinConfig.data.mensaje && !sinConfig.data.token);
  assert.equal((await request("/auth/reset-password", "POST", { token: "bad", password: "valid-password" })).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM password_recovery_mail").get().n, 0);
});
test("recuperación: cola cifrada, respuesta genérica, cooldown y correo simulado", async () => {
  enableSmtp();
  const known = await request("/auth/forgot-password", "POST", { email: user().email });
  const unknown = await request("/auth/forgot-password", "POST", { email: "missing@example.test" });
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data);
  const { token, mail } = pendingToken();
  assert.notEqual(user().resetToken, token);
  assert.equal(user().resetToken.length, 64);
  assert.ok(Date.parse(user().resetTokenExpira) - Date.now() > 29 * 60000);
  assert.ok(!mail.payload.includes(token));
  requestRecovery(user().email);
  assert.equal(pendingToken().token, token);
  const sent = [];
  await processRecoveryMail(async payload => sent.push(payload));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, user().email);
  assert.equal(new URL(sent[0].url).origin, "http://localhost:3000");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM password_recovery_mail").get().n, 0);
  assert.ok(db.prepare("SELECT id FROM access_audit WHERE action='password-recovery.mail' AND outcome='accepted'").get());
  assert.ok(!JSON.stringify(db.prepare("SELECT * FROM access_audit").all()).includes(token));
});
test("recuperación: reemplazo, caducidad, uso único y revocación de sesiones", async () => {
  clearRequests(); requestRecovery(user().email);
  const old = pendingToken().token;
  clearRequests(); requestRecovery(user().email);
  const { token } = pendingToken();
  assert.throws(() => resetRecoveredPassword(old, "valid-password-new"), /no es válido/);
  assert.throws(() => resetRecoveredPassword(token, "short"), /contraseña/i);
  const cookie = (await login("carlos")).cookie;
  const changed = await request("/auth/reset-password", "POST", { token, password: "valid-password-new" });
  assert.equal(changed.status, 200);
  assert.equal(verifyPassword("valid-password-new", user().passwordHash), true);
  assert.equal((await request("/auth/me", "GET", undefined, cookie)).status, 401);
  assert.throws(() => resetRecoveredPassword(token, "other-password"), /no es válido/);
  clearRequests(); requestRecovery(user().email);
  const expired = pendingToken().token;
  db.prepare("UPDATE users SET resetTokenExpira='2000-01-01T00:00:00.000Z' WHERE id=?").run(user().id);
  assert.throws(() => resetRecoveredPassword(expired, "other-password"), /venció/);
});
test("recuperación: fallos e interrupciones no reenvían ni exponen secretos", async () => {
  clearRequests(); requestRecovery(user().email);
  const token = pendingToken().token;
  let calls = 0;
  await processRecoveryMail(async () => { calls++; throw new Error("secret-provider-password"); });
  await processRecoveryMail(async () => { calls++; });
  assert.equal(calls, 1);
  assert.throws(() => resetRecoveredPassword(token, "another-password"), /no es válido/);
  assert.doesNotMatch(JSON.stringify(db.prepare("SELECT * FROM access_audit").all()), /secret-provider/);
  clearRequests(); requestRecovery(user().email);
  db.prepare("UPDATE password_recovery_mail SET state='sending'").run();
  recoverInterruptedMail();
  assert.equal(user().resetToken, "");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM password_recovery_mail").get().n, 0);
});
test("recuperación: cambiar email invalida un enlace ya enviado", async () => {
  const admin = await login("super_admin");
  clearRequests(); requestRecovery(user().email);
  const { token } = pendingToken();
  await processRecoveryMail(async () => {});
  assert.equal((await request(`/admin/users/${user().id}`, "PUT", { email: "changed@example.test" }, admin.cookie)).status, 200);
  assert.throws(() => resetRecoveredPassword(token, "new-password-safe"), /no es válido/);
  const denied = await request("/owners/own-seed-1?token=private-query", "GET", undefined, "", { origin: "https://evil.example" });
  assert.equal(denied.status, 401);
  const event = db.prepare("SELECT * FROM access_audit WHERE action='access-denied' ORDER BY id DESC LIMIT 1").get();
  assert.equal(event.route, "/owners/:id");
  assert.ok(!JSON.stringify(event).includes("private-query"));
});
test("recuperación: inactivos no reciben correo y el origen es confiable", () => {
  db.prepare("UPDATE users SET activo=0 WHERE id=?").run(user().id);
  clearRequests(); requestRecovery(user().email);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM password_recovery_mail").get().n, 0);
  db.prepare("UPDATE users SET activo=1,passwordHash=? WHERE id=?").run(passwordRecord("carlos"), user().id);
  for (const value of ["http://evil.example", "https://user:pass@example.test", "https://example.test/?token=bad", "https://example.test/#bad"]) {
    process.env.APP_PUBLIC_URL = value;
    assert.throws(recoveryUrl, /APP_PUBLIC_URL/);
  }
  process.env.APP_PUBLIC_URL = "http://localhost:3000";
  process.env.NODE_ENV = "production";
  assert.throws(recoveryUrl, /APP_PUBLIC_URL/);
  process.env.NODE_ENV = "test";
  // En desarrollo no hace falta configurarla: usa localhost y el puerto activo.
  delete process.env.APP_PUBLIC_URL;
  assert.equal(recoveryUrl().origin, `http://localhost:${process.env.PORT || 3000}`);
  process.env.NODE_ENV = "production";
  assert.throws(recoveryUrl, /APP_PUBLIC_URL/);
  process.env.NODE_ENV = "test";
  process.env.APP_PUBLIC_URL = "http://localhost:3000";
});
