// Diagnóstico completo: errores de consola, boot, login screen
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9247;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-diag-boot-" + Date.now(), "about:blank"]);
await sleep(3000);
const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { maxBuffer: 10 * 1024 * 1024 }).toString());
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
    consoleErrors.push(data.params.args?.map(a => a.value || a.description || "").join(" ").slice(0, 150));
  }
  if (data.method === "Runtime.exceptionThrown") {
    exceptions.push(String(data.params.exceptionDetails?.exception?.description || "").split("\n")[0]);
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
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(6000);

console.log("=== ERRORES DE CONSOLA ===");
consoleErrors.forEach(e => console.log("  ", e));
console.log("=== EXCEPCIONES ===");
exceptions.forEach(e => console.log("  ", e));

console.log("=== ESTADO ===");
console.log(await evaluate(`(() => {
  const login = document.querySelector("#login-screen");
  const topbar = document.querySelector(".topbar");
  const main = document.querySelector("main.layout");
  const selector = document.querySelector("#active-role-select");
  return JSON.stringify({
    loginScreenVisible: login && !login.hidden,
    loginScreenExists: !!login,
    topbarDisplay: topbar?.style.display,
    mainDisplay: main?.style.display,
    selectorOptions: selector?.options.length,
    selectorValue: selector?.value,
    sessionStorageAuth: sessionStorage.getItem("authUserId"),
    bodyChildren: document.body.children.length
  });
})()`));

// Intentar login como admin
console.log("=== LOGIN ADMIN ===");
console.log(await evaluate(`(async function () {
  try {
    const form = document.querySelector("#login-signin-form");
    if (!form) return { ERR: "no form" };
    form.elements.usuario.value = "admin";
    form.elements.password.value = "admin";
    form.querySelector(".login-submit").click();
    await new Promise(r => setTimeout(r, 1500));
    const login = document.querySelector("#login-screen");
    const app = document.querySelector("main.layout");
    return {
      loginOculto: login.hidden,
      appVisible: app.style.display !== "none",
      topbarVisible: document.querySelector(".topbar").style.display !== "none",
      usuario: document.querySelector("#user-role-label")?.textContent?.slice(0, 50),
      adminNav: !document.querySelector("#nav-administracion")?.hidden,
      tableRows: document.querySelectorAll("#comunidades-table tbody tr").length
    };
  } catch (e) { return { ERR: e.message }; }
})()`));

ws.close();
edge.kill();
process.exit(0);
