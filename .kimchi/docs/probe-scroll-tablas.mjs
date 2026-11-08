import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3471;
const dir = mkdtempSync(path.join(tmpdir(), "pen-scroll-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = null; // usa la instancia Edge ya corriendo en 9273→9274
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 500));
  let list = null;
  for (let i = 0; i < 10 && !list; i++) {
    try { list = JSON.parse(execSync("curl -s http://127.0.0.1:9274/json/list").toString()); } catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  if (!list) throw new Error("Edge no respondió");
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
  await send("Page.navigate", { url: `http://localhost:${PORT}/` });
  await new Promise(r => setTimeout(r, 4500));

  const r1 = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    // Tabla de inmuebles con pocas columnas: sin barra
    window.location.hash = '#inmuebles';
    await new Promise(r => setTimeout(r, 1500));
    const wrap = document.querySelector('#inmuebles-table .table-wrap');
    const sinScroll = wrap.scrollWidth <= wrap.clientWidth + 1;
    // Activar TODAS las columnas
    const btnCols = document.querySelector('#inmuebles-table .table-columns-btn');
    btnCols.click();
    await new Promise(r => setTimeout(r, 400));
    const checks = [...document.querySelectorAll('#inmuebles-table .table-columns-menu input[type="checkbox"]')];
    checks.forEach(c => { if (!c.checked) c.click(); });
    document.body.click();
    await new Promise(r => setTimeout(r, 600));
    const wrap2 = document.querySelector('#inmuebles-table .table-wrap');
    const conScroll = wrap2.scrollWidth > wrap2.clientWidth + 1;
    const cols = wrap2.querySelectorAll('thead th').length;
    // Desplazar y verificar que se mueve
    const antes = wrap2.scrollLeft;
    wrap2.scrollLeft = 400;
    const despues = wrap2.scrollLeft;
    return JSON.stringify({ sinScroll, conScroll, cols, scrollFunciona: despues > antes || despues === 400, scrollWidth: wrap2.scrollWidth, clientWidth: wrap2.clientWidth });
  })()`));
  console.log("   inmuebles:", r1);
  check("pocas columnas: sin barra", r1.sinScroll === true);
  check("todas las columnas: aparece barra horizontal", r1.conScroll === true);
  check("la barra desplaza la tabla", r1.scrollFunciona === true);

  // Otra tabla (propietarios) para confirmar que aplica a todas
  const r2 = JSON.parse(await ev(`(async () => {
    window.location.hash = '#propietarios';
    await new Promise(r => setTimeout(r, 1500));
    const btnCols = document.querySelector('#owners-table .table-columns-btn');
    btnCols.click();
    await new Promise(r => setTimeout(r, 400));
    const checks = [...document.querySelectorAll('#owners-table .table-columns-menu input[type="checkbox"]')];
    checks.forEach(c => { if (!c.checked) c.click(); });
    document.body.click();
    await new Promise(r => setTimeout(r, 600));
    const wrap = document.querySelector('#owners-table .table-wrap');
    return JSON.stringify({ conScroll: wrap.scrollWidth > wrap.clientWidth + 1, scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth });
  })()`));
  console.log("   propietarios:", r2);
  check("tabla de propietarios también scrollea con todas las columnas", r2.conScroll === true);
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "SCROLL-TABLAS OK");
process.exit(fails ? 1 : 0);
