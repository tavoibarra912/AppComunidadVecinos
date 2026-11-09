// E2E vinculación usuario ↔ propietario/inquilino + admin de comunidad
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9243;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-link-" + Date.now(), "about:blank"]);
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
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/#administracion" });
await sleep(4000);

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "OK   " : "FALTA"} ${label}`); if (!ok) failures++; };

// 1. Crear usuario nuevo con perfil propietario vinculado (via API para precisión)
console.log("SETUP:", await evaluate(`(async function () {
  const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: "Vinc", apellido: "Test", usuario: "vinc.test", email: "vinc@test.es", rol: "user", activo: true }) });
  return { status: res.status };
})()`));

// 2. Vincular propietario sin cuenta (Isabel? buscar uno sin userId)
console.log("LINK-OWNER:", await evaluate(`(async function () {
  const boot = await (await fetch("/api/bootstrap")).json();
  const libre = boot.owners.find(o => !o.userId);
  if (!libre) return { ERR: "no hay owners libres" };
  const user = boot.users.find(u => u.usuario === "vinc.test");
  const res = await fetch("/api/admin/users/" + user.id + "/link-owner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: libre.id }) });
  const boot2 = await (await fetch("/api/bootstrap")).json();
  const check = boot2.owners.find(o => o.id === libre.id);
  return { status: res.status, userIdEnOwner: check.userId, owner: libre.name };
})()`));

// 3. Desvincular
console.log("UNLINK:", await evaluate(`(async function () {
  const boot = await (await fetch("/api/bootstrap")).json();
  const user = boot.users.find(u => u.usuario === "vinc.test");
  const res = await fetch("/api/admin/users/" + user.id + "/link-owner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: "" }) });
  const boot2 = await (await fetch("/api/bootstrap")).json();
  const ownersDelUser = boot2.owners.filter(o => o.userId === user.id).length;
  return { status: res.status, ownersDelUser };
})()`));

// 4. UI: user form muestra los selects de vinculación
console.log("UI-SELECTS:", await evaluate(`(function () {
  try {
    document.querySelector("#new-user").click();
    const f = document.querySelector("#user-form");
    const ownerSel = f.querySelector("#user-linked-owner");
    const tenantSel = f.querySelector("#user-linked-tenant");
    const ownerOptions = ownerSel ? ownerSel.options.length : 0;
    return { ownerSel: !!ownerSel, ownerOptions, tenantSel: !!tenantSel, guardaActivo: !!document.querySelector("#user-form") && true };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-user-dialog")?.click()`);
await sleep(200);

// 5. Editor de comunidad: select de Administrador de Comunidad poblado
console.log("COM-ADMIN:", await evaluate(`(function () {
  try {
    location.hash = "#comunidades";
    return "nav";
  } catch (e) { return { ERR: e.message }; }
})()`));
await sleep(1200);
console.log("COM-ADMIN2:", await evaluate(`(function () {
  try {
    document.querySelector("#comunidades-table tbody tr .icon-action-btn.btn-edit").click();
    const sel = document.querySelector("#community-admin-select");
    const opciones = sel ? [...sel.options].map(o => o.textContent) : [];
    const valor = sel?.value || "";
    return { opciones: opciones.length, valor };
  } catch (e) { return { ERR: e.message }; }
})()`));

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
