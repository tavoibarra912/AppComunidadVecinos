import { requiredTrimmed } from "./validation.js";

// Validación de campos obligatorios por entidad, alineada con la interfaz.
// Las altas validan todos los obligatorios. Las ediciones parciales deben
// fusionarse con el registro existente antes de validar el resultado completo.

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

/** Rechaza campos obligatorios ausentes, vacíos o con solo espacios. */
export function entityRequiredError(entity, data) {
  const campos = CAMPOS[entity] || [];
  const campo = requiredTrimmed(data, campos);
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
