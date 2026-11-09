import fs from "node:fs";

const archivo = "src/db.js";
let t = fs.readFileSync(archivo, "utf8");

// 1) Chequeo de referencias con columnas que existen realmente
const usadoViejo = `    const usado = db.prepare(
      \`SELECT (SELECT COUNT(*) FROM owners WHERE userId = ?) +
              (SELECT COUNT(*) FROM tenants WHERE userId = ?) +
              (SELECT COUNT(*) FROM communities WHERE adminUserId = ?) +
              (SELECT COUNT(*) FROM owner_notifications WHERE userId = ?) +
              (SELECT COUNT(*) FROM admin_emails WHERE ownerId = ?) +
              (SELECT COUNT(*) FROM communication_recipients WHERE userId = ?) AS total\`,
    ).get(u.id, u.id, u.id, u.id, u.id, u.id).total;`;
const usadoNuevo = `    const usado = db.prepare(
      \`SELECT (SELECT COUNT(*) FROM owners WHERE userId = ?) +
              (SELECT COUNT(*) FROM tenants WHERE userId = ?) +
              (SELECT COUNT(*) FROM communities WHERE adminUserId = ?) +
              (SELECT COUNT(*) FROM communication_recipients WHERE userId = ?) +
              (SELECT COUNT(*) FROM communication_audit WHERE userId = ?) +
              (SELECT COUNT(*) FROM communication_preferences WHERE userId = ?) +
              (SELECT COUNT(*) FROM sessions WHERE userId = ?) AS total\`,
    ).get(u.id, u.id, u.id, u.id, u.id, u.id, u.id).total;`;

if (t.includes(usadoViejo)) {
  t = t.replace(usadoViejo, usadoNuevo);
  console.log("usado: actualizado");
} else if (t.includes("communication_audit WHERE userId = ?) +")) {
  console.log("usado: ya actualizado");
} else {
  console.error("BLOQUE USADO NO ENCONTRADO");
  process.exit(1);
}

// 2) Normalizar identidad del super_admin migrado (nombre/email del estándar)
const ancla = `  const comPrincipal = db.prepare("SELECT adminUserId FROM communities WHERE id = 'com-seed-1'").get();`;
if (!t.includes(ancla)) {
  console.error("ANCLA NO ENCONTRADA");
  process.exit(1);
}
if (!t.includes("superMigrado")) {
  const normaliza = `  const superMigrado = db.prepare("SELECT id, nombre FROM users WHERE usuario = 'super_admin'").get();
  if (superMigrado && superMigrado.nombre !== "super_admin")
    db.prepare("UPDATE users SET nombre = 'super_admin', apellido = '', email = 'super_admin@super_admin.com' WHERE id = ?").run(superMigrado.id);
`;
  t = t.replace(ancla, normaliza + ancla);
  console.log("normalización super_admin: agregada");
}

fs.writeFileSync(archivo, t);
console.log("OK");
