import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3464;
const dir = mkdtempSync(path.join(tmpdir(), "pen-docs-unif-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9265", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };
const erroresConsola = [];

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9265/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === "Console.messageAdded" && /error/i.test(d.params.message.level) && !/favicon|Extension/i.test(d.params.message.text)) erroresConsola.push(d.params.message.text.slice(0, 160));
  };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return JSON.stringify({ _excepcion: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200) });
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
    return 'login: ' + document.querySelector('#login-screen').hidden;
  })()`));

  // ---- Propietario: tarjetas de documentos + marcado (opcional) ----
  const owner = JSON.parse(await ev(`(async () => {
    window.location.hash = '#propietarios';
    await new Promise(r => setTimeout(r, 1500));
    document.querySelector('#new-owner').click();
    await new Promise(r => setTimeout(r, 800));
    const dlg = document.querySelector('#owner-dialog');
    const cards = [...dlg.querySelectorAll('.doc-upload-card .doc-card-title')].map(h => h.textContent.trim());
    const opcionales = [...dlg.querySelectorAll('label')].filter(l => l.textContent.includes('(opcional)')).length;
    const conAsteriscoMal = [...dlg.querySelectorAll('label')].filter(l => l.textContent.includes('(opcional)') && l.textContent.includes('*')).length;
    return JSON.stringify({ abierto: dlg.open, cards, opcionales, conAsteriscoMal });
  })()`));
  console.log("   propietario:", owner);
  check("diálogo propietario abre con tarjetas de documentos", owner.abierto && owner.cards.length === 3);
  check("campos opcionales marcados en propietario", owner.opcionales > 0 && owner.conAsteriscoMal === 0);
  await ev(`(() => { document.querySelector('#owner-dialog').close(); return 1; })()`);

  // ---- Inquilino: mismo motor (tarjetas DNI + contrato) ----
  const tenant = JSON.parse(await ev(`(async () => {
    window.location.hash = '#inquilinos';
    await new Promise(r => setTimeout(r, 1200));
    document.querySelector('#new-tenant').click();
    await new Promise(r => setTimeout(r, 800));
    const dlg = document.querySelector('#tenant-dialog');
    const cards = [...dlg.querySelectorAll('.doc-upload-card .doc-card-title')].map(h => h.textContent.trim());
    const dropzones = dlg.querySelectorAll('.doc-upload-card').length;
    const opcionales = [...dlg.querySelectorAll('label')].filter(l => l.textContent.includes('(opcional)')).length;
    return JSON.stringify({ abierto: dlg.open, cards, dropzones, opcionales });
  })()`));
  console.log("   inquilino:", tenant);
  check("diálogo inquilino con tarjetas DNI y contrato", tenant.abierto && tenant.cards.length === 2 && tenant.dropzones === 2);
  check("campos opcionales marcados en inquilino", tenant.opcionales > 0);
  await ev(`(() => { document.querySelector('#tenant-dialog').close(); return 1; })()`);

  // ---- Comunidad: documento de prueba (acta) con el motor unificado ----
  const community = JSON.parse(await ev(`(async () => {
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1200));
    document.querySelector('#new-community').click();
    await new Promise(r => setTimeout(r, 900));
    const dlg = document.querySelector('#community-dialog');
    const btn = document.querySelector('#btn-sample-community-doc');
    if (!btn) return JSON.stringify({ abierto: dlg.open, sample: false });
    btn.click();
    await new Promise(r => setTimeout(r, 800));
    const lista = document.querySelector('#community-document-list');
    const tarjetas = lista ? lista.querySelectorAll('.doc-file-card, [class*="doc-file"]').length : 0;
    return JSON.stringify({ abierto: dlg.open, sample: true, tarjetas, nombre: lista ? lista.textContent.includes("Acta") : false });
  })()`));
  console.log("   comunidad:", community);
  check("comunidad genera documento de prueba (acta) con el motor", community.abierto && community.sample && community.tarjetas > 0 && community.nombre === true);
  await ev(`(() => { document.querySelector('#community-dialog').close(); return 1; })()`);

  check("sin errores de consola en todo el recorrido", erroresConsola.length === 0);
  if (erroresConsola.length) console.log("   ERRORES:", JSON.stringify(erroresConsola.slice(0, 5)));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "DOCS-UNIFICADOS OK");
process.exit(fails ? 1 : 0);
