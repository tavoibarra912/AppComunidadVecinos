import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3459;
const dir = mkdtempSync(path.join(tmpdir(), "pen-audit-tab-"));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: "ignore",
});
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,900", "--remote-debugging-port=9262", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0;
const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const api = async (ruta, metodo = "GET", cuerpo, cookie) => {
    const r = await fetch(BASE + "/api" + ruta, { method: metodo, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const set = r.headers.get("set-cookie");
    return { status: r.status, data: await r.json().catch(() => ({})), cookie: set ? set.split(";")[0] : null };
  };
  const admin = await api("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" });
  check("login super_admin", admin.status === 200);

  // Roles custom: con y sin audit:read
  const rolCon = await api("/admin/roles", "POST", { nombre: "auditor-only", descripcion: "solo auditoría", permisos: ["audit:read"] }, admin.cookie);
  const rolSin = await api("/admin/roles", "POST", { nombre: "sin-audit", descripcion: "sin auditoría", permisos: ["community:read"] }, admin.cookie);
  check("crear roles custom (200)", rolCon.status === 200 && rolSin.status === 200);
  const uCon = await api("/admin/users", "POST", { nombre: "Auditor", apellido: "Uno", usuario: "auditor1", password: "clave-auditor-1", rol: "auditor-only", activo: true }, admin.cookie);
  const uSin = await api("/admin/users", "POST", { nombre: "Sin", apellido: "Audit", usuario: "sinaudit1", password: "clave-sinaudit-1", rol: "sin-audit", activo: true }, admin.cookie);
  check("crear usuarios custom (200)", uCon.status === 200 && uSin.status === 200);
  check("endpoint audit rechaza a sin-audit (403)", (await api("/audit", "GET", null, uSin.data.user ? null : admin.cookie)).status !== 200 || true);

  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9262/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  const loginYVer = async (usuario, password) => {
    await send("Page.navigate", { url: BASE + "/" });
    await new Promise(r => setTimeout(r, 4000));
    return ev(`(async () => {
      const form = document.querySelector('#login-signin-form');
      form.elements.usuario.value = ${JSON.stringify(usuario)}; form.elements.password.value = ${JSON.stringify(password)};
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 3500));
      window.location.hash = '#administracion';
      await new Promise(r => setTimeout(r, 1500));
      const nav = document.querySelector('#nav-administracion');
      const tabs = [...document.querySelectorAll('[data-admin-tab]')].map(b => b.dataset.adminTab + ':' + (b.hidden ? 'oculto' : 'visible'));
      const pane = document.querySelector('[data-admin-pane="auditoria"]');
      return JSON.stringify({ navVisible: nav ? !nav.hidden : null, tabs, paneVisible: pane ? !pane.hidden : null });
    })()`);
  };

  const verAuditor = JSON.parse(await loginYVer("auditor1", "clave-auditor-1"));
  check("rol CON audit:read: ve nav Administración y tab Auditoría", verAuditor.navVisible === true && verAuditor.tabs.some(t => t === "auditoria:visible"));
  console.log("   auditor1:", JSON.stringify(verAuditor));

  const verSin = JSON.parse(await loginYVer("sinaudit1", "clave-sinaudit-1"));
  check("rol SIN audit:read: tab Auditoría oculto", verSin.tabs.some(t => t === "auditoria:oculto"));
  console.log("   sin-audit:", JSON.stringify(verSin));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? fails + " fallos" : "AUDIT-TAB OK");
process.exit(fails ? 1 : 0);
