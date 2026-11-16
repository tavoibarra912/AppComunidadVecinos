import { test } from "node:test";
import assert from "node:assert/strict";
import { deployNetlify } from "../deploy-netlify.mjs";
import { verifyProduction } from "../verify-production.mjs";

const release = "a".repeat(40);
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const wait = async () => {};
const settings = {
  token: "test-token",
  site: "test-site",
  release,
  zip: Buffer.from("zip"),
  wait,
  attempts: 3,
};

test("deploy: pide producción y espera que Netlify publique esa versión", async () => {
  const calls = [];
  const replies = [
    { id: "d1", state: "uploaded" },
    { id: "d1", state: "ready", context: "production" },
    { published_deploy: { id: "d1" } },
  ];
  const result = await deployNetlify({
    ...settings,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(replies.shift());
    },
  });
  assert.equal(new URL(calls[0].url).searchParams.get("production"), "true");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, settings.zip);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(calls.length, 3);
  assert.equal(result.id, "d1");
});

test("deploy: créditos agotados o error de publicación hacen fallar el despliegue", async () => {
  await assert.rejects(
    deployNetlify({ ...settings, fetchImpl: async () => response("Credit usage exceeded", 403) }),
    /HTTP 403: Credit usage exceeded/,
  );
  await assert.rejects(
    deployNetlify({
      ...settings,
      fetchImpl: async () => response({ id: "d1", state: "error", error_message: "Build failed" }),
    }),
    /Build failed/,
  );
});

test("deploy: uploaded, preview y otra versión publicada nunca cuentan como éxito", async () => {
  for (const state of ["uploaded", "preview", "other-published"]) {
    await assert.rejects(
      deployNetlify({
        ...settings,
        fetchImpl: async (url) => {
          if (url.endsWith("/sites/test-site"))
            return response({ published_deploy: { id: state === "preview" ? "d1" : "d0" } });
          return response({
            id: "d1",
            state: state === "uploaded" ? "uploaded" : "ready",
            context: state === "preview" ? "deploy-preview" : "production",
          });
        },
      }),
      /no confirmó producción/,
    );
  }
});

test("verify: exige API, HTML y estáticos públicos del mismo commit", async () => {
  const replies = [
    response({ status: "ok", app: "app-comunidad-vecinos", release }),
    new Response('<script src="js/main.js?v=3"></script>'),
    response({ release }),
  ];
  await verifyProduction({
    url: "https://example.test",
    release,
    wait,
    fetchImpl: async () => replies.shift(),
  });
  assert.equal(replies.length, 0);
});

test("verify: rechaza protección por login y versiones descoordinadas", async () => {
  for (const scenario of ["401", "backend", "html", "static"]) {
    const replies = [
      response(
        {
          status: "ok",
          app: "app-comunidad-vecinos",
          release: scenario === "backend" ? "b".repeat(40) : release,
        },
        scenario === "401" ? 401 : 200,
      ),
      new Response(scenario === "html" ? "Login" : '<script src="js/main.js"></script>'),
      response({ release: "b".repeat(40) }),
    ];
    await assert.rejects(
      verifyProduction({
        url: "https://example.test",
        release,
        wait,
        attempts: 1,
        fetchImpl: async () => replies.shift(),
      }),
      /HTTP 401|commit esperado|HTML.*inaccesible/,
    );
  }
});
