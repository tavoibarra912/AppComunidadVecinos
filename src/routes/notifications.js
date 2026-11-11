import { Router } from "express";
import crypto from "node:crypto";
import { db, adminEmailFromRow, ownerNotificationFromRow } from "../db.js";

const router = Router();

// ---- Buzón de correo del Administrador ----

router.get("/admin-emails", (req, res) => {
  res.json(db.prepare("SELECT * FROM admin_emails ORDER BY timestamp DESC").all().map(adminEmailFromRow));
});

router.post("/admin-emails", (req, res) => {
  const data = req.body || {};
  // El servidor fija id, timestamp y estado de lectura: el cliente no debe
  // poder crear un aviso ya leído ni colisionar con un id existente.
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO admin_emails (id, ownerId, ownerName, ownerDni, ownerCommunity, ownerPlot, subject, date, timestamp, read, docs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.ownerId || "", data.ownerName || "", data.ownerDni || "", data.ownerCommunity || "",
    data.ownerPlot || "", data.subject || "", data.date || "", Date.now(), 0,
    JSON.stringify(Array.isArray(data.docs) ? data.docs : [])
  );
  const row = db.prepare("SELECT * FROM admin_emails WHERE id = ?").get(id);
  res.status(201).json(adminEmailFromRow(row));
});

router.patch("/admin-emails/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM admin_emails WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificación no encontrada." });
  db.prepare("UPDATE admin_emails SET read = ? WHERE id = ?").run(req.body?.read ? 1 : 0, row.id);
  res.json(adminEmailFromRow(db.prepare("SELECT * FROM admin_emails WHERE id = ?").get(row.id)));
});

// ---- Buzón de avisos del propietario ----

router.get("/owner-notifications", (req, res) => {
  res.json(db.prepare("SELECT * FROM owner_notifications ORDER BY timestamp DESC").all().map(ownerNotificationFromRow));
});

router.post("/owner-notifications", (req, res) => {
  const data = req.body || {};
  // El servidor fija id, timestamp y estado de lectura (ver POST /admin-emails).
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO owner_notifications (id, ownerId, title, type, message, date, timestamp, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, data.ownerId || "", data.title || "", data.type || "info", data.message || "",
    data.date || "", Date.now(), 0
  );
  const row = db.prepare("SELECT * FROM owner_notifications WHERE id = ?").get(id);
  res.status(201).json(ownerNotificationFromRow(row));
});

router.patch("/owner-notifications/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM owner_notifications WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificación no encontrada." });
  db.prepare("UPDATE owner_notifications SET read = ? WHERE id = ?").run(req.body?.read ? 1 : 0, row.id);
  res.json(ownerNotificationFromRow(db.prepare("SELECT * FROM owner_notifications WHERE id = ?").get(row.id)));
});

router.patch("/owner-notifications", (req, res) => {
  const { ownerId, read } = req.body || {};
  if (ownerId) {
    db.prepare("UPDATE owner_notifications SET read = ? WHERE ownerId = ?").run(read === false ? 0 : 1, ownerId);
  } else {
    db.prepare("UPDATE owner_notifications SET read = ?").run(read === false ? 0 : 1);
  }
  res.json({ ok: true });
});

export default router;
