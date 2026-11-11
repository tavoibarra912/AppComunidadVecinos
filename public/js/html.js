import DOMPurify from "/vendor/dompurify.mjs";
export function sanitizeHtml(value) {
  return DOMPurify.sanitize(String(value ?? ""), {
    FORBID_TAGS: ["style", "form", "iframe", "object", "embed"],
  });
}
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/** Convierte un valor almacenado (texto plano antiguo o HTML) en HTML seguro. */
export function richTextHtml(value) {
  const raw = String(value ?? "");
  if (!/<\/?[a-z][^>]*>/i.test(raw)) {
    return escapeHtml(raw).replace(/\r?\n/g, "<br>");
  }
  return sanitizeHtml(raw);
}

/** Texto plano de un valor enriquecido, para resúmenes y tablas. */
export function htmlToText(value) {
  const container = document.createElement("div");
  container.innerHTML = richTextHtml(value).replace(
    /<\/(p|li|h[1-6]|blockquote)>/gi,
    "$& ",
  );
  return (container.textContent || "").replace(/\s+/g, " ").trim();
}

export function documentUrl(value) {
  if (typeof value !== "string") return "";
  if (
    /^data:(application\/pdf|image\/(png|jpeg|webp|svg\+xml))[;,]/i.test(value)
  )
    return value;
  if (/^\/api\/documents\/[a-zA-Z0-9-]+\/download$/.test(value)) return value;
  return "";
}
