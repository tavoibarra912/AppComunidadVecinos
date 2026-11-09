import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-smtp-diag-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));

const PORT = 3474;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", d => { log += d; });
server.stderr.on("data", d => { log += d; });
const BASE = `http://localhost:${PORT}/api`;

try {
  await new Promise(r => setTimeout(r, 5000));
  const login = await fetch(`${BASE}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "admin" }) });
  if (!login.headers.get("set-cookie")) { console.error("LOGIN FALLÓ:", login.status, JSON.stringify(await login.json().catch(() => ({})))); process.exit(1); }
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const api = async (ruta, metodo = "GET", cuerpo) => {
    const r = await fetch(BASE + ruta, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  // 1) Qué hay guardado hoy
  const actual = await api("/communications/providers");
  console.log("1) CONFIG GUARDADA:", JSON.stringify(actual.data, null, 1).slice(0, 700));

  // 2) Guardar SMTP genérico completo
  const smtpGenerico = await api("/communications/providers", "PUT", {
    smtp: { enabled: true, provider: "smtp", host: "smtp.gmail.com", port: 587, secure: false, user: "test@user.com", password: "app-pass-123", from: "test@penarrubia.es", fromName: "Comunidad", clearSecret: false },
    sms: { enabled: false, provider: "twilio", accountSid: "", token: "", from: "", clearSecret: false },
    whatsapp: { enabled: false, provider: "twilio", accountSid: "", token: "", from: "", contentSid: "", clearSecret: false },
  });
  console.log("2) PUT SMTP genérico:", smtpGenerico.status, smtpGenerico.data.error || "");
  const ver1 = await api("/communications/providers");
  console.log("   smtp persistido:", JSON.stringify({ enabled: ver1.data.smtp.enabled, provider: ver1.data.smtp.provider, host: ver1.data.smtp.host, port: ver1.data.smtp.port, hasSecret: ver1.data.smtp.hasSecret, user: ver1.data.smtp.user, from: ver1.data.smtp.from }));

  // 3) Guardar modo Brevo solo API key
  const brevoMail = await api("/communications/providers", "PUT", {
    smtp: { enabled: true, provider: "brevo", host: "", port: "", secure: false, user: "", password: "xkeysib-dummy-123", from: "test@penarrubia.es", fromName: "Comunidad", clearSecret: false },
    sms: { enabled: false, provider: "brevo", accountSid: "", token: "", from: "", clearSecret: false },
    whatsapp: { enabled: false, provider: "brevo", accountSid: "", token: "", from: "", contentSid: "", clearSecret: false },
  });
  console.log("3) PUT Brevo email:", brevoMail.status, brevoMail.data.error || "");
  const ver2 = await api("/communications/providers");
  console.log("   smtp brevo:", JSON.stringify({ provider: ver2.data.smtp.provider, host: ver2.data.smtp.host, port: ver2.data.smtp.port, hasSecret: ver2.data.smtp.hasSecret }));

  // 4) Prueba de envío con la API key dummy → error esperado de Brevo (401)
  const prueba = await api("/communications/providers/test", "POST", { channel: "email", to: "destino@example.com" });
  console.log("4) TEST SEND (dummy key):", prueba.status, JSON.stringify(prueba.data));

  // 5) SMS brevo dummy
  const smsDummy = await api("/communications/providers", "PUT", {
    smtp: { enabled: false, provider: "brevo", host: "", port: "", secure: false, user: "", password: "", from: "", fromName: "", clearSecret: false },
    sms: { enabled: true, provider: "brevo", accountSid: "", token: "xkeysib-dummy-123", from: "Penarrubia", clearSecret: false },
    whatsapp: { enabled: false, provider: "brevo", accountSid: "", token: "", from: "", contentSid: "", clearSecret: false },
  });
  console.log("5) PUT Brevo SMS:", smsDummy.status, smsDummy.data.error || "");
  const pruebaSms = await api("/communications/providers/test", "POST", { channel: "sms", to: "+34600111222" });
  console.log("   TEST SMS (dummy):", pruebaSms.status, JSON.stringify(pruebaSms.data));

  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 500));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
