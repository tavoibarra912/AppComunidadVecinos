export const validEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
      (typeof data[key] !== "string" ||
        !/^[6-9]\d{8}$/.test(data[key].replace(/[\s()-]/g, "")))
    )
      return "El teléfono debe tener 9 dígitos y comenzar por 6, 7, 8 o 9.";
  }
  if (data.postalCode && !/^\d{5}$/.test(data.postalCode))
    return "El código postal debe tener 5 dígitos.";
  return null;
}
export function dateError(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return true;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
  );
}
