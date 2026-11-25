import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
function source(file) {
  return readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/\bexport (?=(?:async )?function|const)/g, "");
}
test("tablas: exporta todas las filas filtradas antes de paginar y las columnas visibles en su orden", (t) => {
  const dom = new JSDOM('<input id="search"><div id="table"></div>', {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.state = { settings: {} };
  w.sanitizeHtml = (v) => v;
  w.localStorage.setItem(
    "table-engine:export-test",
    JSON.stringify({
      pageSize: 5,
      hidden: ["secret"],
      order: ["score", "name", "secret", "actions"],
    }),
  );
  w.eval(source("public/js/table.js") + "\nwindow.createDataTable=createDataTable;");
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    name: `Persona ${i}`,
    score: 12 - i,
  }));
  const table = w.createDataTable({
    mount: w.document.querySelector("#table"),
    storageKey: "export-test",
    searchInput: w.document.querySelector("#search"),
    getRows: () => rows,
    columns: [
      { key: "name", label: "Nombre", defaultVisible: true, value: (r) => r.name },
      { key: "score", label: "Puntos", defaultVisible: true, value: (r) => r.score },
      { key: "secret", label: "Oculta", defaultVisible: true, value: () => "" },
      { key: "actions", label: "Acciones", hideable: false, value: () => "" },
    ],
  });
  let snapshot = JSON.parse(JSON.stringify(table.getExportState()));
  assert.equal(snapshot.itemIds.length, 12);
  assert.deepEqual(snapshot.columns, ["score", "name"]);
  const exportControl = w.document.createElement("div");
  exportControl.className = "table-export-wrap";
  const add = w.document.createElement("button");
  add.id = "add";
  w.document.querySelector(".table-engine-actions").append(add);
  table.setExportControl(exportControl);
  assert.equal(w.document.querySelector(".table-engine-controls").firstElementChild.id, "search");
  assert.equal(w.document.querySelector(".table-engine-actions").firstElementChild, exportControl);
  assert.equal(exportControl.nextElementSibling, add);
  w.document.querySelector('th[data-col="score"] button').click();
  snapshot = JSON.parse(JSON.stringify(table.getExportState()));
  assert.equal(snapshot.itemIds[0], "11");
  assert.deepEqual(snapshot.sort, { key: "score", dir: "asc" });
  const search = w.document.querySelector("#search");
  search.value = "Persona 1";
  search.dispatchEvent(new w.Event("input"));
  snapshot = JSON.parse(JSON.stringify(table.getExportState()));
  assert.deepEqual(snapshot.itemIds, ["11", "10", "1"]);
  const group = w.document.querySelector(".table-engine-group select");
  group.value = "name";
  group.dispatchEvent(new w.Event("change"));
  snapshot = JSON.parse(JSON.stringify(table.getExportState()));
  assert.equal(snapshot.groupBy, "name");
  assert.deepEqual(snapshot.itemIds, ["1", "10", "11"]);
  search.value = "sin resultados";
  assert.deepEqual(Array.from(table.getExportState().itemIds), []);
});
test("exportar: oculta controles sin permiso, manda el estado de la vista y ofrece navegación de teclado", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  let allowed = false,
    body;
  w.state = { currentUserId: "one" };
  w.hasPermission = () => allowed;
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  w.fetch = async (url, opts) => {
    body = JSON.parse(opts.body);
    return {
      ok: true,
      blob: async () => new w.Blob(["csv"]),
      headers: { get: () => 'attachment; filename="test.csv"' },
    };
  };
  w.eval(
    source("public/js/export-client.js") +
      "\nwindow.exportsUI={createExportDropdown,refreshExportControls};",
  );
  assert.equal(w.exportsUI.createExportDropdown({ tableId: "communities" }), null);
  allowed = true;
  const control = w.exportsUI.createExportDropdown({
    tableId: "communities",
    getView: () => ({ itemIds: [], columns: ["name"], filters: { query: "ninguno" }, sort: null }),
  });
  w.document.querySelector("#root").append(control);
  const button = control.querySelector("button");
  assert.equal(button.textContent.trim(), "");
  assert.equal(button.getAttribute("aria-label"), "Exportar");
  button.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(w.document.activeElement.getAttribute("role"), "menuitem");
  control.querySelector('[role="menuitem"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(body.itemIds, []);
  assert.deepEqual(body.columns, ["name"]);
  assert.equal(body.filters.query, "ninguno");
  allowed = false;
  w.exportsUI.refreshExportControls();
  assert.equal(control.hidden, true);
});

test("tablas: Acciones queda última al recuperar preferencias anteriores y al reordenar", (t) => {
  const dom = new JSDOM('<div id="table"></div>', {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.state = { settings: {} };
  w.sanitizeHtml = (v) => v;
  w.localStorage.setItem(
    "table-engine:property-order",
    JSON.stringify({ order: ["plot", "actions"] }),
  );
  w.eval(source("public/js/table.js") + "\nwindow.createDataTable=createDataTable;");
  w.createDataTable({
    mount: w.document.querySelector("#table"),
    storageKey: "property-order",
    getRows: () => [{ id: "one" }],
    columns: [
      { key: "plot", label: "Inmueble", defaultVisible: true, value: () => "Unidad" },
      { key: "occupancy", label: "Ocupación", defaultVisible: true, value: () => "Vacío" },
      { key: "actions", label: "Acciones", hideable: false, value: () => "Abrir" },
    ],
  });
  const order = () => [...w.document.querySelectorAll("thead th")].map((th) => th.dataset.col);
  assert.deepEqual(order(), ["plot", "occupancy", "actions"]);
  assert.equal(w.document.querySelector('th[data-col="actions"]').draggable, false);
  const transfer = { setData() {}, effectAllowed: "" };
  const drag = new w.Event("dragstart", { bubbles: true });
  Object.defineProperty(drag, "dataTransfer", { value: transfer });
  w.document.querySelector('th[data-col="plot"]').dispatchEvent(drag);
  const drop = new w.Event("drop", { bubbles: true });
  w.document.querySelector('th[data-col="actions"]').dispatchEvent(drop);
  assert.deepEqual(order(), ["occupancy", "plot", "actions"]);
  assert.deepEqual(JSON.parse(w.localStorage.getItem("table-engine:property-order")).order, [
    "occupancy",
    "plot",
    "actions",
  ]);
});
