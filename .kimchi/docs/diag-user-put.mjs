import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-userput-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));
const PORT = 3477;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stderr.on("data", d => { log += d; });

try {
  await new Promise(r => setTimeout(r, 5000));
  // Tu base mantiene la contraseña semilla "admin" para super_admin
  let login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "admin" }) });
  if (!login.headers.get("set-cookie")) login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "super_admin" }) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) { console.error("LOGIN FALLÓ"); console.log(log.slice(0, 500)); process.exit(1); }
  const api = async (ruta, metodo = "GET", cuerpo) => {
    const r = await fetch(`http://localhost:${PORT}/api${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  const usuarios = (await api("/admin/users")).data;
  const lista = (usuarios.users || usuarios).map?.(u => u.usuario) || Object.values(usuarios)[0];
  console.log("usuarios en tu base:", JSON.stringify(lista));

  // Editar un usuario que no sea super_admin (ej. carlos): cambiar nombre
  const objetivo = (usuarios.users || usuarios).find?.(u => u.usuario === "carlos") || (usuarios.users || usuarios)[1];
  console.log("editando:", objetivo.usuario);
  const put = await api(`/admin/users/${objetivo.id}`, "PUT", { nombre: "Carlos Editado", activo: true });
  console.log("PUT edición básica:", put.status, JSON.stringify(put.data.error || { nombre: put.data.nombre }));

  // Edición con cambio de rol y email
  const put2 = await api(`/admin/users/${objetivo.id}`, "PUT", { nombre: objetivo.nombre, email: "carlos.editado@penarrubia.es", rol: objetivo.rol, activo: true });
  console.log("PUT edición email:", put2.status, JSON.stringify(put2.data.error || { email: put2.data.email }));

  // Edición del propio super_admin (solo nombre)
  const superU = (usuarios.users || usuarios).find(u => u.usuario === "super_admin");
  const put3 = await api(`/admin/users/${superU.id}`, "PUT", { nombre: "Super Editado" });
  console.log("PUT super_admin:", put3.status, JSON.stringify(put3.data.error || { nombre: put3.data.nombre }));

  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 600));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
