import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pen-five-profiles-"));
process.env.APP_DATA_DIR = dir;
process.env.APP_UPLOADS_DIR = path.join(dir, "uploads");
process.env.NODE_ENV = "test";
const { db, listCommunities, listOwners, listProperties, listTenants } =
  await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
const users = db.prepare("SELECT id,usuario,rol FROM users").all();
const dual = users.find((u) => u.usuario === "urucpci1");
const owned = listOwners().find((o) => o.userId === dual.id);
const ownedIds = listProperties().filter((p) => p.ownerIds.includes(owned.id));
const rented = listProperties().find(
  (p) => p.ownerIds.length && !ownedIds.some((o) => o.communityId === p.communityId),
);
// Dos perfiles de la misma cuenta en comunidades distintas; una tercera queda fuera.
db.prepare(
  "INSERT INTO tenants(id,ownerId,propertyId,name,surname,contractStart,contractEnd,userId) VALUES(?,?,?,?,?,'2020-01-01','2099-12-31',?)",
).run(
  "five-dual-tenant",
  rented.ownerIds[0],
  rented.id,
  "Doble perfil",
  "Contrato propio",
  dual.id,
);
db.prepare(
  "INSERT INTO tenants(id,ownerId,propertyId,name,surname,contractStart,contractEnd) VALUES(?,?,?,?,?,'2020-01-01','2099-12-31')",
).run("five-peer-tenant", rented.ownerIds[0], rented.id, "PRIVADO", "Otro inquilino");
const all = {
  communities: listCommunities(),
  owners: listOwners(),
  properties: listProperties(),
  tenants: listTenants(),
};
fs.writeFileSync(
  path.join(process.env.APP_UPLOADS_DIR, "five.pdf"),
  "%PDF-1.4\nArchivo sintético de revisión\n%%EOF",
);
for (const [type, collection] of [
  ["community", "communities"],
  ["property", "properties"],
  ["tenant", "tenants"],
])
  for (const row of all[collection])
    db.prepare(
      "INSERT INTO documents(id,entityType,entityId,fileName,fileType,storedName) VALUES(?,?,?,?,'application/pdf','five.pdf')",
    ).run("five-doc-" + row.id, type, row.id, "PRIVADO " + row.id + ".pdf");
const receiptIds = [];
for (const p of all.properties.filter((p) => p.ownerIds.length)) {
  const owners = p.ownerIds
    .map((id) => all.owners.find((o) => o.id === id))
    .map((o) => ({
      id: o.id,
      name: o.name + " " + o.surname,
      dni: o.dni,
      userId: o.userId,
      percentage: 100 / p.ownerIds.length,
    }));
  const snapshot = {
    property: p.plot,
    community: p.communityName,
    communityIban: "",
    owners,
    months: 1,
    agreement: "Revisión sintética por perfiles",
  };
  const id = "five-receipt-" + p.id;
  receiptIds.push({ id, propertyId: p.id, communityId: p.communityId, ownerIds: p.ownerIds });
  db.prepare(
    "INSERT INTO fee_receipts(id,communityId,propertyId,planId,period,periodEnd,dueDate,amount,snapshot,createdAt,actorId) VALUES(?,?,?,'five-plan','2026-11','2026-11-30','2026-11-30',10000,?,'2026-11-01','user-super-admin')",
  ).run(id, p.communityId, p.id, JSON.stringify(snapshot));
}
const child = spawn(process.execPath, ["server.js"], {
  cwd: path.resolve(import.meta.dirname, "../.."),
  env: { ...process.env, PORT: "3199", HOST: "127.0.0.1", TRUST_PROXY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", () => {});
child.stderr.on("data", (d) => process.stderr.write(d));
const base = "http://127.0.0.1:3199/api";
let ready = false;
for (let i = 0; i < 150; i++) {
  if (child.exitCode !== null) throw Error("Servidor detenido");
  try {
    if ((await fetch(base + "/health")).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 40));
}
if (!ready) throw Error("No arrancó");
function client() {
  let cookie = "";
  return async (route, method = "GET", body) => {
    const res = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.headers.get("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}
const setup = client();
await setup("/auth/signin", "POST", { usuario: "super_admin", password: "super_admin" });
const posts = [];
for (const c of all.communities) {
  const response = await setup("/communications/posts", "POST", {
    communityId: c.id,
    type: "notice",
    title: "AVISO " + c.name,
    body: "Contenido sintético exclusivo de " + c.id,
    priority: "normal",
    status: "published",
    publishAt: new Date(Date.now() - 1000).toISOString(),
    startsAt: "",
    endsAt: "",
    archiveAt: "",
    audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
    channels: [],
    commentsEnabled: true,
    receiptRequired: false,
    reminderMinutes: 0,
    pinned: false,
    poll: null,
    meeting: null,
  });
  if (response.status !== 201) throw Error(JSON.stringify(response));
  posts.push({ id: response.data.id, communityId: c.id });
}
const report = {
  at: new Date().toISOString(),
  dataDir: dir,
  url: base.replace("/api", ""),
  fixture: {
    dualUser: dual.usuario,
    ownedProperties: ownedIds.map((p) => ({ id: p.id, communityId: p.communityId })),
    rentedProperty: { id: rented.id, communityId: rented.communityId },
    peerTenant: "five-peer-tenant",
    receipts: receiptIds.length,
    posts: posts.length,
  },
  profiles: [],
};
for (const username of ["uruci1", "urucp1", "urucpci1", "ca1", "admin"]) {
  const user = users.find((u) => u.usuario === username),
    request = client();
  const checks = [];
  const check = (label, pass, evidence = {}) => checks.push({ label, pass, ...evidence });
  const login = await request("/auth/signin", "POST", { usuario: username, password: username });
  check("Inicio de sesión", login.status === 200, { status: login.status });
  const ownerIds = all.owners.filter((o) => o.userId === user.id).map((o) => o.id);
  const ownTenants = all.tenants.filter((t) => t.userId === user.id);
  const ownPropertyIds = all.properties
    .filter((p) => p.ownerIds.some((id) => ownerIds.includes(id)))
    .map((p) => p.id);
  const personalProperties = new Set([...ownPropertyIds, ...ownTenants.map((t) => t.propertyId)]);
  const communities = all.communities
    .filter(
      (c) =>
        username === "admin" ||
        (username === "ca1"
          ? c.adminUserId === user.id
          : all.properties.some((p) => p.communityId === c.id && personalProperties.has(p.id))),
    )
    .map((c) => c.id);
  const managed =
    username === "admin" ? all.communities.map((c) => c.id) : username === "ca1" ? communities : [];
  const expected = {
    communities,
    properties: all.properties
      .filter(
        (p) =>
          username === "admin" ||
          (username === "ca1" ? communities.includes(p.communityId) : personalProperties.has(p.id)),
      )
      .map((p) => p.id),
    owners: all.owners
      .filter(
        (o) =>
          username === "admin" ||
          (username === "ca1"
            ? all.properties.some(
                (p) => communities.includes(p.communityId) && p.ownerIds.includes(o.id),
              )
            : ownerIds.includes(o.id) || ownTenants.some((t) => t.ownerId === o.id)),
      )
      .map((o) => o.id),
    tenants: all.tenants
      .filter(
        (t) =>
          username === "admin" ||
          (username === "ca1"
            ? all.properties.some(
                (p) => p.id === t.propertyId && communities.includes(p.communityId),
              )
            : ownerIds.includes(t.ownerId) || t.userId === user.id),
      )
      .map((t) => t.id),
  };
  const boot = await request("/bootstrap");
  check("Bootstrap responde", boot.status === 200, { status: boot.status });
  for (const collection of Object.keys(all)) {
    const ids = boot.data[collection].map((x) => x.id).sort();
    check(
      "Bootstrap " + collection,
      JSON.stringify(ids) === JSON.stringify([...expected[collection]].sort()),
      { actual: ids, expected: expected[collection] },
    );
    const list = await request("/" + collection);
    check(
      "Listado " + collection,
      list.status === 200 &&
        JSON.stringify(list.data.map((x) => x.id).sort()) ===
          JSON.stringify([...expected[collection]].sort()),
      { status: list.status },
    );
    for (const row of all[collection]) {
      const response = await request("/" + collection + "/" + row.id);
      check(
        "GET " + collection + "/" + row.id,
        response.status === (expected[collection].includes(row.id) ? 200 : 403),
        { status: response.status },
      );
      if (!expected[collection].includes(row.id)) {
        const denied = await request("/" + collection + "/" + row.id, "PUT", {
          ...row,
          version: row.version,
        });
        check("PUT ajeno " + collection + "/" + row.id, denied.status === 403, {
          status: denied.status,
        });
      }
    }
  }
  const fullOwners =
    username === "admin" ? expected.owners : username === "ca1" ? expected.owners : ownerIds;
  for (const o of boot.data.owners.filter((o) => !fullOwners.includes(o.id)))
    check(
      "Propietario de contrato solo como referencia " + o.id,
      !("dni" in o) && !("email" in o) && !("phone" in o) && !("iban" in o),
      { keys: Object.keys(o) },
    );
  for (const route of [
    "/admin/users",
    "/admin/roles",
    "/admin/settings",
    "/audit",
    "/communications/providers",
  ]) {
    const response = await request(route);
    check("Administración restringida " + route, response.status === 403, {
      status: response.status,
    });
  }
  for (const [type, collection] of [
    ["community", "communities"],
    ["property", "properties"],
    ["tenant", "tenants"],
  ])
    for (const row of all[collection]) {
      const response = await request("/documents/five-doc-" + row.id + "/download");
      const yes = expected[collection].includes(row.id);
      check(
        "Documento " + type + "/" + row.id,
        yes ? response.status === 200 : [403, 404].includes(response.status),
        { status: response.status },
      );
    }
  for (const receipt of receiptIds) {
    const yes =
      managed.includes(receipt.communityId) || receipt.ownerIds.some((id) => ownerIds.includes(id));
    const response = await request("/fees/receipts/" + receipt.id);
    check("Recibo " + receipt.id, response.status === (yes ? 200 : 403), {
      status: response.status,
    });
  }
  const mine = await request("/fees/mine");
  check(
    "Cuotas personales",
    ownerIds.length || managed.length ? mine.status === 200 : mine.status === 403,
    { status: mine.status },
  );
  if (mine.status === 200)
    check(
      "Cuotas personales solo de titular",
      mine.data.receipts.every((r) => r.snapshot.owners.some((o) => ownerIds.includes(o.id))),
      { ids: mine.data.receipts.map((r) => r.id) },
    );
  const listed = await request("/communications/posts");
  check(
    "Tablón solo comunidades permitidas",
    listed.status === 200 && listed.data.every((p) => communities.includes(p.communityId)),
    { ids: listed.data.map((p) => p.id) },
  );
  for (const p of posts) {
    const response = await request("/communications/posts/" + p.id);
    check(
      "Publicación " + p.communityId,
      response.status === (communities.includes(p.communityId) ? 200 : 404),
      { status: response.status },
    );
  }
  const permissions = db.prepare("SELECT permisos FROM roles WHERE nombre=?").get(user.rol);
  report.profiles.push({
    username,
    role: user.rol,
    permissions: JSON.parse(permissions.permisos),
    expected,
    records: {
      communities: expected.communities.map((id) => all.communities.find((c) => c.id === id).name),
      properties: expected.properties.map((id) => all.properties.find((p) => p.id === id).plot),
      owners: expected.owners.map((id) => {
        const o = all.owners.find((o) => o.id === id);
        return o.name + " " + o.surname;
      }),
      tenants: expected.tenants.map((id) => {
        const t = all.tenants.find((t) => t.id === id);
        return t.name + " " + t.surname;
      }),
    },
    checks,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  });
}
fs.writeFileSync(
  path.join(import.meta.dirname, "cinco-perfiles.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      fixture: report.fixture,
      profiles: report.profiles.map((p) => ({
        username: p.username,
        records: p.records,
        passed: p.passed,
        failed: p.failed,
        failures: p.checks.filter((c) => !c.pass),
      })),
    },
    null,
    2,
  ),
);
console.log("UI_READY " + report.url);
process.on("SIGINT", () => {
  child.kill();
  db.close();
  process.exit(0);
});
