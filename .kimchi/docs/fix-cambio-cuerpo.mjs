import fs from "node:fs";

const archivo = "public/js/textos-envio.js";
let t = fs.readFileSync(archivo, "utf8");

// Repara el salto de línea literal dentro del string de cambioCuerpo.
const roto = 'cambioCuerpo: "El usuario {{usuario}} actualizó el perfil de {{perfil}} ({{comunidad}}) el {{fecha}}.\n\nCambios realizados:\n{{cambios}}\n\n— {{plataforma}}",';
const bien = 'cambioCuerpo: "El usuario {{usuario}} actualizó el perfil de {{perfil}} ({{comunidad}}) el {{fecha}}.\\n\\nCambios realizados:\\n{{cambios}}\\n\\n— {{plataforma}}",';

if (t.includes(roto)) {
  t = t.replace(roto, bien);
  fs.writeFileSync(archivo, t);
  console.log("reparado");
} else if (t.includes("Cambios realizados:")) {
  console.log("ya estaba bien");
} else {
  console.error("NO ENCONTRADO");
  process.exit(1);
}
