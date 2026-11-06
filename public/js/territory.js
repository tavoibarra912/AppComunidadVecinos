// ==========================================
// CATÁLOGO TERRITORIAL (INE)
// provincias → municipios → códigos postales
// ==========================================

export const PROVINCES = {
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

let locations = [];
let locationsById = new Map();
let postalIndex = new Map();

export function isValidPostalCode(value) {
  return /^\d{5}$/.test(value) && postalIndex.has(value);
}

function addPlaceholder(select, text) {
  select.replaceChildren(new Option(text, ""));
}

function communityFormEl() {
  return document.querySelector("#community-form");
}

function ownerFormEl() {
  return document.querySelector("#owner-form");
}

function propertyFormEl() {
  return document.querySelector("#property-form");
}

export function populateLocations(data) {
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

  const form = communityFormEl();
  if (form) {
    populateSelectOptions(form.elements.city, form.elements.province);
  }
  const propertyForm = propertyFormEl();
  if (propertyForm) {
    populateSelectOptions(propertyForm.elements.city, propertyForm.elements.province);
  }
  initOwnerTerritorySelects();
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

export function loadLocations() {
  if (window.MUNICIPIOS_INE) {
    populateLocations(window.MUNICIPIOS_INE);
    return true;
  }
  return false;
}

export function syncPostalCode(postalCodeInput, citySelect, provinceSelect) {
  const postalCode = postalCodeInput.value.trim();
  const matches = postalIndex.get(postalCode);
  if (postalCode.length === 5 && matches?.length) {
    const location = matches[0];
    citySelect.value = location.id;
    provinceSelect.value = location.province;
  }
}

export function syncCity(citySelect, provinceSelect, postalCodeInput) {
  const location = locationsById.get(citySelect.value);
  if (location) {
    provinceSelect.value = location.province;
    if (postalCodeInput) {
      postalCodeInput.value = location.postalCodes[0] || "";
    }
  }
}

export function selectLocationInForm(formEl, city, province) {
  const citySelect = formEl.elements.city;
  const match = locations.find(loc => loc.name === city && loc.province === province) ||
                locations.find(loc => loc.name === city);
  if (match) citySelect.value = match.id;
}

export function initOwnerTerritorySelects() {
  const form = ownerFormEl();
  if (!form) return;
  const provinceSelect = form.elements.province;
  addPlaceholder(provinceSelect, "Selecciona una provincia");
  Object.values(PROVINCES).sort((a, b) => a.localeCompare(b, "es")).forEach(province => {
    provinceSelect.add(new Option(province, province));
  });
  provinceSelect.disabled = false;
  fillOwnerMunicipalities("");
  fillOwnerPostalCodes(null);
}

export function fillOwnerMunicipalities(provinceName, selectedCityId = "") {
  const form = ownerFormEl();
  if (!form) return;
  const citySelect = form.elements.city;
  addPlaceholder(citySelect, provinceName ? "Selecciona un municipio" : "Selecciona primero una provincia");
  if (provinceName) {
    locations
      .filter(loc => loc.province === provinceName)
      .forEach(loc => citySelect.add(new Option(loc.name, loc.id)));
  }
  citySelect.disabled = !provinceName;
  if (selectedCityId) citySelect.value = selectedCityId;
}

export function fillOwnerPostalCodes(cityId, selectedCp = "") {
  const form = ownerFormEl();
  if (!form) return;
  const cpSelect = form.elements.postalCode;
  addPlaceholder(cpSelect, cityId ? "Selecciona un código postal" : "Selecciona primero un municipio");
  const location = locationsById.get(cityId);
  if (location) {
    location.postalCodes.forEach(cp => cpSelect.add(new Option(cp, cp)));
  }
  cpSelect.disabled = !location;
  if (selectedCp) cpSelect.value = selectedCp;
}

export function selectOwnerTerritory(city, province, postalCode) {
  const form = ownerFormEl();
  if (!form) return;
  const provinceSelect = form.elements.province;
  const match = locations.find(loc => loc.name === city && loc.province === province) ||
                locations.find(loc => loc.name === city);
  const provinceName = province || match?.province || "";
  provinceSelect.value = provinceName;
  fillOwnerMunicipalities(provinceName, match ? match.id : "");
  fillOwnerPostalCodes(match ? match.id : "", postalCode || "");
}

export function getLocationById(id) {
  return locationsById.get(id) || null;
}
