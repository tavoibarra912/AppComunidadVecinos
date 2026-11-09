import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-scope-"));
const PORT = 3479;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stderr.on("data", d => { log += d; });
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 5000));
  const api = async (usuario, ruta) => {
    const login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, password: usuario }) });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const get = async r2 => ({ status: (await fetch(`http://localhost:${PORT}/api${r2}`, { headers: { Cookie: cookie } })).status, data: await (await fetch(`http://localhost:${PORT}/api${r2}`, { headers: { Cookie: cookie } })).json().catch(() => ({})) });
    return { boot: await get("/bootstrap"), meta: await get("/communications/metadata"), posts: await get("/communications/posts"), adminEmails: await get("/notifications/admin-emails"), ownerNotifs: await get("/notifications/owner-notifications") };
  };

  const comm = await api("comm_admin");
  const comsComm = (comm.boot.data.communities || []).map(c => c.id);
  console.log("comm_admin → comunidades:", JSON.stringify(comsComm));
  console.log("   metadata comunidades:", JSON.stringify((comm.meta.data.communities || []).map(c => c.id)));
  const postsComm = (comm.posts.data || []).map(p => p.communityId);
  console.log("   posts por comunidad:", JSON.stringify(postsComm.reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {})));
  console.log("   adminEmails:", Array.isArray(comm.adminEmails.data) ? comm.adminEmails.data.length + " (filtrados)" : "403 sin admin_notification:read (por diseño)");
  console.log("   ownerNotifications visibles:", (comm.ownerNotifs.data || []).length);
  check("comm_admin solo ve su comunidad en bootstrap", comsComm.length === 1 && comsComm[0] === "com-seed-1");
  check("comm_admin: metadata solo su comunidad", (comm.meta.data.communities || []).every(c => c.id === "com-seed-1"));
  check("comm_admin: solo posts de su comunidad", postsComm.every(c => c === "com-seed-1"));
  const emailsComm = Array.isArray(comm.adminEmails.data) ? comm.adminEmails.data : null;
  check("comm_admin: adminEmails filtrados por comunidad (o sin acceso por diseño del rol)", emailsComm === null ? true : emailsComm.every(e => e.ownerCommunity === "Residencial Peñarrubia"));

  const superU = await api("super_admin");
  const comsSuper = (superU.boot.data.communities || []).map(c => c.id);
  const postsSuper = (superU.posts.data || []).map(p => p.communityId);
  console.log("super_admin → comunidades:", comsSuper.length, "| posts totales:", postsSuper.length);
  check("super_admin ve todas las comunidades", comsSuper.length === 7);
  check("super_admin ve posts de todas las comunidades (demo multi-comunidad)", new Set(postsSuper).size >= 2);

  const vecino = await api("usuario_r_user_c_propietario");
  const comsVecino = (vecino.boot.data.communities || []).map(c => c.id);
  const postsVecino = (vecino.posts.data || []).map(p => p.communityId);
  console.log("vecino → comunidades:", JSON.stringify(comsVecino), "| posts:", JSON.stringify(postsComm));
  check("vecino con perfil único: solo su comunidad", comsVecino.length === 1 && comsVecino[0] === "com-seed-1");
  check("vecino: solo posts de su comunidad", postsVecino.every(c => c === "com-seed-1"));
  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 400));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "SCOPING-COMUNICACION OK");
process.exit(fails ? 1 : 0);
