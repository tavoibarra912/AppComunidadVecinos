import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3472;
const dir = mkdtempSync(path.join(tmpdir(), "pen-verify-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "ignore", "pipe"] });
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,950", "--remote-debugging-port=9275", path.join(dir, "edge"), "about:blank"]);
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 10000));
  let list = null;
  for (let i = 0; i < 20 && !list; i++) {
    try { list = JSON.parse(execSync("curl -s http://127.0.0.1:9275/json/list").toString()); } catch { await new Promise(r => setTimeout(r, 2000)); }
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

  const resultado = JSON.parse(await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    form.elements.usuario.value = 'super_admin'; form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    // 1) Comunidad: botón Verificar en Email
    window.location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1500));
    const btnEdit = [...document.querySelectorAll('#comunidades-table tbody tr .btn-edit')][0];
    btnEdit.click();
    await new Promise(r => setTimeout(r, 800));
    const dlgCom = document.querySelector('#community-dialog');
    const btnEmail = dlgCom.querySelector('#community-btn-verify-email');
    const btnPhone = dlgCom.querySelector('#community-btn-verify-phone');
    const estadoEmail = dlgCom.querySelector('#community-email-verify-status');
    dlgCom.querySelector('[name="email"]').value = 'contacto@comunidad.es';
    btnEmail.click();
    await new Promise(r => setTimeout(r, 1200));
    const dlgVer = document.querySelector('#tenant-verification-dialog');
    const abrio = dlgVer.open;
    const errorMsg = dlgVer.querySelector('#tenant-verification-error')?.textContent || '';
    const statusMsg = dlgCom.querySelector('#community-email-verify-status')?.textContent || '';
    dlgVer.close();
    dlgCom.close();
    // 2) Inquilino: el módulo compartido sigue funcionando
    window.location.hash = '#inquilinos';
    await new Promise(r => setTimeout(r, 1500));
    const fila = [...document.querySelectorAll('#inquilinos-table tbody tr')].find(tr => tr.querySelector('.btn-edit'));
    fila.querySelector('.btn-edit').click();
    await new Promise(r => setTimeout(r, 800));
    const dlgTen = document.querySelector('#tenant-dialog');
    const btnTen = dlgTen.querySelector('#tenant-btn-verify-email');
    dlgTen.querySelector('[name="email"]').value = 'inquilino@email.es';
    btnTen.click();
    await new Promise(r => setTimeout(r, 1200));
    const abrioTen = dlgVer.open;
    const errorTen = dlgVer.querySelector('#tenant-verification-error')?.textContent || '';
    dlgVer.close();
    dlgTen.close();
    return JSON.stringify({ botonesComunidad: !!btnEmail && !!btnPhone, estadoInicial: estadoEmail?.textContent.includes('Pendiente'), abrioComunidad: abrio, msg503Comunidad: errorMsg, statusComunidad: statusMsg, abrioInquilino: abrioTen, msg503Inquilino: errorTen });
  })()`));
  console.log("   resultado:", resultado);
  check("comunidad tiene botones Verificar en Email y Teléfono", resultado.botonesComunidad === true);
  check("estado inicial 'Pendiente de verificación'", resultado.estadoInicial === true);
  check("Verificar email de comunidad abre el diálogo compartido", resultado.abrioComunidad === true);
  check("mensaje graceful de OTP no configurado (comunidad)", /no está configurado/i.test(resultado.msg503Comunidad + resultado.statusComunidad));
  check("inquilino sigue verificando con el módulo compartido", resultado.abrioInquilino === true && /no está configurado/i.test(resultado.msg503Inquilino));
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "VERIFICACION-COMUNIDAD OK");
process.exit(fails ? 1 : 0);
