import crypto from "node:crypto";
import path from "node:path";
import { db, UPLOADS_DIR } from "./db.js";
import { allowed, policyData } from "./security.js";
import { recordAudit } from "./audit.js";
import { communityNifError } from "./validation.js";
import { isTenantContractActive } from "../public/js/permissions.js";
import { CREDIT_DESTINATIONS, legalConfigOf } from "./legal-config.js";
import { formatMoney } from "./fees.js";
import { queueUploadCleanup, processFeeProofCleanup } from "./fee-proof-cleanup.js";

const TYPES = {
  owners: "owner",
  tenants: "tenant",
  properties: "property",
  communities: "community",
};
const read = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
const json = (value, fallback = {}) => JSON.parse(value || JSON.stringify(fallback));
const ids = (value) => json(value, []);
const fail = (message, status = 400, code) => {
  throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
};
const stale = () =>
  fail(
    "Las dependencias cambiaron. Vuelve a evaluar el asistente antes de confirmar.",
    409,
    "CASCADE_STALE",
  );
const reviewKey = crypto.randomBytes(32);
const madridDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const unique = (values) => [...new Set(values.filter(Boolean))];
const label = (row) => [row.name, row.surname].filter(Boolean).join(" ") || row.plot || row.id;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
function reference(value) {
  if (typeof value !== "string" || !value || value.length > 512)
    fail("El identificador del destino debe ser texto válido.");
  return value;
}

function graph(collection, id) {
  if (!TYPES[collection]) fail("Entidad no válida.");
  const allProperties = read("properties"),
    allOwners = read("owners"),
    allTenants = read("tenants");
  const root = db.prepare(`SELECT * FROM ${collection} WHERE id=?`).get(id);
  if (!root) fail("El registro ya no existe.", 404);
  const properties =
    collection === "communities"
      ? allProperties.filter((p) => p.communityId === id)
      : collection === "owners"
        ? allProperties.filter((p) => ids(p.ownerIds).includes(id))
        : collection === "properties"
          ? [root]
          : allProperties.filter((p) => p.id === root.propertyId);
  const propertyIds = properties.map((p) => p.id);
  const owners =
    collection === "owners"
      ? [root]
      : collection === "communities"
        ? allOwners.filter(
            (o) =>
              properties.some((p) => ids(p.ownerIds).includes(o.id)) ||
              // En una asociación el censo incluye socios sin inmueble; también
              // deben entrar en el borrado y en la limpieza de su comunidad.
              (o.communityId === id && o.isMember),
          )
        : allOwners.filter((o) => properties.some((p) => ids(p.ownerIds).includes(o.id)));
  const ownerIds = owners.map((o) => o.id);
  // External links are part of the preview even when they will be preserved.
  const relationships = allProperties.filter(
    (p) => propertyIds.includes(p.id) || ids(p.ownerIds).some((id) => ownerIds.includes(id)),
  );
  const tenants =
    collection === "tenants"
      ? [root]
      : allTenants.filter(
          (t) => propertyIds.includes(t.propertyId) || ownerIds.includes(t.ownerId),
        );
  const allReceipts = read("fee_receipts"),
    allPayments = read("fee_payments");
  const receipts = allReceipts.filter(
    (r) =>
      (collection === "communities" && r.communityId === id) ||
      propertyIds.includes(r.propertyId) ||
      json(r.snapshot).owners?.some((o) => ownerIds.includes(o.id)),
  );
  const payments = allPayments.filter(
    (p) => (collection === "communities" && p.communityId === id) || ownerIds.includes(p.ownerId),
  );
  const receiptIds = receipts.map((r) => r.id),
    paymentIds = payments.map((p) => p.id);
  const allocations = db
    .prepare("SELECT * FROM fee_allocations ORDER BY paymentId,receiptId")
    .all()
    .filter((a) => receiptIds.includes(a.receiptId) || paymentIds.includes(a.paymentId));
  // Include the other side of every affected allocation in scope checks and
  // in the concurrency token, even if that ledger entry will be preserved.
  for (const r of allReceipts)
    if (!receiptIds.includes(r.id) && allocations.some((a) => a.receiptId === r.id))
      receipts.push(r);
  for (const p of allPayments)
    if (!paymentIds.includes(p.id) && allocations.some((a) => a.paymentId === p.id))
      payments.push(p);
  const charges = {};
  for (const table of ["fee_plans", "fee_assessments", "service_bills"])
    charges[table] = read(table).filter(
      (r) =>
        (collection === "communities" && r.communityId === id) ||
        (table !== "fee_plans" &&
          json(r.data).propertyIds?.some((id) => relationships.some((p) => p.id === id))),
    );
  const entities = [
    [TYPES[collection], id],
    ...properties.map((p) => ["property", p.id]),
    ...owners.map((o) => ["owner", o.id]),
    ...tenants.map((t) => ["tenant", t.id]),
  ];
  const documents = read("documents").filter((d) =>
    entities.some(([type, id]) => d.entityType === type && d.entityId === id),
  );
  const folders = read("document_folders").filter((d) =>
    entities.some(([type, id]) => d.entityType === type && d.entityId === id),
  );
  const notifications = {};
  for (const table of ["owner_notifications", "admin_emails"])
    notifications[table] = read(table).filter(
      (n) => ownerIds.includes(n.ownerId) || receiptIds.includes(n.feeReceiptId),
    );
  const posts = read("communication_posts").filter(
    (p) => collection === "communities" && p.communityId === id,
  );
  const postIds = posts.map((p) => p.id);
  const postChildren = {};
  for (const table of [
    "communication_recipients",
    "communication_comments",
    "communication_ballots",
    "communication_voting_census",
    "communication_files",
    "communication_audit",
    "communication_outbox",
  ])
    postChildren[table] = db
      .prepare(
        `SELECT * FROM ${table} WHERE postId IN (SELECT value FROM json_each(?)) ORDER BY postId`,
      )
      .all(JSON.stringify(postIds))
      .map((r) =>
        table === "communication_files"
          ? { ...r, content: crypto.createHash("sha256").update(r.content).digest("hex") }
          : r,
      );
  const financialChildren = {};
  for (const table of ["fee_proofs", "fee_events"])
    financialChildren[table] = read(table).filter(
      (r) => receiptIds.includes(r.receiptId) || ownerIds.includes(r.ownerId),
    );
  financialChildren.fee_mail = db
    .prepare("SELECT * FROM fee_mail ORDER BY eventId")
    .all()
    .filter((r) => financialChildren.fee_events.some((e) => e.id === r.eventId));
  financialChildren.service_attachments = read("service_attachments").filter(
    (r) =>
      charges.service_bills.some((s) => s.id === r.serviceBillId) ||
      propertyIds.includes(r.propertyId),
  );
  const communityIds = unique([
    collection === "communities" ? id : "",
    ...relationships.map((p) => p.communityId),
    ...receipts.map((r) => r.communityId),
    ...payments.map((p) => p.communityId),
    ...Object.values(charges)
      .flat()
      .map((row) => row.communityId),
    ...tenants.map((t) => allProperties.find((p) => p.id === t.propertyId)?.communityId),
    // La comunidad de censo de un socio cuenta aunque tenga inmuebles en otra
    // comunidad; una ficha heredada sin isMember no amplía el ámbito.
    ...owners.filter((owner) => owner.isMember).map((owner) => owner.communityId),
  ]);
  const communities = read("communities").filter((c) => communityIds.includes(c.id));
  return {
    collection,
    root,
    properties,
    owners,
    relationships,
    tenants,
    receipts,
    payments,
    allocations,
    charges,
    documents,
    folders,
    notifications,
    posts,
    postChildren,
    financialChildren,
    communityIds,
    communities,
  };
}

function authorize(user, g) {
  const policy = policyData();
  const permit = (permission, id = "") => {
    if (!allowed(user, permission, id, policy))
      fail("No tienes permiso para todas las relaciones de esta operación.", 403);
  };
  permit("cascade-delete", g.root.id);
  permit(`${TYPES[g.collection]}:delete`, g.root.id);
  permit(`${TYPES[g.collection]}:read`, g.root.id);
  for (const [type, rows] of [
    ["owner", g.owners],
    ["tenant", g.tenants],
    ["property", g.relationships],
  ])
    for (const row of rows) permit(`${type}:read`, row.id);
  for (const id of g.communityIds) {
    permit("cascade-delete", id);
    permit("community:read", id);
  }
  for (const cid of unique(
    [...g.receipts, ...g.payments, ...Object.values(g.charges).flat()].map((r) => r.communityId),
  ))
    permit("fee:read", cid);
  return permit;
}

function deletedEntities(g, p) {
  const rows = [];
  if (g.collection === "communities") rows.push(["community", g.root]);
  for (const [type, key, action] of [
    ["owner", "owners", "delete_owner"],
    ["property", "properties", "delete_property"],
    ["tenant", "tenants", "remove_tenant"],
  ])
    for (const row of g[key]) if (p[key][row.id]?.action === action) rows.push([type, row]);
  return rows;
}

function closedDistributions(g, p, deletedOwners) {
  const related = new Map(g.relationships.map((r) => [r.id, r]));
  const result = [];
  for (const table of ["fee_assessments", "service_bills"])
    for (const row of g.charges[table]) {
      if (
        row.cancelledAt ||
        (g.collection === "communities" && row.communityId === g.root.id && p.finance === "delete")
      )
        continue;
      const rootCharge = g.collection === "communities" && row.communityId === g.root.id;
      const chargeCommunity =
        rootCharge && p.finance === "reassign_community" ? p.destination : row.communityId;
      const propertyIds = json(row.data).propertyIds || [];
      const invalid = propertyIds.some((id) => {
        const property = related.get(id);
        if (!property) return false; // Unchanged members of a shared distribution.
        const action = p.properties[id] || { action: "keep" };
        if (
          action.action === "keep" &&
          !ids(property.ownerIds).some((id) => deletedOwners.includes(id))
        )
          return false;
        const community =
          action.action === "create_temp_community"
            ? "temporary"
            : action.newCommunityId ||
              (rootCharge && action.action === "orphan" ? "" : property.communityId);
        return (
          action.action === "delete_property" ||
          community !== chargeCommunity ||
          (!ids(property.ownerIds).some((id) => !deletedOwners.includes(id)) && !action.newOwnerId)
        );
      });
      if (invalid || (rootCharge && ["keep_historical", "liquidate_final"].includes(p.finance)))
        result.push({
          table,
          id: row.id,
          name: row.name || row.service || row.id,
          communityId: row.communityId,
          propertyIds,
          shared: propertyIds.length > 1,
        });
    }
  return result;
}

function executionToken(g, p, user) {
  const targetIds = { properties: [], owners: [], communities: [] };
  for (const row of Object.values(p.actions.properties)) {
    if (row.newOwnerId) targetIds.owners.push(row.newOwnerId);
    if (row.newCommunityId) targetIds.communities.push(row.newCommunityId);
  }
  for (const row of Object.values(p.actions.tenants))
    if (row.newPropertyId) targetIds.properties.push(row.newPropertyId);
  if (p.actions.destination && p.actions.destination !== "temporary")
    targetIds.communities.push(p.actions.destination);
  const targets = Object.fromEntries(
    Object.entries(targetIds).map(([table, values]) => [
      table,
      unique(values)
        .sort()
        .map((id) => db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id)),
    ]),
  );
  const users = unique(deletedEntities(g, p.actions).map(([, row]) => row.userId))
    .sort()
    .map((id) => ({
      user: db
        .prepare("SELECT id,usuario,nombre,apellido,rol,activo FROM users WHERE id=?")
        .get(id),
      owners: db.prepare("SELECT id,version FROM owners WHERE userId=? ORDER BY id").all(id),
      tenants: db.prepare("SELECT id,version FROM tenants WHERE userId=? ORDER BY id").all(id),
      communities: db
        .prepare("SELECT id,version FROM communities WHERE adminUserId=? ORDER BY id")
        .all(id),
    }));
  return crypto
    .createHmac("sha256", reviewKey)
    .update(
      JSON.stringify({
        actor: user.id,
        graph: token(g),
        plan: p.actions,
        credit: p.credit ? { ...p.credit, reference: undefined } : undefined,
        // Las referencias documentales son evidencia, no un cambio de alcance:
        // no invalidan la revisión si se completan después de la vista previa.
        transfer: p.transfer
          ? {
              debtPolicy: p.transfer.debtPolicy,
              requiresDocument: p.transfer.requiresDocument,
            }
          : undefined,
        targets,
        users,
        closed: p.closedDistributions,
        day: madridDate(),
      }),
    )
    .digest("hex");
}
function token(g) {
  return crypto.createHash("sha256").update(JSON.stringify(g)).digest("hex");
}
function ownerCommunities(g, ownerId) {
  return unique([
    ...g.relationships.filter((p) => ids(p.ownerIds).includes(ownerId)).map((p) => p.communityId),
    ...g.receipts
      .filter((r) => json(r.snapshot).owners?.some((o) => o.id === ownerId))
      .map((r) => r.communityId),
    ...g.payments.filter((p) => p.ownerId === ownerId).map((p) => p.communityId),
    // La comunidad de censo del socio también cuenta si tiene inmuebles en
    // otra comunidad; no se usa el communityId de fichas que no son socias.
    ...g.owners.filter((o) => o.id === ownerId && o.isMember).map((o) => o.communityId),
  ]);
}
function primaryFinance(g, deletedOwners = [], deletedProperties = []) {
  const own = g.collection === "owners" ? [g.root.id] : deletedOwners;
  const prop =
    g.collection === "properties" ? [g.root.id, ...deletedProperties] : deletedProperties;
  return {
    receipts:
      g.collection === "tenants"
        ? []
        : g.receipts.filter(
            (r) =>
              (g.collection === "communities" && r.communityId === g.root.id) ||
              prop.includes(r.propertyId) ||
              json(r.snapshot).owners?.some((o) => own.includes(o.id)),
          ),
    payments:
      g.collection === "tenants"
        ? []
        : g.payments.filter(
            (p) =>
              (g.collection === "communities" && p.communityId === g.root.id) ||
              own.includes(p.ownerId),
          ),
  };
}
function totals(g, financial) {
  return {
    receipts: financial.receipts.length,
    payments: financial.payments.length,
    sharedReceipts: financial.receipts.filter((r) => (json(r.snapshot).owners || []).length > 1)
      .length,
    amount: financial.receipts.reduce((n, r) => n + r.amount, 0),
    allocated: g.allocations
      .filter((a) => financial.receipts.some((r) => r.id === a.receiptId))
      .reduce((n, a) => n + a.amount, 0),
  };
}
function preview(g, user) {
  authorize(user, g);
  return {
    collection: g.collection,
    entity: { id: g.root.id, name: label(g.root), type: TYPES[g.collection] },
    previewToken: token(g),
    properties: g.properties.map((p) => ({
      id: p.id,
      name: label(p),
      communityId: p.communityId,
      communityName: g.communities.find((c) => c.id === p.communityId)?.name || p.communityName,
      ownerIds: ids(p.ownerIds),
      tenants: g.tenants.filter((t) => t.propertyId === p.id).map((t) => t.id),
    })),
    owners: g.owners.map((o) => ({
      id: o.id,
      name: label(o),
      userId: o.userId,
      communityIds: ownerCommunities(g, o.id),
      relationships: g.relationships
        .filter((p) => ids(p.ownerIds).includes(o.id))
        .map((p) => ({
          id: p.id,
          name: label(p),
          communityId: p.communityId,
          communityName: g.communities.find((c) => c.id === p.communityId)?.name || p.communityName,
        })),
      finance: totals(g, primaryFinance({ ...g, collection: "owners", root: o })),
    })),
    tenants: g.tenants.map((t) => ({
      id: t.id,
      name: label(t),
      propertyId: t.propertyId,
      ownerId: t.ownerId,
      userId: t.userId,
      contractStart: t.contractStart,
      contractEnd: t.contractEnd,
    })),
    communities: g.communities.map((c) => ({
      id: c.id,
      name: c.name,
      reasons: [
        ...(g.collection === "communities" && g.root.id === c.id ? ["Comunidad seleccionada"] : []),
        ...(g.relationships.some((p) => p.communityId === c.id)
          ? ["Inmuebles vinculados a los propietarios evaluados"]
          : []),
        ...(g.owners.some((o) => o.isMember && o.communityId === c.id) ? ["Censo de socios"] : []),
        ...([...g.receipts, ...g.payments].some((row) => row.communityId === c.id)
          ? ["Historial financiero relacionado"]
          : []),
        ...(Object.values(g.charges)
          .flat()
          .some((row) => row.communityId === c.id)
          ? ["Repartos relacionados"]
          : []),
      ],
    })),
    finance: totals(g, primaryFinance(g)),
    charges: Object.fromEntries(Object.entries(g.charges).map(([k, rows]) => [k, rows.length])),
    documents:
      g.documents.length +
      [...g.owners, ...g.tenants].reduce((n, r) => n + Object.keys(json(r.documents)).length, 0),
    notifications: Object.values(g.notifications).reduce((n, rows) => n + rows.length, 0),
    posts: g.posts.length,
  };
}

function choice(value, values, name) {
  if (!values.includes(value)) fail(`Acción no válida para ${name}.`);
  return value;
}
function mapping(value, rows, name) {
  if (!object(value) || Object.keys(value).some((id) => !rows.some((r) => r.id === id)))
    fail(`Selección no válida: ${name}.`);
  return value;
}
function plan(g, body, user, options = {}) {
  const permit = authorize(user, g);
  if (!object(body) || !object(body.actions)) fail("Falta el plan de acciones.");
  if (body.confirmDelete !== true) fail("Confirma expresamente la operación.");
  if (body.previewToken !== token(g)) stale();
  const a = body.actions;
  if (
    Object.keys(a).some(
      (k) =>
        ![
          "properties",
          "owners",
          "tenants",
          "finance",
          "documents",
          "notifications",
          "posts",
          "user",
          "temporaryCommunity",
          "destinationCommunityId",
        ].includes(k),
    )
  )
    fail("El plan contiene acciones desconocidas.");
  const p = {
    properties: Object.create(null),
    owners: Object.create(null),
    tenants: Object.create(null),
    finance: choice(
      a.finance,
      ["keep_historical", "liquidate_final", "delete", "reassign_community"],
      "finanzas",
    ),
    documents: choice(a.documents, ["keep", "delete"], "documentos"),
    notifications: choice(a.notifications, ["keep", "delete"], "notificaciones"),
    posts: choice(a.posts, ["keep_historical", "delete", "reassign_community"], "publicaciones"),
    user: choice(a.user, ["unlink", "delete_user"], "usuario"),
  };
  const properties = mapping(a.properties, g.properties, "inmuebles"),
    owners = mapping(a.owners, g.owners, "propietarios"),
    tenants = mapping(a.tenants, g.tenants, "inquilinos");
  const deletingOwners = g.collection === "owners" ? [g.root.id] : [];
  for (const o of g.owners) {
    const action = choice(
      owners[o.id]?.action,
      g.collection === "tenants" ? ["keep"] : ["keep", "delete_owner"],
      "propietario",
    );
    if (g.collection === "owners" && action !== "delete_owner")
      fail("El propietario seleccionado debe eliminarse.");
    if (action === "delete_owner") {
      permit("owner:delete", o.id);
      if (!deletingOwners.includes(o.id)) deletingOwners.push(o.id);
    }
    p.owners[o.id] = { action };
  }
  // A global deletion must be acknowledged even if the owner is only a
  // dependency of a community, rather than the root of the request.
  if (
    deletingOwners.some((id) => ownerCommunities(g, id).length > 1) &&
    body.confirmGlobalDelete !== true
  )
    fail("Confirma el borrado global del propietario en todas sus comunidades.", 409);
  let temporary = false;
  for (const property of g.properties) {
    const raw = properties[property.id];
    if (!object(raw)) fail("Elige una acción para cada inmueble.");
    const options =
      g.collection === "properties"
        ? ["delete_property"]
        : g.collection === "tenants"
          ? ["keep"]
          : [
              "keep",
              "orphan",
              "reassign_owner",
              "delete_property",
              "reassign_community",
              "create_temp_community",
            ];
    const action = choice(raw.action, options, "inmueble");
    if (g.collection === "communities" && ["keep", "orphan", "reassign_owner"].includes(action)) {
      if (action !== "orphan")
        fail("Mueve, desvincula o elimina los inmuebles antes de borrar su comunidad.");
    }
    if (action !== "keep" || ids(property.ownerIds).some((id) => deletingOwners.includes(id)))
      permit(action === "delete_property" ? "property:delete" : "property:manage", property.id);
    const result = { action };
    if (action === "reassign_owner") {
      const target = db.prepare("SELECT id FROM owners WHERE id=?").get(reference(raw.newOwnerId));
      if (!target || deletingOwners.includes(target.id))
        fail("El propietario destino no existe o también se va a eliminar.");
      permit("owner:manage", target.id);
      result.newOwnerId = target.id;
    }
    if (action === "reassign_community") {
      const target = db
        .prepare("SELECT * FROM communities WHERE id=?")
        .get(reference(raw.newCommunityId));
      if (!target || (g.collection === "communities" && target.id === g.root.id))
        fail("La comunidad destino no es válida.");
      permit("community:edit", target.id);
      permit("cascade-delete", target.id);
      if (
        (target.currency || "EUR") !==
        (property.currency ||
          g.communities.find((c) => c.id === property.communityId)?.currency ||
          "EUR")
      )
        fail("No se pueden trasladar inmuebles entre monedas diferentes.");
      result.newCommunityId = target.id;
    }
    if (action === "create_temp_community") {
      permit("community:create");
      temporary = true;
    }
    p.properties[property.id] = result;
  }
  // External properties are preserved, but removing their owner is still a
  // modification requiring permission in that community.
  for (const r of g.relationships)
    if (ids(r.ownerIds).some((id) => deletingOwners.includes(id))) permit("property:manage", r.id);
  if (temporary) {
    if (!object(a.temporaryCommunity)) fail("Indica los datos de la comunidad temporal.");
    const name = String(a.temporaryCommunity.name || "").trim(),
      nif = String(a.temporaryCommunity.nif || "")
        .trim()
        .toUpperCase();
    if (!name || name.length > 120 || communityNifError(nif))
      fail("Indica un nombre y NIF válidos para la comunidad temporal.");
    if (
      unique(
        g.properties
          .filter((r) => p.properties[r.id].action === "create_temp_community")
          .map(
            (r) =>
              r.currency || g.communities.find((c) => c.id === r.communityId)?.currency || "EUR",
          ),
      ).length > 1
    )
      fail("La comunidad temporal debe recibir inmuebles de una misma moneda.");
    if (db.prepare("SELECT id FROM communities WHERE UPPER(nif)=?").get(nif))
      fail("Ya existe una comunidad con ese NIF.", 409);
    p.temporaryCommunity = { name, nif };
  }
  for (const t of g.tenants) {
    const raw = tenants[t.id];
    if (!object(raw)) fail("Elige una acción para cada inquilino.");
    const action = choice(
      raw.action,
      ["keep", "reassign_tenant", "orphan_tenant", "remove_tenant", "end_contract"],
      "inquilino",
    );
    const propertyAction = p.properties[t.propertyId]?.action;
    if (action === "keep" && propertyAction === "delete_property")
      fail("Mueve, desvincula o elimina los inquilinos del inmueble que se borra.");
    // Un contrato no puede quedar apuntando a un arrendador eliminado sin otro
    // titular que lo sustituya. Si el inmueble se conserva o se traslada sin
    // reasignar titularidad, hay que resolver el contrato expresamente.
    if (action === "keep" && deletingOwners.includes(t.ownerId)) {
      const property = g.properties.find((row) => row.id === t.propertyId);
      const surviving = property
        ? ids(property.ownerIds).filter((id) => !deletingOwners.includes(id))
        : [];
      const replacement = p.properties[t.propertyId]?.newOwnerId;
      if (replacement && !surviving.includes(replacement)) surviving.push(replacement);
      if (!surviving.length)
        fail(
          `El contrato de ${label(t)} quedaría sin arrendador. Reasigna el inmueble a otro titular, mueve el contrato o desvincúlalo antes de continuar.`,
        );
    }
    if (action !== "keep" || deletingOwners.includes(t.ownerId))
      permit(action === "remove_tenant" ? "tenant:delete" : "tenant:manage", t.id);
    if (action === "end_contract" && t.contractStart && t.contractStart > madridDate())
      fail(
        "El contrato todavía no empezó. Puedes desvincularlo o eliminar el perfil, pero no finalizarlo antes de su inicio.",
      );
    if (action === "end_contract" && t.contractEnd && t.contractEnd < madridDate())
      fail(
        "El contrato ya finalizó. Puedes desvincular el perfil sin cambiar su fecha de fin histórica.",
      );
    const result = { action };
    if (action === "reassign_tenant") {
      const target = db
        .prepare("SELECT * FROM properties WHERE id=?")
        .get(reference(raw.newPropertyId));
      if (!target || p.properties[target.id]?.action === "delete_property")
        fail("El inmueble destino no existe o también se va a eliminar.");
      permit("property:manage", target.id);
      permit("cascade-delete", target.id);
      const targetOwners = ids(target.ownerIds).filter((id) => !deletingOwners.includes(id));
      if (p.properties[target.id]?.newOwnerId)
        targetOwners.push(p.properties[target.id].newOwnerId);
      if (
        !targetOwners.length ||
        targetOwners.some((id) => !db.prepare("SELECT 1 FROM owners WHERE id=?").get(id))
      )
        fail(
          "El inmueble destino debe tener al menos un titular válido para recibir contratos.",
          body.executionToken ? 409 : 400,
        );
      result.newPropertyId = target.id;
    }
    p.tenants[t.id] = result;
  }
  const deletedProperties = Object.entries(p.properties)
    .filter(([, a]) => a.action === "delete_property")
    .map(([id]) => id);
  const financial = primaryFinance(g, deletingOwners, deletedProperties);
  // En un titular o inmueble la configuración aplicable es la de sus
  // comunidades, no la de la entidad raíz (que no tiene legalConfig). Si el
  // borrado afecta a varias, se aplica la política de crédito más estricta.
  const legalCommunities = g.collection === "communities" ? [g.root] : g.communities;
  const legalEntries = (legalCommunities.length ? legalCommunities : [g.root]).map((community) => ({
    community,
    config: legalConfigOf(community),
  }));
  // Saldo a favor que quedaría sin titular al borrar: crédito ya no aplicado a
  // recibos más las aplicaciones que la liquidación final libera. No se crea
  // dinero: solo se documenta su destino antes de que desaparezca el titular.
  const creditByCurrency = new Map();
  const currencyOf = (communityId) =>
    g.communities.find((community) => community.id === communityId)?.currency ||
    g.root.currency ||
    "EUR";
  const addCredit = (amount, currency) => {
    if (amount > 0) creditByCurrency.set(currency, (creditByCurrency.get(currency) || 0) + amount);
  };
  // Al borrar un titular solo cuenta su propio saldo. En un recibo compartido,
  // el cobro de un cotitular sigue siendo crédito de ese cotitular y no del
  // titular que se elimina. La excepción es el borrado definitivo de toda la
  // comunidad, que sí elimina también los cobros de quienes conservan ficha.
  const allPaymentsRemoved = p.finance === "delete";
  // Al liquidar una comunidad completa se liberan las aplicaciones de todos
  // sus recibos, también las de socios que conservan ficha: ese saldo deja de
  // tener una comunidad donde aplicarse y debe conciliarse igualmente.
  const allCommunityPaymentsReleased =
    g.collection === "communities" && p.finance === "liquidate_final";
  const includeAllPayments = allPaymentsRemoved || allCommunityPaymentsReleased;
  for (const payment of financial.payments) {
    if (payment.reversedAt) continue;
    if (!includeAllPayments && !deletingOwners.includes(payment.ownerId)) continue;
    const allocated = db
      .prepare("SELECT COALESCE(SUM(amount),0) n FROM fee_allocations WHERE paymentId=?")
      .get(payment.id).n;
    addCredit(Math.max(0, payment.amount - allocated), currencyOf(payment.communityId));
  }
  if (p.finance === "liquidate_final" && (deletingOwners.length || includeAllPayments)) {
    const ownerPlaceholders = deletingOwners.map(() => "?").join(",");
    for (const receipt of financial.receipts) {
      if (receipt.cancelledAt) continue;
      const paid = includeAllPayments
        ? db
            .prepare(
              `SELECT COALESCE(SUM(a.amount),0) n FROM fee_allocations a
               JOIN fee_payments p ON p.id=a.paymentId
               WHERE a.receiptId=? AND p.reversedAt=''`,
            )
            .get(receipt.id).n
        : db
            .prepare(
              `SELECT COALESCE(SUM(a.amount),0) n FROM fee_allocations a
               JOIN fee_payments p ON p.id=a.paymentId
               WHERE a.receiptId=? AND p.reversedAt='' AND p.ownerId IN (${ownerPlaceholders})`,
            )
            .get(receipt.id, ...deletingOwners).n;
      addCredit(paid, json(receipt.snapshot).currency || currencyOf(receipt.communityId));
    }
  }
  const creditCurrencies = [...creditByCurrency.keys()];
  const creditAmount = [...creditByCurrency.values()].reduce((sum, value) => sum + value, 0);
  if (creditAmount > 0 && creditCurrencies.length > 1)
    fail(
      "El borrado afecta a saldo a favor en varias monedas. Concílialo por comunidad antes de continuar.",
      409,
    );
  const creditPolicies = legalEntries.map((entry) => entry.config.creditoTitular.politica);
  const creditPolicy =
    ["bloquear", "advertir", "permitir"].find((policy) => creditPolicies.includes(policy)) ||
    "bloquear";
  const creditEntry =
    legalEntries.find((entry) => entry.config.creditoTitular.politica === creditPolicy) ||
    legalEntries[0];
  const creditDestination =
    body.creditDestination ?? creditEntry.config.creditoTitular.destinoPorDefecto;
  if (!Object.hasOwn(CREDIT_DESTINATIONS, creditDestination))
    fail("El destino documentado del saldo a favor no es válido.");
  if (body.creditReference !== undefined && typeof body.creditReference !== "string")
    fail("La referencia de la conciliación del saldo a favor no es válida.", 400);
  const creditReference = String(body.creditReference || "")
    .trim()
    .slice(0, 300);
  p.credit = {
    amount: creditAmount,
    currency: creditCurrencies[0] || creditEntry.community.currency || g.root.currency || "EUR",
    policy: creditPolicy,
    destination: creditDestination,
    reference: creditReference,
    required: creditAmount > 0 && creditPolicy === "bloquear",
  };
  if (creditAmount > 0 && creditPolicy === "bloquear") {
    if (p.finance === "delete")
      fail(
        `La operación eliminaría ${formatMoney(creditAmount, p.credit.currency)} de saldo a favor sin conciliar. Concilia o devuelve ese saldo antes de borrar el historial financiero, o cambia la política jurídica de la comunidad.`,
        409,
      );
    if (body.confirmCreditSettlement !== true)
      fail(
        `La operación deja ${formatMoney(creditAmount, p.credit.currency)} de saldo a favor sin conciliar. Documenta su destino (${CREDIT_DESTINATIONS[creditDestination]}) y confirma la conciliación antes de borrar el historial.`,
        409,
      );
    // La vista previa no exige todavía la referencia; se valida al ejecutar.
    if (!options.preview && !creditReference)
      fail(
        "Indica la referencia de la conciliación o del documento que acredita el destino del saldo a favor.",
        400,
      );
  }
  if (p.finance === "delete" && body.confirmDeleteFinancial !== true)
    fail("Marca la confirmación para borrar definitivamente los datos financieros.");
  if (
    ["delete", "liquidate_final"].includes(p.finance) &&
    financial.receipts.some((r) => (json(r.snapshot).owners || []).length > 1) &&
    body.confirmSharedFinancial !== true
  )
    fail("Los recibos compartidos afectan a otros propietarios. Confirma también ese alcance.");
  if (p.finance !== "keep_historical") {
    for (const id of unique(
      [...financial.receipts, ...financial.payments, ...Object.values(g.charges).flat()].map(
        (r) => r.communityId,
      ),
    ))
      permit("fee:manage", id);
  }
  if (p.finance === "reassign_community" || p.posts === "reassign_community") {
    if (g.collection !== "communities")
      fail("El traslado conjunto solo está disponible al eliminar una comunidad.");
    const destinations = unique(
      Object.values(p.properties).map(
        (a) => a.newCommunityId || (a.action === "create_temp_community" ? "temporary" : ""),
      ),
    );
    if (
      destinations.length > 1 ||
      Object.values(p.properties).some(
        (a) => !["reassign_community", "create_temp_community"].includes(a.action),
      )
    )
      fail("Para trasladar el histórico, mueve todos los inmuebles a la misma comunidad.");
    p.destination = a.destinationCommunityId
      ? reference(a.destinationCommunityId)
      : destinations[0];
    if (!p.destination || (destinations.length && p.destination !== destinations[0]))
      fail("Selecciona un destino común para los inmuebles y el histórico.");
    if (p.destination === "temporary" && !temporary)
      fail("Primero selecciona la creación de una comunidad temporal para los inmuebles.");
    if (p.destination === "temporary" && p.finance === "reassign_community") {
      const property = g.properties.find(
        (r) => p.properties[r.id].action === "create_temp_community",
      );
      const currency =
        property.currency ||
        g.communities.find((c) => c.id === property.communityId)?.currency ||
        "EUR";
      if (currency !== (g.root.currency || "EUR"))
        fail("No se puede trasladar el histórico entre monedas diferentes.");
    }
    if (p.destination !== "temporary") {
      const target = db.prepare("SELECT * FROM communities WHERE id=?").get(p.destination);
      if (!target || target.id === g.root.id) fail("La comunidad destino no es válida.");
      permit("community:edit", target.id);
      permit("cascade-delete", target.id);
      if (
        p.finance === "reassign_community" &&
        (target.currency || "EUR") !== (g.root.currency || "EUR")
      )
        fail("No se puede trasladar el histórico entre monedas diferentes.");
      if (p.finance === "reassign_community") permit("fee:manage", p.destination);
      if (p.posts === "reassign_community") permit("comm:publicar", p.destination);
    }
  }
  if (p.finance === "reassign_community") {
    if (body.transferDocument !== undefined && typeof body.transferDocument !== "string")
      fail("La referencia del acuerdo o documento no es válida.", 400);
    const transferDocument = String(body.transferDocument || "")
      .trim()
      .slice(0, 300);
    // Si el borrado afecta a varias comunidades, el traslado debe cumplir la
    // exigencia más estricta: basta que una pida acuerdo o documento, y la
    // deuda se conserva en origen si alguna comunidad así lo exige. La
    // comunidad de destino también puede exigir su propio acuerdo.
    const originCommunities = g.collection === "communities" ? [g.root] : g.communities;
    const destinationCommunity =
      p.destination && p.destination !== "temporary"
        ? db.prepare("SELECT * FROM communities WHERE id=?").get(p.destination)
        : null;
    const transferConfigs = [
      ...(originCommunities.length ? originCommunities : [g.root]),
      ...(destinationCommunity ? [destinationCommunity] : []),
    ].map(legalConfigOf);
    const requiresDocument = transferConfigs.some((config) => config.traslados.exigirDocumento);
    const debtPolicy = transferConfigs.some(
      (config) => config.traslados.deuda === "conservar_origen",
    )
      ? "conservar_origen"
      : "trasladar";
    if (requiresDocument) {
      if (body.confirmLedgerTransfer !== true)
        fail(
          "Trasladar el libro financiero a otra comunidad exige un acuerdo o documento. Confirma que existe antes de continuar.",
          409,
        );
      // La vista previa solo describe el alcance; la referencia se exige al ejecutar.
      if (!options.preview && !transferDocument)
        fail(
          "Indica la referencia del acuerdo o documento que autoriza el traslado del libro financiero.",
          400,
        );
    }
    p.transfer = {
      debtPolicy,
      requiresDocument,
      document: transferDocument,
    };
  }
  if (g.posts.length) permit(p.posts === "delete" ? "comm:eliminar" : "comm:moderar", g.root.id);
  const entities = deletedEntities(g, p);
  for (const [type, row] of entities) {
    const hasDocuments =
      g.documents.some((d) => d.entityType === type && d.entityId === row.id) ||
      Object.keys(json(row.documents)).length > 0;
    if (hasDocuments)
      permit(p.documents === "delete" ? "document:delete" : "document:read", row.id);
  }
  for (const id of deletingOwners)
    for (const [table, permission] of [
      ["owner_notifications", "owner_notification:delete"],
      ["admin_emails", "admin_notification:delete"],
    ])
      if (g.notifications[table].some((n) => n.ownerId === id))
        permit(
          p.notifications === "delete" ? permission : permission.replace(":delete", ":read"),
          table === "admin_emails" ? "" : id,
        );
  const accounts = [];
  if (p.user === "delete_user") {
    permit("admin:users");
    const deleted = {
      owners: entities.filter(([t]) => t === "owner").map(([, r]) => r.id),
      tenants: entities.filter(([t]) => t === "tenant").map(([, r]) => r.id),
      communities: entities.filter(([t]) => t === "community").map(([, r]) => r.id),
    };
    for (const uid of unique(entities.map(([, row]) => row.userId))) {
      const account = db.prepare("SELECT id,usuario,rol FROM users WHERE id=?").get(uid);
      if (!account) continue;
      accounts.push(account);
      const role = db
        .prepare("SELECT nombre FROM roles WHERE id=? OR nombre=?")
        .get(account.rol, account.rol);
      if (uid === user.id) fail("Conserva tu propia cuenta de acceso.");
      if (["super_admin", "administrator"].includes(role?.nombre))
        fail("Conserva las cuentas de administración.");
      for (const [table, column] of [
        ["owners", "userId"],
        ["tenants", "userId"],
        ["communities", "adminUserId"],
      ])
        if (
          db
            .prepare(`SELECT id FROM ${table} WHERE ${column}=?`)
            .all(uid)
            .some((r) => !deleted[table].includes(r.id))
        )
          fail("La cuenta de usuario aún tiene otros perfiles o comunidades asociados.");
    }
  }
  const closed = closedDistributions(g, p, deletingOwners);
  for (const row of closed) permit("fee:manage", row.communityId);
  if (closed.some((row) => row.shared) && body.confirmSharedFinancial !== true)
    fail(
      "Confirma el cierre de los repartos compartidos para nuevas emisiones; los recibos existentes se conservan.",
    );
  return {
    actions: p,
    financial,
    credit: p.credit,
    transfer: p.transfer,
    deletedOwners: deletingOwners,
    deletedProperties,
    closedDistributions: closed,
    accounts,
  };
}

function syncCascadeLinks(changedProperties, changedOwners, tenantProperties) {
  const today = madridDate();
  for (const id of new Set([...changedProperties, ...tenantProperties])) {
    const row = db.prepare("SELECT id FROM properties WHERE id=?").get(id);
    if (!row) continue;
    const tenants = db.prepare("SELECT * FROM tenants WHERE propertyId=? ORDER BY id").all(id);
    db.prepare("UPDATE properties SET tenantIds=? WHERE id=?").run(
      JSON.stringify(tenants.filter((t) => isTenantContractActive(t, today)).map((t) => t.id)),
      id,
    );
  }
  const fields = [
    "communityId",
    "communityName",
    "plot",
    "propertyType",
    "cadastralRef",
    "registryNumber",
    "floor",
    "door",
    "areaM2",
    "participationCoef",
    "propertyUse",
  ];
  for (const id of changedOwners) {
    const owner = db.prepare("SELECT * FROM owners WHERE id=?").get(id);
    if (!owner) continue;
    const properties = db
      .prepare(
        "SELECT p.* FROM properties p WHERE EXISTS (SELECT 1 FROM json_each(p.ownerIds) WHERE value=?) ORDER BY id",
      )
      .all(id);
    const primary = properties.find((p) => p.id === owner.propertyId) || properties[0];
    // La pertenencia del socio es independiente de su inmueble principal.
    // Solo se limpia si su comunidad de censo ya no existe.
    const propertyFields = fields.filter((key) => key !== "communityId" && key !== "communityName");
    const membership =
      owner.isMember &&
      owner.communityId &&
      db.prepare("SELECT 1 FROM communities WHERE id=?").get(owner.communityId);
    const updateFields = primary ? fields : ["communityId", "communityName", ...propertyFields];
    db.prepare(
      `UPDATE owners SET propertyIds=?,propertyId=?,${updateFields.map((k) => `${k}=?`).join(",")} WHERE id=?`,
    ).run(
      JSON.stringify(properties.map((p) => p.id)),
      primary?.id || "",
      ...updateFields.map((key) => {
        if (key === "communityId")
          return owner.isMember
            ? membership
              ? owner.communityId
              : ""
            : primary?.communityId || "";
        if (key === "communityName")
          return owner.isMember
            ? membership
              ? owner.communityName
              : ""
            : primary?.communityName || "";
        return primary?.[key] || "";
      }),
      id,
    );
  }
}

function apply(g, plan, req) {
  const { actions: a, financial, deletedOwners, deletedProperties } = plan;
  const deletedTenants = Object.entries(a.tenants)
    .filter(([, a]) => a.action === "remove_tenant")
    .map(([id]) => id);
  const archivedEntities = deletedEntities(g, a);
  const changedProperties = new Set(),
    changedOwners = new Set(),
    tenantProperties = new Set();
  const fileRemovals = [],
    archiveId = crypto.randomUUID(),
    now = new Date().toISOString();
  const settlement = {
    cancelledReceipts: 0,
    forgiven: 0,
    releasedCredit: 0,
    currency: plan.credit?.currency || g.root.currency || "EUR",
    byCurrency: {},
    creditPolicy: plan.credit?.policy || "",
    creditDestination: plan.credit?.destination || "",
    creditReference: plan.credit?.reference || "",
    creditSettlementConfirmed: req.body?.confirmCreditSettlement === true,
    transferPolicy: plan.transfer?.debtPolicy || "",
    transferRequired: !!plan.transfer?.requiresDocument,
    transferDocument: plan.transfer?.document || "",
  };
  let temporaryId = "";
  if (a.temporaryCommunity) {
    temporaryId = crypto.randomUUID();
    const source = g.properties.find((r) => a.properties[r.id].action === "create_temp_community");
    db.prepare("INSERT INTO communities(id,name,nif,currency,adminUserId) VALUES(?,?,?,?,?)").run(
      temporaryId,
      a.temporaryCommunity.name,
      a.temporaryCommunity.nif,
      source?.currency ||
        g.communities.find((c) => c.id === source?.communityId)?.currency ||
        "EUR",
      req.user.id,
    );
  }
  for (const p of g.relationships) {
    const action = a.properties[p.id] || { action: "keep" };
    if (action.action === "delete_property") {
      changedProperties.add(p.id);
      for (const id of ids(p.ownerIds)) changedOwners.add(id);
      continue;
    }
    const ownerIds = ids(p.ownerIds).filter((id) => !deletedOwners.includes(id));
    const shares = json(p.ownerPercentages);
    const transferred = deletedOwners.reduce((n, id) => n + Number(shares[id] || 0), 0);
    for (const id of deletedOwners) delete shares[id];
    if (action.action === "reassign_owner") {
      if (!ownerIds.includes(action.newOwnerId)) ownerIds.push(action.newOwnerId);
      shares[action.newOwnerId] = Number(shares[action.newOwnerId] || 0) + transferred;
    }
    if (JSON.stringify(ownerIds) !== JSON.stringify(ids(p.ownerIds))) {
      changedProperties.add(p.id);
      for (const id of [...ids(p.ownerIds), ...ownerIds]) changedOwners.add(id);
      if (ownerIds.some((id) => !(Number(shares[id]) > 0)))
        fail(
          "Completa los porcentajes de titularidad antes de transferir un inmueble con datos heredados incompletos.",
        );
      db.prepare("UPDATE properties SET ownerIds=?,ownerPercentages=? WHERE id=?").run(
        JSON.stringify(ownerIds),
        JSON.stringify(shares),
        p.id,
      );
    }
    if (
      ["reassign_community", "create_temp_community"].includes(action.action) ||
      (g.collection === "communities" && action.action === "orphan")
    ) {
      changedProperties.add(p.id);
      for (const id of ownerIds) changedOwners.add(id);
      const cid = action.action === "orphan" ? "" : action.newCommunityId || temporaryId;
      const community = db.prepare("SELECT name FROM communities WHERE id=?").get(cid);
      db.prepare("UPDATE properties SET communityId=?,communityName=? WHERE id=?").run(
        cid,
        community?.name || "",
        p.id,
      );
    }
  }
  for (const t of g.tenants) {
    const action = a.tenants[t.id];
    if (action.action !== "keep" || deletedOwners.includes(t.ownerId)) {
      tenantProperties.add(t.propertyId);
      if (action.newPropertyId) tenantProperties.add(action.newPropertyId);
    }
    if (action.action === "remove_tenant") {
      db.prepare("DELETE FROM tenants WHERE id=?").run(t.id);
      continue;
    }
    if (action.action === "orphan_tenant" || action.action === "end_contract") {
      db.prepare(
        "UPDATE tenants SET propertyId='',ownerId='',contractEnd=CASE WHEN ?='end_contract' THEN ? ELSE contractEnd END WHERE id=?",
      ).run(action.action, madridDate(), t.id);
    } else if (action.action === "reassign_tenant") {
      const target = db
        .prepare("SELECT ownerIds FROM properties WHERE id=?")
        .get(action.newPropertyId);
      const owners = ids(target.ownerIds);
      if (
        !owners.length ||
        owners.some((id) => !db.prepare("SELECT 1 FROM owners WHERE id=?").get(id))
      )
        fail("El inmueble destino debe tener al menos un titular válido para recibir contratos.");
      db.prepare("UPDATE tenants SET propertyId=?,ownerId=? WHERE id=?").run(
        action.newPropertyId,
        owners.includes(t.ownerId)
          ? t.ownerId
          : a.properties[action.newPropertyId]?.newOwnerId || owners[0] || "",
        t.id,
      );
    } else if (deletedOwners.includes(t.ownerId)) {
      const p = db.prepare("SELECT ownerIds FROM properties WHERE id=?").get(t.propertyId);
      db.prepare("UPDATE tenants SET ownerId=? WHERE id=?").run(
        a.properties[t.propertyId]?.newOwnerId || (p ? ids(p.ownerIds)[0] || "" : ""),
        t.id,
      );
    }
  }
  const receiptIds = financial.receipts.map((r) => r.id),
    paymentIds = financial.payments.map((p) => p.id);
  if (a.finance === "liquidate_final") {
    for (const r of financial.receipts.filter((r) => !r.cancelledAt)) {
      const paid = db
        .prepare(
          "SELECT COALESCE(SUM(a.amount),0) n FROM fee_allocations a JOIN fee_payments p ON p.id=a.paymentId WHERE a.receiptId=? AND p.reversedAt=''",
        )
        .get(r.id).n;
      settlement.cancelledReceipts++;
      settlement.forgiven += Math.max(0, r.amount - paid);
      settlement.releasedCredit += paid;
      const currency =
        json(r.snapshot).currency ||
        g.communities.find((c) => c.id === r.communityId)?.currency ||
        "EUR";
      const bucket = (settlement.byCurrency[currency] ||= { forgiven: 0, releasedCredit: 0 });
      bucket.forgiven += Math.max(0, r.amount - paid);
      bucket.releasedCredit += paid;
      db.prepare("UPDATE fee_receipts SET cancelledAt=?,cancellationReason=? WHERE id=?").run(
        now,
        `Liquidación final por borrado avanzado; cobros liberados como saldo a favor. Destino documentado: ${CREDIT_DESTINATIONS[plan.credit?.destination] || "pendiente de conciliar"}.`,
        r.id,
      );
      db.prepare("DELETE FROM fee_allocations WHERE receiptId=?").run(r.id);
    }
    if (g.collection === "communities")
      for (const table of ["fee_assessments", "service_bills"])
        db.prepare(
          `UPDATE ${table} SET cancelledAt=?,cancellationReason=? WHERE communityId=? AND cancelledAt=''`,
        ).run(now, "Liquidación final por borrado avanzado", g.root.id);
  }
  if (a.finance === "delete") {
    for (const r of g.financialChildren.fee_proofs.filter(
      (r) => receiptIds.includes(r.receiptId) || deletedOwners.includes(r.ownerId),
    )) {
      fileRemovals.push(path.join("fee-proofs", r.diskName));
      db.prepare("DELETE FROM fee_proofs WHERE id=?").run(r.id);
    }
    for (const e of g.financialChildren.fee_events.filter(
      (e) => receiptIds.includes(e.receiptId) || deletedOwners.includes(e.ownerId),
    )) {
      db.prepare("DELETE FROM fee_mail WHERE eventId=?").run(e.id);
      db.prepare("DELETE FROM fee_events WHERE id=?").run(e.id);
    }
    for (const table of ["owner_notifications", "admin_emails"])
      db.prepare(`DELETE FROM ${table} WHERE feeReceiptId IN (SELECT value FROM json_each(?))`).run(
        JSON.stringify(receiptIds),
      );
    for (const id of receiptIds) {
      db.prepare("DELETE FROM fee_allocations WHERE receiptId=?").run(id);
      db.prepare("DELETE FROM fee_receipts WHERE id=?").run(id);
    }
    for (const id of paymentIds) {
      db.prepare("DELETE FROM fee_allocations WHERE paymentId=?").run(id);
      db.prepare("DELETE FROM fee_payments WHERE id=?").run(id);
    }
    if (g.collection === "communities") {
      for (const r of g.financialChildren.service_attachments.filter((r) =>
        g.charges.service_bills.some((s) => s.id === r.serviceBillId),
      )) {
        fileRemovals.push(path.join("service-bills", r.diskName));
        db.prepare("DELETE FROM service_attachments WHERE id=?").run(r.id);
      }
      for (const table of ["fee_plans", "fee_assessments", "service_bills"])
        db.prepare(`DELETE FROM ${table} WHERE communityId=?`).run(g.root.id);
    }
  }
  const destination = a.destination === "temporary" ? temporaryId : a.destination;
  if (a.finance === "reassign_community") {
    for (const table of [
      "fee_plans",
      "fee_assessments",
      "service_bills",
      "fee_receipts",
      "fee_payments",
    ])
      db.prepare(`UPDATE ${table} SET communityId=? WHERE communityId=?`).run(
        destination,
        g.root.id,
      );
  }
  // Stop queued mail referring to a deleted profile/community; retained events
  // and financial snapshots remain historical, without creating new messages.
  for (const e of g.financialChildren.fee_events)
    if (
      deletedOwners.includes(e.ownerId) ||
      g.receipts.some((r) => r.id === e.receiptId && deletedProperties.includes(r.propertyId)) ||
      (g.collection === "communities" && a.finance !== "reassign_community")
    )
      db.prepare(
        "UPDATE fee_mail SET state='cancelled',updatedAt=? WHERE eventId=? AND state='pending'",
      ).run(now, e.id);
  if (g.collection === "communities")
    for (const post of g.posts) {
      if (a.posts === "delete") {
        for (const table of Object.keys(g.postChildren))
          db.prepare(`DELETE FROM ${table} WHERE postId=?`).run(post.id);
        db.prepare("DELETE FROM communication_posts WHERE id=?").run(post.id);
      } else if (a.posts === "reassign_community") {
        const data = json(post.data);
        data.communityId = destination;
        db.prepare(
          "UPDATE communication_posts SET communityId=?,data=?,updatedAt=?,version=version+1 WHERE id=?",
        ).run(destination, JSON.stringify(data), now, post.id);
        db.prepare(
          "UPDATE communication_outbox SET state='cancelled',updatedAt=? WHERE postId=? AND state='pending'",
        ).run(now, post.id);
      } else {
        // Keep full content in the archive rather than an inaccessible live post.
        for (const table of Object.keys(g.postChildren))
          if (table !== "communication_files")
            db.prepare(`DELETE FROM ${table} WHERE postId=?`).run(post.id);
        db.prepare("UPDATE communication_posts SET communityId=? WHERE id=?").run(
          `archive:${archiveId}`,
          post.id,
        );
      }
    }
  const preserved = [];
  for (const [type, entity] of archivedEntities) {
    const docs = g.documents.filter((d) => d.entityType === type && d.entityId === entity.id);
    if (a.documents === "delete") {
      fileRemovals.push(...docs.map((d) => d.storedName));
      db.prepare("DELETE FROM documents WHERE entityType=? AND entityId=?").run(type, entity.id);
      db.prepare("DELETE FROM document_folders WHERE entityType=? AND entityId=?").run(
        type,
        entity.id,
      );
    } else {
      preserved.push({ type, ...entity });
      db.prepare(
        "UPDATE documents SET entityType='cascade_archive',entityId=? WHERE entityType=? AND entityId=?",
      ).run(archiveId, type, entity.id);
      db.prepare(
        "UPDATE document_folders SET entityType='cascade_archive',entityId=? WHERE entityType=? AND entityId=?",
      ).run(archiveId, type, entity.id);
    }
  }
  for (const id of deletedOwners) {
    // Kept notifications are available in the archive, not orphaned in the live inbox.
    for (const table of ["owner_notifications", "admin_emails"])
      db.prepare(`DELETE FROM ${table} WHERE ownerId=?`).run(id);
    db.prepare("DELETE FROM owners WHERE id=?").run(id);
  }
  for (const id of deletedProperties) db.prepare("DELETE FROM properties WHERE id=?").run(id);
  if (g.collection === "communities")
    db.prepare("DELETE FROM communities WHERE id=?").run(g.root.id);
  // Update only the links participating in this plan. Do not run global repairs
  // while executing a scoped delete.
  if (g.collection === "communities")
    for (const owner of g.owners) if (owner.communityId === g.root.id) changedOwners.add(owner.id);
  syncCascadeLinks(changedProperties, changedOwners, tenantProperties);
  if (a.user === "delete_user")
    for (const uid of unique(archivedEntities.map(([, e]) => e.userId))) {
      db.prepare("DELETE FROM sessions WHERE userId=?").run(uid);
      db.prepare("DELETE FROM password_recovery_mail WHERE userId=?").run(uid);
      db.prepare("DELETE FROM communication_preferences WHERE userId=?").run(uid);
      db.prepare(
        "UPDATE communication_outbox SET state='cancelled',updatedAt=? WHERE userId=? AND state='pending'",
      ).run(now, uid);
      db.prepare("DELETE FROM users WHERE id=?").run(uid);
    }
  for (const row of plan.closedDistributions)
    db.prepare(
      `UPDATE ${row.table} SET cancelledAt=?,cancellationReason=? WHERE id=? AND cancelledAt=''`,
    ).run(
      now,
      "Cierre para nuevas emisiones por retirada o traslado de inmuebles; recibos emitidos conservados",
      row.id,
    );
  const archive = {
    entity: { type: TYPES[g.collection], id: g.root.id, name: label(g.root) },
    actions: a,
    affected: Object.fromEntries(
      ["owners", "properties", "tenants"].map((key) => [
        key,
        g[key].map((row) => ({ id: row.id, name: label(row) })),
      ]),
    ),
    entities: preserved,
    deletedAccounts: plan.accounts,
    requiredPermissions: unique([
      `${TYPES[g.collection]}:read`,
      ...(g.owners.length ? ["owner:read"] : []),
      ...(g.tenants.length ? ["tenant:read"] : []),
      ...(g.properties.length ? ["property:read"] : []),
      ...(a.finance !== "delete" &&
      (financial.receipts.length ||
        financial.payments.length ||
        plan.closedDistributions.length ||
        g.collection === "communities")
        ? ["fee:read"]
        : []),
      ...(a.posts === "keep_historical" && g.posts.length ? ["comm:moderar"] : []),
      ...(a.notifications === "keep" &&
      g.notifications.owner_notifications.some((n) => deletedOwners.includes(n.ownerId))
        ? ["owner_notification:read"]
        : []),
      ...(a.notifications === "keep" &&
      g.notifications.admin_emails.some((n) => deletedOwners.includes(n.ownerId))
        ? ["admin_notification:read"]
        : []),
    ]),
    closedDistributions: plan.closedDistributions,
    settlement,
    financial:
      a.finance === "delete"
        ? null
        : {
            ...financial,
            allocations: g.allocations.filter(
              (r) =>
                financial.receipts.some((receipt) => receipt.id === r.receiptId) ||
                financial.payments.some((payment) => payment.id === r.paymentId),
            ),
            charges: Object.fromEntries(
              Object.entries(g.charges).map(([table, rows]) => [
                table,
                rows.filter(
                  (row) =>
                    (g.collection === "communities" && row.communityId === g.root.id) ||
                    plan.closedDistributions.some((c) => c.table === table && c.id === row.id) ||
                    financial.receipts.some(
                      (r) =>
                        r.planId === row.id ||
                        r.assessmentId === row.id ||
                        r.serviceBillId === row.id,
                    ),
                ),
              ]),
            ),
          },
    notifications:
      a.notifications === "keep"
        ? Object.fromEntries(
            Object.entries(g.notifications).map(([k, rows]) => [
              k,
              rows.filter((n) => deletedOwners.includes(n.ownerId)),
            ]),
          )
        : {},
    posts: a.posts === "keep_historical" ? g.posts : [],
    postChildren:
      a.posts === "keep_historical"
        ? Object.fromEntries(
            Object.entries(g.postChildren).filter(([k]) => k !== "communication_files"),
          )
        : {},
  };
  db.prepare("INSERT INTO cascade_archives VALUES(?,?,?,?,?)").run(
    archiveId,
    now,
    req.user.id,
    JSON.stringify(g.communityIds),
    JSON.stringify(archive),
  );
  recordAudit({
    actor: req.user,
    action: `${g.collection}.cascade-deleted`,
    resourceType: TYPES[g.collection],
    resourceId: g.root.id,
    req,
    details: {
      archiveId,
      actions: a,
      deletedOwners,
      deletedProperties,
      deletedTenants,
      financial: totals(g, financial),
      settlement,
      credit: plan.credit,
      transfer: plan.transfer,
      closedDistributions: plan.closedDistributions,
    },
  });
  for (const name of unique(fileRemovals)) queueUploadCleanup(name);
  return { result: { ok: true, archiveId, temporaryCommunityId: temporaryId, settlement } };
}
export function registerCascadeRoutes(router, collection) {
  router.get("/:id/cascade-preview", (req, res, next) => {
    try {
      res.json(preview(graph(collection, req.params.id), req.user));
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
  router.post("/:id/cascade-preview", (req, res, next) => {
    try {
      const g = graph(collection, req.params.id);
      // The review is read-only. Confirmations are required again on DELETE.
      const p = plan(
        g,
        {
          ...req.body,
          confirmDelete: true,
          confirmGlobalDelete: true,
          confirmDeleteFinancial: true,
          confirmSharedFinancial: true,
          confirmCreditSettlement: true,
          confirmLedgerTransfer: true,
        },
        req.user,
        { preview: true },
      );
      const receiptIds = p.financial.receipts.map((r) => r.id),
        paymentIds = p.financial.payments.map((r) => r.id);
      res.json({
        executionToken: executionToken(g, p, req.user),
        finance: totals(g, p.financial),
        deletedOwners: p.deletedOwners,
        deletedProperties: p.deletedProperties,
        requiresGlobalDelete: p.deletedOwners.some((id) => ownerCommunities(g, id).length > 1),
        requiresSharedFinancial:
          (["delete", "liquidate_final"].includes(p.actions.finance) &&
            p.financial.receipts.some((r) => (json(r.snapshot).owners || []).length > 1)) ||
          p.closedDistributions.some((row) => row.shared),
        credit: p.credit,
        requiresCreditSettlement: p.credit.required,
        requiresLedgerTransfer: p.actions.finance === "reassign_community",
        transfer: p.transfer || null,
        closedDistributions: p.closedDistributions,
        accounts: p.accounts,
        otherReceiptsAffected:
          p.actions.finance === "delete"
            ? unique(
                g.allocations
                  .filter(
                    (a) => paymentIds.includes(a.paymentId) && !receiptIds.includes(a.receiptId),
                  )
                  .map((a) => a.receiptId),
              ).length
            : 0,
      });
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
  router.delete("/:id", (req, res, next) => {
    if (req.query.cascade !== "true") return next();
    let started = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      started = true;
      const g = graph(collection, req.params.id),
        p = plan(g, req.body, req.user);
      if (!req.body.executionToken)
        fail("Revisa el resumen final antes de ejecutar la operación.", 428);
      if (req.body.executionToken !== executionToken(g, p, req.user)) stale();
      const { result } = apply(g, p, req);
      db.exec("COMMIT");
      started = false;
      const cleanup = processFeeProofCleanup();
      res.json({ ...result, cleanup });
    } catch (error) {
      if (started) db.exec("ROLLBACK");
      if (error.status)
        return res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      if (error.code?.startsWith("ERR_SQLITE") && /UNIQUE constraint/.test(error.message))
        return res
          .status(409)
          .json({ error: "El destino tiene registros incompatibles. No se aplicó ningún cambio." });
      next(error);
    }
  });
}

export function registerCascadeArchives(router) {
  function archiveFor(req, id) {
    const row = db.prepare("SELECT * FROM cascade_archives WHERE id=?").get(id);
    if (!row) fail("Histórico no encontrado.", 404);
    const policy = policyData();
    const role = policy.roles.find((r) => r.id === req.user.rol || r.nombre === req.user.rol);
    const creatorPermission = (permission) =>
      row.actorId === req.user.id && role?.permisos?.includes(permission);
    const data = json(row.data);
    for (const permission of data.requiredPermissions || [])
      if (!allowed(req.user, permission, "", policy) && !creatorPermission(permission))
        fail("Ya no tienes los permisos necesarios para consultar este histórico.", 403);
    if (
      !(
        allowed(req.user, "cascade-delete", "", policy) ||
        allowed(req.user, "audit:read", "", policy) ||
        creatorPermission("cascade-delete")
      ) ||
      !(allowed(req.user, "document:read", "", policy) || creatorPermission("document:read"))
    )
      fail("No tienes permiso para consultar este histórico.", 403);
    // Scoped roles cannot access an archive of a community they no longer manage.
    for (const cid of ids(row.communityIds))
      if (
        !allowed(req.user, "community:read", cid, policy) &&
        !(row.actorId === req.user.id && !policy.communities.some((c) => c.id === cid))
      )
        fail("Histórico fuera de tu ámbito.", 403);
    return { ...row, data };
  }
  router.get("/cascade-archives", (req, res, next) => {
    try {
      const offset = Number(req.query.offset || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) fail("Página no válida.");
      const rows = db
        .prepare("SELECT id FROM cascade_archives ORDER BY createdAt DESC,id LIMIT 50 OFFSET ?")
        .all(offset);
      const items = [];
      for (const { id } of rows) {
        try {
          const row = archiveFor(req, id);
          items.push({ id, createdAt: row.createdAt, entity: row.data.entity });
        } catch (e) {
          if (e.status !== 403) throw e;
        }
      }
      res.json({ items, nextOffset: rows.length === 50 ? offset + 50 : null });
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
  router.get("/cascade-archives/:id", (req, res, next) => {
    try {
      const row = archiveFor(req, req.params.id);
      res.json({
        ...row.data,
        embeddedDocuments: row.data.entities.flatMap((entity, entityIndex) =>
          Object.entries(json(entity.documents))
            .filter(
              ([, doc]) => typeof doc?.dataUrl === "string" && doc.dataUrl.startsWith("data:"),
            )
            .map(([key, doc]) => ({ entityIndex, key, fileName: doc.fileName || key })),
        ),
        createdAt: row.createdAt,
        documents: db
          .prepare(
            "SELECT id,fileName FROM documents WHERE entityType='cascade_archive' AND entityId=?",
          )
          .all(row.id),
        communicationFiles: db
          .prepare(
            "SELECT id,postId,name FROM communication_files WHERE postId IN (SELECT value FROM json_each(?))",
          )
          .all(JSON.stringify(row.data.posts.map((p) => p.id))),
      });
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
  router.get("/cascade-archives/:id/embedded/:entityIndex/:key", (req, res, next) => {
    try {
      const archive = archiveFor(req, req.params.id),
        index = Number(req.params.entityIndex);
      if (!Number.isSafeInteger(index) || index < 0) fail("Documento no encontrado.", 404);
      const entity = archive.data.entities[index];
      const documents = entity ? json(entity.documents) : {};
      const doc = Object.hasOwn(documents, req.params.key) ? documents[req.params.key] : null;
      const match = typeof doc?.dataUrl === "string" && /^data:([^,]*),(.*)$/s.exec(doc.dataUrl);
      if (!match) fail("Documento no encontrado.", 404);
      const bytes = /;base64(?:;|$)/i.test(match[1])
        ? Buffer.from(match[2], "base64")
        : Buffer.from(decodeURIComponent(match[2]));
      res
        .attachment(doc.fileName || req.params.key)
        .type("application/octet-stream")
        .send(bytes);
    } catch (error) {
      if (error.status) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  });
  router.get("/cascade-archives/:id/communications/:fileId", (req, res, next) => {
    try {
      const archive = archiveFor(req, req.params.id);
      const file = db
        .prepare("SELECT * FROM communication_files WHERE id=?")
        .get(req.params.fileId);
      if (!file || !archive.data.posts.some((p) => p.id === file.postId))
        fail("Adjunto no encontrado.", 404);
      res.attachment(file.name).type("application/octet-stream").send(Buffer.from(file.content));
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
  router.get("/cascade-archives/:id/files/:fileId", (req, res, next) => {
    try {
      archiveFor(req, req.params.id);
      const doc = db
        .prepare(
          "SELECT * FROM documents WHERE id=? AND entityType='cascade_archive' AND entityId=?",
        )
        .get(req.params.fileId, req.params.id);
      if (!doc || path.basename(doc.storedName) !== doc.storedName)
        fail("Documento no encontrado.", 404);
      res.download(path.join(UPLOADS_DIR, doc.storedName), doc.fileName);
    } catch (error) {
      if (error.status)
        res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      else next(error);
    }
  });
}
