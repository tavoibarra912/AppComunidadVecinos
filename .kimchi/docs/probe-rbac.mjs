// Sonda: RBAC en vivo para gestor (community_admin)
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9242;
import { execFile, execSync } from "node:child_process";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-probe-rbac-" + Date.now(), "about:blank"]);
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
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(4000);

console.log(await evaluate(`(async () => {
  const rbac = await import("/js/state.js");
  rbac.restoreActiveUser();
  const users = rbac.state.users;
  const gestor = users.find(u => u.usuario === "gestor.olivos");
  rbac.setActiveUser(gestor.id);
  const profiles = rbac.getUserProfiles();
  return JSON.stringify({
    activo: rbac.getCurrentUser()?.usuario,
    rol: rbac.getCurrentUser()?.rol,
    adminCommunityIds: profiles.adminCommunityIds,
    hasReadCom1: rbac.hasPermission("community:read", "com-seed-1"),
    hasReadSinId: rbac.hasPermission("community:read"),
    hasManageCom1: rbac.hasPermission("community:manage", "com-seed-1"),
    hasCreate: rbac.hasPermission("community:create"),
    activeRole: rbac.state.activeRole
  });
})()`));

ws.close();
edge.kill();
process.exit(0);
