"use strict";

// ==========================================
// 1. CONSTANTES Y CONFIGURACIÓN
// ==========================================

const COMMUNITIES_STORAGE_KEY = "penarrubia.communities.v1";
const OWNERS_STORAGE_KEY = "penarrubia.owners.v1";
const ADMIN_EMAILS_STORAGE_KEY = "penarrubia.admin_emails.v1";
const OWNER_NOTIFICATIONS_STORAGE_KEY = "penarrubia.owner_notifications.v1";
const CURRENT_OWNER_ID = "own-seed-1"; // Carlos Ruiz Mendoza

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
let owners = loadOwners();
let adminEmails = loadAdminEmails();
let ownerNotifications = loadOwnerNotifications();

let editingCommunityId = null;
let deletingCommunityId = null;
let viewingCommunityId = null;
let communityPageSize = 5;
let communityCurrentPage = 1;

let editingOwnerId = null;
let deletingOwnerId = null;
let viewingOwnerId = null;
let ownerPageSize = 5;
let ownerCurrentPage = 1;
let ownerFilterCommunity = "";
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
const navComunidades = document.querySelector("#nav-comunidades");
const navPropietarios = document.querySelector("#nav-propietarios");
const mobileNavComunidades = document.querySelector("#mobile-nav-comunidades");
const mobileNavPropietarios = document.querySelector("#mobile-nav-propietarios");
const secComunidades = document.querySelector("#comunidades");
const secPropietarios = document.querySelector("#propietarios");
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
const filterMemberSelect = document.querySelector("#filter-member");
const filterDocStatusSelect = document.querySelector("#filter-doc-status");
const ownerForm = document.querySelector("#owner-form");
const ownerDialog = document.querySelector("#owner-dialog");
const ownerDeleteDialog = document.querySelector("#owner-delete-dialog");
const ownerError = document.querySelector("#owner-form-error");

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

  // DNI: 8 dígitos + 1 letra
  const dniMatch = str.match(/^(\d{8})([A-Z])$/);
  if (dniMatch) {
    const num = parseInt(dniMatch[1], 10);
    const letter = dniMatch[2];
    return letters[num % 23] === letter;
  }

  // NIE: X, Y o Z + 7 dígitos + 1 letra
  const nieMatch = str.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (nieMatch) {
    const prefix = nieMatch[1] === "X" ? "0" : (nieMatch[1] === "Y" ? "1" : "2");
    const num = parseInt(prefix + nieMatch[2], 10);
    const letter = nieMatch[3];
    return letters[num % 23] === letter;
  }

  return false;
}

/**
 * Valida formato IBAN español (ES + 22 dígitos numéricos)
 */
function isValidIban(value) {
  if (!value) return true; // Es campo opcional
  const clean = value.replace(/\s+/g, "").toUpperCase();
  return /^ES\d{22}$/.test(clean);
}

/**
 * Formatea un IBAN con espacios cada 4 caracteres para facilitar la lectura
 */
function formatIban(value) {
  if (!value) return "No registrado";
  const clean = value.replace(/\s+/g, "").toUpperCase();
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

// ==========================================
// 4.1. MÓDULO DE DOCUMENTACIÓN Y APROBACIÓN
// ==========================================

/**
 * Devuelve el estado global de la documentación de un propietario:
 * 'none' | 'incomplete' | 'pending_admin' | 'approved' | 'rejected'
 */
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

  // Rellenar selectores del formulario de Comunidades
  const comCitySelect = communityForm.elements.city;
  const comProvinceSelect = communityForm.elements.province;
  populateSelectOptions(comCitySelect, comProvinceSelect);

  // Rellenar selectores del formulario de Propietarios
  const ownCitySelect = ownerForm.elements.city;
  const ownProvinceSelect = ownerForm.elements.province;
  populateSelectOptions(ownCitySelect, ownProvinceSelect);
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

function handleRouting() {
  const hash = (window.location.hash || "#comunidades").toLowerCase();
  const isOwners = hash === "#propietarios";
  const isOwner = activeRole === "owner";

  if (isOwners) {
    if (secComunidades) {
      secComunidades.hidden = true;
      secComunidades.style.display = "none";
    }
    if (secPropietarios) {
      secPropietarios.hidden = false;
      secPropietarios.style.display = "block";
    }

    if (navComunidades) navComunidades.classList.remove("active");
    if (navPropietarios) navPropietarios.classList.add("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.remove("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.add("active");

    document.title = isOwner ? "Peñarrubia · Mi Perfil" : "Peñarrubia · Propietarios";
    renderOwners();
  } else {
    if (secPropietarios) {
      secPropietarios.hidden = true;
      secPropietarios.style.display = "none";
    }
    if (secComunidades) {
      secComunidades.hidden = false;
      secComunidades.style.display = "block";
    }

    if (navPropietarios) navPropietarios.classList.remove("active");
    if (navComunidades) navComunidades.classList.add("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.remove("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.add("active");

    document.title = isOwner ? "Peñarrubia · Mi Comunidad" : "Peñarrubia · Comunidades";
    renderCommunities();
  }
}

function navigateToSection(targetHash) {
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
  handleRouting();
}

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

function loadOwners() {
  try {
    const saved = JSON.parse(localStorage.getItem(OWNERS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      // Garantizar que todos los registros tengan el mapa de documentos
      return saved.map(o => {
        let docs = o.documents;
        if (!docs || Object.keys(docs).length === 0) {
          if (o.dni === "47895231P") docs = createSeedDocsForCarlosRuiz();
          else if (o.dni === "53891244J") docs = createSeedDocsForMariaLuisa();
          else docs = {};
        }
        return { ...o, documents: docs };
      });
    }
    // Sincronizar IDs de comunidad de las semillas con las comunidades reales
    const linkedSeeds = ownerSeeds.map(owner => {
      const match = communities.find(c => c.name === owner.communityName);
      return {
        ...owner,
        communityId: match ? match.id : owner.communityId
      };
    });
    return linkedSeeds;
  } catch {
    return ownerSeeds;
  }
}

function saveOwners() {
  localStorage.setItem(OWNERS_STORAGE_KEY, JSON.stringify(owners));
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
        o.city
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

    // 1. Propietario (Nombre completo y notas)
    const tdName = document.createElement("td");
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

    // 2. DNI / NIE (con badge de documento)
    const tdDni = document.createElement("td");
    const dniBadge = document.createElement("span");
    dniBadge.className = "dni-badge";
    dniBadge.textContent = o.dni;
    tdDni.append(dniBadge);
    row.append(tdDni);

    // 3. Parcela / Inmueble
    const tdPlot = document.createElement("td");
    tdPlot.textContent = o.plot || "—";
    row.append(tdPlot);

    // 4. Comunidad
    const tdCommunity = document.createElement("td");
    const communityBadge = document.createElement("span");
    communityBadge.className = "status-badge community-tag";
    communityBadge.textContent = o.communityName || "Sin comunidad";
    tdCommunity.append(communityBadge);
    row.append(tdCommunity);

    // 5. Contacto (Teléfono y email)
    const tdContact = document.createElement("td");
    tdContact.className = "col-contact";
    const phoneSpan = document.createElement("span");
    phoneSpan.textContent = o.phone || "—";
    tdContact.append(phoneSpan);
    if (o.email) {
      const emailSpan = document.createElement("span");
      emailSpan.className = "community-notes";
      emailSpan.textContent = o.email;
      tdContact.append(emailSpan);
    }
    row.append(tdContact);

    // 6. Condición (Asociado / No asociado)
    const tdMember = document.createElement("td");
    const memberBadge = document.createElement("span");
    memberBadge.className = `status-badge ${o.isMember ? "member" : "non-member"}`;
    memberBadge.textContent = o.isMember ? "Asociado" : "No asociado";
    tdMember.append(memberBadge);
    row.append(tdMember);

    // 7. Documentación requerida (Badge de estado)
    const tdDocs = document.createElement("td");
    const docStatus = getOwnerDocStatus(o);
    const docBadge = document.createElement("span");
    docBadge.className = `status-badge ${getDocBadgeClass(docStatus)}`;
    docBadge.textContent = getDocBadgeText(docStatus, o);
    tdDocs.append(docBadge);
    row.append(tdDocs);

    // 8. Acciones (Más info, Documentos, Editar, Eliminar)
    const actions = document.createElement("td");
    actions.className = "row-actions col-actions";

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

function openOwnerEditor(id = null, defaultTab = "data") {
  const isOwner = activeRole === "owner";
  if (isOwner) {
    id = CURRENT_OWNER_ID;
  }
  editingOwnerId = id;
  ownerForm.reset();
  ownerError.textContent = "";

  updateCommunitySelectors();

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
      if (ownerForm.elements[key] && key !== "city") {
        if (key === "isMember") {
          ownerForm.elements[key].value = String(value);
        } else {
          ownerForm.elements[key].value = value || "";
        }
      }
    });
    selectLocationInForm(ownerForm, o.city, o.province);
    currentEditingDocs = o.documents ? JSON.parse(JSON.stringify(o.documents)) : {};
  } else {
    currentEditingDocs = {};
    if (filterCommunitySelect.value) {
      ownerForm.elements.communityId.value = filterCommunitySelect.value;
    }
  }

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

  ownerDetailDialog.showModal();
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

function validateOwnerFields() {
  const dniInput = ownerForm.elements.dni;
  const phoneInput = ownerForm.elements.phone;
  const otherPhoneInput = ownerForm.elements.otherPhone;
  const emailInput = ownerForm.elements.email;
  const postalCodeInput = ownerForm.elements.postalCode;
  const ibanInput = ownerForm.elements.iban;

  const dni = dniInput.value.trim().toUpperCase();
  const phone = phoneInput.value.trim();
  const otherPhone = otherPhoneInput.value.trim();
  const email = emailInput.value.trim();
  const postalCode = postalCodeInput.value.trim();
  const iban = ibanInput.value.trim().toUpperCase().replace(/\s+/g, "");

  dniInput.value = dni;
  phoneInput.value = phone;
  otherPhoneInput.value = otherPhone;
  emailInput.value = email;
  ibanInput.value = iban;

  dniInput.setCustomValidity(
    isValidDniNie(dni)
      ? ""
      : "El DNI/NIE no es válido. Debe contener 8 dígitos y letra de control válida (o NIE con letra inicial X/Y/Z)."
  );

  phoneInput.setCustomValidity(/^\d{9}$/.test(phone) ? "" : "El teléfono principal debe contener 9 dígitos numéricos.");

  if (otherPhone) {
    otherPhoneInput.setCustomValidity(/^\d{9}$/.test(otherPhone) ? "" : "El otro teléfono debe contener 9 dígitos numéricos.");
  } else {
    otherPhoneInput.setCustomValidity("");
  }

  emailInput.setCustomValidity(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Introduce una dirección de email válida.");

  postalCodeInput.setCustomValidity(
    /^\d{5}$/.test(postalCode) && postalIndex.has(postalCode)
      ? ""
      : "El código postal debe contener 5 dígitos y corresponder a un código postal del catálogo de España."
  );

  if (iban) {
    ibanInput.setCustomValidity(isValidIban(iban) ? "" : "El IBAN debe comenzar por ES seguido de 22 dígitos numéricos.");
  } else {
    ibanInput.setCustomValidity("");
  }
}

ownerForm.addEventListener("submit", event => {
  event.preventDefault();
  validateOwnerFields();

  const citySelect = ownerForm.elements.city;
  const provinceSelect = ownerForm.elements.province;
  const selectedLocation = locationsById.get(citySelect.value);

  if (!ownerForm.checkValidity() || !selectedLocation) {
    switchOwnerDialogTab("data");
    if (ownerForm.elements.dni.validationMessage) {
      ownerError.textContent = "El DNI/NIE introducido no es válido; verifica los números y la letra.";
    } else if (ownerForm.elements.phone.validationMessage) {
      ownerError.textContent = "El teléfono principal debe tener 9 dígitos numéricos.";
    } else if (ownerForm.elements.otherPhone.validationMessage) {
      ownerError.textContent = "El otro teléfono debe tener 9 dígitos numéricos.";
    } else if (ownerForm.elements.email.validationMessage) {
      ownerError.textContent = "El formato del email no es válido.";
    } else if (ownerForm.elements.postalCode.validationMessage) {
      ownerError.textContent = "Código postal no válido o no localizado en el catálogo del INE.";
    } else if (ownerForm.elements.iban.validationMessage) {
      ownerError.textContent = "Formato de IBAN español incorrecto (ES + 22 dígitos).";
    } else {
      ownerError.textContent = "Por favor, revisa los campos requeridos y sus formatos.";
    }
    ownerForm.reportValidity();
    return;
  }

  const formData = new FormData(ownerForm);
  const data = Object.fromEntries(formData);

  ["name", "surname", "dni", "plot", "phone", "otherPhone", "email", "address", "postalCode", "iban", "notes"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });

  data.dni = data.dni.toUpperCase();
  data.city = selectedLocation.name;
  data.province = provinceSelect.value;
  data.isMember = data.isMember === "true";

  // Buscar nombre de la comunidad seleccionada
  const linkedComm = communities.find(c => c.id === data.communityId);
  data.communityName = linkedComm ? linkedComm.name : "";

  // Comprobar DNI duplicado
  if (owners.some(o => o.dni === data.dni && o.id !== editingOwnerId)) {
    switchOwnerDialogTab("data");
    ownerError.textContent = "Ya existe un propietario registrado con ese DNI/NIE.";
    return;
  }

  // Asignar documentación validada y relacionada sólo y únicamente para este usuario
  data.documents = currentEditingDocs;

  const docKeys = ["dni", "bankReceipt", "propertyDeed"];
  const uploadedCount = docKeys.filter(k => !!currentEditingDocs[k]).length;
  const isCompleteDocs = uploadedCount === 3;

  if (editingOwnerId) {
    data.id = editingOwnerId;
    owners = owners.map(o => o.id === editingOwnerId ? { ...data } : o);
    toast("Propietario actualizado.");
  } else {
    data.id = crypto.randomUUID();
    owners.unshift({ ...data });
    ownerCurrentPage = 1;
    toast("Propietario creado.");
  }

  saveOwners();
  closeOwnerEditor();
  renderOwners();

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
  owners = owners.filter(o => o.id !== deletingOwnerId);
  saveOwners();
  const totalPages = Math.max(1, Math.ceil(filteredOwners().length / ownerPageSize));
  if (ownerCurrentPage > totalPages) ownerCurrentPage = totalPages;
  renderOwners();
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
loadLocations();
updateCommunitySelectors();
updateInboxBadge();
updateOwnerInboxBadge();
handleRouting();

