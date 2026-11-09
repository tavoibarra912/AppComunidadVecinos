import fs from "node:fs";

let t = fs.readFileSync("README.md", "utf8");

// 1) Tabla de cuentas demo tras el párrafo de login demo
const ancla1 = "coinciden (por ejemplo, `super_admin` / `super_admin`), salvo que hayas cambiado la contraseña.";
const tabla = `

Cuentas demo estándar (usuario = contraseña = email local = nombre):

| Usuario | Rol | Escenario |
| --- | --- | --- |
| \`super_admin\` | super_admin | Acceso total, sin perfil |
| \`admin\` | administrator | Crea y administra todas las comunidades |
| \`comm_admin\` | community_admin | Administra la comunidad asignada (Peñarrubia) |
| \`usuario_r_user_s_perfil\` | user | Sin perfil vinculado |
| \`usuario_r_user_c_propietario\` | user | Con perfil de propietario |
| \`usuario_r_user_c_inquilino\` | user | Con perfil de inquilino |
| \`usuario_r_user_c_propietario_c_inquilino\` | user | Con perfiles de propietario e inquilino |

Permisos destacados configurables por rol (Administración → Roles):

- **\`owner:delete\`** — eliminar un socio. Por defecto solo lo tiene \`super_admin\`;
  otorgáselo al rol \`administrator\` si querés que el administrador general pueda
  hacerlo (el borrado se bloquea si el socio tiene un inmueble con inquilino).
- **\`comm:participacion\`** — participar en Comunicación: comentar (con nombre),
  votar encuestas y confirmar asistencia a reuniones. Activado por defecto para
  \`administrator\`, \`community_admin\` y \`user\`; desmarcalo en un rol y ese rol ve
  las publicaciones de forma informativa (sin la parte social). \`super_admin\`
  siempre participa.`;

if (!t.includes(ancla)) {
  console.error("ANCLA 1 NO");
  process.exit(1);
}
t = t.replace(ancla, ancla + tabla);

fs.writeFileSync("README.md", t);
console.log("README: cuentas + permisos agregados");
