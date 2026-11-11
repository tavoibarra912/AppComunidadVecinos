import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dashboardData,
  ownerDocumentState,
} from "../../public/js/dashboard-data.js";
import { communityFinanceError } from "../../src/validation.js";

const now = new Date("2026-11-09T12:00:00Z");
const doc = (status = "approved") => ({
  id: "file",
  fileName: "real.pdf",
  adminApproval: { status },
});
const docs = () => ({ dni: doc(), bankReceipt: doc(), propertyDeed: doc() });
function fixture(role = "administrator") {
  return {
    currentUserId: "me",
    activeRole: role === "user" ? "owner" : "admin",
    users: [{ id: "me", rol: role }],
    roles: [{ id: "role", nombre: role }],
    communities: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    properties: [
      {
        id: "p1",
        communityId: "a",
        ownerIds: ["o1", "o2"],
        propertyType: "vivienda",
      },
      { id: "p2", communityId: "b", ownerIds: ["o1"], propertyType: "garaje" },
      { id: "p3", communityId: "b", ownerIds: ["o3"], propertyType: "parcela" },
    ],
    owners: [
      { id: "o1", userId: "me", documents: docs() },
      { id: "o2", userId: "other", documents: {} },
      { id: "o3", userId: "third", documents: { dni: doc("pending") } },
    ],
    tenants: [
      {
        id: "t1",
        userId: "tenant",
        propertyId: "p1",
        contractStart: "2026-01-01",
        contractEnd: "2027-01-01",
        documents: {},
      },
      {
        id: "t2",
        userId: "tenant2",
        propertyId: "p3",
        contractStart: "2027-01-01",
        contractEnd: "",
        documents: {},
      },
      {
        id: "t3",
        userId: "tenant3",
        propertyId: "p2",
        contractStart: "2024-01-01",
        contractEnd: "2025-12-31",
        documents: {},
      },
    ],
    ownerNotifications: [{ ownerId: "o1", read: false }],
    adminEmails: [
      { ownerId: "o1", read: false },
      { ownerId: "o3", read: false },
    ],
  };
}
test("inicio: cuenta unidades una vez aunque tengan copropietarios y separa contratos", () => {
  const d = dashboardData(fixture(), null, "", now);
  assert.equal(d.properties.length, 3);
  assert.equal(d.owners.length, 3);
  assert.equal(d.communities.length, 2);
  assert.equal(
    d.propertyTypes.reduce((n, r) => n + r.value, 0),
    3,
  );
  assert.deepEqual(d.contracts, {
    active: 1,
    upcoming: 1,
    ended: 1,
    unknown: 0,
  });
  assert.equal(
    d.documentChart.reduce((n, r) => n + r.value, 0),
    3,
  );
  assert.deepEqual(d.ownerStates, {
    approved: 1,
    pending: 0,
    incomplete: 1,
    rejected: 0,
    none: 1,
  });
  assert.equal(d.snapshotReady, false);
});
test("inicio personal: múltiples comunidades e inmuebles reales; no adopta perfiles ajenos", () => {
  const d = dashboardData(fixture("user"), null, "", now);
  assert.equal(d.communities.length, 2);
  assert.equal(d.properties.length, 2);
  assert.deepEqual(
    d.owners.map((o) => o.id),
    ["o1"],
  );
  assert.equal(d.docOwners.length, 1);
  assert.equal(d.ownerUnread, 1);
});
test("inicio: filtrar comunidad recalcula gráficos, expedientes, contratos y avisos", () => {
  const d = dashboardData(fixture(), null, "a", now);
  assert.equal(d.communities.length, 1);
  assert.equal(d.properties.length, 1);
  assert.equal(d.owners.length, 2);
  assert.equal(d.tenants.length, 1);
  assert.equal(d.adminUnread, 1);
  assert.equal(
    d.documentChart.reduce((n, r) => n + r.value, 0),
    2,
  );
});
test("inicio: usuario sin vínculo y sesión ausente no reciben métricas de otro vecino", () => {
  const f = fixture("user");
  f.owners.forEach((o) => {
    o.userId = "other";
  });
  let d = dashboardData(f, null, "", now);
  assert.equal(d.properties.length, 0);
  assert.equal(d.communities.length, 0);
  assert.equal(d.owners.length, 0);
  assert.equal(d.ownerUnread, 0);
  f.currentUserId = null;
  d = dashboardData(f, null, "", now);
  assert.equal(d.properties.length, 0);
  assert.equal(d.docOwners.length, 0);
  assert.equal(d.ownOwners.length, 0);
});
test("inicio de inquilino: cuenta solo sus vínculos; no trata al titular como perfil propio", () => {
  const f = fixture("user");
  f.owners.forEach((o) => {
    o.userId = "other";
  });
  f.tenants[0].userId = "me";
  f.tenants[0].documents = { contract: doc("pending") };
  const d = dashboardData(f, null, "", now);
  assert.equal(d.communities.length, 1);
  assert.equal(d.properties.length, 1);
  assert.equal(d.owners.length, 0);
  assert.equal(d.tenantDocuments.length, 1);
  assert.equal(
    d.documentChart.reduce((n, r) => n + r.value, 0),
    1,
  );
});
test("documentación: una aprobación sin archivo o un ejemplo no se cuenta como acreditación", () => {
  assert.equal(
    ownerDocumentState({
      documents: { dni: { adminApproval: { status: "approved" } } },
    }),
    "none",
  );
  assert.equal(
    ownerDocumentState({ documents: { dni: { ...doc(), isSample: true } } }),
    "none",
  );
  assert.equal(
    ownerDocumentState({ documents: { ...docs(), dni: doc("rejected") } }),
    "rejected",
  );
  assert.equal(
    ownerDocumentState({ documents: { ...docs(), dni: doc("pending") } }),
    "pending",
  );
});
test("contratos sin fechas válidas se muestran como desconocidos, sin asumir que están activos", () => {
  const f = fixture();
  f.tenants[0].contractStart = "";
  const d = dashboardData(f, null, "", now);
  assert.equal(d.contracts.active, 0);
  assert.equal(d.contracts.unknown, 1);
});
test("agenda y pendientes: respeta destinatario, comunidad, estado y fecha", () => {
  const f = fixture("user");
  const p = {
    id: "one",
    communityId: "a",
    title: "Reunión",
    type: "meeting",
    phase: "upcoming",
    startsAt: "2026-11-10T12:00:00Z",
    endsAt: "2026-11-10T14:00:00Z",
    updatedAt: "2026-11-08T12:00:00Z",
    recipient: { userId: "me", readAt: "" },
  };
  const snapshot = {
    posts: [
      p,
      { ...p, id: "cancelled", phase: "cancelled" },
      { ...p, id: "draft", phase: "draft" },
      { ...p, id: "scheduled", phase: "scheduled" },
      { ...p, id: "other", recipient: { userId: "other", readAt: "" } },
      {
        ...p,
        id: "expired",
        phase: "finished",
        endsAt: "2026-01-01T12:00:00Z",
      },
    ],
  };
  const d = dashboardData(f, snapshot, "a", now);
  assert.deepEqual(
    d.agenda.map((p) => p.id),
    ["one"],
  );
  assert.equal(d.unreadPosts, 3);
  assert.equal(d.publishedCount, 3);
});
test("año e importe: validación monetaria estricta, cero, decimales y año vigente", () => {
  for (const reserveFund of ["0", "1250", "1250.25", 0, 1250.25, ""])
    assert.equal(communityFinanceError({ reserveFund }, 2026), null);
  for (const reserveFund of [
    "abc",
    "1e3",
    "-1",
    "12.345",
    [],
    {},
    "9999999999999",
  ])
    assert.ok(communityFinanceError({ reserveFund }, 2026));
  for (const constitutionYear of ["2026", "1996", "1000", ""])
    assert.equal(communityFinanceError({ constitutionYear }, 2026), null);
  for (const constitutionYear of ["2027", "99", "año", {}, "0999"])
    assert.ok(communityFinanceError({ constitutionYear }, 2026));
});
