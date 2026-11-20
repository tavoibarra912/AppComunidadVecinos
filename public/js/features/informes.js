import { state, getCurrentUser, hasPermission } from "../state.js";
import { createDataTable } from "../table.js";
import { createExportDropdown } from "../export-client.js";

const REPORTS = [
  {
    id: "report_financial",
    title: "Balance Financiero y Liquidación",
    description:
      "Compara lo que la comunidad ha emitido en cuotas con lo que realmente ha cobrado. Sirve para saber cuánto dinero falta por entrar y qué comunidades cobran mejor.",
    tips: [
      "«Emitido» es la suma de todos los recibos girados; «Cobrado», lo que ya está pagado.",
      "La diferencia es el pendiente de cobro: incluye recibos aún no vencidos y recibos vencidos.",
      "Una tasa de cobro alta (por encima del 90%) indica una gestión financiera saneada.",
    ],
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
    description:
      "Muestra qué inmuebles deben dinero y desde cuándo. Es la lista de trabajo para reclamar recibos vencidos y evitar que la deuda siga creciendo.",
    tips: [
      "Solo aparecen recibos vencidos con importe pendiente; los anulados no cuentan.",
      "La deuda se agrupa por inmueble, con el titular y el periodo más antiguo sin pagar.",
      "Empieza por las deudas con vencimiento más antiguo: son las de mayor riesgo.",
    ],
    formulas: "Deuda acumulada = Suma de importes pendientes de cobro en recibos vencidos",
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
    description:
      "Resume las facturas de suministros (luz, agua, gas…) y cómo se reparten entre los inmuebles. Ayuda a detectar consumos altos y comparar proveedores.",
    tips: [
      "Cada fila es una factura de suministro de una comunidad y un periodo.",
      "El coste unitario permite comparar facturas con consumos distintos.",
      "Los inmuebles afectados indican a cuántas unidades se reparte cada factura.",
    ],
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
    description:
      "Pone a todas las comunidades en la misma tabla: tamaño, importe emitido por inmueble y eficacia del cobro. Sirve para detectar diferencias y compartir buenas prácticas.",
    tips: [
      "La media por inmueble permite comparar comunidades de tamaños muy distintos.",
      "La tasa de cobro muestra qué comunidades cobran con más rapidez.",
      "Los servicios activos indican la carga de gestión de cada comunidad.",
    ],
    formulas:
      "Cuota media por unidad = Total emitido / Total inmuebles; Tasa de cobro = (Cobrado / Emitido) × 100",
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

/** Pinta KPIs y gráfica con los datos ya cargados; lo fija renderInformesPage. */
let insightsPainter = null;

const MONEY = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const NUMBER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const money = (value) => MONEY.format(Number(value) || 0);
const number = (value) => NUMBER.format(Number(value) || 0);
const total = (rows, key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

function byCommunity(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row.communityName || "Sin comunidad";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  return [...groups.entries()].map(([name, list]) => ({ name, rows: list }));
}

const rateTone = (rate) =>
  rate >= 90
    ? "Cobro muy saludable"
    : rate >= 70
      ? "Cobro aceptable"
      : "Conviene reforzar el cobro";

function buildInsights(report, rows) {
  if (report.id === "report_financial") {
    const groups = byCommunity(rows).map((group) => ({
      name: group.name,
      issued: total(group.rows, "issuedTotal"),
      paid: total(group.rows, "paidTotal"),
      pending: total(group.rows, "pendingTotal"),
    }));
    const issued = total(rows, "issuedTotal");
    const paid = total(rows, "paidTotal");
    const pending = total(rows, "pendingTotal");
    const rate = issued > 0 ? (paid / issued) * 100 : 0;
    return {
      kpis: [
        { label: "Total emitido", value: money(issued), hint: "Cuotas y derramas giradas" },
        { label: "Cobrado", value: money(paid), hint: `${rate.toFixed(1)}% del total emitido` },
        {
          label: "Pendiente de cobro",
          value: money(pending),
          hint: pending > 0 ? "Importe aún no cobrado" : "Sin deuda pendiente",
        },
        { label: "Tasa de cobro", value: `${rate.toFixed(1)}%`, hint: rateTone(rate) },
      ],
      chart: {
        title: "Cobrado y pendiente por comunidad",
        description:
          "Cada barra representa el total emitido: el verde es lo ya cobrado y el ámbar lo que queda pendiente.",
        legend: [
          { tone: "paid", label: "Cobrado" },
          { tone: "pending", label: "Pendiente" },
        ],
        bars: groups
          .sort((a, b) => b.issued - a.issued)
          .slice(0, 8)
          .map((group) => ({
            name: group.name,
            total: group.issued,
            parts: [
              { tone: "paid", value: group.paid },
              { tone: "pending", value: group.pending },
            ],
            valueLabel: money(group.issued),
            metaLabel:
              group.issued > 0
                ? `${Math.round((group.paid / group.issued) * 100)}% cobrado`
                : "Sin emitir",
          })),
      },
    };
  }

  if (report.id === "report_arrears") {
    const groups = byCommunity(rows).map((group) => ({
      name: group.name,
      debt: total(group.rows, "debtTotal"),
      count: group.rows.length,
    }));
    const debt = total(rows, "debtTotal");
    const pendingReceipts = total(rows, "pendingReceiptsCount");
    return {
      kpis: [
        { label: "Deuda total", value: money(debt), hint: "Recibos vencidos sin cobrar" },
        {
          label: "Inmuebles afectados",
          value: number(rows.length),
          hint: rows.length === 1 ? "Un inmueble con deuda" : "Inmuebles con deuda",
        },
        { label: "Recibos pendientes", value: number(pendingReceipts), hint: "Recibos vencidos" },
        {
          label: "Deuda media",
          value: money(rows.length ? debt / rows.length : 0),
          hint: "Por inmueble afectado",
        },
      ],
      chart: {
        title: "Deuda pendiente por comunidad",
        description: "Cuanto más larga es la barra, mayor es el importe vencido y sin cobrar.",
        legend: [{ tone: "debt", label: "Deuda vencida" }],
        bars: groups
          .sort((a, b) => b.debt - a.debt)
          .slice(0, 8)
          .map((group) => ({
            name: group.name,
            total: group.debt,
            parts: [{ tone: "debt", value: group.debt }],
            valueLabel: money(group.debt),
            metaLabel: `${group.count} ${group.count === 1 ? "inmueble" : "inmuebles"}`,
          })),
      },
    };
  }

  if (report.id === "report_services") {
    const groups = byCommunity(rows).map((group) => ({
      name: group.name,
      amount: total(group.rows, "billAmount"),
      // El número de facturas se usa al dibujar cada barra: sin este dato el
      // gráfico lanzaba «group.rows is undefined».
      count: group.rows.length,
    }));
    const amount = total(rows, "billAmount");
    const consumption = total(rows, "totalConsumption");
    const providers = new Set(
      rows.map((row) => row.provider).filter((value) => value && value !== "—"),
    );
    return {
      kpis: [
        { label: "Importe facturado", value: money(amount), hint: "Suministros del periodo" },
        { label: "Facturas registradas", value: number(rows.length), hint: "Una fila por factura" },
        {
          label: "Consumo total",
          value: number(consumption),
          hint: "Unidades registradas en los contadores",
        },
        {
          label: "Proveedores",
          value: number(providers.size),
          hint: "Compañías con facturas registradas",
        },
      ],
      chart: {
        title: "Importe facturado por comunidad",
        description:
          "Compara el gasto en suministros de cada comunidad. Pasa el cursor por una barra para ver su detalle.",
        legend: [{ tone: "info", label: "Importe facturado" }],
        bars: groups
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8)
          .map((group) => ({
            name: group.name,
            total: group.amount,
            parts: [{ tone: "info", value: group.amount }],
            valueLabel: money(group.amount),
            metaLabel: `${group.count} ${group.count === 1 ? "factura" : "facturas"}`,
          })),
      },
    };
  }

  const averageRate = rows.length
    ? rows.reduce((sum, row) => sum + (Number(row.collectionRate) || 0), 0) / rows.length
    : 0;
  return {
    kpis: [
      { label: "Comunidades", value: number(rows.length), hint: "Con datos consolidados" },
      {
        label: "Inmuebles",
        value: number(total(rows, "propertiesCount")),
        hint: "Unidades en las comunidades",
      },
      { label: "Total emitido", value: money(total(rows, "totalIssued")), hint: "Cuotas giradas" },
      {
        label: "Tasa media de cobro",
        value: `${averageRate.toFixed(1)}%`,
        hint: rateTone(averageRate),
      },
    ],
    chart: {
      title: "Tasa de cobro por comunidad",
      description:
        "Cada barra muestra el porcentaje del importe emitido que ya está cobrado. El 100% significa que no queda deuda.",
      legend: [{ tone: "rate", label: "Tasa de cobro" }],
      max: 100,
      keepZero: true,
      bars: rows
        .slice()
        .sort((a, b) => (Number(b.collectionRate) || 0) - (Number(a.collectionRate) || 0))
        .slice(0, 8)
        .map((row) => ({
          name: row.communityName,
          total: Number(row.collectionRate) || 0,
          parts: [{ tone: "rate", value: Number(row.collectionRate) || 0 }],
          valueLabel: `${(Number(row.collectionRate) || 0).toFixed(1)}%`,
          metaLabel: `${money(row.totalIssued)} emitidos`,
        })),
    },
  };
}

function kpiCard({ label, value, hint }) {
  const card = document.createElement("article");
  card.className = "reports-kpi";
  const labelEl = document.createElement("span");
  labelEl.className = "reports-kpi-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.className = "reports-kpi-value";
  valueEl.textContent = value;
  const hintEl = document.createElement("span");
  hintEl.className = "reports-kpi-hint";
  hintEl.textContent = hint;
  card.append(labelEl, valueEl, hintEl);
  return card;
}

function chartPanel(chart) {
  const panel = document.createElement("section");
  panel.className = "reports-chart";
  const head = document.createElement("div");
  head.className = "reports-chart-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = chart.title;
  const description = document.createElement("p");
  description.textContent = chart.description;
  titleWrap.append(title, description);
  head.append(titleWrap);
  if (chart.legend?.length) {
    const legend = document.createElement("div");
    legend.className = "reports-chart-legend";
    chart.legend.forEach((item) => {
      const chip = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = `reports-legend-dot reports-legend-dot--${item.tone}`;
      dot.setAttribute("aria-hidden", "true");
      chip.append(dot, document.createTextNode(item.label));
      legend.append(chip);
    });
    head.append(legend);
  }
  panel.append(head);

  const bars = chart.keepZero ? chart.bars : chart.bars.filter((bar) => bar.total > 0);
  if (!bars.length) {
    const empty = document.createElement("p");
    empty.className = "reports-chart-empty";
    empty.textContent =
      "Todavía no hay datos suficientes para dibujar la gráfica. Cuando existan registros aparecerán aquí.";
    panel.append(empty);
    return panel;
  }

  const max = chart.max || Math.max(...bars.map((bar) => bar.total), 1);
  const list = document.createElement("div");
  list.className = "reports-bars";
  bars.forEach((bar) => {
    const row = document.createElement("div");
    row.className = "reports-bar-row";
    row.title = `${bar.name}: ${bar.valueLabel}${bar.metaLabel ? ` · ${bar.metaLabel}` : ""}`;

    const name = document.createElement("span");
    name.className = "reports-bar-name";
    name.textContent = bar.name;

    const track = document.createElement("div");
    track.className = "reports-bar-track";
    const stack = document.createElement("div");
    stack.className = "reports-bar-stack";
    stack.style.width = bar.total > 0 ? `${Math.max((bar.total / max) * 100, 2)}%` : "0%";
    bar.parts.forEach((part) => {
      if (!(part.value > 0) || !(bar.total > 0)) return;
      const fill = document.createElement("span");
      fill.className = `reports-bar-fill reports-bar-fill--${part.tone}`;
      fill.style.width = `${(part.value / bar.total) * 100}%`;
      stack.append(fill);
    });
    track.append(stack);

    const value = document.createElement("span");
    value.className = "reports-bar-value";
    value.textContent = bar.valueLabel;
    if (bar.metaLabel) {
      const meta = document.createElement("small");
      meta.textContent = bar.metaLabel;
      value.append(meta);
    }

    row.append(name, track, value);
    list.append(row);
  });
  panel.append(list);
  return panel;
}

function paintInsights(container, report) {
  container.replaceChildren();
  if (loadingRows) {
    const loading = document.createElement("p");
    loading.className = "reports-insights-status";
    loading.textContent = "Cargando datos del informe…";
    container.append(loading);
    return;
  }
  if (reportError) {
    const error = document.createElement("div");
    error.className = "reports-insights-error";
    const message = document.createElement("p");
    message.textContent = `No se pudieron cargar los datos: ${reportError}`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary-button";
    retry.textContent = "Reintentar";
    retry.addEventListener("click", () => fetchReportRows(report.id, selectedCommunityId));
    error.append(message, retry);
    container.append(error);
    return;
  }
  const insights = buildInsights(report, cachedRows);
  const kpis = document.createElement("div");
  kpis.className = "reports-kpis";
  insights.kpis.forEach((kpi) => kpis.append(kpiCard(kpi)));
  container.append(kpis);
  if (insights.chart) container.append(chartPanel(insights.chart));
}

/**
 * Carga las filas del informe activo desde el endpoint de preview del servidor.
 * Actualiza la tabla y los indicadores al completar.
 */
async function fetchReportRows(reportId, communityId) {
  const requestId = ++reportRequest,
    userId = state.currentUserId;
  loadingRows = true;
  reportError = "";
  const loadingStatus = document.querySelector("#report-load-status");
  if (loadingStatus) loadingStatus.textContent = "";
  cachedRows = [];
  if (dataTableInstance) dataTableInstance.refresh();
  insightsPainter?.();

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
  } catch (err) {
    if (requestId !== reportRequest || state.currentUserId !== userId) return;
    reportError = err.message;
    cachedRows = [];
    console.warn("[informes] No se pudieron cargar los datos del informe:", err.message);
  } finally {
    if (requestId !== reportRequest || state.currentUserId !== userId) return;
    loadingRows = false;
    if (dataTableInstance) dataTableInstance.refresh();
    insightsPainter?.();
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
  loadingRows = true;
  reportError = "";
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
      <p class="page-subtitle">Resúmenes claros de la situación financiera, la morosidad, los suministros y las diferencias entre comunidades.</p>
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

  root.appendChild(toolbar);

  // 4. Guía en lenguaje claro + detalle de cálculo
  const guide = document.createElement("section");
  guide.className = "reports-guide";
  guide.innerHTML = `
    <div class="reports-guide-copy">
      <h2>¿Qué muestra este informe?</h2>
      <p class="reports-guide-lead"></p>
      <ul class="reports-guide-tips"></ul>
      <details class="reports-guide-more">
        <summary>Cómo se calcula y de dónde salen los datos</summary>
        <p><strong>Fórmula:</strong> <span data-guide="formula"></span></p>
        <p><strong>Unidades:</strong> <span data-guide="units"></span></p>
        <p><strong>Fuente:</strong> <span data-guide="source"></span></p>
        <p><strong>Consulta realizada por:</strong> <span data-guide="user"></span></p>
      </details>
    </div>
  `;
  guide.querySelector(".reports-guide-lead").textContent = report.description;
  const tips = guide.querySelector(".reports-guide-tips");
  report.tips.forEach((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    tips.append(item);
  });
  guide.querySelector('[data-guide="formula"]').textContent = report.formulas;
  guide.querySelector('[data-guide="units"]').textContent = report.units;
  guide.querySelector('[data-guide="source"]').textContent = report.source;
  const user = getCurrentUser();
  guide.querySelector('[data-guide="user"]').textContent =
    `${user?.nombre || user?.usuario || "Usuario"} (${user?.rol || "—"})`;
  root.appendChild(guide);

  const loadStatus = document.createElement("p");
  loadStatus.id = "report-load-status";
  loadStatus.className = "reports-status";
  loadStatus.setAttribute("role", "status");
  root.append(loadStatus);

  // 5. Indicadores y gráfica
  const insights = document.createElement("div");
  insights.className = "reports-insights";
  root.appendChild(insights);
  insightsPainter = () => paintInsights(insights, report);

  // 6. Contenedor de la tabla (detalle completo)
  const tableHeading = document.createElement("div");
  tableHeading.className = "reports-table-heading";
  tableHeading.innerHTML = `
    <div>
      <h2>Detalle completo</h2>
      <p>Consulta, ordena, agrupa y exporta todas las filas del informe.</p>
    </div>
  `;
  root.appendChild(tableHeading);

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

  dataTableInstance.setExportControl(exportBtn);

  // Carga inicial de datos desde el servidor
  insightsPainter();
  fetchReportRows(report.id, selectedCommunityId);
}
