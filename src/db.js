import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND } from "./branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, "..", "data");
export const UPLOADS_DIR = process.env.APP_UPLOADS_DIR || path.join(__dirname, "..", "uploads");
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
    votingRights TEXT NOT NULL DEFAULT 'active',
    legalRepresentative TEXT NOT NULL DEFAULT '',
    notificationPreference TEXT NOT NULL DEFAULT 'email',
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
  currency: "TEXT NOT NULL DEFAULT ''",
  adminUserId: "TEXT NOT NULL DEFAULT ''"
});

ensureColumns("users", {
  passwordHash: "TEXT NOT NULL DEFAULT ''",
  ssoProvider: "TEXT NOT NULL DEFAULT ''",
  ssoId: "TEXT NOT NULL DEFAULT ''",
  resetToken: "TEXT NOT NULL DEFAULT ''",
  resetTokenExpira: "TEXT NOT NULL DEFAULT ''"
});

ensureColumns("owners", {
  userId: "TEXT NOT NULL DEFAULT ''",
  votingRights: "TEXT NOT NULL DEFAULT 'active'",
  legalRepresentative: "TEXT NOT NULL DEFAULT ''",
  notificationPreference: "TEXT NOT NULL DEFAULT 'email'"
});

ensureColumns("tenants", {
  userId: "TEXT NOT NULL DEFAULT ''"
});

// Referencias catastrales: se normalizan y, si no hay duplicados heredados,
// se protege su unicidad también a nivel de base de datos.
db.exec("UPDATE properties SET cadastralRef = UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) WHERE cadastralRef <> ''");
const duplicateCadastralRefs = db.prepare(
  `SELECT UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) AS ref, COUNT(*) AS total
   FROM properties WHERE TRIM(cadastralRef) <> ''
   GROUP BY UPPER(REPLACE(TRIM(cadastralRef), ' ', '')) HAVING total > 1`
).all();
if (duplicateCadastralRefs.length === 0) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_cadastral_unique
           ON properties(UPPER(REPLACE(TRIM(cadastralRef), ' ', '')))
           WHERE TRIM(cadastralRef) <> ''`);
}

// Roles del modelo de acceso: Super Admin / Admin General / Admin de
// Comunidad / Usuario. Migración idempotente: si aún no existe
// "super_admin" se reemplaza el set viejo y se miguran los usuarios.
if (!db.prepare("SELECT id FROM roles WHERE nombre = 'super_admin'").get()) {
  db.exec("DELETE FROM roles");
  const insertRole = db.prepare("INSERT INTO roles (id, nombre, descripcion, permisos, sistema) VALUES (?, ?, ?, ?, ?)");
  insertRole.run("rol-super-admin", "super_admin", "Super administrador: acceso total a la plataforma. Además de gestionar comunidades, propietarios, inmuebles, inquilinos y documentación, administra usuarios, roles, la configuración general, los proveedores de envío (email/SMS/WhatsApp) y la auditoría. Es el único rol que puede crear comunidades nuevas.", JSON.stringify(["community:read", "community:create", "community:edit", "community:manage", "community:delete", "owner:read", "owner:create", "owner:manage", "owner:edit", "owner:documents:submit", "owner:delete", "property:read", "property:create", "property:manage", "property:delete", "tenant:read", "tenant:create", "tenant:manage", "tenant:delete", "document:read", "document:upload", "document:approve", "document:delete", "reports:read", "audit:read", "admin:users", "admin:roles", "admin:settings", "admin:providers", "comm:participacion", "comm:publicar", "comm:moderar", "admin_notification:read", "owner_notification:read", "owner_notification:send"]), 1);
  insertRole.run("rol-admin-general", "administrator", "Administrador general: crea comunidades y administra todo su contenido — propietarios, inmuebles, inquilinos, documentación y comunicaciones. No gestiona usuarios, roles, configuración general ni proveedores de la plataforma.", JSON.stringify(["community:read", "community:create", "community:edit", "community:manage", "owner:read", "owner:create", "owner:manage", "owner:edit", "owner:documents:submit", "owner:delete", "property:read", "property:create", "property:manage", "tenant:read", "tenant:create", "tenant:manage", "tenant:delete", "document:approve", "document:upload", "document:delete", "comm:participacion", "comm:publicar", "comm:moderar", "admin_notification:read", "owner_notification:send"]), 1);
  insertRole.run("rol-admin-comunidad", "community_admin", "Administrador de comunidad: gestiona únicamente la comunidad que tiene asignada — propietarios, inmuebles, inquilinos, documentación y comunicaciones. No puede crear comunidades ni acceder a la configuración de la plataforma.", JSON.stringify(["community:read", "community:edit", "community:manage", "owner:read", "owner:create", "owner:manage", "owner:edit", "owner:documents:submit", "property:read", "property:create", "property:manage", "tenant:read", "tenant:create", "tenant:manage", "tenant:delete", "document:approve", "document:upload", "document:delete", "comm:participacion", "comm:publicar", "comm:moderar", "owner_notification:send"]), 1);
  insertRole.run("rol-usuario", "user", "Vecino (propietario o inquilino): solo puede ver y administrar su propio perfil, sus inmuebles, documentos y notificaciones. No accede a datos de otros vecinos ni de otras comunidades.", JSON.stringify(["community:read", "owner:read", "owner:edit", "owner:documents:submit", "property:read", "tenant:read", "document:upload", "comm:participacion", "owner_notification:read"]), 1);
  // Migrar usuarios del set viejo
  db.prepare("UPDATE users SET rol = 'super_admin' WHERE rol IN ('administrador', 'rol-admin')").run();
  db.prepare("UPDATE users SET rol = 'user' WHERE rol NOT IN ('super_admin', 'administrator', 'community_admin', 'user')").run();
}
// Las cuentas sin contraseña requieren que un administrador les asigne una.
// No se generan credenciales predecibles durante las migraciones.
db.exec("UPDATE users SET rol = (SELECT nombre FROM roles WHERE roles.id = users.rol) WHERE EXISTS (SELECT 1 FROM roles WHERE roles.id = users.rol)");
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);`);
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY)");
if (!db.prepare("SELECT id FROM schema_migrations WHERE id = 'scoped-permissions-v1'").get()) {
  for (const [name, additions] of [["user", ["tenant:manage", "tenant:delete", "document:read"]], ["community_admin", ["document:read"]]]) {
    const role = db.prepare("SELECT id, permisos FROM roles WHERE nombre = ?").get(name);
    if (role) db.prepare("UPDATE roles SET permisos = ? WHERE id = ?").run(JSON.stringify([...new Set([...JSON.parse(role.permisos), ...additions])]), role.id);
  }
  db.prepare("INSERT INTO schema_migrations (id) VALUES ('scoped-permissions-v1')").run();
}
// Permisos granulares (v1): las comprobaciones nuevas son más específicas
// (crear, editar, subir documentos, publicar/moderar…). Los roles que ya
// existían conservan su comportamiento previo añadiendo los permisos
// equivalentes a los que tenían. Idempotente y sin duplicados.
if (!db.prepare("SELECT id FROM schema_migrations WHERE id = 'granular-permissions-v1'").get()) {
  const equivalents = [
    ["community:manage", ["community:edit", "comm:publicar", "comm:moderar"]],
    ["owner:manage", ["owner:create", "document:upload"]],
    ["property:manage", ["property:create", "document:upload"]],
    ["tenant:manage", ["tenant:create", "document:upload"]],
    ["community:manage", ["document:upload", "document:delete"]],
    ["owner:documents:submit", ["document:upload"]],
    ["owner:manage", ["document:delete"]],
    ["property:manage", ["document:delete"]],
    ["tenant:manage", ["document:delete"]],
    ["document:approve", ["document:delete", "owner_notification:send"]],
    ["owner:manage", ["owner_notification:send"]],
    ["owner:edit", ["owner_notification:send"]],
  ];
  for (const role of db.prepare("SELECT id, permisos FROM roles").all()) {
    const permisos = JSON.parse(role.permisos || "[]");
    const next = [...permisos];
    for (const [source, additions] of equivalents) {
      if (!next.includes(source)) continue;
      for (const permission of additions) {
        if (!next.includes(permission)) next.push(permission);
      }
    }
    if (next.length !== permisos.length) {
      db.prepare("UPDATE roles SET permisos = ? WHERE id = ?").run(JSON.stringify(next), role.id);
    }
  }
  db.prepare("INSERT INTO schema_migrations (id) VALUES ('granular-permissions-v1')").run();
}
// Corrige los CIF de demostración que no cumplían el dígito de control.
if (!db.prepare("SELECT id FROM schema_migrations WHERE id = 'demo-community-cif-v1'").get()) {
  for (const [incorrecto, correcto] of [
    ["B12345678", "B12345674"],
    ["B87654321", "B87654323"],
    ["B55566677", "B55566673"],
  ]) {
    db.prepare("UPDATE communities SET nif = ? WHERE nif = ?").run(correcto, incorrecto);
  }
  db.prepare("INSERT INTO schema_migrations (id) VALUES ('demo-community-cif-v1')").run();
}
// Corrige los identificadores de los datos de demostración para que cumplan
// los formatos oficiales: NIF de comunidad (H + control), DNI/NIE con letra
// válida e IBAN con dígitos de control correctos.
if (!db.prepare("SELECT id FROM schema_migrations WHERE id = 'demo-identifiers-v1'").get()) {
  for (const [id, incorrecto, correcto] of [
    ["com-demo-1", "B12345674", "H12345674"],
    ["com-demo-2", "B87654323", "H87654323"],
    ["com-demo-3", "B55566673", "H55566673"],
  ]) {
    db.prepare("UPDATE communities SET nif = ? WHERE id = ? AND nif = ?").run(correcto, id, incorrecto);
  }
  db.prepare("UPDATE communities SET iban = 'ES8544556677889900112233' WHERE id = 'com-demo-3' AND iban = 'ES3344556677889900112233'").run();
  for (const [id, incorrecto, correcto] of [
    ["own-demo-1", "11111111A", "11111111H"],
    ["own-demo-2", "22222222B", "22222222J"],
    ["own-demo-3", "33333333C", "33333333P"],
    ["own-demo-4", "44444444D", "44444444A"],
    ["own-demo-5", "55555555E", "55555555K"],
    ["own-demo-6", "66666666F", "66666666Q"],
    ["own-demo-7", "77777777J", "77777777B"],
  ]) {
    db.prepare(
      "UPDATE owners SET dni = ?, documents = REPLACE(documents, ?, ?) WHERE id = ? AND dni = ?",
    ).run(correcto, incorrecto, correcto, id, incorrecto);
  }
  for (const [id, incorrecto, correcto] of [
    ["ten-demo-1", "77777777G", "77777777B"],
    ["ten-demo-2", "88888888H", "88888888Y"],
    ["ten-demo-3", "X9999999I", "X9999999J"],
    ["ten-demo-4", "Y1111111J", "Y1111111H"],
  ]) {
    db.prepare("UPDATE tenants SET documentId = ? WHERE id = ? AND documentId = ?").run(correcto, id, incorrecto);
  }
  db.prepare("INSERT INTO schema_migrations (id) VALUES ('demo-identifiers-v1')").run();
}
// Retira únicamente las contraseñas de SSO generadas por la antigua migración.
for (const user of db.prepare("SELECT id, usuario, passwordHash FROM users WHERE ssoProvider <> '' AND passwordHash <> ''").all()) {
  const [salt, hash] = user.passwordHash.split(":");
  if (hash && crypto.createHash("sha256").update(`${salt}:${user.usuario}`).digest("hex") === hash) {
    db.prepare("UPDATE users SET passwordHash = '', resetToken = '', resetTokenExpira = '' WHERE id = ?").run(user.id);
    db.prepare("DELETE FROM sessions WHERE userId = ?").run(user.id);
  }
}

// Migración: la cuenta de Super Admin ahora se llama "super_admin" (antes "admin").
const legacyAdmin = db.prepare("SELECT id, usuario, passwordHash FROM users WHERE id = 'user-admin' AND usuario = 'admin'").get();
if (legacyAdmin && !db.prepare("SELECT 1 AS existe FROM users WHERE usuario = 'super_admin'").get()) {
  db.prepare("UPDATE users SET usuario = 'super_admin' WHERE id = 'user-admin'").run();
  if (!process.env.APP_ADMIN_PASSWORD) {
    const [scheme, salt, hex] = String(legacyAdmin.passwordHash).split(":");
    if (scheme === "scrypt" && hex && hex.length === 128) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(hex, "hex"), crypto.scryptSync("admin", salt, 64))) {
          const resetSalt = crypto.randomBytes(16).toString("hex");
          db.prepare("UPDATE users SET passwordHash = ? WHERE id = 'user-admin'").run(`scrypt:${resetSalt}:${crypto.scryptSync("super_admin", resetSalt, 64).toString("hex")}`);
        }
      } catch { /* hash con formato desconocido: se conserva la contraseña */ }
    }
  }
}

// El rol super_admin de bases antiguas puede no traer el permiso de auditoría.
const superRole = db.prepare("SELECT id, permisos FROM roles WHERE nombre = 'super_admin'").get();
if (superRole) {
  const lista = JSON.parse(superRole.permisos || "[]");
  const faltantes = ["audit:read", "admin:providers"].filter(p => !lista.includes(p));
  if (faltantes.length) {
    db.prepare("UPDATE roles SET permisos = ? WHERE id = ?").run(JSON.stringify([...lista, ...faltantes]), superRole.id);
  }
}

// Backfill de permisos nuevos para roles del sistema (idempotente).
const backfillPermisos = {
  administrator: ["owner:delete", "comm:participacion", "tenant:delete"],
  community_admin: ["comm:participacion", "tenant:delete"],
  user: ["comm:participacion"],
};
for (const [nombre, faltantes] of Object.entries(backfillPermisos)) {
  const rol = db.prepare("SELECT id, permisos FROM roles WHERE nombre = ?").get(nombre);
  if (!rol) continue;
  const lista = JSON.parse(rol.permisos || "[]");
  const agregar = faltantes.filter(p => !lista.includes(p));
  if (agregar.length) {
    db.prepare("UPDATE roles SET permisos = ? WHERE id = ?").run(JSON.stringify([...lista, ...agregar]), rol.id);
  }
}

// Descripciones claras de los roles del sistema (idempotente, cubre bases viejas).
const descripcionesSistema = {
  super_admin: "Super administrador: acceso total a la plataforma. Además de gestionar comunidades, propietarios, inmuebles, inquilinos y documentación, administra usuarios, roles, la configuración general, los proveedores de envío (email/SMS/WhatsApp) y la auditoría. Es el único rol que puede crear comunidades nuevas.",
  administrator: "Administrador general: crea comunidades y administra todo su contenido — propietarios, inmuebles, inquilinos, documentación y comunicaciones. No gestiona usuarios, roles, configuración general ni proveedores de la plataforma.",
  community_admin: "Administrador de comunidad: gestiona únicamente la comunidad que tiene asignada — propietarios, inmuebles, inquilinos, documentación y comunicaciones. No puede crear comunidades ni acceder a la configuración de la plataforma.",
  user: "Vecino (propietario o inquilino): solo puede ver y administrar su propio perfil, sus inmuebles, documentos y notificaciones. No accede a datos de otros vecinos ni de otras comunidades.",
};
for (const [nombre, descripcion] of Object.entries(descripcionesSistema))
  db.prepare("UPDATE roles SET descripcion = ? WHERE nombre = ? AND sistema = 1").run(descripcion, nombre);

if (db.prepare("SELECT COUNT(*) AS total FROM users").get().total === 0) {
  if (process.env.NODE_ENV === "production" && (!process.env.APP_ADMIN_PASSWORD || process.env.APP_ADMIN_PASSWORD.length < 12)) {
    throw new Error("Para inicializar producción, configurá APP_ADMIN_PASSWORD con al menos 12 caracteres.");
  }
  const insertUser = db.prepare("INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo, passwordHash) VALUES (?, ?, ?, ?, ?, ?, 1, ?)");
  const initialAdminPassword = process.env.APP_ADMIN_PASSWORD || "super_admin";
  const adminSalt = crypto.randomBytes(16).toString("hex");
  const adminHash = `scrypt:${adminSalt}:${crypto.scryptSync(initialAdminPassword, adminSalt, 64).toString("hex")}`;
  insertUser.run("user-super-admin", "super_admin", "", "super_admin", "super_admin@super_admin.com", "super_admin", adminHash);
  // El resto de las cuentas demo las crea ensureDemoProfiles() de forma
  // idempotente con el esquema de nombres vigente.
}

export function ensureDemoProfiles() {
  // Cuentas estándar de demostración (idempotente): una por rol y vecinos con
  // todas las combinaciones de perfiles para probar cada escenario.
  //   ca*      administradores de comunidad (2)
  //   urusp*   usuario sin perfil (1)
  //   urucp*   propietarios (3)
  //   uruci*   inquilinos (3)
  //   urucpci* propietario + inquilino (2)
  const cuentas = [
    { usuario: "super_admin", rol: "super_admin" },
    { usuario: "admin", rol: "administrator" },
    { usuario: "ca1", rol: "community_admin" },
    { usuario: "ca2", rol: "community_admin" },
    { usuario: "urusp1", rol: "user" },
    { usuario: "urucp1", rol: "user" },
    { usuario: "urucp2", rol: "user" },
    { usuario: "urucp3", rol: "user" },
    { usuario: "uruci1", rol: "user" },
    { usuario: "uruci2", rol: "user" },
    { usuario: "uruci3", rol: "user" },
    { usuario: "urucpci1", rol: "user" },
    { usuario: "urucpci2", rol: "user" },
  ];

  // Bases antiguas: renombrar las cuentas demo al esquema vigente cuando el
  // nombre nuevo todavía no existe (conserva id, perfiles y contraseña).
  const renombres = [
    ["usuario_r_user_c_propietario", "urucp1"],
    ["usuario_r_user_c_inquilino", "uruci1"],
    ["usuario_r_user_c_propietario_c_inquilino", "urucpci1"],
    ["usuario_r_user_s_perfil", "urusp1"],
    ["comm_admin", "ca1"],
  ];
  for (const [viejo, nuevo] of renombres) {
    const cuentaVieja = db.prepare("SELECT id, passwordHash FROM users WHERE usuario = ?").get(viejo);
    if (!cuentaVieja) continue;
    if (db.prepare("SELECT 1 FROM users WHERE usuario = ?").get(nuevo)) continue;
    db.prepare("UPDATE users SET usuario = ?, nombre = ?, apellido = '', email = ? WHERE id = ?")
      .run(nuevo, nuevo, `${nuevo}@${nuevo}.com`, cuentaVieja.id);
    // Si la contraseña demo era el usuario anterior, pasa a ser el nuevo.
    const [scheme, salt, hex] = String(cuentaVieja.passwordHash || "").split(":");
    if (scheme === "scrypt" && salt && hex?.length === 128) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(hex, "hex"), crypto.scryptSync(viejo, salt, 64))) {
          db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?")
            .run(`scrypt:${salt}:${crypto.scryptSync(nuevo, salt, 64).toString("hex")}`, cuentaVieja.id);
        }
      } catch { /* hash con formato desconocido: se conserva la contraseña */ }
    }
  }

  for (const c of cuentas) {
    if (db.prepare("SELECT 1 FROM users WHERE usuario = ?").get(c.usuario)) continue;
    let id = `user-${c.usuario}`;
    // El id puede estar ocupado por una cuenta migrada: usar uno alternativo.
    if (db.prepare("SELECT 1 FROM users WHERE id = ?").get(id)) id = `user-${c.usuario}-demo`;
    const salt = crypto.randomBytes(16).toString("hex");
    db.prepare("INSERT INTO users (id, nombre, apellido, usuario, email, rol, activo, passwordHash) VALUES (?, ?, '', ?, ?, ?, 1, ?)")
      .run(id, c.usuario, c.usuario, `${c.usuario}@${c.usuario}.com`, c.rol, `scrypt:${salt}:${crypto.scryptSync(c.usuario, salt, 64).toString("hex")}`);
  }

  const userId = usuario => db.prepare("SELECT id FROM users WHERE usuario = ?").get(usuario)?.id || "";

  // Vínculo de perfiles de demostración con las cuentas correspondientes.
  const vincularOwner = (ownerId, usuario) => {
    const o = db.prepare("SELECT userId FROM owners WHERE id = ?").get(ownerId);
    const nuevoId = userId(usuario);
    if (o && nuevoId && (!o.userId || ["user-carlos", "user-laura"].includes(o.userId)))
      db.prepare("UPDATE owners SET userId = ? WHERE id = ?").run(nuevoId, ownerId);
  };
  vincularOwner("own-seed-1", "urucp1");
  vincularOwner("own-seed-3", "urucpci1");
  const vincularTenant = (tenantId, usuario) => {
    const t = db.prepare("SELECT userId FROM tenants WHERE id = ?").get(tenantId);
    const nuevoId = userId(usuario);
    if (t && nuevoId && (!t.userId || ["user-carlos", "user-laura"].includes(t.userId)))
      db.prepare("UPDATE tenants SET userId = ? WHERE id = ?").run(nuevoId, tenantId);
  };
  vincularTenant("tenant-seed-1", "uruci1");
  vincularTenant("tenant-seed-2", "urucpci2"); // inmueble en com-seed-2
  const superMigrado = db.prepare("SELECT id, nombre FROM users WHERE usuario = 'super_admin'").get();
  if (superMigrado && superMigrado.nombre !== "super_admin")
    db.prepare("UPDATE users SET nombre = 'super_admin', apellido = '', email = 'super_admin@super_admin.com' WHERE id = ?").run(superMigrado.id);
  const comPrincipal = db.prepare("SELECT adminUserId FROM communities WHERE id = 'com-seed-1'").get();
  const ca1 = userId("ca1");
  if (comPrincipal && ca1 && (!comPrincipal.adminUserId || comPrincipal.adminUserId === "user-admin-comunidad"))
    db.prepare("UPDATE communities SET adminUserId = ? WHERE id = 'com-seed-1'").run(ca1);

  // Perfiles demo que aún apunten a una cuenta antigua: reasignarlos a la
  // cuenta vigente antes de limpiar las cuentas viejas.
  for (const [viejo, nuevo] of renombres) {
    const viejoId = db.prepare("SELECT id FROM users WHERE usuario = ?").get(viejo)?.id;
    const nuevoId = userId(nuevo);
    if (!viejoId || !nuevoId || viejoId === nuevoId) continue;
    db.prepare("UPDATE owners SET userId = ? WHERE userId = ?").run(nuevoId, viejoId);
    db.prepare("UPDATE tenants SET userId = ? WHERE userId = ?").run(nuevoId, viejoId);
    db.prepare("UPDATE communities SET adminUserId = ? WHERE adminUserId = ?").run(nuevoId, viejoId);
  }

  // Limpieza de cuentas de demo viejas que ya no se usan (sin vínculos activos).
  const nombresVigentes = new Set(cuentas.map(c => c.usuario));
  for (const viejo of ["recepcion", "carlos", "laura", "gestor.olivos", ...renombres.map(([nombre]) => nombre)]) {
    if (nombresVigentes.has(viejo)) continue;
    const u = db.prepare("SELECT id FROM users WHERE usuario = ?").get(viejo);
    if (!u) continue;
    const usado = db.prepare(
      `SELECT (SELECT COUNT(*) FROM owners WHERE userId = ?) +
              (SELECT COUNT(*) FROM tenants WHERE userId = ?) +
              (SELECT COUNT(*) FROM communities WHERE adminUserId = ?) +
              (SELECT COUNT(*) FROM communication_recipients WHERE userId = ?) +
              (SELECT COUNT(*) FROM communication_audit WHERE userId = ?) +
              (SELECT COUNT(*) FROM communication_preferences WHERE userId = ?) +
              (SELECT COUNT(*) FROM sessions WHERE userId = ?) AS total`,
    ).get(u.id, u.id, u.id, u.id, u.id, u.id, u.id).total;
    if (usado === 0) db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
    else db.prepare("UPDATE users SET activo = 0 WHERE id = ?").run(u.id);
  }
}

ensureDemoProfiles();

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
    adminUserId: row.adminUserId || "",
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
    votingRights: row.votingRights || "active",
    legalRepresentative: row.legalRepresentative || "",
    notificationPreference: row.notificationPreference || "email",
    userId: row.userId || "",
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
  const ledger = db.prepare("SELECT 1 FROM sqlite_master WHERE name='fee_receipts'").get();
  const latestFee = ledger ? db.prepare("SELECT amount,snapshot FROM fee_receipts WHERE propertyId=? AND cancelledAt='' ORDER BY period DESC LIMIT 1").get(row.id) : null;
  const hasFeeReceipts = !!ledger && !!db.prepare("SELECT 1 FROM fee_receipts WHERE propertyId=? LIMIT 1").get(row.id);
  const pendingFee = hasFeeReceipts && db.prepare(`SELECT 1 FROM fee_receipts r WHERE r.propertyId=? AND r.cancelledAt='' AND r.amount>
    COALESCE((SELECT SUM(a.amount) FROM fee_allocations a JOIN fee_payments p ON p.id=a.paymentId WHERE a.receiptId=r.id AND p.reversedAt=''),0) LIMIT 1`).get(row.id);
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
    communityFee: latestFee ? (latestFee.amount / (JSON.parse(latestFee.snapshot).months || 1) / 100).toFixed(2) : row.communityFee,
    cadastralRef: row.cadastralRef,
    registryNumber: row.registryNumber,
    floor: row.floor,
    door: row.door,
    areaM2: row.areaM2,
    participationCoef: row.participationCoef,
    propertyUse: row.propertyUse,
    receiptStatus: hasFeeReceipts ? (pendingFee ? "pending" : "current") : row.receiptStatus,
    hasFeeReceipts,
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
    userId: row.userId || "",
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
    docs: parseJson(row.docs, []),
    ...(row.feeReceiptId ? { feeReceiptId: row.feeReceiptId } : {})
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
    read: !!row.read,
    ...(row.feeReceiptId ? { feeReceiptId: row.feeReceiptId } : {})
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
    creadoEn: row.creadoEn,
    ssoProvider: row.ssoProvider || ""
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

export const DOCUMENT_TYPES = Object.freeze(["pdf", "jpg", "jpeg", "png", "webp"]);

export function normalizeDocumentTypes(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const tipos = [...new Set(list.map((item) => String(item).trim().toLowerCase().replace(/^\./, "")).filter((item) => DOCUMENT_TYPES.includes(item)))];
  return tipos.length ? tipos : [...DOCUMENT_TYPES];
}

export function getSettings() {
  const row = db.prepare("SELECT data FROM settings WHERE id = 'general'").get();
  const defaults = {
    nombreAsociacion: "Asociación Peñarrubia",
    emailContacto: "admin@penarrubia.es",
    telefonoContacto: "600000000",
    permitirRegistro: true,
    permitirRecuperacion: true,
    duracionSesionHoras: 8,
    otpExpiraMinutos: 10,
    otpReenvioSegundos: 60,
    notificacionesEmail: true,
    feeBeforeDays: 3,
    feeAfterDays: 7,
    feeRepeatDays: 0,
    feeInternal: true,
    feeEmail: false,
    feeEmailSubject: "{{titulo}} · {{comunidad}}",
    feeEmailBody: "{{mensaje}}\nConsultá el tab Financiero de tu ficha de propietario.",
    avisosCambiosEmail: "",
    documentosMaxSizeMb: 15,
    documentosMaxArchivos: 20,
    documentosTiposPermitidos: [...DOCUMENT_TYPES],
    monedaPorDefecto: "EUR",
    diasAvisoVencimientoContrato: 30,
    filasPorPagina: 10,
    mantenimiento: false,
    mensajeMantenimiento: "La plataforma está en mantenimiento. Volvé a intentar en unos minutos."
  };
  const saved = parseJson(row?.data, null);
  const settings = saved ? { ...defaults, ...saved, marca: { ...DEFAULT_BRAND, ...(saved.marca || {}) } } : { ...defaults, marca: { ...DEFAULT_BRAND } };
  settings.documentosTiposPermitidos = normalizeDocumentTypes(settings.documentosTiposPermitidos);
  return settings;
}

export function listDocuments(entityType, entityId) {
  return db.prepare("SELECT * FROM documents WHERE entityType = ? AND entityId = ? ORDER BY uploadedAt DESC")
    .all(entityType, entityId).map(documentFromRow);
}
