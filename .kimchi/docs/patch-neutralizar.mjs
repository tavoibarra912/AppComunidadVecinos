import fs from "node:fs";

const archivo = "public/js/features/communication.js";
let t = fs.readFileSync(archivo, "utf8");
let cambios = 0;
const sustituir = (viejo, nuevo) => {
  if (t.includes(viejo)) { t = t.split(viejo).join(nuevo); cambios++; }
};

// Descripción genérica del canal de correo
sustituir(
  "Elegí Brevo (solo la API key, envío por la API v3) o un SMTP genérico propio. Con Brevo no hace falta configurar servidor.",
  "Configurá el envío de correos con tu proveedor: por API (solo la API key) o mediante un servidor SMTP propio.",
);
sustituir("Brevo (API, solo API key)", "API del proveedor (solo API key)");
sustituir("SMTP genérico (servidor propio)", "SMTP propio");
sustituir(
  "API key / Contraseña (ya guardada)",
  "Credencial (ya guardada)",
);
sustituir("API key de Brevo o contraseña SMTP", "API key o contraseña del proveedor");

// Títulos y descripciones sin marcas
sustituir(' · Twilio</h3>', "</h3>");
sustituir(
  "Envío de mensajes de texto vía Twilio o Brevo (clave API de https://app.brevo.com/settings/keys/api).",
  "Envío de mensajes de texto con tu proveedor de mensajería.",
);
sustituir(
  "Envío vía Twilio (plantilla con variable {{1}}) o Brevo (texto; el primer mensaje a un contacto requiere plantilla aprobada en Brevo).",
  "Envío de mensajes de WhatsApp con tu proveedor. Según el proveedor puede requerirse una plantilla aprobada para el primer mensaje.",
);

// Etiquetas de campos sin marcas
sustituir('"Account SID (Twilio)"', '"Account SID"');
sustituir('"API key (Brevo) o Auth Token (Twilio)"', '"API key o Auth Token"');
sustituir('"Número emisor (Twilio) o remitente (Brevo)"', '"Número o remitente emisor"');
sustituir('"Content SID (Twilio) o ID de plantilla numérico (Brevo)"', '"Content SID o ID de plantilla"');
sustituir('"API key de Brevo (ya guardada)"', '"Credencial (ya guardada)"');

fs.writeFileSync(archivo, t);
console.log("sustituciones:", cambios);
// Lo que queda (backend/labels dinámicos):
const resto = [...t.matchAll(/Twilio|Brevo/g)].length;
console.log("menciones restantes en la línea del template:", resto);
