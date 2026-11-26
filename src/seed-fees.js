import { db } from "./db.js";
import { demoDataEnabled } from "./seed.js";
import { issue, preview, receiptView, recordPayment, savePlan, today } from "./fees.js";

// Cuotas de demostración para el vecino urucp1: «Mis cuotas» muestra recibos
// reales al arrancar, con tres periodos pagados y uno pendiente. Solo actúa sobre
// la comunidad demo sin configuración financiera previa; nunca en producción ni
// en tests, y no sobrescribe datos que la persona ya haya creado.
export function seedDemoFees() {
  if (!demoDataEnabled() || process.env.NODE_ENV === "test") return false;
  if (!db.prepare("SELECT 1 FROM communities WHERE id = 'com-seed-1'").get()) return false;
  if (
    db.prepare("SELECT 1 FROM fee_plans WHERE communityId = 'com-seed-1' LIMIT 1").get() ||
    db.prepare("SELECT 1 FROM fee_receipts WHERE communityId = 'com-seed-1' LIMIT 1").get()
  )
    return false;
  const owner = db
    .prepare(
      `SELECT o.id FROM owners o JOIN users u ON u.id = o.userId
       WHERE o.id = 'own-seed-1' AND u.usuario = 'urucp1'`,
    )
    .get();
  const actor =
    db.prepare("SELECT * FROM users WHERE usuario = 'ca1' AND activo = 1").get() ||
    db.prepare("SELECT * FROM users WHERE usuario = 'super_admin' AND activo = 1").get();
  if (!owner || !actor) return false;

  let planId = "";
  try {
    // 24.000 € anuales entre los tres inmuebles demo: 2.000 € al mes en total.
    ({ id: planId } = savePlan(
      "com-seed-1",
      {
        annualAmount: "24000",
        months: 1,
        effectiveFrom: "2026-01-01",
        dueDay: 5,
        agreement: "Aprobado en Junta General Ordinaria de 2025",
        mode: "coefficient",
      },
      actor,
    ));
    for (const period of ["2026-09", "2026-10", "2026-11", "2026-12"]) {
      const batch = preview("com-seed-1", period);
      issue("com-seed-1", { period, token: batch.token }, actor);
    }
    const receipts = db
      .prepare(
        `SELECT * FROM fee_receipts WHERE communityId = 'com-seed-1' AND propertyId = 'prop-seed-1'
         AND cancelledAt = '' AND period IN ('2026-09','2026-10','2026-11')`,
      )
      .all();
    const pending = receipts.reduce((sum, row) => sum + receiptView(row).outstanding, 0);
    if (pending > 0)
      recordPayment(
        "com-seed-1",
        {
          ownerId: owner.id,
          amount: (pending / 100).toFixed(2),
          paidOn: today(),
          method: "transfer",
          reference: "Transferencia demo cuotas 09 a 11",
          requestId: "seed-demo-fees-v1-payment",
          receiptIds: receipts.map((row) => row.id),
        },
        actor,
      );
  } catch (error) {
    // Sin recibos emitidos, se retira el acuerdo para reintentar en otro arranque.
    if (planId && !db.prepare("SELECT 1 FROM fee_receipts WHERE planId = ?").get(planId))
      db.prepare("DELETE FROM fee_plans WHERE id = ?").run(planId);
    console.warn(`[seed] No se pudieron sembrar cuotas de demostración: ${error.message}`);
    return false;
  }
  console.log("[seed] Cuotas de demostración cargadas para urucp1 (4 recibos, 3 pagados).");
  return true;
}
