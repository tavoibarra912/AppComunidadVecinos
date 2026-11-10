import fs from "node:fs";

export const FONT_STACKS = Object.freeze({
  inter:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
});

export const TEXT_DENSITIES = Object.freeze(["compacta", "normal", "amplia"]);

export const DEFAULT_BRAND = Object.freeze({
  nombre: "Peñarrubia",
  colorPrimario: "#11273e",
  colorAcento: "#198b84",
  logoDataUrl: "",
  colorFondo: "#f7f9fb",
  colorSuperficie: "#ffffff",
  colorTexto: "#17212b",
  colorTextoSuave: "#64748b",
  colorBorde: "#e4e9ef",
  tipografia: "inter",
  tamanoBase: 14,
  radioBordes: 5,
  densidad: "normal",
});

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|svg\+xml|webp);base64,/;

function hexOr(value, fallback) {
  return HEX.test(value || "") ? value : fallback;
}

function numberOr(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function brandOf(settings = {}) {
  const marca = settings.marca || {};
  return {
    nombre:
      typeof marca.nombre === "string" && marca.nombre.trim()
        ? marca.nombre.trim().slice(0, 120)
        : DEFAULT_BRAND.nombre,
    colorPrimario: hexOr(marca.colorPrimario, DEFAULT_BRAND.colorPrimario),
    colorAcento: hexOr(marca.colorAcento, DEFAULT_BRAND.colorAcento),
    logoDataUrl: LOGO.test(marca.logoDataUrl || "") ? marca.logoDataUrl : "",
    colorFondo: hexOr(marca.colorFondo, DEFAULT_BRAND.colorFondo),
    colorSuperficie: hexOr(marca.colorSuperficie, DEFAULT_BRAND.colorSuperficie),
    colorTexto: hexOr(marca.colorTexto, DEFAULT_BRAND.colorTexto),
    colorTextoSuave: hexOr(marca.colorTextoSuave, DEFAULT_BRAND.colorTextoSuave),
    colorBorde: hexOr(marca.colorBorde, DEFAULT_BRAND.colorBorde),
    tipografia: Object.hasOwn(FONT_STACKS, marca.tipografia)
      ? marca.tipografia
      : DEFAULT_BRAND.tipografia,
    tamanoBase: numberOr(marca.tamanoBase, DEFAULT_BRAND.tamanoBase, 12, 18),
    radioBordes: numberOr(marca.radioBordes, DEFAULT_BRAND.radioBordes, 0, 16),
    densidad: TEXT_DENSITIES.includes(marca.densidad)
      ? marca.densidad
      : DEFAULT_BRAND.densidad,
  };
}

export function validateBrand(marca) {
  if (marca === undefined || marca === null) return null;
  if (typeof marca !== "object" || Array.isArray(marca))
    return "El bloque de marca no es válido.";
  if (
    marca.nombre !== undefined &&
    (typeof marca.nombre !== "string" ||
      !marca.nombre.trim() ||
      marca.nombre.trim().length > 120)
  )
    return "El nombre de marca debe tener entre 1 y 120 caracteres.";
  if (marca.colorPrimario !== undefined && !HEX.test(marca.colorPrimario))
    return "El color principal debe ser un valor hexadecimal (#RRGGBB).";
  if (marca.colorAcento !== undefined && !HEX.test(marca.colorAcento))
    return "El color de acento debe ser un valor hexadecimal (#RRGGBB).";
  for (const [key, label] of [
    ["colorFondo", "fondo general"],
    ["colorSuperficie", "superficies"],
    ["colorTexto", "texto"],
    ["colorTextoSuave", "texto secundario"],
    ["colorBorde", "bordes"],
  ])
    if (marca[key] !== undefined && !HEX.test(marca[key]))
      return `El color de ${label} debe ser un valor hexadecimal (#RRGGBB).`;
  if (
    marca.tipografia !== undefined &&
    !Object.hasOwn(FONT_STACKS, marca.tipografia)
  )
    return "La tipografía seleccionada no es válida.";
  if (
    marca.tamanoBase !== undefined &&
    (!Number.isFinite(Number(marca.tamanoBase)) ||
      Number(marca.tamanoBase) < 12 ||
      Number(marca.tamanoBase) > 18)
  )
    return "El tamaño base del texto debe estar entre 12 y 18 px.";
  if (
    marca.radioBordes !== undefined &&
    (!Number.isFinite(Number(marca.radioBordes)) ||
      Number(marca.radioBordes) < 0 ||
      Number(marca.radioBordes) > 16)
  )
    return "El radio de bordes debe estar entre 0 y 16 px.";
  if (marca.densidad !== undefined && !TEXT_DENSITIES.includes(marca.densidad))
    return "La densidad seleccionada no es válida.";
  if (
    marca.logoDataUrl !== undefined &&
    marca.logoDataUrl !== "" &&
    (typeof marca.logoDataUrl !== "string" ||
      marca.logoDataUrl.length > 300_000 ||
      !LOGO.test(marca.logoDataUrl))
  )
    return "El logo debe ser una imagen PNG, JPG, SVG o WebP de menos de 225 KB.";
  return null;
}

export function brandStyle(brand = DEFAULT_BRAND) {
  const color = (key) => hexOr(brand[key], DEFAULT_BRAND[key]);
  const acento = color("colorAcento");
  const tipografia = Object.hasOwn(FONT_STACKS, brand.tipografia)
    ? FONT_STACKS[brand.tipografia]
    : FONT_STACKS.inter;
  const tamanoBase = numberOr(
    brand.tamanoBase,
    DEFAULT_BRAND.tamanoBase,
    12,
    18,
  );
  const radioBordes = numberOr(
    brand.radioBordes,
    DEFAULT_BRAND.radioBordes,
    0,
    16,
  );
  return `:root:root{--nav:${color("colorPrimario")};--brand:${acento};--brand-dark:color-mix(in srgb,${acento} 80%,black);--canvas:${color("colorFondo")};--surface:${color("colorSuperficie")};--ink:${color("colorTexto")};--muted:${color("colorTextoSuave")};--line:${color("colorBorde")};--font-ui:${tipografia};--font-size-base:${tamanoBase}px;--radius:${radioBordes}px}`;
}

const PUBLIC_FALLBACK = Object.freeze({
  nombreAsociacion: "",
  emailContacto: "",
  telefonoContacto: "",
  permitirRegistro: true,
  permitirRecuperacion: true,
  mantenimiento: false,
  mensajeMantenimiento: "",
});

export function publicSettingsOf(settings = {}) {
  const text = (value, max) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  return {
    nombreAsociacion: text(settings.nombreAsociacion, 120),
    emailContacto: text(settings.emailContacto, 120),
    telefonoContacto: text(settings.telefonoContacto, 20),
    permitirRegistro: settings.permitirRegistro !== false,
    permitirRecuperacion: settings.permitirRecuperacion !== false,
    mantenimiento: settings.mantenimiento === true,
    mensajeMantenimiento: text(settings.mensajeMantenimiento, 300),
  };
}

export { PUBLIC_FALLBACK };

/**
 * Inyecta la marca y los ajustes públicos en el HTML servido. No es un
 * endpoint: la página trae su propia configuración, así también el login
 * (sin sesión) se renderiza personalizado.
 * El JSON va en un bloque <script type="application/json"> (no ejecutable: la
 * CSP con script-src 'self' lo acepta) y los colores en un <style> (la CSP ya
 * permite estilos inline).
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function injectBranding(html, settings) {
  const brand = brandOf(settings);
  const json = JSON.stringify(brand).replace(/<\//g, "<\\/");
  const publicJson = JSON.stringify(publicSettingsOf(settings)).replace(
    /<\//g,
    "<\\/",
  );
  return html
    .replace("__BRAND_JSON__", () => json)
    .replace("__PUBLIC_SETTINGS_JSON__", () => publicJson)
    .replace("__BRAND_STYLE__", () => brandStyle(brand))
    .replace("__BRAND_TITLE__", () => escapeHtml(brand.nombre));
}

export function renderIndex(indexPath, settings) {
  return injectBranding(fs.readFileSync(indexPath, "utf8"), settings);
}
