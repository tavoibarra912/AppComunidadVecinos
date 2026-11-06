// ==========================================
// PUNTO DE ENTRADA DE LA APLICACIÓN
// ==========================================
import { refreshState, onDataChanged } from "./state.js";
import { loadLocations } from "./territory.js";
import { applyRoleUI, handleRouting } from "./features/navigation.js";
import { renderHomeDashboard } from "./features/home.js";
import { renderCommunities } from "./features/comunidades.js";
import { renderOwners } from "./features/propietarios.js";
import { renderProperties } from "./features/inmuebles.js";
import { renderTenants } from "./features/inquilinos.js";
import { updateInboxBadge, updateOwnerInboxBadge } from "./features/notificaciones.js";

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
  });

  // Carga inicial del estado desde el backend (única fuente de verdad)
  await refreshState();

  applyRoleUI();
  handleRouting();
}

// Escape cierra cualquier modal abierto (comportamiento uniforme)
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    dialog.close();
  });
});

boot().catch(error => {
  console.error("[main] Error de inicialización:", error);
});
