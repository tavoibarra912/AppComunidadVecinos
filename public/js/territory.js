// ==========================================
// CATÁLOGO TERRITORIAL (INE)
// provincias → municipios → códigos postales
// ==========================================
// Control unificado para todos los formularios (comunidad, propietario e
// inmueble): los tres usan los mismos combos con buscador y la misma
// sincronización bidireccional:
//   · CP completo y válido → llena municipio y provincia.
//   · Municipio → llena provincia y código postal (el CP actual si sigue
//     siendo válido para el municipio; si no, el primero).
//   · Provincia → llena el desplegable de municipios con los de esa provincia
//     (si hay uno único, lo selecciona junto a su código postal).
// El orden visual exigido en los formularios es Municipio → Provincia → CP.

import { makeSelectSearchable } from "./utils.js";

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

const PROVINCE_LIST = Object.values(PROVINCES).sort((a, b) => a.localeCompare(b, "es"));

let locations = [];
let locationsById = new Map();
let postalIndex = new Map();

export function isValidPostalCode(value) {
  return /^\d{5}$/.test(value) && postalIndex.has(value);
}

export function getLocationById(id) {
  return locationsById.get(id) || null;
}

class TerritoryControl {
  constructor(formEl) {
    this.form = formEl || null;
    this.city = this.form?.elements?.city || null;
    this.province = this.form?.elements?.province || null;
    this.cp = this.form?.elements?.postalCode || null;
    this.ready = false;
    this.filteredProvince = "";
  }

  hasControls() {
    return !!(this.form && this.city && this.province && this.cp);
  }

  /** Puebla los tres controles cuando el catálogo ya está cargado. */
  rebuild() {
    if (!this.hasControls() || !locations.length) return;
    this.ready = true;
    this.#fillProvinces();
    this.#fillCityOptions("");
    this.#fillPostalCodes();
    this.#wire();
  }

  #fillProvinces() {
    this.province.replaceChildren(new Option("Selecciona una provincia", ""));
    PROVINCE_LIST.forEach(province => this.province.add(new Option(province, province)));
    this.province.disabled = false;
  }

  /** Lista de municipios: completa, o filtrada por la provincia elegida. */
  #fillCityOptions(provinceName) {
    const selected = provinceName && this.city.value
      ? locationsById.get(this.city.value) : null;
    this.city.replaceChildren(new Option("Selecciona un municipio", ""));
    const base = provinceName ? locations.filter(l => l.province === provinceName) : locations;
    base.forEach(location => this.city.add(new Option(`${location.name} (${location.province})`, location.id)));
    this.city.disabled = false;
    // Conservar la selección si sigue perteneciendo a la provincia filtrada.
    if (selected && base.includes(selected)) this.city.value = selected.id;
    this.filteredProvince = provinceName;
  }

  /** Todos los códigos postales de España, con el municipio como ayuda visual. */
  #fillPostalCodes() {
    const namesByCp = new Map();
    for (const [cp, matches] of postalIndex) {
      const names = matches.slice(0, 2).map(l => l.name);
      const extra = matches.length - names.length;
      namesByCp.set(cp, `${cp} · ${names.join(" / ")}${extra > 0 ? ` (+${extra})` : ""}`);
    }
    const options = [...namesByCp.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
    this.cp.replaceChildren(new Option("Selecciona un código postal", ""));
    options.forEach(([cp, label]) => this.cp.add(new Option(label, cp)));
    this.cp.disabled = false;
  }

  #wire() {
    if (this.province.dataset.territoryWired) return;
    this.province.dataset.territoryWired = "1";

    this.province.addEventListener("change", () => {
      const provinceName = this.province.value;
      this.#fillCityOptions(provinceName);
      if (!provinceName) return;
      const enProvincia = locations.filter(l => l.province === provinceName);
      if (enProvincia.length === 1) {
        this.city.value = enProvincia[0].id;
        this.cp.value = enProvincia[0].postalCodes[0] || "";
      } else if (this.city.value && locationsById.get(this.city.value)?.province !== provinceName) {
        this.city.value = "";
      }
    });

    this.city.addEventListener("change", () => {
      const location = locationsById.get(this.city.value);
      if (!location) return;
      this.province.value = location.province;
      // El CP elegido se conserva si sigue siendo válido para el municipio.
      if (!location.postalCodes.includes(this.cp.value)) {
        this.cp.value = location.postalCodes[0] || "";
      }
    });

    this.cp.addEventListener("change", () => {
      const matches = postalIndex.get(this.cp.value) || [];
      if (!matches.length) return;
      const target = matches.find(l => l.province === this.province.value) || matches[0];
      this.city.value = target.id;
      this.province.value = target.province;
    });

    // Los combos con buscador se aplican aquí para que los tres formularios
    // compartan exactamente el mismo estilo y funcionamiento. El select sigue
    // guardando el valor real: la serialización no cambia.
    if (this.city.dataset.combo !== "true") makeSelectSearchable(this.city, "Buscar municipio…");
    if (this.cp.dataset.combo !== "true") makeSelectSearchable(this.cp, "Buscar código postal…");
  }

  /** Hidrata los tres controles a partir de los valores guardados (nombres). */
  set(cityName, provinceName, cp) {
    if (!this.ready) return;
    const match = cityName && (
      locations.find(l => l.name === cityName && (!provinceName || l.province === provinceName)) ||
      locations.find(l => l.name === cityName)
    ) || null;
    if (!match) {
      if (this.filteredProvince) this.#fillCityOptions("");
      this.province.value = provinceName && PROVINCE_LIST.includes(provinceName) ? provinceName : "";
      this.city.value = "";
      this.cp.value = "";
      return;
    }
    if (this.filteredProvince) this.#fillCityOptions("");
    this.province.value = match.province;
    this.city.value = match.id;
    this.cp.value = cp && match.postalCodes.includes(cp) ? cp : (match.postalCodes[0] || "");
  }

  /** Vuelve al estado inicial (placeholders). */
  reset() {
    if (!this.ready) return;
    this.province.value = "";
    this.#fillCityOptions("");
    this.city.value = "";
    this.cp.value = "";
  }

  /** Municipio seleccionado (o null). */
  location() {
    return locationsById.get(this.city?.value) || null;
  }
}

const controls = new Set();

/**
 * Instala el control territorial unificado en un formulario. Idempotente:
 * llamadas sucesivas devuelven el mismo control.
 */
export function setupTerritory(formEl) {
  if (!formEl) return null;
  let control = [...controls].find(c => c.form === formEl);
  if (!control) {
    control = new TerritoryControl(formEl);
    controls.add(control);
  }
  control.rebuild();
  return control;
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

  controls.forEach(control => control.rebuild());
}

export function loadLocations() {
  if (window.MUNICIPIOS_INE) {
    populateLocations(window.MUNICIPIOS_INE);
    return true;
  }
  return false;
}
