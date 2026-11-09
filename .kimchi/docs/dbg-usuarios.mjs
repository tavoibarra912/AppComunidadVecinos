process.env.NODE_ENV = "test";
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pen-dbg-"));
process.env.APP_UPLOADS_DIR = process.env.APP_DATA_DIR + "/up";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { db, ensureDemoProfiles } = await import("../../src/db.js");
const { seedIfEmpty } = await import("../../src/seed.js");
seedIfEmpty();
ensureDemoProfiles();
console.log("comm adminUserId:", JSON.stringify(db.prepare("SELECT id, adminUserId FROM communities WHERE id='com-seed-1'").get()));
console.log("usuarios:", db.prepare("SELECT usuario, rol FROM users ORDER BY usuario").all().map(u => `${u.usuario}/${u.rol}`).join(", "));
process.exit(0);
