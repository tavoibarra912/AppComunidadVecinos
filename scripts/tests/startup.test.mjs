import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseListeningPids } from "../restart.mjs";

test("restart: selecciona solo listeners del puerto local exacto (IPv4 e IPv6)", () => {
  const output = `
  TCP    0.0.0.0:3000       0.0.0.0       LISTENING       101
  TCP    [::]:3000          [::]:0        LISTENING       101
  TCP    127.0.0.1:3000     0.0.0.0:0     LISTENING       102
  TCP    0.0.0.0:30001      *:*           LISTENING       201
  TCP    127.0.0.1:50000    127.0.0.1:3000 ESTABLISHED    202
  TCP    127.0.0.1:3000     127.0.0.1:1234 TIME_WAIT      0
  TCP    0.0.0.0:3000       *:*           LISTENING       ${process.pid}
  UDP    0.0.0.0:3000       *:*                           203
  `;
  assert.deepEqual(parseListeningPids(output, 3000), [101, 102]);
  assert.deepEqual(parseListeningPids(output, 30001), [201]);
});

test("refreshState: permite reintentar tras un fallo de red y comparte cargas simultáneas", async () => {
  const permissionsUrl = JSON.stringify(new URL("../../public/js/permissions.js", import.meta.url).href);
  const utilsUrl = JSON.stringify(new URL("../../public/js/utils.js", import.meta.url).href);
  const source = (await readFile(new URL("../../public/js/state.js", import.meta.url), "utf8"))
    .replace('"./permissions.js"', permissionsUrl)
    .replace('"./utils.js"', utilsUrl);
  // Importar el módulo real con una API controlada; sin DOM ni servidor.
  const stub = `const api = { getBootstrap: async () => {
    api.calls++;
    if (api.calls === 1) throw new Error('Servidor no disponible');
    return { communities: [{id: 'com-test'}], owners: [], properties: [],
      tenants: [], adminEmails: [], ownerNotifications: [] };
  }, calls: 0 }; export { api as testApi };`;
  const url = `data:text/javascript;base64,${Buffer.from(source.replace('import { api } from "./api.js";', stub)).toString("base64")}`;
  const { refreshState, state, onDataChanged, testApi } = await import(url);
  let notifications = 0;
  onDataChanged(() => notifications++);
  await assert.rejects(refreshState(), /Servidor no disponible/);
  await Promise.all([refreshState(), refreshState()]);
  assert.equal(testApi.calls, 2);
  assert.equal(notifications, 1);
  assert.equal(state.communities[0].id, "com-test");
});
