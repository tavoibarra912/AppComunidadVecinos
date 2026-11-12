import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { db, UPLOADS_DIR, listOwners, listProperties } from "../db.js";
import { allowed, policyData } from "../security.js";
import { recordAudit } from "../audit.js";
import {
  problem,
  transaction,
  canManage,
  canReadReceipt,
  receiptById,
  receiptView,
  receiptConcept,
  receiptArticle,
  feeSummary,
  feeDefaults,
  plans,
  savePlan,
  preview,
  issue,
  assessmentById,
  assessments,
  saveAssessment,
  assessmentDetail,
  previewAssessment,
  issueAssessment,
  cancelAssessment,
  recordPayment,
  paymentView,
  reversePayment,
  allocateCredit,
  cancelReceipt,
  adminNotice,
  notify,
} from "../fees.js";
import {
  serviceBillById,
  services,
  saveService,
  serviceDetail,
  previewService,
  issueService,
  cancelService,
  lastServiceReadings,
  serviceAttachmentById,
} from "../services.js";

const router = Router();
router.use((req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode < 400) return;
    recordAudit({
      actor: req.user,
      action: "fee.request",
      outcome: "failure",
      resourceType: "fee",
      req,
      details: { status: res.statusCode, operation: req.route?.path || "fees" },
    });
  });
  next();
});
const filesDir = path.join(UPLOADS_DIR, "fee-proofs");
const serviceFilesDir = path.join(UPLOADS_DIR, "service-bills");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
}).single("file");
const serviceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
}).single("file");
const wrap = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (error) {
    next(error);
  }
};
function community(req) {
  const id = req.params.communityId;
  if (!db.prepare("SELECT 1 FROM communities WHERE id=?").get(id))
    throw problem("Comunidad no encontrada.", 404);
  if (!allowed(req.user, "fee:read", id) && !canManage(req.user, id))
    throw problem("No tenés acceso a las cuotas de esta comunidad.", 403);
  return id;
}
function manage(req, id) {
  if (!canManage(req.user, id))
    throw problem(
      "No tenés permiso para gestionar cuotas de esta comunidad.",
      403,
    );
}
function authorizedReceipt(req) {
  const row = receiptById(req.params.receiptId);
  if (!canReadReceipt(req.user, row))
    throw problem("No tenés acceso a este recibo.", 403);
  return row;
}
function payment(req) {
  const p = db
    .prepare("SELECT * FROM fee_payments WHERE id=?")
    .get(req.params.paymentId);
  if (!p) throw problem("Cobro no encontrado.", 404);
  manage(req, p.communityId);
  return p;
}
function assessment(req) {
  const row = assessmentById(req.params.assessmentId);
  manage(req, row.communityId);
  return row;
}
function service(req) {
  const row = serviceBillById(req.params.serviceId);
  manage(req, row.communityId);
  return row;
}
function data(user, rows, communityId = "") {
  const policy = policyData();
  const visible = rows.filter((r) => canReadReceipt(user, r, policy));
  const ownIds = policy.owners
    .filter((o) => o.userId === user.id)
    .map((o) => o.id);
  const payments = db
    .prepare(
      `SELECT * FROM fee_payments ${communityId ? "WHERE communityId=?" : ""} ORDER BY createdAt DESC`,
    )
    .all(...(communityId ? [communityId] : []))
    .filter(
      (p) =>
        canManage(user, p.communityId, policy) ||
        (allowed(user, "fee:read", "", policy) && ownIds.includes(p.ownerId)),
    )
    .map(paymentView);
  const receipts = visible.map((r) => {
    const view = receiptView(r);
    // Staff can download all supporting files. A co-owner sees only their own uploads.
    if (!canManage(user, r.communityId, policy))
      view.proofs = view.proofs.filter((p) => ownIds.includes(p.ownerId));
    return view;
  });
  return {
    receipts,
    payments,
    totals: {
      issued: receipts
        .filter((r) => !r.cancelledAt)
        .reduce((s, r) => s + r.amount, 0),
      paid: receipts
        .filter((r) => !r.cancelledAt)
        .reduce((s, r) => s + r.paid, 0),
      pending: receipts.reduce((s, r) => s + r.outstanding, 0),
      credit: payments.reduce((s, p) => s + p.credit, 0),
    },
  };
}
router.get(
  "/mine",
  wrap((req, res) => {
    if (!allowed(req.user, "fee:read"))
      throw problem("No tenés permiso para consultar cuotas propias.", 403);
    const ids = listOwners()
      .filter((o) => o.userId === req.user.id)
      .map((o) => o.id);
    const rows = db
      .prepare("SELECT * FROM fee_receipts ORDER BY period DESC,createdAt DESC")
      .all()
      .filter((r) =>
        JSON.parse(r.snapshot).owners.some((o) => ids.includes(o.id)),
      );
    const result = data(req.user, rows);
    result.payments = result.payments.filter((p) => ids.includes(p.ownerId));
    result.totals.credit = result.payments.reduce(
      (sum, p) => sum + p.credit,
      0,
    );
    result.canManage = false;
    res.json(result);
  }),
);
router.get(
  "/summary",
  wrap((req, res) => {
    const communityId =
      typeof req.query.communityId === "string" ? req.query.communityId : "";
    if (
      communityId &&
      !db.prepare("SELECT 1 FROM communities WHERE id=?").get(communityId)
    )
      throw problem("Comunidad no encontrada.", 404);
    if (
      !allowed(req.user, "fee:read", "", policyData()) &&
      !canManage(req.user, "")
    )
      throw problem("No tenés permiso para consultar cuotas.", 403);
    if (
      communityId &&
      !allowed(req.user, "fee:read", communityId) &&
      !canManage(req.user, communityId)
    )
      throw problem("No tenés acceso a las cuotas de esta comunidad.", 403);
    res.json(feeSummary(req.user, communityId));
  }),
);
router.get(
  "/communities/:communityId",
  wrap((req, res) => {
    const id = community(req),
      editable = canManage(req.user, id);
    res.json({
      ...data(
        req.user,
        db
          .prepare(
            "SELECT * FROM fee_receipts WHERE communityId=? ORDER BY period DESC,createdAt DESC",
          )
          .all(id),
        id,
      ),
      canManage: editable,
      plans: editable ? plans(id) : [],
      assessments: editable ? assessments(id) : [],
      services: editable ? services(id) : [],
      serviceMeters: editable ? lastServiceReadings(id) : {},
      defaults: editable ? feeDefaults() : null,
      properties: editable
        ? listProperties()
            .filter((p) => p.communityId === id)
            .map((p) => ({
              id: p.id,
              plot: p.plot,
              coefficient: p.participationCoef,
            }))
        : [],
    });
  }),
);
router.get(
  "/owners/:ownerId",
  wrap((req, res) => {
    const owner = listOwners().find((o) => o.id === req.params.ownerId);
    if (!owner) throw problem("Propietario no encontrado.", 404);
    if (
      !(owner.userId === req.user.id && allowed(req.user, "fee:read")) &&
      !allowed(req.user, "owner:read", owner.id)
    )
      throw problem("No tenés acceso a este propietario.", 403);
    const result = data(
      req.user,
      db
        .prepare(
          "SELECT * FROM fee_receipts ORDER BY period DESC,createdAt DESC",
        )
        .all()
        .filter((r) =>
          JSON.parse(r.snapshot).owners.some((o) => o.id === owner.id),
        ),
    );
    result.payments = result.payments.filter((p) => p.ownerId === owner.id);
    result.totals.credit = result.payments.reduce((s, p) => s + p.credit, 0);
    result.canManage = false;
    res.json(result);
  }),
);
router.post(
  "/communities/:communityId/plans",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.status(201).json(savePlan(id, req.body || {}, req.user));
  }),
);
router.post(
  "/communities/:communityId/preview",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.json(preview(id, req.body?.period));
  }),
);
router.post(
  "/communities/:communityId/issue",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.status(201).json(issue(id, req.body || {}, req.user));
  }),
);
router.get(
  "/communities/:communityId/assessments",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.json(assessments(id));
  }),
);
router.post(
  "/communities/:communityId/assessments",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.status(201).json(saveAssessment(id, req.body || {}, req.user));
  }),
);
router.get(
  "/assessments/:assessmentId",
  wrap((req, res) => {
    const row = assessment(req);
    res.json(assessmentDetail(row));
  }),
);
router.put(
  "/assessments/:assessmentId",
  wrap((req, res) => {
    const row = assessment(req);
    res.json(saveAssessment(row.communityId, req.body || {}, req.user, row.id));
  }),
);
router.post(
  "/assessments/:assessmentId/preview",
  wrap((req, res) => {
    const row = assessment(req);
    res.json(previewAssessment(row.id, req.body?.installment));
  }),
);
router.post(
  "/assessments/:assessmentId/issue",
  wrap((req, res) => {
    const row = assessment(req);
    res
      .status(201)
      .json(issueAssessment(row.id, req.body || {}, req.user));
  }),
);
router.post(
  "/assessments/:assessmentId/cancel",
  wrap((req, res) => {
    const row = assessment(req);
    res.json(cancelAssessment(row.id, req.body || {}, req.user));
  }),
);
router.get(
  "/communities/:communityId/services",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.json({
      services: services(id),
      serviceMeters: lastServiceReadings(id),
    });
  }),
);
router.post(
  "/communities/:communityId/services",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.status(201).json(saveService(id, req.body || {}, req.user));
  }),
);
router.get(
  "/services/:serviceId",
  wrap((req, res) => {
    const row = service(req);
    res.json(serviceDetail(row));
  }),
);
router.put(
  "/services/:serviceId",
  wrap((req, res) => {
    const row = service(req);
    res.json(saveService(row.communityId, req.body || {}, req.user, row.id));
  }),
);
router.post(
  "/services/:serviceId/preview",
  wrap((req, res) => {
    const row = service(req);
    res.json(previewService(row.id));
  }),
);
router.post(
  "/services/:serviceId/issue",
  wrap((req, res) => {
    const row = service(req);
    res.status(201).json(issueService(row.id, req.body || {}, req.user));
  }),
);
router.post(
  "/services/:serviceId/cancel",
  wrap((req, res) => {
    const row = service(req);
    res.json(cancelService(row.id, req.body || {}, req.user));
  }),
);
router.post("/services/:serviceId/attachments", (req, res, next) => {
  let row;
  try {
    row = service(req);
    if (row.cancelledAt) throw problem("El servicio está anulado.");
  } catch (error) {
    return next(error);
  }
  serviceUpload(req, res, (error) => {
    if (error)
      return next(
        problem(
          error.code === "LIMIT_FILE_SIZE"
            ? "El adjunto supera 10 MB."
            : "Subí un único archivo sin campos adicionales.",
        ),
      );
    let diskPath;
    try {
      const file = req.file;
      if (!file) throw problem("Adjuntá la factura en PDF, PNG, JPG o WebP.");
      const b = file.buffer;
      const mime =
        b.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : b[0] === 255 && b[1] === 216 && b[2] === 255
              ? "image/jpeg"
              : b.subarray(0, 4).toString() === "RIFF" &&
                  b.subarray(8, 12).toString() === "WEBP"
                ? "image/webp"
                : "";
      if (!mime)
        throw problem("El contenido del archivo no es PDF, PNG, JPG ni WebP.");
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM service_attachments WHERE serviceBillId=?",
          )
          .get(row.id).n >= 10
      )
        throw problem("Este servicio ya tiene 10 adjuntos.");
      const id = crypto.randomUUID(),
        originalName =
          path
            .basename(file.originalname)
            .replace(/[\x00-\x1f\x7f]/g, "")
            .slice(0, 140) || "factura";
      const extension = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
      }[mime];
      const fileName = originalName.toLowerCase().endsWith(extension)
        ? originalName
        : originalName + extension;
      fs.mkdirSync(serviceFilesDir, { recursive: true });
      diskPath = path.join(serviceFilesDir, id);
      fs.writeFileSync(diskPath, b, { flag: "wx" });
      transaction(() => {
        db.prepare(
          "INSERT INTO service_attachments(id,serviceBillId,fileName,diskName,mime,createdAt,actorId) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id,
          row.id,
          fileName,
          id,
          mime,
          new Date().toISOString(),
          req.user.id,
        );
        recordAudit({
          actor: req.user,
          action: "fee.service.attachment",
          resourceType: "fee",
          resourceId: row.id,
          details: { attachmentId: id },
        });
      });
      res.status(201).json({ id, fileName, mime });
    } catch (failure) {
      if (diskPath && fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      next(failure);
    }
  });
});
router.get(
  "/service-attachments/:attachmentId/download",
  wrap((req, res) => {
    const attachment = serviceAttachmentById(req.params.attachmentId),
      row = serviceBillById(attachment.serviceBillId);
    manage(req, row.communityId);
    if (!/^[a-f0-9-]{36}$/.test(attachment.diskName))
      throw problem("Archivo no válido.", 404);
    const file = path.join(serviceFilesDir, attachment.diskName);
    if (!fs.existsSync(file))
      throw problem("El archivo no está disponible.", 404);
    res.set("Content-Type", attachment.mime);
    res.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.sendFile(file);
  }),
);
router.delete(
  "/service-attachments/:attachmentId",
  wrap((req, res) => {
    const attachment = serviceAttachmentById(req.params.attachmentId),
      row = serviceBillById(attachment.serviceBillId);
    manage(req, row.communityId);
    if (row.issuedAt)
      throw problem(
        "El servicio ya fue emitido. Los adjuntos se conservan como justificante.",
        409,
      );
    transaction(() => {
      db.prepare("DELETE FROM service_attachments WHERE id=?").run(attachment.id);
      recordAudit({
        actor: req.user,
        action: "fee.service.attachment_delete",
        resourceType: "fee",
        resourceId: row.id,
        details: { attachmentId: attachment.id },
      });
    });
    if (/^[a-f0-9-]{36}$/.test(attachment.diskName)) {
      const file = path.join(serviceFilesDir, attachment.diskName);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    res.json({ ok: true });
  }),
);
router.post(
  "/communities/:communityId/payments",
  wrap((req, res) => {
    const id = community(req);
    manage(req, id);
    res.status(201).json(recordPayment(id, req.body || {}, req.user));
  }),
);
router.post(
  "/payments/:paymentId/return",
  wrap((req, res) => {
    payment(req);
    reversePayment(req.params.paymentId, req.body || {}, req.user);
    res.json({ ok: true });
  }),
);
router.post(
  "/payments/:paymentId/allocate",
  wrap((req, res) => {
    payment(req);
    res.json(allocateCredit(req.params.paymentId, req.body || {}, req.user));
  }),
);
router.get(
  "/receipts/:receiptId",
  wrap((req, res) => {
    const row = authorizedReceipt(req);
    const result = data(req.user, [row], row.communityId);
    res.json({
      ...result.receipts[0],
      canManage: canManage(req.user, row.communityId),
    });
  }),
);
router.post(
  "/receipts/:receiptId/cancel",
  wrap((req, res) => {
    const row = authorizedReceipt(req);
    manage(req, row.communityId);
    cancelReceipt(row.id, req.body || {}, req.user);
    res.json({ ok: true });
  }),
);
router.post("/receipts/:receiptId/proofs", (req, res, next) => {
  let row, owner;
  try {
    row = authorizedReceipt(req);
    owner = JSON.parse(row.snapshot).owners.find((o) =>
      db
        .prepare("SELECT 1 FROM owners WHERE id=? AND userId=?")
        .get(o.id, req.user.id),
    );
    if (!owner)
      throw problem(
        "Solo un titular vinculado a tu cuenta puede aportar el justificante.",
        403,
      );
    if (row.cancelledAt || receiptView(row).outstanding <= 0)
      throw problem("El recibo está anulado o pagado.");
  } catch (error) {
    return next(error);
  }
  upload(req, res, (error) => {
    if (error)
      return next(
        problem(
          error.code === "LIMIT_FILE_SIZE"
            ? "El justificante supera 10 MB."
            : "Subí un único archivo sin campos adicionales.",
        ),
      );
    let diskPath;
    try {
      const file = req.file;
      if (!file) throw problem("Adjuntá un justificante PDF, PNG, JPG o WebP.");
      const b = file.buffer;
      const mime =
        b.subarray(0, 5).toString() === "%PDF-"
          ? "application/pdf"
          : b
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? "image/png"
            : b[0] === 255 && b[1] === 216 && b[2] === 255
              ? "image/jpeg"
              : b.subarray(0, 4).toString() === "RIFF" &&
                  b.subarray(8, 12).toString() === "WEBP"
                ? "image/webp"
                : "";
      if (!mime)
        throw problem("El contenido del archivo no es PDF, PNG, JPG ni WebP.");
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM fee_proofs WHERE receiptId=? AND ownerId=?",
          )
          .get(row.id, owner.id).n >= 20
      )
        throw problem("Este recibo ya tiene 20 justificantes de este titular.");
      const id = crypto.randomUUID(),
        originalName =
          path
            .basename(file.originalname)
            .replace(/[\x00-\x1f\x7f]/g, "")
            .slice(0, 140) || "justificante";
      const extension = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
      }[mime];
      const fileName = originalName.toLowerCase().endsWith(extension)
        ? originalName
        : originalName + extension;
      fs.mkdirSync(filesDir, { recursive: true });
      diskPath = path.join(filesDir, id);
      fs.writeFileSync(diskPath, b, { flag: "wx" });
      transaction(() => {
        db.prepare(
          "INSERT INTO fee_proofs(id,receiptId,ownerId,fileName,diskName,mime,createdAt,actorId) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          id,
          row.id,
          owner.id,
          fileName,
          id,
          mime,
          new Date().toISOString(),
          req.user.id,
        );
        adminNotice(
          row,
          owner.id,
          `Justificante pendiente de revisión · ${receiptConcept(row)}`,
        );
        recordAudit({
          actor: req.user,
          action: "fee.proof",
          resourceType: "fee",
          resourceId: row.id,
          details: { proofId: id },
        });
      });
      res.status(201).json({ id, status: "pending" });
    } catch (failure) {
      if (diskPath && fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
      next(failure);
    }
  });
});
router.get(
  "/proofs/:proofId/download",
  wrap((req, res) => {
    const proof = db
      .prepare("SELECT * FROM fee_proofs WHERE id=?")
      .get(req.params.proofId);
    if (!proof) throw problem("Justificante no encontrado.", 404);
    const row = receiptById(proof.receiptId);
    if (
      !canReadReceipt(req.user, row) ||
      (!canManage(req.user, row.communityId) &&
        !db
          .prepare("SELECT 1 FROM owners WHERE id=? AND userId=?")
          .get(proof.ownerId, req.user.id))
    )
      throw problem("No tenés acceso al justificante.", 403);
    if (!/^[a-f0-9-]{36}$/.test(proof.diskName))
      throw problem("Archivo no válido.", 404);
    const file = path.join(filesDir, proof.diskName);
    if (!fs.existsSync(file))
      throw problem("El archivo no está disponible.", 404);
    res.set("Content-Type", proof.mime);
    res.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(proof.fileName)}`,
    );
    res.sendFile(file);
  }),
);
router.post(
  "/proofs/:proofId/review",
  wrap((req, res) => {
    const proof = db
      .prepare("SELECT * FROM fee_proofs WHERE id=?")
      .get(req.params.proofId);
    if (!proof) throw problem("Justificante no encontrado.", 404);
    const row = receiptById(proof.receiptId);
    manage(req, row.communityId);
    if (
      !["accepted", "rejected"].includes(req.body?.status) ||
      typeof req.body?.note !== "string" ||
      !req.body.note.trim() ||
      req.body.note.length > 500
    )
      throw problem(
        "Elegí el resultado e indicá el motivo (máximo 500 caracteres).",
      );
    transaction(() => {
      if (
        !db
          .prepare(
            "UPDATE fee_proofs SET status=?,note=?,reviewedAt=? WHERE id=? AND status='pending'",
          )
          .run(
            req.body.status,
            req.body.note.trim(),
            new Date().toISOString(),
            proof.id,
          ).changes
      )
        throw problem("El justificante ya fue revisado.", 409);
      notify(
        row,
        "proof",
        proof.id,
        "Justificante revisado",
        `Tu justificante para ${receiptArticle(row)} ${receiptConcept(row)[0].toLowerCase()}${receiptConcept(row).slice(1)} fue ${req.body.status === "accepted" ? "aceptado para revisión bancaria" : "rechazado"}. ${req.body.note.trim()}`,
        proof.ownerId,
      );
      recordAudit({
        actor: req.user,
        action: "fee.proof_review",
        resourceType: "fee",
        resourceId: row.id,
        details: {
          proofId: proof.id,
          status: req.body.status,
          note: req.body.note.trim(),
        },
      });
    });
    res.json({ ok: true });
  }),
);
router.use((error, _req, res, next) => {
  if (error.status)
    return res.status(error.status).json({ error: error.message });
  next(error);
});
export default router;
