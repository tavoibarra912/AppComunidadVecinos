// E2E de humo visual: login real + recorrido por todas las pantallas.
// En tu máquina (donde Edge funciona):
//   node scripts/e2e-ui.mjs
// Requisitos: la app corriendo en el puerto 3000 (npm run restart) y super_admin/super_admin.
import { execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = process.env.E2E_PORT || 3000;
const pageUrl = `http://localhost:${PORT}/`;
const profileDir = mkdtempSync(path.join(tmpdir(), "pen-e2e-"));
const delay = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };
const errores = [];

const edge = execFile(
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ["--headless=new", "--disable-gpu", "--window-size=1440,900", "--remote-debugging-port=9310", profileDir, "about:blank"],
  () => {},
);

try {
  await delay(5000);
  let list = null;
  for (let i = 0; i < 15 && !list; i++) {
    try { list = JSON.parse(execSync(`curl -s http://127.0.0.1:9310/json/list`).toString()); } catch { await delay(1500); }
  }
  if (!list) { console.log("✖ Edge headless no respondió. Probá abriendo Edge normal y cerrándolo, o reiniciando."); process.exit(2); }

  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === "Console.messageAdded" && /error/i.test(d.params.message.level)) {
      const txt = d.params.message.text;
      if (!/favicon|Extension|DevTools/i.test(txt)) errores.push(txt.slice(0, 200));
    }
    if (d.method === "Runtime.exceptionThrown") {
      errores.push("EXC: " + (d.params.exceptionDetails?.exception?.description || "").slice(0, 200));
    }
  };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return "ERR:" + String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200);
    const v = r.result?.result?.value;
    return typeof v === "string" ? v : JSON.stringify(v ?? null);
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: pageUrl });
  await delay(4500);

  const login = await ev(`(async () => {
    const form = document.querySelector('#login-signin-form');
    if (!form) return JSON.stringify({ ok: false, razon: 'form no encontrado' });
    form.elements.usuario.value = 'super_admin';
    form.elements.password.value = 'super_admin';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 3500));
    return JSON.stringify({ ok: document.querySelector('#login-screen').hidden, hash: location.hash });
  })()`);
  console.log("LOGIN:", login);
  const l = JSON.parse(login);
  check("login super_admin entra e Inicio visible", l.ok === true && l.hash === "#home");

  const secciones = ["#home", "#comunidades", "#propietarios", "#inmuebles", "#inquilinos", "#administracion", "#comunicacion"];
  for (const sec of secciones) {
    const r = await ev(`(async () => {
      location.hash = ${JSON.stringify(sec)};
      await new Promise(r => setTimeout(r, 1300));
      return JSON.stringify({ hash: location.hash, listo: !document.querySelector('#login-screen').open && !!document.querySelector('#login-screen').hidden });
    })()`);
    console.log("NAV", sec, "→", r);
    const parsed = JSON.parse(r);
    check(`sección ${sec} navega sin excepción`, !r.startsWith("ERR:") && parsed.listo === true);
  }

  // Abrir el editor de comunidad (flujo real)
  const openForm = await ev(`(async () => {
    location.hash = '#comunidades';
    await new Promise(r => setTimeout(r, 1300));
    const btn = document.querySelector('#new-community');
    if (!btn) return JSON.stringify({ ok: false });
    btn.click();
    await new Promise(r => setTimeout(r, 800));
    return JSON.stringify({ ok: document.querySelector('#community-dialog').open, titulo: document.querySelector('#community-dialog-title')?.textContent });
  })()`);
  console.log("EDITOR COMUNIDAD:", openForm);
  check("editor de comunidad abre", JSON.parse(openForm).ok === true);

  await delay(1500);
  console.log("ERRORES DE CONSOLA:", errores.length ? JSON.stringify(errores.slice(0, 8), null, 1) : "(ninguno)");
  check("sin errores de consola", errores.length === 0);
} finally {
  try { edge.kill(); } catch {}
  await delay(400);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos — revisar` : "E2E-UI OK");
process.exit(fails ? 1 : 0);