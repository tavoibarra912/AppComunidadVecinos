import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3468;
const dir = mkdtempSync(path.join(tmpdir(), "pen-ui-fix-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9270", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9270/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return JSON.stringify({ _excepcion: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 220) });
    const v = r.result?.result?.value;
    return typeof v === "string" ? v : JSON.stringify(v ?? null);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: BASE + "/" });
  await new Promise(r => setTimeout(r, 4500));

  const resultado = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1500));
    document.querySelector('#new-community').click();
    await new Promise(r => setTimeout(r, 700));
    const dlg = document.querySelector('#community-dialog');
    const closeBtn = dlg.querySelector('#close-dialog');
    const cancelBtn = dlg.querySelector('#cancel-dialog');
    const csClose = getComputedStyle(closeBtn), csCancel = getComputedStyle(cancelBtn);
    const closeRect = closeBtn.getBoundingClientRect(), cancelRect = cancelBtn.getBoundingClientRect();
    // Forzar validación: guardar vacío
    dlg.querySelector('[data-community-tab="details"]').click();
    const guardar = dlg.querySelector('[type="submit"]') || dlg.querySelector('.btn-save');
    guardar.click();
    await new Promise(r => setTimeout(r, 900));
    const valDlg = document.querySelector('#validation-dialog');
    const items = [...document.querySelectorAll('#validation-list li')].map(li => li.textContent.trim());
    const icono = valDlg.querySelector('.validation-modal-icon');
    const iconoRect = icono.getBoundingClientRect();
    const svgRect = icono.querySelector('svg')?.getBoundingClientRect();
    const desfase = svgRect ? Math.round(Math.abs((svgRect.top + svgRect.height / 2) - (iconoRect.top + iconoRect.height / 2)) * 10) / 10 : null;
    return JSON.stringify({
      mismosEstilos: csClose.borderRadius === csCancel.borderRadius && csClose.border === csCancel.border && csClose.backgroundColor === csCancel.backgroundColor,
      tamanoSimilar: Math.abs(closeRect.height - cancelRect.height) <= 2 && Math.abs(closeRect.width - cancelRect.width) <= 2,
      dialogoValidacionAbierto: valDlg.open,
      mensajes: items.slice(0, 4),
      enIngles: items.some(t => /Please|must|fill|select/i.test(t)),
      desfaseIcono: desfase
    });
  })()`));
  console.log("   resultado:", resultado);
  check("close-dialog idéntico en estilo al cancel-dialog", resultado.mismosEstilos && resultado.tamanoSimilar);
  check("diálogo de validación abre al guardar vacío", resultado.dialogoValidacionAbierto === true);
  check("mensajes de validación en español", resultado.mensajes.length > 0 && resultado.enIngles === false);
  check("icono de advertencia centrado (desfase ≤ 1px)", resultado.desfaseIcono !== null && resultado.desfaseIcono <= 1);
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "UI-FIXES OK");
process.exit(fails ? 1 : 0);
