// ==========================================
// UTILIDADES DE INTERFAZ Y FORMATEO
// ==========================================

const toastEl = document.querySelector("#toast");
let toastTimer = 0;

const TOAST_ICONOS = {
  info: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"></line><line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"></line></svg>",
  success: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"></path><polyline points=\"22 4 12 14.01 9 11.01\"></polyline></svg>",
  error: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"></line><line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"></line></svg>",
  warning: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line></svg>"
};

/** Deduce el tipo de toast por el contenido del mensaje (para las 78 llamadas existentes). */
function detectarTipoToast(mensaje) {
  if (/no se pudo|inválid|incorrect|no coincide|no tenés permiso|no está permitido|ya existe|no es válid|no corresponde/i.test(mensaje)) return "error";
  if (/no se puede|antes de|desvinculá|elimina los|reasigna|pendiente de verificación|esperá/i.test(mensaje)) return "warning";
  if (/correcto|éxito|exitosamente|guardad|eliminad|cread|actualizad|registrad|enviad|verificado|cerrad|restablecid|sincronizad/i.test(mensaje)) return "success";
  return "info";
}

export function toast(message, tipo) {
  if (!toastEl) return;
  const tipoFinal = tipo && TOAST_ICONOS[tipo] ? tipo : detectarTipoToast(message);
  toastEl.dataset.tipo = tipoFinal;
  toastEl.replaceChildren();
  const icono = document.createElement("span");
  icono.className = "toast-icono";
  icono.innerHTML = TOAST_ICONOS[tipoFinal];
  const texto = document.createElement("span");
  texto.className = "toast-texto";
  texto.textContent = message;
  toastEl.append(icono, texto);
  window.clearTimeout(toastTimer);
  const supportsPopover = typeof toastEl.showPopover === "function";
  // Un diálogo puede reconstruir su contenido y desconectar el aviso anterior.
  // El popover se mantiene en el body y se abre después del modal en el top-layer.
  const openDialog = document.querySelector("dialog[open]");
  const host = supportsPopover ? document.body : openDialog || document.body;
  if (toastEl.parentElement !== host || !toastEl.isConnected) host.appendChild(toastEl);
  if (supportsPopover) {
    if (toastEl.matches(":popover-open")) toastEl.hidePopover();
    toastEl.showPopover();
  }
  // Reiniciar la transición: forzar reflow con el toast fuera de pantalla.
  toastEl.classList.remove("visible");
  void toastEl.offsetWidth;
  toastEl.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("visible");
    if (supportsPopover && toastEl.matches(":popover-open")) toastEl.hidePopover();
  }, 5200);
}

export function digitsOnly(value, max) {
  return (value || "").replace(/\D/g, "").slice(0, max);
}

export function formatPhone(value) {
  const d = digitsOnly(value, 9);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export function digitsIban(value) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

export function formatIban(value) {
  if (!value) return "No registrado";
  return digitsIban(value).replace(/(.{4})/g, "$1 ").trim();
}

export function maskIbanField(el) {
  const clean = digitsIban(el.value).replace(/[^A-Z0-9]/g, "").slice(0, 24);
  el.value = clean.replace(/(.{4})/g, "$1 ").trim();
}

export function fieldLabel(el) {
  const host = el.closest("label");
  if (!host) return el.name || "Campo";
  return host.childNodes[0].textContent.replace("*", "").trim();
}

const MENSAJES_DE_VALIDEZ = {
  valueMissing: "completá este campo",
  typeMismatch: "el formato no es válido",
  patternMismatch: "no cumple el formato pedido",
  tooShort: "es demasiado corto",
  tooLong: "es demasiado largo",
  rangeUnderflow: "es menor que el mínimo permitido",
  rangeOverflow: "es mayor que el máximo permitido",
  stepMismatch: "no cumple el incremento permitido"
};

/** Traduce al español la razón de invalidez nativa del navegador. */
export function mensajeDeValidez(element) {
  const razon = Object.keys(MENSAJES_DE_VALIDEZ).find(clave => element.validity?.[clave]);
  return razon ? MENSAJES_DE_VALIDEZ[razon] : "tiene un valor no válido";
}

export function getLocalDateInputValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && getLocalDateInputValue(date) === value;
}

export function formatContractDate(value) {
  return value ? value.split("-").reverse().join("/") : "Sin fecha de fin";
}

// ==========================================
// VALIDADORES DE DOMINIO
// ==========================================

/**
 * Valida un DNI o NIE español mediante cálculo de dígito de control módulo 23
 */
export function isValidDniNie(value) {
  if (!value) return false;
  const str = value.trim().toUpperCase();
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dniMatch = str.match(/^(\d{8})([A-Z])$/);
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  const nieMatch = str.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nieMatch) {
    const prefix = nieMatch[1] === "X" ? "0" : (nieMatch[1] === "Y" ? "1" : "2");
    const num = parseInt(prefix + nieMatch[2], 10);
    const letter = nieMatch[3];
    return letters[num % 23] === letter;
  }

  return false;
}

export function isValidCif(value) {
  if (!value) return false;
  const str = value.trim().toUpperCase();
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(str)) return false;
  const digits = str.slice(1, 8);
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = Number(digits[i]);
    if ((i + 1) % 2 === 0) {
      sumA += n;
    } else {
      const doubled = (n * 2).toString();
      sumB += Number(doubled[0]) + (Number(doubled[1]) || 0);
    }
  }
  const control = (10 - ((sumA + sumB) % 10)) % 10;
  const last = str[8];
  const letterControl = "JABCDEFGHI";
  if ("PQRSNW".includes(str[0])) return last === letterControl[control];
  if ("ABEH".includes(str[0])) return last === String(control);
  return last === String(control) || last === letterControl[control];
}

export function detectDocumentType(value) {
  const str = (value || "").trim().toUpperCase();
  if (/^[XYZ]/.test(str)) return "NIE";
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(str) && !/^\d{8}[A-Z]$/.test(str)) return "CIF";
  return "DNI";
}

export function isValidIdentityDocument(value, documentType) {
  const str = (value || "").trim().toUpperCase();
  if (documentType === "CIF") return isValidCif(str);
  if (documentType === "NIE") return /^[XYZ]\d{7}[A-Z]$/.test(str) && isValidDniNie(str);
  return /^\d{8}[A-Z]$/.test(str) && isValidDniNie(str);
}

export function isValidIban(value) {
  if (!value) return true;
  const clean = digitsIban(value);
  if (!/^ES\d{22}$/.test(clean)) return false;

  let remainder = 0;
  for (const char of clean.slice(4) + clean.slice(0, 4)) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function isValidPhone(value) {
  return /^[6789]\d{8}$/.test(digitsOnly(value, 9));
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || "").trim());
}

export function isValidCadastralRef(value) {
  if (!value) return true;
  return /^[A-Z0-9]{20}$/.test(value.replace(/\s+/g, "").toUpperCase());
}

export function isValidDecimal(value, min, max) {
  if (!value) return true;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return false;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= min && n <= max;
}

// ==========================================
// DOCUMENTACIÓN GENÉRICA (inquilinos, comunidades e inmuebles)
// ==========================================

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Error de lectura del archivo."));
    reader.readAsDataURL(file);
  });
}

export function validateDocumentFiles(files) {
  const messages = [];
  [...files].forEach(file => {
    const extension = file.name.split(".").pop().toLowerCase();
    const allowed = ["pdf", "jpg", "jpeg", "png", "webp"].includes(extension);
    if (!allowed) messages.push(`El archivo "${file.name}" debe ser PDF, JPG, PNG o WEBP.`);
    if (file.size > 15 * 1024 * 1024) messages.push(`El archivo "${file.name}" supera el límite de 15 MB.`);
  });
  return messages;
}

export function setupGenericFileDropzone(dropzoneEl, inputEl) {
  if (!dropzoneEl || !inputEl) return;
  ["dragenter", "dragover"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove("dragover");
    });
  });
  dropzoneEl.addEventListener("drop", e => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const transfer = new DataTransfer();
    [...inputEl.files, ...files].forEach(file => transfer.items.add(file));
    inputEl.files = transfer.files;
  });
}

/**
 * Convierte un <select> en un combo con buscador integrado: un campo de
 * texto con desplegable filtrable. El select original queda oculto dentro
 * del componente y sigue siendo el que guarda el valor (serialización de
 * formularios intacta; los cambios externos de valor se sincronizan).
 */
export function makeSelectSearchable(select, placeholder = "Escribe para buscar…") {
  if (!select || select.dataset.combo === "true") return select;
  select.dataset.combo = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "combo-box";
  select.parentNode.insertBefore(wrapper, select);

  const input = document.createElement("input");
  input.type = "search";
  input.className = "combo-box-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");

  const list = document.createElement("ul");
  list.className = "combo-box-options";
  list.hidden = true;
  list.setAttribute("role", "listbox");

  wrapper.append(input, list);
  select.classList.add("combo-box-select");
  wrapper.append(select);

  function selectedText() {
    const option = select.selectedOptions[0];
    return option && option.value ? option.textContent : "";
  }

  function openList() {
    // Auto-sanado: si el texto no corresponde con la selección, sincronizar
    // (el select puede haber cambiado por fuera del componente)
    const selected = selectedText();
    const matchesSelection = [...select.options].some(o => o.value && o.textContent === input.value);
    if (!matchesSelection) input.value = selected;

    list.replaceChildren();
    const q = input.value.trim().toLocaleLowerCase("es");
    const options = [...select.options].filter(o => o.value);
    const matches = options.filter(o => !q || o.textContent.toLocaleLowerCase("es").includes(q));
    if (matches.length === 0) {
      const li = document.createElement("li");
      li.className = "combo-box-empty";
      li.textContent = "Sin resultados";
      list.append(li);
    }
    matches.slice(0, 80).forEach(option => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.value = option.value;
      li.textContent = option.textContent;
      if (option.value === select.value) li.classList.add("selected");
      li.addEventListener("mousedown", event => {
        event.preventDefault();
        select.value = option.value;
        input.value = option.textContent;
        closeList();
        select.dispatchEvent(new Event("change"));
      });
      list.append(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function closeList() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  select.addEventListener("change", () => {
    input.value = selectedText();
  });

  input.addEventListener("focus", openList);
  input.addEventListener("input", openList);
  input.addEventListener("blur", () => setTimeout(closeList, 150));
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeList();
      return;
    }
    if (event.key === "Enter" && !list.hidden) {
      const first = list.querySelector("li[data-value]");
      if (first) {
        event.preventDefault();
        select.value = first.dataset.value;
        input.value = first.textContent;
        closeList();
        select.dispatchEvent(new Event("change"));
      }
    }
  });

  input.value = selectedText();
  return select;
}

/**
 * Muestra un modal con TODOS los errores de validación juntos.
 */
export function showValidationErrors(messages, title = "Revisá los siguientes datos") {
  const dialog = document.querySelector("#validation-dialog");
  const list = document.querySelector("#validation-list");
  if (!dialog || !list) {
    toast(messages.join(" "));
    return;
  }
  // Botones de cierre (se conectan una sola vez)
  if (!dialog.dataset.closeWired) {
    dialog.dataset.closeWired = "true";
    document.querySelector("#close-validation-dialog")?.addEventListener("click", () => dialog.close());
    document.querySelector("#close-validation-btn")?.addEventListener("click", () => dialog.close());
  }
  document.querySelector("#validation-title").textContent = title;
  list.replaceChildren();
  messages.forEach(message => {
    const li = document.createElement("li");
    li.textContent = message;
    list.append(li);
  });
  if (!dialog.open) dialog.showModal();
}

// ==========================================
// GUARD DE CAMBIOS SIN GUARDAR + MODO LECTURA
// ==========================================

const guardias = new WeakMap();

// Puente para que el handler global de Esc (main.js) use el guard
window.intentarCerrar = intentarCerrar;

function formDataSnapshot(form) {
  if (!form) return "";
  const entries = [...new FormData(form).entries()].sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries.map(([name, value]) => [name, String(value)]));
}

/** Toma una foto del estado del formulario al abrirlo (base del guard). */
export function armarGuardia(form, dialog) {
  if (form && dialog) guardias.set(form, formDataSnapshot(form));
}

/** Marca el estado actual como "guardado" (llamar tras guardar con éxito). */
export function limpiarGuardia(form) {
  if (form) guardias.set(form, formDataSnapshot(form));
}

export function hayCambiosSinGuardar(form) {
  if (!form) return false;
  const base = guardias.get(form);
  return base !== undefined && base !== formDataSnapshot(form);
}

/**
 * Intenta cerrar el diálogo: si hay cambios sin guardar pide confirmación.
 */
export function intentarCerrar(form, dialog) {
  if (!dialog) return;
  if (!hayCambiosSinGuardar(form)) {
    dialog.close();
    return;
  }
  const confirmDialog = document.querySelector("#confirm-close-dialog");
  if (!confirmDialog) {
    dialog.close();
    return;
  }
  confirmDialog.dataset.targetDialog = dialog.id || "";
  if (!confirmDialog.open) confirmDialog.showModal();
}

// Botones del diálogo de confirmación de cierre
(() => {
  const confirmDialog = document.querySelector("#confirm-close-dialog");
  if (!confirmDialog) return;
  const cerrarObjetivo = () => {
    const target = document.getElementById(confirmDialog.dataset.targetDialog || "");
    if (target && target.close) target.close();
    confirmDialog.close();
  };
  document.querySelector("#confirm-close-leave")?.addEventListener("click", cerrarObjetivo);
  document.querySelector("#confirm-close-stay")?.addEventListener("click", () => confirmDialog.close());
  document.querySelector("#close-confirm-close-dialog")?.addEventListener("click", () => confirmDialog.close());
})();

/**
 * Pone todos los controles del formulario en modo sólo lectura y oculta
 * los botones de guardado/cancelación (modo "ver").
 */
export function setFormReadonly(form, readonly) {
  if (!form) return;
  form.classList.toggle("is-readonly", readonly);
  // Sólo controles de valor: los botones (tabs, cierres) deben seguir
  // siendo operables en modo lectura
  form.querySelectorAll("input, select, textarea").forEach(element => {
    if (element.type === "submit" || element.closest(".dialog-actions")) return;
    element.disabled = readonly;
  });
  form.querySelectorAll(".dialog-actions").forEach(actions => {
    actions.hidden = readonly;
  });
}

export function renderDocumentRecords(container, records, removeAttr, emptyText) {
  container.replaceChildren();
  if (!records || records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  records.forEach(documentRecord => {
    const item = document.createElement("div");
    item.className = "property-document-item";
    const link = document.createElement("a");
    link.textContent = `${documentRecord.fileName} · ${Math.ceil((documentRecord.fileSize || 0) / 1024)} KB`;
    const href = documentRecord.url || documentRecord.dataUrl;
    if (href) {
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      link.download = documentRecord.fileName;
    }
    item.append(link);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.dataset[removeAttr] = documentRecord.id;
    removeButton.textContent = "Quitar";
    item.append(removeButton);
    container.append(item);
  });
}
