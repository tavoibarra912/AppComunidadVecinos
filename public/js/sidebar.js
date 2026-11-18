// ==========================================
// MENÚ LATERAL COLAPSABLE
// Al contraerlo solo quedan los iconos; el texto pasa a tooltip.
// La preferencia se recuerda entre sesiones.
// ==========================================
const STORAGE_KEY = "ui:sidebar-collapsed";
const layout = document.querySelector(".layout");
const sidebar = document.querySelector(".sidebar");
const toggle = document.querySelector("#sidebar-toggle");

function navLinks() {
  return sidebar ? [...sidebar.querySelectorAll(".nav-item")] : [];
}

function labelOf(link) {
  return (
    link.querySelector(".nav-item-label")?.textContent.replace(/\s+/g, " ").trim() ||
    link.getAttribute("aria-label") ||
    ""
  );
}

/** Los tooltips solo son necesarios cuando el texto del menú está oculto. */
export function refreshSidebarLabels() {
  if (!sidebar) return;
  const collapsed = Boolean(layout?.classList.contains("sidebar-collapsed"));
  for (const link of navLinks()) {
    const text = collapsed ? labelOf(link) : "";
    if (text) link.dataset.tooltip = text;
    else delete link.dataset.tooltip;
  }
}

function applyCollapsed(collapsed, persist = true) {
  if (!layout || !sidebar || !toggle) return;
  layout.classList.toggle("sidebar-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const action = collapsed ? "Expandir menú" : "Contraer menú";
  toggle.setAttribute("aria-label", action);
  toggle.dataset.tooltip = action;
  refreshSidebarLabels();
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* almacenamiento no disponible */
  }
}

export function installSidebarCollapse() {
  if (!layout || !sidebar || !toggle) return;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    /* preferencia no disponible */
  }
  applyCollapsed(collapsed, false);
  toggle.addEventListener("click", () => {
    applyCollapsed(!layout.classList.contains("sidebar-collapsed"));
  });
  // Las etiquetas cambian con el rol activo: el tooltip debe seguirlas.
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => refreshSidebarLabels()).observe(sidebar, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }
}
