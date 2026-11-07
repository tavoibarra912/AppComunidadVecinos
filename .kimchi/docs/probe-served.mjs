// ¿Qué código ejecuta realmente el navegador?
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9237;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-probe-" + Date.now(), "about:blank"]);
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
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3000/#propietarios" });
await sleep(3500);

console.log(await evaluate(`(async () => {
  const res = await fetch("/js/features/propietarios.js");
  const text = await res.text();
  const hasImport = text.includes("syncPostalCode, syncCity");
  const hasGetLocation = text.includes("getLocationById(cityVal)");
  const hasOldLocations = /\\blocationsById\\.get\\(/.test(text);
  return JSON.stringify({ hasImport, hasGetLocation, hasOldLocations, size: text.length });
})()`));

ws.close();
edge.kill();
process.exit(0);
