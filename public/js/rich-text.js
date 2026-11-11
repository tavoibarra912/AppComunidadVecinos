import { sanitizeHtml } from "./html.js";

/**
 * Editor de texto enriquecido mínimo basado en contenteditable.
 * Mantiene sincronizado un campo oculto para que FormData siga funcionando.
 */
export function createRichText({ editor, input, toolbar }) {
  if (!editor || !input) return null;

  const maxLength = Math.max(1, Number(editor.dataset.maxlength) || 2000);
  let lastValid = "";
  let savedRange = null;

  const clean = () => sanitizeHtml(editor.innerHTML);

  function sync() {
    lastValid = clean();
    input.value = lastValid;
    return lastValid;
  }

  function caretToEnd() {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function setValue(value) {
    const raw = String(value ?? "");
    const looksLikeHtml = /<\/?[a-z][^>]*>/i.test(raw);
    editor.innerHTML = looksLikeHtml ? sanitizeHtml(raw) : "";
    if (!looksLikeHtml) editor.textContent = raw;
    lastValid = clean();
    input.value = lastValid;
    return lastValid;
  }

  function saveSelection() {
    const selection = window.getSelection();
    savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  }

  function restoreSelection() {
    if (!savedRange) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
  }

  function applyCommand(command) {
    editor.focus();
    if (command === "createLink") {
      saveSelection();
      const entered = window.prompt("Dirección del enlace (https://…):", "https://");
      restoreSelection();
      if (!entered) return;
      const url = /^(https?:\/\/|mailto:|\/)/i.test(entered.trim())
        ? entered.trim()
        : `https://${entered.trim()}`;
      document.execCommand("createLink", false, url);
    } else {
      document.execCommand(command, false, null);
    }
    sync();
  }

  editor.addEventListener("input", () => {
    if (editor.textContent.length > maxLength) {
      editor.innerHTML = lastValid;
      caretToEnd();
      return;
    }
    sync();
  });
  editor.addEventListener("blur", sync);
  // Un `form.reset()` vacía el textarea oculto pero no el editor visual.
  editor.closest("form")?.addEventListener("reset", () => {
    editor.innerHTML = "";
    lastValid = "";
    input.value = "";
  });
  editor.addEventListener("paste", event => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  });

  toolbar?.querySelectorAll("[data-rich-command]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => applyCommand(button.dataset.richCommand));
  });

  try {
    document.execCommand("styleWithCSS", false, false);
  } catch {
    /* Navegadores sin execCommand: el editor sigue funcionando en texto plano. */
  }

  return { setValue, sync, focus: () => editor.focus() };
}
