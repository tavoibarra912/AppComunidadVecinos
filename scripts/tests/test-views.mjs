// Verificación de vistas read-only con tabs (comunidad + inmueble)
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9228;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "OK   " : "FALTA"} ${label}`);
  if (!ok) failures++;
};

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-cdp-views", "about:blank"]);
await sleep(2500);
const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { maxBuffer: 10 * 1024 * 1024 }).toString());
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3000/#comunidades" });
await sleep(3500);

// Ficha de comunidad: 5 tabs read-only
const commView = await evaluate(`(function () {
  document.querySelector("#comunidades-table .icon-action-btn.btn-info").click();
  const dialog = document.querySelector("#detail-dialog");
  return {
    open: dialog.open,
    tabs: [...dialog.querySelectorAll("[data-cd-tab]")].map(b => b.textContent.trim()),
    width: Math.round(dialog.getBoundingClientRect().width)
  };
})()`);
check(commView?.open === true, "ficha comunidad abre en modo ver");
check((commView?.tabs || []).join(",") === "General,Contacto y Domicilio,Financiero,Inmuebles,Documentación", `tabs ficha comunidad: ${JSON.stringify(commView?.tabs)}`);
check(commView?.width === 1000, `ancho ficha comunidad 1000 (hay ${commView?.width})`);

const commSwitch = await evaluate(`(function () {
  document.querySelector('#detail-dialog [data-cd-tab="docs"]').click();
  const docsVisible = !document.querySelector('[data-cd-pane="docs"]').hidden;
  const generalHidden = document.querySelector('[data-cd-pane="general"]').hidden;
  document.querySelector('#detail-dialog [data-cd-tab="general"]').click();
  return { docsVisible, generalHidden };
})()`);
check(commSwitch?.docsVisible === true && commSwitch?.generalHidden === true, "cambio de tab funciona en ficha comunidad");
await evaluate(`document.querySelector("#close-detail-dialog").click()`);
await sleep(200);

// Ficha de inmueble: 6 tabs read-only
await evaluate(`location.hash = "#inmuebles"`);
await sleep(1500);
const propView = await evaluate(`(function () {
  document.querySelector("#inmuebles-table .icon-action-btn.btn-info").click();
  const dialog = document.querySelector("#property-detail-dialog");
  return {
    open: dialog.open,
    tabs: [...dialog.querySelectorAll("[data-pd-tab]")].map(b => b.textContent.trim()),
    width: Math.round(dialog.getBoundingClientRect().width)
  };
})()`);
check(propView?.open === true, "ficha inmueble abre en modo ver");
check((propView?.tabs || []).join(",") === "General,Detalles y Domicilio,Financiero,Propietarios,Inquilinos,Documentación", `tabs ficha inmueble: ${JSON.stringify(propView?.tabs)}`);
check(propView?.width === 1000, `ancho ficha inmueble 1000 (hay ${propView?.width})`);

// Editor de inmueble: 6 tabs
const propEditor = await evaluate(`(function () {
  document.querySelector("#property-detail-dialog").close();
  document.querySelector("#inmuebles-table .icon-action-btn.btn-edit").click();
  const dialog = document.querySelector("#property-dialog");
  const panes = [...dialog.querySelectorAll("[data-property-pane]")].map(p => p.dataset.propertyPane);
  const plot = dialog.querySelector('[name="plot"]')?.value;
  return { open: dialog.open, tabs: [...dialog.querySelectorAll("[data-property-tab]")].map(b => b.textContent.trim()), panes, plot };
})()`);
check((propEditor?.panes || []).join(",") === "general,details,finance,owners,tenants,docs", `panes editor inmueble: ${JSON.stringify(propEditor?.panes)}`);

// Validación: submit vacío → modal con TODOS los errores
await evaluate(`(function () {
  const form = document.querySelector("#property-form");
  form.querySelector('[name="plot"]').value = "";
  form.querySelector('[name="address"]').value = "";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return true;
})()`);
await sleep(600);
const validation = await evaluate(`(function () {
  const dialog = document.querySelector("#validation-dialog");
  return { open: dialog.open, errors: [...document.querySelectorAll("#validation-list li")].map(li => li.textContent.slice(0, 60)) };
})()`);
check(validation?.open === true, `modal de validación abre (${(validation?.errors || []).length} errores juntos)`);
check((validation?.errors || []).length >= 3, `todos los errores juntos: ${JSON.stringify(validation?.errors)}`);

ws.close();
edge.kill();
console.log(failures === 0 ? "\nTODOS LOS CHECKS PASARON" : `\n${failures} CHECKS FALLARON`);
process.exit(failures === 0 ? 0 : 1);
