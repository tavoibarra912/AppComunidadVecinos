import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const directory = mkdtempSync(path.join(tmpdir(), "penarrubia-issues-test-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
process.env.GITHUB_ISSUES_TOKEN = "token-de-prueba";
process.env.GITHUB_ISSUES_REPO = "owner/repo";
process.env.GITHUB_ISSUES_LABEL = "User-Detected-Issue";
process.env.GITHUB_ISSUES_ATTACHMENTS_BRANCH = "issue-attachments";

const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const { default: router } = await import("../../src/routes/index.js");

let server, mock, base, mockBase;
const requests = [];
const state = { labelExists: false, branchExists: false, failIssues: false };
let owner, tenant, admin, anonymous;

const PNG = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137,
]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

function client() {
  let cookie = "";
  return async (route, method = "GET", body) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      data: type.includes("application/json") ? await response.json() : await response.text(),
      headers: response.headers,
    };
  };
}

function reportForm(overrides = {}) {
  const form = new FormData();
  const values = {
    title: "El botón de guardar no responde",
    description:
      "Al pulsar guardar en la ficha del inmueble no ocurre nada y no aparece ningún aviso.",
    steps: "1. Abrir un inmueble\n2. Cambiar el coeficiente\n3. Pulsar Guardar",
    screen: "/#inmuebles",
    userAgent: "Mozilla/5.0 (pruebas)",
    language: "es-ES",
    viewport: "1440x900",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  return form;
}

function validForm(overrides = {}) {
  const form = reportForm(overrides);
  form.append("files", new Blob([PNG], { type: "image/png" }), "captura.png");
  form.append("files", new Blob([PDF], { type: "application/pdf" }), "consola.pdf");
  return form;
}

before(async () => {
  const app = express();
  app.use(express.json({ limit: "60mb" }));
  app.use("/api", router);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;

  const mockApp = express();
  mockApp.use(express.json({ limit: "60mb" }));
  mockApp.use((req, _res, next) => {
    requests.push({ method: req.method, url: req.url, body: req.body, headers: req.headers });
    next();
  });
  mockApp.get("/repos/:owner/:repo/labels/:label", (req, res) => {
    if (!state.labelExists) return res.status(404).json({ message: "Not Found" });
    return res.json({ name: req.params.label });
  });
  mockApp.post("/repos/:owner/:repo/labels", (req, res) => {
    state.labelExists = true;
    return res.status(201).json(req.body);
  });
  mockApp.get("/repos/:owner/:repo/git/ref/heads/:branch", (req, res) => {
    if (req.params.branch === "main") return res.json({ object: { sha: "sha-base" } });
    if (state.branchExists) return res.json({ object: { sha: "sha-adjuntos" } });
    return res.status(404).json({ message: "Not Found" });
  });
  mockApp.post("/repos/:owner/:repo/git/refs", (_req, res) => {
    state.branchExists = true;
    return res.status(201).json({ ref: "refs/heads/issue-attachments" });
  });
  mockApp.get("/repos/:owner/:repo", (_req, res) =>
    res.json({ default_branch: "main", full_name: "owner/repo" }),
  );
  mockApp.put("/repos/:owner/:repo/contents/*", (req, res) =>
    res.status(201).json({ content: { sha: `sha-${req.params[0]}` } }),
  );
  mockApp.delete("/repos/:owner/:repo/contents/*", (_req, res) => res.status(200).json({}));
  mockApp.post("/repos/:owner/:repo/issues", (req, res) => {
    if (state.failIssues) return res.status(500).json({ message: "fallo simulado" });
    return res.status(201).json({
      number: 321,
      html_url: "https://github.com/owner/repo/issues/321",
    });
  });
  mock = mockApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => mock.once("listening", resolve));
  mockBase = `http://127.0.0.1:${mock.address().port}`;
  process.env.GITHUB_ISSUES_API_URL = mockBase;
  process.env.GITHUB_ISSUES_RAW_URL = "https://raw.example.test";

  owner = client();
  tenant = client();
  admin = client();
  anonymous = client();
  for (const [request, usuario] of [
    [owner, "urucp1"],
    [tenant, "uruci1"],
    [admin, "super_admin"],
  ]) {
    const login = await request("/auth/signin", "POST", { usuario, password: usuario });
    assert.equal(login.status, 200, JSON.stringify(login.data));
  }
});

after(async () => {
  for (const instance of [server, mock]) {
    instance?.closeAllConnections();
    if (instance) await new Promise((resolve) => instance.close(resolve));
  }
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("penarrubia-issues-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("reportes: sin sesión no se puede consultar ni crear", async () => {
  assert.equal((await anonymous("/issues")).status, 401);
  const form = reportForm();
  assert.equal((await anonymous("/issues", "POST", form)).status, 401);
});

test("reportes: la configuración no expone el token y valida el formulario", async () => {
  const config = await owner("/issues");
  assert.equal(config.status, 200);
  assert.deepEqual(config.data, {
    enabled: true,
    repository: "owner/repo",
    label: "User-Detected-Issue",
    attachments: {
      maxFiles: 20,
      maxBytes: 15 * 1024 * 1024,
      maxTotalBytes: 50 * 1024 * 1024,
      allowed: ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"],
      labels: "PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX",
    },
  });
  assert.doesNotMatch(JSON.stringify(config.data), /token-de-prueba/);

  const missingTitle = await owner("/issues", "POST", reportForm({ title: "   " }));
  assert.equal(missingTitle.status, 400);
  assert.match(missingTitle.data.error, /El título es obligatorio/);

  const shortTitle = await owner("/issues", "POST", reportForm({ title: "Fall" }));
  assert.equal(shortTitle.status, 400);
  assert.match(shortTitle.data.error, /al menos 5/);

  const missingDescription = await owner("/issues", "POST", reportForm({ description: "" }));
  assert.equal(missingDescription.status, 400);
  assert.match(missingDescription.data.error, /La descripción es obligatoria/);

  const shortDescription = await owner(
    "/issues",
    "POST",
    reportForm({ description: "No funciona" }),
  );
  assert.equal(shortDescription.status, 400);
  assert.match(shortDescription.data.error, /al menos 20/);

  const emptyHtml = await owner(
    "/issues",
    "POST",
    reportForm({ description: `<p><strong>${"&nbsp;".repeat(30)}</strong><br></p>` }),
  );
  assert.equal(emptyHtml.status, 400);
  assert.match(emptyHtml.data.error, /La descripción es obligatoria/);

  const emptyNumericHtml = await owner(
    "/issues",
    "POST",
    reportForm({ description: `<p>${"&#160;&#x20;&ensp;".repeat(20)}</p>` }),
  );
  assert.equal(emptyNumericHtml.status, 400);
  assert.match(emptyNumericHtml.data.error, /La descripción es obligatoria/);
});

test("reportes: rechaza adjuntos con contenido falso y formatos no permitidos", async () => {
  const fake = reportForm();
  fake.append(
    "files",
    new Blob([Buffer.from("no soy una imagen")], { type: "image/png" }),
    "falso.png",
  );
  const badContent = await owner("/issues", "POST", fake);
  assert.equal(badContent.status, 400);
  assert.match(badContent.data.error, /no corresponde a un png válido/i);

  const badExtension = reportForm();
  badExtension.append("files", new Blob([PNG], { type: "image/png" }), "captura.exe");
  const badName = await owner("/issues", "POST", badExtension);
  assert.equal(badName.status, 400);
  assert.match(badName.data.error, /Formato no permitido/);
});

test("reportes: los adjuntos respetan la configuración general", async () => {
  const saved = db.prepare("SELECT data FROM settings WHERE id = 'general'").get();
  const previous = saved ? JSON.parse(saved.data) : {};
  db.prepare(
    "INSERT INTO settings (id, data) VALUES ('general', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
  ).run(
    JSON.stringify({
      ...previous,
      documentosMaxSizeMb: 1,
      documentosMaxArchivos: 2,
      documentosTiposPermitidos: ["png"],
    }),
  );
  try {
    const config = await tenant("/issues");
    assert.equal(config.status, 200);
    assert.deepEqual(config.data.attachments, {
      maxFiles: 2,
      maxBytes: 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024,
      allowed: ["png"],
      labels: "PNG",
    });

    const pdf = reportForm();
    pdf.append("files", new Blob([PDF], { type: "application/pdf" }), "consola.pdf");
    const badType = await tenant("/issues", "POST", pdf);
    assert.equal(badType.status, 400);
    assert.match(badType.data.error, /Formato no permitido/);

    const tooBig = reportForm();
    tooBig.append(
      "files",
      new Blob([Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])], { type: "image/png" }),
      "grande.png",
    );
    const oversized = await tenant("/issues", "POST", tooBig);
    assert.equal(oversized.status, 400);
    assert.match(oversized.data.error, /1 MB/);

    const tooMany = reportForm();
    for (let index = 0; index < 3; index += 1) {
      tooMany.append("files", new Blob([PNG], { type: "image/png" }), `captura-${index}.png`);
    }
    const count = await tenant("/issues", "POST", tooMany);
    assert.equal(count.status, 400);
    assert.match(count.data.error, /máximo 2 archivos/);
  } finally {
    if (saved) {
      db.prepare("UPDATE settings SET data = ? WHERE id = 'general'").run(saved.data);
    } else {
      db.prepare("DELETE FROM settings WHERE id = 'general'").run();
    }
  }
});

test("reportes: crea etiqueta, rama de adjuntos e issue con contexto y enlaces", async () => {
  const request = validForm({
    description:
      "<p>Al pulsar <strong>guardar</strong> no ocurre nada y no aparece ningún aviso.</p><script>alert(1)</script>",
    steps:
      "<ol><li>Abrir un inmueble</li><li>Cambiar el coeficiente</li><li>Pulsar Guardar</li></ol>",
  });
  const response = await owner("/issues", "POST", request);
  assert.equal(response.status, 201, JSON.stringify(response.data));
  assert.deepEqual(response.data, {
    number: 321,
    url: "https://github.com/owner/repo/issues/321",
    attachments: 2,
  });

  const label = requests.find((item) => item.method === "POST" && item.url.endsWith("/labels"));
  assert.deepEqual(label.body.name, "User-Detected-Issue");
  const branch = requests.find((item) => item.method === "POST" && item.url.endsWith("/git/refs"));
  assert.equal(branch.body.ref, "refs/heads/issue-attachments");
  assert.equal(branch.body.sha, "sha-base");

  const uploads = requests.filter(
    (item) => item.method === "PUT" && item.url.includes("/contents/reportes/"),
  );
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].body.branch, "issue-attachments");
  assert.equal(
    Buffer.from(uploads[0].body.content, "base64").subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
  assert.match(uploads[0].url, /\.png$/);
  assert.match(uploads[1].url, /\.pdf$/);

  const issue = requests.find((item) => item.method === "POST" && item.url.endsWith("/issues"));
  assert.deepEqual(issue.body.labels, ["User-Detected-Issue"]);
  assert.equal(issue.body.title, "El botón de guardar no responde");
  assert.match(issue.body.body, /### Descripción/);
  assert.match(issue.body.body, /<strong>guardar<\/strong>/);
  assert.doesNotMatch(issue.body.body, /<script>/);
  assert.match(issue.body.body, /<ol><li>Abrir un inmueble<\/li>/);
  assert.doesNotMatch(issue.body.body, /Comunidad o unidad afectada|Comunidad Los Olmos/);
  assert.match(issue.body.body, /`urucp1`/);
  assert.match(issue.body.body, /`\/#inmuebles`/);
  assert.match(issue.body.body, /\*\*Versión de la aplicación:\*\* `1\.0\.0`/);
  assert.match(
    issue.body.body,
    /!\[captura\.png\]\(https:\/\/raw\.example\.test\/owner\/repo\/issue-attachments\/reportes\//,
  );
  assert.match(
    issue.body.body,
    /- \[consola\.pdf\]\(https:\/\/raw\.example\.test\/owner\/repo\/issue-attachments\/reportes\//,
  );
});

test("reportes: admite descripciones largas con formato y conserva entidades", async () => {
  const description = `<p><strong>${"á".repeat(4900)} &amp; &lt;prueba&gt;</strong></p>`;
  const response = await tenant("/issues", "POST", reportForm({ description, steps: "" }));
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const issue = requests.findLast((item) => item.method === "POST" && item.url.endsWith("/issues"));
  assert.match(issue.body.body, /á{4900} &amp; &lt;prueba&gt;/);
  assert.doesNotMatch(issue.body.body, /&amp;amp;/);
  assert.match(issue.body.body, /_No indicados\._/);

  const tooLong = await tenant(
    "/issues",
    "POST",
    reportForm({ description: `<p>${"á".repeat(5001)}</p>` }),
  );
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.data.error, /5000 caracteres/);
});

test("reportes: la rama y la etiqueta se reutilizan en envíos posteriores", async () => {
  const beforeLabel = requests.filter(
    (item) => item.method === "POST" && item.url.endsWith("/labels"),
  ).length;
  const beforeBranch = requests.filter(
    (item) => item.method === "POST" && item.url.endsWith("/git/refs"),
  ).length;
  const response = await tenant("/issues", "POST", reportForm());
  assert.equal(response.status, 201);
  assert.equal(
    requests.filter((item) => item.method === "POST" && item.url.endsWith("/labels")).length,
    beforeLabel,
  );
  assert.equal(
    requests.filter((item) => item.method === "POST" && item.url.endsWith("/git/refs")).length,
    beforeBranch,
  );
});

test("reportes: si GitHub falla no se muestra éxito y se retiran los adjuntos", async () => {
  state.failIssues = true;
  const beforeDeletes = requests.filter((item) => item.method === "DELETE").length;
  const response = await owner("/issues", "POST", validForm());
  state.failIssues = false;
  assert.equal(response.status, 502);
  assert.match(response.data.error, /No se pudo crear el issue/);
  assert.ok(requests.filter((item) => item.method === "DELETE").length > beforeDeletes);
});

test("reportes: sin token configurado responde 503 y no llama a GitHub", async () => {
  const previous = process.env.GITHUB_ISSUES_TOKEN;
  delete process.env.GITHUB_ISSUES_TOKEN;
  try {
    const count = requests.length;
    const response = await owner("/issues", "POST", reportForm());
    assert.equal(response.status, 503);
    assert.equal(response.data.code, "not_configured");
    assert.equal(requests.length, count);
  } finally {
    process.env.GITHUB_ISSUES_TOKEN = previous;
  }
});

test("reportes: limita los envíos repetidos por usuario", async () => {
  let last;
  for (let index = 0; index < 5; index += 1) {
    last = await admin("/issues", "POST", reportForm());
    assert.equal(last.status, 201);
  }
  const blocked = await admin("/issues", "POST", reportForm());
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /varios reportes/);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});
