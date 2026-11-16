import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { JSDOM } from "jsdom";
const root = path.resolve(import.meta.dirname, "../..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pen-flows-review-"));
process.env.APP_DATA_DIR = directory;
process.env.APP_UPLOADS_DIR = path.join(directory, "uploads");
process.env.NODE_ENV = "test";
const { db } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
// Contrato de otro residente en el mismo inmueble: prueba de aislamiento personal.
db.prepare(
  "INSERT INTO tenants(id,ownerId,propertyId,name,surname,contractStart) VALUES('review-peer','own-seed-1','prop-seed-1','Otro','Residente','2020-01-01')",
).run();
fs.writeFileSync(
  path.join(process.env.APP_UPLOADS_DIR, "review.pdf"),
  "%PDF-1.4\nDocumento privado de prueba\n%%EOF",
);
for (const [type, table] of [
  ["community", "communities"],
  ["property", "properties"],
  ["tenant", "tenants"],
])
  for (const row of db.prepare(`SELECT id FROM ${table}`).all())
    db.prepare(
      "INSERT INTO documents(id,entityType,entityId,fileName,fileType,storedName) VALUES(?,?,?,'privado.pdf','application/pdf','review.pdf')",
    ).run("review-doc-" + row.id, type, row.id);
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: "3198", HOST: "127.0.0.1", TRUST_PROXY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", () => {});
child.stderr.on("data", (d) => process.stderr.write(d));
const base = "http://127.0.0.1:3198/api";
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(base + "/health")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 50));
}
const results = [];
function check(group, label, pass, evidence) {
  results.push({ group, label, pass, ...evidence });
}
function client() {
  let cookie = "";
  return async (route, method = "GET", body) => {
    const r = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data };
  };
}
const clients = {};
for (const user of ["super_admin", "ca1", "urucp1", "uruci1"]) {
  clients[user] = client();
  const r = await clients[user]("/auth/signin", "POST", { usuario: user, password: user });
  check("sesión", user, r.status === 200, { status: r.status });
}
const all = Object.fromEntries(
  ["communities", "owners", "properties", "tenants"].map((t) => [
    t,
    db.prepare(`SELECT * FROM ${t}`).all(),
  ]),
);
for (const user of ["ca1", "urucp1", "uruci1"]) {
  const request = clients[user];
  const account = db.prepare("SELECT id FROM users WHERE usuario=?").get(user);
  const ownOwners = all.owners.filter((o) => o.userId === account.id).map((o) => o.id);
  const ownTenants = all.tenants.filter((t) => t.userId === account.id);
  const ownProperties = all.properties.filter((p) =>
    JSON.parse(p.ownerIds).some((id) => ownOwners.includes(id)),
  );
  const propertyIds = new Set([
    ...ownProperties.map((p) => p.id),
    ...ownTenants.map((t) => t.propertyId),
  ]);
  const communityIds = new Set(
    user === "ca1"
      ? all.communities.filter((c) => c.adminUserId === account.id).map((c) => c.id)
      : all.properties.filter((p) => propertyIds.has(p.id)).map((p) => p.communityId),
  );
  const expected = {
    communities: [...communityIds],
    properties: all.properties
      .filter((p) => (user === "ca1" ? communityIds.has(p.communityId) : propertyIds.has(p.id)))
      .map((p) => p.id),
    owners: all.owners
      .filter((o) =>
        user === "ca1"
          ? all.properties.some(
              (p) => communityIds.has(p.communityId) && JSON.parse(p.ownerIds).includes(o.id),
            )
          : ownOwners.includes(o.id) || ownTenants.some((t) => t.ownerId === o.id),
      )
      .map((o) => o.id),
    tenants: all.tenants
      .filter((t) =>
        user === "ca1"
          ? all.properties.some((p) => p.id === t.propertyId && communityIds.has(p.communityId))
          : ownOwners.includes(t.ownerId) || t.userId === account.id,
      )
      .map((t) => t.id),
  };
  const boot = await request("/bootstrap");
  for (const table of Object.keys(all)) {
    const ids = boot.data[table].map((x) => x.id).sort();
    check(
      "aislamiento",
      `${user} bootstrap ${table}`,
      JSON.stringify(ids) === JSON.stringify([...expected[table]].sort()),
      { actual: ids, expected: expected[table] },
    );
    const listed = await request("/" + table);
    check(
      "aislamiento",
      `${user} listado ${table}`,
      JSON.stringify(listed.data.map((x) => x.id).sort()) ===
        JSON.stringify([...expected[table]].sort()),
      {},
    );
    for (const row of all[table]) {
      const r = await request(`/${table}/${row.id}`);
      check(
        "aislamiento",
        `${user} GET ${table}/${row.id}`,
        expected[table].includes(row.id) ? r.status === 200 : r.status === 403,
        { status: r.status },
      );
      if (!expected[table].includes(row.id))
        for (const method of ["PUT", "DELETE"]) {
          const denied = await request(
            `/${table}/${row.id}`,
            method,
            method === "PUT" ? { ...row, version: row.version } : undefined,
          );
          check(
            "modificación ajena",
            `${user} ${method} ${table}/${row.id}`,
            denied.status === 403,
            { status: denied.status },
          );
        }
    }
  }
  for (const route of ["/admin/users", "/admin/roles", "/admin/settings", "/audit"]) {
    const r = await request(route);
    check("administración", `${user} ${route}`, r.status === 403, { status: r.status });
  }
  for (const [type, table] of [
    ["community", "communities"],
    ["property", "properties"],
    ["tenant", "tenants"],
  ])
    for (const row of all[table]) {
      const permitted = expected[table].includes(row.id); // Un inquilino no debe descargar la documentación personal de otro.
      for (const route of [
        `/documents?entityType=${type}&entityId=${row.id}`,
        `/documents/review-doc-${row.id}/download`,
        `/documents/review-doc-${row.id}/preview`,
      ]) {
        const r = await request(route);
        check(
          "documentos",
          `${user} ${route}`,
          permitted ? r.status === 200 : [403, 404].includes(r.status),
          { status: r.status, expected: permitted ? "200" : "403/404" },
        );
      }
    }
  const metadata = await request("/communications/metadata");
  check(
    "comunicaciones",
    `${user} comunidades disponibles`,
    metadata.status === 200 && metadata.data.communities.every((c) => communityIds.has(c.id)),
    { status: metadata.status },
  );
}
const { isValidCommunityNif } = await import("../../public/js/utils.js");
let nif;
for (let d = 0; d < 10; d++) if (isValidCommunityNif("H8765432" + d)) nif = "H8765432" + d;
const html = new JSDOM(fs.readFileSync(path.join(root, "public/index.html"), "utf8")).window
  .document;
function restore() {
  for (const table of ["communities", "owners", "properties", "tenants"])
    for (const saved of all[table]) {
      const keys = Object.keys(saved).filter((k) => k !== "id" && k !== "version");
      db.prepare(`UPDATE ${table} SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`).run(
        ...keys.map((k) => saved[k]),
        saved.id,
      );
    }
}
const forms = [
  ["communities", "community-form", "com-seed-1"],
  ["owners", "owner-form", "own-seed-1"],
  ["properties", "property-form", "prop-seed-1"],
  ["tenants", "tenant-form", "tenant-seed-1"],
];
for (const [table, form, id] of forms) {
  const original = (await clients.super_admin(`/${table}/${id}`)).data;
  for (const method of ["POST", "PUT"]) {
    const fields = [
      ...new Set(
        [...html.querySelector("#" + form).querySelectorAll("[required]")].map((e) => e.name),
      ),
    ].filter((f) => !["isMember", "receiptStatus", "documentType", "contractEnd"].includes(f));
    const payload = {
      ...original,
      name: "Prueba funcional",
      surname: "Revisión",
      dni: "00000000T",
      nif,
      phone: "612345678",
      email: "prueba@example.test",
      address: "Calle Prueba 1",
      city: "Madrid",
      province: "Madrid",
      postalCode: "28001",
      documentId: "00000000T",
      documentType: "DNI",
      contractStart: "2026-01-01",
      contractEnd: "2027-01-01",
      documents: table === "owners" || table === "tenants" ? {} : [],
      propertyIds: table === "owners" && method === "POST" ? [] : original.propertyIds,
      tenantIds: table === "properties" ? original.tenantIds : undefined,
    };
    // Control válido: evita confundir conflictos de DNI/NIF con validaciones.
    if (method === "POST") {
      payload.id = "review-new-" + table;
      if (table === "owners") payload.userId = "";
      if (table === "properties") payload.cadastralRef = "";
    }
    const control = await clients.super_admin(
      "/" + table + (method === "PUT" ? "/" + id : ""),
      method,
      { ...payload, version: (await clients.super_admin(`/${table}/${id}`)).data.version },
    );
    if (control.status !== (method === "POST" ? 201 : 200))
      throw new Error("CONTROL " + table + " " + method + " " + JSON.stringify(control));
    if (method === "POST") db.prepare(`DELETE FROM ${table} WHERE id=?`).run(payload.id);
    restore();
    for (const field of fields)
      for (const empty of ["", "   "]) {
        const current = (await clients.super_admin(`/${table}/${id}`)).data;
        const body = { ...payload, version: current.version, [field]: empty };
        const route = "/" + table + (method === "PUT" ? "/" + id : "");
        const r = await clients.super_admin(route, method, body);
        const stored = r.status < 300;
        check(
          "obligatorios",
          `${table} ${method} ${field}=${JSON.stringify(empty)}`,
          r.status === 400,
          { status: r.status, error: r.data?.error, field, empty, persisted: stored },
        );
        if (stored && method === "POST")
          db.prepare(`DELETE FROM ${table} WHERE id=?`).run(payload.id);
        if (stored) restore();
      }
  }
}
const report = {
  at: new Date().toISOString(),
  commit: "5fb822d",
  isolatedData: directory,
  checks: results.length,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results,
};
fs.writeFileSync(
  path.join(import.meta.dirname, "verificacion-flujos.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      checks: report.checks,
      passed: report.passed,
      failed: report.failed,
      failures: results.filter((r) => !r.pass),
    },
    null,
    2,
  ),
);
console.log("UI_READY http://127.0.0.1:3198 datos=" + directory);
process.on("SIGINT", () => {
  child.kill();
  db.close();
  process.exit(0);
});
