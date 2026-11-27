// Prueba el servidor real en una copia temporal; no abre ni modifica producción.
import assert from "node:assert/strict";
import { DatabaseSync, backup } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { brandOf, brandStyle } from "../src/branding.js";
import { VISUAL_KEYS } from "./prepare-production-candidate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const candidate = path.resolve(process.argv[2] || "");
assert.equal(path.dirname(candidate), path.join(root, ".deploy-private"));
assert.ok(path.basename(candidate).startsWith("candidate-"));
const manifest = JSON.parse(await fs.readFile(path.join(candidate, "manifest.json"), "utf8"));
const credentials = JSON.parse(
  await fs.readFile(path.join(candidate, "accesos-produccion.json"), "utf8"),
);
const visuals = JSON.parse(
  await fs.readFile(path.join(root, ".deploy-private/production-visuals.json"), "utf8"),
);
const digest = async (file) =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
const candidateFile = path.join(candidate, "data/penarrubia.db");
const before = await digest(candidateFile);
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "comunidad-candidate-check-"));
let child;
const checks = [];
try {
  await fs.mkdir(path.join(scratch, "data"));
  const source = new DatabaseSync(
    path.join(process.env.CANDIDATE_SOURCE_DIR || manifest.source, "data/penarrubia.db"),
    {
      readOnly: true,
    },
  );
  const copy = new DatabaseSync(candidateFile, { readOnly: true });
  let ownerUser, ownerId, otherOwnerId, documentId, importedName;
  try {
    assert.equal(copy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(copy.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(
      copy.prepare("SELECT COUNT(*) AS n FROM properties WHERE propertyType <> 'parcela'").get().n,
      0,
    );
    for (const table of [
      "communities",
      "owners",
      "properties",
      "documents",
      "tenants",
      "fee_receipts",
      "fee_payments",
    ]) {
      assert.deepEqual(
        copy.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        source.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        `Datos alterados: ${table}`,
      );
    }
    const users = copy.prepare("SELECT * FROM users ORDER BY id").all();
    const oldUsers = source.prepare("SELECT * FROM users ORDER BY id").all();
    assert.equal(users.length, 126);
    for (const [index, user] of users.entries()) {
      assert.equal(user.passwordHash, oldUsers[index].passwordHash);
      for (const key of Object.keys(user).filter(
        (key) => !["passwordHash", "resetToken", "resetTokenExpira"].includes(key),
      ))
        assert.deepEqual(user[key], oldUsers[index][key], `Cuenta alterada: ${key}`);
    }
    const settings = JSON.parse(
      copy.prepare("SELECT data FROM settings WHERE id='general'").get().data,
    );
    const oldSettings = JSON.parse(
      source.prepare("SELECT data FROM settings WHERE id='general'").get().data,
    );
    assert.equal(settings.marca.nombre, oldSettings.marca.nombre);
    for (const key of Object.keys(oldSettings).filter((key) => key !== "marca"))
      assert.deepEqual(settings[key], oldSettings[key], `Ajuste ajeno a apariencia: ${key}`);
    for (const key of VISUAL_KEYS) assert.deepEqual(settings.marca[key], brandOf(visuals)[key]);
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    const owner = copy
      .prepare("SELECT userId,id FROM owners WHERE propertyIds <> '[]' LIMIT 1")
      .get();
    ownerId = owner.id;
    ownerUser = copy.prepare("SELECT usuario FROM users WHERE id=?").get(owner.userId).usuario;
    otherOwnerId = copy
      .prepare("SELECT id FROM owners WHERE id <> ? AND userId <> ? LIMIT 1")
      .get(owner.id, owner.userId).id;
    documentId = copy.prepare("SELECT id FROM documents LIMIT 1").get().id;
    importedName = settings.marca.nombre;
    await backup(copy, path.join(scratch, "data/penarrubia.db"));
    checks.push(
      "Integridad SQLite y relaciones",
      "Censo, cuentas y documentos conservados",
      "Solo apariencia de producción",
      "Contraseñas conservadas y ninguna sesión trasladada",
    );
  } finally {
    source.close();
    copy.close();
  }
  await fs.cp(path.join(candidate, "uploads"), path.join(scratch, "uploads"), { recursive: true });
  await fs.copyFile(
    path.join(candidate, "data/provider-key"),
    path.join(scratch, "data/provider-key"),
  );
  const portFinder = net.createServer();
  portFinder.listen(0, "127.0.0.1");
  await once(portFinder, "listening");
  const port = portFinder.address().port;
  await new Promise((resolve) => portFinder.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const start = async () => {
    child = spawn(process.execPath, [path.join(root, "server.js")], {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        APP_DATA_DIR: path.join(scratch, "data"),
        APP_UPLOADS_DIR: path.join(scratch, "uploads"),
        APP_DEMO_DATA: "false",
        APP_DEMO_PROFILES: "false",
        APP_PUBLIC_URL: "https://candidate.test",
        APP_ALLOWED_ORIGINS: "",
        APP_PROVIDER_KEY: "",
        GITHUB_ISSUES_TOKEN: "",
      },
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, "El servidor terminó al arrancar");
      try {
        if ((await fetch(`${base}/api/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("El servidor no arrancó");
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    child = undefined;
  };
  const login = async (usuario, password) => {
    const response = await fetch(`${base}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://candidate.test" },
      body: JSON.stringify({ usuario, password }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /Secure/);
    return response.headers.get("set-cookie").split(";")[0];
  };
  await start();
  assert.equal((await fetch(`${base}/api/bootstrap`)).status, 401);
  const html = await (await fetch(base)).text();
  const brand = JSON.parse(html.match(/id="brand-json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(brand.nombre, importedName);
  assert.ok(
    html.includes(brandStyle(brandOf({ marca: { ...visuals.marca, nombre: importedName } }))),
  );
  for (const asset of [
    "/styles.css",
    "/js/main.js",
    "/js/brand.js",
    "/favicon.svg",
    "/logo-default.svg",
    "/vendor/dompurify.mjs",
  ])
    assert.equal((await fetch(base + asset)).status, 200, asset);
  const admin = credentials.find((user) => user.usuario === "super_admin");
  let cookie = await login(admin.usuario, admin.password);
  const boot = await (await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.equal(boot.owners.length, 125);
  assert.equal(boot.properties.length, 131);
  assert.ok(boot.properties.every((property) => property.propertyType === "parcela"));
  assert.equal(boot.users.length, 126);
  const pdf = await fetch(`${base}/api/documents/${documentId}/download`, {
    headers: { Cookie: cookie },
  });
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  const neighbor = credentials.find((user) => user.usuario === ownerUser);
  cookie = await login(neighbor.usuario, neighbor.password);
  const own = await (await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })).json();
  assert.ok(own.owners.some((owner) => owner.id === ownerId));
  assert.ok(!own.owners.some((owner) => owner.id === otherOwnerId));
  assert.equal(
    (await fetch(`${base}/api/admin/users`, { headers: { Cookie: cookie } })).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/owners/${otherOwnerId}`, { headers: { Cookie: cookie } })).status,
    403,
  );
  checks.push(
    "Servidor en modo producción, HTML y recursos",
    "Login administrativo y censo completo",
    "Estatutos PDF descargables",
    "Vecino sin acceso a otros propietarios ni administración",
  );
  await stop();
  await start();
  cookie = await login(admin.usuario, admin.password);
  const afterRestart = await (
    await fetch(`${base}/api/bootstrap`, { headers: { Cookie: cookie } })
  ).json();
  assert.equal(afterRestart.owners.length, 125);
  assert.equal(afterRestart.properties.length, 131);
  await stop();
  assert.equal(await digest(candidateFile), before);
  checks.push(
    "Reinicio sin datos demo ni pérdida del censo",
    "La candidata entregable no fue modificada por las pruebas",
  );
  await fs.writeFile(
    path.join(candidate, "verification.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        status: "passed",
        runtime: {
          node: process.version,
          platform: process.platform,
          release: process.env.APP_RELEASE || "local",
        },
        checks,
        counts: manifest.counts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ status: "passed", checks, counts: manifest.counts }, null, 2));
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  assert.equal(path.dirname(scratch), path.resolve(os.tmpdir()));
  assert.ok(path.basename(scratch).startsWith("comunidad-candidate-check-"));
  await fs.rm(scratch, { recursive: true, force: true });
}
