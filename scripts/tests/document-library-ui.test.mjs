import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const source = readFileSync("public/js/document-library.js", "utf8")
  .replace(/^import[^\n]*\n/gm, "")
  .replace(/\bexport (?=(async )?function)/g, "");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t, folders = [], extra = {}) {
  for (const folder of folders) folder.parentId ??= "";
  const dom = new JSDOM('<div id="library"></div>', {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window,
    calls = [],
    root = w.document.querySelector("#library");
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.h = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  w.createExportDropdown = () => null;
  w.toast = () => {};
  w.validateDocumentFiles = () => null;
  w.api = {
    createDocumentFolder: async (payload) => {
      calls.push(payload);
      const row = { id: "new", ...payload };
      folders.push(row);
      return row;
    },
    updateDocumentFolder: async (id, payload) => {
      calls.push({ id, ...payload });
      const row = folders.find((row) => row.id === id);
      Object.assign(row, payload);
      return row;
    },
  };
  w.eval(source + "\nwindow.libraryUI={createDocumentLibrary};");
  const library = w.libraryUI.createDocumentLibrary({
    container: root,
    entityType: "community",
    entityId: "c1",
    canWrite: true,
    ...extra,
    getData: () => ({ folders, documents: extra.documents || [] }),
  });
  return { w, root, library, calls };
}
test("carpetas: permite elegir icono y color y guarda con el botón de disquete", async (t) => {
  const f = fixture(t);
  f.root.querySelector(".doc-library-new-folder").click();
  const dialog = f.w.document.querySelector("dialog");
  assert.equal(dialog.querySelectorAll("[data-folder-icon]").length, 20);
  assert.equal(dialog.querySelectorAll("[data-folder-color]").length, 10);
  dialog.querySelector("[name=library-name]").value = "Contratos";
  dialog.querySelector('[data-folder-icon="contract"]').click();
  dialog.querySelector('[data-folder-color="violet"]').click();
  const save = dialog.querySelector("[data-library-dialog-submit]");
  assert.match(save.innerHTML, /M17 21v-8H7v8/);
  save.click();
  await flush();
  assert.equal(f.calls[0].icon, "contract");
  assert.equal(f.calls[0].color, "violet");
  assert.equal(f.root.querySelector('[data-folder-id="new"]').dataset.folderColor, "violet");
});
test("carpetas: editar conserva el color y los selectores admiten navegación con teclado", async (t) => {
  const f = fixture(t, [{ id: "f1", name: "Actas", icon: "legal", color: "blue" }]);
  f.root.querySelector('[data-library-action="rename"]').click();
  const dialog = f.w.document.querySelector("dialog"),
    blue = dialog.querySelector('[data-folder-color="blue"]');
  assert.equal(blue.getAttribute("aria-checked"), "true");
  blue.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(
    dialog.querySelector('[data-folder-color="indigo"]').getAttribute("aria-checked"),
    "true",
  );
  dialog.querySelector("[data-library-dialog-submit]").click();
  await flush();
  assert.equal(f.calls[0].id, "f1");
  assert.equal(f.calls[0].color, "indigo");
  assert.equal(f.calls[0].icon, "legal");
});
test("documentación: eliminar exige document:delete aunque se pueda subir", (t) => {
  const doc = {
    id: "d1",
    fileName: "acta.pdf",
    size: 1024,
    uploadedAt: "2026-01-01T10:00:00.000Z",
    url: "/api/documents/d1/download",
  };
  const writable = fixture(t, [], { documents: [doc] });
  assert.ok(writable.root.querySelector('[data-library-action="delete"]'));
  const uploader = fixture(t, [], { canDelete: () => false, documents: [doc] });
  assert.ok(uploader.root.querySelector('[data-library-action="rename"]'));
  assert.ok(uploader.root.querySelector('[data-library-action="replace"]'));
  assert.equal(uploader.root.querySelector('[data-library-action="delete"]'), null);
});
test("documentación: la ruta identifica la carpeta principal y permite volver a ella", (t) => {
  const f = fixture(t, [{ id: "f1", name: "Actas", icon: "folder" }]);
  assert.match(f.root.querySelector(".doc-library-pathbar").textContent, /Ubicación actual/);
  assert.equal(f.root.querySelector('[aria-current="page"]').textContent, "Carpeta principal");
  f.root.querySelector("[data-library-open-folder]").click();
  assert.equal(f.library.currentFolderId, "f1");
  assert.equal(f.root.querySelector('[aria-current="page"]').textContent, "Actas");
  f.root.querySelector(".doc-library-crumb").click();
  assert.equal(f.library.currentFolderId, "");
});
