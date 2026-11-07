// Diagnóstico de guardado de propietario: alta completa con verificación
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9238;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-owner-save-" + Date.now(), "about:blank"]);
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
  if (data.method === "Runtime.exceptionThrown") {
    exceptions.push(String(data.params.exceptionDetails?.exception?.description || "exception").split("\n")[0]);
  }
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
await send("Page.navigate", { url: "http://localhost:3000/#propietarios" });
await sleep(3500);

// PASO 1: pestaña General
console.log("PASO 1:", await evaluate(`(() => {
  try {
    document.querySelector("#new-owner").click();
    const f = document.querySelector("#owner-form");
    f.elements.name.value = "Prueba";
    f.elements.surname.value = "Guardado";
    f.elements.dni.value = "12345678Z";
    return { ok: true };
  } catch (e) { return { ERR: e.message }; }
})()`));

// PASO 2: Contacto: provincia -> municipio -> CP + verificación de teléfono
console.log("VERIF:", await evaluate(`(async function () {
  try {
    const f = document.querySelector("#owner-form");
    document.querySelector('[data-owner-tab="contact"]').click();
    f.elements.phone.value = "611222333";
    f.elements.phone.dispatchEvent(new Event("input", { bubbles: true }));
    f.elements.email.value = "prueba@guardado.es";
    f.elements.address.value = "Calle Prueba 1";
    f.elements.province.value = "Madrid";
    f.elements.province.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const cityOpt = [...f.elements.city.options].find(o => o.textContent.includes("Madrid"));
    if (!cityOpt) return { ERR: "sin municipios", cityDisabled: f.elements.city.disabled };
    f.elements.city.value = cityOpt.value;
    f.elements.city.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const cpOpt = [...f.elements.postalCode.options].find(o => o.value);
    if (!cpOpt) return { ERR: "sin CPs disponibles" };
    f.elements.postalCode.value = cpOpt.value;
    document.querySelector("#btn-verify-phone").click();
    await new Promise(r => setTimeout(r, 900));
    const code = document.querySelector("#verification-demo-code")?.textContent || "";
    if (!code) return { ERR: "sin devCode" };
    document.querySelector("#verification-code-input").value = code;
    document.querySelector("#verification-confirm-btn").click();
    await new Promise(r => setTimeout(r, 900));
    return { phoneStatus: document.querySelector("#phone-verify-status").textContent };
  } catch (e) { return { ERR: e.message }; }
})()`));

// PASO 3: guardar
await evaluate(`window.__reqs = []; const __of = window.fetch; window.fetch = function(...a) { window.__reqs.push(((a[1] && a[1].method) || "GET") + " " + String(a[0])); return __of.apply(window, a); }; return true;`);
console.log("GUARDAR:", await evaluate(`(() => {
  try {
    document.querySelector("#owner-form button[type=submit]").click();
    return { enviado: true };
  } catch (e) { return { ERR: e.message }; }
})()`));
await sleep(4000);

// PASO 4: resultado
console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
console.log("REQS:", await evaluate(`window.__reqs.join(" | ") || "(ninguna)"`));
console.log("RESULTADO:", await evaluate(`(() => {
  const valDialog = document.querySelector("#owner-validation-dialog");
  return {
    validationOpen: valDialog?.open || false,
    valErrors: [...document.querySelectorAll("#owner-validation-list li")].map(li => li.textContent.slice(0, 80)),
    ownerError: document.querySelector("#owner-form-error").textContent,
    dialogStillOpen: document.querySelector("#owner-dialog").open,
    creado: [...document.querySelectorAll("#propietarios-table tbody .community-name")].some(n => n.textContent.includes("Prueba Guardado"))
  };
})()`));

ws.close();
edge.kill();
process.exit(0);
