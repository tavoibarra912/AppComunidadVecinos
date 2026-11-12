import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-brand-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
process.env.APP_PUBLIC_URL = "http://localhost:3000";
const { db, getSettings } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");
const { DEFAULT_BRAND, brandOf, validateBrand, brandStyle, injectBranding, publicSettingsOf } = await import("../../src/branding.js");
const { recoveryMessage } = await import("../../src/password-recovery.js");

const app = express();
app.use("/api", router);
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
function request(url, method = "GET", body, cookie = "") {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
    const req = new IncomingMessage(socket);
    req.url = `/api${url}`;
    req.method = method;
    req.headers = { host: "localhost:3000", cookie };
    req.body = body;
    const res = new ServerResponse(req);
    res.end = chunk => {
      try {
        res.emit("finish");
        resolve({ status: res.statusCode, data: chunk ? JSON.parse(String(chunk)) : null, cookie: String(res.getHeader("set-cookie") || "").split(";")[0] });
      } catch (error) { reject(error); }
      socket.destroy();
      return res;
    };
    app.handle(req, res, error => reject(error || new Error("Ruta sin respuesta")));
  });
}
const login = () => request("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" }).then(r => { assert.equal(r.status, 200); return r.cookie; });
const sampleLogo = `data:image/png;base64,${Buffer.from("fake-png-bytes").toString("base64")}`;
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test("marca por defecto: sin settings guardadas devuelve los valores de fábrica", () => {
  assert.deepEqual(brandOf({}), DEFAULT_BRAND);
  assert.deepEqual(brandOf(getSettings()), DEFAULT_BRAND);
  assert.match(brandStyle(DEFAULT_BRAND), /:root:root\{/);
  assert.match(brandStyle(DEFAULT_BRAND), /--nav:#11273e/);
  assert.match(brandStyle(DEFAULT_BRAND), /--brand:#198b84/);
  assert.match(brandStyle(DEFAULT_BRAND), /--canvas:#f7f9fb/);
  assert.match(brandStyle(DEFAULT_BRAND), /--surface:#ffffff/);
  assert.match(brandStyle(DEFAULT_BRAND), /--ink:#17212b/);
  assert.match(brandStyle(DEFAULT_BRAND), /--line:#e4e9ef/);
  assert.match(brandStyle(DEFAULT_BRAND), /--font-ui:Inter/);
  assert.match(brandStyle(DEFAULT_BRAND), /--font-size-base:14px/);
  assert.match(brandStyle(DEFAULT_BRAND), /--radius:5px/);
});
test("brandOf: estilo de interfaz validado y acotado", () => {
  const brand = brandOf({
    marca: {
      colorFondo: "#eeeeee",
      colorSuperficie: "#fafafa",
      colorTexto: "#111111",
      colorTextoSuave: "#555555",
      colorBorde: "#dddddd",
      tipografia: "georgia",
      tamanoBase: 40,
      radioBordes: -3,
      densidad: "amplia",
    },
  });
  assert.equal(brand.colorFondo, "#eeeeee");
  assert.equal(brand.colorSuperficie, "#fafafa");
  assert.equal(brand.colorTexto, "#111111");
  assert.equal(brand.colorTextoSuave, "#555555");
  assert.equal(brand.colorBorde, "#dddddd");
  assert.equal(brand.tipografia, "georgia");
  assert.equal(brand.tamanoBase, 18);
  assert.equal(brand.radioBordes, 0);
  assert.equal(brand.densidad, "amplia");
  const invalid = brandOf({
    marca: { colorFondo: "rojo", tipografia: "comic", tamanoBase: "x", radioBordes: 99, densidad: "extrema" },
  });
  assert.equal(invalid.colorFondo, DEFAULT_BRAND.colorFondo);
  assert.equal(invalid.tipografia, "inter");
  assert.equal(invalid.tamanoBase, 14);
  assert.equal(invalid.radioBordes, 16);
  assert.equal(invalid.densidad, "normal");
});
test("brandOf: tolera settings parciales y descarta valores inválidos", () => {
  const brand = brandOf({ marca: { nombre: "  Mi Vecindario  ", colorPrimario: "ROJO", colorAcento: "#123abc", logoDataUrl: "data:image/gif;base64,AA==" } });
  assert.equal(brand.nombre, "Mi Vecindario");
  assert.equal(brand.colorPrimario, DEFAULT_BRAND.colorPrimario);
  assert.equal(brand.colorAcento, "#123abc");
  assert.equal(brand.logoDataUrl, "");
});
test("validateBrand: acepta, rechaza y limita como corresponde", () => {
  assert.equal(validateBrand(undefined), null);
  assert.equal(validateBrand({}), null);
  assert.equal(validateBrand({ nombre: "X", colorPrimario: "#ABCDEF", colorAcento: "#000000", logoDataUrl: sampleLogo }), null);
  assert.match(validateBrand("texto"), /no es válido/);
  assert.match(validateBrand({ nombre: "" }), /nombre de marca/);
  assert.match(validateBrand({ colorPrimario: "ff0000" }), /color principal/i);
  assert.match(validateBrand({ colorAcento: "rgb(0,0,0)" }), /color de acento/i);
  assert.match(validateBrand({ logoDataUrl: "data:image/gif;base64,AA==" }), /logo/i);
  assert.match(validateBrand({ logoDataUrl: `${"data:image/png;base64,"}${"A".repeat(300_000)}` }), /logo/i);
  assert.match(validateBrand({ logoDataUrl: "data:text/html;base64,AA==" }), /logo/i);
  assert.match(validateBrand({ colorFondo: "blanco" }), /fondo general/i);
  assert.match(validateBrand({ colorTexto: "#12345" }), /texto/i);
  assert.match(validateBrand({ tipografia: "comic" }), /tipografía/i);
  assert.match(validateBrand({ tamanoBase: 30 }), /tamaño base/i);
  assert.match(validateBrand({ radioBordes: -1 }), /radio de bordes/i);
  assert.match(validateBrand({ densidad: "extrema" }), /densidad/i);
  assert.equal(validateBrand({ colorFondo: "#EEF6F4", tipografia: "georgia", tamanoBase: 16, radioBordes: 4, densidad: "compacta" }), null);
});
test("injectBranding: reemplaza marca en el HTML y escapa cierres de script", () => {
  const html = `<title>__BRAND_TITLE__</title><script id="brand-json" type="application/json">__BRAND_JSON__</script><script id="public-settings-json" type="application/json">__PUBLIC_SETTINGS_JSON__</script><style id="brand-vars">__BRAND_STYLE__</style>`;
  const bad = validateBrand({ nombre: "</script><script>alert(1)</script>" });
  assert.equal(bad, null, "el nombre con HTML no lo rechaza la validación; el escape lo impide injectBranding");
  const out = injectBranding(html, { marca: { nombre: "</script><img src=x onerror=1>", colorPrimario: "#101010", logoDataUrl: sampleLogo } });
  assert.ok(!out.includes("</script><img"), "el nombre no inyecta cierres de script");
  assert.ok(out.includes("<\\/script>") || !out.includes("</script><img"), "escape aplicado");
  assert.ok(out.includes("--nav:#101010"));
  assert.ok(out.includes(sampleLogo));
  assert.ok(!out.includes("__BRAND_JSON__") && !out.includes("__BRAND_STYLE__"));
  assert.ok(!out.includes("__PUBLIC_SETTINGS_JSON__"), "los ajustes públicos se inyectan");
  assert.ok(!out.includes("__BRAND_TITLE__"), "el título de la pestaña usa el nombre de marca");
  assert.ok(out.includes("<title>&lt;/script&gt;&lt;img src=x onerror=1&gt;</title>"), "el título escapa HTML");
});
test("publicSettingsOf: solo expone datos públicos y respeta los interruptores", () => {
  const fallback = publicSettingsOf({});
  assert.equal(fallback.permitirRegistro, true);
  assert.equal(fallback.permitirRecuperacion, true);
  assert.equal(fallback.mantenimiento, false);
  assert.equal("documentosMaxSizeMb" in fallback, false);
  const custom = publicSettingsOf({
    nombreAsociacion: "  Vecinos Unidos  ",
    emailContacto: "hola@example.test",
    telefonoContacto: "600111222",
    permitirRegistro: false,
    permitirRecuperacion: false,
    mantenimiento: true,
    mensajeMantenimiento: "  Volvemos el lunes.  ",
    documentosMaxSizeMb: 40,
  });
  assert.deepEqual(custom, {
    nombreAsociacion: "Vecinos Unidos",
    emailContacto: "hola@example.test",
    telefonoContacto: "600111222",
    permitirRegistro: false,
    permitirRecuperacion: false,
    mantenimiento: true,
    mensajeMantenimiento: "Volvemos el lunes.",
  });
});
test("recoveryMessage (recuperación) usa el nombre de marca configurado", () => {
  const msg = recoveryMessage({ brand: brandOf({ marca: { nombre: "Portal Vecinos" } }), url: "http://localhost/#reset-password=token" });
  assert.match(msg.subject, /Portal Vecinos/);
  assert.match(msg.text, /Portal Vecinos/);
  assert.match(msg.text, /30 minutos/);
});
test("API settings: guarda marca validada, la mergea y la expone en bootstrap", async () => {
  const cookie = await login();
  const bad = await request("/admin/settings", "PUT", { marca: { colorPrimario: "rojo" } }, cookie);
  assert.equal(bad.status, 400);
  const saved = await request("/admin/settings", "PUT", { marca: { nombre: "Vecinos del Parque", colorPrimario: "#0f3057", colorAcento: "#e8743b", logoDataUrl: sampleLogo } }, cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.marca.nombre, "Vecinos del Parque");
  assert.equal(saved.data.marca.logoDataUrl, sampleLogo);
  // Guardado parcial conserva el logo anterior.
  const partial = await request("/admin/settings", "PUT", { marca: { nombre: "Vecinos 2" } }, cookie);
  assert.equal(partial.data.marca.logoDataUrl, sampleLogo);
  assert.equal(partial.data.marca.colorPrimario, "#0f3057");
  // Quitar logo.
  const cleared = await request("/admin/settings", "PUT", { marca: { logoDataUrl: "" } }, cookie);
  assert.equal(cleared.data.marca.logoDataUrl, "");
  const boot = await request("/bootstrap", "GET", undefined, cookie);
  assert.equal(boot.data.settings.marca.nombre, "Vecinos 2");
  // Otros roles no tocan la marca.
  const carlos = await request("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" });
  assert.equal((await request("/admin/settings", "PUT", { marca: { nombre: "Hack" } }, carlos.cookie)).status, 403);
});
