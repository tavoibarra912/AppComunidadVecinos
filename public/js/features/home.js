import { state, refreshState, hasPermission } from "../state.js";
import { escapeHtml as h } from "../html.js";
import { dashboardData } from "../dashboard-data.js";
import { readInjectedBrand } from "../brand.js";
import { navigateToSection } from "./navigation.js";
import { openOwnerEditor, openOwnerDetail } from "./propietarios.js";
import { openCommunityEditor } from "./comunidades.js";
import { openTenantDetail } from "./inquilinos.js";
import { openAdminInbox, openOwnerInbox } from "./notificaciones.js";
import {
  getCommunicationSnapshot,
  refreshCommunication,
  openCommunicationPost,
  openCommunicationComposer,
} from "./communication.js";
import { toast } from "../utils.js";

const root = document.querySelector("#home-dashboard");
let selectedCommunity = "",
  lastUser = null,
  refreshing = false;
const number = (value) => new Intl.NumberFormat("es-ES").format(value);
const date = (value) =>
  new Date(value).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const button = (label, action, id = "", primary = false) =>
  `<button type="button" class="${primary ? "primary-button" : "secondary-button"}" data-dashboard-action="${action}" ${id ? `data-id="${h(id)}"` : ""}>${h(label)}</button>`;
function metric(label, value, description, action, enabled = true) {
  return `<article class="dashboard-metric"><span>${h(label)}</span><strong>${h(typeof value === "number" ? number(value) : value)}</strong><p>${h(description)}</p>${action && enabled ? `<button type="button" data-dashboard-action="${action}">Ver detalle <span aria-hidden="true">→</span></button>` : ""}</article>`;
}
function documentChart(d) {
  const total = d.documentChart.reduce((n, row) => n + row.value, 0);
  if (!total)
    return `<div class="dashboard-empty"><strong>No hay documentación registrada en este ámbito</strong><p>El gráfico se completará con expedientes y archivos disponibles para tu cuenta.</p></div>`;
  let offset = 0;
  const rings = d.documentChart
    .filter((row) => row.value)
    .map((row) => {
      const percent = (row.value / total) * 100;
      const circle = `<circle cx="60" cy="60" r="47" pathLength="100" class="dashboard-segment segment-${row.key}" stroke-dasharray="${percent} ${100 - percent}" stroke-dashoffset="${-offset}"/>`;
      offset += percent;
      return circle;
    })
    .join("");
  return `<div class="dashboard-document-chart"><div class="dashboard-donut"><svg viewBox="0 0 120 120" role="img" aria-label="${h(d.documentChart.map((row) => `${row.label}: ${row.value}`).join(", "))}"><title>Estado documental registrado</title>${rings}</svg><div><strong>${number(total)}</strong><span>${d.docOwners.length ? "expedientes" : "documentos"}</span></div></div><ul class="dashboard-legend">${d.documentChart.map((row) => `<li><span class="dashboard-dot segment-${row.key}" aria-hidden="true"></span><span>${h(row.label)}</span><strong>${number(row.value)}</strong></li>`).join("")}</ul></div>`;
}
function propertyChart(d) {
  if (!d.properties.length)
    return '<div class="dashboard-empty"><strong>No hay inmuebles vinculados en este ámbito</strong><p>El gráfico mostrará las unidades registradas por tipo de inmueble.</p></div>';
  return `<div class="dashboard-bars">${d.propertyTypes
    .filter((row) => row.value)
    .map(
      (row) =>
        `<div class="dashboard-bar"><span>${h(row.label)}</span><progress max="${d.properties.length}" value="${row.value}" aria-label="${h(`${row.label}: ${row.value} de ${d.properties.length} inmuebles`)}"></progress><strong>${number(row.value)}</strong></div>`,
    )
    .join(
      "",
    )}</div><p class="dashboard-caption">${number(d.properties.length)} inmuebles registrados en el ámbito seleccionado.</p>`;
}
function postList(items, agenda = false) {
  return items
    .map(
      (p) =>
        `<button type="button" class="dashboard-post" data-dashboard-action="post" data-id="${h(p.id)}"><span class="dashboard-post-type">${h(p.type === "meeting" ? "Reunión" : p.type === "event" ? "Evento" : "Aviso")}${p.recipient && !p.recipient.readAt ? " · Sin leer" : ""}</span><strong>${h(p.title)}</strong><span>${h(p.communityName)} · ${h(date(agenda ? p.startsAt : p.updatedAt || p.publishAt))}</span>${agenda && p.meeting?.location ? `<small>${h(p.meeting.location)}</small>` : ""}</button>`,
    )
    .join("");
}
export function renderHomeDashboard() {
  if (!root || !state.currentUserId) return;
  if (lastUser !== state.currentUserId) {
    selectedCommunity = "";
    lastUser = state.currentUserId;
  }
  const snapshot = getCommunicationSnapshot();
  let d = dashboardData(state, snapshot, selectedCommunity);
  if (
    selectedCommunity &&
    !d.availableCommunities.some((c) => c.id === selectedCommunity)
  ) {
    selectedCommunity = "";
    d = dashboardData(state, snapshot);
  }
  const now = new Date(),
    brand = readInjectedBrand();
  const canManage = d.communities.some((c) =>
    hasPermission("community:manage", c.id),
  );
  const needsAttention =
    d.ownerStates.none + d.ownerStates.incomplete + d.ownerStates.rejected;
  const ownContractMode = d.personal && d.tenants.length > 0;
  const metrics = [
    metric(
      d.personal ? "Mis comunidades" : "Comunidades",
      d.communities.length,
      "Comunidades vinculadas al ámbito visible",
      "communities",
    ),
    metric(
      d.personal ? "Mis inmuebles" : "Inmuebles",
      d.properties.length,
      "Unidades registradas, sin duplicar titulares",
      "properties",
      hasPermission("property:read"),
    ),
    d.personal
      ? metric(
          ownContractMode ? "Contratos activos" : "Mis perfiles de propietario",
          ownContractMode ? d.contracts.active : d.owners.length,
          ownContractMode
            ? `${d.contracts.upcoming} próximos · ${d.contracts.ended} finalizados${d.contracts.unknown ? ` · ${d.contracts.unknown} sin fechas válidas` : ""}`
            : "Perfiles vinculados a tu cuenta",
          ownContractMode
            ? d.ownTenants.length
              ? "contract"
              : "tenants"
            : "profile",
          ownContractMode || d.ownOwners.length > 0,
        )
      : metric(
          "Propietarios",
          d.owners.length,
          "Personas con acceso autorizado en este ámbito",
          "owners",
          hasPermission("owner:read"),
        ),
    d.personal
      ? metric(
          d.docOwners.length
            ? "Expedientes por completar"
            : "Documentos de contrato",
          d.docOwners.length ? needsAttention : d.tenantDocuments.length,
          d.docOwners.length
            ? "Sin archivos, incompletos o con correcciones"
            : "Archivos adjuntos registrados",
          "profile",
          d.docOwners.length > 0,
        )
      : metric(
          "Contratos activos",
          d.contracts.active,
          `${d.contracts.upcoming} próximos · ${d.contracts.ended} finalizados${d.contracts.unknown ? ` · ${d.contracts.unknown} sin fechas válidas` : ""}`,
          "tenants",
          hasPermission("tenant:read"),
        ),
    d.personal
      ? metric(
          "Avisos sin leer",
          d.ownerUnread,
          "Avisos sobre tu documentación y gestiones",
          "owner-inbox",
          hasPermission("owner_notification:read"),
        )
      : metric(
          "Expedientes en revisión",
          d.ownerStates.pending,
          "Tres archivos aportados; falta aprobación completa",
          "owners",
          hasPermission("owner:read"),
        ),
    metric(
      "Comunicaciones sin leer",
      snapshot ? d.unreadPosts : "—",
      snapshot
        ? "Avisos dirigidos a tu cuenta"
        : "Comunicaciones todavía sin cargar",
      "communications",
    ),
  ];
  const actions = [];
  if (hasPermission("community:create"))
    actions.push(button("Nueva comunidad", "new-community", "", true));
  if (hasPermission("owner:manage"))
    actions.push(button("Nuevo propietario", "new-owner"));
  if (canManage) actions.push(button("Nueva publicación", "new-post"));
  if (d.personal) {
    if (d.communities.length)
      actions.push(
        button(
          d.communities.length === 1
            ? "Ver mi comunidad"
            : "Ver mis comunidades",
          "community-view",
          "",
          true,
        ),
      );
    if (d.ownOwners.length) actions.push(button("Mi expediente", "profile"));
    if (d.ownTenants.length) actions.push(button("Mi contrato", "contract"));
    if (!actions.length)
      actions.push(button("Ver mi cuenta", "account", "", true));
  }
  const inboxAction = d.personal ? "owner-inbox" : "admin-inbox";
  const inboxAllowed = d.personal
    ? hasPermission("owner_notification:read")
    : hasPermission("admin_notification:read");
  const inboxCount = d.personal ? d.ownerUnread : d.adminUnread;
  root.innerHTML = `<div class="dashboard-heading"><div><p class="eyebrow">${h(d.personal ? "MI ÁREA PERSONAL" : "PANEL DE GESTIÓN")}</p><h1 id="home-greeting-title">${h(`Hola, ${d.user?.nombre || d.user?.usuario || "vecino"}`)}</h1><p>${h(brand.nombre)} · ${h(d.personal ? "Tus perfiles, documentación y novedades de comunidad." : "Registros y gestiones dentro de tu ámbito de acceso.")}</p></div><div class="dashboard-date"><strong>${now.getDate()}</strong><span>${h(now.toLocaleDateString("es-ES", { month: "long", year: "numeric" }))}</span></div></div>
    <div class="dashboard-toolbar"><label>Ámbito del panel<select id="dashboard-community"><option value="">${d.personal ? "Todas mis comunidades" : "Todas las comunidades visibles"}</option>${d.availableCommunities.map((c) => `<option value="${h(c.id)}" ${selectedCommunity === c.id ? "selected" : ""}>${h(c.name)}</option>`).join("")}</select></label><div><p>Datos del servidor${state.loadedAt ? ` · ${h(date(state.loadedAt))}` : ""}</p>${button(refreshing ? "Actualizando…" : "Actualizar datos", "refresh")}</div></div>
    <div class="dashboard-actions">${actions.join("")}</div>
    ${d.personal && !d.ownOwners.length && !d.ownTenants.length ? '<div class="dashboard-callout"><strong>Tu perfil todavía está pendiente de vinculación</strong><p>Un administrador debe asociar tu cuenta con tu perfil de propietario o inquilino. Las métricas aparecerán cuando existan registros vinculados.</p></div>' : ""}
    <div class="dashboard-metrics">${metrics.join("")}</div>
    <div class="dashboard-chart-grid"><section class="dashboard-panel"><div class="dashboard-panel-heading"><h2>${d.docOwners.length ? "Estado de los expedientes" : "Documentación registrada"}</h2><p>${d.docOwners.length ? "Clasificación según archivos reales y revisión administrativa." : "Archivos de contrato disponibles para tu cuenta."}</p></div>${documentChart(d)}<p class="dashboard-caption">Fuente: documentación de los registros visibles. Los documentos de ejemplo no se consideran acreditaciones.</p></section><section class="dashboard-panel"><div class="dashboard-panel-heading"><h2>Distribución de inmuebles</h2><p>Recuento por tipo de unidad registrada.</p></div>${propertyChart(d)}</section></div>
    <div class="dashboard-chart-grid"><section class="dashboard-panel"><div class="dashboard-panel-heading"><h2>Gestiones a revisar</h2><p>Accesos directos según tus permisos.</p></div><div class="dashboard-tasks">${inboxAllowed ? `<button type="button" data-dashboard-action="${inboxAction}"><span><strong>${inboxCount ? `${inboxCount} avisos sin leer` : "Buzón sin avisos pendientes"}</strong><small>${d.personal ? "Respuestas sobre tus documentos y gestiones" : "Documentación y gestiones de propietarios"}</small></span><span aria-hidden="true">→</span></button>` : ""}${d.docOwners.length ? `<button type="button" data-dashboard-action="${d.personal ? "profile" : "owners"}"><span><strong>${d.personal ? `${needsAttention} expedientes por completar` : `${d.ownerStates.pending} expedientes en revisión`}</strong><small>${d.personal ? "Revisá archivos pendientes o correcciones" : `${d.ownerStates.rejected} con correcciones · ${d.ownerStates.incomplete + d.ownerStates.none} sin completar`}</small></span><span aria-hidden="true">→</span></button>` : ""}<button type="button" data-dashboard-action="communications"><span><strong>Tablón y reuniones</strong><small>${snapshot ? `${d.publishedCount} publicaciones en este ámbito` : "Abrí el tablón para consultar las comunicaciones"}</small></span><span aria-hidden="true">→</span></button></div></section><section class="dashboard-panel"><div class="dashboard-panel-heading"><h2>Próximos eventos y reuniones</h2><p>Convocatorias vigentes y actividades en curso.</p></div>${d.agenda.length ? postList(d.agenda, true) : `<div class="dashboard-empty"><strong>${snapshot ? "No hay actividades próximas registradas" : "Agenda todavía sin cargar"}</strong><p>${snapshot ? "Los eventos y reuniones publicados aparecerán acá con su fecha." : "Actualizá el panel o abrí Comunicación para consultar la agenda."}</p></div>`}</section></div>
    <section class="dashboard-panel"><div class="dashboard-panel-heading"><h2>Últimas publicaciones</h2><p>Avisos publicados en tus comunidades, ordenados por actualización.</p></div><div class="dashboard-recent">${d.recent.length ? postList(d.recent) : `<p class="dashboard-caption">${snapshot ? "Todavía no hay publicaciones disponibles en este ámbito." : "Comunicaciones pendientes de carga."}</p>`}</div></section><p class="dashboard-caption dashboard-source">Fuente: registros visibles para tu cuenta dentro del ámbito seleccionado.</p>`;
  root.querySelector('[data-dashboard-action="refresh"]').disabled = refreshing;
}
root?.addEventListener("change", (event) => {
  if (event.target.id === "dashboard-community") {
    selectedCommunity = event.target.value;
    renderHomeDashboard();
  }
});
root?.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-dashboard-action]");
  if (!control || control.disabled) return;
  const action = control.dataset.dashboardAction,
    d = dashboardData(state, getCommunicationSnapshot(), selectedCommunity);
  try {
    switch (action) {
      case "refresh":
        refreshing = true;
        renderHomeDashboard();
        try {
          await Promise.all([refreshState(), refreshCommunication()]);
          toast("Datos del panel actualizados.");
        } finally {
          refreshing = false;
          renderHomeDashboard();
        }
        break;
      case "communities":
        navigateToSection("#comunidades");
        break;
      case "community-view":
        if (d.communities.length === 1)
          openCommunityEditor(d.communities[0].id, "details", true);
        else navigateToSection("#comunidades");
        break;
      case "properties":
        navigateToSection("#inmuebles");
        break;
      case "owners":
        navigateToSection("#propietarios");
        break;
      case "tenants":
        navigateToSection("#inquilinos");
        break;
      case "communications":
        navigateToSection("#comunicacion");
        break;
      case "new-community":
        openCommunityEditor();
        break;
      case "new-owner":
        openOwnerEditor();
        break;
      case "new-post":
        await openCommunicationComposer();
        break;
      case "post":
        await openCommunicationPost(control.dataset.id);
        break;
      case "profile":
        if (d.ownOwners.length)
          openOwnerDetail(
            (
              d.owners.find((o) => o.userId === state.currentUserId) ||
              d.ownOwners[0]
            ).id,
          );
        else navigateToSection("#propietarios");
        break;
      case "contract": {
        const t =
          d.tenants.find((t) => t.userId === state.currentUserId) ||
          d.ownTenants[0] ||
          d.tenants[0];
        if (t) openTenantDetail(t.ownerId, t.id);
        break;
      }
      case "owner-inbox":
        openOwnerInbox();
        break;
      case "admin-inbox":
        openAdminInbox();
        break;
      case "account":
        document.querySelector("#account-menu-profile").click();
        break;
    }
  } catch (error) {
    toast(error.message);
  }
});
for (const name of ["communications:updated", "notifications:updated"])
  window.addEventListener(name, () => {
    if (state.currentUserId) renderHomeDashboard();
  });
