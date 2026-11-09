import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const db = new DatabaseSync("data/penarrubia.db", { readOnly: true });

const dump = {};
dump.users = db.prepare("SELECT id, nombre, apellido, usuario, email, rol, activo FROM users ORDER BY usuario").all();
dump.communities = db.prepare("SELECT * FROM communities ORDER BY id").all();
dump.owners = db.prepare("SELECT * FROM owners ORDER BY id").all().map(o => {
  const { documents, propertyIds, ...rest } = o;
  return { ...rest, propertyIds: JSON.parse(propertyIds || "[]"), documents: JSON.parse(documents || "{}") };
});
dump.properties = db.prepare("SELECT * FROM properties ORDER BY id").all().map(p => {
  const { ownerIds, tenantIds, ownerPercentages, ...rest } = p;
  return { ...rest, ownerIds: JSON.parse(ownerIds || "[]"), tenantIds: JSON.parse(tenantIds || "[]"), ownerPercentages: JSON.parse(ownerPercentages || "{}") };
});
dump.tenants = db.prepare("SELECT * FROM tenants ORDER BY id").all().map(t => {
  const { documents, authorizations, ...rest } = t;
  return { ...rest, authorizations: JSON.parse(authorizations || "[]"), documents: JSON.parse(documents || "{}") };
});
dump.communicationPosts = db.prepare("SELECT id, communityId, data, createdBy, createdAt, updatedAt, version FROM communication_posts ORDER BY createdAt").all().map(p => ({
  ...p,
  data: JSON.parse(p.data),
}));
dump.communicationRecipients = db.prepare("SELECT * FROM communication_recipients ORDER BY postId, userId").all();
dump.communicationComments = db.prepare("SELECT * FROM communication_comments").all();
dump.communicationBallots = db.prepare("SELECT * FROM communication_ballots").all();
dump.roles = db.prepare("SELECT * FROM roles ORDER BY nombre").all();
const settingsRow = db.prepare("SELECT data FROM settings WHERE id = 'general'").get();
dump.settings = settingsRow ? JSON.parse(settingsRow.data) : {};
dump.adminEmails = db.prepare("SELECT * FROM admin_emails ORDER BY timestamp DESC").all();
dump.ownerNotifications = db.prepare("SELECT * FROM owner_notifications ORDER BY timestamp DESC").all();
db.close();

// Agregar password = username a cada usuario (el seed lo hashea con scrypt)
dump.users.forEach(u => { u.password = u.usuario; });

const outFile = path.join("src", "demo-data.json");
fs.writeFileSync(outFile, JSON.stringify(dump, null, 2));
console.log("Dump generado:", Object.keys(dump).map(k => `${k}: ${Array.isArray(dump[k]) ? dump[k].length : typeof dump[k]}`).join(", "));
console.log("Guardado en", outFile);
