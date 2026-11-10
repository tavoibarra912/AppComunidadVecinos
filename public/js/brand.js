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

const DENSITIES = ["compacta", "normal", "amplia"];
const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK = {
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

export function readInjectedBrand() {
  try {
    const data = JSON.parse(
      document.getElementById("brand-json")?.textContent || "{}",
    );
    return { ...FALLBACK, ...data };
  } catch {
    return { ...FALLBACK };
  }
}

export function readInjectedPublicSettings() {
  try {
    const data = JSON.parse(
      document.getElementById("public-settings-json")?.textContent || "{}",
    );
    return { ...PUBLIC_FALLBACK, ...data };
  } catch {
    return { ...PUBLIC_FALLBACK };
  }
}

export function brandStyle(brand = FALLBACK) {
  const color = (key) => hexOr(brand[key], FALLBACK[key]);
  const acento = color("colorAcento");
  const tipografia = Object.hasOwn(FONT_STACKS, brand.tipografia)
    ? FONT_STACKS[brand.tipografia]
    : FONT_STACKS.inter;
  const tamanoBase = numberOr(brand.tamanoBase, FALLBACK.tamanoBase, 12, 18);
  const radioBordes = numberOr(brand.radioBordes, FALLBACK.radioBordes, 0, 16);
  return `:root:root{--nav:${color("colorPrimario")};--brand:${acento};--brand-dark:color-mix(in srgb,${acento} 80%,black);--canvas:${color("colorFondo")};--surface:${color("colorSuperficie")};--ink:${color("colorTexto")};--muted:${color("colorTextoSuave")};--line:${color("colorBorde")};--font-ui:${tipografia};--font-size-base:${tamanoBase}px;--radius:${radioBordes}px}`;
}

function setBrandText(root, name) {
  if (!root) return;
  const textNode = [...root.childNodes].find(
    (n) => n.nodeType === 3 && n.textContent.trim(),
  );
  if (textNode) textNode.textContent = name;
}

function setLogo(id, url) {
  const img = document.getElementById(id);
  if (!img) return;
  if (url) {
    img.src = url;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
}

export function applyBrand(brand = readInjectedBrand()) {
  const name = (brand.nombre || FALLBACK.nombre).trim() || FALLBACK.nombre;
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
    tipografia: Object.hasOwn(FONT_STACKS, brand.tipografia)
      ? brand.tipografia
      : "inter",
    tamanoBase: numberOr(brand.tamanoBase, FALLBACK.tamanoBase, 12, 18),
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
    ?.setAttribute(
      "content",
      `Gestión de comunidades y propietarios de la Asociación ${name}`,
    );
  const greet = document.querySelector("#home-greeting-title");
  if (greet) greet.textContent = `Bienvenido a la gestión de ${name}`;
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
        "La plataforma está en mantenimiento. Volvé a intentar en unos minutos."
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
