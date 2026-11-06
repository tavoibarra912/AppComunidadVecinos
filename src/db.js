import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, "..", "data");
export const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "penarrubia.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nif TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    otherPhone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT '',
    postalCode TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    president TEXT NOT NULL DEFAULT '',
    administrator TEXT NOT NULL DEFAULT '',
    constitutionYear TEXT NOT NULL DEFAULT '',
    reserveFund TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    documents TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    documentType TEXT NOT NULL DEFAULT 'DNI',
    dni TEXT NOT NULL,
    isMember INTEGER NOT NULL DEFAULT 0,
    communityId TEXT NOT NULL DEFAULT '',
    communityName TEXT NOT NULL DEFAULT '',
    plot TEXT NOT NULL DEFAULT '',
    propertyId TEXT NOT NULL DEFAULT '',
    propertyIds TEXT NOT NULL DEFAULT '[]',
    phone TEXT NOT NULL DEFAULT '',
    otherPhone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phoneVerified INTEGER NOT NULL DEFAULT 0,
    phoneVerifiedAt TEXT NOT NULL DEFAULT '',
    emailVerified INTEGER NOT NULL DEFAULT 0,
    emailVerifiedAt TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    postalCode TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT NOT NULL DEFAULT '',
    propertyType TEXT NOT NULL DEFAULT '',
    cadastralRef TEXT NOT NULL DEFAULT '',
    registryNumber TEXT NOT NULL DEFAULT '',
    floor TEXT NOT NULL DEFAULT '',
    door TEXT NOT NULL DEFAULT '',
    areaM2 TEXT NOT NULL DEFAULT '',
    participationCoef TEXT NOT NULL DEFAULT '',
    propertyUse TEXT NOT NULL DEFAULT '',
    documents TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    communityId TEXT NOT NULL DEFAULT '',
    communityName TEXT NOT NULL DEFAULT '',
    ownerIds TEXT NOT NULL DEFAULT '[]',
    tenantIds TEXT NOT NULL DEFAULT '[]',
    propertyType TEXT NOT NULL DEFAULT '',
    plot TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    staircase TEXT NOT NULL DEFAULT '',
    energyCertificate TEXT NOT NULL DEFAULT '',
    communityFee TEXT NOT NULL DEFAULT '',
    cadastralRef TEXT NOT NULL DEFAULT '',
    registryNumber TEXT NOT NULL DEFAULT '',
    floor TEXT NOT NULL DEFAULT '',
    door TEXT NOT NULL DEFAULT '',
    areaM2 TEXT NOT NULL DEFAULT '',
    participationCoef TEXT NOT NULL DEFAULT '',
    propertyUse TEXT NOT NULL DEFAULT '',
    receiptStatus TEXT NOT NULL DEFAULT 'current',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL DEFAULT '',
    propertyId TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    documentType TEXT NOT NULL DEFAULT 'DNI',
    documentId TEXT NOT NULL DEFAULT '',
    contractType TEXT NOT NULL DEFAULT 'vivienda_habitual',
    monthlyRent TEXT NOT NULL DEFAULT '',
    deposit TEXT NOT NULL DEFAULT '',
    emergencyPhone TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    contractStart TEXT NOT NULL DEFAULT '',
    contractEnd TEXT NOT NULL DEFAULT '',
    authorizations TEXT NOT NULL DEFAULT '[]',
    authorizationNotes TEXT NOT NULL DEFAULT '',
    phoneVerified INTEGER NOT NULL DEFAULT 0,
    phoneVerifiedAt TEXT NOT NULL DEFAULT '',
    emailVerified INTEGER NOT NULL DEFAULT 0,
    emailVerifiedAt TEXT NOT NULL DEFAULT '',
    notificationPreference TEXT NOT NULL DEFAULT 'email',
    currency TEXT NOT NULL DEFAULT 'EUR',
    documents TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    fileName TEXT NOT NULL,
    fileType TEXT NOT NULL DEFAULT '',
    fileSize INTEGER NOT NULL DEFAULT 0,
    uploadedAt TEXT NOT NULL DEFAULT '',
    storedName TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_emails (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL DEFAULT '',
    ownerName TEXT NOT NULL DEFAULT '',
    ownerDni TEXT NOT NULL DEFAULT '',
    ownerCommunity TEXT NOT NULL DEFAULT '',
    ownerPlot TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL DEFAULT 0,
    read INTEGER NOT NULL DEFAULT 0,
    docs TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS owner_notifications (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL DEFAULT 0,
    read INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL DEFAULT '',
    apellido TEXT NOT NULL DEFAULT '',
    usuario TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'consulta',
    activo INTEGER NOT NULL DEFAULT 1,
    creadoEn TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    permisos TEXT NOT NULL DEFAULT '[]',
    sistema INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_properties_community ON properties(communityId);
  CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(propertyId);
  CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(ownerId);
  CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entityType, entityId);
  CREATE INDEX IF NOT EXISTS idx_admin_emails_owner ON admin_emails(ownerId);
  CREATE INDEX IF NOT EXISTS idx_owner_notifications_owner ON owner_notifications(ownerId);
`);

// Migraciones ligeras: agrega columnas que falten en bases creadas con
// un esquema anterior (CREATE TABLE IF NOT EXISTS no las añade).
function ensureColumns(table, definitions) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  for (const [name, ddl] of Object.entries(definitions)) {
    if (!existing.includes(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }
}

ensureColumns("communities", {
  currency: "TEXT NOT NULL DEFAULT ''"
});

// Semilla idempotente de administración (para bases creadas antes de la
// pantalla Administración: roles del sistema + usuarios iniciales).
if (db.prepare("SELECT COUNT(*) AS total FROM roles").get().total === 0) {
  const insertRole = db.prepare("INSERT INTO roles (id, nombre, descripcion, permisos, sistema) VALUES (?, ?, ?, ?, ?)");
  insertRole.run("rol-admin", "administrador", "Acceso total: gestión de comunidades, inmuebles, propietarios, inquilinos y administración.", JSON.stringify(["community:read", "community:manage", "owner:read", "owner:manage", "owner:edit", "owner:documents:submit", "property:read", "property:manage", "tenant:read", "tenant:manage", "document:approve", "admin:users", "admin:roles", "admin:settings", "admin_notification:read"]), 1);
  insertRole.run("rol-propietario", "propietario", "Acceso a sus datos, inmuebles, inquilinos y carga de documentación.", JSON.stringify(["community:read", "owner:read", "owner:edit", "owner:documents:submit", "property:read", "tenant:read", "tenant:manage", "owner_notification:read"]), 1);
  insertRole.run("rol-consulta", "consulta", "Sólo consulta de comunidades, inmuebles y propietarios.", JSON.stringify(["community:read", "owner:read", "property:read", "tenant:read"]), 0);
}
if (db.prepare("SELECT COUNT(*) AS total FROM users").get().total === 0) {
  const insertUser = db.prepare("INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo) VALUES (?, ?, ?, ?, ?, ?, 1)");
  insertUser.run("user-admin", "Administrador", "de la Asociación", "admin", "admin@penarrubia.es", "rol-admin");
  insertUser.run("user-consulta", "Recepción", "de la Asociación", "recepcion", "recepcion@penarrubia.es", "rol-consulta");
}

ensureColumns("properties", {
  notes: "TEXT NOT NULL DEFAULT ''",
  postalCode: "TEXT NOT NULL DEFAULT ''",
  city: "TEXT NOT NULL DEFAULT ''",
  province: "TEXT NOT NULL DEFAULT ''",
  currency: "TEXT NOT NULL DEFAULT ''",
  ownerPercentages: "TEXT NOT NULL DEFAULT '{}'"
});

ensureColumns("tenants", {
  phoneVerified: "INTEGER NOT NULL DEFAULT 0",
  phoneVerifiedAt: "TEXT NOT NULL DEFAULT ''",
  emailVerified: "INTEGER NOT NULL DEFAULT 0",
  emailVerifiedAt: "TEXT NOT NULL DEFAULT ''",
  notificationPreference: "TEXT NOT NULL DEFAULT 'email'",
  currency: "TEXT NOT NULL DEFAULT 'EUR'",
  documents: "TEXT NOT NULL DEFAULT '{}'"
});

// Backfill puntual: los inmuebles previos heredan la ubicación de su comunidad
db.exec(`
  UPDATE properties
  SET city = (SELECT city FROM communities WHERE communities.id = properties.communityId),
      province = (SELECT province FROM communities WHERE communities.id = properties.communityId),
      postalCode = (SELECT postalCode FROM communities WHERE communities.id = properties.communityId)
  WHERE city = '' AND communityId <> ''
`);

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function communityFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    nif: row.nif,
    phone: row.phone,
    otherPhone: row.otherPhone,
    address: row.address,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    email: row.email,
    iban: row.iban || "",
    president: row.president || "",
    administrator: row.administrator || "",
    constitutionYear: row.constitutionYear || "",
    reserveFund: row.reserveFund || "",
    currency: row.currency || "",
    notes: row.notes,
    documents: parseJson(row.documents, [])
  };
}

export function ownerFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
    documentType: row.documentType,
    dni: row.dni,
    isMember: !!row.isMember,
    communityId: row.communityId,
    communityName: row.communityName,
    plot: row.plot,
    propertyId: row.propertyId,
    propertyIds: parseJson(row.propertyIds, []),
    phone: row.phone,
    otherPhone: row.otherPhone,
    email: row.email,
    phoneVerified: !!row.phoneVerified,
    phoneVerifiedAt: row.phoneVerifiedAt,
    emailVerified: !!row.emailVerified,
    emailVerifiedAt: row.emailVerifiedAt,
    address: row.address,
    province: row.province,
    city: row.city,
    postalCode: row.postalCode,
    iban: row.iban,
    currency: row.currency,
    notes: row.notes,
    propertyType: row.propertyType,
    cadastralRef: row.cadastralRef,
    registryNumber: row.registryNumber,
    floor: row.floor,
    door: row.door,
    areaM2: row.areaM2,
    participationCoef: row.participationCoef,
    propertyUse: row.propertyUse,
    documents: parseJson(row.documents, {}),
    tenants: []
  };
}

export function propertyFromRow(row) {
  return {
    id: row.id,
    communityId: row.communityId,
    communityName: row.communityName,
    ownerIds: parseJson(row.ownerIds, []),
    tenantIds: parseJson(row.tenantIds, []),
    propertyType: row.propertyType,
    plot: row.plot,
    address: row.address,
    staircase: row.staircase,
    energyCertificate: row.energyCertificate,
    communityFee: row.communityFee,
    cadastralRef: row.cadastralRef,
    registryNumber: row.registryNumber,
    floor: row.floor,
    door: row.door,
    areaM2: row.areaM2,
    participationCoef: row.participationCoef,
    propertyUse: row.propertyUse,
    receiptStatus: row.receiptStatus,
    notes: row.notes || "",
    postalCode: row.postalCode || "",
    city: row.city || "",
    province: row.province || "",
    currency: row.currency || "",
    ownerPercentages: parseJson(row.ownerPercentages, {}),
    documents: []
  };
}

export function tenantFromRow(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    propertyId: row.propertyId,
    name: row.name,
    surname: row.surname,
    documentType: row.documentType,
    documentId: row.documentId,
    contractType: row.contractType,
    monthlyRent: row.monthlyRent,
    deposit: row.deposit,
    emergencyPhone: row.emergencyPhone,
    phone: row.phone,
    email: row.email,
    contractStart: row.contractStart,
    contractEnd: row.contractEnd,
    authorizations: parseJson(row.authorizations, []),
    authorizationNotes: row.authorizationNotes,
    phoneVerified: !!row.phoneVerified,
    phoneVerifiedAt: row.phoneVerifiedAt || "",
    emailVerified: !!row.emailVerified,
    emailVerifiedAt: row.emailVerifiedAt || "",
    notificationPreference: row.notificationPreference || "email",
    currency: row.currency || "EUR",
    documents: parseJson(row.documents, {})
  };
}

export function documentFromRow(row) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSize: row.fileSize,
    uploadedAt: row.uploadedAt,
    url: `/api/documents/${row.id}/download`
  };
}

export function adminEmailFromRow(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownerDni: row.ownerDni,
    ownerCommunity: row.ownerCommunity,
    ownerPlot: row.ownerPlot,
    subject: row.subject,
    date: row.date,
    timestamp: row.timestamp,
    read: !!row.read,
    docs: parseJson(row.docs, [])
  };
}

export function ownerNotificationFromRow(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    type: row.type,
    message: row.message,
    date: row.date,
    timestamp: row.timestamp,
    read: !!row.read
  };
}

export function listCommunities() {
  return db.prepare("SELECT * FROM communities ORDER BY name").all().map(communityFromRow);
}

export function listOwners() {
  return db.prepare("SELECT * FROM owners ORDER BY surname, name").all().map(ownerFromRow);
}

export function listProperties() {
  return db.prepare("SELECT * FROM properties ORDER BY plot").all().map(propertyFromRow);
}

export function listTenants() {
  return db.prepare("SELECT * FROM tenants ORDER BY surname, name").all().map(tenantFromRow);
}

export function listAdminEmails() {
  return db.prepare("SELECT * FROM admin_emails ORDER BY timestamp DESC").all().map(adminEmailFromRow);
}

export function listOwnerNotifications() {
  return db.prepare("SELECT * FROM owner_notifications ORDER BY timestamp DESC").all().map(ownerNotificationFromRow);
}

export function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY usuario").all().map(row => ({
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    usuario: row.usuario,
    email: row.email,
    rol: row.rol,
    activo: !!row.activo,
    creadoEn: row.creadoEn
  }));
}

export function listRoles() {
  return db.prepare("SELECT * FROM roles ORDER BY nombre").all().map(row => ({
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    permisos: parseJson(row.permisos, []),
    sistema: !!row.sistema
  }));
}

export function getSettings() {
  const row = db.prepare("SELECT data FROM settings WHERE id = 'general'").get();
  return parseJson(row?.data, null) || {
    nombreAsociacion: "Asociación Peñarrubia",
    emailContacto: "admin@penarrubia.es",
    telefonoContacto: "600000000",
    otpExpiraMinutos: 10,
    otpReenvioSegundos: 60,
    notificacionesEmail: true
  };
}

export function listDocuments(entityType, entityId) {
  return db.prepare("SELECT * FROM documents WHERE entityType = ? AND entityId = ? ORDER BY uploadedAt DESC")
    .all(entityType, entityId).map(documentFromRow);
}
