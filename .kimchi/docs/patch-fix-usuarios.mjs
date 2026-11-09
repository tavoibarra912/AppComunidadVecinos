import fs from "node:fs";

// 1) Test de protección: GET /admin/users devuelve un array plano
let t = fs.readFileSync("scripts/tests/api.integration.test.mjs", "utf8");
const proteccionViejo = `  const superAdmin = (await admin("/admin/users")).data.users.find(u => u.rol === "super_admin");`;
const proteccionNuevo = `  const superAdmin = (await admin("/admin/users")).data.find(u => u.rol === "super_admin");`;
if (t.includes(proteccionViejo)) { t = t.replace(proteccionViejo, proteccionNuevo); console.log("protección: corregido"); }

// 2) El usuario combinado lleva sus perfiles en com-seed-2 (own-seed-3 + tenant-seed-2)
//    para que com-seed-1 conserve perfiles sin cuenta (lo verifica el test de vista previa).
let d = fs.readFileSync("src/db.js", "utf8");
const vincViejo = `  vincularOwner("own-seed-2", "user-usuario_r_user_c_propietario_c_inquilino");`;
const vincNuevo = `  vincularOwner("own-seed-3", "user-usuario_r_user_c_propietario_c_inquilino");`;
if (d.includes(vincViejo)) { d = d.replace(vincViejo, vincNuevo); console.log("owner combinado: movido a com-seed-2"); }
const tenViejo = `  vincularTenant("tenant-seed-2", "user-usuario_r_user_c_propietario_c_inquilino");`;
const tenNuevo = `  vincularTenant("tenant-seed-2", "user-usuario_r_user_c_propietario_c_inquilino"); // inmueble en com-seed-2`;
if (d.includes(tenViejo)) { d = d.replace(tenViejo, tenNuevo); console.log("tenant combinado: ok"); }
fs.writeFileSync("src/db.js", d);

// 3) seed.test: asserts de semilla con las cuentas estándar
let s = fs.readFileSync("scripts/tests/seed.test.mjs", "utf8");
s = s.replace(
  'assert.equal(db.prepare("SELECT userId FROM owners WHERE id = \'own-seed-1\'").get().userId, "user-usuario_r_user_c_propietario");',
  `assert.equal(db.prepare("SELECT userId FROM owners WHERE id = 'own-seed-1'").get().userId, "user-usuario_r_user_c_propietario");
  assert.equal(db.prepare("SELECT userId FROM owners WHERE id = 'own-seed-3'").get().userId, "user-usuario_r_user_c_propietario_c_inquilino");`,
);
fs.writeFileSync("scripts/tests/seed.test.mjs", s);

fs.writeFileSync("scripts/tests/api.integration.test.mjs", t);
fs.writeFileSync("src/db.js", d);
console.log("OK");
