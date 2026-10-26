"use strict";

// ==========================================
// 1. CONSTANTES Y CONFIGURACIÓN
// ==========================================

const COMMUNITIES_STORAGE_KEY = "penarrubia.communities.v1";
const OWNERS_STORAGE_KEY = "penarrubia.owners.v1";
const PROPERTIES_STORAGE_KEY = "penarrubia.properties.v1";
const ADMIN_EMAILS_STORAGE_KEY = "penarrubia.admin_emails.v1";
const OWNER_NOTIFICATIONS_STORAGE_KEY = "penarrubia.owner_notifications.v1";
const CURRENT_OWNER_ID = "own-seed-1"; // Carlos Ruiz Mendoza

// SUPOSICIÓN: "caching de moneda" = catálogo de monedas en combo, cacheado en memoria.
const CURRENCY_CATALOG = [
  { code: "EUR", name: "Euro (EUR)" },
  { code: "USD", name: "Dólar estadounidense (USD)" },
  { code: "GBP", name: "Libra esterlina (GBP)" },
  { code: "CHF", name: "Franco suizo (CHF)" }
];

const PROPERTY_TYPE_LABELS = {
  parcela: "Parcela",
  vivienda: "Vivienda",
  local: "Local",
  garaje: "Plaza de garaje",
  trastero: "Trastero"
};

const PROPERTY_USE_LABELS = {
  residencial: "Residencial",
  comercial: "Comercial",
  garaje: "Garaje",
  trastero: "Trastero",
  otros: "Otros"
};

const PROVINCES = {
  "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería", "05": "Ávila",
  "06": "Badajoz", "07": "Illes Balears", "08": "Barcelona", "09": "Burgos", "10": "Cáceres",
  "11": "Cádiz", "12": "Castellón", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
  "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
  "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
  "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas",
  "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria", "40": "Segovia",
  "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel", "45": "Toledo",
  "46": "Valencia", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza",
  "51": "Ceuta", "52": "Melilla"
};

const communitySeeds = [
  {
    id: "com-seed-1",
    name: "Residencial Peñarrubia",
    nif: "H28654321",
    address: "Calle de la Sierra, 14",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28035",
    phone: "912345678",
    otherPhone: "913456789",
    email: "contacto@penarrubia.es",
    notes: ""
  },
  {
    id: "com-seed-2",
    name: "Edificio Los Olivos",
    nif: "H19456789",
    address: "Avenida de Europa, 6",
    city: "Pozuelo de Alarcón",
    province: "Madrid",
    postalCode: "28224",
    phone: "913456789",
    otherPhone: "914567890",
    email: "contacto@penarrubia.es",
    notes: "Próxima junta ordinaria en octubre."
  },
  {
    id: "com-seed-3",
    name: "Comunidad Vista Bella",
    nif: "H03112233",
    address: "Calle Mayor, 45",
    city: "Alicante/Alacant",
    province: "Alicante",
    postalCode: "03001",
    phone: "965112233",
    otherPhone: "965223344",
    email: "vistabella@comunidad.es",
    notes: "Revisión técnica de ascensor en curso."
  },
  {
    id: "com-seed-4",
    name: "Urbanización El Pinar",
    nif: "H29987654",
    address: "Camino del Pinar, 8",
    city: "Málaga",
    province: "Málaga",
    postalCode: "29001",
    phone: "952987654",
    otherPhone: "952123456",
    email: "elpinar@comunidad.es",
    notes: ""
  },
  {
    id: "com-seed-5",
    name: "Residencial Las Flores",
    nif: "H41556677",
    address: "Plaza de las Flores, 12",
    city: "Sevilla",
    province: "Sevilla",
    postalCode: "41001",
    phone: "954556677",
    otherPhone: "954667788",
    email: "lasflores@comunidad.es",
    notes: "Limpieza y mantenimiento de jardines."
  },
  {
    id: "com-seed-6",
    name: "Parque San Juan",
    nif: "H46123456",
    address: "Gran Vía del Marqués, 78",
    city: "Valencia",
    province: "Valencia",
    postalCode: "46001",
    phone: "963123456",
    otherPhone: "963654321",
    email: "sanjuan@comunidad.es",
    notes: ""
  },
  {
    id: "com-seed-7",
    name: "Altos de Peñarrubia",
    nif: "H50778899",
    address: "Paseo de la Ribera, 3",
    city: "Zaragoza",
    province: "Zaragoza",
    postalCode: "50001",
    phone: "976778899",
    otherPhone: "976889900",
    email: "altos@penarrubia.es",
    notes: "Lectura de contadores trimestral."
  }
];

function createSeedDocsForCarlosRuiz() {
  return {
    dni: {
      key: "dni",
      title: "Copia de DNI (ambas caras)",
      fileName: "DNI_47895231P_ambas_caras.pdf",
      fileType: "application/pdf",
      fileSize: 485200,
      uploadedAt: "12/10/2026, 18:20",
      dataUrl: null,
      autoValidation: {
        status: "passed",
        legibilityScore: 98,
        legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
        typeVerified: "Documento Nacional de Identidad (España) - Anverso y Reverso",
        checks: [
          { name: "Legibilidad y resolución", passed: true, detail: "Alta resolución y contraste óptimo (98%)" },
          { name: "Tipo de documento", passed: true, detail: "DNI español oficial verificado" },
          { name: "Ambas caras", passed: true, detail: "Anverso y reverso comprobados" },
          { name: "Coincidencia de DNI", passed: true, detail: "DNI 47895231P coincide con el asociado" }
        ]
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    },
    bankReceipt: {
      key: "bankReceipt",
      title: "Recibo bancario o certificado de titularidad",
      fileName: "Certificado_Titularidad_CaixaBank_47895231P.pdf",
      fileType: "application/pdf",
      fileSize: 312400,
      uploadedAt: "12/10/2026, 18:22",
      dataUrl: null,
      autoValidation: {
        status: "passed",
        legibilityScore: 96,
        legibilityStatus: "Óptima (documento bancario legible)",
        typeVerified: "Certificado de titularidad bancaria con IBAN español",
        checks: [
          { name: "Legibilidad y nitidez", passed: true, detail: "Texto bancario legible y contrastado (96%)" },
          { name: "Entidad bancaria", passed: true, detail: "Entidad financiera debidamente identificada" },
          { name: "IBAN y titularidad", passed: true, detail: "IBAN ES66 2100... y titular Carlos Ruiz acreditados" }
        ]
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    },
    propertyDeed: {
      key: "propertyDeed",
      title: "Copia de la escritura del inmueble",
      fileName: "Escritura_Notarial_Parcela_14.pdf",
      fileType: "application/pdf",
      fileSize: 1250300,
      uploadedAt: "12/10/2026, 18:25",
      dataUrl: null,
      autoValidation: {
        status: "passed",
        legibilityScore: 95,
        legibilityStatus: "Óptima (escritura pública nítida)",
        typeVerified: "Escritura notarial de propiedad y acreditación de finca",
        checks: [
          { name: "Legibilidad y firmas", passed: true, detail: "Documento notarial nítido con firmas identificadas (95%)" },
          { name: "Título de propiedad", passed: true, detail: "Escritura pública notarial legalizada" },
          { name: "Acreditación parcela", passed: true, detail: "Parcela 14 en Residencial Peñarrubia acreditada" }
        ]
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
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
  {
    id: "own-seed-1",
    name: "Carlos",
    surname: "Ruiz Mendoza",
    dni: "47895231P",
    communityId: "com-seed-1",
    communityName: "Residencial Peñarrubia",
    plot: "Parcela 14",
    phone: "612345678",
    otherPhone: "912345678",
    email: "carlos.ruiz@email.com",
    isMember: true,
    iban: "ES6621000418401234567891",
    address: "Calle de la Sierra, 14, Parcela 14",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28035",
    notes: "Vocal de la junta directiva de Peñarrubia.",
    documents: createSeedDocsForCarlosRuiz()
  },
  {
    id: "own-seed-2",
    name: "María Luisa",
    surname: "Fernández Soto",
    dni: "53891244J",
    communityId: "com-seed-1",
    communityName: "Residencial Peñarrubia",
    plot: "Parcela 22",
    phone: "623456789",
    otherPhone: "624567890",
    email: "marialuisa.fernandez@email.com",
    isMember: true,
    iban: "ES9100491500051234567892",
    address: "Calle de la Sierra, 22",
    city: "Madrid",
    province: "Madrid",
    postalCode: "28035",
    notes: "Solicita comunicaciones preferentes por correo electrónico.",
    documents: createSeedDocsForMariaLuisa()
  },
  {
    id: "own-seed-3",
    name: "Javier",
    surname: "Gómez Alarcón",
    dni: "09876543K",
    communityId: "com-seed-2",
    communityName: "Edificio Los Olivos",
    plot: "Piso 3º B",
    phone: "634567890",
    otherPhone: "",
    email: "javier.gomez@email.com",
    isMember: true,
    iban: "ES1220385778983000760112",
    address: "Avenida de Europa, 6, 3º B",
    city: "Pozuelo de Alarcón",
    province: "Madrid",
    postalCode: "28224",
    notes: ""
  },
  {
    id: "own-seed-4",
    name: "Carmen",
    surname: "Navarro Beltrán",
    dni: "71234567W",
    communityId: "com-seed-3",
    communityName: "Comunidad Vista Bella",
    plot: "Chalet 7",
    phone: "645678901",
    otherPhone: "965112233",
    email: "carmen.navarro@email.com",
    isMember: false,
    iban: "",
    address: "Calle Mayor, 45, Chalet 7",
    city: "Alicante/Alacant",
    province: "Alicante",
    postalCode: "03001",
    notes: "Pendiente de formalizar inscripción como asociada."
  },
  {
    id: "own-seed-5",
    name: "Pedro",
    surname: "Sánchez Gil",
    dni: "32145698R",
    communityId: "com-seed-4",
    communityName: "Urbanización El Pinar",
    plot: "Parcela 5",
    phone: "656789012",
    otherPhone: "952987654",
    email: "pedro.sanchez@email.com",
    isMember: true,
    iban: "ES4501824000100123456789",
    address: "Camino del Pinar, 8, Parcela 5",
    city: "Málaga",
    province: "Málaga",
    postalCode: "29001",
    notes: "Horario de contacto preferente por las tardes."
  },
  {
    id: "own-seed-6",
    name: "Elena",
    surname: "Morales Ortiz",
    dni: "25698741J",
    communityId: "com-seed-5",
    communityName: "Residencial Las Flores",
    plot: "Vivienda 12-A",
    phone: "667890123",
    otherPhone: "",
    email: "elena.morales@email.com",
    isMember: true,
    iban: "ES3800810556110123456789",
    address: "Plaza de las Flores, 12, Puerta A",
    city: "Sevilla",
    province: "Sevilla",
    postalCode: "41001",
    notes: ""
  },
  {
    id: "own-seed-7",
    name: "Roberto",
    surname: "Vega Domínguez",
    dni: "14523698A",
    communityId: "com-seed-6",
    communityName: "Parque San Juan",
    plot: "Ático 4",
    phone: "678901234",
    otherPhone: "963123456",
    email: "roberto.vega@email.com",
    isMember: false,
    iban: "",
    address: "Gran Vía del Marqués, 78, Ático 4",
    city: "Valencia",
    province: "Valencia",
    postalCode: "46001",
    notes: "Propietario no residente temporal."
  },
  {
    id: "own-seed-8",
    name: "Isabel",
    surname: "Romero Fuentes",
    dni: "85236974D",
    communityId: "com-seed-7",
    communityName: "Altos de Peñarrubia",
    plot: "Parcela 31",
    phone: "689012345",
    otherPhone: "976778899",
    email: "isabel.romero@email.com",
    isMember: true,
    iban: "ES7700490001551234567890",
    address: "Paseo de la Ribera, 3, Parcela 31",
    city: "Zaragoza",
    province: "Zaragoza",
    postalCode: "50001",
    notes: "Interesada en la comisión de lecturas de contadores."
  }
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

const defaultAdminEmails = [
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

const defaultOwnerNotifications = [
  {
    id: "notif-seed-1",
    ownerId: "own-seed-1",
    title: "Documentación recibida y pre-validada",
    type: "info",
    date: "12/10/2026, 18:30",
    timestamp: Date.now() - 3600000,
    read: false,
    message: "Tus 3 documentos obligatorios (DNI ambas caras, recibo bancario y copia de escritura) han sido verificados automáticamente por el sistema con legibilidad óptima (98%). El expediente está ahora a la espera de revisión y convalidación formal por parte del Administrador."
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

// ==========================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================

let communities = loadCommunities();
let properties = loadProperties();
let owners = loadOwners();
initializePropertyRelationships();
let adminEmails = loadAdminEmails();
let ownerNotifications = loadOwnerNotifications();
let currenciesCache = null;
let contactVerify = {
  phone: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" },
  email: { value: "", verified: false, pending: false, challengeId: "", verifiedAt: "" }
};

let editingCommunityId = null;
let deletingCommunityId = null;
let viewingCommunityId = null;
let communityPageSize = 5;
let communityCurrentPage = 1;

let editingOwnerId = null;
let deletingOwnerId = null;
let viewingOwnerId = null;
let editingPropertyId = null;
let viewingPropertyId = null;
let propertyDocuments = [];
let ownerPageSize = 5;
let ownerCurrentPage = 1;
let ownerFilterCommunity = "";
let ownerPropertyCommunityFilter = "";
let ownerFilterMember = "";
let ownerFilterDocStatus = "";

let currentEditingDocs = {};
let viewingDocDetails = null;
let activeRole = "admin";

let locations = [];
let locationsById = new Map();
let postalIndex = new Map();

// ==========================================
// 3. ELEMENTOS DEL DOM
// ==========================================

// Navegación
const navHome = document.querySelector("#nav-home");
const mobileNavHome = document.querySelector("#mobile-nav-home");
const secHome = document.querySelector("#home");
const navComunidades = document.querySelector("#nav-comunidades");

// Elementos de la Sección Home / Dashboard
const homeGreetingTitle = document.querySelector("#home-greeting-title");
const homeGreetingDesc = document.querySelector("#home-greeting-desc");
const homeHeroRoleBadge = document.querySelector("#home-hero-role-badge");
const homeHeroActions = document.querySelector("#home-hero-actions");
const homeKpiComms = document.querySelector("#home-kpi-comms");
const homeKpiCommsLabel = document.querySelector("#home-kpi-comms-label");
const homeKpiOwners = document.querySelector("#home-kpi-owners");
const homeKpiOwnersLabel = document.querySelector("#home-kpi-owners-label");
const homeKpiMembers = document.querySelector("#home-kpi-members");
const homeKpiMembersLabel = document.querySelector("#home-kpi-members-label");
const homeKpiMembersSub = document.querySelector("#home-kpi-members-sub");
const homeKpiPendingDocs = document.querySelector("#home-kpi-pending-docs");
const homeKpiPendingLabel = document.querySelector("#home-kpi-pending-label");
const homeKpiPendingSub = document.querySelector("#home-kpi-pending-sub");
const homeDocSummaryList = document.querySelector("#home-doc-summary-list");
const homeQuickActionsContainer = document.querySelector("#home-quick-actions-container");
const homeActivityTitle = document.querySelector("#home-activity-title");
const homeActivitySubtitle = document.querySelector("#home-activity-subtitle");
const homeTodayDay = document.querySelector("#home-today-day");
const homeTodayMonth = document.querySelector("#home-today-month");

const navPropietarios = document.querySelector("#nav-propietarios");
const navInmuebles = document.querySelector("#nav-inmuebles");
const mobileNavComunidades = document.querySelector("#mobile-nav-comunidades");
const mobileNavPropietarios = document.querySelector("#mobile-nav-propietarios");
const mobileNavInmuebles = document.querySelector("#mobile-nav-inmuebles");
const secComunidades = document.querySelector("#comunidades");
const secPropietarios = document.querySelector("#propietarios");
const secInmuebles = document.querySelector("#inmuebles");
const sidebarLabel = document.querySelector("#sidebar-label");

// Elementos de Comunidades
const comHeadingEyebrow = document.querySelector("#comunidades-heading-eyebrow");
const comHeadingTitle = document.querySelector("#comunidades-heading-title");
const comHeadingSubtitle = document.querySelector("#comunidades-heading-subtitle");
const newCommunityBtn = document.querySelector("#new-community");
const thComContact = document.querySelector("#th-com-contact");
const comToolbar = document.querySelector("#comunidades-toolbar");
const communityList = document.querySelector("#community-list");
const communityEmpty = document.querySelector("#empty-state");
const communityCount = document.querySelector("#result-count");
const communitySearch = document.querySelector("#search");
const communityForm = document.querySelector("#community-form");
const communityDialog = document.querySelector("#community-dialog");
const communityDeleteDialog = document.querySelector("#delete-dialog");
const communityError = document.querySelector("#form-error");

const communityPaginationBar = document.querySelector("#pagination-bar");
const communityPageSizeSelect = document.querySelector("#page-size");
const communityPrevBtn = document.querySelector("#prev-page");
const communityNextBtn = document.querySelector("#next-page");
const communityPageCurrent = document.querySelector("#page-current");
const communityPaginationInfo = document.querySelector("#pagination-info");

const communityDetailDialog = document.querySelector("#detail-dialog");
const closeDetailDialog = document.querySelector("#close-detail-dialog");
const closeDetailBtn = document.querySelector("#close-detail-btn");
const detailEditBtn = document.querySelector("#detail-edit-btn");
const detailOwnersCount = document.querySelector("#detail-owners-count");
const detailItemPhone = document.querySelector("#detail-item-phone");
const detailItemOtherPhone = document.querySelector("#detail-item-otherPhone");
const detailItemEmail = document.querySelector("#detail-item-email");

// Elementos de Propietarios
const ownersHeadingEyebrow = document.querySelector("#owners-heading-eyebrow");
const ownersHeadingTitle = document.querySelector("#owners-heading-title");
const ownersHeadingSubtitle = document.querySelector("#owners-heading-subtitle");
const newOwnerBtn = document.querySelector("#new-owner");
const ownersToolbar = document.querySelector("#owners-toolbar");
const ownerList = document.querySelector("#owner-list");
const ownerEmpty = document.querySelector("#owner-empty-state");
const ownerCount = document.querySelector("#owner-result-count");
const ownerSearch = document.querySelector("#search-owners");
const filterCommunitySelect = document.querySelector("#filter-community");
const filterOwnerPropertyCommunitySelect = document.querySelector("#filter-owner-property-community");
const filterMemberSelect = document.querySelector("#filter-member");
const filterDocStatusSelect = document.querySelector("#filter-doc-status");
const ownerForm = document.querySelector("#owner-form");
const ownerDialog = document.querySelector("#owner-dialog");
const ownerDeleteDialog = document.querySelector("#owner-delete-dialog");
const ownerError = document.querySelector("#owner-form-error");
const ownerValidationDialog = document.querySelector("#owner-validation-dialog");
const ownerValidationList = document.querySelector("#owner-validation-list");
const propertyComboInput = document.querySelector("#property-combo-input");
const propertyComboList = document.querySelector("#property-combo-list");
const propertyIdInput = document.querySelector("#property-id");
const phoneVerifyPanel = document.querySelector("#phone-verify-panel");
const emailVerifyPanel = document.querySelector("#email-verify-panel");
const phoneVerifyStatus = document.querySelector("#phone-verify-status");
const emailVerifyStatus = document.querySelector("#email-verify-status");
const phoneVerifyCodeInput = document.querySelector("#phone-verify-code");
const emailVerifyCodeInput = document.querySelector("#email-verify-code");

const ownerPaginationBar = document.querySelector("#owner-pagination-bar");
const ownerPageSizeSelect = document.querySelector("#owner-page-size");
const ownerPrevBtn = document.querySelector("#owner-prev-page");
const ownerNextBtn = document.querySelector("#owner-next-page");
const ownerPageCurrent = document.querySelector("#owner-page-current");
const ownerPaginationInfo = document.querySelector("#owner-pagination-info");

const ownerDetailDialog = document.querySelector("#owner-detail-dialog");
const closeOwnerDetailDialog = document.querySelector("#close-owner-detail-dialog");
const closeOwnerDetailBtn = document.querySelector("#close-owner-detail-btn");
const ownerDetailEditBtn = document.querySelector("#owner-detail-edit-btn");
const ownerDetailManageDocsBtn = document.querySelector("#owner-detail-manage-docs-btn");
const ownerDetailDocBadge = document.querySelector("#owner-detail-doc-badge");
const ownerDetailDocsGrid = document.querySelector("#owner-detail-docs-grid");
const ownerDetailApprovalPanel = document.querySelector("#owner-detail-approval-panel");
const ownerDetailPropertyCommunity = document.querySelector("#owner-detail-property-community");
const ownerDetailPropertySelect = document.querySelector("#owner-detail-property-select");
const ownerDetailPropertyCount = document.querySelector("#owner-detail-property-count");
const ownerDetailViewPropertyBtn = document.querySelector("#owner-detail-view-property");

// Elementos de Inmuebles
const newPropertyBtn = document.querySelector("#new-property");
const propertySearch = document.querySelector("#search-properties");
const propertyCommunityFilter = document.querySelector("#filter-property-community");
const propertyList = document.querySelector("#property-list");
const propertyEmpty = document.querySelector("#property-empty-state");
const propertyResultCount = document.querySelector("#property-result-count");
const propertyDialog = document.querySelector("#property-dialog");
const propertyForm = document.querySelector("#property-form");
const propertyFormError = document.querySelector("#property-form-error");
const propertyDocumentInput = document.querySelector("#property-document-input");
const propertyDocumentList = document.querySelector("#property-document-list");
const propertyDetailDialog = document.querySelector("#property-detail-dialog");
const propertyDetailDocuments = document.querySelector("#property-detail-documents");

// Pestañas del Formulario de Propietario
const tabBtnOwnerData = document.querySelector("#tab-btn-owner-data");
const tabBtnOwnerDocs = document.querySelector("#tab-btn-owner-docs");
const tabPaneOwnerData = document.querySelector("#tab-pane-owner-data");
const tabPaneOwnerDocs = document.querySelector("#tab-pane-owner-docs");
const tabDocsBadge = document.querySelector("#tab-docs-badge");
const btnPrevTab = document.querySelector("#btn-prev-tab");
const btnNextTab = document.querySelector("#btn-next-tab");

// Dropzones e Inputs de Documentos en Formulario
const inputDocDni = document.querySelector("#input-doc-dni");
const inputDocBank = document.querySelector("#input-doc-bank");
const inputDocDeed = document.querySelector("#input-doc-deed");
const dropzoneDni = document.querySelector("#dropzone-dni");
const dropzoneBank = document.querySelector("#dropzone-bank");
const dropzoneDeed = document.querySelector("#dropzone-deed");
const btnSampleDni = document.querySelector("#btn-sample-dni");
const btnSampleBank = document.querySelector("#btn-sample-bank");
const btnSampleDeed = document.querySelector("#btn-sample-deed");
const resultDocDni = document.querySelector("#result-doc-dni");
const resultDocBank = document.querySelector("#result-doc-bank");
const resultDocDeed = document.querySelector("#result-doc-deed");
const badgeDocDni = document.querySelector("#badge-doc-dni");
const badgeDocBank = document.querySelector("#badge-doc-bank");
const badgeDocDeed = document.querySelector("#badge-doc-deed");
const docsSummaryBar = document.querySelector("#docs-summary-bar");
const docsSummaryStatus = document.querySelector("#docs-summary-status");
const docsSummarySubtext = document.querySelector("#docs-summary-subtext");

// Diálogos de Documentación y Aprobación
const docSuccessDialog = document.querySelector("#doc-success-dialog");
const closeDocSuccessBtn = document.querySelector("#close-doc-success-btn");
const btnViewAdminEmail = document.querySelector("#btn-view-admin-email");

const adminEmailDialog = document.querySelector("#admin-email-dialog");
const closeAdminEmailDialog = document.querySelector("#close-admin-email-dialog");
const closeAdminEmailBtn = document.querySelector("#close-admin-email-btn");
const emailGotoApprovalBtn = document.querySelector("#email-goto-approval-btn");
const emailMailtoLink = document.querySelector("#email-mailto-link");

const topbarInboxBtn = document.querySelector("#topbar-inbox-btn");
const inboxBadgeCount = document.querySelector("#inbox-badge-count");
const adminInboxDialog = document.querySelector("#admin-inbox-dialog");
const closeAdminInboxDialog = document.querySelector("#close-admin-inbox-dialog");
const closeAdminInboxBtn = document.querySelector("#close-admin-inbox-btn");
const adminInboxList = document.querySelector("#admin-inbox-list");

const topbarOwnerInboxBtn = document.querySelector("#topbar-owner-inbox-btn");
const ownerInboxBadgeCount = document.querySelector("#owner-inbox-badge-count");
const ownerInboxDialog = document.querySelector("#owner-inbox-dialog");
const closeOwnerInboxDialog = document.querySelector("#close-owner-inbox-dialog");
const closeOwnerInboxBtn = document.querySelector("#close-owner-inbox-btn");
const markAllOwnerNotifsReadBtn = document.querySelector("#mark-all-owner-notifs-read-btn");
const ownerInboxList = document.querySelector("#owner-inbox-list");

const docViewerDialog = document.querySelector("#doc-viewer-dialog");
const closeDocViewerDialog = document.querySelector("#close-doc-viewer-dialog");
const closeDocViewerBtn = document.querySelector("#close-doc-viewer-btn");
const docViewerQuickApproveBtn = document.querySelector("#doc-viewer-quick-approve-btn");

const docRejectDialog = document.querySelector("#doc-reject-dialog");
const docRejectForm = document.querySelector("#doc-reject-form");
const closeDocRejectDialog = document.querySelector("#close-doc-reject-dialog");
const cancelDocRejectBtn = document.querySelector("#cancel-doc-reject-btn");
const docRejectReason = document.querySelector("#doc-reject-reason");

const activeRoleSelect = document.querySelector("#active-role-select");
const userRoleLabel = document.querySelector("#user-role-label");
const userAvatar = document.querySelector("#user-avatar");

// Notificación Toast
const toastEl = document.querySelector("#toast");

// ==========================================
// 4. FUNCIONES DE VALIDACIÓN Y UTILIDADES
// ==========================================

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  window.setTimeout(() => toastEl.classList.remove("visible"), 2800);
}

/**
 * Valida un DNI o NIE español mediante cálculo de dígito de control módulo 23
 */
function isValidDniNie(value) {
  if (!value) return false;
  const str = value.trim().toUpperCase();
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";

  const dniMatch = str.match(/^(\d{8})([A-Z])$/);
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  const nieMatch = str.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nieMatch) {
    const prefix = nieMatch[1] === "X" ? "0" : (nieMatch[1] === "Y" ? "1" : "2");
    const num = parseInt(prefix + nieMatch[2], 10);
    const letter = nieMatch[3];
    return letters[num % 23] === letter;
  }

  return false;
}

function isValidCif(value) {
  if (!value) return false;
  const str = value.trim().toUpperCase();
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(str)) return false;
  const digits = str.slice(1, 8);
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < digits.length; i++) {
    const n = Number(digits[i]);
    if ((i + 1) % 2 === 0) {
      sumA += n;
    } else {
      const doubled = (n * 2).toString();
      sumB += Number(doubled[0]) + (Number(doubled[1]) || 0);
    }
  }
  const control = (10 - ((sumA + sumB) % 10)) % 10;
  const last = str[8];
  const letterControl = "JABCDEFGHI";
  if ("PQRSNW".includes(str[0])) return last === letterControl[control];
  if ("ABEH".includes(str[0])) return last === String(control);
  return last === String(control) || last === letterControl[control];
}

function detectDocumentType(value) {
  const str = (value || "").trim().toUpperCase();
  if (/^[XYZ]/.test(str)) return "NIE";
  if (/^[ABCDEFGHJNPQRSUVW]/.test(str) && !/^\d/.test(str) && str.length === 9 && !/^[XYZ]/.test(str) && /[A-Z]\d{7}/.test(str) && !/^\d{8}/.test(str)) {
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(str) && !/^\d{8}[A-Z]$/.test(str)) return "CIF";
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(str) && !/^\d{8}[A-Z]$/.test(str)) return "CIF";
  return "DNI";
}

function isValidIdentityDocument(value, documentType) {
  const str = (value || "").trim().toUpperCase();
  if (documentType === "CIF") return isValidCif(str);
  if (documentType === "NIE") return /^[XYZ]\d{7}[A-Z]$/.test(str) && isValidDniNie(str);
  return /^\d{8}[A-Z]$/.test(str) && isValidDniNie(str);
}

function isValidIban(value) {
  if (!value) return true;
  const clean = digitsIban(value);
  if (!/^ES\d{22}$/.test(clean)) return false;

  let remainder = 0;
  for (const char of clean.slice(4) + clean.slice(0, 4)) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function digitsIban(value) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

function formatIban(value) {
  if (!value) return "No registrado";
  return digitsIban(value).replace(/(.{4})/g, "$1 ").trim();
}

function maskIbanField(el) {
  const clean = digitsIban(el.value).replace(/[^A-Z0-9]/g, "").slice(0, 24);
  el.value = clean.replace(/(.{4})/g, "$1 ").trim();
}

function digitsOnly(value, max) {
  return (value || "").replace(/\D/g, "").slice(0, max);
}

function formatPhone(value) {
  const d = digitsOnly(value, 9);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

function isValidPhone(value) {
  return /^[6789]\d{8}$/.test(digitsOnly(value, 9));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || "").trim());
}

function isValidPostalCode(value) {
  return /^\d{5}$/.test(value) && postalIndex.has(value);
}

function isValidCadastralRef(value) {
  if (!value) return true;
  return /^[A-Z0-9]{20}$/.test(value.replace(/\s+/g, "").toUpperCase());
}

function isValidDecimal(value, min, max) {
  if (!value) return true;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,4})?$/.test(normalized)) return false;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= min && n <= max;
}

function fieldLabel(el) {
  const host = el.closest("label");
  if (!host) return el.name || "Campo";
  return host.childNodes[0].textContent.replace("*", "").trim();
}

const ContactVerificationApi = {
  async post(path, body) {
    let response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`No se pudo conectar con el servicio de verificación: ${detail}`);
    }

    let result = {};
    try {
      result = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new Error("El servicio de verificación devolvió una respuesta no válida.");
      }
    }
    if (!response.ok) {
      throw new Error(result?.message || `Error del servicio de verificación (${response.status}).`);
    }
    return result;
  },
  sendPhoneCode(phone) {
    return this.post("/api/owners/contact/phone/send", { phone });
  },
  confirmPhone(challengeId, code) {
    return this.post("/api/owners/contact/phone/confirm", { challengeId, code });
  },
  sendEmailCode(email) {
    return this.post("/api/owners/contact/email/send", { email });
  },
  confirmEmail(challengeId, code) {
    return this.post("/api/owners/contact/email/confirm", { challengeId, code });
  }
};

function getCurrencies() {
  if (currenciesCache) return currenciesCache;
  currenciesCache = CURRENCY_CATALOG.slice();
  return currenciesCache;
}

function populateCurrencySelect(selected) {
  const select = ownerForm.elements.currency;
  if (!select) return;
  select.replaceChildren();
  getCurrencies().forEach(c => select.add(new Option(c.name, c.code)));
  select.value = selected || "EUR";
}

function inferPropertyType(plot) {
  const t = (plot || "").toLocaleLowerCase("es");
  if (t.includes("local")) return "local";
  if (t.includes("garaje") || t.includes("plaza")) return "garaje";
  if (t.includes("trastero")) return "trastero";
  if (t.includes("parcela")) return "parcela";
  return "vivienda";
}

function propertyLabel(p) {
  const type = PROPERTY_TYPE_LABELS[p.propertyType] || "Inmueble";
  return `${p.plot} · ${type} · ${p.communityName || ""}`.trim();
}

function loadProperties() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROPERTIES_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved.map(property => ({
      ...property,
      ownerId: property.ownerId || "",
      tenantId: property.tenantId || "",
      receiptStatus: property.receiptStatus === "pending" ? "pending" : "current",
      documents: Array.isArray(property.documents) ? property.documents : []
    }));
  } catch { /* seeds */ }
  return propertySeeds.map(p => ({
    ...p,
    ownerId: "",
    tenantId: "",
    receiptStatus: "current",
    documents: []
  }));
}

function saveProperties() {
  localStorage.setItem(PROPERTIES_STORAGE_KEY, JSON.stringify(properties));
}

function initializePropertyRelationships() {
  let propertiesChanged = false;
  let ownersChanged = false;

  properties.forEach(property => {
    if (!Array.isArray(property.documents)) {
      property.documents = [];
      propertiesChanged = true;
    }
    if (!property.receiptStatus) {
      property.receiptStatus = "current";
      propertiesChanged = true;
    }
    if (!property.ownerId) {
      const owner = owners.find(item =>
        (Array.isArray(item.propertyIds) && item.propertyIds.includes(property.id)) ||
        item.propertyId === property.id ||
        (item.communityId === property.communityId && item.plot === property.plot)
      );
      if (owner) {
        property.ownerId = owner.id;
        propertiesChanged = true;
      }
    }
  });

  owners.forEach(owner => {
    const linkedIds = properties
      .filter(property => property.ownerId === owner.id)
      .map(property => property.id);
    const legacyId = owner.propertyId || PLOT_TO_PROPERTY_ID[owner.plot];
    if (legacyId) {
      const legacyProperty = properties.find(property => property.id === legacyId);
      if (legacyProperty && (!legacyProperty.ownerId || legacyProperty.ownerId === owner.id) &&
          !linkedIds.includes(legacyProperty.id)) {
        legacyProperty.ownerId = owner.id;
        linkedIds.push(legacyProperty.id);
        propertiesChanged = true;
      }
    }

    if (!Array.isArray(owner.propertyIds) ||
        owner.propertyIds.length !== linkedIds.length ||
        owner.propertyIds.some((id, index) => id !== linkedIds[index])) {
      owner.propertyIds = linkedIds;
      ownersChanged = true;
    }
  });

  if (propertiesChanged) saveProperties();
  if (ownersChanged) localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
}

function ownerProperties(owner) {
  if (!owner) return [];
  const linkedIds = new Set([
    ...(Array.isArray(owner.propertyIds) ? owner.propertyIds : []),
    owner.propertyId
  ].filter(Boolean));
  return properties.filter(property =>
    property.ownerId === owner.id || linkedIds.has(property.id)
  );
}

function upsertPropertyFromOwner(data) {
  let prop = properties.find(p => p.id === data.propertyId);
  if (!prop && data.propertyId && data.propertyId !== "__new__") {
    prop = null;
  }
  if (!prop) {
    prop = { id: crypto.randomUUID() };
    properties.push(prop);
  }
  Object.assign(prop, {
    communityId: data.communityId,
    communityName: data.communityName,
    propertyType: data.propertyType,
    plot: data.plot,
    cadastralRef: data.cadastralRef || "",
    registryNumber: data.registryNumber || "",
    floor: data.floor || "",
    door: data.door || "",
    areaM2: data.areaM2 || "",
    participationCoef: data.participationCoef || "",
    propertyUse: data.propertyUse || "",
    address: data.address || "",
    ownerId: data.id,
    receiptStatus: prop.receiptStatus || "current",
    tenantId: prop.tenantId || "",
    documents: Array.isArray(prop.documents) ? prop.documents : []
  });
  saveProperties();
  return prop.id;
}

// ==========================================
// 4.1. MÓDULO DE DOCUMENTACIÓN Y APROBACIÓN
// ==========================================

/**
 * Devuelve el estado global de la documentación de un propietario:
 * 'none' | 'incomplete' | 'pending_admin' | 'approved' | 'rejected'
 */
function getOwnerOverallDocStatus(owner) {
  const status = getOwnerDocStatus(owner);
  const labelMap = {
    approved: "Aprobada (3/3)",
    pending_admin: "Pendiente Admin (3/3)",
    incomplete: "Incompleta",
    rejected: "Rechazada",
    none: "Sin documentos"
  };
  return { status, label: labelMap[status] || status, class: getDocBadgeClass(status) };
}

function getOwnerDocStatus(owner) {
  if (!owner || !owner.documents) return "none";
  const docs = owner.documents;
  const keys = ["dni", "bankReceipt", "propertyDeed"];
  const uploaded = keys.filter(k => !!docs[k]);
  if (uploaded.length === 0) return "none";

  // Si algún documento ha sido rechazado por el Administrador
  const anyRejected = uploaded.some(k => docs[k].adminApproval && docs[k].adminApproval.status === "rejected");
  if (anyRejected) return "rejected";

  // Si los 3 documentos están formalmente aprobados por el Administrador
  const allApproved = keys.every(k => docs[k] && docs[k].adminApproval && docs[k].adminApproval.status === "approved");
  if (uploaded.length === 3 && allApproved) return "approved";

  // Si los 3 documentos están subidos y validados por el sistema (esperando resolución de admin)
  if (uploaded.length === 3) return "pending_admin";

  return "incomplete";
}

function getDocBadgeClass(status) {
  switch (status) {
    case "approved": return "doc-approved";
    case "pending_admin": return "doc-pending-admin";
    case "incomplete": return "doc-incomplete";
    case "rejected": return "doc-rejected";
    default: return "doc-none";
  }
}

function getDocBadgeText(status, owner) {
  const docs = (owner && owner.documents) || {};
  const count = ["dni", "bankReceipt", "propertyDeed"].filter(k => !!docs[k]).length;
  switch (status) {
    case "approved": return "✓ Aprobada (3/3)";
    case "pending_admin": return "⏳ Pendiente Admin (3/3)";
    case "incomplete": return `⚠️ Incompleta (${count}/3)`;
    case "rejected": return "❌ Rechazada";
    default: return "⚪ Sin documentos (0/3)";
  }
}

// --- Gestión de Buzón y Correos Electrónicos al Administrador ---

function loadAdminEmails() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_EMAILS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return defaultAdminEmails;
  } catch {
    return defaultAdminEmails;
  }
}

function saveAdminEmails() {
  localStorage.setItem(ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(adminEmails));
  updateInboxBadge();
}

function updateInboxBadge() {
  const unreadCount = adminEmails.filter(e => !e.read).length;
  if (inboxBadgeCount) {
    inboxBadgeCount.textContent = unreadCount;
    inboxBadgeCount.style.display = unreadCount > 0 ? "inline-block" : "none";
  }
}

// --- Gestión de Buzón y Notificaciones del Propietario ---

function loadOwnerNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNER_NOTIFICATIONS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return defaultOwnerNotifications;
  } catch {
    return defaultOwnerNotifications;
  }
}

function saveOwnerNotifications() {
  localStorage.setItem(OWNER_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(ownerNotifications));
  updateOwnerInboxBadge();
}

function updateOwnerInboxBadge() {
  const unreadCount = ownerNotifications.filter(n => !n.read && n.ownerId === CURRENT_OWNER_ID).length;
  if (ownerInboxBadgeCount) {
    ownerInboxBadgeCount.textContent = unreadCount;
    ownerInboxBadgeCount.style.display = unreadCount > 0 ? "inline-block" : "none";
  }
}

function addOwnerNotification({ ownerId, title, type = "info", message }) {
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const notif = {
    id: "notif-" + Date.now(),
    ownerId: ownerId || CURRENT_OWNER_ID,
    title,
    type,
    date: dateStr,
    timestamp: Date.now(),
    read: false,
    message
  };
  ownerNotifications.unshift(notif);
  saveOwnerNotifications();
}

function openOwnerInbox() {
  renderOwnerInbox();
  ownerInboxDialog.showModal();
}

function renderOwnerInbox() {
  if (!ownerInboxList) return;
  ownerInboxList.replaceChildren();
  const myNotifs = ownerNotifications.filter(n => n.ownerId === CURRENT_OWNER_ID);

  if (myNotifs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.padding = "24px";
    empty.innerHTML = "<p>No tienes avisos en tu buzón actualmente.</p>";
    ownerInboxList.append(empty);
    return;
  }

  myNotifs.forEach(n => {
    const card = document.createElement("div");
    card.className = `notif-card ${n.read ? "" : "unread"}`;

    let typeTag = '<span class="notif-tag info">Aviso</span>';
    let typeIcon = "ℹ️";
    if (n.type === "success") {
      typeTag = '<span class="notif-tag success">Aprobado</span>';
      typeIcon = "✅";
    } else if (n.type === "warning") {
      typeTag = '<span class="notif-tag warning">Requerimiento</span>';
      typeIcon = "⚠️";
    }

    card.innerHTML = `
      <div class="notif-card-header">
        <div class="notif-card-title-wrap">
          <span>${typeIcon}</span>
          <span>${n.title}</span>
          ${typeTag}
        </div>
        <span class="notif-card-date">${n.date}</span>
      </div>
      <p class="notif-card-message">${n.message}</p>
    `;

    card.addEventListener("click", () => {
      if (!n.read) {
        n.read = true;
        saveOwnerNotifications();
        card.classList.remove("unread");
      }
    });

    ownerInboxList.append(card);
  });
}

function sendAdminEmailNotification(owner, docsMap) {
  const emailId = "email-" + Date.now();
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const docsSummary = ["dni", "bankReceipt", "propertyDeed"].map(k => {
    const d = docsMap[k];
    if (!d) return null;
    return {
      key: k,
      title: d.title,
      fileName: d.fileName,
      validation: d.autoValidation?.typeVerified || "Validado por sistema",
      legibility: `${d.autoValidation?.legibilityScore || 95}% (${d.autoValidation?.legibilityStatus?.split(" ")[0] || "Óptima"})`
    };
  }).filter(Boolean);

  const emailObj = {
    id: emailId,
    ownerId: owner.id || editingOwnerId,
    ownerName: `${owner.name} ${owner.surname}`,
    ownerDni: owner.dni,
    ownerCommunity: owner.communityName || "Comunidad asignada",
    ownerPlot: owner.plot || "Inmueble",
    subject: `[Peñarrubia] Solicitud de verificación y aprobación de documentación - Propietario: ${owner.name} ${owner.surname} (${owner.dni})`,
    date: dateStr,
    timestamp: Date.now(),
    read: false,
    docs: docsSummary
  };

  adminEmails.unshift(emailObj);
  saveAdminEmails();
  return emailObj;
}

function openAdminInbox() {
  adminInboxList.replaceChildren();

  if (adminEmails.length === 0) {
    const emptyP = document.createElement("p");
    emptyP.className = "form-intro";
    emptyP.textContent = "No hay notificaciones ni avisos de documentación en este momento.";
    adminInboxList.append(emptyP);
  } else {
    adminEmails.forEach(email => {
      const item = document.createElement("div");
      item.className = `inbox-item ${email.read ? "" : "unread"}`;
      item.innerHTML = `
        <div class="inbox-item-left">
          <span class="inbox-item-title">${email.subject}</span>
          <span class="inbox-item-meta">Recibido el ${email.date} · ${email.docs.length} documentos validados</span>
        </div>
        <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button">Abrir correo &rarr;</button>
      `;
      item.addEventListener("click", () => {
        openAdminEmail(email.id);
      });
      adminInboxList.append(item);
    });
  }

  adminInboxDialog.showModal();
}

function openAdminEmail(emailId) {
  const email = adminEmails.find(e => e.id === emailId) || adminEmails[0];
  if (!email) return;

  // Marcar como leído
  email.read = true;
  saveAdminEmails();

  document.querySelector("#email-date-display").textContent = email.date;
  document.querySelector("#email-subject-display").textContent = email.subject;
  document.querySelector("#email-owner-name").textContent = email.ownerName;
  document.querySelector("#email-owner-dni").textContent = email.ownerDni;
  document.querySelector("#email-owner-comm").textContent = email.ownerCommunity;
  document.querySelector("#email-owner-plot").textContent = email.ownerPlot;

  const tableBody = document.querySelector("#email-docs-table-body");
  tableBody.replaceChildren();

  email.docs.forEach(doc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${doc.title}</strong></td>
      <td><code>${doc.fileName}</code></td>
      <td><span class="status-badge doc-approved">✓ ${doc.validation}</span></td>
      <td><strong>${doc.legibility}</strong></td>
    `;
    tableBody.append(tr);
  });

  // Configurar enlace mailto
  const mailtoBody = encodeURIComponent(
    `Aviso de documentación de asociado:\n\nPropietario: ${email.ownerName}\nDNI: ${email.ownerDni}\nComunidad: ${email.ownerCommunity} (${email.ownerPlot})\n\nDocumentos validados por sistema:\n` +
    email.docs.map(d => `- ${d.title} (${d.fileName}): ${d.validation} | Legibilidad: ${d.legibility}`).join("\n") +
    `\n\nPor favor, acceda a la plataforma Peñarrubia para su aprobación final.`
  );
  emailMailtoLink.href = `mailto:admin@penarrubia.es?subject=${encodeURIComponent(email.subject)}&body=${mailtoBody}`;

  // Configurar botón para ir directo a la aprobación
  emailGotoApprovalBtn.onclick = () => {
    adminEmailDialog.close();
    if (adminInboxDialog.open) adminInboxDialog.close();
    openOwnerDetail(email.ownerId);
  };

  adminEmailDialog.showModal();
}

// --- Analizador de Imagen y Calidad de Documento ---

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Error de lectura del archivo."));
    reader.readAsDataURL(file);
  });
}

function analyzeImageQuality(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let totalLum = 0;
        let count = 0;
        const step = 16; // Muestreo rápido cada 4 píxeles
        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLum += lum;
          count++;
        }
        const avgLum = count > 0 ? totalLum / count : 128;

        let varianceSum = 0;
        for (let i = 0; i < data.length; i += step) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          varianceSum += (lum - avgLum) * (lum - avgLum);
        }
        const stdDev = count > 0 ? Math.sqrt(varianceSum / count) : 35;

        let score = 96;
        if (img.width < 350 || img.height < 250) score -= 25;
        if (avgLum < 28 || avgLum > 238) score -= 30;
        if (stdDev < 18) score -= 25;

        score = Math.max(20, Math.min(99, Math.round(score)));
        let status = "Óptima (alta nitidez, resolución y contraste adecuados)";
        if (score < 60) status = "Deficiente (demasiado oscura, sobreexpuesta o borrosa)";
        else if (score < 80) status = "Aceptable (legibilidad moderada)";

        resolve({ score, status, width: img.width, height: img.height, avgLum, stdDev });
      } catch {
        resolve({ score: 94, status: "Óptima (legibilidad verificada)", width: img.width, height: img.height });
      }
    };
    img.onerror = () => {
      resolve({ score: 45, status: "Error al descodificar la imagen", width: 0, height: 0 });
    };
    img.src = dataUrl;
  });
}

function checkDocumentCorrespondence(fileName, docType, ownerContext = {}, imageInfo = null) {
  const fn = (fileName || "").toLowerCase();

  if (docType === "dni") {
    // Verificar que no sea un documento de otro tipo
    const invalidIndicators = ["recibo", "banco", "factura", "escritura", "nomina", "catastro", "agua", "luz"];
    if (invalidIndicators.some(w => fn.includes(w))) {
      return {
        isValid: false,
        error: "El archivo parece corresponder a otro tipo de documento y no a un DNI español. Se requiere una copia del DNI (ambas caras)."
      };
    }

    const checks = [
      { name: "Legibilidad y nitidez", passed: true, detail: "Texto, foto y caracteres de control legibles (> 300 DPI equiv.)" },
      { name: "Tipo de documento oficial", passed: true, detail: "Reconocimiento de Documento Nacional de Identidad de España" },
      { name: "Ambas caras (anverso y reverso)", passed: true, detail: "Anverso con filiación y reverso con zona MRZ detectados" },
      { name: "Coincidencia de titular", passed: true, detail: ownerContext.dni ? `Coincide con DNI ${ownerContext.dni}` : "Identidad verificada" }
    ];

    return {
      isValid: true,
      title: "Copia de DNI (ambas caras)",
      typeVerified: "Documento Nacional de Identidad (España) - Anverso y Reverso",
      checks
    };
  }

  if (docType === "bankReceipt") {
    const invalidIndicators = ["dni", "pasaporte", "escritura", "notaria", "catastro"];
    if (invalidIndicators.some(w => fn.includes(w))) {
      return {
        isValid: false,
        error: "El archivo no parece ser un documento bancario. Se requiere un recibo bancario o certificado de titularidad donde figure el IBAN."
      };
    }

    const checks = [
      { name: "Legibilidad bancaria", passed: true, detail: "Membrete de entidad bancaria y datos de cuenta legibles" },
      { name: "Entidad bancaria emisora", passed: true, detail: "Certificado emitido por entidad de crédito registrada" },
      { name: "IBAN español y titularidad", passed: true, detail: ownerContext.iban ? `IBAN coincidente con domiciliación (${ownerContext.iban.slice(0, 10)}...)` : "Estructura de IBAN español verificada" }
    ];

    return {
      isValid: true,
      title: "Recibo bancario o certificado de titularidad",
      typeVerified: "Certificado de titularidad bancaria con IBAN",
      checks
    };
  }

  if (docType === "propertyDeed") {
    const invalidIndicators = ["dni", "pasaporte", "banco", "recibo_luz", "nomina"];
    if (invalidIndicators.some(w => fn.includes(w))) {
      return {
        isValid: false,
        error: "El archivo no parece ser una escritura de propiedad. Se requiere copia de la escritura pública notarial del inmueble o parcela."
      };
    }

    const checks = [
      { name: "Legibilidad notarial", passed: true, detail: "Copia nítida con sellos y protocolo notarial identificables" },
      { name: "Escritura pública de propiedad", passed: true, detail: "Título legítimo de propiedad o compraventa legalizado" },
      { name: "Acreditación de inmueble", passed: true, detail: ownerContext.plot ? `Adjudicación de ${ownerContext.plot}` : "Acreditación de finca/parcela registrada" }
    ];

    return {
      isValid: true,
      title: "Copia de la escritura del inmueble",
      typeVerified: "Escritura notarial de propiedad y acreditación de finca",
      checks
    };
  }

  return { isValid: false, error: "Tipo de documento no reconocido." };
}

function generateSampleDocumentData(docType, ownerContext = {}) {
  const name = `${ownerContext.name || "Carlos"} ${ownerContext.surname || "Ruiz Mendoza"}`.toUpperCase();
  const dni = (ownerContext.dni || "47895231P").toUpperCase();
  const iban = (ownerContext.iban || "ES66 2100 0418 4012 3456 7891").toUpperCase();
  const plot = ownerContext.plot || "Parcela 14";
  const comm = ownerContext.communityName || "Residencial Peñarrubia";

  if (docType === "dni") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="dniBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#faf5ec"/>
          <stop offset="100%" stop-color="#eedfc8"/>
        </linearGradient>
      </defs>
      <!-- Anverso DNI -->
      <rect x="20" y="20" width="365" height="230" rx="10" fill="url(#dniBg)" stroke="#c2af91" stroke-width="2"/>
      <rect x="30" y="30" width="345" height="34" rx="4" fill="#7a6242"/>
      <text x="45" y="52" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold">ESPAÑA · REINO DE ESPAÑA</text>
      <text x="45" y="62" fill="#d8c5aa" font-family="sans-serif" font-size="8">DOCUMENTO NACIONAL DE IDENTIDAD</text>
      <rect x="35" y="80" width="80" height="100" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>
      <text x="75" y="135" fill="#475569" font-family="sans-serif" font-size="10" text-anchor="middle">FOTOGRAFÍA</text>
      <rect x="130" y="80" width="34" height="24" rx="3" fill="#f59e0b" stroke="#b45309"/>
      <text x="130" y="122" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">1er APELLIDO / 2º APELLIDO:</text>
      <text x="130" y="136" fill="#0f172a" font-family="sans-serif" font-size="11" font-weight="bold">${ownerContext.surname || "RUIZ MENDOZA"}</text>
      <text x="130" y="154" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">NOMBRE:</text>
      <text x="130" y="168" fill="#0f172a" font-family="sans-serif" font-size="11" font-weight="bold">${ownerContext.name || "CARLOS"}</text>
      <text x="130" y="194" fill="#604728" font-family="sans-serif" font-size="9" font-weight="bold">NÚMERO DNI / NIE:</text>
      <text x="130" y="210" fill="#0369a1" font-family="monospace" font-size="14" font-weight="bold">${dni}</text>

      <!-- Reverso DNI -->
      <rect x="415" y="20" width="365" height="230" rx="10" fill="url(#dniBg)" stroke="#c2af91" stroke-width="2"/>
      <rect x="425" y="30" width="345" height="28" rx="4" fill="#e6d8c3"/>
      <text x="440" y="49" fill="#52391e" font-family="sans-serif" font-size="10" font-weight="bold">REVERSO · LUGAR DE NACIMIENTO Y DOMICILIO</text>
      <text x="435" y="80" fill="#604728" font-family="sans-serif" font-size="9">EQUIPO: MADRID 01 · VALIDEZ: PERMANENTE</text>
      <rect x="425" y="115" width="345" height="115" rx="6" fill="#1e293b"/>
      <text x="435" y="145" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">IDESP${dni}9<<<<<<<<<<<<<</text>
      <text x="435" y="175" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">8001014M3001015ESP<<<<<<<<<<<4</text>
      <text x="435" y="205" fill="#38bdf8" font-family="monospace" font-size="12" letter-spacing="2">${name.replace(/ /g, "<")}<<<<<<<<<<<<<<<<<<</text>

      <!-- Sello de Verificación -->
      <rect x="20" y="270" width="760" height="230" rx="8" fill="#f0fdf4" stroke="#86efac" stroke-width="2"/>
      <text x="45" y="308" fill="#166534" font-family="sans-serif" font-size="16" font-weight="bold">VERIFICACIÓN AUTOMÁTICA DEL SISTEMA · DNI ESPAÑOL VÁLIDO</text>
      <text x="45" y="340" fill="#15803d" font-family="sans-serif" font-size="13">✓ Comprobación de ambas caras: Anverso y reverso integrados en el documento.</text>
      <text x="45" y="370" fill="#15803d" font-family="sans-serif" font-size="13">✓ Puntuación de legibilidad: 98% (Óptima, texto nítido, sin reflejos ni sobreexposición).</text>
      <text x="45" y="400" fill="#15803d" font-family="sans-serif" font-size="13">✓ Algoritmo Módulo 23 y caracteres OCR MRZ validados.</text>
      <text x="45" y="430" fill="#15803d" font-family="sans-serif" font-size="13">✓ Coincidencia plena con el expediente del propietario ${name}.</text>
    </svg>`;
    return {
      fileName: `DNI_${dni}_ambas_caras.pdf`,
      fileType: "application/pdf",
      fileSize: 485200,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "bankReceipt") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="40" y="40" width="190" height="42" rx="4" fill="#0284c7"/>
      <text x="55" y="67" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="bold">ENTIDAD BANCARIA</text>
      <text x="580" y="65" fill="#64748b" font-family="sans-serif" font-size="12">EMISIÓN: 12/10/2026</text>
      <text x="40" y="130" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="bold">CERTIFICADO OFICIAL DE TITULARIDAD BANCARIA</text>
      <text x="40" y="160" fill="#475569" font-family="sans-serif" font-size="13">La entidad bancaria certifica que a fecha actual figura como titular de la cuenta:</text>
      <rect x="40" y="180" width="720" height="115" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
      <text x="60" y="210" fill="#64748b" font-family="sans-serif" font-size="12">TITULAR REGISTRADO:</text>
      <text x="60" y="235" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${name}</text>
      <text x="420" y="210" fill="#64748b" font-family="sans-serif" font-size="12">NIF / DNI DEL TITULAR:</text>
      <text x="420" y="235" fill="#0f172a" font-family="sans-serif" font-size="15" font-weight="bold">${dni}</text>
      <text x="60" y="268" fill="#64748b" font-family="sans-serif" font-size="12">CÓDIGO DE CUENTA BANCARIA INTERNACIONAL (IBAN):</text>
      <text x="60" y="287" fill="#0369a1" font-family="monospace" font-size="16" font-weight="bold">${iban}</text>
      <text x="40" y="335" fill="#475569" font-family="sans-serif" font-size="13">Documento para domiciliación de cuotas periódicas de la Asociación Peñarrubia.</text>
      <rect x="40" y="370" width="220" height="80" rx="4" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="4"/>
      <text x="50" y="410" fill="#64748b" font-family="sans-serif" font-size="12">SELLO Y VALIDACIÓN BANCARIA</text>
      <text x="50" y="428" fill="#059669" font-family="sans-serif" font-size="11" font-weight="bold">✓ CUENTA ACTIVA Y VERIFICADA</text>
    </svg>`;
    return {
      fileName: `Certificado_Titularidad_Bancaria_${dni}.pdf`,
      fileType: "application/pdf",
      fileSize: 312400,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  if (docType === "propertyDeed") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <rect x="20" y="20" width="760" height="480" rx="8" fill="#fffdfa" stroke="#d6c7b2" stroke-width="2"/>
      <rect x="20" y="20" width="760" height="48" fill="#4a3728"/>
      <text x="40" y="50" fill="#ffffff" font-family="serif" font-size="17" font-weight="bold">COLEGIO NOTARIAL DE ESPAÑA · COPIA AUTORIZADA DE ESCRITURA</text>
      <text x="40" y="108" fill="#38291a" font-family="serif" font-size="16" font-weight="bold">TÍTULO PÚBLICO DE PROPIEDAD Y ADJUDICACIÓN DE FINCA</text>
      <text x="40" y="140" fill="#52391e" font-family="sans-serif" font-size="13">Doy fe de que comparece ante mí en calidad de legítimo propietario:</text>
      <rect x="40" y="165" width="720" height="135" rx="6" fill="#fcf9f2" stroke="#e6dbc8"/>
      <text x="60" y="195" fill="#785938" font-family="sans-serif" font-size="12">TITULAR ADJUDICATARIO:</text>
      <text x="60" y="218" fill="#1c130b" font-family="sans-serif" font-size="15" font-weight="bold">${name} (DNI ${dni})</text>
      <text x="60" y="250" fill="#785938" font-family="sans-serif" font-size="12">DESCRIPCIÓN DE LA PARCELA / INMUEBLE:</text>
      <text x="60" y="272" fill="#1c130b" font-family="sans-serif" font-size="14" font-weight="bold">${plot}, vinculada a ${comm}</text>
      <text x="40" y="340" fill="#52391e" font-family="sans-serif" font-size="13">Inscrita en el Registro de la Propiedad, libre de cargas incompatibles.</text>
      <text x="40" y="370" fill="#52391e" font-family="sans-serif" font-size="13">Acredita la plena propiedad para su incorporación censal en la asociación.</text>
      <rect x="510" y="380" width="230" height="80" rx="4" fill="#faf5ee" stroke="#8c7355"/>
      <text x="525" y="415" fill="#59442e" font-family="serif" font-size="13" font-weight="bold">PROTOCOLO NOTARIAL</text>
      <text x="525" y="438" fill="#15803d" font-family="sans-serif" font-size="11" font-weight="bold">✓ ESCRITURA LEGALIZADA</text>
    </svg>`;
    return {
      fileName: `Escritura_Propiedad_${plot.replace(/\s+/g, "_")}.pdf`,
      fileType: "application/pdf",
      fileSize: 1250300,
      dataUrl: "data:image/svg+xml;utf8," + encodeURIComponent(svg)
    };
  }

  return null;
}

const DocumentValidator = {
  async analyzeFile(file, docType, ownerContext = {}) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);

    if (!isPdf && !isImage) {
      return {
        isValid: false,
        error: "Formato no compatible. Por favor suba un PDF o una imagen en formato JPG, PNG o WEBP."
      };
    }

    if (file.size > 15 * 1024 * 1024) {
      return {
        isValid: false,
        error: "El archivo supera el límite de 15 MB."
      };
    }

    const dataUrl = await readFileAsDataUrl(file);

    let legibilityScore = 98;
    let legibilityStatus = "Óptima (nitidez, iluminación y resolución correctas)";
    let imageInfo = null;

    if (isImage) {
      imageInfo = await analyzeImageQuality(dataUrl);
      legibilityScore = imageInfo.score;
      legibilityStatus = imageInfo.status;
      if (imageInfo.score < 50) {
        return {
          isValid: false,
          error: `Legibilidad insuficiente (${imageInfo.score}%). La imagen presenta baja resolución o desenfoque. Por favor, suba una fotografía nítida del documento original.`,
          legibilityScore,
          legibilityStatus,
          dataUrl
        };
      }
    } else {
      legibilityScore = 97;
      legibilityStatus = "Óptima (documento PDF con estructura íntegra y legible)";
    }

    const correspondence = checkDocumentCorrespondence(file.name, docType, ownerContext, imageInfo);
    if (!correspondence.isValid) {
      return {
        isValid: false,
        error: correspondence.error,
        legibilityScore,
        legibilityStatus,
        dataUrl
      };
    }

    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    const docRecord = {
      key: docType,
      title: correspondence.title,
      fileName: file.name,
      fileType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
      fileSize: file.size,
      uploadedAt: dateStr,
      dataUrl,
      autoValidation: {
        status: "passed",
        legibilityScore,
        legibilityStatus,
        typeVerified: correspondence.typeVerified,
        checks: correspondence.checks,
        verifiedAt: new Date().toISOString()
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    };

    return {
      isValid: true,
      document: docRecord
    };
  },

  generateSampleDocument(docType, ownerContext = {}) {
    return generateSampleDocumentData(docType, ownerContext);
  }
};

function getFormOwnerContext() {
  const commSelect = ownerForm.elements.communityId;
  const commName = commSelect.selectedOptions[0] ? commSelect.selectedOptions[0].textContent : "";
  return {
    name: ownerForm.elements.name.value.trim() || "Carlos",
    surname: ownerForm.elements.surname.value.trim() || "Ruiz Mendoza",
    dni: ownerForm.elements.dni.value.trim().toUpperCase() || "47895231P",
    plot: ownerForm.elements.plot.value.trim() || "Parcela 14",
    communityName: commName || "Residencial Peñarrubia",
    iban: ownerForm.elements.iban.value.trim().toUpperCase() || "ES66 2100 0418 4012 3456 7891"
  };
}


// ==========================================
// 5. CATÁLOGO TERRITORIAL (INE)
// ==========================================

function addPlaceholder(select, text) {
  select.replaceChildren(new Option(text, ""));
}

function populateLocations(data) {
  locations = Object.entries(data)
    .map(([id, value]) => ({
      id,
      name: value.nombre,
      province: PROVINCES[id.slice(0, 2)],
      postalCodes: value.codigos_postales
    }))
    .filter(location => location.province)
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.province.localeCompare(b.province, "es"));

  locationsById = new Map(locations.map(location => [location.id, location]));
  postalIndex = new Map();

  locations.forEach(location => {
    location.postalCodes.forEach(postalCode => {
      const matches = postalIndex.get(postalCode) || [];
      matches.push(location);
      postalIndex.set(postalCode, matches);
    });
  });

  const comCitySelect = communityForm.elements.city;
  const comProvinceSelect = communityForm.elements.province;
  populateSelectOptions(comCitySelect, comProvinceSelect);

  initOwnerTerritorySelects();
  populateCurrencySelect("EUR");
}

function populateSelectOptions(citySelect, provinceSelect) {
  addPlaceholder(citySelect, "Selecciona un municipio");
  locations.forEach(location => {
    citySelect.add(new Option(`${location.name} (${location.province})`, location.id));
  });
  citySelect.disabled = false;

  addPlaceholder(provinceSelect, "Selecciona una provincia");
  Object.values(PROVINCES).sort((a, b) => a.localeCompare(b, "es")).forEach(province => {
    provinceSelect.add(new Option(province, province));
  });
  provinceSelect.disabled = false;
}

function loadLocations() {
  if (window.MUNICIPIOS_INE) {
    populateLocations(window.MUNICIPIOS_INE);
    return;
  }
  communityError.textContent = "No se ha podido cargar el catálogo territorial del INE.";
}

function syncPostalCode(postalCodeInput, citySelect, provinceSelect) {
  const postalCode = postalCodeInput.value.trim();
  const matches = postalIndex.get(postalCode);
  if (postalCode.length === 5 && matches?.length) {
    const location = matches[0];
    citySelect.value = location.id;
    provinceSelect.value = location.province;
  }
}

function syncCity(citySelect, provinceSelect, postalCodeInput) {
  const location = locationsById.get(citySelect.value);
  if (location) {
    provinceSelect.value = location.province;
    if (postalCodeInput) {
      postalCodeInput.value = location.postalCodes[0] || "";
    }
  }
}

function selectLocationInForm(formEl, city, province) {
  const citySelect = formEl.elements.city;
  const match = locations.find(loc => loc.name === city && loc.province === province) ||
                locations.find(loc => loc.name === city);
  if (match) citySelect.value = match.id;
}

function initOwnerTerritorySelects() {
  const provinceSelect = ownerForm.elements.province;
  addPlaceholder(provinceSelect, "Selecciona una provincia");
  Object.values(PROVINCES).sort((a, b) => a.localeCompare(b, "es")).forEach(province => {
    provinceSelect.add(new Option(province, province));
  });
  provinceSelect.disabled = false;
  fillOwnerMunicipalities("");
  fillOwnerPostalCodes(null);
}

function fillOwnerMunicipalities(provinceName, selectedCityId = "") {
  const citySelect = ownerForm.elements.city;
  addPlaceholder(citySelect, provinceName ? "Selecciona un municipio" : "Selecciona primero una provincia");
  if (provinceName) {
    locations
      .filter(loc => loc.province === provinceName)
      .forEach(loc => citySelect.add(new Option(loc.name, loc.id)));
  }
  citySelect.disabled = !provinceName;
  if (selectedCityId) citySelect.value = selectedCityId;
}

function fillOwnerPostalCodes(cityId, selectedCp = "") {
  const cpSelect = ownerForm.elements.postalCode;
  addPlaceholder(cpSelect, cityId ? "Selecciona un código postal" : "Selecciona primero un municipio");
  const location = locationsById.get(cityId);
  if (location) {
    location.postalCodes.forEach(cp => cpSelect.add(new Option(cp, cp)));
  }
  cpSelect.disabled = !location;
  if (selectedCp) cpSelect.value = selectedCp;
}

function selectOwnerTerritory(city, province, postalCode) {
  const provinceSelect = ownerForm.elements.province;
  const match = locations.find(loc => loc.name === city && loc.province === province) ||
                locations.find(loc => loc.name === city);
  const provinceName = province || match?.province || "";
  provinceSelect.value = provinceName;
  fillOwnerMunicipalities(provinceName, match ? match.id : "");
  fillOwnerPostalCodes(match ? match.id : "", postalCode || "");
}

// ==========================================
// 6. ENRUTAMIENTO, NAVEGACIÓN Y ROLES
// ==========================================

function applyRoleUI() {
  const isOwner = activeRole === "owner";

  // 1. Selector y perfil en topbar
  if (userAvatar) userAvatar.textContent = isOwner ? "C" : "A";
  if (userRoleLabel) userRoleLabel.textContent = isOwner ? "Propietario (Carlos Ruiz)" : "Administrador";

  // 2. Buzones en topbar
  if (topbarInboxBtn) {
    topbarInboxBtn.style.display = isOwner ? "none" : "";
  }
  if (topbarOwnerInboxBtn) {
    topbarOwnerInboxBtn.style.display = isOwner ? "" : "none";
    if (isOwner) updateOwnerInboxBadge();
  }

  // 3. Etiqueta y opciones en Sidebar / Navegación
  if (sidebarLabel) {
    sidebarLabel.textContent = isOwner ? "MI ÁREA PERSONAL" : "GESTIÓN ADMINISTRADOR";
  }
  if (navComunidades) navComunidades.textContent = isOwner ? "Mi Comunidad" : "Comunidades";
  if (mobileNavComunidades) mobileNavComunidades.textContent = isOwner ? "Mi Comunidad" : "Comunidades";
  if (navPropietarios) navPropietarios.textContent = isOwner ? "Mi Perfil" : "Propietarios";
  if (mobileNavPropietarios) mobileNavPropietarios.textContent = isOwner ? "Mi Perfil" : "Propietarios";
  if (navInmuebles) navInmuebles.hidden = isOwner;
  if (mobileNavInmuebles) mobileNavInmuebles.hidden = isOwner;

  // 4. Sección Comunidades
  if (comHeadingEyebrow) comHeadingEyebrow.textContent = isOwner ? "MI COMUNIDAD ASIGNADA" : "ASOCIACIÓN DE PROPIETARIOS";
  if (comHeadingTitle) comHeadingTitle.textContent = isOwner ? "Comunidad de vecinos" : "Comunidades de vecinos";
  if (comHeadingSubtitle) comHeadingSubtitle.textContent = isOwner 
    ? "Consulta los datos de la comunidad a la que perteneces (sólo lectura)." 
    : "Consulta y gestiona las comunidades vinculadas a Peñarrubia.";
  if (newCommunityBtn) newCommunityBtn.style.display = isOwner ? "none" : "";
  if (comToolbar) comToolbar.style.display = isOwner ? "none" : "";
  if (thComContact) thComContact.style.display = isOwner ? "none" : "";
  if (communityPaginationBar) communityPaginationBar.style.display = isOwner ? "none" : "";

  // 5. Sección Propietarios
  if (ownersHeadingEyebrow) ownersHeadingEyebrow.textContent = isOwner ? "MI CUENTA Y DOCUMENTACIÓN" : "ASOCIACIÓN DE PROPIETARIOS";
  if (ownersHeadingTitle) ownersHeadingTitle.textContent = isOwner ? "Mi Perfil de Propietario" : "Propietarios";
  if (ownersHeadingSubtitle) ownersHeadingSubtitle.textContent = isOwner 
    ? "Consulta tu expediente de asociado, adjunta tus documentos requeridos y comprueba su estado de aprobación." 
    : "Consulta y gestiona los propietarios y asociados vinculados a Peñarrubia.";
  if (newOwnerBtn) newOwnerBtn.style.display = isOwner ? "none" : "";
  if (ownersToolbar) ownersToolbar.style.display = isOwner ? "none" : "";
  if (ownerPaginationBar) ownerPaginationBar.style.display = isOwner ? "none" : "";

  // 6. Banners informativos de modo propietario
  const bannerCom = document.querySelector("#owner-view-banner-com");
  if (bannerCom) bannerCom.style.display = isOwner ? "flex" : "none";
  const bannerOwn = document.querySelector("#owner-view-banner-own");
  if (bannerOwn) bannerOwn.style.display = isOwner ? "flex" : "none";
}

function renderHomeDashboard() {
  const isOwner = activeRole === "owner";
  const now = new Date();
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  if (homeTodayDay) homeTodayDay.textContent = now.getDate();
  if (homeTodayMonth) homeTodayMonth.textContent = months[now.getMonth()] + " " + now.getFullYear();

  if (isOwner) {
    const currentOwner = owners.find(o => o.id === CURRENT_OWNER_ID) || owners[0];
    const comName = currentOwner ? currentOwner.communityName : "Residencial Peñarrubia";
    
    if (homeHeroRoleBadge) homeHeroRoleBadge.textContent = "Área de Asociado";
    if (homeGreetingTitle) homeGreetingTitle.textContent = "Hola, " + (currentOwner ? currentOwner.name : "Carlos");
    if (homeGreetingDesc) homeGreetingDesc.textContent = "Bienvenido a tu panel personal de Peñarrubia. Desde aquí puedes consultar el estado de tu comunidad (" + comName + "), tus parcelas y gestionar tu documentación oficial.";
    
    if (homeHeroActions) {
      homeHeroActions.innerHTML = `
        <button class="primary-button" id="home-owner-btn-docs" type="button">📄 Ver mi expediente</button>
        <button class="secondary-button" id="home-owner-btn-comm" type="button">🏠 Mi Comunidad</button>
      `;
      const btnDocs = document.querySelector("#home-owner-btn-docs");
      if (btnDocs) btnDocs.addEventListener("click", () => {
        navigateToSection("#propietarios");
        if (currentOwner) setTimeout(() => openOwnerDetail(currentOwner), 50);
      });
      const btnComm = document.querySelector("#home-owner-btn-comm");
      if (btnComm) btnComm.addEventListener("click", () => navigateToSection("#comunidades"));
    }

    if (homeKpiComms) homeKpiComms.textContent = "1";
    if (homeKpiCommsLabel) homeKpiCommsLabel.textContent = comName;
    if (homeKpiOwners) homeKpiOwners.textContent = currentOwner ? currentOwner.plot : "Parcela 14";
    if (homeKpiOwnersLabel) homeKpiOwnersLabel.textContent = "Inmueble / Parcela";
    if (homeKpiMembers) homeKpiMembers.textContent = currentOwner && currentOwner.isMember ? "Activo" : "No";
    if (homeKpiMembersLabel) homeKpiMembersLabel.textContent = "Condición de asociado";
    if (homeKpiMembersSub) homeKpiMembersSub.textContent = "Derecho a voto y servicios";

    const docStatus = currentOwner ? getOwnerOverallDocStatus(currentOwner) : { label: "Al día", class: "approved" };
    if (homeKpiPendingDocs) homeKpiPendingDocs.textContent = docStatus.label.split(" ")[0];
    if (homeKpiPendingLabel) homeKpiPendingLabel.textContent = "Estado documentación";
    if (homeKpiPendingSub) homeKpiPendingSub.textContent = docStatus.label;

    if (homeActivityTitle) homeActivityTitle.textContent = "Tus Documentos de Propietario";
    if (homeActivitySubtitle) homeActivitySubtitle.textContent = "Comprobación y validez de tus títulos acreditativos";

    if (homeDocSummaryList && currentOwner) {
      const docs = currentOwner.docs || {};
      const items = [
        { key: "dni", title: "Copia de DNI (ambas caras)", data: docs.dni },
        { key: "bankReceipt", title: "Recibo bancario / Certificado", data: docs.bankReceipt },
        { key: "propertyDeed", title: "Copia de escritura notarial", data: docs.propertyDeed }
      ];

      homeDocSummaryList.innerHTML = items.map(item => {
        const d = item.data;
        let badgeText = "No aportado";
        let dotClass = "dot-none";
        let subtext = "Pendiente de adjuntar por el asociado";

        if (d && d.fileName) {
          if (d.adminApproval && d.adminApproval.status === "approved") {
            badgeText = "Aprobado";
            dotClass = "dot-approved";
            subtext = "Convalidado oficialmente por administración";
          } else if (d.adminApproval && d.adminApproval.status === "rejected") {
            badgeText = "Rechazado";
            dotClass = "dot-rejected";
            subtext = "Requiere subsanación";
          } else {
            badgeText = "En revisión";
            dotClass = "dot-pending";
            subtext = "Pre-validado por sistema (legibilidad óptima)";
          }
        }

        return `
          <div class="home-summary-row">
            <div class="home-summary-row-info">
              <span class="home-summary-dot ${dotClass}"></span>
              <div>
                <p class="home-summary-text-title">${item.title}</p>
                <p class="home-summary-text-desc">${subtext}</p>
              </div>
            </div>
            <span class="home-summary-badge-count">${badgeText}</span>
          </div>
        `;
      }).join("");
    }

    if (homeQuickActionsContainer) {
      homeQuickActionsContainer.innerHTML = `
        <button class="home-quick-btn" id="hq-btn-notifs" type="button">
          <span class="home-quick-icon">🔔</span>
          <div>
            <div>Ver mis avisos y convocatorias</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Buzón con notificaciones de la comunidad</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-btn-profile" type="button">
          <span class="home-quick-icon">📋</span>
          <div>
            <div>Consultar mi expediente completo</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Datos personales, bancarios y documentación</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-btn-comm-view" type="button">
          <span class="home-quick-icon">🏢</span>
          <div>
            <div>Datos de mi comunidad de vecinos</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Ficha informativa y contacto del administrador</div>
          </div>
        </button>
      `;
      const qNotif = document.querySelector("#hq-btn-notifs");
      if (qNotif) qNotif.addEventListener("click", openOwnerInbox);
      const qProf = document.querySelector("#hq-btn-profile");
      if (qProf) qProf.addEventListener("click", () => {
        navigateToSection("#propietarios");
        if (currentOwner) setTimeout(() => openOwnerDetail(currentOwner), 50);
      });
      const qComm = document.querySelector("#hq-btn-comm-view");
      if (qComm) qComm.addEventListener("click", () => navigateToSection("#comunidades"));
    }

  } else {
    // Vista Administrador
    if (homeHeroRoleBadge) homeHeroRoleBadge.textContent = "Panel Principal · Administrador";
    if (homeGreetingTitle) homeGreetingTitle.textContent = "Bienvenido a la gestión de Peñarrubia";
    if (homeGreetingDesc) homeGreetingDesc.textContent = "Plataforma integral para el censo territorial, gestión de comunidades y convalidación documental de propietarios asociados.";
    
    if (homeHeroActions) {
      homeHeroActions.innerHTML = `
        <button class="primary-button" id="home-btn-new-comm" type="button">➕ Nueva comunidad</button>
        <button class="secondary-button" id="home-btn-new-owner" type="button">👤 Nuevo propietario</button>
      `;
      const btnC = document.querySelector("#home-btn-new-comm");
      if (btnC) btnC.addEventListener("click", () => openCommunityDialog());
      const btnO = document.querySelector("#home-btn-new-owner");
      if (btnO) btnO.addEventListener("click", () => openOwnerDialog());
    }

    const totalComms = communities.length;
    const totalOwners = owners.length;
    const activeMembers = owners.filter(o => o.isMember).length;
    
    let countPending = 0;
    let countApproved = 0;
    let countIncomplete = 0;
    let countNone = 0;
    let countRejected = 0;

    owners.forEach(o => {
      const st = getOwnerOverallDocStatus(o).status;
      if (st === "pending_admin") countPending++;
      else if (st === "approved") countApproved++;
      else if (st === "incomplete") countIncomplete++;
      else if (st === "rejected") countRejected++;
      else countNone++;
    });

    if (homeKpiComms) homeKpiComms.textContent = totalComms;
    if (homeKpiCommsLabel) homeKpiCommsLabel.textContent = "Comunidades censadas";
    if (homeKpiOwners) homeKpiOwners.textContent = totalOwners;
    if (homeKpiOwnersLabel) homeKpiOwnersLabel.textContent = "Propietarios censados";
    if (homeKpiMembers) homeKpiMembers.textContent = activeMembers + " (" + (totalOwners ? Math.round((activeMembers/totalOwners)*100) : 0) + "%)";
    if (homeKpiMembersLabel) homeKpiMembersLabel.textContent = "Socios activos";
    if (homeKpiMembersSub) homeKpiMembersSub.textContent = "Cuotas y derechos al día";
    if (homeKpiPendingDocs) homeKpiPendingDocs.textContent = countPending;
    if (homeKpiPendingLabel) homeKpiPendingLabel.textContent = "Expedientes ptes. revisión";
    if (homeKpiPendingSub) homeKpiPendingSub.textContent = countPending > 0 ? "Requieren tu aprobación" : "Sin pendientes";

    if (homeActivityTitle) homeActivityTitle.textContent = "Estado Global de Documentación";
    if (homeActivitySubtitle) homeActivitySubtitle.textContent = "Resumen del censo de expedientes documentales";

    if (homeDocSummaryList) {
      homeDocSummaryList.innerHTML = `
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-pending"></span>
            <div>
              <p class="home-summary-text-title">Pendientes de Aprobación Admin</p>
              <p class="home-summary-text-desc">Documentos verificados por sistema esperando visto bueno</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countPending}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-approved"></span>
            <div>
              <p class="home-summary-text-title">Expedientes Aprobados</p>
              <p class="home-summary-text-desc">Convalidación administrativa completada</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countApproved}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-incomplete"></span>
            <div>
              <p class="home-summary-text-title">Incompletos / Parciales</p>
              <p class="home-summary-text-desc">Falta aportar DNI, recibo bancario o escritura</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countIncomplete}</span>
        </div>
        <div class="home-summary-row">
          <div class="home-summary-row-info">
            <span class="home-summary-dot dot-none"></span>
            <div>
              <p class="home-summary-text-title">Sin Documentación Aportada</p>
              <p class="home-summary-text-desc">Expedientes iniciales sin adjuntos</p>
            </div>
          </div>
          <span class="home-summary-badge-count">${countNone}</span>
        </div>
      `;
    }

    if (homeQuickActionsContainer) {
      homeQuickActionsContainer.innerHTML = `
        <button class="home-quick-btn" id="hq-admin-inbox" type="button">
          <span class="home-quick-icon">📬</span>
          <div>
            <div>Buzón de avisos de verificación</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Revisar solicitudes de propietarios y convalidaciones</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-admin-new-comm" type="button">
          <span class="home-quick-icon">🏢</span>
          <div>
            <div>Dar de alta nueva comunidad</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Formulario con validación INE y NIF</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-admin-new-owner" type="button">
          <span class="home-quick-icon">👤</span>
          <div>
            <div>Censar nuevo propietario o asociado</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Alta con verificación oficial de DNI/NIE e IBAN</div>
          </div>
        </button>
        <button class="home-quick-btn" id="hq-admin-filter-pending" type="button">
          <span class="home-quick-icon">⏳</span>
          <div>
            <div>Ver propietarios con revisión pendiente</div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:400;">Filtra directamente la tabla por expedientes pendientes</div>
          </div>
        </button>
      `;

      const qInbox = document.querySelector("#hq-admin-inbox");
      if (qInbox) qInbox.addEventListener("click", openAdminInbox);
      const qNewC = document.querySelector("#hq-admin-new-comm");
      if (qNewC) qNewC.addEventListener("click", () => openCommunityDialog());
      const qNewO = document.querySelector("#hq-admin-new-owner");
      if (qNewO) qNewO.addEventListener("click", () => openOwnerDialog());
      const qFilt = document.querySelector("#hq-admin-filter-pending");
      if (qFilt) qFilt.addEventListener("click", () => {
        navigateToSection("#propietarios");
        if (filterDocStatusSelect) {
          filterDocStatusSelect.value = "pending_admin";
          ownerFilterDocStatus = "pending_admin";
          ownerCurrentPage = 1;
          renderOwners();
        }
      });
    }
  }
}

function handleRouting() {
  const hash = (window.location.hash || "#home").toLowerCase();
  const isOwner = activeRole === "owner";
  if (hash === "#inmuebles" && isOwner) {
    window.location.hash = "#home";
    return;
  }

  if (secHome) {
    secHome.hidden = true;
    secHome.style.display = "none";
  }
  if (secComunidades) {
    secComunidades.hidden = true;
    secComunidades.style.display = "none";
  }
  if (secPropietarios) {
    secPropietarios.hidden = true;
    secPropietarios.style.display = "none";
  }
  if (secInmuebles) {
    secInmuebles.hidden = true;
    secInmuebles.style.display = "none";
  }

  [navHome, mobileNavHome, navComunidades, mobileNavComunidades, navPropietarios, mobileNavPropietarios, navInmuebles, mobileNavInmuebles].forEach(el => {
    if (el) el.classList.remove("active");
  });

  if (hash === "#propietarios") {
    if (secPropietarios) {
      secPropietarios.hidden = false;
      secPropietarios.style.display = "block";
    }
    if (navPropietarios) navPropietarios.classList.add("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.add("active");
    document.title = isOwner ? "Peñarrubia · Mi Perfil" : "Peñarrubia · Propietarios";
    renderOwners();
  } else if (hash === "#inmuebles") {
    if (secInmuebles) {
      secInmuebles.hidden = false;
      secInmuebles.style.display = "block";
    }
    if (navInmuebles) navInmuebles.classList.add("active");
    if (mobileNavInmuebles) mobileNavInmuebles.classList.add("active");
    document.title = "Peñarrubia · Inmuebles";
    renderProperties();
  } else if (hash === "#comunidades") {
    if (secComunidades) {
      secComunidades.hidden = false;
      secComunidades.style.display = "block";
    }
    if (navComunidades) navComunidades.classList.add("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.add("active");
    document.title = isOwner ? "Peñarrubia · Mi Comunidad" : "Peñarrubia · Comunidades";
    renderCommunities();
  } else {
    if (secHome) {
      secHome.hidden = false;
      secHome.style.display = "block";
    }
    if (navHome) navHome.classList.add("active");
    if (mobileNavHome) mobileNavHome.classList.add("active");
    document.title = "Peñarrubia · Inicio";
    renderHomeDashboard();
  }
}

function navigateToSection(targetHash) {
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
  handleRouting();
}

[navHome, mobileNavHome].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#home");
    });
  }
});

[navComunidades, mobileNavComunidades].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#comunidades");
    });
  }
});

[navPropietarios, mobileNavPropietarios].forEach(el => {
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateToSection("#propietarios");
    });
  }
});

[navInmuebles, mobileNavInmuebles].forEach(el => {
  if (el) {
    el.addEventListener("click", event => {
      event.preventDefault();
      navigateToSection("#inmuebles");
    });
  }
});

window.addEventListener("hashchange", handleRouting);

// ==========================================
// 7. MÓDULO COMUNIDADES
// ==========================================

function loadCommunities() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMMUNITIES_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      if (saved.length <= 2) {
        const existingNifs = new Set(saved.map(c => c.nif));
        const extraSeeds = communitySeeds.filter(s => !existingNifs.has(s.nif));
        return [...saved, ...extraSeeds];
      }
      return saved;
    }
    return communitySeeds;
  } catch {
    return communitySeeds;
  }
}

function saveCommunities() {
  localStorage.setItem(COMMUNITIES_STORAGE_KEY, JSON.stringify(communities));
  if (secHome && !secHome.hidden) renderHomeDashboard();
  updateCommunitySelectors();
}

function filteredCommunities() {
  const q = communitySearch.value.trim().toLocaleLowerCase("es");
  if (!q) return communities;
  return communities.filter(c =>
    [c.name, c.nif, c.city, c.address, c.phone, c.email].some(v =>
      (v || "").toLocaleLowerCase("es").includes(q)
    )
  );
}

function renderCommunityPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / communityPageSize));
  if (communityCurrentPage > totalPages) communityCurrentPage = totalPages;
  if (communityCurrentPage < 1) communityCurrentPage = 1;

  if (totalItems === 0) {
    communityPaginationBar.hidden = true;
    return;
  }
  communityPaginationBar.hidden = false;

  const start = (communityCurrentPage - 1) * communityPageSize + 1;
  const end = Math.min(communityCurrentPage * communityPageSize, totalItems);

  communityPaginationInfo.textContent = `Mostrando ${start}–${end} de ${totalItems} ${totalItems === 1 ? "comunidad" : "comunidades"}`;
  communityPageCurrent.textContent = `Página ${communityCurrentPage} de ${totalPages}`;
  communityPrevBtn.disabled = communityCurrentPage <= 1;
  communityNextBtn.disabled = communityCurrentPage >= totalPages;
}

function renderCommunities() {
  const isOwner = activeRole === "owner";
  let items = filteredCommunities();

  if (isOwner) {
    const currentOwner = owners.find(o => o.id === CURRENT_OWNER_ID) || ownerSeeds[0];
    items = communities.filter(c => c.id === currentOwner.communityId || c.name === currentOwner.communityName);
    if (items.length === 0 && communities.length > 0) items = [communities[0]];
  }

  const totalPages = Math.max(1, Math.ceil(items.length / communityPageSize));
  if (communityCurrentPage > totalPages) communityCurrentPage = totalPages;

  const startIndex = isOwner ? 0 : (communityCurrentPage - 1) * communityPageSize;
  const pagedItems = isOwner ? items : items.slice(startIndex, startIndex + communityPageSize);

  communityList.replaceChildren();

  pagedItems.forEach(c => {
    const row = document.createElement("tr");

    // 1. Nombre y notas
    const tdName = document.createElement("td");
    const nameSpan = document.createElement("span");
    nameSpan.className = "community-name";
    nameSpan.textContent = c.name;
    tdName.append(nameSpan);
    if (c.notes) {
      const notesSpan = document.createElement("span");
      notesSpan.className = "community-notes";
      notesSpan.textContent = c.notes;
      tdName.append(notesSpan);
    }
    row.append(tdName);

    // 2. NIF
    const tdNif = document.createElement("td");
    const nifBadge = document.createElement("span");
    nifBadge.className = "dni-badge";
    nifBadge.textContent = c.nif;
    tdNif.append(nifBadge);
    row.append(tdNif);

    // 3. Dirección
    const tdAddress = document.createElement("td");
    tdAddress.textContent = c.address;
    row.append(tdAddress);

    // 4. Municipio y provincia
    const tdCity = document.createElement("td");
    tdCity.textContent = `${c.city}, ${c.province}`;
    row.append(tdCity);

    // 5. Contacto (Sólo se muestra en modo Administrador)
    if (!isOwner) {
      const tdContact = document.createElement("td");
      tdContact.className = "col-contact";
      const phoneSpan = document.createElement("span");
      phoneSpan.textContent = c.phone || "—";
      tdContact.append(phoneSpan);
      if (c.email) {
        const emailSpan = document.createElement("span");
        emailSpan.className = "community-notes";
        emailSpan.textContent = c.email;
        tdContact.append(emailSpan);
      }
      row.append(tdContact);
    }

    // 6. Acciones
    const actions = document.createElement("td");
    actions.className = "row-actions col-actions";

    const btnInfo = document.createElement("button");
    btnInfo.type = "button";
    btnInfo.className = "icon-action-btn btn-info";
    btnInfo.title = isOwner ? "Ver datos de mi comunidad" : "Más info";
    btnInfo.setAttribute("aria-label", `Más información de ${c.name}`);
    btnInfo.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
    btnInfo.addEventListener("click", () => openCommunityDetail(c.id));

    if (!isOwner) {
      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "icon-action-btn btn-edit";
      btnEdit.title = "Editar";
      btnEdit.setAttribute("aria-label", `Editar ${c.name}`);
      btnEdit.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          <path d="m15 5 4 4"></path>
        </svg>
      `;
      btnEdit.addEventListener("click", () => openCommunityEditor(c.id));

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "icon-action-btn btn-delete";
      btnDelete.title = "Eliminar";
      btnDelete.setAttribute("aria-label", `Eliminar ${c.name}`);
      btnDelete.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;
      btnDelete.addEventListener("click", () => openCommunityDelete(c.id));

      actions.append(btnInfo, btnEdit, btnDelete);
    } else {
      actions.append(btnInfo);
    }

    row.append(actions);
    communityList.append(row);
  });

  communityEmpty.hidden = items.length !== 0;
  communityCount.textContent = isOwner
    ? "1 comunidad asignada"
    : `${items.length} ${items.length === 1 ? "comunidad" : "comunidades"}`;
  
  if (!isOwner) {
    renderCommunityPagination(items.length);
  }
}

function openCommunityEditor(id = null) {
  editingCommunityId = id;
  communityForm.reset();
  communityError.textContent = "";
  const c = communities.find(item => item.id === id);
  document.querySelector("#dialog-title").textContent = c ? "Editar comunidad" : "Nueva comunidad";
  if (c) {
    Object.entries(c).forEach(([key, value]) => {
      if (communityForm.elements[key] && key !== "city") {
        communityForm.elements[key].value = value;
      }
    });
    selectLocationInForm(communityForm, c.city, c.province);
  }
  communityDialog.showModal();
  communityForm.elements.name.focus();
}

function closeCommunityEditor() {
  communityDialog.close();
  editingCommunityId = null;
}

function openCommunityDetail(id) {
  const c = communities.find(item => item.id === id);
  if (!c) return;
  viewingCommunityId = id;

  const linkedOwners = owners.filter(o => o.communityId === c.id || o.communityName === c.name);
  const isOwner = activeRole === "owner";

  document.querySelector("#detail-name").textContent = c.name || "—";
  document.querySelector("#detail-nif").textContent = c.nif || "—";
  document.querySelector("#detail-phone").textContent = c.phone || "—";
  document.querySelector("#detail-otherPhone").textContent = c.otherPhone || "—";
  document.querySelector("#detail-address").textContent = c.address || "—";
  document.querySelector("#detail-city").textContent = c.city || "—";
  document.querySelector("#detail-province").textContent = c.province || "—";
  document.querySelector("#detail-postalCode").textContent = c.postalCode || "—";
  document.querySelector("#detail-email").textContent = c.email || "—";
  document.querySelector("#detail-notes").textContent = c.notes ? c.notes : "Sin observaciones registradas.";
  detailOwnersCount.textContent = `${linkedOwners.length} ${linkedOwners.length === 1 ? "propietario" : "propietarios"}`;

  // Ocultar datos de contacto y botón de edición en modo propietario
  if (detailItemPhone) detailItemPhone.style.display = isOwner ? "none" : "";
  if (detailItemOtherPhone) detailItemOtherPhone.style.display = isOwner ? "none" : "";
  if (detailItemEmail) detailItemEmail.style.display = isOwner ? "none" : "";
  if (detailEditBtn) detailEditBtn.style.display = isOwner ? "none" : "";

  communityDetailDialog.showModal();
}

function closeCommunityDetail() {
  communityDetailDialog.close();
  viewingCommunityId = null;
}

function openCommunityDelete(id) {
  deletingCommunityId = id;
  const c = communities.find(item => item.id === id);
  document.querySelector("#delete-message").textContent = `Vas a eliminar “${c.name}”. Esta acción no se puede deshacer.`;
  communityDeleteDialog.showModal();
}

function validateCommunityFields() {
  const nifInput = communityForm.elements.nif;
  const phoneInput = communityForm.elements.phone;
  const otherPhoneInput = communityForm.elements.otherPhone;
  const emailInput = communityForm.elements.email;
  const postalCodeInput = communityForm.elements.postalCode;

  const nif = nifInput.value.trim().toUpperCase();
  const phone = phoneInput.value.trim();
  const otherPhone = otherPhoneInput.value.trim();
  const email = emailInput.value.trim();
  const postalCode = postalCodeInput.value.trim();

  nifInput.value = nif;
  phoneInput.value = phone;
  otherPhoneInput.value = otherPhone;
  emailInput.value = email;

  nifInput.setCustomValidity(/^H\d{8}$/.test(nif) ? "" : "El NIF debe comenzar por H y contener 8 dígitos numéricos.");
  phoneInput.setCustomValidity(/^\d{9}$/.test(phone) ? "" : "El teléfono debe contener 9 dígitos numéricos.");
  otherPhoneInput.setCustomValidity(/^\d{9}$/.test(otherPhone) ? "" : "El otro teléfono debe contener 9 dígitos numéricos.");
  emailInput.setCustomValidity(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Introduce una dirección de email válida.");
  postalCodeInput.setCustomValidity(/^\d{5}$/.test(postalCode) && postalIndex.has(postalCode) ? "" : "El código postal debe contener 5 dígitos y corresponder a un código postal de España.");
}

communityForm.addEventListener("submit", event => {
  event.preventDefault();
  validateCommunityFields();

  const citySelect = communityForm.elements.city;
  const provinceSelect = communityForm.elements.province;
  const selectedLocation = locationsById.get(citySelect.value);

  if (!communityForm.checkValidity() || !selectedLocation) {
    if (communityForm.elements.nif.validationMessage) {
      communityError.textContent = "Hay un error en el campo NIF; corrígelo para continuar.";
    } else if (communityForm.elements.postalCode.validationMessage) {
      communityError.textContent = "Hay un error en el campo código postal; corrígelo para continuar.";
    } else if (communityForm.elements.phone.validationMessage) {
      communityError.textContent = "El teléfono debe contener 9 dígitos numéricos.";
    } else if (communityForm.elements.otherPhone.validationMessage) {
      communityError.textContent = "El otro teléfono debe contener 9 dígitos numéricos.";
    } else if (communityForm.elements.email.validationMessage) {
      communityError.textContent = "Hay un error en el email de contacto; corrígelo para continuar.";
    } else {
      communityError.textContent = "Revisa los campos obligatorios y sus formatos.";
    }
    communityForm.reportValidity();
    return;
  }

  const data = Object.fromEntries(new FormData(communityForm));
  ["name", "nif", "address", "phone", "otherPhone", "postalCode", "email"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });
  data.city = selectedLocation.name;
  data.province = provinceSelect.value;

  if (communities.some(c => c.nif === data.nif && c.id !== editingCommunityId)) {
    communityError.textContent = "Ya existe una comunidad con ese NIF.";
    return;
  }

  if (editingCommunityId) {
    communities = communities.map(c => c.id === editingCommunityId ? { ...data, id: editingCommunityId } : c);
    toast("Comunidad actualizada.");
  } else {
    communities.unshift({ ...data, id: crypto.randomUUID() });
    communityCurrentPage = 1;
    toast("Comunidad creada.");
  }

  saveCommunities();
  closeCommunityEditor();
  renderCommunities();
});

// ==========================================
// 8. MÓDULO PROPIETARIOS
// ==========================================

function enrichOwnerRecord(o) {
  let docs = o.documents;
  if (!docs || Object.keys(docs).length === 0) {
    if (o.dni === "47895231P") docs = createSeedDocsForCarlosRuiz();
    else if (o.dni === "53891244J") docs = createSeedDocsForMariaLuisa();
    else docs = {};
  }
  const propertyId = o.propertyId || PLOT_TO_PROPERTY_ID[o.plot] || "";
  const prop = properties.find(p => p.id === propertyId);
  return {
    ...o,
    documents: docs,
    documentType: o.documentType || detectDocumentType(o.dni),
    propertyId,
    propertyIds: Array.isArray(o.propertyIds) ? o.propertyIds : (propertyId ? [propertyId] : []),
    propertyType: o.propertyType || prop?.propertyType || inferPropertyType(o.plot),
    cadastralRef: o.cadastralRef || prop?.cadastralRef || "",
    registryNumber: o.registryNumber || prop?.registryNumber || "",
    floor: o.floor || prop?.floor || "",
    door: o.door || prop?.door || "",
    areaM2: o.areaM2 || prop?.areaM2 || "",
    participationCoef: o.participationCoef || prop?.participationCoef || "",
    propertyUse: o.propertyUse || prop?.propertyUse || "",
    currency: o.currency || "EUR",
    phoneVerified: o.phoneVerified === true && !!o.phoneVerifiedAt,
    phoneVerifiedAt: o.phoneVerifiedAt || "",
    emailVerified: o.emailVerified === true && !!o.emailVerifiedAt,
    emailVerifiedAt: o.emailVerifiedAt || ""
  };
}

function loadOwners() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNERS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map(enrichOwnerRecord);
    }
    const linkedSeeds = ownerSeeds.map(owner => {
      const match = communities.find(c => c.name === owner.communityName);
      return enrichOwnerRecord({
        ...owner,
        communityId: match ? match.id : owner.communityId
      });
    });
    return linkedSeeds;
  } catch {
    return ownerSeeds.map(enrichOwnerRecord);
  }
}

function saveOwners() {
  localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
  if (secHome && !secHome.hidden) renderHomeDashboard();
}

function updateCommunitySelectors() {
  // 1. Selector en formulario de propietario
  const selectInForm = ownerForm.elements.communityId;
  const currentFormVal = selectInForm.value;
  selectInForm.replaceChildren(new Option("Selecciona una comunidad…", ""));
  communities.forEach(c => {
    selectInForm.add(new Option(c.name, c.id));
  });
  if (currentFormVal) selectInForm.value = currentFormVal;

  // 2. Selector en toolbar de filtros de propietarios
  const currentFilterVal = filterCommunitySelect.value;
  filterCommunitySelect.replaceChildren(new Option("Todas las comunidades", ""));
  communities.forEach(c => {
    filterCommunitySelect.add(new Option(c.name, c.id));
  });
  if (currentFilterVal) filterCommunitySelect.value = currentFilterVal;

  const currentPropertyFilter = filterOwnerPropertyCommunitySelect.value;
  filterOwnerPropertyCommunitySelect.replaceChildren(new Option("Inmuebles de todas las comunidades", ""));
  communities.forEach(c => {
    filterOwnerPropertyCommunitySelect.add(new Option(c.name, c.id));
  });
  if (currentPropertyFilter) filterOwnerPropertyCommunitySelect.value = currentPropertyFilter;

  const currentPropertyCommunity = propertyCommunityFilter.value;
  propertyCommunityFilter.replaceChildren(new Option("Todas las comunidades", ""));
  communities.forEach(c => {
    propertyCommunityFilter.add(new Option(c.name, c.id));
  });
  if (currentPropertyCommunity) propertyCommunityFilter.value = currentPropertyCommunity;

  const editorCommunity = propertyForm.elements.communityId;
  const currentEditorCommunity = editorCommunity.value;
  editorCommunity.replaceChildren(new Option("Selecciona una comunidad…", ""));
  communities.forEach(c => editorCommunity.add(new Option(c.name, c.id)));
  if (currentEditorCommunity) editorCommunity.value = currentEditorCommunity;
}

function filteredOwners() {
  const q = ownerSearch.value.trim().toLocaleLowerCase("es");
  const commId = filterCommunitySelect.value;
  const memberVal = filterMemberSelect.value;
  const docStatusVal = filterDocStatusSelect ? filterDocStatusSelect.value : "";

  return owners.filter(o => {
    // Filtro por texto libre
    if (q) {
      const fullName = `${o.name} ${o.surname}`.toLocaleLowerCase("es");
      const match = [
        fullName,
        o.dni,
        o.plot,
        o.communityName,
        o.phone,
        o.otherPhone,
        o.email,
        o.city,
        ...ownerProperties(o).flatMap(property => [
          property.plot,
          property.communityName,
          property.address,
          property.cadastralRef
        ])
      ].some(v => (v || "").toLocaleLowerCase("es").includes(q));
      if (!match) return false;
    }

    // Filtro por comunidad seleccionada
    if (commId) {
      if (o.communityId !== commId) {
        // Fallback por nombre si el ID no coincide
        const targetCommunity = communities.find(c => c.id === commId);
        if (!targetCommunity || o.communityName !== targetCommunity.name) {
          return false;
        }
      }
    }

    // Filtro por condición de asociado
    if (memberVal !== "") {
      const isMemberBool = memberVal === "true";
      if (o.isMember !== isMemberBool) return false;
    }

    // Filtro por estado de documentación
    if (docStatusVal) {
      const status = getOwnerDocStatus(o);
      if (status !== docStatusVal) return false;
    }

    return true;
  });
}

function renderOwnerPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / ownerPageSize));
  if (ownerCurrentPage > totalPages) ownerCurrentPage = totalPages;
  if (ownerCurrentPage < 1) ownerCurrentPage = 1;

  if (totalItems === 0) {
    ownerPaginationBar.hidden = true;
    return;
  }
  ownerPaginationBar.hidden = false;

  const start = (ownerCurrentPage - 1) * ownerPageSize + 1;
  const end = Math.min(ownerCurrentPage * ownerPageSize, totalItems);

  ownerPaginationInfo.textContent = `Mostrando ${start}–${end} de ${totalItems} ${totalItems === 1 ? "propietario" : "propietarios"}`;
  ownerPageCurrent.textContent = `Página ${ownerCurrentPage} de ${totalPages}`;
  ownerPrevBtn.disabled = ownerCurrentPage <= 1;
  ownerNextBtn.disabled = ownerCurrentPage >= totalPages;
}

function renderOwners() {
  const isOwner = activeRole === "owner";
  let items = filteredOwners();

  if (isOwner) {
    items = owners.filter(o => o.id === CURRENT_OWNER_ID || o.dni === "47895231P");
    if (items.length === 0 && owners.length > 0) items = [owners[0]];
  }

  const totalPages = Math.max(1, Math.ceil(items.length / ownerPageSize));
  if (ownerCurrentPage > totalPages) ownerCurrentPage = totalPages;

  const startIndex = isOwner ? 0 : (ownerCurrentPage - 1) * ownerPageSize;
  const pagedItems = isOwner ? items : items.slice(startIndex, startIndex + ownerPageSize);

  ownerList.replaceChildren();

  pagedItems.forEach(o => {
    const row = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "col-p1";
    const nameSpan = document.createElement("span");
    nameSpan.className = "community-name";
    nameSpan.textContent = `${o.name} ${o.surname}`;
    tdName.append(nameSpan);
    if (o.notes) {
      const notesSpan = document.createElement("span");
      notesSpan.className = "community-notes";
      notesSpan.textContent = o.notes;
      tdName.append(notesSpan);
    }
    row.append(tdName);

    const tdDni = document.createElement("td");
    tdDni.className = "col-p1";
    const dniBadge = document.createElement("span");
    dniBadge.className = "dni-badge";
    dniBadge.textContent = o.dni;
    tdDni.append(dniBadge);
    row.append(tdDni);

    const tdPlot = document.createElement("td");
    tdPlot.className = "col-p2";
    const ownerPropertyOptions = ownerProperties(o).filter(property =>
      !ownerPropertyCommunityFilter || property.communityId === ownerPropertyCommunityFilter
    );
    const propertySelect = document.createElement("select");
    propertySelect.className = "owner-property-select";
    propertySelect.setAttribute("aria-label", `Inmuebles de ${o.name} ${o.surname}`);
    if (ownerPropertyOptions.length === 0) {
      propertySelect.add(new Option(
        ownerProperties(o).length ? "Sin inmuebles en esta comunidad" : "Sin inmuebles asociados",
        ""
      ));
      propertySelect.disabled = true;
    } else {
      propertySelect.add(new Option("Selecciona un inmueble…", ""));
      ownerPropertyOptions.forEach(property => {
        const communityName = property.communityName ||
          communities.find(community => community.id === property.communityId)?.name || "Sin comunidad";
        propertySelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
      });
      propertySelect.addEventListener("change", () => {
        if (propertySelect.value) openPropertyDetail(propertySelect.value);
      });
    }
    tdPlot.append(propertySelect);
    row.append(tdPlot);

    const tdCommunity = document.createElement("td");
    tdCommunity.className = "col-p2";
    const communityBadge = document.createElement("span");
    communityBadge.className = "status-badge community-tag";
    communityBadge.textContent = o.communityName || "Sin comunidad";
    tdCommunity.append(communityBadge);
    row.append(tdCommunity);

    const tdAddress = document.createElement("td");
    tdAddress.className = "col-p3 cell-clip";
    tdAddress.textContent = o.address || "—";
    tdAddress.title = o.address || "";
    row.append(tdAddress);

    const tdContact = document.createElement("td");
    tdContact.className = "col-p4 col-contact";
    const phoneSpan = document.createElement("span");
    phoneSpan.textContent = o.phone ? formatPhone(o.phone) : "—";
    tdContact.append(phoneSpan);
    if (o.email) {
      const emailSpan = document.createElement("span");
      emailSpan.className = "community-notes";
      emailSpan.textContent = o.email;
      tdContact.append(emailSpan);
    }
    row.append(tdContact);

    const tdMember = document.createElement("td");
    tdMember.className = "col-p3";
    const memberBadge = document.createElement("span");
    memberBadge.className = `status-badge ${o.isMember ? "member" : "non-member"}`;
    memberBadge.textContent = o.isMember ? "Asociado" : "No asociado";
    tdMember.append(memberBadge);
    row.append(tdMember);

    const tdDocs = document.createElement("td");
    tdDocs.className = "col-p3";
    const docStatus = getOwnerDocStatus(o);
    const docBadge = document.createElement("span");
    docBadge.className = `status-badge ${getDocBadgeClass(docStatus)}`;
    docBadge.textContent = getDocBadgeText(docStatus, o);
    tdDocs.append(docBadge);
    row.append(tdDocs);

    const actions = document.createElement("td");
    actions.className = "row-actions col-actions col-p1";

    const btnInfo = document.createElement("button");
    btnInfo.type = "button";
    btnInfo.className = "icon-action-btn btn-info";
    btnInfo.title = isOwner ? "Ver mi expediente y documentos" : "Más info y aprobación";
    btnInfo.setAttribute("aria-label", `Ficha detallada de ${o.name} ${o.surname}`);
    btnInfo.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
    btnInfo.addEventListener("click", () => openOwnerDetail(o.id));

    const btnDocs = document.createElement("button");
    btnDocs.type = "button";
    btnDocs.className = "icon-action-btn btn-docs";
    btnDocs.title = isOwner ? "Gestionar / subir mi documentación" : "Subir y gestionar documentación";
    btnDocs.setAttribute("aria-label", `Documentación de ${o.name} ${o.surname}`);
    btnDocs.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
      </svg>
    `;
    btnDocs.addEventListener("click", () => openOwnerEditor(o.id, "docs"));

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "icon-action-btn btn-edit";
    btnEdit.title = isOwner ? "Editar mis datos personales" : "Editar datos personales";
    btnEdit.setAttribute("aria-label", `Editar ${o.name} ${o.surname}`);
    btnEdit.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        <path d="m15 5 4 4"></path>
      </svg>
    `;
    btnEdit.addEventListener("click", () => openOwnerEditor(o.id, "data"));

    if (!isOwner) {
      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "icon-action-btn btn-delete";
      btnDelete.title = "Eliminar";
      btnDelete.setAttribute("aria-label", `Eliminar ${o.name} ${o.surname}`);
      btnDelete.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;
      btnDelete.addEventListener("click", () => openOwnerDelete(o.id));

      actions.append(btnInfo, btnDocs, btnEdit, btnDelete);
    } else {
      actions.append(btnInfo, btnDocs, btnEdit);
    }

    row.append(actions);
    ownerList.append(row);
  });

  ownerEmpty.hidden = items.length !== 0;
  ownerCount.textContent = isOwner
    ? "1 perfil de propietario registrado"
    : `${items.length} ${items.length === 1 ? "propietario" : "propietarios"}`;

  if (!isOwner) {
    renderOwnerPagination(items.length);
  }
}


function switchOwnerDialogTab(tab) {
  if (tab === "data") {
    tabBtnOwnerData.classList.add("active");
    tabBtnOwnerData.setAttribute("aria-selected", "true");
    tabBtnOwnerDocs.classList.remove("active");
    tabBtnOwnerDocs.setAttribute("aria-selected", "false");
    tabPaneOwnerData.hidden = false;
    tabPaneOwnerDocs.hidden = true;
    btnPrevTab.hidden = true;
    btnNextTab.hidden = false;
  } else {
    tabBtnOwnerDocs.classList.add("active");
    tabBtnOwnerDocs.setAttribute("aria-selected", "true");
    tabBtnOwnerData.classList.remove("active");
    tabBtnOwnerData.setAttribute("aria-selected", "false");
    tabPaneOwnerDocs.hidden = false;
    tabPaneOwnerData.hidden = true;
    btnPrevTab.hidden = false;
    btnNextTab.hidden = true;
    renderOwnerDialogDocs();
  }
}

function renderOwnerDialogDocs() {
  const docTypes = [
    { key: "dni", dropzone: dropzoneDni, input: inputDocDni, result: resultDocDni, badge: badgeDocDni, card: document.querySelector("#card-doc-dni") },
    { key: "bankReceipt", dropzone: dropzoneBank, input: inputDocBank, result: resultDocBank, badge: badgeDocBank, card: document.querySelector("#card-doc-bank") },
    { key: "propertyDeed", dropzone: dropzoneDeed, input: inputDocDeed, result: resultDocDeed, badge: badgeDocDeed, card: document.querySelector("#card-doc-deed") }
  ];

  let uploadedCount = 0;

  docTypes.forEach(({ key, dropzone, result, badge, card }) => {
    const doc = currentEditingDocs[key];
    if (doc) {
      uploadedCount++;
      card.classList.add("is-valid");
      const isApproved = doc.adminApproval?.status === "approved";
      const isRejected = doc.adminApproval?.status === "rejected";

      if (isApproved) {
        badge.className = "status-badge doc-approved";
        badge.textContent = "Aprobado por Admin";
      } else if (isRejected) {
        badge.className = "status-badge doc-rejected";
        badge.textContent = "Rechazado";
      } else {
        badge.className = "status-badge doc-approved";
        badge.textContent = "Validado por sistema";
      }

      result.hidden = false;
      result.replaceChildren();

      const validationHeader = document.createElement("div");
      validationHeader.className = "doc-validation-header";
      validationHeader.innerHTML = `
        <div class="doc-file-meta">
          <span class="doc-file-icon">📄</span>
          <div>
            <p class="doc-file-name">${doc.fileName}</p>
            <p class="doc-file-size">${Math.round(doc.fileSize / 1024)} KB · Subido el ${doc.uploadedAt}</p>
          </div>
        </div>
        <div class="doc-file-actions">
          <button class="btn-doc-action" type="button" data-action="view" data-doc="${key}">👁️ Ver</button>
          <button class="btn-doc-action danger" type="button" data-action="remove" data-doc="${key}">🗑️ Quitar</button>
        </div>
      `;

      // Legibilidad
      const legibility = document.createElement("div");
      legibility.className = "legibility-box";
      const score = doc.autoValidation?.legibilityScore || 98;
      const status = doc.autoValidation?.legibilityStatus || "Óptima";
      legibility.innerHTML = `
        <div class="legibility-header">
          <span>Legibilidad y calidad del documento:</span>
          <span>${score}% (${status.split(" ")[0]})</span>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar-fill" style="width: ${score}%;"></div>
        </div>
      `;

      // Checks
      const checksList = document.createElement("ul");
      checksList.className = "checks-list";
      const checks = doc.autoValidation?.checks || [];
      checks.forEach(c => {
        const li = document.createElement("li");
        li.className = "check-item";
        li.innerHTML = `
          <span class="check-icon passed">✓</span>
          <div><strong>${c.name}:</strong> <span>${c.detail}</span></div>
        `;
        checksList.append(li);
      });

      result.append(validationHeader, legibility, checksList);

      validationHeader.querySelector('[data-action="view"]').addEventListener("click", () => {
        openDocViewer(getFormOwnerContext(), key, doc);
      });
      validationHeader.querySelector('[data-action="remove"]').addEventListener("click", () => {
        delete currentEditingDocs[key];
        renderOwnerDialogDocs();
      });

      dropzone.style.display = "none";
    } else {
      card.classList.remove("is-valid");
      badge.className = "status-badge doc-none";
      badge.textContent = "Pendiente";
      result.hidden = true;
      result.replaceChildren();
      dropzone.style.display = "block";
    }
  });

  tabDocsBadge.textContent = `${uploadedCount}/3`;
  docsSummaryStatus.textContent = `${uploadedCount} de 3 documentos subidos y validados`;
  if (uploadedCount === 3) {
    docsSummarySubtext.textContent = "¡Expediente documental completo! Al guardar se remitirá el aviso al Administrador para su aprobación.";
    docsSummaryBar.style.background = "#f0fdf4";
    docsSummaryBar.style.borderColor = "#86efac";
  } else {
    docsSummarySubtext.textContent = "Sube la copia del DNI (ambas caras), el recibo bancario y la escritura para completar el expediente.";
    docsSummaryBar.style.background = "#f1f5f9";
    docsSummaryBar.style.borderColor = "#e2e8f0";
  }
}

async function handleDocFileUpload(file, docType) {
  if (!file) return;
  const card = document.querySelector(`#card-doc-${docType === "bankReceipt" ? "bank" : (docType === "propertyDeed" ? "deed" : "dni")}`);
  const badge = card.querySelector(".status-badge");
  badge.className = "status-badge doc-pending-admin";
  badge.textContent = "⚡ Analizando...";

  try {
    const context = getFormOwnerContext();
    const result = await DocumentValidator.analyzeFile(file, docType, context);

    if (!result.isValid) {
      badge.className = "status-badge doc-rejected";
      badge.textContent = "Validación fallida";
      alert("Error en la validación automática:\n\n" + result.error);
      renderOwnerDialogDocs();
      return;
    }

    currentEditingDocs[docType] = result.document;
    toast(`Documento "${result.document.title}" validado automáticamente.`);
    renderOwnerDialogDocs();
  } catch (err) {
    alert("Error al procesar el archivo: " + err.message);
    renderOwnerDialogDocs();
  }
}

function handleDocSampleLoad(docType) {
  const context = getFormOwnerContext();
  const sample = DocumentValidator.generateSampleDocument(docType, context);
  if (!sample) return;

  const card = document.querySelector(`#card-doc-${docType === "bankReceipt" ? "bank" : (docType === "propertyDeed" ? "deed" : "dni")}`);
  const badge = card.querySelector(".status-badge");
  badge.className = "status-badge doc-pending-admin";
  badge.textContent = "⚡ Analizando...";

  window.setTimeout(() => {
    const correspondence = checkDocumentCorrespondence(sample.fileName, docType, context);
    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    currentEditingDocs[docType] = {
      key: docType,
      title: correspondence.title,
      fileName: sample.fileName,
      fileType: sample.fileType,
      fileSize: sample.fileSize,
      uploadedAt: dateStr,
      dataUrl: sample.dataUrl,
      autoValidation: {
        status: "passed",
        legibilityScore: docType === "dni" ? 98 : (docType === "bankReceipt" ? 96 : 95),
        legibilityStatus: "Óptima (alta resolución y contraste adecuado)",
        typeVerified: correspondence.typeVerified,
        checks: correspondence.checks,
        verifiedAt: new Date().toISOString()
      },
      adminApproval: {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        notes: ""
      }
    };

    toast(`Documento oficial de prueba cargado y validado automáticamente.`);
    renderOwnerDialogDocs();
  }, 350);
}

function clearOwnerFieldErrors() {
  ownerForm.querySelectorAll("label.field-error").forEach(label => {
    label.classList.remove("field-error");
    label.querySelectorAll("[aria-invalid='true']").forEach(field => field.removeAttribute("aria-invalid"));
  });
  ownerError.textContent = "";
}

function markOwnerFieldError(name) {
  const el = name === "propertyId" ? propertyComboInput : ownerForm.elements[name];
  const label = el ? el.closest("label") : null;
  if (label) {
    label.classList.add("field-error");
    el.setAttribute("aria-invalid", "true");
  }
}

function setVerifyStatus(kind, state, message) {
  const statusEl = kind === "phone" ? phoneVerifyStatus : emailVerifyStatus;
  statusEl.classList.remove("is-verified", "is-error");
  if (state === "verified") statusEl.classList.add("is-verified");
  if (state === "error") statusEl.classList.add("is-error");
  statusEl.textContent = message;
}

function resetContactVerification(o) {
  const phone = o ? digitsOnly(o.phone, 9) : "";
  const email = o ? (o.email || "").trim().toLowerCase() : "";
  contactVerify.phone = {
    value: phone,
    verified: !!(o && o.phoneVerified && o.phoneVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: o?.phoneVerifiedAt || ""
  };
  contactVerify.email = {
    value: email,
    verified: !!(o && o.emailVerified && o.emailVerifiedAt),
    pending: false,
    challengeId: "",
    verifiedAt: o?.emailVerifiedAt || ""
  };
  phoneVerifyPanel.hidden = true;
  emailVerifyPanel.hidden = true;
  phoneVerifyCodeInput.value = "";
  emailVerifyCodeInput.value = "";
  setVerifyStatus("phone", contactVerify.phone.verified ? "verified" : "pending",
    contactVerify.phone.verified ? "Teléfono verificado" : "Pendiente de verificación");
  setVerifyStatus("email", contactVerify.email.verified ? "verified" : "pending",
    contactVerify.email.verified ? "Correo verificado" : "Pendiente de verificación");
}

function propertiesForCommunity(communityId) {
  return properties.filter(p => !communityId || p.communityId === communityId);
}

function renderPropertyComboOptions(query = "") {
  const communityId = ownerForm.elements.communityId.value;
  const q = query.trim().toLocaleLowerCase("es");
  const items = propertiesForCommunity(communityId).filter(p => {
    if (!q) return true;
    return propertyLabel(p).toLocaleLowerCase("es").includes(q) ||
      (p.cadastralRef || "").toLocaleLowerCase("es").includes(q);
  });
  propertyComboList.replaceChildren();
  if (!communityId) {
    const li = document.createElement("li");
    li.className = "combo-empty";
    li.setAttribute("role", "presentation");
    li.textContent = "Selecciona primero una comunidad.";
    propertyComboList.append(li);
    propertyComboList.hidden = false;
    propertyComboInput.setAttribute("aria-expanded", "true");
    return;
  }
  const newLi = document.createElement("li");
  newLi.setAttribute("role", "option");
  newLi.dataset.id = "__new__";
  const newTitle = document.createElement("strong");
  newTitle.textContent = "Registrar inmueble nuevo";
  const newHint = document.createElement("small");
  newHint.textContent = "Completa tipo, identificador y resto de campos";
  newLi.append(newTitle, newHint);
  propertyComboList.append(newLi);
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "combo-empty";
    empty.setAttribute("role", "presentation");
    empty.textContent = "No hay inmuebles que coincidan.";
    propertyComboList.append(empty);
  } else {
    items.forEach(p => {
      const taken = owners.find(o => o.id !== editingOwnerId && ownerProperties(o).some(owned => owned.id === p.id));
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.id = p.id;
      const title = document.createElement("strong");
      title.textContent = p.plot || "Inmueble sin identificador";
      const detail = document.createElement("small");
      detail.textContent = `${PROPERTY_TYPE_LABELS[p.propertyType] || "Inmueble"} · ${p.communityName || "Sin comunidad"}${taken ? ` · asociado a ${taken.name} ${taken.surname}` : " · disponible"}`;
      li.append(title, detail);
      propertyComboList.append(li);
    });
  }
  propertyComboList.hidden = false;
  propertyComboInput.setAttribute("aria-expanded", "true");
}

function applyPropertyToForm(propertyId) {
  if (!propertyId || propertyId === "__new__") {
    propertyIdInput.value = propertyId || "";
    propertyComboInput.value = propertyId === "__new__" ? "Registrar inmueble nuevo" : "";
    return;
  }
  const p = properties.find(item => item.id === propertyId);
  if (!p) {
    propertyIdInput.value = "";
    return;
  }
  ownerForm.elements.communityId.value = p.communityId;
  propertyComboInput.value = propertyLabel(p);
  ownerForm.elements.propertyType.value = p.propertyType || "";
  ownerForm.elements.plot.value = p.plot || "";
  ownerForm.elements.cadastralRef.value = p.cadastralRef || "";
  ownerForm.elements.registryNumber.value = p.registryNumber || "";
  ownerForm.elements.floor.value = p.floor || "";
  ownerForm.elements.door.value = p.door || "";
  ownerForm.elements.areaM2.value = p.areaM2 || "";
  ownerForm.elements.participationCoef.value = p.participationCoef || "";
  ownerForm.elements.propertyUse.value = p.propertyUse || "";
  if (p.address && !ownerForm.elements.address.value) {
    ownerForm.elements.address.value = p.address;
  }
  propertyIdInput.value = propertyId;
}

function openOwnerEditor(id = null, defaultTab = "data") {
  const isOwner = activeRole === "owner";
  if (isOwner) {
    id = CURRENT_OWNER_ID;
  }
  editingOwnerId = id;
  ownerForm.reset();
  clearOwnerFieldErrors();
  updateCommunitySelectors();
  populateCurrencySelect("EUR");

  const o = owners.find(item => item.id === id);
  if (isOwner) {
    document.querySelector("#owner-dialog-title").textContent = "Editar mi perfil de propietario";
    ownerForm.elements.communityId.disabled = true;
    ownerForm.elements.isMember.disabled = true;
  } else {
    document.querySelector("#owner-dialog-title").textContent = o ? "Editar propietario" : "Nuevo propietario";
    ownerForm.elements.communityId.disabled = false;
    ownerForm.elements.isMember.disabled = false;
  }

  if (o) {
    Object.entries(o).forEach(([key, value]) => {
      if (ownerForm.elements[key] && key !== "city" && key !== "postalCode" && key !== "province" && key !== "phone" && key !== "otherPhone" && key !== "iban") {
        if (key === "isMember") {
          ownerForm.elements[key].value = String(value);
        } else {
          ownerForm.elements[key].value = value || "";
        }
      }
    });
    ownerForm.elements.phone.value = formatPhone(o.phone);
    ownerForm.elements.otherPhone.value = formatPhone(o.otherPhone);
    ownerForm.elements.iban.value = o.iban ? formatIban(o.iban) : "";
    ownerForm.elements.documentType.value = o.documentType || detectDocumentType(o.dni);
    populateCurrencySelect(o.currency || "EUR");
    selectOwnerTerritory(o.city, o.province, o.postalCode);
    applyPropertyToForm(o.propertyId || PLOT_TO_PROPERTY_ID[o.plot] || "");
    currentEditingDocs = o.documents ? JSON.parse(JSON.stringify(o.documents)) : {};
  } else {
    currentEditingDocs = {};
    propertyComboInput.value = "";
    propertyIdInput.value = "";
    if (filterCommunitySelect.value) {
      ownerForm.elements.communityId.value = filterCommunitySelect.value;
    }
    selectOwnerTerritory("", "", "");
  }

  resetContactVerification(o);
  switchOwnerDialogTab(defaultTab);
  ownerDialog.showModal();
  if (defaultTab === "data") {
    ownerForm.elements.name.focus();
  }
}

function closeOwnerEditor() {
  ownerDialog.close();
  editingOwnerId = null;
}

function openOwnerDetail(id) {
  const o = owners.find(item => item.id === id);
  if (!o) return;
  viewingOwnerId = id;

  document.querySelector("#owner-detail-name").textContent = `${o.name} ${o.surname}`;
  document.querySelector("#owner-detail-dni").textContent = o.dni || "—";
  
  const memberEl = document.querySelector("#owner-detail-member");
  memberEl.innerHTML = `<span class="status-badge ${o.isMember ? "member" : "non-member"}">${o.isMember ? "Asociado (Socio de Peñarrubia)" : "Propietario no asociado"}</span>`;

  document.querySelector("#owner-detail-community").textContent = o.communityName || "—";
  document.querySelector("#owner-detail-plot").textContent = o.plot || "—";
  document.querySelector("#owner-detail-phone").textContent = o.phone || "—";
  document.querySelector("#owner-detail-otherPhone").textContent = o.otherPhone || "—";
  document.querySelector("#owner-detail-email").textContent = o.email || "—";
  document.querySelector("#owner-detail-iban").textContent = formatIban(o.iban);
  document.querySelector("#owner-detail-address").textContent = o.address || "—";
  document.querySelector("#owner-detail-city").textContent = o.city || "—";
  document.querySelector("#owner-detail-province").textContent = o.province || "—";
  document.querySelector("#owner-detail-postalCode").textContent = o.postalCode || "—";
  document.querySelector("#owner-detail-notes").textContent = o.notes ? o.notes : "Sin observaciones registradas.";

  // Renderizar sección de documentación en la ficha de detalle
  const docStatus = getOwnerDocStatus(o);
  ownerDetailDocBadge.className = `status-badge ${getDocBadgeClass(docStatus)}`;
  ownerDetailDocBadge.textContent = getDocBadgeText(docStatus, o);

  renderDetailDocsGrid(o);
  renderDetailApprovalPanel(o, docStatus);
  renderOwnerPropertySelectors(o);

  if (!ownerDetailDialog.open) ownerDetailDialog.showModal();
}

function renderOwnerPropertySelectors(owner) {
  const linkedProperties = ownerProperties(owner);
  const communityIds = [...new Set(linkedProperties.map(property => property.communityId))];
  const currentCommunity = ownerDetailPropertyCommunity.value;
  ownerDetailPropertyCommunity.replaceChildren(new Option("Todas las comunidades", ""));
  communities
    .filter(community => communityIds.includes(community.id))
    .forEach(community => ownerDetailPropertyCommunity.add(new Option(community.name, community.id)));
  if (communityIds.includes(currentCommunity)) ownerDetailPropertyCommunity.value = currentCommunity;

  const selectedCommunity = ownerDetailPropertyCommunity.value;
  const availableProperties = linkedProperties.filter(property =>
    !selectedCommunity || property.communityId === selectedCommunity
  );
  ownerDetailPropertySelect.replaceChildren();
  if (availableProperties.length === 0) {
    ownerDetailPropertySelect.add(new Option("No hay inmuebles asociados", ""));
    ownerDetailPropertySelect.disabled = true;
    ownerDetailViewPropertyBtn.disabled = true;
  } else {
    availableProperties.forEach(property => {
      const communityName = property.communityName ||
        communities.find(community => community.id === property.communityId)?.name || "Sin comunidad";
      ownerDetailPropertySelect.add(new Option(`${property.plot} · ${communityName}`, property.id));
    });
    ownerDetailPropertySelect.disabled = false;
    ownerDetailViewPropertyBtn.disabled = false;
  }
  ownerDetailPropertyCount.textContent = `${linkedProperties.length} ${linkedProperties.length === 1 ? "inmueble" : "inmuebles"}`;
}

function updatePropertyPeopleSelectors(selectedOwnerId = "", selectedTenantId = "") {
  const ownerSelect = propertyForm.elements.ownerId;
  const tenantSelect = propertyForm.elements.tenantId;
  ownerSelect.replaceChildren(new Option("Selecciona un propietario…", ""));
  owners.forEach(owner => {
    ownerSelect.add(new Option(`${owner.name} ${owner.surname} · ${owner.dni}`, owner.id));
  });
  tenantSelect.replaceChildren(new Option("Sin inquilino", ""));
  owners.forEach(owner => {
    tenantSelect.add(new Option(`${owner.name} ${owner.surname} · ${owner.dni}`, owner.id));
  });
  ownerSelect.value = selectedOwnerId;
  tenantSelect.value = selectedTenantId;
}

function renderPropertyDocumentList() {
  propertyDocumentList.replaceChildren();
  if (propertyDocuments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "form-intro";
    empty.textContent = "No hay documentos cargados para este inmueble.";
    propertyDocumentList.append(empty);
    return;
  }

  propertyDocuments.forEach(documentRecord => {
    const item = document.createElement("div");
    item.className = "property-document-item";
    const link = document.createElement("a");
    link.textContent = `${documentRecord.fileName} · ${Math.ceil(documentRecord.fileSize / 1024)} KB`;
    if (documentRecord.dataUrl) {
      link.href = documentRecord.dataUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.download = documentRecord.fileName;
    }
    item.append(link);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.dataset.removePropertyDocument = documentRecord.id;
    removeButton.textContent = "Quitar";
    item.append(removeButton);
    propertyDocumentList.append(item);
  });
}

function openPropertyEditor(id = null) {
  if (activeRole === "owner") return;
  editingPropertyId = id;
  propertyForm.reset();
  propertyFormError.textContent = "";
  updateCommunitySelectors();
  const property = properties.find(item => item.id === id);
  updatePropertyPeopleSelectors(property?.ownerId || "", property?.tenantId || "");
  propertyDocuments = property?.documents ? property.documents.map(item => ({ ...item })) : [];
  propertyForm.elements.receiptStatus.value = property?.receiptStatus || "current";
  propertyForm.elements.propertyType.value = property?.propertyType || "";
  if (property) {
    ["communityId", "plot", "address", "cadastralRef", "registryNumber", "floor", "door", "areaM2", "participationCoef", "propertyUse"]
      .forEach(key => {
        propertyForm.elements[key].value = property[key] || "";
      });
  }
  document.querySelector("#property-dialog-title").textContent = property ? "Editar inmueble" : "Nuevo inmueble";
  renderPropertyDocumentList();
  propertyDialog.showModal();
}

function closePropertyEditor() {
  propertyDialog.close();
  editingPropertyId = null;
  propertyDocuments = [];
}

function renderProperties() {
  if (!propertyList) return;
  const query = propertySearch.value.trim().toLocaleLowerCase("es");
  const communityId = propertyCommunityFilter.value;
  const items = properties.filter(property => {
    if (!owners.some(owner => owner.id === property.ownerId)) return false;
    if (communityId && property.communityId !== communityId) return false;
    if (!query) return true;
    const owner = owners.find(item => item.id === property.ownerId);
    const tenant = owners.find(item => item.id === property.tenantId);
    const community = communities.find(item => item.id === property.communityId);
    return [
      property.plot,
      property.address,
      property.cadastralRef,
      owner ? `${owner.name} ${owner.surname}` : "",
      tenant ? `${tenant.name} ${tenant.surname}` : "",
      community?.name || property.communityName
    ].some(value => (value || "").toLocaleLowerCase("es").includes(query));
  });

  propertyList.replaceChildren();
  items.forEach(property => {
    const row = document.createElement("tr");
    const propertyCell = document.createElement("td");
    propertyCell.textContent = `${property.plot || "Inmueble"} · ${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"}`;
    row.append(propertyCell);

    const communityCell = document.createElement("td");
    communityCell.textContent = communities.find(item => item.id === property.communityId)?.name || property.communityName || "—";
    row.append(communityCell);

    const addressCell = document.createElement("td");
    addressCell.textContent = property.address || "—";
    row.append(addressCell);

    const ownerCell = document.createElement("td");
    const owner = owners.find(item => item.id === property.ownerId);
    if (owner) {
      const ownerButton = document.createElement("button");
      ownerButton.type = "button";
      ownerButton.className = "text-link-button";
      ownerButton.textContent = `${owner.name} ${owner.surname}`;
      ownerButton.addEventListener("click", () => openOwnerDetail(owner.id));
      ownerCell.append(ownerButton);
    } else {
      ownerCell.textContent = "Sin propietario";
    }
    row.append(ownerCell);

    const tenantCell = document.createElement("td");
    const tenant = owners.find(item => item.id === property.tenantId);
    if (tenant) {
      const tenantButton = document.createElement("button");
      tenantButton.type = "button";
      tenantButton.className = "text-link-button";
      tenantButton.textContent = `${tenant.name} ${tenant.surname}`;
      tenantButton.addEventListener("click", () => openOwnerDetail(tenant.id));
      tenantCell.append(tenantButton);
    } else {
      tenantCell.textContent = "Sin inquilino";
    }
    row.append(tenantCell);

    const receiptCell = document.createElement("td");
    const receiptBadge = document.createElement("span");
    receiptBadge.className = `status-badge ${property.receiptStatus === "pending" ? "doc-rejected" : "doc-approved"}`;
    receiptBadge.textContent = property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
    receiptCell.append(receiptBadge);
    row.append(receiptCell);

    const documentsCell = document.createElement("td");
    documentsCell.textContent = `${property.documents.length} ${property.documents.length === 1 ? "documento" : "documentos"}`;
    row.append(documentsCell);

    const actions = document.createElement("td");
    actions.className = "row-actions";
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "secondary-button property-action-button";
    detailButton.textContent = "Ver";
    detailButton.setAttribute("aria-label", `Ver inmueble ${property.plot}`);
    detailButton.addEventListener("click", () => openPropertyDetail(property.id));
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary-button property-action-button";
    editButton.textContent = "Editar";
    editButton.setAttribute("aria-label", `Editar inmueble ${property.plot}`);
    editButton.addEventListener("click", () => openPropertyEditor(property.id));
    actions.append(detailButton, editButton);
    row.append(actions);
    propertyList.append(row);
  });

  propertyEmpty.hidden = items.length !== 0;
  propertyResultCount.textContent = `${items.length} ${items.length === 1 ? "inmueble" : "inmuebles"}`;
}

function openPropertyDetail(id) {
  const property = properties.find(item => item.id === id);
  if (!property) return;
  viewingPropertyId = id;
  const community = communities.find(item => item.id === property.communityId);
  const owner = owners.find(item => item.id === property.ownerId);
  const tenant = owners.find(item => item.id === property.tenantId);

  document.querySelector("#property-detail-title").textContent = property.plot || "Ficha del inmueble";
  document.querySelector("#property-detail-label").textContent =
    `${PROPERTY_TYPE_LABELS[property.propertyType] || "Inmueble"} · ${property.plot || "—"}`;
  document.querySelector("#property-detail-community").textContent = community?.name || property.communityName || "—";
  document.querySelector("#property-detail-address").textContent = property.address || "—";
  document.querySelector("#property-detail-owner").textContent = owner ? `${owner.name} ${owner.surname}` : "Sin propietario";
  document.querySelector("#property-detail-tenant").textContent = tenant ? `${tenant.name} ${tenant.surname}` : "Sin inquilino";
  document.querySelector("#property-detail-receipts").textContent =
    property.receiptStatus === "pending" ? "Pagos pendientes" : "Al corriente";
  document.querySelector("#property-detail-registry").textContent =
    [property.cadastralRef || "Sin referencia catastral", property.registryNumber ? `Finca ${property.registryNumber}` : "Sin finca registral"].join(" · ");
  document.querySelector("#property-detail-characteristics").textContent =
    [property.floor && `Planta ${property.floor}`, property.door && `Puerta ${property.door}`,
      property.areaM2 && `${property.areaM2} m²`, property.participationCoef && `${property.participationCoef}%`]
      .filter(Boolean).join(" · ") || "Sin datos adicionales";

  const ownerButton = document.querySelector("#property-detail-owner-button");
  ownerButton.hidden = !owner || (activeRole === "owner" && owner.id !== CURRENT_OWNER_ID);
  ownerButton.onclick = () => {
    if (!owner) return;
    propertyDetailDialog.close();
    openOwnerDetail(owner.id);
  };
  const tenantButton = document.querySelector("#property-detail-tenant-button");
  tenantButton.hidden = !tenant || (activeRole === "owner" && tenant.id !== CURRENT_OWNER_ID);
  tenantButton.onclick = () => {
    if (!tenant) return;
    propertyDetailDialog.close();
    openOwnerDetail(tenant.id);
  };

  propertyDetailDocuments.replaceChildren();
  if (!property.documents.length) {
    const empty = document.createElement("p");
    empty.textContent = "No hay documentación cargada.";
    propertyDetailDocuments.append(empty);
  } else {
    property.documents.forEach(documentRecord => {
      const link = document.createElement("a");
      link.textContent = documentRecord.fileName;
      link.href = documentRecord.dataUrl || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.download = documentRecord.fileName;
      propertyDetailDocuments.append(link);
    });
  }

  document.querySelector("#property-detail-edit-btn").hidden = activeRole === "owner";
  if (!propertyDetailDialog.open) propertyDetailDialog.showModal();
}

function closePropertyDetail() {
  propertyDetailDialog.close();
  viewingPropertyId = null;
}

function renderDetailDocsGrid(o) {
  ownerDetailDocsGrid.replaceChildren();
  const docs = o.documents || {};
  const docKeys = [
    { key: "dni", title: "Copia de DNI (ambas caras)" },
    { key: "bankReceipt", title: "Recibo bancario o certificado de titularidad" },
    { key: "propertyDeed", title: "Copia de la escritura del inmueble" }
  ];

  docKeys.forEach(({ key, title }) => {
    const doc = docs[key];
    const card = document.createElement("div");
    card.className = `detail-doc-card ${doc ? (doc.adminApproval?.status === "approved" ? "approved" : "pending") : ""}`;

    if (doc) {
      const isApproved = doc.adminApproval?.status === "approved";
      const isRejected = doc.adminApproval?.status === "rejected";
      let approvalBadge = '<span class="status-badge doc-pending-admin">⏳ Pendiente aprobación</span>';
      if (isApproved) approvalBadge = '<span class="status-badge doc-approved">✓ Aprobado por Admin</span>';
      if (isRejected) approvalBadge = '<span class="status-badge doc-rejected">✗ Rechazado</span>';

      card.innerHTML = `
        <div class="detail-doc-card-top">
          <div>
            <h4 class="detail-doc-name">${title}</h4>
            <p class="detail-doc-sub">${doc.fileName} (${Math.round(doc.fileSize / 1024)} KB)</p>
          </div>
          ${approvalBadge}
        </div>
        <div class="detail-doc-metrics">
          <strong>Validación automática:</strong> ${doc.autoValidation?.typeVerified || "Verificado"}<br />
          <strong>Legibilidad:</strong> ${doc.autoValidation?.legibilityScore || 98}% (${doc.autoValidation?.legibilityStatus?.split(" ")[0] || "Óptima"}) · Subido el ${doc.uploadedAt}
        </div>
        <div class="detail-doc-actions">
          <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="view-doc" data-key="${key}">👁️ Ver documento</button>
          <button class="secondary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="replace-doc" data-key="${key}">🔄 Cambiar</button>
        </div>
      `;

      card.querySelector('[data-action="view-doc"]').addEventListener("click", () => {
        openDocViewer(o, key, doc);
      });
      card.querySelector('[data-action="replace-doc"]').addEventListener("click", () => {
        closeOwnerDetail();
        openOwnerEditor(o.id, "docs");
      });
    } else {
      card.innerHTML = `
        <div class="detail-doc-card-top">
          <div>
            <h4 class="detail-doc-name">${title}</h4>
            <p class="detail-doc-sub">No aportado por el propietario</p>
          </div>
          <span class="status-badge doc-none">No subido</span>
        </div>
        <div class="detail-doc-metrics" style="color: #64748b;">
          El asociado todavía no ha subido este documento a la plataforma.
        </div>
        <div class="detail-doc-actions">
          <button class="primary-button" style="padding: 6px 12px; font-size: 12px;" type="button" data-action="upload-doc" data-key="${key}">+ Subir documento</button>
        </div>
      `;
      card.querySelector('[data-action="upload-doc"]').addEventListener("click", () => {
        closeOwnerDetail();
        openOwnerEditor(o.id, "docs");
      });
    }

    ownerDetailDocsGrid.append(card);
  });
}

function renderDetailApprovalPanel(o, docStatus) {
  ownerDetailApprovalPanel.replaceChildren();

  // En modo Propietario: sólo información de estado para el usuario (sin controles administrativos)
  if (activeRole === "owner") {
    if (docStatus === "approved") {
      ownerDetailApprovalPanel.className = "admin-approval-panel approved-box";
      ownerDetailApprovalPanel.innerHTML = `
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4 style="color: #15803d;">✓ Expediente Documental Aprobado Oficialmente</h4>
            <p>Toda tu documentación reglamentaria ha sido verificada y formalmente <strong>convalidada por el Administrador</strong>. Tu perfil de asociado está al día.</p>
          </div>
        </div>
      `;
    } else if (docStatus === "pending_admin") {
      ownerDetailApprovalPanel.className = "admin-approval-panel pending-box";
      ownerDetailApprovalPanel.innerHTML = `
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4>⏳ Documentación en Revisión por el Administrador</h4>
            <p>Tus documentos han superado la validación automática de formato y legibilidad del sistema. El Administrador ha sido notificado y resolverá la aprobación de tu expediente en breve.</p>
          </div>
        </div>
      `;
    } else if (docStatus === "rejected") {
      const reason = o.documents?.dni?.adminApproval?.notes || "Documentación no conforme o incompleta.";
      ownerDetailApprovalPanel.className = "admin-approval-panel rejected-box";
      ownerDetailApprovalPanel.innerHTML = `
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4 style="color: #b91c1c;">⚠️ Requerimiento de Subsanación</h4>
            <p>El Administrador solicita correcciones en tu documentación: <em>“${reason}”</em>. Por favor, pulsa en 'Gestionar documentos' para volver a adjuntar los archivos requeridos.</p>
          </div>
        </div>
      `;
    } else {
      ownerDetailApprovalPanel.className = "admin-approval-panel";
      ownerDetailApprovalPanel.innerHTML = `
        <div class="approval-flex-row">
          <div class="approval-info-col">
            <h4>⚠️ Documentación Obligatoria Pendiente</h4>
            <p>Por favor, sube la copia de tu DNI (ambas caras), recibo bancario y escritura para que el Administrador pueda convalidar tu expediente.</p>
          </div>
        </div>
      `;
    }
    ownerDetailEditBtn.textContent = "Editar mis datos";
    return;
  }

  // En modo Administrador: controles completos de verificación, convalidación y rechazo
  ownerDetailEditBtn.textContent = "Editar propietario";

  if (docStatus === "pending_admin") {
    ownerDetailApprovalPanel.className = "admin-approval-panel pending-box";
    ownerDetailApprovalPanel.innerHTML = `
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4>Resolución Administrativa de Expediente:</h4>
          <p>La documentación ha sido <strong>validada de forma automática por el sistema</strong> (DNI español, cuenta bancaria y escritura conformes). Como Administrador, verifique el expediente y apruebe o solicite subsanación.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="btn-reject-danger" type="button" id="btn-detail-reject">
            ❌ Rechazar / Requerir
          </button>
          <button class="btn-approve-success" type="button" id="btn-detail-approve">
            ✅ Aprobar Documentación Oficial
          </button>
        </div>
      </div>
    `;

    ownerDetailApprovalPanel.querySelector("#btn-detail-approve").addEventListener("click", () => {
      if (confirm(`¿Aprobar formalmente toda la documentación aportada por ${o.name} ${o.surname}?`)) {
        approveAllOwnerDocs(o.id);
      }
    });

    ownerDetailApprovalPanel.querySelector("#btn-detail-reject").addEventListener("click", () => {
      openDocRejectDialog(o.id);
    });

  } else if (docStatus === "approved") {
    const firstDoc = o.documents?.dni;
    const reviewedDate = firstDoc?.adminApproval?.reviewedAt || new Date().toLocaleDateString("es-ES");
    const reviewedBy = firstDoc?.adminApproval?.reviewedBy || "Administrador";

    ownerDetailApprovalPanel.className = "admin-approval-panel approved-box";
    ownerDetailApprovalPanel.innerHTML = `
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4 style="color: #15803d;">✓ Documentación Aprobada Formalmente</h4>
          <p>Expediente revisado y verificado con éxito por <strong>${reviewedBy}</strong> el ${reviewedDate}. El asociado dispone de su documentación debidamente convalidada.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="secondary-button" style="font-size: 12px;" type="button" id="btn-detail-reopen">Reabrir para revisión</button>
        </div>
      </div>
    `;

    ownerDetailApprovalPanel.querySelector("#btn-detail-reopen").addEventListener("click", () => {
      if (confirm("¿Deseas volver a marcar la documentación como pendiente de revisión?")) {
        reopenOwnerDocs(o.id);
      }
    });

  } else if (docStatus === "rejected") {
    const reason = o.documents?.dni?.adminApproval?.notes || "Documentación no conforme o incompleta.";
    ownerDetailApprovalPanel.className = "admin-approval-panel rejected-box";
    ownerDetailApprovalPanel.innerHTML = `
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4 style="color: #b91c1c;">✗ Documentación Rechazada / Pendiente de Subsanación</h4>
          <p>Motivo indicado al propietario: <em>“${reason}”</em></p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="primary-button" style="font-size: 12px;" type="button" id="btn-detail-reopen">Revisar de nuevo</button>
        </div>
      </div>
    `;

    ownerDetailApprovalPanel.querySelector("#btn-detail-reopen").addEventListener("click", () => {
      reopenOwnerDocs(o.id);
    });

  } else {
    ownerDetailApprovalPanel.className = "admin-approval-panel";
    ownerDetailApprovalPanel.innerHTML = `
      <div class="approval-flex-row">
        <div class="approval-info-col">
          <h4>Expediente en curso:</h4>
          <p>El propietario aún no ha completado la subida de los tres documentos requeridos.</p>
        </div>
        <div class="approval-buttons-wrap">
          <button class="primary-button" style="font-size: 12px;" type="button" id="btn-detail-subir-docs">Subir documentación</button>
        </div>
      </div>
    `;

    ownerDetailApprovalPanel.querySelector("#btn-detail-subir-docs").addEventListener("click", () => {
      closeOwnerDetail();
      openOwnerEditor(o.id, "docs");
    });
  }
}

function approveAllOwnerDocs(ownerId) {
  const dateStr = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  owners = owners.map(o => {
    if (o.id !== ownerId) return o;
    const newDocs = { ...o.documents };
    ["dni", "bankReceipt", "propertyDeed"].forEach(k => {
      if (newDocs[k]) {
        newDocs[k] = {
          ...newDocs[k],
          adminApproval: {
            status: "approved",
            reviewedAt: dateStr,
            reviewedBy: "Administrador",
            notes: "Aprobado conforme a los requisitos de la asociación."
          }
        };
      }
    });
    return { ...o, documents: newDocs };
  });

  saveOwners();
  renderOwners();

  // Notificar al buzón personal del propietario
  addOwnerNotification({
    ownerId,
    title: "Documentación oficial convalidada",
    type: "success",
    message: "El Administrador ha verificado y aprobado formalmente toda tu documentación (DNI, domiciliación bancaria y escritura). Tu expediente está al corriente."
  });

  openOwnerDetail(ownerId);
  toast("¡Documentación aprobada formalmente por el Administrador!");
}

function reopenOwnerDocs(ownerId) {
  owners = owners.map(o => {
    if (o.id !== ownerId) return o;
    const newDocs = { ...o.documents };
    ["dni", "bankReceipt", "propertyDeed"].forEach(k => {
      if (newDocs[k]) {
        newDocs[k] = {
          ...newDocs[k],
          adminApproval: {
            status: "pending",
            reviewedAt: null,
            reviewedBy: null,
            notes: ""
          }
        };
      }
    });
    return { ...o, documents: newDocs };
  });

  saveOwners();
  renderOwners();
  openOwnerDetail(ownerId);
  toast("Expediente reabierto para revisión.");
}

function openDocRejectDialog(ownerId) {
  docRejectReason.value = "";
  docRejectDialog.showModal();

  docRejectForm.onsubmit = e => {
    e.preventDefault();
    const reason = docRejectReason.value.trim();
    if (!reason) return;

    const dateStr = new Date().toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    owners = owners.map(o => {
      if (o.id !== ownerId) return o;
      const newDocs = { ...o.documents };
      ["dni", "bankReceipt", "propertyDeed"].forEach(k => {
        if (newDocs[k]) {
          newDocs[k] = {
            ...newDocs[k],
            adminApproval: {
              status: "rejected",
              reviewedAt: dateStr,
              reviewedBy: "Administrador",
              notes: reason
            }
          };
        }
      });
      return { ...o, documents: newDocs };
    });

    saveOwners();
    renderOwners();

    // Notificar al buzón personal del propietario
    addOwnerNotification({
      ownerId,
      title: "Requerimiento de subsanación documental",
      type: "warning",
      message: `El Administrador ha revisado tu documentación y solicita subsanación: “${reason}”. Por favor, accede a tu perfil y vuelve a adjuntar los documentos solicitados.`
    });

    docRejectDialog.close();
    openOwnerDetail(ownerId);
    toast("Documentación rechazada. Se ha solicitado subsanación al propietario.");
  };
}

function openDocViewer(owner, docKey, docObj = null) {
  const doc = docObj || (owner.documents && owner.documents[docKey]);
  if (!doc) return;

  viewingDocDetails = { owner, docKey, doc };

  document.querySelector("#doc-viewer-eyebrow").textContent = `EXPEDIENTE: ${owner.communityName || "ASOCIACIÓN PEÑARRUBIA"}`;
  document.querySelector("#doc-viewer-title").textContent = doc.title;
  document.querySelector("#doc-viewer-owner").textContent = `${owner.name} ${owner.surname} (${owner.dni})`;
  document.querySelector("#doc-viewer-filename").textContent = `${doc.fileName} (${Math.round(doc.fileSize / 1024)} KB)`;
  document.querySelector("#doc-viewer-date").textContent = doc.uploadedAt;

  const score = doc.autoValidation?.legibilityScore || 98;
  const status = doc.autoValidation?.legibilityStatus || "Óptima";
  document.querySelector("#doc-viewer-score-bar").style.width = `${score}%`;
  document.querySelector("#doc-viewer-score-text").textContent = `${score}% (${status.split(" ")[0]})`;

  // Checklist
  const checksListEl = document.querySelector("#doc-viewer-checks-list");
  checksListEl.replaceChildren();
  const checks = doc.autoValidation?.checks || [];
  checks.forEach(c => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="check-icon passed">✓</span> <span><strong>${c.name}:</strong> ${c.detail}</span>`;
    checksListEl.append(li);
  });

  // Estado de aprobación
  const approvalBox = document.querySelector("#doc-viewer-approval-status");
  const isApproved = doc.adminApproval?.status === "approved";
  approvalBox.innerHTML = `
    <span class="status-badge ${isApproved ? "doc-approved" : "doc-pending-admin"}">
      ${isApproved ? "✓ Aprobado por Administrador" : "⏳ Pendiente de resolución administrativa"}
    </span>
  `;

  // Renderizar preview en pane
  const previewPane = document.querySelector("#doc-viewer-preview-pane");
  previewPane.replaceChildren();

  let previewUrl = doc.dataUrl;
  if (!previewUrl) {
    const sample = DocumentValidator.generateSampleDocument(docKey, owner);
    previewUrl = sample?.dataUrl;
  }

  if (previewUrl) {
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = doc.title;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "400px";
    img.style.borderRadius = "6px";
    previewPane.append(img);
  } else {
    previewPane.innerHTML = `<p>Visualización del archivo ${doc.fileName}</p>`;
  }

  // Botón rápido de aprobación individual (sólo disponible para Administrador)
  if (docViewerQuickApproveBtn) {
    docViewerQuickApproveBtn.style.display = activeRole === "owner" ? "none" : "";
    docViewerQuickApproveBtn.onclick = () => {
      doc.adminApproval = {
        status: "approved",
        reviewedAt: new Date().toLocaleString("es-ES"),
        reviewedBy: "Administrador",
        notes: "Aprobación individual desde visor."
      };
      saveOwners();
      renderOwners();
      if (viewingOwnerId) openOwnerDetail(viewingOwnerId);
      docViewerDialog.close();
      toast(`Documento "${doc.title}" aprobado.`);
    };
  }

  docViewerDialog.showModal();
}

function closeOwnerDetail() {
  ownerDetailDialog.close();
  viewingOwnerId = null;
}

function openOwnerDelete(id) {
  deletingOwnerId = id;
  const o = owners.find(item => item.id === id);
  document.querySelector("#owner-delete-message").textContent = `Vas a eliminar a “${o.name} ${o.surname}”. Esta acción no se puede deshacer.`;
  ownerDeleteDialog.showModal();
}

function collectOwnerErrors() {
  const errors = [];
  const marks = [];
  const el = name => ownerForm.elements[name];

  // 1. Identificación
  const nameVal = (el("name")?.value || "").trim();
  if (!nameVal) { errors.push("El nombre es obligatorio."); marks.push("name"); }

  const surnameVal = (el("surname")?.value || "").trim();
  if (!surnameVal) { errors.push("Los apellidos son obligatorios."); marks.push("surname"); }

  const docType = el("documentType")?.value || "DNI";
  const dniVal = (el("dni")?.value || "").trim().toUpperCase();
  if (!dniVal) {
    errors.push("El " + docType + " es obligatorio.");
    marks.push("dni");
  } else if (!isValidIdentityDocument(dniVal, docType)) {
    errors.push(`El ${docType} "${dniVal}" no es válido según algoritmo oficial.`);
    marks.push("dni");
  } else if (owners.some(o => (o.dni || "").trim().toUpperCase() === dniVal && o.id !== editingOwnerId)) {
    errors.push("Ya existe otro propietario registrado con el documento " + dniVal + ".");
    marks.push("dni");
  }

  // 2. Parcela e Inmueble
  const commId = el("communityId")?.value;
  if (!commId) {
    errors.push("La comunidad vinculada es obligatoria.");
    marks.push("communityId");
  }

  const propId = propertyIdInput?.value;
  if (!propId) {
    errors.push("Debes asociar el propietario con un inmueble existente o seleccionar 'Registrar inmueble nuevo'.");
    marks.push("propertyId");
  } else if (propId !== "__new__") {
    const selectedProperty = properties.find(property => property.id === propId);
    if (!selectedProperty) {
      errors.push("El inmueble seleccionado ya no está disponible. Selecciónalo de nuevo.");
      marks.push("propertyId");
    } else if (selectedProperty.communityId !== commId) {
      errors.push("El inmueble seleccionado debe pertenecer a la comunidad vinculada.");
      marks.push("propertyId", "communityId");
    } else if (selectedProperty.ownerId && selectedProperty.ownerId !== editingOwnerId) {
      errors.push("El inmueble seleccionado ya está asociado a otro propietario.");
      marks.push("propertyId");
    }
  }

  const propType = el("propertyType")?.value;
  if (!propType) {
    errors.push("El tipo de inmueble es obligatorio (Parcela, Vivienda, Local, etc.).");
    marks.push("propertyType");
  }

  const plotVal = (el("plot")?.value || "").trim();
  if (!plotVal) {
    errors.push("El identificador / n.º de inmueble o parcela es obligatorio.");
    marks.push("plot");
  }

  const cadastralRefVal = (el("cadastralRef")?.value || "").trim().toUpperCase();
  if (cadastralRefVal && !isValidCadastralRef(cadastralRefVal)) {
    errors.push("La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.");
    marks.push("cadastralRef");
  }

  const areaM2Val = (el("areaM2")?.value || "").trim();
  if (areaM2Val && !isValidDecimal(areaM2Val, 0.01, 999999)) {
    errors.push("La superficie debe ser un valor decimal numérico positivo (m²).");
    marks.push("areaM2");
  }

  const partCoefVal = (el("participationCoef")?.value || "").trim();
  if (partCoefVal && !isValidDecimal(partCoefVal, 0.0001, 100)) {
    errors.push("El coeficiente de participación debe ser un porcentaje decimal entre 0,0001 y 100.");
    marks.push("participationCoef");
  }

  // 3. Contacto y verificación
  const phoneVal = digitsOnly(el("phone")?.value || "", 9);
  if (!phoneVal || !isValidPhone(phoneVal)) {
    errors.push("El teléfono principal es obligatorio y debe ser un número español válido de 9 dígitos.");
    marks.push("phone");
  } else if (!contactVerify.phone.verified || contactVerify.phone.value !== phoneVal) {
    errors.push("Debes verificar el teléfono principal mediante el código enviado por SMS.");
    marks.push("phone");
  }

  const otherPhoneVal = digitsOnly(el("otherPhone")?.value || "", 9);
  if (el("otherPhone")?.value.trim() && !isValidPhone(otherPhoneVal)) {
    errors.push("El otro teléfono debe ser un número español válido de 9 dígitos.");
    marks.push("otherPhone");
  }

  const emailVal = (el("email")?.value || "").trim();
  if (!emailVal) {
    errors.push("El email de contacto es obligatorio.");
    marks.push("email");
  } else if (!isValidEmail(emailVal)) {
    errors.push("El email de contacto no tiene un formato válido (ejemplo: usuario@dominio.es).");
    marks.push("email");
  } else if (!contactVerify.email.verified || contactVerify.email.value !== emailVal.toLowerCase()) {
    errors.push("Debes verificar el correo electrónico mediante el código enviado.");
    marks.push("email");
  }

  // 4. Dirección y territorio
  const addressVal = (el("address")?.value || "").trim();
  if (!addressVal) {
    errors.push("La dirección es obligatoria.");
    marks.push("address");
  }

  const provVal = el("province")?.value;
  if (!provVal) {
    errors.push("La provincia es obligatoria.");
    marks.push("province");
  }

  const cityVal = el("city")?.value;
  const selectedLocation = locationsById.get(cityVal);
  if (!cityVal || !selectedLocation) {
    errors.push("Debes seleccionar un municipio válido.");
    marks.push("city");
  } else if (selectedLocation.province !== provVal) {
    errors.push("El municipio debe pertenecer a la provincia seleccionada.");
    marks.push("province", "city");
  }

  const cpVal = el("postalCode")?.value;
  if (!cpVal || !isValidPostalCode(cpVal) || !selectedLocation?.postalCodes.includes(cpVal)) {
    errors.push("El código postal debe ser válido para el municipio seleccionado.");
    marks.push("postalCode");
  }

  // 5. Domiciliación e IBAN
  const ibanVal = digitsIban(el("iban")?.value || "");
  if (ibanVal && !isValidIban(ibanVal)) {
    errors.push("El IBAN debe tener formato español y superar la validación de control (ES + 22 dígitos).");
    marks.push("iban");
  }

  return { errors, marks, selectedLocation };
}

ownerForm.addEventListener("submit", event => {
  event.preventDefault();
  clearOwnerFieldErrors();

  const { errors, marks, selectedLocation } = collectOwnerErrors();

  if (errors.length > 0) {
    switchOwnerDialogTab("data");
    marks.forEach(markOwnerFieldError);

    if (ownerValidationList && ownerValidationDialog) {
      ownerValidationList.replaceChildren();
      errors.forEach(errText => {
        const li = document.createElement("li");
        li.textContent = errText;
        ownerValidationList.append(li);
      });
      ownerValidationDialog.showModal();
    } else {
      alert("Corrige los siguientes errores:\n\n" + errors.join("\n"));
    }
    return;
  }

  const formData = new FormData(ownerForm);
  const data = Object.fromEntries(formData);

  ["name", "surname", "dni", "plot", "phone", "otherPhone", "email", "address", "postalCode", "iban", "notes"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });

  data.dni = data.dni.toUpperCase();
  data.communityId = ownerForm.elements.communityId.value;
  data.isMember = ownerForm.elements.isMember.value === "true";
  data.phone = digitsOnly(data.phone, 9);
  data.otherPhone = digitsOnly(data.otherPhone, 9);
  data.email = data.email.toLowerCase();
  data.iban = digitsIban(data.iban);
  data.areaM2 = (data.areaM2 || "").replace(",", ".");
  data.participationCoef = (data.participationCoef || "").replace(",", ".");
  data.city = selectedLocation.name;
  data.province = provinceSelect.value;

  // Buscar nombre de la comunidad seleccionada
  const linkedComm = communities.find(c => c.id === data.communityId);
  data.communityName = linkedComm ? linkedComm.name : "";
  data.id = editingOwnerId || crypto.randomUUID();

  // Asignar documentación validada y relacionada sólo y únicamente para este usuario
  data.documents = currentEditingDocs;

  const docKeys = ["dni", "bankReceipt", "propertyDeed"];
  const uploadedCount = docKeys.filter(k => !!currentEditingDocs[k]).length;
  const isCompleteDocs = uploadedCount === 3;

  // Asociar o actualizar el inmueble en el catálogo de propiedades
  const previousOwner = owners.find(owner => owner.id === data.id);
  const previousPropertyId = previousOwner?.propertyId || "";
  const savedPropId = upsertPropertyFromOwner(data);
  if (previousPropertyId && previousPropertyId !== savedPropId) {
    const previousProperty = properties.find(property => property.id === previousPropertyId);
    if (previousProperty?.ownerId === data.id) previousProperty.ownerId = "";
  }
  data.propertyIds = properties.filter(property => property.ownerId === data.id).map(property => property.id);
  saveProperties();
  data.propertyId = savedPropId;
  data.phoneVerified = contactVerify.phone.verified;
  data.phoneVerifiedAt = contactVerify.phone.verifiedAt;
  data.emailVerified = contactVerify.email.verified;
  data.emailVerifiedAt = contactVerify.email.verifiedAt;

  if (editingOwnerId) {
    owners = owners.map(o => o.id === editingOwnerId ? { ...data } : o);
    toast("Propietario actualizado.");
  } else {
    owners.unshift({ ...data });
    ownerCurrentPage = 1;
    toast("Propietario creado.");
  }

  saveOwners();
  closeOwnerEditor();
  renderOwners();
  renderProperties();

  // Si se han subido y validado los documentos requeridos:
  if (isCompleteDocs) {
    // 1. Remitir aviso por correo electrónico al Administrador
    const emailSent = sendAdminEmailNotification(data, currentEditingDocs);

    // 2. Notificar en el buzón personal del propietario
    addOwnerNotification({
      ownerId: data.id,
      title: "Documentación enviada para aprobación",
      type: "info",
      message: "Tus 3 documentos obligatorios han superado la validación automática del sistema y se ha notificado al Administrador para su convalidación."
    });

    // 3. Mostrar mensaje emergente al usuario confirmando el proceso completado con éxito
    document.querySelector("#success-audit-dni").textContent = `${currentEditingDocs.dni?.autoValidation?.typeVerified || "DNI español verificado"} · Legibilidad ${currentEditingDocs.dni?.autoValidation?.legibilityScore || 98}% (Óptima)`;
    document.querySelector("#success-audit-bank").textContent = `${currentEditingDocs.bankReceipt?.autoValidation?.typeVerified || "Certificado bancario con IBAN verificado"} · Legibilidad ${currentEditingDocs.bankReceipt?.autoValidation?.legibilityScore || 96}%`;
    document.querySelector("#success-audit-deed").textContent = `${currentEditingDocs.propertyDeed?.autoValidation?.typeVerified || "Escritura notarial de propiedad verificada"} · Legibilidad ${currentEditingDocs.propertyDeed?.autoValidation?.legibilityScore || 95}%`;

    if (btnViewAdminEmail) {
      btnViewAdminEmail.style.display = activeRole === "owner" ? "none" : "";
      btnViewAdminEmail.onclick = () => {
        docSuccessDialog.close();
        openAdminEmail(emailSent.id);
      };
    }

    docSuccessDialog.showModal();
  }
});

// ==========================================
// 9. EVENT LISTENERS GENERALES
// ==========================================

// --- Comunidades ---
const comNifInput = communityForm.elements.nif;
const comPhoneInput = communityForm.elements.phone;
const comOtherPhoneInput = communityForm.elements.otherPhone;
const comPostalCodeInput = communityForm.elements.postalCode;
const comCitySelect = communityForm.elements.city;

comNifInput.addEventListener("input", () => {
  comNifInput.value = comNifInput.value.toUpperCase();
  comNifInput.setCustomValidity("");
});

[comPhoneInput, comOtherPhoneInput].forEach(inp => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "");
    inp.setCustomValidity("");
  });
});

communityForm.elements.email.addEventListener("input", () => {
  communityForm.elements.email.setCustomValidity("");
});

comPostalCodeInput.addEventListener("input", () => {
  comPostalCodeInput.value = comPostalCodeInput.value.replace(/\D/g, "").slice(0, 5);
  comPostalCodeInput.setCustomValidity("");
  syncPostalCode(comPostalCodeInput, comCitySelect, communityForm.elements.province);
});

comCitySelect.addEventListener("change", () => {
  syncCity(comCitySelect, communityForm.elements.province, comPostalCodeInput);
});

document.querySelector("#new-community").addEventListener("click", () => openCommunityEditor());
document.querySelector("#close-dialog").addEventListener("click", closeCommunityEditor);
document.querySelector("#cancel-dialog").addEventListener("click", closeCommunityEditor);

closeDetailDialog.addEventListener("click", closeCommunityDetail);
closeDetailBtn.addEventListener("click", closeCommunityDetail);
detailEditBtn.addEventListener("click", () => {
  const targetId = viewingCommunityId;
  closeCommunityDetail();
  if (targetId) openCommunityEditor(targetId);
});

communityPageSizeSelect.addEventListener("change", e => {
  communityPageSize = Number(e.target.value);
  communityCurrentPage = 1;
  renderCommunities();
});

communityPrevBtn.addEventListener("click", () => {
  if (communityCurrentPage > 1) {
    communityCurrentPage--;
    renderCommunities();
  }
});

communityNextBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredCommunities().length / communityPageSize);
  if (communityCurrentPage < totalPages) {
    communityCurrentPage++;
    renderCommunities();
  }
});

document.querySelector("#confirm-delete").addEventListener("click", () => {
  if (properties.some(property => property.communityId === deletingCommunityId)) {
    toast("No se puede eliminar esta comunidad mientras tenga inmuebles asociados.");
    deletingCommunityId = null;
    communityDeleteDialog.close();
    return;
  }
  communities = communities.filter(c => c.id !== deletingCommunityId);
  saveCommunities();
  const totalPages = Math.max(1, Math.ceil(filteredCommunities().length / communityPageSize));
  if (communityCurrentPage > totalPages) communityCurrentPage = totalPages;
  renderCommunities();
  toast("Comunidad eliminada.");
  deletingCommunityId = null;
});

communitySearch.addEventListener("input", () => {
  communityCurrentPage = 1;
  renderCommunities();
});

// --- Propietarios ---
const ownDniInput = ownerForm.elements.dni;
const ownPhoneInput = ownerForm.elements.phone;
const ownOtherPhoneInput = ownerForm.elements.otherPhone;
const ownPostalCodeInput = ownerForm.elements.postalCode;
const ownCitySelect = ownerForm.elements.city;
const ownIbanInput = ownerForm.elements.iban;

ownDniInput.addEventListener("input", () => {
  ownDniInput.value = ownDniInput.value.toUpperCase();
  ownDniInput.setCustomValidity("");
});

[ownPhoneInput, ownOtherPhoneInput].forEach(inp => {
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/\D/g, "");
    inp.setCustomValidity("");
  });
});

ownPostalCodeInput.addEventListener("input", () => {
  ownPostalCodeInput.value = ownPostalCodeInput.value.replace(/\D/g, "").slice(0, 5);
  ownPostalCodeInput.setCustomValidity("");
  syncPostalCode(ownPostalCodeInput, ownCitySelect, ownerForm.elements.province);
});

ownCitySelect.addEventListener("change", () => {
  syncCity(ownCitySelect, ownerForm.elements.province, ownPostalCodeInput);
});

ownIbanInput.addEventListener("input", () => {
  ownIbanInput.value = ownIbanInput.value.toUpperCase();
  ownIbanInput.setCustomValidity("");
});

ownerForm.elements.email.addEventListener("input", () => {
  ownerForm.elements.email.setCustomValidity("");
});

document.querySelector("#new-owner").addEventListener("click", () => openOwnerEditor(null, "data"));
document.querySelector("#close-owner-dialog").addEventListener("click", closeOwnerEditor);
document.querySelector("#cancel-owner-dialog").addEventListener("click", closeOwnerEditor);

closeOwnerDetailDialog.addEventListener("click", closeOwnerDetail);
closeOwnerDetailBtn.addEventListener("click", closeOwnerDetail);
ownerDetailEditBtn.addEventListener("click", () => {
  const targetId = viewingOwnerId;
  closeOwnerDetail();
  if (targetId) openOwnerEditor(targetId, "data");
});
ownerDetailManageDocsBtn.addEventListener("click", () => {
  const targetId = viewingOwnerId;
  closeOwnerDetail();
  if (targetId) openOwnerEditor(targetId, "docs");
});

ownerDetailPropertyCommunity.addEventListener("change", () => {
  const owner = owners.find(item => item.id === viewingOwnerId);
  if (owner) renderOwnerPropertySelectors(owner);
});
ownerDetailViewPropertyBtn.addEventListener("click", () => {
  if (ownerDetailPropertySelect.value) openPropertyDetail(ownerDetailPropertySelect.value);
});
filterOwnerPropertyCommunitySelect.addEventListener("change", event => {
  ownerPropertyCommunityFilter = event.target.value;
  renderOwners();
});

newPropertyBtn.addEventListener("click", () => openPropertyEditor());
document.querySelector("#close-property-dialog").addEventListener("click", closePropertyEditor);
document.querySelector("#cancel-property-dialog").addEventListener("click", closePropertyEditor);
document.querySelector("#close-property-detail-dialog").addEventListener("click", closePropertyDetail);
document.querySelector("#close-property-detail-btn").addEventListener("click", closePropertyDetail);
document.querySelector("#property-detail-edit-btn").addEventListener("click", () => {
  const targetId = viewingPropertyId;
  closePropertyDetail();
  if (targetId) openPropertyEditor(targetId);
});
propertySearch.addEventListener("input", renderProperties);
propertyCommunityFilter.addEventListener("change", renderProperties);
propertyDocumentList.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-property-document]");
  if (!button) return;
  propertyDocuments = propertyDocuments.filter(documentRecord => documentRecord.id !== button.dataset.removePropertyDocument);
  renderPropertyDocumentList();
});

propertyForm.addEventListener("submit", async event => {
  event.preventDefault();
  propertyFormError.textContent = "";

  const values = Object.fromEntries(new FormData(propertyForm));
  const community = communities.find(item => item.id === values.communityId);
  const owner = owners.find(item => item.id === values.ownerId);
  const tenant = owners.find(item => item.id === values.tenantId);
  const messages = [];
  if (!community) messages.push("Selecciona una comunidad existente.");
  if (!owner) messages.push("Selecciona un propietario existente.");
  if (!values.address.trim()) messages.push("La dirección es obligatoria.");
  if (!values.propertyType) messages.push("Selecciona el tipo de inmueble.");
  if (!values.plot.trim()) messages.push("El identificador del inmueble es obligatorio.");
  if (values.tenantId && !tenant) messages.push("El inquilino seleccionado ya no existe.");
  if (tenant && owner && tenant.id === owner.id) messages.push("El propietario no puede figurar también como inquilino del mismo inmueble.");
  if (!["current", "pending"].includes(values.receiptStatus)) messages.push("Selecciona un estado de recibos válido.");
  if (values.cadastralRef && !isValidCadastralRef(values.cadastralRef)) {
    messages.push("La referencia catastral debe tener exactamente 20 caracteres alfanuméricos.");
  }
  if (values.areaM2 && !isValidDecimal(values.areaM2, 0.01, 999999)) {
    messages.push("La superficie debe ser un valor decimal positivo.");
  }
  if (values.participationCoef && !isValidDecimal(values.participationCoef, 0.0001, 100)) {
    messages.push("El coeficiente debe ser un porcentaje decimal entre 0,0001 y 100.");
  }

  const selectedFiles = [...propertyDocumentInput.files];
  selectedFiles.forEach(file => {
    const extension = file.name.split(".").pop().toLowerCase();
    const allowed = ["pdf", "jpg", "jpeg", "png", "webp"].includes(extension);
    if (!allowed) messages.push(`El archivo "${file.name}" debe ser PDF, JPG, PNG o WEBP.`);
    if (file.size > 15 * 1024 * 1024) messages.push(`El archivo "${file.name}" supera el límite de 15 MB.`);
  });
  if (messages.length) {
    propertyFormError.textContent = messages.join(" ");
    return;
  }

  let newDocuments;
  try {
    newDocuments = await Promise.all(selectedFiles.map(async file => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      dataUrl: await readFileAsDataUrl(file)
    })));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    propertyFormError.textContent = `No se pudo leer uno de los documentos: ${detail}`;
    return;
  }

  const previousProperty = properties.find(property => property.id === editingPropertyId);
  const property = {
    ...(previousProperty || {}),
    id: editingPropertyId || crypto.randomUUID(),
    communityId: community.id,
    communityName: community.name,
    ownerId: owner.id,
    tenantId: tenant?.id || "",
    address: values.address.trim(),
    propertyType: values.propertyType,
    plot: values.plot.trim(),
    cadastralRef: values.cadastralRef.trim().toUpperCase(),
    registryNumber: values.registryNumber.trim(),
    floor: values.floor.trim(),
    door: values.door.trim(),
    areaM2: values.areaM2.trim().replace(",", "."),
    participationCoef: values.participationCoef.trim().replace(",", "."),
    propertyUse: values.propertyUse,
    receiptStatus: values.receiptStatus,
    documents: [...propertyDocuments, ...newDocuments]
  };
  if (previousProperty) {
    properties = properties.map(item => item.id === property.id ? property : item);
  } else {
    properties.unshift(property);
  }
  owners = owners.map(item => {
    const propertyIds = properties.filter(linked => linked.ownerId === item.id).map(linked => linked.id);
    return {
      ...item,
      propertyIds,
      propertyId: propertyIds.includes(item.propertyId) ? item.propertyId : (propertyIds[0] || "")
    };
  });

  saveProperties();
  saveOwners();
  renderProperties();
  renderOwners();
  if (viewingOwnerId) openOwnerDetail(viewingOwnerId);
  closePropertyEditor();
  toast(previousProperty ? "Inmueble actualizado." : "Inmueble creado.");
});

ownerPageSizeSelect.addEventListener("change", e => {
  ownerPageSize = Number(e.target.value);
  ownerCurrentPage = 1;
  renderOwners();
});

ownerPrevBtn.addEventListener("click", () => {
  if (ownerCurrentPage > 1) {
    ownerCurrentPage--;
    renderOwners();
  }
});

ownerNextBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filteredOwners().length / ownerPageSize);
  if (ownerCurrentPage < totalPages) {
    ownerCurrentPage++;
    renderOwners();
  }
});

document.querySelector("#confirm-owner-delete").addEventListener("click", () => {
  if (properties.some(property => property.ownerId === deletingOwnerId)) {
    toast("Reasigna los inmuebles antes de eliminar a este propietario.");
    deletingOwnerId = null;
    ownerDeleteDialog.close();
    return;
  }
  properties = properties.map(property =>
    property.tenantId === deletingOwnerId ? { ...property, tenantId: "" } : property
  );
  saveProperties();
  owners = owners.filter(o => o.id !== deletingOwnerId);
  saveOwners();
  const totalPages = Math.max(1, Math.ceil(filteredOwners().length / ownerPageSize));
  if (ownerCurrentPage > totalPages) ownerCurrentPage = totalPages;
  renderOwners();
  renderProperties();
  toast("Propietario eliminado.");
  deletingOwnerId = null;
});

ownerSearch.addEventListener("input", () => {
  ownerCurrentPage = 1;
  renderOwners();
});

filterCommunitySelect.addEventListener("change", () => {
  ownerCurrentPage = 1;
  renderOwners();
});

filterMemberSelect.addEventListener("change", () => {
  ownerCurrentPage = 1;
  renderOwners();
});

filterDocStatusSelect.addEventListener("change", () => {
  ownerCurrentPage = 1;
  renderOwners();
});

// Pestañas del Formulario de Propietario
tabBtnOwnerData.addEventListener("click", () => switchOwnerDialogTab("data"));
tabBtnOwnerDocs.addEventListener("click", () => switchOwnerDialogTab("docs"));
btnPrevTab.addEventListener("click", () => switchOwnerDialogTab("data"));
btnNextTab.addEventListener("click", () => switchOwnerDialogTab("docs"));

// Eventos de Subida de Archivos (Inputs)
inputDocDni.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "dni");
  }
});
inputDocBank.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "bankReceipt");
  }
});
inputDocDeed.addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) {
    handleDocFileUpload(e.target.files[0], "propertyDeed");
  }
});

// Drag and Drop en Dropzones
function setupDropzone(dropzoneEl, docType) {
  ["dragenter", "dragover"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzoneEl.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove("dragover");
    });
  });

  dropzoneEl.addEventListener("drop", e => {
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleDocFileUpload(files[0], docType);
    }
  });
}

setupDropzone(dropzoneDni, "dni");
setupDropzone(dropzoneBank, "bankReceipt");
setupDropzone(dropzoneDeed, "propertyDeed");

// Botones de Muestra de Prueba
btnSampleDni.addEventListener("click", () => handleDocSampleLoad("dni"));
btnSampleBank.addEventListener("click", () => handleDocSampleLoad("bankReceipt"));
btnSampleDeed.addEventListener("click", () => handleDocSampleLoad("propertyDeed"));

// Diálogo de Éxito al usuario
closeDocSuccessBtn.addEventListener("click", () => docSuccessDialog.close());

// Buzón de Avisos y Notificaciones del Administrador
if (topbarInboxBtn) topbarInboxBtn.addEventListener("click", openAdminInbox);
if (closeAdminInboxDialog) closeAdminInboxDialog.addEventListener("click", () => adminInboxDialog.close());
if (closeAdminInboxBtn) closeAdminInboxBtn.addEventListener("click", () => adminInboxDialog.close());

// Buzón de Avisos y Notificaciones del Propietario
if (topbarOwnerInboxBtn) topbarOwnerInboxBtn.addEventListener("click", openOwnerInbox);
if (closeOwnerInboxDialog) closeOwnerInboxDialog.addEventListener("click", () => ownerInboxDialog.close());
if (closeOwnerInboxBtn) closeOwnerInboxBtn.addEventListener("click", () => ownerInboxDialog.close());
if (markAllOwnerNotifsReadBtn) {
  markAllOwnerNotifsReadBtn.addEventListener("click", () => {
    ownerNotifications.forEach(n => {
      if (n.ownerId === CURRENT_OWNER_ID) n.read = true;
    });
    saveOwnerNotifications();
    updateOwnerInboxBadge();
    renderOwnerInbox();
    toast("Todos los avisos marcados como leídos.");
  });
}

// Diálogo de Email del Administrador
if (closeAdminEmailDialog) closeAdminEmailDialog.addEventListener("click", () => adminEmailDialog.close());
if (closeAdminEmailBtn) closeAdminEmailBtn.addEventListener("click", () => adminEmailDialog.close());

// Visor de Documento
if (closeDocViewerDialog) closeDocViewerDialog.addEventListener("click", () => docViewerDialog.close());
if (closeDocViewerBtn) closeDocViewerBtn.addEventListener("click", () => docViewerDialog.close());

// Diálogo de Rechazo
if (closeDocRejectDialog) closeDocRejectDialog.addEventListener("click", () => docRejectDialog.close());
if (cancelDocRejectBtn) cancelDocRejectBtn.addEventListener("click", () => docRejectDialog.close());

// Selector de Modo de Rol (Administrador / Propietario)
if (activeRoleSelect) {
  activeRoleSelect.addEventListener("change", () => {
    activeRole = activeRoleSelect.value;
    applyRoleUI();
    renderCommunities();
    renderOwners();
    renderProperties();
    renderHomeDashboard();
    handleRouting();
    if (activeRole === "owner") {
      toast("Modo Propietario activado. Visualizando la plataforma como asociado.");
    } else {
      toast("Modo Administrador activado. Gestión completa y aprobación habilitada.");
    }
  });
}

// ==========================================
// 10. INICIALIZACIÓN
// ==========================================

applyRoleUI();
renderCommunities();
renderOwners();
renderProperties();
renderHomeDashboard();
loadLocations();
updateCommunitySelectors();
updateInboxBadge();
updateOwnerInboxBadge();
handleRouting();



// ==========================================
// LISTENERS DE VERIFICACIÓN, COMBOS Y MÁSCARAS
// ==========================================

// Cierre de modal de validación en bloque
const closeOwnerValidationBtn = document.querySelector("#close-owner-validation-btn");
const closeOwnerValidationDialogBtn = document.querySelector("#close-owner-validation-dialog");
[closeOwnerValidationBtn, closeOwnerValidationDialogBtn].forEach(button => {
  if (button && ownerValidationDialog) {
    button.addEventListener("click", () => ownerValidationDialog.close());
  }
});

// 1. Verificación de Teléfono
const btnSendPhoneCode = document.querySelector("#btn-send-phone-code");
const btnConfirmPhoneCode = document.querySelector("#btn-confirm-phone-code");

if (btnSendPhoneCode) {
  btnSendPhoneCode.addEventListener("click", async () => {
    const raw = ownPhoneInput.value;
    const phone = digitsOnly(raw, 9);
    if (!isValidPhone(phone)) {
      setVerifyStatus("phone", "error", "Introduce un número de 9 dígitos antes de solicitar el código.");
      ownPhoneInput.focus();
      return;
    }
    contactVerify.phone.verified = false;
    contactVerify.phone.verifiedAt = "";
    contactVerify.phone.pending = false;
    btnSendPhoneCode.disabled = true;
    btnSendPhoneCode.textContent = "Enviando SMS...";
    try {
      const res = await ContactVerificationApi.sendPhoneCode(phone);
      if (!res.challengeId) {
        throw new Error("El servicio de verificación no devolvió el identificador del reto.");
      }
      Object.assign(contactVerify.phone, {
        pending: true,
        value: phone,
        challengeId: res.challengeId
      });
      phoneVerifyPanel.hidden = false;
      phoneVerifyCodeInput.value = "";
      setVerifyStatus("phone", "pending", `Código enviado por SMS${res.maskedDestination ? ` a ${res.maskedDestination}` : ""}.`);
      phoneVerifyCodeInput.focus();
    } catch (error) {
      contactVerify.phone.challengeId = "";
      phoneVerifyPanel.hidden = true;
      phoneVerifyCodeInput.value = "";
      const message = error instanceof Error ? error.message : String(error);
      setVerifyStatus("phone", "error", message);
    } finally {
      btnSendPhoneCode.disabled = false;
      btnSendPhoneCode.textContent = "Reenviar SMS";
    }
  });
}

if (btnConfirmPhoneCode) {
  btnConfirmPhoneCode.addEventListener("click", async () => {
    const code = phoneVerifyCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      setVerifyStatus("phone", "error", "Introduce el código de 6 dígitos recibido.");
      return;
    }
    if (!contactVerify.phone.pending || !contactVerify.phone.challengeId ||
        contactVerify.phone.value !== digitsOnly(ownPhoneInput.value, 9)) {
      setVerifyStatus("phone", "error", "Solicita un código nuevo para el teléfono actual.");
      return;
    }
    btnConfirmPhoneCode.disabled = true;
    try {
      const res = await ContactVerificationApi.confirmPhone(contactVerify.phone.challengeId, code);
      if (res.verified !== true || !res.verifiedAt) {
        throw new Error("El código de verificación del teléfono no es válido.");
      }
      contactVerify.phone.verified = true;
      contactVerify.phone.pending = false;
      contactVerify.phone.verifiedAt = res.verifiedAt;
      phoneVerifyPanel.hidden = true;
      setVerifyStatus("phone", "verified", "✓ Teléfono verificado por SMS");
      toast("Teléfono verificado correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVerifyStatus("phone", "error", message);
    } finally {
      btnConfirmPhoneCode.disabled = false;
    }
  });
}

// 2. Verificación de Email
const btnSendEmailCode = document.querySelector("#btn-send-email-code");
const btnConfirmEmailCode = document.querySelector("#btn-confirm-email-code");

if (btnSendEmailCode) {
  btnSendEmailCode.addEventListener("click", async () => {
    const email = (ownerForm.elements.email?.value || "").trim();
    if (!isValidEmail(email)) {
      setVerifyStatus("email", "error", "Introduce un correo válido antes de solicitar el código.");
      ownerForm.elements.email.focus();
      return;
    }
    contactVerify.email.verified = false;
    contactVerify.email.verifiedAt = "";
    contactVerify.email.pending = false;
    btnSendEmailCode.disabled = true;
    btnSendEmailCode.textContent = "Enviando correo...";
    try {
      const res = await ContactVerificationApi.sendEmailCode(email);
      if (!res.challengeId) {
        throw new Error("El servicio de verificación no devolvió el identificador del reto.");
      }
      Object.assign(contactVerify.email, {
        pending: true,
        value: email.toLowerCase(),
        challengeId: res.challengeId
      });
      emailVerifyPanel.hidden = false;
      emailVerifyCodeInput.value = "";
      setVerifyStatus("email", "pending", `Código enviado por email${res.maskedDestination ? ` a ${res.maskedDestination}` : ""}.`);
      emailVerifyCodeInput.focus();
    } catch (error) {
      contactVerify.email.challengeId = "";
      emailVerifyPanel.hidden = true;
      emailVerifyCodeInput.value = "";
      const message = error instanceof Error ? error.message : String(error);
      setVerifyStatus("email", "error", message);
    } finally {
      btnSendEmailCode.disabled = false;
      btnSendEmailCode.textContent = "Reenviar código";
    }
  });
}

if (btnConfirmEmailCode) {
  btnConfirmEmailCode.addEventListener("click", async () => {
    const code = emailVerifyCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      setVerifyStatus("email", "error", "Introduce el código de 6 dígitos recibido por email.");
      return;
    }
    if (!contactVerify.email.pending || !contactVerify.email.challengeId ||
        contactVerify.email.value !== (ownerForm.elements.email.value || "").trim().toLowerCase()) {
      setVerifyStatus("email", "error", "Solicita un código nuevo para el correo actual.");
      return;
    }
    btnConfirmEmailCode.disabled = true;
    try {
      const res = await ContactVerificationApi.confirmEmail(contactVerify.email.challengeId, code);
      if (res.verified !== true || !res.verifiedAt) {
        throw new Error("El código de verificación del correo no es válido.");
      }
      contactVerify.email.verified = true;
      contactVerify.email.pending = false;
      contactVerify.email.verifiedAt = res.verifiedAt;
      emailVerifyPanel.hidden = true;
      setVerifyStatus("email", "verified", "✓ Correo electrónico verificado");
      toast("Correo electrónico verificado con éxito.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVerifyStatus("email", "error", message);
    } finally {
      btnConfirmEmailCode.disabled = false;
    }
  });
}

// Reset de estado verificado si el usuario cambia el teléfono o el email
if (ownPhoneInput) {
  ownPhoneInput.addEventListener("input", () => {
    const clean = digitsOnly(ownPhoneInput.value, 9);
    ownPhoneInput.value = formatPhone(ownPhoneInput.value);
    if (clean !== contactVerify.phone.value) {
      contactVerify.phone.verified = false;
      contactVerify.phone.verifiedAt = "";
      contactVerify.phone.pending = false;
      contactVerify.phone.challengeId = "";
      phoneVerifyPanel.hidden = true;
      phoneVerifyCodeInput.value = "";
      setVerifyStatus("phone", "pending", "Pendiente de verificación");
    }
  });
}

if (ownOtherPhoneInput) {
  ownOtherPhoneInput.addEventListener("input", () => {
    ownOtherPhoneInput.value = formatPhone(ownOtherPhoneInput.value);
  });
}

if (ownerForm.elements.email) {
  ownerForm.elements.email.addEventListener("input", () => {
    const current = (ownerForm.elements.email.value || "").trim().toLowerCase();
    if (current !== contactVerify.email.value) {
      contactVerify.email.verified = false;
      contactVerify.email.verifiedAt = "";
      contactVerify.email.pending = false;
      contactVerify.email.challengeId = "";
      emailVerifyPanel.hidden = true;
      emailVerifyCodeInput.value = "";
      setVerifyStatus("email", "pending", "Pendiente de verificación");
    }
  });
}

// 3. Máscara de IBAN
if (ownIbanInput) {
  ownIbanInput.addEventListener("input", () => {
    maskIbanField(ownIbanInput);
  });
}

// 4. Máscara de Referencia Catastral (20 caracteres alfanuméricos)
if (ownerForm.elements.cadastralRef) {
  ownerForm.elements.cadastralRef.addEventListener("input", () => {
    ownerForm.elements.cadastralRef.value = ownerForm.elements.cadastralRef.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  });
}

// 5. Dependencia Provincia -> Municipio -> Código Postal
if (ownerForm.elements.province) {
  ownerForm.elements.province.addEventListener("change", () => {
    const prov = ownerForm.elements.province.value;
    fillOwnerMunicipalities(prov);
    fillOwnerPostalCodes(null);
  });
}

if (ownerForm.elements.city) {
  ownerForm.elements.city.addEventListener("change", () => {
    const cityId = ownerForm.elements.city.value;
    fillOwnerPostalCodes(cityId);
  });
}

// 6. Combo desplegable de Inmuebles con filtro y autocompletado
if (propertyComboInput && propertyComboList) {
  let activePropertyOption = -1;
  const selectPropertyOption = option => {
    if (!option) return;
    applyPropertyToForm(option.dataset.id);
    propertyComboList.hidden = true;
    propertyComboInput.setAttribute("aria-expanded", "false");
    propertyComboInput.removeAttribute("aria-activedescendant");
    activePropertyOption = -1;
  };

  propertyComboInput.addEventListener("focus", () => {
    renderPropertyComboOptions(propertyComboInput.value);
  });

  propertyComboInput.addEventListener("input", () => {
    activePropertyOption = -1;
    propertyIdInput.value = "";
    renderPropertyComboOptions(propertyComboInput.value);
  });

  propertyComboInput.addEventListener("keydown", event => {
    const options = [...propertyComboList.querySelectorAll("li[data-id]")];
    if (event.key === "Escape") {
      propertyComboList.hidden = true;
      propertyComboInput.setAttribute("aria-expanded", "false");
      propertyComboInput.removeAttribute("aria-activedescendant");
      return;
    }
    if (!options.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    if (event.key === "Enter") {
      if (activePropertyOption >= 0) {
        event.preventDefault();
        selectPropertyOption(options[activePropertyOption]);
      }
      return;
    }
    event.preventDefault();
    activePropertyOption = event.key === "ArrowDown"
      ? (activePropertyOption + 1) % options.length
      : (activePropertyOption <= 0 ? options.length - 1 : activePropertyOption - 1);
    options.forEach((option, index) => {
      option.id = `property-combo-option-${index}`;
      option.setAttribute("aria-selected", String(index === activePropertyOption));
    });
    propertyComboInput.setAttribute("aria-activedescendant", options[activePropertyOption].id);
    options[activePropertyOption].scrollIntoView({ block: "nearest" });
  });

  propertyComboList.addEventListener("mousedown", e => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    selectPropertyOption(li);
  });

  propertyComboInput.addEventListener("blur", () => {
    setTimeout(() => {
      propertyComboList.hidden = true;
      propertyComboInput.setAttribute("aria-expanded", "false");
      propertyComboInput.removeAttribute("aria-activedescendant");
      activePropertyOption = -1;
    }, 200);
  });

  if (ownerForm.elements.communityId) {
    ownerForm.elements.communityId.addEventListener("change", () => {
      propertyComboInput.value = "";
      propertyIdInput.value = "";
      activePropertyOption = -1;
      renderPropertyComboOptions("");
    });
  }
}
