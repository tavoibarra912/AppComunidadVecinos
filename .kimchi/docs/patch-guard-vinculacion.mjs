import fs from "node:fs";

const archivo = "src/routes/admin.js";
let t = fs.readFileSync(archivo, "utf8");

// Guard: super_admin y administrator no se vinculan a perfiles.
const viejo = `  router.put(\`/users/:id/link-\${kind}\`, (req, res) => {
    if (!db.prepare("SELECT id FROM users WHERE id=?").get(req.params.id))
      return res.status(404).json({ error: "Usuario no encontrado." });`;

const nuevo = `  router.put(\`/users/:id/link-\${kind}\`, (req, res) => {
    const usuarioVinculo = db.prepare("SELECT id, usuario, rol FROM users WHERE id=?").get(req.params.id);
    if (!usuarioVinculo)
      return res.status(404).json({ error: "Usuario no encontrado." });
    // Los roles de administración de la plataforma no llevan perfiles:
    // administran todo sin ser vecinos de ninguna comunidad.
    if (["super_admin", "administrator"].includes(usuarioVinculo.rol))
      return res
        .status(409)
        .json({
          error:
            "Los roles de administración de la plataforma (super_admin, administrator) no se vinculan a perfiles de propietario o inquilino.",
        });`;

if (!t.includes(viejo)) {
  console.error("NO MATCH");
  process.exit(1);
}
t = t.replace(viejo, nuevo);
fs.writeFileSync(archivo, t);
console.log("OK");
