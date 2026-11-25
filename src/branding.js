import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const FONT_STACKS = Object.freeze({
  inter:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  georgia: 'Georgia, "Times New Roman", serif',
});

export const FONT_FALLBACKS = Object.freeze({
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
});

export const MAX_CUSTOM_FONTS = 4;
const MAX_FONT_BYTES = 250_000;
const CUSTOM_FONT_ID = /^custom-[a-z0-9][a-z0-9-]{7,40}$/;
const FONT_NAME = /^[\p{L}\p{N} .,'&()_-]{1,60}$/u;
const FONT_DATA_URL = /^data:(font\/(?:woff2|woff|ttf|otf));base64,([A-Za-z0-9+/]+={0,2})$/;

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
  tipografiaTitulos: "inter",
  tipografiaBotones: "inter",
  tipografias: Object.freeze([]),
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

/** Valida y canonicaliza un archivo de fuente embebido como data URL. */
function fontFile(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > 400_000) return null;
  const match = FONT_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_FONT_BYTES) return null;
  const mime = match[1];
  const signature = bytes.subarray(0, 4).toString("latin1");
  const hex = bytes.subarray(0, 4).toString("hex");
  const valid =
    (mime === "font/woff2" && signature === "wOF2") ||
    (mime === "font/woff" && signature === "wOFF") ||
    (mime === "font/otf" && signature === "OTTO") ||
    (mime === "font/ttf" && (hex === "00010000" || signature === "true" || signature === "ttcf"));
  if (!valid) return null;
  return {
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    format: mime === "font/ttf" ? "truetype" : mime === "font/otf" ? "opentype" : mime.slice(5),
  };
}

function normalizeCustomFonts(value) {
  if (!Array.isArray(value)) return [];
  const fonts = [];
  const ids = new Set();
  const names = new Set();
  for (const font of value.slice(0, MAX_CUSTOM_FONTS)) {
    if (!font || typeof font !== "object" || Array.isArray(font)) continue;
    const id = typeof font.id === "string" ? font.id.trim() : "";
    const nombre = typeof font.nombre === "string" ? font.nombre.trim() : "";
    const respaldo = Object.hasOwn(FONT_FALLBACKS, font.respaldo) ? font.respaldo : "";
    if (!CUSTOM_FONT_ID.test(id) || !FONT_NAME.test(nombre) || !respaldo) continue;
    const nameKey = nombre.toLowerCase();
    if (ids.has(id) || names.has(nameKey)) continue;
    const file = fontFile(font.dataUrl);
    ids.add(id);
    names.add(nameKey);
    fonts.push({ id, nombre, respaldo, ...(file ? { dataUrl: file.dataUrl } : {}) });
  }
  return fonts;
}

export function brandOf(settings = {}) {
  const marca = settings.marca || {};
  const tipografias = normalizeCustomFonts(marca.tipografias);
  const fontIds = new Set([...Object.keys(FONT_STACKS), ...tipografias.map((font) => font.id)]);
  const tipografia = fontIds.has(marca.tipografia) ? marca.tipografia : DEFAULT_BRAND.tipografia;
  const pick = (value) => (fontIds.has(value) ? value : tipografia);
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
    tipografia,
    tipografiaTitulos: pick(marca.tipografiaTitulos),
    tipografiaBotones: pick(marca.tipografiaBotones),
    tipografias,
    tamanoBase: numberOr(marca.tamanoBase, DEFAULT_BRAND.tamanoBase, 12, 18),
    radioBordes: numberOr(marca.radioBordes, DEFAULT_BRAND.radioBordes, 0, 16),
    densidad: TEXT_DENSITIES.includes(marca.densidad) ? marca.densidad : DEFAULT_BRAND.densidad,
  };
}

export function validateBrand(marca) {
  if (marca === undefined || marca === null) return null;
  if (typeof marca !== "object" || Array.isArray(marca)) return "El bloque de marca no es válido.";
  if (
    marca.nombre !== undefined &&
    (typeof marca.nombre !== "string" || !marca.nombre.trim() || marca.nombre.trim().length > 120)
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
  if (marca.tipografias !== undefined) {
    if (!Array.isArray(marca.tipografias)) return "Las tipografías añadidas no son válidas.";
    if (marca.tipografias.length > MAX_CUSTOM_FONTS)
      return `Puedes añadir como máximo ${MAX_CUSTOM_FONTS} tipografías.`;
    const ids = new Set();
    const names = new Set();
    for (const [index, font] of marca.tipografias.entries()) {
      if (!font || typeof font !== "object" || Array.isArray(font))
        return `La tipografía añadida ${index + 1} no es válida.`;
      if (typeof font.id !== "string" || !CUSTOM_FONT_ID.test(font.id))
        return `El identificador de la tipografía ${index + 1} no es válido.`;
      if (ids.has(font.id)) return "Hay tipografías añadidas con el mismo identificador.";
      if (typeof font.nombre !== "string" || !FONT_NAME.test(font.nombre.trim()))
        return `El nombre de la tipografía ${index + 1} no es válido (máximo 60 caracteres).`;
      const nameKey = font.nombre.trim().toLowerCase();
      if (names.has(nameKey)) return "Hay tipografías añadidas con el mismo nombre.";
      if (!Object.hasOwn(FONT_FALLBACKS, font.respaldo))
        return `El respaldo de la tipografía ${index + 1} no es válido.`;
      if (font.dataUrl !== undefined && font.dataUrl !== "" && !fontFile(font.dataUrl))
        return `El archivo de la tipografía ${index + 1} no es válido (WOFF2, WOFF, TTF u OTF de hasta 250 KB).`;
      ids.add(font.id);
      names.add(nameKey);
    }
  }
  for (const [key, label] of [
    ["tipografia", "tipografía"],
    ["tipografiaTitulos", "tipografía de los títulos"],
    ["tipografiaBotones", "tipografía de los botones"],
  ])
    if (
      marca[key] !== undefined &&
      !Object.hasOwn(FONT_STACKS, marca[key]) &&
      !(typeof marca[key] === "string" && CUSTOM_FONT_ID.test(marca[key]))
    )
      return `La ${label} seleccionada no es válida.`;
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
      marca.logoDataUrl.length > 230_400 ||
      !LOGO.test(marca.logoDataUrl))
  )
    return "El logo debe ser una imagen PNG, JPG, SVG o WebP de menos de 225 KB.";
  return null;
}

export function brandStyle(brand = DEFAULT_BRAND) {
  const color = (key) => hexOr(brand[key], DEFAULT_BRAND[key]);
  const acento = color("colorAcento");
  const fonts = Array.isArray(brand.tipografias) ? brand.tipografias : [];
  const fontFamily = (id) => {
    const custom = fonts.find((font) => font && font.id === id);
    if (custom) {
      const safeId = CUSTOM_FONT_ID.test(custom.id) ? custom.id : "";
      if (!safeId) return FONT_STACKS.inter;
      const file = fontFile(custom.dataUrl);
      const fallback = FONT_FALLBACKS[custom.respaldo] || FONT_FALLBACKS.sans;
      const family = file
        ? `ACVFont-${safeId}`
        : `"${String(custom.nombre || "Tipografía").replace(/[^\p{L}\p{N} .,'&()_-]/gu, "")}"`;
      return `${family}, ${fallback}`;
    }
    return FONT_STACKS[id] || FONT_STACKS.inter;
  };
  const fontFaces = fonts
    .map((font) => {
      const file = fontFile(font?.dataUrl);
      if (!file || !CUSTOM_FONT_ID.test(font.id)) return "";
      return `@font-face{font-family:"ACVFont-${font.id}";src:url("${file.dataUrl}") format("${file.format}");font-display:swap}`;
    })
    .join("");
  const tipografia = fontFamily(brand.tipografia);
  const tipografiaTitulos = fontFamily(brand.tipografiaTitulos || brand.tipografia);
  const tipografiaBotones = fontFamily(brand.tipografiaBotones || brand.tipografia);
  const tamanoBase = numberOr(brand.tamanoBase, DEFAULT_BRAND.tamanoBase, 12, 18);
  const radioBordes = numberOr(brand.radioBordes, DEFAULT_BRAND.radioBordes, 0, 16);
  return `${fontFaces}:root:root{--nav:${color("colorPrimario")};--brand:${acento};--brand-dark:color-mix(in srgb,${acento} 80%,black);--canvas:${color("colorFondo")};--surface:${color("colorSuperficie")};--ink:${color("colorTexto")};--muted:${color("colorTextoSuave")};--line:${color("colorBorde")};--font-ui:${tipografia};--font-heading:${tipografiaTitulos};--font-button:${tipografiaBotones};--font-size-base:${tamanoBase}px;--radius:${radioBordes}px}`;
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
  const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
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
  const publicJson = JSON.stringify(publicSettingsOf(settings)).replace(/<\//g, "<\\/");
  return html
    .replace("__BRAND_JSON__", () => json)
    .replace("__PUBLIC_SETTINGS_JSON__", () => publicJson)
    .replace("__BRAND_STYLE__", () => brandStyle(brand))
    .replace("__BRAND_TITLE__", () => escapeHtml(brand.nombre));
}

const assetCache = new Map();

function assetHash(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cacheKey = `${filePath}:${stat.mtimeMs}:${stat.size}`;
    const cached = assetCache.get(cacheKey);
    if (cached) return cached;
    const data = fs.readFileSync(filePath);
    const hash = createHash("md5").update(data).digest("hex").slice(0, 8);
    assetCache.set(cacheKey, hash);
    return hash;
  } catch {
    return "";
  }
}

/**
 * Reemplaza las referencias a assets .js/.css del HTML servido por su URL con
 * hash de contenido (?v=<hash>). Así cada deploy cambia la URL del archivo y
 * el navegador descarga la versión nueva sin que el usuario necesite Ctrl+F5.
 * Se ignora cualquier ?v= previo puesto a mano.
 */
export function injectAssetVersions(html, baseDir) {
  return html.replace(/(?:src|href)=["']([^"']*)["']/gi, (match, attrPath) => {
    const base = attrPath.split("?")[0];
    if (!/\.(?:js|css)$/i.test(base)) return match;
    if (base.startsWith("http://") || base.startsWith("https://") || base.startsWith("//"))
      return match;
    const filePath = path.join(baseDir, base.replace(/^\//, ""));
    const hash = assetHash(filePath);
    if (!hash) return match;
    return match.replace(attrPath, `${base}?v=${hash}`);
  });
}

export function renderIndex(indexPath, settings) {
  let html = fs.readFileSync(indexPath, "utf8");
  html = injectAssetVersions(html, path.dirname(indexPath));
  return injectBranding(html, settings);
}
