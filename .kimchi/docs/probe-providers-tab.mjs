import { spawn, execFile, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3461;
const dir = mkdtempSync(path.join(tmpdir(), "pen-prov-tab-"));
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: "ignore",
});
const edge = execFile("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--window-size=1400,900", "--remote-debugging-port=9264", `--user-data-dir=${dir}/edge`, "about:blank"]);
const BASE = `http://localhost:${PORT}`;
let fails = 0;
const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 3500));
  const api = async (ruta, metodo = "GET", cuerpo, cookie) => {
    const r = await fetch(BASE + "/api" + ruta, { method: metodo, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const set = r.headers.get("set-cookie");
    return { status: r.status, data: await r.json().catch(() => ({})), cookie: set ? set.split(";")[0] : null };
  };
  const admin = await api("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" });
  await api("/admin/roles", "POST", { nombre: "proveedor-only", descripcion: "solo proveedores", permisos: ["admin:providers"] }, admin.cookie);
  await api("/admin/roles", "POST", { nombre: "sin-proveedores", descripcion: "sin proveedores", permisos: ["community:read"] }, admin.cookie);
  await api("/admin/users", "POST", { nombre: "Prov", apellido: "Only", usuario: "provonly", password: "clave-provonly-1", rol: "proveedor-only", activo: true }, admin.cookie);
  await api("/admin/users", "POST", { nombre: "Sin", apellido: "Prov", usuario: "sinprov", password: "clave-sinprov-01", rol: "sin-proveedores", activo: true }, admin.cookie);

  const list = JSON.parse(execSync("curl -s http://127.0.0.1:9264/json/list").toString());
  const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const ev = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });

  const login = async (usuario, password) => {
    await send("Page.navigate", { url: BASE + "/" });
    await new Promise(r => setTimeout(r, 4000));
    return ev(`(async () => {
      const form = document.querySelector('#login-signin-form');
      form.elements.usuario.value = ${JSON.stringify(usuario)}; form.elements.password.value = ${JSON.stringify(password)};
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 3500));
      return document.querySelector('#login-screen').hidden;
    })()`);
  };

  // 1) super_admin: sub-tab visible y formulario dentro de Configuración
  await login("super_admin", "super_admin");
  const superVer = JSON.parse(await ev(`(async () => {
    window.location.hash = '#administracion';
    await new Promise(r => setTimeout(r, 1200));
    document.querySelector('[data-admin-tab="settings"]').click();
    await new Promise(r => setTimeout(r, 600));
    const subGen = document.querySelector('[data-settings-tab="general"]');
    const subProv = document.querySelector('[data-settings-tab="proveedores"]');
    subProv.click();
    await new Promise(r => setTimeout(r, 1200));
    return JSON.stringify({
      generalVisible: !subGen.hidden,
      provVisible: !subProv.hidden,
      panelProvVisible: !document.querySelector('#settings-proveedores-panel').hidden,
      formPresente: !!document.querySelector('#comm-provider-form'),
      smtpHabilitado: document.querySelector('#comm-provider-form [name="smtpEnabled"]')?.checked,
      botonComunicacion: await (async () => { window.location.hash = '#comunicacion'; await new Promise(r => setTimeout(r, 1500)); const b = document.querySelector('#comm-providers'); const v = !b.hidden; b.click(); return v; })()
    });
  })()`));
  console.log("   super_admin:", superVer);
  check("super_admin ve sub-tab General y Proveedores", superVer.generalVisible && superVer.provVisible);
  check("formulario de proveedores dentro del panel", superVer.panelProvVisible && superVer.formPresente);
  check("botón Comunicación → Proveedores visible (permiso)", superVer.botonComunicacion === true);

  // 1b) navegación por el botón de Comunicación
  const navegacion = JSON.parse(await ev(`(async () => {
    document.querySelector('#comm-providers').click();
    await new Promise(r => setTimeout(r, 1500));
    return JSON.stringify({ hash: window.location.hash, panel: !document.querySelector('#settings-proveedores-panel').hidden, form: !!document.querySelector('#comm-provider-form') });
  })()`));
  console.log("   navegación:", navegacion);
  check("botón lleva a Configuración → Proveedores", navegacion.hash === "#administracion" && navegacion.panel && navegacion.form);

  // 2) usuario sólo con admin:providers
  await login("provonly", "clave-provonly-1");
  const provVer = JSON.parse(await ev(`(async () => {
    window.location.hash = '#administracion';
    await new Promise(r => setTimeout(r, 1200));
    const tabs = [...document.querySelectorAll('[data-admin-tab]')].map(b => b.dataset.adminTab + ':' + (b.hidden ? 'oculto' : 'visible'));
    const subGen = document.querySelector('[data-settings-tab="general"]');
    const subProv = document.querySelector('[data-settings-tab="proveedores"]');
    return JSON.stringify({ tabs, generalVisible: !subGen.hidden, provVisible: !subProv.hidden, panelGeneralOculto: document.querySelector('#settings-general-panel').hidden, panelProvVisible: !document.querySelector('#settings-proveedores-panel').hidden, form: !!document.querySelector('#comm-provider-form') });
  })()`));
  console.log("   provonly:", provVer);
  check("sólo proveedores: ve Administración → Configuración", provVer.tabs.some(t => t === "settings:visible") && !provVer.tabs.some(t => t === "usuarios:visible"));
  check("sólo proveedores: General oculto, Proveedores activo", !provVer.generalVisible && provVer.provVisible && provVer.panelGeneralOculto && provVer.panelProvVisible && provVer.form);

  // 3) usuario sin el permiso
  await login("sinprov", "clave-sinprov-01");
  const sinVer = JSON.parse(await ev(`(async () => {
    window.location.hash = '#administracion';
    await new Promise(r => setTimeout(r, 1200));
    return JSON.stringify({ navOculta: document.querySelector('#nav-administracion').hidden, enHome: !document.querySelector('#home').hidden });
  })()`));
  console.log("   sinprov:", sinVer);
  check("sin permiso: sin Administración (redirige a inicio)", sinVer.navOculta && sinVer.enHome);
} finally {
  edge.kill();
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? fails + " fallos" : "PROVEEDORES-TAB OK");
process.exit(fails ? 1 : 0);
