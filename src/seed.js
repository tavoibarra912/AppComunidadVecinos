import { db, ensureDemoProfiles, listCommunities, listOwners, listProperties, listTenants, listRoles } from "./db.js";
import { rebuildOwnersPropertyIds, syncPropertyTenantReferences } from "./domain.js";
import crypto from "node:crypto";
import { validatePost } from "./communication-validation.js";
import { materialize } from "./communication-store.js";

const communitySeeds = [
  { id: "com-seed-1", name: "Residencial Peñarrubia", nif: "H28654321", address: "Calle de la Sierra, 14", city: "Madrid", province: "Madrid", postalCode: "28035", phone: "912345678", otherPhone: "913456789", email: "contacto@penarrubia.es", notes: "" },
  { id: "com-seed-2", name: "Edificio Los Olivos", nif: "H19456789", address: "Avenida de Europa, 6", city: "Pozuelo de Alarcón", province: "Madrid", postalCode: "28224", phone: "913456789", otherPhone: "914567890", email: "contacto@penarrubia.es", notes: "Próxima junta ordinaria en octubre." },
  { id: "com-seed-3", name: "Comunidad Vista Bella", nif: "H03112233", address: "Calle Mayor, 45", city: "Alicante/Alacant", province: "Alicante", postalCode: "03001", phone: "965112233", otherPhone: "965223344", email: "vistabella@comunidad.es", notes: "Revisión técnica de ascensor en curso." },
  { id: "com-seed-4", name: "Urbanización El Pinar", nif: "H29987654", address: "Camino del Pinar, 8", city: "Málaga", province: "Málaga", postalCode: "29001", phone: "952987654", otherPhone: "952123456", email: "elpinar@comunidad.es", notes: "" },
  { id: "com-seed-5", name: "Residencial Las Flores", nif: "H41556677", address: "Plaza de las Flores, 12", city: "Sevilla", province: "Sevilla", postalCode: "41001", phone: "954556677", otherPhone: "954667788", email: "lasflores@comunidad.es", notes: "Limpieza y mantenimiento de jardines." },
  { id: "com-seed-6", name: "Parque San Juan", nif: "H46123456", address: "Gran Vía del Marqués, 78", city: "Valencia", province: "Valencia", postalCode: "46001", phone: "963123456", otherPhone: "963654321", email: "sanjuan@comunidad.es", notes: "" },
  { id: "com-seed-7", name: "Altos de Peñarrubia", nif: "H50778899", address: "Paseo de la Ribera, 3", city: "Zaragoza", province: "Zaragoza", postalCode: "50001", phone: "976778899", otherPhone: "976889900", email: "altos@penarrubia.es", notes: "Lectura de contadores trimestral." }
];

function createSeedDocsForCarlosRuiz() {
  return {
    dni: {
      key: "dni", title: "Copia de DNI (ambas caras)", fileName: "DNI_47895231P_ambas_caras.pdf",
      fileType: "application/pdf", fileSize: 485200, uploadedAt: "12/10/2026, 18:20", dataUrl: null,
      autoValidation: {
        status: "passed", legibilityScore: 98, legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
        typeVerified: "Documento Nacional de Identidad (España) - Anverso y Reverso",
        checks: [
          { name: "Legibilidad y resolución", passed: true, detail: "Alta resolución y contraste óptimo (98%)" },
          { name: "Tipo de documento", passed: true, detail: "DNI español oficial verificado" },
          { name: "Ambas caras", passed: true, detail: "Anverso y reverso comprobados" },
          { name: "Coincidencia de DNI", passed: true, detail: "DNI 47895231P coincide con el asociado" }
        ]
      },
      adminApproval: { status: "pending", reviewedAt: null, reviewedBy: null, notes: "" }
    },
    bankReceipt: {
      key: "bankReceipt", title: "Recibo bancario o certificado de titularidad", fileName: "Certificado_Titularidad_CaixaBank_47895231P.pdf",
      fileType: "application/pdf", fileSize: 312400, uploadedAt: "12/10/2026, 18:22", dataUrl: null,
      autoValidation: {
        status: "passed", legibilityScore: 96, legibilityStatus: "Óptima (documento bancario legible)",
        typeVerified: "Certificado de titularidad bancaria con IBAN español",
        checks: [
          { name: "Legibilidad y nitidez", passed: true, detail: "Texto bancario legible y contrastado (96%)" },
          { name: "Entidad bancaria", passed: true, detail: "Entidad financiera debidamente identificada" },
          { name: "IBAN y titularidad", passed: true, detail: "IBAN ES66 2100... y titular Carlos Ruiz acreditados" }
        ]
      },
      adminApproval: { status: "pending", reviewedAt: null, reviewedBy: null, notes: "" }
    },
    propertyDeed: {
      key: "propertyDeed", title: "Copia de la escritura del inmueble", fileName: "Escritura_Notarial_Parcela_14.pdf",
      fileType: "application/pdf", fileSize: 1250300, uploadedAt: "12/10/2026, 18:25", dataUrl: null,
      autoValidation: {
        status: "passed", legibilityScore: 95, legibilityStatus: "Óptima (escritura pública nítida)",
        typeVerified: "Escritura notarial de propiedad y acreditación de finca",
        checks: [
          { name: "Legibilidad y firmas", passed: true, detail: "Documento notarial nítido con firmas identificadas (95%)" },
          { name: "Título de propiedad", passed: true, detail: "Escritura pública notarial legalizada" },
          { name: "Acreditación parcela", passed: true, detail: "Parcela 14 en Residencial Peñarrubia acreditada" }
        ]
      },
      adminApproval: { status: "pending", reviewedAt: null, reviewedBy: null, notes: "" }
    }
  };
}

function createSeedDocsForMariaLuisa() {
  const docs = createSeedDocsForCarlosRuiz();
  docs.dni.fileName = "DNI_53891244J_ambas_caras.pdf";
  docs.dni.autoValidation.checks[3].detail = "DNI 53891244J coincide con la asociada";
  docs.dni.adminApproval = { status: "approved", reviewedAt: "11/10/2026, 11:30", reviewedBy: "Administrador", notes: "Verificado conforme." };
  docs.bankReceipt.fileName = "Recibo_Bancario_Santander_53891244J.pdf";
  docs.bankReceipt.adminApproval = { status: "approved", reviewedAt: "11/10/2026, 11:30", reviewedBy: "Administrador", notes: "Domiciliación aprobada." };
  docs.propertyDeed.fileName = "Escritura_Parcela_22.pdf";
  docs.propertyDeed.adminApproval = { status: "approved", reviewedAt: "11/10/2026, 11:30", reviewedBy: "Administrador", notes: "Escritura cotejada con catastro." };
  return docs;
}

const ownerSeeds = [
  { id: "own-seed-1", name: "Carlos", surname: "Ruiz Mendoza", dni: "47895231P", communityId: "com-seed-1", communityName: "Residencial Peñarrubia", plot: "Parcela 14", phone: "612345678", otherPhone: "912345678", email: "carlos.ruiz@email.com", isMember: true, iban: "ES6621000418401234567891", address: "Calle de la Sierra, 14, Parcela 14", city: "Madrid", province: "Madrid", postalCode: "28035", notes: "Vocal de la junta directiva de Peñarrubia.", documents: createSeedDocsForCarlosRuiz() },
  { id: "own-seed-2", name: "María Luisa", surname: "Fernández Soto", dni: "53891244J", communityId: "com-seed-1", communityName: "Residencial Peñarrubia", plot: "Parcela 22", phone: "623456789", otherPhone: "624567890", email: "marialuisa.fernandez@email.com", isMember: true, iban: "ES9100491500051234567892", address: "Calle de la Sierra, 22", city: "Madrid", province: "Madrid", postalCode: "28035", notes: "Solicita comunicaciones preferentes por correo electrónico.", documents: createSeedDocsForMariaLuisa() },
  { id: "own-seed-3", name: "Javier", surname: "Gómez Alarcón", dni: "09876543K", communityId: "com-seed-2", communityName: "Edificio Los Olivos", plot: "Piso 3º B", phone: "634567890", otherPhone: "", email: "javier.gomez@email.com", isMember: true, iban: "ES1220385778983000760112", address: "Avenida de Europa, 6, 3º B", city: "Pozuelo de Alarcón", province: "Madrid", postalCode: "28224", notes: "" },
  { id: "own-seed-4", name: "Carmen", surname: "Navarro Beltrán", dni: "71234567W", communityId: "com-seed-3", communityName: "Comunidad Vista Bella", plot: "Chalet 7", phone: "645678901", otherPhone: "965112233", email: "carmen.navarro@email.com", isMember: false, iban: "", address: "Calle Mayor, 45, Chalet 7", city: "Alicante/Alacant", province: "Alicante", postalCode: "03001", notes: "Pendiente de formalizar inscripción como asociada." },
  { id: "own-seed-5", name: "Pedro", surname: "Sánchez Gil", dni: "32145698R", communityId: "com-seed-4", communityName: "Urbanización El Pinar", plot: "Parcela 5", phone: "656789012", otherPhone: "952987654", email: "pedro.sanchez@email.com", isMember: true, iban: "ES4501824000100123456789", address: "Camino del Pinar, 8, Parcela 5", city: "Málaga", province: "Málaga", postalCode: "29001", notes: "Horario de contacto preferente por las tardes." },
  { id: "own-seed-6", name: "Elena", surname: "Morales Ortiz", dni: "25698741J", communityId: "com-seed-5", communityName: "Residencial Las Flores", plot: "Vivienda 12-A", phone: "667890123", otherPhone: "", email: "elena.morales@email.com", isMember: true, iban: "ES3800810556110123456789", address: "Plaza de las Flores, 12, Puerta A", city: "Sevilla", province: "Sevilla", postalCode: "41001", notes: "" },
  { id: "own-seed-7", name: "Roberto", surname: "Vega Domínguez", dni: "14523698A", communityId: "com-seed-6", communityName: "Parque San Juan", plot: "Ático 4", phone: "678901234", otherPhone: "963123456", email: "roberto.vega@email.com", isMember: false, iban: "", address: "Gran Vía del Marqués, 78, Ático 4", city: "Valencia", province: "Valencia", postalCode: "46001", notes: "Propietario no residente temporal." },
  { id: "own-seed-8", name: "Isabel", surname: "Romero Fuentes", dni: "85236974D", communityId: "com-seed-7", communityName: "Altos de Peñarrubia", plot: "Parcela 31", phone: "689012345", otherPhone: "976778899", email: "isabel.romero@email.com", isMember: true, iban: "ES7700490001551234567890", address: "Paseo de la Ribera, 3, Parcela 31", city: "Zaragoza", province: "Zaragoza", postalCode: "50001", notes: "Interesada en la comisión de lecturas de contadores." }
];

const propertySeeds = [
  { id: "prop-seed-1", communityId: "com-seed-1", communityName: "Residencial Peñarrubia", propertyType: "parcela", plot: "Parcela 14", cadastralRef: "9872028VK4797S0001WX", registryNumber: "1420", floor: "", door: "", areaM2: "420", participationCoef: "4.2500", propertyUse: "residencial", address: "Calle de la Sierra, 14, Parcela 14" },
  { id: "prop-seed-2", communityId: "com-seed-1", communityName: "Residencial Peñarrubia", propertyType: "parcela", plot: "Parcela 22", cadastralRef: "9872028VK4797S0002WX", registryNumber: "1421", floor: "", door: "", areaM2: "380", participationCoef: "3.8000", propertyUse: "residencial", address: "Calle de la Sierra, 22" },
  { id: "prop-seed-3", communityId: "com-seed-1", communityName: "Residencial Peñarrubia", propertyType: "parcela", plot: "Parcela 30", cadastralRef: "", registryNumber: "", floor: "", door: "", areaM2: "350", participationCoef: "3.5000", propertyUse: "residencial", address: "Calle de la Sierra, 30" },
  { id: "prop-seed-4", communityId: "com-seed-2", communityName: "Edificio Los Olivos", propertyType: "vivienda", plot: "Piso 3º B", cadastralRef: "0796301VK4709F0003BB", registryNumber: "88", floor: "3", door: "B", areaM2: "95", participationCoef: "6.1250", propertyUse: "residencial", address: "Avenida de Europa, 6, 3º B" },
  { id: "prop-seed-5", communityId: "com-seed-2", communityName: "Edificio Los Olivos", propertyType: "garaje", plot: "Plaza G-12", cadastralRef: "", registryNumber: "", floor: "-1", door: "12", areaM2: "12", participationCoef: "0.8000", propertyUse: "garaje", address: "Avenida de Europa, 6, G-12" },
  { id: "prop-seed-6", communityId: "com-seed-3", communityName: "Comunidad Vista Bella", propertyType: "vivienda", plot: "Chalet 7", cadastralRef: "0301501YH0001A0007WX", registryNumber: "207", floor: "", door: "", areaM2: "180", participationCoef: "8.0000", propertyUse: "residencial", address: "Calle Mayor, 45, Chalet 7" },
  { id: "prop-seed-7", communityId: "com-seed-4", communityName: "Urbanización El Pinar", propertyType: "parcela", plot: "Parcela 5", cadastralRef: "2906704VG4720N0005WX", registryNumber: "55", floor: "", door: "", areaM2: "510", participationCoef: "5.1000", propertyUse: "residencial", address: "Camino del Pinar, 8, Parcela 5" },
  { id: "prop-seed-8", communityId: "com-seed-5", communityName: "Residencial Las Flores", propertyType: "vivienda", plot: "Vivienda 12-A", cadastralRef: "4109101TG3440N0012AA", registryNumber: "12", floor: "1", door: "A", areaM2: "88", participationCoef: "4.4000", propertyUse: "residencial", address: "Plaza de las Flores, 12, Puerta A" },
  { id: "prop-seed-9", communityId: "com-seed-5", communityName: "Residencial Las Flores", propertyType: "local", plot: "Local 1", cadastralRef: "", registryNumber: "", floor: "0", door: "1", areaM2: "64", participationCoef: "3.2000", propertyUse: "comercial", address: "Plaza de las Flores, 12, Local 1" },
  { id: "prop-seed-10", communityId: "com-seed-6", communityName: "Parque San Juan", propertyType: "vivienda", plot: "Ático 4", cadastralRef: "4625003YF2462S0004WX", registryNumber: "404", floor: "4", door: "Ático", areaM2: "110", participationCoef: "7.0000", propertyUse: "residencial", address: "Gran Vía del Marqués, 78, Ático 4" },
  { id: "prop-seed-11", communityId: "com-seed-7", communityName: "Altos de Peñarrubia", propertyType: "parcela", plot: "Parcela 31", cadastralRef: "5029701XL7450N0031WX", registryNumber: "31", floor: "", door: "", areaM2: "390", participationCoef: "4.9000", propertyUse: "residencial", address: "Paseo de la Ribera, 3, Parcela 31" }
];

const PLOT_TO_PROPERTY_ID = {
  "Parcela 14": "prop-seed-1",
  "Parcela 22": "prop-seed-2",
  "Piso 3º B": "prop-seed-4",
  "Chalet 7": "prop-seed-6",
  "Parcela 5": "prop-seed-7",
  "Vivienda 12-A": "prop-seed-8",
  "Ático 4": "prop-seed-10",
  "Parcela 31": "prop-seed-11"
};

const tenantSeeds = [
  {
    id: "tenant-seed-1",
    propertyId: "prop-seed-1",
    name: "Laura",
    surname: "Martínez Reyes",
    documentId: "54123678B",
    phone: "611223344",
    email: "laura.martinez@email.com",
    contractStart: "2026-06-01",
    contractEnd: "2027-05-31",
    authorizations: ["common_areas", "community_communications"],
    authorizationNotes: "Acceso a piscina en horario de verano."
  },
  {
    id: "tenant-seed-2",
    propertyId: "prop-seed-8",
    name: "Andrés",
    surname: "Castro Lima",
    documentId: "",
    phone: "699887766",
    email: "andres.castro@email.com",
    contractStart: "2026-01-15",
    contractEnd: "",
    authorizations: ["common_areas", "community_communications", "incident_management"],
    authorizationNotes: ""
  }
];

const adminEmailSeeds = [
  {
    id: "email-seed-1",
    ownerId: "own-seed-1",
    ownerName: "Carlos Ruiz Mendoza",
    ownerDni: "47895231P",
    ownerCommunity: "Residencial Peñarrubia",
    ownerPlot: "Parcela 14",
    subject: "[Peñarrubia] Solicitud de verificación y aprobación de documentación - Propietario: Carlos Ruiz Mendoza (47895231P)",
    date: "12/10/2026, 18:25",
    timestamp: Date.now() - 3600000,
    read: false,
    docs: [
      { key: "dni", title: "Copia de DNI (ambas caras)", fileName: "DNI_47895231P_ambas_caras.pdf", validation: "Validado por sistema (DNI Español)", legibility: "98% (Óptima)" },
      { key: "bankReceipt", title: "Recibo bancario o certificado", fileName: "Certificado_Titularidad_CaixaBank_47895231P.pdf", validation: "Validado por sistema (IBAN ES66)", legibility: "96% (Óptima)" },
      { key: "propertyDeed", title: "Copia de la escritura", fileName: "Escritura_Notarial_Parcela_14.pdf", validation: "Validado por sistema (Escritura notarial)", legibility: "95% (Óptima)" }
    ]
  }
];

const ownerNotificationSeeds = [
  {
    id: "notif-seed-1",
    ownerId: "own-seed-1",
    title: "Documentación recibida para revisión",
    type: "info",
    date: "12/10/2026, 18:30",
    timestamp: Date.now() - 3600000,
    read: false,
    message: "Tus 3 documentos obligatorios se han recibido. El expediente está pendiente de revisión por parte de un administrador."
  },
  {
    id: "notif-seed-2",
    ownerId: "own-seed-1",
    title: "Convocatoria de Junta General Ordinaria",
    type: "info",
    date: "10/10/2026, 10:00",
    timestamp: Date.now() - 86400000 * 2,
    read: true,
    message: "Estimado asociado, se convoca la próxima Junta General Ordinaria de Residencial Peñarrubia para el 25 de octubre a las 18:30h en el local social de la comunidad."
  },
  {
    id: "notif-seed-3",
    ownerId: "own-seed-1",
    title: "Confirmación de domiciliación bancaria",
    type: "success",
    date: "05/10/2026, 12:15",
    timestamp: Date.now() - 86400000 * 7,
    read: true,
    message: "Se ha confirmado la domiciliación bancaria para el cobro de las cuotas de comunidad en la cuenta CaixaBank (ES66 2100 0418 4502 0005 4321)."
  }
];

export function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM communities").get().total;
  if (count > 0) return false;

  const insertCommunity = db.prepare(
    `INSERT INTO communities (id, name, nif, phone, otherPhone, address, city, province, postalCode, email, notes, documents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`
  );
  const insertOwner = db.prepare(
    `INSERT INTO owners (id, name, surname, documentType, dni, isMember, communityId, communityName, plot,
       propertyId, propertyIds, phone, otherPhone, email, phoneVerified, phoneVerifiedAt, emailVerified, emailVerifiedAt,
       address, province, city, postalCode, iban, currency, notes, propertyType, cadastralRef, registryNumber,
       floor, door, areaM2, participationCoef, propertyUse, documents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, ?, 1, '2026-10-12T17:00:00.000Z', 1, '2026-10-12T17:00:00.000Z',
       ?, ?, ?, ?, ?, 'EUR', ?, '', '', '', '', '', '', '', '', '{}')`
  );
  const insertProperty = db.prepare(
    `INSERT INTO properties (id, communityId, communityName, ownerIds, tenantIds, propertyType, plot, address, cadastralRef,
       registryNumber, floor, door, areaM2, participationCoef, propertyUse, receiptStatus, notes, postalCode, city, province)
     VALUES (?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, ?)`
  );
  const insertTenant = db.prepare(
    `INSERT INTO tenants (id, ownerId, propertyId, name, surname, documentType, documentId,
       contractType, monthlyRent, deposit, emergencyPhone, phone, email,
       contractStart, contractEnd, authorizations, authorizationNotes)
     VALUES (?, '', ?, ?, ?, 'DNI', ?, 'vivienda_habitual', '', '', '', ?, ?, ?, ?, ?, ?)`
  );
  const insertAdminEmail = db.prepare(
    `INSERT INTO admin_emails (id, ownerId, ownerName, ownerDni, ownerCommunity, ownerPlot, subject, date, timestamp, read, docs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOwnerNotification = db.prepare(
    `INSERT INTO owner_notifications (id, ownerId, title, type, message, date, timestamp, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");
  try {
    communitySeeds.forEach(c => {
      insertCommunity.run(c.id, c.name, c.nif, c.phone, c.otherPhone, c.address, c.city, c.province, c.postalCode, c.email, c.notes);
    });

    propertySeeds.forEach(p => {
      const comm = communitySeeds.find(c => c.id === p.communityId);
      insertProperty.run(p.id, p.communityId, p.communityName, p.propertyType, p.plot, p.address, p.cadastralRef,
        p.registryNumber, p.floor, p.door, p.areaM2, p.participationCoef, p.propertyUse,
        p.notes || "", p.postalCode || comm?.postalCode || "", p.city || comm?.city || "", p.province || comm?.province || "");
    });

    ownerSeeds.forEach(o => {
      insertOwner.run(
        o.id, o.name, o.surname, "DNI", o.dni, o.isMember ? 1 : 0,
        o.communityId, o.communityName, o.plot, o.phone, o.otherPhone, o.email,
        o.address, o.province, o.city, o.postalCode, o.iban, o.notes
      );
      if (o.documents) {
        db.prepare("UPDATE owners SET documents = ? WHERE id = ?").run(JSON.stringify(o.documents), o.id);
      }
    });

    tenantSeeds.forEach(t => {
      insertTenant.run(t.id, t.propertyId, t.name, t.surname, t.documentId, t.phone, t.email,
        t.contractStart, t.contractEnd, JSON.stringify(t.authorizations), t.authorizationNotes);
    });

    adminEmailSeeds.forEach(e => {
      insertAdminEmail.run(e.id, e.ownerId, e.ownerName, e.ownerDni, e.ownerCommunity, e.ownerPlot, e.subject, e.date, e.timestamp, e.read ? 1 : 0, JSON.stringify(e.docs));
    });

    ownerNotificationSeeds.forEach(n => {
      insertOwnerNotification.run(n.id, n.ownerId, n.title, n.type, n.message, n.date, n.timestamp, n.read ? 1 : 0);
    });

    // Los roles y usuarios base ya se inicializaron en db.js.
    db.prepare("INSERT OR IGNORE INTO settings (id, data) VALUES ('general', ?)").run(JSON.stringify({
      nombreAsociacion: "Asociación Peñarrubia",
      emailContacto: "admin@penarrubia.es",
      telefonoContacto: "600000000",
      otpExpiraMinutos: 10,
      otpReenvioSegundos: 60,
      notificacionesEmail: true
    }));

    // Relaciones propietario ↔ inmueble (N:M): por plot dentro de la comunidad.
    // Los propietarios sembrados son titulares únicos (100%).
    const updatePropertyOwners = db.prepare("UPDATE properties SET ownerIds = ?, ownerPercentages = ? WHERE id = ?");
    propertySeeds.forEach(p => {
      const matched = ownerSeeds.filter(o => o.communityId === p.communityId && o.plot === p.plot).map(o => o.id);
      if (matched.length > 0) {
        updatePropertyOwners.run(JSON.stringify(matched), JSON.stringify(Object.fromEntries(matched.map(id => [id, 100]))), p.id);
      }
    });

    // Inmueble principal de cada propietario a partir del catálogo
    const updateOwnerMainProperty = db.prepare("UPDATE owners SET propertyId = ? WHERE id = ?");
    ownerSeeds.forEach(o => {
      const propertyId = PLOT_TO_PROPERTY_ID[o.plot];
      if (propertyId) updateOwnerMainProperty.run(propertyId, o.id);
    });

    rebuildOwnersPropertyIds();

    // El propietario del inquilino se deriva del dueño del inmueble vinculado
    db.prepare(
      "UPDATE tenants SET ownerId = COALESCE((SELECT json_extract(ownerIds, '$[0]') FROM properties WHERE id = tenants.propertyId), '')"
    ).run();

    tenantSeeds.forEach(t => syncPropertyTenantReferences(t.id));

    ensureDemoProfiles();
    // Repetir tras crear comunidades: asigna adminUserId de la comunidad demo.
    ensureDemoProfiles();

    db.exec("COMMIT");
    console.log(`[seed] Base de datos inicializada con datos de demo (${communitySeeds.length} comunidades, ${ownerSeeds.length} propietarios, ${propertySeeds.length} inmuebles, ${tenantSeeds.length} inquilinos).`);
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Publicaciones de demostración para explorar Comunicación: avisos, eventos,
// reuniones y consultas en distintos tipos, estados y prioridades.
// No se ejecuta con NODE_ENV=test (los tests traen sus propios escenarios).
export function seedCommunicationsDemo() {
  if (process.env.NODE_ENV === "test") return false;
  if (db.prepare("SELECT COUNT(*) AS total FROM communication_posts").get().total > 0) return false;
  const data = {
    communities: listCommunities(),
    owners: listOwners(),
    properties: listProperties(),
    tenants: listTenants(),
    roles: listRoles(),
  };
  if (!data.communities.some(c => c.id === "com-seed-1")) return false;

  const HORA = 3600000;
  const DIA = 24 * HORA;
  const ahora = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const base = {
    communityId: "com-seed-1",
    audience: { mode: "all", ownerIds: [], tenantIds: [], propertyIds: [] },
    channels: [],
    pinned: false,
    commentsEnabled: true,
    receiptRequired: false,
    priority: "normal",
    status: "published",
    reminderMinutes: 0,
  };

  const definiciones = [
    { ...base, type: "notice", priority: "urgent", pinned: true, publishAt: iso(ahora - 2 * HORA),
      title: "Fuga de agua en el garaje: corte preventivo del suministro",
      body: "Detectamos una fuga en la bajante del garaje. Fontanero 24 h cortó el suministro de la zona a las 8:30. Previsión de reparación hoy mismo. Pedimos disculpas por las molestias." },
    { ...base, type: "notice", publishAt: iso(ahora - 10 * DIA), receiptRequired: true, channels: ["email"],
      title: "Corte de agua programado el jueves de 9 a 13 h",
      body: "Por trabajos de mantenimiento de la red municipal, no habrá agua en todo el edificio el jueves de 9:00 a 13:00. Cerrá las llaves de paso antes de salir." },
    { ...base, type: "notice", publishAt: iso(ahora - 3 * DIA),
      title: "Nueva normativa de reciclaje y horarios de basura",
      body: "A partir del lunes: orgánico lunes, miércoles y viernes a partir de las 20:00; envases martes y jueves; vidrio al contenedor del portal B cuando quieras. Bolsas cerradas siempre." },
    { ...base, type: "notice", publishAt: iso(ahora - 40 * DIA), archiveAt: iso(ahora - 5 * DIA),
      title: "Resultados de las Olimpiadas Deportivas 2026",
      body: "Ya están los resultados y las fotos de las Olimpiadas. Ganó el equipo de la escalera B por segundo año consecutivo. ¡Gracias a los 46 participantes!" },
    { ...base, type: "notice", status: "cancelled", publishAt: iso(ahora - 1 * DIA),
      title: "Quedada en el parque cancelada por lluvia",
      body: "Por el pronóstico de lluvia del sábado, cancelamos la quedada del parque. La reprogramaremos cuando mejore el tiempo." },
    { ...base, type: "notice", status: "published", publishAt: iso(ahora + 1 * DIA),
      title: "Mantenimiento de ascensores la próxima semana",
      body: "El martes y el miércoles el ascensor principal estará fuera de servicio de 9:00 a 12:00 por revisión semestral. Usen el ascensor secundario." },
    { ...base, type: "notice", status: "draft", priority: "important", commentsEnabled: false,
      title: "Comunicado: reforma de la azotea (borrador)",
      body: "Borrador del comunicado sobre la impermeabilización de la azotea: presupuesto de tres empresas, plazos y realojo de los tendales. Falta aprobarlo en junta." },
    { ...base, type: "event", publishAt: iso(ahora - 2 * DIA), startsAt: iso(ahora + 5 * DIA + 10 * HORA), endsAt: iso(ahora + 5 * DIA + 13 * HORA), reminderMinutes: 1440,
      title: "Torneo de pádel entre vecinos",
      body: "Inscripciones abiertas para el torneo de pádel (parejas mixtas, nivel libre). Pista del club de al lado, 16:00. Inscribite hasta el jueves respondiendo a este aviso." },
    { ...base, type: "event", publishAt: iso(ahora - 16 * DIA), startsAt: iso(ahora - 14 * DIA + 21 * HORA), endsAt: iso(ahora - 14 * DIA + 23 * HORA + 30 * 60000),
      title: "Cine en el patio: noche de verano",
      body: "Proyección al aire libre de una clásico del cine español. Traé silla plegable y algo rico para compartir." },
    { ...base, type: "event", publishAt: iso(ahora - 4 * DIA), startsAt: iso(ahora + 10 * DIA + 9 * HORA), endsAt: iso(ahora + 10 * DIA + 10 * HORA), receiptRequired: true, reminderMinutes: 30,
      title: "Clases de yoga gratuitas en el jardín",
      body: "Profesora voluntaria del edificio da clase de hatha yoga para principiantes. Traé toalla y ropa cómoda. Confirmá asistencia (botón de confirmación)." },
    { ...base, communityId: "com-seed-2", type: "event", publishAt: iso(ahora - 6 * DIA), startsAt: iso(ahora + 12 * DIA + 11 * HORA), endsAt: iso(ahora + 12 * DIA + 15 * HORA),
      title: "Mercado solidario de segunda mano",
      body: "Traé lo que ya no uses y llevate lo que te guste. Lo recaudado va para la reforma del jardín de infancia del barrio." },
    { ...base, type: "meeting", publishAt: iso(ahora - 7 * DIA), startsAt: iso(ahora + 20 * DIA + 18 * HORA), endsAt: iso(ahora + 20 * DIA + 19 * HORA + 30 * 60000), receiptRequired: true, reminderMinutes: 60,
      title: "Junta general de propietarios — 2.º trimestre",
      body: "Convocatoria de la junta general. Si no podés asistir, delegá tu voto respondiendo a este aviso.",
      meeting: { location: "Salón social del edificio", url: "", agenda: "1. Lectura y aprobación del acta anterior.\n2. Cuentas del ejercicio y presupuesto del próximo.\n3. Contratación del nuevo jardinero.\n4. Ruegos y preguntas.",
        tasks: [ { title: "Preparar acta y lista de asistencia", responsible: "Administración", dueAt: iso(ahora + 21 * DIA), done: false }, { title: "Reservar el salón y sillas extra", responsible: "Carlos Ruiz", dueAt: iso(ahora + 15 * DIA), done: true } ] } },
    { ...base, type: "meeting", publishAt: iso(ahora - 18 * DIA), startsAt: iso(ahora - 14 * DIA + 18 * HORA), endsAt: iso(ahora - 14 * DIA + 19 * HORA + 30 * 60000),
      title: "Reunión informativa de mayo",
      body: "Reunión para contar el estado de las cuentas y las obras pendientes de la comunidad.",
      meeting: { location: "Salón social del edificio", url: "", agenda: "1. Estado de las cuentas.\n2. Obras pendientes: azotea y portero automático.",
        tasks: [ { title: "Pedir tres presupuestos del fontanero", responsible: "Administración", dueAt: iso(ahora - 10 * DIA), done: true } ] } },
    { ...base, type: "notice", publishAt: iso(ahora - 2 * DIA),
      title: "¿Renovamos el contrato de la empresa de jardinería?",
      body: "El contrato de jardinería vence el mes próximo. Votá para que la junta tenga mandato claro en la negociación.",
      poll: { type: "vote", question: "¿Renovamos el contrato de la empresa de jardinería por un año más?", options: ["Sí, renovar", "No, buscar otra empresa", "Abstenerse"], electorate: "owners", multiple: false, resultsLive: true, closesAt: iso(ahora + 7 * DIA), closed: false } },
    { ...base, type: "notice", publishAt: iso(ahora - 5 * DIA), channels: ["email"],
      title: "Encuesta: ¿qué actividades querés en el centro social?",
      body: "El centro social reabre el mes próximo y queremos programarlo con ustedes. Elegí las actividades que te interesan (podés marcar varias).",
      poll: { type: "survey", question: "¿Qué actividades te gustaría en el centro social?", options: ["Yoga", "Pilates", "Taller de ajedrez", "Cine-forum"], electorate: "recipients", multiple: true, resultsLive: true, closesAt: iso(ahora + 14 * DIA), closed: false } },
  ];

  const insert = db.prepare("INSERT INTO communication_posts(id,communityId,data,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)");
  const ids = {};
  db.exec("BEGIN");
  try {
    for (const def of definiciones) {
      const p = validatePost(def, null, data);
      const id = crypto.randomUUID();
      const creado = p.publishAt < new Date(ahora - 60 * DIA).toISOString() ? p.publishAt : new Date(Math.min(Date.parse(p.publishAt), ahora - 3600000)).toISOString();
      insert.run(id, p.communityId, JSON.stringify(p), "user-admin", creado, creado);
      ids[def.title] = id;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  materialize();

  // Interacciones de demostración: votos, comentarios y confirmaciones.
  const destinatarios = titulo =>
    db.prepare("SELECT userId FROM communication_recipients WHERE postId=?").all(ids[titulo]).map(r => r.userId);
  const insertBola = db.prepare("INSERT OR IGNORE INTO communication_ballots VALUES (?,?,?,?)");
  const votos = {
    [definiciones[13].title]: [[0], [1], [2]],
    [definiciones[14].title]: [[0, 2], [1], [0], [3]],
  };
  for (const [titulo, lista] of Object.entries(votos)) {
    const usuarios = destinatarios(titulo);
    lista.forEach((choices, i) => {
      const userId = usuarios[i % Math.max(usuarios.length, 1)];
      if (userId) insertBola.run(ids[titulo], userId, JSON.stringify(choices), new Date(ahora - 1 * DIA).toISOString());
    });
  }

  const insertComentario = db.prepare("INSERT INTO communication_comments VALUES (?,?,?,?,?,0)");
  insertComentario.run(crypto.randomUUID(), ids["Fuga de agua en el garaje: corte preventivo del suministro"], "user-admin", "Ya está cortado el agua. Aviso cuando se restablezca.", new Date(ahora - 1 * HORA).toISOString());
  insertComentario.run(crypto.randomUUID(), ids["Torneo de pádel entre vecinos"], "user-admin", "Apúntame con mi pareja. Nivel: moderado.", new Date(ahora - 1 * DIA).toISOString());

  const rsvps = [
    ["Junta general de propietarios — 2.º trimestre", "yes", "maybe"],
    ["Reunión informativa de mayo", "yes", "no"],
  ];
  for (const [titulo, primero, segundo] of rsvps) {
    const usuarios = destinatarios(titulo);
    if (usuarios[0]) db.prepare("UPDATE communication_recipients SET rsvp=? WHERE postId=? AND userId=?").run(primero, ids[titulo], usuarios[0]);
    if (usuarios[1]) db.prepare("UPDATE communication_recipients SET rsvp=? WHERE postId=? AND userId=?").run(segundo, ids[titulo], usuarios[1]);
  }
  const reunionPasada = destinatarios("Reunión informativa de mayo");
  if (reunionPasada[0]) db.prepare("UPDATE communication_recipients SET attended=1 WHERE postId=? AND userId=?").run(ids["Reunión informativa de mayo"], reunionPasada[0]);

  console.log(`[seed] Comunicaciones de demostración cargadas (${definiciones.length} publicaciones).`);
  return true;
}

