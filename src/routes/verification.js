import { Router } from "express";
import crypto from "node:crypto";
import { db, getSettings } from "../db.js";
import { sendMessage } from "../delivery-providers.js";
import { nombrePlataforma } from "../textos-envio.js";

const router = Router();

const challengeCols = db
  .prepare("PRAGMA table_info(contact_verification_challenges)")
  .all()
  .map((c) => c.name);
for (const [column, definition] of [
  ["attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["userId", "TEXT NOT NULL DEFAULT ''"],
  ["confirmedAt", "INTEGER NOT NULL DEFAULT 0"],
  ["consumedAt", "INTEGER NOT NULL DEFAULT 0"],
]) {
  if (!challengeCols.includes(column)) {
    db.exec(`ALTER TABLE contact_verification_challenges ADD COLUMN ${column} ${definition}`);
  }
}
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_contact_challenges_destino ON contact_verification_challenges(tipo, destino, createdAt)",
);

const MAX_ATTEMPTS = 5;

const config = {
  phone: {
    canal: "sms",
    campo: "phone",
    normalizar: (v) => String(v || "").replace(/\D/g, ""),
    validar: (v) => /^[6-9]\d{8}$/.test(v),
    // Twilio y Brevo exigen destino internacional (E.164): móvil español.
    destino: (v) => `+34${v}`,
    enmascarar: (v) => `${v.slice(0, 3)}${"*".repeat(Math.max(1, v.length - 5))}${v.slice(-2)}`,
    label: "teléfono",
  },
  email: {
    canal: "email",
    campo: "email",
    normalizar: (v) =>
      String(v || "")
        .trim()
        .toLowerCase(),
    validar: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    destino: (v) => v,
    enmascarar: (v) => {
      const [user, domain] = v.split("@");
      const visible = user.slice(0, 2);
      return `${visible}${"*".repeat(Math.max(1, user.length - visible.length))}@${domain}`;
    },
    label: "email",
  },
};

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

router.post("/:tipo/send", async (req, res) => {
  const tipo = req.params.tipo;
  const conf = config[tipo];
  if (!conf) return res.status(400).json({ error: "Tipo de verificación no válido." });

  const destino = conf.normalizar(req.body?.[conf.campo] || "");
  if (!conf.validar(destino))
    return res.status(400).json({ error: `El ${conf.label} indicado no es válido.` });

  const settings = getSettings();
  const ttlMs = Math.max(1, Number(settings.otpExpiraMinutos) || 10) * 60000;
  const cooldownMs = Math.max(0, Number(settings.otpReenvioSegundos) || 0) * 1000;
  const now = Date.now();

  // Cooldown por cuenta y destino: evita bombardear el canal y proteger el
  // coste del proveedor sin que un tercero pueda bloquear el código de otro.
  const ultimo = db
    .prepare(
      "SELECT createdAt FROM contact_verification_challenges WHERE tipo=? AND destino=? AND userId=? AND confirmed=0 ORDER BY createdAt DESC LIMIT 1",
    )
    .get(tipo, destino, req.user.id);
  if (ultimo && now - ultimo.createdAt < cooldownMs) {
    const segundos = Math.ceil((cooldownMs - (now - ultimo.createdAt)) / 1000);
    return res.status(429).json({
      error: `Espera ${segundos} segundos para pedir otro código de verificación.`,
      reenvioSegundos: segundos,
    });
  }

  const codigo = String(crypto.randomInt(100000, 999999));
  const id = crypto.randomUUID();

  db.exec("BEGIN IMMEDIATE");
  try {
    // Un solo código activo por cuenta y destino: los anteriores dejan de valer,
    // pero los retos de otras cuentas para el mismo destino no se tocan.
    db.prepare(
      "DELETE FROM contact_verification_challenges WHERE tipo=? AND destino=? AND userId=? AND confirmed=0",
    ).run(tipo, destino, req.user.id);
    db.prepare("DELETE FROM contact_verification_challenges WHERE expiresAt < ?").run(now);
    db.prepare(
      "INSERT INTO contact_verification_challenges (id, tipo, destino, codigo, createdAt, expiresAt, userId) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, tipo, destino, digest(codigo), now, now + ttlMs, req.user.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const minutos = Math.round(ttlMs / 60000);
  const texto = `Tu código de verificación es: ${codigo}\n\nExpira en ${minutos} minutos y es de un solo uso.\n\nSi no lo solicitaste, ignora este mensaje.\n\n— ${nombrePlataforma()}`;
  const asunto = `Código de verificación — ${nombrePlataforma()}`;

  try {
    await sendMessage(conf.canal, conf.destino(destino), texto, undefined, asunto);
  } catch (error) {
    db.prepare("DELETE FROM contact_verification_challenges WHERE id=?").run(id);
    return res
      .status(error.status || 502)
      .json({ error: `No se pudo enviar el código: ${error.message || "error desconocido"}` });
  }

  res.json({
    challengeId: id,
    maskedDestination: conf.enmascarar(destino),
    expiraMinutos: minutos,
    reenvioSegundos: Math.round(cooldownMs / 1000),
  });
});

router.post("/:tipo/confirm", (req, res) => {
  const tipo = req.params.tipo;
  if (!config[tipo]) return res.status(400).json({ error: "Tipo de verificación no válido." });
  const { challengeId, code } = req.body || {};
  if (!challengeId || !code) return res.status(400).json({ error: "Faltan datos para confirmar." });

  const row = db
    .prepare("SELECT * FROM contact_verification_challenges WHERE id = ? AND confirmed = 0")
    .get(challengeId);
  if (!row || row.expiresAt < Date.now() || row.tipo !== tipo) {
    db.prepare("DELETE FROM contact_verification_challenges WHERE id = ?").run(challengeId);
    return res.status(410).json({ error: "El código ha caducado. Solicita uno nuevo." });
  }
  if (row.userId && row.userId !== req.user.id)
    return res.status(403).json({ error: "Este código pertenece a otra cuenta." });
  // Retos heredados sin cuenta: se vinculan a quien demuestra poseer el código.
  if (!row.userId)
    db.prepare(
      "UPDATE contact_verification_challenges SET userId = ? WHERE id = ? AND userId = ''",
    ).run(req.user.id, challengeId);
  if (row.codigo !== digest(String(code).trim())) {
    const intentos = Number(row.attempts || 0) + 1;
    if (intentos >= MAX_ATTEMPTS) {
      db.prepare("DELETE FROM contact_verification_challenges WHERE id = ?").run(challengeId);
      return res
        .status(410)
        .json({ error: "Demasiados intentos con códigos incorrectos. Solicita uno nuevo." });
    }
    db.prepare("UPDATE contact_verification_challenges SET attempts = ? WHERE id = ?").run(
      intentos,
      challengeId,
    );
    return res.status(400).json({ error: "El código no es correcto." });
  }

  const confirmedAt = Date.now();
  db.prepare(
    "UPDATE contact_verification_challenges SET confirmed = 1, confirmedAt = ? WHERE id = ?",
  ).run(confirmedAt, challengeId);
  res.json({ verified: true, verifiedAt: new Date(confirmedAt).toISOString() });
});

export default router;
