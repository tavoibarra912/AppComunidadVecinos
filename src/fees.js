import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { db, getSettings, listProperties, listOwners } from "./db.js";
import { allowed, policyData } from "./security.js";
import { recordAudit } from "./audit.js";
import { sanitizeRichText } from "./rich-text.js";
import { queueFeeProofCleanup, processFeeProofCleanup } from "./fee-proof-cleanup.js";
import { explicitLegalRegime, legalConfigOf } from "./legal-config.js";
import { validateReceiptDeletion } from "./receipt-deletion.js";

for (const table of ["owner_notifications", "admin_emails"])
  if (
    !db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === "feeReceiptId")
  )
    db.exec(`ALTER TABLE ${table} ADD COLUMN feeReceiptId TEXT NOT NULL DEFAULT ''`);
for (const [name, ddl] of [
  ["assessmentId", "TEXT NOT NULL DEFAULT ''"],
  ["installment", "INTEGER NOT NULL DEFAULT 0"],
  ["rectifiesReceiptId", "TEXT NOT NULL DEFAULT ''"],
  ["rectificationReason", "TEXT NOT NULL DEFAULT ''"],
]) {
  if (
    db
      .prepare("PRAGMA table_info(fee_receipts)")
      .all()
      .some((c) => c.name === name)
  )
    continue;
  db.exec(`ALTER TABLE fee_receipts ADD COLUMN ${name} ${ddl}`);
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_rectification ON fee_receipts(rectifiesReceiptId) WHERE rectifiesReceiptId<>''",
);
if (
  !db
    .prepare("PRAGMA table_info(fee_assessments)")
    .all()
    .some((column) => column.name === "issuedAt")
)
  db.exec("ALTER TABLE fee_assessments ADD COLUMN issuedAt TEXT NOT NULL DEFAULT ''");
if (
  !db.prepare("SELECT 1 FROM schema_migrations WHERE id='assessment-issuance-history-v1'").get()
) {
  transaction(() => {
    // La auditoría permite recuperar la emisión incluso si ya se purgaron sus recibos.
    for (const row of db.prepare("SELECT * FROM fee_assessments").all()) {
      const receipts = db
        .prepare("SELECT installment,createdAt FROM fee_receipts WHERE assessmentId=?")
        .all(row.id);
      const events = db
        .prepare(
          "SELECT details,createdAt FROM access_audit WHERE resourceId=? AND action='fee.assessment.issue'",
        )
        .all(row.id);
      const issued = [
        ...receipts,
        ...events.map((event) => ({
          installment: JSON.parse(event.details || "{}").installment,
          createdAt: event.createdAt,
        })),
      ].filter((item) => Number.isInteger(item.installment) && item.installment > 0);
      for (const item of issued)
        markAssessmentIssued(row.id, item.installment, item.createdAt || row.createdAt);
    }
    db.prepare("INSERT INTO schema_migrations(id) VALUES('assessment-issuance-history-v1')").run();
  });
}
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE id='extraordinary-fees-v1'").get()) {
  transaction(() => {
    // El índice anterior impedía que un inmueble tuviera una cuota ordinaria
    // y una derrama con el mismo mes de vencimiento.
    db.exec("DROP INDEX IF EXISTS fee_receipts_period");
    db.exec(
      "CREATE UNIQUE INDEX fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='' AND assessmentId=''",
    );
    db.exec(
      "CREATE UNIQUE INDEX fee_receipts_assessment ON fee_receipts(communityId,propertyId,assessmentId,installment) WHERE cancelledAt='' AND assessmentId<>''",
    );
    db.prepare("INSERT INTO schema_migrations(id) VALUES('extraordinary-fees-v1')").run();
  });
} else {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='' AND assessmentId=''",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_assessment ON fee_receipts(communityId,propertyId,assessmentId,installment) WHERE cancelledAt='' AND assessmentId<>''",
  );
}
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE id='ordinary-fees-v1'").get()) {
  transaction(() => {
    for (const row of db.prepare("SELECT * FROM roles").all()) {
      const additions = ["administrator", "community_admin", "super_admin"].includes(row.nombre)
        ? ["fee:read", "fee:manage"]
        : row.nombre === "user"
          ? ["fee:read"]
          : [];
      const permissions = [...new Set([...JSON.parse(row.permisos), ...additions])];
      db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(JSON.stringify(permissions), row.id);
    }
    db.prepare("INSERT INTO schema_migrations(id) VALUES('ordinary-fees-v1')").run();
  });
}

export function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
const now = () => new Date().toISOString();
export function today(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function money(value, label = "El importe", allowZero = false) {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim().replace(",", ".")
        : "";
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text))
    throw problem(`${label} debe tener como máximo dos decimales y ser positivo.`);
  const [whole, decimals = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1))
    throw problem(`${label} debe ser positivo.`);
  return cents;
}
export function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw problem(`${label}: valor no válido (${min}–${max}).`);
  return value;
}
export function feeDefaults() {
  const s = getSettings();
  return {
    beforeDays: s.feeBeforeDays ?? 3,
    afterDays: s.feeAfterDays ?? 7,
    repeatDays: s.feeRepeatDays ?? 0,
    internal: s.feeInternal !== false,
    email: s.feeEmail === true,
    emailSubject: s.feeEmailSubject || "{{titulo}} · {{comunidad}}",
    emailBody:
      s.feeEmailBody || "{{mensaje}}\nConsulta la pestaña Financiero de la ficha del propietario.",
  };
}
/**
 * Valores generales de avisos por tipo de recibo. Cuotas, derramas y servicios
 * comparten la plantilla de email, pero cada uno puede definir sus propios
 * plazos y canales en Configuración → Notificaciones.
 */
export function noticeDefaults(kind = "fee") {
  const s = getSettings(),
    fee = feeDefaults(),
    prefix = kind === "assessment" ? "assessment" : kind === "service" ? "service" : "";
  if (!prefix) return fee;
  const days = (key, fallback) =>
    Number.isInteger(s[`${prefix}${key}`]) ? s[`${prefix}${key}`] : fallback;
  const channel = (key, fallback) =>
    typeof s[`${prefix}${key}`] === "boolean" ? s[`${prefix}${key}`] : fallback;
  return {
    ...fee,
    beforeDays: days("BeforeDays", fee.beforeDays),
    afterDays: days("AfterDays", fee.afterDays),
    repeatDays: days("RepeatDays", fee.repeatDays),
    internal: channel("Internal", fee.internal),
    email: channel("Email", fee.email),
  };
}
export function reminderSettings(plan, kind = "fee") {
  const defaults = noticeDefaults(kind),
    saved = plan?.reminders || {};
  const bounded = (value, fallback, max) =>
    Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
  return {
    beforeDays: bounded(saved.beforeDays, defaults.beforeDays, 60),
    afterDays: bounded(saved.afterDays, defaults.afterDays, 365),
    repeatDays: bounded(saved.repeatDays, defaults.repeatDays, 365),
    internal: typeof saved.internal === "boolean" ? saved.internal : defaults.internal,
    email: typeof saved.email === "boolean" ? saved.email : defaults.email,
  };
}
export function validateFeeDefaults(data) {
  for (const prefix of ["fee", "assessment", "service"])
    for (const [key, max] of [
      ["BeforeDays", 60],
      ["AfterDays", 365],
      ["RepeatDays", 365],
    ])
      if (data[`${prefix}${key}`] !== undefined)
        integer(data[`${prefix}${key}`], 0, max, `${prefix}${key}`);
  for (const prefix of ["fee", "assessment", "service"])
    for (const key of ["Internal", "Email"])
      if (data[`${prefix}${key}`] !== undefined && typeof data[`${prefix}${key}`] !== "boolean")
        throw problem(`Los canales de avisos (${prefix}) deben ser booleanos.`);
  for (const [key, max] of [
    ["feeEmailSubject", 200],
    ["feeEmailBody", 3000],
  ])
    if (
      data[key] !== undefined &&
      (typeof data[key] !== "string" || !data[key].trim() || data[key].length > max)
    )
      throw problem(`La plantilla ${key} está vacía o supera ${max} caracteres.`);
}
export function canManage(user, communityId, policy = policyData()) {
  return allowed(user, "fee:manage", communityId, policy);
}
function ownerIds(user, policy) {
  if (!allowed(user, "fee:read", "", policy)) return [];
  return policy.owners.filter((o) => o.userId === user.id).map((o) => o.id);
}
export function canReadReceipt(user, receipt, policy = policyData()) {
  if (canManage(user, receipt.communityId, policy)) return true;
  if (allowed(user, "fee:read", receipt.communityId, policy) && user.rol !== "user") {
    // Only staff permissions grant a community-wide financial view.
    const role = policy.roles.find((r) => r.nombre === user.rol || r.id === user.rol);
    if (role && role.nombre !== "user") return true;
  }
  const ids = ownerIds(user, policy);
  return JSON.parse(receipt.snapshot).owners.some((o) => ids.includes(o.id));
}
export function receiptById(id) {
  const row = db.prepare("SELECT * FROM fee_receipts WHERE id=?").get(id);
  if (!row) throw problem("Recibo no encontrado.", 404);
  return row;
}
export function receiptConcept(row, snapshot = JSON.parse(row.snapshot)) {
  if (row.serviceBillId)
    return `Servicio de ${snapshot.serviceLabel || snapshot.service || "suministro"} · ${snapshot.servicePeriod || row.period}`;
  return row.assessmentId
    ? `Derrama "${snapshot.assessmentName}" · plazo ${snapshot.installment}/${snapshot.installmentCount}`
    : `Cuota ${row.period}`;
}
/** Artículo correcto para anteponer al concepto: el servicio o la cuota/derrama. */
export function receiptArticle(row) {
  return row.serviceBillId ? "el" : "la";
}
function lowerFirst(text) {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}
export function reminderSettingsForReceipt(row) {
  if (row.serviceBillId) {
    const service = db.prepare("SELECT data FROM service_bills WHERE id=?").get(row.serviceBillId);
    if (service)
      return reminderSettings(
        {
          reminders: JSON.parse(service.data).reminders || {},
        },
        "service",
      );
  }
  if (row.assessmentId) {
    const assessment = db
      .prepare("SELECT data FROM fee_assessments WHERE id=?")
      .get(row.assessmentId);
    if (assessment)
      return reminderSettings(
        {
          reminders: JSON.parse(assessment.data).reminders || {},
        },
        "assessment",
      );
  }
  return reminderSettings(plans(row.communityId).find((plan) => plan.id === row.planId));
}
export function receiptView(row, date = today()) {
  const snapshot = JSON.parse(row.snapshot);
  const payments = db
    .prepare(
      `SELECT p.id,p.paidOn,p.method,p.reference,p.reversedAt,p.reversalReason,a.amount
    FROM fee_allocations a JOIN fee_payments p ON p.id=a.paymentId WHERE a.receiptId=? ORDER BY p.createdAt`,
    )
    .all(row.id);
  const paid = payments.reduce((s, p) => s + (p.reversedAt ? 0 : p.amount), 0);
  const outstanding = row.cancelledAt ? 0 : row.amount - paid;
  const returned = outstanding > 0 && payments.some((p) => p.reversedAt);
  return {
    ...row,
    canRectify: canRectifyReceipt(row),
    rectifiedBy:
      db
        .prepare(
          "SELECT id FROM fee_receipts WHERE rectifiesReceiptId=? AND rectifiesReceiptId<>''",
        )
        .get(row.id)?.id || "",
    snapshot,
    currency: receiptCurrency(row),
    currencySource: snapshot.currency ? "snapshot" : "community",
    kind: row.serviceBillId ? "service" : row.assessmentId ? "assessment" : "ordinary",
    concept: receiptConcept(row, snapshot),
    payments,
    paid,
    outstanding,
    status: row.cancelledAt
      ? "cancelled"
      : outstanding === 0
        ? "paid"
        : paid > 0
          ? "partial"
          : date > row.dueDate
            ? "overdue"
            : "pending",
    returned,
    proofs: db
      .prepare(
        "SELECT id,ownerId,fileName,mime,status,note,createdAt,reviewedAt FROM fee_proofs WHERE receiptId=? ORDER BY createdAt DESC",
      )
      .all(row.id),
  };
}
/**
 * Resumen agregado para el panel de Inicio. No devuelve recibos completos:
 * solo importes y conteos del ámbito al que el usuario tiene acceso.
 */
export function feeSummary(user, communityId = "", date = today()) {
  const policy = policyData();
  if (!allowed(user, "fee:read", "", policy) && !canManage(user, "", policy))
    return { accessible: false };

  const rows = db
    .prepare(
      `SELECT * FROM fee_receipts ${communityId ? "WHERE communityId=?" : ""} ORDER BY period DESC, createdAt DESC`,
    )
    .all(...(communityId ? [communityId] : []))
    .filter((row) => canReadReceipt(user, row, policy));
  const communityRows = db.prepare("SELECT id,name,currency FROM communities").all();
  const communities = new Map(communityRows.map((c) => [c.id, c]));
  const byCommunity = new Map();
  const totals = {
    issued: 0,
    paid: 0,
    pending: 0,
    overdue: 0,
    dueSoon: 0,
    credit: 0,
  };
  const counts = {
    receipts: 0,
    paid: 0,
    partial: 0,
    pending: 0,
    withBalance: 0,
    overdue: 0,
    cancelled: 0,
    proofsPending: 0,
  };
  let nextDue = null,
    oldestOverdue = null;
  const soon = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  for (const row of rows) {
    const view = receiptView(row, date);
    const community = communities.get(row.communityId) || {
      id: row.communityId,
      name: "",
      currency: "EUR",
    };
    let bucket = byCommunity.get(row.communityId);
    if (!bucket) {
      bucket = {
        id: row.communityId,
        name: community.name,
        currency: community.currency || "EUR",
        totals: { issued: 0, paid: 0, pending: 0, overdue: 0, dueSoon: 0 },
        counts: { receipts: 0, overdue: 0, proofsPending: 0 },
        nextDue: null,
      };
      byCommunity.set(row.communityId, bucket);
    }
    if (row.cancelledAt) {
      counts.cancelled++;
      continue;
    }
    bucket.counts.receipts++;
    counts.receipts++;
    totals.issued += row.amount;
    bucket.totals.issued += row.amount;
    totals.paid += view.paid;
    bucket.totals.paid += view.paid;
    if (view.status === "paid") counts.paid++;
    else if (view.status === "partial") counts.partial++;
    else counts.pending++;
    const pendingProofs = view.proofs.filter((proof) => proof.status === "pending").length;
    counts.proofsPending += pendingProofs;
    bucket.counts.proofsPending += pendingProofs;
    if (view.outstanding <= 0) continue;
    counts.withBalance++;
    totals.pending += view.outstanding;
    bucket.totals.pending += view.outstanding;
    const item = {
      receiptId: row.id,
      communityId: row.communityId,
      community: community.name,
      property: view.snapshot.property,
      period: row.period,
      kind: view.kind,
      concept: view.concept,
      dueDate: row.dueDate,
      amount: row.amount,
      outstanding: view.outstanding,
    };
    if (row.dueDate < date) {
      totals.overdue += view.outstanding;
      bucket.totals.overdue += view.outstanding;
      counts.overdue++;
      bucket.counts.overdue++;
      if (!oldestOverdue || row.dueDate < oldestOverdue.dueDate) oldestOverdue = item;
    } else {
      if (row.dueDate <= soon) {
        totals.dueSoon += view.outstanding;
        bucket.totals.dueSoon += view.outstanding;
      }
      if (!nextDue || row.dueDate < nextDue.dueDate) nextDue = item;
    }
    if (row.dueDate >= date && (!bucket.nextDue || row.dueDate < bucket.nextDue.dueDate))
      bucket.nextDue = item;
  }

  const ownOwnerIds = new Set(
    policy.owners.filter((owner) => owner.userId === user.id).map((o) => o.id),
  );
  const payments = db
    .prepare(
      `SELECT * FROM fee_payments ${communityId ? "WHERE communityId=?" : ""} ORDER BY createdAt DESC`,
    )
    .all(...(communityId ? [communityId] : []))
    .filter(
      (payment) =>
        canManage(user, payment.communityId, policy) ||
        (allowed(user, "fee:read", "", policy) && ownOwnerIds.has(payment.ownerId)),
    )
    .map(paymentView);
  totals.credit = payments.reduce((sum, payment) => sum + payment.credit, 0);

  return {
    accessible: true,
    personal:
      policy.roles.find((role) => role.id === user.rol || role.nombre === user.rol)?.nombre ===
      "user",
    communityId,
    totals,
    counts,
    collectionRate: totals.issued ? Math.round((totals.paid / totals.issued) * 100) : 0,
    nextDue,
    oldestOverdue,
    byCommunity: [...byCommunity.values()],
  };
}

export function plans(communityId) {
  return db
    .prepare("SELECT * FROM fee_plans WHERE communityId=? ORDER BY effectiveFrom DESC")
    .all(communityId)
    .map((r) => ({ ...r, ...JSON.parse(r.data), data: undefined }));
}
export function feeCommunity(communityId) {
  const community = db.prepare("SELECT * FROM communities WHERE id=?").get(communityId);
  if (!community) throw problem("Comunidad no encontrada.", 404);
  if (
    String(community.currency || "EUR")
      .trim()
      .toUpperCase() !== "EUR"
  )
    throw problem(
      "Las cuotas de comunidad se gestionan en euros. Revisa la moneda de la comunidad.",
    );
  return community;
}
export function savePlan(communityId, input, actor, id = "") {
  feeCommunity(communityId);
  const annualAmount = money(input.annualAmount, "El importe anual");
  if (![1, 3, 6, 12].includes(input.months)) throw problem("Periodicidad no válida.");
  if (!validDate(input.effectiveFrom) || !input.effectiveFrom.endsWith("-01"))
    throw problem("La aplicación debe comenzar el primer día de un mes.");
  if (!/^(20\d{2})-/.test(input.effectiveFrom))
    throw problem("El ejercicio debe estar entre 2000 y 2099.");
  integer(input.dueDay, 1, 28, "Día de vencimiento");
  if (
    typeof input.agreement !== "string" ||
    !input.agreement.trim() ||
    input.agreement.length > 300
  )
    throw problem("Indica el acuerdo de Junta (máximo 300 caracteres).");
  if (!["coefficient", "manual"].includes(input.mode))
    throw problem("Criterio de reparto no válido.");
  const reminders = input.reminders === undefined ? null : assessmentReminders(input);
  const manual = {};
  if (input.mode === "manual") {
    const properties = listProperties().filter((p) => p.communityId === communityId);
    for (const p of properties)
      manual[p.id] = money(input.manual?.[p.id], `Cuota anual de ${p.plot}`);
    if (!properties.length || Object.values(manual).reduce((a, b) => a + b, 0) !== annualAmount)
      throw problem("La suma de importes anuales por inmueble debe coincidir con el total anual.");
  }
  const data = {
    annualAmount,
    months: input.months,
    effectiveFrom: input.effectiveFrom,
    dueDay: input.dueDay,
    agreement: input.agreement.trim(),
    mode: input.mode,
    manual,
    reminders,
  };
  return transaction(() => {
    let existing = null;
    if (id) {
      existing = db.prepare("SELECT * FROM fee_plans WHERE id=?").get(id);
      if (!existing) throw problem("Acuerdo de cuotas no encontrado.", 404);
      if (existing.communityId !== communityId)
        throw problem("El acuerdo pertenece a otra comunidad.", 403);
      // La fecha de aplicación no puede moverse si ya hay recibos emitidos
      // desde ella: cambiaría el periodo de recibos ya existentes.
      if (
        existing.effectiveFrom !== input.effectiveFrom &&
        db
          .prepare(
            "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND serviceBillId='' AND periodEnd>=?",
          )
          .get(communityId, existing.effectiveFrom)
      )
        throw problem(
          "Ya hay recibos emitidos desde ese mes: corrige los importes sin cambiar la fecha de aplicación o crea un acuerdo nuevo.",
          409,
        );
    }
    const same = db
      .prepare("SELECT * FROM fee_plans WHERE communityId=? AND effectiveFrom=? AND id<>?")
      .get(communityId, input.effectiveFrom, id || "");
    if (same)
      throw problem(
        "Ya existe un acuerdo con esa fecha. Crea una nueva versión con otra fecha de aplicación.",
        409,
      );
    if (!existing || existing.effectiveFrom !== input.effectiveFrom) {
      const conflict = db
        .prepare(
          "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND serviceBillId='' AND periodEnd>=?",
        )
        .get(communityId, input.effectiveFrom);
      if (conflict)
        throw problem(
          "La nueva configuración se solapa con recibos emitidos. Elige una fecha posterior al último periodo emitido.",
          409,
        );
    }
    if (input.reminders === undefined)
      data.reminders = existing
        ? JSON.parse(existing.data).reminders || {}
        : assessmentReminders({});
    if (id) {
      db.prepare("UPDATE fee_plans SET effectiveFrom=?, data=? WHERE id=?").run(
        input.effectiveFrom,
        JSON.stringify(data),
        id,
      );
      audit(actor, "plan.update", id, {
        communityId,
        effectiveFrom: input.effectiveFrom,
        annualAmount,
      });
      return { id, ...data };
    }
    const planId = crypto.randomUUID();
    db.prepare("INSERT INTO fee_plans VALUES(?,?,?,?,?,?)").run(
      planId,
      communityId,
      input.effectiveFrom,
      JSON.stringify(data),
      now(),
      actor.id,
    );
    audit(actor, "plan", planId, {
      communityId,
      effectiveFrom: input.effectiveFrom,
      annualAmount,
    });
    return { id: planId, ...data };
  });
}
export function deletePlan(communityId, id, actor) {
  feeCommunity(communityId);
  const row = db.prepare("SELECT * FROM fee_plans WHERE id=?").get(id);
  if (!row) throw problem("Acuerdo de cuotas no encontrado.", 404);
  if (row.communityId !== communityId) throw problem("El acuerdo pertenece a otra comunidad.", 403);
  return transaction(() => {
    if (
      db
        .prepare(
          "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND serviceBillId='' AND periodEnd>=?",
        )
        .get(communityId, row.effectiveFrom)
    )
      throw problem(
        "No puedes quitar un acuerdo con recibos emitidos. Corrige sus importes o crea uno nuevo con la fecha correcta.",
        409,
      );
    db.prepare("DELETE FROM fee_plans WHERE id=?").run(id);
    audit(actor, "plan.delete", id, {
      communityId,
      effectiveFrom: row.effectiveFrom,
    });
    return { id };
  });
}
function monthIndex(value) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
function monthString(index) {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
/** La fila cruda guarda los porcentajes como JSON; las vistas ya lo traen mapeado. */
function ownerPercentagesOf(property) {
  let percentages = property?.ownerPercentages || {};
  if (typeof percentages === "string") {
    try {
      percentages = JSON.parse(percentages || "{}");
    } catch {
      percentages = {};
    }
  }
  return percentages && typeof percentages === "object" ? percentages : {};
}

/** Porcentaje de titularidad acreditado al emitir, o null si no consta. */
function ownerPercentage(property, ownerId) {
  const value = Number(ownerPercentagesOf(property)[ownerId]);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

/**
 * Total asignado del inmueble. Puede ser menor que 100: la titularidad
 * parcial es válida y el porcentaje restante no se reparte entre los titulares.
 */
function assignedOwnershipTotal(property) {
  const total = Object.values(ownerPercentagesOf(property)).reduce((sum, value) => {
    const percentage = Number(value);
    return sum + (Number.isFinite(percentage) && percentage > 0 && percentage <= 100 ? percentage : 0);
  }, 0);
  return total > 0 ? Math.round(total * 10000) / 10000 : 0;
}

export function distribute(total, entries) {
  const sum = entries.reduce((s, x) => s + x.weight, 0);
  const parts = entries.map((x) => ({
    ...x,
    amount: Number((BigInt(total) * BigInt(x.weight)) / BigInt(sum)),
    remainder: (BigInt(total) * BigInt(x.weight)) % BigInt(sum),
  }));
  let rest = total - parts.reduce((s, x) => s + x.amount, 0);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.property.id.localeCompare(b.property.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < rest; i++) ranked[i].amount++;
  return parts;
}
export function preview(communityId, period) {
  feeCommunity(communityId);
  if (typeof period !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
    throw problem("Indica un periodo válido (AAAA-MM).");
  const plan = plans(communityId).find((p) => p.effectiveFrom <= `${period}-01`);
  if (!plan) throw problem("Guarda primero una configuración aplicable al periodo.");
  const offset = monthIndex(period) - monthIndex(plan.effectiveFrom);
  if (offset % plan.months)
    throw problem("El mes elegido no inicia un periodo de la periodicidad configurada.");
  const periodEnd = new Date(
    Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + plan.months, 0),
  )
    .toISOString()
    .slice(0, 10);
  if (
    plans(communityId).some((p) => p.effectiveFrom > `${period}-01` && p.effectiveFrom <= periodEnd)
  )
    throw problem("El periodo cruza la entrada en vigor de otro acuerdo.");
  const properties = listProperties()
    .filter((p) => p.communityId === communityId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!properties.length) throw problem("La comunidad no tiene inmuebles.");
  const owners = listOwners(),
    warnings = [],
    entries = [];
  for (const property of properties) {
    const linked = property.ownerIds.map((id) => owners.find((o) => o.id === id)).filter(Boolean);
    if (!linked.length || linked.length !== property.ownerIds.length)
      throw problem(`${property.plot}: falta identificar a sus titulares.`);
    let weight;
    if (plan.mode === "coefficient") {
      const text = String(property.participationCoef).replace(",", ".");
      if (!/^\d{1,3}(\.\d{1,4})?$/.test(text) || Number(text) <= 0 || Number(text) > 100)
        throw problem(`${property.plot}: coeficiente no válido (hasta cuatro decimales).`);
      weight = Math.round(Number(text) * 10000);
    } else {
      weight = plan.manual[property.id];
      if (!Number.isSafeInteger(weight) || weight <= 0)
        throw problem(
          `${property.plot}: falta su importe anual aprobado. Crea una nueva configuración.`,
        );
    }
    entries.push({
      property,
      weight,
      owners: linked.map((o) => ({
        id: o.id,
        name: `${o.name} ${o.surname}`.trim(),
        percentage: ownerPercentage(property, o.id),
      })),
    });
  }
  const weightSum = entries.reduce((s, e) => s + e.weight, 0);
  if (plan.mode === "coefficient" && weightSum !== 1000000)
    throw problem(
      `Los coeficientes suman ${(weightSum / 10000).toFixed(4)} %. Deben sumar 100 %. Revisa los inmuebles.`,
    );
  if (plan.mode === "manual" && weightSum !== plan.annualAmount)
    throw problem(
      "El censo cambió y los importes no cuadran con el total aprobado. Revisa la configuración.",
    );
  const cycle = offset % 12;
  const total =
    Math.round((plan.annualAmount * (cycle + plan.months)) / 12) -
    Math.round((plan.annualAmount * cycle) / 12);
  const community = db.prepare("SELECT name, iban FROM communities WHERE id=?").get(communityId);
  // Cumulative rounding makes both each batch and the twelve-month owner totals
  // match the approved annual distribution, including manual amounts.
  const before = new Map(
    distribute(Math.round((plan.annualAmount * cycle) / 12), entries).map((e) => [
      e.property.id,
      e.amount,
    ]),
  );
  const rows = distribute(
    Math.round((plan.annualAmount * (cycle + plan.months)) / 12),
    entries,
  ).map((e) => {
    e.amount -= before.get(e.property.id);
    if (e.amount <= 0)
      throw problem(`${e.property.plot}: el recibo resultaría de cero euros. Revisa los importes.`);
    const previous = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE communityId=? AND propertyId=? AND cancelledAt='' AND assessmentId='' AND serviceBillId='' ORDER BY period DESC LIMIT 1",
      )
      .get(communityId, e.property.id);
    if (previous) {
      const snapshot = JSON.parse(previous.snapshot);
      if (
        snapshot.owners
          .map((o) => o.id)
          .sort()
          .join() !==
          e.owners
            .map((o) => o.id)
            .sort()
            .join() &&
        receiptView(previous).outstanding > 0
      )
        warnings.push(
          `${e.property.plot}: cambiaron los titulares y hay deuda del periodo ${previous.period}.`,
        );
      const oldMonths = snapshot.months || 1;
      if (e.amount / plan.months > previous.amount / oldMonths)
        warnings.push(`${e.property.plot}: aumenta el importe por mes respecto al último recibo.`);
    }
    return {
      propertyId: e.property.id,
      amount: e.amount,
      snapshot: {
        currency: "EUR",
        property: e.property.plot || e.property.address,
        community: community.name,
        communityIban: community.iban || "",
        owners: e.owners,
        coefficient: e.property.participationCoef,
        months: plan.months,
        agreement: plan.agreement,
      },
    };
  });
  if (
    db
      .prepare(
        "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND serviceBillId='' AND period<=? AND periodEnd>=?",
      )
      .get(communityId, periodEnd.slice(0, 7), `${period}-01`)
  )
    throw problem("El periodo se solapa con cuotas ya emitidas.", 409);
  const result = {
    planId: plan.id,
    communityId,
    period,
    periodEnd,
    dueDate: `${period}-${String(plan.dueDay).padStart(2, "0")}`,
    total,
    rows,
    warnings,
  };
  return {
    ...result,
    token: crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex"),
  };
}
export function issue(communityId, input, actor) {
  return transaction(() => {
    const batch = preview(communityId, input.period);
    if (input.token !== batch.token)
      throw problem("Los datos cambiaron. Vuelve a revisar la vista previa antes de emitir.", 409);
    const ids = [];
    const currency = communityCurrency(communityId);
    for (const item of batch.rows) {
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        communityId,
        item.propertyId,
        batch.planId,
        batch.period,
        batch.periodEnd,
        batch.dueDate,
        item.amount,
        JSON.stringify(item.snapshot),
        now(),
        actor.id,
      );
      ids.push(id);
      notify(
        receiptById(id),
        "issued",
        id,
        "Nuevo recibo de cuota",
        `Cuota ordinaria ${batch.period}: ${formatMoney(item.amount, currency)}. Vencimiento: ${batch.dueDate}.${
          item.snapshot.communityIban
            ? ` IBAN para transferencia: ${item.snapshot.communityIban}.`
            : ""
        }`,
      );
    }
    audit(actor, "issue", batch.planId, {
      communityId,
      period: batch.period,
      total: batch.total,
      count: ids.length,
    });
    return { ids, total: batch.total };
  });
}

export function assessmentById(id) {
  const row = db.prepare("SELECT * FROM fee_assessments WHERE id=?").get(id);
  if (!row) throw problem("Derrama no encontrada.", 404);
  return row;
}
function assessmentPayload(row) {
  return JSON.parse(row.data);
}

function markAssessmentIssued(id, number, issuedAt) {
  const row = assessmentById(id),
    data = assessmentPayload(row);
  const installment = data.installments.find((item) => item.number === number);
  if (installment)
    installment.issuedAt = installment.issuedAt
      ? [installment.issuedAt, issuedAt].sort()[0]
      : issuedAt;
  const first = row.issuedAt ? [row.issuedAt, issuedAt].sort()[0] : issuedAt;
  db.prepare("UPDATE fee_assessments SET issuedAt=?,data=? WHERE id=?").run(
    first,
    JSON.stringify(data),
    id,
  );
}
export function selectedChargeProperties(communityId, input) {
  const all = listProperties()
    .filter((property) => property.communityId === communityId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!all.length) throw problem("La comunidad no tiene inmuebles.");
  if (input.propertyIds !== undefined && !Array.isArray(input.propertyIds))
    throw problem("La selección de inmuebles no es válida.");
  if (Array.isArray(input.propertyIds) && !input.propertyIds.length)
    throw problem("Elige al menos un inmueble.");
  const ids = input.propertyIds
    ? [...new Set(input.propertyIds)]
    : all.map((property) => property.id);
  if (ids.length !== (input.propertyIds || all).length)
    throw problem("La selección de inmuebles contiene duplicados.");
  const selected = all.filter((property) => ids.includes(property.id));
  if (selected.length !== ids.length)
    throw problem("La selección incluye inmuebles de otra comunidad.");
  const owners = listOwners();
  const entries = [];
  for (const property of selected) {
    const linked = property.ownerIds
      .map((id) => owners.find((owner) => owner.id === id))
      .filter(Boolean);
    if (!linked.length || linked.length !== property.ownerIds.length)
      throw problem(`${property.plot}: falta identificar a sus titulares.`);
    entries.push({
      property,
      owners: linked.map((owner) => ({
        id: owner.id,
        name: `${owner.name} ${owner.surname}`.trim(),
        percentage: ownerPercentage(property, owner.id),
      })),
    });
  }
  return { all, selected, entries };
}
function assessmentReminders(input) {
  const defaults = noticeDefaults("assessment"),
    reminders = {};
  for (const [key, max] of [
    ["beforeDays", 60],
    ["afterDays", 365],
    ["repeatDays", 365],
  ])
    reminders[key] = integer(input.reminders?.[key] ?? defaults[key], 0, max, key);
  for (const key of ["internal", "email"]) {
    reminders[key] = input.reminders?.[key] ?? defaults[key];
    if (typeof reminders[key] !== "boolean") throw problem("Canal de avisos no válido.");
  }
  return reminders;
}
function assessmentSchedule(installments, entries) {
  let cumulative = 0,
    previous = new Map();
  return installments.map((item) => {
    cumulative += item.amount;
    const parts = distribute(cumulative, entries);
    const allocations = Object.fromEntries(
      parts.map((entry) => {
        const amount = entry.amount - (previous.get(entry.property.id) || 0);
        if (amount <= 0)
          throw problem(
            `${entry.property.plot}: el plazo ${item.number} le asigna cero euros. Ajusta los importes o la cantidad de plazos.`,
          );
        return [entry.property.id, amount];
      }),
    );
    previous = new Map(parts.map((entry) => [entry.property.id, entry.amount]));
    return { ...item, allocations };
  });
}
export function saveAssessment(communityId, input, actor, id = "") {
  feeCommunity(communityId);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120)
    throw problem("Indica un nombre de derrama (máximo 120 caracteres).");
  const rawPurpose = typeof input.purpose === "string" ? input.purpose.trim() : "";
  if (rawPurpose.length > 20000)
    throw problem("El motivo no puede superar 20000 caracteres de formato.");
  const purpose = sanitizeRichText(rawPurpose);
  const agreement = typeof input.agreement === "string" ? input.agreement.trim() : "";
  if (!agreement || agreement.length > 300)
    throw problem("Indica el acuerdo de Junta (máximo 300 caracteres).");
  const totalAmount = money(input.totalAmount, "El importe total");
  if (!["coefficient", "manual", "mixed"].includes(input.mode))
    throw problem("Criterio de reparto no válido.");
  const { all, selected, entries } = selectedChargeProperties(communityId, input);
  const allocations = {},
    fixedAmounts = {};
  const previousRow = id ? assessmentById(id) : null;
  const previousData = previousRow && assessmentPayload(previousRow);
  const preserveLegacy =
    input.preserveLegacyMixed === true ||
    (input.mode === "mixed" &&
      input.manual === undefined &&
      previousData?.mode === "mixed" &&
      previousData.fixedAmounts === undefined);
  const legacyRow = preserveLegacy ? previousRow : null;
  const legacy = legacyRow && assessmentPayload(legacyRow);
  if (preserveLegacy) {
    if (
      !legacy ||
      legacy.mode !== "mixed" ||
      legacy.fixedAmounts !== undefined ||
      input.mode !== "mixed" ||
      legacyRow.communityId !== communityId ||
      legacyRow.totalAmount !== totalAmount ||
      JSON.stringify([...legacy.propertyIds].sort()) !==
        JSON.stringify(selected.map((p) => p.id).sort())
    )
      throw problem(
        "Para cambiar el total o los inmuebles debes reconfigurar explícitamente el reparto mixto heredado.",
        409,
      );
    Object.assign(allocations, legacy.allocations);
  } else if (input.mode === "coefficient") {
    let weightSum = 0;
    for (const entry of entries) {
      const text = String(entry.property.participationCoef).replace(",", ".");
      if (!/^\d{1,3}(\.\d{1,4})?$/.test(text) || Number(text) <= 0 || Number(text) > 100)
        throw problem(`${entry.property.plot}: coeficiente no válido (hasta cuatro decimales).`);
      entry.weight = Math.round(Number(text) * 10000);
      weightSum += entry.weight;
    }
    if (selected.length === all.length && weightSum !== 1000000)
      throw problem(
        `Los coeficientes suman ${(weightSum / 10000).toFixed(4)} %. Deben sumar 100 %. Revisa los inmuebles.`,
      );
    for (const entry of distribute(totalAmount, entries)) {
      if (entry.amount <= 0)
        throw problem(
          `${entry.property.plot}: el reparto le asigna cero euros. Ajusta la selección o el importe.`,
        );
      allocations[entry.property.id] = entry.amount;
    }
  } else if (input.mode === "mixed") {
    // Mixed mode: some properties have fixed amounts, others use coefficient
    const manual =
      input.manual ??
      (previousData?.mode === "mixed"
        ? Object.fromEntries(
            Object.entries(previousData.fixedAmounts || {}).map(([id, cents]) => [
              id,
              (cents / 100).toFixed(2),
            ]),
          )
        : {});
    let manualSum = 0;
    const manualProperties = new Set();
    for (const property of selected) {
      if (manual[property.id] !== undefined) {
        const amount = money(manual[property.id], `Importe fijo de ${property.plot}`);
        allocations[property.id] = amount;
        fixedAmounts[property.id] = amount;
        manualSum += amount;
        manualProperties.add(property.id);
      }
    }
    if (manualSum > totalAmount)
      throw problem("La suma de importes fijos supera el total de la derrama.");
    const remainingAmount = totalAmount - manualSum;
    if (remainingAmount < 0)
      throw problem("La suma de importes fijos supera el total de la derrama.");
    // Distribute remaining by coefficient among non-manual properties
    const coefficientEntries = entries.filter((entry) => !manualProperties.has(entry.property.id));
    if (coefficientEntries.length > 0) {
      let weightSum = 0;
      for (const entry of coefficientEntries) {
        const text = String(entry.property.participationCoef).replace(",", ".");
        if (!/^\d{1,3}(\.\d{1,4})?$/.test(text) || Number(text) <= 0 || Number(text) > 100)
          throw problem(`${entry.property.plot}: coeficiente no válido (hasta cuatro decimales).`);
        entry.weight = Math.round(Number(text) * 10000);
        weightSum += entry.weight;
      }
      if (weightSum === 0) throw problem("No hay coeficientes válidos para el reparto variable.");
      for (const entry of distribute(remainingAmount, coefficientEntries)) {
        if (entry.amount <= 0)
          throw problem(
            `${entry.property.plot}: el reparto variable le asigna cero euros. Ajusta los importes fijos o los coeficientes.`,
          );
        allocations[entry.property.id] = entry.amount;
      }
    }
    // Verify total matches
    const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + v, 0);
    if (totalAllocated !== totalAmount)
      throw problem("El reparto mixto no cuadra con el total de la derrama.");
  } else {
    let sum = 0;
    for (const property of selected) {
      const amount = money(input.manual?.[property.id], `Importe de ${property.plot}`);
      allocations[property.id] = amount;
      sum += amount;
    }
    if (sum !== totalAmount)
      throw problem("La suma de importes por inmueble debe coincidir con el total de la derrama.");
  }
  if (!Array.isArray(input.installments) || input.installments.length < 1)
    throw problem("Indica al menos un plazo.");
  if (input.installments.length > 36) throw problem("La derrama no puede tener más de 36 plazos.");
  let previousDue = "";
  const installments = input.installments.map((item, index) => {
    const amount = money(item?.amount, `Importe del plazo ${index + 1}`);
    if (!validDate(item?.dueDate))
      throw problem(`El vencimiento del plazo ${index + 1} no es válido.`);
    if (previousDue && item.dueDate <= previousDue)
      throw problem("Los vencimientos de los plazos deben ser crecientes.");
    previousDue = item.dueDate;
    return { number: index + 1, amount, dueDate: item.dueDate };
  });
  if (installments.reduce((sum, installment) => sum + installment.amount, 0) !== totalAmount)
    throw problem("La suma de los plazos debe coincidir con el total de la derrama.");
  const data = {
    purpose,
    agreement,
    mode: input.mode,
    propertyIds: selected.map((property) => property.id),
    allocations,
    fixedAmounts: input.mode === "mixed" && !legacy ? fixedAmounts : undefined,
    coefficients: legacy
      ? legacy.coefficients
      : Object.fromEntries(
          entries.map((entry) => [entry.property.id, entry.property.participationCoef]),
        ),
    installments: assessmentSchedule(
      installments,
      entries.map((entry) => ({
        ...entry,
        weight: allocations[entry.property.id],
      })),
    ),
    // Sin pestaña propia de avisos: si el cliente no envía recordatorios, las
    // derramas nuevas usan los valores generales de Notificaciones y las
    // existentes conservan los que ya tenían guardados.
    reminders: input.reminders === undefined ? null : assessmentReminders(input),
  };
  return transaction(() => {
    if (id) {
      const row = assessmentById(id);
      if (legacyRow && row.data !== legacyRow.data)
        throw problem("La derrama cambió. Recarga el borrador antes de guardar.", 409);
      if (row.communityId !== communityId)
        throw problem("La derrama pertenece a otra comunidad.", 403);
      if (row.cancelledAt) throw problem("La derrama está anulada.", 409);
      if (
        row.issuedAt ||
        db.prepare("SELECT 1 FROM fee_receipts WHERE assessmentId=? LIMIT 1").get(id)
      )
        throw problem(
          "La derrama ya tiene recibos emitidos. Para cambiarla, anúlala y crea una nueva.",
          409,
        );
      if (assessmentPayload(row).installments.some((item) => item.cancelledAt))
        throw problem(
          "La derrama tiene plazos anulados. Para cambiarla, anúlala y crea una nueva.",
          409,
        );
      if (data.reminders === null) data.reminders = assessmentPayload(row).reminders || {};
      db.prepare("UPDATE fee_assessments SET name=?,totalAmount=?,data=? WHERE id=?").run(
        name,
        totalAmount,
        JSON.stringify(data),
        id,
      );
      audit(actor, "assessment.update", id, {
        communityId,
        totalAmount,
        installments: installments.length,
      });
      return assessmentView(assessmentById(id));
    }
    const assessmentId = crypto.randomUUID();
    if (data.reminders === null) data.reminders = {};
    db.prepare(
      "INSERT INTO fee_assessments(id,communityId,name,totalAmount,data,createdAt,actorId) VALUES(?,?,?,?,?,?,?)",
    ).run(assessmentId, communityId, name, totalAmount, JSON.stringify(data), now(), actor.id);
    audit(actor, "assessment.create", assessmentId, {
      communityId,
      totalAmount,
      installments: installments.length,
    });
    return assessmentView(assessmentById(assessmentId));
  });
}
export function assessments(communityId) {
  return db
    .prepare("SELECT * FROM fee_assessments WHERE communityId=? ORDER BY createdAt DESC")
    .all(communityId)
    .map((row) => assessmentView(row));
}
export function assessmentView(row, date = today()) {
  const data = assessmentPayload(row),
    receipts = db
      .prepare("SELECT * FROM fee_receipts WHERE assessmentId=? ORDER BY installment,propertyId")
      .all(row.id);
  const installments = data.installments.map((installment) => {
    const rows = receipts.filter((receipt) => receipt.installment === installment.number);
    const active = rows.filter((receipt) => !receipt.cancelledAt);
    const views = active.map((receipt) => receiptView(receipt, date));
    const paid = views.reduce((sum, view) => sum + view.paid, 0);
    const outstanding = views.reduce((sum, view) => sum + view.outstanding, 0);
    const issued = active.length > 0;
    const overdue = views.some((receipt) => receipt.outstanding > 0 && receipt.dueDate < date);
    const needsRectification =
      !row.cancelledAt && !installment.cancelledAt && rows.some(canRectifyReceipt);
    return {
      ...installment,
      issued,
      issuedAt:
        installment.issuedAt ||
        (rows.length ? rows.map((receipt) => receipt.createdAt).sort()[0] : ""),
      receiptCount: rows.length,
      paid,
      outstanding,
      overdue,
      needsRectification,
      status:
        row.cancelledAt || installment.cancelledAt
          ? "cancelled"
          : !rows.length
            ? installment.issuedAt
              ? "purged"
              : "pending"
            : !active.length
              ? "rectification"
              : needsRectification
                ? "rectification"
                : outstanding === 0
                  ? "paid"
                  : paid > 0
                    ? "partial"
                    : overdue
                      ? "overdue"
                      : "issued",
    };
  });
  const active = receipts
      .filter((receipt) => !receipt.cancelledAt)
      .map((receipt) => receiptView(receipt, date)),
    issued = active.reduce((sum, view) => sum + view.amount, 0),
    paid = active.reduce((sum, view) => sum + view.paid, 0),
    outstanding = active.reduce((sum, view) => sum + view.outstanding, 0),
    cancelledCount = installments.filter(
      (installment) => installment.status === "cancelled",
    ).length;
  const canEdit = !row.cancelledAt && !row.issuedAt && !receipts.length && !cancelledCount;
  let status = "draft";
  if (row.cancelledAt) status = "cancelled";
  else if (installments.length && cancelledCount === installments.length) status = "cancelled";
  else if (canEdit) status = "draft";
  else if (installments.some((item) => item.needsRectification)) status = "rectification";
  else if (installments.every((item) => ["paid", "cancelled", "purged"].includes(item.status)))
    status = installments.some((item) => item.status === "purged") ? "purged" : "collected";
  else status = "active";
  return {
    id: row.id,
    communityId: row.communityId,
    name: row.name,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    actorId: row.actorId,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    canEdit,
    issuedAt: row.issuedAt || "",
    purpose: data.purpose,
    agreement: data.agreement,
    mode: data.mode,
    propertyIds: data.propertyIds,
    allocations: data.allocations,
    fixedAmounts: data.fixedAmounts,
    coefficients: data.coefficients,
    reminders: data.reminders,
    installments,
    totals: {
      total: row.totalAmount,
      issued,
      paid,
      outstanding,
      rectification: receipts
        .filter(canRectifyReceipt)
        .reduce((sum, receipt) => sum + receipt.amount, 0),
      unissued: installments
        .filter((item) => item.status === "pending")
        .reduce((sum, item) => sum + item.amount, 0),
      cancelled:
        receipts
          .filter((receipt) => receipt.cancelledAt)
          .reduce((sum, receipt) => sum + receipt.amount, 0) +
        installments
          .filter((item) => item.status === "cancelled" && !item.receiptCount)
          .reduce((sum, item) => sum + item.amount, 0),
    },
    status,
  };
}
export function assessmentDetail(row, date = today()) {
  const view = assessmentView(row, date);
  return {
    ...view,
    receipts: db
      .prepare("SELECT * FROM fee_receipts WHERE assessmentId=? ORDER BY installment,propertyId")
      .all(row.id)
      .map((receipt) => receiptView(receipt, date)),
  };
}
function assessmentInstallment(row, number) {
  const data = assessmentPayload(row),
    installment = data.installments.find((item) => item.number === number);
  if (!installment) throw problem("El plazo indicado no pertenece a esta derrama.", 404);
  return { data, installment };
}
export function previewAssessment(id, number) {
  const row = assessmentById(id);
  feeCommunity(row.communityId);
  if (row.cancelledAt) throw problem("La derrama está anulada.", 409);
  integer(number, 1, 36, "Plazo");
  const { data, installment } = assessmentInstallment(row, number);
  if (installment.cancelledAt) throw problem("Este plazo está anulado.", 409);
  if (
    installment.issuedAt ||
    db
      .prepare("SELECT 1 FROM fee_receipts WHERE assessmentId=? AND installment=? LIMIT 1")
      .get(row.id, number)
  )
    throw problem("Este plazo ya fue emitido.", 409);
  const { entries } = selectedChargeProperties(row.communityId, {
    propertyIds: data.propertyIds,
  });
  for (const entry of entries) {
    const weight = data.allocations[entry.property.id];
    if (!Number.isSafeInteger(weight) || weight <= 0)
      throw problem(`${entry.property.plot}: falta su importe en el reparto de la derrama.`);
    entry.weight = weight;
  }
  const ordered = [...data.installments].sort((a, b) => a.number - b.number);
  const amounts =
    installment.allocations ||
    assessmentSchedule(ordered, entries).find((item) => item.number === number).allocations;
  const community = db.prepare("SELECT name,iban FROM communities WHERE id=?").get(row.communityId);
  const warnings = [];
  if (installment.dueDate < today())
    warnings.push(
      `El vencimiento ${installment.dueDate} ya pasó; los recibos se emitirán vencidos.`,
    );
  const rows = entries.map((entry) => {
    const amount = amounts[entry.property.id];
    const previous = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE assessmentId=? AND propertyId=? AND installment<? AND cancelledAt='' ORDER BY installment DESC LIMIT 1",
      )
      .get(row.id, entry.property.id, number);
    if (previous) {
      const snapshot = JSON.parse(previous.snapshot);
      if (
        snapshot.owners
          .map((owner) => owner.id)
          .sort()
          .join() !==
          entry.owners
            .map((owner) => owner.id)
            .sort()
            .join() &&
        receiptView(previous).outstanding > 0
      )
        warnings.push(
          `${entry.property.plot}: cambiaron los titulares y hay deuda del plazo ${previous.installment}.`,
        );
    }
    return {
      propertyId: entry.property.id,
      amount,
      snapshot: {
        currency: "EUR",
        property: entry.property.plot || entry.property.address,
        community: community.name,
        communityIban: community.iban || "",
        owners: entry.owners,
        coefficient: data.coefficients?.[entry.property.id] ?? entry.property.participationCoef,
        agreement: data.agreement,
        assessmentId: row.id,
        assessmentName: row.name,
        assessmentPurpose: data.purpose,
        installment: number,
        installmentCount: ordered.length,
      },
    };
  });
  if (rows.reduce((sum, item) => sum + item.amount, 0) !== installment.amount)
    throw problem("No se pudo repartir el importe del plazo. Revisa los importes.");
  const result = {
    assessmentId: row.id,
    assessmentName: row.name,
    installment: number,
    installmentCount: ordered.length,
    dueDate: installment.dueDate,
    total: installment.amount,
    rows,
    warnings,
  };
  return {
    ...result,
    token: crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex"),
  };
}
export function issueAssessment(id, input, actor) {
  return transaction(() => {
    const row = assessmentById(id);
    if (!canManage(actor, row.communityId))
      throw problem("No tienes permiso para emitir derramas de esta comunidad.", 403);
    const batch = previewAssessment(id, Number(input.installment));
    if (input.token !== batch.token)
      throw problem("Los datos cambiaron. Vuelve a revisar la vista previa antes de emitir.", 409);
    const ids = [];
    const currency = communityCurrency(row.communityId);
    for (const item of batch.rows) {
      const receiptId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId,assessmentId,installment)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        receiptId,
        row.communityId,
        item.propertyId,
        "",
        batch.dueDate.slice(0, 7),
        batch.dueDate,
        batch.dueDate,
        item.amount,
        JSON.stringify(item.snapshot),
        now(),
        actor.id,
        row.id,
        batch.installment,
      );
      ids.push(receiptId);
      notify(
        receiptById(receiptId),
        "issued",
        `${row.id}:${batch.installment}`,
        `Nueva derrama: ${row.name}`,
        `Derrama "${row.name}" · plazo ${batch.installment}/${batch.installmentCount}: ${formatMoney(item.amount, currency)}. Vencimiento: ${batch.dueDate}.${
          item.snapshot.communityIban
            ? ` IBAN para transferencia: ${item.snapshot.communityIban}.`
            : ""
        }`,
      );
    }
    markAssessmentIssued(row.id, batch.installment, now());
    audit(actor, "assessment.issue", row.id, {
      communityId: row.communityId,
      installment: batch.installment,
      total: batch.total,
      count: ids.length,
    });
    return { ids, total: batch.total, installment: batch.installment };
  });
}
export function cancelAssessment(id, input, actor) {
  const note = reason(input.reason);
  return transaction(() => {
    const row = assessmentById(id);
    if (!canManage(actor, row.communityId))
      throw problem("No tienes permiso para anular derramas de esta comunidad.", 403);
    if (row.cancelledAt) throw problem("La derrama ya está anulada.", 409);
    const installment =
      input.installment === undefined || input.installment === ""
        ? null
        : Number(input.installment);
    const data = assessmentPayload(row),
      view = assessmentView(row);
    if (installment !== null) {
      integer(installment, 1, 36, "Plazo");
      if (!data.installments.some((item) => item.number === installment))
        throw problem("El plazo indicado no pertenece a esta derrama.", 404);
      if (view.installments.find((item) => item.number === installment).status === "cancelled")
        throw problem("El plazo ya está anulado.", 409);
    }
    const receipts = db
      .prepare(
        `SELECT * FROM fee_receipts WHERE assessmentId=? AND cancelledAt=''${
          installment === null ? "" : " AND installment=?"
        }`,
      )
      .all(...(installment === null ? [id] : [id, installment]));
    for (const receipt of receipts)
      if (receiptView(receipt).paid > 0)
        throw problem(
          "Hay cobros aplicados a esta derrama. Revierte primero los cobros y vuelve a intentar.",
          409,
        );
    const cancelledAt = now();
    for (const receipt of receipts) {
      db.prepare("UPDATE fee_receipts SET cancelledAt=?,cancellationReason=? WHERE id=?").run(
        cancelledAt,
        note,
        receipt.id,
      );
      notify(
        receiptById(receipt.id),
        "cancelled",
        `${row.id}:${receipt.installment}:${receipt.propertyId}`,
        installment === null ? "Derrama anulada" : `Plazo ${installment} de derrama anulado`,
        installment === null
          ? `Se anuló la derrama "${row.name}". Motivo: ${note}`
          : `Se anuló el plazo ${installment} de la derrama "${row.name}". Motivo: ${note}`,
      );
    }
    data.installments = data.installments.map((item) =>
      (installment === null || item.number === installment) && !item.cancelledAt
        ? { ...item, cancelledAt, cancellationReason: note }
        : item,
    );
    db.prepare("UPDATE fee_assessments SET data=? WHERE id=?").run(JSON.stringify(data), row.id);
    if (
      installment === null ||
      data.installments.every(
        (item) =>
          item.cancelledAt ||
          view.installments.find((previous) => previous.number === item.number).status ===
            "cancelled",
      )
    )
      db.prepare("UPDATE fee_assessments SET cancelledAt=?,cancellationReason=? WHERE id=?").run(
        cancelledAt,
        note,
        row.id,
      );
    audit(actor, "assessment.cancel", row.id, {
      communityId: row.communityId,
      installment,
      count: receipts.length,
      reason: note,
    });
    return assessmentView(assessmentById(row.id));
  });
}

function audit(actor, action, id, details) {
  recordAudit({
    actor,
    action: `fee.${action}`,
    resourceType: "fee",
    resourceId: id,
    details,
  });
}
function communityCurrency(communityId) {
  return (
    db.prepare("SELECT currency FROM communities WHERE id = ?").get(communityId)?.currency || "EUR"
  );
}
export function receiptCurrency(row) {
  const snapshot = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
  return snapshot?.currency || communityCurrency(row.communityId);
}

export function formatMoney(cents, currency = "EUR") {
  const code = String(currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}
export function paymentView(row) {
  const allocations = db
    .prepare("SELECT receiptId,amount FROM fee_allocations WHERE paymentId=?")
    .all(row.id);
  return {
    ...row,
    allocations,
    credit: row.reversedAt ? 0 : row.amount - allocations.reduce((s, a) => s + a.amount, 0),
  };
}
function allocate(payment, ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > 1000 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string")
  )
    throw problem("La selección de recibos no es válida.");
  let available = paymentView(payment).credit;
  for (const id of ids) {
    const receipt = receiptById(id),
      view = receiptView(receipt);
    if (
      receipt.communityId !== payment.communityId ||
      !view.snapshot.owners.some((o) => o.id === payment.ownerId)
    )
      throw problem("El cobro debe aplicarse a recibos del pagador y de la misma comunidad.");
    if (receipt.cancelledAt) throw problem("No se puede pagar un recibo anulado.");
    const amount = Math.min(available, view.outstanding);
    if (amount > 0) {
      db.prepare(
        "INSERT INTO fee_allocations VALUES(?,?,?) ON CONFLICT(paymentId,receiptId) DO UPDATE SET amount=amount+excluded.amount",
      ).run(payment.id, id, amount);
      available -= amount;
      notify(
        receipt,
        "payment",
        `${payment.id}:${view.paid + amount}`,
        "Cobro registrado",
        `Se registraron ${formatMoney(amount, receiptCurrency(receipt))} para ${receiptArticle(receipt)} ${lowerFirst(receiptConcept(receipt, view.snapshot))} de ${view.snapshot.property}.`,
      );
    }
  }
}
/**
 * Porcentaje aplicable a un recibo concreto. El recibo manda: si guarda el
 * porcentaje acreditado al emitir, se usa ese. Solo si falta y la comunidad
 * lo permite se recurre al porcentaje actual del inmueble.
 */
function receiptShare(receipt, ownerId, property, policy) {
  const entry = (receipt.snapshot.owners || []).find((owner) => owner.id === ownerId);
  const saved = Number(entry?.percentage);
  if (Number.isFinite(saved) && saved > 0 && saved <= 100)
    return { percentage: saved, source: "snapshot" };
  if (policy === "ultimo_conocido") {
    // La fila de inmueble guarda los porcentajes como JSON; no siempre llega
    // ya mapeada a objeto (el certificado consulta la tabla directamente).
    let percentages = property?.ownerPercentages || {};
    if (typeof percentages === "string") {
      try {
        percentages = JSON.parse(percentages || "{}");
      } catch {
        percentages = {};
      }
    }
    const current = Number(percentages[ownerId]);
    if (Number.isFinite(current) && current > 0 && current <= 100)
      return { percentage: current, source: "actual" };
  }
  return { percentage: null, source: "missing" };
}

const shareAmount = (amount, percentage) => Math.round((amount * percentage) / 100);

export function generateDebtCertificate({ communityId, ownerId, propertyId, actor }) {
  if (ownerId && propertyId)
    throw problem("Debe indicar un único propietario o inmueble para definir el ámbito.");
  const community = db.prepare("SELECT * FROM communities WHERE id=?").get(communityId);
  if (!community) throw problem("Comunidad no encontrada.", 404);
  // Un certificado invoca un régimen jurídico concreto; no se emite con el
  // valor por defecto mientras la comunidad no lo haya declarado.
  if (!explicitLegalRegime(community))
    throw problem(
      "Configura el régimen jurídico de la comunidad (LPH o asociación) antes de emitir certificados.",
      409,
    );
  const legal = legalConfigOf(community);
  const debtRule = legal.deudaCopropietarios;
  const propertyRows = new Map(
    db
      .prepare("SELECT * FROM properties WHERE communityId=?")
      .all(communityId)
      .map((row) => [row.id, row]),
  );
  const parcelById = new Map(
    db.prepare("SELECT * FROM parcels").all().map((parcel) => [parcel.id, parcel]),
  );
  // Un inmueble trasladado ya no figura en esta comunidad, pero sus recibos
  // históricos sí. Se incorpora para no perder el porcentaje que la comunidad
  // eligió usar como «último conocido» al certificar su deuda.
  for (const row of db
    .prepare(
      `SELECT * FROM properties p WHERE EXISTS
       (SELECT 1 FROM fee_receipts r WHERE r.propertyId=p.id AND r.communityId=?)`,
    )
    .all(communityId))
    propertyRows.set(row.id, row);

  let owners = [];
  let property = null;
  let propertyHasLocalHistory = false;
  let receipts = [];
  const certificateProperties = new Map();

  if (ownerId) {
    const owner = db.prepare("SELECT * FROM owners WHERE id=?").get(ownerId);
    if (!owner) throw problem("Propietario no encontrado.", 404);
    owners = [owner];
    for (const entry of db
      .prepare(
        `SELECT * FROM properties p WHERE communityId=?
      AND EXISTS (SELECT 1 FROM json_each(p.ownerIds) o WHERE o.value=?) ORDER BY plot, id`,
      )
      .all(communityId, ownerId))
      certificateProperties.set(
        entry.id,
        `${entry.plot || entry.id}${
          (parcelById.get(entry.parcelId)?.cadastralRef || entry.cadastralRef)
            ? ` · ${parcelById.get(entry.parcelId)?.cadastralRef || entry.cadastralRef}`
            : ""
        }`,
      );
    const hasHistory = db
      .prepare(
        `SELECT 1 FROM fee_receipts r WHERE communityId=?
      AND EXISTS (SELECT 1 FROM json_each(r.snapshot, '$.owners') o
        WHERE json_extract(o.value, '$.id')=?) LIMIT 1`,
      )
      .get(communityId, ownerId);
    if (!certificateProperties.size && !hasHistory)
      throw problem(
        "El propietario no tiene inmuebles ni historial de recibos en esta comunidad.",
        404,
      );
    receipts = db
      .prepare(
        `SELECT * FROM fee_receipts r WHERE communityId=? AND EXISTS
         (SELECT 1 FROM json_each(r.snapshot, '$.owners') o WHERE json_extract(o.value, '$.id')=?)
         AND cancelledAt='' ORDER BY period DESC`,
      )
      .all(communityId, ownerId);
  } else if (propertyId) {
    property = db.prepare("SELECT * FROM properties WHERE id=?").get(propertyId);
    // El histórico financiero pertenece a la comunidad donde se emitió. Un
    // inmueble trasladado conserva sus recibos en origen, así que el
    // certificado se resuelve por esos recibos aunque la ficha ya apunte a otra
    // comunidad. Solo un inmueble sin pertenencia ni historial queda fuera.
    propertyHasLocalHistory = !!db
      .prepare("SELECT 1 FROM fee_receipts WHERE communityId=? AND propertyId=? LIMIT 1")
      .get(communityId, propertyId);
    if (!property || (property.communityId !== communityId && !propertyHasLocalHistory))
      throw problem("Inmueble no encontrado.", 404);
    owners = db
      .prepare(
        "SELECT * FROM owners WHERE id IN (SELECT value FROM json_each(?)) ORDER BY name, surname, id",
      )
      .all(property.ownerIds || "[]");
    receipts = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE communityId=? AND propertyId=? AND cancelledAt='' ORDER BY period DESC",
      )
      .all(communityId, propertyId);
  } else {
    throw problem("Debe indicar propietario o inmueble.", 400);
  }

  // Comunidad donde quedó el historial de un inmueble que ya no pertenece a
  // esta: permite que el certificado de destino no presente la deuda como ajena
  // ni oculte dónde consta.
  const originCommunityName =
    property && property.communityId === communityId && !propertyHasLocalHistory
      ? db
          .prepare(
            `SELECT c.name FROM fee_receipts r JOIN communities c ON c.id=r.communityId
             WHERE r.propertyId=? AND r.communityId<>? ORDER BY r.createdAt DESC LIMIT 1`,
          )
          .get(propertyId, communityId)?.name || ""
      : "";

  const payments = ownerId
    ? db
        .prepare(
          "SELECT * FROM fee_payments WHERE communityId=? AND ownerId=? ORDER BY createdAt DESC",
        )
        .all(communityId, ownerId)
    : [];
  const paymentIds = new Set(payments.map((payment) => payment.id));

  const receiptViews = receipts.map((receipt) => receiptView(receipt));
  for (const receipt of receiptViews)
    if (!certificateProperties.has(receipt.propertyId))
      certificateProperties.set(
        receipt.propertyId,
        receipt.snapshot.property || receipt.propertyId,
      );
  const historicalOwners = new Map();
  if (property) {
    const currentOwnerIds = new Set(owners.map((entry) => entry.id));
    for (const receipt of receiptViews)
      for (const entry of receipt.snapshot.owners)
        if (!currentOwnerIds.has(entry.id) && !historicalOwners.has(entry.id))
          historicalOwners.set(entry.id, entry);
  }

  const outstandingReceipts = receiptViews.filter((receipt) => receipt.outstanding > 0);

  const totalOutstanding = outstandingReceipts.reduce(
    (sum, receipt) => sum + receipt.outstanding,
    0,
  );
  // Un cobro puede cubrir varios inmuebles y dejar crédito sin asignar. Solo
  // las asignaciones vigentes a los recibos del ámbito cuentan como pagadas.
  const totalPaid = receiptViews.reduce(
    (sum, receipt) =>
      sum +
      receipt.payments
        .filter((payment) => !payment.reversedAt && (!ownerId || paymentIds.has(payment.id)))
        .reduce((paid, payment) => paid + payment.amount, 0),
    0,
  );
  const totalCredit = payments.reduce((sum, payment) => sum + paymentView(payment).credit, 0);

  // Reparto interno por recibo. No se inventan porcentajes: si el recibo no
  // los guardó, se indica «no consta» salvo que la comunidad haya elegido
  // expresamente usar el último porcentaje conocido.
  const receiptShares = new Map();
  let imputableOutstanding = 0;
  let unattributedOutstanding = 0;
  if (ownerId) {
    for (const receipt of receiptViews) {
      const share = receiptShare(
        receipt,
        ownerId,
        propertyRows.get(receipt.propertyId),
        debtRule.porcentajesHistoricos,
      );
      receiptShares.set(receipt.id, share);
      if (receipt.outstanding > 0) {
        if (share.percentage)
          imputableOutstanding += shareAmount(receipt.outstanding, share.percentage);
        else unattributedOutstanding += receipt.outstanding;
      }
    }
  }
  const individualExpression = !!ownerId && debtRule.expresion === "cuota";
  // «Omitir» manda sobre la casilla de mostrar: no se inventa ni se insinúa un
  // reparto que la comunidad decidió no publicar.
  const showInternalShares =
    debtRule.mostrarRepartoInterno && debtRule.porcentajesHistoricos !== "omitir";
  const money = (cents) => formatMoney(cents, community.currency || "EUR");
  const certificateOutstanding = individualExpression ? imputableOutstanding : totalOutstanding;
  const propertyParcel = property?.parcelId ? parcelById.get(property.parcelId) : null;
  const parcelUnits = propertyParcel
    ? db
        .prepare("SELECT id FROM properties WHERE parcelId=? ORDER BY plot, id")
        .all(property.parcelId)
    : [];
  const parcelUnit =
    propertyParcel && parcelUnits.length > 1
      ? ` · unidad ${parcelUnits.findIndex((row) => row.id === property.id) + 1} de ${parcelUnits.length}`
      : "";

  // Generate PDF using pdfkit
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // Header
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#17413f")
      .text("CERTIFICADO DE DEUDA", { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#444444")
      .text(`Comunidad: ${community.name}`, { align: "center" });
    if (community.address)
      doc.text(`${community.address}, ${community.postalCode} ${community.city}`, {
        align: "center",
      });
    if (community.nif) doc.text(`NIF: ${community.nif}`, { align: "center" });
    doc.moveDown(1);

    // Certificate info
    const issueDate = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    doc.font("Helvetica").fontSize(10).text(`Fecha de emisión: ${issueDate}`);
    doc.text(`Expedido a solicitud de: ${actor?.nombre || "Administración"}`);
    doc.text(
      property
        ? "Ámbito: recibos del inmueble."
        : individualExpression
          ? "Ámbito: cuota individual del propietario en esta comunidad. El reparto es informativo."
          : "Ámbito: deuda del inmueble atribuida al propietario en esta comunidad.",
    );
    doc.moveDown(1);

    // Owner/Property info
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#17413f")
      .text("DATOS DEL TITULAR / INMUEBLE");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    for (const owner of owners) {
      doc.text(`Nombre: ${owner.name} ${owner.surname || ""}`.trim());
      if (owner.dni) doc.text(`DNI/NIF: ${owner.dni}`);
      if (owner.email) doc.text(`Email: ${owner.email}`);
      if (property) {
        const percentage = ownerPercentage(property, owner.id);
        if (percentage) doc.text(`Porcentaje de titularidad actual: ${percentage} %`);
      }
    }
    if (historicalOwners.size) {
      doc.text("Titulares históricos según los recibos:");
      for (const entry of historicalOwners.values()) doc.text(`Nombre (histórico): ${entry.name}`);
    }
    if (property) {
      doc.text(`Inmueble: ${property.plot}`);
      if (propertyParcel)
        doc.text(`Parcela: ${propertyParcel.cadastralRef || "Sin referencia"}${parcelUnit}`);
      else if (property.cadastralRef) doc.text(`Referencia catastral: ${property.cadastralRef}`);
      if (property.staircase) doc.text(`Escalera: ${property.staircase}`);
      if (property.floor) doc.text(`Planta: ${property.floor}`);
      if (property.door) doc.text(`Puerta: ${property.door}`);
      if (property.participationCoef) doc.text(`Coeficiente: ${property.participationCoef}%`);
    } else {
      doc.text("Inmuebles incluidos (actuales e históricos con recibos):");
      for (const label of certificateProperties.values()) doc.text(`Inmueble: ${label}`);
    }
    // El traslado de un inmueble no borra su historial: se declara en qué
    // comunidad se emitieron los recibos para no inducir a error en origen ni
    // en destino.
    const assigned = property ? assignedOwnershipTotal(property) : 0;
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#444444");
    if (property && property.communityId !== communityId)
      doc.text(
        "El inmueble pertenece actualmente a otra comunidad. Este certificado recoge el historial de recibos emitidos en esta comunidad.",
      );
    else if (property && originCommunityName)
      doc.text(
        `Este inmueble no tiene recibos emitidos en esta comunidad. Su historial financiero consta en la comunidad de origen: ${originCommunityName}.`,
      );
    if (property && assigned > 0 && assigned < 100)
      doc.text(
        `Titularidad asignada: ${assigned} %. Queda ${
          Math.round((100 - assigned) * 10000) / 10000
        } % sin asignar; la cuota del inmueble no se redistribuye.`,
      );
    doc.moveDown(1);

    // Outstanding receipts table
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#17413f").text("RECIBOS PENDIENTES DE PAGO");
    doc.moveDown(0.3);

    if (outstandingReceipts.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#000000")
        .text("No hay recibos pendientes de pago.");
    } else {
      const groups = ownerId
        ? [...certificateProperties]
            .map(([id, label]) => ({
              label,
              receipts: outstandingReceipts.filter((receipt) => receipt.propertyId === id),
            }))
            .filter((group) => group.receipts.length)
        : [{ receipts: outstandingReceipts }];
      for (const group of groups) {
        if (ownerId) {
          const groupOutstanding = group.receipts.reduce(
            (sum, receipt) => sum + receipt.outstanding,
            0,
          );
          const known = group.receipts
            .map((receipt) => receiptShares.get(receipt.id))
            .filter((share) => share?.percentage);
          const groupImputable = group.receipts.reduce((sum, receipt) => {
            const share = receiptShares.get(receipt.id);
            return (
              sum + (share?.percentage ? shareAmount(receipt.outstanding, share.percentage) : 0)
            );
          }, 0);
          const percentages = [
            ...new Set(known.map((share) => Number(share.percentage.toFixed(2)))),
          ];
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#000000")
            .text(`Inmueble: ${group.label}`);
          doc
            .font("Helvetica")
            .fontSize(10)
            .text(`Pendiente del inmueble: ${money(groupOutstanding)}`);
          if (showInternalShares) {
            doc.text(
              percentages.length
                ? `Reparto interno del titular: ${
                    percentages.length === 1
                      ? `${percentages[0]} %`
                      : `porcentajes históricos ${percentages.join(" / ")} %`
                  } · ${money(groupImputable)}`
                : "Reparto interno del titular: porcentaje no consta",
            );
            const groupUnattributed = group.receipts.reduce(
              (sum, receipt) =>
                sum + (receiptShares.get(receipt.id)?.percentage ? 0 : receipt.outstanding),
              0,
            );
            if (groupUnattributed > 0 && percentages.length)
              doc.text(`Sin porcentaje acreditado en algún recibo: ${money(groupUnattributed)}`);
          }
          if (known.some((share) => share.source === "actual"))
            doc.text("Incluye porcentaje actual, no acreditado al emitir el recibo.");
          doc.moveDown(0.3);
        } else if (property && showInternalShares) {
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#000000")
            .text("Reparto interno de la titularidad (informativo)");
          doc.font("Helvetica").fontSize(9);
          const holders = [
            ...owners.map((owner) => ({
              id: owner.id,
              name: `${owner.name} ${owner.surname || ""}`.trim(),
            })),
            ...[...historicalOwners.values()].map((entry) => ({ ...entry, historical: true })),
          ];
          for (const holder of holders) {
            const attributed = group.receipts.filter((receipt) =>
              receipt.snapshot.owners.some((entry) => entry.id === holder.id),
            );
            const shares = attributed.map((receipt) => ({
              receipt,
              share: receiptShare(receipt, holder.id, property, debtRule.porcentajesHistoricos),
            }));
            const known = shares.filter(({ share }) => share.percentage);
            const percentages = [
              ...new Set(known.map(({ share }) => Number(share.percentage.toFixed(2)))),
            ];
            const amount = known.reduce(
              (sum, { receipt, share }) => sum + shareAmount(receipt.outstanding, share.percentage),
              0,
            );
            const label = `${holder.name}${holder.historical ? " (histórico)" : ""}`;
            doc.text(
              `${label}: ${
                !attributed.length
                  ? "sin recibos pendientes a su nombre"
                  : percentages.length
                    ? `${percentages.length === 1 ? `${percentages[0]} %` : `porcentajes históricos ${percentages.join(" / ")} %`} · ${money(amount)}`
                    : "porcentaje no consta"
              }`,
            );
            const unknown = shares
              .filter(({ share }) => !share.percentage)
              .reduce((sum, { receipt }) => sum + receipt.outstanding, 0);
            if (unknown && known.length)
              doc.text(`Sin porcentaje acreditado en algún recibo: ${money(unknown)}`);
            if (known.some(({ share }) => share.source === "actual"))
              doc.text("Incluye porcentaje actual, no acreditado al emitir el recibo.");
          }
          doc.text(
            "El reparto interno no limita la responsabilidad del titular frente a la comunidad.",
          );
          doc.moveDown(0.5);
        }
        // Table header
        const colWidths = { period: 80, concept: 150, dueDate: 80, amount: 70, outstanding: 70 };
        const startX = 50;
        let y = doc.y;

        doc.font("Helvetica-Bold").fontSize(8);
        doc.rect(startX, y, 450, 20).fill("#17413f");
        doc.fillColor("white");
        doc.text("Periodo", startX + 5, y + 5, { width: colWidths.period - 10 });
        doc.text("Concepto", startX + colWidths.period + 5, y + 5, {
          width: colWidths.concept - 10,
        });
        doc.text("Vencimiento", startX + colWidths.period + colWidths.concept + 5, y + 5, {
          width: colWidths.dueDate - 10,
        });
        doc.text(
          "Importe",
          startX + colWidths.period + colWidths.concept + colWidths.dueDate + 5,
          y + 5,
          { width: colWidths.amount - 10 },
        );
        doc.text(
          individualExpression ? "Pendiente / cuota" : "Pendiente",
          startX + colWidths.period + colWidths.concept + colWidths.dueDate + colWidths.amount + 5,
          y + 5,
          { width: colWidths.outstanding - 10 },
        );
        y += 20;

        doc.font("Helvetica").fontSize(8).fillColor("#000000");
        for (const receipt of group.receipts) {
          const view = receipt;
          const snapshot = receipt.snapshot;
          const concept = receiptConcept(receipt, snapshot);
          const kind = receipt.serviceBillId
            ? "Servicio"
            : receipt.assessmentId
              ? "Derrama"
              : "Cuota";

          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          const rowHeight = 18;
          if (
            Math.floor(outstandingReceipts.indexOf(receipt) / 2) * 2 ===
            outstandingReceipts.indexOf(receipt)
          ) {
            doc.rect(startX, y, 450, rowHeight).fill("#f5f5f5");
          }
          doc.fillColor("#000000");
          doc.text(receipt.period, startX + 5, y + 3, { width: colWidths.period - 10 });
          doc.text(`${kind}: ${concept}`, startX + colWidths.period + 5, y + 3, {
            width: colWidths.concept - 10,
          });
          doc.text(receipt.dueDate, startX + colWidths.period + colWidths.concept + 5, y + 3, {
            width: colWidths.dueDate - 10,
          });
          doc.text(
            money(view.amount),
            startX + colWidths.period + colWidths.concept + colWidths.dueDate + 5,
            y + 3,
            { width: colWidths.amount - 10, align: "right" },
          );
          const share = ownerId ? receiptShares.get(receipt.id) : null;
          const pendingLabel = individualExpression
            ? share?.percentage
              ? money(shareAmount(view.outstanding, share.percentage))
              : "No consta"
            : money(view.outstanding);
          doc.text(
            pendingLabel,
            startX +
              colWidths.period +
              colWidths.concept +
              colWidths.dueDate +
              colWidths.amount +
              5,
            y + 3,
            { width: colWidths.outstanding - 10, align: "right" },
          );
          y += rowHeight;
        }
        doc.x = startX;
        doc.y = y + 10;
      }
    }

    doc.moveDown(1);

    // Totals
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#17413f").text("RESUMEN ECONÓMICO");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    if (individualExpression) {
      doc.text(`Total pendiente imputable: ${money(certificateOutstanding)}`);
      doc.text(`Deuda del inmueble (referencia): ${money(totalOutstanding)}`);
      if (unattributedOutstanding > 0)
        doc.text(
          `Pendiente sin porcentaje acreditado (deuda del inmueble): ${money(
            unattributedOutstanding,
          )}`,
        );
      doc.text(`Total pagado por el titular (histórico): ${money(totalPaid)}`);
    } else {
      doc.text(`Total pendiente: ${money(totalOutstanding)}`);
      doc.text(`Total pagado (histórico): ${money(totalPaid)}`);
    }
    if (ownerId) doc.text(`Saldo a favor sin asignar: ${money(totalCredit)}`);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        "El total pagado corresponde a cobros aplicados a los recibos de este ámbito, excluidos los anulados. " +
          (property
            ? "El saldo a favor sin asignar pertenece al pagador y no se atribuye al inmueble."
            : "Los cobros del titular reflejan su aportación real, sin aplicar de nuevo su porcentaje de titularidad. El saldo a favor sin asignar se muestra por separado."),
      );
    doc.moveDown(1);

    // Legal footer
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666");
    doc.text(
      legal.regimen === "asociacion"
        ? "Régimen: asociación. La obligación de pago se determina por los estatutos y los acuerdos válidos de la asociación. Este certificado no sustituye la liquidación social ni la revisión de la documentación societaria."
        : "Régimen: comunidad de propietarios (LPH). La deuda corresponde al inmueble y su titular responde frente a la comunidad conforme al artículo 9.1.e de la LPH. El reparto interno entre cotitulares (artículo 393 del Código Civil) es informativo y no altera esa responsabilidad, salvo pacto o resolución judicial.",
      { align: "justify" },
    );
    doc.moveDown(0.5);
    if (individualExpression)
      doc.text(
        "La cuota individual se calcula aplicando el porcentaje de titularidad acreditado al emitir el recibo. Si el porcentaje no consta, no se imputa un importe individual y se muestra la deuda del inmueble. Los porcentajes marcados como «actuales» no acreditan la situación histórica.",
        { align: "justify" },
      );
    doc.moveDown(0.5);
    doc.text(
      "Este certificado tiene carácter informativo y refleja la situación contable a la fecha de emisión. " +
        "No constituye título ejecutivo ni documento de cobro. Para cualquier discrepancia, diríjase a la administración de la comunidad.",
      { align: "justify" },
    );
    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`Documento generado automáticamente el ${new Date().toISOString().split("T")[0]}`, {
        align: "center",
      });

    doc.end();
  });
}
export function recordPayment(communityId, input, actor) {
  if (!validDate(input.paidOn) || input.paidOn > today())
    throw problem("La fecha del cobro debe ser válida y no futura.");
  if (!["transfer", "deposit", "direct_debit"].includes(input.method))
    throw problem("Forma de pago no válida.");
  if (typeof input.reference !== "string" || input.reference.length > 120)
    throw problem("Referencia no válida (máximo 120 caracteres).");
  if (typeof input.requestId !== "string" || !/^[\w-]{16,80}$/.test(input.requestId))
    throw problem("Falta el identificador único del cobro.");
  const amount = money(input.amount);
  if (
    !listProperties().some(
      (p) => p.communityId === communityId && p.ownerIds.includes(input.ownerId),
    ) &&
    !db
      .prepare("SELECT snapshot FROM fee_receipts WHERE communityId=?")
      .all(communityId)
      .some((r) => JSON.parse(r.snapshot).owners.some((o) => o.id === input.ownerId))
  )
    throw problem("El pagador no tiene relación con esta comunidad.");
  return transaction(() => {
    if (db.prepare("SELECT 1 FROM fee_payments WHERE requestId=?").get(input.requestId))
      throw problem("Este cobro ya fue registrado. Actualiza la vista antes de repetirlo.", 409);
    const duplicate = db
      .prepare(
        `SELECT id FROM fee_payments WHERE communityId=? AND ownerId=? AND amount=? AND paidOn=? AND reference=? AND reversedAt=''`,
      )
      .get(communityId, input.ownerId, amount, input.paidOn, input.reference.trim());
    if (duplicate && input.confirmDuplicate !== true)
      throw problem(
        "Posible cobro duplicado por pagador, importe, fecha y referencia. Revísalo y confirma expresamente si es otro cobro.",
        409,
      );
    const row = {
      id: crypto.randomUUID(),
      communityId,
      ownerId: input.ownerId,
      amount,
      paidOn: input.paidOn,
      method: input.method,
      reference: input.reference.trim(),
      requestId: input.requestId,
      createdAt: now(),
      actorId: actor.id,
    };
    db.prepare(
      "INSERT INTO fee_payments(id,communityId,ownerId,amount,paidOn,method,reference,requestId,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(...Object.values(row));
    allocate(row, input.receiptIds ?? []);
    audit(actor, "payment", row.id, {
      communityId,
      amount,
      ownerId: row.ownerId,
    });
    return paymentView(row);
  });
}
export function allocateCredit(id, input, actor) {
  return transaction(() => {
    const payment = db.prepare("SELECT * FROM fee_payments WHERE id=?").get(id);
    if (!payment || payment.reversedAt) throw problem("El cobro no existe o está devuelto.");
    allocate(payment, input.receiptIds);
    audit(actor, "credit", id, { communityId: payment.communityId });
    return paymentView(payment);
  });
}
export function reason(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw problem("Indica el motivo (máximo 500 caracteres).");
  return value.trim();
}

function rectificationConflict(row) {
  if (!row.cancelledAt) return "Solo se puede rectificar un recibo anulado.";
  if (
    db
      .prepare("SELECT 1 FROM fee_receipts WHERE rectifiesReceiptId=? AND rectifiesReceiptId<>''")
      .get(row.id)
  )
    return "Este recibo ya tiene una rectificación. Consulta su recibo sucesor.";
  if (row.assessmentId) {
    const parent = db.prepare("SELECT * FROM fee_assessments WHERE id=?").get(row.assessmentId);
    const installment =
      parent &&
      JSON.parse(parent.data).installments.find((item) => item.number === row.installment);
    if (!parent || parent.cancelledAt || !installment || installment.cancelledAt)
      return "La derrama o el plazo están anulados. No se pueden rectificar sus recibos.";
    if (
      db
        .prepare(
          "SELECT 1 FROM fee_receipts WHERE assessmentId=? AND installment=? AND propertyId=? AND cancelledAt=''",
        )
        .get(row.assessmentId, row.installment, row.propertyId)
    )
      return "Ya existe un recibo activo para ese inmueble y plazo.";
  } else if (row.serviceBillId) {
    const parent = db.prepare("SELECT * FROM service_bills WHERE id=?").get(row.serviceBillId);
    if (!parent || parent.cancelledAt)
      return "El servicio está anulado. No se pueden rectificar sus recibos.";
    if (
      db
        .prepare(
          "SELECT 1 FROM fee_receipts WHERE serviceBillId=? AND propertyId=? AND cancelledAt=''",
        )
        .get(row.serviceBillId, row.propertyId)
    )
      return "Ya existe un recibo activo para ese inmueble y servicio.";
  } else if (
    db
      .prepare(
        `SELECT 1 FROM fee_receipts WHERE communityId=? AND propertyId=?
      AND assessmentId='' AND serviceBillId='' AND cancelledAt='' AND period<=? AND periodEnd>=?`,
      )
      .get(row.communityId, row.propertyId, row.periodEnd.slice(0, 7), `${row.period}-01`)
  )
    return "El inmueble ya tiene una cuota activa que se solapa con este periodo.";
  return "";
}

export function canRectifyReceipt(row) {
  return !!row.cancelledAt && !rectificationConflict(row);
}

export function previewReceiptRectification(id, input, actor) {
  const row = receiptById(id);
  if (!canManage(actor, row.communityId))
    throw problem("No tienes permiso para rectificar recibos de esta comunidad.", 403);
  feeCommunity(row.communityId);
  const conflict = rectificationConflict(row);
  if (conflict) throw problem(conflict, 409);
  const amount = input.amount === undefined ? row.amount : money(input.amount);
  if ((row.assessmentId || row.serviceBillId) && amount !== row.amount)
    throw problem(
      "El importe del recibo está fijado por el reparto aprobado. La rectificación debe conservarlo.",
    );
  const dueDate = input.dueDate === undefined ? row.dueDate : input.dueDate;
  if (!validDate(dueDate)) throw problem("La fecha de vencimiento no es válida.");
  const result = {
    originalId: row.id,
    communityId: row.communityId,
    propertyId: row.propertyId,
    period: row.period,
    dueDate,
    amount,
    originalAmount: row.amount,
    snapshot: JSON.parse(row.snapshot),
    reason: reason(input.reason),
  };
  return {
    ...result,
    token: crypto.createHash("sha256").update(JSON.stringify({ row, result })).digest("hex"),
  };
}

export function rectifyReceipt(id, input, actor) {
  return transaction(() => {
    const batch = previewReceiptRectification(id, input, actor);
    if (input.token !== batch.token)
      throw problem("Los datos cambiaron. Revisa de nuevo la rectificación antes de emitir.", 409);
    const original = receiptById(id),
      replacementId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO fee_receipts
      (id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId,assessmentId,installment,serviceBillId,rectifiesReceiptId,rectificationReason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      replacementId,
      original.communityId,
      original.propertyId,
      original.planId,
      original.period,
      original.periodEnd,
      batch.dueDate,
      batch.amount,
      JSON.stringify({ ...JSON.parse(original.snapshot), currency: receiptCurrency(original) }),
      now(),
      actor.id,
      original.assessmentId,
      original.installment,
      original.serviceBillId,
      original.id,
      batch.reason,
    );
    notify(
      receiptById(replacementId),
      "issued",
      replacementId,
      "Recibo rectificado",
      `Se emitió una rectificación de ${receiptConcept(original)} de ${batch.snapshot.property}: ${formatMoney(batch.amount, receiptCurrency(original))}. Motivo: ${batch.reason}`,
    );
    audit(actor, "rectify", replacementId, {
      communityId: original.communityId,
      originalId: original.id,
      amount: batch.amount,
      originalAmount: original.amount,
      dueDate: batch.dueDate,
      reason: batch.reason,
    });
    return receiptView(receiptById(replacementId));
  });
}
export function reversePayment(id, input, actor) {
  const note = reason(input.reason);
  return transaction(() => {
    const p = db.prepare("SELECT * FROM fee_payments WHERE id=?").get(id);
    if (!p) throw problem("Cobro no encontrado.", 404);
    if (p.reversedAt) throw problem("El cobro ya fue devuelto.", 409);
    db.prepare("UPDATE fee_payments SET reversedAt=?,reversalReason=? WHERE id=?").run(
      now(),
      note,
      id,
    );
    for (const a of paymentView(p).allocations) {
      const r = receiptById(a.receiptId);
      notify(
        r,
        "returned",
        id,
        "Devolución de cobro",
        `Se devolvió un cobro de ${formatMoney(a.amount, receiptCurrency(r))} aplicado sobre ${receiptArticle(r)} ${lowerFirst(receiptConcept(r))}. El saldo vuelve a estar pendiente.`,
      );
    }
    audit(actor, "return", id, { communityId: p.communityId, reason: note });
  });
}
export function cancelReceipt(id, input, actor) {
  const note = reason(input.reason);
  return transaction(() => {
    const row = receiptById(id),
      view = receiptView(row);
    if (row.cancelledAt) throw problem("El recibo ya está anulado.", 409);
    if (view.paid > 0)
      throw problem(
        "Primero revierte los cobros aplicados. No se puede anular un recibo con pagos.",
        409,
      );
    db.prepare("UPDATE fee_receipts SET cancelledAt=?,cancellationReason=? WHERE id=?").run(
      now(),
      note,
      id,
    );
    notify(
      receiptById(id),
      "cancelled",
      id,
      "Recibo anulado",
      `Se anuló ${receiptArticle(row)} ${lowerFirst(receiptConcept(row))}. Motivo: ${note}`,
    );
    audit(actor, "cancel", id, { communityId: row.communityId, reason: note });
  });
}
export function notify(row, kind, eventKey, title, message, targetOwnerId = "") {
  const options = reminderSettingsForReceipt(row);
  for (const owner of JSON.parse(row.snapshot).owners) {
    // Retained snapshots can name profiles removed through the cascade wizard.
    if (!db.prepare("SELECT 1 FROM owners WHERE id=?").get(owner.id)) continue;
    if (targetOwnerId && owner.id !== targetOwnerId) continue;
    const id = crypto.randomUUID(),
      createdAt = now();
    const inserted = db
      .prepare("INSERT OR IGNORE INTO fee_events VALUES(?,?,?,?,?,?,?,?)")
      .run(id, row.id, owner.id, kind, eventKey, title, message, createdAt).changes;
    if (!inserted) continue;
    if (options.internal)
      db.prepare(
        `INSERT INTO owner_notifications(id,ownerId,title,type,message,date,timestamp,read,feeReceiptId) VALUES(?,?,?,?,?,?,?,?,?)`,
      ).run(
        crypto.randomUUID(),
        owner.id,
        title,
        kind === "returned" || kind === "overdue" ? "warning" : "info",
        message,
        today(),
        Date.now(),
        0,
        row.id,
      );
    if (options.email)
      db.prepare("INSERT INTO fee_mail(eventId,updatedAt) VALUES(?,?)").run(id, createdAt);
  }
}
export function adminNotice(row, ownerId, subject) {
  const snapshot = JSON.parse(row.snapshot),
    owner = snapshot.owners.find((o) => o.id === ownerId);
  db.prepare(
    `INSERT INTO admin_emails(id,ownerId,ownerName,ownerDni,ownerCommunity,ownerPlot,subject,date,timestamp,read,docs,feeReceiptId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    crypto.randomUUID(),
    ownerId,
    owner?.name || "",
    "",
    snapshot.community,
    snapshot.property,
    subject,
    today(),
    Date.now(),
    0,
    "[]",
    row.id,
  );
}
function purgeReceiptDependencies(id) {
  const receipt = receiptById(id);
  if (receipt.assessmentId)
    markAssessmentIssued(receipt.assessmentId, receipt.installment, receipt.createdAt);
  for (const proof of db.prepare("SELECT diskName FROM fee_proofs WHERE receiptId=?").all(id))
    queueFeeProofCleanup(proof.diskName);
  db.prepare("DELETE FROM fee_allocations WHERE receiptId=?").run(id);
  db.prepare("DELETE FROM fee_proofs WHERE receiptId=?").run(id);
  db.prepare("DELETE FROM owner_notifications WHERE feeReceiptId=?").run(id);
  db.prepare("DELETE FROM admin_emails WHERE feeReceiptId=?").run(id);
  db.prepare(
    "DELETE FROM fee_mail WHERE eventId IN (SELECT id FROM fee_events WHERE receiptId=?)",
  ).run(id);
  db.prepare("DELETE FROM fee_events WHERE receiptId=?").run(id);
  db.prepare("DELETE FROM fee_receipts WHERE id=?").run(id);
}

export function purgeReceipt(id, actor) {
  transaction(() => {
    const row = receiptById(id);
    if (!row.cancelledAt) throw problem("Solo se pueden purgar recibos anulados.", 409);
    validateReceiptDeletion([id], { requireCancelled: true });
    purgeReceiptDependencies(id);
    audit(actor, "purge", id, { communityId: row.communityId });
  });
  return processFeeProofCleanup();
}

export function purgeAssessment(id, actor) {
  transaction(() => {
    const row = assessmentById(id);
    if (!row.cancelledAt) throw problem("Solo se pueden purgar derramas anuladas.", 409);
    // Get all receipts for this assessment
    const receipts = db.prepare("SELECT id FROM fee_receipts WHERE assessmentId=?").all(id);
    validateReceiptDeletion(
      receipts.map((receipt) => receipt.id),
      { requireCancelled: true },
    );
    for (const receipt of receipts) purgeReceiptDependencies(receipt.id);
    // Delete the assessment itself
    db.prepare("DELETE FROM fee_assessments WHERE id=?").run(id);
    audit(actor, "purge_assessment", id, { communityId: row.communityId });
  });
  return processFeeProofCleanup();
}

export function materializeFeeReminders(date = today()) {
  return transaction(() => {
    for (const row of db
      .prepare(
        `SELECT * FROM fee_receipts WHERE cancelledAt='' AND dueDate<=date(?, '+60 days')
        AND EXISTS (SELECT 1 FROM communities c WHERE c.id=fee_receipts.communityId)
        AND EXISTS (SELECT 1 FROM properties p WHERE p.id=fee_receipts.propertyId)`,
      )
      .all(date)) {
      const view = receiptView(row, date);
      if (view.outstanding <= 0) continue;
      const settings = reminderSettingsForReceipt(row);
      const days = Math.round((Date.parse(date) - Date.parse(row.dueDate)) / 86400000);
      const iban = view.snapshot.communityIban
        ? ` IBAN para transferencia: ${view.snapshot.communityIban}.`
        : "";
      const concept = receiptConcept(row, view.snapshot),
        kind = row.serviceBillId ? "servicio" : row.assessmentId ? "derrama" : "cuota",
        kindArticle = `${kind === "servicio" ? "del" : "de la"} ${kind}`,
        currency = receiptCurrency(row);
      if (days <= 0 && days >= -settings.beforeDays && settings.beforeDays > 0)
        notify(
          row,
          "due",
          row.dueDate,
          `Próximo vencimiento ${kindArticle}`,
          `${concept} de ${view.snapshot.property} vence el ${row.dueDate}. Pendiente: ${formatMoney(view.outstanding, currency)}.${iban}`,
        );
      if (days >= settings.afterDays && days > 0) {
        const repeat = settings.repeatDays
          ? Math.floor((days - settings.afterDays) / settings.repeatDays)
          : 0;
        notify(
          row,
          "overdue",
          `${row.dueDate}:${repeat}`,
          kind === "derrama"
            ? "Derrama vencida pendiente"
            : kind === "servicio"
              ? "Servicio pendiente de pago"
              : "Cuota vencida pendiente",
          `${concept} de ${view.snapshot.property} tiene ${formatMoney(view.outstanding, currency)} pendientes desde ${row.dueDate}.${iban}`,
        );
      }
    }
  });
}
