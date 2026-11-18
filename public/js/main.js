// ==========================================
// PUNTO DE ENTRADA DE LA APLICACIÓN
// ==========================================
import { refreshState, onDataChanged } from "./state.js";
import { loadLocations } from "./territory.js";
import { api } from "./api.js";
import { intentarCerrar, installSearchableSelects } from "./utils.js";
import { showLoginView, hideLoginScreen, showRecoveryFromLink } from "./features/auth.js";
import { applyRoleUI, handleRouting, renderUserSelector } from "./features/navigation.js";
import { renderHomeDashboard } from "./features/home.js";
import { renderCommunities } from "./features/comunidades.js";
import { renderOwners } from "./features/propietarios.js";
import { renderProperties } from "./features/inmuebles.js";
import { renderTenants } from "./features/inquilinos.js";
import { updateInboxBadge, updateOwnerInboxBadge } from "./features/notificaciones.js";
import { renderAccountMenu } from "./features/account-menu.js";
import { refreshCommunication } from "./features/communication.js";
import { renderIssueReporter } from "./features/issue-reporter.js";
import { applyBrand, applyPublicSettings, effectiveBrand, readInjectedBrand } from "./brand.js";
import { installTooltips } from "./tooltip.js";
import { installSidebarCollapse } from "./sidebar.js";
import { state } from "./state.js";

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

  // Re-render global: cada recarga de estado desde el backend refresca todas las vistas
  onDataChanged(() => {
    applyBrand(effectiveBrand(state.settings?.marca || readInjectedBrand(), state));
    renderCommunities();
    renderOwners();
    renderProperties();
    renderTenants();
    renderHomeDashboard();
    updateInboxBadge();
    updateOwnerInboxBadge();
    applyRoleUI();
    renderAccountMenu();
    renderIssueReporter();
    refreshCommunication().catch((error) => console.error("[communication]", error.message));
    handleRouting();
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
  handleRouting();
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

boot().catch((error) => {
  console.error("[main] Error de inicialización:", error);
  showLoginView("signin");
  document.querySelector("#login-signin-error").textContent =
    `No se pudo iniciar la aplicación: ${error.message}. Recarga la página para volver a intentarlo.`;
});
