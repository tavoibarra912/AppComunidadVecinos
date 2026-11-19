import { db } from "./db.js";
import { allowed, policyData, visibleData } from "./security.js";
import { canReadReceipt, receiptView, canManage } from "./fees.js";
import { serviceView } from "./services.js";
import { TABLE_VIEWS } from "./export-views.js";

export const EXPORT_INVENTORY = {
  ...TABLE_VIEWS,
  report_financial: {
    id: "report_financial",
    title: "Informe Financiero y Liquidación por Comunidad",
    pantalla: "Informes",
    readPermission: "reports:read",
    exportPermission: "reports:export",
    formulas: "Total Emitido - Total Cobrado = Pendiente; Tasa Cobro = (Cobrado / Emitido) * 100",
    units: "Euros (€), Porcentaje (%)",
    source: "fee_receipts, fee_payments",
    formats: ["csv", "xlsx", "pdf"],
    maxRows: 5000,
    columns: [
      { key: "communityName", label: "Comunidad", type: "string" },
      { key: "period", label: "Periodo", type: "string" },
      { key: "issuedTotal", label: "Total emitido (€)", type: "currency" },
      { key: "paidTotal", label: "Total cobrado (€)", type: "currency" },
      { key: "pendingTotal", label: "Pendiente (€)", type: "currency" },
      { key: "collectionRate", label: "Tasa de cobro (%)", type: "number" },
      { key: "receiptsCount", label: "Nº Recibos", type: "number" },
      { key: "arrearsCount", label: "Impagados", type: "number" },
    ],
    fetchData: (user, filters = {}, sort = null) => {
      const policy = policyData();
      const visible = visibleData(user, policy);
      const allowedCommIds = new Set(visible.communities.map((c) => c.id));
      const rawRows = db.prepare("SELECT * FROM fee_receipts").all();
      const receipts = rawRows
        .filter((r) => allowedCommIds.has(r.communityId) && canReadReceipt(user, r, policy))
        .map((row) => receiptView(row));

      const commMap = new Map(visible.communities.map((c) => [c.id, c.name]));

      // Agrupación por comunidad y periodo
      const grouped = new Map();
      for (const r of receipts) {
        if (r.cancelledAt) continue;
        const key = `${r.communityId}_${r.period || "General"}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            communityId: r.communityId,
            period: r.period || "General",
            issuedTotal: 0,
            paidTotal: 0,
            pendingTotal: 0,
            receiptsCount: 0,
            arrearsCount: 0,
          });
        }
        const item = grouped.get(key);
        item.issuedTotal += r.amount || 0;
        item.paidTotal += r.paid || 0;
        item.pendingTotal += r.outstanding || 0;
        item.receiptsCount += 1;
        if (r.outstanding > 0) item.arrearsCount += 1;
      }

      let rows = [...grouped.values()].map((g, idx) => {
        const rate = g.issuedTotal > 0 ? (g.paidTotal / g.issuedTotal) * 100 : 100;
        return {
          id: JSON.stringify([g.communityId, g.period]),
          communityId: g.communityId,
          communityName: commMap.get(g.communityId) || g.communityId,
          period: g.period,
          issuedTotal: Number((g.issuedTotal / 100).toFixed(2)),
          paidTotal: Number((g.paidTotal / 100).toFixed(2)),
          pendingTotal: Number((g.pendingTotal / 100).toFixed(2)),
          collectionRate: Number(rate.toFixed(1)),
          receiptsCount: g.receiptsCount,
          arrearsCount: g.arrearsCount,
        };
      });

      if (filters.communityId) {
        rows = rows.filter((r) => r.communityId === filters.communityId);
      }
      if (filters.period) {
        rows = rows.filter((r) => r.period === filters.period);
      }
      return rows;
    },
  },

  report_arrears: {
    id: "report_arrears",
    title: "Informe de Morosidad y Deuda Acumulada",
    pantalla: "Informes",
    readPermission: "reports:read",
    exportPermission: "reports:export",
    formulas: "Deuda acumulada = Suma de importes pendientes en recibos vencidos no cancelados",
    units: "Euros (€), Días",
    source: "fee_receipts",
    formats: ["csv", "xlsx", "pdf"],
    maxRows: 5000,
    columns: [
      { key: "communityName", label: "Comunidad", type: "string" },
      { key: "propertyRef", label: "Inmueble", type: "string" },
      { key: "ownerName", label: "Titular", type: "string" },
      { key: "debtTotal", label: "Deuda total (€)", type: "currency" },
      { key: "pendingReceiptsCount", label: "Recibos impagados", type: "number" },
      { key: "oldestPeriod", label: "Periodo más antiguo", type: "string" },
      { key: "oldestDueDate", label: "Vencimiento más antiguo", type: "date" },
      { key: "status", label: "Estado reclamación", type: "string" },
    ],
    fetchData: (user, filters = {}, sort = null) => {
      const policy = policyData();
      const visible = visibleData(user, policy);
      const allowedCommIds = new Set(visible.communities.map((c) => c.id));
      const rawRows = db.prepare("SELECT * FROM fee_receipts").all();
      const receipts = rawRows
        .filter(
          (r) =>
            allowedCommIds.has(r.communityId) && !r.cancelledAt && canReadReceipt(user, r, policy),
        )
        .map((row) => receiptView(row))
        .filter(
          (row) => row.outstanding > 0 && row.dueDate < new Date().toISOString().slice(0, 10),
        );

      const commMap = new Map(visible.communities.map((c) => [c.id, c.name]));
      const propMap = new Map(visible.properties.map((p) => [p.id, p]));

      // Agrupación por inmueble
      const byProp = new Map();
      for (const r of receipts) {
        if (!byProp.has(r.propertyId)) {
          byProp.set(r.propertyId, {
            communityId: r.communityId,
            propertyId: r.propertyId,
            debtTotal: 0,
            pendingCount: 0,
            ownerName: (r.snapshot?.owners || []).map((o) => o.name).join(", ") || "—",
            periods: [],
            dueDates: [],
          });
        }
        const item = byProp.get(r.propertyId);
        item.debtTotal += r.outstanding || 0;
        item.pendingCount += 1;
        if (r.period) item.periods.push(r.period);
        if (r.dueDate) item.dueDates.push(r.dueDate);
      }

      let rows = [...byProp.values()].map((item, idx) => {
        const prop = propMap.get(item.propertyId);
        item.periods.sort();
        item.dueDates.sort();

        return {
          id: JSON.stringify([item.communityId, item.propertyId]),
          communityId: item.communityId,
          communityName: commMap.get(item.communityId) || item.communityId,
          propertyRef: prop ? prop.plot || prop.id : item.propertyId,
          ownerName: item.ownerName,
          debtTotal: Number((item.debtTotal / 100).toFixed(2)),
          pendingReceiptsCount: item.pendingCount,
          oldestPeriod: item.periods[0] || "—",
          oldestDueDate: item.dueDates[0] || "—",
          status: "Vencido",
        };
      });

      if (filters.communityId) {
        rows = rows.filter((r) => r.communityId === filters.communityId);
      }
      return rows;
    },
  },

  report_services: {
    id: "report_services",
    title: "Informe de Suministros y Consumos Repercutidos",
    pantalla: "Informes",
    readPermission: "reports:read",
    exportPermission: "reports:export",
    formulas:
      "Consumo total = Suma de consumos registrados; Coste unitario = Importe total / Consumo",
    units: "kWh, m³, Euros (€)",
    source: "service_bills",
    formats: ["csv", "xlsx", "pdf"],
    maxRows: 5000,
    columns: [
      { key: "communityName", label: "Comunidad", type: "string" },
      { key: "serviceConcept", label: "Suministro", type: "string" },
      { key: "period", label: "Periodo", type: "string" },
      { key: "provider", label: "Proveedor", type: "string" },
      { key: "billAmount", label: "Importe factura (€)", type: "currency" },
      { key: "totalConsumption", label: "Consumo total", type: "number" },
      { key: "unit", label: "Unidad", type: "string" },
      { key: "unitCost", label: "Coste medio / unidad (€)", type: "currency" },
      { key: "propertiesAffected", label: "Inmuebles", type: "number" },
    ],
    fetchData: (user, filters = {}, sort = null) => {
      const policy = policyData();
      const visible = visibleData(user, policy);
      const allowedCommIds = new Set(visible.communities.map((c) => c.id));
      const rawRows = db.prepare("SELECT * FROM service_bills ORDER BY createdAt DESC").all();
      const commMap = new Map(visible.communities.map((c) => [c.id, c.name]));

      let rows = rawRows
        .filter((s) => allowedCommIds.has(s.communityId) && canManage(user, s.communityId, policy))
        .map((s) => ({ ...s, view: serviceView(s) }))
        .map((s) => {
          let data = {};
          try {
            data = JSON.parse(s.data || "{}");
          } catch {}
          const consumption =
            (s.view.breakdown || []).reduce(
              (sum, item) => sum + Number(item.consumption ?? item.reading?.consumption ?? 0),
              0,
            ) / 1000;
          const amount = Number(s.totalAmount || 0);
          const unitCost = consumption > 0 ? amount / consumption : 0;
          const propCount = s.view.propertyIds.length;

          return {
            id: s.id,
            communityId: s.communityId,
            communityName: commMap.get(s.communityId) || s.communityId,
            serviceConcept: s.view.concept,
            period: s.period || "",
            provider: s.supplier || "—",
            billAmount: Number((amount / 100).toFixed(2)),
            totalConsumption: consumption,
            unit: s.view.service === "agua" ? "m³" : "Unidad del contador",
            unitCost: Number((unitCost / 100).toFixed(4)),
            propertiesAffected: propCount,
          };
        });

      if (filters.communityId) {
        rows = rows.filter((r) => r.communityId === filters.communityId);
      }
      return rows;
    },
  },

  report_comparison: {
    id: "report_comparison",
    title: "Comparativa y Benchmarking entre Comunidades",
    pantalla: "Informes",
    readPermission: "reports:read",
    exportPermission: "reports:export",
    formulas:
      "Cuota media por unidad = Total emitido / Total inmuebles; Tasa de cobro = (Cobrado / Emitido) * 100",
    units: "Euros (€), Porcentaje (%)",
    source: "communities, properties, fee_receipts",
    formats: ["csv", "xlsx", "pdf"],
    maxRows: 5000,
    columns: [
      { key: "communityName", label: "Comunidad", type: "string" },
      { key: "propertiesCount", label: "Nº Inmuebles", type: "number" },
      { key: "totalIssued", label: "Total emitido (€)", type: "currency" },
      { key: "averagePerProperty", label: "Media por inmueble (€)", type: "currency" },
      { key: "collectionRate", label: "Tasa de cobro (%)", type: "number" },
      { key: "activeServicesCount", label: "Servicios activos", type: "number" },
    ],
    fetchData: (user, filters = {}, sort = null) => {
      const policy = policyData();
      const visible = visibleData(user, policy);
      const receipts = db
        .prepare("SELECT * FROM fee_receipts WHERE cancelledAt=''")
        .all()
        .filter((row) => canReadReceipt(user, row, policy))
        .map((row) => receiptView(row));
      const services = db
        .prepare("SELECT * FROM service_bills WHERE cancelledAt=''")
        .all()
        .filter((row) => canManage(user, row.communityId, policy));

      const propsByComm = new Map();
      for (const p of visible.properties) {
        propsByComm.set(p.communityId, (propsByComm.get(p.communityId) || 0) + 1);
      }

      const receiptsByComm = new Map();
      for (const r of receipts) {
        if (!receiptsByComm.has(r.communityId)) {
          receiptsByComm.set(r.communityId, { issued: 0, paid: 0 });
        }
        const item = receiptsByComm.get(r.communityId);
        item.issued += r.amount || 0;
        item.paid += r.paid || 0;
      }

      const servicesByComm = new Map();
      for (const s of services) {
        servicesByComm.set(s.communityId, (servicesByComm.get(s.communityId) || 0) + 1);
      }

      let rows = visible.communities.map((c) => {
        const propCount = propsByComm.get(c.id) || 0;
        const rec = receiptsByComm.get(c.id) || { issued: 0, paid: 0 };
        const avg = propCount > 0 ? rec.issued / propCount : 0;
        const rate = rec.issued > 0 ? (rec.paid / rec.issued) * 100 : 100;

        return {
          id: c.id,
          communityId: c.id,
          communityName: c.name || c.id,
          propertiesCount: propCount,
          totalIssued: Number((rec.issued / 100).toFixed(2)),
          averagePerProperty: Number((avg / 100).toFixed(2)),
          collectionRate: Number(rate.toFixed(1)),
          activeServicesCount: servicesByComm.get(c.id) || 0,
        };
      });

      return rows;
    },
  },
};

for (const entry of Object.values(EXPORT_INVENTORY)) {
  if (entry.id.startsWith("communication_"))
    entry.readAnyPermissions = ["comm:publicar", "community:manage"];
  if (["receipts", "payments", "receipt_payments"].includes(entry.id))
    entry.readAnyPermissions = ["fee:read", "fee:manage"];
  entry.scopeKey =
    {
      communities: "id",
      properties: "id",
      owners: "id",
      tenants: "id",
      documents: "entityId",
      owner_notifications: "scopeId",
      admin_notifications: "scopeId",
    }[entry.id] || "communityId";
  entry.source ||= "Base de datos de la aplicación";
  entry.scope ||= "Permisos efectivos por recurso";
  entry.limits = {
    pdf: { rows: 500, bytes: 10 * 1024 * 1024, ms: 15000 },
    xlsx: { rows: 5000, bytes: 10 * 1024 * 1024, ms: 15000 },
    csv: { rows: 5000, bytes: 10 * 1024 * 1024, ms: 10000 },
  };
  entry.filters = [
    "query",
    "view",
    "communityId",
    "entityType",
    "entityId",
    "category",
    "folderId",
    "period",
    "status",
    "action",
    "ownerId",
    "propertyId",
    "assessmentId",
    "serviceBillId",
    "kind",
    "creditOnly",
  ];
}
