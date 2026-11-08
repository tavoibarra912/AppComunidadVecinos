import fs from "node:fs";

export const DEFAULT_BRAND = Object.freeze({
  nombre: "Peñarrubia",
  colorPrimario: "#11273e",
  colorAcento: "#198b84",
  logoDataUrl: "",
});

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|svg\+xml|webp);base64,/;

export function brandOf(settings = {}) {
  const marca = settings.marca || {};
  return {
    nombre: typeof marca.nombre === "string" && marca.nombre.trim() ? marca.nombre.trim().slice(0, 120) : DEFAULT_BRAND.nombre,
    colorPrimario: HEX.test(marca.colorPrimario || "") ? marca.colorPrimario : DEFAULT_BRAND.colorPrimario,
    colorAcento: HEX.test(marca.colorAcento || "") ? marca.colorAcento : DEFAULT_BRAND.colorAcento,
    logoDataUrl: LOGO.test(marca.logoDataUrl || "") ? marca.logoDataUrl : "",
  };
}

export function validateBrand(marca) {
  if (marca === undefined || marca === null) return null;
  if (typeof marca !== "object" || Array.isArray(marca)) return "El bloque de marca no es válido.";
  if (marca.nombre !== undefined && (typeof marca.nombre !== "string" || !marca.nombre.trim() || marca.nombre.trim().length > 120)) return "El nombre de marca debe tener entre 1 y 120 caracteres.";
  if (marca.colorPrimario !== undefined && !HEX.test(marca.colorPrimario)) return "El color principal debe ser un valor hexadecimal (#RRGGBB).";
  if (marca.colorAcento !== undefined && !HEX.test(marca.colorAcento)) return "El color de acento debe ser un valor hexadecimal (#RRGGBB).";
  if (marca.logoDataUrl !== undefined && marca.logoDataUrl !== "" && (typeof marca.logoDataUrl !== "string" || marca.logoDataUrl.length > 300_000 || !LOGO.test(marca.logoDataUrl))) return "El logo debe ser una imagen PNG, JPG, SVG o WebP de menos de 225 KB.";
  return null;
}

export function brandStyle(brand) {
  return `:root{--nav:${brand.colorPrimario};--brand:${brand.colorAcento};--brand-dark:color-mix(in srgb,${brand.colorAcento} 80%,black)}`;
}

/**
 * Inyecta la marca en el HTML servido. No es un endpoint: la página trae su
 * propia marca, así también el login (sin sesión) se renderiza personalizado.
 * El JSON va en un bloque <script type="application/json"> (no ejecutable: la
 * CSP con script-src 'self' lo acepta) y los colores en un <style> (la CSP ya
 * permite estilos inline).
 */
export function injectBranding(html, settings) {
  const brand = brandOf(settings);
  const json = JSON.stringify(brand).replace(/<\//g, "<\\/");
  return html
    .replace("__BRAND_JSON__", () => json)
    .replace("__BRAND_STYLE__", () => brandStyle(brand));
}

export function renderIndex(indexPath, settings) {
  return injectBranding(fs.readFileSync(indexPath, "utf8"), settings);
}
