// Guardas de modo producción: APP_ADMIN_PASSWORD >= 12 y APP_PUBLIC_URL HTTPS obligatorios.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-prod-"));
let fails = 0;
const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

const boot = env => new Promise(resolve => {
  const sufijo = Math.random().toString(36).slice(2, 7);
  const p = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, NODE_ENV: "production", PORT: "3463", APP_DATA_DIR: path.join(dir, "d" + sufijo), APP_UPLOADS_DIR: path.join(dir, "u" + sufijo), ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  p.stderr.on("data", d => { stderr += d; });
  let booted = false;
  const t = setInterval(async () => {
    try { if ((await fetch("http://127.0.0.1:3463/api/health")).ok) { clearInterval(t); booted = true; resolve({ p, booted, stderr }); } } catch {}
  }, 150);
  p.on("exit", code => { clearInterval(t); if (!booted) resolve({ p, booted: false, code, stderr }); });
  setTimeout(() => { if (!booted && p.exitCode === null) { clearInterval(t); resolve({ p, booted: false, timeout: true, stderr }); } }, 6000);
});

// 1) Sin APP_ADMIN_PASSWORD >= 12: debe rehusarse a arrancar
const sinPassword = await boot({});
sinPassword.p.kill();
check(`sin APP_ADMIN_PASSWORD no arranca en producción (${sinPassword.booted ? "ARRANCÓ" : "rechazado"})`, !sinPassword.booted && /APP_ADMIN_PASSWORD/.test(sinPassword.stderr));
if (sinPassword.p.exitCode === null) await new Promise(r => sinPassword.p.once("exit", r));
await new Promise(r => setTimeout(r, 300));

// 2) Con APP_ADMIN_PASSWORD pero sin APP_PUBLIC_URL: arranca, recuperación deshabilitada (503)
const sinUrl = await boot({ APP_ADMIN_PASSWORD: "clave-super-larga-123", APP_PUBLIC_URL: "" });
check(`sin APP_PUBLIC_URL el server arranca (${sinUrl.booted ? "sí" : "no"})`, sinUrl.booted);
if (sinUrl.booted) {
  const r = await fetch("http://127.0.0.1:3463/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.com" }) }).catch(() => ({ status: 0 }));
  check(`recuperación sin APP_PUBLIC_URL responde 503 (status ${r.status})`, r.status === 503);
  const pagina = await (await fetch("http://127.0.0.1:3463/")).text();
  check("index servido con marca inyectada en producción", pagina.includes("brand-json") && !pagina.includes("__BRAND_JSON__"));
  sinUrl.p.kill();
  if (sinUrl.p.exitCode === null) await new Promise(r => sinUrl.p.once("exit", r));
}
await new Promise(r => setTimeout(r, 300));

// 3) Con APP_PUBLIC_URL http no-localhost: el server arranca, pero la recuperación lo rechaza (503)
const conHttp = await boot({ APP_ADMIN_PASSWORD: "clave-super-larga-123", APP_PUBLIC_URL: "http://vecinos.example.org" });
check(`http no-localhost no tumba el server (${conHttp.booted ? "sí" : "no"})`, conHttp.booted);
if (conHttp.booted) {
  const r = await fetch("http://127.0.0.1:3463/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.com" }) }).catch(() => ({ status: 0 }));
  check(`recuperación rechaza http no-localhost (status ${r.status})`, r.status === 503);
  conHttp.p.kill();
  if (conHttp.p.exitCode === null) await new Promise(r => conHttp.p.once("exit", r));
}

await new Promise(r => setTimeout(r, 300));
rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
console.log(fails ? `${fails} fallos` : "PRODUCCION-OK");
process.exit(fails ? 1 : 0);
