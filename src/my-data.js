// Derecho de acceso y portabilidad (RGPD, arts. 15 y 20): paquete con los datos
// de la propia cuenta en formato estructurado. Nunca incluye datos de terceros
// ni de copropietarios: los recibos van sin la instantánea compartida y los
// cobros solo con los del titular.
import { db } from "./db.js";
import { latestDeletionRequest } from "./account-deletion.js";
import { getPreferences, consentHistory } from "./communication-store.js";

const parse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const unique = (values) => [...new Set(values.filter(Boolean))];

export function exportPersonalData(user) {
  const owners = db.prepare("SELECT * FROM owners WHERE userId=? ORDER BY id").all(user.id);
  const tenants = db.prepare("SELECT * FROM tenants WHERE userId=? ORDER BY id").all(user.id);
  const ownerIds = owners.map((row) => row.id);
  const propertyIds = unique(owners.flatMap((row) => parse(row.propertyIds, [])));
  const communityIds = unique([
    ...owners.map((row) => row.communityId),
    ...tenants
      .map((row) => db.prepare("SELECT communityId FROM properties WHERE id=?").get(row.propertyId))
      .map((row) => row?.communityId),
  ]);
  const receipts = db
    .prepare(
      `SELECT id,communityId,propertyId,period,periodEnd,dueDate,amount,createdAt,
        cancelledAt,cancellationReason,snapshot FROM fee_receipts ORDER BY period,id`,
    )
    .all()
    // Sin la instantánea: contiene los datos de los demás titulares del recibo.
    .filter(
      (row) =>
        propertyIds.includes(row.propertyId) ||
        (parse(row.snapshot, {}).owners || []).some((owner) => ownerIds.includes(owner.id)),
    )
    .map(({ snapshot: _snapshot, ...row }) => row);
  const payments = ownerIds.length
    ? db
        .prepare(
          `SELECT id,communityId,amount,paidOn,method,reference,reversedAt,reversalReason,createdAt
           FROM fee_payments WHERE ownerId IN (${ownerIds.map(() => "?").join(",")})
           ORDER BY paidOn,id`,
        )
        .all(...ownerIds)
    : [];
  const comments = db
    .prepare(
      "SELECT id,postId,body,createdAt FROM communication_comments WHERE userId=? AND deleted=0 ORDER BY createdAt,id",
    )
    .all(user.id);
  const communities = communityIds.length
    ? db
        .prepare(
          `SELECT id,name,currency FROM communities WHERE id IN (${communityIds.map(() => "?").join(",")}) ORDER BY name`,
        )
        .all(...communityIds)
    : [];
  return {
    generadoEn: new Date().toISOString(),
    aviso:
      "Paquete de acceso y portabilidad de tu cuenta. Los recibos, cobros y asientos contables se conservan como registro obligatorio aunque solicites la supresión; este paquete no incluye datos de otras personas.",
    cuenta: {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: user.rol,
    },
    consentimientos: {
      ...getPreferences(user),
      historial: consentHistory(user.id),
    },
    fichas: { propietario: owners, inquilino: tenants },
    comunidades: communities,
    recibos: receipts,
    cobros: payments,
    comentarios: comments,
    solicitudDeBaja: latestDeletionRequest(user.id),
  };
}
