// E2E de las correcciones de Administración
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9244;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-adminfix-" + Date.now(), "about:blank"]);
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
await sleep(4000);

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "OK   " : "FALTA"} ${label}`); if (!ok) failures++; };

// 1. Editar admin (super_admin): icono X correcto, perfiles ocultos, checkbox alineado
console.log("EDIT-ADMIN:", await evaluate(`(function () {
  try {
    document.querySelector("#usuarios-table tbody tr .icon-action-btn.btn-edit").click();
    const d = document.querySelector("#user-dialog");
    const cancelSvg = d.querySelector("#cancel-user-dialog svg");
    const lines = [...cancelSvg.querySelectorAll("line")].length;
    const linkSection = d.querySelector("#user-link-section");
    const linkHidden = linkSection ? linkSection.hidden : null;
    const cb = d.querySelector('[name="activo"]');
    const cbStyle = getComputedStyle(cb.closest(".checkbox-line"));
    return { cancelLines: lines, linkHidden, cbAlign: cbStyle.display, cbBorder: cbStyle.borderTopWidth };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-user-dialog").click()`);
await sleep(200);

// 2. Editar carlos: combo Propietario precargado
console.log("EDIT-CARLOS:", await evaluate(`(function () {
  try {
    const rows = [...document.querySelectorAll("#usuarios-table tbody tr")];
    const carlosRow = rows.find(r => r.textContent.includes("carlos"));
    carlosRow.querySelector(".icon-action-btn.btn-edit").click();
    const f = document.querySelector("#user-form");
    const sel = f.querySelector("#user-linked-owner");
    await0: 0;
    const value = sel.value;
    const selectedText = sel.selectedOptions[0]?.textContent || "";
    const linkVisible = !document.querySelector("#user-link-section").hidden;
    return { value, selectedText: selectedText.slice(0, 60), linkVisible };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-user-dialog").click()`);
await sleep(200);

// 3. Roles tab: tabla del motor con columnas
console.log("ROLES-TAB:", await evaluate(`(function () {
  try {
    document.querySelector('[data-admin-tab="roles"]').click();
    const head = [...document.querySelectorAll("#roles-table thead th .th-sort-label")].map(t => t.textContent);
    const rows = document.querySelectorAll("#roles-table tbody tr:not(.table-group-row)").length;
    return { head, rows };
  } catch (e) { return { ERR: e.message }; }
})()`));

// 4. Settings: campos nuevos
console.log("SETTINGS:", await evaluate(`(function () {
  try {
    document.querySelector('[data-admin-tab="settings"]').click();
    const f = document.querySelector("#settings-form");
    return {
      moneda: !!f.elements.monedaPorDefecto,
      maxSize: f.elements.documentosMaxSizeMb.value,
      aviso: f.elements.diasAvisoVencimientoContrato.value,
      filas: f.elements.filasPorPagina.value,
      mantenimiento: !!f.elements.mantenimiento
    };
  } catch (e) { return { ERR: e.message }; }
})()`));

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
