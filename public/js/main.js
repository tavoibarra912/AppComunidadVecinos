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
import { state, getCurrentUser } from "./state.js";

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

  // El menú de cuenta es transversal: debe enlazar sus eventos también si
  // la primera pantalla es el login y todavía no se abrió ninguna sección.
  const accountMenu = await loadFeature("account-menu");

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
    accountMenu.renderAccountMenu();

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
// Un error inesperado siempre queda en consola. Enviarlo a /issues (que abre
// una incidencia real en GitHub) se limita a: sesión iniciada, un envío por
// error distinto y un máximo por carga, para que un fallo en bucle no llene el
// buzón de incidencias.
const MAX_AUTO_REPORTS = 5;
const reportedFingerprints = new Set();
let autoReports = 0;

// Ruido que no aporta nada al buzón: extensiones, cancelaciones y fallos de red.
const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /Load failed/i,
  /aborted/i,
];

function shouldAutoReport(message, source) {
  const text = String(message || "").trim();
  if (!text) return false;
  // Sin sesión no hay endpoint al que reportar (el router exige sesión).
  if (!getCurrentUser()) return false;
  if (IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return false;
  const fingerprint = `${source}|${text}`;
  if (reportedFingerprints.has(fingerprint)) return false;
  if (autoReports >= MAX_AUTO_REPORTS) {
    console.warn("[error-boundary] Límite de reportes automáticos alcanzado; no se envían más.");
    return false;
  }
  reportedFingerprints.add(fingerprint);
  autoReports += 1;
  return true;
}

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
  const source = event.filename || "unknown";
  if (shouldAutoReport(event.message, source)) reportIssue(event.message, source, event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[error-boundary] Promesa rechazada no controlada:", event.reason);
  const message = event.reason?.message || String(event.reason);
  if (shouldAutoReport(message, "unhandledrejection"))
    reportIssue(message, "unhandledrejection", event.reason);
});

boot().catch((error) => {
  console.error("[main] Error de inicialización:", error);
  showLoginView("signin");
  document.querySelector("#login-signin-error").textContent =
    `No se pudo iniciar la aplicación: ${error.message}. Recarga la página para volver a intentarlo.`;
  if (shouldAutoReport(error.message, "main.boot")) reportIssue(error.message, "main.boot", error);
});
