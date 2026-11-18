import { hasPermission, state } from "./state.js";

let openExportMenu = null;
document.addEventListener("click", (event) => {
  if (openExportMenu && !openExportMenu.wrap.contains(event.target)) {
    openExportMenu.close();
    openExportMenu = null;
  }
});
export function refreshExportControls() {
  document.querySelectorAll("[data-export-permission]").forEach((wrap) => {
    wrap.hidden = !hasPermission("export:read") || !hasPermission(wrap.dataset.exportPermission);
  });
}

const DEFAULT_PERMISSIONS = {
  communities: "community:export",
  properties: "property:export",
  owners: "owner:export",
  tenants: "tenant:export",
  receipts: "fee:export",
  assessments: "fee:export",
  services: "fee:export",
  communications: "comm:export",
  documents: "document:export",
  audit: "audit:export",
  users: "admin:export",
  roles: "admin:export",
  report_financial: "reports:export",
  report_arrears: "reports:export",
  report_services: "reports:export",
  report_comparison: "reports:export",
};

/**
 * Descarga una exportación enviando la petición a la API.
 */
export async function downloadExport({
  tableId,
  format,
  filters = {},
  sort = null,
  columns = null,
  itemIds = null,
  groupBy = null,
}) {
  const requestedUserId = state.currentUserId;
  const response = await fetch(`/api/export/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, filters, sort, columns, itemIds, groupBy }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Error ${response.status} al generar la exportación`);
  }

  const blob = await response.blob();
  if (state.currentUserId !== requestedUserId)
    throw new Error("La sesión cambió. Vuelve a solicitar la exportación.");
  const disposition = response.headers.get("content-disposition") || "";
  let filename = `${tableId}_export.${format}`;
  const match = disposition.match(/filename="?([^"]+)"?/);
  if (match) filename = match[1];

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Notificación toast sencilla para errores y avisos de exportación
 */
export function showExportToast(message, isError = false) {
  let toastContainer = document.querySelector(".export-toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "export-toast-container";
    toastContainer.setAttribute("role", "status");
    toastContainer.setAttribute("aria-live", "polite");
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `export-toast ${isError ? "export-toast-error" : "export-toast-success"}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("is-fading");
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/**
 * Crea el componente visual de botón + menú desplegable de exportación
 */
export function createExportDropdown({
  tableId,
  permission = null,
  getFilters = () => ({}),
  getSort = () => null,
  getColumns = () => null,
  getItemIds = () => null,
  getView = () => null,
}) {
  const requiredPerm = permission || DEFAULT_PERMISSIONS[tableId];
  if (!hasPermission("export:read") || (requiredPerm && !hasPermission(requiredPerm))) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "table-export-wrap";
  wrap.dataset.exportTable = tableId;
  wrap.dataset.exportPermission = requiredPerm || "export:read";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "table-export-btn";
  btn.title = "Exportar";
  btn.setAttribute("aria-label", "Exportar");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  `;

  const menu = document.createElement("div");
  menu.className = "table-export-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");

  const options = [
    { format: "pdf", label: "Descargar PDF (.pdf)", icon: "📄" },
    { format: "xlsx", label: "Descargar Excel (.xlsx)", icon: "📊" },
    { format: "csv", label: "Descargar CSV (.csv)", icon: "📑" },
  ];

  options.forEach((opt) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "table-export-menu-item";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `<span class="export-opt-icon">${opt.icon}</span> <span>${opt.label}</span>`;

    item.addEventListener("click", async () => {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.setAttribute("aria-label", "Generando exportación");

      try {
        if (!hasPermission("export:read") || (requiredPerm && !hasPermission(requiredPerm)))
          throw new Error("Ya no tienes permiso para exportar.");
        const view = getView();
        const filters = { ...(getFilters() || {}), ...(view?.filters || {}) };
        const sort = view?.sort ?? getSort();
        const columns = view?.columns ?? getColumns();
        if (Array.isArray(columns) && !columns.length)
          throw new Error("Selecciona al menos una columna visible para exportar.");
        const itemIds = view?.itemIds ?? getItemIds();

        await downloadExport({
          tableId,
          format: opt.format,
          filters,
          sort,
          columns,
          itemIds,
          groupBy: view?.groupBy || null,
        });
        showExportToast(`Archivo ${opt.format.toUpperCase()} generado correctamente.`);
      } catch (err) {
        showExportToast(err.message || "Error al exportar los datos", true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        btn.removeAttribute("aria-busy");
        btn.setAttribute("aria-label", "Exportar");
      }
    });

    menu.appendChild(item);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    if (willOpen) {
      openExportMenu?.close();
      openExportMenu = {
        wrap,
        close: () => {
          menu.hidden = true;
          btn.setAttribute("aria-expanded", "false");
        },
      };
    }
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  wrap.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      const items = [...menu.querySelectorAll("button")],
        index = items.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}
