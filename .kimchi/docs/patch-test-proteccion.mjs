import fs from "node:fs";

const archivo = "scripts/tests/api.integration.test.mjs";
let t = fs.readFileSync(archivo, "utf8");

const viejo = `  const superAdmin = (await admin("/admin/users")).data.users.find(u => u.rol === "super_admin");
  assert.equal((await admin(, "DELETE")).status, 409);
  assert.equal(
    (await admin(, "PUT", { activo: false })).status,
    409,
  );
  assert.equal(
    (await admin(, "PUT", { rol: "user" })).status,
    409,
  );
`;

const nuevo = `  const superAdmin = (await admin("/admin/users")).data.users.find(u => u.rol === "super_admin");
  assert.equal((await admin(\`/admin/users/\${superAdmin.id}\`, "DELETE")).status, 409);
  assert.equal(
    (await admin(\`/admin/users/\${superAdmin.id}\`, "PUT", { activo: false })).status,
    409,
  );
  assert.equal(
    (await admin(\`/admin/users/\${superAdmin.id}\`, "PUT", { rol: "user" })).status,
    409,
  );
`;

if (!t.includes(viejo)) {
  console.error("NO MATCH");
  process.exit(1);
}
t = t.replace(viejo, nuevo);
fs.writeFileSync(archivo, t);
console.log("OK");
