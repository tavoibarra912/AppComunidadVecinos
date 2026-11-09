// Datos de demostración extendidos: 2 comunidades con todos los campos,
// perfiles/inmuebles/inquilinos cubriendo las combinaciones de
// rol × perfil con las cuentas estándar, documentos de ejemplo y
// publicaciones de demostración.
//
// Uso:  node scripts/seed-demo-comunidades.mjs
// Idempotente: si ya se cargó, no duplica nada. Nunca corre en producción.

import crypto from "node:crypto";
import { db, listCommunities, listOwners, listProperties, listTenants, listRoles } from "../src/db.js";
import { validatePost } from "../src/communication-validation.js";
import { materialize } from "../src/communication-store.js";
import { createSeedDocsDemo } from "../src/seed.js";

if (process.env.NODE_ENV === "production") {
  console.error("Este script es solo para datos de demostración (no corre en producción).");
  process.exit(1);
}

if (db.prepare("SELECT COUNT(*) AS total FROM communities WHERE id LIKE 'com-demo-%'").get().total > 0) {
  console.log("El demo de comunidades extendidas ya está cargado. Nada que hacer.");
  process.exit(0);
}

const HORA = 3600000;
const DIA = 24 * HORA;
const iso = ms => new Date(ms).toISOString();
const stamp = new Date().toISOString();

// ---------------------------------------------------------------------------
// 1) COMUNIDADES (todos los campos del formulario)
// ---------------------------------------------------------------------------
const comunidades = [
  {
    id: "com-demo-1", name: "Comunidad Peñarrubia", nif: "B12345678",
    phone: "911000111", otherPhone: "911000112", address: "Avenida de la Constitución, 1",
    city: "Madrid", province: "Madrid", postalCode: "28001", email: "penarrubia.demo@comunidad.es",
    iban: "ES9121000418450200051332", president: "María González", administrator: "Fincas del Sol",
    constitutionYear: "1985", reserveFund: "12500", currency: "EUR",
    notes: "Comunidad demo con todos los campos completos.", documents: "[]", adminUserId: "user-comm_admin",
  },
  {
    id: "com-demo-2", name: "Comunidad Las Acacias", nif: "B87654321",
    phone: "922000222", otherPhone: "922000223", address: "Calle de los Álamos, 22",
    city: "Pozuelo de Alarcón", province: "Madrid", postalCode: "28223", email: "acacias.demo@comunidad.es",
    iban: "ES7620770024003102575766", president: "Jorge Lasarte", administrator: "Gestión Horizontal",
    constitutionYear: "2001", reserveFund: "8300", currency: "EUR",
    notes: "Segunda comunidad demo. Administrada también por comm_admin (multi-asignación).", documents: "[]", adminUserId: "user-comm_admin",
  },
];

// ---------------------------------------------------------------------------
// 2) PROPIETARIOS (todos los campos + documentos: DNI, recibo, escritura)
// ---------------------------------------------------------------------------
const propietarios = [
  {
    id: "own-demo-1", userId: "user-usuario_r_user_c_propietario", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    name: "Ana", surname: "Torres Vega", documentType: "DNI", dni: "11111111A", isMember: true,
    plot: "Vivienda 1-A", propertyId: "prop-demo-1", propertyIds: ["prop-demo-1"],
    phone: "611111101", otherPhone: "911111101", email: "ana.torres@demo.es",
    phoneVerified: 1, phoneVerifiedAt: stamp, emailVerified: 1, emailVerifiedAt: stamp,
    address: "Avenida de la Constitución, 1, 1-A", province: "Madrid", city: "Madrid", postalCode: "28001",
    iban: "ES1112345678111111111111", currency: "EUR",
    notes: "Propietaria residente. Delegada de la comisión de jardines.",
    documents: createSeedDocsDemo({ dni: "11111111A", nombre: "Ana Torres", plot: "Vivienda 1-A", communityName: "Comunidad Peñarrubia", aprobadas: true }),
  },
  {
    id: "own-demo-2", userId: "user-usuario_r_user_c_propietario_c_inquilino", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    name: "Bruno", surname: "Salas Molina", documentType: "DNI", dni: "22222222B", isMember: true,
    plot: "Vivienda 2-B", propertyId: "prop-demo-2", propertyIds: ["prop-demo-2"],
    phone: "622222202", otherPhone: "", email: "bruno.salas@demo.es",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 1, emailVerifiedAt: stamp,
    address: "Avenida de la Constitución, 1, 2-B", province: "Madrid", city: "Madrid", postalCode: "28001",
    iban: "ES2222345678222222222222", currency: "EUR",
    notes: "Propietario no residente: además es inquilino en Comunidad Las Acacias.",
    documents: createSeedDocsDemo({ dni: "22222222B", nombre: "Bruno Salas", plot: "Vivienda 2-B", communityName: "Comunidad Peñarrubia" }),
  },
  {
    id: "own-demo-3", userId: "user-comm_admin", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    name: "Carla", surname: "Núñez Prado", documentType: "DNI", dni: "33333333C", isMember: true,
    plot: "Departamento 3-C", propertyId: "prop-demo-3", propertyIds: ["prop-demo-3"],
    phone: "633333303", otherPhone: "", email: "carla.nunez@demo.es",
    phoneVerified: 1, phoneVerifiedAt: stamp, emailVerified: 0, emailVerifiedAt: "",
    address: "Avenida de la Constitución, 1, 3-C", province: "Madrid", city: "Madrid", postalCode: "28001",
    iban: "ES3333456789333333333333", currency: "EUR",
    notes: "El administrador de la comunidad también es propietaria vecina (combinación admin × propietario).",
    documents: createSeedDocsDemo({ dni: "33333333C", nombre: "Carla Núñez", plot: "Departamento 3-C", communityName: "Comunidad Peñarrubia", aprobadas: true }),
  },
  {
    id: "own-demo-4", userId: "", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    name: "Damián", surname: "Requena Sol", documentType: "DNI", dni: "44444444D", isMember: false,
    plot: "Local 4", propertyId: "prop-demo-4", propertyIds: ["prop-demo-4"],
    phone: "644444404", otherPhone: "", email: "damian.requena@demo.es",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 0, emailVerifiedAt: "",
    address: "Avenida de la Constitución, 1, Local 4", province: "Madrid", city: "Madrid", postalCode: "28001",
    iban: "", currency: "EUR",
    notes: "Perfil SIN cuenta vinculada: dispara el aviso de «perfiles sin cuenta» en el preview de envíos.",
    documents: createSeedDocsDemo({ dni: "44444444D", nombre: "Damián Requena", plot: "Local 4", communityName: "Comunidad Peñarrubia" }),
  },
  {
    id: "own-demo-5", userId: "user-super_admin", communityId: "com-demo-2", communityName: "Comunidad Las Acacias",
    name: "Elena", surname: "Vidal Mar", documentType: "DNI", dni: "55555555E", isMember: true,
    plot: "Ático 5-D", propertyId: "prop-demo-5", propertyIds: ["prop-demo-5"],
    phone: "655555505", otherPhone: "", email: "elena.vidal@demo.es",
    phoneVerified: 1, phoneVerifiedAt: stamp, emailVerified: 1, emailVerifiedAt: stamp,
    address: "Calle de los Álamos, 22, Ático 5-D", province: "Madrid", city: "Pozuelo de Alarcón", postalCode: "28223",
    iban: "ES5555678901555555555555", currency: "EUR",
    notes: "Perfil propietario de la cuenta super_admin (combinación super_admin × propietario).",
    documents: createSeedDocsDemo({ dni: "55555555E", nombre: "Elena Vidal", plot: "Ático 5-D", communityName: "Comunidad Las Acacias", aprobadas: true }),
  },
  {
    id: "own-demo-6", userId: "user-admin", communityId: "com-demo-2", communityName: "Comunidad Las Acacias",
    name: "Federico", surname: "Luna Caba", documentType: "DNI", dni: "66666666F", isMember: true,
    plot: "Piso 6-E", propertyId: "prop-demo-6", propertyIds: ["prop-demo-6"],
    phone: "666666606", otherPhone: "", email: "federico.luna@demo.es",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 0, emailVerifiedAt: "",
    address: "Calle de los Álamos, 22, 6-E", province: "Madrid", city: "Pozuelo de Alarcón", postalCode: "28223",
    iban: "ES6666789012666666666666", currency: "EUR",
    notes: "Perfil propietario de la cuenta admin/administrator (combinación administrator × propietario).",
    documents: createSeedDocsDemo({ dni: "66666666F", nombre: "Federico Luna", plot: "Piso 6-E", communityName: "Comunidad Las Acacias" }),
  },
];

// ---------------------------------------------------------------------------
// 3) INMUEBLES (todos los campos)
// ---------------------------------------------------------------------------
const inmuebles = [
  {
    id: "prop-demo-1", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    ownerIds: ["own-demo-1"], tenantIds: ["ten-demo-1"], propertyType: "vivienda",
    plot: "Vivienda 1-A", address: "Avenida de la Constitución, 1, 1-A",
    cadastralRef: "9872023VH1111S0001WX", registryNumber: "1111", floor: "1", door: "A",
    areaM2: "78", participationCoef: "9.5000", propertyUse: "residencial",
    receiptStatus: "current", notes: "Vivienda principal de la propietaria.",
    postalCode: "28001", city: "Madrid", province: "Madrid",
  },
  {
    id: "prop-demo-2", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    ownerIds: ["own-demo-2"], tenantIds: [], propertyType: "vivienda",
    plot: "Vivienda 2-B", address: "Avenida de la Constitución, 1, 2-B",
    cadastralRef: "9872023VH2222S0002WX", registryNumber: "2222", floor: "2", door: "B",
    areaM2: "85", participationCoef: "10.2500", propertyUse: "residencial",
    receiptStatus: "current", notes: "Vivienda del propietario que además alquila en Las Acacias.",
    postalCode: "28001", city: "Madrid", province: "Madrid",
  },
  {
    id: "prop-demo-3", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    ownerIds: ["own-demo-3"], tenantIds: ["ten-demo-3"], propertyType: "vivienda",
    plot: "Departamento 3-C", address: "Avenida de la Constitución, 1, 3-C",
    cadastralRef: "9872023VH3333S0003WX", registryNumber: "3333", floor: "3", door: "C",
    areaM2: "70", participationCoef: "8.0000", propertyUse: "residencial",
    receiptStatus: "current", notes: "Departamento de la administradora de la comunidad.",
    postalCode: "28001", city: "Madrid", province: "Madrid",
  },
  {
    id: "prop-demo-4", communityId: "com-demo-1", communityName: "Comunidad Peñarrubia",
    ownerIds: ["own-demo-4"], tenantIds: [], propertyType: "local",
    plot: "Local 4", address: "Avenida de la Constitución, 1, Local 4",
    cadastralRef: "9872023VH4444S0004WX", registryNumber: "4444", floor: "0", door: "L4",
    areaM2: "55", participationCoef: "5.0000", propertyUse: "comercial",
    receiptStatus: "current", notes: "Local comercial (perfil sin cuenta).",
    postalCode: "28001", city: "Madrid", province: "Madrid",
  },
  {
    id: "prop-demo-5", communityId: "com-demo-2", communityName: "Comunidad Las Acacias",
    ownerIds: ["own-demo-5"], tenantIds: ["ten-demo-2"], propertyType: "atico",
    plot: "Ático 5-D", address: "Calle de los Álamos, 22, Ático 5-D",
    cadastralRef: "9872024VH5555S0005WX", registryNumber: "5555", floor: "5", door: "D",
    areaM2: "96", participationCoef: "12.0000", propertyUse: "residencial",
    receiptStatus: "current", notes: "Ático propiedad de la cuenta super_admin.",
    postalCode: "28223", city: "Pozuelo de Alarcón", province: "Madrid",
  },
  {
    id: "prop-demo-6", communityId: "com-demo-2", communityName: "Comunidad Las Acacias",
    ownerIds: ["own-demo-6"], tenantIds: [], propertyType: "vivienda",
    plot: "Piso 6-E", address: "Calle de los Álamos, 22, 6-E",
    cadastralRef: "9872024VH6666S0006WX", registryNumber: "6666", floor: "6", door: "E",
    areaM2: "88", participationCoef: "10.7500", propertyUse: "residencial",
    receiptStatus: "current", notes: "Piso propiedad de la cuenta admin/administrator.",
    postalCode: "28223", city: "Pozuelo de Alarcón", province: "Madrid",
  },
];

// ---------------------------------------------------------------------------
// 4) INQUILINOS (todos los campos)
// ---------------------------------------------------------------------------
const inquilinos = [
  {
    id: "ten-demo-1", ownerId: "own-demo-1", propertyId: "prop-demo-1",
    name: "Gustavo", surname: "Peña Ríos", documentType: "DNI", documentId: "77777777G",
    contractType: "vivienda_habitual", monthlyRent: "850", deposit: "1700",
    emergencyPhone: "600111222", phone: "677777707", email: "gustavo.pena@demo.es",
    contractStart: iso(Date.now() - 200 * DIA).slice(0, 10), contractEnd: iso(Date.now() + 530 * DIA).slice(0, 10),
    authorizations: JSON.stringify(["email", "whatsapp"]), authorizationNotes: "Acepta avisos por email y WhatsApp.",
    phoneVerified: 1, phoneVerifiedAt: stamp, emailVerified: 1, emailVerifiedAt: stamp,
    notificationPreference: "whatsapp", currency: "EUR", userId: "user-usuario_r_user_c_inquilino",
  },
  {
    id: "ten-demo-2", ownerId: "own-demo-5", propertyId: "prop-demo-5",
    name: "Hugo", surname: "Miranda Soto", documentType: "DNI", documentId: "88888888H",
    contractType: "vivienda_habitual", monthlyRent: "1100", deposit: "2200",
    emergencyPhone: "600333444", phone: "688888808", email: "hugo.miranda@demo.es",
    contractStart: iso(Date.now() - 90 * DIA).slice(0, 10), contractEnd: iso(Date.now() + 275 * DIA).slice(0, 10),
    authorizations: JSON.stringify(["email"]), authorizationNotes: "Solo avisos por correo.",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 1, emailVerifiedAt: stamp,
    notificationPreference: "email", currency: "EUR", userId: "user-usuario_r_user_c_propietario_c_inquilino",
  },
  {
    id: "ten-demo-3", ownerId: "own-demo-3", propertyId: "prop-demo-3",
    name: "Iván", surname: "Serra Puente", documentType: "NIE", documentId: "X9999999I",
    contractType: "temporada", monthlyRent: "600", deposit: "600",
    emergencyPhone: "", phone: "699999909", email: "ivan.serra@demo.es",
    contractStart: iso(Date.now() - 20 * DIA).slice(0, 10), contractEnd: iso(Date.now() + 70 * DIA).slice(0, 10),
    authorizations: "[]", authorizationNotes: "",
    phoneVerified: 0, phoneVerifiedAt: "", emailVerified: 0, emailVerifiedAt: "",
    notificationPreference: "email", currency: "EUR", userId: "",
  },
];

// ---------------------------------------------------------------------------
// 5) PUBLICACIONES DEMO (reutiliza el generador de validación)
// ---------------------------------------------------------------------------
const base = (communityId) => ({
  communityId,
  audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
  channels: [],
  pinned: false, commentsEnabled: true, receiptRequired: false,
  priority: "normal", status: "published", reminderMinutes: 0,
});

const publicaciones = [
  { ...base("com-demo-1"), type: "notice", priority: "important", publishAt: iso(Date.now() - 3 * DIA),
    title: "Bienvenida a la nueva plataforma de la comunidad",
    body: "Estrenamos plataforma para gestionar todo: pagos, documentos, incidencias y comunicación. Mis canales permite elegir cómo querés recibir los avisos." },
  { ...base("com-demo-1"), type: "notice", priority: "urgent", pinned: true, publishAt: iso(Date.now() - 1 * DIA),
    title: "Reparación urgente en la portería",
    body: "El cerrajero acudió esta mañana por la avería de la puerta automática. Queda funcionando; mañana se revisará el motor." },
  { ...base("com-demo-1"), type: "event", publishAt: iso(Date.now() - 5 * DIA),
    startsAt: iso(Date.now() + 7 * DIA + 18 * HORA), endsAt: iso(Date.now() + 7 * DIA + 21 * HORA),
    title: "Cena de vecinos en el jardín",
    body: "Cena de convivencia del sábado en el jardín. Cada uno trae algo para compartir. Inscribite respondiendo a este aviso.", reminderMinutes: 120 },
  { ...base("com-demo-1"), type: "meeting", publishAt: iso(Date.now() - 4 * DIA), receiptRequired: true, reminderMinutes: 60,
    startsAt: iso(Date.now() + 15 * DIA + 18 * HORA), endsAt: iso(Date.now() + 15 * DIA + 19 * HORA + 30 * 60000),
    title: "Junta ordinaria de la comunidad",
    body: "Convocatoria de junta ordinaria. Confirmá tu asistencia desde este aviso.",
    meeting: { location: "Salón de actos del centro cívico", url: "", agenda: "1. Aprobación del acta anterior.\n2. Estado de cuentas.\n3. Nueva alarmas del garaje.\n4. Ruegos.", tasks: [ { title: "Preparar documentación de la junta", responsible: "Administración", dueAt: iso(Date.now() + 12 * DIA), done: false } ] } },
  { ...base("com-demo-1"), type: "notice", publishAt: iso(Date.now() - 2 * DIA),
    title: "Encuesta: horario de la piscina en verano",
    body: "Definamos juntos el horario de la piscina para el verano. Votá hasta el cierre de la consulta.",
    poll: { type: "vote", question: "¿Qué horario preferís para la piscina en verano?", options: ["9:00 a 21:00", "10:00 a 22:00", "11:00 a 23:00"], electorate: "recipients", multiple: false, resultsLive: true, closesAt: iso(Date.now() + 10 * DIA), closed: false } },
  { ...base("com-demo-2"), type: "notice", publishAt: iso(Date.now() - 6 * DIA),
    title: "Nueva administradora de la comunidad",
    body: "Gestión Horizontal asume la administración del edificio. Contacto: gestion@horizontal.example (solo demo)." },
  { ...base("com-demo-2"), type: "event", publishAt: iso(Date.now() - 1 * DIA),
    startsAt: iso(Date.now() + 20 * DIA + 17 * HORA), endsAt: iso(Date.now() + 20 * DIA + 19 * HORA),
    title: "Taller de reciclaje para el edificio",
    body: "Taller práctico de reciclaje doméstico en el hall. Plazas limitadas.", reminderMinutes: 60 },
];

// ---------------------------------------------------------------------------
// EJECUCIÓN
// ---------------------------------------------------------------------------
const insertComunidad = db.prepare(
  `INSERT INTO communities (id, name, nif, phone, otherPhone, address, city, province, postalCode, email, iban, president, administrator, constitutionYear, reserveFund, currency, notes, documents, adminUserId)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`
);
const insertOwner = db.prepare(
  `INSERT INTO owners (id, name, surname, documentType, dni, isMember, communityId, communityName, plot,
     propertyId, propertyIds, phone, otherPhone, email, phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt,
     address, province, city, postalCode, iban, currency, notes, documents)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertProperty = db.prepare(
  `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot, address, cadastralRef,
     registryNumber, floor, door, areaM2, participationCoef, propertyUse, receiptStatus, notes, postalCode, city, province)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, ?)`
);
const insertTenant = db.prepare(
  `INSERT INTO tenants (id, ownerId, propertyId, name, surname, documentType, documentId,
     contractType, monthlyRent, deposit, emergencyPhone, phone, email,
     contractStart, contractEnd, authorizations, authorizationNotes, phoneVerified, phoneVerifiedAt,
     emailVerified, emailVerifiedAt, notificationPreference, currency, userId)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertPost = db.prepare(
  "INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)"
);

db.exec("BEGIN");
try {
  for (const c of comunidades) {
    insertComunidad.run(
      c.id, c.name, c.nif, c.phone, c.otherPhone, c.address, c.city, c.province,
      c.postalCode, c.email, c.iban, c.president, c.administrator, c.constitutionYear,
      c.reserveFund, c.currency, c.notes, c.adminUserId
    );
  }
  for (const o of propietarios) {
    insertOwner.run(
      o.id, o.name, o.surname, o.documentType, o.dni, o.isMember, o.communityId, o.communityName,
      o.plot, o.propertyId, JSON.stringify(o.propertyIds), o.phone, o.otherPhone, o.email,
      o.phoneVerified, o.phoneVerifiedAt, o.emailVerified, o.emailVerifiedAt, o.address,
      o.province, o.city, o.postalCode, o.iban, o.currency, o.notes, JSON.stringify(o.documents)
    );
  }
  for (const p of inmuebles) {
    insertProperty.run(
      p.id, p.communityId, p.communityName, JSON.stringify(p.ownerIds), JSON.stringify(p.tenantIds),
      p.propertyType, p.plot, p.address, p.cadastralRef, p.registryNumber, p.floor, p.door,
      p.areaM2, p.participationCoef, p.propertyUse, p.notes, p.postalCode, p.city, p.province
    );
  }
  for (const t of inquilinos) {
    insertTenant.run(
      t.id, t.ownerId, t.propertyId, t.name, t.surname, t.documentType, t.documentId,
      t.contractType, t.monthlyRent, t.deposit, t.emergencyPhone, t.phone, t.email,
      t.contractStart, t.contractEnd, t.authorizations, t.authorizationNotes,
      t.phoneVerified, t.phoneVerifiedAt, t.emailVerified, t.emailVerifiedAt,
      t.notificationPreference, t.currency, t.userId
    );
  }
  for (const def of publicaciones) {
    const p = validatePost(def, null, {
      communities: listCommunities(), owners: listOwners(), properties: listProperties(),
      tenants: listTenants(), roles: listRoles(),
    });
    const id = crypto.randomUUID();
    insertPost.run(id, p.communityId, JSON.stringify(p), "user-super-admin", p.publishAt, p.publishAt);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
materialize();

console.log(`Demo extendido cargado: ${comunidades.length} comunidades, ${propietarios.length} propietarios, ${inmuebles.length} inmuebles, ${inquilinos.length} inquilinos, ${publicaciones.length} publicaciones.`);
console.log("Cobertura de combinaciones (rol × perfil):");
console.log("  super_admin        → sin perfil (correcto) + propietario (P5, Las Acacias)");
console.log("  admin/administrator → propietario (P6) + inquilino de super_admin");
console.log("  comm_admin          → administrador de 2 comunidades + propietario vecina (P3)");
console.log("  usuario_r_user_c_propietario       → propietario (2 inmuebles demo)");
console.log("  usuario_r_user_c_inquilino         → inquilino");
console.log("  usuario_r_user_c_propietario_c_inquilino → propietario (Acacias) + inquilino (Peñarrubia)");
console.log("  usuario_r_user_s_perfil            → sin perfil ni comunidad (ve vacío)");
