import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const db = new DatabaseSync("data/penarrubia.db", { readOnly: true });

const dump = {};

// Usuarios (sin hash)
dump.users = db.prepare("SELECT id, nombre, apellido, usuario, email, rol, activo FROM users ORDER BY usuario").all();

// Comunidades
dump.communities = db.prepare("SELECT * FROM communities ORDER BY id").all();

// Propietarios (con documentos)
dump.owners = db.prepare("SELECT * FROM owners ORDER BY id").all().map(o => ({
  ...o,
  documents: JSON.parse(o.documents || "{}"),
  propertyIds: JSON.parse(o.propertyIds || "[]"),
}));

// Propiedades
dump.properties = db.prepare("SELECT * FROM properties ORDER BY id").all().map(p => ({
  ...p,
  ownerIds: JSON.parse(p.ownerIds || "[]"),
  tenantIds: JSON.parse(p.tenantIds || "[]"),
  ownerPercentages: JSON.parse(p.ownerPercentages || "{}"),
}));

// Inquilinos
dump.tenants = db.prepare("SELECT * FROM tenants ORDER BY id").all().map(t => ({
  ...t,
  documents: JSON.parse(t.documents || "{}"),
  authorizations: JSON.parse(t.authorizations || "[]"),
}));

// Comunicaciones
dump.communicationPosts = db.prepare("SELECT * FROM communication_posts ORDER BY createdAt").all().map(p => ({
  ...p,
  data: JSON.parse(p.data),
}));
dump.communicationRecipients = db.prepare("SELECT * FROM communication_recipients").all();
dump.communicationComments = db.prepare("SELECT * FROM communication_comments").all();
dump.communicationBallots = db.prepare("SELECT * FROM communication_ballots").all();

// Roles
dump.roles = db.prepare("SELECT * FROM roles ORDER BY nombre").all();

// Settings
dump.settings = db.prepare("SELECT * FROM settings WHERE id = 'general'").get()?.data ? JSON.parse(db.prepare("SELECT * FROM settings WHERE id = 'general'").get().data) : {};

// Admin emails
dump.adminEmails = db.prepare("SELECT * FROM admin_emails ORDER BY timestamp DESC").all();

// Owner notifications
dump.ownerNotifications = db.prepare("SELECT * FROM owner_notifications ORDER BY timestamp DESC").all();

db.close();

fs.writeFileSync("data/demo-dump.json", JSON.stringify(dump, null, 2));
console.log("Dump generado:", Object.keys(dump).map(k => `${k}: ${Array.isArray(dump[k]) ? dump[k].length : typeof dump[k]}`).join(", "));
console.log("Guardado en data/demo-dump.json");
