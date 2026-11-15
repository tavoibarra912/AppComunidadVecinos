import path from "node:path";
import { DOCUMENT_TYPES, getSettings } from "./db.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const OLE_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Tipos admitidos por extensión. El contenido real se comprueba con sus bytes. */
const MIMES_BY_EXTENSION = Object.freeze({
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".doc": ["application/msword"],
  ".docx": [DOCX_MIME],
});

const MIME_ALIASES = Object.freeze({
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "application/x-pdf": "application/pdf",
});

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_TOTAL_EMBEDDED_BYTES = 50 * 1024 * 1024;

/** Límites efectivos, compartidos por la biblioteca multipart y los expedientes JSON. */
export function documentLimits() {
  const settings = getSettings();
  const configured = Array.isArray(settings.documentosTiposPermitidos)
    ? settings.documentosTiposPermitidos
    : DOCUMENT_TYPES;
  const allowed = new Set(
    configured
      .map((tipo) => `.${String(tipo).trim().toLowerCase().replace(/^\./, "")}`)
      .filter((extension) => MIMES_BY_EXTENSION[extension]),
  );
  if (!allowed.size) Object.keys(MIMES_BY_EXTENSION).forEach((ext) => allowed.add(ext));
  return {
    allowed,
    maxBytes: Math.min(50, Math.max(1, Number(settings.documentosMaxSizeMb) || 15)) * 1024 * 1024,
    maxFiles: Math.min(50, Math.max(1, Number(settings.documentosMaxArchivos) || 20)),
  };
}

export function allowedDocumentLabels(limits = documentLimits()) {
  return [...limits.allowed].map((extension) => extension.slice(1).toUpperCase()).join(", ");
}

/**
 * Comprueba que los bytes iniciales correspondan de verdad a la extensión.
 * Devuelve el MIME real o cadena vacía si no coinciden.
 */
export function detectContentType(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return "";
  const ext = String(extension || "").toLowerCase();
  if (!MIMES_BY_EXTENSION[ext]) return "";
  if (ext === ".pdf" && buffer.subarray(0, 5).toString("latin1") === "%PDF-")
    return "application/pdf";
  if (
    [".jpg", ".jpeg"].includes(ext) &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "image/jpeg";
  if (
    ext === ".png" &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ext === ".webp" &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (ext === ".doc" && buffer.subarray(0, 8).equals(OLE_HEADER)) return "application/msword";
  if (
    ext === ".docx" &&
    buffer.subarray(0, 4).toString("latin1") === "PK\u0003\u0004" &&
    buffer.includes("[Content_Types].xml")
  )
    return DOCX_MIME;
  return "";
}

function parseDataUrl(value) {
  if (typeof value !== "string" || value.length > 80 * 1024 * 1024) return null;
  const match = /^data:([^;,]+)?((?:;[^,]*)?),([\s\S]*)$/i.exec(value);
  if (!match) return null;
  const mime = String(match[1] || "")
    .trim()
    .toLowerCase();
  const params = match[2] || "";
  const payload = match[3] || "";
  let buffer;
  if (/;base64(?:;|$)/i.test(params)) {
    if (!/^[A-Za-z0-9+/=\s]*$/.test(payload)) return null;
    buffer = Buffer.from(payload, "base64");
  } else {
    try {
      buffer = Buffer.from(decodeURIComponent(payload), "utf8");
    } catch {
      return null;
    }
  }
  return buffer.length ? { mime, buffer } : null;
}

function normalizeMime(mime) {
  const value = String(mime || "")
    .trim()
    .toLowerCase();
  return MIME_ALIASES[value] || value;
}

function documentNameError(fileName, limits) {
  if (
    !fileName ||
    fileName.length > 255 ||
    /[\x00-\x1f\x7f]/.test(fileName) ||
    /[\\/]/.test(fileName)
  )
    return "El nombre del documento no es válido.";
  const extension = path.extname(fileName).toLowerCase();
  if (!limits.allowed.has(extension))
    return `Formato no permitido. Usa ${allowedDocumentLabels(limits)}.`;
  return "";
}

/**
 * Valida y normaliza un documento embebido en una ficha. Los documentos de
 * ejemplo se aceptan solo como SVG generado por la propia interfaz y nunca se
 * pueden aprobar; el resto debe superar extensión, MIME, bytes y tamaño.
 */
export function inspectEmbeddedDocument(doc) {
  const limits = documentLimits();
  const fileName = String(doc.fileName || "").trim();
  const nameError = documentNameError(fileName, limits);
  if (nameError) return { error: nameError };

  const metadata = { ...doc, dataUrl: "" };
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > MAX_METADATA_BYTES)
    return { error: "El expediente contiene demasiados datos adicionales." };

  const parsed = parseDataUrl(doc.dataUrl);
  if (!parsed)
    return {
      error: `El documento «${fileName}» no contiene un archivo válido (se espera una data URL).`,
    };
  if (parsed.buffer.length > limits.maxBytes)
    return {
      error: `El documento «${fileName}» supera el límite de ${limits.maxBytes / 1024 / 1024} MB.`,
    };

  if (doc.isSample === true) {
    const svg = parsed.buffer.toString("utf8").trim();
    if (
      parsed.mime !== "image/svg+xml" ||
      !/^<svg[\s>]/i.test(svg) ||
      /(<script\b|javascript:|\bon[a-z]+\s*=)/i.test(svg)
    )
      return { error: "El documento de ejemplo no es un SVG válido." };
    return {
      value: {
        ...doc,
        fileName,
        fileType: "image/svg+xml",
        fileSize: parsed.buffer.length,
      },
    };
  }

  const extension = path.extname(fileName).toLowerCase();
  const expected = MIMES_BY_EXTENSION[extension];
  const declared = normalizeMime(parsed.mime);
  if (declared && declared !== "application/octet-stream" && !expected.includes(declared))
    return {
      error: `El tipo de contenido del documento «${fileName}» no coincide con su extensión.`,
    };
  const contentType = detectContentType(parsed.buffer, extension);
  if (!contentType)
    return {
      error: `El contenido del documento «${fileName}» no corresponde a un archivo ${extension
        .slice(1)
        .toUpperCase()} válido.`,
    };
  return {
    value: {
      ...doc,
      fileName,
      fileType: contentType,
      fileSize: parsed.buffer.length,
      dataUrl: `data:${contentType};base64,${parsed.buffer.toString("base64")}`,
    },
  };
}

export function totalEmbeddedBytes(documents) {
  return Object.values(documents || {}).reduce((sum, doc) => sum + Number(doc?.fileSize || 0), 0);
}

export const EMBEDDED_DOCUMENT_LIMITS = Object.freeze({
  maxTotalBytes: MAX_TOTAL_EMBEDDED_BYTES,
  maxMetadataBytes: MAX_METADATA_BYTES,
});
