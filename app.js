"use strict";

// ==========================================
// 1. CONSTANTES Y CONFIGURACIÓN
// ==========================================

const COMMUNITIES_STORAGE_KEY = "penarrubia.communities.v1";
const OWNERS_STORAGE_KEY = "penarrubia.owners.v1";

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
    notes: "Vocal de la junta directiva de Peñarrubia."
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
    notes: "Solicita comunicaciones preferentes por correo electrónico."
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

// ==========================================
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================

let communities = loadCommunities();
let owners = loadOwners();

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

// Elementos de Comunidades
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

// Elementos de Propietarios
const ownerList = document.querySelector("#owner-list");
const ownerEmpty = document.querySelector("#owner-empty-state");
const ownerCount = document.querySelector("#owner-result-count");
const ownerSearch = document.querySelector("#search-owners");
const filterCommunitySelect = document.querySelector("#filter-community");
const filterMemberSelect = document.querySelector("#filter-member");
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
// 6. ENRUTAMIENTO Y NAVEGACIÓN
// ==========================================

function handleRouting() {
  const hash = (window.location.hash || "#comunidades").toLowerCase();
  const isOwners = hash === "#propietarios";

  if (isOwners) {
    secComunidades.hidden = true;
    secPropietarios.hidden = false;

    navComunidades.classList.remove("active");
    navPropietarios.classList.add("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.remove("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.add("active");

    document.title = "Peñarrubia · Propietarios";
    renderOwners();
  } else {
    secPropietarios.hidden = true;
    secComunidades.hidden = false;

    navPropietarios.classList.remove("active");
    navComunidades.classList.add("active");
    if (mobileNavPropietarios) mobileNavPropietarios.classList.remove("active");
    if (mobileNavComunidades) mobileNavComunidades.classList.add("active");

    document.title = "Peñarrubia · Comunidades";
    renderCommunities();
  }
}

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
  const items = filteredCommunities();
  const totalPages = Math.max(1, Math.ceil(items.length / communityPageSize));
  if (communityCurrentPage > totalPages) communityCurrentPage = totalPages;

  const startIndex = (communityCurrentPage - 1) * communityPageSize;
  const pagedItems = items.slice(startIndex, startIndex + communityPageSize);

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

    // 5. Contacto
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

    // 6. Acciones
    const actions = document.createElement("td");
    actions.className = "row-actions col-actions";

    const btnInfo = document.createElement("button");
    btnInfo.type = "button";
    btnInfo.className = "icon-action-btn btn-info";
    btnInfo.title = "Más info";
    btnInfo.setAttribute("aria-label", `Más información de ${c.name}`);
    btnInfo.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
    btnInfo.addEventListener("click", () => openCommunityDetail(c.id));

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
    row.append(actions);
    communityList.append(row);
  });

  communityEmpty.hidden = items.length !== 0;
  communityCount.textContent = `${items.length} ${items.length === 1 ? "comunidad" : "comunidades"}`;
  renderCommunityPagination(items.length);
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
      return saved;
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
  const items = filteredOwners();
  const totalPages = Math.max(1, Math.ceil(items.length / ownerPageSize));
  if (ownerCurrentPage > totalPages) ownerCurrentPage = totalPages;

  const startIndex = (ownerCurrentPage - 1) * ownerPageSize;
  const pagedItems = items.slice(startIndex, startIndex + ownerPageSize);

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

    // 7. Acciones (Iconos estándar accesibles: Más info, Editar, Eliminar)
    const actions = document.createElement("td");
    actions.className = "row-actions col-actions";

    const btnInfo = document.createElement("button");
    btnInfo.type = "button";
    btnInfo.className = "icon-action-btn btn-info";
    btnInfo.title = "Más info";
    btnInfo.setAttribute("aria-label", `Ficha detallada de ${o.name} ${o.surname}`);
    btnInfo.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
    btnInfo.addEventListener("click", () => openOwnerDetail(o.id));

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "icon-action-btn btn-edit";
    btnEdit.title = "Editar";
    btnEdit.setAttribute("aria-label", `Editar ${o.name} ${o.surname}`);
    btnEdit.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
        <path d="m15 5 4 4"></path>
      </svg>
    `;
    btnEdit.addEventListener("click", () => openOwnerEditor(o.id));

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

    actions.append(btnInfo, btnEdit, btnDelete);
    row.append(actions);
    ownerList.append(row);
  });

  ownerEmpty.hidden = items.length !== 0;
  ownerCount.textContent = `${items.length} ${items.length === 1 ? "propietario" : "propietarios"}`;
  renderOwnerPagination(items.length);
}

function openOwnerEditor(id = null) {
  editingOwnerId = id;
  ownerForm.reset();
  ownerError.textContent = "";

  updateCommunitySelectors();

  const o = owners.find(item => item.id === id);
  document.querySelector("#owner-dialog-title").textContent = o ? "Editar propietario" : "Nuevo propietario";

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
  } else {
    // Valor por defecto: si hay un filtro de comunidad activo, precargarlo
    if (filterCommunitySelect.value) {
      ownerForm.elements.communityId.value = filterCommunitySelect.value;
    }
  }

  ownerDialog.showModal();
  ownerForm.elements.name.focus();
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

  ownerDetailDialog.showModal();
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
    ownerError.textContent = "Ya existe un propietario registrado con ese DNI/NIE.";
    return;
  }

  if (editingOwnerId) {
    owners = owners.map(o => o.id === editingOwnerId ? { ...data, id: editingOwnerId } : o);
    toast("Propietario actualizado.");
  } else {
    owners.unshift({ ...data, id: crypto.randomUUID() });
    ownerCurrentPage = 1;
    toast("Propietario creado.");
  }

  saveOwners();
  closeOwnerEditor();
  renderOwners();
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

document.querySelector("#new-owner").addEventListener("click", () => openOwnerEditor());
document.querySelector("#close-owner-dialog").addEventListener("click", closeOwnerEditor);
document.querySelector("#cancel-owner-dialog").addEventListener("click", closeOwnerEditor);

closeOwnerDetailDialog.addEventListener("click", closeOwnerDetail);
closeOwnerDetailBtn.addEventListener("click", closeOwnerDetail);
ownerDetailEditBtn.addEventListener("click", () => {
  const targetId = viewingOwnerId;
  closeOwnerDetail();
  if (targetId) openOwnerEditor(targetId);
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

// ==========================================
// 10. INICIALIZACIÓN
// ==========================================

renderCommunities();
renderOwners();
loadLocations();
updateCommunitySelectors();
handleRouting();
