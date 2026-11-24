/**
 * Reglas de interfaz del autoservicio del propietario. El servidor ya limita
 * los campos editables; estas funciones evitan que la pantalla ofrezca una
 * edición que no se persistirá o confirme un cambio de titularidad inexistente.
 */
export function ownerPropertyEditingLocked({ readOnly = false, activeRole = "" } = {}) {
  return readOnly || activeRole === "owner";
}

/** Compara identificadores y porcentajes de titularidad del editor. */
export function ownershipChanged({
  originalIds = [],
  currentIds = [],
  originalPercentages = {},
  currentPercentages = {},
} = {}) {
  const before = [...new Set(originalIds)].sort();
  const after = [...new Set(currentIds)].sort();
  if (before.length !== after.length || before.some((id, index) => id !== after[index]))
    return true;
  return after.some((id) => {
    const previous = Number(originalPercentages[id] ?? 100);
    const current = Number(currentPercentages[id] ?? 100);
    return (
      !Number.isFinite(previous) ||
      !Number.isFinite(current) ||
      Math.abs(previous - current) > 0.0001
    );
  });
}

export function ownerSavedMessage({ isEditing, isOwner }) {
  if (!isEditing) return "Propietario creado.";
  return isOwner ? "Datos personales actualizados." : "Propietario actualizado.";
}
