import { api } from "../api.js";
import { state } from "../state.js";
import { toast } from "../utils.js";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(png|jpe?g|webp|pdf)$/i;

const fab = document.querySelector("#issue-reporter-fab");
const dialog = document.querySelector("#issue-reporter-dialog");
const form = document.querySelector("#issue-reporter-form");
const titleInput = form?.elements.title;
const descriptionInput = form?.elements.description;
const stepsInput = form?.elements.steps;
const affectedInput = form?.elements.affected;
const errorElement = document.querySelector("#issue-reporter-error");
const configWarning = document.querySelector("#issue-reporter-config");
const submitButton = document.querySelector("#issue-reporter-submit");
const fileInput = document.querySelector("#issue-reporter-files");
const fileList = document.querySelector("#issue-reporter-file-list");
const successPanel = document.querySelector("#issue-reporter-success");
const successNumber = document.querySelector("#issue-reporter-success-number");
const successLink = document.querySelector("#issue-reporter-success-link");
const againButton = document.querySelector("#issue-reporter-again");

let selectedFiles = [];
let submitting = false;
let config = null;
let configRequest = null;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function renderFiles() {
  fileList.replaceChildren();
  fileList.hidden = selectedFiles.length === 0;
  selectedFiles.forEach((file, index) => {
    const item = document.createElement("li");
    item.className = "issue-reporter-file";
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = file.name;
    const size = document.createElement("span");
    size.className = "issue-reporter-file-size";
    size.textContent = ` · ${formatSize(file.size)}`;
    details.append(name, size);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "issue-reporter-file-remove";
    remove.setAttribute("aria-label", `Quitar ${file.name}`);
    remove.textContent = "Quitar";
    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderFiles();
    });
    item.append(details, remove);
    fileList.append(item);
  });
}

function addFiles(files) {
  errorElement.textContent = "";
  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.test(file.name)) {
      errorElement.textContent = "Solo puedes adjuntar imágenes PNG, JPG, WebP o PDF.";
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errorElement.textContent = `«${file.name}» supera el límite de 5 MB.`;
      continue;
    }
    if (file.size === 0) {
      errorElement.textContent = `«${file.name}» está vacío.`;
      continue;
    }
    if (selectedFiles.length >= MAX_FILES) {
      errorElement.textContent = `Puedes adjuntar como máximo ${MAX_FILES} archivos.`;
      break;
    }
    const duplicate = selectedFiles.some(
      (selected) =>
        selected.name === file.name &&
        selected.size === file.size &&
        selected.lastModified === file.lastModified,
    );
    if (!duplicate) selectedFiles.push(file);
  }
  renderFiles();
}

function clearFiles() {
  selectedFiles = [];
  if (fileInput) fileInput.value = "";
  renderFiles();
}

function applyConfig() {
  if (!configWarning || !submitButton) return;
  if (config && config.enabled === false) {
    configWarning.hidden = false;
    configWarning.textContent =
      "El envío de reportes no está configurado en este servidor. El formulario se puede rellenar, pero no enviar todavía.";
    submitButton.disabled = true;
  } else {
    configWarning.hidden = true;
    configWarning.textContent = "";
    if (!submitting) submitButton.disabled = false;
  }
}

async function loadConfig() {
  if (config || configRequest) return configRequest;
  configRequest = api
    .getIssueReporterConfig()
    .then((result) => {
      config = result;
      applyConfig();
      return result;
    })
    .catch(() => {
      // Si la comprobación falla, se deja intentar el envío y el servidor
      // responderá con el error real.
      config = { enabled: true };
      return config;
    })
    .finally(() => {
      configRequest = null;
    });
  return configRequest;
}

function resetForm() {
  form.reset();
  clearFiles();
  errorElement.textContent = "";
}

function showForm() {
  successPanel.hidden = true;
  form.hidden = false;
  applyConfig();
  titleInput?.focus();
}

function openDialog() {
  if (!dialog) return;
  if (successPanel && !successPanel.hidden) resetForm();
  showForm();
  errorElement.textContent = "";
  loadConfig();
  if (!dialog.open) dialog.showModal();
  titleInput?.focus();
}

function closeDialog() {
  if (submitting) return;
  dialog?.close();
}

function setSuccess(result) {
  const number = Number(result?.number);
  const url = String(result?.url || "");
  successNumber.textContent = Number.isInteger(number) ? `#${number}` : "creado";
  if (/^https?:\/\//i.test(url)) {
    successLink.href = url;
    successLink.hidden = false;
  } else {
    successLink.hidden = true;
  }
  form.hidden = true;
  successPanel.hidden = false;
  clearFiles();
  successPanel.querySelector("h2")?.focus?.();
}

function validate() {
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  if (title.length < 5) {
    errorElement.textContent = "El título debe tener al menos 5 caracteres.";
    titleInput.focus();
    return false;
  }
  if (title.length > 140) {
    errorElement.textContent = "El título no puede superar los 140 caracteres.";
    titleInput.focus();
    return false;
  }
  if (description.length < 20) {
    errorElement.textContent = "La descripción debe tener al menos 20 caracteres.";
    descriptionInput.focus();
    return false;
  }
  if (description.length > 5000) {
    errorElement.textContent = "La descripción no puede superar los 5000 caracteres.";
    descriptionInput.focus();
    return false;
  }
  if (stepsInput.value.trim().length > 3000) {
    errorElement.textContent = "Los pasos no pueden superar los 3000 caracteres.";
    stepsInput.focus();
    return false;
  }
  if (affectedInput.value.trim().length > 200) {
    errorElement.textContent = "La comunidad o unidad no puede superar los 200 caracteres.";
    affectedInput.focus();
    return false;
  }
  return true;
}

export function renderIssueReporter() {
  if (!fab) return;
  const visible = Boolean(state.currentUserId);
  fab.hidden = !visible;
  if (!visible && dialog?.open) dialog.close();
}

fab?.addEventListener("click", openDialog);

document.querySelectorAll("[data-close-issue-reporter]").forEach((button) => {
  button.addEventListener("click", closeDialog);
});

dialog?.addEventListener("cancel", (event) => {
  if (!submitting) return;
  event.preventDefault();
});

dialog?.addEventListener("close", () => {
  if (successPanel && !successPanel.hidden) {
    resetForm();
    showForm();
  }
});

fileInput?.addEventListener("change", () => {
  addFiles(fileInput.files || []);
  fileInput.value = "";
});

againButton?.addEventListener("click", () => {
  resetForm();
  showForm();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || submitButton.disabled) return;
  errorElement.textContent = "";
  if (!validate()) return;

  const payload = new FormData();
  payload.append("title", titleInput.value.trim());
  payload.append("description", descriptionInput.value.trim());
  payload.append("steps", stepsInput.value.trim());
  payload.append("affected", affectedInput.value.trim());
  payload.append("screen", `${window.location.pathname}${window.location.hash}`);
  payload.append("userAgent", navigator.userAgent);
  payload.append("language", navigator.language || "");
  payload.append("viewport", `${window.innerWidth}x${window.innerHeight}`);
  for (const file of selectedFiles) payload.append("files", file, file.name);

  submitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Enviando…";
  form.setAttribute("aria-busy", "true");
  try {
    const result = await api.reportIssue(payload);
    setSuccess(result);
    toast(`Reporte #${result.number} enviado a GitHub.`, "success");
  } catch (error) {
    errorElement.textContent = error.message || "No se pudo enviar el reporte.";
  } finally {
    submitting = false;
    form.removeAttribute("aria-busy");
    submitButton.textContent = "Enviar reporte";
    applyConfig();
  }
});
