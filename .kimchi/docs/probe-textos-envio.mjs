import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "pen-textos-"));
mkdirSync(path.join(dir, "data"), { recursive: true });
copyFileSync("data/penarrubia.db", path.join(dir, "data", "penarrubia.db"));
const PORT = 3476;
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), APP_DATA_DIR: path.join(dir, "data"), APP_UPLOADS_DIR: path.join(dir, "uploads") }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", d => { log += d; });
server.stderr.on("data", d => { log += d; });
let fails = 0; const check = (l, c) => { fails += c ? 0 : 1; console.log((c ? "✔ " : "✖ ") + l); };

try {
  await new Promise(r => setTimeout(r, 5000));
  const login = await fetch(`http://localhost:${PORT}/api/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "super_admin", password: "admin" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const api = async (ruta, metodo = "GET", cuerpo) => {
    const r = await fetch(`http://localhost:${PORT}/api${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };

  const put = await api("/admin/settings", "PUT", {
    textos: {
      emailAvisoAsunto: "Aviso de {{comunidad}}: {{titulo}}",
      smsAviso: "{{comunidad}} te informa: {{titulo}}. Detalles en {{plataforma}}.",
      pruebaTexto: "Prueba personalizada de {{plataforma}}.",
    },
  });
  check(`settings PUT con textos (status ${put.status})`, put.status === 200);
  const ver = await api("/admin/settings");
  check("textos personalizados persistidos", ver.data.textos?.emailAvisoAsunto === "Aviso de {{comunidad}}: {{titulo}}" && ver.data.textos?.pruebaTexto?.includes("personalizada"));

  const { textosDe, aplicarPlantilla } = await import("../../public/js/textos-envio.js");
  const combinados = textosDe({ textos: ver.data.textos });
  check("al consumir se completan los defaults", !!combinados.emailRecuperacionTexto && combinados.emailRecuperacionTexto.includes("{{enlace}}"));
  const render = aplicarPlantilla(ver.data.textos.emailAvisoAsunto, { comunidad: "Peñarrubia", titulo: "Corte de agua" });
  check("plantilla renderiza placeholders", render === "Aviso de Peñarrubia: Corte de agua");
  const sms = aplicarPlantilla(ver.data.textos.smsAviso, { comunidad: "Peñarrubia", titulo: "Corte", plataforma: "Peñarrubia App" });
  check("SMS renderiza", sms === "Peñarrubia te informa: Corte. Detalles en Peñarrubia App.");

  await api("/admin/settings", "PUT", { marca: { nombre: "Mi Comunidad App" } });
  const ver2 = await api("/admin/settings");
  const textoConPlataforma = aplicarPlantilla(textosDe({ textos: ver2.data.textos }).pruebaTexto, { plataforma: ver2.data.marca.nombre });
  check("{{plataforma}} usa el nombre de la marca", textoConPlataforma.includes("Mi Comunidad App"));
  if (/error|Error/i.test(log)) console.log("SERVER-LOG:", log.slice(0, 400));
} finally {
  server.kill();
  await new Promise(r => server.once("exit", r));
  await new Promise(r => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(fails ? `${fails} fallos` : "TEXTOS-ENVIO OK");
process.exit(fails ? 1 : 0);
