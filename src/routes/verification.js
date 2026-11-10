import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";
import { sendMessage } from "../delivery-providers.js";

const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS contact_verification_challenges (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  destino TEXT NOT NULL,
  codigo TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0
)`);

const TTL = 10 * 60 * 1000;

const config = {
  phone: {
    canal: "sms",
    campo: "phone",
    validar: v => /^[6-9]\d{8}$/.test(v),
    label: "teléfono",
  },
  email: {
    canal: "email",
    campo: "email",
    validar: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    label: "email",
  },
};

router.post("/:tipo/send", async (req, res) => {
  const tipo = req.params.tipo;
  const conf = config[tipo];
  if (!conf) return res.status(400).json({ error: "Tipo de verificación no válido." });

  const destino = conf.normalizar ? conf.normalizar(req.body?.[conf.campo] || "") : (req.body?.[conf.campo] || "").trim();
  if (!conf.validar(destino))
    return res.status(400).json({ error: `El ${conf.label} indicado no es válido.` });

  const codigo = String(crypto.randomInt(100000, 999999));
  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare("DELETE FROM contact_verification_challenges WHERE expiresAt < ?").run(now);
  db.prepare("INSERT INTO contact_verification_challenges (id, tipo, destino, codigo, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, tipo, destino, codigo, now, now + TTL);

  const texto = tipo === "phone"
    ? `Codigo de verificacion: ${codigo}. Expira en 10 minutos.`
    : `Tu código de verificación es: ${codigo}\n\nEste código expira en 10 minutos.`;
  const asunto = tipo === "email" ? `Código de verificación: ${codigo}` : undefined;

  try {
    await sendMessage(conf.canal, destino, texto, undefined, asunto);
  } catch (error) {
    return res.status(503).json({
      error: ("Envío de código falló: " + (error.message || "error desconocido")),
      challengeId: id,
    });
  }

  res.json({ challengeId: id });
});

router.post("/:tipo/confirm", async (req, res) => {
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code)
    return res.status(400).json({ error: "Faltan datos para confirmar." });

  const row = db
    .prepare("SELECT * FROM contact_verification_challenges WHERE id = ? AND confirmed = 0")
    .get(challengeId);
  if (!row || row.expiresAt < Date.now())
    return res.status(410).json({ error: "El código expiró. Solicitá uno nuevo." });
  if (row.codigo !== String(code).trim())
    return res.status(400).json({ error: "El código no es correcto." });

  db.prepare("UPDATE contact_verification_challenges SET confirmed = 1 WHERE id = ?").run(challengeId);
  res.json({ verified: true, verifiedAt: new Date().toISOString() });
});

export default router;
