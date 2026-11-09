import { getSettings } from "./db.js";
import { sendMessage } from "./delivery-providers.js";
import { textosActuales, aplicarPlantilla, nombrePlataforma } from "./textos-envio.js";

// Avisos por email de cambios en perfiles de propietarios.
// La lista de destinatarios se configura en Configuración → General
// («Email(s) para avisos de cambios», separados por comas). Vacío = apagado.

const CAMPOS_OWNER = [
  ["name", "Nombre"],
  ["surname", "Apellidos"],
  ["documentType", "Tipo de documento"],
  ["dni", "Documento"],
  ["isMember", "Es asociado"],
  ["phone", "Teléfono"],
  ["otherPhone", "Teléfono alternativo"],
  ["email", "Email"],
  ["address", "Dirección"],
  ["city", "Ciudad"],
  ["province", "Provincia"],
  ["postalCode", "Código postal"],
  ["iban", "IBAN"],
  ["currency", "Moneda"],
  ["notes", "Notas"],
];

export function emailsAvisosCambios() {
  return String(getSettings().avisosCambiosEmail || "")
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);
}

function valor(owner, campo) {
  const v = owner?.[campo];
  if (campo === "isMember") return v ? "sí" : "no";
  return String(v ?? "").trim();
}

/** Diff legible de los campos editables de un propietario. */
export function diffOwner(before, after) {
  const cambios = [];
  for (const [campo, etiqueta] of CAMPOS_OWNER) {
    const antes = valor(before, campo);
    const despues = valor(after, campo);
    if (antes !== despues)
      cambios.push(`• ${etiqueta}: "${antes || "—"}" → "${despues || "—"}"`);
  }
  return cambios;
}

/** Envía el aviso de cambio a los destinatarios configurados.
 *  No lanza: si el correo falla, se registra en el log del servidor. */
export async function avisarCambioOwner(before, after, actor) {
  const emails = emailsAvisosCambios();
  const cambios = diffOwner(before, after);
  if (!emails.length || !cambios.length) return false;
  const textos = textosActuales();
  const valores = {
    perfil: `${after.name || ""} ${after.surname || ""}`.trim() || "Propietario",
    usuario: actor?.usuario || "",
    comunidad: after.communityName || "",
    cambios: cambios.join("\n"),
    fecha: new Date().toLocaleString("es-ES"),
    plataforma: nombrePlataforma(),
  };
  const asunto = aplicarPlantilla(textos.cambioAsunto, valores);
  const cuerpo = aplicarPlantilla(textos.cambioCuerpo, valores);
  for (const email of emails) {
    try {
      await sendMessage("email", email, cuerpo, undefined, asunto);
    } catch (error) {
      console.error(`[avisos] no se pudo notificar el cambio a ${email}:`, error.message);
    }
  }
  return true;
}

