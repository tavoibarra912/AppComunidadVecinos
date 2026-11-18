import { escapeHtml as h } from "../html.js";
import { state, getCurrentUser, hasPermission } from "../state.js";
import { createDataTable } from "../table.js";
import { createExportDropdown } from "../export-client.js";

const REPORTS = [
  {
    id: "report_financial",
    title: "Balance Financiero y Liquidación",
    formulas:
      "Total Emitido - Total Cobrado = Pendiente de cobro; Tasa de cobro = (Cobrado / Emitido) × 100",
    units: "Euros (€), Porcentaje (%)",
    source: "Cuotas ordinarias y extraordinarias (fee_receipts)",
    columns: [
      {
        key: "communityName",
        label: "Comunidad",
        value: (r) => r.communityName,
        defaultVisible: true,
      },
      { key: "period", label: "Periodo", value: (r) => r.period, defaultVisible: true },
      {
        key: "issuedTotal",
        label: "Emitido (€)",
        value: (r) => r.issuedTotal,
        defaultVisible: true,
      },
      { key: "paidTotal", label: "Cobrado (€)", value: (r) => r.paidTotal, defaultVisible: true },
      {
        key: "pendingTotal",
        label: "Pendiente (€)",
        value: (r) => r.pendingTotal,
        defaultVisible: true,
      },
      {
        key: "collectionRate",
        label: "Cobro (%)",
        value: (r) => r.collectionRate,
        defaultVisible: true,
      },
      {
        key: "receiptsCount",
        label: "Nº Recibos",
        value: (r) => r.receiptsCount,
        defaultVisible: true,
      },
      {
        key: "arrearsCount",
        label: "Impagados",
        value: (r) => r.arrearsCount,
        defaultVisible: true,
      },
    ],
  },
  {
    id: "report_arrears",
    title: "Morosidad y Deuda Acumulada",
    formulas: "Deuda acumulada = Suma de importes pendientes de cobro en recibos vigentes",
    units: "Euros (€), Días",
    source: "Recibos con saldo pendiente (fee_receipts)",
    columns: [
      {
        key: "communityName",
        label: "Comunidad",
        value: (r) => r.communityName,
        defaultVisible: true,
      },
      { key: "propertyRef", label: "Inmueble", value: (r) => r.propertyRef, defaultVisible: true },
      { key: "ownerName", label: "Titular", value: (r) => r.ownerName, defaultVisible: true },
      {
        key: "debtTotal",
        label: "Deuda total (€)",
        value: (r) => r.debtTotal,
        defaultVisible: true,
      },
      {
        key: "pendingReceiptsCount",
        label: "Recibos pendientes",
        value: (r) => r.pendingReceiptsCount,
        defaultVisible: true,
      },
      {
        key: "oldestPeriod",
        label: "Periodo más antiguo",
        value: (r) => r.oldestPeriod,
        defaultVisible: true,
      },
      {
        key: "oldestDueDate",
        label: "Vencimiento",
        value: (r) => r.oldestDueDate,
        defaultVisible: true,
      },
      { key: "status", label: "Estado", value: (r) => r.status, defaultVisible: true },
    ],
  },
  {
    id: "report_services",
    title: "Suministros y Consumos",
    formulas: "Coste medio / unidad = Importe total / Consumo total registrado",
    units: "kWh, m³, Euros (€)",
    source: "Facturas de suministros y consumos (service_bills)",
    columns: [
      {
        key: "communityName",
        label: "Comunidad",
        value: (r) => r.communityName,
        defaultVisible: true,
      },
      {
        key: "serviceConcept",
        label: "Suministro",
        value: (r) => r.serviceConcept,
        defaultVisible: true,
      },
      { key: "period", label: "Periodo", value: (r) => r.period, defaultVisible: true },
      { key: "provider", label: "Proveedor", value: (r) => r.provider, defaultVisible: true },
      { key: "billAmount", label: "Importe (€)", value: (r) => r.billAmount, defaultVisible: true },
      {
        key: "totalConsumption",
        label: "Consumo",
        value: (r) => r.totalConsumption,
        defaultVisible: true,
      },
      { key: "unitCost", label: "Coste unitario", value: (r) => r.unitCost, defaultVisible: true },
      {
        key: "propertiesAffected",
        label: "Inmuebles",
        value: (r) => r.propertiesAffected,
        defaultVisible: true,
      },
    ],
  },
  {
    id: "report_comparison",
    title: "Comparativa y Benchmarking",
    formulas:
      "Cuota media por unidad = Total emitido / Total inmuebles; Tasa cobro = (Cobrado / Emitido) × 100",
    units: "Euros (€), Porcentaje (%)",
    source: "Consolidado de comunidades, inmuebles y cuotas",
    columns: [
      {
        key: "communityName",
        label: "Comunidad",
        value: (r) => r.communityName,
        defaultVisible: true,
      },
      {
        key: "propertiesCount",
        label: "Inmuebles",
        value: (r) => r.propertiesCount,
        defaultVisible: true,
      },
      {
        key: "totalIssued",
        label: "Total emitido (€)",
        value: (r) => r.totalIssued,
        defaultVisible: true,
      },
      {
        key: "averagePerProperty",
        label: "Media / inmueble (€)",
        value: (r) => r.averagePerProperty,
        defaultVisible: true,
      },
      {
        key: "collectionRate",
        label: "Tasa de cobro (%)",
        value: (r) => r.collectionRate,
        defaultVisible: true,
      },
      {
        key: "activeServicesCount",
        label: "Servicios activos",
        value: (r) => r.activeServicesCount,
        defaultVisible: true,
      },
    ],
  },
];

let activeReportIndex = 0;
let selectedCommunityId = "";
let dataTableInstance = null;

/** Filas cargadas desde el servidor para el informe activo */
let cachedRows = [];
let loadingRows = false;
let reportRequest = 0;
let reportError = "";

/**
 * Carga las filas del informe activo desde el endpoint de preview del servidor.
 * Actualiza la tabla al completar.
 */
async function fetchReportRows(reportId, communityId) {
  const requestId = ++reportRequest,
    userId = state.currentUserId;
  loadingRows = true;
  reportError = "";
  const loadingStatus = document.querySelector("#report-load-status");
  if (loadingStatus) loadingStatus.textContent = "Cargando informe…";
  cachedRows = [];
  if (dataTableInstance) dataTableInstance.refresh();

  try {
    const params = new URLSearchParams({ limit: "500" });
    if (communityId) params.set("communityId", communityId);
    const res = await fetch(`/api/export/${encodeURIComponent(reportId)}/preview?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }
    const payload = await res.json();
    if (requestId !== reportRequest || state.currentUserId !== userId) return;
    cachedRows = Array.isArray(payload.rows) ? payload.rows : [];
    const meta = document.querySelector(".reports-meta-card");
    if (meta) {
      meta.replaceChildren();
      for (const [label, value] of [
        ["Fuente", payload.source],
        ["Fórmulas", payload.formulas],
        ["Unidades", payload.units],
      ]) {
        const line = document.createElement("p");
        line.textContent = `${label}: ${value || "—"}`;
        meta.append(line);
      }
    }
  } catch (err) {
    if (requestId !== reportRequest || state.currentUserId !== userId) return;
    reportError = err.message;
    cachedRows = [];
    console.warn("[informes] No se pudieron cargar los datos del informe:", err.message);
  } finally {
    if (requestId !== reportRequest || state.currentUserId !== userId) return;
    const status = document.querySelector("#report-load-status");
    if (status) status.textContent = reportError;
    loadingRows = false;
    if (dataTableInstance) dataTableInstance.refresh();
  }
}

export function renderInformesPage() {
  const root = document.querySelector("#informes-page");
  if (!root) return;

  if (!hasPermission("reports:read")) {
    root.innerHTML = `<div class="empty-state"><h2>Acceso restringido</h2><p>No tienes permiso para consultar informes.</p></div>`;
    return;
  }

  root.replaceChildren();
  cachedRows = [];
  dataTableInstance = null;

  // 1. Cabecera
  const heading = document.createElement("div");
  heading.className = "page-heading";
  heading.innerHTML = `
    <div>
      <p class="eyebrow">INFORMES Y ANALÍTICA</p>
      <div class="page-title-row">
        <span class="page-title-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </span>
        <h1 class="page-title">Informes y Estadísticas</h1>
      </div>
      <p class="page-subtitle">Informes financieros, ratios de morosidad, consumos y comparativas entre comunidades.</p>
    </div>
  `;
  root.appendChild(heading);

  // 2. Tabs de selección de informe
  const tabWrap = document.createElement("div");
  tabWrap.className = "reports-tab-bar";
  tabWrap.setAttribute("role", "tablist");
  tabWrap.setAttribute("aria-label", "Informes disponibles");

  REPORTS.forEach((rep, idx) => {
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = `reports-tab-btn ${idx === activeReportIndex ? "active" : ""}`;
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", String(idx === activeReportIndex));
    tabBtn.textContent = rep.title;
    tabBtn.addEventListener("click", () => {
      activeReportIndex = idx;
      selectedCommunityId = "";
      renderInformesPage();
    });
    tabWrap.appendChild(tabBtn);
  });
  root.appendChild(tabWrap);

  const report = REPORTS[activeReportIndex];

  // 3. Barra de filtros y herramientas
  const toolbar = document.createElement("div");
  toolbar.className = "reports-toolbar";

  // Filtro de comunidad (no aplica al informe de comparativa, que siempre es global)
  if (report.id !== "report_comparison") {
    const commWrap = document.createElement("label");
    commWrap.className = "reports-filter-label";
    commWrap.innerHTML = `<span>Comunidad:</span>`;

    const commSelect = document.createElement("select");
    commSelect.className = "filter-select";
    commSelect.add(new Option("Todas las comunidades", ""));
    (state.communities || []).forEach((c) => {
      commSelect.add(new Option(c.name, c.id));
    });
    commSelect.value = selectedCommunityId;
    commSelect.addEventListener("change", () => {
      selectedCommunityId = commSelect.value;
      fetchReportRows(report.id, selectedCommunityId);
    });
    commWrap.appendChild(commSelect);
    toolbar.appendChild(commWrap);
  }

  // Buscador de texto
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "table-search-input";
  searchInput.placeholder = "Buscar en el informe…";
  toolbar.appendChild(searchInput);

  // Botón de exportación
  const exportBtn = createExportDropdown({
    tableId: report.id,
    permission: "reports:export",
    getView: () => dataTableInstance?.getExportState(),
    getFilters: () => ({ communityId: selectedCommunityId }),
  });
  if (exportBtn) toolbar.appendChild(exportBtn);

  root.appendChild(toolbar);

  // 4. Tarjeta de metadatos y fórmulas
  const metaCard = document.createElement("div");
  metaCard.className = "reports-meta-card";
  const user = getCurrentUser();
  metaCard.innerHTML = `
    <div class="reports-meta-grid">
      <div><strong>Informe:</strong> ${report.title}</div>
      <div><strong>Fórmulas aplicadas:</strong> ${report.formulas}</div>
      <div><strong>Unidades:</strong> ${report.units}</div>
      <div><strong>Fuente:</strong> ${report.source}</div>
      <div><strong>Usuario / Rol:</strong> ${h(user?.nombre || user?.usuario || "Usuario")} (${h(user?.rol || "")})</div>
    </div>
  `;
  root.appendChild(metaCard);
  const loadStatus = document.createElement("p");
  loadStatus.id = "report-load-status";
  loadStatus.setAttribute("role", "status");
  root.append(loadStatus);

  // 5. Contenedor de la tabla
  const tableContainer = document.createElement("div");
  tableContainer.className = "reports-table-mount";
  root.appendChild(tableContainer);

  dataTableInstance = createDataTable({
    mount: tableContainer,
    storageKey: `informe-${report.id}`,
    columns: report.columns,
    getRows: () => (loadingRows ? [] : cachedRows),
    searchInput,
    entitySingular: "registro",
    entityPlural: "registros",
    emptyTitle: "Sin datos para este informe",
    emptyText: "Ajusta los filtros o verifica que existan datos registrados.",
  });

  // Carga inicial de datos desde el servidor
  fetchReportRows(report.id, selectedCommunityId);
}
