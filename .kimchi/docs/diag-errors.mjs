// Captura TODOS los errores de JS al cargar la app
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9251;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-diag-final-" + Date.now(), "about:blank"]);
await sleep(3000);
const list = JSON.parse(execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { maxBuffer: 10 * 1024 * 1024 }).toString());
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let msgId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  if (data.method === "Runtime.exceptionThrown") {
    const detail = data.params.exceptionDetails;
    errors.push(`[EXCEPTION] ${detail?.exception?.description || detail?.text || "unknown"}`);
  }
  if (data.method === "Network.responseReceived") {
    const status = data.params.response.status;
    const url = data.params.response.url;
    if (status >= 400) errors.push(`[404+] ${status} ${url}`);
  }
  if (data.method === "Runtime.exceptionThrown") {
    const detail = data.params.exceptionDetails;
    errors.push(`[EXCEPTION] ${detail?.exception?.description || detail?.text || "unknown"}`);
  }
  if (data.method === "Log.entryAdded" && data.params.entry.level === "error") {
    errors.push(`[LOG] ${data.params.entry.text?.slice(0, 200)}`);
  }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(8000);

console.log("ERRORES CAPTURADOS:");
if (errors.length === 0) console.log("  (ninguno)");
errors.slice(0, 10).forEach(e => console.log("  " + e));

ws.close();
edge.kill();
process.exit(0);
