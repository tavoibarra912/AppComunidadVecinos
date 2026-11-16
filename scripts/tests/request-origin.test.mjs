import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin, publicOrigin } from "../../src/request-origin.js";

const req = (headers = {}, method = "POST") => ({
  method,
  protocol: "http",
  get: (name) => ({ host: "35.209.188.202", ...headers })[name],
});
test("proxy: permite el origen público exacto sin confiar en el Host del backend", () => {
  const origin = publicOrigin("https://comunidad.netlify.app/");
  assert.equal(isSameOrigin(req({ origin }), origin), true);
  assert.equal(isSameOrigin(req({ origin: "https://atacante.test" }), origin), false);
  assert.equal(isSameOrigin(req({ origin: "http://35.209.188.202" }), origin), false);
  assert.equal(isSameOrigin(req({ origin, "sec-fetch-site": "cross-site" }), origin), false);
  assert.equal(isSameOrigin(req({ origin: "null" }), origin), false);
});
test("local: conserva la comprobación de origen sin configuración de despliegue", () => {
  assert.equal(isSameOrigin(req({ origin: "http://35.209.188.202" })), true);
  assert.equal(isSameOrigin(req({ origin: "https://atacante.test" })), false);
});

test("proxy: permite ambos dominios explícitos y rechaza otros orígenes", () => {
  const origins = [
    publicOrigin("https://penarrubia.35.209.188.202.sslip.io"),
    publicOrigin("https://gestion-penarrubia.netlify.app"),
  ];
  for (const origin of origins) {
    assert.equal(isSameOrigin(req({ origin }), origins), true);
    assert.equal(isSameOrigin(req({ origin, "sec-fetch-site": "cross-site" }), origins), false);
  }
  for (const origin of ["https://evil.example", "https://otra-app.netlify.app", "null"]) {
    assert.equal(isSameOrigin(req({ origin }), origins), false);
  }
});
test("configuración: rechaza rutas, credenciales y HTTP de producción", () => {
  for (const value of [
    "https://example.com/path",
    "https://u:p@example.com",
    "https://example.com?x=1",
    "http://example.com",
    "*",
  ])
    assert.throws(() => publicOrigin(value, true));
  assert.equal(publicOrigin("http://localhost:3000", false), "http://localhost:3000");
  assert.throws(() => publicOrigin("http://localhost:3000", true));
});
