// Test: readonly cierra con X / Esc aplica guard / tabs navegables en readonly
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9239;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-readonly-" + Date.now(), "about:blank"]);
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
await send("Page.navigate", { url: "http://localhost:3000/#comunidades" });
await sleep(3500);

// 1. Ver comunidad (readonly): navegar tabs + cerrar con X
console.log("COM-VER:", await evaluate(`(async function () {
  try {
    document.querySelector("#comunidades-table tbody tr .icon-action-btn.btn-info").click();
    const d = document.querySelector("#community-dialog");
    const tabBtns = [...d.querySelectorAll("[data-community-tab]")];
    tabBtns[1].click();
    await new Promise(r => setTimeout(r, 150));
    const tab2Visible = !d.querySelector('[data-community-pane="contact"]').hidden;
    const controlDisabled = !!d.querySelector('[data-community-pane="details"] input[name="name"]').disabled;
    // cerrar con la X
    d.querySelector("#close-dialog").click();
    await new Promise(r => setTimeout(r, 200));
    return { open: d.open, tab2Visible, controlDisabled, cerroConX: !d.open, confirmOpen: document.querySelector("#confirm-close-dialog").open };
  } catch (e) { return { ERR: e.message }; }
})()`));

// 2. Esc en edición con cambios → guard
console.log("ESC-GUARD:", await evaluate(`(async function () {
  try {
    document.querySelector("#comunidades-table tbody tr .icon-action-btn.btn-edit").click();
    const d = document.querySelector("#community-dialog");
    d.querySelector('[name="name"]').value = "Cambiado sin guardar";
    d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // los dialogs reaccionan a cancel, no keydown: simular cancel
    d.dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true }));
    await new Promise(r => setTimeout(r, 250));
    const confirmOpen = document.querySelector("#confirm-close-dialog").open;
    let quedoAbierto = d.open;
    // decidir quedarse
    document.querySelector("#confirm-close-stay").click();
    await new Promise(r => setTimeout(r, 150));
    return { guardAparecio: confirmOpen, quedoAbierto, valuePreservado: d.querySelector('[name="name"]').value };
  } catch (e) { return { ERR: e.message }; }
})()`));
await evaluate(`document.querySelector("#confirm-close-leave")?.click(); document.querySelector("#community-dialog")?.close();`);
await sleep(200);

// 3. Owner Ver: cerrar con X
console.log("OWN-VER:", await evaluate(`(async function () {
  try {
    document.querySelector("#propietarios-table tbody tr .icon-action-btn.btn-info").click();
    const d = document.querySelector("#owner-dialog");
    const esReadonly = d.classList.contains("is-readonly");
    const tabBtns = [...d.querySelectorAll("[data-owner-tab]")];
    tabBtns[1].click();
    await new Promise(r => setTimeout(r, 150));
    const tabVisible = !d.querySelector('[data-owner-pane="contact"]').hidden;
    d.querySelector("#close-owner-dialog").click();
    await new Promise(r => setTimeout(r, 250));
    return { open: d.open, esReadonly, tabVisible, cerroConX: !d.open };
  } catch (e) { return { ERR: e.message }; }
})()`));

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
