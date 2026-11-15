import {
  isValidCommunityNif,
  isValidIdentityDocument,
  normalizeIdentityDocument,
  digitsIban,
  isValidIban,
} from "../public/js/utils.js";

export { normalizeIdentityDocument };

export const validEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function identityDocumentError(value, documentType = "DNI") {
  if (!value) return "El documento de identidad es obligatorio.";
  if (!isValidIdentityDocument(value, documentType))
    return `El ${String(documentType || "DNI").toUpperCase()} no es válido según el formato y el dígito de control oficial de España.`;
  return null;
}

export function communityNifError(value) {
  if (!value) return "El NIF de la comunidad es obligatorio.";
  if (!isValidCommunityNif(value))
    return "El NIF de la comunidad debe ser un CIF válido con formato H + 7 dígitos + dígito de control numérico (por ejemplo, H12345674).";
  return null;
}

/**
 * Devuelve el primer campo requerido que falte, venga vacío o sean solo
 * espacios, normalizando el texto con trim. Usado por las rutas para no
 * persistir datos incompletos que la interfaz sí exige.
 */
export function requiredTrimmed(data, campos) {
  for (const campo of campos) {
    const valor = data[campo];
    if (valor === undefined || valor === null || String(valor).trim() === "") return campo;
  }
  return null;
}
export function passwordError(value) {
  return typeof value !== "string" || value.length < 8 || value.length > 128
    ? "La contraseña debe tener entre 8 y 128 caracteres."
    : null;
}
export function contactError(data) {
  if (data.email && !validEmail(data.email)) return "El email no es válido.";
  for (const key of ["phone", "otherPhone", "emergencyPhone"]) {
    if (
      data[key] &&
      (typeof data[key] !== "string" || !/^[6-9]\d{8}$/.test(data[key].replace(/[\s()-]/g, "")))
    )
      return "El teléfono debe tener 9 dígitos y comenzar por 6, 7, 8 o 9.";
  }
  if (data.postalCode && !/^\d{5}$/.test(data.postalCode))
    return "El código postal debe tener 5 dígitos.";
  return null;
}
/** El mismo formato español y MOD-97 que valida el formulario. Vacío es opcional. */
export function bankAccountError(data) {
  if (data.iban === undefined) return null;
  if (typeof data.iban !== "string") return "El IBAN debe ser texto.";
  const normalized = digitsIban(data.iban);
  if (!isValidIban(normalized))
    return "El IBAN no es válido. Comprueba el formato y los dígitos de control.";
  data.iban = normalized;
  return null;
}
export function communityFinanceError(data, year = new Date().getFullYear()) {
  for (const key of ["constitutionYear", "reserveFund"])
    if (data[key] != null && !["string", "number"].includes(typeof data[key]))
      return "El año y el fondo de reserva deben ser valores numéricos válidos.";
  const constitution = String(data.constitutionYear ?? "").trim();
  if (
    constitution &&
    (!/^\d{4}$/.test(constitution) || Number(constitution) < 1000 || Number(constitution) > year)
  )
    return `El año de constitución debe estar entre 1000 y ${year}.`;
  const reserve = String(data.reserveFund ?? "").trim();
  if (reserve && !/^\d{1,12}(\.\d{1,2})?$/.test(reserve))
    return "El fondo de reserva debe ser un importe positivo o cero, con hasta dos decimales.";
  return null;
}
export function dateError(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value;
}
