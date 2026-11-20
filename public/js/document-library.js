import { createExportDropdown } from "./export-client.js";
import { api } from "./api.js";
import { escapeHtml as h } from "./html.js";
import { toast, validateDocumentFiles } from "./utils.js";

const ICONS = {
  folder:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
  home: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="M9 22V12h6v10"></path></svg>',
  search:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  download:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
  move: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>',
  trash:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  replace:
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
  folderAdd:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>',
  upload:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
  uploadLg:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3.5 6h.01"></path><path d="M3.5 12h.01"></path><path d="M3.5 18h.01"></path></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>',
  close:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-12 12"></path><path d="m6 6 12 12"></path></svg>',
  save: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
};

// Iconos seleccionables para las carpetas: mismos nombres que el menú lateral.
const folderIconSvg = (paths, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const FOLDER_ICON_PATHS = {
  folder:
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="M9 22V12h6v10"></path>',
  communities:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"></path><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"></path><path d="M10 6h4"></path><path d="M10 10h4"></path><path d="M10 14h4"></path><path d="M10 18h4"></path>',
  properties:
    '<rect width="16" height="20" x="4" y="2" rx="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M12 6h.01"></path><path d="M16 6h.01"></path><path d="M8 10h.01"></path><path d="M12 10h.01"></path><path d="M16 10h.01"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path>',
  owners:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  tenants:
    '<circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path>',
  fees: '<path d="M4 10h12"></path><path d="M4 14h9"></path><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"></path>',
  posts: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
  settings:
    '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3"></path><path d="M14 2v4M8 10v4M16 18v4"></path>',
  documents:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3z"></path>',
  wrench:
    '<path d="m14.7 6.3 3 3M21 3a6 6 0 0 1-7.6 7.6L5 19a2.1 2.1 0 0 1-3-3l8.4-8.4A6 6 0 0 1 18 0l-4 4 3 3z"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  contract: '<path d="M14 2H6a2 2 0 0 0-2 2v16h12l4-4V8zM14 2v6h6M8 12h8M8 16h5M16 20l4-4"/>',
  receipt:
    '<path d="m4 3 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v18l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2zM8 9h8M8 13h8M8 17h4"/>',
  legal: '<path d="M12 3v18M7 21h10M4 7h16M5 7l-3 7h6zM19 7l-3 7h6z"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m21 15-5-5L5 21"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12a20 20 0 0 0 18 0M12 11v4"/>',
};
const FOLDER_ICON_OPTIONS = [
  ["folder", "Carpeta"],
  ["home", "Inicio"],
  ["communities", "Comunidades"],
  ["properties", "Inmuebles"],
  ["owners", "Propietarios"],
  ["tenants", "Inquilinos"],
  ["fees", "Cuotas"],
  ["posts", "Comunicación"],
  ["settings", "Administración"],
  ["documents", "Documentos"],
  ["archive", "Archivo"],
  ["shield", "Seguros y actas"],
  ["wrench", "Mantenimiento"],
  ["calendar", "Calendario"],
  ["contract", "Contratos"],
  ["receipt", "Facturas"],
  ["legal", "Documentación legal"],
  ["image", "Imágenes"],
  ["star", "Destacados"],
  ["briefcase", "Gestión"],
];
const FOLDER_COLOR_OPTIONS = [
  ["teal", "Turquesa"],
  ["blue", "Azul"],
  ["indigo", "Índigo"],
  ["violet", "Violeta"],
  ["pink", "Rosa"],
  ["red", "Rojo"],
  ["orange", "Naranja"],
  ["amber", "Ámbar"],
  ["green", "Verde"],
  ["slate", "Gris"],
];
const folderColor = (value) =>
  FOLDER_COLOR_OPTIONS.some(([key]) => key === value) ? value : "teal";
const folderIcon = (key) => folderIconSvg(FOLDER_ICON_PATHS[key] || FOLDER_ICON_PATHS.folder);

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
  String(name || "")
    .split(".")
    .pop()
    ?.toUpperCase() || "ARCHIVO";
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
  return path.length ? path.map((folder) => folder.name).join(" / ") : "Carpeta principal";
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
      <button class="icon-action-btn btn-cancel btn-lg" type="button" data-library-dialog-close aria-label="Cerrar" title="Cerrar">${ICONS.close}</button>
    </div>
    <div class="doc-library-dialog-body">${contentHtml}</div>
    <div class="dialog-actions">${footerHtml}</div>
  </div>`;
  document.body.append(dialog);
  dialog
    .querySelector("[data-library-dialog-close]")
    ?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  closeOnBackdrop(dialog);
  dialog.showModal();
  return dialog;
}

function openTextDialog({
  title,
  eyebrow = "BIBLIOTECA DOCUMENTAL",
  label,
  value = "",
  submitLabel = "Guardar",
  onSubmit,
}) {
  const dialog = makeDialog(
    title,
    eyebrow,
    `<label class="full" id="text-dialog-label">${h(label)}<input name="library-name" maxlength="180" value="${h(value)}" autocomplete="off" aria-labelledby="text-dialog-label" /></label>
     <p class="form-error" role="alert" id="text-dialog-error"></p>`,
    `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
     <button class="primary-button" type="button" data-library-dialog-submit>${h(submitLabel)}</button>`,
  );
  const input = dialog.querySelector("[name=library-name]");
  const error = dialog.querySelector("#text-dialog-error");
  let previouslyFocused = document.activeElement;

  dialog.addEventListener("show", () => {
    previouslyFocused = document.activeElement;
    input.focus();
    input.select();
    trapFocus(dialog, input);
  }, { once: true });

  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Indica un nombre.";
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
  dialog
    .querySelectorAll("[data-library-dialog-close]")
    .forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-library-dialog-submit]").addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  function trapFocus(dialog, initialFocus) {
    const focusableElements = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTab(event) {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        dialog.close();
      }
    }

    dialog.addEventListener("keydown", handleTab);
    dialog.addEventListener("keydown", handleEscape);
    dialog.addEventListener("close", () => {
      dialog.removeEventListener("keydown", handleTab);
      dialog.removeEventListener("keydown", handleEscape);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }, { once: true });
  }
}

function openFolderDialog({ folder = null, onSubmit }) {
  const current = folder?.icon || "folder";
  const currentColor = folderColor(folder?.color);
  const dialog = makeDialog(
    folder ? "Renombrar carpeta" : "Nueva carpeta",
    "BIBLIOTECA DOCUMENTAL",
    `<label class="full" id="folder-dialog-name-label">Nombre de la carpeta<input name="library-name" maxlength="180" value="${h(folder?.name || "")}" autocomplete="off" aria-labelledby="folder-dialog-name-label" /></label>
     <div class="doc-library-icon-field"><span class="doc-library-icon-field-label">Icono</span><div class="doc-library-icon-picker" role="radiogroup" aria-label="Icono de la carpeta">${FOLDER_ICON_OPTIONS.map(
        ([key, label]) =>
          `<button type="button" class="doc-library-icon-option${key === current ? " is-selected" : ""}" data-folder-icon="${key}" role="radio" aria-checked="${key === current}" aria-label="${label}" title="${label}">${folderIcon(key)}</button>`,
      ).join("")}</div></div>
     <div class="doc-library-color-field"><span class="doc-library-icon-field-label">Color</span><div class="doc-library-color-picker" role="radiogroup" aria-label="Color de la carpeta">${FOLDER_COLOR_OPTIONS.map(([key, label]) => `<button type="button" class="doc-library-color-option${key === currentColor ? " is-selected" : ""}" data-folder-color="${key}" role="radio" aria-checked="${key === currentColor}" aria-label="${label}" title="${label}"><span class="doc-library-color-swatch" aria-hidden="true"></span></button>`).join("")}</div></div>
     <div class="doc-library-folder-preview" aria-label="Vista previa de la carpeta"><span data-folder-preview-icon>${folderIcon(current)}</span><span data-folder-preview-name>${h(folder?.name || "Nueva carpeta")}</span></div>
     <p class="form-error" role="alert" id="folder-dialog-error"></p>`,
    `<button class="icon-action-btn btn-cancel btn-lg" type="button" data-library-dialog-close aria-label="Cancelar" title="Cancelar">${ICONS.close}</button>
     <button class="icon-action-btn btn-save btn-lg" type="button" data-library-dialog-submit aria-label="${folder ? "Guardar cambios" : "Crear carpeta"}" title="${folder ? "Guardar cambios" : "Crear carpeta"}">${ICONS.save}</button>`,
  );
  dialog.dataset.folderColor = currentColor;
  const input = dialog.querySelector("[name=library-name]");
  const error = dialog.querySelector("#folder-dialog-error");
  let icon = current;
  let color = currentColor;
  let previouslyFocused = document.activeElement;

  dialog.addEventListener("show", () => {
    previouslyFocused = document.activeElement;
    input.focus();
    input.select();
    trapFocus(dialog, input);
  }, { once: true });

  dialog.querySelectorAll("[data-folder-icon]").forEach((button) =>
    button.addEventListener("click", () => {
      icon = button.dataset.folderIcon;
      dialog.querySelector("[data-folder-preview-icon]").innerHTML = folderIcon(icon);
      dialog.querySelectorAll("[data-folder-icon]").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-checked", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
    }),
  );
  dialog.querySelectorAll("[data-folder-color]").forEach((button) =>
    button.addEventListener("click", () => {
      color = button.dataset.folderColor;
      dialog.dataset.folderColor = color;
      dialog.querySelectorAll("[data-folder-color]").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-checked", String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
    }),
  );
  for (const selector of ["[data-folder-icon]", "[data-folder-color]"]) {
    const buttons = [...dialog.querySelectorAll(selector)];
    for (const button of buttons) {
      button.tabIndex = button.getAttribute("aria-checked") === "true" ? 0 : -1;
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const index = buttons.indexOf(button);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next].click();
        buttons[next].focus();
      });
    }
  }
  input.addEventListener("input", () => {
    dialog.querySelector("[data-folder-preview-name]").textContent =
      input.value.trim() || "Nueva carpeta";
  });
  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Indica un nombre.";
      input.focus();
      return;
    }
    const button = dialog.querySelector("[data-library-dialog-submit]");
    button.disabled = true;
    error.textContent = "";
    try {
      await onSubmit({ name, icon, color });
      dialog.close();
    } catch (exception) {
      error.textContent = exception.message;
      button.disabled = false;
    }
  };
  dialog
    .querySelectorAll("[data-library-dialog-close]")
    .forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-library-dialog-submit]").addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  function trapFocus(dialog, initialFocus) {
    const focusableElements = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTab(event) {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        dialog.close();
      }
    }

    dialog.addEventListener("keydown", handleTab);
    dialog.addEventListener("keydown", handleEscape);
    dialog.addEventListener("close", () => {
      dialog.removeEventListener("keydown", handleTab);
      dialog.removeEventListener("keydown", handleEscape);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }, { once: true });
  }
}

function openConfirmDialog({
  title,
  message,
  confirmLabel = "Eliminar",
  eyebrow = "CONFIRMAR ACCIÓN",
}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const dialog = makeDialog(
      title,
      eyebrow,
      `<p class="form-intro">${message}</p>`,
      `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
       <button class="primary-button doc-library-danger-button" type="button" data-library-dialog-confirm>${h(confirmLabel)}</button>`,
    );
    let previouslyFocused = document.activeElement;
    const confirmButton = dialog.querySelector("[data-library-dialog-confirm]");

    dialog.addEventListener("show", () => {
      previouslyFocused = document.activeElement;
      confirmButton.focus();
      trapFocus(dialog, confirmButton);
    }, { once: true });

    dialog
      .querySelectorAll("[data-library-dialog-close]")
      .forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("[data-library-dialog-confirm]").addEventListener("click", () => {
      confirmed = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => resolve(confirmed), { once: true });

    function trapFocus(dialog, initialFocus) {
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      function handleTab(event) {
        if (event.key !== "Tab") return;

        if (event.shiftKey) {
          if (document.activeElement === firstFocusable) {
            event.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            event.preventDefault();
            firstFocusable.focus();
          }
        }
      }

      function handleEscape(event) {
        if (event.key === "Escape") {
          dialog.close();
        }
      }

      dialog.addEventListener("keydown", handleTab);
      dialog.addEventListener("keydown", handleEscape);
      dialog.addEventListener("close", () => {
        dialog.removeEventListener("keydown", handleTab);
        dialog.removeEventListener("keydown", handleEscape);
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          previouslyFocused.focus();
        }
      }, { once: true });
    }
  });
}

function openMoveDialog({ itemLabel, folders, currentFolderId, excludeIds, onSubmit }) {
  const available = folders
    .filter((folder) => !excludeIds.has(folder.id))
    .sort((a, b) => pathLabel(folders, a.id).localeCompare(pathLabel(folders, b.id), "es"));
  const options = [`<option value="">Carpeta principal</option>`]
    .concat(
      available.map(
        (folder) => `<option value="${h(folder.id)}">${h(pathLabel(folders, folder.id))}</option>`,
      ),
    )
    .join("");
  const dialog = makeDialog(
    "Mover a…",
    "BIBLIOTECA DOCUMENTAL",
    `<p class="form-intro">Elige la carpeta de destino para <strong>${h(itemLabel)}</strong>.</p>
     <label class="full" id="move-dialog-label">Carpeta de destino<select name="library-target" aria-labelledby="move-dialog-label">${options}</select></label>
     <p class="form-error" role="alert" id="move-dialog-error"></p>`,
    `<button class="secondary-button" type="button" data-library-dialog-close>Cancelar</button>
     <button class="primary-button" type="button" data-library-dialog-submit>Mover</button>`,
  );
  const select = dialog.querySelector("[name=library-target]");
  select.value = currentFolderId || "";
  const error = dialog.querySelector("#move-dialog-error");
  let previouslyFocused = document.activeElement;

  dialog.addEventListener("show", () => {
    previouslyFocused = document.activeElement;
    select.focus();
    trapFocus(dialog, select);
  }, { once: true });

  dialog
    .querySelectorAll("[data-library-dialog-close]")
    .forEach((button) => button.addEventListener("click", () => dialog.close()));
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

  function trapFocus(dialog, initialFocus) {
    const focusableElements = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleTab(event) {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        dialog.close();
      }
    }

    dialog.addEventListener("keydown", handleTab);
    dialog.addEventListener("keydown", handleEscape);
    dialog.addEventListener("close", () => {
      dialog.removeEventListener("keydown", handleTab);
      dialog.removeEventListener("keydown", handleEscape);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }, { once: true });
  }
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
  dialog
    .querySelectorAll("[data-library-dialog-close]")
    .forEach((button) => button.addEventListener("click", () => dialog.close()));
}

function documentMeta(doc) {
  const parts = [formatSize(doc.fileSize)];
  if (doc.uploadedAt) parts.push(formatDate(doc.uploadedAt));
  if (doc.uploadedByName) parts.push(`Subido por ${doc.uploadedByName}`);
  return parts.filter(Boolean).join(" · ");
}

export function createDocumentLibrary(options) {
  const root = options.container;
  if (!root) throw new Error("La biblioteca documental necesita un contenedor.");
  const category = options.category || "document";
  // Documentos y estatutos comparten la misma biblioteca con carpetas propias.
  const foldersEnabled = true;
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
    const value =
      typeof options.getEntityId === "function" ? options.getEntityId() : options.entityId;
    return String(value || "");
  };
  const canWrite = () => !!option("canWrite", false) && !!entityId();

  root.classList.add("doc-library");
  root.dataset.category = category;
  root.innerHTML = `<div class="doc-library-toolbar">
      <div class="doc-library-toolbar-tools">
        <label class="doc-library-search-field">
          <span class="doc-library-search-icon" aria-hidden="true">${ICONS.search}</span>
          <input type="search" class="doc-library-search" placeholder="Buscar…" aria-label="Buscar por nombre" />
        </label>
        <div class="doc-library-sort-group">
          <select class="doc-library-sort" aria-label="Ordenar por">
            <option value="name">Nombre</option>
            <option value="date">Fecha</option>
            <option value="size">Tamaño</option>
          </select>
          <button type="button" class="doc-library-sort-dir" title="Invertir el orden" aria-label="Invertir el orden">↑</button>
        </div>
        <div class="doc-library-view" role="group" aria-label="Vista">
          <button type="button" data-library-view="list" class="active" aria-label="Vista de lista" title="Vista de lista">${ICONS.list}</button>
          <button type="button" data-library-view="grid" aria-label="Vista de cuadrícula" title="Vista de cuadrícula">${ICONS.grid}</button>
        </div>
      </div>
      <div class="doc-library-toolbar-main">
        ${foldersEnabled ? `<button type="button" class="icon-action-btn btn-folder btn-lg doc-library-new-folder" aria-label="Nueva carpeta" title="Nueva carpeta">${ICONS.folderAdd}</button>` : ""}
        <button type="button" class="icon-action-btn btn-add btn-lg doc-library-upload" aria-label="Subir archivos" title="Subir archivos">${ICONS.uploadLg}</button>
        <input type="file" class="doc-library-upload-input" multiple hidden />
      </div>
    </div>
    <div class="doc-library-pathbar">
      <div class="doc-library-location-label"><span>Ubicación actual</span><nav class="doc-library-breadcrumbs" aria-label="Ruta de carpetas"></nav></div>
      <span class="doc-library-path-meta"></span>
    </div>
    <div class="doc-library-dropzone">${ICONS.upload}<span><strong>Arrastrá archivos acá</strong> o usá «Subir archivos»</span></div>
    <div class="doc-library-content"></div>
    <p class="doc-library-status" aria-live="polite"></p>`;

  const toolbar = root.querySelector(".doc-library-toolbar");
  const toolbarMain = root.querySelector(".doc-library-toolbar-main");
  const uploadButton = root.querySelector(".doc-library-upload");
  const uploadInput = root.querySelector(".doc-library-upload-input");
  const newFolderButton = root.querySelector(".doc-library-new-folder");
  const searchInput = root.querySelector(".doc-library-search");
  const sortSelect = root.querySelector(".doc-library-sort");
  const sortButton = root.querySelector(".doc-library-sort-dir");
  const breadcrumbs = root.querySelector(".doc-library-breadcrumbs");
  const pathMeta = root.querySelector(".doc-library-path-meta");
  const dropzone = root.querySelector(".doc-library-dropzone");
  const content = root.querySelector(".doc-library-content");
  const status = root.querySelector(".doc-library-status");

  // La biblioteca se monta dentro del formulario de la entidad: Enter en sus
  // campos no debe enviar ese formulario (guardaba y cerraba el editor completo).
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (["file", "checkbox", "radio"].includes(field.type)) return;
    event.preventDefault();
  });

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
    if (uploadButton) uploadButton.hidden = !writable;
    if (newFolderButton) newFolderButton.hidden = !writable || !foldersEnabled || !!view.search;
    if (dropzone) dropzone.hidden = !writable || !!view.search;
    if (sortButton) {
      sortButton.textContent = view.direction > 0 ? "↑" : "↓";
      const label =
        view.direction > 0 ? "Orden ascendente · invertir" : "Orden descendente · invertir";
      sortButton.title = label;
      sortButton.setAttribute("aria-label", label);
    }
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
        return String(left).localeCompare(String(right)) * factor;
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
    rootButton.innerHTML = `${ICONS.folder}<span>Carpeta principal</span>`;
    rootButton.title = "Abrir la carpeta principal de documentos";
    rootButton.dataset.libraryDropFolder = "";
    if (!view.currentFolderId) {
      rootButton.classList.add("is-current");
      rootButton.setAttribute("aria-current", "page");
    }
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
      if (folder.id === view.currentFolderId) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => navigateFolder(folder.id));
      breadcrumbs.append(button);
    }
  };

  const itemButton = (action, title, icon, variant = "") =>
    `<button type="button" class="icon-action-btn btn-sm ${variant}" data-library-action="${action}" title="${title}" aria-label="${title}">${icon}</button>`;

  const itemActions = (item, kind) => {
    const writable = canWrite();
    const parts = [];
    if (kind === "document" && item.previewUrl)
      parts.push(itemButton("preview", "Vista previa", ICONS.eye, "btn-info"));
    if (kind === "document")
      parts.push(
        `<a class="icon-action-btn btn-sm btn-download" href="${h(item.url)}" target="_blank" rel="noopener" title="Descargar" aria-label="Descargar">${ICONS.download}</a>`,
      );
    if (writable) {
      parts.push(
        itemButton(
          "rename",
          kind === "folder" ? "Renombrar carpeta" : "Renombrar",
          ICONS.edit,
          "btn-edit",
        ),
      );
      if (kind === "folder" || foldersEnabled)
        parts.push(itemButton("move", "Mover a…", ICONS.move, "btn-move"));
      if (kind === "document")
        parts.push(itemButton("replace", "Reemplazar archivo", ICONS.replace, "btn-replace"));
      parts.push(itemButton("delete", "Eliminar", ICONS.trash, "btn-delete"));
    }
    return parts.length ? `<div class="doc-library-item-actions">${parts.join("")}</div>` : "";
  };

  const folderRow = (folder) => {
    const element = document.createElement("div");
    element.className = "doc-library-item doc-library-folder";
    element.dataset.folderId = folder.id;
    element.dataset.libraryDropFolder = folder.id;
    element.draggable = canWrite();
    element.tabIndex = 0;
    element.setAttribute("aria-grabbed", "false");
    element.setAttribute("aria-label", `Mover carpeta "${h(folder.name)}" (usa Enter para seleccionar, flechas para destino)`);
    const count = descendants(view.folders, folder.id).size;
    const docs = view.documents.filter((doc) => doc.folderId === folder.id).length;
    const summary = `${docs} ${docs === 1 ? "documento" : "documentos"}${count ? ` · ${count} ${count === 1 ? "subcarpeta" : "subcarpetas"}` : ""}`;
    element.dataset.folderColor = folderColor(folder.color);
    element.innerHTML = `<button type="button" class="doc-library-item-main" data-library-open-folder>
        <span class="doc-library-item-icon">${folderIcon(folder.icon)}</span>
        <span class="doc-library-item-text"><strong>${h(folder.name)}</strong><span class="doc-library-item-meta">${summary}</span></span>
      </button>${itemActions(folder, "folder")}`;
    return element;
  };

  const documentRow = (doc) => {
    const element = document.createElement("div");
    element.className = "doc-library-item doc-library-document";
    element.dataset.documentId = doc.id;
    element.draggable = canWrite() && foldersEnabled;
    element.tabIndex = 0;
    element.setAttribute("aria-grabbed", "false");
    element.setAttribute("aria-label", `Mover documento "${h(doc.fileName)}" (usa Enter para seleccionar, flechas para destino)`);
    const location = view.search
      ? `<span class="doc-library-location">${h(pathLabel(view.folders, doc.folderId))}</span>`
      : "";
    element.innerHTML = `<button type="button" class="doc-library-item-main" data-library-open-document>
        <span class="doc-library-item-icon">${ICONS.file}</span>
        <span class="doc-library-item-text"><strong>${h(doc.fileName)}</strong><span class="doc-library-item-meta"><span class="doc-library-kind">${h(typeLabel(doc))}</span>${h(documentMeta(doc))}${location ? ` ${location}` : ""}</span></span>
      </button>${itemActions(doc, "document")}`;
    return element;
  };

  const render = () => {
    updateChrome();
    toolbar.querySelector(".table-export-wrap")?.remove();
    const exportControl = createExportDropdown({
      tableId: "documents",
      getView: () => ({
        itemIds: [
          ...sortItems(filteredFolders(), "folder"),
          ...sortItems(filteredDocuments(), "document"),
        ].map((r) => r.id),
        columns: ["fileName", "kind", "fileSize", "uploadedAt", "uploadedByName"],
        filters: {
          entityType: option("entityType", ""),
          entityId: entityId(),
          category,
          folderId: view.currentFolderId,
          query: view.search,
          view: `Orden: ${view.sort} (${view.direction > 0 ? "asc" : "desc"})`,
        },
      }),
    });
    if (exportControl) toolbar.insertBefore(exportControl, toolbarMain);
    renderBreadcrumbs();
    content.replaceChildren();
    const folders = sortItems(filteredFolders(), "folder");
    const documents = sortItems(filteredDocuments(), "document");
    root.dataset.view = view.mode;
    if (!folders.length && !documents.length) {
      const empty = document.createElement("div");
      empty.className = "doc-library-empty";
      empty.innerHTML = `<span class="doc-library-empty-icon">${view.search ? ICONS.search : ICONS.file}</span>
        <strong>${view.search ? "Sin resultados" : "Todavía no hay archivos"}</strong>
        <p>${view.search ? "Prueba con otro nombre o limpia la búsqueda." : h(options.emptyText || "Sube documentos o crea una carpeta para empezar a organizarlos.")}</p>
        ${!view.search && canWrite() ? `<button type="button" class="secondary-button doc-library-empty-upload" data-library-empty-upload>${ICONS.upload}<span>Subir archivos</span></button>` : ""}`;
      content.append(empty);
    } else {
      if (folders.length) {
        const section = document.createElement("div");
        section.className = "doc-library-section";
        section.innerHTML = `<h4>${view.search ? "Carpetas encontradas" : "Carpetas"}<span>${folders.length}</span></h4>`;
        const list = document.createElement("div");
        list.className = "doc-library-items";
        folders.forEach((folder) => list.append(folderRow(folder)));
        section.append(list);
        content.append(section);
      }
      if (documents.length) {
        const section = document.createElement("div");
        section.className = "doc-library-section";
        section.innerHTML = `<h4>${view.search ? "Documentos encontrados" : "Documentos"}<span>${documents.length}</span></h4>`;
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
    if (pathMeta)
      pathMeta.textContent = view.search
        ? `${total} ${total === 1 ? "resultado" : "resultados"}`
        : `${total} ${total === 1 ? "elemento" : "elementos"} en esta carpeta`;
    status.textContent = view.search
      ? `${total} ${total === 1 ? "resultado" : "resultados"}`
      : `${view.documents.length} ${view.documents.length === 1 ? "documento" : "documentos"} · ${view.folders.length} ${view.folders.length === 1 ? "carpeta" : "carpetas"}`;
    const countEl = option("countEl", null);
    const countTarget = typeof countEl === "string" ? document.querySelector(countEl) : countEl;
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
      toast("Guarda el registro antes de subir documentos.");
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
    openFolderDialog({
      folder,
      onSubmit: async ({ name, icon, color }) => {
        const entity = entityId();
        if (!entity) throw new Error("Guarda el registro antes de crear carpetas.");
        if (folder) {
          const updated = await api.updateDocumentFolder(folder.id, { name, icon, color });
          const index = view.folders.findIndex((item) => item.id === folder.id);
          if (index >= 0 && updated) view.folders[index] = updated;
        } else {
          const created = await api.createDocumentFolder({
            entityType: options.entityType,
            entityId: entity,
            category,
            parentId: view.currentFolderId,
            name,
            icon,
            color,
          });
          if (created) view.folders.push(created);
        }
        await options.onChange?.();
        render();
        toast(folder ? "Carpeta actualizada." : "Carpeta creada.");
      },
    });
  };

  const askDeleteFolder = async (folder) => {
    const childIds = descendants(view.folders, folder.id);
    const documents = view.documents.filter(
      (doc) => doc.folderId === folder.id || childIds.has(doc.folderId),
    );
    const details = [];
    if (childIds.size)
      details.push(`${childIds.size} ${childIds.size === 1 ? "subcarpeta" : "subcarpetas"}`);
    if (documents.length)
      details.push(`${documents.length} ${documents.length === 1 ? "documento" : "documentos"}`);
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
    if (
      !(await openConfirmDialog({
        title: "Eliminar documento",
        message: `¿Eliminar «${h(doc.fileName)}»? Esta acción no se puede deshacer.`,
      }))
    )
      return;
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
    if (event.target.closest("[data-library-empty-upload]")) {
      if (!canWrite()) return;
      uploadInput.dataset.replaceId = "";
      uploadInput.multiple = true;
      uploadInput.value = "";
      uploadInput.click();
      return;
    }
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
    if (event.target.closest("[data-library-open-document]") && doc) return openDocument(doc);
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

  uploadButton?.addEventListener("click", () => {
    if (!canWrite()) {
      toast("No tienes permiso para subir documentos.");
      return;
    }
    uploadInput.dataset.replaceId = "";
    uploadInput.multiple = true;
    uploadInput.value = "";
    uploadInput.click();
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
  let keyboardSelectedItem = null; // ítem seleccionado por teclado para mover
  const clearDropTargets = () =>
    root
      .querySelectorAll(".is-drop-target")
      .forEach((element) => element.classList.remove("is-drop-target"));
  const clearKeyboardSelection = () => {
    root.querySelectorAll("[aria-grabbed='true']").forEach((el) => {
      el.setAttribute("aria-grabbed", "false");
      el.classList.remove("is-drop-source");
    });
    keyboardSelectedItem = null;
  };

  async function moveItem(kind, id, folderId) {
    try {
      if (kind === "folder") {
        const updated = await api.updateDocumentFolder(id, { parentId: folderId });
        const index = view.folders.findIndex((entry) => entry.id === id);
        if (index >= 0 && updated) view.folders[index] = updated;
      } else {
        const updated = await api.updateDocument(id, { folderId });
        const index = view.documents.findIndex((entry) => entry.id === id);
        if (index >= 0 && updated) view.documents[index] = updated;
      }
      await options.onChange?.();
      render();
      toast(kind === "folder" ? "Carpeta movida." : "Documento movido.");
    } catch (error) {
      toast(error.message);
    } finally {
      clearKeyboardSelection();
    }
  }

  const dropTargetFolder = (target) => {
    const element = target.closest("[data-library-drop-folder]");
    return element ? element.dataset.libraryDropFolder || "" : null;
  };
  // Selección por teclado (Enter/Space) para mover sin ratón
  content.addEventListener("keydown", async (event) => {
    if (!canWrite()) return;
    if (event.key === "Enter" || event.key === " ") {
      const item = event.target.closest("[data-folder-id],[data-document-id]");
      if (!item) return;
      event.preventDefault();
      if (keyboardSelectedItem === item) {
        // Deseleccionar
        clearKeyboardSelection();
        return;
      }
      clearKeyboardSelection();
      item.setAttribute("aria-grabbed", "true");
      item.classList.add("is-drop-source");
      keyboardSelectedItem = item;
      toast("Ítem seleccionado. Navega a una carpeta y presiona Enter para soltar.", "info");
      return;
    }
    if (event.key === "Escape") {
      clearKeyboardSelection();
      return;
    }
    // Mover ítem seleccionado por teclado al destino con Enter sobre una carpeta
    if (event.key === "Enter" && keyboardSelectedItem) {
      const folderEl = event.target.closest("[data-library-drop-folder]");
      if (!folderEl) return;
      event.preventDefault();
      const folderId = folderEl.dataset.libraryDropFolder || view.currentFolderId;
      const kind = keyboardSelectedItem.dataset.folderId ? "folder" : "document";
      const id = keyboardSelectedItem.dataset.folderId || keyboardSelectedItem.dataset.documentId;
      if (kind === "folder") {
        const folder = view.folders.find((entry) => entry.id === id);
        if (!folder || folder.parentId === folderId) {
          clearKeyboardSelection();
          toast("No puedes mover una carpeta dentro de sí misma.");
          return;
        }
        if (folderId === folder.id || descendants(view.folders, folder.id).has(folderId)) {
          clearKeyboardSelection();
          toast("No puedes mover una carpeta dentro de sí misma.");
          return;
        }
        await moveItem(kind, id, folderId);
      } else {
        const doc = view.documents.find((entry) => entry.id === id);
        if (!doc || (doc.folderId || "") === folderId) {
          clearKeyboardSelection();
          return;
        }
        await moveItem(kind, id, folderId);
      }
    }
  });
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
        toast("No puedes mover una carpeta dentro de sí misma.");
        return;
      }
      await moveItem("folder", folder.id, folderId);
      return;
    }
    const doc = view.documents.find((entry) => entry.id === item.id);
    if (!doc || (doc.folderId || "") === folderId) return;
    await moveItem("document", doc.id, folderId);
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
  return {
    render,
    refresh,
    setEntity,
    get currentFolderId() {
      return view.currentFolderId;
    },
  };
}
