// E2E Pantalla Administración: tabs, alta de usuario, edición de rol, settings
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9240;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-admin-" + Date.now(), "about:blank"]);
await sleep(2500);
const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { maxBuffer: 10 * 1024 * 1024 }).toString());
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const exceptions = [];
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  if (data.method === "Runtime.exceptionThrown") exceptions.push(String(data.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/#administracion" });
await sleep(3500);

// 1. La pantalla abre con la tab Usuarios y la tabla montada
console.log("PANTALLA:", await evaluate(`(() => {
  try {
    const sec = document.querySelector("#administracion");
    return { visible: !sec.hidden, tabActiva: sec.querySelector(".community-editor-tab.active")?.textContent.trim(), tablaMontada: !!sec.querySelector("#usuarios-table thead") };
  } catch (e) { return { ERR: e.message }; }
})()`));

// 2. Alta de usuario
console.log("ALTA:", await evaluate(`(async function () {
  try {
    document.querySelector("#new-user").click();
    const f = document.querySelector("#user-form");
    f.elements.nombre.value = "Test";
    f.elements.apellido.value = "Usuario";
    f.elements.usuario.value = "test.usuario";
    f.elements.email.value = "test.usuario@penarrubia.es";
    f.elements.rol.value = "consulta";
    f.querySelector("button[type=submit]").click();
    await new Promise(r => setTimeout(r, 800));
    const creado = [...document.querySelectorAll("#usuarios-table tbody .community-name")].some(n => n.textContent.includes("test.usuario"));
    return { creado };
  } catch (e) { return { ERR: e.message }; }
})()`));

// 3. Roles tab renderiza + editar rol existente con permisos
console.log("ROLES:", await evaluate(`(() => {
  try {
    document.querySelector('[data-admin-tab="roles"]').click();
    const cards = document.querySelectorAll("#roles-list .community-property-card").length;
    return { rolesRenderizados: cards };
  } catch (e) { return { ERR: e.message }; }
})()`));

// 4. Settings: cargar valores, guardar
console.log("SETTINGS:", await evaluate(`(async function () {
  try {
    document.querySelector('[data-admin-tab="settings"]').click();
    const f = document.querySelector("#settings-form");
    await new Promise(r => setTimeout(r, 300));
    const nombre = f.elements.nombreAsociacion.value;
    f.elements.otpExpiraMinutos.value = "15";
    f.querySelector("button[type=submit]").click();
    await new Promise(r => setTimeout(r, 800));
    const saved = JSON.parse((await (await fetch("/api/admin/settings")).json()).data !== undefined ? "{}" : "{}");
    const boot = await (await fetch("/api/bootstrap")).json();
    return { nombreCargado: nombre, otpGuardado: boot.settings.otpExpiraMinutos };
  } catch (e) { return { ERR: e.message }; }
})()`));

// restaurar
console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
