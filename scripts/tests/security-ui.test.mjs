import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function element(id = "") {
  return {
    id, hidden: false, disabled: false, textContent: "", style: {}, children: [], handlers: {}, elements: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    reset() { for (const field of Object.values(this.elements)) field.value = ""; },
    set innerHTML(_value) { throw new Error("La vista no debe interpretar HTML de auditoría"); },
  };
}
function fixture(file, exports, extras = {}) {
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) elements.set(selector, element(selector.replace(/^#/, "")));
    return elements.get(selector);
  };
  const document = {
    querySelector: get,
    querySelectorAll(selector) { return selector === ".login-view" ? [get("#login-view-signin"), get("#login-view-forgot")] : []; },
    createElement: tag => element(tag),
  };
  const window = { location: { hash: "", pathname: "/", search: "" }, history: { replaceState(_state, _unused, value) { window.location.hash = ""; window.history.value = value; } }, addEventListener() {} };
  const context = { document, window, sessionStorage: { getItem: () => null }, api: {}, clearSession() {}, toast() {}, hasPermission: () => true, ...extras };
  const source = readFileSync(new URL(`../../public/js/features/${file}.js`, import.meta.url), "utf8")
    .replace(/^import .+;\r?\n/gm, "").replace(/^export /gm, "");
  vm.runInNewContext(`${source}\nglobalThis.exposed = { ${exports.join(", ")} };`, context);
  return { get, context, window, ...context.exposed };
}

test("UI recuperación: abre enlace, borra token de URL, confirma contraseña y vuelve al login", async () => {
  const calls = [];
  let cleared = false;
  const ui = fixture("auth", ["showRecoveryFromLink", "showLoginView"], { api: { auth: async (...args) => { calls.push(args); return { ok: true }; } }, clearSession: () => { cleared = true; } });
  const token = "a".repeat(64);
  ui.window.location.hash = `#reset-password=${token}`;
  assert.equal(ui.showRecoveryFromLink(), true);
  assert.equal(ui.window.location.hash, "");
  assert.equal(ui.window.history.value, "/");
  assert.equal(ui.get("#login-reset-block").hidden, false);
  assert.equal(ui.get("#login-forgot-form").hidden, true);
  const form = ui.get("#login-reset-form");
  form.elements = { password: { value: "new-password-safe" }, password2: { value: "different" } };
  await form.handlers.submit({ preventDefault() {}, target: form });
  assert.equal(calls.length, 0);
  assert.match(ui.get("#login-reset-error").textContent, /no coinciden/);
  form.elements.password2.value = form.elements.password.value;
  await form.handlers.submit({ preventDefault() {}, target: form });
  assert.equal(calls[0][0], "reset-password");
  assert.equal(calls[0][1].token, token);
  assert.equal(cleared, true);
  assert.equal(ui.get("#login-reset-block").hidden, true);
  assert.equal(ui.get("#login-view-signin").hidden, false);
  assert.equal(ui.get("#login-signin-notice").hidden, false);
});
test("UI recuperación: enlace inválido y error de API permanecen visibles sin cerrar formulario", async () => {
  const ui = fixture("auth", ["showRecoveryFromLink"], { api: { auth: async () => { throw new Error("El enlace venció"); } } });
  assert.equal(ui.showRecoveryFromLink(), false);
  ui.window.location.hash = "#reset-password=invalid";
  assert.equal(ui.showRecoveryFromLink(), true);
  assert.match(ui.get("#login-reset-error").textContent, /no es válido/);
  ui.window.location.hash = `#reset-password=${"b".repeat(64)}`;
  ui.showRecoveryFromLink();
  const form = ui.get("#login-reset-form");
  form.elements = { password: { value: "new-password-safe" }, password2: { value: "new-password-safe" } };
  await form.handlers.submit({ preventDefault() {}, target: form });
  assert.match(ui.get("#login-reset-error").textContent, /venció/);
  assert.equal(ui.get("#login-reset-block").hidden, false);
});
test("UI auditoría: filtra y pagina por API, trata contenido como texto y rechaza sin permiso", async () => {
  const calls = [];
  let allowed = true;
  const ui = fixture("audit", ["renderAudit"], { hasPermission: () => allowed, api: { listAudit: async params => {
    calls.push(params);
    return { items: [{ createdAt: new Date().toISOString(), actorName: "<script>unsafe</script>", action: "login", outcome: "failure", details: {} }], total: 26 };
  } } });
  ui.get("#audit-filter").elements.action = { value: "login", options: [{ value: "login", textContent: "Inicio de sesión" }] };
  await ui.renderAudit();
  assert.equal(calls[0].action, "login");
  assert.equal(calls[0].limit, 25);
  assert.equal(ui.get("#audit-next").disabled, false);
  assert.equal(ui.get("#audit-prev").disabled, true);
  const table = ui.get("#audit-results").children[0];
  assert.equal(table.children[2].children[0].children[1].textContent, "<script>unsafe</script>");
  ui.get("#audit-next").handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.at(-1).offset, 25);
  allowed = false;
  const count = calls.length;
  await ui.renderAudit();
  assert.equal(calls.length, count);
  assert.equal(ui.get("#audit-results").children.length, 0);
  assert.match(ui.get("#audit-status").textContent, /No tienes permiso/);
});
