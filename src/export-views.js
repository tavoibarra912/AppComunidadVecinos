import { richTextToPlainText } from "./rich-text.js";
// Authorized projections for the existing application views. No credentials,
// embedded files or storage paths are included in an exportable row.
import {
  db,
  listUsers,
  listRoles,
  listDocumentsForEntities,
  listDocumentFoldersForEntities,
  listAdminEmails,
  listOwnerNotifications,
} from "./db.js";
import { allowed, policyData, visibleData } from "./security.js";
import {
  canReadReceipt,
  canManage,
  receiptView,
  paymentView,
  assessmentView,
  plans,
} from "./fees.js";
import { serviceView, informativeServicesFor } from "./services.js";
import { allPosts, canRead, canPublish, detail, phase } from "./communication-store.js";

const name = (row) => (row ? `${row.name || ""} ${row.surname || ""}`.trim() : "");
const col = (key, label, type = "string") => ({ key, label, type });
const fields = (spec) => spec.map(([key, label, type]) => col(key, label, type));
const table = (id, title, readPermission, exportPermission, columns, fetchData, extra = {}) => ({
  id,
  title,
  pantalla: title,
  readPermission,
  exportPermission,
  columns: fields(columns),
  fetchData,
  formats: ["pdf", "xlsx", "csv"],
  maxRows: 5000,
  source: "Base de datos de la aplicación",
  scope: "Permisos efectivos por recurso",
  ...extra,
});
const context = (user) => {
  const policy = policyData();
  return {
    policy,
    visible: visibleData(user, policy),
    permits: (p, id = "") => allowed(user, p, id, policy),
  };
};
const euro = (cents) => Number(cents || 0) / 100;
const docStatus = (owner) => {
  const docs = owner.documents || {},
    keys = ["dni", "bankReceipt", "propertyDeed"],
    uploaded = keys.filter((k) => docs[k]);
  if (uploaded.some((k) => docs[k].adminApproval?.status === "rejected")) return "❌ Rechazada";
  if (keys.every((k) => docs[k]?.adminApproval?.status === "approved")) return "✓ Aprobada (3/3)";
  return uploaded.length === 3
    ? "⏳ Pendiente Admin (3/3)"
    : uploaded.length
      ? `⚠️ Incompleta (${uploaded.length}/3)`
      : "⚪ Sin documentos (0/3)";
};
function linkedProperties(o, visible) {
  const ids = new Set([...(o.propertyIds || []), o.propertyId]);
  return visible.properties.filter((p) => ids.has(p.id) || (p.ownerIds || []).includes(o.id));
}
function receiptRows(user) {
  const { policy } = context(user);
  return db
    .prepare("SELECT * FROM fee_receipts ORDER BY period DESC,createdAt DESC")
    .all()
    .filter((r) => canReadReceipt(user, r, policy))
    .map((r) => receiptView(r));
}
export const receiptLabels = {
  paid: "Pagado",
  partial: "Pago parcial",
  overdue: "Vencido",
  pending: "Pendiente",
  cancelled: "Anulado",
};
const projectionReceipt = (r) => ({
  id: r.id,
  communityId: r.communityId,
  propertyId: r.propertyId,
  ownerIds: r.snapshot.owners.map((o) => o.id),
  assessmentId: r.assessmentId,
  serviceBillId: r.serviceBillId,
  kind: r.kind,
  period: r.period,
  rawStatus: r.status,
  returned: r.returned,
  property: r.snapshot.property,
  community: r.snapshot.community,
  location: `${r.snapshot.property} · ${r.snapshot.community}`,
  concept: r.concept || r.period,
  dueDate: r.dueDate,
  amount: euro(r.amount),
  paid: euro(r.paid),
  outstanding: euro(r.outstanding),
  status: receiptLabels[r.status],
  owners: r.snapshot.owners.map((o) => o.name).join(", "),
});
const receiptColumns = [
  ["location", "Comunidad / inmueble"],
  ["concept", "Concepto"],
  ["dueDate", "Vencimiento", "date"],
  ["amount", "Importe (€)", "currency"],
  ["outstanding", "Pendiente (€)", "currency"],
  ["status", "Estado"],
  ["paid", "Cobrado (€)", "currency"],
  ["owners", "Titulares"],
  ["property", "Inmueble"],
  ["community", "Comunidad"],
];
export const TABLE_VIEWS = {
  communities: table(
    "communities",
    "Comunidades",
    "community:read",
    "community:export",
    [
      ["name", "Comunidad"],
      ["nif", "NIF"],
      ["address", "Dirección"],
      ["city", "Municipio"],
      ["province", "Provincia"],
      ["postalCode", "C. Postal"],
      ["email", "Email"],
      ["phone", "Teléfono"],
      ["properties", "Inmuebles", "number"],
    ],
    (user) => {
      const { visible, permits } = context(user);
      return visible.communities.map((c) => ({
        ...Object.fromEntries(
          ["id", "name", "nif", "address", "city", "province", "postalCode", "email", "phone"].map(
            (k) => [k, c[k] || ""],
          ),
        ),
        communityId: c.id,
        __groupValues: { name: c.name },
        name: c.name + (c.notes ? "\n" + richTextToPlainText(c.notes) : ""),
        properties: visible.properties.filter((p) => p.communityId === c.id).length,
      }));
    },
  ),
  properties: table(
    "properties",
    "Inmuebles",
    "property:read",
    "property:export",
    [
      ["community", "Comunidad"],
      ["plot", "Inmueble"],
      ["address", "Dirección"],
      ["city", "Municipio"],
      ["owners", "Propietario(s)"],
      ["tenants", "Inquilino(s)"],
      ["receipts", "Estado recibos"],
      ["documents", "Documentación", "number"],
    ],
    (user) => {
      const { visible, permits } = context(user);
      return visible.properties.map((p) => ({
        id: p.id,
        __groupValues: { plot: p.plot },
        communityId: p.communityId,
        community:
          visible.communities.find((c) => c.id === p.communityId)?.name ||
          p.communityName ||
          "Sin comunidad",
        plot: `${p.plot || "Inmueble"} · ${{ parcela: "Parcela", vivienda: "Vivienda", local: "Local", garaje: "Plaza de garaje", trastero: "Trastero" }[p.propertyType] || "Inmueble"}${(p.ownerIds || []).length ? "" : " · Sin propietario"}`,
        address: p.address,
        city: visible.communities.find((c) => c.id === p.communityId)?.city || "",
        owners:
          visible.owners
            .filter((o) => (p.ownerIds || []).includes(o.id))
            .map(name)
            .join(", ") || "Sin propietario",
        tenants:
          visible.tenants
            .filter(
              (t) =>
                t.propertyId === p.id &&
                (!t.contractStart || t.contractStart <= new Date().toISOString().slice(0, 10)) &&
                (!t.contractEnd || t.contractEnd >= new Date().toISOString().slice(0, 10)),
            )
            .map(name)
            .join(", ") || "Sin inquilino",
        receipts: p.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente",
        documents: permits("document:read", p.id)
          ? listDocumentsForEntities("property", [p.id]).length
          : 0,
      }));
    },
  ),
  owners: table(
    "owners",
    "Propietarios",
    "owner:read",
    "owner:export",
    [
      ["community", "Comunidad"],
      ["properties", "Inmueble"],
      ["name", "Propietario"],
      ["dni", "DNI / NIE / CIF"],
      ["address", "Dirección"],
      ["city", "Municipio"],
      ["member", "Condición"],
      ["docs", "Documentación"],
      ["contact", "Contacto"],
    ],
    (user) => {
      const { visible, permits } = context(user);
      return visible.owners
        .filter((o) => permits("owner:read", o.id))
        .map((o) => {
          const props = linkedProperties(o, visible);
          return {
            id: o.id,
            __groupValues: { name: `${o.name} ${o.surname}` },
            communityIds: [...new Set(props.map((p) => p.communityId))],
            community:
              [
                ...new Set(
                  props
                    .map(
                      (p) =>
                        p.communityName ||
                        visible.communities.find((c) => c.id === p.communityId)?.name,
                    )
                    .filter(Boolean),
                ),
              ].join(", ") || "Sin comunidad",
            properties: props.map((p) => p.plot).join(", ") || "Sin inmuebles",
            name: name(o) + (o.notes ? "\n" + richTextToPlainText(o.notes) : ""),
            dni: o.dni,
            address: o.address,
            city: o.city,
            member: o.isMember ? "Asociado" : "No asociado",
            docs: docStatus(o),
            contact: `${o.phone || ""} ${o.email || ""}`,
          };
        });
    },
  ),
  tenants: table(
    "tenants",
    "Inquilinos",
    "tenant:read",
    "tenant:export",
    [
      ["name", "Inquilino"],
      ["owner", "Propietario"],
      ["property", "Unidad"],
      ["contract", "Contrato"],
    ],
    (user) => {
      const { visible, permits } = context(user);
      return visible.tenants.map((t) => {
        const p = visible.properties.find((p) => p.id === t.propertyId);
        return {
          id: t.id,
          __groupValues: { name: `${t.name} ${t.surname} ${t.documentId || ""}` },
          communityId: p?.communityId || "",
          name: name(t),
          owner: name(visible.owners.find((o) => o.id === t.ownerId)),
          property: p?.plot || "",
          contract: `${t.contractStart || ""} ${t.contractEnd || ""}`,
        };
      });
    },
  ),
  users: table(
    "users",
    "Usuarios",
    "admin:users",
    "admin:export",
    [
      ["usuario", "Usuario"],
      ["email", "Email"],
      ["rol", "Rol"],
      ["activo", "Estado"],
      ["perfiles", "Perfiles"],
    ],
    (user) => {
      const { visible } = context(user);
      return listUsers().map((u) => ({
        id: u.id,
        usuario: [u.usuario, `${u.nombre || ""} ${u.apellido || ""}`.trim()]
          .filter(Boolean)
          .join("\n"),
        __groupValues: { usuario: u.usuario },
        email: u.email,
        rol: u.rol,
        activo: u.activo ? "Activo" : "Inactivo",
        perfiles:
          [
            visible.owners.some((o) => o.userId === u.id) ? "Propietario" : "",
            visible.tenants.some((t) => t.userId === u.id) ? "Inquilino" : "",
            visible.communities.some((c) => c.adminUserId === u.id) ? "Admin de Comunidad" : "",
          ]
            .filter(Boolean)
            .join(", ") || "—",
      }));
    },
  ),
  roles: table(
    "roles",
    "Roles",
    "admin:roles",
    "admin:export",
    [
      ["nombre", "Rol"],
      ["descripcion", "Descripción"],
      ["permisos", "Permisos", "number"],
      ["usuarios", "Usuarios", "number"],
    ],
    (user) => {
      const users = context(user).visible.users;
      return listRoles().map((r) => ({
        id: r.id,
        nombre: r.nombre + (r.sistema ? " · Sistema" : ""),
        __groupValues: { nombre: r.nombre },
        descripcion: r.descripcion || "—",
        permisos: r.permisos.length,
        usuarios: users.filter((u) => u.rol === r.nombre).length,
      }));
    },
  ),
  receipts: table(
    "receipts",
    "Cuotas y recibos",
    "fee:read",
    "fee:export",
    receiptColumns,
    (user) => receiptRows(user).map(projectionReceipt),
  ),
  payments: table(
    "payments",
    "Cobros y devoluciones",
    "fee:read",
    "fee:export",
    [
      ["paidOn", "Fecha", "date"],
      ["owner", "Pagador"],
      ["amount", "Importe (€)", "currency"],
      ["credit", "Disponible (€)", "currency"],
      ["method", "Forma"],
      ["reference", "Referencia"],
      ["status", "Estado"],
    ],
    (user) => {
      const { policy, permits } = context(user);
      const own = new Set(policy.owners.filter((o) => o.userId === user.id).map((o) => o.id));
      return db
        .prepare("SELECT * FROM fee_payments ORDER BY createdAt DESC")
        .all()
        .filter(
          (p) =>
            canManage(user, p.communityId, policy) || (permits("fee:read") && own.has(p.ownerId)),
        )
        .map((p) => {
          const v = paymentView(p);
          return {
            id: p.id,
            communityId: p.communityId,
            ownerId: p.ownerId,
            paidOn: p.paidOn,
            owner: name(policy.owners.find((o) => o.id === p.ownerId)),
            amount: euro(p.amount),
            credit: euro(v.credit),
            method:
              {
                transfer: "Transferencia",
                deposit: "Ingreso en cuenta",
                direct_debit: "Domiciliación confirmada",
              }[p.method] || p.method,
            reference: p.reference,
            status: p.reversedAt ? "Devuelto" : "Registrado",
          };
        });
    },
  ),
  assessments: table(
    "assessments",
    "Derramas",
    "fee:manage",
    "fee:export",
    [
      ["name", "Derrama"],
      ["totalAmount", "Total (€)", "currency"],
      ["installments", "Plazos", "number"],
      ["issued", "Emitido (€)", "currency"],
      ["paid", "Cobrado (€)", "currency"],
      ["status", "Estado"],
    ],
    (user) => {
      const { policy, permits } = context(user);
      return db
        .prepare("SELECT * FROM fee_assessments ORDER BY createdAt DESC")
        .all()
        .filter((r) => canManage(user, r.communityId, policy))
        .map((r) => {
          const a = assessmentView(r);
          return {
            id: a.id,
            communityId: a.communityId,
            name: a.name,
            totalAmount: euro(a.totalAmount),
            installments: a.installments.length,
            issued: euro(a.totals.issued),
            paid: euro(a.totals.paid),
            status: {
              draft: "Borrador",
              active: "En curso",
              collected: "Cobrada",
              cancelled: "Anulada",
            }[a.status],
          };
        });
    },
  ),
  services: table(
    "services",
    "Suministros",
    "fee:manage",
    "fee:export",
    [
      ["concept", "Servicio"],
      ["supplier", "Proveedor"],
      ["period", "Periodo"],
      ["dueDate", "Vencimiento", "date"],
      ["totalAmount", "Factura (€)", "currency"],
      ["paid", "Cobrado (€)", "currency"],
      ["outstanding", "Pendiente (€)", "currency"],
      ["status", "Estado"],
    ],
    (user) => {
      const { policy, permits } = context(user);
      return db
        .prepare("SELECT * FROM service_bills ORDER BY createdAt DESC")
        .all()
        .filter((r) => canManage(user, r.communityId, policy))
        .map((r) => {
          const s = serviceView(r);
          return {
            id: s.id,
            communityId: s.communityId,
            concept: s.concept,
            supplier: s.supplier,
            period: s.period,
            dueDate: s.dueDate,
            totalAmount: euro(s.totalAmount),
            paid: euro(s.totals.paid),
            outstanding: euro(s.totals.outstanding),
            status: {
              draft: "Borrador",
              issued: "Emitido",
              informative: "Solo reparto",
              partial: "Pago parcial",
              paid: "Pagado",
              overdue: "Vencido",
              cancelled: "Anulado",
            }[s.status],
          };
        });
    },
  ),
  plans: table(
    "plans",
    "Acuerdos de cuotas",
    "fee:manage",
    "fee:export",
    [
      ["effectiveFrom", "Desde", "date"],
      ["annualAmount", "Recaudación anual (€)", "currency"],
      ["months", "Periodicidad (meses)", "number"],
      ["agreement", "Acuerdo"],
    ],
    (user) => {
      const { visible, permits, policy } = context(user);
      return visible.communities
        .filter((c) => canManage(user, c.id, policy))
        .flatMap((c) =>
          plans(c.id).map((p) => ({
            id: p.id,
            communityId: c.id,
            effectiveFrom: p.effectiveFrom,
            annualAmount: euro(p.annualAmount),
            months: p.months,
            agreement: p.agreement,
          })),
        );
    },
  ),
  communications: table(
    "communications",
    "Comunicaciones",
    "comm:participacion",
    "comm:export",
    [
      ["title", "Título"],
      ["body", "Contenido"],
      ["communityName", "Comunidad"],
      ["type", "Tipo"],
      ["status", "Estado"],
      ["publishAt", "Publicación", "date"],
      ["startsAt", "Inicio", "date"],
      ["priority", "Prioridad"],
    ],
    (user) => {
      const { policy, permits } = context(user);
      return allPosts()
        .filter((p) => canRead(user, p, policy))
        .map((p) => ({
          id: p.id,
          communityId: p.communityId,
          title: p.title,
          body: p.body,
          communityName: policy.communities.find((c) => c.id === p.communityId)?.name || "",
          type: p.type,
          status: phase(p),
          publishAt: p.publishAt,
          startsAt: p.startsAt,
          priority: p.priority,
        }));
    },
  ),
  documents: table(
    "documents",
    "Biblioteca documental",
    "document:read",
    "document:export",
    [
      ["fileName", "Nombre"],
      ["kind", "Tipo"],
      ["fileSize", "Tamaño (bytes)", "number"],
      ["uploadedAt", "Fecha", "date"],
      ["uploadedByName", "Subido por"],
      ["folderId", "Carpeta"],
    ],
    (user, filters = {}) => {
      const { visible, permits } = context(user);
      const output = [];
      for (const [kind, entities] of [
        ["community", visible.communities],
        ["property", visible.properties],
        ["owner", visible.owners],
        ["tenant", visible.tenants],
      ]) {
        const ids = entities.filter((e) => permits("document:read", e.id)).map((e) => e.id);
        for (const category of ["document", "statutes"]) {
          if (kind !== "community" && category === "statutes") continue;
          output.push(
            ...listDocumentsForEntities(kind, ids, category).map((d) => ({
              id: d.id,
              entityType: kind,
              entityId: d.entityId,
              category,
              folderId: d.folderId,
              fileName: d.fileName,
              kind: "Documento",
              fileSize: d.fileSize,
              uploadedAt: d.uploadedAt,
              uploadedByName: d.uploadedByName,
            })),
          );
        }
        output.push(
          ...listDocumentFoldersForEntities(kind, ids).map((f) => ({
            id: f.id,
            entityType: kind,
            entityId: f.entityId,
            category: f.category,
            folderId: f.parentId,
            fileName: f.name,
            kind: "Carpeta",
            fileSize: 0,
            uploadedAt: f.createdAt,
            uploadedByName: f.createdByName,
          })),
        );
      }
      return output;
    },
  ),
  audit: table(
    "audit",
    "Auditoría",
    "audit:read",
    "audit:export",
    [
      ["createdAt", "Fecha", "date"],
      ["actorName", "Actor"],
      ["action", "Evento"],
      ["outcome", "Resultado"],
      ["resource", "Recurso"],
      ["ip", "IP"],
      ["details", "Detalle"],
    ],
    () =>
      db
        .prepare("SELECT * FROM access_audit ORDER BY id DESC")
        .all()
        .map((r) => ({
          id: String(r.id),
          createdAt: r.createdAt,
          actorName: r.actorName || r.actorId || "Sin sesión / sistema",
          action: r.action,
          outcome: r.outcome,
          resource: [r.resourceType, r.resourceId].filter(Boolean).join(": "),
          ip: r.ip,
          details: r.details,
        })),
  ),
  owner_notifications: table(
    "owner_notifications",
    "Mis notificaciones",
    "owner_notification:read",
    "owner:export",
    [
      ["title", "Título"],
      ["message", "Mensaje"],
      ["date", "Fecha", "date"],
      ["read", "Leído"],
    ],
    (user) => {
      const { permits } = context(user);
      return listOwnerNotifications()
        .filter((n) => permits("owner_notification:read", n.ownerId))
        .map((n) => ({
          id: n.id,
          scopeId: n.ownerId,
          title: n.title,
          message: n.message,
          date: n.timestamp || n.date,
          read: n.read ? "Sí" : "No",
        }));
    },
  ),
  admin_notifications: table(
    "admin_notifications",
    "Buzón de administración",
    "admin_notification:read",
    "owner:export",
    [
      ["ownerName", "Propietario"],
      ["subject", "Asunto"],
      ["date", "Fecha", "date"],
      ["read", "Leído"],
    ],
    (user) => {
      const { permits } = context(user);
      return listAdminEmails()
        .filter((n) => permits("owner:read", n.ownerId))
        .map((n) => ({
          id: n.id,
          scopeId: n.ownerId,
          ownerName: n.ownerName,
          subject: n.subject,
          date: n.timestamp || n.date,
          read: n.read ? "Sí" : "No",
        }));
    },
  ),
};

TABLE_VIEWS.assessment_installments = table(
  "assessment_installments",
  "Plazos de derramas",
  "fee:manage",
  "fee:export",
  [
    ["number", "Plazo", "number"],
    ["dueDate", "Vencimiento", "date"],
    ["amount", "Importe (€)", "currency"],
    ["issued", "Emitido"],
    ["paid", "Cobrado (€)", "currency"],
    ["outstanding", "Pendiente (€)", "currency"],
    ["status", "Estado"],
  ],
  (user) => {
    const { policy } = context(user);
    return db
      .prepare("SELECT * FROM fee_assessments ORDER BY createdAt DESC")
      .all()
      .filter((r) => canManage(user, r.communityId, policy))
      .flatMap((r) =>
        assessmentView(r).installments.map((i) => ({
          id: `${r.id}:${i.number}`,
          communityId: r.communityId,
          number: i.number,
          dueDate: i.dueDate,
          amount: euro(i.amount),
          issued: i.issued ? "Sí" : "No",
          paid: euro(i.paid),
          outstanding: euro(i.outstanding),
          status: i.status,
        })),
      );
  },
);
TABLE_VIEWS.service_breakdown = table(
  "service_breakdown",
  "Reparto de suministro",
  "fee:manage",
  "fee:export",
  [
    ["plot", "Inmueble"],
    ["coefficient", "Coeficiente (%)", "number"],
    ["previous", "Lectura anterior", "number"],
    ["current", "Lectura actual", "number"],
    ["consumption", "Consumo", "number"],
    ["fixed", "Parte fija (€)", "currency"],
    ["variable", "Parte variable (€)", "currency"],
    ["amount", "Importe (€)", "currency"],
  ],
  (user) => {
    const { policy } = context(user);
    return db
      .prepare("SELECT * FROM service_bills ORDER BY createdAt DESC")
      .all()
      .filter((r) => canManage(user, r.communityId, policy))
      .flatMap((r) =>
        serviceView(r).breakdown.map((i) => ({
          id: `${r.id}:${i.propertyId}`,
          communityId: r.communityId,
          plot: i.plot || i.snapshot?.property || "",
          coefficient: Number(
            i.effectiveCoefficient ?? i.snapshot?.coefficient ?? i.coefficient ?? 0,
          ),
          previous: (i.previous ?? i.reading?.previous ?? 0) / 1000,
          current: (i.current ?? i.reading?.current ?? 0) / 1000,
          consumption: (i.consumption ?? i.reading?.consumption ?? 0) / 1000,
          fixed: euro(i.fixed),
          variable: euro(i.variable),
          amount: euro(i.amount),
        })),
      );
  },
);
TABLE_VIEWS.receipt_payments = table(
  "receipt_payments",
  "Movimientos del recibo",
  "fee:read",
  "fee:export",
  [
    ["paidOn", "Fecha", "date"],
    ["method", "Movimiento"],
    ["amount", "Importe (€)", "currency"],
    ["status", "Estado"],
  ],
  (user) =>
    receiptRows(user).flatMap((r) =>
      r.payments.map((p) => ({
        id: `${r.id}:${p.id}`,
        communityId: r.communityId,
        paidOn: p.paidOn,
        method:
          {
            transfer: "Transferencia",
            deposit: "Ingreso en cuenta",
            direct_debit: "Domiciliación confirmada",
          }[p.method] || p.method,
        amount: euro(p.amount),
        status: p.reversedAt ? "Devuelto" : "Aplicado",
      })),
    ),
);
function informativeRows(user, filters = {}) {
  const { policy, permits } = context(user);
  let ownerIds = policy.owners.filter((o) => o.userId === user.id).map((o) => o.id);
  if (filters.ownerId && permits("owner:read", filters.ownerId)) ownerIds = [filters.ownerId];
  return informativeServicesFor(ownerIds).filter((s) => permits("fee:read", s.communityId));
}
TABLE_VIEWS.informative_services = table(
  "informative_services",
  "Repartos informativos",
  "fee:read",
  "fee:export",
  [
    ["service", "Servicio"],
    ["period", "Periodo"],
    ["dueDate", "Vencimiento", "date"],
    ["totalAmount", "Factura (€)", "currency"],
    ["mine", "Tu parte (€)", "currency"],
    ["properties", "Inmuebles"],
  ],
  (user, filters = {}) =>
    informativeRows(user, filters).map((s) => ({
      id: s.id,
      communityId: s.communityId,
      ownerId: filters.ownerId || "",
      service: s.serviceLabel,
      period: s.period,
      dueDate: s.dueDate,
      totalAmount: euro(s.totalAmount),
      mine: euro(s.properties.reduce((sum, p) => sum + p.amount, 0)),
      properties: s.properties.map((p) => p.plot).join(", "),
    })),
);
TABLE_VIEWS.informative_breakdown = table(
  "informative_breakdown",
  "Reparto informativo por inmueble",
  "fee:read",
  "fee:export",
  TABLE_VIEWS.service_breakdown.columns.map((c) => [c.key, c.label, c.type]),
  (user, filters = {}) =>
    informativeRows(user, filters).flatMap((s) =>
      s.properties.map((p) => ({
        id: `${s.id}:${p.propertyId}`,
        communityId: s.communityId,
        ownerId: filters.ownerId || "",
        plot: p.plot,
        coefficient: Number(p.coefficient || 0),
        previous: p.previous === null ? "" : p.previous / 1000,
        current: p.current === null ? "" : p.current / 1000,
        consumption: p.consumption === null ? "" : p.consumption / 1000,
        fixed: euro(p.fixed),
        variable: euro(p.variable),
        amount: euro(p.amount),
      })),
    ),
);
function trackedPosts(user) {
  const { policy } = context(user);
  return allPosts()
    .filter((p) => canRead(user, p, policy) && canPublish(user, p.communityId, policy))
    .map((p) => detail(p, user));
}
TABLE_VIEWS.communication_receipts = table(
  "communication_receipts",
  "Lectura y confirmaciones",
  "comm:publicar",
  "comm:export",
  [
    ["name", "Destinatario"],
    ["readAt", "Primera lectura"],
    ["receiptAt", "Confirmación"],
  ],
  (user) =>
    trackedPosts(user).flatMap((p) =>
      p.recipients.map((r) => ({
        id: `${p.id}:${r.userId}`,
        communityId: p.communityId,
        name: r.name,
        readAt: r.readAt || "Pendiente",
        receiptAt: r.receiptAt || (p.receiptRequired ? "Pendiente" : "No solicitada"),
      })),
    ),
);
TABLE_VIEWS.communication_deliveries = table(
  "communication_deliveries",
  "Envíos externos",
  "comm:publicar",
  "comm:export",
  [
    ["name", "Destinatario"],
    ["channel", "Canal"],
    ["state", "Estado"],
    ["error", "Detalle"],
  ],
  (user) =>
    trackedPosts(user).flatMap((p) =>
      p.deliveries.map((r) => ({
        id: r.id,
        communityId: p.communityId,
        name: r.name,
        channel: r.channel,
        state: r.state,
        error: r.error,
      })),
    ),
);
TABLE_VIEWS.communication_history = table(
  "communication_history",
  "Historial de comunicación",
  "comm:publicar",
  "comm:export",
  [
    ["action", "Acción"],
    ["name", "Usuario"],
    ["createdAt", "Fecha", "date"],
  ],
  (user) =>
    trackedPosts(user).flatMap((p) =>
      p.history.map((r, i) => ({
        id: `${p.id}:${i}`,
        communityId: p.communityId,
        action: r.action,
        name: r.name,
        createdAt: r.createdAt,
      })),
    ),
);
