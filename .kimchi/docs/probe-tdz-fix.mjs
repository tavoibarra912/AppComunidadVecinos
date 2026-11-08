import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3460;
const dir = mkdtempSync(path.join(tmpdir(), "pen-tdz-"));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: "ignore",
});
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,900", "--remote-debugging-port=9263", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0;
const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const r = await fetch(BASE + "/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "super_admin" }) });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  // El escenario del usuario: filas por página guardadas en Configuración.
  const s = await fetch(BASE + "/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ filasPorPagina: 25 }) });
  const settings = await (await fetch(BASE + "/api/admin/settings", { headers: { Cookie: cookie } })).json();
  check(`settings acepta filasPorPagina (status ${s.status})`, s.status === 200 && Number(settings.filasPorPagina) === 25);

  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9263/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: BASE + "/" });
  await new Promise(r => setTimeout(r, 4500));
  const resultado = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r2 => setTimeout(r2, 4000));
    const err = document.querySelector('#login-signin-error');
    const engines = document.querySelectorAll('.table-engine').length;
    window.location.hash = '#propietarios';
    await new Promise(r2 => setTimeout(r2, 2000));
    const engineProp = document.querySelector('#propietarios .table-engine') ? 'ok' : 'no';
    return JSON.stringify({ bootError: err ? err.textContent : null, loginOk: document.querySelector('#login-screen').hidden, enginesAlBoot: engines, tablaPropietarios: engineProp });
  })()`));
  console.log("   ", JSON.stringify(resultado));
  check("sin error de boot con filasPorPagina=25", !resultado.bootError || resultado.bootError === "");
  check("login exitoso", resultado.loginOk === true);
  check("tabla de propietarios renderiza", resultado.tablaPropietarios === "ok");
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? fails + " fallos" : "TDZ FIX OK");
process.exit(fails ? 1 : 0);
