import { requiredTrimmed } from "./validation.js";

// Validación de campos obligatorios por entidad, alineada con la interfaz.
// Lógica: un campo presente pero vacío o con solo espacios se rechaza
// (R01/R02). Un campo ausente se respeta (edición parcial o valores previos).

const CAMPOS = {
  community: ["name", "nif", "address", "city"],
  owner: ["name", "surname", "dni", "email", "phone", "address", "city"],
  property: ["plot", "propertyType", "address", "city"],
  tenant: ["name", "surname", "documentId", "phone", "email"],
};

const ETIQUETAS = {
  community: {
    name: "el nombre",
    nif: "el NIF",
    address: "la dirección",
    city: "la localidad",
  },
  owner: {
    name: "el nombre",
    surname: "los apellidos",
    dni: "el documento",
    email: "el email",
    phone: "el teléfono",
    address: "la dirección",
    city: "la localidad",
  },
  property: {
    plot: "el identificador del inmueble",
    propertyType: "el tipo de inmueble",
    address: "la dirección",
    city: "la localidad",
  },
  tenant: {
    name: "el nombre",
    surname: "los apellidos",
    documentId: "el documento",
    phone: "el teléfono",
    email: "el email",
  },
};

/** Rechaza valores vacíos o solo-espacios en campos que VENGAN en el payload
 * (no exige campos ausentes). Devuelve el mensaje o null. */
export function entityRequiredError(entity, data, { exigirAusentes = true } = {}) {
  const campos = CAMPOS[entity] || [];
  const aChequear = exigirAusentes ? campos : campos.filter((c) => data[c] !== undefined);
  const campo = requiredTrimmed(data, aChequear);
  if (!campo) return null;
  const etiqueta = ETIQUETAS[entity]?.[campo] || `el campo ${campo}`;
  const causa =
    data[campo] === undefined ? "obligatorio" : "no puede estar vacío o ser solo espacios";
  return `Indicá ${etiqueta} (${causa}).`;
}

/** Normaliza con trim los campos de texto presentes. */
export function trimEntityFields(entity, data) {
  for (const campo of CAMPOS[entity] || []) {
    if (typeof data[campo] === "string") data[campo] = data[campo].trim();
  }
  return data;
}
