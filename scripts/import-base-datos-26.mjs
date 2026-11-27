#!/usr/bin/env node
// Importador local de «BASE DE DATOS 26» (Asociación de Propietarios de
// Parcelas Peña Rubia) siguiendo el mapping de Book1.
//
// Nunca toca la base de producción: por defecto hace un dry-run que solo
// escribe un informe en una carpeta local y, con --write, crea una base nueva
// dentro de esa misma carpeta (nunca en data/ ni uploads/).
//
// Uso:
//   node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm"
//   node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm" --write
//
// Ver docs/importacion-base-datos-26.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIdentityDocument, isValidIdentityDocument } from "../public/js/utils.js";
import {
  normalizeCadastralReference,
  cadastralReferenceProblem,
} from "../src/cadastral-reference.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SHEET_NAME = "BASE DE DATOS COMPLETA";
export const DEFAULT_OUT_DIR = path.join(ROOT, ".local-test", "base-26");

// Mapping de Book1 (columna Excel → campo de la app). Índices 0-based.
const COL = Object.freeze({
  refRegantes: 0, // A  Ref.
  pcla: 2, // C  Pcla.
  titular: 3, // D  Nombre del Titular (Asociación)
  cadastralRef: 5, // F  Ref. Catastral
  dni: 6, // G  DNI/NIF
  areaM2: 8, // I  Superficie C.R.
  cuotaSuperficie: 12, // M  CUOTA DE SUPERFICIE (solo informativa)
  tipoVia: 14, // O  Tipo de via
  direccion: 15, // P  Direccion
  telefonoFijo: 16, // Q  Teléfono fijo
  telefonoMovil: 17, // R  Teléfono móvil
  email: 18, // S  E-mail
  codigoPostal: 19, // T  Codigo Postal
  localidad: 20, // U  Localidad (para la ciudad obligatoria)
});

const MAX_COLUMNS = 21;

// Datos fijos de la comunidad (Book1, hoja «Comunidad»).
export const COMMUNITY = Object.freeze({
  id: "com-base-26",
  name: "Asociacion de Propietarios de Parcelas Peña Rubia",
  nif: "G80105232",
  phone: "607720096",
  otherPhone: "697264963",
  email: "asociacionpenarubia@gmail.com",
  address: "Callejon Salsipuedes, 16",
  city: "Estremera",
  province: "Madrid",
  postalCode: "28595",
  iban: "ES1721002004851300269952",
  president: "Francisco Cortés Lianes",
  administrator: "Miguel Angel Castillo Palacios",
  constitutionYear: "1987",
  reserveFund: "0",
  currency: "EUR",
  phoneVerified: true,
  emailVerified: true,
  notes: "Censo importado desde «BASE DE DATOS 26».",
  legalConfig: JSON.stringify({ regimen: "asociacion" }),
});

export const PROPERTY_TYPE = "parcela"; // Censo BASE 26: parcelas, según corrección del titular.
export const PROPERTY_USE = "residencial"; // Mapping Book1: «Residencial».

const HEADER_MIN = 2; // «Pcla.» y «DNI» tienen que aparecer en el encabezado.

/** Convierte cualquier valor de celda (ExcelJS o CSV) en texto recortado. */
export function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "SI" : "NO";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    if (Array.isArray(value.richText))
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    if ("result" in value) return cellText(value.result);
    if ("text" in value) return cellText(value.text);
    if ("error" in value) return "";
  }
  return String(value).trim();
}

/** Documento sin espacios, puntos ni guiones y en mayúsculas. */
export function normalizeDocument(raw) {
  return normalizeIdentityDocument(cellText(raw));
}

/** Tipo de documento por la forma del identificador (DNI, NIE o CIF). */
export function detectDocumentType(document) {
  const value = normalizeDocument(document);
  if (/^[XYZ]\d/.test(value)) return "NIE";
  if (/^[A-HJNPQRSUVW]\d{7}[A-Z0-9]$/.test(value)) return "CIF";
  return "DNI";
}

/** Identificador estable y seguro para la base local. */
export function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parte el titular en nombre y apellidos (D mezcla ambos). */
export function splitTitular(raw) {
  const parts = cellText(raw).split(/\s+/).filter(Boolean);
  if (!parts.length) return { name: "", surname: "" };
  if (parts.length === 1) return { name: parts[0], surname: "" };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

/** Superficie numérica: acepta 1.051,5 / 1051.5 / "1051". */
export function parseArea(raw) {
  const text = cellText(raw).replace(/\s|€/g, "");
  if (!text) return "";
  const thousands = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text);
  const normalized = thousands ? text.replace(/\./g, "").replace(",", ".") : text.replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Math.round(number * 100) / 100);
}

/** Normaliza una referencia catastral con formato y control correctos. */
export function normalizeCadastralRef(raw) {
  const value = normalizeCadastralReference(cellText(raw));
  return cadastralReferenceProblem(value) ? "" : value;
}

/** Parser CSV mínimo con soporte de comillas y saltos de línea dentro de celdas. */
export function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Se ignora: el LF cierra la fila.
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Busca la fila de encabezado («Pcla.» y «DNI/NIF»). */
export function findHeaderRow(table) {
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const cells = (table[index] || []).map((cell) => cellText(cell).toLowerCase());
    const hasPcla = cells.some((cell) => /^pcla\.?$/.test(cell));
    const hasDni = cells.some((cell) => /dni\s*\/?\s*nif|dni\b/.test(cell));
    if (hasPcla && hasDni) return index;
  }
  return -1;
}

/** Lee la hoja desde .xlsx/.xlsm (ExcelJS) o desde un .csv exportado. */
export async function readSheet({ file, sheet = SHEET_NAME }) {
  const source = path.resolve(process.cwd(), file);
  if (!fs.existsSync(source)) throw new Error(`No encuentro el archivo: ${source}`);
  const extension = path.extname(source).toLowerCase();
  if (extension === ".csv") {
    const table = parseDelimited(fs.readFileSync(source, "utf8"));
    return { table, source, sheet: "(csv)", extension };
  }
  if (extension !== ".xlsx" && extension !== ".xlsm") {
    throw new Error("Formato no soportado: usá .xlsm, .xlsx o .csv.");
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(source);
  const worksheet =
    workbook.getWorksheet(sheet) ||
    workbook.worksheets.find((item) => item.name.trim().toLowerCase() === sheet.toLowerCase());
  if (!worksheet) {
    throw new Error(
      `La hoja «${sheet}» no existe. Hojas disponibles: ${workbook.worksheets
        .map((item) => item.name)
        .join(", ")}.`,
    );
  }
  const table = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    for (let column = 1; column <= MAX_COLUMNS; column += 1) {
      cells.push(cellText(row.getCell(column).value));
    }
    table.push(cells);
  });
  return { table, source, sheet: worksheet.name, extension };
}

/** Datos de configuración y comunidad de las columnas Campo/Observaciones/Valor de Book1. */
export async function readMapping(file) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(file));
  const rows = (name) => {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Falta la hoja «${name}» en el mapping.`);
    return sheet
      .getSheetValues()
      .filter(Boolean)
      .map((row) => ({
        field: cellText(row[1]),
        notes: cellText(row[4]),
        value: cellText(row[5]),
      }));
  };
  const association = rows("Datos de la Asociacion");
  const communityRows = rows("Comunidad");
  const get = (list, prefix) => {
    const row = list.find((item) => item.field.startsWith(prefix));
    if (!row) throw new Error(`Falta el campo «${prefix}» en el mapping.`);
    return row;
  };
  const settings = {
    nombreAsociacion: get(association, "Nombre de la asociación").value,
    emailContacto: get(association, "Email de contacto").value,
    telefonoContacto: get(association, "Teléfono de contacto").value,
  };
  if (!settings.nombreAsociacion || !settings.emailContacto)
    throw new Error("El mapping debe indicar nombre y email de la asociación.");
  settings.marca = { nombre: settings.nombreAsociacion };
  const community = { ...COMMUNITY };
  for (const [key, prefix] of Object.entries({
    name: "Identificador Comunidad",
    nif: "NIF",
    president: "Presidente",
    administrator: "Administrador de Fincas",
    constitutionYear: "Año de Constitución",
    phone: "Teléfono Principal",
    otherPhone: "Teléfono Secundario",
    email: "Email",
    address: "Dirección",
    iban: "IBAN de la Comunidad",
    reserveFund: "Fondo de reserva",
  }))
    community[key] = get(communityRows, prefix).value;
  const postal = get(communityRows, "Código postal").value.match(/^(\d{5})\s*-\s*(.+)$/);
  if (!postal) throw new Error("El código postal del mapping debe incluir código y localidad.");
  community.postalCode = postal[1];
  community.city = postal[2];
  community.phoneVerified = /verificado/i.test(get(communityRows, "Teléfono Principal").notes);
  community.emailVerified = /verificado/i.test(get(communityRows, "Email").notes);
  return { community, settings };
}

/** Notas comunes de propietario e inmueble (Book1: Ref. de la comunidad de regantes). */
export function rowNotes(row, cuotaSuperficie) {
  const notes = [];
  if (row.refRegantes)
    notes.push(`Referencia dentro de la comunidad de Regantes: ${row.refRegantes}`);
  if (cuotaSuperficie) notes.push(`Cuota de superficie histórica (col. M): ${cuotaSuperficie} €`);
  return notes.join(" · ");
}

/**
 * Construye el plan de importación sin tocar ninguna base.
 * Devuelve comunidades, usuarios, propietarios, inmuebles y avisos.
 */
export function buildPlan(
  table,
  headerIndex = findHeaderRow(table),
  { community = COMMUNITY, settings, statutes } = {},
) {
  if (headerIndex < 0) {
    throw new Error(
      "No encontré el encabezado de la hoja (hacen falta las columnas «Pcla.» y «DNI/NIF»).",
    );
  }
  const warnings = [];
  const warn = (rowNumber, pcla, message) => warnings.push({ fila: rowNumber, pcla, message });
  const owners = new Map();
  const properties = [];
  const seenPcla = new Map();
  const exclusions = [];
  const invalidDocuments = new Set();
  const cadastralPlots = new Map();
  // Se evalúan todas las filas antes de importar: una repetición no permite
  // elegir arbitrariamente la primera parcela como titular de esa referencia.
  for (const cells of table.slice(headerIndex + 1)) {
    const plot = cellText(cells[COL.pcla]);
    const reference = normalizeCadastralRef(cells[COL.cadastralRef]);
    if (!plot || !reference) continue;
    if (!cadastralPlots.has(reference)) cadastralPlots.set(reference, new Set());
    cadastralPlots.get(reference).add(plot);
  }
  const exclude = (rowNumber, row, entity, type, message) => {
    exclusions.push({
      fila: rowNumber,
      parcela: row.pcla,
      titular: row.titular,
      celda: `${entity === "propietario_usuario" ? "G" : "F"}${rowNumber}`,
      entidad: entity,
      tipo: type,
      valorExcel: cellText(
        table[rowNumber - 1]?.[entity === "propietario_usuario" ? COL.dni : COL.cadastralRef],
      ),
      motivo: message,
    });
    warn(rowNumber, row.pcla, message);
  };
  let emptyRows = 0;
  let totalArea = 0;
  let sourceSequence = 0;

  for (let index = headerIndex + 1; index < table.length; index += 1) {
    const cells = table[index] || [];
    // Filas vacías o separadores de Markdown/CSV exportado («| --- |»).
    if (
      cells.every((cell) => !cellText(cell) || /^:?-{3,}:?$/.test(cellText(cell))) ||
      !cells.some((cell) => cellText(cell))
    ) {
      emptyRows += 1;
      continue;
    }
    const rowNumber = index + 1;
    const row = {
      refRegantes: cellText(cells[COL.refRegantes]),
      pcla: cellText(cells[COL.pcla]),
      titular: cellText(cells[COL.titular]),
      cadastralRef: cellText(cells[COL.cadastralRef]),
      document: normalizeDocument(cells[COL.dni]),
      username: cellText(cells[COL.dni])
        .toLowerCase()
        .replace(/[\s.\/-]/g, ""),
      areaM2: parseArea(cells[COL.areaM2]),
      cuotaSuperficie: cellText(cells[COL.cuotaSuperficie]),
      tipoVia: cellText(cells[COL.tipoVia]),
      direccion: cellText(cells[COL.direccion]),
      telefonoFijo: cellText(cells[COL.telefonoFijo]),
      telefonoMovil: cellText(cells[COL.telefonoMovil]),
      email: cellText(cells[COL.email]).toLowerCase(),
      codigoPostal: cellText(cells[COL.codigoPostal]),
      localidad: cellText(cells[COL.localidad]),
    };

    if (!row.pcla) {
      warn(rowNumber, "", "Fila sin «Pcla.»: no se importa.");
      continue;
    }
    if (seenPcla.has(row.pcla)) {
      warn(
        rowNumber,
        row.pcla,
        `Pcla. duplicada (ya importada en la fila ${seenPcla.get(row.pcla)}): se omite.`,
      );
      continue;
    }
    seenPcla.set(row.pcla, rowNumber);
    sourceSequence += 1;
    const referenceProblem = cadastralReferenceProblem(row.cadastralRef);
    const cadastralRef = normalizeCadastralRef(row.cadastralRef);
    const repeatedReference = cadastralRef && cadastralPlots.get(cadastralRef)?.size > 1;
    const importProperty = !referenceProblem && !repeatedReference;
    if (!importProperty) {
      const reason =
        referenceProblem === "missing"
          ? "referencia_ausente"
          : referenceProblem === "format"
            ? "referencia_formato"
            : referenceProblem === "checksum"
              ? "referencia_control"
              : "referencia_repetida";
      const explanation =
        referenceProblem === "missing"
          ? "Referencia catastral ausente"
          : referenceProblem === "format"
            ? "Referencia catastral con formato incorrecto"
            : referenceProblem === "checksum"
              ? "Referencia catastral con caracteres de control incorrectos"
              : `Referencia catastral repetida entre parcelas ${[...cadastralPlots.get(cadastralRef)].join(", ")}, pendiente de confirmar`;
      exclude(rowNumber, row, "inmueble", reason, `${explanation}: no se importa el inmueble.`);
    }
    const documentType = detectDocumentType(row.document);
    const validDocument = !!row.document && isValidIdentityDocument(row.document, documentType);
    if (!validDocument) {
      if (row.document) invalidDocuments.add(row.document);
      exclude(
        rowNumber,
        row,
        "propietario_usuario",
        row.document ? "documento_invalido" : "documento_ausente",
        row.document
          ? `Documento «${row.document}» con formato o control incorrecto: no se importan el propietario ni su usuario.`
          : "Documento ausente: no se importan el propietario ni su usuario.",
      );
    }
    if (!row.titular)
      warn(rowNumber, row.pcla, "Fila sin titular: el inmueble queda sin propietario.");

    const address = [row.tipoVia, row.direccion].filter(Boolean).join(" ").trim();
    if (!address)
      warn(rowNumber, row.pcla, "Fila sin dirección: se usa «Parcela N» como dirección.");
    if (!row.codigoPostal) warn(rowNumber, row.pcla, "Fila sin código postal.");
    if (!row.localidad) warn(rowNumber, row.pcla, "Fila sin localidad: se usa la de la comunidad.");
    if (!row.telefonoMovil && !row.telefonoFijo)
      warn(rowNumber, row.pcla, "Fila sin teléfono: el propietario queda sin teléfono.");

    let ownerId = "";
    const plot = `I${sourceSequence} ${address || `Parcela ${row.pcla}`}`;
    if (validDocument && row.titular) {
      const existing = owners.get(row.document);
      if (existing) {
        ownerId = existing.id;
        // Un mismo titular puede traer el contacto repartido en varias filas.
        existing.phone ||= row.telefonoMovil || row.telefonoFijo;
        existing.otherPhone ||= row.telefonoMovil ? row.telefonoFijo : "";
        existing.email ||= row.email;
        existing.address ||= address;
        existing.postalCode ||= row.codigoPostal;
        existing.cadastralRef ||= importProperty ? cadastralRef : "";
        existing.areaM2 ||= importProperty ? row.areaM2 : "";
        existing.plot ||= importProperty ? plot : "";
        existing.notes ||= rowNotes(row, row.cuotaSuperficie);
        if (existing.phone) existing.phoneVerified = 1;
        if (existing.email) existing.emailVerified = 1;
        if (row.titular && existing.titular && row.titular !== existing.titular) {
          warn(
            rowNumber,
            row.pcla,
            `El documento ${row.document} aparece con otro titular («${row.titular}» frente a «${existing.titular}»): se unifica la ficha.`,
          );
        }
        if (importProperty) existing.propertyIds.push(`prop-base26-${slug(row.pcla)}`);
      } else {
        const { name, surname } = splitTitular(row.titular);
        if (!name) warn(rowNumber, row.pcla, "Titular sin nombre utilizable.");
        if (!surname) warn(rowNumber, row.pcla, "Titular sin apellidos separables.");
        const phone = row.telefonoMovil || row.telefonoFijo;
        const notes = [];
        if (!row.telefonoMovil && row.telefonoFijo)
          notes.push("Teléfono principal tomado del fijo (col. Q).");
        ownerId = `own-base26-${slug(row.document)}`;
        owners.set(row.document, {
          id: ownerId,
          userId: `user-base26-${slug(row.document)}`,
          name,
          surname,
          documentType,
          document: row.document,
          username: row.username,
          email: row.email,
          phone,
          otherPhone: row.telefonoMovil ? row.telefonoFijo : "",
          phoneVerified: phone ? 1 : 0,
          emailVerified: row.email ? 1 : 0,
          address,
          postalCode: row.codigoPostal,
          city: row.localidad || community.city,
          province: community.province,
          communityId: community.id,
          communityName: community.name,
          plot: importProperty ? plot : "",
          cadastralRef: importProperty ? cadastralRef : "",
          areaM2: importProperty ? row.areaM2 : "",
          notes: rowNotes(row, row.cuotaSuperficie),
          titular: row.titular,
          propertyIds: importProperty ? [`prop-base26-${slug(row.pcla)}`] : [],
        });
      }
    }

    if (!importProperty) continue;
    if (row.areaM2) totalArea += Number(row.areaM2);

    properties.push({
      id: `prop-base26-${slug(row.pcla)}`,
      communityId: community.id,
      communityName: community.name,
      plot,
      pcla: row.pcla,
      propertyType: PROPERTY_TYPE,
      propertyUse: PROPERTY_USE,
      address: address || `Parcela ${row.pcla}`,
      cadastralRef,
      areaM2: row.areaM2,
      postalCode: row.codigoPostal,
      city: row.localidad || community.city,
      province: community.province,
      ownerIds: ownerId ? [ownerId] : [],
      ownerPercentages: ownerId ? { [ownerId]: 100 } : {},
      occupancy: ownerId ? "owner" : "",
      residentOwnerIds: ownerId ? [ownerId] : [],
      primaryResidentId: ownerId,
      notes: rowNotes(row, row.cuotaSuperficie),
    });
  }

  const ownerList = [...owners.values()];
  const users = ownerList.map((owner) => ({
    id: owner.userId,
    name: owner.name,
    surname: owner.surname,
    usuario: owner.username,
    email: owner.email,
    role: "user",
    password: `${owner.username}12345678`,
  }));

  return {
    community,
    settings,
    statutes,
    owners: ownerList,
    users,
    properties,
    warnings,
    exclusions,
    stats: {
      filas: table.length - headerIndex - 1,
      filasVacias: emptyRows,
      inmuebles: properties.length,
      propietarios: ownerList.length,
      usuarios: users.length,
      documentosInvalidos: invalidDocuments.size,
      filasSinDocumento: exclusions.filter((item) => item.tipo === "documento_ausente").length,
      inmueblesExcluidos: exclusions.filter((item) => item.entidad === "inmueble").length,
      inmueblesConPropietario: properties.filter((property) => property.ownerIds.length).length,
      inmueblesSinPropietario: properties.filter((property) => !property.ownerIds.length).length,
      superficieTotal: Math.round(totalArea * 100) / 100,
      avisos: warnings.length,
    },
  };
}

/** Informe legible + CSV de previsualización. Solo escribe dentro de outDir. */
export function writeReport(outDir, plan, meta) {
  fs.mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const reportPath = path.join(outDir, "import-report.json");
  const previewPath = path.join(outDir, "import-preview.csv");
  const report = {
    generatedAt,
    origen: meta.source,
    hoja: meta.sheet,
    mapping: "Book1",
    comunidad: {
      id: plan.community.id,
      nombre: plan.community.name,
      nif: plan.community.nif,
      regimen: "asociacion",
    },
    resumen: plan.stats,
    avisos: plan.warnings,
    exclusiones: plan.exclusions,
    propietarios: plan.owners.map((owner) => ({
      id: owner.id,
      usuario: owner.username,
      nombre: `${owner.name} ${owner.surname}`.trim(),
      documento: owner.document,
      email: owner.email,
      telefono: owner.phone,
      inmuebles: owner.propertyIds.length,
    })),
    inmuebles: plan.properties.map((property) => ({
      id: property.id,
      parcela: property.pcla,
      identificador: property.plot,
      referenciaCatastral: property.cadastralRef,
      direccion: property.address,
      superficie: property.areaM2,
      propietario: property.ownerIds[0] || "",
    })),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const csvRows = [
    [
      "parcela",
      "titular",
      "documento",
      "direccion",
      "cp",
      "localidad",
      "superficie",
      "telefono",
      "email",
      "id_inmueble",
    ],
    ...plan.properties.map((property) => {
      const owner = plan.owners.find((item) => item.id === property.ownerIds[0]);
      return [
        property.pcla,
        owner ? `${owner.name} ${owner.surname}`.trim() : "",
        owner?.document || "",
        property.address,
        property.postalCode,
        property.city,
        property.areaM2,
        owner?.phone || "",
        owner?.email || "",
        property.id,
      ];
    }),
  ];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  fs.writeFileSync(
    previewPath,
    `\uFEFF${csvRows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`,
    "utf8",
  );
  return { reportPath, previewPath };
}

/** La carpeta de salida tiene que quedar dentro del proyecto y fuera de data/uploads. */
export function assertSafeOutDir(outDir) {
  const resolved = path.resolve(outDir);
  const relative = path.relative(ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("La carpeta de salida debe quedar dentro del proyecto.");
  }
  const forbidden = [path.join(ROOT, "data"), path.join(ROOT, "uploads")];
  if (forbidden.some((dir) => resolved === dir || resolved.startsWith(`${dir}${path.sep}`))) {
    throw new Error(
      "La carpeta de salida no puede ser data/ ni uploads/ (esas carpetas son la app real).",
    );
  }
  return resolved;
}

/** Crea una base SQLite nueva en outDir/data con el plan completo. */
export async function writeDatabase(plan, outDir, { force = false } = {}) {
  // Antes de tocar una base existente, se valida también el plan recibido por
  // API de módulo: no basta con confiar en que el llamante usó buildPlan().
  const ownerIds = new Set(plan.owners.map((owner) => owner.id));
  const userIds = new Set(plan.users.map((user) => user.id));
  const propertyIds = new Set(plan.properties.map((property) => property.id));
  const cadastralRefs = new Set();
  if (
    ownerIds.size !== plan.owners.length ||
    userIds.size !== plan.users.length ||
    propertyIds.size !== plan.properties.length ||
    plan.users.length !== plan.owners.length
  )
    throw new Error("El plan de importación contiene identificadores o cuentas inconsistentes.");
  for (const owner of plan.owners) {
    if (
      !isValidIdentityDocument(owner.document, owner.documentType) ||
      !userIds.has(owner.userId) ||
      owner.propertyIds.some((id) => !propertyIds.has(id))
    )
      throw new Error("El plan contiene un propietario inválido o vínculos inexistentes.");
  }
  for (const property of plan.properties) {
    const reference = normalizeCadastralReference(property.cadastralRef);
    if (
      cadastralReferenceProblem(reference) ||
      cadastralRefs.has(reference) ||
      property.ownerIds.some((id) => !ownerIds.has(id))
    )
      throw new Error(
        "El plan contiene una referencia catastral inválida, repetida o un propietario inexistente.",
      );
    cadastralRefs.add(reference);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Este importador es solo local: no se ejecuta con NODE_ENV=production.");
  }
  outDir = path.resolve(outDir);
  if (
    outDir === ROOT ||
    ["data", "uploads"].some((name) => {
      const dir = path.join(ROOT, name);
      return outDir === dir || outDir.startsWith(`${dir}${path.sep}`);
    })
  )
    throw new Error("No se puede reemplazar la base real de la aplicación.");
  const dataDir = path.join(outDir, "data");
  const uploadsDir = path.join(outDir, "uploads");
  const dbFile = path.join(dataDir, "penarrubia.db");
  if (fs.existsSync(dbFile) && !force) {
    throw new Error(`Ya existe una base importada en ${dbFile}. Usá --force para reemplazarla.`);
  }
  let backupDir;
  if (force && fs.existsSync(dbFile)) {
    backupDir = `${outDir}-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.cpSync(outDir, backupDir, { recursive: true });
    const { DatabaseSync, backup } = await import("node:sqlite");
    const original = new DatabaseSync(dbFile, { readOnly: true });
    try {
      await backup(original, path.join(backupDir, "data", "penarrubia.db"));
    } finally {
      original.close();
    }
    for (const suffix of ["-wal", "-shm"])
      fs.rmSync(path.join(backupDir, "data", `penarrubia.db${suffix}`), { force: true });
  }
  if (force) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  // Los módulos de la app leen estas variables al cargarse: se definen antes del import.
  process.env.APP_DATA_DIR = dataDir;
  process.env.APP_UPLOADS_DIR = uploadsDir;
  process.env.APP_DEMO_PROFILES = "false";
  process.env.APP_DEMO_DATA = "false";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Este importador es solo local: no se ejecuta con NODE_ENV=production.");
  }

  const { db, getSettings } = await import("../src/db.js");
  const { passwordRecord } = await import("../src/auth.js");
  const { rebuildOwnersPropertyIds } = await import("../src/domain.js");
  const now = new Date().toISOString();

  const insertCommunity = db.prepare(
    `INSERT INTO communities (id, name, nif, phone, otherPhone, address, city, province, postalCode,
       email, iban, president, administrator, constitutionYear, reserveFund, currency, notes,
       documents, legalConfig, adminUserId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'user-super-admin')`,
  );
  const insertUser = db.prepare(
    `INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo, passwordHash)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const insertOwner = db.prepare(
    `INSERT INTO owners (id, name, surname, documentType, dni, isMember, communityId, communityName,
       plot, propertyId, propertyIds, phone, otherPhone, email, phoneVerified, phoneVerifiedAt,
       emailVerified, emailVerifiedAt, address, province, city, postalCode, iban, currency,
       votingRights, notificationPreference, notes, propertyType, cadastralRef, areaM2, documents,
       userId)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, '', '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'EUR',
       'active', 'email', ?, ?, ?, ?, '{}', ?)`,
  );
  const insertProperty = db.prepare(
    `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot,
       address, cadastralRef, areaM2, participationCoef, propertyUse, notes, postalCode, city,
       province, currency, ownerPercentages, occupancy, residentOwnerIds, primaryResidentId)
     VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
  );

  db.exec("BEGIN");
  try {
    const community = plan.community;
    insertCommunity.run(
      community.id,
      community.name,
      community.nif,
      community.phone,
      community.otherPhone,
      community.address,
      community.city,
      community.province,
      community.postalCode,
      community.email,
      community.iban,
      community.president,
      community.administrator,
      community.constitutionYear,
      community.reserveFund,
      community.currency,
      community.notes,
      community.legalConfig,
    );
    db.prepare(
      `UPDATE communities SET phoneVerified=?, phoneVerifiedAt=?, emailVerified=?, emailVerifiedAt=? WHERE id=?`,
    ).run(
      community.phoneVerified ? 1 : 0,
      community.phoneVerified ? now : "",
      community.emailVerified ? 1 : 0,
      community.emailVerified ? now : "",
      community.id,
    );
    if (plan.settings) {
      const defaults = getSettings();
      const settings = {
        ...defaults,
        ...plan.settings,
        marca: { ...defaults.marca, ...plan.settings.marca },
      };
      db.prepare("INSERT OR REPLACE INTO settings(id, data) VALUES('general', ?)").run(
        JSON.stringify(settings),
      );
    }
    if (plan.statutes) {
      const storedName = "base26-estatutos.pdf";
      fs.copyFileSync(plan.statutes.file, path.join(uploadsDir, storedName));
      db.prepare(
        `INSERT INTO documents(id, entityType, entityId, folderId, category, fileName, fileType, fileSize, uploadedAt, uploadedBy, uploadedByName, storedName)
        VALUES(?, 'community', ?, '', 'statutes', ?, 'application/pdf', ?, ?, 'user-super-admin', 'super_admin', ?)`,
      ).run(
        "doc-base26-estatutos",
        community.id,
        path.basename(plan.statutes.file),
        fs.statSync(plan.statutes.file).size,
        now,
        storedName,
      );
    }
    for (const user of plan.users) {
      insertUser.run(
        user.id,
        user.name,
        user.surname,
        user.usuario,
        user.email,
        user.role,
        passwordRecord(user.password),
      );
    }
    for (const owner of plan.owners) {
      insertOwner.run(
        owner.id,
        owner.name,
        owner.surname,
        owner.documentType,
        owner.document,
        owner.communityId,
        owner.communityName,
        owner.plot,
        owner.phone,
        owner.otherPhone,
        owner.email,
        owner.phoneVerified,
        owner.phoneVerified ? now : "",
        owner.emailVerified,
        owner.emailVerified ? now : "",
        owner.address,
        owner.province,
        owner.city,
        owner.postalCode,
        owner.notes,
        owner.propertyType || PROPERTY_TYPE,
        owner.cadastralRef,
        owner.areaM2,
        owner.userId,
      );
    }
    for (const property of plan.properties) {
      insertProperty.run(
        property.id,
        property.communityId,
        property.communityName,
        JSON.stringify(property.ownerIds),
        property.propertyType,
        property.plot,
        property.address,
        property.cadastralRef,
        property.areaM2,
        property.propertyUse,
        property.notes,
        property.postalCode,
        property.city,
        property.province,
        JSON.stringify(property.ownerPercentages),
        property.occupancy,
        JSON.stringify(property.residentOwnerIds),
        property.primaryResidentId,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  // Reconstruye propertyIds/propertyId de cada propietario y completa porcentajes.
  rebuildOwnersPropertyIds({ repairPercentages: true });

  const totals = {
    comunidades: db.prepare("SELECT COUNT(*) AS total FROM communities").get().total,
    usuarios: db.prepare("SELECT COUNT(*) AS total FROM users").get().total,
    propietarios: db.prepare("SELECT COUNT(*) AS total FROM owners").get().total,
    inmuebles: db.prepare("SELECT COUNT(*) AS total FROM properties").get().total,
    inmueblesSinTitular: db
      .prepare("SELECT COUNT(*) AS total FROM properties WHERE ownerIds = '[]'")
      .get().total,
  };
  db.close();
  return { dbFile, dataDir, uploadsDir, totals, backupDir };
}

function parseArgs(argv) {
  const options = { file: "", sheet: SHEET_NAME, out: DEFAULT_OUT_DIR, write: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file" || arg === "-f") options.file = argv[++index] || "";
    else if (arg === "--sheet") options.sheet = argv[++index] || SHEET_NAME;
    else if (arg === "--out") options.out = argv[++index] || DEFAULT_OUT_DIR;
    else if (arg === "--mapping") options.mapping = argv[++index];
    else if (arg === "--statutes") options.statutes = argv[++index];
    else if (arg === "--statutes-date") options.statutesDate = argv[++index];
    else if (arg === "--statutes-reference") options.statutesReference = argv[++index];
    else if (arg === "--write") options.write = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return options;
}

function printSummary(plan, meta, outDir) {
  const { stats } = plan;
  console.log("");
  console.log("Importador «BASE DE DATOS 26» — mapping Book1");
  console.log(`  Origen: ${meta.source}`);
  console.log(`  Hoja:   ${meta.sheet}`);
  console.log(`  Salida: ${outDir}`);
  console.log("");
  console.log(`  Filas leídas:              ${stats.filas}`);
  console.log(`  Inmuebles a importar:      ${stats.inmuebles}`);
  console.log(`  Con propietario:           ${stats.inmueblesConPropietario}`);
  console.log(`  Sin propietario:           ${stats.inmueblesSinPropietario}`);
  console.log(`  Propietarios (por DNI):    ${stats.propietarios}`);
  console.log(`  Usuarios de acceso:        ${stats.usuarios}`);
  console.log(`  Superficie total (m²):     ${stats.superficieTotal}`);
  console.log(`  Avisos:                    ${stats.avisos}`);
  if (plan.warnings.length) {
    console.log("");
    console.log("  Primeros avisos:");
    for (const warning of plan.warnings.slice(0, 12)) {
      console.log(
        `   · fila ${warning.fila}${warning.pcla ? ` (Pcla. ${warning.pcla})` : ""}: ${warning.message}`,
      );
    }
    if (plan.warnings.length > 12) console.log(`   · … y ${plan.warnings.length - 12} avisos más.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.file) {
    console.log(`Importador local de «BASE DE DATOS 26» (sin tocar producción).

Uso:
  node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm"            # dry-run
  node scripts/import-base-datos-26.mjs --file "BASE DE DATOS 26.xlsm" --write    # crea la base

Opciones:
  --file, -f  Archivo .xlsm, .xlsx o .csv con la hoja «${SHEET_NAME}».
  --sheet     Nombre de la hoja (por defecto «${SHEET_NAME}»).
  --out       Carpeta local de salida (por defecto .local-test/base-26).
  --mapping   Book1.xlsx: datos de asociación, marca y comunidad.
  --statutes  PDF de los estatutos para adjuntar en la raíz de Estatutos.
  --statutes-date       Fecha de aprobación leída del PDF (AAAA-MM-DD).
  --statutes-reference  Nombre o referencia de la versión del PDF.
  --write     Crea <out>/data/penarrubia.db con los datos importados.
  --force     Reemplaza una base importada existente en <out>/data.`);
    return;
  }
  const outDir = assertSafeOutDir(options.out);
  const meta = await readSheet({ file: options.file, sheet: options.sheet });
  const mapping = options.mapping ? await readMapping(options.mapping) : {};
  if (options.statutes) {
    const file = path.resolve(options.statutes);
    if (!fs.existsSync(file) || fs.readFileSync(file).subarray(0, 5).toString() !== "%PDF-")
      throw new Error("El archivo de estatutos debe ser un PDF existente.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.statutesDate || "") || !options.statutesReference)
      throw new Error(
        "Indicá --statutes-date (AAAA-MM-DD) y --statutes-reference según el documento.",
      );
    mapping.statutes = { file };
    mapping.community = {
      ...(mapping.community || COMMUNITY),
      legalConfig: JSON.stringify({
        regimen: "asociacion",
        estatutos: { referencia: options.statutesReference, fechaAprobacion: options.statutesDate },
      }),
    };
  }
  const plan = buildPlan(meta.table, undefined, mapping);
  const result = options.write ? await writeDatabase(plan, outDir, { force: options.force }) : null;
  const { reportPath, previewPath } = writeReport(outDir, plan, meta);
  printSummary(plan, meta, outDir);
  console.log("");
  console.log(`  Informe:  ${reportPath}`);
  console.log(`  Preview:  ${previewPath}`);
  if (!options.write) {
    console.log("");
    console.log("  Dry-run: no se creó ninguna base. Agregá --write para crear la copia local.");
    return;
  }
  if (result.backupDir) console.log(`  Respaldo anterior: ${result.backupDir}`);
  console.log("");
  console.log(`  Base creada: ${result.dbFile}`);
  console.log(
    `  Verificación: ${result.totals.comunidades} comunidad, ${result.totals.usuarios} usuarios, ` +
      `${result.totals.propietarios} propietarios, ${result.totals.inmuebles} inmuebles ` +
      `(${result.totals.inmueblesSinTitular} sin titular).`,
  );
  console.log("");
  console.log("  Para probarla:");
  console.log(
    `    APP_DATA_DIR="${result.dataDir}" APP_UPLOADS_DIR="${result.uploadsDir}" ` +
      `APP_DEMO_PROFILES=false APP_DEMO_DATA=false PORT=3100 HOST=127.0.0.1 node server.js`,
  );
  console.log("    Login: super_admin / super_admin");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  });
}
