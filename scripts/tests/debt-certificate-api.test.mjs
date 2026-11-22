import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const source = readFileSync("public/js/api.js", "utf8").replace(
  "export const api =",
  "window.api =",
);
function fixture(t) {
  const dom = new JSDOM("", { url: "http://localhost", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.AbortSignal = AbortSignal;
  dom.window.eval(source);
  return dom.window;
}
test("cliente PDF: descarga binaria con ámbito explícito, sesión y datos sin caché", async (t) => {
  const w = fixture(t),
    calls = [];
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response("%PDF-1.4 synthetic", { headers: { "Content-Type": "application/pdf" } });
  };
  const blob = await w.api.debtCertificate("com/1", "propertyId", "prop&1");
  assert.match(await blob.text(), /^%PDF-/);
  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.pathname, "/api/fees/communities/com%2F1/debt-certificate");
  assert.equal(url.searchParams.get("propertyId"), "prop&1");
  assert.equal(url.searchParams.has("ownerId"), false);
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.cache, "no-store");
  await assert.rejects(w.api.debtCertificate("c", "ambos", "p"), /ámbito/);
  assert.equal(calls.length, 1);
});
test("cliente PDF: errores de permisos, sesión y respuestas HTML no se descargan como certificados", async (t) => {
  const w = fixture(t);
  let expired = 0;
  w.addEventListener("auth:expired", () => expired++);
  w.fetch = async () =>
    new Response(JSON.stringify({ error: "Inicia sesión." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(w.api.debtCertificate("c", "ownerId", "o"), /Inicia sesión/);
  assert.equal(expired, 1);
  w.fetch = async () =>
    new Response(JSON.stringify({ error: "Sin permiso." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(w.api.debtCertificate("c", "ownerId", "o"), /Sin permiso/);
  w.fetch = async () =>
    new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(w.api.debtCertificate("c", "ownerId", "o"), /PDF válido/);
});
