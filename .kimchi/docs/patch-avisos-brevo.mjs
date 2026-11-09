import fs from "node:fs";

const archivo = "public/js/features/communication.js";
let t = fs.readFileSync(archivo, "utf8");
let cambios = 0;

// 1) Habilitar deshabilita también el selector de proveedor
const toggleViejo = 'if (el === toggle || el === smtpProviderSelect || el === smsProviderSelect) return;';
const toggleNuevo = 'if (el === toggle) return;';
if (t.includes(toggleViejo)) { t = t.replace(toggleViejo, toggleNuevo); cambios++; }

// 2) Aviso de IP autorizada en la intro
const introVieja = 'conservarlas.</p>';
const introNueva = 'conservarlas. Si Brevo rechaza las llamadas, autorizá en Brevo → Seguridad → Direcciones IP autorizadas la IP pública del servidor donde corre la app (en desarrollo, la IP pública de tu conexión; «localhost» no es una IP válida ahí).</p>';
if (t.includes(introVieja)) { t = t.replace(introVieja, introNueva); cambios++; }

// 3) Etiquetas del borrado de credenciales
const clearSmtpViejo = 'Eliminar contraseña guardada';
if (t.includes(clearSmtpViejo)) { t = t.replace(clearSmtpViejo, 'Eliminar la contraseña/API key guardada'); cambios++; }
const clearTokenViejo = 'Eliminar token guardado';
if (t.includes(clearTokenViejo)) { t = t.replace(clearTokenViejo, 'Eliminar la API key guardada'); cambios++; }

if (!cambios) { console.error("SIN CAMBIOS: marcadores no encontrados"); process.exit(1); }
fs.writeFileSync(archivo, t);
console.log("cambios aplicados:", cambios);
