import { refreshExportControls } from "../export-client.js";
import { state, ROLE_LABELS, getCurrentUser, hasPermission } from "../state.js";

import { accountView } from "../account-view.js";
import { renderHomeDashboard } from "./home.js";
import { puedeAdministrar, renderAdministracion } from "./administracion.js";
import { feeNavigation } from "./fees.js";
import { updateOwnerInboxBadge } from "./notificaciones.js";
import "./auth.js";
import { effectiveBrand, readInjectedBrand } from "../brand.js";

// ==========================================
// CODE-SPLITTING — lazy load por ruta
// ==========================================
const lazyNavModules = new Map();

async function loadNavModule(name) {
  if (lazyNavModules.has(name)) return lazyNavModules.get(name);
  let mod;
  switch (name) {
    case "comunidades":
      mod = await import("./comunidades.js");
      break;
    case "propietarios":
      mod = await import("./propietarios.js");
      break;
    case "inquilinos":
      mod = await import("./inquilinos.js");
      break;
    case "inmuebles":
      mod = await import("./inmuebles.js");
      break;
    case "communication":
      mod = await import("./communication.js");
      break;
    case "fees":
      mod = await import("./fees.js");
      break;
    case "informes":
      mod = await import("./informes.js");
      break;
    case "notificaciones":
      mod = await import("./notificaciones.js");
      break;
    default:
      throw new Error(`Módulo de navegación desconocido: ${name}`);
  }
  lazyNavModules.set(name, mod);
  return mod;
}

async function getRenderCommunities() {
  const mod = await loadNavModule("comunidades");
  return mod.renderCommunities;
}
async function getRenderOwners() {
  const mod = await loadNavModule("propietarios");
  return mod.renderOwners;
}
async function getRenderTenants() {
  const mod = await loadNavModule("inquilinos");
  return mod.renderTenants;
}
async function getRenderProperties() {
  const mod = await loadNavModule("inmuebles");
  return mod.renderProperties;
}
async function getRenderCommunication() {
  const mod = await loadNavModule("communication");
  return mod.renderCommunication;
}
async function getRenderFeesPage() {
  const mod = await loadNavModule("fees");
  return mod.renderFeesPage;
}
async function getRenderInformesPage() {
  const mod = await loadNavModule("informes");
  return mod.renderInformesPage;
}
async function getUpdateOwnerInboxBadge() {
  const mod = await loadNavModule("notificaciones");
  return mod.updateOwnerInboxBadge;
}
async function getFeeNavigation() {
  const mod = await loadNavModule("fees");
  return mod.feeNavigation();
}

// Backward compatibility: allow tests to mock render functions on global scope
const getRenderAdministracion = () =>
  (typeof globalThis !== "undefined" && globalThis.renderAdministracion) ||
  (typeof window !== "undefined" && window.renderAdministracion) ||
  renderAdministracion;
function getPuedeAdministrar() {
  if (typeof globalThis !== "undefined" && globalThis.puedeAdministrar)
    return globalThis.puedeAdministrar();
  if (typeof window !== "undefined" && window.puedeAdministrar) return window.puedeAdministrar();
  return puedeAdministrar();
}

const ROUTES = {
  home: "/",
  comunidades: "/comunidades",
  propietarios: "/propietarios",
  inmuebles: "/inmuebles",
  inquilinos: "/inquilinos",
  administracion: "/administracion",
  cuotas: "/cuotas",
  informes: "/informes",
  comunicacion: "/comunicacion",
};

function getPathname() {
  // Support both History API (pathname) and hash-based (for tests/backward compat)
  if (window.location.hash) {
    return window.location.hash.slice(1) || "/";
  }
  return window.location.pathname || "/";
}

function getRouteFromPath(path) {
  const cleanPath = path.split("?")[0].toLowerCase();
  // Handle both path-based ("/administracion") and hash-based ("#administracion") routes
  const normalizedPath = cleanPath.startsWith("#") ? cleanPath.slice(1) : cleanPath;
  // Ensure leading slash for consistent comparison with ROUTES values
  const pathWithSlash = normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath;
  for (const [key, routePath] of Object.entries(ROUTES)) {
    const normalizedRoute = routePath === "/" ? "" : routePath;
    if (
      pathWithSlash === normalizedRoute ||
      (normalizedRoute && pathWithSlash.startsWith(normalizedRoute + "/"))
    ) {
      return key;
    }
  }
  return "home";
}

function getRoutePath(route) {
  return ROUTES[route] || "/";
}

function brandTitle() {
  return effectiveBrand(state.settings?.marca || readInjectedBrand(), state).nombre || "Peñarrubia";
}

function setNavLabel(link, text) {
  const label = link?.querySelector(".nav-item-label");
  if (label) label.textContent = text;
  else if (link) link.textContent = text;
}

const userAvatar = document.querySelector("#user-avatar");
const userRoleLabel = document.querySelector("#user-role-label");
const newOwnerBtn = document.querySelector("#new-owner");
const newTenantBtn = document.querySelector("#new-tenant");
const navHome = document.querySelector("#nav-home");
const mobileNavHome = document.querySelector("#mobile-nav-home");
const navComunidades = document.querySelector("#nav-comunidades");
const mobileNavComunidades = document.querySelector("#mobile-nav-comunidades");
const navPropietarios = document.querySelector("#nav-propietarios");
const mobileNavPropietarios = document.querySelector("#mobile-nav-propietarios");
const navInmuebles = document.querySelector("#nav-inmuebles");
const mobileNavInmuebles = document.querySelector("#mobile-nav-inmuebles");
const navInquilinos = document.querySelector("#nav-inquilinos");
const navAdministracion = document.querySelector("#nav-administracion");
const mobileNavAdministracion = document.querySelector("#mobile-nav-administracion");
const navCuotas = document.querySelector("#nav-cuotas");
const mobileNavCuotas = document.querySelector("#mobile-nav-cuotas");
const navInformes = document.querySelector("#nav-informes");
const mobileNavInformes = document.querySelector("#mobile-nav-informes");
const mobileNavInquilinos = document.querySelector("#mobile-nav-inquilinos");
const sidebarLabel = document.querySelector("#sidebar-label");
const comHeadingEyebrow = document.querySelector("#comunidades-heading-eyebrow");
const comHeadingTitle = document.querySelector("#comunidades-heading-title");
const comHeadingSubtitle = document.querySelector("#comunidades-heading-subtitle");
const newCommunityBtn = document.querySelector("#new-community");
const comToolbar = document.querySelector("#comunidades-toolbar");
const ownersHeadingEyebrow = document.querySelector("#owners-heading-eyebrow");
const ownersHeadingTitle = document.querySelector("#owners-heading-title");
const ownersHeadingSubtitle = document.querySelector("#owners-heading-subtitle");
const ownersToolbar = document.querySelector("#owners-toolbar");
const topbarInboxBtn = document.querySelector("#topbar-inbox-btn");

function getSection(id) {
  return document.querySelector(id);
}

const SECTION_IDS = {
  home: "#home",
  comunidades: "#comunidades",
  propietarios: "#propietarios",
  inmuebles: "#inmuebles",
  inquilinos: "#inquilinos",
  administracion: "#administracion",
  cuotas: "#cuotas",
  informes: "#informes",
};

function getSec(route) {
  return getSection(SECTION_IDS[route]);
}

const communicationSection = () => document.querySelector("#comunicacion");

export function applyRoleUI() {
  refreshExportControls();
  const isOwner = state.activeRole === "owner";
  const user = getCurrentUser();
  const feeAccess = feeNavigation();
  if (navCuotas) {
    navCuotas.hidden = !feeAccess.visible;
    setNavLabel(navCuotas, feeAccess.title);
  }
  if (mobileNavCuotas) {
    mobileNavCuotas.hidden = !feeAccess.visible;
    mobileNavCuotas.textContent = feeAccess.title;
  }
  const account = accountView(state, ROLE_LABELS);
  const roleLabel = ROLE_LABELS[user?.rol] || user?.rol || "";

  const displayName =
    `${user?.nombre || ""} ${user?.apellido || ""}`.trim() || user?.usuario || "?";
  if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();
  if (userRoleLabel) userRoleLabel.textContent = `${displayName} · ${roleLabel}`;

  const canReadAdminInbox = hasPermission("admin_notification:read");
  const canReadOwnerInbox = hasPermission("owner_notification:read");
  if (topbarInboxBtn) {
    topbarInboxBtn.style.display = canReadAdminInbox || canReadOwnerInbox ? "" : "none";
  }
  updateOwnerInboxBadge();

  if (sidebarLabel) {
    sidebarLabel.textContent = isOwner ? "MI ÁREA PERSONAL" : "GESTIÓN ADMINISTRADOR";
  }
  if (navComunidades) setNavLabel(navComunidades, isOwner ? "Mi Comunidad" : "Comunidades");
  if (mobileNavComunidades)
    mobileNavComunidades.textContent = isOwner ? "Mi Comunidad" : "Comunidades";
  if (navPropietarios) setNavLabel(navPropietarios, isOwner ? "Mi Perfil" : "Propietarios");
  if (mobileNavPropietarios)
    mobileNavPropietarios.textContent = isOwner ? "Mi Perfil" : "Propietarios";
  if (navInmuebles) navInmuebles.hidden = !hasPermission("property:read");
  if (mobileNavInmuebles) mobileNavInmuebles.hidden = !hasPermission("property:read");
  const canAccessAdministration = getPuedeAdministrar();
  for (const link of [navAdministracion, mobileNavAdministracion])
    if (link) link.hidden = !canAccessAdministration;
  document.querySelectorAll('.entity-subnav-link[href="#inquilinos"]').forEach((link) => {
    link.hidden = isOwner;
  });
  newTenantBtn.hidden = isOwner || !hasPermission("tenant:create");

  for (const link of [navPropietarios, mobileNavPropietarios])
    if (link) link.hidden = !hasPermission("owner:read");
  for (const link of [navInquilinos, mobileNavInquilinos])
    if (link) link.hidden = !hasPermission("tenant:read");
  const canReadReports = hasPermission("reports:read");
  for (const link of [navInformes, mobileNavInformes]) if (link) link.hidden = !canReadReports;
  if (comHeadingEyebrow)
    comHeadingEyebrow.textContent = isOwner
      ? account.communities.length
        ? "MIS COMUNIDADES"
        : "VINCULACIÓN DE PERFIL"
      : "ASOCIACIÓN DE PROPIETARIOS";
  if (comHeadingTitle)
    comHeadingTitle.textContent = isOwner
      ? account.communities.length > 1
        ? "Mis comunidades"
        : "Mi comunidad"
      : "Comunidades de vecinos";
  if (comHeadingSubtitle)
    comHeadingSubtitle.textContent = isOwner
      ? "Consulta las comunidades vinculadas a tu cuenta y sus datos principales."
      : "Crea y mantén al día tus comunidades: datos fiscales, dirección, moneda y fondo de reserva.";
  if (newCommunityBtn)
    newCommunityBtn.style.display = isOwner || !hasPermission("community:create") ? "none" : "";
  if (comToolbar) comToolbar.style.display = isOwner ? "none" : "";

  if (ownersHeadingEyebrow)
    ownersHeadingEyebrow.textContent = isOwner
      ? "MI CUENTA Y DOCUMENTACIÓN"
      : "ASOCIACIÓN DE PROPIETARIOS";
  if (ownersHeadingTitle)
    ownersHeadingTitle.textContent = isOwner ? "Mi Perfil de Propietario" : "Propietarios";
  if (ownersHeadingSubtitle)
    ownersHeadingSubtitle.textContent = isOwner
      ? "Consulta tu expediente de asociado, adjunta tus documentos y revisa su estado de aprobación."
      : "Consulta y actualiza los datos de propietarios y socios: contacto, inmuebles y documentación.";
  if (newOwnerBtn)
    newOwnerBtn.style.display = isOwner || !hasPermission("owner:create") ? "none" : "";
  if (ownersToolbar) ownersToolbar.style.display = isOwner ? "none" : "";

  const bannerCom = document.querySelector("#owner-view-banner-com");
  if (bannerCom) {
    bannerCom.style.display = isOwner ? "flex" : "none";
    document.querySelector("#community-profile-title").textContent = `${account.communityTitle}:`;
    document.querySelector("#community-profile-message").textContent = account.communityMessage;
    document.querySelector("#community-profile-name").textContent = account.displayName;
  }
  const bannerOwn = document.querySelector("#owner-view-banner-own");
  if (bannerOwn) bannerOwn.style.display = isOwner && account.owners.length > 0 ? "flex" : "none";
}

function hideAllSections() {
  const sections = [
    getSec("home"),
    getSec("comunidades"),
    getSec("propietarios"),
    getSec("inmuebles"),
    getSec("inquilinos"),
    getSec("administracion"),
    getSec("cuotas"),
    getSec("informes"),
  ];
  const commSection = communicationSection();
  for (const section of sections) {
    if (section) {
      section.hidden = true;
      section.style.display = "none";
    }
  }
  if (commSection) {
    commSection.hidden = true;
    commSection.style.display = "none";
  }
}

function clearActiveNav() {
  const navLinks = [
    navHome,
    mobileNavHome,
    navComunidades,
    mobileNavComunidades,
    navInmuebles,
    mobileNavInmuebles,
    navPropietarios,
    mobileNavPropietarios,
    navInquilinos,
    mobileNavInquilinos,
    navAdministracion,
    mobileNavAdministracion,
    navCuotas,
    mobileNavCuotas,
    navInformes,
    mobileNavInformes,
  ];
  for (const el of navLinks) {
    if (el) {
      el.classList.remove("active");
      el.removeAttribute("aria-current");
    }
  }
  document
    .querySelectorAll('[href="#comunicacion"]')
    .forEach((el) => el.classList.remove("active"));
}

const mobileNavTrigger = document.querySelector("#mobile-nav-trigger");
const mobileNavPanel = document.querySelector("#mobile-nav-panel");
const mobileNavCurrent = document.querySelector("#mobile-nav-current");

function setMobileMenuOpen(open) {
  if (!mobileNavTrigger || !mobileNavPanel) return;
  mobileNavTrigger.setAttribute("aria-expanded", String(open));
  mobileNavTrigger.classList.toggle("is-open", open);
  mobileNavPanel.hidden = !open;
}

// En el teléfono la navegación es un solo botón con la sección actual: el panel
// despliega la lista completa. Se cierra al elegir destino, con Escape o al
// tocar fuera del menú.
mobileNavTrigger?.addEventListener("click", () => {
  setMobileMenuOpen(Boolean(mobileNavPanel?.hidden));
});

mobileNavPanel?.addEventListener("click", (event) => {
  if (event.target.closest?.(".mobile-nav-item")) setMobileMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileNavPanel && !mobileNavPanel.hidden) setMobileMenuOpen(false);
});

document.addEventListener("click", (event) => {
  if (!mobileNavPanel || mobileNavPanel.hidden) return;
  if (!event.target.closest?.(".mobile-nav")) setMobileMenuOpen(false);
});

let mobileMenuSection = "";

// Se llama en cada repintado (también en los refrescos de datos), así que solo
// cierra el panel cuando de verdad se cambia de sección; si no, abrirlo y que
// llegue un refresco lo cerraría solo.
function syncMobileMenu(activeLink) {
  const label = activeLink?.textContent?.trim() || "";
  if (mobileNavCurrent && label) mobileNavCurrent.textContent = label;
  if (!label || label === mobileMenuSection) return;
  mobileMenuSection = label;
  setMobileMenuOpen(false);
}

function showSection(section, navLinks) {
  if (section) {
    section.hidden = false;
    section.style.display = "block";
  }
  let mobileActive = null;
  for (const link of navLinks) {
    if (link) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
      if (link.classList.contains("mobile-nav-item")) mobileActive = link;
    }
  }
  syncMobileMenu(mobileActive);
}

export async function handleRouting() {
  const path = getPathname();
  const route = getRouteFromPath(path);
  const isOwner = state.activeRole === "owner";
  const commSection = communicationSection();

  hideAllSections();
  clearActiveNav();

  if (
    (route === "inmuebles" && !hasPermission("property:read")) ||
    (route === "inquilinos" && !hasPermission("tenant:read"))
  ) {
    navigateToRoute("home", true);
    return;
  }

  switch (route) {
    case "cuotas": {
      const feeNav = await getFeeNavigation();
      if (!feeNav?.visible) {
        navigateToRoute("home", true);
        return;
      }
      showSection(getSec("cuotas"), [navCuotas, mobileNavCuotas]);
      document.title = brandTitle();
      const renderFees = await getRenderFeesPage();
      renderFees();
      break;
    }
    case "comunicacion": {
      showSection(commSection, [document.querySelector("#mobile-nav-comunicacion")]);
      document
        .querySelectorAll('[href="#comunicacion"]')
        .forEach((el) => el.classList.add("active"));
      document.title = brandTitle();
      const renderComm = await getRenderCommunication();
      renderComm();
      break;
    }
    case "administracion": {
      if (!getPuedeAdministrar()) {
        navigateToRoute("home", true);
        return;
      }
      showSection(getSec("administracion"), [navAdministracion, mobileNavAdministracion]);
      document.title = brandTitle();
      getRenderAdministracion()();
      break;
    }
    case "inquilinos": {
      showSection(getSec("inquilinos"), [navInquilinos, mobileNavInquilinos]);
      document.title = brandTitle();
      const renderTenantsFn = await getRenderTenants();
      renderTenantsFn();
      break;
    }
    case "propietarios": {
      showSection(getSec("propietarios"), [navPropietarios, mobileNavPropietarios]);
      document.title = brandTitle();
      const renderOwnersFn = await getRenderOwners();
      renderOwnersFn();
      break;
    }
    case "inmuebles": {
      showSection(getSec("inmuebles"), [navInmuebles, mobileNavInmuebles]);
      document.title = brandTitle();
      const renderPropertiesFn = await getRenderProperties();
      renderPropertiesFn();
      break;
    }
    case "informes": {
      if (!hasPermission("reports:read")) {
        navigateToRoute("home", true);
        return;
      }
      showSection(getSec("informes"), [navInformes, mobileNavInformes]);
      document.title = brandTitle();
      const renderInformes = await getRenderInformesPage();
      renderInformes();
      break;
    }
    case "comunidades": {
      showSection(getSec("comunidades"), [navComunidades, mobileNavComunidades]);
      document.title = brandTitle();
      const renderCommunitiesFn = await getRenderCommunities();
      renderCommunitiesFn();
      break;
    }
    default: {
      showSection(getSec("home"), [navHome, mobileNavHome]);
      document.title = brandTitle();
      renderHomeDashboard();
      break;
    }
  }
}

export async function navigateToRoute(route, replace = false) {
  const targetPath = getRoutePath(route);
  const currentPath = getPathname();
  if (currentPath !== targetPath) {
    if (replace) {
      history.replaceState({ route }, "", targetPath);
    } else {
      history.pushState({ route }, "", targetPath);
    }
  }
  await handleRouting();
}

function handleNavClick(route) {
  return (event) => {
    event.preventDefault();
    navigateToRoute(route);
  };
}

[navHome, mobileNavHome].forEach((el) => {
  if (el) el.addEventListener("click", handleNavClick("home"));
});

[navComunidades, mobileNavComunidades].forEach((el) => {
  if (el) el.addEventListener("click", handleNavClick("comunidades"));
});

[navPropietarios, mobileNavPropietarios].forEach((el) => {
  if (el) el.addEventListener("click", handleNavClick("propietarios"));
});

[navInmuebles, mobileNavInmuebles].forEach((el) => {
  if (el) el.addEventListener("click", handleNavClick("inmuebles"));
});

for (const link of [navInquilinos, mobileNavInquilinos]) {
  if (link) link.addEventListener("click", handleNavClick("inquilinos"));
}

for (const link of [navCuotas, mobileNavCuotas])
  link?.addEventListener("click", handleNavClick("cuotas"));

for (const link of [navAdministracion, mobileNavAdministracion])
  link?.addEventListener("click", handleNavClick("administracion"));

window.addEventListener("popstate", handleRouting);

[navInformes, mobileNavInformes].forEach((el) => {
  if (el) el.addEventListener("click", handleNavClick("informes"));
});

for (const link of document.querySelectorAll('[href="#comunicacion"]')) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToRoute("comunicacion");
  });
}

window.addEventListener("hashchange", handleRouting);

// Login simulado: selector de usuario en el topbar
const activeRoleSelect = document.querySelector("#active-role-select");

export function renderUserSelector() {
  if (!activeRoleSelect) return;
  activeRoleSelect.replaceChildren();
  const user = getCurrentUser();
  if (user) activeRoleSelect.add(new Option(user.nombre || user.usuario, user.id));
  activeRoleSelect.disabled = true;
  activeRoleSelect.title = "Usuario conectado";
}

// Backward compatibility: redirect hash-based URLs to path-based
if (window.location.hash) {
  const hash = window.location.hash.slice(1).toLowerCase();
  const route = ROUTES[hash] ? hash : "home";
  history.replaceState({ route }, "", getRoutePath(route));
}

// Backward compatibility export for old hash-based navigation
export async function navigateToSection(targetHash) {
  const hash = targetHash.startsWith("#") ? targetHash.slice(1) : targetHash;
  const [route] = hash.split("?");
  const mappedRoute = ROUTES[route.toLowerCase()] ? route.toLowerCase() : "home";
  await navigateToRoute(mappedRoute);
}
