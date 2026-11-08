import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";

const PORT = 3458;
const dir = mkdtempSync(path.join(tmpdir(), "pen-probe-"));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: "pipe",
});
server.stderr.pipe(process.stderr);
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,900", "--remote-debugging-port=9261", `--user-data-dir=${dir}/edge`, "about:blank"]);
const out = (...a) => console.log(...a);

try {
  await new Promise(r => setTimeout(r, 4000));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9261/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const consoleMsgs = [];
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === "Console.messageAdded" && /Content-Security-Policy/i.test(d.params.message.text)) consoleMsgs.push(d.params.message.text.slice(0, 220));
  };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: `http://localhost:${PORT}/` });
  await new Promise(r => setTimeout(r, 5000));

  // Login como super admin (creds actuales)
  out(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    return 'login listo: ' + document.querySelector('#login-screen').hidden;
  })()`));

  // Ir a administración
  out(await ev(`(() => { window.location.hash = '#administracion'; return 'hash ok'; })()`));
  await new Promise(r => setTimeout(r, 1500));

  // Abrir editor de usuario (nuevo)
  out(await ev(`(async () => {
    document.querySelector('#new-user').click();
    await new Promise(r => setTimeout(r, 700));
    const dlg = document.querySelector('#user-dialog');
    const combo = dlg.querySelector('.checkbox-line');
    const selects = [...dlg.querySelectorAll('#user-link-section select, #user-link-section input')].map(el => ({ tag: el.tagName, id: el.id, h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }));
    return JSON.stringify({ open: dlg.open, checkboxComputed: combo ? getComputedStyle(combo).display + ' ' + getComputedStyle(combo).flexDirection : null, controls: selects });
  })()`));
  let shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(".kimchi/docs/probe-user-dialog.png", Buffer.from(shot.result.data, "base64"));
  await ev(`(() => { document.querySelector('#user-dialog').close(); return 1; })()`);

  // Abrir editor de rol (nuevo)
  out(await ev(`(async () => {
    document.querySelector('[data-admin-tab="roles"]').click();
    await new Promise(r => setTimeout(r, 500));
    document.querySelector('#new-role').click();
    await new Promise(r => setTimeout(r, 700));
    const dlg = document.querySelector('#role-dialog');
    const btn = dlg.querySelector('#close-role-dialog');
    const cs = getComputedStyle(btn);
    return JSON.stringify({ open: dlg.open, closeBtn: { text: btn.textContent, w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height), fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color } });
  })()`));
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(".kimchi/docs/probe-role-dialog.png", Buffer.from(shot.result.data, "base64"));

  // Alineación checkbox/texto en la lista de permisos
  out(await ev(`(() => {
    const items = [...document.querySelectorAll('.role-permission-item')].slice(0, 4).map(item => {
      const cb = item.querySelector('input[type=checkbox]');
      const cbRect = cb.getBoundingClientRect(), itRect = item.getBoundingClientRect();
      return { display: getComputedStyle(item).display, desfase: Math.round(Math.abs((cbRect.top + cbRect.height / 2) - (itRect.top + itRect.height / 2)) * 10) / 10, altura: Math.round(itRect.height) };
    });
    return JSON.stringify(items);
  })()`));

  out("CSP_VIOLATIONS:", consoleMsgs.length ? JSON.stringify(consoleMsgs) : "(ninguna)");
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
