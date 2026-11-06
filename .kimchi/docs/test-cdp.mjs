// Prueba interactiva vía CDP (Edge headless + WebSocket nativo de Node)
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9223;

import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "OK   " : "FALTA"} ${label}`);
  if (!ok) failures++;
};

const edge = execFile(EDGE, ["--headless=new", "--disable-gpu", "--window-size=1400,900", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + process.env.TEMP + "/edge-cdp-profile-" + Date.now(), "about:blank"]);
await sleep(2500);

const rawList = execSync(`curl -s http://127.0.0.1:${PORT}/json/list`, { maxBuffer: 10 * 1024 * 1024 }).toString();
const list = JSON.parse(rawList);
const page = list.find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });

let msgId = 0;
const pending = new Map();
ws.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/#comunidades" });
await sleep(3500);

// 1. Click en Ver (botón info) de la primera comunidad
const viewResult = await evaluate(`(function () {
  const btn = document.querySelector("#comunidades-table .icon-action-btn.btn-info");
  if (!btn) return { ok: false, reason: "no button" };
  btn.click();
  const dialog = document.querySelector("#detail-dialog");
  return { ok: !!dialog.open, title: document.querySelector("#detail-name")?.textContent };
})()`);
check(viewResult?.ok === true, `View abre la ficha (${JSON.stringify(viewResult)})`);
await evaluate(`document.querySelector("#close-detail-dialog")?.click()`);
await sleep(300);

// 2. Abrir editor → 5 tabs + ancho 1000 + estable al cambiar de tab
const editor = await evaluate(`(function () {
  document.querySelector("#comunidades-table .icon-action-btn.btn-edit")?.click();
  const dialog = document.querySelector("#community-dialog");
  const tabs = [...dialog.querySelectorAll("[data-community-tab]")].map(b => b.textContent.trim());
  const width1 = Math.round(dialog.getBoundingClientRect().width);
  const height1 = Math.round(dialog.getBoundingClientRect().height);
  return { open: dialog.open, tabs, width1, height1 };
})()`);
check(editor?.open === true, "Editor de comunidad abre");
check((editor?.tabs || []).length === 5, `5 tabs: ${JSON.stringify(editor?.tabs)}`);
check(editor?.width1 === 1000, `ancho del modal = 1000px (hay ${editor?.width1})`);

// 3. Cambiar de tab → el ancho no cambia
const width2 = await evaluate(`(function () {
  document.querySelector('[data-community-tab="docs"]').click();
  const dialog = document.querySelector("#community-dialog");
  const w = Math.round(dialog.getBoundingClientRect().width);
  document.querySelector('[data-community-tab="details"]').click();
  return w;
})()`);
check(width2 === editor?.width1, `ancho estable al cambiar de tab (${width2})`);

// 4. Tab Contacto: cargar CP → municipio y provincia automáticos
const cp = await evaluate(`(function () {
  document.querySelector('[data-community-tab="contact"]').click();
  const form = document.querySelector("#community-form");
  const cpInput = form.elements.postalCode;
  cpInput.value = "28001";
  cpInput.dispatchEvent(new Event("input", { bubbles: true }));
  const city = form.elements.city;
  const prov = form.elements.province;
  return {
    cityValue: city.value,
    cityText: city.selectedOptions[0]?.textContent || "",
    province: prov.value,
    cityDisabled: city.disabled
  };
})()`);
check(!!cp?.cityValue, `CP 28001 completa municipio (${JSON.stringify(cp)})`);
check(!!cp?.province, `CP 28001 completa provincia (${cp?.province})`);

// 5. Combo con buscador integrado en tab Inmuebles
const combo = await evaluate(`(function () {
  document.querySelector('[data-community-tab="properties"]').click();
  const btn = document.querySelector("#btn-community-edit-link-property");
  btn.click();
  const select = document.querySelector("#community-edit-link-property-select");
  const comboInput = select.closest(".combo-box")?.querySelector(".combo-box-input");
  return { isCombo: !!comboInput, placeholder: comboInput?.placeholder || "", options: select.options.length };
})()`);
check(combo?.isCombo === true, `buscador integrado en combo de inmuebles (${JSON.stringify(combo)})`);

// 6. Tab General: campos esperados
const generalFields = await evaluate(`(function () {
  document.querySelector('[data-community-tab="details"]').click();
  const form = document.querySelector("#community-form");
  const pane = document.querySelector('[data-community-pane="details"]');
  const names = [...pane.querySelectorAll("input,select,textarea")].map(el => el.name);
  return names;
})()`);
check(JSON.stringify(generalFields) === JSON.stringify(["name", "nif", "president", "administrator", "constitutionYear", "notes"]),
  `campos General: ${JSON.stringify(generalFields)}`);

// 7. Tab Financiero: campos esperados
const financeFields = await evaluate(`[...document.querySelector('[data-community-pane="finance"]').querySelectorAll("input,select,textarea")].map(el => el.name)`);
check(JSON.stringify(financeFields) === JSON.stringify(["iban", "currency", "reserveFund"]), `campos Financiero: ${JSON.stringify(financeFields)}`);

// 8. Tab Contacto: campos + otherPhone opcional
const contactFields = await evaluate(`(function () {
  const pane = document.querySelector('[data-community-pane="contact"]');
  const names = [...pane.querySelectorAll("input,select,textarea")].map(el => el.name);
  const otherPhone = pane.querySelector('[name="otherPhone"]');
  return { names, otherPhoneRequired: otherPhone?.required };
})()`);
check(JSON.stringify(contactFields.names) === JSON.stringify(["phone", "otherPhone", "email", "address", "postalCode", "city", "province"]),
  `campos Contacto: ${JSON.stringify(contactFields.names)}`);
check(contactFields?.otherPhoneRequired === false, "Teléfono Secundario no requerido");

// 9. Guardar documento en comunidad y verificar persistencia
await evaluate(`(function () {
  document.querySelector("#community-dialog").close();
  document.querySelector("#comunidades-table .icon-action-btn.btn-edit").click();
  document.querySelector('[data-community-tab="docs"]').click();
  const input = document.querySelector("#community-document-input");
  const file = new File(["contenido de prueba"], "prueba-guardado.txt".replace("txt", "pdf"), { type: "application/pdf" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await sleep(400);
await evaluate(`document.querySelector('#community-form button[type="submit"]').click()`);
await sleep(1200);
const docSaved = await evaluate(`(async function () {
  const boot = await (await fetch("/api/bootstrap")).json();
  const comm = boot.communities.find(c => c.name === "Altos de Peñarrubia");
  return (comm?.documents || []).map(d => d.fileName);
})()`);
check((docSaved || []).includes("prueba-guardado.pdf"), `documento guardado en la comunidad (${JSON.stringify(docSaved)})`);

// limpiar el documento de prueba
if ((docSaved || []).includes("prueba-guardado.pdf")) {
  const docId = await evaluate(`(async function () {
    const boot = await (await fetch("/api/bootstrap")).json();
    const comm = boot.communities.find(c => c.name === "Altos de Peñarrubia");
    const doc = (comm?.documents || []).find(d => d.fileName === "prueba-guardado.pdf");
    if (doc) await fetch(doc.url.replace("/download", ""), { method: "DELETE" });
    return doc ? doc.id : null;
  })()`);
}

ws.close();
edge.kill();
console.log(failures === 0 ? "\nTODOS LOS CHECKS PASARON" : `\n${failures} CHECKS FALLARON`);
process.exit(failures === 0 ? 0 : 1);
