import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-tenant-del-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));
const PORT = 3482;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stderr.on("data", d => { log += d; });
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 5000));
  const api = async (usuario, password, ruta, metodo = "GET", cuerpo) => {
    const login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, password }) });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const r = await fetch(`http://localhost:${PORT}/api${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  // Admin (administrator) borra el inquilino "Test Test" si existe, si no uno sembrado
  let r = await api("admin", "admin", "/tenants");
  const tenants = Array.isArray(r.data) ? r.data : r.data.tenants || [];
  const objetivo = tenants.find(t => `${t.name} ${t.surname}`.includes("Test")) || tenants[0];
  r = await api("admin", "admin", `/tenants/${objetivo.id}`, "DELETE");
  console.log("admin DELETE", objetivo.name, objetivo.surname, "→", r.status, r.data.error || "");
  check("admin (administrator) puede eliminar inquilino", r.status === 200);

  // comm_admin borra un inquilino de SU comunidad (tenant-seed-1 → com-seed-1)
  r = await api("comm_admin", "comm_admin", "/tenants");
  const tenComm = (Array.isArray(r.data) ? r.data : []).find(t => t.propertyId?.startsWith("prop-seed-1") || t.propertyId?.startsWith("prop-seed-2")) || (Array.isArray(r.data) ? r.data : [])[0];
  if (tenComm) {
    r = await api("comm_admin", "comm_admin", `/tenants/${tenComm.id}`, "DELETE");
    console.log("comm_admin DELETE", tenComm.name, "→", r.status, r.data.error || "");
    check("comm_admin puede eliminar inquilino de su comunidad", r.status === 200);
  } else {
    check("comm_admin: sin inquilinos en su comunidad (nada que borrar)", true);
  }

  // Vecino (usuario_r_user_c_propietario): NO puede borrar inquilinos
  const vecino = await api("usuario_r_user_c_propietario", "usuario_r_user_c_propietario", "/tenants");
  const tenVecino = (Array.isArray(vecino.data) ? vecino.data : [])[0];
  if (tenVecino) {
    const del = await api("usuario_r_user_c_propietario", "usuario_r_user_c_propietario", `/tenants/${tenVecino.id}`, "DELETE");
    console.log("vecino DELETE", tenVecino.name, "→", del.status, del.data.error || "");
    check("vecino (rol user) NO puede eliminar inquilinos (403)", del.status === 403);
  }
  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 400));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "DELETE-INQUILINOS OK");
process.exit(fails ? 1 : 0);
