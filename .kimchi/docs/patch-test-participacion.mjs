import fs from "node:fs";

const archivo = "scripts/tests/communications.test.mjs";
let t = fs.readFileSync(archivo, "utf8");

const ancla = `test("comentarios: texto literal, eliminación propia o moderación y bloqueo por estado", async () => {`;

const nuevo = `test("comm:participacion: sin el permiso no se comenta ni vota", async () => {
  // Quitar el permiso al rol user: comentarios y votos pasan a 403.
  const roles = (await admin("/admin/roles")).data;
  const rolUser = roles.find((r) => r.nombre === "user");
  const originales = rolUser.permisos;
  await admin(\`/admin/roles/\${rolUser.id}\`, "PUT", {
    nombre: rolUser.nombre,
    permisos: originales.filter((p) => p !== "comm:participacion"),
  });
  const p = await create();
  assert.equal(
    (
      await owner(\`/communications/posts/\${p.id}/comments\`, "POST", {
        body: "sin permiso",
      })
    ).status,
    403,
  );
  assert.equal(
    (await owner(\`/communications/posts/\${p.id}/ballot\`, "POST", { choices: [0] }))
      .status,
    403,
  );
  // Restaurar el permiso: vuelve a funcionar.
  await admin(\`/admin/roles/\${rolUser.id}\`, "PUT", {
    nombre: rolUser.nombre,
    permisos: originales,
  });
  assert.equal(
    (
      await owner(\`/communications/posts/\${p.id}/comments\`, "POST", {
        body: "con permiso restaurado",
      })
    ).status,
    201,
  );
});

test("comentarios: texto literal, eliminación propia o moderación y bloqueo por estado", async () => {`;

if (!t.includes(ancla)) {
  console.error("ANCLA NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(ancla, nuevo);
fs.writeFileSync(archivo, t);
console.log("OK");
