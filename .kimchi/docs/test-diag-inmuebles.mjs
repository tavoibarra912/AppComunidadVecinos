// Diagnóstico: botones nuevo/edit/docs de inmuebles + flujo comunidad→inmueble
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9235;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-diag-NEW-1793978343", "about:blank"]);
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
  if (data.method === "Runtime.exceptionThrown") exceptions.push(data.params.exceptionDetails?.exception?.description?.split("\n")[0]);
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
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://localhost:3000/#inmuebles" });
await sleep(3500);

// 1. Botón Nuevo
console.log("NUEVO:", await evaluate(`(() => {
  try {
    document.querySelector("#new-property").click();
    const d = document.querySelector("#property-dialog");
    return { open: d.open, currencyOptions: d.querySelector('[name="currency"]')?.options.length, currencyVisible: !!d.querySelector('[data-property-pane="finance"] [name="currency"]') };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-property-dialog").click()`);
await sleep(300);

// 2. Botón Edit
console.log("EDIT:", await evaluate(`(() => {
  try {
    document.querySelector("#inmuebles-table tbody tr .icon-action-btn.btn-edit").click();
    const d = document.querySelector("#property-dialog");
    return { open: d.open, currencyValue: d.querySelector('[name="currency"]')?.value };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-property-dialog").click()`);
await sleep(300);

// 3. Botón Docs
console.log("DOCS:", await evaluate(`(() => {
  try {
    document.querySelector("#inmuebles-table tbody tr .icon-action-btn.btn-docs").click();
    const d = document.querySelector("#property-dialog");
    const active = d.querySelector(".community-editor-tab.active")?.textContent.trim();
    return { open: d.open, activeTab: active };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#close-property-dialog").click()`);
await sleep(300);

// 4. Flujo comunidad → agregar inmueble → vincular propietario → guardar
await send("Page.navigate", { url: "http://localhost:3000/#comunidades" });
await sleep(2500);
console.log("FLUJO:", await evaluate(`(async function () {
  try {
    document.querySelector("#comunidades-table tbody tr .icon-action-btn.btn-edit").click();
    document.querySelector('[data-community-tab="properties"]').click();
    document.querySelector("#btn-community-edit-add-property").click();
    await new Promise(r => setTimeout(r, 400));
    const pd = document.querySelector("#property-dialog");
    const form = document.querySelector("#property-form");
    const communityId = form.elements.communityId.value;
    // vincular un propietario
    document.querySelector('[data-property-tab="owners"]').click();
    document.querySelector("#btn-property-link-owner").click();
    const sel = document.querySelector("#property-owner-link-select");
    const firstOwner = [...sel.options].find(o => o.value);
    if (!firstOwner) return { ERR: "sin propietarios en el combo" };
    sel.value = firstOwner.value;
    sel.dispatchEvent(new Event("change"));
    document.querySelector("#btn-property-confirm-owner").click();
    await new Promise(r => setTimeout(r, 200));
    const pct = document.querySelector("#property-owners-list input[type=number]")?.value;
    // guardar
    form.querySelector('button[type="submit"]').click();
    await new Promise(r => setTimeout(r, 600));
    return {
      communityIdSet: !!communityId,
      pctPrimerOwner: pct,
      validationOpen: document.querySelector("#validation-dialog").open,
      errores: [...document.querySelectorAll("#validation-list li")].map(li => li.textContent.slice(0, 90)),
      propertyError: document.querySelector("#property-form-error").textContent.slice(0, 120)
    };
  } catch (e) { return { ERR: e.message }; }
})()`));
await sleep(500);
console.log("EXCEPCIONES:", exceptions.slice(0, 4));
ws.close();
edge.kill();
process.exit(0);
