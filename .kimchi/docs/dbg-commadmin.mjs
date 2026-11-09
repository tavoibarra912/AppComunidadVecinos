import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pen-repro-"));
process.env.APP_UPLOADS_DIR = process.env.APP_DATA_DIR + "/up";

const { db, ensureDemoProfiles, listCommunities, listOwners, listProperties, listTenants, listRoles } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
console.log("adminUserId tras seedIfEmpty:", JSON.stringify(db.prepare("SELECT adminUserId FROM communities WHERE id='com-seed-1'").get()));
ensureDemoProfiles();
console.log("adminUserId tras ensureDemoProfiles:", JSON.stringify(db.prepare("SELECT adminUserId FROM communities WHERE id='com-seed-1'").get()));
console.log("usuarios:", db.prepare("SELECT usuario, rol FROM users ORDER BY usuario").all().map(u => `${u.usuario}/${u.rol}`).join(", "));

const { default: router } = await import("../../src/routes/index.js");
const express = (await import("express")).default;
const app = express();
app.use(express.json({ limit: "60mb" }));
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;

const login = await fetch(base + "/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "comm_admin", password: "comm_admin" }) });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const bootRes = await fetch(base + "/bootstrap", { headers: { Cookie: cookie } });
console.log("signin:", login.status, "| bootstrap:", bootRes.status, "| cookie:", cookie ? cookie.slice(0, 20) : null);
const boot = await bootRes.json().catch(() => ({}));
console.log("claves bootstrap:", JSON.stringify(Object.keys(boot)));
console.log("claves:", JSON.stringify(Object.keys(boot)));
const { can } = await import("../../public/js/permissions.js");
const datos = { communities: listCommunities(), owners: listOwners(), properties: listProperties(), tenants: listTenants(), roles: listRoles() };
const commUser = db.prepare("SELECT * FROM users WHERE usuario = 'comm_admin'").get();
console.log("can community:read:", can(commUser, "community:read", "com-seed-1", datos));
console.log("rol del usuario:", commUser.rol, "| roles en data:", datos.roles.map(r => r.nombre).join(","));
console.log("comm_admin ve comunidades:", JSON.stringify((boot.communities || []).map(c => c.id)));
console.log("comm_admin user:", JSON.stringify(boot.user || {}));
server.close();
process.exit(0);
