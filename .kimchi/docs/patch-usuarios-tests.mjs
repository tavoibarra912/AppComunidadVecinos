import fs from "node:fs";

// Renombra los usuarios de demo en los tests al nuevo estándar.
// Orden importa: los nombres largos primero para no crear prefijos falsos.
const mapa = [
  ["gestor.olivos", "comm_admin"],
  ["usuario_r_user_c_propietario_c_inquilino_PLACEHOLDER", ""],
  ["carlos", "usuario_r_user_c_propietario"],
  ["laura", "usuario_r_user_c_inquilino"],
  ["recepcion", "usuario_r_user_s_perfil"],
];

const archivos = fs
  .readdirSync("scripts/tests")
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => "scripts/tests/" + f);

for (const archivo of archivos) {
  let t = fs.readFileSync(archivo, "utf8");
  let n = 0;
  // gestor.olivos → comm_admin (siempre primero)
  if (t.includes("gestor.olivos")) { t = t.split("gestor.olivos").join("comm_admin"); n++; }
  // carlos / laura / recepcion SOLO como nombres de usuario de demo (entre comillas
  // o dentro de helpers user("...") / login("...")), no como nombres de entidades
  // (los propietarios/inquilinos sembrados siguen llamándose Carlos/Laura).
  const pares = [
    ['user("carlos")', 'user("usuario_r_user_c_propietario")'],
    ['user("laura")', 'user("usuario_r_user_c_inquilino")'],
    ['"usuario": "carlos"', '"usuario": "usuario_r_user_c_propietario"'],
    ['"usuario": "laura"', '"usuario": "usuario_r_user_c_inquilino"'],
    ['usuario: "carlos"', 'usuario: "usuario_r_user_c_propietario"'],
    ['usuario: "laura"', 'usuario: "usuario_r_user_c_inquilino"'],
    ['[owner, "carlos"]', '[owner, "usuario_r_user_c_propietario"]'],
    ['[tenant, "laura"]', '[tenant, "usuario_r_user_c_inquilino"]'],
    ['login("carlos")', 'login("usuario_r_user_c_propietario")'],
    ['login("laura")', 'login("usuario_r_user_c_inquilino")'],
    ['password: "carlos"', 'password: "usuario_r_user_c_propietario"'],
    ['password: "laura"', 'password: "usuario_r_user_c_inquilino"'],
  ];
  for (const [viejo, nuevo] of pares) {
    if (t.includes(viejo)) { t = t.split(viejo).join(nuevo); n++; }
  }
  // seed.test: lista de usuarios esperada
  const listaVieja = '["super_admin", "recepcion", "carlos", "laura", "comm_admin"]';
  const listaNueva = '["super_admin", "admin", "comm_admin", "usuario_r_user_s_perfil", "usuario_r_user_c_propietario", "usuario_r_user_c_inquilino", "usuario_r_user_c_propietario_c_inquilino"]';
  if (t.includes(listaVieja)) { t = t.replace(listaVieja, listaNueva); n++; }
  const listaVieja2 = '["super_admin", "recepcion", "carlos", "laura", "gestor.olivos"]';
  if (t.includes(listaVieja2)) { t = t.replace(listaVieja2, listaNueva); n++; }

  if (n) {
    fs.writeFileSync(archivo, t);
    console.log(archivo, "→", n, "sustituciones");
  }
}
console.log("OK");
