import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createAuthRateLimit } from "../../src/auth-rate-limit.js";

function attempt(
  limit,
  { path = "/signin", ip = "192.0.2.1", usuario = "vecino", status = 401, ...body } = {},
) {
  const res = new EventEmitter();
  res.statusCode = status;
  res.set = () => res;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = () => res;
  let reached = false;
  limit({ method: "POST", path, ip, body: { usuario, ...body }, user: { id: "u1" } }, res, () => {
    reached = true;
    res.emit("finish");
  });
  return { status: res.statusCode, reached };
}

test("F10 · límites por identidad/IP, reinicio tras éxito y caducidad", () => {
  let time = 1000;
  const limit = createAuthRateLimit({ now: () => time });
  for (let i = 0; i < 14; i++) assert.ok(attempt(limit).reached);
  assert.ok(attempt(limit, { status: 200 }).reached);
  for (let i = 0; i < 15; i++) assert.ok(attempt(limit).reached);
  assert.equal(attempt(limit, { usuario: " VECINO " }).status, 429);
  assert.equal(attempt(limit, { path: "/SIGNIN/" }).status, 429);
  assert.ok(attempt(limit, { ip: "192.0.2.2" }).reached);
  assert.ok(attempt(limit, { usuario: "otro" }).reached);
  assert.ok(attempt(limit, { path: "/reset-password", token: "token-distinto" }).reached);
  time += 15 * 60_000;
  assert.ok(attempt(limit).reached);
});

test("F10 · recuperación, registro y cambio tienen presupuestos independientes", () => {
  const limit = createAuthRateLimit();
  for (let i = 0; i < 5; i++)
    assert.ok(
      attempt(limit, { path: "/forgot-password", email: "a@test.invalid", status: 200 }).reached,
    );
  assert.equal(attempt(limit, { path: "/forgot-password", email: "a@test.invalid" }).status, 429);
  assert.ok(attempt(limit, { path: "/forgot-password", email: "b@test.invalid" }).reached);
  assert.ok(attempt(limit, { status: 200 }).reached);
  for (let i = 0; i < 20; i++) assert.ok(attempt(limit, { path: "/signup", status: 201 }).reached);
  assert.equal(attempt(limit, { path: "/signup" }).status, 429);
  for (let i = 0; i < 15; i++) assert.ok(attempt(limit, { path: "/change-password" }).reached);
  assert.equal(attempt(limit, { path: "/change-password" }).status, 429);
  assert.ok(attempt(limit, { path: "/logout", status: 200 }).reached);
});

test("F10 · la solicitud de baja cuenta sus fallos de contraseña como el cambio de contraseña", () => {
  const limit = createAuthRateLimit();
  for (let i = 0; i < 14; i++) assert.ok(attempt(limit, { path: "/deletion-request" }).reached);
  // Una solicitud válida no consume intentos y limpia el contador de la cuenta.
  assert.ok(attempt(limit, { path: "/deletion-request", status: 201 }).reached);
  for (let i = 0; i < 15; i++) assert.ok(attempt(limit, { path: "/deletion-request" }).reached);
  assert.equal(attempt(limit, { path: "/deletion-request" }).status, 429);
  // El presupuesto es independiente del resto de operaciones de la cuenta.
  assert.ok(attempt(limit, { path: "/change-password" }).reached);
});

test("F10 · barridos de credenciales tienen un límite agregado solo de fallos", () => {
  let time = 1000;
  const limit = createAuthRateLimit({ now: () => time });
  for (let i = 0; i < 500; i++) assert.ok(attempt(limit, { usuario: `inexistente-${i}` }).reached);
  assert.equal(attempt(limit, { usuario: "otra-identidad" }).status, 429);
  assert.ok(
    attempt(limit, { path: "/forgot-password", email: "vecino@test.invalid", status: 200 }).reached,
  );
  time += 60_000;
  assert.ok(attempt(limit, { usuario: "otra-identidad", status: 200 }).reached);
});
