import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = mkdtempSync(path.join(tmpdir(), "pen-mig-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));

// Estado ANTES de migrar (lectura directa, sin arrancar la app)
const antes = new DatabaseSync(path.join(dir, "data", "penarrubia.db"));
const users = antes.prepare("SELECT id, usuario, rol FROM users").all();
const roles = antes.prepare("SELECT nombre, permisos FROM roles").all();
const counts = {
  comunidades: antes.prepare("SELECT COUNT(*) n FROM communities").get().n,
  propietarios: antes.prepare("SELECT COUNT(*) n FROM owners").get().n,
  inmuebles: antes.prepare("SELECT COUNT(*) n FROM properties").get().n,
  inquilinos: antes.prepare("SELECT COUNT(*) n FROM tenants").get().n,
};
console.log("ANTES:", JSON.stringify({
  users: users.map(u => `${u.usuario}/${u.rol}`),
  superRoleConAudit: (roles.find(r => r.nombre === "super_admin")?.permisos || "").includes("audit:read"),
  counts,
}));
antes.close();

// Arrancar server sobre la copia => corren las migraciones
const PORT = 3462;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", d => process.stderr.write(d));
await new Promise(r => { const t = setInterval(async () => { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) { clearInterval(t); r(); } } catch {} }, 200); });

const api = async (ruta, metodo = "GET", cuerpo, cookie) => {
  const x = await fetch(`http://127.0.0.1:${PORT}/api${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: x.status, data: await x.json().catch(() => ({})), cookie: (x.headers.get("set-cookie") || "").split(";")[0] || null };
};
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

const login = await api("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" });
check(`login super_admin/super_admin tras migrar (status ${login.status})`, login.status === 200);
if (login.status !== 200) {
  const viejo = await api("/auth/signin", "POST", { usuario: "super_admin", password: "admin" });
  check(`contraseña custom preservada (super_admin/admin=${viejo.status})`, viejo.status === 200);
}
const boot = await api("/bootstrap", "GET", null, login.cookie);
const yo = boot.data?.user || {};
const rolesDespues = boot.data?.roles || [];
const sup = rolesDespues.find(r => r.nombre === "super_admin");
check("usuario actual es super_admin", yo.usuario === "super_admin");
check("rol super_admin tiene audit:read y admin:providers", !!sup?.permisos?.includes("audit:read") && !!sup?.permisos?.includes("admin:providers"));

const despues = new DatabaseSync(path.join(dir, "data", "penarrubia.db"));
const despuesCounts = {
  comunidades: despues.prepare("SELECT COUNT(*) n FROM communities").get().n,
  propietarios: despues.prepare("SELECT COUNT(*) n FROM owners").get().n,
  inmuebles: despues.prepare("SELECT COUNT(*) n FROM properties").get().n,
  inquilinos: despues.prepare("SELECT COUNT(*) n FROM tenants").get().n,
};
despues.close();
check("datos intactos tras migrar (mismos conteos)", JSON.stringify(despuesCounts) === JSON.stringify(counts));
console.log("DESPUÉS:", JSON.stringify(despuesCounts));

server.kill();
await new Promise(r => server.once("exit", r));
await new Promise(r => setTimeout(r, 300));
rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
console.log(fails ? `${fails} fallos` : "MIGRACION-DB-REAL OK");
process.exit(fails ? 1 : 0);
