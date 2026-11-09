// Sonda visual: qué ve el usuario exactamente
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9252;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-visual-" + Date.now(), "about:blank"]);
await sleep(3000);
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
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(6000);

console.log(await evaluate(`(() => {
  const login = document.querySelector("#login-screen");
  const topbar = document.querySelector(".topbar");
  const main = document.querySelector("main.layout");
  const loginCS = login ? getComputedStyle(login) : null;
  const topCS = topbar ? getComputedStyle(topbar) : null;
  const mainCS = main ? getComputedStyle(main) : null;
  const loginRect = login?.getBoundingClientRect();
  const bodyText = document.body.innerText.slice(0, 200);
  return JSON.stringify({
    bodyText,
    loginHidden: login?.hidden,
    loginDisplay: loginCS?.display,
    loginVisible: loginRect ? (loginRect.width > 0 && loginRect.height > 0) : false,
    loginBg: loginCS?.backgroundColor,
    loginZ: loginCS?.zIndex,
    topbarDisplay: topCS?.display,
    mainDisplay: mainCS?.display,
    mainHidden: main?.hidden,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlOverflow: getComputedStyle(document.documentElement).overflow
  });
})()`));

// Screenshot
const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
fs.writeFileSync(".kimchi/docs/screenshot-blank.png", Buffer.from(shot.result.data, "base64"));
console.log("screenshot guardado");

ws.close();
edge.kill();
process.exit(0);
