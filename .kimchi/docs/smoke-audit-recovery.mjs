import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), "penarrubia-smoke-"));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: "pipe",
});
server.stderr.pipe(process.stderr);

const wait = ms => new Promise(r => setTimeout(r, ms));
async function untilReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await wait(200);
  }
  throw new Error("El server de humo no respondió.");
}

let failures = 0;
const check = (label, cond) => {
  failures += cond ? 0 : 1;
  console.log(`${cond ? "✔" : "✖"} ${label}`);
};

try {
  await untilReady();

  const html = await fetch(`${BASE}/`);
  const body = await html.text();
  check("index carga (200) y contiene la pantalla de login", html.status === 200 && body.includes("login-screen"));
  check("no referrer en la página", body.includes('name="referrer" content="no-referrer"'));

  const anonBoot = await fetch(`${BASE}/api/bootstrap`);
  check("bootstrap sin sesión → 401", anonBoot.status === 401);

  const login = await fetch(`${BASE}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "admin", password: "admin" }) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  check("login admin → 200 + cookie HttpOnly", login.status === 200 && /HttpOnly/i.test(login.headers.get("set-cookie") || ""));

  const boot = await fetch(`${BASE}/api/bootstrap`, { headers: { Cookie: cookie } });
  check("bootstrap con sesión → 200 con usuarios", boot.status === 200 && Array.isArray((await boot.json()).users));

  const auditDenied = await fetch(`${BASE}/api/audit`);
  check("auditoría sin sesión → 401", auditDenied.status === 401);
  const auditOk = await fetch(`${BASE}/api/audit?limit=10`, { headers: { Cookie: cookie } });
  const auditData = await auditOk.json();
  check("auditoría con superadmin → 200 y registra el login", auditOk.status === 200 && auditData.items.some(i => i.action === "login"));
  check("auditoría no expone contraseñas", !JSON.stringify(auditData).includes("passwordHash"));

  const forgot = await fetch(`${BASE}/api/auth/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.test" }) });
  const forgotData = await forgot.json();
  check("recuperación sin APP_PUBLIC_URL/SMTP → 503 sin fingir envío", forgot.status === 503 && !!forgotData.error && !forgotData.mensaje);

  const badReset = await fetch(`${BASE}/api/auth/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "zz", password: "valid-password" }) });
  check("token de recuperación inválido → 400", badReset.status === 400);

  const logout = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  check("logout → 200", logout.status === 200);
  const auditAfter = await fetch(`${BASE}/api/audit?limit=50`, { headers: { Cookie: (await fetch(`${BASE}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "admin", password: "admin" }) })).headers.get("set-cookie").split(";")[0] } });
  const items = (await auditAfter.json()).items;
  check("auditoría registra logout y acceso denegado", items.some(i => i.action === "logout") && items.some(i => i.action === "access-denied"));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r)).catch(() => {});
  await wait(300);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(failures ? `\n${failures} comprobación(es) fallaron` : "\nHumo OK");
process.exit(failures ? 1 : 0);
