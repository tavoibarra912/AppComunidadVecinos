// Captura el estado de la página en diferentes momentos
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9253;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-time-" + Date.now(), "about:blank"]);
await sleep(3000);
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
await send("Page.navigate", { url: "http://localhost:3000/" });

// Capturar estado en diferentes momentos
for (const wait of [500, 1000, 2000, 3000, 5000]) {
  await sleep(wait === 500 ? 500 : 1000); // intervalos acumulativos aproximados
  const state = await evaluate(`(() => {
    try {
      const login = document.querySelector("#login-screen");
      const topbar = document.querySelector(".topbar");
      const main = document.querySelector("main.layout");
      return JSON.stringify({
        t: Date.now() % 100000,
        loginHidden: login?.hidden,
        loginDisplay: login ? getComputedStyle(login).display : null,
        topbarDisplay: topbar?.style.display,
        mainDisplay: main?.style.display,
        bodyInnerText: document.body?.innerText?.slice(0, 80) || "(vacío)",
        selOptions: document.querySelector("#active-role-select")?.options.length
      });
    } catch (e) { return JSON.stringify({ ERR: e.message }); }
  })()`);
  console.log(`t=${wait}ms:`, state);
}

console.log("EXCEPCIONES:", JSON.stringify(exceptions.slice(0, 3)));
ws.close();
edge.kill();
process.exit(0);
