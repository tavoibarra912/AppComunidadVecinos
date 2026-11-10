// Saneamiento de texto enriquecido para el servidor. No depende del DOM:
// reconstruye el HTML desde cero y sólo conserva una lista cerrada de etiquetas
// y el atributo href de los enlaces (validado por esquema).
const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "a",
  "h3",
  "h4",
  "blockquote",
]);
const VOID_TAGS = new Set(["br"]);

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function safeHref(value) {
  const href = String(value || "").trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (/^\/(?!\/)/.test(href)) return href;
  return "";
}

/**
 * Convierte texto plano o HTML en HTML seguro.
 * El texto plano se escapa; del HTML se descartan etiquetas y atributos no
 * permitidos. Así se evita cualquier inyección aunque el cliente sea malicioso.
 */
export function sanitizeRichText(value, { maxLength = 20000 } = {}) {
  const source = String(value ?? "").slice(0, maxLength);
  const tagPattern = /<\s*(\/?)\s*([a-z0-9]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  let output = "";
  let cursor = 0;
  const openTags = [];

  for (const match of source.matchAll(tagPattern)) {
    output += escapeText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    const attributes = match[3] || "";
    if (!ALLOWED_TAGS.has(name)) continue;

    if (closing) {
      if (VOID_TAGS.has(name)) continue;
      // Sólo se cierra una etiqueta que esté realmente abierta. Si hay
      // etiquetas anidadas pendientes, se cierran en orden para mantener
      // un HTML bien formado (y descartar cierres huérfanos).
      const index = openTags.lastIndexOf(name);
      if (index === -1) continue;
      while (openTags.length > index) output += `</${openTags.pop()}>`;
      continue;
    }
    if (VOID_TAGS.has(name)) {
      output += `<${name}>`;
      continue;
    }
    if (name === "a") {
      const hrefMatch = attributes.match(
        /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i,
      );
      const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3]);
      if (!href) continue;
      output += `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
      openTags.push(name);
      continue;
    }
    output += `<${name}>`;
    openTags.push(name);
  }

  output += escapeText(source.slice(cursor));
  while (openTags.length) output += `</${openTags.pop()}>`;
  return output.trim();
}
