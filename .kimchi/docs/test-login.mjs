// E2E del login simulado: selector de usuarios, perfiles y permisos
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9241;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-login-" + Date.now(), "about:blank"]);
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
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(4000);

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "OK   " : "FALTA"} ${label}`); if (!ok) failures++; };

// 1. Selector poblado con los usuarios
console.log("SELECTOR:", await evaluate(`(() => {
  const sel = document.querySelector("#active-role-select");
  return { opciones: [...sel.options].map(o => o.textContent), activo: sel.value };
})()`));

// 2. Login como carlos (perfil Propietario) → vista owner
console.log("CARLOS:", await evaluate(`(async function () {
  const sel = document.querySelector("#active-role-select");
  const opt = [...sel.options].find(o => o.textContent.includes("Carlos"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 800));
  const adminVisible = !document.querySelector("#nav-administracion").hidden;
  const ownerRows = document.querySelectorAll("#propietarios-table tbody tr").length;
  return { label: opt.textContent, adminOculto: adminVisible === false };
})()`));
await sleep(400);

// 3. Login como admin (super_admin) → vista admin completa
console.log("ADMIN:", await evaluate(`(async function () {
  const sel = document.querySelector("#active-role-select");
  const opt = [...sel.options].find(o => o.textContent.startsWith("Administrador"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 800));
  const adminVisible = !document.querySelector("#nav-administracion").hidden;
  return { label: opt.textContent, adminVisible };
})()`));

// 4. Login como gestor (community_admin) → admin con alcance
console.log("GESTOR:", await evaluate(`(async function () {
  const sel = document.querySelector("#active-role-select");
  const opt = [...sel.options].find(o => o.textContent.includes("Gestor"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 800));
  location.hash = "#comunidades";
  await new Promise(r => setTimeout(r, 600));
  const filas = document.querySelectorAll("#comunidades-table tbody tr:not(.table-group-row)").length;
  const btnNueva = document.querySelector("#new-community");
  return { filasComunidades: filas, puedeCrear: btnNueva ? !btnNueva.hidden : null };
})()`));

// 5. Login como laura (solo perfil Inquilino)
console.log("LAURA:", await evaluate(`(async function () {
  const sel = document.querySelector("#active-role-select");
  const opt = [...sel.options].find(o => o.textContent.includes("Laura"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 800));
  const ownerRows = document.querySelectorAll("#propietarios-table tbody tr").length;
  return { ownerRows: ownerRows };
})()`));

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
