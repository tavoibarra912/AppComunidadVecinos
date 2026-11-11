import crypto from "node:crypto";
import { db, getSettings, listProperties, listOwners } from "./db.js";
import { allowed, policyData } from "./security.js";
import { recordAudit } from "./audit.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS fee_plans (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, effectiveFrom TEXT NOT NULL,
    data TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    UNIQUE(communityId,effectiveFrom)
  );
  CREATE TABLE IF NOT EXISTS fee_receipts (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, propertyId TEXT NOT NULL,
    planId TEXT NOT NULL, period TEXT NOT NULL, periodEnd TEXT NOT NULL,
    dueDate TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
    snapshot TEXT NOT NULL, createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS fee_receipts_community ON fee_receipts(communityId,period);
  CREATE TABLE IF NOT EXISTS fee_payments (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, ownerId TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>0), paidOn TEXT NOT NULL, method TEXT NOT NULL,
    reference TEXT NOT NULL, requestId TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL, reversedAt TEXT NOT NULL DEFAULT '',
    reversalReason TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS fee_allocations (
    paymentId TEXT NOT NULL, receiptId TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
    PRIMARY KEY(paymentId,receiptId)
  );
  CREATE TABLE IF NOT EXISTS fee_proofs (
    id TEXT PRIMARY KEY, receiptId TEXT NOT NULL, ownerId TEXT NOT NULL,
    fileName TEXT NOT NULL, diskName TEXT NOT NULL, mime TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL, reviewedAt TEXT NOT NULL DEFAULT '', actorId TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fee_events (
    id TEXT PRIMARY KEY, receiptId TEXT NOT NULL, ownerId TEXT NOT NULL,
    kind TEXT NOT NULL, eventKey TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    createdAt TEXT NOT NULL, UNIQUE(receiptId,ownerId,kind,eventKey)
  );
  CREATE TABLE IF NOT EXISTS fee_mail (
    eventId TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fee_allocations_receipt ON fee_allocations(receiptId);
  CREATE INDEX IF NOT EXISTS fee_proofs_receipt ON fee_proofs(receiptId);
  CREATE INDEX IF NOT EXISTS fee_payments_owner ON fee_payments(communityId,ownerId);
  CREATE TABLE IF NOT EXISTS fee_assessments (
    id TEXT PRIMARY KEY, communityId TEXT NOT NULL, name TEXT NOT NULL,
    totalAmount INTEGER NOT NULL CHECK(totalAmount>0), data TEXT NOT NULL,
    createdAt TEXT NOT NULL, actorId TEXT NOT NULL,
    cancelledAt TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS fee_assessments_community ON fee_assessments(communityId,createdAt);
`);
for (const table of ["owner_notifications", "admin_emails"])
  if (
    !db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === "feeReceiptId")
  )
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN feeReceiptId TEXT NOT NULL DEFAULT ''`,
    );
for (const [name, ddl] of [
  ["assessmentId", "TEXT NOT NULL DEFAULT ''"],
  ["installment", "INTEGER NOT NULL DEFAULT 0"],
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
if (
  !db
    .prepare("SELECT 1 FROM schema_migrations WHERE id='extraordinary-fees-v1'")
    .get()
) {
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
    db.prepare(
      "INSERT INTO schema_migrations(id) VALUES('extraordinary-fees-v1')",
    ).run();
  });
} else {
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_period ON fee_receipts(communityId,propertyId,period) WHERE cancelledAt='' AND assessmentId=''",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_assessment ON fee_receipts(communityId,propertyId,assessmentId,installment) WHERE cancelledAt='' AND assessmentId<>''",
  );
}
if (
  !db
    .prepare("SELECT 1 FROM schema_migrations WHERE id='ordinary-fees-v1'")
    .get()
) {
  transaction(() => {
    for (const row of db.prepare("SELECT * FROM roles").all()) {
      const additions = [
        "administrator",
        "community_admin",
        "super_admin",
      ].includes(row.nombre)
        ? ["fee:read", "fee:manage"]
        : row.nombre === "user"
          ? ["fee:read"]
          : [];
      const permissions = [
        ...new Set([...JSON.parse(row.permisos), ...additions]),
      ];
      db.prepare("UPDATE roles SET permisos=? WHERE id=?").run(
        JSON.stringify(permissions),
        row.id,
      );
    }
    db.prepare(
      "INSERT INTO schema_migrations(id) VALUES('ordinary-fees-v1')",
    ).run();
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
    throw problem(
      `${label} debe tener como máximo dos decimales y ser positivo.`,
    );
  const [whole, decimals = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1))
    throw problem(`${label} debe ser positivo.`);
  return cents;
}
function integer(value, min, max, label) {
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
      s.feeEmailBody ||
      "{{mensaje}}\nConsultá el tab Financiero de tu ficha de propietario.",
  };
}
export function reminderSettings(plan) {
  const defaults = feeDefaults(),
    saved = plan?.reminders || {};
  const bounded = (value, fallback, max) =>
    Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
  return {
    beforeDays: bounded(saved.beforeDays, defaults.beforeDays, 60),
    afterDays: bounded(saved.afterDays, defaults.afterDays, 365),
    repeatDays: bounded(saved.repeatDays, defaults.repeatDays, 365),
    internal:
      typeof saved.internal === "boolean" ? saved.internal : defaults.internal,
    email: typeof saved.email === "boolean" ? saved.email : defaults.email,
  };
}
export function validateFeeDefaults(data) {
  for (const [key, max] of [
    ["feeBeforeDays", 60],
    ["feeAfterDays", 365],
    ["feeRepeatDays", 365],
  ])
    if (data[key] !== undefined) integer(data[key], 0, max, key);
  for (const key of ["feeInternal", "feeEmail"])
    if (data[key] !== undefined && typeof data[key] !== "boolean")
      throw problem("Los canales de cuotas deben ser booleanos.");
  for (const [key, max] of [
    ["feeEmailSubject", 200],
    ["feeEmailBody", 3000],
  ])
    if (
      data[key] !== undefined &&
      (typeof data[key] !== "string" ||
        !data[key].trim() ||
        data[key].length > max)
    )
      throw problem(
        `La plantilla ${key} está vacía o supera ${max} caracteres.`,
      );
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
  if (
    allowed(user, "fee:read", receipt.communityId, policy) &&
    user.rol !== "user"
  ) {
    // Only staff permissions grant a community-wide financial view.
    const role = policy.roles.find(
      (r) => r.nombre === user.rol || r.id === user.rol,
    );
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
  return row.assessmentId
    ? `Derrama "${snapshot.assessmentName}" · plazo ${snapshot.installment}/${snapshot.installmentCount}`
    : `Cuota ${row.period}`;
}
function lowerFirst(text) {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}
export function reminderSettingsForReceipt(row) {
  if (row.assessmentId) {
    const assessment = db
      .prepare("SELECT data FROM fee_assessments WHERE id=?")
      .get(row.assessmentId);
    if (assessment)
      return reminderSettings({
        reminders: JSON.parse(assessment.data).reminders || {},
      });
  }
  return reminderSettings(
    plans(row.communityId).find((plan) => plan.id === row.planId),
  );
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
    snapshot,
    kind: row.assessmentId ? "assessment" : "ordinary",
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
  const communityRows = db
    .prepare("SELECT id,name,currency FROM communities")
    .all();
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
  const soon = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
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
    const pendingProofs = view.proofs.filter(
      (proof) => proof.status === "pending",
    ).length;
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
      if (!oldestOverdue || row.dueDate < oldestOverdue.dueDate)
        oldestOverdue = item;
    } else {
      if (row.dueDate <= soon) {
        totals.dueSoon += view.outstanding;
        bucket.totals.dueSoon += view.outstanding;
      }
      if (!nextDue || row.dueDate < nextDue.dueDate) nextDue = item;
    }
    if (
      row.dueDate >= date &&
      (!bucket.nextDue || row.dueDate < bucket.nextDue.dueDate)
    )
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
        (allowed(user, "fee:read", "", policy) &&
          ownOwnerIds.has(payment.ownerId)),
    )
    .map(paymentView);
  totals.credit = payments.reduce((sum, payment) => sum + payment.credit, 0);

  return {
    accessible: true,
    personal:
      policy.roles.find(
        (role) => role.id === user.rol || role.nombre === user.rol,
      )?.nombre === "user",
    communityId,
    totals,
    counts,
    collectionRate: totals.issued
      ? Math.round((totals.paid / totals.issued) * 100)
      : 0,
    nextDue,
    oldestOverdue,
    byCommunity: [...byCommunity.values()],
  };
}

export function plans(communityId) {
  return db
    .prepare(
      "SELECT * FROM fee_plans WHERE communityId=? ORDER BY effectiveFrom DESC",
    )
    .all(communityId)
    .map((r) => ({ ...r, ...JSON.parse(r.data), data: undefined }));
}
function feeCommunity(communityId) {
  const community = db
    .prepare("SELECT * FROM communities WHERE id=?")
    .get(communityId);
  if (!community) throw problem("Comunidad no encontrada.", 404);
  if (
    String(community.currency || "EUR")
      .trim()
      .toUpperCase() !== "EUR"
  )
    throw problem(
      "Las cuotas de comunidad se gestionan en euros. Revisá la moneda de la comunidad.",
    );
  return community;
}
export function savePlan(communityId, input, actor) {
  feeCommunity(communityId);
  const annualAmount = money(input.annualAmount, "El importe anual");
  if (![1, 3, 6, 12].includes(input.months))
    throw problem("Periodicidad no válida.");
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
    throw problem("Indicá el acuerdo de Junta (máximo 300 caracteres).");
  if (!["coefficient", "manual"].includes(input.mode))
    throw problem("Criterio de reparto no válido.");
  const defaults = feeDefaults(),
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
  const manual = {};
  if (input.mode === "manual") {
    const properties = listProperties().filter(
      (p) => p.communityId === communityId,
    );
    for (const p of properties)
      manual[p.id] = money(input.manual?.[p.id], `Cuota anual de ${p.plot}`);
    if (
      !properties.length ||
      Object.values(manual).reduce((a, b) => a + b, 0) !== annualAmount
    )
      throw problem(
        "La suma de importes anuales por inmueble debe coincidir con el total anual.",
      );
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
    const same = db
      .prepare(
        "SELECT * FROM fee_plans WHERE communityId=? AND effectiveFrom=?",
      )
      .get(communityId, input.effectiveFrom);
    if (same)
      throw problem(
        "Ya existe un acuerdo con esa fecha. Creá una nueva versión con otra fecha de aplicación.",
        409,
      );
    const conflict = db
      .prepare(
        "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND periodEnd>=?",
      )
      .get(communityId, input.effectiveFrom);
    if (conflict)
      throw problem(
        "La nueva configuración se solapa con recibos emitidos. Elegí una fecha posterior al último periodo emitido.",
        409,
      );
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO fee_plans VALUES(?,?,?,?,?,?)").run(
      id,
      communityId,
      input.effectiveFrom,
      JSON.stringify(data),
      now(),
      actor.id,
    );
    audit(actor, "plan", id, {
      communityId,
      effectiveFrom: input.effectiveFrom,
      annualAmount,
    });
    return { id, ...data };
  });
}
function monthIndex(value) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
function monthString(index) {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
function distribute(total, entries) {
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
    throw problem("Indicá un periodo válido (AAAA-MM).");
  const plan = plans(communityId).find(
    (p) => p.effectiveFrom <= `${period}-01`,
  );
  if (!plan)
    throw problem("Guardá primero una configuración aplicable al periodo.");
  const offset = monthIndex(period) - monthIndex(plan.effectiveFrom);
  if (offset % plan.months)
    throw problem(
      "El mes elegido no inicia un periodo de la periodicidad configurada.",
    );
  const periodEnd = new Date(
    Date.UTC(
      Number(period.slice(0, 4)),
      Number(period.slice(5, 7)) - 1 + plan.months,
      0,
    ),
  )
    .toISOString()
    .slice(0, 10);
  if (
    plans(communityId).some(
      (p) => p.effectiveFrom > `${period}-01` && p.effectiveFrom <= periodEnd,
    )
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
    const linked = property.ownerIds
      .map((id) => owners.find((o) => o.id === id))
      .filter(Boolean);
    if (!linked.length || linked.length !== property.ownerIds.length)
      throw problem(`${property.plot}: falta identificar a sus titulares.`);
    let weight;
    if (plan.mode === "coefficient") {
      const text = String(property.participationCoef).replace(",", ".");
      if (
        !/^\d{1,3}(\.\d{1,4})?$/.test(text) ||
        Number(text) <= 0 ||
        Number(text) > 100
      )
        throw problem(
          `${property.plot}: coeficiente no válido (hasta cuatro decimales).`,
        );
      weight = Math.round(Number(text) * 10000);
    } else {
      weight = plan.manual[property.id];
      if (!Number.isSafeInteger(weight) || weight <= 0)
        throw problem(
          `${property.plot}: falta su importe anual aprobado. Creá una nueva configuración.`,
        );
    }
    entries.push({
      property,
      weight,
      owners: linked.map((o) => ({
        id: o.id,
        name: `${o.name} ${o.surname}`.trim(),
      })),
    });
  }
  const weightSum = entries.reduce((s, e) => s + e.weight, 0);
  if (plan.mode === "coefficient" && weightSum !== 1000000)
    throw problem(
      `Los coeficientes suman ${(weightSum / 10000).toFixed(4)} %. Deben sumar 100 %. Revisá los inmuebles.`,
    );
  if (plan.mode === "manual" && weightSum !== plan.annualAmount)
    throw problem(
      "El censo cambió y los importes no cuadran con el total aprobado. Revisá la configuración.",
    );
  const cycle = offset % 12;
  const total =
    Math.round((plan.annualAmount * (cycle + plan.months)) / 12) -
    Math.round((plan.annualAmount * cycle) / 12);
  const community = db
    .prepare("SELECT name, iban FROM communities WHERE id=?")
    .get(communityId);
  // Cumulative rounding makes both each batch and the twelve-month owner totals
  // match the approved annual distribution, including manual amounts.
  const before = new Map(
    distribute(Math.round((plan.annualAmount * cycle) / 12), entries).map(
      (e) => [e.property.id, e.amount],
    ),
  );
  const rows = distribute(
    Math.round((plan.annualAmount * (cycle + plan.months)) / 12),
    entries,
  ).map((e) => {
    e.amount -= before.get(e.property.id);
    if (e.amount <= 0)
      throw problem(
        `${e.property.plot}: el recibo resultaría de cero euros. Revisá los importes.`,
      );
    const previous = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE communityId=? AND propertyId=? AND cancelledAt='' AND assessmentId='' ORDER BY period DESC LIMIT 1",
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
        warnings.push(
          `${e.property.plot}: aumenta el importe por mes respecto al último recibo.`,
        );
    }
    return {
      propertyId: e.property.id,
      amount: e.amount,
      snapshot: {
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
        "SELECT 1 FROM fee_receipts WHERE communityId=? AND cancelledAt='' AND assessmentId='' AND period<=? AND periodEnd>=?",
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
    token: crypto
      .createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  };
}
export function issue(communityId, input, actor) {
  return transaction(() => {
    const batch = preview(communityId, input.period);
    if (input.token !== batch.token)
      throw problem(
        "Los datos cambiaron. Volvé a revisar la vista previa antes de emitir.",
        409,
      );
    const ids = [];
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
        `Cuota ordinaria ${batch.period}: ${formatMoney(item.amount)}. Vencimiento: ${batch.dueDate}.${
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
function selectedAssessmentProperties(communityId, input) {
  const all = listProperties()
    .filter((property) => property.communityId === communityId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!all.length) throw problem("La comunidad no tiene inmuebles.");
  if (input.propertyIds !== undefined && !Array.isArray(input.propertyIds))
    throw problem("La selección de inmuebles no es válida.");
  if (Array.isArray(input.propertyIds) && !input.propertyIds.length)
    throw problem("Elegí al menos un inmueble para la derrama.");
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
      })),
    });
  }
  return { all, selected, entries };
}
function assessmentReminders(input) {
  const defaults = feeDefaults(),
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
            `${entry.property.plot}: el plazo ${item.number} le asigna cero euros. Ajustá los importes o la cantidad de plazos.`,
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
    throw problem("Indicá un nombre de derrama (máximo 120 caracteres).");
  const purpose = typeof input.purpose === "string" ? input.purpose.trim() : "";
  if (purpose.length > 500)
    throw problem("El motivo no puede superar 500 caracteres.");
  const agreement =
    typeof input.agreement === "string" ? input.agreement.trim() : "";
  if (!agreement || agreement.length > 300)
    throw problem("Indicá el acuerdo de Junta (máximo 300 caracteres).");
  const totalAmount = money(input.totalAmount, "El importe total");
  if (!["coefficient", "manual"].includes(input.mode))
    throw problem("Criterio de reparto no válido.");
  const { all, selected, entries } = selectedAssessmentProperties(
    communityId,
    input,
  );
  const allocations = {};
  if (input.mode === "coefficient") {
    let weightSum = 0;
    for (const entry of entries) {
      const text = String(entry.property.participationCoef).replace(",", ".");
      if (
        !/^\d{1,3}(\.\d{1,4})?$/.test(text) ||
        Number(text) <= 0 ||
        Number(text) > 100
      )
        throw problem(
          `${entry.property.plot}: coeficiente no válido (hasta cuatro decimales).`,
        );
      entry.weight = Math.round(Number(text) * 10000);
      weightSum += entry.weight;
    }
    if (selected.length === all.length && weightSum !== 1000000)
      throw problem(
        `Los coeficientes suman ${(weightSum / 10000).toFixed(4)} %. Deben sumar 100 %. Revisá los inmuebles.`,
      );
    for (const entry of distribute(totalAmount, entries)) {
      if (entry.amount <= 0)
        throw problem(
          `${entry.property.plot}: el reparto le asigna cero euros. Ajustá la selección o el importe.`,
        );
      allocations[entry.property.id] = entry.amount;
    }
  } else {
    let sum = 0;
    for (const property of selected) {
      const amount = money(
        input.manual?.[property.id],
        `Importe de ${property.plot}`,
      );
      allocations[property.id] = amount;
      sum += amount;
    }
    if (sum !== totalAmount)
      throw problem(
        "La suma de importes por inmueble debe coincidir con el total de la derrama.",
      );
  }
  if (!Array.isArray(input.installments) || input.installments.length < 1)
    throw problem("Indicá al menos un plazo.");
  if (input.installments.length > 36)
    throw problem("La derrama no puede tener más de 36 plazos.");
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
  if (
    installments.reduce((sum, installment) => sum + installment.amount, 0) !==
    totalAmount
  )
    throw problem(
      "La suma de los plazos debe coincidir con el total de la derrama.",
    );
  const data = {
    purpose,
    agreement,
    mode: input.mode,
    propertyIds: selected.map((property) => property.id),
    allocations,
    coefficients: Object.fromEntries(
      entries.map((entry) => [
        entry.property.id,
        entry.property.participationCoef,
      ]),
    ),
    installments: assessmentSchedule(
      installments,
      entries.map((entry) => ({
        ...entry,
        weight: allocations[entry.property.id],
      })),
    ),
    reminders: assessmentReminders(input),
  };
  return transaction(() => {
    if (id) {
      const row = assessmentById(id);
      if (row.communityId !== communityId)
        throw problem("La derrama pertenece a otra comunidad.", 403);
      if (row.cancelledAt) throw problem("La derrama está anulada.", 409);
      if (
        db
          .prepare("SELECT 1 FROM fee_receipts WHERE assessmentId=? LIMIT 1")
          .get(id)
      )
        throw problem(
          "La derrama ya tiene recibos emitidos. Para cambiarla, anulala y creá una nueva.",
          409,
        );
      if (assessmentPayload(row).installments.some((item) => item.cancelledAt))
        throw problem(
          "La derrama tiene plazos anulados. Para cambiarla, anulala y creá una nueva.",
          409,
        );
      db.prepare(
        "UPDATE fee_assessments SET name=?,totalAmount=?,data=? WHERE id=?",
      ).run(name, totalAmount, JSON.stringify(data), id);
      audit(actor, "assessment.update", id, {
        communityId,
        totalAmount,
        installments: installments.length,
      });
      return assessmentView(assessmentById(id));
    }
    const assessmentId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO fee_assessments(id,communityId,name,totalAmount,data,createdAt,actorId) VALUES(?,?,?,?,?,?,?)",
    ).run(
      assessmentId,
      communityId,
      name,
      totalAmount,
      JSON.stringify(data),
      now(),
      actor.id,
    );
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
    .prepare(
      "SELECT * FROM fee_assessments WHERE communityId=? ORDER BY createdAt DESC",
    )
    .all(communityId)
    .map((row) => assessmentView(row));
}
export function assessmentView(row, date = today()) {
  const data = assessmentPayload(row),
    receipts = db
      .prepare(
        "SELECT * FROM fee_receipts WHERE assessmentId=? ORDER BY installment,propertyId",
      )
      .all(row.id);
  const installments = data.installments.map((installment) => {
    const rows = receipts.filter(
      (receipt) => receipt.installment === installment.number,
    );
    const active = rows.filter((receipt) => !receipt.cancelledAt);
    const views = active.map((receipt) => receiptView(receipt, date));
    const paid = views.reduce((sum, view) => sum + view.paid, 0);
    const outstanding = views.reduce((sum, view) => sum + view.outstanding, 0);
    const issued = active.length > 0;
    const overdue = outstanding > 0 && installment.dueDate < date;
    return {
      ...installment,
      issued,
      issuedAt: active.length
        ? active.map((receipt) => receipt.createdAt).sort()[0]
        : "",
      receiptCount: rows.length,
      paid,
      outstanding,
      overdue,
      status:
        row.cancelledAt || installment.cancelledAt
          ? "cancelled"
          : !rows.length
            ? "pending"
            : !active.length
              ? "cancelled"
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
  const canEdit = !row.cancelledAt && !receipts.length && !cancelledCount;
  let status = "draft";
  if (row.cancelledAt) status = "cancelled";
  else if (installments.length && cancelledCount === installments.length)
    status = "cancelled";
  else if (canEdit) status = "draft";
  else if (
    installments.every((item) => ["paid", "cancelled"].includes(item.status))
  )
    status = "collected";
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
    purpose: data.purpose,
    agreement: data.agreement,
    mode: data.mode,
    propertyIds: data.propertyIds,
    allocations: data.allocations,
    coefficients: data.coefficients,
    reminders: data.reminders,
    installments,
    totals: {
      total: row.totalAmount,
      issued,
      paid,
      outstanding,
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
      .prepare(
        "SELECT * FROM fee_receipts WHERE assessmentId=? ORDER BY installment,propertyId",
      )
      .all(row.id)
      .map((receipt) => receiptView(receipt, date)),
  };
}
function assessmentInstallment(row, number) {
  const data = assessmentPayload(row),
    installment = data.installments.find((item) => item.number === number);
  if (!installment)
    throw problem("El plazo indicado no pertenece a esta derrama.", 404);
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
    db
      .prepare(
        "SELECT 1 FROM fee_receipts WHERE assessmentId=? AND installment=? LIMIT 1",
      )
      .get(row.id, number)
  )
    throw problem("Este plazo ya fue emitido.", 409);
  const { entries } = selectedAssessmentProperties(row.communityId, {
    propertyIds: data.propertyIds,
  });
  for (const entry of entries) {
    const weight = data.allocations[entry.property.id];
    if (!Number.isSafeInteger(weight) || weight <= 0)
      throw problem(
        `${entry.property.plot}: falta su importe en el reparto de la derrama.`,
      );
    entry.weight = weight;
  }
  const ordered = [...data.installments].sort((a, b) => a.number - b.number);
  const amounts =
    installment.allocations ||
    assessmentSchedule(ordered, entries).find((item) => item.number === number)
      .allocations;
  const community = db
    .prepare("SELECT name,iban FROM communities WHERE id=?")
    .get(row.communityId);
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
        property: entry.property.plot || entry.property.address,
        community: community.name,
        communityIban: community.iban || "",
        owners: entry.owners,
        coefficient:
          data.coefficients?.[entry.property.id] ??
          entry.property.participationCoef,
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
    throw problem(
      "No se pudo repartir el importe del plazo. Revisá los importes.",
    );
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
    token: crypto
      .createHash("sha256")
      .update(JSON.stringify(result))
      .digest("hex"),
  };
}
export function issueAssessment(id, input, actor) {
  return transaction(() => {
    const row = assessmentById(id);
    if (!canManage(actor, row.communityId))
      throw problem(
        "No tenés permiso para emitir derramas de esta comunidad.",
        403,
      );
    const batch = previewAssessment(id, Number(input.installment));
    if (input.token !== batch.token)
      throw problem(
        "Los datos cambiaron. Volvé a revisar la vista previa antes de emitir.",
        409,
      );
    const ids = [];
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
        `Derrama "${row.name}" · plazo ${batch.installment}/${batch.installmentCount}: ${formatMoney(item.amount)}. Vencimiento: ${batch.dueDate}.${
          item.snapshot.communityIban
            ? ` IBAN para transferencia: ${item.snapshot.communityIban}.`
            : ""
        }`,
      );
    }
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
      throw problem(
        "No tenés permiso para anular derramas de esta comunidad.",
        403,
      );
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
      if (
        view.installments.find((item) => item.number === installment).status ===
        "cancelled"
      )
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
          "Hay cobros aplicados a esta derrama. Revertí primero los cobros y volvé a intentar.",
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
        `${row.id}:${receipt.installment}:${receipt.propertyId}`,
        installment === null
          ? "Derrama anulada"
          : `Plazo ${installment} de derrama anulado`,
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
    db.prepare("UPDATE fee_assessments SET data=? WHERE id=?").run(
      JSON.stringify(data),
      row.id,
    );
    if (
      installment === null ||
      data.installments.every(
        (item) =>
          item.cancelledAt ||
          view.installments.find((previous) => previous.number === item.number)
            .status === "cancelled",
      )
    )
      db.prepare(
        "UPDATE fee_assessments SET cancelledAt=?,cancellationReason=? WHERE id=?",
      ).run(cancelledAt, note, row.id);
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
export function formatMoney(cents) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
export function paymentView(row) {
  const allocations = db
    .prepare("SELECT receiptId,amount FROM fee_allocations WHERE paymentId=?")
    .all(row.id);
  return {
    ...row,
    allocations,
    credit: row.reversedAt
      ? 0
      : row.amount - allocations.reduce((s, a) => s + a.amount, 0),
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
      throw problem(
        "El cobro debe aplicarse a recibos del pagador y de la misma comunidad.",
      );
    if (receipt.cancelledAt)
      throw problem("No se puede pagar un recibo anulado.");
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
        `Se registraron ${formatMoney(amount)} para la ${lowerFirst(receiptConcept(receipt, view.snapshot))} de ${view.snapshot.property}.`,
      );
    }
  }
}
export function recordPayment(communityId, input, actor) {
  if (!validDate(input.paidOn) || input.paidOn > today())
    throw problem("La fecha del cobro debe ser válida y no futura.");
  if (!["transfer", "deposit", "direct_debit"].includes(input.method))
    throw problem("Forma de pago no válida.");
  if (typeof input.reference !== "string" || input.reference.length > 120)
    throw problem("Referencia no válida (máximo 120 caracteres).");
  if (
    typeof input.requestId !== "string" ||
    !/^[\w-]{16,80}$/.test(input.requestId)
  )
    throw problem("Falta el identificador único del cobro.");
  const amount = money(input.amount);
  if (
    !listProperties().some(
      (p) =>
        p.communityId === communityId && p.ownerIds.includes(input.ownerId),
    ) &&
    !db
      .prepare("SELECT snapshot FROM fee_receipts WHERE communityId=?")
      .all(communityId)
      .some((r) =>
        JSON.parse(r.snapshot).owners.some((o) => o.id === input.ownerId),
      )
  )
    throw problem("El pagador no tiene relación con esta comunidad.");
  return transaction(() => {
    if (
      db
        .prepare("SELECT 1 FROM fee_payments WHERE requestId=?")
        .get(input.requestId)
    )
      throw problem(
        "Este cobro ya fue registrado. Actualizá la vista antes de repetirlo.",
        409,
      );
    const duplicate = db
      .prepare(
        `SELECT id FROM fee_payments WHERE communityId=? AND ownerId=? AND amount=? AND paidOn=? AND reference=? AND reversedAt=''`,
      )
      .get(
        communityId,
        input.ownerId,
        amount,
        input.paidOn,
        input.reference.trim(),
      );
    if (duplicate && input.confirmDuplicate !== true)
      throw problem(
        "Posible cobro duplicado por pagador, importe, fecha y referencia. Revisalo y confirmá expresamente si es otro cobro.",
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
    if (!payment || payment.reversedAt)
      throw problem("El cobro no existe o está devuelto.");
    allocate(payment, input.receiptIds);
    audit(actor, "credit", id, { communityId: payment.communityId });
    return paymentView(payment);
  });
}
function reason(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500)
    throw problem("Indicá el motivo (máximo 500 caracteres).");
  return value.trim();
}
export function reversePayment(id, input, actor) {
  const note = reason(input.reason);
  return transaction(() => {
    const p = db.prepare("SELECT * FROM fee_payments WHERE id=?").get(id);
    if (!p) throw problem("Cobro no encontrado.", 404);
    if (p.reversedAt) throw problem("El cobro ya fue devuelto.", 409);
    db.prepare(
      "UPDATE fee_payments SET reversedAt=?,reversalReason=? WHERE id=?",
    ).run(now(), note, id);
    for (const a of paymentView(p).allocations) {
      const r = receiptById(a.receiptId);
      notify(
        r,
        "returned",
        id,
        "Devolución de cobro",
        `Se devolvió un cobro de ${formatMoney(a.amount)} aplicado a la ${lowerFirst(receiptConcept(r))}. El saldo vuelve a estar pendiente.`,
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
        "Primero revertí los cobros aplicados. No se puede anular un recibo con pagos.",
        409,
      );
    db.prepare(
      "UPDATE fee_receipts SET cancelledAt=?,cancellationReason=? WHERE id=?",
    ).run(now(), note, id);
    notify(
      receiptById(id),
      "cancelled",
      id,
      "Recibo anulado",
      `Se anuló la ${lowerFirst(receiptConcept(row))}. Motivo: ${note}`,
    );
    audit(actor, "cancel", id, { communityId: row.communityId, reason: note });
  });
}
export function notify(
  row,
  kind,
  eventKey,
  title,
  message,
  targetOwnerId = "",
) {
  const options = reminderSettingsForReceipt(row);
  for (const owner of JSON.parse(row.snapshot).owners) {
    if (targetOwnerId && owner.id !== targetOwnerId) continue;
    const id = crypto.randomUUID(),
      createdAt = now();
    const inserted = db
      .prepare("INSERT OR IGNORE INTO fee_events VALUES(?,?,?,?,?,?,?,?)")
      .run(
        id,
        row.id,
        owner.id,
        kind,
        eventKey,
        title,
        message,
        createdAt,
      ).changes;
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
      db.prepare("INSERT INTO fee_mail(eventId,updatedAt) VALUES(?,?)").run(
        id,
        createdAt,
      );
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
export function materializeFeeReminders(date = today()) {
  return transaction(() => {
    for (const row of db
      .prepare(
        "SELECT * FROM fee_receipts WHERE cancelledAt='' AND dueDate<=date(?, '+60 days')",
      )
      .all(date)) {
      const view = receiptView(row, date);
      if (view.outstanding <= 0) continue;
      const settings = reminderSettingsForReceipt(row);
      const days = Math.round(
        (Date.parse(date) - Date.parse(row.dueDate)) / 86400000,
      );
      const iban = view.snapshot.communityIban
        ? ` IBAN para transferencia: ${view.snapshot.communityIban}.`
        : "";
      const concept = receiptConcept(row, view.snapshot),
        kind = row.assessmentId ? "derrama" : "cuota";
      if (days <= 0 && days >= -settings.beforeDays && settings.beforeDays > 0)
        notify(
          row,
          "due",
          row.dueDate,
          `Próximo vencimiento de ${kind}`,
          `${concept} de ${view.snapshot.property} vence el ${row.dueDate}. Pendiente: ${formatMoney(view.outstanding)}.${iban}`,
        );
      if (days >= settings.afterDays && days > 0) {
        const repeat = settings.repeatDays
          ? Math.floor((days - settings.afterDays) / settings.repeatDays)
          : 0;
        notify(
          row,
          "overdue",
          `${row.dueDate}:${repeat}`,
          `${kind === "derrama" ? "Derrama" : "Cuota"} vencida pendiente`,
          `${concept} de ${view.snapshot.property} tiene ${formatMoney(view.outstanding)} pendientes desde ${row.dueDate}.${iban}`,
        );
      }
    }
  });
}
