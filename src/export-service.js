import { Worker } from "node:worker_threads";
import { EXPORT_INVENTORY } from "./export-inventory.js";
import { allowed, policyData } from "./security.js";
import { recordAudit } from "./audit.js";
const MIME_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
export class ExportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const invalid = () => {
  throw new ExportError("Filtros, selección, columnas u orden de exportación no válidos.");
};
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const readable = (user, dataset, policy) =>
  (dataset.readAnyPermissions || [dataset.readPermission]).some((permission) =>
    allowed(user, permission, "", policy),
  );
export function getExportableInventory(user) {
  const policy = policyData();
  return Object.values(EXPORT_INVENTORY)
    .filter(
      (d) =>
        allowed(user, "export:read", "", policy) &&
        readable(user, d, policy) &&
        allowed(user, d.exportPermission, "", policy),
    )
    .map(({ fetchData, ...entry }) => entry);
}
function select({
  user,
  tableId,
  filters = {},
  sort = null,
  columns = null,
  itemIds = null,
  groupBy = null,
  forExport = true,
}) {
  if (typeof tableId !== "string" || !Object.hasOwn(EXPORT_INVENTORY, tableId))
    throw new ExportError("El listado solicitado no existe.", 404);
  const dataset = EXPORT_INVENTORY[tableId],
    policy = policyData();
  if (
    !readable(user, dataset, policy) ||
    (forExport &&
      (!allowed(user, "export:read", "", policy) ||
        !allowed(user, dataset.exportPermission, "", policy)))
  )
    throw new ExportError("No tienes permiso para esta exportación o consulta.", 403);
  if (!object(filters)) invalid();
  for (const [key, value] of Object.entries(filters))
    if (!dataset.filters.includes(key) || typeof value !== "string" || value.length > 300)
      invalid();
  if (filters.communityId && !allowed(user, "community:read", filters.communityId, policy))
    throw new ExportError("Comunidad fuera de tu ámbito.", 403);
  const columnMap = new Map(dataset.columns.map((c) => [c.key, c]));
  if (groupBy !== null && (typeof groupBy !== "string" || !columnMap.has(groupBy))) invalid();
  if (
    columns !== null &&
    (!Array.isArray(columns) ||
      !columns.length ||
      new Set(columns).size !== columns.length ||
      columns.some((k) => !columnMap.has(k)))
  )
    invalid();
  if (
    sort !== null &&
    (!object(sort) ||
      !columnMap.has(sort.key) ||
      !["asc", "desc"].includes(sort.dir) ||
      Object.keys(sort).some((k) => !["key", "dir"].includes(k)))
  )
    invalid();
  if (
    itemIds !== null &&
    (!Array.isArray(itemIds) ||
      itemIds.length > 5000 ||
      new Set(itemIds).size !== itemIds.length ||
      itemIds.some((id) => typeof id !== "string" || id.length > 300))
  )
    invalid();
  let rows = dataset.fetchData(user, filters);
  if (!Array.isArray(rows)) throw new ExportError("No se pudo consultar la fuente de datos.", 502);
  rows = rows.filter((row) => {
    if (forExport && !allowed(user, dataset.exportPermission, row[dataset.scopeKey] || "", policy))
      return false;
    if (
      filters.communityId &&
      row.communityId !== filters.communityId &&
      !row.communityIds?.includes(filters.communityId)
    )
      return false;
    for (const key of [
      "entityType",
      "entityId",
      "category",
      "period",
      "action",
      "ownerId",
      "propertyId",
      "assessmentId",
      "serviceBillId",
      "kind",
    ])
      if (
        filters[key] &&
        row[key] !== filters[key] &&
        !(key === "ownerId" && row.ownerIds?.includes(filters[key]))
      )
        return false;
    if (Object.hasOwn(filters, "folderId") && !filters.query && row.folderId !== filters.folderId)
      return false;
    if (filters.creditOnly === "true" && !(row.credit > 0)) return false;
    if (
      filters.status &&
      filters.status !== row.rawStatus &&
      filters.status !== row.status &&
      !(filters.status === "returned" && row.returned)
    )
      return false;
    return true;
  });
  if (itemIds !== null) {
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    if (itemIds.some((id) => !byId.has(id)))
      throw new ExportError(
        "La selección cambió o contiene registros fuera de tu ámbito. Actualiza la vista.",
        409,
      );
    rows = itemIds.map((id) => byId.get(id));
  } else {
    if (filters.query) {
      const q = filters.query.toLocaleLowerCase("es");
      rows = rows.filter((r) =>
        dataset.columns.some((c) =>
          String(r[c.key] ?? "")
            .toLocaleLowerCase("es")
            .includes(q),
        ),
      );
    }
    if (sort) {
      const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
      rows.sort(
        (a, b) =>
          (sort.dir === "desc" ? -1 : 1) *
          collator.compare(String(a[sort.key] ?? ""), String(b[sort.key] ?? "")),
      );
    }
    if (groupBy) {
      const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
      rows.sort((a, b) =>
        collator.compare(
          String(a.__groupValues?.[groupBy] ?? a[groupBy] ?? "—"),
          String(b.__groupValues?.[groupBy] ?? b[groupBy] ?? "—"),
        ),
      );
    }
  }
  return {
    dataset,
    rows,
    columns: columns === null ? dataset.columns : columns.map((key) => columnMap.get(key)),
    groupBy,
  };
}
export function previewDataset(input) {
  const { dataset, rows, columns } = select({ ...input, forExport: false });
  if (rows.length > dataset.maxRows)
    throw new ExportError("Demasiados registros. Acota los filtros.", 413);
  return {
    tableId: dataset.id,
    title: dataset.title,
    total: rows.length,
    rows: rows.map((r) => ({
      id: String(r.id),
      ...Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? ""])),
    })),
    columns,
    formulas: dataset.formulas || "",
    units: dataset.units || "",
    source: dataset.source,
  };
}
let activeGenerations = 0;
function generate(data, limits) {
  return new Promise((resolve, reject) => {
    if (activeGenerations >= 3) {
      reject(
        new ExportError(
          "Hay otras exportaciones en curso. Inténtalo de nuevo en unos segundos.",
          429,
        ),
      );
      return;
    }
    activeGenerations++;
    const worker = new Worker(new URL("./export-worker.js", import.meta.url), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      activeGenerations--;
      clearTimeout(timer);
      void worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish(
          new ExportError("La exportación superó el tiempo permitido. Acota los filtros.", 413),
        ),
      limits.ms,
    );
    worker.on("message", (message) =>
      message.error
        ? finish(new ExportError(message.error, message.status || 500))
        : finish(null, Buffer.from(message.buffer)),
    );
    worker.on("error", () =>
      finish(new ExportError("No se pudo generar el archivo. Inténtalo de nuevo.", 500)),
    );
    worker.on("exit", () => {
      if (!settled) finish(new ExportError("La generación del archivo se interrumpió.", 500));
    });
  });
}
export async function exportDataset(input) {
  const { user, tableId, format = "csv", filters = {}, sort = null, req = null } = input;
  const started = performance.now();
  let rowCount = 0;
  try {
    const { dataset, rows, columns, groupBy } = select(input);
    if (typeof format !== "string" || !dataset.formats.includes(format))
      throw new ExportError("Formato de exportación no válido.");
    const limits = dataset.limits[format];
    rowCount = rows.length;
    if (!rowCount)
      throw new ExportError("No hay datos para exportar con los filtros aplicados.", 422);
    if (rowCount > limits.rows)
      throw new ExportError(
        `El formato ${format.toUpperCase()} permite hasta ${limits.rows} filas. Acota los filtros.`,
        413,
      );
    const metadata = {
      userName: `${user.nombre || ""} ${user.apellido || ""}`.trim() || user.usuario,
      userRole: user.rol,
      generatedAt: new Date().toISOString(),
      filtersText: JSON.stringify(filters),
      sortText: sort
        ? `${sort.key} (${sort.dir})`
        : input.itemIds
          ? "Orden de la vista"
          : "Por defecto",
      groupText: groupBy ? dataset.columns.find((c) => c.key === groupBy).label : "",
    };
    const { fetchData, ...definition } = dataset;
    const buffer = await generate(
      {
        format,
        dataset: definition,
        rows: rows.map((r) => ({
          ...Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? ""])),
          ...(groupBy
            ? { __exportGroup: String(r.__groupValues?.[groupBy] ?? r[groupBy] ?? "") || "—" }
            : {}),
        })),
        columns,
        metadata,
        maxBytes: limits.bytes,
      },
      { ...limits, ms: Math.max(1, limits.ms - (performance.now() - started)) },
    );
    if (buffer.length > limits.bytes)
      throw new ExportError("El archivo supera el tamaño permitido. Acota los filtros.", 413);
    recordAudit({
      actor: user,
      action: "export",
      resourceType: tableId,
      outcome: "success",
      req,
      details: {
        role: user.rol,
        tableId,
        format,
        rowCount,
        filterKeys: Object.keys(filters),
        communityId: filters.communityId || "",
        period: filters.period || "",
        sort,
        columns: columns.map((c) => c.key),
        groupBy,
      },
    });
    return {
      buffer,
      filename: `${dataset.id}_${Date.now()}.${format}`,
      contentType: MIME_TYPES[format],
      rowCount,
    };
  } catch (error) {
    recordAudit({
      actor: user,
      action: "export",
      resourceType: typeof tableId === "string" ? tableId.slice(0, 80) : "",
      outcome: error.status === 403 ? "denied" : "failure",
      req,
      details: {
        role: user?.rol || "",
        format: typeof format === "string" ? format.slice(0, 10) : "",
        rowCount,
        status: error.status || 500,
      },
    });
    throw error instanceof ExportError
      ? error
      : new ExportError(
          "No se pudo consultar la fuente de datos o registrar la exportación. Inténtalo de nuevo.",
          502,
        );
  }
}
