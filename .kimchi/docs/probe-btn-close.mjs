import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3469;
const dir = mkdtempSync(path.join(tmpdir(), "pen-btn-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9271", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9271/json/list").toString());
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
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: BASE + "/" });
  await new Promise(r => setTimeout(r, 4500));

  console.log(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1500));
    document.querySelector('#new-community').click();
    await new Promise(r => setTimeout(r, 700));
    const btn = document.querySelector('#close-dialog');
    const svg = btn.querySelector('svg');
    const rB = btn.getBoundingClientRect(), rS = svg.getBoundingClientRect();
    const cs = getComputedStyle(btn), csSvg = getComputedStyle(svg);
    // Comparar con el cancelar
    const cancel = document.querySelector('#cancel-dialog');
    const rC = cancel.getBoundingClientRect();
    const cancelSvg = cancel.querySelector('svg').getBoundingClientRect();
    return JSON.stringify({
      btn: { w: Math.round(rB.width), h: Math.round(rB.height), clases: btn.className },
      svg: { w: Math.round(rS.width), h: Math.round(rS.height), cssW: csSvg.width, cssH: csSvg.height, viewBox: svg.getAttribute('viewBox'), lines: svg.querySelectorAll('line').length },
      cancel: { w: Math.round(rC.width), h: Math.round(rC.height), svgW: Math.round(cancelSvg.width), svgH: Math.round(cancelSvg.height) },
      btnPadding: cs.padding, btnOverflow: cs.overflow
    });
  })()`));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
