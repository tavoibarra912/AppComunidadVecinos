// Canales del art. 9 LPH. Se guardan como lista separada por comas para no
// cambiar el esquema existente y seguir aceptando los valores antiguos.
export const NOTIFICATION_CHANNELS = Object.freeze(["email", "postal", "phone"]);

export const NOTIFICATION_CHANNEL_LABELS = Object.freeze({
  email: "Correo electrónico",
  postal: "Domicilio postal",
  phone: "Teléfono / Mensajería",
});

// Los datos antiguos podían guardar el canal concreto de mensajería. El campo
// «Teléfono / Mensajería» los representa a ambos.
const ALIASES = Object.freeze({ sms: "phone", whatsapp: "phone" });

function rawValues(value) {
  if (Array.isArray(value)) return value.flatMap(rawValues);
  if (value === null || value === undefined) return [];
  return String(value).split(/[,;]+/);
}

/** Canales válidos, sin duplicados y en el orden estable de la interfaz. */
export function parseNotificationChannels(value) {
  const selected = new Set();
  for (const raw of rawValues(value)) {
    const key = String(raw).trim().toLowerCase();
    const channel = ALIASES[key] || key;
    if (NOTIFICATION_CHANNELS.includes(channel)) selected.add(channel);
  }
  return NOTIFICATION_CHANNELS.filter((channel) => selected.has(channel));
}

/** Valor persistido: lista canónica separada por comas (o cadena vacía). */
export function serializeNotificationChannels(value) {
  return parseNotificationChannels(value).join(",");
}

/** Texto legible para fichas, exportaciones y resúmenes. */
export function notificationChannelsLabel(value) {
  return parseNotificationChannels(value)
    .map((channel) => NOTIFICATION_CHANNEL_LABELS[channel])
    .join(" · ");
}

/**
 * Aplica las reglas del canal preferente: el domicilio postal siempre está
 * disponible; email y teléfono solo si su contacto está verificado. Si no
 * queda ninguno, se conserva el valor de respaldo y, en último término, postal.
 */
export function normalizeNotificationPreference(
  value,
  { emailVerified = false, phoneVerified = false, fallback = "email" } = {},
) {
  const allowed = new Set(["postal"]);
  if (emailVerified) allowed.add("email");
  if (phoneVerified) allowed.add("phone");
  let channels = parseNotificationChannels(value).filter((channel) => allowed.has(channel));
  if (!channels.length)
    channels = parseNotificationChannels(fallback).filter((channel) => allowed.has(channel));
  if (!channels.length) channels = ["postal"];
  return channels.join(",");
}

/** Autorización de comunicaciones comunitarias del inquilino. */
export function hasCommunityCommunications(value) {
  if (Array.isArray(value)) return value.includes("community_communications");
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) && parsed.includes("community_communications");
  } catch {
    return false;
  }
}
