import { getSettings } from "./db.js";
import { aplicarPlantilla, textosDe } from "../public/js/textos-envio.js";

export { aplicarPlantilla, textosDe, TEXTOS_DEFECTO } from "../public/js/textos-envio.js";

export function textosActuales() {
  return textosDe(getSettings());
}

export function nombrePlataforma() {
  return getSettings().marca?.nombre || "la plataforma";
}
