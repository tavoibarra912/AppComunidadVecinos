import fs from "node:fs";

// IDs de usuarios viejos → nuevos, en los tests.
const mapa = [
  ["user-usuario_r_user_c_propietario_c_inquilino", "user-usuario_r_user_c_propietario_c_inquilino"], // no-op de seguridad
  ["user-carlos", "user-usuario_r_user_c_propietario"],
  ["user-laura", "user-usuario_r_user_c_inquilino"],
  ["user-admin-comunidad", "user-comm-admin"],
  ["user-consulta", "user-usuario_r_user_s_perfil"],
];

const archivos = fs
  .readdirSync("scripts/tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => "scripts/tests/" + f);

for (const archivo of archivos) {
  let t = fs.readFileSync(archivo, "utf8");
  let n = 0;
  for (const [viejo, nuevo] of mapa) {
    if (viejo === nuevo) continue;
    if (t.includes(viejo)) { t = t.split(viejo).join(nuevo); n++; }
  }
  if (n) {
    fs.writeFileSync(archivo, t);
    console.log(archivo, "→", n, "sustituciones");
  }
}
console.log("OK");
