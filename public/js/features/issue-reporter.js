import { api } from "../api.js";
import { htmlToText } from "../html.js";
import { createRichText } from "../rich-text.js";
import { state } from "../state.js";

const MIME_BY_EXTENSION = Object.freeze({
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

function defaultAttachmentRules() {
  const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"];
  return {
    maxFiles: 20,
    maxBytes: 15 * 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
    allowed: new Set(allowed),
    allowedExtensions: allowed,
    labels: "PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX",
  };
}

function attachmentRulesFromConfig(value) {
  if (!value || typeof value !== "object") return null;
  const allowedExtensions = (Array.isArray(value.allowed) ? value.allowed : [])
    .map((extension) => String(extension).trim().toLowerCase().replace(/^\./, ""))
    .filter((extension) => /^[a-z0-9]+$/.test(extension));
  const maxFiles = Math.trunc(Number(value.maxFiles));
  const maxBytes = Number(value.maxBytes);
  const maxTotalBytes = Number(value.maxTotalBytes);
  if (
    !allowedExtensions.length ||
    !Number.isFinite(maxFiles) ||
    maxFiles < 1 ||
    !Number.isFinite(maxBytes) ||
    maxBytes < 1
  ) {
    return null;
  }
  return {
    maxFiles: Math.min(maxFiles, 50),
    maxBytes,
    maxTotalBytes:
      Number.isFinite(maxTotalBytes) && maxTotalBytes > 0 ? maxTotalBytes : maxBytes * maxFiles,
    allowed: new Set(allowedExtensions.map((extension) => `.${extension}`)),
    allowedExtensions: allowedExtensions.map((extension) => `.${extension}`),
    labels: String(
      value.labels || allowedExtensions.map((extension) => extension.toUpperCase()).join(", "),
    ),
  };
}

const fab = document.querySelector("#issue-reporter-fab");
const dialog = document.querySelector("#issue-reporter-dialog");
const form = document.querySelector("#issue-reporter-form");
const titleInput = form?.elements.title;
const descriptionInput = form?.elements.description;
const stepsInput = form?.elements.steps;
const errorElement = document.querySelector("#issue-reporter-error");
const configWarning = document.querySelector("#issue-reporter-config");
const submitButton = document.querySelector("#issue-reporter-submit");
const fileInput = document.querySelector("#issue-reporter-files");
const filesHint = document.querySelector("#issue-reporter-files-hint");
const fileList = document.querySelector("#issue-reporter-file-list");
const successPanel = document.querySelector("#issue-reporter-success");

const richDescription = createRichText({
  editor: document.querySelector("#issue-reporter-description-editor"),
  input: descriptionInput,
  toolbar: document.querySelector("#issue-reporter-description-toolbar"),
});
const richSteps = createRichText({
  editor: document.querySelector("#issue-reporter-steps-editor"),
  input: stepsInput,
  toolbar: document.querySelector("#issue-reporter-steps-toolbar"),
});

let selectedFiles = [];
let submitting = false;
let config = null;
let configRequest = null;
let attachmentRules = defaultAttachmentRules();

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function megabytes(bytes) {
  const value = bytes / 1024 / 1024;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function updateAttachmentField() {
  if (!fileInput) return;
  const extensions = attachmentRules.allowedExtensions;
  const mimeTypes = extensions.map((extension) => MIME_BY_EXTENSION[extension]).filter(Boolean);
  fileInput.accept = [...extensions, ...mimeTypes].join(",");
  if (filesHint) {
    const count =
      attachmentRules.maxFiles === 1 ? "1 archivo" : `${attachmentRules.maxFiles} archivos`;
    filesHint.textContent = `Hasta ${count} de ${megabytes(attachmentRules.maxBytes)} MB por archivo (${megabytes(
      attachmentRules.maxTotalBytes,
    )} MB en total): ${attachmentRules.labels}.`;
  }
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
    const extension = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
    if (!attachmentRules.allowed.has(extension)) {
      errorElement.textContent = `Solo puedes adjuntar ${attachmentRules.labels}.`;
      continue;
    }
    if (file.size > attachmentRules.maxBytes) {
      errorElement.textContent = `«${file.name}» supera el límite de ${megabytes(
        attachmentRules.maxBytes,
      )} MB.`;
      continue;
    }
    if (file.size === 0) {
      errorElement.textContent = `«${file.name}» está vacío.`;
      continue;
    }
    if (selectedFiles.length >= attachmentRules.maxFiles) {
      errorElement.textContent = `Puedes adjuntar como máximo ${attachmentRules.maxFiles} ${
        attachmentRules.maxFiles === 1 ? "archivo" : "archivos"
      }.`;
      break;
    }
    const total = selectedFiles.reduce((sum, selected) => sum + selected.size, 0) + file.size;
    if (total > attachmentRules.maxTotalBytes) {
      errorElement.textContent = `Los adjuntos no pueden superar ${megabytes(
        attachmentRules.maxTotalBytes,
      )} MB en total.`;
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
  updateAttachmentField();
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
  if (config) return config;
  if (configRequest) return configRequest;
  configRequest = api
    .getIssueReporterConfig()
    .then((result) => {
      config = result;
      const rules = attachmentRulesFromConfig(result?.attachments);
      if (rules) attachmentRules = rules;
      applyConfig();
      return result;
    })
    .catch(() => {
      // Si la comprobación falla, se deja intentar el envío y el servidor
      // responderá con el error real.
      config = { enabled: true };
      applyConfig();
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
  dialog.setAttribute("aria-labelledby", "issue-reporter-title");
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

function setSuccess() {
  form.hidden = true;
  successPanel.hidden = false;
  dialog.setAttribute("aria-labelledby", "issue-reporter-success-title");
  clearFiles();
  successPanel.querySelector("h2")?.focus?.();
}

function validate() {
  const title = titleInput.value.trim();
  const description = htmlToText(descriptionInput.value);
  const steps = htmlToText(stepsInput.value);
  if (!title) {
    errorElement.textContent = "El título es obligatorio.";
    titleInput.focus();
    return false;
  }
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
  if (!description) {
    errorElement.textContent = "La descripción es obligatoria.";
    if (richDescription) richDescription.focus();
    else descriptionInput.focus();
    return false;
  }
  if (description.length < 20) {
    errorElement.textContent = "La descripción debe tener al menos 20 caracteres.";
    if (richDescription) richDescription.focus();
    else descriptionInput.focus();
    return false;
  }
  if (description.length > 5000) {
    errorElement.textContent = "La descripción no puede superar los 5000 caracteres.";
    if (richDescription) richDescription.focus();
    else descriptionInput.focus();
    return false;
  }
  if (steps.length > 3000) {
    errorElement.textContent = "Los pasos no pueden superar los 3000 caracteres.";
    if (richSteps) richSteps.focus();
    else stepsInput.focus();
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
  // El «cancel» del selector de archivos burbujea hasta aquí: no es Escape.
  if (event.target !== dialog) return;
  if (!submitting) return;
  event.preventDefault();
});

dialog?.addEventListener("close", () => {
  if (successPanel && !successPanel.hidden) {
    resetForm();
    showForm();
  }
});

fileInput?.addEventListener("change", async () => {
  await loadConfig();
  addFiles(fileInput.files || []);
  fileInput.value = "";
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
    await api.reportIssue(payload);
    setSuccess();
  } catch (error) {
    errorElement.textContent = error.message || "No se pudo enviar el reporte.";
  } finally {
    submitting = false;
    form.removeAttribute("aria-busy");
    submitButton.textContent = "Enviar reporte";
    applyConfig();
  }
});
