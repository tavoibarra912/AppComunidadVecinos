import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-userui-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));
const PORT = 3478;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9279", path.join(dir, "edge"), "about:blank"]);
const errores = [];

try {
  await new Promise(r => setTimeout(r, 6000));
  let list = null;
  for (let i = 0; i < 15 && !list; i++) {
    try { list = JSON.parse(execSync("curl -s http://127.0.0.1:9279/json/list").toString()); } catch { await new Promise(r => setTimeout(r, 2000)); }
  }
  if (!list) throw new Error("Edge no respondió");
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === "Console.messageAdded" && /error/i.test(d.params.message.level)) errores.push(d.params.message.text.slice(0, 250));
  };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return JSON.stringify({ _excepcion: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 250) });
    const v = r.result?.result?.value;
    return typeof v === "string" ? v : JSON.stringify(v ?? null);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: `http://localhost:${PORT}/` });
  await new Promise(r => setTimeout(r, 4500));

  const resultado = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#administracion';
    await new Promise(r => setTimeout(r, 1500));
    // Editar a carlos
    const fila = [...document.querySelectorAll('#users-table tbody tr')].find(tr => tr.textContent.includes('carlos'));
    fila.querySelector('.btn-edit').click();
    await new Promise(r => setTimeout(r, 700));
    const dlg = document.querySelector('#user-dialog');
    const antes = dlg.querySelector('[name="nombre"]').value;
    dlg.querySelector('[name="nombre"]').value = 'Carlos Editado UI';
    const estadoBoton = dlg.querySelector('[type="submit"]') ? 'submit-existe' : 'no-submit';
    dlg.querySelector('[type="submit"]').click();
    await new Promise(r => setTimeout(r, 1500));
    return JSON.stringify({
      abiertoAlGuardar: dlg.open,
      estadoBoton,
      antes,
      errorVisible: document.querySelector('#user-form-error')?.textContent || '',
      dialogoValidacion: document.querySelector('#validation-dialog')?.open || false,
      listaValidacion: [...document.querySelectorAll('#validation-list li')].map(li => li.textContent.trim()).slice(0, 4)
    });
  })()`));
  console.log("   resultado:", resultado);
  const r = JSON.parse(resultado);
  check("el diálogo se cierra al guardar", r.abiertoAlGuardar === false);
  check("sin errores de consola", errores.length === 0);
  if (errores.length) console.log("   ERRORES:", JSON.stringify(errores.slice(0, 4)));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "USER-EDIT OK");
process.exit(fails ? 1 : 0);
