import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pen-admin2-"));
fs.mkdirSync(path.join(dir, "data"), { recursive: true });
fs.copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));

// Boot de la app sobre la copia: migraciones + ensureDemoProfiles
const { db, ensureDemoProfiles } = await import("../../src/db.js");
ensureDemoProfiles();

const usuarios = db.prepare("SELECT id, usuario, rol, activo FROM users ORDER BY usuario").all();
console.log("usuarios en tu base tras el boot:");
usuarios.forEach(u => console.log(`  ${u.usuario} → ${u.rol} ${u.activo ? "(activo)" : "(inactivo)"}`));

const admin = db.prepare("SELECT * FROM users WHERE usuario = 'admin'").get();
console.log("\nadmin existe:", !!admin, admin ? `| rol: ${admin.rol} | id: ${admin.id}` : "");
if (admin) {
  const { verifyPassword } = await import("../../src/auth.js");
  console.log("contraseña admin/admin válida:", verifyPassword("admin", admin.passwordHash));
}
const superAdmin = db.prepare("SELECT id, usuario, rol FROM users WHERE usuario = 'super_admin'").get();
console.log("super_admin intacto:", JSON.stringify(superAdmin));
process.exit(0);
