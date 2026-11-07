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
export function documentUrl(value) {
  if (typeof value !== "string") return "";
  if (
    /^data:(application\/pdf|image\/(png|jpeg|webp|svg\+xml))[;,]/i.test(value)
  )
    return value;
  if (/^\/api\/documents\/[a-zA-Z0-9-]+\/download$/.test(value)) return value;
  return "";
}
