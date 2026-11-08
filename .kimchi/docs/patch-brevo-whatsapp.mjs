import fs from "node:fs";

const archivo = "src/delivery-providers.js";
let t = fs.readFileSync(archivo, "utf8");

const viejo = `      if (channel === "whatsapp" && s.provider === "brevo")
        throw problem("WhatsApp está disponible con Twilio; Brevo solo ofrece SMS.");
      out.provider = s.provider;
      if (out.enabled) {
        if (s.provider === "twilio") {
          if (
            !/^AC[a-f0-9]{32}$/i.test(out.accountSid) ||
            !phoneNumber(out.from) ||
            !out.token
          )
            throw problem(
              \`\${channel}: indicá Account SID, token y número emisor internacional.\`,
            );
        } else if (!out.token || !/^[a-zA-Z0-9 -]{2,11}$/.test(out.from)) {
          throw problem(
            \`\${channel} (Brevo): indicá la API key y un nombre de remitente de 2 a 11 caracteres alfanuméricos.\`,
          );
        }
      }
      if (
        channel === "whatsapp" &&
        out.enabled &&
        !/^HX[a-f0-9]{32}$/i.test(out.contentSid)
      )`;

if (!t.includes(viejo)) {
  console.error("NO MATCH");
  process.exit(1);
}

const nuevo = `      out.provider = s.provider;
      if (out.enabled) {
        if (s.provider === "twilio") {
          if (
            !/^AC[a-f0-9]{32}$/i.test(out.accountSid) ||
            !phoneNumber(out.from) ||
            !out.token
          )
            throw problem(
              \`\${channel}: indicá Account SID, token y número emisor internacional.\`,
            );
        } else if (channel === "whatsapp") {
          if (!out.token || !/^\\d{8,15}$/.test(out.from))
            throw problem(
              "WhatsApp (Brevo): indicá la API key y el número de WhatsApp emisor con código de país (solo dígitos).",
            );
          if (out.contentSid && !/^\\d+$/.test(out.contentSid))
            throw problem(
              "WhatsApp (Brevo): el ID de plantilla debe ser numérico.",
            );
        } else if (!out.token || !/^[a-zA-Z0-9 -]{2,11}$/.test(out.from)) {
          throw problem(
            \`\${channel} (Brevo): indicá la API key y un nombre de remitente de 2 a 11 caracteres alfanuméricos.\`,
          );
        }
      }
      if (
        channel === "whatsapp" &&
        out.enabled &&
        s.provider === "twilio" &&
        !/^HX[a-f0-9]{32}$/i.test(out.contentSid)
      )`;

t = t.replace(viejo, nuevo);

// Envío Brevo WhatsApp: rama dentro de sendMessage antes del body de Twilio.
const ancla = "  if (!s.provider) s.provider = \"twilio\";\n";
const brevoWhatsapp = `  if (!s.provider) s.provider = "twilio";
  if (s.provider === "brevo" && channel === "whatsapp") {
    const payload = {
      senderNumber: s.from,
      contactNumbers: [to],
      text: message.slice(0, 1000),
    };
    if (/^\\d+$/.test(s.contentSid || "")) payload.templateId = Number(s.contentSid);
    const response = await fetch("https://api.brevo.com/v3/whatsapp/sendMessage", {
      method: "POST",
      headers: {
        "api-key": s.token,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw problem(
        \`Brevo rechazó el envío\${result.message ? \`: \${result.message}\` : "."}\`,
        502,
      );
    return result.messageId || "brevo-accepted";
  }
`;
if (!t.includes(ancla)) {
  console.error("ANCLA NO ENCONTRADA");
  process.exit(1);
}
t = t.replace(ancla, brevoWhatsapp);

fs.writeFileSync(archivo, t);
console.log("OK");
