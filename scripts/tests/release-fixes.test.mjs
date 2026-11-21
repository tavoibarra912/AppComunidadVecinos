import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(tmpdir(), "pen-release-fixes-"));
process.env.APP_DATA_DIR = path.join(directory, "data");
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
// Preparar solo el esquema: el censo tiene que crearlo server.js al arrancar.
const { db, getSettings } = await import("../../src/db.js");
const root = path.resolve(import.meta.dirname, "../..");
const children = new Set();
let server, base, admin;

async function start(extra = {}) {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let log = "";
  child.stdout.on("data", (data) => (log += data));
  child.stderr.on("data", (data) => (log += data));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try {
      if ((await fetch(url + "/api/health")).ok) return { child, url };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`El servidor no arrancó: ${log}`);
}
async function stop(child) {
  if (child.exitCode === null) {
    const end = once(child, "exit");
    child.kill();
    await end;
  }
  children.delete(child);
}
function client(url = base) {
  let cookie = "";
  return async (route, method = "GET", body) => {
    const res = await fetch(url + "/api" + route, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.headers.get("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
    return { status: res.status, data: await res.json() };
  };
}
function ok(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  return result.data;
}
const writeSettings = (data) =>
  db.prepare("UPDATE settings SET data=? WHERE id='general'").run(JSON.stringify(data));

before(async () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM communities").get().n, 0);
  const running = await start();
  server = running.child;
  base = running.url;
  admin = client();
  ok(await admin("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" }));
});
after(async () => {
  for (const child of children) await stop(child);
  db.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("pen-release-fixes-"));
  rmSync(directory, { recursive: true, force: true });
});

test("arranque real: crea el censo demo una vez y preserva cambios al reiniciar", async () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM communities").get().n, 7);
  const originalUsers = db.prepare("SELECT COUNT(*) n FROM users").get().n;
  db.prepare("UPDATE communities SET name=? WHERE id=?").run("Nombre conservado", "com-seed-1");
  await stop(server);
  const running = await start();
  server = running.child;
  base = running.url;
  admin = client();
  ok(await admin("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" }));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM communities").get().n, 7);
  assert.equal(
    db.prepare("SELECT name FROM communities WHERE id=?").get("com-seed-1").name,
    "Nombre conservado",
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, originalUsers);
});

test("arranque real en producción: no añade un censo de comunidades de ejemplo", async () => {
  const productionData = path.join(directory, "production-data");
  const running = await start({
    NODE_ENV: "production",
    APP_ADMIN_PASSWORD: "Clave-De-Prueba-Produccion-123",
    APP_DEMO_PROFILES: "false",
    APP_DATA_DIR: productionData,
    APP_UPLOADS_DIR: path.join(directory, "production-uploads"),
  });
  try {
    const production = new DatabaseSync(path.join(productionData, "penarrubia.db"));
    try {
      assert.equal(production.prepare("SELECT COUNT(*) n FROM communities").get().n, 0);
      assert.equal(production.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
    } finally {
      production.close();
    }
  } finally {
    await stop(running.child);
  }
});

test("estáticos reales: caché coherente, Vary y negociación de gzip/brotli y q=0", async () => {
  const url = base + "/js/municipios-ine.js";
  let original;
  for (const [header, encoding] of [
    ["identity", null],
    ["gzip", "gzip"],
    ["br", "br"],
    ["br;q=0,gzip;q=1", "gzip"],
    ["br;q=0,gzip;q=0", null],
  ]) {
    const response = await fetch(url, { headers: { "Accept-Encoding": header } });
    assert.equal(response.status, 200, header);
    assert.equal(response.headers.get("content-encoding"), encoding, header);
    assert.match(response.headers.get("vary"), /Accept-Encoding/i);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    const text = await response.text();
    if (original === undefined) original = text;
    else assert.equal(text, original, header);
  }
  const unsupported = await fetch(url, {
    headers: { "Accept-Encoding": "identity;q=0,br;q=0,gzip;q=0" },
  });
  assert.equal(unsupported.status, 406);
  const head = await fetch(url, { method: "HEAD", headers: { "Accept-Encoding": "gzip" } });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-encoding"), "gzip");
  assert.equal(await head.text(), "");
  const small = await fetch(base + "/js/main.js");
  assert.equal(small.headers.get("cache-control"), "no-cache");
});

test("IBAN: altas y ediciones rechazan datos inválidos, normalizan y permiten vacío", async () => {
  const owner = ok(await admin("/owners/own-seed-1"));
  const community = ok(await admin("/communities/com-seed-1"));
  for (const [route, original] of [
    ["/owners/own-seed-1", owner],
    ["/communities/com-seed-1", community],
  ]) {
    for (const iban of ["NO-ES-UN-IBAN", "ES0021000418450200051332", 123, null, {}]) {
      assert.equal((await admin(route, "PUT", { ...original, iban })).status, 400);
      assert.equal(ok(await admin(route)).iban, original.iban);
    }
    const normalized = ok(
      await admin(route, "PUT", { ...original, iban: "es91 2100 0418 4502 0005 1332" }),
    );
    assert.equal(normalized.iban, "ES9121000418450200051332");
    assert.equal(
      ok(await admin(route, "PUT", { ...original, version: normalized.version, iban: "   " })).iban,
      "",
    );
    ok(await admin(route, "PUT", { ...original, version: ok(await admin(route)).version }));
  }
  assert.equal(
    (
      await admin("/owners", "POST", {
        name: "Alta",
        surname: "Prueba",
        dni: "00000000T",
        email: "alta@example.test",
        iban: "invalido",
        phone: "612345678",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/communities", "POST", {
        name: "Alta",
        nif: "H00000000",
        iban: "invalido",
        address: "Calle de prueba 1",
        city: "Madrid",
      })
    ).status,
    400,
  );
});

test("auditoría real: registra 400 y 500 de rutas atendidas, con actor y sin datos del cuerpo", async () => {
  const community = ok(await admin("/communities/com-seed-1"));
  for (const [patch, expected] of [
    [{ iban: "secreto-sintetico" }, 400],
    [{ president: { detalle: "secreto-sintetico" } }, 500],
  ]) {
    const before = db.prepare("SELECT COALESCE(MAX(id),0) id FROM access_audit").get().id;
    assert.equal(
      (await admin("/communities/com-seed-1", "PUT", { ...community, ...patch })).status,
      expected,
    );
    const rows = db
      .prepare("SELECT * FROM access_audit WHERE id>? AND action='error.put'")
      .all(before);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorId, "user-super-admin");
    assert.equal(JSON.parse(rows[0].details).estado, expected);
    assert.equal(rows[0].route, "/communities/:id");
    assert.equal(JSON.stringify(rows).includes("secreto-sintetico"), false);
  }
});

test("permisos create: crea las cuatro entidades y sigue sin poder editarlas", async () => {
  const permisos = ["community", "owner", "property", "tenant"].flatMap((entity) => [
    `${entity}:read`,
    `${entity}:create`,
  ]);
  ok(await admin("/admin/roles", "POST", { nombre: "solo-altas", permisos }), 201);
  ok(
    await admin("/admin/users", "POST", {
      usuario: "solo_altas",
      email: "solo-altas@example.test",
      password: "Clave-Prueba-123",
      rol: "solo-altas",
    }),
    201,
  );
  const creator = client();
  ok(
    await creator("/auth/signin", "POST", { usuario: "solo_altas", password: "Clave-Prueba-123" }),
  );
  const community = ok(
    await creator("/communities", "POST", {
      name: "Comunidad de altas",
      nif: "H00000000",
      address: "Calle de prueba 1",
      city: "Madrid",
    }),
    201,
  );
  const owner = ok(
    await creator("/owners", "POST", {
      name: "Titular",
      surname: "Prueba",
      dni: "00000000T",
      email: "titular@example.test",
      phone: "612345678",
      address: "Calle de prueba 1",
      city: "Madrid",
    }),
    201,
  );
  const property = ok(
    await creator("/properties", "POST", {
      plot: "Piso de prueba",
      address: "Calle de prueba 1",
      city: "Madrid",
      propertyType: "vivienda",
      communityId: community.id,
      ownerIds: [owner.id],
      ownerPercentages: { [owner.id]: 100 },
      participationCoef: "100",
    }),
    201,
  );
  const tenant = ok(
    await creator("/tenants", "POST", {
      name: "Inquilino",
      surname: "Prueba",
      propertyId: property.id,
      ownerId: owner.id,
      phone: "600123456",
      email: "inquilino@example.test",
      documentId: "11111111H",
      contractStart: "2026-01-01",
    }),
    201,
  );
  for (const [collection, row] of [
    ["communities", community],
    ["owners", owner],
    ["properties", property],
    ["tenants", tenant],
  ])
    assert.equal((await creator(`/${collection}/${row.id}`, "PUT", row)).status, 403, collection);
});

test("cola: apagar email detiene los pendientes y solo el reintento explícito los envía", async () => {
  const { processCommunications } = await import("../../src/communication-worker.js");
  const settings = getSettings();
  const ownerClient = client();
  ok(await ownerClient("/auth/signin", "POST", { usuario: "urucp1", password: "urucp1" }));
  ok(
    await ownerClient("/communications/preferences", "PUT", {
      email: "cola@example.test",
      emailEnabled: true,
      phone: "",
      smsEnabled: false,
      whatsappEnabled: false,
    }),
  );
  try {
    writeSettings({ ...settings, notificacionesEmail: true });
    const post = ok(
      await admin("/communications/posts", "POST", {
        communityId: "com-seed-1",
        type: "notice",
        title: "Aviso de prueba",
        body: "Prueba de la cola",
        status: "published",
        publishAt: new Date(Date.now() - 1000).toISOString(),
        priority: "normal",
        channels: ["email"],
        audience: { mode: "all" },
      }),
      201,
    );
    assert.ok(
      db
        .prepare("SELECT COUNT(*) n FROM communication_outbox WHERE postId=? AND state='pending'")
        .get(post.id).n > 0,
    );
    writeSettings({ ...settings, notificacionesEmail: false });
    const sends = [];
    const send = async (...args) => {
      sends.push(args);
      return "proveedor-simulado";
    };
    await processCommunications(send);
    assert.equal(sends.length, 0);
    const queued = db.prepare("SELECT * FROM communication_outbox WHERE postId=?").all(post.id);
    assert.ok(queued.every((row) => row.state === "skipped"));
    assert.ok(queued.every((row) => row.error.includes("configuración general")));
    writeSettings({ ...settings, notificacionesEmail: true });
    await processCommunications(send);
    assert.equal(sends.length, 0);
    ok(await admin(`/communications/posts/${post.id}/retry`, "POST", {}));
    await processCommunications(send);
    assert.equal(sends.length, 1);
    assert.equal(sends[0][1], "cola@example.test");
    await processCommunications(send);
    assert.equal(sends.length, 1);
  } finally {
    writeSettings(settings);
  }
});

test("F10 · solo proxies configurados pueden determinar la IP de los límites", async () => {
  async function signin(url, forwarded) {
    return fetch(url + "/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarded },
      body: JSON.stringify({ usuario: "inexistente-proxy-f10", password: "incorrecta" }),
    });
  }
  // Sin trust proxy, rotar cabeceras no permite eludir el límite del cliente real.
  for (let i = 0; i < 15; i++) assert.equal((await signin(base, `192.0.2.${i + 1}`)).status, 401);
  assert.equal((await signin(base, "198.51.100.1")).status, 429);
  await stop(server);
  const running = await start({ TRUST_PROXY: "loopback" });
  server = running.child;
  base = running.url;
  for (let i = 0; i < 15; i++) assert.equal((await signin(base, "192.0.2.1")).status, 401);
  assert.equal((await signin(base, "192.0.2.1")).status, 429);
  assert.equal((await signin(base, "192.0.2.2")).status, 401);
  // Una cadena con saltos no confiables se resuelve desde el proxy hacia fuera.
  assert.equal((await signin(base, "198.51.100.42, 192.0.2.1")).status, 429);
});

test("F07 · una base existente migra versiones conservando las fichas", async () => {
  await stop(server);
  const before = db.prepare("SELECT id,name,nif FROM communities ORDER BY id").all();
  for (const table of ["communities", "owners", "properties", "tenants"]) {
    db.exec(`DROP TRIGGER ${table}_edit_version`);
    db.exec(`ALTER TABLE ${table} DROP COLUMN version`);
  }
  const running = await start();
  server = running.child;
  base = running.url;
  assert.deepEqual(db.prepare("SELECT id,name,nif FROM communities ORDER BY id").all(), before);
  const request = client();
  ok(await request("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" }));
  const boot = ok(await request("/bootstrap"));
  for (const collection of ["communities", "owners", "properties", "tenants"]) {
    assert.ok(boot[collection].length > 0);
    assert.ok(
      boot[collection].every((row) => Number.isSafeInteger(row.version) && row.version >= 1),
    );
  }
  const owner = boot.owners[0];
  db.prepare("UPDATE owners SET notificationPreference=? WHERE id=?").run("phone", owner.id);
  assert.ok(
    db.prepare("SELECT version FROM owners WHERE id=?").get(owner.id).version > owner.version,
  );
});
