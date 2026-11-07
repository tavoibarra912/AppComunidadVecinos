import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("contraseña actual incorrecta no dispara cierre de sesión en el cliente", async () => {
  const source = await readFile(
    new URL("../../public/js/api.js", import.meta.url),
    "utf8",
  );
  const harness = `const window = new EventTarget();
    const fetch = async () => new Response(JSON.stringify({error: 'Credenciales incorrectas'}), {status: 401});
    export { window as events };\n`;
  const { api, events } = await import(
    `data:text/javascript;base64,${Buffer.from(harness + source).toString("base64")}`
  );
  let expired = 0;
  events.addEventListener("auth:expired", () => expired++);
  await assert.rejects(
    api.auth("change-password", {
      currentPassword: "incorrecta",
      newPassword: "password-test",
    }),
    /Credenciales/,
  );
  assert.equal(expired, 0);
  await assert.rejects(api.getCurrentUser(), /Credenciales/);
  assert.equal(expired, 0);
  await assert.rejects(api.getBootstrap(), /Credenciales/);
  assert.equal(expired, 1);
});
