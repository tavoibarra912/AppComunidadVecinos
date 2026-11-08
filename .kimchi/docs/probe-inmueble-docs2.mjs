import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3465;
const dir = mkdtempSync(path.join(tmpdir(), "pen-inm3-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9267", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9267/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
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

  const resultado = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    window.location.hash = '#inmuebles';
    await new Promise(r => setTimeout(r, 1500));
    const fila = [...document.querySelectorAll('#inmuebles-table tbody tr')].find(tr => tr.querySelector('button'));
    const botonesFila = fila ? [...fila.querySelectorAll('button')].map(b => b.title) : [];
    document.querySelector('#new-property').click();
    await new Promise(r => setTimeout(r, 700));
    document.querySelector('[data-property-tab="docs"]').click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('#btn-sample-property-doc').click();
    await new Promise(r => setTimeout(r, 700));
    const panel = document.querySelector('[data-property-pane="docs"]');
    const tarjeta = panel.querySelector('.doc-upload-card');
    tarjeta.querySelector('[data-action="view"]').click();
    await new Promise(r => setTimeout(r, 600));
    const visorAbierto = document.querySelector('#doc-viewer-dialog').open;
    tarjeta.querySelector('[data-action="remove"]').click();
    await new Promise(r => setTimeout(r, 400));
    const tarjetasTrasQuitar = panel.querySelectorAll('.doc-upload-card').length;
    return JSON.stringify({
      botonesFila,
      tarjetaGenerada: !!tarjeta,
      nombreArchivo: tarjeta?.querySelector('.doc-file-name')?.textContent || '',
      pendiente: tarjeta?.querySelector('.doc-file-size')?.textContent.includes('pendiente'),
      visorAbierto,
      tarjetasTrasQuitar
    });
  })()`));
  console.log("   inmueble:", resultado);
  check("tabla inmuebles: columna acciones con botón Documentación", resultado.botonesFila.some(t => /documentación/i.test(t)));
  check("ejemplo (certificado energético) se genera como tarjeta", resultado.tarjetaGenerada && resultado.pendiente && /certificado/i.test(resultado.nombreArchivo));
  check("botones Ver/Quitar como en propietario", resultado.visorAbierto && resultado.tarjetasTrasQuitar === 0);

  const comunidad = JSON.parse(await ev(`(async () => {
    document.querySelector('#property-dialog').close();
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1200));
    const filaCom = [...document.querySelectorAll('#comunidades-table tbody tr')].find(tr => tr.querySelector('.btn-docs'));
    const btnEditCom = [...document.querySelectorAll('#comunidades-table tbody tr .btn-edit')][0]; btnEditCom.click();
    await new Promise(r => setTimeout(r, 800));
    const tabInm = document.querySelector('[data-community-tab="inmuebles"]') || document.querySelector('[data-community-tab="properties"]');
    tabInm.click();
    await new Promise(r => setTimeout(r, 500));
    const tarjeta = document.querySelector('.community-property-card');
    const docsBtn = tarjeta ? tarjeta.querySelector('.btn-docs') : null;
    let abre = false;
    if (docsBtn) { docsBtn.click(); await new Promise(r => setTimeout(r, 700)); abre = document.querySelector('#property-dialog').open; }
    return JSON.stringify({ btnDocsTabla: !!filaCom, docsBtnEnTarjeta: !!docsBtn, abreEditorDocs: abre });
  })()`));
  console.log("   comunidad:", comunidad);
  check("tabla comunidades: botón Documentación en acciones", comunidad.btnDocsTabla);
  check("tarjetas de inmueble del editor de comunidad: botón Documentación", comunidad.docsBtnEnTarjeta);
  check("ese botón abre el editor de inmueble en Documentación", comunidad.abreEditorDocs);
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "INMUEBLE-DOCS OK");
process.exit(fails ? 1 : 0);
