import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3470;
const dir = mkdtempSync(path.join(tmpdir(), "pen-shot-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: "ignore" });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9272", path.join(dir, "edge"), "about:blank"]);

try {
  await new Promise(r => setTimeout(r, 6000));
  let list = null;
  for (let i = 0; i < 10 && !list; i++) {
    try { list = JSON.parse(execSync("curl -s http://127.0.0.1:9272/json/list").toString()); } catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!list) throw new Error("Edge no respondió");
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: `http://localhost:${PORT}/` });
  await new Promise(r => setTimeout(r, 4500));
  await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1500));
    document.querySelector('#new-community').click();
    await new Promise(r => setTimeout(r, 800));
    return 'ok';
  })()`);
  const dlg = document.querySelector("#community-dialog");
  const r = dlg.getBoundingClientRect();
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: r.left, y: r.top, width: Math.min(r.width, 700), height: 130, scale: 1 } });
  writeFileSync(".kimchi/docs/probe-header-close.png", Buffer.from(shot.result.data, "base64"));
  console.log("captura lista");
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
