import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { db, DATA_DIR } from "./db.js";
import { problem, getPreferences } from "./communication-store.js";

function key() {
  const configured = process.env.APP_PROVIDER_KEY;
  if (configured) {
    if (!/^[a-f0-9]{64}$/i.test(configured))
      throw problem(
        "APP_PROVIDER_KEY debe contener 64 caracteres hexadecimales.",
        503,
      );
    return Buffer.from(configured, "hex");
  }
  const file = path.join(DATA_DIR, "provider-key");
  if (!fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, crypto.randomBytes(32), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const value = fs.readFileSync(file);
  if (value.length !== 32)
    throw problem("La clave local de proveedores no es válida.", 503);
  return value;
}
export function seal(value) {
  if (!value) return "";
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64"))
    .join(".");
}
export function unseal(value) {
  if (!value) return "";
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((v) => Buffer.from(v, "base64"));
    const cipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw problem(
      "No se pudo descifrar la credencial del proveedor. Revisá la clave del servidor.",
      503,
    );
  }
}
const defaults = () => ({
  smtp: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    from: "",
    fromName: "Peñarrubia",
  },
  sms: {
    enabled: false,
    provider: "twilio",
    accountSid: "",
    token: "",
    from: "",
  },
  whatsapp: {
    enabled: false,
    provider: "twilio",
    accountSid: "",
    token: "",
    from: "",
    contentSid: "",
  },
});
export function providers(masked = true) {
  const saved = db
    .prepare("SELECT data FROM communication_providers WHERE id='global'")
    .get();
  const result = saved ? JSON.parse(saved.data) : defaults();
  for (const channel of ["smtp", "sms", "whatsapp"]) {
    const field = channel === "smtp" ? "password" : "token";
    result[channel].hasSecret = !!result[channel][field];
    if (masked) delete result[channel][field];
    else result[channel][field] = unseal(result[channel][field]);
  }
  return result;
}
const clean = (value, max = 500) => {
  if (typeof value !== "string" || value.length > max || /[\r\n\0]/.test(value))
    throw problem("Los campos del proveedor no son válidos.");
  return value.trim();
};
export function saveProviders(input) {
  if (!input || typeof input !== "object")
    throw problem("Configuración no válida.");
  const row = db
    .prepare("SELECT data FROM communication_providers WHERE id='global'")
    .get();
  const old = row ? JSON.parse(row.data) : defaults();
  const result = defaults();
  for (const channel of ["smtp", "sms", "whatsapp"]) {
    const s = input[channel];
    if (!s || typeof s !== "object" || Array.isArray(s))
      throw problem("Completá la configuración de los tres canales.");
    const out = result[channel];
    out.enabled = s.enabled === true;
    const fields =
      channel === "smtp"
        ? ["host", "user", "from", "fromName"]
        : [
            "accountSid",
            "from",
            ...(channel === "whatsapp" ? ["contentSid"] : []),
          ];
    for (const field of fields) out[field] = clean(s[field] || "");
    const secret = channel === "smtp" ? "password" : "token";
    if (
      s[secret] !== undefined &&
      (typeof s[secret] !== "string" ||
        s[secret].length > 1000 ||
        /[\r\n\0]/.test(s[secret]))
    )
      throw problem("La credencial no es válida.");
    out[secret] =
      s.clearSecret === true
        ? ""
        : s[secret]
          ? seal(s[secret])
          : old[channel][secret];
    if (channel === "smtp") {
      out.port = Number(s.port);
      out.secure = s.secure === true;
      if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535)
        throw problem("Puerto SMTP no válido.");
      if (
        out.enabled &&
        (!/^[a-z0-9.:-]+$/i.test(out.host) ||
          !emailAddress(out.from) ||
          !out.user ||
          !out.password)
      )
        throw problem(
          "SMTP necesita servidor, remitente, usuario y contraseña.",
        );
    } else {
      if (s.provider !== "twilio")
        throw problem("El proveedor de mensajería admitido es Twilio.");
      out.provider = "twilio";
      if (
        out.enabled &&
        (!/^AC[a-f0-9]{32}$/i.test(out.accountSid) ||
          !phoneNumber(out.from) ||
          !out.token)
      )
        throw problem(
          `${channel}: indicá Account SID, token y número emisor internacional.`,
        );
      if (
        channel === "whatsapp" &&
        out.enabled &&
        !/^HX[a-f0-9]{32}$/i.test(out.contentSid)
      )
        throw problem(
          "WhatsApp necesita un Content SID de plantilla aprobada. La variable {{1}} debe contener el aviso.",
        );
    }
  }
  db.prepare(
    "INSERT INTO communication_providers(id,data) VALUES ('global',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(JSON.stringify(result));
  return providers();
}
export function emailAddress(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value)
  );
}
export function phoneNumber(value) {
  return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
}
export function smtpTransport(s) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    requireTLS: true,
    auth: { user: s.user, pass: s.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
export async function sendMessage(
  channel,
  to,
  message,
  config = providers(false),
) {
  const s = config[channel === "email" ? "smtp" : channel];
  if (!s?.enabled) throw problem("El proveedor está desactivado.", 503);
  if (channel === "email") {
    if (!emailAddress(to)) throw problem("El email de destino no es válido.");
    const transport = smtpTransport(s);
    try {
      const result = await transport.sendMail({
        from: { name: s.fromName, address: s.from },
        to,
        subject: "Nueva comunicación de tu comunidad",
        text: message,
      });
      if (!result.accepted?.length)
        throw problem("El servidor SMTP rechazó el destinatario.", 502);
      return result.messageId || "smtp-accepted";
    } finally {
      transport.close();
    }
  }
  if (!["sms", "whatsapp"].includes(channel) || !phoneNumber(to))
    throw problem("Canal o teléfono de destino no válido.");
  const body = new URLSearchParams({
    To: channel === "whatsapp" ? `whatsapp:${to}` : to,
    From: channel === "whatsapp" ? `whatsapp:${s.from}` : s.from,
  });
  if (channel === "whatsapp") {
    body.set("ContentSid", s.contentSid);
    body.set("ContentVariables", JSON.stringify({ 1: message.slice(0, 900) }));
  } else body.set("Body", message.slice(0, 1200));
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${s.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${s.accountSid}:${s.token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  const result = await response.json();
  if (
    !response.ok ||
    !result.sid ||
    ["failed", "undelivered", "canceled"].includes(result.status)
  )
    throw problem(
      `Twilio rechazó el envío${Number.isInteger(result.code) ? ` (código ${result.code})` : ""}.`,
      502,
    );
  return result.sid;
}
export function destination(user, channel) {
  const p = getPreferences(user);
  if (!p[`${channel}Enabled`]) return null;
  return channel === "email" ? p.email : p.phone;
}
