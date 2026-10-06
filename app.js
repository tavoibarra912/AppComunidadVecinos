"use strict";

const STORAGE_KEY = "penarrubia.communities.v1";

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

const seed = [
  {
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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

let communities = load();
let editingId = null;
let deletingId = null;
let viewingId = null;
let pageSize = 5;
let currentPage = 1;
let locations = [];
let locationsById = new Map();
let postalIndex = new Map();

// Elementos del DOM
const list = document.querySelector("#community-list");
const empty = document.querySelector("#empty-state");
const count = document.querySelector("#result-count");
const search = document.querySelector("#search");
const form = document.querySelector("#community-form");
const dialog = document.querySelector("#community-dialog");
const deleteDialog = document.querySelector("#delete-dialog");
const error = document.querySelector("#form-error");

// Elementos del diálogo de detalle (Más info)
const detailDialog = document.querySelector("#detail-dialog");
const closeDetailDialog = document.querySelector("#close-detail-dialog");
const closeDetailBtn = document.querySelector("#close-detail-btn");
const detailEditBtn = document.querySelector("#detail-edit-btn");

// Elementos de paginación
const paginationBar = document.querySelector("#pagination-bar");
const pageSizeSelect = document.querySelector("#page-size");
const prevPageBtn = document.querySelector("#prev-page");
const nextPageBtn = document.querySelector("#next-page");
const pageCurrent = document.querySelector("#page-current");
const paginationInfo = document.querySelector("#pagination-info");

// Campos del formulario
const nifInput = form.elements.nif;
const phoneInput = form.elements.phone;
const otherPhoneInput = form.elements.otherPhone;
const emailInput = form.elements.email;
const citySelect = form.elements.city;
const provinceSelect = form.elements.province;
const postalCodeInput = form.elements.postalCode;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      // Si hay menos de 5 guardados de versiones previas, combinamos con el resto de semillas para facilitar probar la paginación
      if (saved.length <= 2) {
        const existingNifs = new Set(saved.map(c => c.nif));
        const additionalSeeds = seed.filter(s => !existingNifs.has(s.nif));
        return [...saved, ...additionalSeeds];
      }
      return saved;
    }
    return seed;
  } catch {
    return seed;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(communities));
}

function filtered() {
  const q = search.value.trim().toLocaleLowerCase("es");
  if (!q) return communities;
  return communities.filter(c =>
    [c.name, c.nif, c.city, c.address, c.phone, c.email].some(v =>
      (v || "").toLocaleLowerCase("es").includes(q)
    )
  );
}

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  if (totalItems === 0) {
    paginationBar.hidden = true;
    return;
  }
  paginationBar.hidden = false;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  paginationInfo.textContent = `Mostrando ${start}–${end} de ${totalItems} ${totalItems === 1 ? "comunidad" : "comunidades"}`;
  pageCurrent.textContent = `Página ${currentPage} de ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

function render() {
  const items = filtered();
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * pageSize;
  const pagedItems = items.slice(startIndex, startIndex + pageSize);

  list.replaceChildren();

  pagedItems.forEach(c => {
    const row = document.createElement("tr");

    // 1. Nombre y observaciones
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
    tdNif.textContent = c.nif;
    row.append(tdNif);

    // 3. Dirección
    const tdAddress = document.createElement("td");
    tdAddress.textContent = c.address;
    row.append(tdAddress);

    // 4. Municipio y provincia
    const tdCity = document.createElement("td");
    tdCity.textContent = `${c.city}, ${c.province}`;
    row.append(tdCity);

    // 5. Contacto: Espacio suficiente para los 9 dígitos del teléfono + email debajo
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

    // 6. Acciones: Iconos estándar (Más info, Editar, Eliminar)
    const actions = document.createElement("td");
    actions.className = "row-actions col-actions";

    // Botón Más info (icono estándar de información)
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
    btnInfo.addEventListener("click", () => openDetail(c.id));

    // Botón Editar (icono estándar de lápiz/edición)
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
    btnEdit.addEventListener("click", () => openEditor(c.id));

    // Botón Eliminar (icono estándar de papelera)
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
    btnDelete.addEventListener("click", () => openDelete(c.id));

    actions.append(btnInfo, btnEdit, btnDelete);
    row.append(actions);
    list.append(row);
  });

  empty.hidden = items.length !== 0;
  count.textContent = `${items.length} ${items.length === 1 ? "comunidad" : "comunidades"}`;
  renderPagination(items.length);
}

function addPlaceholder(select, text) {
  select.replaceChildren(new Option(text, ""));
}

function selectCommunity(city, province) {
  const match = locations.find(location => location.name === city && location.province === province) ||
                locations.find(location => location.name === city);
  if (match) citySelect.value = match.id;
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

  if (dialog.open) {
    const editing = communities.find(community => community.id === editingId);
    if (editing) selectCommunity(editing.city, editing.province);
    else syncFromPostalCode();
  }
}

function loadLocations() {
  if (window.MUNICIPIOS_INE) {
    populateLocations(window.MUNICIPIOS_INE);
    return;
  }
  addPlaceholder(citySelect, "No se pudieron cargar los municipios");
  addPlaceholder(provinceSelect, "No se pudieron cargar las provincias");
  error.textContent = "No se ha podido cargar el catálogo territorial. Recarga la página para continuar.";
}

function syncFromPostalCode() {
  const postalCode = postalCodeInput.value;
  const matches = postalIndex.get(postalCode);
  if (postalCode.length === 5 && matches?.length) {
    const location = matches[0];
    citySelect.value = location.id;
    provinceSelect.value = location.province;
  }
}

function syncFromCity() {
  const location = locationsById.get(citySelect.value);
  if (location) {
    provinceSelect.value = location.province;
    postalCodeInput.value = location.postalCodes[0] || "";
  }
}

function validateFields() {
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

function openEditor(id = null) {
  editingId = id;
  form.reset();
  error.textContent = "";
  const c = communities.find(item => item.id === id);
  document.querySelector("#dialog-title").textContent = c ? "Editar comunidad" : "Nueva comunidad";
  if (c) {
    Object.entries(c).forEach(([key, value]) => {
      if (form.elements[key] && key !== "city") {
        form.elements[key].value = value;
      }
    });
    selectCommunity(c.city, c.province);
  }
  dialog.showModal();
  form.elements.name.focus();
}

function closeEditor() {
  dialog.close();
  editingId = null;
}

function openDetail(id) {
  const c = communities.find(item => item.id === id);
  if (!c) return;
  viewingId = id;

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

  detailDialog.showModal();
}

function closeDetail() {
  detailDialog.close();
  viewingId = null;
}

function openDelete(id) {
  deletingId = id;
  const c = communities.find(item => item.id === id);
  document.querySelector("#delete-message").textContent = `Vas a eliminar “${c.name}”. Esta acción no se puede deshacer.`;
  deleteDialog.showModal();
}

function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  window.setTimeout(() => el.classList.remove("visible"), 2800);
}

// Envío del formulario (Crear / Actualizar)
form.addEventListener("submit", event => {
  event.preventDefault();
  validateFields();

  const selectedLocation = locationsById.get(citySelect.value);

  if (!form.checkValidity() || !selectedLocation) {
    if (nifInput.validationMessage) {
      error.textContent = "Hay un error en el campo NIF; corrígelo para continuar.";
    } else if (postalCodeInput.validationMessage) {
      error.textContent = "Hay un error en el campo código postal; corrígelo para continuar.";
    } else if (phoneInput.validationMessage) {
      error.textContent = "El teléfono debe contener 9 dígitos numéricos.";
    } else if (otherPhoneInput.validationMessage) {
      error.textContent = "El otro teléfono debe contener 9 dígitos numéricos.";
    } else if (emailInput.validationMessage) {
      error.textContent = "Hay un error en el email de contacto; corrígelo para continuar.";
    } else {
      error.textContent = "Revisa los campos obligatorios y sus formatos.";
    }
    form.reportValidity();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  ["name", "nif", "address", "phone", "otherPhone", "postalCode", "email"].forEach(key => {
    data[key] = (data[key] || "").trim();
  });
  data.city = selectedLocation.name;
  data.province = provinceSelect.value;

  if (communities.some(c => c.nif === data.nif && c.id !== editingId)) {
    error.textContent = "Ya existe una comunidad con ese NIF.";
    return;
  }

  if (editingId) {
    communities = communities.map(c => c.id === editingId ? { ...data, id: editingId } : c);
    toast("Comunidad actualizada.");
  } else {
    communities.unshift({ ...data, id: crypto.randomUUID() });
    currentPage = 1;
    toast("Comunidad creada.");
  }

  save();
  closeEditor();
  render();
});

// Entradas dinámicas y filtros de caracteres
nifInput.addEventListener("input", () => {
  nifInput.value = nifInput.value.toUpperCase();
  nifInput.setCustomValidity("");
});

[phoneInput, otherPhoneInput].forEach(input => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "");
    input.setCustomValidity("");
  });
});

emailInput.addEventListener("input", () => {
  emailInput.setCustomValidity("");
});

postalCodeInput.addEventListener("input", () => {
  postalCodeInput.value = postalCodeInput.value.replace(/\D/g, "").slice(0, 5);
  postalCodeInput.setCustomValidity("");
  syncFromPostalCode();
});

citySelect.addEventListener("change", syncFromCity);

// Botones de modales
document.querySelector("#new-community").addEventListener("click", () => openEditor());
document.querySelector("#close-dialog").addEventListener("click", closeEditor);
document.querySelector("#cancel-dialog").addEventListener("click", closeEditor);

// Eventos del modal de Detalle (Más info)
closeDetailDialog.addEventListener("click", closeDetail);
closeDetailBtn.addEventListener("click", closeDetail);
detailEditBtn.addEventListener("click", () => {
  const targetId = viewingId;
  closeDetail();
  if (targetId) openEditor(targetId);
});

// Eventos de Paginación
pageSizeSelect.addEventListener("change", e => {
  pageSize = Number(e.target.value);
  currentPage = 1;
  render();
});

prevPageBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    render();
  }
});

nextPageBtn.addEventListener("click", () => {
  const totalPages = Math.ceil(filtered().length / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    render();
  }
});

// Confirmación de eliminación
document.querySelector("#confirm-delete").addEventListener("click", () => {
  communities = communities.filter(c => c.id !== deletingId);
  save();
  const totalPages = Math.max(1, Math.ceil(filtered().length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  render();
  toast("Comunidad eliminada.");
  deletingId = null;
});

// Búsqueda
search.addEventListener("input", () => {
  currentPage = 1;
  render();
});

// Inicialización
render();
loadLocations();
