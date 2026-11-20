import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const html = readFileSync("public/index.html", "utf8");
const source = readFileSync("public/js/features/informes.js", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

function fixture(rows) {
  const dom = new JSDOM(html, { url: "http://localhost/informes", runScripts: "outside-only" }),
    w = dom.window,
    root = w.document.querySelector("#informes-page"),
    fetched = [];
  assert.ok(root, "Falta #informes-page en index.html");
  Object.assign(w, {
    state: { communities: [{ id: "c1", name: "Comunidad Uno" }], currentUserId: "u1" },
    getCurrentUser: () => ({ id: "u1", nombre: "Prueba", rol: "super_admin" }),
    hasPermission: () => true,
    createExportDropdown: () => {
      const node = w.document.createElement("button");
      node.textContent = "Exportar";
      return node;
    },
    createDataTable: () => ({
      refresh() {},
      setExportControl() {},
      getExportState: () => ({}),
    }),
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ rows }) };
    },
  });
  vm.runInContext(source + "\nwindow.reportsTest={renderInformesPage};", dom.getInternalVMContext());
  return { dom, w, root, fetched };
}

test("informes UI: el gráfico de suministros cuenta las facturas de cada comunidad", async () => {
  const f = fixture([
    { communityName: "Comunidad Uno", billAmount: 10000 },
    { communityName: "Comunidad Uno", billAmount: 5000 },
    { communityName: "Comunidad Dos", billAmount: 2000 },
  ]);
  try {
    f.w.reportsTest.renderInformesPage();
    await flush();
    const tab = [...f.root.querySelectorAll(".reports-tab-btn")].find((b) =>
      /Suministros/.test(b.textContent),
    );
    assert.ok(tab, "Falta la pestaña de suministros");
    tab.click();
    await flush();
    const bars = [...f.root.querySelectorAll(".reports-bar-row")];
    assert.equal(bars.length, 2);
    assert.match(bars[0].title, /Comunidad Uno/);
    assert.match(bars[0].title, /2 facturas/);
    assert.match(bars[1].title, /1 factura\b/);
    assert.equal(
      bars.some((bar) => /undefined/.test(bar.title)),
      false,
    );
    assert.equal(f.root.querySelectorAll(".reports-insights-error").length, 0);
  } finally {
    f.dom.window.close();
  }
});
