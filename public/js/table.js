import { sanitizeHtml } from "./html.js";
/**
 * Motor de tablas reutilizable: orden por columna, filtro único de texto,
 * agrupación, mostrar/ocultar columnas y paginación compacta con iconos.
 *
 * Uso:
 *   const table = createDataTable({ mount, columns, getRows, countEl, searchInput, ... });
 *   table.refresh();
 *
 * columns: [{ key, label, value, render, defaultVisible, hideable, sortable, groupable }]
 *   - value(row): texto usado para ordenar, agrupar y filtrar (siempre texto plano).
 *   - render(row): devuelve un Node o string HTML para la celda (opcional; por defecto el texto).
 */

import { state } from "./state.js";

const COLLATOR = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

const ICON_CHEVRON_LEFT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
const ICON_CHEVRON_RIGHT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
const ICON_CHEVRON_DOWN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createDataTable(options) {
  const tabla = crearInstancia(options);
  // Registro para aplicar en vivo «Filas por página» desde Configuración.
  instancias.add(tabla);
  return tabla;
}

const instancias = new Set();

export function aplicarFilasPorPagina(filas) {
  const valor = Number(filas);
  if (!valor) return;
  instancias.forEach(tabla => tabla.setPageSize?.(valor));
}

function crearInstancia(options) {
  const {
    mount,
    columns,
    getRows,
    searchInput = null,
    countEl = null,
    entitySingular = "registro",
    entityPlural = "registros",
    pageSizeOptions = [5, 10, 25],
    defaultPageSize = 5,
    emptyTitle = "No hay registros que mostrar",
    emptyText = "Crea un registro o ajusta los criterios de búsqueda."
  } = options;

  if (!mount) throw new Error("createDataTable: falta el elemento mount.");
  if (!Array.isArray(columns) || columns.length === 0) throw new Error("createDataTable: faltan columnas.");

  // --- Estado ---
  // Sólo son visibles por defecto las columnas con defaultVisible === true;
  // las no ocultables (acciones) se fuerzan visibles.
  const visible = new Map(columns.map(col => [col.key, col.hideable === false ? true : col.defaultVisible === true]));
  const storageKey = options.storageKey ? `table-engine:${options.storageKey}` : null;
  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (Array.isArray(saved.hidden)) {
        saved.hidden.forEach(key => {
          const col = columns.find(item => item.key === key);
          if (col && col.hideable !== false) visible.set(key, false);
        });
      }
      if (saved.pageSize && pageSizeOptions.includes(Number(saved.pageSize))) {
        pageSize = Number(saved.pageSize);
      }
    } catch {
      /* preferencias corruptas: se ignoran */
    }
  }
  const persistState = () => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        hidden: columns.filter(col => col.hideable !== false && !visible.get(col.key)).map(col => col.key),
        pageSize,
        order: columnOrder
      }));
    } catch {
      /* almacenamiento no disponible */
    }
  };

  // Orden de columnas (reordenable arrastrando los encabezados)
  const byKey = new Map(columns.map(col => [col.key, col]));
  let columnOrder = columns.map(col => col.key);
  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (Array.isArray(saved.order)) {
        const valid = saved.order.filter(key => byKey.has(key));
        const missing = columns.map(col => col.key).filter(key => !valid.includes(key));
        columnOrder = [...valid, ...missing];
      }
    } catch {
      /* preferencias corruptas: se ignoran */
    }
  }
  const orderedColumns = () => columnOrder.map(key => byKey.get(key));
  const sortableKeys = new Set(columns.filter(col => col.sortable !== false && col.hideable !== false).map(col => col.key));
  const groupableCols = columns.filter(col => col.groupable !== false && col.hideable !== false);
  let sortKey = null;
  let sortDir = "asc";
  let groupKey = "";
  let page = 1;
  let pageSize = defaultPageSize;
  if (state.settings?.filasPorPagina && pageSizeOptions.includes(Number(state.settings.filasPorPagina)) && !options.defaultPageSize) {
    pageSize = Number(state.settings.filasPorPagina);
  }

  // --- Construcción del DOM ---
  mount.classList.add("table-engine");
  mount.replaceChildren();

  // Barra de controles: Agrupar por + Columnas
  const controls = el("div", "table-engine-controls");
  const groupLabel = el("label", "table-engine-group");
  groupLabel.append(el("span", null, "Agrupar por"));
  const groupSelect = el("select", "filter-select");
  groupSelect.append(new Option("Sin agrupación", ""));
  groupableCols.forEach(col => groupSelect.add(new Option(col.label, col.key)));
  groupLabel.append(groupSelect);
  controls.append(groupLabel);

  const columnsWrap = el("div", "table-columns-wrap");
  const columnsBtn = el("button", "table-columns-btn");
  columnsBtn.type = "button";
  columnsBtn.append(el("span", null, "Columnas"));
  columnsBtn.insertAdjacentHTML("beforeend", sanitizeHtml(ICON_CHEVRON_DOWN));
  const columnsMenu = el("div", "table-columns-menu");
  columnsMenu.hidden = true;
  columnsWrap.append(columnsBtn, columnsMenu);
  controls.append(columnsWrap);
  mount.append(controls);

  // Tabla
  const tableWrap = el("div", "table-wrap");
  const table = el("table");
  table.classList.add("data-table");
  const thead = el("thead");
  const headRow = el("tr");
  const tbody = el("tbody");
  thead.append(headRow);
  table.append(thead, tbody);
  tableWrap.append(table);

  let dragKey = null;

  function buildHead() {
    headRow.replaceChildren();
    orderedColumns().forEach(col => {
      const th = el("th");
      th.dataset.col = col.key;
      if (!visible.get(col.key)) th.hidden = true;
      const labelNode = col.srOnlyLabel ? el("span", "sr-only", col.label) : el("span", "th-sort-label", col.label);
      if (sortableKeys.has(col.key)) {
        const btn = el("button", "th-sort-btn");
        btn.type = "button";
        btn.append(labelNode);
        const indicator = el("span", "sort-ind", "↕");
        btn.append(indicator);
        btn.addEventListener("click", () => {
          if (sortKey !== col.key) {
            sortKey = col.key;
            sortDir = "asc";
          } else if (sortDir === "asc") {
            sortDir = "desc";
          } else {
            sortKey = null;
            sortDir = "asc";
          }
          refresh();
        });
        th.append(btn);
        th.classList.add("th-sortable");
      } else {
        th.append(labelNode);
      }
      // Reordenar columnas arrastrando el encabezado
      th.draggable = true;
      th.title = "Arrastrá para reordenar columnas";
      th.addEventListener("dragstart", event => {
        dragKey = col.key;
        event.dataTransfer.effectAllowed = "move";
        try { event.dataTransfer.setData("text/plain", col.key); } catch { /* IE */ }
        th.classList.add("th-dragging");
      });
      th.addEventListener("dragend", () => {
        dragKey = null;
        headRow.querySelectorAll(".th-drag-over").forEach(node => node.classList.remove("th-drag-over"));
        th.classList.remove("th-dragging");
      });
      th.addEventListener("dragover", event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dragKey && dragKey !== col.key) th.classList.add("th-drag-over");
      });
      th.addEventListener("dragleave", () => th.classList.remove("th-drag-over"));
      th.addEventListener("drop", event => {
        event.preventDefault();
        th.classList.remove("th-drag-over");
        if (!dragKey || dragKey === col.key) return;
        const from = columnOrder.indexOf(dragKey);
        const to = columnOrder.indexOf(col.key);
        if (from < 0 || to < 0) return;
        columnOrder.splice(to, 0, columnOrder.splice(from, 1)[0]);
        dragKey = null;
        persistState();
        refresh();
      });
      headRow.append(th);
    });
  }

  const emptyState = el("div", "empty-state");
  emptyState.hidden = true;
  emptyState.append(el("h2", null, emptyTitle), el("p", null, emptyText));
  tableWrap.append(emptyState);
  mount.append(tableWrap);

  // Pie: tamaño de página + info + paginador compacto
  const footer = el("div", "table-engine-footer");
  const sizeLabel = el("label", "table-page-size");
  sizeLabel.append(el("span", null, "Mostrar"));
  const sizeSelect = el("select", "pagination-select");
  pageSizeOptions.forEach(size => sizeSelect.add(new Option(String(size), String(size))));
  sizeSelect.value = String(pageSize);
  sizeLabel.append(sizeSelect, el("span", null, "por página"));
  footer.append(sizeLabel);

  const info = el("span", "table-info");
  footer.append(info);

  const pager = el("nav", "table-pager");
  pager.setAttribute("aria-label", "Paginación");
  const prevBtn = el("button", "pager-btn");
  prevBtn.type = "button";
  prevBtn.innerHTML = sanitizeHtml(ICON_CHEVRON_LEFT);
  prevBtn.setAttribute("aria-label", "Página anterior");
  const nextBtn = el("button", "pager-btn");
  nextBtn.type = "button";
  nextBtn.innerHTML = sanitizeHtml(ICON_CHEVRON_RIGHT);
  nextBtn.setAttribute("aria-label", "Página siguiente");
  pager.append(prevBtn);
  footer.append(pager);
  mount.append(footer);

  // --- Menú de columnas ---
  columns.forEach(col => {
    if (col.hideable === false) return;
    const item = el("label", "table-column-item");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visible.get(col.key);
    checkbox.addEventListener("change", () => {
      visible.set(col.key, checkbox.checked);
      persistState();
      refresh();
    });
    item.append(checkbox, el("span", null, col.label));
    columnsMenu.append(item);
  });
  columnsBtn.addEventListener("click", () => {
    columnsMenu.hidden = !columnsMenu.hidden;
  });
  document.addEventListener("click", event => {
    if (!columnsMenu.hidden && !columnsWrap.contains(event.target)) columnsMenu.hidden = true;
  });

  groupSelect.addEventListener("change", () => {
    groupKey = groupSelect.value;
    refresh();
  });

  sizeSelect.addEventListener("change", () => {
    pageSize = Number(sizeSelect.value);
    page = 1;
    persistState();
    refresh();
  });

  prevBtn.addEventListener("click", () => {
    if (page > 1) {
      page--;
      refresh();
    }
  });

  nextBtn.addEventListener("click", () => {
    // totalPages se recalcula dentro de refresh; usamos el último valor conocido
    if (page < lastTotalPages) {
      page++;
      refresh();
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      page = 1;
      refresh();
    });
  }

  let lastTotalPages = 1;

  function currentQuery() {
    return searchInput ? searchInput.value.trim().toLocaleLowerCase("es") : "";
  }

  function columnValue(col, row) {
    return String(col.value ? col.value(row) : "").toLocaleLowerCase("es");
  }

  function refresh() {
    const allRows = getRows() || [];
    const query = currentQuery();

    // 1. Filtro único de texto sobre todas las columnas
    let rows = allRows;
    if (query) {
      rows = rows.filter(row => columns.some(col => columnValue(col, row).includes(query)));
    }

    // 2. Orden
    if (sortKey) {
      const col = columns.find(item => item.key === sortKey);
      const factor = sortDir === "desc" ? -1 : 1;
      rows = rows.slice().sort((a, b) => factor * COLLATOR.compare(String(col.value ? col.value(a) : ""), String(col.value ? col.value(b) : "")));
    }

    // 3. Paginación (sobre las filas filtradas; la agrupación se aplica dentro de la página)
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    lastTotalPages = totalPages;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const start = (page - 1) * pageSize;
    const pagedRows = rows.slice(start, start + pageSize);

    // 4. Render de celdas
    tbody.replaceChildren();
    const visibleCols = orderedColumns().filter(col => visible.get(col.key));

    if (totalItems === 0) {
      emptyState.hidden = false;
      tableWrap.classList.add("is-empty");
    } else {
      emptyState.hidden = true;
      tableWrap.classList.remove("is-empty");
    }

    if (groupKey) {
      const groupCol = columns.find(item => item.key === groupKey);
      const groups = new Map();
      pagedRows.forEach(row => {
        const rawValue = groupCol.value ? groupCol.value(row) : "";
        const key = rawValue || "—";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      const orderedKeys = [...groups.keys()].sort((a, b) => COLLATOR.compare(a, b));
      orderedKeys.forEach(key => {
        const groupRows = groups.get(key);
        const groupRow = el("tr", "table-group-row");
        const cell = el("td");
        cell.colSpan = String(visibleCols.length);
        cell.append(
          el("span", "table-group-label", key),
          el("span", "table-group-count", `${groupRows.length} ${groupRows.length === 1 ? entitySingular : entityPlural}`)
        );
        groupRow.append(cell);
        tbody.append(groupRow);
        groupRows.forEach(row => tbody.append(buildRow(row, visibleCols)));
      });
    } else {
      pagedRows.forEach(row => tbody.append(buildRow(row, visibleCols)));
    }

    // Visibilidad y orden de columnas en el thead
    buildHead();
    columns.forEach(col => {
      const th = thead.querySelector(`th[data-col="${col.key}"]`);
      if (th) th.hidden = !visible.get(col.key);
    });

    // 5. Pie de tabla
    const shown = pagedRows.length;
    info.textContent = totalItems === 0
      ? `Sin ${entityPlural}`
      : `Mostrando ${start + 1}–${start + shown} de ${totalItems} ${totalItems === 1 ? entitySingular : entityPlural}`;
    sizeLabel.style.visibility = totalItems === 0 ? "hidden" : "visible";
    pager.style.visibility = totalItems === 0 || totalPages <= 1 ? "hidden" : "visible";

    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    pager.querySelectorAll(".pager-page").forEach(node => node.remove());
    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = el("button", "pager-btn pager-page", String(i));
      pageBtn.type = "button";
      pageBtn.setAttribute("aria-label", `Página ${i}`);
      if (i === page) pageBtn.classList.add("active");
      pageBtn.addEventListener("click", () => {
        page = i;
        refresh();
      });
      pager.append(pageBtn);
    }

    // Indicadores de orden
    thead.querySelectorAll("th.th-sortable").forEach(th => {
      const indicator = th.querySelector(".sort-ind");
      if (!indicator) return;
      if (th.dataset.col === sortKey) {
        indicator.textContent = sortDir === "asc" ? "↑" : "↓";
        indicator.classList.add("active");
      } else {
        indicator.textContent = "↕";
        indicator.classList.remove("active");
      }
    });

    // 6. Contador externo (resultado de la búsqueda)
    if (countEl) {
      countEl.textContent = `${allRows.length === 0 ? 0 : rows.length} ${rows.length === 1 ? entitySingular : entityPlural}`;
    }
  }

  function buildRow(row, visibleCols) {
    const tr = el("tr");
    visibleCols.forEach(col => {
      const td = el("td");
      const rendered = col.render ? col.render(row) : null;
      if (rendered instanceof Node) {
        td.append(rendered);
      } else if (typeof rendered === "string") {
        td.innerHTML = sanitizeHtml(rendered);
      } else {
        td.textContent = col.value ? col.value(row) : "";
      }
      tr.append(td);
    });
    return tr;
  }

  refresh();

  const tabla = {
    refresh,
    setPageSize(size) {
      if (!pageSizeOptions.includes(Number(size))) return;
      pageSize = Number(size);
      page = 1;
      sizeSelect.value = String(pageSize);
      refresh();
    }
  };
  return tabla;
}
