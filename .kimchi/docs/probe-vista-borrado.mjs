import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3467;
const dir = mkdtempSync(path.join(tmpdir(), "pen-vista-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9269", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9269/json/list").toString());
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

  await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    return 'ok';
  })()`);

  // 1) Link de comunidad en la tabla de inmuebles → modo VISTA
  const vista = JSON.parse(await ev(`(async () => {
    window.location.hash = '#inmuebles';
    await new Promise(r => setTimeout(r, 1500));
    const fila = [...document.querySelectorAll('#inmuebles-table tbody tr')].find(tr => tr.querySelector('.text-link-button'));
    fila.querySelector('.text-link-button').click();
    await new Promise(r => setTimeout(r, 900));
    const dlg = document.querySelector('#community-dialog');
    const enVista = dlg.querySelector('form').classList.contains('is-readonly') || dlg.classList.contains('is-readonly');
    const paneles = [...dlg.querySelectorAll('.community-edit-link-panel')].map(p => p.hidden);
    const btnAsociar = [...dlg.querySelectorAll('.heading-actions .btn-add, .heading-actions .btn-info')].filter(b => getComputedStyle(b).display !== 'none').length;
    const btnDesvincular = [...dlg.querySelectorAll('.community-property-actions .btn-delete')].filter(b => getComputedStyle(b).display !== 'none').length;
    const tabInmuebles = [...dlg.querySelectorAll('[data-community-tab]')].find(b => b.textContent.includes('Inmueble'));
    let tarjetaConView = false;
    if (tabInmuebles) {
      tabInmuebles.click();
      await new Promise(r => setTimeout(r, 500));
      tarjetaConView = !!dlg.querySelector('.community-property-card .btn-info');
    }
    dlg.close();
    return JSON.stringify({ enVista, panelesOcultos: paneles.every(h => h === true), btnAsociarVisibles: btnAsociar, btnDesvincularVisibles: btnDesvincular, tarjetaConView });
  })()`));
  console.log("   vista comunidad:", vista);
  check("link de comunidad abre modo VISTA", vista.enVista === true);
  check("VISTA: paneles de vinculación ocultos", vista.panelesOcultos === true);
  check("VISTA: botones Asociar/Crear ocultos", vista.btnAsociarVisibles === 0);
  check("VISTA: botones Desvincular ocultos", vista.btnDesvincularVisibles === 0);
  check("VISTA: se puede seguir viendo un inmueble vinculado", vista.tarjetaConView === true);

  // 2) Link de propietario en la tabla de inquilinos → vista de propietario
  const vistaOwner = JSON.parse(await ev(`(async () => {
    window.location.hash = '#inquilinos';
    await new Promise(r => setTimeout(r, 1500));
    const fila = [...document.querySelectorAll('#inquilinos-table tbody tr')].find(tr => tr.querySelector('.text-link-button'));
    if (!fila) return JSON.stringify({ sinFilas: true });
    fila.querySelector('.text-link-button').click();
    await new Promise(r => setTimeout(r, 900));
    const dlg = document.querySelector('#owner-dialog');
    const enVista = dlg.classList.contains('is-readonly');
    const btnAsociar = [...dlg.querySelectorAll('.heading-actions .btn-add, .heading-actions .btn-info')].filter(b => getComputedStyle(b).display !== 'none').length;
    dlg.close();
    return JSON.stringify({ enVista, btnAsociarVisibles: btnAsociar });
  })()`));
  console.log("   vista propietario:", vistaOwner);
  if (vistaOwner.sinFilas) {
    check("vista propietario (sin filas de inquilinos en el seed, se omite)", false);
  } else {
    check("link de propietario abre modo VISTA sin botones de asociación", vistaOwner.enVista === true && vistaOwner.btnAsociarVisibles === 0);
  }

  // 3) Backend: no eliminar inmueble con inquilino
  const login = await fetch(BASE + "/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "super_admin" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const boot = await (await fetch(BASE + "/api/bootstrap", { headers: { Cookie: cookie } })).json();
  const conInquilino = (boot.properties || []).find(p => (boot.tenants || []).some(t => t.propertyId === p.id));
  if (!conInquilino) console.log("⚠ el seed no trae inmueble con inquilino; sólo se prueba el guard con un inmueble sin inquilino");
  const objetivo = conInquilino || (boot.properties || [])[0];
  const del = await fetch(BASE + "/api/properties/" + objetivo.id, { method: "DELETE", headers: { Cookie: cookie } });
  const delData = await del.json().catch(() => ({}));
  console.log("   backend:", JSON.stringify({ status: del.status, error: delData.error }));
  if (conInquilino) {
    check("backend rechaza eliminar inmueble con inquilino (409)", del.status === 409 && /inquilino/i.test(delData.error || ""));
  } else {
    check("backend permite eliminar inmueble sin inquilino (200)", del.status === 200);
  }
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "VISTA-Y-BORRADO OK");
process.exit(fails ? 1 : 0);
