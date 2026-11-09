import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-avisos-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));
const PORT = 3480;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", d => { log += d; });
server.stderr.on("data", d => { log += d; });
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 5000));
  let login = null, cookie = null;
  for (const password of ["admin", "super_admin"]) {
    login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password }) });
    if (login.headers.get("set-cookie")) { cookie = login.headers.get("set-cookie").split(";")[0]; break; }
  }
  if (!cookie) { console.error("LOGIN FALLÓ con admin y super_admin"); process.exit(1); }
  const api = async (ruta, metodo = "GET", cuerpo) => {
    const r = await fetch(`http://localhost:${PORT}/api${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  // 1) Configurar el email de avisos
  const put = await api("/admin/settings", "PUT", { avisosCambiosEmail: "asociacionpenarubia@gmail.com" });
  check(`configurar email de avisos (status ${put.status})`, put.status === 200 && put.data.avisosCambiosEmail === "asociacionpenarubia@gmail.com");

  // 2) Editar un propietario (cambio real)
  const owners = (await api("/owners")).data;
  const carlos = (Array.isArray(owners) ? owners : owners.owners).find(o => o.id === "own-seed-1");
  const putOwner = await api(`/owners/own-seed-1`, "PUT", { ...carlos, phone: "611222333" });
  check(`PUT owner con cambio de teléfono (status ${putOwner.status})`, putOwner.status === 200);
  await new Promise(r => setTimeout(r, 400));

  // 3) El aviso se intentó enviar (SMTP deshabilitado → log con el motivo)
  const avisosLog = log.split("\n").filter(l => l.includes("[avisos]"));
  check("el flujo de aviso se disparó (log del servidor)", avisosLog.some(l => l.includes("asociacionpenarubia@gmail.com")));
  console.log("   log:", avisosLog[0]?.trim().slice(0, 120) || "(vacío)");

  // 4) Sin cambio real (mismos valores) → no se dispara
  const logAntes = log.split("\n").filter(l => l.includes("[avisos]")).length;
  const sinCambio = await api(`/owners/own-seed-1`, "PUT", { ...(await api(`/owners/own-seed-1`)).data, phone: "611222333" });
  await new Promise(r => setTimeout(r, 400));
  const logDespues = log.split("\n").filter(l => l.includes("[avisos]")).length;
  check("sin cambios de valores no se dispara el aviso", sinCambio.status === 200 && logDespues === logAntes);
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "AVISOS-CAMBIOS OK");
process.exit(fails ? 1 : 0);
