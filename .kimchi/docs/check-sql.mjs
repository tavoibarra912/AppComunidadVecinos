// Validación de sintaxis SQL de los statements nuevos (BD en memoria)
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE communities (id TEXT PRIMARY KEY, name TEXT, adminUserId TEXT DEFAULT '', currency TEXT DEFAULT '');
CREATE TABLE owners (id TEXT PRIMARY KEY, userId TEXT DEFAULT '', documents TEXT DEFAULT '{}', communityId TEXT DEFAULT '');
CREATE TABLE tenants (id TEXT PRIMARY KEY, userId TEXT DEFAULT '', documents TEXT DEFAULT '{}', propertyId TEXT DEFAULT '', ownerId TEXT DEFAULT '');`);
db.prepare("INSERT INTO communities (id, name, adminUserId, currency) VALUES (?, ?, ?, ?)").run("c1", "X", "u1", "EUR");
db.prepare("INSERT INTO owners (id, userId, documents, communityId) VALUES (?, ?, ?, ?)").run("o1", "u1", "{}", "c1");
db.prepare("INSERT INTO tenants (id, userId, documents, propertyId, ownerId) VALUES (?, ?, ?, ?, ?)").run("t1", "u1", "{}", "p1", "o1");
db.prepare("UPDATE communities SET adminUserId = ?, currency = ? WHERE id = ?").run("u2", "USD", "c1");
db.prepare("UPDATE owners SET userId = ? WHERE id = ?").run("", "o1");
db.prepare("UPDATE tenants SET userId = ? WHERE id = ?").run("", "t1");
console.log("SQL OK");
