import fs from "node:fs";

const archivo = "public/js/features/administracion.js";
let t = fs.readFileSync(archivo, "utf8");
let n = 0;

// 1) Carga del ajuste en renderSettings
const loadViejo = `  settingsForm.elements.mantenimiento.checked = !!s.mantenimiento;`;
const loadNuevo = `  settingsForm.elements.mantenimiento.checked = !!s.mantenimiento;
  settingsForm.elements.avisosCambiosEmail.value = s.avisosCambiosEmail || "";`;
if (t.includes(loadViejo) && !t.includes('avisosCambiosEmail.value')) {
  t = t.replace(loadViejo, loadNuevo);
  n++;
}

// 2) Envío en el payload
const payloadViejo = `    notificacionesEmail: settingsForm.elements.notificacionesEmail.checked,`;
const payloadNuevo = `    notificacionesEmail: settingsForm.elements.notificacionesEmail.checked,
    avisosCambiosEmail: settingsForm.elements.avisosCambiosEmail.value.trim(),`;
if (t.includes(payloadViejo)) { t = t.replace(payloadViejo, payloadNuevo); n++; }

fs.writeFileSync(archivo, t);
console.log("bloques:", n);
