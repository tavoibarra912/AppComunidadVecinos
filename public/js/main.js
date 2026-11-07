// ==========================================
// PUNTO DE ENTRADA DE LA APLICACIÓN
// ==========================================
import { state, refreshState, onDataChanged, setActiveUser } from "./state.js";
import { loadLocations } from "./territory.js";
import { api } from "./api.js";
import { intentarCerrar } from "./utils.js";
import { showLoginView, hideLoginScreen } from "./features/auth.js";
import { applyRoleUI, handleRouting, renderUserSelector } from "./features/navigation.js";
import { renderHomeDashboard } from "./features/home.js";
import { renderCommunities } from "./features/comunidades.js";
import { renderOwners } from "./features/propietarios.js";
import { renderProperties } from "./features/inmuebles.js";
import { renderTenants } from "./features/inquilinos.js";
import { updateInboxBadge, updateOwnerInboxBadge } from "./features/notificaciones.js";
import { renderAccountMenu } from "./features/account-menu.js";

async function boot() {
  // Catálogo territorial del INE (script clásico con window.MUNICIPIOS_INE)
  loadLocations();

  // Re-render global: cada recarga de estado desde el backend refresca todas las vistas
  onDataChanged(() => {
    renderCommunities();
    renderOwners();
    renderProperties();
    renderTenants();
    renderHomeDashboard();
    updateInboxBadge();
    updateOwnerInboxBadge();
    applyRoleUI();
    renderAccountMenu();
    handleRouting();
  });

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
  "role-dialog": "#role-form"
};
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    const formSelector = FORMS_BY_DIALOG[dialog.id];
    if (formSelector && typeof window.intentarCerrar === "function") {
      intentarCerrar(document.querySelector(formSelector), dialog);
      return;
    }
    dialog.close();
  });
});

boot().catch(error => {
  console.error("[main] Error de inicialización:", error);
  showLoginView("signin");
  document.querySelector("#login-signin-error").textContent =
    `No se pudo iniciar la aplicación: ${error.message}. Recargá la página para reintentar.`;
});
