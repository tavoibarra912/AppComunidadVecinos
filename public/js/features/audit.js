import { api } from "../api.js";
import { hasPermission } from "../state.js";

const form = document.querySelector("#audit-filter");
const results = document.querySelector("#audit-results");
const status = document.querySelector("#audit-status");
const previous = document.querySelector("#audit-prev");
const next = document.querySelector("#audit-next");
const limit = 25;
let offset = 0;
let requestId = 0;
const outcomes = { success: "Correcto", failure: "Fallido", denied: "Denegado", queued: "En cola", accepted: "Aceptado por SMTP", failed: "Falló el envío", skipped: "Omitido", uncertain: "Envío incierto" };
const actions = () => new Map([...form.elements.action.options].map(option => [option.value, option.textContent]));
function cell(row, value) {
  const td = document.createElement("td");
  td.textContent = value || "—";
  row.append(td);
  return td;
}
export async function renderAudit() {
  const id = ++requestId;
  results.replaceChildren();
  previous.disabled = next.disabled = true;
  if (!hasPermission("audit:read")) { status.textContent = "No tienes permiso para consultar la auditoría."; return; }
  status.textContent = "Cargando auditoría…";
  try {
    const page = await api.listAudit({ limit, offset, action: form.elements.action.value });
    if (id !== requestId || !hasPermission("audit:read")) return;
    const table = document.createElement("table");
    const caption = document.createElement("caption");
    caption.textContent = "Historial de seguridad (más recientes primero)";
    const head = document.createElement("thead"), header = document.createElement("tr");
    for (const label of ["Fecha", "Actor", "Evento", "Resultado", "Recurso", "IP", "Detalle"]) {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = label; header.append(th);
    }
    head.append(header);
    const body = document.createElement("tbody"), labels = actions();
    for (const item of page.items) {
      const row = document.createElement("tr");
      cell(row, new Date(item.createdAt).toLocaleString("es-ES"));
      cell(row, item.actorName || item.actorId || "Sin sesión / sistema");
      cell(row, labels.get(item.action) || item.action);
      cell(row, outcomes[item.outcome] || item.outcome);
      cell(row, [item.resourceType, item.resourceId].filter(Boolean).join(": "));
      cell(row, item.ip);
      const detailCell = cell(row, "");
      detailCell.replaceChildren();
      const details = document.createElement("details"), summary = document.createElement("summary"), pre = document.createElement("pre");
      summary.textContent = "Ver detalle";
      pre.textContent = JSON.stringify({ actorId: item.actorId, method: item.method, route: item.route, ...item.details }, null, 2);
      details.append(summary, pre); detailCell.append(details); body.append(row);
    }
    table.append(caption, head, body); results.append(table);
    status.textContent = page.total ? `${offset + 1}–${offset + page.items.length} de ${page.total} eventos` : "No hay eventos para este filtro.";
    previous.disabled = offset === 0;
    next.disabled = offset + page.items.length >= page.total;
  } catch (error) {
    if (id === requestId) {
      status.textContent = `No se pudo cargar la auditoría: ${error.message}`;
      previous.disabled = offset === 0;
    }
  }
}
form?.addEventListener("submit", event => { event.preventDefault(); offset = 0; renderAudit(); });
previous?.addEventListener("click", () => { offset = Math.max(0, offset - limit); renderAudit(); });
next?.addEventListener("click", () => { offset += limit; renderAudit(); });
