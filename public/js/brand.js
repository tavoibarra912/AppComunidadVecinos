// Marca (white-label): aplica nombre, colores, tipografía y logo embebidos por
// el server en el propio index.html (#brand-json + #brand-vars). No es un
// endpoint: la página llega ya personalizada, incluida la pantalla de login.

const FONT_STACKS = {
  inter:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  georgia: 'Georgia, "Times New Roman", serif',
};

const FONT_FALLBACKS = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
};
const MAX_CUSTOM_FONTS = 4;
const CUSTOM_FONT_ID = /^custom-[a-z0-9][a-z0-9-]{7,40}$/;
const FONT_NAME = /^[\p{L}\p{N} .,'&()_-]{1,60}$/u;
const FONT_DATA_URL = /^data:font\/(woff2|woff|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/;
const DENSITIES = ["compacta", "normal", "amplia"];
const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK = {
  nombre: "Gestión de Comunidades",
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
  tipografias: [],
  tamanoBase: 14,
  escalaLogo: 100,
  radioBordes: 5,
  densidad: "normal",
};
const PUBLIC_FALLBACK = {
  nombreAsociacion: "",
  emailContacto: "",
  telefonoContacto: "",
  permitirRegistro: true,
  permitirRecuperacion: true,
  mantenimiento: false,
  mensajeMantenimiento: "",
};

const hexOr = (value, fallback) => (HEX.test(value || "") ? value : fallback);
const numberOr = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

function fontFileInfo(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > 400_000) return null;
  const match = /^data:(font\/(woff2|woff|ttf|otf));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  return {
    dataUrl,
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
    const file = fontFileInfo(font.dataUrl);
    ids.add(id);
    names.add(nameKey);
    fonts.push({ id, nombre, respaldo, ...(file ? { dataUrl: file.dataUrl } : {}) });
  }
  return fonts;
}

export function readInjectedBrand() {
  try {
    const data = JSON.parse(document.getElementById("brand-json")?.textContent || "{}");
    return { ...FALLBACK, ...data };
  } catch {
    return { ...FALLBACK };
  }
}

export function readInjectedPublicSettings() {
  try {
    const data = JSON.parse(document.getElementById("public-settings-json")?.textContent || "{}");
    return { ...PUBLIC_FALLBACK, ...data };
  } catch {
    return { ...PUBLIC_FALLBACK };
  }
}

export function brandStyle(brand = FALLBACK) {
  const color = (key) => hexOr(brand[key], FALLBACK[key]);
  const acento = color("colorAcento");
  const fonts = Array.isArray(brand.tipografias) ? brand.tipografias : [];
  const fontFamily = (id) => {
    const custom = fonts.find((font) => font && font.id === id);
    if (custom) {
      const safeId = CUSTOM_FONT_ID.test(custom.id) ? custom.id : "";
      if (!safeId) return FONT_STACKS.inter;
      const file = fontFileInfo(custom.dataUrl);
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
      const file = fontFileInfo(font?.dataUrl);
      if (!file || !CUSTOM_FONT_ID.test(font.id)) return "";
      return `@font-face{font-family:"ACVFont-${font.id}";src:url("${file.dataUrl}") format("${file.format}");font-display:swap}`;
    })
    .join("");
  const tipografia = fontFamily(brand.tipografia);
  const tipografiaTitulos = fontFamily(brand.tipografiaTitulos || brand.tipografia);
  const tipografiaBotones = fontFamily(brand.tipografiaBotones || brand.tipografia);
  const tamanoBase = numberOr(brand.tamanoBase, FALLBACK.tamanoBase, 12, 18);
  const escalaLogo = numberOr(brand.escalaLogo, FALLBACK.escalaLogo, 100, 300) / 100;
  const radioBordes = numberOr(brand.radioBordes, FALLBACK.radioBordes, 0, 16);
  return `${fontFaces}:root:root{--nav:${color("colorPrimario")};--brand:${acento};--brand-dark:color-mix(in srgb,${acento} 80%,black);--canvas:${color("colorFondo")};--surface:${color("colorSuperficie")};--ink:${color("colorTexto")};--muted:${color("colorTextoSuave")};--line:${color("colorBorde")};--font-ui:${tipografia};--font-heading:${tipografiaTitulos};--font-button:${tipografiaBotones};--font-size-base:${tamanoBase}px;--logo-scale:${escalaLogo};--radius:${radioBordes}px}`;
}

function setBrandText(root, name) {
  if (!root) return;
  const textNode = [...root.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (textNode) textNode.textContent = name;
}

function setLogo(id, url) {
  const img = document.getElementById(id);
  if (!img) return;
  // El logo siempre está disponible: si no hay uno configurado se usa el
  // logo por defecto de la marca (casita de la app). Eso mantiene la
  // identidad visual y el área clickeable en el topbar.
  img.src = url || "logo-default.svg";
  img.hidden = false;
}

export function applyBrand(brand = readInjectedBrand()) {
  const name = (brand.nombre || FALLBACK.nombre).trim() || FALLBACK.nombre;
  const tipografias = normalizeCustomFonts(brand.tipografias);
  const fontIds = new Set([...Object.keys(FONT_STACKS), ...tipografias.map((font) => font.id)]);
  const tipografia = fontIds.has(brand.tipografia) ? brand.tipografia : "inter";
  const pickFont = (value) => (fontIds.has(value) ? value : tipografia);
  const normalized = {
    ...brand,
    nombre: name,
    colorPrimario: hexOr(brand.colorPrimario, FALLBACK.colorPrimario),
    colorAcento: hexOr(brand.colorAcento, FALLBACK.colorAcento),
    colorFondo: hexOr(brand.colorFondo, FALLBACK.colorFondo),
    colorSuperficie: hexOr(brand.colorSuperficie, FALLBACK.colorSuperficie),
    colorTexto: hexOr(brand.colorTexto, FALLBACK.colorTexto),
    colorTextoSuave: hexOr(brand.colorTextoSuave, FALLBACK.colorTextoSuave),
    colorBorde: hexOr(brand.colorBorde, FALLBACK.colorBorde),
    tipografia,
    tipografiaTitulos: pickFont(brand.tipografiaTitulos),
    tipografiaBotones: pickFont(brand.tipografiaBotones),
    tipografias,
    tamanoBase: numberOr(brand.tamanoBase, FALLBACK.tamanoBase, 12, 18),
    escalaLogo: numberOr(brand.escalaLogo, FALLBACK.escalaLogo, 100, 300),
    radioBordes: numberOr(brand.radioBordes, FALLBACK.radioBordes, 0, 16),
    densidad: DENSITIES.includes(brand.densidad) ? brand.densidad : "normal",
  };
  const style = document.getElementById("brand-vars");
  if (style) style.textContent = brandStyle(normalized);
  if (document.body) document.body.dataset.density = normalized.densidad;
  setBrandText(document.querySelector(".brand"), name);
  setBrandText(document.querySelector(".login-brand"), name);
  document.title = name;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", "Gestión de comunidades, propietarios, inmuebles e inquilinos");
  const greet = document.querySelector("#home-greeting-title");
  if (greet) greet.textContent = `Bienvenido a ${name}`;
  const topBrand = document.querySelector(".brand");
  if (topBrand) topBrand.setAttribute("aria-label", `Inicio de ${name}`);
  setLogo("topbar-brand-logo", normalized.logoDataUrl);
  setLogo("login-brand-logo", normalized.logoDataUrl);
  return normalized;
}

export function applyPublicSettings(settings = readInjectedPublicSettings()) {
  const data = { ...PUBLIC_FALLBACK, ...settings };
  const signup = document.getElementById("login-open-signup");
  if (signup) signup.hidden = !data.permitirRegistro;
  const signupView = document.getElementById("login-view-signup");
  if (signupView && !data.permitirRegistro) signupView.hidden = true;
  const forgot = document.getElementById("login-open-forgot");
  if (forgot) forgot.hidden = !data.permitirRecuperacion;
  const notice = document.getElementById("login-maintenance-notice");
  if (notice) {
    notice.hidden = !data.mantenimiento;
    notice.textContent = data.mantenimiento
      ? data.mensajeMantenimiento ||
        "La plataforma está en mantenimiento. Vuelve a intentar en unos minutos."
      : "";
  }
  const contact = document.getElementById("login-contact-info");
  if (contact) {
    const parts = [];
    if (data.nombreAsociacion) parts.push(data.nombreAsociacion);
    if (data.emailContacto) parts.push(data.emailContacto);
    if (data.telefonoContacto) parts.push(data.telefonoContacto);
    contact.textContent = parts.join(" · ");
    contact.hidden = !parts.length;
  }
  return data;
}

const COMMUNITY_STYLE_KEYS = [
  "colorPrimario",
  "colorAcento",
  "colorFondo",
  "colorSuperficie",
  "colorTexto",
  "colorTextoSuave",
  "colorBorde",
  "tipografia",
  "tipografiaTitulos",
  "tipografiaBotones",
  "tipografias",
  "tamanoBase",
  "radioBordes",
  "densidad",
];

export function getSingleCommunityBrandOverride(state) {
  if (!state?.currentUserId) return null;
  const communities = state.communities || [];
  if (communities.length !== 1) return null;
  const community = communities[0];
  if (!community) return null;
  const override = {};
  const marca = community.marca && typeof community.marca === "object" ? community.marca : {};
  for (const key of COMMUNITY_STYLE_KEYS) {
    const value = marca[key];
    if (value !== undefined && value !== null && value !== "") override[key] = value;
  }
  const logoDataUrl = community.logoDataUrl || "";
  // La comunidad aporta logo y estilo, pero no cambia el nombre de la app.
  if (logoDataUrl) override.logoDataUrl = logoDataUrl;
  if (!Object.keys(override).length) return null;
  return override;
}

export function effectiveBrand(brand, state) {
  const base = brand || readInjectedBrand();
  const override = getSingleCommunityBrandOverride(state);
  if (!override) return base;
  const patch = { ...override };
  // El nombre vacío no debe reemplazar a la marca global.
  if (!patch.nombre) delete patch.nombre;
  // Un logo vacío tampoco: mantiene el logo por defecto de la plataforma.
  if (patch.logoDataUrl === "") delete patch.logoDataUrl;
  return { ...base, ...patch };
}
