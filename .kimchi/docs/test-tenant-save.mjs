// Repro: alta de inquilino con verificación de teléfono y email
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9245;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-tenant-" + Date.now(), "about:blank"]);
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
await send("Page.navigate", { url: "http://localhost:3000/#inquilinos" });
await sleep(6000);
console.log("TITLE:", await evaluate("document.title + " | " + location.pathname"));

// Nuevo inquilino
console.log("OPEN:", await evaluate(`(() => {
  try {
    document.querySelector("#new-tenant").click();
    const f = document.querySelector("#tenant-form");
    return { open: document.querySelector("#tenant-dialog").open };
  } catch (e) { return { ERR: e.message }; }
})()`));

// Completar: owner → property → datos → verificar teléfono y email
console.log("FILL:", await evaluate(`(async function () {
  try {
    const f = document.querySelector("#tenant-form");
    f.elements.name.value = "Inquilino";
    f.elements.surname.value = "De Prueba";
    f.elements.documentId.value = "44556677B";
    // propietario con inmuebles
    const ownerOpt = [...f.elements.ownerId.options].find(o => o.value && o.textContent.includes("Carlos"));
    if (!ownerOpt) return { ERR: "sin owner en combo" };
    f.elements.ownerId.value = ownerOpt.value;
    f.elements.ownerId.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const propOpt = [...f.elements.propertyId.options].find(o => o.value);
    if (!propOpt) return { ERR: "sin propiedades en combo" };
    f.elements.propertyId.value = propOpt.value;
    f.elements.propertyId.dispatchEvent(new Event("change", { bubbles: true }));
    f.elements.phone.value = "655443322";
    f.elements.phone.dispatchEvent(new Event("input", { bubbles: true }));
    f.elements.email.value = "inquilino@prueba.es";
    f.elements.email.dispatchEvent(new Event("input", { bubbles: true }));
    f.elements.contractStart.value = "2026-01-01";
    // verificar teléfono
    document.querySelector("#tenant-btn-verify-phone")?.click();
    await new Promise(r => setTimeout(r, 900));
    const code1 = document.querySelector("#tenant-verification-demo-code")?.textContent || document.querySelector("[id*=demo-code]")?.textContent || "";
    return { code1: code1 ? "ok" : "sin devCode", verifStatus: document.querySelector("#tenant-phone-verify-status")?.textContent };
  } catch (e) { return { ERR: e.message }; }
})()`));

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
