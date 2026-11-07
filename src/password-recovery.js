import crypto from "node:crypto";
import { db } from "./db.js";
import { setPassword } from "./auth.js";
import { passwordError, validEmail } from "./validation.js";
import { providers, seal, unseal, smtpTransport } from "./delivery-providers.js";
import { recordAudit } from "./audit.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS password_recovery_requests (emailHash TEXT PRIMARY KEY, requestedAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS password_recovery_mail (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL, tokenHash TEXT NOT NULL, payload TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', createdAt INTEGER NOT NULL
  );
`);
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const RECOVERY_MESSAGE = "Si existe una cuenta activa con ese email, se enviarán instrucciones para recuperar la contraseña. Revisá también la carpeta de correo no deseado.";
export function recoveryUrl() {
  let url;
  try { url = new URL(process.env.APP_PUBLIC_URL); } catch { throw fail("Configurá APP_PUBLIC_URL para habilitar la recuperación de contraseña.", 503); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:")))
    throw fail("APP_PUBLIC_URL debe ser el origen HTTPS de la aplicación (HTTP solo en localhost de desarrollo).", 503);
  return url;
}
export function requestRecovery(email, req) {
  if (!validEmail(email)) throw fail("Indicá una dirección de email válida.");
  const url = recoveryUrl();
  if (!providers().smtp.enabled) throw fail("El correo SMTP no está habilitado. Contactá al administrador.", 503);
  const address = email.trim().toLowerCase(), now = Date.now(), emailHash = digest(address);
  db.prepare("DELETE FROM password_recovery_requests WHERE requestedAt < ?").run(now - 3600000);
  const recent = db.prepare("SELECT requestedAt FROM password_recovery_requests WHERE emailHash=?").get(emailHash);
  if (recent && now - recent.requestedAt < 60000) return { mensaje: RECOVERY_MESSAGE };
  const token = crypto.randomBytes(32).toString("hex"), tokenHash = digest(token);
  url.hash = `reset-password=${token}`;
  // Never wait for SMTP in the public request, including for unknown accounts.
  const payload = seal(JSON.stringify({ to: address, url: url.href }));
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO password_recovery_requests VALUES (?,?) ON CONFLICT(emailHash) DO UPDATE SET requestedAt=excluded.requestedAt").run(emailHash, now);
    const user = db.prepare("SELECT id FROM users WHERE LOWER(email)=? AND activo=1").get(address);
    if (user) {
      db.prepare("UPDATE users SET resetToken=?,resetTokenExpira=? WHERE id=?").run(tokenHash, new Date(now + 30 * 60000).toISOString(), user.id);
      db.prepare("DELETE FROM password_recovery_mail WHERE userId=?").run(user.id);
      db.prepare("INSERT INTO password_recovery_mail(id,userId,tokenHash,payload,createdAt) VALUES (?,?,?,?,?)").run(crypto.randomUUID(), user.id, tokenHash, payload, now);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  recordAudit({ action: "password-recovery.requested", req });
  return { mensaje: RECOVERY_MESSAGE };
}
export function resetRecoveredPassword(token, password, req) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw fail("El enlace de recuperación no es válido o venció. Solicitá uno nuevo.");
  const error = passwordError(password);
  if (error) throw fail(error);
  db.exec("BEGIN IMMEDIATE");
  try {
    const user = db.prepare("SELECT * FROM users WHERE resetToken=? AND resetTokenExpira > ? AND activo=1").get(digest(token), new Date().toISOString());
    if (!user) throw fail("El enlace de recuperación no es válido o venció. Solicitá uno nuevo.");
    setPassword(user.id, password);
    db.prepare("DELETE FROM password_recovery_mail WHERE userId=?").run(user.id);
    recordAudit({ action: "password-recovery.completed", resourceType: "user", resourceId: user.id, req });
    db.exec("COMMIT");
  } catch (failure) { db.exec("ROLLBACK"); throw failure; }
  return { ok: true };
}
export async function sendRecoveryEmail({ to, url }) {
  const config = providers(false).smtp;
  if (!config.enabled) throw fail("SMTP desactivado.", 503);
  const transport = smtpTransport(config);
  try {
    const result = await transport.sendMail({
      from: { name: config.fromName, address: config.from }, to,
      subject: "Recuperar tu contraseña de Peñarrubia",
      text: `Solicitaste recuperar tu contraseña. Abrí este enlace (válido durante 30 minutos y para un solo uso):\n\n${url}\n\nSi no lo solicitaste, ignorá este correo. Tu contraseña no cambió.`,
    });
    if (!result.accepted?.length) throw fail("SMTP rechazó el destinatario.", 502);
  } finally { transport.close(); }
}
let running = false;
export async function processRecoveryMail(send = sendRecoveryEmail) {
  if (running) return;
  running = true;
  try {
    for (const mail of db.prepare("SELECT * FROM password_recovery_mail WHERE state='pending' ORDER BY createdAt LIMIT 10").all()) {
      const user = db.prepare("SELECT activo,resetToken,resetTokenExpira,email FROM users WHERE id=?").get(mail.userId);
      if (!db.prepare("UPDATE password_recovery_mail SET state='sending' WHERE id=? AND state='pending'").run(mail.id).changes) continue;
      let outcome = "skipped";
      try {
        const payload = JSON.parse(unseal(mail.payload));
        if (user?.activo && user.resetToken === mail.tokenHash && Date.parse(user.resetTokenExpira) > Date.now() && user.email.toLowerCase() === payload.to) {
          await send(payload);
          outcome = "accepted";
        }
      } catch { outcome = "failed"; }
      // SMTP may have accepted the mail before a connection failure: no automatic retry.
      db.prepare("DELETE FROM password_recovery_mail WHERE id=?").run(mail.id);
      if (outcome !== "accepted") db.prepare("UPDATE users SET resetToken='',resetTokenExpira='' WHERE id=? AND resetToken=?").run(mail.userId, mail.tokenHash);
      recordAudit({ action: "password-recovery.mail", resourceType: "user", resourceId: mail.userId, outcome });
    }
  } finally { running = false; }
}
export function recoverInterruptedMail() {
  for (const mail of db.prepare("SELECT userId,tokenHash FROM password_recovery_mail WHERE state='sending'").all()) {
    db.prepare("UPDATE users SET resetToken='',resetTokenExpira='' WHERE id=? AND resetToken=?").run(mail.userId, mail.tokenHash);
    recordAudit({ action: "password-recovery.mail", resourceType: "user", resourceId: mail.userId, outcome: "uncertain" });
  }
  db.prepare("DELETE FROM password_recovery_mail WHERE state='sending'").run();
}
