import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * Mitigación de inyección de fórmulas CSV / Excel:
 * Si una celda comienza por =, +, -, o @, se antepone una comilla simple.
 */
function sanitizeFormula(val) {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${val}`;
  }
  return val;
}

/** Formatea valores para salida plana */
function formatValue(val, col) {
  if (val === null || val === undefined) return "";
  if (col.type === "currency") {
    return `${Number(val || 0).toFixed(2)} €`;
  }
  if (col.type === "number") {
    return String(val);
  }
  return String(val);
}

/**
 * 1. Generador CSV
 * Codificación UTF-8 con BOM (\uFEFF)
 * Separador punto y coma (;)
 * Bloque de metadatos inicial
 */
export async function generateCsv({ dataset, rows, columns, metadata }) {
  const quote = (value) =>
    `"${String(sanitizeFormula(String(value ?? ""))).replace(/"/g, '\"\"')}"`;
  const lines = [
    ["# Título", dataset.title],
    ["# Generado por", metadata.userName],
    ["# Rol", metadata.userRole],
    ["# Fecha", metadata.generatedAt],
    ["# Registros", rows.length],
    ["# Filtros", metadata.filtersText],
    ["# Orden", metadata.sortText],
    ["# Fuente", dataset.source],
    ["# Fórmulas", dataset.formulas || ""],
    ["# Unidades", dataset.units || ""],
  ].map((pair) => pair.map(quote).join(";"));
  lines.push("");

  // Cabecera de columnas
  const header = columns
    .map((col) => `"${sanitizeFormula(col.label).replace(/"/g, '""')}"`)
    .join(";");
  lines.push(header);

  // Filas de datos
  for (const row of rows) {
    const rowValues = columns.map((col) => {
      const raw = row[col.key];
      const val = formatValue(raw, col);
      const safe = sanitizeFormula(val);
      return `"${String(safe).replace(/"/g, '""')}"`;
    });
    lines.push(rowValues.join(";"));
  }

  const csvContent = "\uFEFF" + lines.join("\r\n");
  return Buffer.from(csvContent, "utf8");
}

/**
 * 2. Generador XLSX (ExcelJS)
 * - Hoja "Datos": tabla estilizada, cabecera azul marino (#1E3A8A), bordes, tipos numéricos nativos
 * - Hoja "Metadatos": informe de filtros, auditoría y trazabilidad
 */
export async function generateXlsx({ dataset, rows, columns, metadata }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AppComunidadVecinos";
  workbook.created = new Date();

  // Hoja 1: Datos
  const dataSheet = workbook.addWorksheet("Datos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  dataSheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.key,
    width: Math.max(14, Math.min(38, col.label.length + 5)),
  }));

  // Estilo de la cabecera
  const headerRow = dataSheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Azul marino institucional
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "medium", color: { argb: "FF1E3A8A" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });

  // Filas
  rows.forEach((row, rowIndex) => {
    const rowData = {};
    columns.forEach((col) => {
      let val = row[col.key];
      // ExcelJS strings are literal cells, never formula objects.
      if (
        col.type === "date" &&
        /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(val)) &&
        Number.isFinite(Date.parse(val))
      )
        val = new Date(val);
      rowData[col.key] = val;
    });

    const addedRow = dataSheet.addRow(rowData);
    addedRow.height = 20;

    const isEven = rowIndex % 2 === 1;
    addedRow.eachCell((cell, colNumber) => {
      const col = columns[colNumber - 1];
      if (isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" }, // Zebra striping
        };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };

      if (col.type === "currency") {
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (col.type === "number") {
        cell.numFmt = "#,##0.###";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (col.type === "date" && cell.value instanceof Date) {
        cell.numFmt = "dd/mm/yyyy hh:mm";
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  });

  // Hoja 2: Metadatos
  const metaSheet = workbook.addWorksheet("Metadatos");
  metaSheet.columns = [
    { header: "Parámetro", key: "param", width: 28 },
    { header: "Valor", key: "value", width: 60 },
  ];

  const metaHeader = metaSheet.getRow(1);
  metaHeader.height = 24;
  metaHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF374151" },
    };
  });

  const metaItems = [
    { param: "Informe / Listado", value: dataset.title },
    { param: "Pantalla origen", value: dataset.pantalla || "Aplicación" },
    { param: "Generado por", value: metadata.userName || "Usuario" },
    { param: "Rol", value: metadata.userRole || "" },
    { param: "Fecha de generación", value: metadata.generatedAt || new Date().toISOString() },
    { param: "Total de registros", value: rows.length },
    { param: "Filtros aplicados", value: metadata.filtersText || "Ninguno (todos los registros)" },
    { param: "Criterio de orden", value: metadata.sortText || "Por defecto" },
    { param: "Fuente de datos", value: dataset.source || "Base de datos de la plataforma" },
  ];

  if (dataset.formulas) {
    metaItems.push({ param: "Fórmulas aplicadas", value: dataset.formulas });
  }
  if (dataset.units) {
    metaItems.push({ param: "Unidades", value: dataset.units });
  }

  metaItems.forEach((item) => {
    metaSheet.addRow(item);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 3. Generador PDF (PDFKit)
 * - Apaisado (landscape) si hay más de 5 columnas para legibilidad
 * - Encabezado corporativo, bloque de metadatos, tabla paginada con cabecera en cada página
 * - Numeración de páginas en pie de página
 */
export async function generatePdf({
  dataset,
  rows,
  columns,
  metadata,
  maxBytes = 10 * 1024 * 1024,
}) {
  return new Promise((resolve, reject) => {
    const wide = columns.length > 6;
    const doc = new PDFDocument({
      size: "A4",
      layout: wide ? "portrait" : "landscape",
      margin: 36,
      bufferPages: true,
    });
    const chunks = [];
    let size = 0;
    doc.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        doc.destroy(new Error("Archivo demasiado grande"));
        return;
      }
      chunks.push(chunk);
    });
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      const width = doc.page.width - 72;
      const header = () => {
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#17413f")
          .text(dataset.title, 36, 36, { width });
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#444444")
          .text(`${metadata.generatedAt} | ${metadata.userName} (${metadata.userRole})`, { width });
        doc.moveDown();
      };
      doc.on("pageAdded", header);
      const newPage = () => doc.addPage();
      header();
      doc.font("Helvetica").fontSize(8);
      for (const text of [
        `Filtros: ${metadata.filtersText}`,
        `Orden: ${metadata.sortText}`,
        `Fuente: ${dataset.source}`,
        `Registros: ${rows.length}`,
        dataset.formulas ? `Fórmulas: ${dataset.formulas}` : "",
        dataset.units ? `Unidades: ${dataset.units}` : "",
      ])
        if (text) doc.text(text, { width });
      doc.moveDown();
      const cellWidth = width / columns.length;
      const tableHeader = () => {
        const y = doc.y;
        const height =
          Math.max(
            ...columns.map((c) =>
              doc
                .font("Helvetica-Bold")
                .fontSize(8)
                .heightOfString(c.label, { width: cellWidth - 10 }),
            ),
          ) + 12;
        doc.rect(36, y, width, height).fill("#17413f");
        columns.forEach((c, i) =>
          doc
            .fillColor("white")
            .text(c.label, 41 + i * cellWidth, y + 5, { width: cellWidth - 10 }),
        );
        doc.y = y + height;
      };
      if (!wide) tableHeader();
      for (const [index, row] of rows.entries()) {
        const values = columns.map((c) => formatValue(row[c.key], c));
        doc.font("Helvetica").fontSize(8);
        const height =
          Math.max(...values.map((v) => doc.heightOfString(v, { width: cellWidth - 10 }))) + 12;
        // Long or wide records use labelled fields so no cell is clipped.
        if (wide || height > doc.page.height - 150) {
          if (doc.y > doc.page.height - 120) newPage();
          doc.x = 36;
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#17413f")
            .text(`Registro ${index + 1}`, { width });
          columns.forEach((c, i) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333").text(c.label, { width });
            doc
              .font("Helvetica")
              .fontSize(9)
              .text(values[i] || "—", { width });
            doc.moveDown(0.35);
          });
          doc.moveDown();
        } else {
          if (doc.y + height > doc.page.height - 55) {
            newPage();
            tableHeader();
          }
          const y = doc.y;
          doc.rect(36, y, width, height).fill(index % 2 ? "#f0f6f5" : "#ffffff");
          doc.font("Helvetica").fontSize(8).fillColor("#222222");
          values.forEach((v, i) =>
            doc.text(v, 41 + i * cellWidth, y + 5, { width: cellWidth - 10 }),
          );
          doc.y = y + height;
          doc.x = 36;
        }
      }
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#555555")
          .text(`Página ${i + 1} de ${range.count}`, 36, doc.page.height - 48, {
            width,
            align: "center",
            lineBreak: false,
          });
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
