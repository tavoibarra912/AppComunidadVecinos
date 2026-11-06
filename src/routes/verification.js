import { Router } from "express";
import crypto from "node:crypto";

const router = Router();

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const challenges = new Map();

function maskPhone(phone) {
  if (!phone || phone.length < 4) return "•••";
  return `${phone.slice(0, 1)}${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-3)}`;
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "•••";
  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

function createChallenge(kind, destination) {
  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const challenge = {
    id, kind, destination, code,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    attempts: 0
  };
  challenges.set(id, challenge);
  return challenge;
}

function buildSendResponse(challenge) {
  const masked = challenge.kind === "phone"
    ? maskPhone(challenge.destination)
    : maskEmail(challenge.destination);
  console.log(`[OTP] Código de verificación (${challenge.kind}) para ${masked}: ${challenge.code}`);
  return {
    challengeId: challenge.id,
    maskedDestination: masked,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
    devCode: challenge.code
  };
}

function handleConfirm(req, res) {
  const { challengeId, code } = req.body || {};
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    return res.status(400).json({ verified: false, error: "El código de verificación no existe o ya fue utilizado." });
  }
  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    return res.status(400).json({ verified: false, error: "El código ha caducado. Solicita uno nuevo." });
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(challengeId);
    return res.status(429).json({ verified: false, error: "Demasiados intentos fallidos. Solicita un código nuevo." });
  }
  if (String(code).trim() !== challenge.code) {
    challenge.attempts += 1;
    return res.status(400).json({
      verified: false,
      error: `Código incorrecto. Intentos restantes: ${MAX_ATTEMPTS - challenge.attempts}.`
    });
  }
  challenges.delete(challengeId);
  return res.json({ verified: true, verifiedAt: new Date().toISOString() });
}

// --- Teléfono ---
router.post("/phone/send", (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (!/^[6-9]\d{8}$/.test(phone)) {
    return res.status(400).json({ error: "El teléfono debe ser un número español válido de 9 dígitos." });
  }
  res.json(buildSendResponse(createChallenge("phone", phone)));
});

router.post("/phone/confirm", handleConfirm);

// --- Email ---
router.post("/email/send", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Introduce una dirección de email válida." });
  }
  res.json(buildSendResponse(createChallenge("email", email)));
});

router.post("/email/confirm", handleConfirm);

export default router;
