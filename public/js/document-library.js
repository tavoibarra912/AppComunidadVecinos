import { api } from "./api.js";
import { escapeHtml as h } from "./html.js";
import { toast, validateDocumentFiles } from "./utils.js";

const ICONS = {
  folder:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  file:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
  eye:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  download:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
  edit:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
  move:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>',
  trash:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  replace:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
  folderAdd:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>',
  upload:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
};

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};
const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const extensionOf = (name) =>
  String(name || "").split(".").pop()?.toUpperCase() || "ARCHIVO";
const typeLabel = (doc) => extensionOf(doc.fileName);

function pathFor(folders, folderId) {
  const result = [];
  const visited = new Set();
  let current = folders.find((folder) => folder.id === folderId);
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    result.unshift(current);
    current = folders.find((folder) => folder.id === current.parentId);
  }
  return result;
}

function pathLabel(folders, folderId) {
  const path = pathFor(folders, folderId);
  return path.length ? path.map((folder) => folder.name).join(" / ") : "Raíz";
}

function descendants(folders, folderId) {
  const ids = new Set();
  let frontier = [folderId];
  while (frontier.length) {
    const next = [];
    for (const parentId of frontier) {
      for (const folder of folders) {
        if (folder.parentId !== parentId || ids.has(folder.id)) continue;
        ids.add(folder.id);
        next.push(folder.id);
      }
    }
    frontier = next;
  }
  return ids;
}

function closeOnBackdrop(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function makeDialog(title, eyebrow, contentHtml, footerHtml) {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog-sm doc-library-dialog";
  dialog.innerHTML = `<div class="dialog-content">
    <div class="dialog-header">
      <div><p class="eyebrow">${h(eyebrow)}</p><h2>${h(title)}</h2></div>
      <button class="icon-action-btn btn-cancel btn-lg" type="button" data-library-dialog-close aria-label="Cerrar">×</button>
    </div>
    <div class="doc-library-dialog-body">${contentHtml}</div>
    <div class="dialog-actions">${footerHtml}</div>
  </div>`;
  document.body.append(dialog);
  dialog.querySelector("[data-library-dialog-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  closeOnBackdrop(dialog);
  dialog.showModal();
  return dialog;
}

function openTextDialog({ title, eyebrow = "BIBLIOTECA DOCUMENTAL", label, value = "", submitLabel = "Guardar", onSubmit }) {
  const dialog = makeDialog(
    title,
    eyebrow,
    `<label class="full">${h(label)}<input name="library-name" maxlength="180" value="${h(value)}" autocomplete="off" /></label>
     <p class="form-error" role="alert"></p>`,
    `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
     <button class="primary-button" type="button" data-library-dialog-submit>${h(submitLabel)}</button>`,
  );
  const input = dialog.querySelector("[name=library-name]");
  const error = dialog.querySelector(".form-error");
  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Indicá un nombre.";
      input.focus();
      return;
    }
    const button = dialog.querySelector("[data-library-dialog-submit]");
    button.disabled = true;
    try {
      await onSubmit(name);
      dialog.close();
    } catch (exception) {
      error.textContent = exception.message;
      button.disabled = false;
    }
  };
  dialog.querySelectorAll("[data-library-dialog-close]").forEach((button) =>
    button.addEventListener("click", () => dialog.close()),
  );
  dialog.querySelector("[data-library-dialog-submit]").addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  input.focus();
  input.select();
}

function openConfirmDialog({ title, message, confirmLabel = "Eliminar", eyebrow = "CONFIRMAR ACCIÓN" }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const dialog = makeDialog(
      title,
      eyebrow,
      `<p class="form-intro">${message}</p>`,
      `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
       <button class="primary-button doc-library-danger-button" type="button" data-library-dialog-confirm>${h(confirmLabel)}</button>`,
    );
    dialog.querySelectorAll("[data-library-dialog-close]").forEach((button) =>
      button.addEventListener("click", () => dialog.close()),
    );
    dialog.querySelector("[data-library-dialog-confirm]").addEventListener("click", () => {
      confirmed = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => resolve(confirmed), { once: true });
  });
}

function openMoveDialog({ itemLabel, folders, currentFolderId, excludeIds, onSubmit }) {
  const available = folders
    .filter((folder) => !excludeIds.has(folder.id))
    .sort((a, b) => pathLabel(folders, a.id).localeCompare(pathLabel(folders, b.id), "es"));
  const options = [`<option value="">Raíz</option>`]
    .concat(
      available.map(
        (folder) =>
          `<option value="${h(folder.id)}">${h(pathLabel(folders, folder.id))}</option>`,
      ),
    )
    .join("");
  const dialog = makeDialog(
    "Mover a…",
    "BIBLIOTECA DOCUMENTAL",
    `<p class="form-intro">Elegí la carpeta de destino para <strong>${h(itemLabel)}</strong>.</p>
     <label class="full">Carpeta de destino<select name="library-target">${options}</select></label>
     <p class="form-error" role="alert"></p>`,
    `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
     <button class="primary-button" type="button" data-library-dialog-submit>Mover</button>`,
  );
  const select = dialog.querySelector("[name=library-target]");
  select.value = currentFolderId || "";
  const error = dialog.querySelector(".form-error");
  dialog.querySelectorAll("[data-library-dialog-close]").forEach((button) =>
    button.addEventListener("click", () => dialog.close()),
  );
  dialog.querySelector("[data-library-dialog-submit]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await onSubmit(select.value || "");
      dialog.close();
    } catch (exception) {
      error.textContent = exception.message;
      button.disabled = false;
    }
  });
  select.focus();
}

function openPreviewDialog(doc) {
  const body = imageTypes.has(doc.fileType)
    ? `<img class="doc-library-preview-image" src="${h(doc.previewUrl || doc.url)}" alt="${h(doc.fileName)}" />`
    : `<iframe class="doc-library-preview-frame" src="${h(doc.previewUrl || doc.url)}" title="${h(doc.fileName)}"></iframe>`;
  const dialog = makeDialog(
    doc.fileName,
    "VISTA PREVIA",
    `<div class="doc-library-preview">${body}</div>`,
    `<a class="secondary-button" href="${h(doc.url)}" target="_blank" rel="noopener">${ICONS.download} Descargar</a>
     <button class="primary-button" type="button" data-library-dialog-close>Cerrar</button>`,
  );
  dialog.classList.add("doc-preview-dialog");
  dialog.querySelectorAll("[data-library-dialog-close]").forEach((button) =>
    button.addEventListener("click", () => dialog.close()),
  );
}

function documentMeta(doc) {
  const parts = [typeLabel(doc), formatSize(doc.fileSize)];
  if (doc.uploadedAt) parts.push(formatDate(doc.uploadedAt));
  if (doc.uploadedByName) parts.push(`Subido por ${doc.uploadedByName}`);
  return parts.filter(Boolean).join(" · ");
}

export function createDocumentLibrary(options) {
  const root = options.container;
  if (!root) throw new Error("La biblioteca documental necesita un contenedor.");
  const category = options.category || "document";
  const foldersEnabled = category !== "statutes";
  const view = {
    entityId: "",
    documents: [],
    folders: [],
    currentFolderId: "",
    search: "",
    sort: "name",
    direction: 1,
    mode: "list",
  };
  const option = (name, fallback) => {
    const value = typeof options[name] === "function" ? options[name]() : options[name];
    return value === undefined ? fallback : value;
  };
  const entityId = () => {
    const value = typeof options.getEntityId === "function" ? options.getEntityId() : options.entityId;
    return String(value || "");
  };
  const canWrite = () => !!option("canWrite", false) && !!entityId();

  root.classList.add("doc-library");
  root.dataset.category = category;
  root.innerHTML = `<div class="doc-library-toolbar">
      <div class="doc-library-toolbar-main">
        ${foldersEnabled ? `<button type="button" class="secondary-button doc-library-new-folder">${ICONS.folderAdd} Nueva carpeta</button>` : ""}
        <label class="primary-button doc-library-upload">${ICONS.upload} Subir archivos<input type="file" multiple hidden /></label>
      </div>
      <div class="doc-library-toolbar-tools">
        <input type="search" class="doc-library-search" placeholder="Buscar por nombre…" aria-label="Buscar por nombre" />
        <select class="doc-library-sort" aria-label="Ordenar por">
          <option value="name">Nombre</option>
          <option value="date">Fecha</option>
          <option value="size">Tamaño</option>
        </select>
        <button type="button" class="doc-library-sort-dir" title="Invertir el orden" aria-label="Invertir el orden">↑</button>
        <div class="doc-library-view" role="group" aria-label="Vista">
          <button type="button" data-library-view="list" class="active" title="Vista de lista">Lista</button>
          <button type="button" data-library-view="grid" title="Vista de cuadrícula">Cuadrícula</button>
        </div>
      </div>
    </div>
    <nav class="doc-library-breadcrumbs" aria-label="Ruta de carpetas"></nav>
    <div class="doc-library-dropzone">${ICONS.upload}<span><strong>Arrastrá archivos acá</strong> o usá «Subir archivos»</span></div>
    <div class="doc-library-content"></div>
    <p class="doc-library-status" aria-live="polite"></p>`;

  const toolbar = root.querySelector(".doc-library-toolbar");
  const uploadLabel = root.querySelector(".doc-library-upload");
  const uploadInput = uploadLabel?.querySelector("input");
  const newFolderButton = root.querySelector(".doc-library-new-folder");
  const searchInput = root.querySelector(".doc-library-search");
  const sortSelect = root.querySelector(".doc-library-sort");
  const sortButton = root.querySelector(".doc-library-sort-dir");
  const breadcrumbs = root.querySelector(".doc-library-breadcrumbs");
  const dropzone = root.querySelector(".doc-library-dropzone");
  const content = root.querySelector(".doc-library-content");
  const status = root.querySelector(".doc-library-status");

  const syncData = () => {
    if (!options.getData) return;
    const data = options.getData() || {};
    view.documents = Array.isArray(data.documents) ? [...data.documents] : [];
    view.folders = Array.isArray(data.folders) ? [...data.folders] : [];
    if (view.currentFolderId && !view.folders.some((folder) => folder.id === view.currentFolderId))
      view.currentFolderId = "";
  };

  const updateChrome = () => {
    const writable = canWrite();
    toolbar.hidden = false;
    if (uploadLabel) uploadLabel.hidden = !writable;
    if (newFolderButton) newFolderButton.hidden = !writable || !foldersEnabled || !!view.search;
    if (dropzone) dropzone.hidden = !writable;
    if (sortButton) sortButton.textContent = view.direction > 0 ? "↑" : "↓";
    root.querySelectorAll("[data-library-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.libraryView === view.mode);
    });
    if (sortSelect) sortSelect.value = view.sort;
    if (searchInput && searchInput.value !== view.search) searchInput.value = view.search;
  };

  const filteredFolders = () => {
    const term = view.search.trim().toLocaleLowerCase("es");
    return view.folders.filter((folder) => {
      if (view.search) return folder.name.toLocaleLowerCase("es").includes(term);
      return folder.parentId === view.currentFolderId;
    });
  };
  const filteredDocuments = () => {
    const term = view.search.trim().toLocaleLowerCase("es");
    return view.documents.filter((doc) => {
      if (view.search) return doc.fileName.toLocaleLowerCase("es").includes(term);
      return (doc.folderId || "") === view.currentFolderId;
    });
  };
  const folderSize = (folderId) => {
    const ids = new Set([folderId, ...descendants(view.folders, folderId)]);
    return view.documents
      .filter((doc) => ids.has(doc.folderId || ""))
      .reduce((total, doc) => total + Number(doc.fileSize || 0), 0);
  };
  const sortItems = (items, kind) => {
    const factor = view.direction;
    return [...items].sort((a, b) => {
      let left;
      let right;
      if (view.sort === "date") {
        left = kind === "folder" ? a.createdAt : a.uploadedAt;
        right = kind === "folder" ? b.createdAt : b.uploadedAt;
        return (String(left).localeCompare(String(right))) * factor;
      }
      if (view.sort === "size") {
        left = kind === "folder" ? folderSize(a.id) : Number(a.fileSize || 0);
        right = kind === "folder" ? folderSize(b.id) : Number(b.fileSize || 0);
        return (left - right) * factor;
      }
      left = kind === "folder" ? a.name : a.fileName;
      right = kind === "folder" ? b.name : b.fileName;
      return String(left).localeCompare(String(right), "es", { sensitivity: "base" }) * factor;
    });
  };

  const renderBreadcrumbs = () => {
    breadcrumbs.replaceChildren();
    if (!foldersEnabled) {
      const label = document.createElement("span");
      label.className = "doc-library-crumb is-current";
      label.textContent = "Estatutos";
      breadcrumbs.append(label);
      return;
    }
    if (view.search) {
      const label = document.createElement("span");
      label.className = "doc-library-crumb is-current";
      label.textContent = `Resultados para «${view.search}»`;
      breadcrumbs.append(label);
      return;
    }
    const rootButton = document.createElement("button");
    rootButton.type = "button";
    rootButton.className = "doc-library-crumb";
    rootButton.textContent = "Inicio";
    rootButton.dataset.libraryDropFolder = "";
    if (!view.currentFolderId) rootButton.classList.add("is-current");
    rootButton.addEventListener("click", () => navigateFolder(""));
    breadcrumbs.append(rootButton);
    for (const folder of pathFor(view.folders, view.currentFolderId)) {
      const separator = document.createElement("span");
      separator.className = "doc-library-crumb-separator";
      separator.textContent = "/";
      breadcrumbs.append(separator);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "doc-library-crumb";
      button.textContent = folder.name;
      button.dataset.libraryDropFolder = folder.id;
      if (folder.id === view.currentFolderId) button.classList.add("is-current");
      button.addEventListener("click", () => navigateFolder(folder.id));
      breadcrumbs.append(button);
    }
  };

  const itemActions = (item, kind) => {
    const writable = canWrite();
    if (!writable) {
      if (kind === "document")
        return `<div class="doc-library-item-actions">${item.previewUrl ? `<button type="button" data-library-action="preview" title="Vista previa">${ICONS.eye}</button>` : ""}<a href="${h(item.url)}" title="Descargar" target="_blank" rel="noopener">${ICONS.download}</a></div>`;
      return "";
    }
    const move = kind === "document" && !foldersEnabled ? "" : `<button type="button" data-library-action="move" title="Mover a…">${ICONS.move}</button>`;
    return `<div class="doc-library-item-actions">
      ${kind === "document" && item.previewUrl ? `<button type="button" data-library-action="preview" title="Vista previa">${ICONS.eye}</button>` : ""}
      ${kind === "document" ? `<a href="${h(item.url)}" title="Descargar" target="_blank" rel="noopener">${ICONS.download}</a>` : ""}
      <button type="button" data-library-action="rename" title="Renombrar">${ICONS.edit}</button>
      ${move}
      ${kind === "document" ? `<button type="button" data-library-action="replace" title="Reemplazar archivo">${ICONS.replace}</button>` : ""}
      <button type="button" data-library-action="delete" class="danger" title="Eliminar">${ICONS.trash}</button>
    </div>`;
  };

  const folderRow = (folder) => {
    const element = document.createElement("div");
    element.className = "doc-library-item doc-library-folder";
    element.dataset.folderId = folder.id;
    element.dataset.libraryDropFolder = folder.id;
    element.draggable = canWrite();
    element.tabIndex = 0;
    const count = descendants(view.folders, folder.id).size;
    const docs = view.documents.filter((doc) => doc.folderId === folder.id).length;
    element.innerHTML = `<button type="button" class="doc-library-item-main" data-library-open-folder>
        <span class="doc-library-item-icon">${ICONS.folder}</span>
        <span class="doc-library-item-text"><strong>${h(folder.name)}</strong><span>${docs} ${docs === 1 ? "documento" : "documentos"}${count ? ` · ${count} ${count === 1 ? "subcarpeta" : "subcarpetas"}` : ""}</span></span>
      </button>${itemActions(folder, "folder")}`;
    return element;
  };

  const documentRow = (doc) => {
    const element = document.createElement("div");
    element.className = "doc-library-item doc-library-document";
    element.dataset.documentId = doc.id;
    element.draggable = canWrite() && foldersEnabled;
    const location = view.search ? `<span class="doc-library-location">${h(pathLabel(view.folders, doc.folderId))}</span>` : "";
    element.innerHTML = `<button type="button" class="doc-library-item-main" data-library-open-document>
        <span class="doc-library-item-icon">${ICONS.file}</span>
        <span class="doc-library-item-text"><strong>${h(doc.fileName)}</strong><span>${h(documentMeta(doc))}${location}</span></span>
      </button>${itemActions(doc, "document")}`;
    return element;
  };

  const render = () => {
    updateChrome();
    renderBreadcrumbs();
    content.replaceChildren();
    const folders = sortItems(filteredFolders(), "folder");
    const documents = sortItems(filteredDocuments(), "document");
    root.dataset.view = view.mode;
    if (!folders.length && !documents.length) {
      const empty = document.createElement("div");
      empty.className = "doc-library-empty";
      empty.innerHTML = `<strong>${view.search ? "Sin resultados" : "Todavía no hay archivos"}</strong><p>${view.search ? "Probá con otro nombre o limpiá la búsqueda." : h(options.emptyText || "Subí documentos o creá una carpeta para empezar a organizarlos.")}</p>`;
      content.append(empty);
    } else {
      if (folders.length) {
        const section = document.createElement("div");
        section.className = "doc-library-section";
        section.innerHTML = `<h4>${view.search ? "Carpetas encontradas" : "Carpetas"}</h4>`;
        const list = document.createElement("div");
        list.className = "doc-library-items";
        folders.forEach((folder) => list.append(folderRow(folder)));
        section.append(list);
        content.append(section);
      }
      if (documents.length) {
        const section = document.createElement("div");
        section.className = "doc-library-section";
        section.innerHTML = `<h4>${view.search ? "Documentos encontrados" : "Documentos"}</h4>`;
        const list = document.createElement("div");
        list.className = "doc-library-items";
        documents.forEach((doc) => list.append(documentRow(doc)));
        section.append(list);
        content.append(section);
      }
    }
    const total = view.search
      ? folders.length + documents.length
      : filteredFolders().length + filteredDocuments().length;
    status.textContent = view.search
      ? `${total} ${total === 1 ? "resultado" : "resultados"}`
      : `${view.documents.length} ${view.documents.length === 1 ? "documento" : "documentos"} · ${view.folders.length} ${view.folders.length === 1 ? "carpeta" : "carpetas"}`;
    const countEl = option("countEl", null);
    const countTarget =
      typeof countEl === "string" ? document.querySelector(countEl) : countEl;
    if (countTarget) countTarget.textContent = String(view.documents.length);
  };

  const navigateFolder = (folderId) => {
    view.currentFolderId = folderId || "";
    view.search = "";
    render();
  };

  const uploadFiles = async (files, folderId = view.currentFolderId) => {
    const entity = entityId();
    if (!entity) {
      toast("Guardá el registro antes de subir documentos.");
      return;
    }
    const messages = validateDocumentFiles(files, option("settings", null) || {});
    if (messages.length) {
      toast(messages.join(" "));
      return;
    }
    try {
      status.textContent = "Subiendo archivos…";
      const records = await api.uploadDocuments(files, options.entityType, entity, {
        folderId: foldersEnabled ? folderId : "",
        category,
      });
      if (Array.isArray(records)) view.documents.push(...records);
      await options.onChange?.();
      render();
      toast(records?.length === 1 ? "Documento subido." : "Documentos subidos.");
    } catch (error) {
      toast(error.message);
      render();
    }
  };

  const replaceDocument = async (doc, file) => {
    const messages = validateDocumentFiles([file], option("settings", null) || {});
    if (messages.length) {
      toast(messages.join(" "));
      return;
    }
    try {
      const updated = await api.replaceDocument(doc.id, file);
      const index = view.documents.findIndex((item) => item.id === doc.id);
      if (index >= 0 && updated) view.documents[index] = updated;
      await options.onChange?.();
      render();
      toast("Documento reemplazado.");
    } catch (error) {
      toast(error.message);
    }
  };

  const askFolderName = (folder = null) => {
    openTextDialog({
      title: folder ? "Renombrar carpeta" : "Nueva carpeta",
      label: "Nombre de la carpeta",
      value: folder?.name || "",
      submitLabel: folder ? "Guardar" : "Crear",
      onSubmit: async (name) => {
        const entity = entityId();
        if (!entity) throw new Error("Guardá el registro antes de crear carpetas.");
        if (folder) {
          const updated = await api.updateDocumentFolder(folder.id, { name });
          const index = view.folders.findIndex((item) => item.id === folder.id);
          if (index >= 0 && updated) view.folders[index] = updated;
        } else {
          const created = await api.createDocumentFolder({
            entityType: options.entityType,
            entityId: entity,
            parentId: view.currentFolderId,
            name,
          });
          if (created) view.folders.push(created);
        }
        await options.onChange?.();
        render();
        toast(folder ? "Carpeta renombrada." : "Carpeta creada.");
      },
    });
  };

  const askDeleteFolder = async (folder) => {
    const childIds = descendants(view.folders, folder.id);
    const documents = view.documents.filter(
      (doc) => doc.folderId === folder.id || childIds.has(doc.folderId),
    );
    const details = [];
    if (childIds.size) details.push(`${childIds.size} ${childIds.size === 1 ? "subcarpeta" : "subcarpetas"}`);
    if (documents.length) details.push(`${documents.length} ${documents.length === 1 ? "documento" : "documentos"}`);
    const message = details.length
      ? `La carpeta «${h(folder.name)}» contiene ${details.join(" y ")}. Si continuás, se eliminarán definitivamente.`
      : `¿Eliminar la carpeta «${h(folder.name)}»?`;
    if (!(await openConfirmDialog({ title: "Eliminar carpeta", message }))) return;
    try {
      await api.deleteDocumentFolder(folder.id, true);
      const removeIds = new Set([folder.id, ...childIds]);
      view.folders = view.folders.filter((item) => !removeIds.has(item.id));
      view.documents = view.documents.filter((doc) => !removeIds.has(doc.folderId));
      if (removeIds.has(view.currentFolderId)) view.currentFolderId = folder.parentId || "";
      await options.onChange?.();
      render();
      toast("Carpeta eliminada.");
    } catch (error) {
      toast(error.message);
    }
  };

  const askRenameDocument = (doc) => {
    openTextDialog({
      title: "Renombrar documento",
      label: "Nombre del documento (conservá la extensión)",
      value: doc.fileName,
      submitLabel: "Guardar",
      onSubmit: async (name) => {
        const updated = await api.updateDocument(doc.id, { name });
        const index = view.documents.findIndex((item) => item.id === doc.id);
        if (index >= 0 && updated) view.documents[index] = updated;
        await options.onChange?.();
        render();
        toast("Documento renombrado.");
      },
    });
  };

  const askMove = (item, kind) => {
    if (kind === "folder") {
      const exclude = descendants(view.folders, item.id);
      exclude.add(item.id);
      openMoveDialog({
        itemLabel: item.name,
        folders: view.folders,
        currentFolderId: item.parentId || "",
        excludeIds: exclude,
        onSubmit: async (target) => {
          const updated = await api.updateDocumentFolder(item.id, { parentId: target });
          const index = view.folders.findIndex((folder) => folder.id === item.id);
          if (index >= 0 && updated) view.folders[index] = updated;
          await options.onChange?.();
          render();
          toast("Carpeta movida.");
        },
      });
      return;
    }
    openMoveDialog({
      itemLabel: item.fileName,
      folders: view.folders,
      currentFolderId: item.folderId || "",
      excludeIds: new Set(),
      onSubmit: async (target) => {
        const updated = await api.updateDocument(item.id, { folderId: target });
        const index = view.documents.findIndex((doc) => doc.id === item.id);
        if (index >= 0 && updated) view.documents[index] = updated;
        await options.onChange?.();
        render();
        toast("Documento movido.");
      },
    });
  };

  const askDeleteDocument = async (doc) => {
    if (!(await openConfirmDialog({ title: "Eliminar documento", message: `¿Eliminar «${h(doc.fileName)}»? Esta acción no se puede deshacer.` }))) return;
    try {
      await api.deleteDocument(doc.id);
      view.documents = view.documents.filter((item) => item.id !== doc.id);
      await options.onChange?.();
      render();
      toast("Documento eliminado.");
    } catch (error) {
      toast(error.message);
    }
  };

  const openDocument = (doc) => {
    if (doc.previewUrl) openPreviewDialog(doc);
    else window.open(doc.url, "_blank", "noopener");
  };

  content.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-library-action]");
    const folderElement = event.target.closest("[data-folder-id]");
    const documentElement = event.target.closest("[data-document-id]");
    const folder = folderElement
      ? view.folders.find((item) => item.id === folderElement.dataset.folderId)
      : null;
    const doc = documentElement
      ? view.documents.find((item) => item.id === documentElement.dataset.documentId)
      : null;
    if (actionButton) {
      const action = actionButton.dataset.libraryAction;
      if (action === "download") return;
      if (action === "preview" && doc) return openDocument(doc);
      if (action === "rename" && folder) return askFolderName(folder);
      if (action === "rename" && doc) return askRenameDocument(doc);
      if (action === "move" && folder) return askMove(folder, "folder");
      if (action === "move" && doc) return askMove(doc, "document");
      if (action === "delete" && folder) return askDeleteFolder(folder);
      if (action === "delete" && doc) return askDeleteDocument(doc);
      if (action === "replace" && doc) {
        uploadInput.dataset.replaceId = doc.id;
        uploadInput.multiple = false;
        uploadInput.value = "";
        uploadInput.click();
        return;
      }
    }
    if (event.target.closest("[data-library-open-folder]") && folder)
      return navigateFolder(folder.id);
    if (event.target.closest("[data-library-open-document]") && doc)
      return openDocument(doc);
  });
  content.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const folderElement = event.target.closest("[data-folder-id]");
    if (folderElement) {
      event.preventDefault();
      navigateFolder(folderElement.dataset.folderId);
    }
  });

  searchInput?.addEventListener("input", () => {
    view.search = searchInput.value;
    render();
  });
  sortSelect?.addEventListener("change", () => {
    view.sort = sortSelect.value;
    render();
  });
  sortButton?.addEventListener("click", () => {
    view.direction *= -1;
    render();
  });
  root.querySelectorAll("[data-library-view]").forEach((button) =>
    button.addEventListener("click", () => {
      view.mode = button.dataset.libraryView;
      render();
    }),
  );
  newFolderButton?.addEventListener("click", () => askFolderName());

  uploadLabel?.addEventListener("click", (event) => {
    if (event.target === uploadInput) return;
    if (!canWrite()) {
      event.preventDefault();
      toast("No tenés permiso para subir documentos.");
      return;
    }
    uploadInput.dataset.replaceId = "";
    uploadInput.multiple = true;
    uploadInput.value = "";
  });
  uploadInput?.addEventListener("change", async () => {
    const files = [...(uploadInput.files || [])];
    const replaceId = uploadInput.dataset.replaceId;
    uploadInput.value = "";
    if (!files.length) return;
    if (replaceId) {
      const doc = view.documents.find((item) => item.id === replaceId);
      if (doc) await replaceDocument(doc, files[0]);
      return;
    }
    await uploadFiles(files);
  });

  // Drag & drop: mover carpetas/documentos o subir archivos a una carpeta.
  let draggedItem = null;
  const clearDropTargets = () =>
    root.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
  const dropTargetFolder = (target) => {
    const element = target.closest("[data-library-drop-folder]");
    return element ? element.dataset.libraryDropFolder || "" : null;
  };
  content.addEventListener("dragstart", (event) => {
    if (!canWrite()) return;
    const folderElement = event.target.closest("[data-folder-id]");
    const documentElement = event.target.closest("[data-document-id]");
    if (!folderElement && !documentElement) return;
    draggedItem = folderElement
      ? { kind: "folder", id: folderElement.dataset.folderId }
      : { kind: "document", id: documentElement.dataset.documentId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-doc-library", JSON.stringify(draggedItem));
    event.dataTransfer.setData("text/plain", draggedItem.id);
  });
  content.addEventListener("dragend", () => {
    draggedItem = null;
    clearDropTargets();
  });
  root.addEventListener("dragover", (event) => {
    if (!canWrite()) return;
    const files = [...(event.dataTransfer?.types || [])].includes("Files");
    if (!files && !draggedItem) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = files ? "copy" : "move";
    clearDropTargets();
    const target = event.target.closest("[data-library-drop-folder]");
    (target || dropzone || root).classList.add("is-drop-target");
  });
  root.addEventListener("dragleave", (event) => {
    if (event.target === root || event.target === dropzone) clearDropTargets();
  });
  root.addEventListener("drop", async (event) => {
    if (!canWrite()) return;
    event.preventDefault();
    const targetFolder = dropTargetFolder(event.target);
    const folderId = targetFolder === null ? view.currentFolderId : targetFolder;
    clearDropTargets();
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) return uploadFiles(files, folderId);
    if (!draggedItem) return;
    const item = draggedItem;
    draggedItem = null;
    if (item.kind === "folder") {
      const folder = view.folders.find((entry) => entry.id === item.id);
      if (!folder || folder.parentId === folderId) return;
      if (folderId === folder.id || descendants(view.folders, folder.id).has(folderId)) {
        toast("No podés mover una carpeta dentro de sí misma.");
        return;
      }
      try {
        const updated = await api.updateDocumentFolder(folder.id, { parentId: folderId });
        const index = view.folders.findIndex((entry) => entry.id === folder.id);
        if (index >= 0 && updated) view.folders[index] = updated;
        await options.onChange?.();
        render();
        toast("Carpeta movida.");
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    const doc = view.documents.find((entry) => entry.id === item.id);
    if (!doc || (doc.folderId || "") === folderId) return;
    try {
      const updated = await api.updateDocument(doc.id, { folderId });
      const index = view.documents.findIndex((entry) => entry.id === doc.id);
      if (index >= 0 && updated) view.documents[index] = updated;
      await options.onChange?.();
      render();
      toast("Documento movido.");
    } catch (error) {
      toast(error.message);
    }
  });

  const setEntity = (id) => {
    const next = String(id || "");
    if (next !== view.entityId) {
      view.entityId = next;
      view.currentFolderId = "";
      view.search = "";
    }
    syncData();
    render();
  };

  const refresh = () => {
    view.entityId = entityId();
    syncData();
    render();
  };

  setEntity(entityId());
  return { render, refresh, setEntity, get currentFolderId() { return view.currentFolderId; } };
}
