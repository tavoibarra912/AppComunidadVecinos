// Marca (white-label): aplica nombre, colores y logo embebidos por el server
// en el propio index.html (#brand-json + #brand-vars). No es un endpoint: la
// página llega ya personalizada, incluida la pantalla de login.

const FALLBACK = { nombre: "Peñarrubia", colorPrimario: "#11273e", colorAcento: "#198b84", logoDataUrl: "" };

export function readInjectedBrand() {
  try {
    const data = JSON.parse(document.getElementById("brand-json")?.textContent || "{}");
    return { ...FALLBACK, ...data };
  } catch {
    return { ...FALLBACK };
  }
}

export function brandStyle(brand) {
  return `:root{--nav:${brand.colorPrimario || FALLBACK.colorPrimario};--brand:${brand.colorAcento || FALLBACK.colorAcento};--brand-dark:color-mix(in srgb,${brand.colorAcento || FALLBACK.colorAcento} 80%,black)}`;
}

function setBrandText(root, name) {
  if (!root) return;
  const textNode = [...root.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
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
  const style = document.getElementById("brand-vars");
  if (style) style.textContent = brandStyle({ ...brand, nombre: name });
  setBrandText(document.querySelector(".brand"), name);
  setBrandText(document.querySelector(".login-brand"), name);
  document.title = `${name} · Comunidades y Propietarios`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", `Gestión de comunidades y propietarios de la Asociación ${name}`);
  const greet = document.querySelector("#home-greeting-title");
  if (greet) greet.textContent = `Bienvenido a la gestión de ${name}`;
  const topBrand = document.querySelector(".brand");
  if (topBrand) topBrand.setAttribute("aria-label", `Inicio de ${name}`);
  setLogo("topbar-brand-logo", brand.logoDataUrl);
  setLogo("login-brand-logo", brand.logoDataUrl);
  return { ...brand, nombre: name };
}
