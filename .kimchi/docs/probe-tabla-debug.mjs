import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3466;
const dir = mkdtempSync(path.join(tmpdir(), "pen-tbl-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9268", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9268/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return "EXCEPCION: " + String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200);
    const v = r.result?.result?.value;
    return typeof v === "string" ? v : JSON.stringify(v ?? null);
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: BASE + "/" });
  await new Promise(r => setTimeout(r, 4500));
  console.log(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#inmuebles';
    await new Promise(r => setTimeout(r, 2000));
    const mount = document.querySelector('#properties-table');
    const filas = mount ? mount.querySelectorAll('tbody tr') : [];
    const conBotones = [...filas].filter(tr => tr.querySelector('button')).length;
    const muestra = filas[1] ? filas[1].outerHTML.slice(0, 300) : '(sin fila 1)';
    const botonesFila1 = filas[1] ? [...filas[1].querySelectorAll('button')].map(b => b.title) : [];
    return JSON.stringify({ filas: filas.length, conBotones, botonesFila1, muestra });
  })()`));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
