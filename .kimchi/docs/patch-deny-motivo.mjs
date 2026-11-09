import fs from "node:fs";

const archivo = "src/access.js";
let t = fs.readFileSync(archivo, "utf8");

// 1) deny acepta un motivo legible
const denyViejo = `const deny = (res) =>
  res
    .status(403)
    .json({ error: "No tenés acceso a estos datos o a esta operación." });`;
const denyNuevo = `const deny = (res, motivo) =>
  res
    .status(403)
    .json({
      error:
        motivo || "No tenés acceso a estos datos o a esta operación.",
    });`;

if (t.includes(denyViejo)) {
  t = t.replace(denyViejo, denyNuevo);
  console.log("deny: actualizado");
}

// 2) El motivo indica el permiso que falta (etiqueta legible)
const permisoViejo = `  if (!permits(permission, id || req.body?.ownerId || "") && !ownEdit)
    return deny(res);`;
const permisoNuevo = `  if (!permits(permission, id || req.body?.ownerId || "") && !ownEdit)
    return deny(
      res,
      \`No tenés permiso para esta operación (requiere: \${etiquetaPermiso(permission)}).\`,
    );`;

if (t.includes(permisoViejo)) {
  t = t.replace(permisoViejo, permisoNuevo);
  console.log("resourceAccess: motivo agregado");
}

// 3) Import de etiquetaPermiso
const importViejo = `import { allowed, policyData, visibleData } from "./security.js";`;
const importNuevo = `import { allowed, policyData, visibleData } from "./security.js";
import { etiquetaPermiso } from "../public/js/permissions.js";`;

if (t.includes(importViejo) && !t.includes("etiquetaPermiso")) {
  t = t.replace(importViejo, importNuevo);
  console.log("import: agregado");
}

fs.writeFileSync(archivo, t);
console.log("OK");
