import { state, onDataChanged, ROLE_LABELS, setActiveUser, getCurrentUser, getCurrentUserRole, hasPermission, requirePermission } from "../state.js";
import { toast } from "../utils.js";
import { renderCommunities } from "./comunidades.js";
import { renderOwners } from "./propietarios.js";
import { renderTenants } from "./inquilinos.js";
import { renderProperties } from "./inmuebles.js";
import { renderHomeDashboard } from "./home.js";
import { renderAdministracion } from "./administracion.js";
import "./auth.js";
import { updateInboxBadge, updateOwnerInboxBadge } from "./notificaciones.js";

const userAvatar = document.querySelector("#user-avatar");
const userRoleLabel = document.querySelector("#user-role-label");
const newOwnerBtn = document.querySelector("#new-owner");
const newTenantBtn = document.querySelector("#new-tenant");
const navHome = document.querySelector("#nav-home");
const mobileNavHome = document.querySelector("#mobile-nav-home");
const secHome = document.querySelector("#home");
const navComunidades = document.querySelector("#nav-comunidades");
const mobileNavComunidades = document.querySelector("#mobile-nav-comunidades");
const navPropietarios = document.querySelector("#nav-propietarios");
const mobileNavPropietarios = document.querySelector("#mobile-nav-propietarios");
const navInmuebles = document.querySelector("#nav-inmuebles");
const mobileNavInmuebles = document.querySelector("#mobile-nav-inmuebles");
const navInquilinos = document.querySelector("#nav-inquilinos");
const navAdministracion = document.querySelector("#nav-administracion");
const mobileNavInquilinos = document.querySelector("#mobile-nav-inquilinos");
const secComunidades = document.querySelector("#comunidades");
const secPropietarios = document.querySelector("#propietarios");
const secInmuebles = document.querySelector("#inmuebles");
const secTenants = document.querySelector("#inquilinos");
const secAdministracion = document.querySelector("#administracion");
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
const homeGreetingDesc2 = undefined;
const newPropertyBtn = document.querySelector("#new-property");
const propertySearch = document.querySelector("#search-properties");
const propertyResultCount = document.querySelector("#property-result-count");
const newInquilinoBtn = document.querySelector("#new-tenant");
const tenantResultCount = document.querySelector("#tenant-result-count");
const tenantSearch = document.querySelector("#search-tenants");
const topbarInboxBtn = document.querySelector("#topbar-inbox-btn");
const topbarOwnerInboxBtn = document.querySelector("#topbar-owner-inbox-btn");

const contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

// === Elementos de navegación: declarados arriba (bloque consolidado) ===

export function applyRoleUI() {
  const isOwner = state.activeRole === "owner";
  const user = getCurrentUser();
  const roleLabel = ROLE_LABELS[user?.rol] || user?.rol || "";

  // 1. Selector y perfil en topbar (login simulado)
  const displayName = `${user?.nombre || ""} ${user?.apellido || ""}`.trim() || user?.usuario || "?";
  if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();
  if (userRoleLabel) userRoleLabel.textContent = `${displayName} · ${roleLabel}`;

  // 2. Buzones en topbar
  if (topbarInboxBtn) {
    topbarInboxBtn.style.display = isOwner ? "none" : "";
  }
  if (topbarOwnerInboxBtn) {
    topbarOwnerInboxBtn.style.display = isOwner ? "" : "none";
    if (isOwner) updateOwnerInboxBadge();
  }

  // 3. Etiqueta y opciones en Sidebar / Navegación
  if (sidebarLabel) {
    sidebarLabel.textContent = isOwner ? "MI ÁREA PERSONAL" : "GESTIÓN ADMINISTRADOR";
  }
  if (navComunidades) navComunidades.textContent = isOwner ? "Mi Comunidad" : "Comunidades";
  if (mobileNavComunidades) mobileNavComunidades.textContent = isOwner ? "Mi Comunidad" : "Comunidades";
  if (navPropietarios) navPropietarios.textContent = isOwner ? "Mi Perfil" : "Propietarios";
  if (mobileNavPropietarios) mobileNavPropietarios.textContent = isOwner ? "Mi Perfil" : "Propietarios";
  if (navInmuebles) navInmuebles.hidden = isOwner;
  if (mobileNavInmuebles) mobileNavInmuebles.hidden = isOwner;
  if (navAdministracion) navAdministracion.hidden = isOwner;
  document.querySelectorAll('.entity-subnav-link[href="#inquilinos"]').forEach(link => {
    link.hidden = isOwner;
  });
  newTenantBtn.hidden = isOwner;

  // 4. Sección Comunidades
  if (comHeadingEyebrow) comHeadingEyebrow.textContent = isOwner ? "MI COMUNIDAD ASIGNADA" : "ASOCIACIÓN DE PROPIETARIOS";
  if (comHeadingTitle) comHeadingTitle.textContent = isOwner ? "Comunidad de vecinos" : "Comunidades de vecinos";
  if (comHeadingSubtitle) comHeadingSubtitle.textContent = isOwner 
    ? "Consulta los datos de la comunidad a la que perteneces (sólo lectura)." 
    : "Consulta y gestiona las comunidades vinculadas a Peñarrubia.";
  if (newCommunityBtn) newCommunityBtn.style.display = isOwner ? "none" : "";
  if (comToolbar) comToolbar.style.display = isOwner ? "none" : "";

  // 5. Sección Propietarios
  if (ownersHeadingEyebrow) ownersHeadingEyebrow.textContent = isOwner ? "MI CUENTA Y DOCUMENTACIÓN" : "ASOCIACIÓN DE PROPIETARIOS";
  if (ownersHeadingTitle) ownersHeadingTitle.textContent = isOwner ? "Mi Perfil de Propietario" : "Propietarios";
  if (ownersHeadingSubtitle) ownersHeadingSubtitle.textContent = isOwner 
    ? "Consulta tu expediente de asociado, adjunta tus documentos requeridos y comprueba su estado de aprobación." 
    : "Consulta y gestiona los propietarios y asociados vinculados a Peñarrubia.";
  if (newOwnerBtn) newOwnerBtn.style.display = isOwner ? "none" : "";
  if (ownersToolbar) ownersToolbar.style.display = isOwner ? "none" : "";

  // 6. Banners informativos de modo propietario
  const bannerCom = document.querySelector("#owner-view-banner-com");
  if (bannerCom) bannerCom.style.display = isOwner ? "flex" : "none";
  const bannerOwn = document.querySelector("#owner-view-banner-own");
  if (bannerOwn) bannerOwn.style.display = isOwner ? "flex" : "none";
}


export function handleRouting() {
  const hash = (window.location.hash || "#home").toLowerCase();
  const isOwner = state.activeRole === "owner";
  if ((hash === "#inmuebles" || hash === "#inquilinos") && isOwner) {
    window.location.hash = "#home";
    return;
  }

  if (secHome) {
    secHome.hidden = true;
    secHome.style.display = "none";
  }
  if (secComunidades) {
    secComunidades.hidden = true;
    secComunidades.style.display = "none";
  }
  if (secPropietarios) {
    secPropietarios.hidden = true;
    secPropietarios.style.display = "none";
  }
  if (secInmuebles) {
    secInmuebles.hidden = true;
    secInmuebles.style.display = "none";
  }
  if (secTenants) {
    secTenants.hidden = true;
    secTenants.style.display = "none";
  }
  if (secAdministracion) {
    secAdministracion.hidden = true;
    secAdministracion.style.display = "none";
  }

  [navHome, mobileNavHome, navComunidades, mobileNavComunidades, navInmuebles, mobileNavInmuebles, navPropietarios, mobileNavPropietarios, navInquilinos, mobileNavInquilinos, navAdministracion].forEach(el => {
    if (el) el.classList.remove("active");
  });

  if (hash === "#administracion") {
    if (state.activeRole !== "admin") {
      window.location.hash = "#home";
      return;
    }
    if (secAdministracion) {
      secAdministracion.hidden = false;
      secAdministracion.style.display = "block";
    }
    if (navAdministracion) navAdministracion.classList.add("active");
    document.title = "Peñarrubia · Administración";
    renderAdministracion();
  } else if (hash === "#inquilinos") {
    if (secTenants) {
      secTenants.hidden = false;
      secTenants.style.display = "block";
    }
    if (navInquilinos) navInquilinos.classList.add("active");
    if (mobileNavInquilinos) mobileNavInquilinos.classList.add("active");
    document.title = "Peñarrubia · Inquilinos";
    renderTenants();
  } else if (hash === "#propietarios") {
    if (secPropietarios) {
      secPropietarios.hidden = false;
      secPropietarios.style.display = "block";
    }
    if (navPropietarios) navPropietarios.classList.add("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.add("active");
    document.title = isOwner ? "Peñarrubia · Mi Perfil" : "Peñarrubia · Propietarios";
    renderOwners();
  } else if (hash === "#inmuebles") {
    if (secInmuebles) {
      secInmuebles.hidden = false;
      secInmuebles.style.display = "block";
    }
    if (navInmuebles) navInmuebles.classList.add("active");
    if (mobileNavInmuebles) mobileNavInmuebles.classList.add("active");
    document.title = "Peñarrubia · Inmuebles";
    renderProperties();
  } else if (hash === "#comunidades") {
    if (secComunidades) {
      secComunidades.hidden = false;
      secComunidades.style.display = "block";
    }
    if (navComunidades) navComunidades.classList.add("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.add("active");
    document.title = isOwner ? "Peñarrubia · Mi Comunidad" : "Peñarrubia · Comunidades";
    renderCommunities();
  } else {
    if (secHome) {
      secHome.hidden = false;
      secHome.style.display = "block";
    }
    if (navHome) navHome.classList.add("active");
    if (mobileNavHome) mobileNavHome.classList.add("active");
    document.title = "Peñarrubia · Inicio";
    renderHomeDashboard();
  }
}

export function navigateToSection(targetHash) {
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
  handleRouting();
}

[navHome, mobileNavHome].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#home");
    });
  }
});

[navComunidades, mobileNavComunidades].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#comunidades");
    });
  }
});

[navPropietarios, mobileNavPropietarios].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#propietarios");
    });
  }
});

[navInmuebles, mobileNavInmuebles].forEach(el => {
  if (el) {
    el.addEventListener("click", event => {
      event.preventDefault();
      navigateToSection("#inmuebles");
    });
  }
});

[navInquilinos, mobileNavInquilinos].forEach(el => {
  if (el) {
    el.addEventListener("click", event => {
      event.preventDefault();
      navigateToSection("#inquilinos");
    });
  }
});

window.addEventListener("hashchange", handleRouting);


// Login simulado: selector de usuario en el topbar
const activeRoleSelect = document.querySelector("#active-role-select");

export function renderUserSelector() {
  if (!activeRoleSelect) return;
  const previous = state.currentUserId;
  activeRoleSelect.replaceChildren();
  state.users.filter(user => user.activo).forEach(user => {
    const roleLabel = ROLE_LABELS[user.rol] || user.rol;
    activeRoleSelect.add(new Option(`${user.nombre || user.usuario} · ${roleLabel}`, user.id));
  });
  if (previous) activeRoleSelect.value = previous;
}

if (activeRoleSelect) {
  activeRoleSelect.addEventListener("change", () => {
    setActiveUser(activeRoleSelect.value);
    applyRoleUI();
    renderCommunities();
    renderOwners();
    renderProperties();
    renderTenants();
    renderHomeDashboard();
    handleRouting();
    toast(`Sesión simulada como ${getCurrentUser()?.usuario || "?"} (${ROLE_LABELS[getCurrentUserRole()] || getCurrentUserRole()}).`);
  });
  onDataChanged(() => renderUserSelector());
}

