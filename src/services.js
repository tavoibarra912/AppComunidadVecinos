import crypto from "node:crypto";
import { db, listProperties } from "./db.js";
import { recordAudit } from "./audit.js";
import {
  problem,
  transaction,
  integer,
  money,
  validDate,
  today,
  feeCommunity,
  selectedChargeProperties,
  distribute,
  canManage,
  notify,
  receiptById,
  receiptConcept,
  receiptView,
  reminderSettings,
  formatMoney,
} from "./fees.js";

export const serviceLabels = {
  luz: "Luz",
  agua: "Agua",
  gas: "Gas",
  gasoleo: "Gasóleo",
};
export const serviceMethods = {
  coefficient: "Por coeficiente de participación",
  reading: "Por lecturas de contador",
  mixed: "Mixto: parte fija y parte variable",
  manual: "Importes manuales por inmueble",
};
export const serviceBillings = {
  receipts: "Emitir un recibo por inmueble",
  informative: "Solo reparto informativo, sin deuda",
};

db.exec(`
  CREATE TABLE IF NOT EXISTS service_bills (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, service TEXT NOT NULL,
    supplier TEXT NOT NULL DEFAULT '', invoiceNumber TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL, issueDate TEXT NOT NULL, dueDate TEXT NOT NULL,
    totalAmount INTEGER NOT NULL CHECK(totalAmount>0), data TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    issuedAt TEXT NOT NULL DEFAULT '',
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS service_bills_community ON service_bills(communityId,issueDate);
  CREATE TABLE IF NOT EXISTS service_attachments (
    id TEXT PRIMARY KEY, serviceBillId TEXT NOT NULL,
    fileName TEXT NOT NULL, diskName TEXT NOT NULL, mime TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS service_attachments_bill ON service_attachments(serviceBillId);
`);

if (
  !db
    .prepare("PRAGMA table_info(fee_receipts)")
    .all()
    .some((column) => column.name === "serviceBillId")
)
  db.exec(
    "ALTER TABLE fee_receipts ADD COLUMN serviceBillId TEXT NOT NULL DEFAULT ''",
  );

if (
  !db
    .prepare("SELECT 1 FROM schema_migrations WHERE id='service-bills-v1'")
    .get()
) {
  transaction(() => {
    // El índice anterior impedía que un inmueble tuviera una cuota ordinaria y
    // un servicio con el mismo periodo. Se recrea excluyendo ambos tipos.
    db.exec("DROP INDEX IF EXISTS fee_receipts_period");
    db.exec(
      "CREATE UNIQUE INDEX fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='' AND assessmentId='' AND serviceBillId=''",
    );
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_assessment ON fee_receipts(communityId,propertyId,assessmentId,installment) WHERE cancelledAt='' AND assessmentId<>''",
    );
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_service ON fee_receipts(communityId,propertyId,serviceBillId) WHERE cancelledAt='' AND serviceBillId<>''",
    );
    db.prepare(
      "INSERT INTO schema_migrations(id) VALUES('service-bills-v1')",
    ).run();
  });
} else {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='' AND assessmentId='' AND serviceBillId=''",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_service ON fee_receipts(communityId,propertyId,serviceBillId) WHERE cancelledAt='' AND serviceBillId<>''",
  );
}

const now = () => new Date().toISOString();

function audit(actor, action, id, details) {
  recordAudit({
    actor,
    action: `fee.service.${action}`,
    resourceType: "fee",
    resourceId: id,
    details,
  });
}

function text(value, label, max, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw problem(`Indicá ${label}.`);
  if (result.length > max)
    throw problem(`${label} no puede superar ${max} caracteres.`);
  return result;
}

function readingValue(value, label) {
  const source = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(source))
    throw problem(
      `${label}: indicá una lectura válida con hasta tres decimales (m³).`,
    );
  const result = Math.round(Number(source) * 1000);
  if (!Number.isSafeInteger(result) || result < 0)
    throw problem(`${label}: la lectura no es válida.`);
  return result;
}

function serviceReminders(input) {
  const defaults = reminderSettings({ reminders: {} }),
    reminders = {};
  for (const [key, max] of [
    ["beforeDays", 60],
    ["afterDays", 365],
    ["repeatDays", 365],
  ])
    reminders[key] = integer(
      input.reminders?.[key] ?? defaults[key],
      0,
      max,
      key,
    );
  for (const key of ["internal", "email"]) {
    reminders[key] = input.reminders?.[key] ?? defaults[key];
    if (typeof reminders[key] !== "boolean")
      throw problem("Canal de avisos no válido.");
  }
  return reminders;
}

export function serviceBillById(id) {
  const row = db.prepare("SELECT * FROM service_bills WHERE id=?").get(id);
  if (!row) throw problem("Servicio no encontrado.", 404);
  return row;
}

function payload(row) {
  return JSON.parse(row.data);
}

function parsePeriod(value) {
  if (typeof value !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))
    throw problem("Indicá un periodo de factura válido (AAAA-MM).");
  return value;
}

function coefficientData(entries, all) {
  let sum = 0;
  for (const entry of entries) {
    const source = String(entry.property.participationCoef)
      .replace(",", ".")
      .trim();
    if (
      !/^\d{1,3}(\.\d{1,4})?$/.test(source) ||
      Number(source) <= 0 ||
      Number(source) > 100
    )
      throw problem(
        `${entry.property.plot}: coeficiente no válido (hasta cuatro decimales).`,
      );
    entry.weight = Math.round(Number(source) * 10000);
    sum += entry.weight;
  }
  if (!sum) throw problem("Los coeficientes seleccionados suman cero.");
  if (entries.length === all.length && sum !== 1000000)
    throw problem(
      `Los coeficientes suman ${(sum / 10000).toFixed(4)} %. Deben sumar 100 %. Revisá los inmuebles.`,
    );
  return Object.fromEntries(
    entries.map((entry) => [
      entry.property.id,
      Math.round((entry.weight / sum) * 1000000) / 10000,
    ]),
  );
}

function readingData(entries, input) {
  const readings = {};
  for (const entry of entries) {
    const item = input.readings?.[entry.property.id];
    const previous = readingValue(
      item?.previous,
      `${entry.property.plot}: lectura anterior`,
    );
    const current = readingValue(
      item?.current,
      `${entry.property.plot}: lectura actual`,
    );
    if (current < previous)
      throw problem(
        `${entry.property.plot}: la lectura actual no puede ser menor que la anterior.`,
      );
    readings[entry.property.id] = {
      previous,
      current,
      consumption: current - previous,
    };
  }
  return readings;
}

function proportional(total, entries, label) {
  if (total <= 0) throw problem(`${label} debe ser mayor que cero.`);
  if (!entries.length) throw problem(`No hay inmuebles con consumo para ${label}.`);
  return distribute(total, entries);
}

export function saveService(communityId, input, actor, id = "") {
  feeCommunity(communityId);
  const service = input.service;
  if (!Object.hasOwn(serviceLabels, service))
    throw problem("Tipo de suministro no válido.");
  const supplier = text(input.supplier, "el proveedor", 120);
  const invoiceNumber = text(
    input.invoiceNumber,
    "el número de factura",
    80,
  );
  const period = parsePeriod(input.period);
  if (!validDate(input.issueDate))
    throw problem("La fecha de factura no es válida.");
  if (!validDate(input.dueDate))
    throw problem("El vencimiento no es válido.");
  if (input.dueDate < input.issueDate)
    throw problem("El vencimiento no puede ser anterior a la fecha de factura.");
  const totalAmount = money(input.totalAmount, "El importe total");
  if (!Object.hasOwn(serviceBillings, input.billing))
    throw problem("Modo de facturación no válido.");
  if (!Object.hasOwn(serviceMethods, input.method))
    throw problem("Criterio de reparto no válido.");
  const billing = input.billing;
  const method = input.method;
  const legalBasis = text(input.legalBasis, "la base legal", 300);
  const notes = text(input.notes, "las notas", 2000);
  const centralHeating = input.centralHeating === true;
  let variableShare = 0;
  if (method === "mixed") {
    variableShare = integer(
      Number(input.variableShare),
      1,
      99,
      "Porcentaje de la parte variable",
    );
  }
  const { all, selected, entries } = selectedChargeProperties(
    communityId,
    input,
  );
  const coefficients = {},
    effectiveCoefficients = {};
  if (method === "coefficient" || method === "mixed") {
    const effective = coefficientData(entries, all);
    for (const entry of entries) {
      coefficients[entry.property.id] =
        entry.property.participationCoef;
      effectiveCoefficients[entry.property.id] =
        effective[entry.property.id];
    }
  } else {
    for (const entry of entries)
      coefficients[entry.property.id] = entry.property.participationCoef;
  }

  const readings =
      method === "reading" || method === "mixed"
        ? readingData(entries, input)
        : {};
  const allocations = {},
    fixedParts = new Map(),
    variableParts = new Map(),
    omitted = [],
    warnings = [];

  if (method === "coefficient") {
    for (const entry of distribute(totalAmount, entries)) {
      if (entry.amount <= 0)
        throw problem(
          `${entry.property.plot}: el reparto le asigna cero euros. Ajustá la selección o el importe.`,
        );
      allocations[entry.property.id] = entry.amount;
    }
  } else if (method === "manual") {
    let sum = 0;
    for (const entry of entries) {
      const amount = money(
        input.manual?.[entry.property.id],
        `Importe de ${entry.property.plot}`,
      );
      allocations[entry.property.id] = amount;
      sum += amount;
    }
    if (sum !== totalAmount)
      throw problem(
        "La suma de importes por inmueble debe coincidir con el total de la factura.",
      );
  } else if (method === "reading") {
    const withConsumption = entries.filter(
      (entry) => readings[entry.property.id].consumption > 0,
    );
    for (const entry of entries)
      if (!readings[entry.property.id].consumption) {
        omitted.push({
          propertyId: entry.property.id,
          plot: entry.property.plot,
          reason: "Sin consumo en el periodo",
        });
        warnings.push(
          `${entry.property.plot}: sin consumo; no se genera recibo de este servicio.`,
        );
      }
    for (const entry of proportional(
      totalAmount,
      withConsumption.map((entry) => ({
        ...entry,
        weight: readings[entry.property.id].consumption,
      })),
      "el reparto por lecturas",
    )) {
      if (entry.amount <= 0)
        throw problem(
          `${entry.property.plot}: el reparto le asigna cero euros. Revisá las lecturas o el importe.`,
        );
      allocations[entry.property.id] = entry.amount;
      variableParts.set(entry.property.id, entry.amount);
    }
  } else {
    const variableAmount = Math.round((totalAmount * variableShare) / 100);
    const fixedAmount = totalAmount - variableAmount;
    if (fixedAmount <= 0 || variableAmount <= 0)
      throw problem(
        "El importe es demasiado bajo para separar la parte fija y la variable. Ajustá el total o el porcentaje.",
      );
    const withConsumption = entries.filter(
      (entry) => readings[entry.property.id].consumption > 0,
    );
    if (!withConsumption.length)
      throw problem(
        "Todas las lecturas tienen consumo cero: no se puede repartir la parte variable.",
      );
    for (const entry of distribute(fixedAmount, entries))
      fixedParts.set(entry.property.id, entry.amount);
    for (const entry of proportional(
      variableAmount,
      withConsumption.map((entry) => ({
        ...entry,
        weight: readings[entry.property.id].consumption,
      })),
      "la parte variable",
    ))
      variableParts.set(entry.property.id, entry.amount);
    for (const entry of entries) {
      const fixed = fixedParts.get(entry.property.id) || 0,
        variable = variableParts.get(entry.property.id) || 0,
        amount = fixed + variable;
      if (amount <= 0) {
        omitted.push({
          propertyId: entry.property.id,
          plot: entry.property.plot,
          reason: "Sin importe asignado",
        });
        continue;
      }
      allocations[entry.property.id] = amount;
      if (!readings[entry.property.id].consumption)
        warnings.push(
          `${entry.property.plot}: sin consumo; solo paga la parte fija del servicio.`,
        );
    }
  }

  if (method !== "coefficient" && !legalBasis)
    warnings.push(
      "Este reparto no es por coeficiente. Registrá la base legal o el acuerdo de Junta que lo autoriza.",
    );
  if (
    method === "mixed" &&
    centralHeating &&
    (variableShare < 60 || variableShare > 75)
  )
    warnings.push(
      `La parte variable es el ${variableShare} %. Para calefacción o refrigeración centralizada, el RD 736/2020 recomienda entre el 60 % y el 75 %.`,
    );

  const breakdown = entries
    .filter((entry) => allocations[entry.property.id] > 0)
    .map((entry) => {
      const reading = readings[entry.property.id];
      const amount = allocations[entry.property.id];
      const fixed =
        method === "mixed" ? fixedParts.get(entry.property.id) || 0 : method === "reading" ? 0 : amount;
      const variable =
        method === "reading" || method === "mixed"
          ? variableParts.get(entry.property.id) || 0
          : 0;
      return {
        propertyId: entry.property.id,
        plot: entry.property.plot || entry.property.address,
        coefficient:
          effectiveCoefficients[entry.property.id] ??
          entry.property.participationCoef,
        effectiveCoefficient:
          effectiveCoefficients[entry.property.id] ?? null,
        previous: reading?.previous ?? null,
        current: reading?.current ?? null,
        consumption: reading?.consumption ?? null,
        fixed,
        variable,
        amount,
      };
    });

  const data = {
    method,
    billing,
    variableShare,
    centralHeating,
    legalBasis,
    notes,
    propertyIds: selected.map((property) => property.id),
    coefficients,
    effectiveCoefficients,
    readings,
    allocations,
    fixedAmount:
      method === "mixed"
        ? [...fixedParts.values()].reduce((sum, value) => sum + value, 0)
        : null,
    variableAmount:
      method === "mixed"
        ? [...variableParts.values()].reduce((sum, value) => sum + value, 0)
        : null,
    breakdown,
    omitted,
    warnings,
    subset: selected.length < all.length,
    reminders: serviceReminders(input),
  };

  return transaction(() => {
    if (id) {
      const row = serviceBillById(id);
      if (row.communityId !== communityId)
        throw problem("El servicio pertenece a otra comunidad.", 403);
      if (row.cancelledAt) throw problem("El servicio está anulado.", 409);
      if (
        row.issuedAt ||
        db
          .prepare(
            "SELECT 1 FROM fee_receipts WHERE serviceBillId=? LIMIT 1",
          )
          .get(id)
      )
        throw problem(
          "El servicio ya fue emitido o repartido. Para cambiarlo, anulalo y creá uno nuevo.",
          409,
        );
      db.prepare(
        `UPDATE service_bills SET service=?,supplier=?,invoiceNumber=?,period=?,issueDate=?,dueDate=?,totalAmount=?,data=? WHERE id=?`,
      ).run(
        service,
        supplier,
        invoiceNumber,
        period,
        input.issueDate,
        input.dueDate,
        totalAmount,
        JSON.stringify(data),
        id,
      );
      audit(actor, "update", id, {
        communityId,
        totalAmount,
        method,
        billing,
      });
      return serviceView(serviceBillById(id));
    }
    const serviceId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO service_bills(id,communityId,service,supplier,invoiceNumber,period,issueDate,dueDate,totalAmount,data,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      serviceId,
      communityId,
      service,
      supplier,
      invoiceNumber,
      period,
      input.issueDate,
      input.dueDate,
      totalAmount,
      JSON.stringify(data),
      now(),
      actor.id,
    );
    audit(actor, "create", serviceId, {
      communityId,
      totalAmount,
      method,
      billing,
    });
    return serviceView(serviceBillById(serviceId));
  });
}

export function services(communityId) {
  return db
    .prepare(
      "SELECT * FROM service_bills WHERE communityId=? ORDER BY issueDate DESC,createdAt DESC",
    )
    .all(communityId)
    .map((row) => serviceView(row));
}

export function serviceConcept(row) {
  return `Servicio de ${serviceLabels[row.service] || row.service} · ${row.period}`;
}

function serviceAttachments(serviceBillId) {
  return db
    .prepare(
      "SELECT id,serviceBillId,fileName,mime,createdAt,actorId FROM service_attachments WHERE serviceBillId=? ORDER BY createdAt DESC",
    )
    .all(serviceBillId);
}

export function serviceView(row, date = today()) {
  const data = payload(row),
    receipts = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE serviceBillId=? ORDER BY propertyId",
      )
      .all(row.id),
    active = receipts
      .filter((receipt) => !receipt.cancelledAt)
      .map((receipt) => receiptView(receipt, date)),
    paid = active.reduce((sum, view) => sum + view.paid, 0),
    outstanding = active.reduce((sum, view) => sum + view.outstanding, 0),
    issuedAmount = active.reduce((sum, view) => sum + view.amount, 0),
    issued = !!row.issuedAt || receipts.length > 0;
  let status = "draft";
  if (row.cancelledAt) status = "cancelled";
  else if (!issued) status = "draft";
  else if (data.billing === "informative") status = "informative";
  else if (outstanding === 0 && issuedAmount > 0) status = "paid";
  else if (paid > 0) status = "partial";
  else if (row.dueDate < date) status = "overdue";
  else status = "issued";
  return {
    id: row.id,
    communityId: row.communityId,
    service: row.service,
    serviceLabel: serviceLabels[row.service] || row.service,
    supplier: row.supplier,
    invoiceNumber: row.invoiceNumber,
    period: row.period,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    actorId: row.actorId,
    issuedAt: row.issuedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    concept: serviceConcept(row),
    canEdit:
      !row.cancelledAt && !row.issuedAt && receipts.length === 0,
    method: data.method,
    billing: data.billing,
    variableShare: data.variableShare,
    centralHeating: data.centralHeating,
    legalBasis: data.legalBasis,
    notes: data.notes,
    propertyIds: data.propertyIds,
    allocations: data.allocations,
    coefficients: data.coefficients,
    effectiveCoefficients: data.effectiveCoefficients,
    readings: data.readings,
    breakdown: data.breakdown,
    omitted: data.omitted,
    warnings: data.warnings,
    subset: !!data.subset,
    reminders: data.reminders,
    receiptCount: receipts.length,
    attachmentCount: serviceAttachments(row.id).length,
    totals: {
      total: row.totalAmount,
      issued: issuedAmount,
      paid,
      outstanding,
      cancelled: receipts
        .filter((receipt) => receipt.cancelledAt)
        .reduce((sum, receipt) => sum + receipt.amount, 0),
    },
    status,
  };
}

export function serviceDetail(row, date = today()) {
  return {
    ...serviceView(row, date),
    receipts: db
      .prepare(
        "SELECT * FROM fee_receipts WHERE serviceBillId=? ORDER BY propertyId",
      )
      .all(row.id)
      .map((receipt) => receiptView(receipt, date)),
    attachments: serviceAttachments(row.id),
  };
}

export function previewService(id) {
  const row = serviceBillById(id);
  feeCommunity(row.communityId);
  if (row.cancelledAt) throw problem("El servicio está anulado.", 409);
  if (row.issuedAt)
    throw problem("El servicio ya fue emitido o repartido.", 409);
  const data = payload(row);
  const { entries } = selectedChargeProperties(row.communityId, {
    propertyIds: data.propertyIds,
  });
  const community = db
    .prepare("SELECT name,iban FROM communities WHERE id=?")
    .get(row.communityId);
  const omitted = new Set((data.omitted || []).map((item) => item.propertyId));
  const breakdown = new Map(
    (data.breakdown || []).map((item) => [item.propertyId, item]),
  );
  const warnings = [...(data.warnings || [])];
  if (row.dueDate < today())
    warnings.push(
      `El vencimiento ${row.dueDate} ya pasó; los recibos se emitirán vencidos.`,
    );
  if (data.method !== "coefficient" && !data.legalBasis)
    warnings.push(
      "Este reparto no es por coeficiente. Registrá la base legal o el acuerdo de Junta que lo autoriza.",
    );
  const rows = [];
  for (const entry of entries) {
    const amount = data.allocations?.[entry.property.id];
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      if (omitted.has(entry.property.id)) continue;
      throw problem(
        `${entry.property.plot}: falta su importe en el reparto del servicio.`,
      );
    }
    const item = breakdown.get(entry.property.id) || {},
      reading = data.readings?.[entry.property.id] || null;
    rows.push({
      propertyId: entry.property.id,
      amount,
      fixed: item.fixed ?? amount,
      variable: item.variable ?? 0,
      reading,
      snapshot: {
        property: entry.property.plot || entry.property.address,
        community: community.name,
        communityIban: community.iban || "",
        owners: entry.owners,
        coefficient:
          data.effectiveCoefficients?.[entry.property.id] ??
          data.coefficients?.[entry.property.id] ??
          entry.property.participationCoef,
        service: row.service,
        serviceLabel: serviceLabels[row.service] || row.service,
        servicePeriod: row.period,
        serviceSupplier: row.supplier,
        serviceInvoice: row.invoiceNumber,
        serviceBillId: row.id,
        serviceMethod: data.method,
        serviceBilling: data.billing,
        serviceReadingPrevious: reading?.previous ?? null,
        serviceReadingCurrent: reading?.current ?? null,
        serviceReadingConsumption: reading?.consumption ?? null,
        agreement: data.legalBasis || "Servicio de suministros",
      },
    });
  }
  if (!rows.length)
    throw problem("El reparto no incluye ningún inmueble con importe.");
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  if (total !== row.totalAmount)
    throw problem(
      "No se pudo repartir el importe de la factura. Revisá los importes.",
    );
  const result = {
    serviceId: row.id,
    serviceLabel: serviceLabels[row.service] || row.service,
    period: row.period,
    dueDate: row.dueDate,
    total,
    method: data.method,
    billing: data.billing,
    variableShare: data.variableShare,
    rows,
    warnings: [...new Set(warnings)],
  };
  return {
    ...result,
    token: crypto
      .createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  };
}

export function issueService(id, input, actor) {
  return transaction(() => {
    const row = serviceBillById(id);
    if (!canManage(actor, row.communityId))
      throw problem(
        "No tenés permiso para emitir servicios de esta comunidad.",
        403,
      );
    if (row.cancelledAt) throw problem("El servicio está anulado.", 409);
    if (row.issuedAt)
      throw problem("El servicio ya fue emitido o repartido.", 409);
    const batch = previewService(id);
    if (input.token !== batch.token)
      throw problem(
        "Los datos cambiaron. Volvé a revisar la vista previa antes de emitir.",
        409,
      );
    const ids = [];
    if (batch.billing === "receipts")
      for (const item of batch.rows) {
        const receiptId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId,serviceBillId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          receiptId,
          row.communityId,
          item.propertyId,
          "",
          row.period,
          row.dueDate,
          row.dueDate,
          item.amount,
          JSON.stringify(item.snapshot),
          now(),
          actor.id,
          row.id,
        );
        ids.push(receiptId);
        notify(
          receiptById(receiptId),
          "issued",
          row.id,
          `Nuevo recibo de servicio: ${batch.serviceLabel}`,
          `${receiptConcept(receiptById(receiptId))} de ${item.snapshot.property}: ${formatMoney(item.amount)}. Vencimiento: ${batch.dueDate}.${
            item.snapshot.communityIban
              ? ` IBAN para transferencia: ${item.snapshot.communityIban}.`
              : ""
          }`,
        );
      }
    db.prepare("UPDATE service_bills SET issuedAt=? WHERE id=?").run(
      now(),
      row.id,
    );
    audit(actor, "issue", row.id, {
      communityId: row.communityId,
      billing: batch.billing,
      total: batch.total,
      count: ids.length,
    });
    return {
      ids,
      total: batch.total,
      billing: batch.billing,
      serviceId: row.id,
    };
  });
}

export function cancelService(id, input, actor) {
  const note =
    typeof input.reason === "string" ? input.reason.trim() : "";
  if (!note || note.length > 500)
    throw problem("Indicá el motivo (máximo 500 caracteres).");
  return transaction(() => {
    const row = serviceBillById(id);
    if (!canManage(actor, row.communityId))
      throw problem(
        "No tenés permiso para anular servicios de esta comunidad.",
        403,
      );
    if (row.cancelledAt) throw problem("El servicio ya está anulado.", 409);
    const receipts = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE serviceBillId=? AND cancelledAt=''",
      )
      .all(id);
    for (const receipt of receipts)
      if (receiptView(receipt).paid > 0)
        throw problem(
          "Hay cobros aplicados a este servicio. Revertí primero los cobros y volvé a intentar.",
          409,
        );
    const cancelledAt = now();
    for (const receipt of receipts) {
      db.prepare(
        "UPDATE fee_receipts SET cancelledAt=?,cancellationReason=? WHERE id=?",
      ).run(cancelledAt, note, receipt.id);
      notify(
        receiptById(receipt.id),
        "cancelled",
        `${row.id}:${receipt.propertyId}`,
        "Servicio anulado",
        `Se anuló ${receiptConcept(receiptById(receipt.id))} de ${JSON.parse(receipt.snapshot).property}. Motivo: ${note}`,
      );
    }
    db.prepare(
      "UPDATE service_bills SET cancelledAt=?,cancellationReason=? WHERE id=?",
    ).run(cancelledAt, note, row.id);
    audit(actor, "cancel", row.id, {
      communityId: row.communityId,
      count: receipts.length,
      reason: note,
    });
    return serviceDetail(serviceBillById(row.id));
  });
}

/**
 * Última lectura conocida por servicio e inmueble. Se usa para proponer la
 * lectura anterior al cargar una nueva factura y evitar volver a escribirla.
 */
export function lastServiceReadings(communityId) {
  const result = Object.fromEntries(
    Object.keys(serviceLabels).map((service) => [service, {}]),
  );
  const rows = db
    .prepare(
      "SELECT * FROM service_bills WHERE communityId=? AND cancelledAt='' AND issuedAt<>'' ORDER BY issueDate DESC,createdAt DESC",
    )
    .all(communityId);
  for (const row of rows) {
    const data = payload(row);
    if (!["reading", "mixed"].includes(data.method)) continue;
    for (const [propertyId, reading] of Object.entries(
      data.readings || {},
    )) {
      if (result[row.service][propertyId]) continue;
      result[row.service][propertyId] = {
        reading: reading.current,
        previous: reading.previous,
        period: row.period,
        issueDate: row.issueDate,
        serviceBillId: row.id,
      };
    }
  }
  return result;
}

export function serviceAttachmentById(id) {
  const row = db.prepare("SELECT * FROM service_attachments WHERE id=?").get(id);
  if (!row) throw problem("Adjunto no encontrado.", 404);
  return row;
}
