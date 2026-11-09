import fs from "node:fs";

const archivo = "src/seed.js";
let t = fs.readFileSync(archivo, "utf8");

// Reparar la función createSeedDocsDemo (el shell vació las interpolaciones)
const roto = `export function createSeedDocsDemo({ dni, nombre, plot, communityName, aprobadas = false }) {
  const docs = createSeedDocsForCarlosRuiz();
  docs.dni.fileName = ;
  docs.dni.autoValidation.checks[3].detail = ;
  docs.bankReceipt.fileName = ;
  docs.propertyDeed.fileName = ;
  docs.propertyDeed.autoValidation.checks[2].detail = ;
  if (aprobadas) {
    for (const d of [docs.dni, docs.bankReceipt, docs.propertyDeed])
      d.adminApproval = { status: "approved", reviewedAt: "11/10/2026, 11:30", reviewedBy: "Administrador", notes: "Verificado conforme." };
  }
  return docs;
}`;

const bien = `export function createSeedDocsDemo({ dni, nombre = "Titular", plot = "Inmueble", communityName = "la comunidad", aprobadas = false }) {
  const docs = createSeedDocsForCarlosRuiz();
  docs.dni.fileName = \`DNI_\${dni}_ambas_caras.pdf\`;
  docs.dni.autoValidation.checks[3].detail = \`DNI \${dni} coincide con el asociado\`;
  docs.bankReceipt.fileName = \`Recibo_Bancario_\${nombre.replace(/\\s+/g, "_")}_\${dni}.pdf\`;
  docs.propertyDeed.fileName = \`Escritura_\${plot.replace(/\\s+/g, "_")}.pdf\`;
  docs.propertyDeed.autoValidation.checks[2].detail = \`\${plot} en \${communityName} acreditada\`;
  if (aprobadas) {
    for (const d of [docs.dni, docs.bankReceipt, docs.propertyDeed])
      d.adminApproval = { status: "approved", reviewedAt: "11/10/2026, 11:30", reviewedBy: "Administrador", notes: "Verificado conforme." };
  }
  return docs;
}`;

if (!t.includes(roto)) {
  console.error("BLOQUE ROTO NO ENCONTRADO");
  process.exit(1);
}
t = t.replace(roto, bien);
fs.writeFileSync(archivo, t);
console.log("reparado");
