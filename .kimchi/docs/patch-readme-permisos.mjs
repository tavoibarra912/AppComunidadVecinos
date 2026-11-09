import fs from "node:fs";

let t = fs.readFileSync("README.md", "utf8");
const ancla = "| `usuario_r_user_c_propietario_c_inquilino` | user | Con perfiles de propietario e inquilino |";
if (!t.includes(ancla)) {
  console.error("ANCLA NO");
  process.exit(1);
}
const extra = `

Permisos destacados configurables por rol (Administración → Roles):

- **\`owner:delete\`** — eliminar un socio. Por defecto solo lo tiene \`super_admin\`;
  otorgáselo al rol \`administrator\` si querés que el administrador general pueda
  hacerlo (el borrado se bloquea si el socio tiene un inmueble con inquilino).
- **\`comm:participacion\`** — participar en Comunicación: comentar (con nombre),
  votar encuestas y confirmar asistencia a reuniones. Activado por defecto para
  \`administrator\`, \`community_admin\` y \`user\`; desmarcalo en un rol y ese rol ve
  las publicaciones de forma informativa (sin la parte social). \`super_admin\`
  siempre participa.`;

t = t.replace(ancla, ancla + extra);
fs.writeFileSync("README.md", t);
console.log("OK");
