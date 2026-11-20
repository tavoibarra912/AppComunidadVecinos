// ==========================================
// PUNTO DE ENTRADA DE LA APLICACIÓN
// ==========================================
import { refreshState, onDataChanged, subscribe } from "./state.js";
import { loadLocations } from "./territory.js";
import { api } from "./api.js";
import { intentarCerrar, installSearchableSelects } from "./utils.js";
import { showLoginView, hideLoginScreen, showRecoveryFromLink } from "./features/auth.js";
import { applyRoleUI, handleRouting, renderUserSelector } from "./features/navigation.js";
import { renderHomeDashboard } from "./features/home.js";
import { applyBrand, applyPublicSettings, effectiveBrand, readInjectedBrand } from "./brand.js";
import { installTooltips } from "./tooltip.js";
import { installSidebarCollapse } from "./sidebar.js";
import { state } from "./state.js";

// ==========================================
// CODE-SPLITTING — lazy load por feature
// ==========================================
const lazyFeatures = new Map();

async function loadFeature(name) {
  if (lazyFeatures.has(name)) return lazyFeatures.get(name);
  let mod;
  switch (name) {
    case "comunidades":
      mod = await import("./features/comunidades.js");
      break;
    case "propietarios":
      mod = await import("./features/propietarios.js");
      break;
    case "inmuebles":
      mod = await import("./features/inmuebles.js");
      break;
    case "inquilinos":
      mod = await import("./features/inquilinos.js");
      break;
    case "notificaciones":
      mod = await import("./features/notificaciones.js");
      break;
    case "account-menu":
      mod = await import("./features/account-menu.js");
      break;
    case "communication":
      mod = await import("./features/communication.js");
      break;
    case "issue-reporter":
      mod = await import("./features/issue-reporter.js");
      break;
    default:
      throw new Error(`Feature desconocida: ${name}`);
  }
  lazyFeatures.set(name, mod);
  return mod;
}

async function getRender(name) {
  const mod = await loadFeature(name);
  return mod[`render${name.charAt(0).toUpperCase() + name.slice(1)}`];
}

async function getBadge(name) {
  const mod = await loadFeature(name);
  if (name === "notificaciones") {
    return { updateInboxBadge: mod.updateInboxBadge, updateOwnerInboxBadge: mod.updateOwnerInboxBadge };
  }
  return null;
}

async function getRefresh(name) {
  const mod = await loadFeature(name);
  return mod.refreshCommunication;
}

async function boot() {
  // Marca y ajustes públicos embebidos por el server — también en el login.
  applyBrand();
  applyPublicSettings();
  // Tooltips de acción para todos los botones (mouse y teclado).
  installTooltips();
  // Menú lateral colapsable: recuerda la preferencia del usuario.
  installSidebarCollapse();
  // Todos los desplegables de la app permiten buscar (también los dinámicos).
  installSearchableSelects();
  // Catálogo territorial del INE (script clásico con window.MUNICIPIOS_INE)
  loadLocations();

  // Esqueleto de carga del home: se muestra/oculta según state.loading.bootstrap
  subscribe("loading", () => {
    const isLoading = state.loading.bootstrap;
    document.querySelectorAll(".home-loading-skeleton").forEach((el) => {
      el.classList.toggle("hidden", !isLoading);
    });
    const dashboard = document.getElementById("home-dashboard");
    if (dashboard) dashboard.setAttribute("aria-busy", String(isLoading));
  });

  // Re-render global: refresca solo lo transversal + la vista activa
  onDataChanged(async () => {
    applyBrand(effectiveBrand(state.settings?.marca || readInjectedBrand(), state));
    renderHomeDashboard();
    applyRoleUI();
    renderUserSelector();

    // Badges de notificaciones (lazy)
    const notif = await getBadge("notificaciones").catch(() => ({}));
    if (notif.updateInboxBadge) notif.updateInboxBadge();
    if (notif.updateOwnerInboxBadge) notif.updateOwnerInboxBadge();

    // Issue reporter (lazy, se monta una sola vez)
    const reporterMod = await loadFeature("issue-reporter").catch(() => null);
    if (reporterMod?.renderIssueReporter) reporterMod.renderIssueReporter();

    // Comunicación (lazy)
    const refreshComm = await getRefresh("communication").catch(() => null);
    if (refreshComm) await refreshComm().catch((error) => console.error("[communication]", error.message));

    await handleRouting();
  });

  if (showRecoveryFromLink()) return;
  showLoginView("signin");
  try {
    await api.getCurrentUser();
  } catch (error) {
    if (error.status === 401) return;
    throw error;
  }
  await refreshState();
  renderUserSelector();
  hideLoginScreen();
  applyRoleUI();
  await handleRouting();
}

// Escape cierra modales; en los editores con guard, el Esc pregunta antes
const FORMS_BY_DIALOG = {
  "community-dialog": "#community-form",
  "property-dialog": "#property-form",
  "owner-dialog": "#owner-form",
  "tenant-dialog": "#tenant-form",
  "user-dialog": "#user-form",
  "role-dialog": "#role-form",
};
// Cancelar el selector de archivos nativo emite un «cancel» que burbujea y, en
// Chromium, puede cerrar el diálogo contenedor. Se corta antes de llegar a los modales.
document.addEventListener(
  "cancel",
  (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "file")
      event.stopPropagation();
  },
  true,
);

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => {
    // El «cancel» del selector de archivos no es una petición de cierre del modal.
    if (event.target !== dialog) return;
    event.preventDefault();
    const formSelector = FORMS_BY_DIALOG[dialog.id];
    if (formSelector && typeof window.intentarCerrar === "function") {
      intentarCerrar(document.querySelector(formSelector), dialog);
      return;
    }
    dialog.close();
  });
});

// ==========================================
// GLOBAL ERROR BOUNDARY — captura errores no controlados
// ==========================================
async function reportIssue(message, source, error) {
  try {
    const formData = new FormData();
    formData.append("title", `Error JS: ${source}`);
    formData.append(
      "description",
      [
        `**Mensaje:** ${message}`,
        `**Origen:** ${source}`,
        `**URL:** ${window.location.href}`,
        `**User Agent:** ${navigator.userAgent}`,
        `**Fecha:** ${new Date().toISOString()}`,
        error?.stack ? `**Stack:**\n\`\`\`\n${error.stack}\n\`\`\`` : "",
      ].filter(Boolean).join("\n\n"),
    );
    await api.reportIssue(formData);
  } catch (reportError) {
    console.error("[error-boundary] No se pudo reportar el issue:", reportError);
  }
}

window.addEventListener("error", (event) => {
  console.error("[error-boundary] Error no controlado:", event.error);
  reportIssue(event.message, event.filename || "unknown", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[error-boundary] Promesa rechazada no controlada:", event.reason);
  reportIssue(
    event.reason?.message || String(event.reason),
    "unhandledrejection",
    event.reason,
  );
});

boot().catch((error) => {
  console.error("[main] Error de inicialización:", error);
  showLoginView("signin");
  document.querySelector("#login-signin-error").textContent =
    `No se pudo iniciar la aplicación: ${error.message}. Recarga la página para volver a intentarlo.`;
  reportIssue(error.message, "main.boot", error);
});
